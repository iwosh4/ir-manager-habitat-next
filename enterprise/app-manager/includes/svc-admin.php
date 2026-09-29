<?php
declare(strict_types=1);

/*
 * ADMINISTRATION + TEAM.
 * Roles: superadmin (system), admin (support/billing), owner (breeder account), staff (works on the owner's
 * account), readonly. Every change is audited; the last superadmin can never be demoted/suspended; admins
 * cannot touch superadmins; only a superadmin grants admin/superadmin. Suspension and forced logout bump
 * session_version so every open session of that login ends immediately.
 */

function ir_admin_actor_role(): string { return ir_role(); }

/** Load a login row (never the password hash). */
function ir_admin_user(PDO $pdo, int $id): ?array {
    $q = $pdo->prepare('SELECT id,jmeno,email,role,is_active,owner_user_id,posledni_prihlaseni,suspended_at,suspend_reason,session_version,COALESCE(created_at,vytvoreno) AS created_at FROM '.IR_AUTH_TABLE.' WHERE id=? LIMIT 1');
    $q->execute([$id]);
    $u = $q->fetch();
    if ($u) $u['role'] = ($u['role'] === 'user' || $u['role'] === '') ? 'owner' : (string)$u['role'];
    return $u ?: null;
}
function ir_admin_superadmins(PDO $pdo): int { return (int)ir_scalar($pdo, "SELECT COUNT(*) FROM ".IR_AUTH_TABLE." WHERE role='superadmin' AND is_active=1 AND suspended_at IS NULL", [], 0); }

/** Guard: may the current actor manage $target at all? */
function ir_admin_can_manage(array $target): void {
    $me = ir_admin_actor_role();
    if (!in_array($me, ['superadmin', 'admin'], true)) throw new RuntimeException('Pouze pro administrátora.');
    if ($target['role'] === 'superadmin' && $me !== 'superadmin') throw new RuntimeException('Superadministrátora může spravovat jen superadministrátor.');
}

/** Accounts overview with usage (owners first; staff grouped under their owner). */
function ir_admin_accounts(PDO $pdo, string $q = '', string $filter = ''): array {
    $where = ['1=1']; $p = [];
    if ($q !== '') { $where[] = '(u.jmeno LIKE ? OR u.email LIKE ? OR u.id=?)'; $p[] = '%'.$q.'%'; $p[] = '%'.$q.'%'; $p[] = (int)$q; }
    if ($filter === 'suspended') $where[] = 'u.suspended_at IS NOT NULL';
    if ($filter === 'inactive') $where[] = 'u.is_active=0';
    if ($filter === 'staff') $where[] = "u.owner_user_id IS NOT NULL AND u.owner_user_id>0";
    $st = $pdo->prepare('SELECT u.id,u.jmeno,u.email,u.role,u.is_active,u.owner_user_id,u.posledni_prihlaseni,u.suspended_at,u.suspend_reason,COALESCE(u.created_at,u.vytvoreno) AS created_at,
        (SELECT COUNT(*) FROM wp_ir2_zvirata z WHERE z.user_id=u.id AND '.ir_status_active_sql('z').') AS animals,
        (SELECT COUNT(*) FROM wp_ir2_pece p WHERE p.user_id=u.id) AS events,
        (SELECT MAX(p.datum) FROM wp_ir2_pece p WHERE p.user_id=u.id) AS last_event
        FROM '.IR_AUTH_TABLE.' u WHERE '.implode(' AND ', $where).' ORDER BY COALESCE(NULLIF(u.owner_user_id,0),u.id), u.owner_user_id IS NOT NULL, u.jmeno LIMIT 500');
    $st->execute($p);
    $rows = $st->fetchAll() ?: [];
    foreach ($rows as &$r) {
        $r['role'] = ($r['role'] === 'user' || $r['role'] === '') ? 'owner' : (string)$r['role'];
        $ent = ir_entitlement($pdo, (int)$r['id']);
        $r['plan'] = $ent['code']; $r['plan_name'] = (string)$ent['plan']['name']; $r['plan_until'] = $ent['subscription']['valid_until'] ?? null; $r['plan_provider'] = $ent['subscription']['provider'] ?? null;
    }
    return $rows;
}

function ir_admin_set_role(PDO $pdo, int $targetId, string $role): void {
    if (!isset(IR_ROLES[$role])) throw new RuntimeException('Neplatná role.');
    $t = ir_admin_user($pdo, $targetId); if (!$t) throw new RuntimeException('Účet nebyl nalezen.');
    ir_admin_can_manage($t);
    if (in_array($role, ['superadmin', 'admin'], true) && ir_admin_actor_role() !== 'superadmin') throw new RuntimeException('Roli administrátora přiděluje jen superadministrátor.');
    if ($t['role'] === 'superadmin' && $role !== 'superadmin' && ir_admin_superadmins($pdo) <= 1) throw new RuntimeException('Poslední superadministrátor musí zůstat.');
    if (in_array($role, ['staff', 'readonly'], true) && empty($t['owner_user_id'])) throw new RuntimeException('Pracovník / čtenář musí patřit pod účet chovatele (tým spravuje vlastník v Nastavení → Tým).');
    $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET role=?, session_version=session_version+1 WHERE id=?')->execute([$role === 'owner' ? 'user' : $role, $targetId]);
    ir_audit($pdo, 'user', $targetId, 'role', ['role' => $t['role']], ['role' => $role], $targetId);
}
function ir_admin_suspend(PDO $pdo, int $targetId, string $reason): void {
    $t = ir_admin_user($pdo, $targetId); if (!$t) throw new RuntimeException('Účet nebyl nalezen.');
    ir_admin_can_manage($t);
    if ($targetId === ir_actor_id()) throw new RuntimeException('Vlastní účet nelze pozastavit.');
    if ($t['role'] === 'superadmin' && ir_admin_superadmins($pdo) <= 1) throw new RuntimeException('Posledního superadministrátora nelze pozastavit.');
    $reason = trim($reason); if ($reason === '') throw new RuntimeException('Uveďte důvod pozastavení.');
    $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET suspended_at=NOW(), suspend_reason=?, session_version=session_version+1 WHERE id=?')->execute([mb_substr($reason, 0, 255), $targetId]);
    // staff of a suspended owner lose access as well
    $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET session_version=session_version+1 WHERE owner_user_id=?')->execute([$targetId]);
    ir_audit($pdo, 'user', $targetId, 'suspend', null, ['reason' => $reason], $targetId);
}
function ir_admin_unsuspend(PDO $pdo, int $targetId): void {
    $t = ir_admin_user($pdo, $targetId); if (!$t) throw new RuntimeException('Účet nebyl nalezen.');
    ir_admin_can_manage($t);
    $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET suspended_at=NULL, suspend_reason=NULL, is_active=1 WHERE id=?')->execute([$targetId]);
    ir_audit($pdo, 'user', $targetId, 'unsuspend', null, null, $targetId);
}
function ir_admin_force_logout(PDO $pdo, int $targetId): void {
    $t = ir_admin_user($pdo, $targetId); if (!$t) throw new RuntimeException('Účet nebyl nalezen.');
    ir_admin_can_manage($t);
    $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET session_version=session_version+1 WHERE id=?')->execute([$targetId]);
    ir_audit($pdo, 'user', $targetId, 'force_logout', null, null, $targetId);
}
/** Generates a one-time temporary password (shown once to the admin, never stored in plain text). */
function ir_admin_reset_password(PDO $pdo, int $targetId): string {
    $t = ir_admin_user($pdo, $targetId); if (!$t) throw new RuntimeException('Účet nebyl nalezen.');
    ir_admin_can_manage($t);
    $alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    $pw = ''; for ($i = 0; $i < 14; $i++) $pw .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET heslo=?, session_version=session_version+1 WHERE id=?')->execute([password_hash($pw, PASSWORD_DEFAULT), $targetId]);
    ir_audit($pdo, 'user', $targetId, 'password_reset', null, null, $targetId);
    return $pw;
}
function ir_admin_note(PDO $pdo, int $targetId, string $note): void {
    $note = trim($note); if ($note === '') return;
    $pdo->prepare('INSERT INTO wp_ir2_account_notes(user_id,author_id,note,created_at) VALUES(?,?,?,NOW())')->execute([$targetId, ir_actor_id(), mb_substr($note, 0, 5000)]);
    ir_audit($pdo, 'user', $targetId, 'note', null, ['note' => mb_substr($note, 0, 200)], $targetId);
}
function ir_admin_notes(PDO $pdo, int $targetId): array {
    $q = $pdo->prepare('SELECT n.*, u.jmeno AS author FROM wp_ir2_account_notes n LEFT JOIN '.IR_AUTH_TABLE.' u ON u.id=n.author_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 50'); $q->execute([$targetId]);
    return $q->fetchAll() ?: [];
}
/** Admin plan override (admin_manual provider) with optional expiry. Replaces any previous manual override. */
function ir_admin_set_plan(PDO $pdo, int $accountId, string $planCode, ?string $until, string $note): void {
    if (!ir_can('billing')) throw new RuntimeException('Nemáte oprávnění ke správě tarifů.');
    if (!isset(ir_plans($pdo)[$planCode])) throw new RuntimeException('Neznámý tarif.');
    $pdo->prepare("UPDATE wp_ir2_subscriptions SET status='canceled', valid_until=LEAST(COALESCE(valid_until,NOW()),NOW()), updated_at=NOW() WHERE user_id=? AND provider='admin_manual' AND status='active'")->execute([$accountId]);
    ir_entitlement_reset();
    if ($planCode === 'free') { ir_audit($pdo, 'subscription', null, 'manual_reset', null, ['plan' => 'free'], $accountId); return; }
    $untilTs = $until ? strtotime($until.' 23:59:59') : null;
    if ($until && (!$untilTs || $untilTs < time())) throw new RuntimeException('Datum platnosti musí být v budoucnosti.');
    ir_billing_grant($pdo, $accountId, $planCode, $planCode === 'platinum' && !$until ? 'lifetime' : 'manual', 'admin_manual', null, $untilTs ? date('Y-m-d H:i:s', $untilTs) : null, $note, ir_actor_id());
}
/** Update a plan's commercial parameters (prices in CZK, limits, features). */
function ir_admin_save_plan(PDO $pdo, string $code, array $d): void {
    if (ir_admin_actor_role() !== 'superadmin') throw new RuntimeException('Tarify upravuje jen superadministrátor.');
    $plans = ir_plans($pdo); if (!isset($plans[$code])) throw new RuntimeException('Neznámý tarif.');
    $num = static fn($v) => ($v === '' || $v === null) ? null : max(0, (float)str_replace(',', '.', (string)$v));
    $features = array_values(array_filter(array_map('trim', is_array($d['features'] ?? null) ? $d['features'] : explode(',', (string)($d['features'] ?? '')))));
    $pdo->prepare('UPDATE wp_ir2_plans SET name=?, price_month=?, price_year=?, price_lifetime=?, max_animals=?, max_users=?, storage_mb=?, features_json=?, allow_month=?, allow_year=?, allow_lifetime=?, active=?, updated_at=NOW() WHERE code=?')
        ->execute([trim((string)($d['name'] ?? $plans[$code]['name'])) ?: $plans[$code]['name'], $num($d['price_month'] ?? null), $num($d['price_year'] ?? null), $num($d['price_lifetime'] ?? null),
            ($d['max_animals'] ?? '') === '' ? null : max(0, (int)$d['max_animals']), max(1, (int)($d['max_users'] ?? 1)), max(0, (int)($d['storage_mb'] ?? 200)), json_encode(array_fill_keys($features, true)),
            !empty($d['allow_month']) ? 1 : 0, !empty($d['allow_year']) ? 1 : 0, !empty($d['allow_lifetime']) ? 1 : 0, $code === 'free' ? 1 : (!empty($d['active']) ? 1 : 0), $code]);
    ir_audit($pdo, 'plan', $code, 'update', $plans[$code], $d, 0);
}
/**
 * Permanent account removal — superadmin only, typed confirmation, and ALWAYS preceded by an automatic full
 * backup ZIP (kept in storage/backups). The normal path for users is suspension / deactivation.
 */
function ir_admin_delete_account(PDO $pdo, int $targetId, string $confirm): string {
    if (ir_admin_actor_role() !== 'superadmin') throw new RuntimeException('Trvalé smazání účtu smí provést jen superadministrátor.');
    $t = ir_admin_user($pdo, $targetId); if (!$t) throw new RuntimeException('Účet nebyl nalezen.');
    if ($targetId === ir_actor_id()) throw new RuntimeException('Vlastní účet nelze smazat.');
    if ($t['role'] === 'superadmin') throw new RuntimeException('Superadministrátora nelze smazat.');
    if ($confirm !== 'SMAZAT '.$t['jmeno']) throw new RuntimeException('Pro trvalé smazání napište přesně: SMAZAT '.$t['jmeno']);
    $backup = ir_backup_account($pdo, $targetId, 'predelete');
    require_once __DIR__.'/user-data-schema.php';
    $pdo->beginTransaction();
    try {
        foreach (ir_user_data_specs($pdo) as $table => $spec) ir_user_data_delete($pdo, $targetId, $table, $spec);
        $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET is_active=0, session_version=session_version+1 WHERE owner_user_id=?')->execute([$targetId]);
        $pdo->prepare('DELETE FROM '.IR_AUTH_TABLE.' WHERE id=?')->execute([$targetId]);
        ir_audit($pdo, 'user', $targetId, 'delete_account', ['jmeno' => $t['jmeno'], 'email' => $t['email']], ['backup' => basename($backup['path'])], $targetId);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    return basename($backup['path']);
}
function ir_admin_audit(PDO $pdo, array $f = [], int $limit = 200): array {
    $w = ['1=1']; $p = [];
    if (!empty($f['account'])) { $w[] = 'a.account_id=?'; $p[] = (int)$f['account']; }
    if (!empty($f['entity'])) { $w[] = 'a.entity=?'; $p[] = (string)$f['entity']; }
    $q = $pdo->prepare('SELECT a.*, u.jmeno AS actor FROM wp_ir2_audit a LEFT JOIN '.IR_AUTH_TABLE.' u ON u.id=a.actor_id WHERE '.implode(' AND ', $w).' ORDER BY a.id DESC LIMIT '.max(1, min(1000, $limit)));
    $q->execute($p);
    return $q->fetchAll() ?: [];
}
function ir_feature_flag_set(PDO $pdo, string $key, int $userId, bool $on): void {
    if (ir_admin_actor_role() !== 'superadmin') throw new RuntimeException('Pouze superadministrátor.');
    $pdo->prepare('INSERT INTO wp_ir2_feature_flags(flag_key,user_id,enabled,updated_at) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), updated_at=NOW()')->execute([mb_substr($key, 0, 80), $userId, $on ? 1 : 0]);
    ir_audit($pdo, 'feature_flag', $key, $on ? 'on' : 'off', null, ['user' => $userId], $userId);
}

// ------------------------------------------------------------------------------------------------- TEAM
/** Team logins of an owner account (staff / readonly). */
function ir_team_members(PDO $pdo, int $ownerId): array {
    $q = $pdo->prepare('SELECT id,jmeno,email,role,is_active,posledni_prihlaseni,suspended_at FROM '.IR_AUTH_TABLE.' WHERE owner_user_id=? ORDER BY jmeno'); $q->execute([$ownerId]);
    return $q->fetchAll() ?: [];
}
/** Create a team login under the owner (plan max_users counts the owner). Returns the new login id. */
function ir_team_create(PDO $pdo, int $ownerId, string $name, string $email, string $role, string $password): int {
    if (!ir_can('team')) throw new RuntimeException('Tým spravuje vlastník účtu.');
    if (!in_array($role, ['staff', 'readonly'], true)) throw new RuntimeException('Neplatná role člena týmu.');
    $max = (int)(ir_entitlement($pdo, $ownerId)['max_users'] ?? 1);
    $active = 1 + (int)ir_scalar($pdo, 'SELECT COUNT(*) FROM '.IR_AUTH_TABLE.' WHERE owner_user_id=? AND is_active=1', [$ownerId], 0);
    if ($active >= $max) throw new RuntimeException('Tarif umožňuje nejvýše '.$max.' '.($max === 1 ? 'uživatele' : 'uživatele celkem').'. Pro další členy týmu zvyšte tarif (PRO: 3 uživatelé).');
    $name = trim($name); $email = trim($email);
    if (mb_strlen($name) < 3) throw new RuntimeException('Uživatelské jméno musí mít alespoň 3 znaky.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Neplatný e-mail.');
    if (strlen($password) < 10) throw new RuntimeException('Heslo musí mít alespoň 10 znaků.');
    if ((int)ir_scalar($pdo, 'SELECT COUNT(*) FROM '.IR_AUTH_TABLE.' WHERE jmeno=? OR email=?', [$name, $email], 0)) throw new RuntimeException('Uživatel se stejným jménem nebo e-mailem už existuje.');
    $pdo->prepare('INSERT INTO '.IR_AUTH_TABLE.'(jmeno,heslo,email,role,is_active,owner_user_id,created_at) VALUES(?,?,?,?,1,?,NOW())')->execute([$name, password_hash($password, PASSWORD_DEFAULT), $email, $role, $ownerId]);
    $id = (int)$pdo->lastInsertId();
    ir_audit($pdo, 'team', $id, 'create', null, ['role' => $role, 'name' => $name], $ownerId);
    return $id;
}
function ir_team_update(PDO $pdo, int $ownerId, int $memberId, array $d): void {
    if (!ir_can('team')) throw new RuntimeException('Tým spravuje vlastník účtu.');
    $m = ir_admin_user($pdo, $memberId);
    if (!$m || (int)$m['owner_user_id'] !== $ownerId) throw new RuntimeException('Člen týmu nebyl nalezen.');
    if (isset($d['role'])) { if (!in_array($d['role'], ['staff', 'readonly'], true)) throw new RuntimeException('Neplatná role.'); $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET role=?, session_version=session_version+1 WHERE id=?')->execute([$d['role'], $memberId]); }
    if (isset($d['active'])) {
        if ($d['active']) {
            $max = (int)(ir_entitlement($pdo, $ownerId)['max_users'] ?? 1);
            $active = 1 + (int)ir_scalar($pdo, 'SELECT COUNT(*) FROM '.IR_AUTH_TABLE.' WHERE owner_user_id=? AND is_active=1', [$ownerId], 0);
            if (!(int)$m['is_active'] && $active >= $max) throw new RuntimeException('Limit uživatelů tarifu je vyčerpán.');
        }
        $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET is_active=?, session_version=session_version+1 WHERE id=?')->execute([$d['active'] ? 1 : 0, $memberId]);
    }
    ir_audit($pdo, 'team', $memberId, 'update', ['role' => $m['role'], 'active' => $m['is_active']], $d, $ownerId);
}
