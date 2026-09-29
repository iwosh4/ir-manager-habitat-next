<?php
declare(strict_types=1);
/* ADMIN CONSOLE — accounts, roles, suspension, plan overrides, plans & prices, payments, system health, audit. */
require __DIR__.'/includes/config.php';
ir_require_admin();
require __DIR__.'/includes/live.php';
require __DIR__.'/includes/shell.php';
require __DIR__.'/includes/reptile_core.php';
require_once __DIR__.'/includes/svc-admin.php';

$tab = (string)($_GET['tab'] ?? 'accounts');
$tabs = ['accounts' => 'Účty', 'plans' => 'Tarify', 'payments' => 'Platby', 'system' => 'Systém', 'audit' => 'Audit'];
if (!isset($tabs[$tab])) $tab = 'accounts';
$isSuper = ir_role() === 'superadmin';
$oneTime = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    ir_verify_csrf();
    $a = (string)($_POST['action'] ?? ''); $target = (int)($_POST['user_id'] ?? 0);
    $back = 'admin.php?tab='.rawurlencode($tab).($target ? '&id='.$target : '');
    try {
        switch ($a) {
            case 'role': ir_admin_set_role($pdo, $target, (string)$_POST['role']); ir_flash('success', 'Role byla změněna. Přihlášení uživatele bylo obnoveno.'); break;
            case 'suspend': ir_admin_suspend($pdo, $target, (string)($_POST['reason'] ?? '')); ir_flash('success', 'Účet byl pozastaven a všechny jeho relace ukončeny. Data zůstávají zachována.'); break;
            case 'unsuspend': ir_admin_unsuspend($pdo, $target); ir_flash('success', 'Účet byl obnoven.'); break;
            case 'logout': ir_admin_force_logout($pdo, $target); ir_flash('success', 'Všechny relace uživatele byly ukončeny.'); break;
            case 'password': $pw = ir_admin_reset_password($pdo, $target); $_SESSION['ir_admin_onetime'] = ['user' => $target, 'pw' => $pw]; ir_flash('success', 'Dočasné heslo bylo vytvořeno (zobrazí se jen jednou).'); break;
            case 'note': ir_admin_note($pdo, $target, (string)($_POST['note'] ?? '')); ir_flash('success', 'Poznámka uložena.'); break;
            case 'plan': ir_admin_set_plan($pdo, $target, (string)$_POST['plan'], trim((string)($_POST['until'] ?? '')) ?: null, (string)($_POST['note'] ?? '')); ir_flash('success', 'Tarif účtu byl nastaven.'); break;
            case 'delete': $f = ir_admin_delete_account($pdo, $target, (string)($_POST['confirm'] ?? '')); ir_flash('success', 'Účet byl trvale odstraněn. Záloha před smazáním: '.$f); $back = 'admin.php'; break;
            case 'save_plan': ir_admin_save_plan($pdo, (string)$_POST['code'], $_POST); ir_flash('success', 'Tarif byl uložen.'); $back = 'admin.php?tab=plans'; break;
            case 'flag': ir_feature_flag_set($pdo, (string)$_POST['flag'], (int)($_POST['flag_user'] ?? 0), !empty($_POST['on'])); ir_flash('success', 'Příznak funkce uložen.'); $back = 'admin.php?tab=system'; break;
            case 'sync_order': ir_billing_sync_order($pdo, (string)$_POST['order']); ir_flash('success', 'Stav objednávky byl ověřen u poskytovatele.'); $back = 'admin.php?tab=payments'; break;
            case 'backup_now': $r = ir_backup_account($pdo, $target ?: ir_current_user_id(), 'manual'); ir_flash('success', 'Záloha vytvořena ('.ir_human_size($r['bytes']).').'); break;
            default: throw new RuntimeException('Neznámá akce.');
        }
    } catch (Throwable $e) { ir_flash('error', $e->getMessage()); }
    ir_redirect($back);
}
if (!empty($_SESSION['ir_admin_onetime'])) { $oneTime = $_SESSION['ir_admin_onetime']; unset($_SESSION['ir_admin_onetime']); }

ir_page_start('Administrace', 'other', 'ADMINISTRACE');
echo '<nav class="module-tabs b1-tabs">';
foreach ($tabs as $k => $l) echo '<a class="'.($k === $tab ? 'is-active' : '').'" href="admin.php?tab='.$k.'">'.ir_e($l).'</a>';
echo '</nav>';
$fmt = static fn($d) => $d ? date('j. n. Y H:i', strtotime((string)$d)) : '—';

if ($tab === 'accounts') {
    $detailId = (int)($_GET['id'] ?? 0);
    if ($detailId && ($u = ir_admin_user($pdo, $detailId))) {
        $ent = ir_entitlement($pdo, (int)($u['owner_user_id'] ?: $u['id']));
        $accId = (int)($u['owner_user_id'] ?: $u['id']);
        echo ir_back('admin.php', 'Všechny účty');
        if ($oneTime && (int)$oneTime['user'] === $detailId) echo '<div class="flash warning b1-onetime">Dočasné heslo pro <b>'.ir_e($u['jmeno']).'</b>: <code>'.ir_e($oneTime['pw']).'</code> — předejte je bezpečně, po opuštění stránky už se nezobrazí.</div>';
        ?>
<section class="panel glow-panel b1-admin-detail">
  <header class="panel-head"><div><span class="panel-kicker">ÚČET #<?=$u['id']?></span><h2><?=ir_e($u['jmeno'])?></h2><p class="muted"><?=ir_e((string)$u['email'])?></p></div>
    <div class="b1-pills"><span class="status-pill is-role"><?=ir_e(IR_ROLES[$u['role']] ?? $u['role'])?></span><?php if ($u['suspended_at']): ?><span class="status-pill is-off">Pozastaveno</span><?php elseif (!(int)$u['is_active']): ?><span class="status-pill is-off">Neaktivní</span><?php else: ?><span class="status-pill is-ok">Aktivní</span><?php endif ?><span class="status-pill"><?=ir_e($ent['plan']['name'])?></span></div></header>
  <dl class="b1-kv">
    <div><dt>Poslední přihlášení</dt><dd><?=$fmt($u['posledni_prihlaseni'])?></dd></div>
    <div><dt>Účet od</dt><dd><?=$fmt($u['created_at'])?></dd></div>
    <div><dt>Aktivní zvířata</dt><dd><?=ir_active_animal_count($pdo, $accId)?><?=$ent['max_animals'] !== null ? ' / '.$ent['max_animals'] : ''?></dd></div>
    <div><dt>Úložiště</dt><dd><?=ir_human_size(ir_storage_used($pdo, $accId))?> / <?=(int)$ent['plan']['storage_mb']?> MB</dd></div>
    <div><dt>Tarif platí do</dt><dd><?=$ent['subscription'] ? ($ent['subscription']['valid_until'] ? $fmt($ent['subscription']['valid_until']) : 'doživotně') : '—'?> <?=$ent['subscription'] ? '· '.ir_e(IR_BILLING_PROVIDERS[$ent['subscription']['provider']] ?? $ent['subscription']['provider']) : ''?></dd></div>
    <?php if ($u['owner_user_id']): ?><div><dt>Člen týmu účtu</dt><dd><a href="admin.php?id=<?=(int)$u['owner_user_id']?>">#<?=(int)$u['owner_user_id']?></a></dd></div><?php endif ?>
    <?php if ($u['suspended_at']): ?><div><dt>Důvod pozastavení</dt><dd><?=ir_e((string)$u['suspend_reason'])?></dd></div><?php endif ?>
  </dl>
  <div class="b1-admin-actions">
    <form method="post" class="b1-inline"><?=ir_csrf_field()?><input type="hidden" name="action" value="role"><input type="hidden" name="user_id" value="<?=$u['id']?>"><label>Role <select class="input" name="role"><?php foreach (IR_ROLES as $rk => $rl) { if (!$isSuper && in_array($rk, ['superadmin', 'admin'], true) && $u['role'] !== $rk) continue; echo '<option value="'.$rk.'" '.($u['role'] === $rk ? 'selected' : '').'>'.ir_e($rl).'</option>'; } ?></select></label><button class="btn">Uložit roli</button></form>
    <?php if (!$u['owner_user_id']): ?>
    <form method="post" class="b1-inline"><?=ir_csrf_field()?><input type="hidden" name="action" value="plan"><input type="hidden" name="user_id" value="<?=$u['id']?>"><label>Tarif (ruční) <select class="input" name="plan"><?php foreach (ir_plans($pdo) as $pc => $pl) echo '<option value="'.ir_e($pc).'" '.($ent['code'] === $pc ? 'selected' : '').'>'.ir_e($pl['name']).'</option>'; ?></select></label><label>Platí do <input class="input" type="date" name="until" min="<?=date('Y-m-d', strtotime('+1 day'))?>"></label><label>Poznámka <input class="input" name="note" maxlength="255" placeholder="např. testovací přístup"></label><button class="btn">Nastavit tarif</button></form>
    <?php endif ?>
    <form method="post" class="b1-inline"><?=ir_csrf_field()?><input type="hidden" name="user_id" value="<?=$u['id']?>"><button class="btn" name="action" value="logout">Ukončit všechny relace</button><button class="btn" name="action" value="password">Vytvořit dočasné heslo</button><button class="btn" name="action" value="backup_now">Zálohovat data</button></form>
    <?php if ($u['suspended_at']): ?>
    <form method="post" class="b1-inline"><?=ir_csrf_field()?><input type="hidden" name="action" value="unsuspend"><input type="hidden" name="user_id" value="<?=$u['id']?>"><button class="btn primary">Obnovit účet</button></form>
    <?php else: ?>
    <form method="post" class="b1-inline"><?=ir_csrf_field()?><input type="hidden" name="action" value="suspend"><input type="hidden" name="user_id" value="<?=$u['id']?>"><label>Důvod <input class="input" name="reason" required maxlength="255"></label><button class="btn danger-soft">Pozastavit účet</button></form>
    <?php endif ?>
  </div>
</section>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">INTERNÍ</span><h2>Poznámky podpory</h2></div></header>
  <form method="post" class="b1-inline"><?=ir_csrf_field()?><input type="hidden" name="action" value="note"><input type="hidden" name="user_id" value="<?=$u['id']?>"><input class="input b1-grow" name="note" required placeholder="Poznámka viditelná jen administrátorům"><button class="btn">Přidat</button></form>
  <ul class="b1-list"><?php foreach (ir_admin_notes($pdo, (int)$u['id']) as $n): ?><li><b><?=ir_e((string)$n['author'])?></b> · <?=$fmt($n['created_at'])?><br><?=nl2br(ir_e((string)$n['note']))?></li><?php endforeach ?></ul>
</section>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">AUDIT</span><h2>Posledních 30 změn účtu</h2></div></header>
  <div class="table-wrap"><table class="data-table b1-table"><thead><tr><th>Kdy</th><th>Kdo</th><th>Objekt</th><th>Akce</th></tr></thead><tbody>
  <?php foreach (ir_admin_audit($pdo, ['account' => $accId], 30) as $r): ?><tr><td><?=$fmt($r['created_at'])?></td><td><?=ir_e((string)$r['actor'])?></td><td><?=ir_e($r['entity'].' '.$r['entity_id'])?></td><td><?=ir_e($r['action'])?></td></tr><?php endforeach ?>
  </tbody></table></div></section>
<?php if ($isSuper && $u['role'] !== 'superadmin'): ?>
<section class="panel b1-danger-zone"><header class="panel-head"><div><span class="panel-kicker">NEVRATNÉ</span><h2>Trvalé smazání účtu</h2><p class="muted">Před smazáním se automaticky vytvoří úplná záloha dat účtu. Běžně použijte pozastavení.</p></div></header>
  <form method="post" class="b1-inline"><?=ir_csrf_field()?><input type="hidden" name="action" value="delete"><input type="hidden" name="user_id" value="<?=$u['id']?>"><input class="input b1-grow" name="confirm" autocomplete="off" placeholder="Napište: SMAZAT <?=ir_e($u['jmeno'])?>"><button class="btn danger">Trvale smazat</button></form>
</section>
<?php endif;
    } else {
        $q = trim((string)($_GET['q'] ?? '')); $filter = (string)($_GET['f'] ?? '');
        $rows = ir_admin_accounts($pdo, $q, $filter);
        $owners = array_filter($rows, fn($r) => empty($r['owner_user_id']));
        $paying = count(array_filter($owners, fn($r) => $r['plan'] !== 'free'));
        ?>
<section class="metric-grid b1-metrics">
  <article class="mini-metric glow-panel"><div><small>Účty chovatelů</small><strong><?=count($owners)?></strong></div></article>
  <article class="mini-metric glow-panel"><div><small>Placené tarify</small><strong><?=$paying?></strong></div></article>
  <article class="mini-metric glow-panel"><div><small>Pozastavené</small><strong><?=count(array_filter($rows, fn($r) => $r['suspended_at']))?></strong></div></article>
  <article class="mini-metric glow-panel"><div><small>Členové týmů</small><strong><?=count($rows) - count($owners)?></strong></div></article>
</section>
<section class="panel glow-panel">
  <form class="b1-inline b1-filter" method="get"><input type="hidden" name="tab" value="accounts"><input class="input b1-grow" name="q" value="<?=ir_e($q)?>" placeholder="Jméno, e-mail nebo ID účtu"><select class="input" name="f"><option value="">Všechny</option><option value="suspended" <?=$filter === 'suspended' ? 'selected' : ''?>>Pozastavené</option><option value="inactive" <?=$filter === 'inactive' ? 'selected' : ''?>>Neaktivní</option><option value="staff" <?=$filter === 'staff' ? 'selected' : ''?>>Členové týmů</option></select><button class="btn">Hledat</button></form>
  <div class="table-wrap"><table class="data-table b1-table"><thead><tr><th>Účet</th><th>Role</th><th>Tarif</th><th>Zvířata</th><th>Záznamy</th><th>Poslední přihlášení</th><th>Stav</th></tr></thead><tbody>
  <?php foreach ($rows as $r): ?>
    <tr class="<?=$r['owner_user_id'] ? 'b1-sub' : ''?>"><td><a href="admin.php?id=<?=(int)$r['id']?>"><b><?=ir_e($r['jmeno'])?></b></a><br><small class="muted"><?=ir_e((string)$r['email'])?></small></td>
      <td><?=ir_e(IR_ROLES[$r['role']] ?? $r['role'])?></td>
      <td><?=$r['owner_user_id'] ? '<small class="muted">tým #'.(int)$r['owner_user_id'].'</small>' : ir_e($r['plan_name']).($r['plan_until'] ? '<br><small class="muted">do '.date('j. n. Y', strtotime($r['plan_until'])).'</small>' : '')?></td>
      <td><?=(int)$r['animals']?></td><td><?=(int)$r['events']?></td><td><?=$fmt($r['posledni_prihlaseni'])?></td>
      <td><?=$r['suspended_at'] ? '<span class="status-pill is-off">Pozastaveno</span>' : ((int)$r['is_active'] ? '<span class="status-pill is-ok">Aktivní</span>' : '<span class="status-pill is-off">Neaktivní</span>')?></td></tr>
  <?php endforeach ?>
  </tbody></table></div>
</section>
<?php
    }
} elseif ($tab === 'plans') {
    echo '<p class="muted b1-note">Ceny jsou v CZK včetně DPH. Změna ceny se týká nových objednávek; aktivní předplatné platí do konce zaplaceného období. Snížení tarifu nikdy nemaže data — zvířata nad limit zůstanou jen pro čtení.</p><div class="b1-plan-grid">';
    foreach (ir_plans($pdo) as $code => $p) {
        $users = (int)ir_scalar($pdo, "SELECT COUNT(DISTINCT user_id) FROM wp_ir2_subscriptions WHERE plan_code=? AND status='active' AND (valid_until IS NULL OR valid_until>NOW())", [$code], 0);
        ?>
<form method="post" class="panel glow-panel b1-plan"><?=ir_csrf_field()?><input type="hidden" name="action" value="save_plan"><input type="hidden" name="code" value="<?=ir_e($code)?>">
  <header class="panel-head"><div><span class="panel-kicker"><?=ir_e(strtoupper($code))?> · <?=$users?> aktivních</span><h2><input class="input" name="name" value="<?=ir_e($p['name'])?>" <?=$isSuper ? '' : 'disabled'?>></h2></div></header>
  <div class="b1-form-grid">
    <label>Měsíčně (Kč)<input class="input" name="price_month" value="<?=ir_e((string)$p['price_month'])?>" inputmode="decimal"></label>
    <label>Ročně (Kč)<input class="input" name="price_year" value="<?=ir_e((string)$p['price_year'])?>" inputmode="decimal"></label>
    <label>Doživotně (Kč)<input class="input" name="price_lifetime" value="<?=ir_e((string)$p['price_lifetime'])?>" inputmode="decimal"></label>
    <label>Max. zvířat (prázdné = neomezeně)<input class="input" name="max_animals" value="<?=ir_e((string)$p['max_animals'])?>" inputmode="numeric"></label>
    <label>Uživatelé<input class="input" name="max_users" value="<?=(int)$p['max_users']?>" inputmode="numeric"></label>
    <label>Úložiště (MB)<input class="input" name="storage_mb" value="<?=(int)$p['storage_mb']?>" inputmode="numeric"></label>
    <label class="b1-wide">Funkce (oddělené čárkou)<input class="input" name="features" value="<?=ir_e(implode(', ', array_keys(array_filter((array)$p['features']))))?>"></label>
    <label class="b1-check"><input type="checkbox" name="allow_month" value="1" <?=(int)$p['allow_month'] ? 'checked' : ''?>> měsíční</label>
    <label class="b1-check"><input type="checkbox" name="allow_year" value="1" <?=(int)$p['allow_year'] ? 'checked' : ''?>> roční</label>
    <label class="b1-check"><input type="checkbox" name="allow_lifetime" value="1" <?=(int)$p['allow_lifetime'] ? 'checked' : ''?>> doživotní</label>
    <label class="b1-check"><input type="checkbox" name="active" value="1" <?=(int)$p['active'] ? 'checked' : ''?> <?=$code === 'free' ? 'disabled' : ''?>> v nabídce</label>
  </div>
  <?php if ($isSuper): ?><button class="btn primary">Uložit tarif</button><?php else: ?><p class="muted">Tarify upravuje superadministrátor.</p><?php endif ?>
</form>
<?php }
    echo '</div>';
} elseif ($tab === 'payments') {
    $orders = $pdo->query('SELECT o.*, u.jmeno FROM wp_ir2_billing_orders o LEFT JOIN '.IR_AUTH_TABLE.' u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 100')->fetchAll() ?: [];
    $hooks = $pdo->query('SELECT id,provider,event_id,event_type,signature_ok,processed_at,error,created_at FROM wp_ir2_billing_webhooks ORDER BY id DESC LIMIT 50')->fetchAll() ?: [];
    $jobs = $pdo->query("SELECT * FROM wp_ir2_jobs WHERE status='failed' ORDER BY id DESC LIMIT 30")->fetchAll() ?: [];
    $cfg = ir_billing_config();
    echo '<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">BRÁNA</span><h2>Revolut ('.ir_e($cfg['env']).')</h2></div><span class="status-pill '.(ir_billing_revolut_ready() ? 'is-ok' : 'is-off').'">'.(ir_billing_revolut_ready() ? 'Nakonfigurováno' : 'Chybí klíče v config.local.php').'</span></header>';
    echo '<p class="muted">Webhook URL: <code>'.ir_e((IR_PUBLIC_URL ?: '').'/billing-webhook.php?provider=revolut').'</code> · Apple App Store a Google Play: rozhraní připravené, bez ověření účtenek se nic nepřiděluje.</p></section>';
    echo '<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">OBJEDNÁVKY</span><h2>Posledních 100</h2></div></header><div class="table-wrap"><table class="data-table b1-table"><thead><tr><th>Vytvořeno</th><th>Účet</th><th>Tarif</th><th>Částka</th><th>Poskytovatel</th><th>Stav</th><th></th></tr></thead><tbody>';
    foreach ($orders as $o) echo '<tr><td>'.$fmt($o['created_at']).'</td><td><a href="admin.php?id='.(int)$o['user_id'].'">'.ir_e((string)$o['jmeno']).'</a></td><td>'.ir_e($o['plan_code'].' / '.$o['period']).'</td><td>'.number_format($o['amount_minor'] / 100, 0, ',', ' ').' '.ir_e($o['currency']).'</td><td>'.ir_e($o['provider']).'</td><td><span class="status-pill '.($o['status'] === 'paid' ? 'is-ok' : '').'">'.ir_e($o['status']).'</span></td><td>'.($o['status'] === 'pending' ? '<form method="post">'.ir_csrf_field().'<input type="hidden" name="action" value="sync_order"><input type="hidden" name="order" value="'.ir_e($o['id']).'"><button class="btn small">Ověřit</button></form>' : '').'</td></tr>';
    if (!$orders) echo '<tr><td colspan="7" class="muted">Zatím žádné objednávky.</td></tr>';
    echo '</tbody></table></div></section>';
    echo '<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">WEBHOOKY</span><h2>Posledních 50</h2></div></header><div class="table-wrap"><table class="data-table b1-table"><thead><tr><th>Přijato</th><th>Poskytovatel</th><th>Událost</th><th>Podpis</th><th>Zpracováno</th><th>Chyba</th></tr></thead><tbody>';
    foreach ($hooks as $h) echo '<tr><td>'.$fmt($h['created_at']).'</td><td>'.ir_e($h['provider']).'</td><td>'.ir_e((string)$h['event_type']).'</td><td>'.((int)$h['signature_ok'] ? '✓' : '✗').'</td><td>'.$fmt($h['processed_at']).'</td><td>'.ir_e((string)$h['error']).'</td></tr>';
    if (!$hooks) echo '<tr><td colspan="6" class="muted">Zatím žádné webhooky.</td></tr>';
    echo '</tbody></table></div></section>';
    echo '<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">ÚLOHY</span><h2>Selhané úlohy</h2></div></header><ul class="b1-list">';
    foreach ($jobs as $j) echo '<li><b>'.ir_e($j['job_type']).'</b> · '.$fmt($j['created_at']).'<br><small>'.ir_e(mb_substr((string)$j['last_error'], 0, 300)).'</small></li>';
    if (!$jobs) echo '<li class="muted">Žádné selhané úlohy.</li>';
    echo '</ul></section>';
} elseif ($tab === 'system') {
    require_once __DIR__.'/includes/schema-beta1.php';
    $missing = ir_schema_beta1_missing($pdo);
    $migs = $pdo->query('SELECT migration, applied_at FROM wp_ir2_schema_migrations ORDER BY applied_at DESC LIMIT 12')->fetchAll() ?: [];
    $backups = $pdo->query('SELECT b.*, u.jmeno FROM wp_ir2_backups b LEFT JOIN '.IR_AUTH_TABLE.' u ON u.id=b.user_id ORDER BY b.id DESC LIMIT 20')->fetchAll() ?: [];
    $flags = $pdo->query('SELECT * FROM wp_ir2_feature_flags ORDER BY flag_key, user_id')->fetchAll() ?: [];
    ?>
<section class="metric-grid b1-metrics">
  <article class="mini-metric glow-panel"><div><small>Verze aplikace</small><strong><?=ir_e(IR_APP_VERSION)?></strong></div></article>
  <article class="mini-metric glow-panel"><div><small>Schéma</small><strong><?=$missing ? count($missing).' chybí' : 'Aktuální'?></strong><em><?=ir_e(IR_SCHEMA_VERSION)?></em></div></article>
  <article class="mini-metric glow-panel"><div><small>PHP / DB</small><strong><?=PHP_VERSION?></strong><em><?=ir_e((string)$pdo->query('SELECT VERSION()')->fetchColumn())?></em></div></article>
  <article class="mini-metric glow-panel"><div><small>Zálohy (24 h)</small><strong><?=(int)ir_scalar($pdo, "SELECT COUNT(*) FROM wp_ir2_backups WHERE status='ok' AND created_at>NOW()-INTERVAL 1 DAY", [], 0)?></strong></div></article>
</section>
<?php if ($missing): ?><div class="flash danger">Databáze není aktuální: <?=ir_e(implode(', ', array_slice($missing, 0, 8)))?> … <a href="upgrade.php">Spustit aktualizaci</a></div><?php endif ?>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">MIGRACE</span><h2>Použité migrace</h2></div><a class="btn" href="upgrade.php">Aktualizace databáze</a></header><ul class="b1-list"><?php foreach ($migs as $m): ?><li><b><?=ir_e($m['migration'])?></b> · <?=$fmt($m['applied_at'])?></li><?php endforeach ?></ul></section>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">ZÁLOHY</span><h2>Posledních 20</h2></div><form method="post"><?=ir_csrf_field()?><input type="hidden" name="action" value="backup_now"><button class="btn">Zálohovat můj účet</button></form></header>
  <p class="muted">Denní zálohy spouští cron: <code>php <?=ir_e(IR_ROOT)?>/cron.php all</code> (1× denně). Uchovává se 14 denních záloh na účet.</p>
  <div class="table-wrap"><table class="data-table b1-table"><thead><tr><th>Kdy</th><th>Účet</th><th>Druh</th><th>Velikost</th><th>Stav</th></tr></thead><tbody><?php foreach ($backups as $b): ?><tr><td><?=$fmt($b['created_at'])?></td><td><?=ir_e((string)$b['jmeno'])?></td><td><?=ir_e($b['kind'])?></td><td><?=ir_human_size((int)$b['size_bytes'])?></td><td><?=ir_e($b['status'])?></td></tr><?php endforeach; if (!$backups): ?><tr><td colspan="5" class="muted">Zatím žádné zálohy.</td></tr><?php endif ?></tbody></table></div></section>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">FUNKCE</span><h2>Příznaky funkcí</h2></div></header>
  <?php if ($isSuper): ?><form method="post" class="b1-inline"><?=ir_csrf_field()?><input type="hidden" name="action" value="flag"><input class="input" name="flag" required placeholder="klíč, např. habitat_studio"><input class="input" name="flag_user" inputmode="numeric" placeholder="ID účtu (0 = všichni)"><label class="b1-check"><input type="checkbox" name="on" value="1" checked> zapnuto</label><button class="btn">Uložit</button></form><?php endif ?>
  <ul class="b1-list"><?php foreach ($flags as $f): ?><li><b><?=ir_e($f['flag_key'])?></b> · <?=(int)$f['user_id'] ? 'účet #'.(int)$f['user_id'] : 'všichni'?> · <?=(int)$f['enabled'] ? 'zapnuto' : 'vypnuto'?></li><?php endforeach; if (!$flags): ?><li class="muted">Bez výjimek — platí nastavení tarifů.</li><?php endif ?></ul></section>
<?php
} else {
    $rows = ir_admin_audit($pdo, ['entity' => (string)($_GET['entity'] ?? ''), 'account' => (int)($_GET['account'] ?? 0)], 300);
    echo '<section class="panel glow-panel"><form class="b1-inline b1-filter" method="get"><input type="hidden" name="tab" value="audit"><input class="input" name="account" inputmode="numeric" placeholder="ID účtu" value="'.ir_e((string)($_GET['account'] ?? '')).'"><select class="input" name="entity"><option value="">Vše</option>';
    foreach (['user', 'team', 'subscription', 'billing_order', 'plan', 'animal', 'enclosure', 'event', 'file', 'taxon', 'feature_flag'] as $e) echo '<option '.(($_GET['entity'] ?? '') === $e ? 'selected' : '').'>'.$e.'</option>';
    echo '</select><button class="btn">Filtrovat</button></form><div class="table-wrap"><table class="data-table b1-table"><thead><tr><th>Kdy</th><th>Účet</th><th>Kdo</th><th>Objekt</th><th>Akce</th><th>Změna</th></tr></thead><tbody>';
    foreach ($rows as $r) echo '<tr><td>'.$fmt($r['created_at']).'</td><td>'.(int)$r['account_id'].'</td><td>'.ir_e((string)$r['actor']).'</td><td>'.ir_e($r['entity'].' '.$r['entity_id']).'</td><td>'.ir_e($r['action']).'</td><td><small class="muted">'.ir_e(mb_substr((string)($r['after_json'] ?? ''), 0, 140)).'</small></td></tr>';
    echo '</tbody></table></div></section>';
}
ir_page_end();
