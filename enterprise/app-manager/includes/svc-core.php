<?php
declare(strict_types=1);

/*
 * BETA 1.0 core services: roles & permissions, tenancy (account vs actor), audit log, EntitlementService,
 * stable QR identities, JSON helpers for api.php.
 *
 * Tenancy: every husbandry row is owned by an ACCOUNT (the breeder = wp_ir2__uzivatele row without owner).
 * STAFF / READ-ONLY users have owner_user_id → they log in as themselves (actor) but work on the owner's
 * data: $_SESSION['user_id'] = account id (all existing queries stay scoped), $_SESSION['actor_id'] = login.
 */

const IR_ROLES = ['superadmin' => 'Superadmin', 'admin' => 'Administrátor', 'owner' => 'Chovatel (vlastník)', 'staff' => 'Pracovník', 'readonly' => 'Jen pro čtení'];

function ir_actor_id(): int { return (int)($_SESSION['actor_id'] ?? $_SESSION['user_id'] ?? 0); }
function ir_account_id(): int { return ir_current_user_id(); }

/** Normalised role of the logged-in actor ('user' of older installs = owner). */
function ir_role(): string {
    static $cache = null;
    if ($cache !== null) return $cache;
    if (!ir_logged_in()) return $cache = 'guest';
    global $pdo;
    try {
        $st = $pdo->prepare('SELECT role FROM '.IR_AUTH_TABLE.' WHERE id=? LIMIT 1');
        $st->execute([ir_actor_id()]);
        $r = strtolower(trim((string)($st->fetchColumn() ?: 'owner')));
    } catch (Throwable) { $r = 'owner'; }
    if ($r === 'user' || $r === '') $r = 'owner';
    return $cache = (isset(IR_ROLES[$r]) ? $r : 'owner');
}

/**
 * Central permission matrix — every restricted PHP/API action calls ir_require_perm(); hidden UI is never
 * the only protection.
 */
function ir_can(string $perm): bool {
    $role = ir_role();
    $matrix = [
        'read' => ['superadmin', 'admin', 'owner', 'staff', 'readonly'],
        'write' => ['superadmin', 'admin', 'owner', 'staff'],
        'delete' => ['superadmin', 'admin', 'owner'],
        'export' => ['superadmin', 'admin', 'owner', 'staff', 'readonly'],
        'billing' => ['superadmin', 'admin', 'owner'],
        'team' => ['superadmin', 'admin', 'owner'],
        'admin' => ['superadmin', 'admin'],
        'system' => ['superadmin'],
    ];
    return in_array($role, $matrix[$perm] ?? [], true);
}
function ir_require_perm(string $perm): void {
    if (ir_can($perm)) return;
    if (ir_is_api_request()) ir_json(['ok' => false, 'error' => 'forbidden', 'message' => 'Na tuto akci nemáte oprávnění.'], 403);
    http_response_code(403);
    exit('Na tuto akci nemáte oprávnění.');
}
function ir_is_api_request(): bool { return defined('IR_API') || str_contains((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json'); }

/** Mutating POST from any page: read-only users are refused server-side before the page handles it. */
function ir_guard_mutation(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') return;
    if (defined('IR_PUBLIC_PAGE') && IR_PUBLIC_PAGE === true) return;
    if (!ir_logged_in()) return;
    if (!ir_can('write')) { http_response_code(403); exit('Účet je pouze pro čtení.'); }
}

// ---------------------------------------------------------------------------------------------- audit
function ir_audit(PDO $pdo, string $entity, $entityId, string $action, $before = null, $after = null, ?int $account = null): void {
    try {
        if (!ir_table_exists($pdo, 'wp_ir2_audit')) return;
        $enc = static fn($v) => $v === null ? null : json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
        $pdo->prepare('INSERT INTO wp_ir2_audit(account_id,actor_id,entity,entity_id,action,before_json,after_json,ip,created_at) VALUES(?,?,?,?,?,?,?,?,NOW())')
            ->execute([$account ?? (ir_account_id() ?: null), ir_actor_id() ?: null, $entity, $entityId === null ? null : (string)$entityId, $action, $enc($before), $enc($after), substr((string)($_SERVER['REMOTE_ADDR'] ?? 'cli'), 0, 64)]);
    } catch (Throwable $e) { error_log('IR audit: '.$e->getMessage()); }
}

// ---------------------------------------------------------------------------------------------- entitlements
/** All plans (admin-configurable rows), code → row with decoded features. */
function ir_plans(PDO $pdo, bool $activeOnly = false): array {
    static $cache = null;
    if ($cache === null) {
        $cache = [];
        try {
            if (ir_table_exists($pdo, 'wp_ir2_plans')) foreach ($pdo->query('SELECT * FROM wp_ir2_plans ORDER BY sort_order, code')->fetchAll() ?: [] as $r) {
                $r['features'] = json_decode((string)$r['features_json'], true) ?: [];
                $cache[$r['code']] = $r;
            }
        } catch (Throwable) {}
        if (!$cache) { // pre-migration fallback: behave as the default FREE plan, never lock existing data
            require_once __DIR__.'/schema-beta1.php';
            foreach (ir_default_plans() as $p) $cache[$p['code']] = ['code' => $p['code'], 'name' => $p['name'], 'max_animals' => $p['max_animals'], 'max_users' => $p['max_users'], 'storage_mb' => $p['storage_mb'], 'features' => json_decode($p['features'], true), 'active' => 1, 'price_month' => $p['price_month'], 'price_year' => $p['price_year'], 'price_lifetime' => $p['price_lifetime'], 'currency' => 'CZK', 'allow_month' => $p['allow_month'], 'allow_year' => $p['allow_year'], 'allow_lifetime' => $p['allow_lifetime']];
        }
    }
    return $activeOnly ? array_filter($cache, static fn($p) => (int)$p['active'] === 1) : $cache;
}

/** Drop the per-request entitlement cache (after any subscription change). */
function ir_entitlement_reset(): void { $GLOBALS['ir_entitlement_cache'] = []; }
/**
 * EntitlementService — the ONE place that decides what an account may do.
 * Resolution: best currently valid subscription (any provider: revolut_web, apple_app_store, google_play,
 * admin_manual) → plan; otherwise FREE. Superadmin/admin accounts get the top plan for operations.
 */
function ir_entitlement(PDO $pdo, ?int $accountId = null): array {
    $cache = &$GLOBALS['ir_entitlement_cache'];
    $cache ??= [];
    $accountId = $accountId ?? ir_account_id();
    if (isset($cache[$accountId])) return $cache[$accountId];
    $plans = ir_plans($pdo);
    $code = 'free'; $sub = null;
    try {
        if (ir_table_exists($pdo, 'wp_ir2_subscriptions')) {
            $q = $pdo->prepare("SELECT s.* FROM wp_ir2_subscriptions s WHERE s.user_id=? AND s.status IN ('active','trialing','past_due') AND s.valid_from<=NOW() AND (s.valid_until IS NULL OR s.valid_until>NOW()) ORDER BY s.id DESC");
            $q->execute([$accountId]);
            $rank = array_flip(array_keys($plans));
            foreach ($q->fetchAll() ?: [] as $s) {
                if (!isset($plans[$s['plan_code']])) continue;
                if ($sub === null || ($rank[$s['plan_code']] ?? 0) > ($rank[$code] ?? 0)) { $sub = $s; $code = $s['plan_code']; }
            }
        }
    } catch (Throwable $e) { error_log('IR entitlement: '.$e->getMessage()); }
    $plan = $plans[$code] ?? reset($plans);
    return $cache[$accountId] = ['plan' => $plan, 'code' => $plan['code'], 'subscription' => $sub, 'features' => $plan['features'] ?? [], 'max_animals' => $plan['max_animals'] === null ? null : (int)$plan['max_animals'], 'max_users' => (int)($plan['max_users'] ?? 1)];
}
function ir_feature(string $feature, ?PDO $db = null): bool {
    global $pdo;
    $db = $db ?: $pdo;
    if (!$db) return false;
    if (in_array(ir_role(), ['superadmin', 'admin'], true)) return true;
    return !empty(ir_entitlement($db)['features'][$feature]);
}
/** Friendly upgrade stop (never deletes anything). */
function ir_require_feature(string $feature): void {
    if (ir_feature($feature)) return;
    $msg = 'Tato funkce není v aktuálním tarifu dostupná. Vaše data zůstávají zachována — funkci odemknete v Tarifu.';
    if (ir_is_api_request()) ir_json(['ok' => false, 'error' => 'upgrade_required', 'feature' => $feature, 'message' => $msg], 402);
    ir_flash('error', $msg);
    ir_redirect('plans.php?need='.rawurlencode($feature));
}
/** Active (non-archived, non-sold, non-dead) animals counted against the plan quota. */
function ir_active_animal_count(PDO $pdo, int $accountId): int {
    return (int)ir_scalar($pdo, 'SELECT COUNT(*) FROM wp_ir2_zvirata z WHERE z.user_id=? AND '.ir_status_active_sql('z'), [$accountId], 0);
}
/** Quota check before creating animals: returns null when allowed or a user-facing message. */
function ir_animal_quota_block(PDO $pdo, int $accountId, int $adding = 1): ?string {
    if (in_array(ir_role(), ['superadmin', 'admin'], true)) return null;
    $ent = ir_entitlement($pdo, $accountId);
    if ($ent['max_animals'] === null) return null;
    $n = ir_active_animal_count($pdo, $accountId);
    if ($n + $adding <= $ent['max_animals']) return null;
    return 'Tarif '.$ent['plan']['name'].' umožňuje '.$ent['max_animals'].' aktivních zvířat (nyní '.$n.'). Nic se nemaže — pro další zvířata přejděte na vyšší tarif nebo archivujte/prodejte stávající.';
}
/** Animals above quota after a downgrade: the newest ones become read-only (locked), never deleted. */
function ir_quota_locked_ids(PDO $pdo, int $accountId): array {
    $ent = ir_entitlement($pdo, $accountId);
    if ($ent['max_animals'] === null || in_array(ir_role(), ['superadmin', 'admin'], true)) return [];
    try {
        $q = $pdo->prepare('SELECT z.id FROM wp_ir2_zvirata z WHERE z.user_id=? AND '.ir_status_active_sql('z').' ORDER BY z.id');
        $q->execute([$accountId]);
        $ids = array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN) ?: []);
        return array_slice($ids, $ent['max_animals']);
    } catch (Throwable) { return []; }
}
function ir_animal_is_locked(PDO $pdo, int $accountId, int $animalId): bool { return in_array($animalId, ir_quota_locked_ids($pdo, $accountId), true); }

// ---------------------------------------------------------------------------------------------- stable QR identities
/** Stable, unguessable QR/NFC token for an animal or enclosure (created once, never reused). */
function ir_qr_token(PDO $pdo, string $kind, int $accountId, int $id): string {
    $table = $kind === 'enclosure' ? 'wp_ir2_ubikace' : 'wp_ir2_zvirata';
    if (!ir_db_column_exists($pdo, $table, 'qr_token')) return '';
    $q = $pdo->prepare("SELECT qr_token FROM `$table` WHERE id=? AND user_id=? LIMIT 1");
    $q->execute([$id, $accountId]);
    $t = (string)($q->fetchColumn() ?: '');
    if ($t !== '') return $t;
    $t = ($kind === 'enclosure' ? 'E' : 'A').strtoupper(bin2hex(random_bytes(7)));
    $pdo->prepare("UPDATE `$table` SET qr_token=? WHERE id=? AND user_id=? AND (qr_token IS NULL OR qr_token='')")->execute([$t, $id, $accountId]);
    return $t;
}
/** QR payload printed on labels: IR:A:<token> / IR:E:<token> (legacy IR:ANIMAL:<id> still accepted). */
function ir_qr_payload(PDO $pdo, string $kind, int $accountId, int $id): string {
    return 'IR:'.($kind === 'enclosure' ? 'E' : 'A').':'.ir_qr_token($pdo, $kind, $accountId, $id);
}
/** Resolve a scanned code to an entity of THIS account (never another account's data). */
function ir_qr_resolve(PDO $pdo, int $accountId, string $code): ?array {
    $code = trim($code);
    if (preg_match('~[?&]code=([^&]+)~', $code, $m)) $code = urldecode($m[1]);
    $code = strtoupper(trim($code));
    $kind = null; $col = null; $val = null;
    if (preg_match('~^IR:(A|E):([A-Z0-9]{6,24})$~', $code, $m)) { $kind = $m[1] === 'A' ? 'animal' : 'enclosure'; $col = 'qr_token'; $val = $m[2]; }
    elseif (preg_match('~^IR:(ANIMAL|ENCLOSURE|HABITAT|UBIKACE):(\d+)(?::[A-Z]+)?$~', $code, $m)) { $kind = $m[1] === 'ANIMAL' ? 'animal' : 'enclosure'; $col = 'id'; $val = (int)$m[2]; }
    elseif (preg_match('~^(A|E)[0-9A-F]{14}$~', $code)) { $kind = $code[0] === 'A' ? 'animal' : 'enclosure'; $col = 'qr_token'; $val = $code; }
    if (!$kind) return null;
    $table = $kind === 'animal' ? 'wp_ir2_zvirata' : 'wp_ir2_ubikace';
    if ($col === 'qr_token' && !ir_db_column_exists($pdo, $table, 'qr_token')) return null;
    $q = $pdo->prepare("SELECT * FROM `$table` WHERE user_id=? AND `$col`=? LIMIT 1");
    $q->execute([$accountId, $val]);
    $row = $q->fetch();
    return $row ? ['kind' => $kind, 'id' => (int)$row['id'], 'row' => $row] : null;
}

// ---------------------------------------------------------------------------------------------- JSON API helpers
function ir_json(array $data, int $status = 200): never {
    if (!headers_sent()) { http_response_code($status); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}
/** CSRF for JSON/fetch requests: X-CSRF-Token header (same session token as forms). */
function ir_verify_csrf_header(): void {
    $token = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['_csrf'] ?? '');
    $known = (string)($_SESSION['ir_csrf'] ?? '');
    if ($known === '' || $token === '' || !hash_equals($known, $token)) ir_json(['ok' => false, 'error' => 'csrf', 'message' => 'Relace vypršela. Obnovte stránku.'], 419);
}
/** Simple per-session rate limit for sensitive API calls. */
function ir_rate_limit(string $bucket, int $max, int $windowSeconds): void {
    $now = time(); $k = 'ir_rl_'.$bucket;
    $hits = array_filter((array)($_SESSION[$k] ?? []), static fn($t) => $t > $now - $windowSeconds);
    if (count($hits) >= $max) ir_json(['ok' => false, 'error' => 'rate_limited', 'message' => 'Příliš mnoho požadavků, zkuste to za chvíli.'], 429);
    $hits[] = $now; $_SESSION[$k] = array_values($hits);
}
function ir_uuidish(string $prefix): string { return $prefix.'_'.bin2hex(random_bytes(8)); }
