<?php
declare(strict_types=1);

/*
 * UNIFIED EVENT SERVICE (BETA 1.0 FINAL)
 *
 *   PLANNER ≠ RECORD.  Planner rows (wp_ir2_planovac) say what SHOULD happen; events (wp_ir2_pece) say what
 *   DID happen. Every input channel — planner detail, Quick Record, QR, NFC, voice, animal profile, enclosure
 *   profile, manual form, bulk — calls ir_event_record() / ir_event_batch() / ir_event_group(). The channel is
 *   stored only as audit metadata (wp_ir2_pece.zdroj); the semantic record is identical.
 *
 *   Feeding results (locked):
 *     eaten    ✓ SEŽRÁNO   offered + accepted      typ 'Krmení'             → stock consumed, supplement advanced
 *     refused  ✕ NESEŽRAL  offered + refused       typ 'Odmítnutí potravy'  → counts as refusal, supplement NOT consumed
 *     in_shed  ◆ VE SVLEKU not offered (in shed)   typ 'Nekrmeno'           → no stock, no supplement, not a refusal,
 *                                                                              last successful feeding unchanged, plan resolved
 *     not_fed  ○ NEKRMENO  not offered (other)     typ 'Nekrmeno'           → same, without shed evidence
 *   There is intentionally NO "partial" and NO "offered / waiting for check" result.
 *
 *   Historical corrections keep performed_at (datum) unless the user explicitly changes it; upraveno /
 *   upravil_id + the audit log record the correction. Deletes move the full row into wp_ir2_pece_kos (restorable).
 */

const IR_FEED_RESULTS = [
    'eaten' => ['label' => 'Sežráno', 'label_en' => 'Eaten', 'icon' => '✓', 'typ' => 'Krmení', 'tone' => 'ok'],
    'refused' => ['label' => 'Nesežral', 'label_en' => 'Refused', 'icon' => '✕', 'typ' => 'Odmítnutí potravy', 'tone' => 'bad'],
    'in_shed' => ['label' => 'Ve svleku', 'label_en' => 'In shed', 'icon' => '◆', 'typ' => 'Nekrmeno', 'tone' => 'info'],
    'not_fed' => ['label' => 'Nekrmeno', 'label_en' => 'Not fed', 'icon' => '○', 'typ' => 'Nekrmeno', 'tone' => 'muted'],
];
const IR_EVENT_SOURCES = ['qr', 'nfc', 'voice', 'planner', 'quick', 'manual', 'profile', 'enclosure', 'bulk', 'import', 'habitat'];
const IR_FEEDING_TYPES = ['Krmení', 'Odmítnutí potravy', 'Nekrmeno'];

class IrDuplicateEvent extends RuntimeException {
    public function __construct(public array $existing, string $message = 'Pravděpodobně duplicitní záznam.') { parent::__construct($message); }
}

function ir_events_ready(PDO $pdo): bool { static $r = null; return $r ??= ir_db_column_exists($pdo, 'wp_ir2_pece', 'vysledek'); }

/** Result of a stored event (also for records created before BETA 1.0). */
function ir_event_result(array $row): ?string {
    $r = (string)($row['vysledek'] ?? '');
    if ($r !== '') return $r;
    return match ((string)($row['typ'] ?? '')) { 'Krmení' => 'eaten', 'Odmítnutí potravy' => 'refused', default => null };
}
function ir_is_feeding_family(string $type, ?string $result = null): bool {
    return in_array($type, IR_FEEDING_TYPES, true) || isset(IR_FEED_RESULTS[(string)$result]) && in_array($result, ['eaten', 'refused', 'in_shed', 'not_fed'], true);
}

/**
 * Record ONE event.
 * $e = [animal_id*, type* | result (feeding), performed_at, feed, qty, value, note, source, batch_id, group_id,
 *       planner_task_id, allow_duplicate(bool), shed ('observed'|'completed' for typ Svlek)]
 * Returns the new wp_ir2_pece id. Throws IrDuplicateEvent when a likely duplicate exists (unless allowed).
 */
function ir_event_record(PDO $pdo, int $uid, array $e): int {
    $own = !$pdo->inTransaction();
    if ($own) $pdo->beginTransaction();
    try {
        $id = ir_event_record_tx($pdo, $uid, $e);
        if ($own) $pdo->commit();
        return $id;
    } catch (Throwable $ex) {
        if ($own && $pdo->inTransaction()) $pdo->rollBack();
        throw $ex;
    }
}

function ir_event_record_tx(PDO $pdo, int $uid, array $e): int {
    $animalId = (int)($e['animal_id'] ?? 0);
    $animal = ir_animal($pdo, $uid, $animalId);
    if (!$animal) throw new RuntimeException('Zvíře nebylo nalezeno.');
    if (ir_animal_is_locked($pdo, $uid, $animalId)) throw new RuntimeException('Zvíře je nad limitem tarifu (jen pro čtení). Data zůstávají zachována — odemknete je vyšším tarifem nebo archivací jiných zvířat.');
    $result = isset($e['result']) && $e['result'] !== '' ? (string)$e['result'] : null;
    $type = trim((string)($e['type'] ?? ''));
    if ($result !== null && isset(IR_FEED_RESULTS[$result]) && !in_array($result, ['observed', 'completed'], true)) $type = IR_FEED_RESULTS[$result]['typ'];
    if ($type === 'Krmení' && $result === null) $result = 'eaten';
    if ($type === 'Odmítnutí potravy') $result = 'refused';
    if ($type === 'Nekrmeno' && !in_array($result, ['in_shed', 'not_fed'], true)) $result = 'not_fed';
    if ($type === 'Svlek') $result = in_array($e['shed'] ?? $result, ['observed', 'completed'], true) ? (string)($e['shed'] ?? $result) : 'completed';
    if ($type === '') throw new RuntimeException('Chybí typ aktivity.');
    $when = trim((string)($e['performed_at'] ?? ''));
    $ts = strtotime($when === '' ? 'now' : $when);
    if (!$ts) throw new RuntimeException('Neplatné datum.');
    $performed = date('Y-m-d H:i:s', $ts);
    if (substr($performed, 0, 10) > date('Y-m-d')) throw new RuntimeException('Záznam nemůže být v budoucnosti — budoucí práci naplánujte v Plánovači.');
    $source = in_array($e['source'] ?? '', IR_EVENT_SOURCES, true) ? (string)$e['source'] : 'manual';
    $feed = trim((string)($e['feed'] ?? $e['value'] ?? ''));
    $qty = isset($e['qty']) && $e['qty'] !== '' && is_numeric(str_replace(',', '.', (string)$e['qty'])) ? max(0.0, (float)str_replace(',', '.', (string)$e['qty'])) : null;
    $note = trim((string)($e['note'] ?? ''));

    // ---- duplicate protection (same animal, same semantic family, same day)
    if (empty($e['allow_duplicate'])) {
        $family = ir_is_feeding_family($type, $result) ? IR_FEEDING_TYPES : [$type];
        $ph = implode(',', array_fill(0, count($family), '?'));
        $q = $pdo->prepare("SELECT id,typ,datum,hodnota".(ir_events_ready($pdo) ? ',vysledek,zdroj' : '')." FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ IN ($ph) AND DATE(datum)=? ORDER BY id DESC LIMIT 1");
        $q->execute(array_merge([$uid, $animalId], $family, [substr($performed, 0, 10)]));
        if ($dup = $q->fetch()) throw new IrDuplicateEvent($dup, 'Pro '.ir_animal_display($animal).' už dnes existuje záznam „'.$dup['typ'].'“ ('.substr((string)$dup['datum'], 0, 10).'). Uložit přesto?');
    }

    // ---- write through the proven core (supplements, stock, feed-task sync, automations)
    if ($type === 'Krmení') {
        $value = $feed;
        if ($value === '') $value = ir_animal_default_feed_value($pdo, $uid, $animal);
        if ($value === '') throw new RuntimeException('Na kartě zvířete nastav Typ krmení nebo vyplň krmivo.');
        $stockValue = ($qty !== null && $qty > 1) ? rtrim(rtrim(number_format($qty, 2, '.', ''), '0'), '.').'× '.$value : $value;
        $id = ir_log_activity($pdo, $uid, $animalId, 'Krmení', $performed, $stockValue, $note);
    } elseif ($type === 'Odmítnutí potravy') {
        // offered and refused: counts as refusal, supplement NOT consumed and NOT advanced, no stock by default
        $value = $feed !== '' ? $feed : ir_animal_default_feed_value($pdo, $uid, $animal);
        $id = ir_log_activity($pdo, $uid, $animalId, 'Odmítnutí potravy', $performed, $value, $note);
        if (ir_user_setting_get($pdo, $uid, 'refused_consumes_stock', '0') === '1') ir_feed_inventory_decrement($pdo, $uid, $value);
    } elseif ($type === 'Nekrmeno') {
        // not offered: in shed / other reason — no stock, no supplement, not a refusal, last success unchanged
        $pdo->prepare('INSERT INTO wp_ir2_pece(user_id,zvire_id,typ,datum,hodnota,detail,supplement_effect) VALUES(?,?,?,?,?,?,?)')
            ->execute([$uid, $animalId, 'Nekrmeno', $performed, $result === 'in_shed' ? 'Ve svleku' : 'Nekrmeno', $note !== '' ? $note : null, json_encode(['version' => 2, 'source' => 'none', 'base_feed' => ''])]);
        $id = (int)$pdo->lastInsertId();
        ir_run_activity_automations($pdo, $uid, $animal, 'Nekrmeno', $performed);
        // next offer: refeed interval from today (plan stays alive, nothing is "fed")
        ir_sync_feed_task($pdo, $uid, $animal, $performed, true);
    } else {
        $value = trim((string)($e['value'] ?? $feed));
        $id = ir_log_activity($pdo, $uid, $animalId, $type, $performed, $value, $note);
    }

    // ---- BETA 1.0 metadata on the same row
    if (ir_events_ready($pdo)) {
        $supp = null;
        if ($type === 'Krmení') {
            $row = $pdo->prepare('SELECT supplement_effect FROM wp_ir2_pece WHERE id=?'); $row->execute([$id]);
            $eff = json_decode((string)$row->fetchColumn(), true);
            $supp = is_array($eff) && !empty($eff['supplement']) ? (string)$eff['supplement'] : null;
        }
        $pdo->prepare('UPDATE wp_ir2_pece SET vysledek=?,zdroj=?,davka_id=?,skupina_id=?,krmivo=?,mnozstvi=?,suplement=?,planovac_id=?,vytvoreno=NOW(),autor_id=? WHERE id=? AND user_id=?')
            ->execute([$result, $source, $e['batch_id'] ?? null, isset($e['group_id']) ? (int)$e['group_id'] ?: null : null, ir_is_feeding_family($type, $result) ? ($feed !== '' ? $feed : ir_animal_default_feed_value($pdo, $uid, $animal)) : null, $qty, $supp, isset($e['planner_task_id']) ? (int)$e['planner_task_id'] ?: null : null, ir_actor_id() ?: null, $id, $uid]);
    }

    // ---- planner reconciliation: the record satisfies planned work for this animal up to that day
    ir_event_reconcile_planner($pdo, $uid, $animalId, $type, $result, $performed, $id, isset($e['planner_task_id']) ? (int)$e['planner_task_id'] : 0);
    ir_audit($pdo, 'event', $id, 'create', null, ['animal' => $animalId, 'type' => $type, 'result' => $result, 'at' => $performed, 'source' => $source, 'batch' => $e['batch_id'] ?? null]);
    return $id;
}

/** Mark matching active planner items done (with the record id) — explicit task first, then same-day/overdue. */
function ir_event_reconcile_planner(PDO $pdo, int $uid, int $animalId, string $type, ?string $result, string $performed, int $careId, int $taskId = 0): void {
    $day = substr($performed, 0, 10);
    $feeding = ir_is_feeding_family($type, $result);
    $hasCare = ir_column_exists($pdo, 'wp_ir2_planovac', 'care_record_id');
    $done = static function (int $tid) use ($pdo, $uid, $careId, $hasCare): void {
        if ($hasCare) $pdo->prepare("UPDATE wp_ir2_planovac SET stav='Hotovo',care_record_id=? WHERE user_id=? AND id=? AND stav='Aktivní'")->execute([$careId, $uid, $tid]);
        else $pdo->prepare("UPDATE wp_ir2_planovac SET stav='Hotovo' WHERE user_id=? AND id=? AND stav='Aktivní'")->execute([$uid, $tid]);
    };
    if ($taskId > 0) $done($taskId);
    $q = $pdo->prepare("SELECT * FROM wp_ir2_planovac WHERE user_id=? AND zvire_id=? AND stav='Aktivní' AND datum_termin<=?");
    $q->execute([$uid, $animalId, $day]);
    foreach ($q->fetchAll() ?: [] as $t) {
        $tt = ir_task_activity_type($t);
        if ($feeding && in_array($tt, ['Krmení', 'Odmítnutí potravy'], true)) {
            // the feed task re-created by ir_sync_feed_task has a FUTURE date and is not touched here
            if ((string)$t['datum_termin'] <= $day && !str_contains((string)$t['nazev_ukolu'], 'Suplementace')) $done((int)$t['id']);
        } elseif (!$feeding && $tt === $type) $done((int)$t['id']);
    }
    // group feed task: resolved once every active member has a feeding-family record that day
    if ($feeding && ir_table_exists($pdo, 'wp_ir2_skupiny_clenove')) {
        $g = $pdo->prepare("SELECT skupina_id FROM wp_ir2_skupiny_clenove WHERE user_id=? AND zvire_id=? AND datum_do IS NULL AND stav='Ve skupině'");
        $g->execute([$uid, $animalId]);
        foreach ($g->fetchAll(PDO::FETCH_COLUMN) ?: [] as $gid) {
            $open = ir_scalar($pdo, "SELECT COUNT(*) FROM wp_ir2_skupiny_clenove c JOIN wp_ir2_zvirata z ON z.id=c.zvire_id AND z.user_id=c.user_id WHERE c.user_id=? AND c.skupina_id=? AND c.datum_do IS NULL AND c.stav='Ve skupině' AND ".ir_status_active_sql('z')." AND NOT EXISTS (SELECT 1 FROM wp_ir2_pece p WHERE p.user_id=c.user_id AND p.zvire_id=c.zvire_id AND p.typ IN ('Krmení','Odmítnutí potravy','Nekrmeno') AND DATE(p.datum)=?)", [$uid, (int)$gid, $day], 1);
            if ((int)$open === 0) {
                $pdo->prepare("UPDATE wp_ir2_planovac SET stav='Hotovo' WHERE user_id=? AND stav='Aktivní' AND datum_termin<=? AND poznamka LIKE ?")->execute([$uid, $day, '%[IR-GROUP:FEED:'.(int)$gid.']%']);
                ir_sync_group_feed_tasks($pdo, $uid);
            }
        }
    }
}

/**
 * Record several events as ONE batch ("Krmení ×12") in ONE transaction: all or nothing.
 * $items = [[animal_id, result|type, feed, qty, note, allow_duplicate], ...]; $meta = [type, performed_at, source, group_id, planner_task_id, note]
 * Returns ['batch_id'=>…, 'ids'=>[…], 'summary'=>[result=>count]].
 */
function ir_event_batch(PDO $pdo, int $uid, array $items, array $meta = []): array {
    if (!$items) throw new RuntimeException('Dávka je prázdná.');
    $batchId = ir_uuidish('b');
    $performed = date('Y-m-d H:i:s', strtotime((string)($meta['performed_at'] ?? 'now')) ?: time());
    $source = in_array($meta['source'] ?? '', IR_EVENT_SOURCES, true) ? (string)$meta['source'] : 'bulk';
    $own = !$pdo->inTransaction();
    if ($own) $pdo->beginTransaction();
    try {
        $ids = []; $summary = []; $type = (string)($meta['type'] ?? '');
        foreach ($items as $it) {
            $rec = array_merge(['performed_at' => $performed, 'source' => $source, 'batch_id' => $batchId, 'group_id' => $meta['group_id'] ?? null, 'planner_task_id' => $meta['planner_task_id'] ?? null, 'allow_duplicate' => !empty($meta['allow_duplicate'])], $it);
            if (!isset($rec['type']) && !isset($rec['result'])) $rec['type'] = $type;
            $ids[] = ir_event_record_tx($pdo, $uid, $rec);
            $k = (string)($rec['result'] ?? $rec['type']);
            $summary[$k] = ($summary[$k] ?? 0) + 1;
            if ($type === '') $type = isset($rec['result']) && isset(IR_FEED_RESULTS[$rec['result']]) ? 'Krmení' : (string)$rec['type'];
        }
        if (ir_table_exists($pdo, 'wp_ir2_event_batches')) {
            $label = isset(IR_FEED_RESULTS[array_key_first($summary)]) ? 'Krmení' : $type;
            $pdo->prepare('INSERT INTO wp_ir2_event_batches(id,user_id,typ,datum,zdroj,skupina_id,planovac_id,pocet,souhrn_json,poznamka,vytvoreno,autor_id) VALUES(?,?,?,?,?,?,?,?,?,?,NOW(),?)')
                ->execute([$batchId, $uid, $label, $performed, $source, $meta['group_id'] ?? null, $meta['planner_task_id'] ?? null, count($ids), json_encode($summary, JSON_UNESCAPED_UNICODE), $meta['note'] ?? null, ir_actor_id() ?: null]);
        }
        if (!empty($meta['planner_task_id'])) $pdo->prepare("UPDATE wp_ir2_planovac SET stav='Hotovo' WHERE user_id=? AND id=? AND stav='Aktivní'")->execute([$uid, (int)$meta['planner_task_id']]);
        if ($own) $pdo->commit();
        return ['batch_id' => $batchId, 'ids' => $ids, 'summary' => $summary];
    } catch (Throwable $ex) {
        if ($own && $pdo->inTransaction()) $pdo->rollBack();
        throw $ex;
    }
}

/** Active members of a group (stable individual ids), representative first. */
function ir_group_members(PDO $pdo, int $uid, int $groupId, bool $activeOnly = true): array {
    if (!ir_table_exists($pdo, 'wp_ir2_skupiny_clenove')) return [];
    $sql = "SELECT z.*,c.stav AS clen_stav,c.datum_od,c.datum_do,u.nazev AS ubikace_nazev FROM wp_ir2_skupiny_clenove c JOIN wp_ir2_zvirata z ON z.id=c.zvire_id AND z.user_id=c.user_id LEFT JOIN wp_ir2_ubikace u ON u.id=z.ubikace_id AND u.user_id=z.user_id WHERE c.user_id=? AND c.skupina_id=?".($activeOnly ? " AND c.datum_do IS NULL AND c.stav='Ve skupině' AND ".ir_status_active_sql('z') : '').' ORDER BY z.id';
    $q = $pdo->prepare($sql); $q->execute([$uid, $groupId]);
    return $q->fetchAll() ?: [];
}

/**
 * GROUP action fanning out to individual members in one transaction.
 * $results = [memberAnimalId => result|'skip'] (members not listed get $default), e.g. 3× eaten + 1× refused.
 */
function ir_event_group(PDO $pdo, int $uid, int $groupId, string $typeOrResult, array $results = [], array $meta = []): array {
    $members = ir_group_members($pdo, $uid, $groupId);
    if (!$members) throw new RuntimeException('Skupina nemá aktivní členy.');
    $isFeed = isset(IR_FEED_RESULTS[$typeOrResult]) || $typeOrResult === 'Krmení';
    $default = $isFeed ? ($typeOrResult === 'Krmení' ? 'eaten' : $typeOrResult) : $typeOrResult;
    $items = [];
    foreach ($members as $m) {
        $r = (string)($results[(int)$m['id']] ?? $default);
        if ($r === 'skip') continue;
        $items[] = $isFeed ? ['animal_id' => (int)$m['id'], 'result' => $r, 'feed' => $meta['feed'] ?? '', 'qty' => $meta['qty_each'] ?? null, 'note' => $meta['notes'][(int)$m['id']] ?? ($meta['note'] ?? '')]
                           : ['animal_id' => (int)$m['id'], 'type' => $r, 'value' => $meta['value'] ?? '', 'note' => $meta['note'] ?? ''];
    }
    $out = ir_event_batch($pdo, $uid, $items, array_merge($meta, ['group_id' => $groupId, 'type' => $isFeed ? 'Krmení' : $typeOrResult]));
    if (ir_table_exists($pdo, 'wp_ir2_skupiny_historie')) {
        $cnt = count($out['ids']);
        $pdo->prepare('INSERT INTO wp_ir2_skupiny_historie(user_id,skupina_id,typ,zmena,stav_po,datum,detail) VALUES(?,?,?,0,?,NOW(),?)')
            ->execute([$uid, $groupId, ($isFeed ? 'Krmení' : $typeOrResult).' ×'.$cnt, count($members), ir_batch_summary_text($out['summary'])]);
    }
    return $out;
}

function ir_batch_summary_text(array $summary): string {
    $parts = [];
    foreach ($summary as $k => $n) $parts[] = $n.' '.mb_strtolower(IR_FEED_RESULTS[$k]['label'] ?? (string)$k, 'UTF-8');
    return implode(' · ', $parts);
}

/**
 * Historical correction of one event. performed_at (datum) is kept unless $patch['performed_at'] is given.
 * Feeding result changes re-apply the semantics (stock/supplement undone for the old result, applied for new).
 */
function ir_event_update(PDO $pdo, int $uid, int $id, array $patch): void {
    $own = !$pdo->inTransaction();
    if ($own) $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT * FROM wp_ir2_pece WHERE user_id=? AND id=? LIMIT 1 FOR UPDATE'); $q->execute([$uid, $id]);
        $old = $q->fetch(); if (!$old) throw new RuntimeException('Záznam nebyl nalezen.');
        $oldResult = ir_event_result($old);
        $newResult = array_key_exists('result', $patch) && $patch['result'] !== '' ? (string)$patch['result'] : $oldResult;
        $performed = isset($patch['performed_at']) && $patch['performed_at'] !== '' ? date('Y-m-d H:i:s', strtotime((string)$patch['performed_at']) ?: strtotime((string)$old['datum'])) : (string)$old['datum'];
        $feed = array_key_exists('feed', $patch) ? trim((string)$patch['feed']) : trim((string)($old['krmivo'] ?? ir_activity_base_feed($old)));
        $note = array_key_exists('note', $patch) ? trim((string)$patch['note']) : (string)($old['detail'] ?? '');
        $qty = array_key_exists('qty', $patch) ? ($patch['qty'] === '' || $patch['qty'] === null ? null : (float)str_replace(',', '.', (string)$patch['qty'])) : ($old['mnozstvi'] ?? null);
        $feeding = ir_is_feeding_family((string)$old['typ'], $oldResult);
        if ($feeding && $newResult !== $oldResult || $feeding && ($feed !== trim((string)($old['krmivo'] ?? '')) || (string)$qty !== (string)($old['mnozstvi'] ?? '')) && $newResult === 'eaten') {
            // re-apply feeding semantics on the SAME id (history position and performed_at preserved)
            $newType = IR_FEED_RESULTS[$newResult]['typ'] ?? (string)$old['typ'];
            if ((string)$old['typ'] === 'Krmení') {
                if (!ir_undo_supplement_effect($pdo, $uid, $old)) throw new RuntimeException('Tento starší záznam krmení už navazuje na další suplementační krok. Opravte nejdřív novější krmení.');
                // restore exactly what was consumed: clean feed name (krmivo) × stored quantity
                $oq = (float)($old['mnozstvi'] ?? 0);
                $oldFeed = trim((string)($old['krmivo'] ?? '')) !== '' ? trim((string)$old['krmivo']) : ir_activity_base_feed($old);
                ir_feed_inventory_increment($pdo, $uid, $oq > 1 && !preg_match('/^\s*[0-9]+(?:[.,][0-9]+)?\s*[×x]/u', $oldFeed) ? rtrim(rtrim(number_format($oq, 2, '.', ''), '0'), '.').'× '.$oldFeed : $oldFeed);
            }
            $animal = ir_animal($pdo, $uid, (int)$old['zvire_id']);
            $value = $newResult === 'in_shed' ? 'Ve svleku' : ($newResult === 'not_fed' ? 'Nekrmeno' : $feed);
            $effect = ['version' => 2, 'source' => 'none', 'base_feed' => ''];
            $supp = null; $stockValue = $value;
            if ($newResult === 'eaten' && $animal) {
                if ($feed === '') $feed = ir_animal_default_feed_value($pdo, $uid, $animal);
                $rec = ir_supplement_recommendation($pdo, $uid, $animal, substr($performed, 0, 10));
                $supp = (string)($rec['winner']['name'] ?? '') ?: null;
                $value = ir_compose_feed_value($feed, $supp);
                $effect = ir_supplement_snapshot($pdo, $uid, (int)$old['zvire_id'], $rec, $feed);
                $stockValue = ($qty !== null && $qty > 1) ? rtrim(rtrim(number_format((float)$qty, 2, '.', ''), '0'), '.').'× '.$feed : $feed;
                ir_feed_inventory_decrement($pdo, $uid, $stockValue);
                ir_advance_supplement_after_feeding($pdo, $uid, $animal, $rec, substr($performed, 0, 10));
            }
            $pdo->prepare('UPDATE wp_ir2_pece SET typ=?,datum=?,hodnota=?,detail=?,supplement_effect=? WHERE id=? AND user_id=?')
                ->execute([$newType, $performed, $value !== '' ? $value : null, $note !== '' ? $note : null, json_encode($effect, JSON_UNESCAPED_UNICODE), $id, $uid]);
            if ($newResult === 'eaten') ir_finish_supplement_effect($pdo, $uid, $id, (int)$old['zvire_id'], $effect);
            if (ir_events_ready($pdo)) $pdo->prepare('UPDATE wp_ir2_pece SET vysledek=?,krmivo=?,mnozstvi=?,suplement=?,upraveno=NOW(),upravil_id=? WHERE id=? AND user_id=?')->execute([$newResult, $feed ?: null, $qty, $supp, ir_actor_id() ?: null, $id, $uid]);
            if ($animal) ir_resync_feed_task($pdo, $uid, (int)$old['zvire_id']);
        } else {
            $value = array_key_exists('value', $patch) ? trim((string)$patch['value']) : (string)($old['hodnota'] ?? '');
            $pdo->prepare('UPDATE wp_ir2_pece SET datum=?,hodnota=?,detail=? WHERE id=? AND user_id=?')->execute([$performed, $value !== '' ? $value : null, $note !== '' ? $note : null, $id, $uid]);
            if (ir_events_ready($pdo)) $pdo->prepare('UPDATE wp_ir2_pece SET vysledek=COALESCE(?,vysledek),mnozstvi=?,upraveno=NOW(),upravil_id=? WHERE id=? AND user_id=?')->execute([$newResult, $qty, ir_actor_id() ?: null, $id, $uid]);
        }
        $q = $pdo->prepare('SELECT * FROM wp_ir2_pece WHERE id=?'); $q->execute([$id]);
        ir_audit($pdo, 'event', $id, 'update', $old, $q->fetch());
        if ($own) $pdo->commit();
    } catch (Throwable $ex) {
        if ($own && $pdo->inTransaction()) $pdo->rollBack();
        throw $ex;
    }
}

/** Soft delete: row moved to the recycle bin (restorable), effects undone. */
function ir_event_delete(PDO $pdo, int $uid, int $id): void {
    $own = !$pdo->inTransaction();
    if ($own) $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT * FROM wp_ir2_pece WHERE user_id=? AND id=? LIMIT 1 FOR UPDATE'); $q->execute([$uid, $id]);
        $old = $q->fetch(); if (!$old) { if ($own) $pdo->commit(); return; }
        if (ir_table_exists($pdo, 'wp_ir2_pece_kos')) $pdo->prepare('INSERT INTO wp_ir2_pece_kos(user_id,pece_id,zvire_id,row_json,smazano,smazal_id) VALUES(?,?,?,?,NOW(),?)')->execute([$uid, $id, (int)$old['zvire_id'], json_encode($old, JSON_UNESCAPED_UNICODE), ir_actor_id() ?: null]);
        ir_delete_activity($pdo, $uid, $id);
        ir_audit($pdo, 'event', $id, 'delete', $old, null);
        if ($own) $pdo->commit();
    } catch (Throwable $ex) {
        if ($own && $pdo->inTransaction()) $pdo->rollBack();
        throw $ex;
    }
}
/** Restore from the recycle bin (re-applies feeding semantics through the service). */
function ir_event_restore(PDO $pdo, int $uid, int $binId): int {
    $q = $pdo->prepare('SELECT * FROM wp_ir2_pece_kos WHERE user_id=? AND id=? AND obnoveno IS NULL'); $q->execute([$uid, $binId]);
    $b = $q->fetch(); if (!$b) throw new RuntimeException('Položka koše nebyla nalezena.');
    $row = json_decode((string)$b['row_json'], true) ?: [];
    $newId = ir_event_record($pdo, $uid, ['animal_id' => (int)$row['zvire_id'], 'type' => (string)$row['typ'], 'result' => $row['vysledek'] ?? ir_event_result($row), 'performed_at' => (string)$row['datum'], 'feed' => (string)($row['krmivo'] ?? ir_activity_base_feed($row)), 'value' => (string)($row['hodnota'] ?? ''), 'qty' => $row['mnozstvi'] ?? null, 'note' => (string)($row['detail'] ?? ''), 'source' => (string)($row['zdroj'] ?? 'manual'), 'batch_id' => $row['davka_id'] ?? null, 'group_id' => $row['skupina_id'] ?? null, 'allow_duplicate' => true]);
    $pdo->prepare('UPDATE wp_ir2_pece_kos SET obnoveno=NOW() WHERE id=?')->execute([$binId]);
    return $newId;
}

// ============================================================================ feeding intelligence (appetite)
/** Appetite summary of one animal (weight is optional elsewhere — food intake is the primary signal). */
function ir_appetite(PDO $pdo, int $uid, array $animal): array {
    $aid = (int)$animal['id'];
    $q = $pdo->prepare("SELECT id,typ,datum,hodnota".(ir_events_ready($pdo) ? ',vysledek,krmivo' : '')." FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ IN ('Krmení','Odmítnutí potravy','Nekrmeno') ORDER BY datum DESC,id DESC LIMIT 60");
    $q->execute([$uid, $aid]);
    $rows = $q->fetchAll() ?: [];
    $lastOk = null; $lastOffered = null; $consecutive = 0; $counting = true; $history = [];
    foreach ($rows as $r) {
        $res = ir_event_result($r) ?? ((string)$r['typ'] === 'Nekrmeno' ? 'not_fed' : null);
        $history[] = ['date' => substr((string)$r['datum'], 0, 10), 'result' => $res, 'feed' => (string)($r['krmivo'] ?? $r['hodnota'] ?? '')];
        if (in_array($res, ['eaten', 'refused'], true) && $lastOffered === null) $lastOffered = $r;
        if ($res === 'eaten' && $lastOk === null) $lastOk = $r;
        if ($counting) {
            if ($res === 'refused') $consecutive++;
            elseif ($res === 'eaten') $counting = false; // in_shed / not_fed never count and never break the streak
        }
    }
    $threshold = (int)($animal['prah_odmitnuti'] ?? 0) ?: (int)ir_user_setting_get($pdo, $uid, 'refusal_alert_threshold', '3');
    $days = $lastOk ? (int)floor((strtotime(date('Y-m-d')) - strtotime(substr((string)$lastOk['datum'], 0, 10))) / 86400) : null;
    $next = ir_scalar($pdo, "SELECT MIN(datum_termin) FROM wp_ir2_planovac WHERE user_id=? AND zvire_id=? AND stav='Aktivní' AND (poznamka LIKE '[IR-CORE:FEED:%' OR poznamka LIKE '[IR-CORE:REFEED:%')", [$uid, $aid], null);
    return ['last_success' => $lastOk, 'last_offered' => $lastOffered, 'consecutive_refusals' => $consecutive, 'threshold' => $threshold, 'alert' => $consecutive >= $threshold && $threshold > 0,
        'days_since_success' => $days, 'last_feed_item' => $lastOk ? (string)($lastOk['krmivo'] ?? ir_activity_base_feed($lastOk)) : '', 'next_plan' => $next, 'history' => array_reverse(array_slice($history, 0, 24))];
}

// ============================================================================ shed intelligence
/**
 * Shed estimate from the animal's OWN completed-shed intervals: a WINDOW (never a fake exact date).
 * States: insufficient | later | approaching | window | observed (in shed now).
 */
function ir_shed_estimate(PDO $pdo, int $uid, array $animal): array {
    $aid = (int)$animal['id'];
    $q = $pdo->prepare("SELECT datum".(ir_events_ready($pdo) ? ',vysledek' : '')." FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ='Svlek' ORDER BY datum");
    $q->execute([$uid, $aid]);
    $done = []; $observed = null;
    foreach ($q->fetchAll() ?: [] as $r) {
        if (($r['vysledek'] ?? 'completed') === 'observed') $observed = substr((string)$r['datum'], 0, 10);
        else { $done[] = substr((string)$r['datum'], 0, 10); if ($observed && $observed <= end($done)) $observed = null; }
    }
    // "in shed" feeding results are shed evidence too
    if (ir_events_ready($pdo)) {
        $x = ir_scalar($pdo, "SELECT MAX(DATE(datum)) FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND vysledek='in_shed'", [$uid, $aid], null);
        if ($x && (!$done || $x > end($done)) && (!$observed || $x > $observed)) $observed = (string)$x;
    }
    $last = $done ? end($done) : null;
    $intervals = [];
    for ($i = 1; $i < count($done); $i++) { $d = (int)round((strtotime($done[$i]) - strtotime($done[$i - 1])) / 86400); if ($d >= 5 && $d <= 400) $intervals[] = $d; }
    $out = ['last' => $last, 'observed' => $observed, 'intervals' => $intervals, 'state' => 'insufficient', 'from' => null, 'to' => null, 'median' => null];
    if ($observed) { $out['state'] = 'observed'; return $out; }
    if (count($intervals) < 2 || !$last) return $out;
    sort($intervals);
    $n = count($intervals); $median = $n % 2 ? $intervals[intdiv($n, 2)] : (int)round(($intervals[$n / 2 - 1] + $intervals[$n / 2]) / 2);
    $spread = max(3, (int)round(($intervals[$n - 1] - $intervals[0]) / 2));
    $from = date('Y-m-d', strtotime($last.' +'.max(1, $median - $spread).' days'));
    $to = date('Y-m-d', strtotime($last.' +'.($median + $spread).' days'));
    $today = date('Y-m-d');
    $state = $today > $to ? 'window' : ($today >= $from ? 'window' : ((strtotime($from) - strtotime($today)) / 86400 <= 7 ? 'approaching' : 'later'));
    return array_merge($out, ['state' => $state, 'from' => $from, 'to' => $to, 'median' => $median, 'overdue' => $today > $to]);
}
const IR_SHED_STATES = ['insufficient' => 'Nedostatek dat', 'later' => 'Později', 'approaching' => 'Blíží se', 'window' => 'Okno aktivní', 'observed' => 'Ve svleku'];

// ============================================================================ grouped activity history
/** Human day label: DNES / VČERA / 27. 9. 2026. */
function ir_human_day(string $date): string {
    $d = substr($date, 0, 10);
    if ($d === date('Y-m-d')) return 'DNES';
    if ($d === date('Y-m-d', strtotime('-1 day'))) return 'VČERA';
    $ts = strtotime($d);
    return (int)date('j', $ts).'. '.(int)date('n', $ts).'. '.date('Y', $ts);
}
/**
 * Activity history grouped by day → (batch | type) with counts and result summaries. No misleading times.
 * $f = [from,to,type,animal_id,species,enclosure_id,limit_days]
 */
function ir_history_groups(PDO $pdo, int $uid, array $f = [], int $maxRows = 2000): array {
    $w = ['p.user_id=?']; $a = [$uid];
    if (!empty($f['from'])) { $w[] = 'DATE(p.datum)>=?'; $a[] = $f['from']; }
    if (!empty($f['to'])) { $w[] = 'DATE(p.datum)<=?'; $a[] = $f['to']; }
    if (!empty($f['type'])) { if ($f['type'] === 'feeding') $w[] = "p.typ IN ('Krmení','Odmítnutí potravy','Nekrmeno')"; else { $w[] = 'p.typ=?'; $a[] = $f['type']; } }
    if (!empty($f['animal_id'])) { $w[] = 'p.zvire_id=?'; $a[] = (int)$f['animal_id']; }
    if (!empty($f['species'])) { $w[] = '(z.latinsky_nazev LIKE ? OR z.druh LIKE ?)'; $a[] = '%'.$f['species'].'%'; $a[] = '%'.$f['species'].'%'; }
    if (!empty($f['enclosure_id'])) { $w[] = 'z.ubikace_id=?'; $a[] = (int)$f['enclosure_id']; }
    $cols = 'p.*,z.jmeno_kod,z.latinsky_nazev,z.druh,z.foto,z.animal_id AS animal_code,z.ubikace_id,u.nazev AS ubikace_nazev';
    $sql = "SELECT $cols FROM wp_ir2_pece p JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id LEFT JOIN wp_ir2_ubikace u ON u.id=z.ubikace_id AND u.user_id=z.user_id WHERE ".implode(' AND ', $w).' ORDER BY p.datum DESC, p.id DESC LIMIT '.max(1, min(20000, $maxRows));
    $q = $pdo->prepare($sql); $q->execute($a);
    $days = [];
    foreach ($q->fetchAll() ?: [] as $r) {
        $day = substr((string)$r['datum'], 0, 10);
        $feeding = in_array((string)$r['typ'], IR_FEEDING_TYPES, true);
        $key = !empty($r['davka_id']) ? 'b:'.$r['davka_id'] : ($feeding ? 'feed:'.$day : 't:'.$r['typ'].':'.$day);
        $days[$day]['label'] = ir_human_day($day);
        $g = &$days[$day]['groups'][$key];
        $g['key'] = $key; $g['day'] = $day; $g['type'] = $feeding ? 'Krmení' : (string)$r['typ']; $g['batch'] = $r['davka_id'] ?? null;
        $g['rows'][] = $r;
        $res = $feeding ? (ir_event_result($r) ?? 'not_fed') : '_';
        $g['summary'][$res] = ($g['summary'][$res] ?? 0) + 1;
        unset($g);
    }
    foreach ($days as &$d) $d['groups'] = array_values($d['groups']);
    return $days;
}
