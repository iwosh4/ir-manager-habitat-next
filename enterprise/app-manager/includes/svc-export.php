<?php
declare(strict_types=1);
require_once __DIR__.'/schema-beta1.php';

/*
 * DATA SAFETY — account export (JSON / ZIP with media manifest), integrity report, daily backup job.
 * Everything is account-scoped: only wp_ir2_* tables with a user_id column are exported, filtered by the
 * account id. Nothing here deletes user data; backup retention only removes old backup ZIP files.
 */

/** All wp_ir2_* tables that carry per-account rows (discovered, so new modules are included automatically). */
function ir_export_tables(PDO $pdo): array {
    static $tables = null;
    if ($tables !== null) return $tables;
    $tables = [];
    try {
        $st = $pdo->query("SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
            WHERE c.table_schema=DATABASE() AND c.column_name='user_id' AND c.table_name LIKE 'wp\\_ir2\\_%' AND t.table_type='BASE TABLE' ORDER BY c.table_name");
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) ?: [] as $t) if (preg_match('~^wp_ir2_[a-z0-9_]+$~', (string)$t)) $tables[] = (string)$t;
    } catch (Throwable) {}
    return $tables;
}

/** Full JSON-serialisable export of one account. Password hashes / sessions are never exported. */
function ir_export_account(PDO $pdo, int $uid): array {
    $out = ['format' => 'ir-manager-export', 'format_version' => 2, 'app_version' => IR_APP_VERSION, 'schema' => IR_SCHEMA_VERSION, 'exported_at' => date('c'), 'account_id' => $uid, 'tables' => [], 'counts' => []];
    foreach (ir_export_tables($pdo) as $t) {
        $st = $pdo->prepare("SELECT * FROM `$t` WHERE user_id=?"); $st->execute([$uid]);
        $rows = $st->fetchAll() ?: [];
        $out['tables'][$t] = $rows; $out['counts'][$t] = count($rows);
    }
    $u = $pdo->prepare('SELECT id,jmeno,email,role,created_at FROM wp_ir2__uzivatele WHERE id=?');
    try { $u->execute([$uid]); $out['account'] = $u->fetch() ?: null; } catch (Throwable) { $out['account'] = null; }
    $out['media'] = ir_export_media_manifest($pdo, $uid);
    return $out;
}

/** Every file that belongs to the account (photos, pedigrees, attachments) with size + sha256. */
function ir_export_media_manifest(PDO $pdo, int $uid): array {
    $m = [];
    foreach (['animals', 'profile', 'pedigree'] as $d) {
        $dir = IR_ROOT.'/uploads/'.$d.'/'.$uid;
        if (!is_dir($dir)) continue;
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $f) {
            if (!$f->isFile()) continue;
            $rel = 'uploads/'.$d.'/'.$uid.'/'.ltrim(str_replace('\\', '/', substr($f->getPathname(), strlen($dir))), '/');
            $m[] = ['path' => $rel, 'bytes' => $f->getSize(), 'sha256' => hash_file('sha256', $f->getPathname())];
        }
    }
    if (ir_table_exists($pdo, 'wp_ir2_files')) {
        $st = $pdo->prepare('SELECT stored_path,size_bytes,sha256,original_name FROM wp_ir2_files WHERE user_id=? AND deleted_at IS NULL'); $st->execute([$uid]);
        foreach ($st->fetchAll() ?: [] as $r) $m[] = ['path' => (string)$r['stored_path'], 'bytes' => (int)$r['size_bytes'], 'sha256' => (string)$r['sha256'], 'name' => (string)$r['original_name']];
    }
    return $m;
}

/** Write a ZIP (data.json + manifest + media) to $dest. Returns stats. */
function ir_export_zip(PDO $pdo, int $uid, string $dest, bool $withMedia = true): array {
    if (!class_exists('ZipArchive')) throw new RuntimeException('Na serveru chybí rozšíření ZipArchive — použijte export JSON.');
    $data = ir_export_account($pdo, $uid);
    $zip = new ZipArchive();
    if ($zip->open($dest, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Export ZIP nelze vytvořit.');
    $zip->addFromString('data.json', json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE));
    $zip->addFromString('media-manifest.json', json_encode($data['media'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    $zip->addFromString('README.txt', "IR Manager — export účtu {$uid}\nVytvořeno: {$data['exported_at']}\nVerze schématu: {$data['schema']}\n\ndata.json obsahuje všechny záznamy účtu (tabulka → řádky).\nmedia/ obsahuje fotografie a přílohy; media-manifest.json jejich SHA-256.\n");
    $n = 0; $missing = 0;
    if ($withMedia) foreach ($data['media'] as $f) {
        $abs = IR_ROOT.'/'.$f['path'];
        if (is_file($abs)) { $zip->addFile($abs, 'media/'.$f['path']); $n++; } else $missing++;
    }
    $zip->close();
    return ['bytes' => (int)filesize($dest), 'tables' => count($data['tables']), 'rows' => array_sum($data['counts']), 'media' => $n, 'media_missing' => $missing, 'sha256' => hash_file('sha256', $dest)];
}

/**
 * Integrity report: orphans, broken references, missing files, schema state. Read-only.
 * Each check: [key, label, count, severity ok|warn|error, sample ids].
 */
function ir_integrity_report(PDO $pdo, int $uid): array {
    $checks = [];
    $add = static function (string $key, string $label, string $sql, array $params, string $sev) use ($pdo, &$checks): void {
        try { $st = $pdo->prepare($sql); $st->execute($params); $ids = $st->fetchAll(PDO::FETCH_COLUMN) ?: []; }
        catch (Throwable $e) { $checks[] = ['key' => $key, 'label' => $label, 'count' => 0, 'severity' => 'warn', 'sample' => [], 'error' => $e->getMessage()]; return; }
        $checks[] = ['key' => $key, 'label' => $label, 'count' => count($ids), 'severity' => $ids ? $sev : 'ok', 'sample' => array_slice($ids, 0, 10)];
    };
    $add('events_orphan', 'Záznamy péče bez existujícího zvířete', 'SELECT p.id FROM wp_ir2_pece p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE p.user_id=? AND z.id IS NULL', [$uid], 'error');
    $add('events_future', 'Záznamy péče s datem v budoucnosti', 'SELECT id FROM wp_ir2_pece WHERE user_id=? AND datum>CURDATE()', [$uid], 'warn');
    $add('animals_bad_enclosure', 'Zvířata v neexistujícím terárku', 'SELECT z.id FROM wp_ir2_zvirata z LEFT JOIN wp_ir2_ubikace u ON u.id=z.ubikace_id AND u.user_id=z.user_id WHERE z.user_id=? AND z.ubikace_id IS NOT NULL AND z.ubikace_id>0 AND u.id IS NULL', [$uid], 'error');
    $add('group_members_orphan', 'Členové skupin bez zvířete', 'SELECT m.id FROM wp_ir2_skupiny_clenove m LEFT JOIN wp_ir2_zvirata z ON z.id=m.zvire_id AND z.user_id=m.user_id WHERE m.user_id=? AND z.id IS NULL', [$uid], 'error');
    $add('planner_orphan', 'Úkoly plánovače pro neexistující zvíře', 'SELECT p.id FROM wp_ir2_planovac p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE p.user_id=? AND p.zvire_id IS NOT NULL AND p.zvire_id>0 AND z.id IS NULL', [$uid], 'warn');
    $add('health_orphan', 'Zdravotní záznamy bez zvířete', 'SELECT h.id FROM wp_ir2_zdravi h LEFT JOIN wp_ir2_zvirata z ON z.id=h.zvire_id AND z.user_id=h.user_id WHERE h.user_id=? AND z.id IS NULL', [$uid], 'error');
    $add('animals_no_species', 'Zvířata bez druhu', "SELECT id FROM wp_ir2_zvirata WHERE user_id=? AND (druh IS NULL OR druh='')", [$uid], 'warn');
    $add('stock_negative', 'Skladové položky se záporným množstvím', 'SELECT id FROM wp_ir2_sklad WHERE user_id=? AND mnozstvi<0', [$uid], 'warn');
    // missing files
    $missing = [];
    if (ir_table_exists($pdo, 'wp_ir2_files')) {
        $st = $pdo->prepare('SELECT id,stored_path FROM wp_ir2_files WHERE user_id=? AND deleted_at IS NULL'); $st->execute([$uid]);
        foreach ($st->fetchAll() ?: [] as $r) if (!is_file(IR_ROOT.'/'.$r['stored_path'])) $missing[] = (int)$r['id'];
    }
    try {
        $st = $pdo->prepare("SELECT id,soubor FROM wp_ir2_zvire_fotky WHERE user_id=?"); $st->execute([$uid]);
        foreach ($st->fetchAll() ?: [] as $r) { $p = (string)$r['soubor']; if ($p !== '' && !preg_match('~^https?://~', $p) && !is_file(IR_ROOT.'/'.ltrim($p, '/'))) $missing[] = 'foto:'.$r['id']; }
    } catch (Throwable) {}
    $checks[] = ['key' => 'files_missing', 'label' => 'Soubory evidované v databázi, ale chybějící na disku', 'count' => count($missing), 'severity' => $missing ? 'error' : 'ok', 'sample' => array_slice($missing, 0, 10)];
    require_once __DIR__.'/schema-beta1.php';
    $schemaMissing = ir_schema_beta1_missing($pdo);
    $checks[] = ['key' => 'schema', 'label' => 'Chybějící části databázového schématu', 'count' => count($schemaMissing), 'severity' => $schemaMissing ? 'error' : 'ok', 'sample' => array_slice($schemaMissing, 0, 10)];
    $counts = [];
    foreach (['wp_ir2_zvirata' => 'Zvířata', 'wp_ir2_pece' => 'Záznamy péče', 'wp_ir2_planovac' => 'Úkoly', 'wp_ir2_ubikace' => 'Terária', 'wp_ir2_skupiny' => 'Skupiny', 'wp_ir2_zdravi' => 'Zdraví', 'wp_ir2_sklad' => 'Sklad', 'wp_ir2_finance' => 'Finance'] as $t => $l) $counts[$l] = (int)ir_scalar($pdo, "SELECT COUNT(*) FROM `$t` WHERE user_id=?", [$uid], 0);
    $trash = ir_table_exists($pdo, 'wp_ir2_pece_kos') ? (int)ir_scalar($pdo, 'SELECT COUNT(*) FROM wp_ir2_pece_kos WHERE user_id=? AND obnoveno IS NULL', [$uid], 0) : 0;
    $archived = (int)ir_scalar($pdo, 'SELECT COUNT(*) FROM wp_ir2_zvirata WHERE user_id=? AND archivovano IS NOT NULL', [$uid], 0);
    $last = ir_table_exists($pdo, 'wp_ir2_backups') ? ir_scalar($pdo, "SELECT MAX(created_at) FROM wp_ir2_backups WHERE user_id=? AND status='ok'", [$uid], null) : null;
    $worst = 'ok'; foreach ($checks as $c) { if ($c['severity'] === 'error') { $worst = 'error'; break; } if ($c['severity'] === 'warn') $worst = 'warn'; }
    return ['status' => $worst, 'checks' => $checks, 'counts' => $counts, 'trash' => $trash, 'archived_animals' => $archived, 'last_backup' => $last, 'schema_version' => IR_SCHEMA_VERSION, 'generated_at' => date('c')];
}

/** Backup storage (outside web access: storage/backups, deny-all .htaccess). */
function ir_backup_dir(): string {
    $d = IR_ROOT.'/storage/backups';
    if (!is_dir($d)) @mkdir($d, 0750, true);
    if (is_dir(IR_ROOT.'/storage') && !is_file(IR_ROOT.'/storage/.htaccess')) @file_put_contents(IR_ROOT.'/storage/.htaccess', "Options -Indexes\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n");
    return $d;
}
/** Create one account backup ZIP (data only, media referenced by manifest) and log it. */
function ir_backup_account(PDO $pdo, int $uid, string $kind = 'daily'): array {
    $dir = ir_backup_dir().'/'.$uid;
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) throw new RuntimeException('Adresář záloh nelze vytvořit.');
    $file = $dir.'/'.date('Ymd-His').'-'.$kind.'.zip';
    try {
        $s = ir_export_zip($pdo, $uid, $file, false);
        $pdo->prepare("INSERT INTO wp_ir2_backups(user_id,kind,file_name,size_bytes,sha256,status,created_at) VALUES(?,?,?,?,?,'ok',NOW())")->execute([$uid, $kind, substr($file, strlen(IR_ROOT) + 1), $s['bytes'], $s['sha256']]);
        return $s + ['path' => $file];
    } catch (Throwable $e) {
        try { $pdo->prepare("INSERT INTO wp_ir2_backups(user_id,kind,file_name,size_bytes,sha256,status,error,created_at) VALUES(?,?,?,0,NULL,'failed',?,NOW())")->execute([$uid, $kind, substr($file, strlen(IR_ROOT) + 1), mb_substr($e->getMessage(), 0, 500)]); } catch (Throwable) {}
        if (function_exists('ir_job_fail')) ir_job_fail($pdo, 'backup', $e->getMessage(), ['user_id' => $uid]);
        throw $e;
    }
}
/** Retention: keep the newest $keep daily backups per account (older ZIP files removed, log rows kept). */
function ir_backup_retention(PDO $pdo, int $uid, int $keep = 14): int {
    $st = $pdo->prepare("SELECT id,file_name FROM wp_ir2_backups WHERE user_id=? AND kind='daily' AND status='ok' ORDER BY created_at DESC, id DESC"); $st->execute([$uid]);
    $rows = $st->fetchAll() ?: []; $removed = 0;
    foreach (array_slice($rows, $keep) as $r) {
        $abs = IR_ROOT.'/'.$r['file_name'];
        if (is_file($abs) && str_starts_with(realpath($abs) ?: '', realpath(ir_backup_dir()) ?: "\0")) { @unlink($abs); $removed++; }
        $pdo->prepare("UPDATE wp_ir2_backups SET status='expired' WHERE id=?")->execute([(int)$r['id']]);
    }
    return $removed;
}
/** Daily job for all active accounts (cron: php cron.php backup). */
function ir_backup_daily_all(PDO $pdo, int $keep = 14): array {
    $ids = $pdo->query("SELECT id FROM wp_ir2__uzivatele WHERE COALESCE(is_active,1)=1 AND (owner_user_id IS NULL OR owner_user_id=0)")->fetchAll(PDO::FETCH_COLUMN) ?: [];
    $ok = 0; $fail = 0;
    foreach ($ids as $id) {
        $done = (int)ir_scalar($pdo, "SELECT COUNT(*) FROM wp_ir2_backups WHERE user_id=? AND kind='daily' AND status='ok' AND created_at>=CURDATE()", [(int)$id], 0);
        if ($done) continue;
        try { ir_backup_account($pdo, (int)$id, 'daily'); ir_backup_retention($pdo, (int)$id, $keep); $ok++; } catch (Throwable) { $fail++; }
    }
    return ['ok' => $ok, 'failed' => $fail];
}
