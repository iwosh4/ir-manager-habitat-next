<?php
declare(strict_types=1);
/*
 * JSON API (same-origin fetch from the app + Habitat Studio). Session auth, X-CSRF-Token on every mutation,
 * permission + read-only guard, account scoping in every service. ?a=<action>
 */
define('IR_API', true);
require __DIR__.'/includes/config.php';
require_once __DIR__.'/includes/reptile_core.php';

if (empty($_SESSION['user_id'])) ir_json(['ok' => false, 'error' => 'auth', 'message' => 'Přihlaste se znovu.'], 401);
require_once __DIR__.'/includes/live.php'; // photo URL helper
$uid = ir_current_user_id();
$action = (string)($_GET['a'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$raw = $method === 'POST' ? (string)file_get_contents('php://input') : '';
$in = [];
if ($method === 'POST') {
    ir_verify_csrf_header();
    $in = str_contains((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') ? (json_decode($raw, true) ?: []) : $_POST;
}
$req = static function (string $k, $d = null) use ($in) { return $in[$k] ?? $_GET[$k] ?? $d; };
$mut = static function (string $perm = 'write') use ($method): void {
    if ($method !== 'POST') ir_json(['ok' => false, 'error' => 'method'], 405);
    if (!ir_can($perm)) ir_json(['ok' => false, 'error' => 'forbidden', 'message' => 'K této akci nemáte oprávnění.'], 403);
};

try {
    switch ($action) {
        // ------------------------------------------------------------------------------------------ events
        case 'events.record': {
            $mut(); ir_rate_limit('events', 240, 60);
            $e = [
                'animal_id' => (int)$req('animal_id', 0), 'type' => (string)$req('type', ''), 'result' => (string)$req('result', ''),
                'performed_at' => (string)$req('performed_at', ''), 'feed' => (string)$req('feed', ''), 'qty' => $req('qty'),
                'value' => (string)$req('value', ''), 'note' => (string)$req('note', ''), 'source' => (string)$req('source', 'manual'),
                'planner_task_id' => (int)$req('planner_task_id', 0), 'allow_duplicate' => (bool)$req('allow_duplicate', false),
                'supplement' => (string)$req('supplement', ''),
            ];
            if ($e['result'] === '') unset($e['result']);
            try { $id = ir_event_record($pdo, $uid, $e); }
            catch (IrDuplicateEvent $d) { ir_json(['ok' => false, 'error' => 'duplicate', 'message' => $d->getMessage(), 'existing_id' => $d->existingId ?? null], 409); }
            $a = ir_animal($pdo, $uid, $e['animal_id']);
            ir_json(['ok' => true, 'id' => $id, 'appetite' => $a ? ir_appetite($pdo, $uid, $a) : null, 'shed' => $a ? ir_shed_estimate($pdo, $uid, $a) : null]);
        }
        case 'events.batch': {
            $mut(); ir_rate_limit('events', 240, 60);
            $items = array_values(array_filter((array)$req('items', []), 'is_array'));
            if (!$items || count($items) > 300) throw new RuntimeException('Neplatný počet záznamů.');
            $out = ir_event_batch($pdo, $uid, $items, ['source' => (string)$req('source', 'bulk'), 'performed_at' => (string)$req('performed_at', ''), 'type' => (string)$req('type', '')]);
            ir_json(['ok' => true] + $out + ['text' => ir_batch_summary_text($out['summary'])]);
        }
        case 'events.group': {
            $mut();
            $out = ir_event_group($pdo, $uid, (int)$req('group_id', 0), (string)$req('result', 'eaten'), array_map('strval', (array)$req('results', [])), ['source' => (string)$req('source', 'manual'), 'feed' => (string)$req('feed', ''), 'qty_each' => $req('qty_each'), 'performed_at' => (string)$req('performed_at', ''), 'note' => (string)$req('note', ''), 'notes' => (array)$req('notes', []), 'planner_task_id' => (int)$req('planner_task_id', 0) ?: null]);
            ir_json(['ok' => true] + $out + ['text' => ir_batch_summary_text($out['summary'])]);
        }
        case 'groups.members': {
            ir_require_perm('read');
            $gid = (int)$req('group_id', 0);
            $g = $pdo->prepare('SELECT id, nazev, main_animal_id FROM wp_ir2_skupiny WHERE user_id=? AND id=?'); $g->execute([$uid, $gid]); $g = $g->fetch();
            if (!$g) throw new RuntimeException('Skupina nebyla nalezena.');
            $out = [];
            foreach (ir_group_members($pdo, $uid, $gid) as $m) {
                if ((int)$m['id'] === (int)$g['main_animal_id']) continue; // the representative card is not an individual
                $ap = ir_appetite($pdo, $uid, $m); $sh = ir_shed_estimate($pdo, $uid, $m);
                $out[] = ['id' => (int)$m['id'], 'name' => (string)$m['jmeno_kod'], 'code' => (string)($m['animal_id'] ?? ''), 'sex' => (string)($m['pohlavi'] ?? ''), 'latin' => (string)$m['latinsky_nazev'], 'photo' => ir_asset_photo_url((string)($m['foto'] ?? '')), 'feed' => (string)($m['potrava'] ?? ''),
                    'refusals' => (int)$ap['consecutive_refusals'], 'alert' => (bool)$ap['alert'], 'shed' => (string)($sh['state'] ?? ''), 'locked' => ir_animal_is_locked($pdo, $uid, (int)$m['id'])];
            }
            ir_json(['ok' => true, 'group' => ['id' => (int)$g['id'], 'name' => (string)$g['nazev']], 'members' => $out]);
        }
        case 'events.update': {
            $mut();
            $patch = array_intersect_key((array)$req('patch', []), array_flip(['result', 'type', 'performed_at', 'feed', 'qty', 'value', 'note', 'supplement']));
            ir_event_update($pdo, $uid, (int)$req('id', 0), $patch);
            ir_json(['ok' => true]);
        }
        case 'events.delete': { $mut('delete'); ir_json(['ok' => true, 'bin_id' => ir_event_delete($pdo, $uid, (int)$req('id', 0))]); }
        case 'events.restore': { $mut(); ir_json(['ok' => true, 'id' => ir_event_restore($pdo, $uid, (int)$req('bin_id', 0))]); }
        case 'events.history': {
            ir_require_perm('read');
            $f = array_intersect_key($_GET, array_flip(['animal_id', 'group_id', 'type', 'result', 'source', 'from', 'to', 'q']));
            ir_json(['ok' => true, 'groups' => ir_history_groups($pdo, $uid, $f, 1000)]);
        }
        // ------------------------------------------------------------------------------------------ animals / QR
        case 'animals.search': {
            ir_require_perm('read');
            $q = trim((string)$req('q', ''));
            $st = $pdo->prepare('SELECT z.id, z.jmeno_kod, z.druh, z.latinsky_nazev, z.pohlavi, z.foto, z.status_chovu, u.nazev AS ubikace FROM wp_ir2_zvirata z LEFT JOIN wp_ir2_ubikace u ON u.id=z.ubikace_id AND u.user_id=z.user_id WHERE z.user_id=? AND '.ir_status_active_sql('z').' AND (?="" OR z.jmeno_kod LIKE ? OR z.druh LIKE ? OR z.latinsky_nazev LIKE ? OR z.animal_id LIKE ?) ORDER BY z.jmeno_kod LIMIT 40');
            $like = '%'.$q.'%'; $st->execute([$uid, $q, $like, $like, $like, $like]);
            ir_json(['ok' => true, 'items' => $st->fetchAll() ?: []]);
        }
        case 'animals.archive': { $mut('delete'); ir_animal_archive($pdo, $uid, (int)$req('id', 0), (string)$req('reason', 'Archiv')); ir_json(['ok' => true]); }
        case 'animals.restore': { $mut(); ir_animal_restore($pdo, $uid, (int)$req('id', 0)); ir_json(['ok' => true]); }
        case 'qr.resolve': {
            ir_require_perm('read'); ir_rate_limit('qr', 120, 60);
            $r = ir_qr_resolve($pdo, $uid, (string)$req('code', ''));
            if (!$r) ir_json(['ok' => false, 'error' => 'not_found', 'message' => 'Kód nepatří k žádnému zvířeti ani ubikaci tohoto účtu.'], 404);
            $row = $r['row'];
            $out = ['ok' => true, 'kind' => $r['kind'], 'id' => $r['id'], 'action' => $r['action'] ?? '', 'photo' => $r['kind'] === 'animal' && function_exists('ir_asset_photo_url') ? ir_asset_photo_url((string)($row['foto'] ?? '')) : '', 'name' => (string)($row['jmeno_kod'] ?? $row['nazev'] ?? ''), 'url' => $r['kind'] === 'animal' ? 'animal.php?id='.$r['id'] : 'habitats.php?view=overview&id='.$r['id']];
            if ($r['kind'] === 'animal') { $out['species'] = (string)($row['druh'] ?? ''); $out['latin'] = (string)($row['latinsky_nazev'] ?? ''); $out['locked'] = ir_animal_is_locked($pdo, $uid, $r['id']); $out['appetite'] = ir_appetite($pdo, $uid, $row); $out['shed'] = ir_shed_estimate($pdo, $uid, $row); $out['feed'] = (string)($row['potrava'] ?? ''); $out['archived'] = !empty($row['archivovano']); }
            else { $st = $pdo->prepare('SELECT id, jmeno_kod FROM wp_ir2_zvirata z WHERE z.user_id=? AND z.ubikace_id=? AND '.ir_status_active_sql('z')); $st->execute([$uid, $r['id']]); $out['animals'] = $st->fetchAll() ?: []; }
            ir_json($out);
        }
        // ------------------------------------------------------------------------------------------ taxonomy
        case 'taxonomy.search': { ir_require_perm('read'); ir_json(['ok' => true, 'items' => ir_taxon_search($pdo, $uid, (string)$req('q', ''), (int)$req('limit', 12))]); }
        case 'taxonomy.create': {
            $mut();
            $id = ir_taxon_create($pdo, $uid, (array)$in);
            $st = $pdo->prepare('SELECT id,latinsky_nazev,cesky_nazev,anglicky_nazev,poddruh,kategorie_chovu FROM wp_ir2_druhy WHERE id=? AND user_id=?'); $st->execute([$id, $uid]);
            ir_json(['ok' => true, 'id' => $id, 'taxon' => $st->fetch()]);
        }
        case 'voice.vocabulary': {
            ir_require_perm('read');
            $st = $pdo->prepare("SELECT z.id, z.animal_id AS code, z.jmeno_kod AS name, z.latinsky_nazev AS latin, z.druh AS species, z.potrava AS feed, COALESCE(z.pohlavi,'') AS sex, u.nazev AS enclosure FROM wp_ir2_zvirata z LEFT JOIN wp_ir2_ubikace u ON u.id=z.ubikace_id AND u.user_id=z.user_id WHERE z.user_id=? AND ".ir_status_active_sql('z')." ORDER BY z.jmeno_kod");
            $st->execute([$uid]); $animals = $st->fetchAll() ?: [];
            if (ir_table_exists($pdo, 'wp_ir2_voice_aliases')) {
                $al = $pdo->prepare('SELECT zvire_id, alias FROM wp_ir2_voice_aliases WHERE user_id=?'); $al->execute([$uid]);
                $by = []; foreach ($al->fetchAll() ?: [] as $r) $by[(int)$r['zvire_id']][] = (string)$r['alias'];
                foreach ($animals as &$a) $a['aliases'] = $by[(int)$a['id']] ?? []; unset($a);
            }
            $g = ir_table_exists($pdo, 'wp_ir2_skupiny') ? $pdo->prepare("SELECT id, nazev AS name FROM wp_ir2_skupiny WHERE user_id=? AND status='Aktivní'") : null;
            $groups = []; if ($g) { $g->execute([$uid]); $groups = $g->fetchAll() ?: []; }
            ir_json(['ok' => true, 'animals' => $animals, 'groups' => $groups, 'taxa' => ir_taxon_vocabulary($pdo, $uid)]);
        }
        // ------------------------------------------------------------------------------------------ enclosures
        case 'enclosures.clone': {
            $mut();
            $ids = ir_enclosure_clone($pdo, $uid, (int)$req('id', 0), (int)$req('count', 1), ['names' => (array)$req('names', [])] + ($req('rack_id') !== null ? ['rack_id' => (int)$req('rack_id')] : []));
            ir_json(['ok' => true, 'ids' => $ids]);
        }
        case 'enclosures.archive': { $mut('delete'); ir_enclosure_archive($pdo, $uid, (int)$req('id', 0)); ir_json(['ok' => true]); }
        case 'enclosures.restore': { $mut(); ir_enclosure_restore($pdo, $uid, (int)$req('id', 0)); ir_json(['ok' => true]); }
        // ------------------------------------------------------------------------------------------ habitat
        case 'habitat.load': { ir_require_perm('read'); ir_json(['ok' => true] + ir_habitat_load($pdo, $uid, (string)$req('room', 'main'))); }
        case 'habitat.save': {
            $mut(); ir_rate_limit('habitat', 60, 60);
            try { $r = ir_habitat_save($pdo, $uid, (string)$req('room', 'main'), (array)$req('doc', []), (int)$req('revision', 0)); }
            catch (RuntimeException $e) {
                if (str_starts_with($e->getMessage(), 'conflict:')) ir_json(['ok' => false, 'error' => 'conflict', 'revision' => (int)substr($e->getMessage(), 9), 'message' => 'Místnost mezitím uložil jiný panel nebo zařízení. Načtěte aktuální verzi.'], 409);
                throw $e;
            }
            ir_json(['ok' => true] + $r);
        }
        // ------------------------------------------------------------------------------------------ files
        case 'files.list': { ir_require_perm('read'); ir_json(['ok' => true, 'items' => array_map(static fn($f) => ['id' => (int)$f['id'], 'name' => $f['original_name'], 'mime' => $f['mime'], 'size' => ir_human_size((int)$f['size_bytes']), 'kind' => $f['kind'], 'created_at' => $f['created_at'], 'preview' => ir_file_is_previewable($f)], ir_files_for($pdo, $uid, (string)$req('entity', ''), (int)$req('entity_id', 0)))]); }
        case 'files.upload': {
            $mut(); ir_rate_limit('upload', 30, 60);
            $f = $_FILES['file'] ?? null; if (!$f) throw new RuntimeException('Nebyl vybrán žádný soubor.');
            if ($b = ir_storage_block($pdo, $uid, (int)($f['size'] ?? 0))) ir_json(['ok' => false, 'error' => 'quota', 'message' => $b], 402);
            $entity = (string)$req('entity', ''); $eid = (int)$req('entity_id', 0);
            $own = ['health' => 'wp_ir2_zdravi', 'animal' => 'wp_ir2_zvirata', 'enclosure' => 'wp_ir2_ubikace', 'finance' => 'wp_ir2_finance', 'group' => 'wp_ir2_skupiny'][$entity] ?? null;
            if (!$own || !ir_scalar($pdo, "SELECT COUNT(*) FROM `$own` WHERE id=? AND user_id=?", [$eid, $uid], 0)) throw new RuntimeException('Záznam pro přílohu nebyl nalezen.');
            ir_json(['ok' => true, 'id' => ir_file_store($pdo, $uid, $entity, $eid, $f, (string)$req('kind', ''), (string)$req('note', ''))]);
        }
        case 'files.delete': { $mut('delete'); ir_file_delete($pdo, $uid, (int)$req('id', 0)); ir_json(['ok' => true]); }
        // ------------------------------------------------------------------------------------------ system
        case 'live.summary': { ir_require_perm('read'); $s = ir_live_summary($pdo, $uid); ir_json(['ok' => true] + $s + ['messages' => ir_live_messages($s)]); }
        case 'integrity': { ir_require_perm('export'); ir_json(['ok' => true] + ir_integrity_report($pdo, $uid)); }
        case 'ping': ir_json(['ok' => true, 'version' => IR_APP_VERSION, 'time' => date('c')]);
        default: ir_json(['ok' => false, 'error' => 'unknown_action'], 404);
    }
} catch (IrDuplicateEvent $d) {
    ir_json(['ok' => false, 'error' => 'duplicate', 'message' => $d->getMessage()], 409);
} catch (RuntimeException $e) {
    ir_json(['ok' => false, 'error' => 'invalid', 'message' => $e->getMessage()], 422);
} catch (Throwable $e) {
    error_log('IR API '.$action.': '.$e->getMessage());
    ir_json(['ok' => false, 'error' => 'server', 'message' => 'Operaci se nepodařilo dokončit. Nic nebylo uloženo.'], 500);
}
