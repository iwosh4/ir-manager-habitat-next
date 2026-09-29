<?php
declare(strict_types=1);

/*
 * IR Manager BETA 1.0 FINAL — additive, idempotent schema migration (version 070).
 *
 * Rules (hard): no DROP / TRUNCATE / destructive ALTER of existing tables; every step is guarded by an
 * information_schema check; only wp_ir2_* tables are touched (the database is shared with WordPress).
 * The same definition drives (a) the in-app runner (Admin → Systém) and the CLI runner and (b) the
 * generated IR_MANAGER_BETA_1_0_FINAL_MIGRATION.sql (see ir_schema_beta1_sql()).
 */
const IR_SCHEMA_VERSION = '20260929_070_beta1_final';

function ir_schema_beta1_steps(): array {
    $t = static fn(string $name, string $body) => ['kind' => 'table', 'table' => $name, 'sql' => "CREATE TABLE IF NOT EXISTS `{$name}` ({$body}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"];
    $c = static fn(string $table, string $column, string $def) => ['kind' => 'column', 'table' => $table, 'column' => $column, 'sql' => "ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$def}"];
    $i = static fn(string $table, string $index, string $cols, bool $unique = false) => ['kind' => 'index', 'table' => $table, 'index' => $index, 'sql' => "ALTER TABLE `{$table}` ADD ".($unique ? 'UNIQUE ' : '')."INDEX `{$index}` ({$cols})"];
    return [
        // ------------------------------------------------------------------ unified events (wp_ir2_pece)
        $c('wp_ir2_pece', 'vysledek', "VARCHAR(20) NULL DEFAULT NULL COMMENT 'eaten|refused|in_shed|not_fed|observed|completed'"),
        $c('wp_ir2_pece', 'zdroj', "VARCHAR(20) NULL DEFAULT NULL COMMENT 'qr|nfc|voice|planner|quick|manual|profile|bulk|import'"),
        $c('wp_ir2_pece', 'davka_id', "VARCHAR(40) NULL DEFAULT NULL COMMENT 'batch id: one Krmeni xN session'"),
        $c('wp_ir2_pece', 'skupina_id', 'INT UNSIGNED NULL DEFAULT NULL'),
        $c('wp_ir2_pece', 'krmivo', 'VARCHAR(190) NULL DEFAULT NULL'),
        $c('wp_ir2_pece', 'mnozstvi', 'DECIMAL(10,2) NULL DEFAULT NULL'),
        $c('wp_ir2_pece', 'suplement', 'VARCHAR(190) NULL DEFAULT NULL'),
        $c('wp_ir2_pece', 'planovac_id', 'INT UNSIGNED NULL DEFAULT NULL'),
        $c('wp_ir2_pece', 'vytvoreno', 'DATETIME NULL DEFAULT NULL'),
        $c('wp_ir2_pece', 'upraveno', 'DATETIME NULL DEFAULT NULL'),
        $c('wp_ir2_pece', 'autor_id', 'INT UNSIGNED NULL DEFAULT NULL'),
        $c('wp_ir2_pece', 'upravil_id', 'INT UNSIGNED NULL DEFAULT NULL'),
        $i('wp_ir2_pece', 'ir70_user_animal_type_date', 'user_id,zvire_id,typ,datum'),
        $i('wp_ir2_pece', 'ir70_user_batch', 'user_id,davka_id'),
        $i('wp_ir2_pece', 'ir70_user_date', 'user_id,datum'),
        $t('wp_ir2_pece_kos', "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, pece_id BIGINT UNSIGNED NOT NULL, zvire_id INT UNSIGNED NULL, row_json LONGTEXT NOT NULL, smazano DATETIME NOT NULL, smazal_id INT UNSIGNED NULL, obnoveno DATETIME NULL, PRIMARY KEY(id), KEY user_deleted(user_id,smazano), KEY pece(pece_id)"),
        $t('wp_ir2_event_batches', "id VARCHAR(40) NOT NULL, user_id INT UNSIGNED NOT NULL, typ VARCHAR(100) NOT NULL, datum DATETIME NOT NULL, zdroj VARCHAR(20) NULL, skupina_id INT UNSIGNED NULL, planovac_id INT UNSIGNED NULL, pocet INT UNSIGNED NOT NULL DEFAULT 0, souhrn_json TEXT NULL, poznamka TEXT NULL, vytvoreno DATETIME NOT NULL, upraveno DATETIME NULL, autor_id INT UNSIGNED NULL, PRIMARY KEY(id), KEY user_date(user_id,datum)"),
        // ------------------------------------------------------------------ audit
        $t('wp_ir2_audit', "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, account_id INT UNSIGNED NULL, actor_id INT UNSIGNED NULL, entity VARCHAR(60) NOT NULL, entity_id VARCHAR(64) NULL, action VARCHAR(60) NOT NULL, before_json LONGTEXT NULL, after_json LONGTEXT NULL, ip VARCHAR(64) NULL, created_at DATETIME NOT NULL, PRIMARY KEY(id), KEY account_date(account_id,created_at), KEY entity(entity,entity_id)"),
        // ------------------------------------------------------------------ animals / enclosures / taxonomy
        $c('wp_ir2_zvirata', 'qr_token', 'VARCHAR(24) NULL DEFAULT NULL'),
        $c('wp_ir2_zvirata', 'status_pred_archivaci', 'VARCHAR(60) NULL DEFAULT NULL'),
        $c('wp_ir2_zvirata', 'archivovano', 'DATETIME NULL DEFAULT NULL'),
        $c('wp_ir2_zvirata', 'prah_odmitnuti', 'TINYINT UNSIGNED NULL DEFAULT NULL'),
        $c('wp_ir2_zvirata', 'zamceno_kvota', 'TINYINT(1) NOT NULL DEFAULT 0'),
        $c('wp_ir2_zvirata', 'verejny_profil', 'TINYINT(1) NOT NULL DEFAULT 0'),
        $c('wp_ir2_zvirata', 'prodejni_cena', 'DECIMAL(12,2) NULL DEFAULT NULL'),
        $c('wp_ir2_zvirata', 'nocni_pokles', 'VARCHAR(80) NULL DEFAULT NULL'),
        $c('wp_ir2_zvirata', 'okno_pareni', 'VARCHAR(120) NULL DEFAULT NULL'),
        $i('wp_ir2_zvirata', 'ir70_qr', 'user_id,qr_token'),
        $c('wp_ir2_ubikace', 'qr_token', 'VARCHAR(24) NULL DEFAULT NULL'),
        $c('wp_ir2_ubikace', 'klon_zdroj_id', 'INT UNSIGNED NULL DEFAULT NULL'),
        $c('wp_ir2_ubikace', 'sirka_cm', 'DECIMAL(8,1) NULL DEFAULT NULL'),
        $c('wp_ir2_ubikace', 'hloubka_cm', 'DECIMAL(8,1) NULL DEFAULT NULL'),
        $c('wp_ir2_ubikace', 'vyska_cm', 'DECIMAL(8,1) NULL DEFAULT NULL'),
        $c('wp_ir2_ubikace', 'technika', 'TEXT NULL'),
        $c('wp_ir2_ubikace', 'pece_nastaveni', 'TEXT NULL'),
        $c('wp_ir2_ubikace', 'habitat_json', 'LONGTEXT NULL'),
        $c('wp_ir2_ubikace', 'archivovano', 'DATETIME NULL DEFAULT NULL'),
        $c('wp_ir2_ubikace', 'vytvoreno', 'DATETIME NULL DEFAULT NULL'),
        $c('wp_ir2_ubikace', 'upraveno', 'DATETIME NULL DEFAULT NULL'),
        $i('wp_ir2_ubikace', 'ir70_qr', 'user_id,qr_token'),
        $t('wp_ir2_taxon_aliases', "id INT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, druh_id INT UNSIGNED NOT NULL, alias VARCHAR(190) NOT NULL, typ VARCHAR(20) NOT NULL DEFAULT 'synonym' COMMENT 'synonym|common|trade|locality|morph', jazyk VARCHAR(5) NULL, PRIMARY KEY(id), KEY user_alias(user_id,alias), KEY druh(druh_id)"),
        // ------------------------------------------------------------------ users, roles, admin
        $c('wp_ir2__uzivatele', 'owner_user_id', 'INT UNSIGNED NULL DEFAULT NULL'),
        $c('wp_ir2__uzivatele', 'posledni_prihlaseni', 'DATETIME NULL DEFAULT NULL'),
        $c('wp_ir2__uzivatele', 'suspended_at', 'DATETIME NULL DEFAULT NULL'),
        $c('wp_ir2__uzivatele', 'suspend_reason', 'VARCHAR(255) NULL DEFAULT NULL'),
        $c('wp_ir2__uzivatele', 'session_version', 'INT UNSIGNED NOT NULL DEFAULT 0'),
        $t('wp_ir2_account_notes', "id INT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, author_id INT UNSIGNED NULL, note TEXT NOT NULL, created_at DATETIME NOT NULL, PRIMARY KEY(id), KEY user(user_id)"),
        $t('wp_ir2_feature_flags', "id INT UNSIGNED NOT NULL AUTO_INCREMENT, flag_key VARCHAR(80) NOT NULL, user_id INT UNSIGNED NOT NULL DEFAULT 0, enabled TINYINT(1) NOT NULL DEFAULT 1, updated_at DATETIME NOT NULL, PRIMARY KEY(id), UNIQUE KEY flag_user(flag_key,user_id)"),
        $t('wp_ir2_jobs', "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, job_type VARCHAR(60) NOT NULL, user_id INT UNSIGNED NULL, status VARCHAR(20) NOT NULL DEFAULT 'queued', payload TEXT NULL, attempts INT UNSIGNED NOT NULL DEFAULT 0, last_error TEXT NULL, run_after DATETIME NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(id), KEY status(status,run_after)"),
        $t('wp_ir2_backups', "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NULL, kind VARCHAR(20) NOT NULL DEFAULT 'export', file_name VARCHAR(190) NOT NULL, size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0, sha256 CHAR(64) NULL, status VARCHAR(20) NOT NULL DEFAULT 'ok', created_at DATETIME NOT NULL, PRIMARY KEY(id), KEY user_date(user_id,created_at)"),
        // ------------------------------------------------------------------ plans, entitlements, billing (provider neutral)
        $t('wp_ir2_plans', "code VARCHAR(30) NOT NULL, name VARCHAR(80) NOT NULL, price_month DECIMAL(10,2) NULL, price_year DECIMAL(10,2) NULL, price_lifetime DECIMAL(10,2) NULL, currency CHAR(3) NOT NULL DEFAULT 'CZK', max_animals INT UNSIGNED NULL COMMENT 'NULL = unlimited', max_users INT UNSIGNED NOT NULL DEFAULT 1, storage_mb INT UNSIGNED NOT NULL DEFAULT 200, features_json TEXT NOT NULL, allow_month TINYINT(1) NOT NULL DEFAULT 1, allow_year TINYINT(1) NOT NULL DEFAULT 1, allow_lifetime TINYINT(1) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1, sort_order INT NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY(code)"),
        $t('wp_ir2_subscriptions', "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, plan_code VARCHAR(30) NOT NULL, period VARCHAR(10) NOT NULL DEFAULT 'month' COMMENT 'month|year|lifetime|manual', provider VARCHAR(30) NOT NULL COMMENT 'revolut_web|apple_app_store|google_play|admin_manual', provider_customer_id VARCHAR(190) NULL, provider_subscription_id VARCHAR(190) NULL, status VARCHAR(20) NOT NULL COMMENT 'active|trialing|past_due|canceled|expired|refunded|pending', valid_from DATETIME NOT NULL, valid_until DATETIME NULL, cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0, note VARCHAR(255) NULL, created_by INT UNSIGNED NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(id), KEY user_status(user_id,status), KEY provider_sub(provider,provider_subscription_id)"),
        $t('wp_ir2_billing_orders', "id VARCHAR(40) NOT NULL, user_id INT UNSIGNED NOT NULL, plan_code VARCHAR(30) NOT NULL, period VARCHAR(10) NOT NULL, amount_minor BIGINT NOT NULL, currency CHAR(3) NOT NULL, provider VARCHAR(30) NOT NULL, provider_order_id VARCHAR(190) NULL, provider_customer_id VARCHAR(190) NULL, status VARCHAR(20) NOT NULL DEFAULT 'created', checkout_url TEXT NULL, subscription_id BIGINT UNSIGNED NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(id), KEY user(user_id), KEY provider_order(provider,provider_order_id)"),
        $t('wp_ir2_billing_payments', "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, order_id VARCHAR(40) NOT NULL, provider VARCHAR(30) NOT NULL, provider_payment_id VARCHAR(190) NULL, status VARCHAR(20) NOT NULL, amount_minor BIGINT NOT NULL, currency CHAR(3) NOT NULL, raw_json LONGTEXT NULL, created_at DATETIME NOT NULL, PRIMARY KEY(id), KEY order_id(order_id)"),
        $t('wp_ir2_billing_refunds', "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, order_id VARCHAR(40) NOT NULL, provider VARCHAR(30) NOT NULL, provider_refund_id VARCHAR(190) NULL, amount_minor BIGINT NOT NULL, status VARCHAR(20) NOT NULL, created_at DATETIME NOT NULL, PRIMARY KEY(id), KEY order_id(order_id)"),
        $t('wp_ir2_billing_webhooks', "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, provider VARCHAR(30) NOT NULL, event_id VARCHAR(190) NOT NULL, event_type VARCHAR(80) NULL, signature_ok TINYINT(1) NOT NULL DEFAULT 0, payload LONGTEXT NOT NULL, processed_at DATETIME NULL, error TEXT NULL, created_at DATETIME NOT NULL, PRIMARY KEY(id), UNIQUE KEY provider_event(provider,event_id)"),
        // ------------------------------------------------------------------ files (health attachments, documents)
        $t('wp_ir2_files', "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, entity VARCHAR(30) NOT NULL COMMENT 'health|animal|enclosure|finance', entity_id BIGINT UNSIGNED NOT NULL, kind VARCHAR(40) NULL, original_name VARCHAR(190) NOT NULL, stored_path VARCHAR(255) NOT NULL, mime VARCHAR(100) NOT NULL, size_bytes BIGINT UNSIGNED NOT NULL, sha256 CHAR(64) NOT NULL, note VARCHAR(255) NULL, created_at DATETIME NOT NULL, deleted_at DATETIME NULL, PRIMARY KEY(id), KEY entity(user_id,entity,entity_id)"),
        $c('wp_ir2_zdravi', 'kontrola_datum', 'DATE NULL DEFAULT NULL'),
        $c('wp_ir2_zdravi', 'upraveno', 'DATETIME NULL DEFAULT NULL'),
        // ------------------------------------------------------------------ Habitat Studio 4.2 server persistence
        $t('wp_ir2_habitat_docs', "id INT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, room_key VARCHAR(40) NOT NULL, name VARCHAR(190) NOT NULL, doc_json LONGTEXT NOT NULL, revision INT UNSIGNED NOT NULL DEFAULT 1, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(id), UNIQUE KEY user_room(user_id,room_key)"),
        $t('wp_ir2_habitat_assemblies', "id INT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, asm_key VARCHAR(64) NOT NULL, rack_id INT UNSIGNED NULL, name VARCHAR(190) NOT NULL, asm_json LONGTEXT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, deleted_at DATETIME NULL, PRIMARY KEY(id), UNIQUE KEY user_asm(user_id,asm_key), KEY rack(rack_id)"),
        // ------------------------------------------------------------------ inventory / finance
        $c('wp_ir2_sklad', 'cena_ks', 'DECIMAL(12,2) NULL DEFAULT NULL'),
        $c('wp_ir2_sklad', 'druh_skladu', "VARCHAR(20) NULL DEFAULT NULL COMMENT 'live|frozen|equipment|supplement|technical|custom'"),
        $c('wp_ir2_sklad', 'aliasy', 'VARCHAR(255) NULL DEFAULT NULL'),
        $c('wp_ir2_nakupni_list', 'sklad_id', 'INT UNSIGNED NULL DEFAULT NULL'),
        $c('wp_ir2_nakupni_list', 'cena_odhad', 'DECIMAL(12,2) NULL DEFAULT NULL'),
        $t('wp_ir2_finance_lines', "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, finance_id INT UNSIGNED NOT NULL, item VARCHAR(190) NOT NULL, qty DECIMAL(12,3) NOT NULL DEFAULT 1, unit VARCHAR(20) NULL, unit_price DECIMAL(12,2) NOT NULL DEFAULT 0, discount_pct DECIMAL(5,2) NULL, vat_pct DECIMAL(5,2) NULL, subtotal DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL DEFAULT 0, cost DECIMAL(12,2) NULL, sort_order INT NOT NULL DEFAULT 0, PRIMARY KEY(id), KEY fin(user_id,finance_id)"),
        $c('wp_ir2_finance', 'upraveno', 'DATETIME NULL DEFAULT NULL'),
    ];
}

/** Default plan matrix (admin-editable afterwards; inserted only when the code does not exist yet). */
function ir_default_plans(): array {
    $f = static fn(array $on) => json_encode(array_fill_keys($on, true));
    $core = ['animals', 'enclosures', 'care_history', 'planner_basic', 'qr', 'documents_basic', 'export'];
    $premium = array_merge($core, ['planner_advanced', 'automation', 'reproduction', 'genetics', 'supplements', 'inventory', 'reports', 'habitat_planner', 'habitat_assembly', 'documents_extended', 'voice']);
    $pro = array_merge($premium, ['habitat_showcase', 'habitat_techplan', 'automation_advanced', 'finance', 'public_sales', 'exports_advanced', 'backups', 'multi_user', 'priority_support']);
    return [
        ['code' => 'free', 'name' => 'Free', 'price_month' => 0, 'price_year' => 0, 'price_lifetime' => null, 'max_animals' => 10, 'max_users' => 1, 'storage_mb' => 200, 'features' => $f($core), 'allow_month' => 1, 'allow_year' => 1, 'allow_lifetime' => 0, 'sort' => 10],
        ['code' => 'premium', 'name' => 'Premium', 'price_month' => 129, 'price_year' => 1290, 'price_lifetime' => null, 'max_animals' => 100, 'max_users' => 1, 'storage_mb' => 2048, 'features' => $f($premium), 'allow_month' => 1, 'allow_year' => 1, 'allow_lifetime' => 0, 'sort' => 20],
        ['code' => 'pro', 'name' => 'Pro / Breeder', 'price_month' => 249, 'price_year' => 2490, 'price_lifetime' => null, 'max_animals' => null, 'max_users' => 3, 'storage_mb' => 10240, 'features' => $f($pro), 'allow_month' => 1, 'allow_year' => 1, 'allow_lifetime' => 0, 'sort' => 30],
        ['code' => 'platinum', 'name' => 'Platinum Lifetime', 'price_month' => null, 'price_year' => null, 'price_lifetime' => 7990, 'max_animals' => null, 'max_users' => 3, 'storage_mb' => 10240, 'features' => $f($pro), 'allow_month' => 0, 'allow_year' => 0, 'allow_lifetime' => 1, 'sort' => 40],
    ];
}

function ir_schema_column_exists(PDO $pdo, string $table, string $column): bool {
    $q = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?');
    $q->execute([$table, $column]);
    return (int)$q->fetchColumn() > 0;
}
function ir_schema_table_exists(PDO $pdo, string $table): bool {
    $q = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?');
    $q->execute([$table]);
    return (int)$q->fetchColumn() > 0;
}
function ir_schema_index_exists(PDO $pdo, string $table, string $index): bool {
    $q = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?');
    $q->execute([$table, $index]);
    return (int)$q->fetchColumn() > 0;
}

/** What the database still lacks (integrity page + preflight). */
function ir_schema_beta1_missing(PDO $pdo): array {
    $missing = [];
    foreach (ir_schema_beta1_steps() as $s) {
        if ($s['kind'] === 'table' && !ir_schema_table_exists($pdo, $s['table'])) $missing[] = 'table '.$s['table'];
        elseif ($s['kind'] === 'column' && ir_schema_table_exists($pdo, $s['table']) && !ir_schema_column_exists($pdo, $s['table'], $s['column'])) $missing[] = 'column '.$s['table'].'.'.$s['column'];
        elseif ($s['kind'] === 'column' && !ir_schema_table_exists($pdo, $s['table'])) $missing[] = 'table '.$s['table'].' (required by column '.$s['column'].')';
    }
    return array_values(array_unique($missing));
}

/**
 * Apply the migration. DDL auto-commits in MySQL, so each step is independent and re-runnable; a failed
 * step stops the run and is reported (nothing is dropped, previous steps stay applied, re-run continues).
 */
function ir_schema_beta1_apply(PDO $pdo): array {
    $log = [];
    $pdo->exec("CREATE TABLE IF NOT EXISTS wp_ir2_schema_migrations (id INT UNSIGNED NOT NULL AUTO_INCREMENT,migration VARCHAR(190) NOT NULL,notes TEXT NULL,applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),UNIQUE KEY uq_migration(migration)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    foreach (ir_schema_beta1_steps() as $s) {
        $done = match ($s['kind']) {
            'table' => ir_schema_table_exists($pdo, $s['table']),
            'column' => !ir_schema_table_exists($pdo, $s['table']) || ir_schema_column_exists($pdo, $s['table'], $s['column']),
            'index' => !ir_schema_table_exists($pdo, $s['table']) || ir_schema_index_exists($pdo, $s['table'], $s['index']),
        };
        if ($done) continue;
        $pdo->exec($s['sql']);
        $log[] = $s['kind'].' '.$s['table'].(isset($s['column']) ? '.'.$s['column'] : (isset($s['index']) ? ' index '.$s['index'] : ''));
    }
    // seed default plans (never overwrite admin edits)
    $ins = $pdo->prepare('INSERT IGNORE INTO wp_ir2_plans(code,name,price_month,price_year,price_lifetime,currency,max_animals,max_users,storage_mb,features_json,allow_month,allow_year,allow_lifetime,active,sort_order,updated_at) VALUES(?,?,?,?,?,\'CZK\',?,?,?,?,?,?,?,1,?,NOW())');
    foreach (ir_default_plans() as $p) $ins->execute([$p['code'], $p['name'], $p['price_month'], $p['price_year'], $p['price_lifetime'], $p['max_animals'], $p['max_users'], $p['storage_mb'], $p['features'], $p['allow_month'], $p['allow_year'], $p['allow_lifetime'], $p['sort']]);
    // backfill: result of historical feeding records (non-destructive, only NULL values)
    if (ir_schema_column_exists($pdo, 'wp_ir2_pece', 'vysledek')) {
        $pdo->exec("UPDATE wp_ir2_pece SET vysledek='eaten' WHERE vysledek IS NULL AND typ='Krmení'");
        $pdo->exec("UPDATE wp_ir2_pece SET vysledek='refused' WHERE vysledek IS NULL AND typ='Odmítnutí potravy'");
        $pdo->exec("UPDATE wp_ir2_pece SET vytvoreno=datum WHERE vytvoreno IS NULL");
    }
    // roles: existing 'admin' stays admin; the original installation owner becomes superadmin once
    if (!ir_scalar_safe($pdo, "SELECT COUNT(*) FROM wp_ir2__uzivatele WHERE role='superadmin'")) {
        $pdo->exec("UPDATE wp_ir2__uzivatele SET role='superadmin' WHERE role='admin' ORDER BY id LIMIT 1");
    }
    $pdo->prepare('INSERT IGNORE INTO wp_ir2_schema_migrations(migration,notes) VALUES(?,?)')->execute([IR_SCHEMA_VERSION, 'BETA 1.0 FINAL: unified events, audit, groups, taxonomy aliases, roles/plans/billing, files, Habitat 4.2 server persistence, finance lines. Additive only.']);
    return $log;
}
function ir_scalar_safe(PDO $pdo, string $sql): int { try { return (int)$pdo->query($sql)->fetchColumn(); } catch (Throwable) { return 0; } }

/** Plain SQL of the same migration for manual application (MySQL 8 / MariaDB 10.4+, no IF NOT EXISTS on columns needed). */
function ir_schema_beta1_sql(): string {
    $q = static fn(string $s) => str_replace("'", "''", $s);
    $out = ["-- IR Manager BETA 1.0 FINAL — safe additive migration ".IR_SCHEMA_VERSION,
        "-- Additive and idempotent: every step checks information_schema first. No DROP, no TRUNCATE, no data rewrite",
        "-- except filling NEW NULL columns. Touches only wp_ir2_* tables. Safe to run more than once.",
        "-- Run against the IR Manager database (the same one as config.local.php db_name).", "",
        "SET NAMES utf8mb4;", ""];
    foreach (ir_schema_beta1_steps() as $s) {
        $cond = match ($s['kind']) {
            'table' => "(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='{$s['table']}')=0",
            'column' => "(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='{$s['table']}')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='{$s['table']}' AND COLUMN_NAME='{$s['column']}')=0",
            'index' => "(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='{$s['table']}')=1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='{$s['table']}' AND INDEX_NAME='{$s['index']}')=0",
        };
        $label = $s['kind'].' '.$s['table'].(isset($s['column']) ? '.'.$s['column'] : (isset($s['index']) ? ' index '.$s['index'] : ''));
        $out[] = "-- {$label}";
        $out[] = "SET @ir_sql := IF({$cond}, '".$q($s['sql'])."', 'SELECT 1');";
        $out[] = "PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;";
    }
    $out[] = "";
    $out[] = "-- default plan matrix (INSERT IGNORE: admin edits are never overwritten)";
    foreach (ir_default_plans() as $p) {
        $v = static fn($x) => $x === null ? 'NULL' : (is_string($x) ? "'".$q($x)."'" : (string)$x);
        $out[] = "INSERT IGNORE INTO wp_ir2_plans(code,name,price_month,price_year,price_lifetime,currency,max_animals,max_users,storage_mb,features_json,allow_month,allow_year,allow_lifetime,active,sort_order,updated_at) VALUES("
            .implode(',', [$v($p['code']), $v($p['name']), $v($p['price_month']), $v($p['price_year']), $v($p['price_lifetime']), "'CZK'", $v($p['max_animals']), $v($p['max_users']), $v($p['storage_mb']), $v($p['features']), $v($p['allow_month']), $v($p['allow_year']), $v($p['allow_lifetime']), '1', $v($p['sort']), 'NOW()']).");";
    }
    $out[] = "";
    $out[] = "-- backfill only NEW columns (NULL values) of historical records";
    $out[] = "UPDATE wp_ir2_pece SET vysledek='eaten' WHERE vysledek IS NULL AND typ='Krmení';";
    $out[] = "UPDATE wp_ir2_pece SET vysledek='refused' WHERE vysledek IS NULL AND typ='Odmítnutí potravy';";
    $out[] = "UPDATE wp_ir2_pece SET vytvoreno=datum WHERE vytvoreno IS NULL;";
    $out[] = "-- the first existing administrator becomes SUPERADMIN (only when no superadmin exists yet)";
    $out[] = "SET @ir_has_super := (SELECT COUNT(*) FROM wp_ir2__uzivatele WHERE role='superadmin');";
    $out[] = "SET @ir_sql := IF(@ir_has_super=0, 'UPDATE wp_ir2__uzivatele SET role=''superadmin'' WHERE role=''admin'' ORDER BY id LIMIT 1', 'SELECT 1');";
    $out[] = "PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;";
    $out[] = "CREATE TABLE IF NOT EXISTS wp_ir2_schema_migrations (id INT UNSIGNED NOT NULL AUTO_INCREMENT,migration VARCHAR(190) NOT NULL,notes TEXT NULL,applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),UNIQUE KEY uq_migration(migration)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $out[] = "INSERT IGNORE INTO wp_ir2_schema_migrations(migration,notes) VALUES('".IR_SCHEMA_VERSION."','BETA 1.0 FINAL additive migration (manual SQL).');";
    return implode("\n", $out)."\n";
}
