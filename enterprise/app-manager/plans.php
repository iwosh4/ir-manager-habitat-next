<?php
declare(strict_types=1);
/* PLANS & BILLING — current plan, usage, upgrade via provider checkout. Paid status is only ever confirmed server-side. */
require __DIR__.'/includes/config.php';
require __DIR__.'/includes/live.php';
require __DIR__.'/includes/shell.php';
require __DIR__.'/includes/reptile_core.php';
ir_require_perm('read');
$uid = ir_account_id();
$canBuy = ir_can('billing');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    ir_verify_csrf();
    try {
        if (!$canBuy) throw new RuntimeException('Tarif může měnit jen vlastník účtu.');
        $a = (string)($_POST['action'] ?? '');
        if ($a === 'checkout') {
            ir_rate_limit('checkout', 6, 300);
            $email = (string)ir_scalar($pdo, 'SELECT email FROM '.IR_AUTH_TABLE.' WHERE id=?', [$uid], '');
            $r = ir_billing_checkout($pdo, $uid, (string)$_POST['plan'], (string)$_POST['period'], $email);
            if ($r['checkout_url'] === '') throw new RuntimeException('Platební brána nevrátila odkaz k platbě.');
            ir_redirect($r['checkout_url']);
        }
        if ($a === 'cancel') { ir_billing_cancel($pdo, $uid, (int)$_POST['sub'], false); ir_flash('success', 'Předplatné se na konci období neobnoví. Do té doby platí beze změny.'); }
    } catch (Throwable $e) { ir_flash('error', $e->getMessage()); }
    ir_redirect('plans.php');
}

// return from the payment page: re-check the order with the provider (never trust the redirect itself)
$orderInfo = null;
if (!empty($_GET['order'])) {
    $q = $pdo->prepare('SELECT * FROM wp_ir2_billing_orders WHERE id=? AND user_id=?'); $q->execute([(string)$_GET['order'], $uid]);
    if ($o = $q->fetch()) { try { $o = ir_billing_sync_order($pdo, (string)$o['id']); } catch (Throwable $e) { error_log('IR order sync: '.$e->getMessage()); } $orderInfo = $o; }
}
$ent = ir_entitlement($pdo, $uid);
$plans = ir_plans($pdo, true);
$needs = ['team' => 'Více uživatelů v jednom účtu', 'animals' => 'Více zvířat než umožňuje aktuální tarif', 'habitat_studio' => 'Habitat Studio 3D', 'genetics' => 'Genetika 2.0', 'export' => 'Pokročilý export', 'storage' => 'Více místa pro fotky a dokumenty'];
$need = (string)($_GET['need'] ?? '');
$used = ir_active_animal_count($pdo, $uid); $locked = count(ir_quota_locked_ids($pdo, $uid));
$subs = $pdo->prepare("SELECT * FROM wp_ir2_subscriptions WHERE user_id=? ORDER BY id DESC LIMIT 20"); $subs->execute([$uid]); $subs = $subs->fetchAll() ?: [];
$orders = $pdo->prepare("SELECT * FROM wp_ir2_billing_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 20"); $orders->execute([$uid]); $orders = $orders->fetchAll() ?: [];
$price = static fn($v) => $v === null ? null : number_format((float)$v, 0, ',', ' ').' Kč';

ir_page_start('Tarif a platby', 'settings');
echo ir_back('settings.php', 'Zpět do nastavení');
if ($orderInfo) {
    $st = (string)$orderInfo['status'];
    $msg = match ($st) { 'paid' => ['success', 'Platba byla potvrzena poskytovatelem. Tarif je aktivní.'], 'pending', 'created' => ['warning', 'Platba zatím nebyla potvrzena. Jakmile ji poskytovatel potvrdí, tarif se aktivuje automaticky (obvykle do několika minut).'], 'cancelled' => ['warning', 'Platba byla zrušena. Nic nebylo účtováno.'], 'failed' => ['danger', 'Platba se nezdařila. Nic nebylo účtováno.'], default => ['warning', 'Stav platby: '.$st] };
    echo '<div class="flash '.$msg[0].'" role="status">'.ir_e($msg[1]).'</div>';
}
if ($need !== '' && isset($needs[$need])) echo '<div class="flash warning">Tato funkce vyžaduje vyšší tarif: <b>'.ir_e($needs[$need]).'</b>.</div>';
?>
<section class="panel glow-panel b1-current-plan">
  <header class="panel-head"><div><span class="panel-kicker">AKTUÁLNÍ TARIF</span><h2><?=ir_e($ent['plan']['name'])?></h2>
    <p class="muted"><?php if ($ent['subscription']): ?><?=$ent['subscription']['valid_until'] ? 'Platí do '.date('j. n. Y', strtotime($ent['subscription']['valid_until'])) : 'Doživotní licence'?><?=(int)$ent['subscription']['cancel_at_period_end'] ? ' · neobnoví se' : ''?> · <?=ir_e(IR_BILLING_PROVIDERS[$ent['subscription']['provider']] ?? '')?><?php else: ?>Bezplatný tarif<?php endif ?></p></div></header>
  <dl class="b1-kv">
    <div><dt>Aktivní zvířata</dt><dd><?=$used?><?=$ent['max_animals'] !== null ? ' / '.$ent['max_animals'] : ' · neomezeně'?></dd></div>
    <div><dt>Uživatelé</dt><dd><?=(int)$ent['max_users']?></dd></div>
    <div><dt>Úložiště</dt><dd><?=ir_human_size(ir_storage_used($pdo, $uid))?> / <?=(int)$ent['plan']['storage_mb']?> MB</dd></div>
    <?php if ($locked): ?><div><dt>Jen pro čtení (nad limit)</dt><dd><?=$locked?> zvířat — data zůstávají zachována</dd></div><?php endif ?>
  </dl>
  <?php if ($canBuy && $ent['subscription'] && $ent['subscription']['provider'] === 'revolut_web' && !(int)$ent['subscription']['cancel_at_period_end'] && $ent['subscription']['valid_until']): ?>
  <form method="post"><?=ir_csrf_field()?><input type="hidden" name="action" value="cancel"><input type="hidden" name="sub" value="<?=(int)$ent['subscription']['id']?>"><button class="btn">Neobnovovat na konci období</button></form>
  <?php elseif ($ent['subscription'] && in_array($ent['subscription']['provider'], ['apple_app_store', 'google_play'], true)): ?>
  <p class="muted">Předplatné spravujete v obchodě <?=ir_e(IR_BILLING_PROVIDERS[$ent['subscription']['provider']])?>.</p>
  <?php endif ?>
</section>
<div class="b1-plan-grid">
<?php foreach ($plans as $code => $p): $cur = $ent['code'] === $code; ?>
  <article class="panel glow-panel b1-plan <?=$cur ? 'is-current' : ''?>">
    <header class="panel-head"><div><span class="panel-kicker"><?=ir_e(strtoupper($code))?></span><h2><?=ir_e($p['name'])?></h2></div><?=$cur ? '<span class="status-pill is-ok">Aktuální</span>' : ''?></header>
    <ul class="b1-plan-facts">
      <li><?=$p['max_animals'] === null ? 'Neomezeně zvířat' : 'Až '.(int)$p['max_animals'].' zvířat'?></li>
      <li><?=(int)$p['max_users']?> <?=(int)$p['max_users'] === 1 ? 'uživatel' : 'uživatelé'?></li>
      <li><?=(int)$p['storage_mb'] >= 1024 ? round($p['storage_mb'] / 1024, 1).' GB' : (int)$p['storage_mb'].' MB'?> pro fotky a dokumenty</li>
      <?php foreach (array_keys(array_filter((array)$p['features'])) as $f): ?><li><?=ir_e(IR_FEATURE_LABELS[$f] ?? $f)?></li><?php endforeach ?>
    </ul>
    <div class="b1-plan-prices">
      <?php if ($code === 'free'): ?><strong>0 Kč</strong><?php endif ?>
      <?php foreach (['month' => 'měsíčně', 'year' => 'ročně', 'lifetime' => 'jednorázově'] as $per => $lab): if (ir_billing_price($p, $per) === null || $code === 'free') continue; ?>
        <form method="post"><?=ir_csrf_field()?><input type="hidden" name="action" value="checkout"><input type="hidden" name="plan" value="<?=ir_e($code)?>"><input type="hidden" name="period" value="<?=$per?>">
          <button class="btn <?=$per === 'year' ? 'primary' : ''?>" <?=(!$canBuy || $cur && $per !== 'lifetime' && $ent['subscription'] && $ent['subscription']['period'] === $per) ? 'disabled' : ''?>><?=$price($p['price_'.$per])?> <small><?=$lab?></small></button></form>
      <?php endforeach ?>
    </div>
  </article>
<?php endforeach ?>
</div>
<p class="muted b1-note">Platby zpracovává Revolut. Tarif se aktivuje až po potvrzení platby poskytovatelem. Přechod na nižší tarif nikdy nemaže data: zvířata nad limit zůstanou viditelná jen pro čtení a odemknou se vyšším tarifem nebo archivací jiných zvířat.<?=ir_billing_revolut_ready() ? '' : ' <b>Online platby zatím nejsou na tomto serveru zapnuté — tarif může přidělit správce.</b>'?></p>
<?php if ($orders || $subs): ?>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">HISTORIE</span><h2>Objednávky a období</h2></div></header>
  <div class="table-wrap"><table class="data-table b1-table"><thead><tr><th>Datum</th><th>Tarif</th><th>Částka</th><th>Stav</th></tr></thead><tbody>
  <?php foreach ($orders as $o): ?><tr><td><?=date('j. n. Y', strtotime($o['created_at']))?></td><td><?=ir_e(($plans[$o['plan_code']]['name'] ?? $o['plan_code']).' · '.$o['period'])?></td><td><?=number_format($o['amount_minor'] / 100, 0, ',', ' ')?> <?=ir_e($o['currency'])?></td><td><?=ir_e(['paid' => 'Zaplaceno', 'pending' => 'Čeká na potvrzení', 'created' => 'Vytvořeno', 'cancelled' => 'Zrušeno', 'failed' => 'Neúspěšné', 'refunded' => 'Vráceno', 'mismatch' => 'Kontroluje se'][$o['status']] ?? $o['status'])?></td></tr><?php endforeach ?>
  <?php foreach ($subs as $s): if ($s['provider'] === 'revolut_web') continue; ?><tr><td><?=date('j. n. Y', strtotime($s['valid_from']))?></td><td><?=ir_e(($plans[$s['plan_code']]['name'] ?? $s['plan_code']).' · '.(IR_BILLING_PROVIDERS[$s['provider']] ?? $s['provider']))?></td><td>—</td><td><?=ir_e($s['status'])?><?=$s['valid_until'] ? ' do '.date('j. n. Y', strtotime($s['valid_until'])) : ''?></td></tr><?php endforeach ?>
  </tbody></table></div></section>
<?php endif;
ir_page_end();
