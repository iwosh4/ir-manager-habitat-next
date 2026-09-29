<?php
declare(strict_types=1);

/*
 * HABITAT STUDIO 4.2 ↔ IR MANAGER bridge (server persistence is authoritative).
 *
 *   Manager enclosure (wp_ir2_ubikace)  ⇄  Habitat physical enclosure INSTANCE + its TEMPLATE (1:1)
 *        habitat_instance_id / habitat_template_id columns; Manager-created ones: mgr_inst_<id> / mgr_enc_<id>
 *   Manager assembly (wp_ir2_racky)     ⇄  Habitat ASSEMBLY (wp_ir2_habitat_assemblies.asm_json, rack_id link)
 *   Habitat room document (RoomDocument v3: room, objects, network, library) → wp_ir2_habitat_docs
 *
 * Rules: Manager enclosures appear in Habitat MY ENCLOSURES automatically; an enclosure created in Habitat
 * becomes a Manager enclosure on save (never a disconnected duplicate); Habitat never deletes Manager data.
 * localStorage in the browser is only an emergency recovery cache.
 */

/** "70x50x50", "19x12x7,5cm", "60 × 45 × 90 cm" → [w,d,h] in cm (W × D × H convention). */
function ir_dims_parse(?string $s): ?array {
    if ($s === null || trim($s) === '') return null;
    if (!preg_match_all('~(\d+(?:[.,]\d+)?)~', $s, $m) || count($m[1]) < 3) return null;
    $n = array_map(static fn($x) => (float)str_replace(',', '.', $x), array_slice($m[1], 0, 3));
    return ($n[0] > 0 && $n[1] > 0 && $n[2] > 0) ? $n : null;
}
function ir_dims_label(?float $w, ?float $d, ?float $h): string {
    $f = static fn($v) => rtrim(rtrim(number_format((float)$v, 1, ',', ''), '0'), ',');
    return ($w && $d && $h) ? $f($w).' × '.$f($d).' × '.$f($h).' cm' : '';
}
/** Numeric W×D×H of an enclosure (new columns first, then the legacy free-text field). */
function ir_enclosure_dims(array $u): ?array {
    if (!empty($u['sirka_cm']) && !empty($u['hloubka_cm']) && !empty($u['vyska_cm'])) return [(float)$u['sirka_cm'], (float)$u['hloubka_cm'], (float)$u['vyska_cm']];
    return ir_dims_parse($u['rozmery'] ?? null);
}

/** Habitat construction type from the Manager enclosure type. */
function ir_habitat_type_for(string $typ): string {
    $t = mb_strtolower($typ, 'UTF-8');
    if (str_contains($t, 'rack') || str_contains($t, 'box')) return 'rack';
    if (str_contains($t, 'pvc') || str_contains($t, 'plast')) return 'pvc';
    if (str_contains($t, 'dřev') || str_contains($t, 'osb') || str_contains($t, 'lamino')) return 'wood';
    if (str_contains($t, 'síť') || str_contains($t, 'mesh')) return 'mesh';
    return 'glass';
}

/** Stable Habitat ids of a Manager enclosure (assigned once, stored). */
function ir_habitat_ids_for(PDO $pdo, int $uid, array $u): array {
    $inst = (string)($u['habitat_instance_id'] ?? '');
    $tpl = (string)($u['habitat_template_id'] ?? '');
    if ($inst === '' || $tpl === '') {
        $inst = $inst ?: 'mgr_inst_'.(int)$u['id'];
        $tpl = $tpl ?: 'mgr_enc_'.(int)$u['id'];
        if (ir_db_column_exists($pdo, 'wp_ir2_ubikace', 'habitat_instance_id')) $pdo->prepare('UPDATE wp_ir2_ubikace SET habitat_instance_id=?,habitat_template_id=? WHERE id=? AND user_id=?')->execute([$inst, $tpl, (int)$u['id'], $uid]);
    }
    return [$inst, $tpl];
}

/** Manager enclosures → Habitat library entries (templates + instances), animals as labels. */
function ir_habitat_manager_library(PDO $pdo, int $uid): array {
    $q = $pdo->prepare('SELECT * FROM wp_ir2_ubikace WHERE user_id=?'.(ir_db_column_exists($pdo, 'wp_ir2_ubikace', 'archivovano') ? ' AND archivovano IS NULL' : '').' ORDER BY id');
    $q->execute([$uid]);
    $animals = [];
    $a = $pdo->prepare('SELECT ubikace_id, latinsky_nazev, druh, jmeno_kod, animal_id FROM wp_ir2_zvirata z WHERE user_id=? AND ubikace_id IS NOT NULL AND '.ir_status_active_sql('z'));
    $a->execute([$uid]);
    foreach ($a->fetchAll() ?: [] as $r) $animals[(int)$r['ubikace_id']][] = $r;
    $templates = []; $instances = []; $map = [];
    foreach ($q->fetchAll() ?: [] as $u) {
        [$instId, $tplId] = ir_habitat_ids_for($pdo, $uid, $u);
        $fromManager = str_starts_with($tplId, 'mgr_enc_');
        $stamp = !empty($u['vytvoreno']) ? date('c', strtotime((string)$u['vytvoreno'])) : '2026-01-01T00:00:00+00:00'; // stable, so reloads never look like edits
        if (!isset($templates[$tplId])) {
            // one Habitat design (template) may be built several times — emit it once
            $dims = ir_enclosure_dims($u) ?? [60, 45, 60];
            $stored = json_decode((string)($u['habitat_json'] ?? ''), true);
            $tpl = is_array($stored) ? $stored : ['type' => ir_habitat_type_for((string)($u['typ'] ?? '')), 'construction' => ['type' => ir_habitat_type_for((string)($u['typ'] ?? ''))], 'interior' => ['preset' => ir_habitat_type_for((string)($u['typ'] ?? '')) === 'rack' ? 'none' : 'tropical']];
            $tpl['id'] = $tplId;
            // Manager-born enclosures: the Manager name is the design name; Habitat-born: keep the design's own name
            $tpl['name'] = $fromManager ? (string)$u['nazev'] : (string)($tpl['name'] ?? preg_replace('~ · [^·]+$~u', '', (string)$u['nazev']));
            // Manager dimensions are authoritative (W × D × H cm → metres)
            $tpl['dimensions'] = ['width' => round($dims[0] / 100, 4), 'depth' => round($dims[1] / 100, 4), 'height' => round($dims[2] / 100, 4)];
            $tpl['metadata'] = array_merge(['created' => $stamp, 'modified' => $stamp], (array)($tpl['metadata'] ?? []), ['source' => 'ir-manager']);
            $templates[$tplId] = $tpl;
        }
        $first = $animals[(int)$u['id']][0] ?? null;
        $code = $fromManager ? mb_substr((string)$u['nazev'], 0, 24) : (preg_match('~ · ([^·]{1,24})$~u', (string)$u['nazev'], $cm) ? $cm[1] : mb_substr((string)$u['nazev'], 0, 24));
        $instances[] = ['id' => $instId, 'templateId' => $tplId, 'code' => $code, 'props' => ['occupied' => (bool)$first, 'lighting' => true, 'animal' => ['species' => $first ? (string)($first['latinsky_nazev'] ?: $first['druh']) : '', 'code' => $first ? mb_substr((string)($first['animal_id'] ?: $first['jmeno_kod']), 0, 24) : ''], 'notes' => ''], 'devices' => [], 'metadata' => ['externalId' => 'ir-manager:ubikace:'.(int)$u['id'], 'created' => $stamp]];
        $map[$instId] = (int)$u['id'];
    }
    $templates = array_values($templates);
    return ['templates' => $templates, 'instances' => $instances, 'map' => $map];
}

/** Legacy Manager assemblies (racky + blocks of the previous in-house studio) → Habitat 4.2 assemblies. */
function ir_habitat_legacy_assemblies(PDO $pdo, int $uid, array $instByManagerId): array {
    if (!ir_table_exists($pdo, 'wp_ir2_racky')) return [];
    $out = [];
    $r = $pdo->prepare('SELECT * FROM wp_ir2_racky WHERE user_id=? ORDER BY poradi, id'); $r->execute([$uid]);
    $blocksT = ir_table_exists($pdo, 'wp_ir2_habitat_assembly_blocks_130');
    foreach ($r->fetchAll() ?: [] as $rack) {
        $members = [];
        if ($blocksT) {
            $b = $pdo->prepare('SELECT * FROM wp_ir2_habitat_assembly_blocks_130 WHERE user_id=? AND rack_id=? ORDER BY sort_order, id'); $b->execute([$uid, (int)$rack['id']]);
            foreach ($b->fetchAll() ?: [] as $bl) {
                $inst = $instByManagerId[(int)$bl['habitat_id']] ?? null;
                if (!$inst) continue;
                $members[] = ['id' => 'm'.(int)$bl['id'], 'kind' => 'enclosure', 'instanceId' => $inst['id'], 'enclosureId' => $inst['templateId'], 'position' => ['x' => round((float)$bl['x_cm'] / 100, 4), 'y' => round((float)$bl['z_cm'] / 100, 4), 'z' => 0]];
            }
        }
        if (!$members) { // enclosures linked by rack_id only: stack them
            $u = $pdo->prepare('SELECT id FROM wp_ir2_ubikace WHERE user_id=? AND rack_id=? ORDER BY COALESCE(grid_row,0), COALESCE(grid_col,0), id'); $u->execute([$uid, (int)$rack['id']]);
            $y = 0.0;
            foreach ($u->fetchAll(PDO::FETCH_COLUMN) ?: [] as $mid) { $inst = $instByManagerId[(int)$mid] ?? null; if (!$inst) continue; $members[] = ['id' => 'm'.(int)$mid, 'kind' => 'enclosure', 'instanceId' => $inst['id'], 'enclosureId' => $inst['templateId'], 'position' => ['x' => 0, 'y' => round($y, 4), 'z' => 0]]; $y += (float)($inst['_h'] ?? 0.5); }
        }
        $st = !empty($rack['created_at']) ? date('c', strtotime((string)$rack['created_at'])) : '2026-01-01T00:00:00+00:00';
        $out[] = ['id' => 'mgr_asm_'.(int)$rack['id'], 'name' => (string)$rack['nazev'], 'members' => $members, 'reserved' => [], 'frame' => ['mode' => 'none'], 'alignment' => 'front', 'metadata' => ['notes' => (string)($rack['poznamka'] ?? ''), 'managerRackId' => (int)$rack['id'], 'created' => $st, 'modified' => $st]];
    }
    return $out;
}

/**
 * First open of the 4.2 studio for an account that used the previous in-house studio: convert its latest
 * room (wp_ir2_habitat_rooms_71 + room_items_71 + room_meta_130) into a RoomDocument. Old tables are only read.
 */
function ir_habitat_legacy_room(PDO $pdo, int $uid): ?array {
    if (!ir_table_exists($pdo, 'wp_ir2_habitat_rooms_71') || !ir_table_exists($pdo, 'wp_ir2_habitat_room_items_71')) return null;
    $q = $pdo->prepare('SELECT * FROM wp_ir2_habitat_rooms_71 WHERE user_id=? ORDER BY updated_at DESC, id DESC LIMIT 1'); $q->execute([$uid]);
    $r = $q->fetch(); if (!$r) return null;
    $W = max(1.0, (float)$r['width_cm'] / 100); $D = max(1.0, (float)$r['depth_cm'] / 100); $H = 2.7;
    if (ir_table_exists($pdo, 'wp_ir2_habitat_room_meta_130')) { $m = $pdo->prepare('SELECT height_cm FROM wp_ir2_habitat_room_meta_130 WHERE user_id=? AND room_id=?'); $m->execute([$uid, (int)$r['id']]); $h = (float)$m->fetchColumn(); if ($h > 150) $H = $h / 100; }
    $it = $pdo->prepare('SELECT * FROM wp_ir2_habitat_room_items_71 WHERE user_id=? AND room_id=? ORDER BY z_index, id'); $it->execute([$uid, (int)$r['id']]);
    $objects = []; $n = 0;
    $mountOffset = static function (string $wall, float $cx, float $cz) use ($W, $D): float {
        return match ($wall) { 'north' => $cx, 'south' => $W - $cx, 'west' => $D - $cz, 'east' => $cz, default => $cx };
    };
    foreach ($it->fetchAll() ?: [] as $i) {
        $w = (float)$i['width_cm'] / 100; $d = (float)$i['depth_cm'] / 100; $h = (float)($i['height_cm'] ?? 0) / 100;
        $rot = ((int)$i['rotation'] % 360 + 360) % 360; $swap = $rot === 90 || $rot === 270;
        $cx = (float)$i['x_cm'] / 100 + ($swap ? $d : $w) / 2; $cz = (float)$i['y_cm'] / 100 + ($swap ? $w : $d) / 2;
        $cx = min($W, max(0, $cx)); $cz = min($D, max(0, $cz));
        $base = ['id' => 'mgr_obj_'.(int)$i['id'], 'name' => (string)($i['label'] ?: 'Prvek'), 'position' => ['x' => round($cx, 3), 'z' => round($cz, 3)], 'rotation' => $rot, 'elevation' => round((float)($i['elevation_cm'] ?? 0) / 100, 3), 'mount' => null];
        $type = (string)$i['item_type'];
        if ($type === 'rack' && (int)$i['rack_id'] > 0) { $objects[] = $base + ['type' => 'assembly', 'ref' => ['assemblyId' => 'mgr_asm_'.(int)$i['rack_id']], 'size' => ['w' => max(0.2, $w), 'd' => max(0.2, $d), 'h' => max(0.3, $h ?: 1)], 'props' => []]; $n++; continue; }
        $wall = in_array((string)($i['wall_side'] ?? ''), ['north', 'south', 'east', 'west'], true) ? (string)$i['wall_side'] : null;
        $map = ['door' => 'door_interior', 'door-technical' => 'door_solid', 'window' => 'window_clear', 'plant' => 'plant_fern', 'table-small' => 'table_straight', 'table' => 'table_straight', 'desk' => 'table_straight', 'cabinet' => 'cabinet_low', 'shelf' => 'shelving'];
        if (!isset($map[$type])) continue; // unknown custom shapes are not guessed
        $o = $base + ['type' => $map[$type], 'size' => ['w' => max(0.2, $w), 'd' => max(0.1, $d), 'h' => max(0.2, $h ?: 1)], 'props' => []];
        if ($wall && in_array($type, ['door', 'door-technical', 'window'], true)) { $o['mount'] = ['wall' => $wall, 'offset' => round($mountOffset($wall, $cx, $cz), 3)]; unset($o['elevation']); }
        $objects[] = $o; $n++;
    }
    return ['schema' => 'ir-manager/habitat-room', 'version' => 3,
        'room' => ['name' => (string)$r['nazev'] ?: 'Chovatelská místnost', 'width' => round($W, 3), 'depth' => round($D, 3), 'height' => round($H, 3), 'wallThickness' => 0.14],
        'objects' => $objects, 'enclosures' => [], 'instances' => [], 'assemblies' => [], 'network' => ['routes' => [], 'circuits' => []],
        'meta' => ['migratedFrom' => 'habitat_rooms_71:'.(int)$r['id'], 'migratedObjects' => $n, 'generator' => 'IR Manager']];
}

/**
 * Load a room for Habitat: stored document (or a fresh EMPTY room — never a demo room) merged with the
 * CURRENT Manager library (Manager enclosures always present; Habitat-only data kept).
 */
function ir_habitat_load(PDO $pdo, int $uid, string $roomKey = 'main'): array {
    $roomKey = preg_replace('~[^a-z0-9_-]~i', '', $roomKey) ?: 'main';
    $q = $pdo->prepare('SELECT * FROM wp_ir2_habitat_docs WHERE user_id=? AND room_key=? LIMIT 1'); $q->execute([$uid, $roomKey]);
    $row = $q->fetch();
    $doc = $row ? json_decode((string)$row['doc_json'], true) : null;
    if (!is_array($doc) && $roomKey === 'main' && !$row) $doc = ir_habitat_legacy_room($pdo, $uid);
    if (!is_array($doc)) $doc = ['schema' => 'ir-manager/habitat-room', 'version' => 3, 'room' => ['name' => $roomKey === 'main' ? 'Chovatelská místnost' : $roomKey, 'width' => 5, 'depth' => 4, 'height' => 2.7, 'wallThickness' => 0.14], 'objects' => [], 'enclosures' => [], 'instances' => [], 'assemblies' => [], 'network' => ['routes' => [], 'circuits' => []]];
    $lib = ir_habitat_manager_library($pdo, $uid);
    // merge: Manager-mapped entries are refreshed from Manager; Habitat-only entries (not yet saved) stay
    $mgrTpl = array_column($lib['templates'], null, 'id');
    $mgrInst = array_column($lib['instances'], null, 'id');
    $tpls = []; foreach ((array)($doc['enclosures'] ?? []) as $t) if (!isset($mgrTpl[$t['id'] ?? ''])) $tpls[] = $t; else { $m = $mgrTpl[$t['id']]; unset($mgrTpl[$t['id']]); $tpls[] = array_merge($t, ['name' => $m['name'], 'dimensions' => $m['dimensions'], 'metadata' => array_merge((array)($m['metadata'] ?? []), (array)($t['metadata'] ?? []))]); }
    $insts = []; foreach ((array)($doc['instances'] ?? []) as $i) if (!isset($mgrInst[$i['id'] ?? ''])) $insts[] = $i; else { $m = $mgrInst[$i['id']]; unset($mgrInst[$i['id']]); $insts[] = array_merge($i, ['code' => $m['code'], 'props' => array_merge((array)($i['props'] ?? []), ['animal' => $m['props']['animal'], 'occupied' => $m['props']['occupied']]), 'metadata' => array_merge((array)($i['metadata'] ?? []), ['externalId' => $m['metadata']['externalId']])]); }
    $doc['enclosures'] = array_merge($tpls, array_values($mgrTpl));
    $doc['instances'] = array_merge($insts, array_values($mgrInst));
    // assemblies: Habitat-saved ones + legacy Manager racks not yet converted
    $asms = (array)($doc['assemblies'] ?? []);
    $have = array_flip(array_map(static fn($a) => (string)($a['id'] ?? ''), $asms));
    $stored = $pdo->prepare('SELECT asm_key, asm_json FROM wp_ir2_habitat_assemblies WHERE user_id=? AND deleted_at IS NULL'); $stored->execute([$uid]);
    foreach ($stored->fetchAll() ?: [] as $s) if (!isset($have[$s['asm_key']])) { $a = json_decode((string)$s['asm_json'], true); if (is_array($a)) { $asms[] = $a; $have[$s['asm_key']] = true; } }
    $instByMgr = [];
    foreach ($doc['instances'] as $i) { $mid = $lib['map'][$i['id']] ?? null; if ($mid) { $tp = null; foreach ($doc['enclosures'] as $t) if ($t['id'] === $i['templateId']) { $tp = $t; break; } $instByMgr[$mid] = ['id' => $i['id'], 'templateId' => $i['templateId'], '_h' => (float)($tp['dimensions']['height'] ?? 0.5)]; } }
    $linkedRacks = array_flip(array_map('intval', $pdo->query('SELECT rack_id FROM wp_ir2_habitat_assemblies WHERE user_id='.(int)$uid.' AND rack_id IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN) ?: []));
    foreach (ir_habitat_legacy_assemblies($pdo, $uid, $instByMgr) as $la) if (!isset($have[$la['id']]) && !isset($linkedRacks[(int)$la['metadata']['managerRackId']])) $asms[] = $la;
    $doc['assemblies'] = $asms;
    return ['doc' => $doc, 'revision' => (int)($row['revision'] ?? 0), 'room_key' => $roomKey, 'rooms' => ir_habitat_rooms($pdo, $uid)];
}

function ir_habitat_rooms(PDO $pdo, int $uid): array {
    $q = $pdo->prepare('SELECT room_key, name, revision, updated_at FROM wp_ir2_habitat_docs WHERE user_id=? ORDER BY name'); $q->execute([$uid]);
    return $q->fetchAll() ?: [];
}

/**
 * Save a room document. Optimistic concurrency by revision. Synchronises the library back to Manager:
 *   templates of Manager enclosures → habitat_json + W×D×H;  instances unknown to Manager → NEW Manager
 *   enclosures;  assemblies → wp_ir2_habitat_assemblies + Manager Sestavy (wp_ir2_racky), members linked.
 * All in one transaction. Returns ['revision'=>…, 'created'=>[instId=>managerId], 'assemblies'=>[asmId=>rackId]].
 */
function ir_habitat_save(PDO $pdo, int $uid, string $roomKey, array $doc, int $baseRevision): array {
    $roomKey = preg_replace('~[^a-z0-9_-]~i', '', $roomKey) ?: 'main';
    if (($doc['schema'] ?? '') !== 'ir-manager/habitat-room') throw new RuntimeException('Neplatný dokument Habitatu.');
    $json = json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || strlen($json) > 16 * 1024 * 1024) throw new RuntimeException('Dokument je příliš velký.');
    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT id, revision, doc_json FROM wp_ir2_habitat_docs WHERE user_id=? AND room_key=? FOR UPDATE'); $q->execute([$uid, $roomKey]);
        $row = $q->fetch();
        if ($row && (int)$row['revision'] !== $baseRevision) throw new RuntimeException('conflict:'.(int)$row['revision']);
        $created = []; $asmMap = [];
        $tplById = [];
        foreach ((array)($doc['enclosures'] ?? []) as $t) $tplById[(string)($t['id'] ?? '')] = $t;
        $mq = $pdo->prepare('SELECT id, habitat_instance_id, habitat_template_id FROM wp_ir2_ubikace WHERE user_id=? AND habitat_instance_id IS NOT NULL'); $mq->execute([$uid]);
        $mgrByInst = []; foreach ($mq->fetchAll() ?: [] as $r) $mgrByInst[(string)$r['habitat_instance_id']] = (int)$r['id'];
        foreach ((array)($doc['instances'] ?? []) as $i) {
            $iid = (string)($i['id'] ?? ''); if ($iid === '') continue;
            $t = $tplById[(string)($i['templateId'] ?? '')] ?? null;
            $dims = $t ? [round((float)($t['dimensions']['width'] ?? 0) * 100, 1), round((float)($t['dimensions']['depth'] ?? 0) * 100, 1), round((float)($t['dimensions']['height'] ?? 0) * 100, 1)] : null;
            $tplJson = $t ? json_encode($t, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
            if (isset($mgrByInst[$iid])) {
                $mid = $mgrByInst[$iid];
                $pdo->prepare('UPDATE wp_ir2_ubikace SET habitat_json=?, sirka_cm=COALESCE(?,sirka_cm), hloubka_cm=COALESCE(?,hloubka_cm), vyska_cm=COALESCE(?,vyska_cm), rozmery=COALESCE(?,rozmery), upraveno=NOW() WHERE id=? AND user_id=?')
                    ->execute([$tplJson, $dims[0] ?? null, $dims[1] ?? null, $dims[2] ?? null, $dims ? ir_dims_label($dims[0], $dims[1], $dims[2]) : null, $mid, $uid]);
            } else {
                // enclosure designed in Habitat → becomes a real Manager enclosure (same stable identity)
                if (!ir_can('write')) throw new RuntimeException('Účet je pouze pro čtení.');
                $name = trim((string)($t['name'] ?? '')) ?: trim((string)($i['code'] ?? '')) ?: 'Ubikace z Habitatu';
                $code = trim((string)($i['code'] ?? ''));
                $pdo->prepare('INSERT INTO wp_ir2_ubikace(user_id,nazev,typ,rozmery,sirka_cm,hloubka_cm,vyska_cm,habitat_json,habitat_instance_id,habitat_template_id,qr_token,vytvoreno,upraveno,poznamka) VALUES(?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),?)')
                    ->execute([$uid, $code !== '' && $code !== $name ? $name.' · '.$code : $name, match ((string)($t['type'] ?? 'glass')) { 'rack' => 'Rack box', 'pvc' => 'PVC', 'wood' => 'Dřevěné terárium', 'mesh' => 'Síťové terárium', default => 'Terárium' }, $dims ? ir_dims_label($dims[0], $dims[1], $dims[2]) : null, $dims[0] ?? null, $dims[1] ?? null, $dims[2] ?? null, $tplJson, $iid, (string)($i['templateId'] ?? ''), 'E'.strtoupper(bin2hex(random_bytes(7))), 'Vytvořeno v Habitat Studiu']);
                $mid = (int)$pdo->lastInsertId();
                $created[$iid] = $mid; $mgrByInst[$iid] = $mid;
                ir_audit($pdo, 'enclosure', $mid, 'create', null, ['source' => 'habitat', 'instance' => $iid]);
            }
        }
        foreach ((array)($doc['assemblies'] ?? []) as $a) {
            $aid = (string)($a['id'] ?? ''); if ($aid === '') continue;
            $name = trim((string)($a['name'] ?? 'Sestava')) ?: 'Sestava';
            $x = $pdo->prepare('SELECT id, rack_id FROM wp_ir2_habitat_assemblies WHERE user_id=? AND asm_key=? LIMIT 1'); $x->execute([$uid, $aid]);
            $ex = $x->fetch();
            $rackId = $ex ? (int)$ex['rack_id'] : (int)($a['metadata']['managerRackId'] ?? 0);
            if (!$rackId && preg_match('~^mgr_asm_(\d+)$~', $aid, $mm)) $rackId = (int)$mm[1]; // legacy Manager rack converted on load
            if ($rackId && !ir_scalar($pdo, 'SELECT COUNT(*) FROM wp_ir2_racky WHERE id=? AND user_id=?', [$rackId, $uid], 0)) $rackId = 0;
            if (!$rackId) { $pdo->prepare('INSERT INTO wp_ir2_racky(user_id,nazev,umisteni,pocet_radku,pocet_sloupcu,poznamka) VALUES(?,?,?,1,1,?)')->execute([$uid, $name, 'Habitat Studio', 'Sestava z Habitat Studia']); $rackId = (int)$pdo->lastInsertId(); }
            else $pdo->prepare('UPDATE wp_ir2_racky SET nazev=? WHERE id=? AND user_id=?')->execute([$name, $rackId, $uid]);
            $a['metadata']['managerRackId'] = $rackId;
            $aj = json_encode($a, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($ex) $pdo->prepare('UPDATE wp_ir2_habitat_assemblies SET name=?, rack_id=?, asm_json=?, deleted_at=NULL, updated_at=NOW() WHERE id=?')->execute([$name, $rackId, $aj, (int)$ex['id']]);
            else $pdo->prepare('INSERT INTO wp_ir2_habitat_assemblies(user_id,asm_key,rack_id,name,asm_json,created_at,updated_at) VALUES(?,?,?,?,?,NOW(),NOW())')->execute([$uid, $aid, $rackId, $name, $aj]);
            foreach ((array)($a['members'] ?? []) as $m) {
                $mid = $mgrByInst[(string)($m['instanceId'] ?? '')] ?? null;
                if ($mid) $pdo->prepare('UPDATE wp_ir2_ubikace SET rack_id=? WHERE id=? AND user_id=? AND (rack_id IS NULL OR rack_id<>?)')->execute([$rackId, $mid, $uid, $rackId]);
            }
            $asmMap[$aid] = $rackId;
        }
        // assemblies removed from THIS room in Habitat: soft-deleted link (the Manager Sestava itself stays)
        $prevDoc = $row ? (json_decode((string)$row['doc_json'], true) ?: []) : [];
        foreach ((array)($prevDoc['assemblies'] ?? []) as $pa) {
            $pk = (string)($pa['id'] ?? '');
            if ($pk !== '' && !isset($asmMap[$pk])) $pdo->prepare('UPDATE wp_ir2_habitat_assemblies SET deleted_at=NOW() WHERE user_id=? AND asm_key=? AND deleted_at IS NULL')->execute([$uid, $pk]);
        }
        $name = mb_substr(trim((string)($doc['room']['name'] ?? $roomKey)) ?: $roomKey, 0, 190);
        if ($row) $pdo->prepare('UPDATE wp_ir2_habitat_docs SET doc_json=?, name=?, revision=revision+1, updated_at=NOW() WHERE id=?')->execute([$json, $name, (int)$row['id']]);
        else $pdo->prepare('INSERT INTO wp_ir2_habitat_docs(user_id,room_key,name,doc_json,revision,created_at,updated_at) VALUES(?,?,?,?,1,NOW(),NOW())')->execute([$uid, $roomKey, $name, $json]);
        $rev = (int)ir_scalar($pdo, 'SELECT revision FROM wp_ir2_habitat_docs WHERE user_id=? AND room_key=?', [$uid, $roomKey], 1);
        $pdo->commit();
        return ['revision' => $rev, 'created' => $created, 'assemblies' => $asmMap];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

/** Habitat assemblies shown in Manager (Ubikace → Sestavy). */
function ir_habitat_assemblies_for_manager(PDO $pdo, int $uid): array {
    if (!ir_table_exists($pdo, 'wp_ir2_habitat_assemblies')) return [];
    $q = $pdo->prepare('SELECT a.*, r.nazev AS rack_nazev FROM wp_ir2_habitat_assemblies a LEFT JOIN wp_ir2_racky r ON r.id=a.rack_id AND r.user_id=a.user_id WHERE a.user_id=? AND a.deleted_at IS NULL ORDER BY a.name');
    $q->execute([$uid]);
    $out = [];
    foreach ($q->fetchAll() ?: [] as $r) { $j = json_decode((string)$r['asm_json'], true) ?: []; $r['member_count'] = count((array)($j['members'] ?? [])); $out[] = $r; }
    return $out;
}
