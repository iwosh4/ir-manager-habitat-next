<?php
declare(strict_types=1);
/* TEAM — owner adds staff / read-only logins that work on the same breeding account (plan max_users). */
require __DIR__.'/includes/config.php';
require __DIR__.'/includes/live.php';
require __DIR__.'/includes/shell.php';
require __DIR__.'/includes/reptile_core.php';
ir_require_perm('read');
$owner = ir_account_id();
$canManage = ir_can('team');
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    ir_verify_csrf();
    try {
        if (!$canManage) throw new RuntimeException('Tým spravuje vlastník účtu.');
        $a = (string)($_POST['action'] ?? '');
        if ($a === 'create') { ir_team_create($pdo, $owner, (string)$_POST['jmeno'], (string)$_POST['email'], (string)$_POST['role'], (string)$_POST['heslo']); ir_flash('success', 'Člen týmu byl přidán. Předejte mu přihlašovací jméno a heslo.'); }
        elseif ($a === 'role') { ir_team_update($pdo, $owner, (int)$_POST['id'], ['role' => (string)$_POST['role']]); ir_flash('success', 'Role byla změněna.'); }
        elseif ($a === 'toggle') { ir_team_update($pdo, $owner, (int)$_POST['id'], ['active' => (int)$_POST['active'] === 1]); ir_flash('success', 'Přístup byl upraven.'); }
    } catch (Throwable $e) { ir_flash('error', $e->getMessage()); }
    ir_redirect('team.php');
}
$ent = ir_entitlement($pdo, $owner);
$members = ir_team_members($pdo, $owner);
$active = 1 + count(array_filter($members, fn($m) => (int)$m['is_active']));
ir_page_start('Tým', 'settings');
echo ir_back('settings.php', 'Zpět do nastavení');
?>
<section class="panel glow-panel">
  <header class="panel-head"><div><span class="panel-kicker">TÝM · <?=ir_e($ent['plan']['name'])?></span><h2>Uživatelé účtu <?=$active?> / <?=(int)$ent['max_users']?></h2><p class="muted">Pracovník může zapisovat péči a upravovat záznamy; čtenář vidí vše, ale nic nemění. Mazání, platby a tým zůstávají vlastníkovi.</p></div>
  <?php if ((int)$ent['max_users'] <= 1): ?><a class="btn primary" href="plans.php?need=team">Více uživatelů v tarifu PRO</a><?php endif ?></header>
  <div class="table-wrap"><table class="data-table b1-table"><thead><tr><th>Uživatel</th><th>Role</th><th>Poslední přihlášení</th><th>Stav</th><th></th></tr></thead><tbody>
    <tr><td><b><?=ir_e((string)($_SESSION['user_name'] ?? 'Vlastník'))?></b></td><td>Chovatel (vlastník)</td><td>—</td><td><span class="status-pill is-ok">Aktivní</span></td><td></td></tr>
    <?php foreach ($members as $m): ?>
    <tr><td><b><?=ir_e($m['jmeno'])?></b><br><small class="muted"><?=ir_e((string)$m['email'])?></small></td>
      <td><?php if ($canManage): ?><form method="post" class="b1-inline"><?=ir_csrf_field()?><input type="hidden" name="action" value="role"><input type="hidden" name="id" value="<?=(int)$m['id']?>"><select class="input" name="role" onchange="this.form.submit()"><option value="staff" <?=$m['role'] === 'staff' ? 'selected' : ''?>>Pracovník</option><option value="readonly" <?=$m['role'] === 'readonly' ? 'selected' : ''?>>Jen pro čtení</option></select></form><?php else: echo ir_e(IR_ROLES[$m['role']] ?? $m['role']); endif ?></td>
      <td><?=$m['posledni_prihlaseni'] ? date('j. n. Y H:i', strtotime($m['posledni_prihlaseni'])) : '—'?></td>
      <td><?=(int)$m['is_active'] ? '<span class="status-pill is-ok">Aktivní</span>' : '<span class="status-pill is-off">Vypnuto</span>'?></td>
      <td><?php if ($canManage): ?><form method="post"><?=ir_csrf_field()?><input type="hidden" name="action" value="toggle"><input type="hidden" name="id" value="<?=(int)$m['id']?>"><input type="hidden" name="active" value="<?=(int)$m['is_active'] ? 0 : 1?>"><button class="btn small"><?=(int)$m['is_active'] ? 'Vypnout přístup' : 'Zapnout přístup'?></button></form><?php endif ?></td></tr>
    <?php endforeach ?>
  </tbody></table></div>
</section>
<?php if ($canManage && $active < (int)$ent['max_users']): ?>
<form method="post" class="panel glow-panel"><?=ir_csrf_field()?><input type="hidden" name="action" value="create">
  <header class="panel-head"><div><span class="panel-kicker">NOVÝ ČLEN</span><h2>Přidat uživatele</h2></div></header>
  <div class="b1-form-grid">
    <label>Přihlašovací jméno<input class="input" name="jmeno" required minlength="3" maxlength="50" autocomplete="off"></label>
    <label>E-mail<input class="input" type="email" name="email" required autocomplete="off"></label>
    <label>Role<select class="input" name="role"><option value="staff">Pracovník</option><option value="readonly">Jen pro čtení</option></select></label>
    <label>Počáteční heslo (min. 10 znaků)<input class="input" type="password" name="heslo" required minlength="10" autocomplete="new-password"></label>
  </div>
  <button class="btn primary">Přidat do týmu</button>
</form>
<?php endif;
ir_page_end();
