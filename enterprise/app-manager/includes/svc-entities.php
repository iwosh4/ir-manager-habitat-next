<?php
declare(strict_types=1);

/*
 * ENTITY SERVICE — animals and enclosures lifecycle.
 *  - Enclosure clone (BETA1-08): N copies of an enclosure incl. dimensions, climate, technique, care rules and
 *    Habitat furnishing (habitat_json). Animals, QR token, history and Habitat instance ids are NOT copied.
 *  - Soft delete / archive: animals and enclosures are archived (archivovano + previous status), never
 *    hard-deleted from the normal UI. Restore brings them back exactly as they were.
 */

/** Next free "<base> (n)" style name for clones. */
function ir_clone_name(PDO $pdo, int $uid, string $base, int $n): string {
    $base = preg_replace('~\s*\(\d+\)\s*$~u', '', trim($base)) ?: 'Ubikace';
    for ($i = $n; $i < $n + 500; $i++) {
        $name = $base.' ('.$i.')';
        if (!(int)ir_scalar($pdo, 'SELECT COUNT(*) FROM wp_ir2_ubikace WHERE user_id=? AND nazev=?', [$uid, $name], 0)) return $name;
    }
    return $base.' ('.bin2hex(random_bytes(2)).')';
}

/**
 * Clone an enclosure $count times. $o = [names[] (optional explicit names), rack_id (override), keep_rack(bool, default true)]
 * Returns the new ids. All-or-nothing (transaction).
 */
function ir_enclosure_clone(PDO $pdo, int $uid, int $sourceId, int $count = 1, array $o = []): array {
    $count = max(1, min(50, $count));
    $q = $pdo->prepare('SELECT * FROM wp_ir2_ubikace WHERE user_id=? AND id=? LIMIT 1'); $q->execute([$uid, $sourceId]);
    $src = $q->fetch();
    if (!$src) throw new RuntimeException('Zdrojová ubikace nebyla nalezena.');
    $skip = ['id', 'qr_token', 'klon_zdroj_id', 'archivovano', 'vytvoreno', 'upraveno', 'habitat_instance_id', 'habitat_template_id', 'grid_row', 'grid_col', 'nazev'];
    $cols = array_values(array_filter(array_keys($src), static fn($c) => !in_array($c, $skip, true) && !is_int($c)));
    $hasClone = array_key_exists('klon_zdroj_id', $src);
    $own = !$pdo->inTransaction(); if ($own) $pdo->beginTransaction();
    try {
        $ids = [];
        $names = array_values(array_filter(array_map('trim', (array)($o['names'] ?? []))));
        for ($i = 0; $i < $count; $i++) {
            $row = [];
            foreach ($cols as $c) $row[$c] = $src[$c];
            if (array_key_exists('rack_id', $o)) $row['rack_id'] = $o['rack_id'] ?: null;
            elseif (($o['keep_rack'] ?? true) === false) $row['rack_id'] = null;
            if (isset($row['habitat_json']) && $row['habitat_json']) {
                // furnishing is copied, but instance identity is always new
                $h = json_decode((string)$row['habitat_json'], true);
                if (is_array($h)) { unset($h['instanceId'], $h['id'], $h['managerId']); $row['habitat_json'] = json_encode($h, JSON_UNESCAPED_UNICODE); }
            }
            $name = $names[$i] ?? ir_clone_name($pdo, $uid, (string)$src['nazev'], $i + 2);
            $fields = array_merge(['nazev'], array_keys($row), $hasClone ? ['klon_zdroj_id', 'vytvoreno'] : []);
            $vals = array_merge([mb_substr($name, 0, 120)], array_values($row), $hasClone ? [$sourceId, date('Y-m-d H:i:s')] : []);
            $pdo->prepare('INSERT INTO wp_ir2_ubikace(`'.implode('`,`', $fields).'`) VALUES('.implode(',', array_fill(0, count($fields), '?')).')')->execute($vals);
            $newId = (int)$pdo->lastInsertId();
            // care rules (spraying, cleaning …)
            if (ir_table_exists($pdo, 'wp_ir2_ubikace_pravidla')) {
                $r = $pdo->prepare('SELECT typ,interval_dni,aktivni FROM wp_ir2_ubikace_pravidla WHERE user_id=? AND ubikace_id=?'); $r->execute([$uid, $sourceId]);
                foreach ($r->fetchAll() ?: [] as $rule) $pdo->prepare('INSERT INTO wp_ir2_ubikace_pravidla(user_id,ubikace_id,typ,interval_dni,aktivni,upraveno) VALUES(?,?,?,?,?,NOW())')->execute([$uid, $newId, $rule['typ'], $rule['interval_dni'], $rule['aktivni']]);
            }
            if (ir_table_exists($pdo, 'wp_ir2_habitat_geometry_74')) {
                try { $pdo->prepare('INSERT IGNORE INTO wp_ir2_habitat_geometry_74(user_id,habitat_id,shape,width_cm,depth_cm,height_cm) SELECT user_id,?,shape,width_cm,depth_cm,height_cm FROM wp_ir2_habitat_geometry_74 WHERE user_id=? AND habitat_id=?')->execute([$newId, $uid, $sourceId]); } catch (Throwable) {}
            }
            ir_audit($pdo, 'enclosure', $newId, 'clone', null, ['source' => $sourceId, 'name' => $name]);
            $ids[] = $newId;
        }
        if ($own) $pdo->commit();
        return $ids;
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}

/** Archive (soft delete) an enclosure. Occupied enclosures must be emptied first. */
function ir_enclosure_archive(PDO $pdo, int $uid, int $id): void {
    $occupied = (int)ir_scalar($pdo, 'SELECT COUNT(*) FROM wp_ir2_zvirata z WHERE z.user_id=? AND z.ubikace_id=? AND '.ir_status_active_sql('z'), [$uid, $id], 0);
    if ($occupied) throw new RuntimeException('Obsazenou ubikaci nelze archivovat. Nejprve přesuňte zvířata.');
    $st = $pdo->prepare('UPDATE wp_ir2_ubikace SET archivovano=NOW() WHERE user_id=? AND id=? AND archivovano IS NULL'); $st->execute([$uid, $id]);
    if (!$st->rowCount()) throw new RuntimeException('Ubikace nebyla nalezena.');
    ir_audit($pdo, 'enclosure', $id, 'archive');
}
function ir_enclosure_restore(PDO $pdo, int $uid, int $id): void {
    $pdo->prepare('UPDATE wp_ir2_ubikace SET archivovano=NULL WHERE user_id=? AND id=?')->execute([$uid, $id]);
    ir_audit($pdo, 'enclosure', $id, 'restore');
}
/** SQL condition for live enclosures (archive column may not exist before migration). */
function ir_enclosure_live_sql(PDO $pdo, string $alias = 'u'): string {
    static $has = null; $has ??= ir_db_column_exists($pdo, 'wp_ir2_ubikace', 'archivovano');
    return $has ? "{$alias}.archivovano IS NULL" : '1=1';
}

/**
 * Archive an animal (soft delete). Keeps all history; the previous breeding status is stored so restore is
 * exact. Archived animals don't count to the plan quota and their open planner tasks are paused (Zrušeno).
 */
function ir_animal_archive(PDO $pdo, int $uid, int $id, string $reason = 'Archiv'): void {
    $a = ir_animal($pdo, $uid, $id);
    if (!$a) throw new RuntimeException('Zvíře nebylo nalezeno.');
    if (!empty($a['archivovano'])) return;
    $status = in_array($reason, ['Prodáno', 'Uhynulo', 'Archiv'], true) ? $reason : 'Archiv';
    $own = !$pdo->inTransaction(); if ($own) $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE wp_ir2_zvirata SET status_pred_archivaci=?, status_chovu=?, archivovano=NOW() WHERE user_id=? AND id=?')->execute([(string)($a['status_chovu'] ?? 'Aktivní'), $status, $uid, $id]);
        $pdo->prepare("UPDATE wp_ir2_planovac SET stav='Zrušeno', poznamka=CONCAT(COALESCE(poznamka,''),' [IR-ARCHIVED]') WHERE user_id=? AND zvire_id=? AND stav='Aktivní'")->execute([$uid, $id]);
        ir_audit($pdo, 'animal', $id, 'archive', ['status' => $a['status_chovu']], ['status' => $status]);
        if ($own) $pdo->commit();
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}
function ir_animal_restore(PDO $pdo, int $uid, int $id): void {
    $a = ir_animal($pdo, $uid, $id);
    if (!$a) throw new RuntimeException('Zvíře nebylo nalezeno.');
    if ($block = ir_animal_quota_block($pdo, $uid, 1)) throw new RuntimeException($block);
    $own = !$pdo->inTransaction(); if ($own) $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE wp_ir2_zvirata SET status_chovu=COALESCE(NULLIF(status_pred_archivaci,''),'Aktivní'), status_pred_archivaci=NULL, archivovano=NULL WHERE user_id=? AND id=?")->execute([$uid, $id]);
        $pdo->prepare("UPDATE wp_ir2_planovac SET stav='Aktivní', poznamka=REPLACE(poznamka,' [IR-ARCHIVED]','') WHERE user_id=? AND zvire_id=? AND stav='Zrušeno' AND poznamka LIKE '%[IR-ARCHIVED]%'")->execute([$uid, $id]);
        ir_audit($pdo, 'animal', $id, 'restore');
        if ($own) $pdo->commit();
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}
