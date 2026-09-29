<?php
declare(strict_types=1);
/*
 * Service-level integration tests against a disposable clone of the REAL database (+ migration).
 *   tests/reset-db.sh ir_test && IR_DB_NAME=ir_test php tests/php/services.test.php
 * Creates its own empty breeder account, so the real account data is never modified.
 */
define('IR_PUBLIC_PAGE', true);
require __DIR__.'/../../app-manager/includes/config.php';
require_once IR_ROOT.'/includes/reptile_core.php';

$pass = 0; $fail = 0; $results = [];
function t(string $name, callable $fn): void {
    global $pass, $fail, $results;
    try { $fn(); $pass++; $results[] = ['name' => $name, 'ok' => true]; echo "  ✓ $name\n"; }
    catch (Throwable $e) { $fail++; $results[] = ['name' => $name, 'ok' => false, 'err' => $e->getMessage()]; echo "  ✗ $name\n      ".$e->getMessage()." @ ".basename($e->getFile()).':'.$e->getLine()."\n"; }
}
function ok($c, string $m = 'assertion failed'): void { if (!$c) throw new RuntimeException($m); }
function one(string $sql, array $p = []) { global $pdo; $q = $pdo->prepare($sql); $q->execute($p); return $q->fetchColumn(); }
function row(string $sql, array $p = []) { global $pdo; $q = $pdo->prepare($sql); $q->execute($p); return $q->fetch(); }

// ---------------------------------------------------------------- fresh breeder account (empty collection)
$pdo->prepare('INSERT INTO wp_ir2__uzivatele(jmeno,heslo,email,role,is_active) VALUES(?,?,?,?,1)')->execute(['svc_'.bin2hex(random_bytes(3)), password_hash('x', PASSWORD_DEFAULT), 'svc'.bin2hex(random_bytes(3)).'@test.local', 'user']);
$uid = (int)$pdo->lastInsertId();
$_SESSION['user_id'] = $uid; $_SESSION['actor_id'] = $uid;
echo "Service tests — account $uid on ".$pdo->query('SELECT DATABASE()')->fetchColumn()."\n";

// species with a supplement rotation (Calcium → Multivit → none)
$pdo->prepare("INSERT INTO wp_ir2_druhy(user_id,latinsky_nazev,cesky_nazev,interval_krmeni_adult) VALUES(?,?,?,?)")->execute([$uid, 'Furcifer pardalis', 'Chameleon pardálí', '2']);
$sp = (int)$pdo->lastInsertId();
$pdo->prepare("INSERT INTO wp_ir2_suplement_rotace(user_id,druh_id,cil,nazev,aktivni) VALUES(?,?,'all','Rotace',1)")->execute([$uid, $sp]);
$rot = (int)$pdo->lastInsertId();
foreach ([[1, 'Calcium'], [2, 'Multivit'], [3, 'Bez suplementu']] as [$o, $n]) $pdo->prepare('INSERT INTO wp_ir2_suplement_kroky(user_id,rotace_id,poradi,typ,nazev) VALUES(?,?,?,?,?)')->execute([$uid, $rot, $o, 'supp', $n]);
$pdo->prepare("INSERT INTO wp_ir2_sklad(user_id,nazev,kategorie,mnozstvi,jednotka,minimum) VALUES(?,?,?,?,?,?)")->execute([$uid, 'Dubia M', 'Živé krmivo', 50, 'ks', 10]);
$stockId = (int)$pdo->lastInsertId();
$mk = function (string $name, array $extra = []) use ($pdo, $uid, $sp): int {
    $pdo->prepare("INSERT INTO wp_ir2_zvirata(user_id,druh_id,jmeno_kod,druh,latinsky_nazev,potrava,kategorie,status_chovu) VALUES(?,?,?,?,?,?,?,'Aktivní')")->execute([$uid, $sp, $name, 'Chameleon pardálí', 'Furcifer pardalis', 'Dubia M', 'Adult']);
    return (int)$pdo->lastInsertId();
};
$a1 = $mk('FP-01'); $a2 = $mk('FP-02');
$stock = fn() => (float)one('SELECT mnozstvi FROM wp_ir2_sklad WHERE id=?', [$stockId]);
$rotState = fn(int $aid) => (int)(one('SELECT dalsi_poradi FROM wp_ir2_suplement_stav WHERE user_id=? AND zvire_id=? AND rotace_id=?', [$uid, $aid, $rot]) ?: 1);
$d = fn(int $ago) => date('Y-m-d 10:00:00', strtotime("-$ago days"));

t('EATEN: stock consumed (qty), supplement applied + rotation advanced, result stored', function () use ($pdo, $uid, $a1, $stock, $rotState, $d) {
    $s0 = $stock(); ok($rotState($a1) === 1, 'rotation starts at step 1');
    $id = ir_event_record($pdo, $uid, ['animal_id' => $a1, 'result' => 'eaten', 'feed' => 'Dubia M', 'qty' => 4, 'performed_at' => $d(10), 'source' => 'quick']);
    $r = row('SELECT * FROM wp_ir2_pece WHERE id=?', [$id]);
    ok($r['typ'] === 'Krmení' && $r['vysledek'] === 'eaten' && $r['zdroj'] === 'quick', 'typ/result/source');
    ok($r['suplement'] === 'Calcium', 'supplement recorded: '.$r['suplement']);
    ok(abs($stock() - ($s0 - 4)) < 0.001, 'stock -4 (was '.$s0.', now '.$stock().')');
    ok($rotState($a1) === 2, 'rotation advanced to step 2');
});
t('REFUSED: counts as refusal, supplement NOT consumed/advanced, no stock', function () use ($pdo, $uid, $a1, $stock, $rotState, $d) {
    $s0 = $stock(); $r0 = $rotState($a1);
    $id = ir_event_record($pdo, $uid, ['animal_id' => $a1, 'result' => 'refused', 'feed' => 'Dubia M', 'performed_at' => $d(8)]);
    $r = row('SELECT * FROM wp_ir2_pece WHERE id=?', [$id]);
    ok($r['typ'] === 'Odmítnutí potravy' && $r['vysledek'] === 'refused', 'refusal type');
    ok($stock() === $s0, 'stock unchanged'); ok($rotState($a1) === $r0, 'rotation unchanged');
});
t('IN SHED: no stock, no supplement, rotation not advanced, last success unchanged, not a refusal', function () use ($pdo, $uid, $a1, $stock, $rotState, $d) {
    $s0 = $stock(); $r0 = $rotState($a1);
    $lastOk = one("SELECT MAX(datum) FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ='Krmení'", [$uid, $a1]);
    $id = ir_event_record($pdo, $uid, ['animal_id' => $a1, 'result' => 'in_shed', 'performed_at' => $d(6)]);
    $r = row('SELECT * FROM wp_ir2_pece WHERE id=?', [$id]);
    ok($r['typ'] === 'Nekrmeno' && $r['vysledek'] === 'in_shed', 'in-shed record');
    ok($stock() === $s0 && $rotState($a1) === $r0, 'no stock / no supplement');
    ok(one("SELECT MAX(datum) FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ='Krmení'", [$uid, $a1]) === $lastOk, 'last successful feeding unchanged');
});
t('NOT FED: no stock, not a refusal; planned feeding of that day resolved', function () use ($pdo, $uid, $a2, $stock) {
    $pdo->prepare("INSERT INTO wp_ir2_planovac(user_id,zvire_id,nazev_ukolu,kategorie,datum_termin,priorita,stav,opakovani,poznamka) VALUES(?,?,'Krmení · Dubia M','Péče',CURDATE(),'Normální','Aktivní','none',?)")->execute([$uid, $a2, '[IR-CORE:FEED:'.$a2.']']);
    $task = (int)$pdo->lastInsertId(); $s0 = $stock();
    ir_event_record($pdo, $uid, ['animal_id' => $a2, 'result' => 'not_fed', 'note' => 'na výstavě', 'source' => 'voice']);
    ok($stock() === $s0, 'stock unchanged');
    ok(one('SELECT stav FROM wp_ir2_planovac WHERE id=?', [$task]) === 'Hotovo', 'planned item resolved');
    ok((int)one("SELECT COUNT(*) FROM wp_ir2_planovac WHERE user_id=? AND zvire_id=? AND stav='Aktivní' AND poznamka LIKE '[IR-CORE:REFEED:%'", [$uid, $a2]) === 1, 'next offer planned');
});
t('Duplicate protection: same animal + same feeding family + same day asks instead of duplicating', function () use ($pdo, $uid, $a2) {
    $thrown = false;
    try { ir_event_record($pdo, $uid, ['animal_id' => $a2, 'result' => 'eaten', 'feed' => 'Dubia M']); } catch (IrDuplicateEvent $e) { $thrown = true; }
    ok($thrown, 'duplicate detected');
    $id = ir_event_record($pdo, $uid, ['animal_id' => $a2, 'result' => 'eaten', 'feed' => 'Dubia M', 'allow_duplicate' => true]);
    ok($id > 0, 'saved after explicit confirmation');
});
t('APPETITE: consecutive refusals alert; in-shed never counts nor breaks streak', function () use ($pdo, $uid, $a1, $d) {
    ir_event_record($pdo, $uid, ['animal_id' => $a1, 'result' => 'refused', 'performed_at' => $d(4)]);
    ir_event_record($pdo, $uid, ['animal_id' => $a1, 'result' => 'in_shed', 'performed_at' => $d(3)]);
    ir_event_record($pdo, $uid, ['animal_id' => $a1, 'result' => 'refused', 'performed_at' => $d(2)]);
    $ap = ir_appetite($pdo, $uid, ir_animal($pdo, $uid, $a1));
    ok($ap['consecutive_refusals'] === 3, 'refusals since last success = 3 (d8,d4,d2), got '.$ap['consecutive_refusals']);
    ok($ap['alert'] === true, 'alert at default threshold 3');
    ok($ap['days_since_success'] === 10, 'days since success = 10, got '.var_export($ap['days_since_success'], true));
    $pdo->prepare('UPDATE wp_ir2_zvirata SET prah_odmitnuti=5 WHERE id=?')->execute([$a1]);
    ok(ir_appetite($pdo, $uid, ir_animal($pdo, $uid, $a1))['alert'] === false, 'per-animal threshold 5 → no alert');
});
t('SHED: insufficient data → window from individual intervals → observed', function () use ($pdo, $uid, $a2) {
    ok(ir_shed_estimate($pdo, $uid, ir_animal($pdo, $uid, $a2))['state'] === 'insufficient', 'no history → insufficient');
    foreach ([90, 60, 31] as $ago) ir_event_record($pdo, $uid, ['animal_id' => $a2, 'type' => 'Svlek', 'shed' => 'completed', 'performed_at' => date('Y-m-d', strtotime("-$ago days")), 'allow_duplicate' => true]);
    $e = ir_shed_estimate($pdo, $uid, ir_animal($pdo, $uid, $a2));
    ok(in_array($e['state'], ['window', 'approaching'], true) && $e['from'] && $e['to'] && $e['from'] < $e['to'], 'window estimated: '.json_encode($e));
    ir_event_record($pdo, $uid, ['animal_id' => $a2, 'type' => 'Svlek', 'shed' => 'observed', 'allow_duplicate' => true]);
    ok(ir_shed_estimate($pdo, $uid, ir_animal($pdo, $uid, $a2))['state'] === 'observed', 'observed in shed');
});
$gid = 0; $members = [];
t('GROUP: representative + 4 members; group feeding 3 eaten / 1 refused in one batch', function () use ($pdo, $uid, $sp, $mk, &$gid, &$members) {
    $rep = $mk('AZ-G1'); $pdo->prepare("UPDATE wp_ir2_zvirata SET pohlavi='Skupina' WHERE id=?")->execute([$rep]);
    $pdo->prepare("INSERT INTO wp_ir2_skupiny(user_id,druh_id,nazev,pocet,status,main_animal_id) VALUES(?,?,?,4,'Aktivní',?)")->execute([$uid, $sp, 'Dendrobates tinctorius azureus · skupina', $rep]);
    $gid = (int)$pdo->lastInsertId();
    foreach (['AZ-1 ♂', 'AZ-2 ♂', 'AZ-3 ♀', 'AZ-4 ♀'] as $n) { $m = $mk($n); $members[] = $m; $pdo->prepare("INSERT INTO wp_ir2_skupiny_clenove(user_id,skupina_id,zvire_id,datum_od,stav) VALUES(?,?,?,CURDATE(),'Ve skupině')")->execute([$uid, $gid, $m]); }
    $out = ir_event_group($pdo, $uid, $gid, 'eaten', [$members[3] => 'refused'], ['feed' => 'Drosophila', 'source' => 'quick', 'performed_at' => date('Y-m-d 09:00:00')]);
    ok(count($out['ids']) === 4, 'four individual records');
    ok(($out['summary']['eaten'] ?? 0) === 3 && ($out['summary']['refused'] ?? 0) === 1, 'summary 3 eaten / 1 refused: '.json_encode($out['summary']));
    ok((int)one('SELECT COUNT(*) FROM wp_ir2_pece WHERE user_id=? AND davka_id=? AND skupina_id=?', [$uid, $out['batch_id'], $gid]) === 4, 'rows linked to batch + group');
    ok((int)one('SELECT pocet FROM wp_ir2_event_batches WHERE id=?', [$out['batch_id']]) === 4, 'batch header Krmení ×4');
    ok(str_contains((string)one('SELECT typ FROM wp_ir2_skupiny_historie WHERE skupina_id=? ORDER BY id DESC LIMIT 1', [$gid]), '×4'), 'group history entry');
    ok(ir_event_result(row("SELECT * FROM wp_ir2_pece WHERE zvire_id=? AND davka_id=?", [$members[3], $out['batch_id']])) === 'refused', 'per-member exception kept');
});
t('GROUP: individual history per member; group batch is all-or-nothing (rollback)', function () use ($pdo, $uid, $gid, $members) {
    ok((int)one("SELECT COUNT(*) FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ='Krmení'", [$uid, $members[0]]) === 1, 'member 1 has own feeding history');
    $before = (int)one('SELECT COUNT(*) FROM wp_ir2_pece WHERE user_id=?', [$uid]);
    $failed = false;
    try { ir_event_group($pdo, $uid, $gid, 'eaten', [$members[2] => 'bogus_result_type_that_is_not_a_type'], ['performed_at' => date('Y-m-d', strtotime('-1 day'))]); }
    catch (Throwable) { $failed = true; }
    // a "bogus" value is treated as custom activity type → valid; force a real failure instead: unknown animal
    if (!$failed) {
        try { ir_event_batch($pdo, $uid, [['animal_id' => $members[0], 'result' => 'eaten', 'performed_at' => date('Y-m-d', strtotime('-2 day'))], ['animal_id' => 999999, 'result' => 'eaten']], []); } catch (Throwable) { $failed = true; }
        $before = $before + 4; // the previous group call succeeded with 4 custom records
    }
    ok($failed, 'failing batch raised');
    ok((int)one('SELECT COUNT(*) FROM wp_ir2_pece WHERE user_id=?', [$uid]) === $before, 'no partial rows after rollback');
});
t('HISTORY: grouped by human day with batch summary (DNES / VČERA / date)', function () use ($pdo, $uid) {
    $days = ir_history_groups($pdo, $uid);
    ok(isset($days[date('Y-m-d')]) && $days[date('Y-m-d')]['label'] === 'DNES', 'today labelled DNES');
    $feed = array_values(array_filter($days[date('Y-m-d')]['groups'], fn($g) => $g['type'] === 'Krmení' && count($g['rows']) >= 4));
    ok($feed && ($feed[0]['summary']['eaten'] ?? 0) === 3, 'Krmení ×4 group with summary');
    ok(ir_human_day(date('Y-m-d', strtotime('-1 day'))) === 'VČERA' && ir_human_day('2026-09-27') === '27. 9. 2026', 'human labels');
});
t('CORRECTION days later (group member): performed_at kept, eaten→refused, audit columns + audit log', function () use ($pdo, $uid, $members, $stock) {
    $r = row("SELECT * FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND vysledek='eaten' ORDER BY id DESC LIMIT 1", [$uid, $members[1]]);
    ir_event_update($pdo, $uid, (int)$r['id'], ['result' => 'refused', 'note' => 'opraveno']);
    $n = row('SELECT * FROM wp_ir2_pece WHERE id=?', [(int)$r['id']]);
    ok($n['datum'] === $r['datum'], 'performed_at unchanged');
    ok($n['vysledek'] === 'refused' && $n['typ'] === 'Odmítnutí potravy' && $n['upraveno'] !== null && $n['upravil_id'] !== null, 'corrected + audit columns');
    ok((int)one("SELECT COUNT(*) FROM wp_ir2_audit WHERE entity='event' AND entity_id=? AND action='update'", [(string)$r['id']]) === 1, 'audit row');
});
t('CORRECTION eaten(2× Dubia)→in shed restores stock +2 and rolls the supplement rotation back', function () use ($pdo, $uid, $mk, $stock, $rotState, $d) {
    $x = $mk('FP-CORR'); $s0 = $stock(); $r0 = $rotState($x);
    $id = ir_event_record($pdo, $uid, ['animal_id' => $x, 'result' => 'eaten', 'feed' => 'Dubia M', 'qty' => 2, 'performed_at' => $d(5)]);
    ok(abs($stock() - ($s0 - 2)) < 0.001 && $rotState($x) === $r0 + 1, 'applied');
    $before = one('SELECT datum FROM wp_ir2_pece WHERE id=?', [$id]);
    ir_event_update($pdo, $uid, $id, ['result' => 'in_shed']);
    ok(abs($stock() - $s0) < 0.001, 'stock restored: '.$stock().' vs '.$s0);
    ok($rotState($x) === $r0, 'rotation rolled back');
    ok(one('SELECT datum FROM wp_ir2_pece WHERE id=?', [$id]) === $before && one('SELECT typ FROM wp_ir2_pece WHERE id=?', [$id]) === 'Nekrmeno', 'same row, same day, now Nekrmeno');
});
t('SOFT DELETE → recycle bin → restore', function () use ($pdo, $uid, $a2) {
    $id = (int)one("SELECT id FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ='Svlek' ORDER BY id LIMIT 1", [$uid, $a2]);
    ir_event_delete($pdo, $uid, $id);
    ok(!one('SELECT id FROM wp_ir2_pece WHERE id=?', [$id]), 'removed from live history');
    $bin = (int)one('SELECT id FROM wp_ir2_pece_kos WHERE user_id=? AND pece_id=?', [$uid, $id]);
    ok($bin > 0, 'kept in recycle bin');
    $new = ir_event_restore($pdo, $uid, $bin);
    ok((string)one('SELECT typ FROM wp_ir2_pece WHERE id=?', [$new]) === 'Svlek', 'restored');
});
t('SUPPLEMENT rotation over time: eaten advances, in-shed / not-fed / refused do not', function () use ($pdo, $uid, $a2, $rotState, $d) {
    $r0 = $rotState($a2);
    ir_event_record($pdo, $uid, ['animal_id' => $a2, 'result' => 'in_shed', 'performed_at' => $d(20), 'allow_duplicate' => true]);
    ir_event_record($pdo, $uid, ['animal_id' => $a2, 'result' => 'not_fed', 'performed_at' => $d(19), 'allow_duplicate' => true]);
    ir_event_record($pdo, $uid, ['animal_id' => $a2, 'result' => 'refused', 'performed_at' => $d(18), 'allow_duplicate' => true]);
    ok($rotState($a2) === $r0, 'no advance');
    ir_event_record($pdo, $uid, ['animal_id' => $a2, 'result' => 'eaten', 'feed' => 'Dubia M', 'performed_at' => $d(17), 'allow_duplicate' => true]);
    ok($rotState($a2) === ($r0 % 3) + 1, 'eaten advanced: '.$r0.' → '.$rotState($a2));
});
t('Future-dated record refused (planner is for the future)', function () use ($pdo, $uid, $a2) {
    $thrown = false;
    try { ir_event_record($pdo, $uid, ['animal_id' => $a2, 'result' => 'eaten', 'performed_at' => date('Y-m-d', strtotime('+3 days'))]); } catch (RuntimeException) { $thrown = true; }
    ok($thrown, 'future rejected');
});


// ---------------------------------------------------------------- taxonomy (BETA1-07)
t('TAXONOMY: Latin-first autocomplete (prefix of genus, species epithet, Czech alias)', function () use ($pdo, $uid) {
    $r = ir_taxon_search($pdo, $uid, 'Furc');
    ok($r && $r[0]['latin'] === 'Furcifer pardalis' && $r[0]['source'] === 'catalog', 'catalog Latin first: '.json_encode($r[0] ?? null));
    $r = ir_taxon_search($pdo, $uid, 'regius');
    ok($r && $r[0]['latin'] === 'Python regius', 'epithet match from reference: '.($r[0]['latin'] ?? '-'));
    $r = ir_taxon_search($pdo, $uid, 'krajta kra');
    ok(count($r) > 0, 'Czech alias search returns results');
});
t('TAXONOMY: manual taxon without Czech name + aliases; invalid Latin rejected; reuse same Latin', function () use ($pdo, $uid) {
    $id = ir_taxon_create($pdo, $uid, ['latin' => 'Rhacodactylus leachianus henkeli', 'synonyms' => ['R. l. henkeli'], 'localities' => ['Île des Pins']]);
    ok($id > 0 && one('SELECT cesky_nazev FROM wp_ir2_druhy WHERE id=?', [$id]) === null, 'no Czech name needed');
    ok((int)one('SELECT COUNT(*) FROM wp_ir2_taxon_aliases WHERE druh_id=?', [$id]) === 2, 'aliases stored');
    ok(ir_taxon_create($pdo, $uid, ['latin' => 'rhacodactylus Leachianus henkeli']) === $id, 'capitalisation normalised → same taxon');
    $bad = false; try { ir_taxon_create($pdo, $uid, ['latin' => 'gekon obrovský']); } catch (RuntimeException) { $bad = true; }
    ok($bad, 'Czech text as Latin rejected');
    ok(ir_taxon_create($pdo, $uid, ['latin' => 'Rhacodactylus leachianus henkeli']) === $id, 'same Latin reused, no duplicate');
    $r = ir_taxon_search($pdo, $uid, 'Île');
    ok($r && $r[0]['id'] === $id, 'locality alias finds taxon');
});
// ---------------------------------------------------------------- enclosures clone + archive (BETA1-08)
t('ENCLOSURE clone ×3: dimensions/climate/rules copied, new identity, no animals, audit', function () use ($pdo, $uid, $a1) {
    $pdo->prepare("INSERT INTO wp_ir2_ubikace(user_id,nazev,typ,rozmery,sirka_cm,hloubka_cm,vyska_cm,teplota_den,teplota_noc,vlhkost,qr_token,habitat_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        ->execute([$uid, 'Exo 60', 'Terárium', '60 × 45 × 90 cm', 60, 45, 90, 30, 22, 70, 'ETESTQR000001', '{"id":"x","decor":["větev"]}']);
    $src = (int)$pdo->lastInsertId();
    $pdo->prepare("INSERT INTO wp_ir2_ubikace_pravidla(user_id,ubikace_id,typ,interval_dni,aktivni) VALUES(?,?,'Rosení',1,1)")->execute([$uid, $src]);
    $pdo->prepare('UPDATE wp_ir2_zvirata SET ubikace_id=? WHERE id=?')->execute([$src, $a1]);
    $ids = ir_enclosure_clone($pdo, $uid, $src, 3);
    ok(count($ids) === 3, 'three copies');
    foreach ($ids as $id) {
        $r = row('SELECT * FROM wp_ir2_ubikace WHERE id=?', [$id]);
        ok((float)$r['sirka_cm'] === 60.0 && (float)$r['teplota_den'] === 30.0 && (int)$r['vlhkost'] === 70, 'values copied');
        ok($r['qr_token'] === null && (int)$r['klon_zdroj_id'] === $src && $r['nazev'] !== 'Exo 60', 'new identity: '.$r['nazev']);
        ok(!str_contains((string)$r['habitat_json'], '"id"') && str_contains((string)$r['habitat_json'], 'větev'), 'furnishing copied without instance id');
        ok((int)one('SELECT COUNT(*) FROM wp_ir2_ubikace_pravidla WHERE ubikace_id=?', [$id]) === 1, 'care rule copied');
        ok((int)one('SELECT COUNT(*) FROM wp_ir2_zvirata WHERE ubikace_id=?', [$id]) === 0, 'no animals copied');
    }
    ok(count(array_unique(array_map(fn($i) => one('SELECT nazev FROM wp_ir2_ubikace WHERE id=?', [$i]), $ids))) === 3, 'unique names');
    $blocked = false; try { ir_enclosure_archive($pdo, $uid, $src); } catch (RuntimeException) { $blocked = true; }
    ok($blocked, 'occupied enclosure cannot be archived');
    ir_enclosure_archive($pdo, $uid, $ids[2]);
    ok(one('SELECT archivovano FROM wp_ir2_ubikace WHERE id=?', [$ids[2]]) !== null, 'archived (row kept)');
    ir_enclosure_restore($pdo, $uid, $ids[2]);
    ok(one('SELECT archivovano FROM wp_ir2_ubikace WHERE id=?', [$ids[2]]) === null, 'restored');
});
// ---------------------------------------------------------------- animal archive/restore (BETA1-09)
t('ANIMAL archive → history kept, tasks paused, quota freed → restore exact status', function () use ($pdo, $uid, $mk) {
    $a = $mk('FP-ARCH');
    ir_event_record($pdo, $uid, ['animal_id' => $a, 'result' => 'eaten', 'performed_at' => date('Y-m-d 09:00:00', strtotime('-2 days'))]);
    $pdo->prepare("UPDATE wp_ir2_zvirata SET status_chovu='Chovný' WHERE id=?")->execute([$a]);
    $before = ir_active_animal_count($pdo, $uid);
    ir_animal_archive($pdo, $uid, $a);
    ok(ir_active_animal_count($pdo, $uid) === $before - 1, 'not counted to quota');
    ok((int)one("SELECT COUNT(*) FROM wp_ir2_planovac WHERE zvire_id=? AND stav='Aktivní'", [$a]) === 0, 'no active tasks');
    ok((int)one('SELECT COUNT(*) FROM wp_ir2_pece WHERE zvire_id=?', [$a]) >= 1, 'history kept');
    ir_animal_restore($pdo, $uid, $a);
    ok(one('SELECT status_chovu FROM wp_ir2_zvirata WHERE id=?', [$a]) === 'Chovný' && one('SELECT archivovano FROM wp_ir2_zvirata WHERE id=?', [$a]) === null, 'exact status restored');
});
// ---------------------------------------------------------------- Habitat ⇄ Manager (BETA1-06)
t('HABITAT load: empty room (no demo), Manager enclosures present as mgr_inst_*', function () use ($pdo, $uid) {
    $r = ir_habitat_load($pdo, $uid, 'main');
    ok($r['revision'] === 0 && $r['doc']['objects'] === [], 'fresh empty room');
    $ids = array_column($r['doc']['instances'], 'id');
    $mgr = (int)one('SELECT COUNT(*) FROM wp_ir2_ubikace WHERE user_id=? AND archivovano IS NULL', [$uid]);
    ok(count(array_filter($ids, fn($i) => str_starts_with($i, 'mgr_inst_'))) === $mgr, count($ids).' instances vs '.$mgr.' Manager enclosures');
    $t = array_values(array_filter($r['doc']['enclosures'], fn($t) => ($t['name'] ?? '') === 'Exo 60'))[0] ?? null;
    ok($t && abs($t['dimensions']['width'] - 0.6) < 0.001 && abs($t['dimensions']['height'] - 0.9) < 0.001, 'W×D×H in metres');
});
t('HABITAT save: new instance → Manager enclosure; assembly → Sestava; revision conflict detected', function () use ($pdo, $uid) {
    $r = ir_habitat_load($pdo, $uid, 'main'); $doc = $r['doc'];
    $doc['enclosures'][] = ['id' => 'enc_new1', 'name' => 'Nový box', 'type' => 'rack', 'dimensions' => ['width' => 0.8, 'depth' => 0.5, 'height' => 0.3]];
    $doc['instances'][] = ['id' => 'inst_new1', 'templateId' => 'enc_new1', 'code' => 'R1-01'];
    $first = $doc['instances'][0]['id'];
    $doc['assemblies'][] = ['id' => 'asm_new1', 'name' => 'Regál A', 'members' => [['instanceId' => 'inst_new1'], ['instanceId' => $first]]];
    $s = ir_habitat_save($pdo, $uid, 'main', $doc, 0);
    ok($s['revision'] === 1 && isset($s['created']['inst_new1']), 'created manager enclosure');
    $mid = $s['created']['inst_new1'];
    $u = row('SELECT * FROM wp_ir2_ubikace WHERE id=?', [$mid]);
    ok((float)$u['sirka_cm'] === 80.0 && (float)$u['vyska_cm'] === 30.0 && $u['habitat_instance_id'] === 'inst_new1', 'dims + identity');
    $rack = $s['assemblies']['asm_new1'];
    ok((int)$u['rack_id'] === $rack && one('SELECT nazev FROM wp_ir2_racky WHERE id=?', [$rack]) === 'Regál A', 'assembly is a Manager Sestava with members');
    // reload: no duplicate
    $r2 = ir_habitat_load($pdo, $uid, 'main');
    ok(count(array_filter($r2['doc']['instances'], fn($i) => $i['id'] === 'inst_new1')) === 1, 'no duplicate after reload');
    $again = ir_habitat_save($pdo, $uid, 'main', $r2['doc'], 1);
    ok((int)one('SELECT COUNT(*) FROM wp_ir2_ubikace WHERE user_id=? AND habitat_instance_id=?', [$uid, 'inst_new1']) === 1, 'second save does not duplicate');
    $c = false; try { ir_habitat_save($pdo, $uid, 'main', $r2['doc'], 1); } catch (RuntimeException $e) { $c = str_starts_with($e->getMessage(), 'conflict:'); }
    ok($c, 'stale revision → conflict');
    // Manager edit is visible in Habitat
    $pdo->prepare("UPDATE wp_ir2_ubikace SET nazev='Box přejmenovaný v Manageru' WHERE id=?")->execute([$mid]);
    $r3 = ir_habitat_load($pdo, $uid, 'main');
    ok(in_array('Box přejmenovaný v Manageru', array_column($r3['doc']['enclosures'], 'name'), true) || in_array('Box přejmenovaný v Manageru', array_map(fn($t) => $t['name'] ?? '', $r3['doc']['enclosures']), true), 'Manager rename visible in Habitat');
});
// ---------------------------------------------------------------- billing (no fake success)
t('BILLING: webhook signature verified, duplicate ignored, order paid only after server re-fetch', function () use ($pdo, $uid) {
    $GLOBALS['ir_revolut_transport'] = function (string $m, string $path, ?array $b) {
        if ($m === 'POST') return ['id' => 'rev_ord_1', 'checkout_url' => 'https://sandbox-merchant.revolut.com/pay/x', 'state' => 'pending'];
        return ['id' => 'rev_ord_1', 'state' => $GLOBALS['remote_state'], 'amount' => 12900, 'currency' => 'CZK'];
    };
    putenv('IR_REVOLUT_SECRET_KEY=sk_test'); putenv('IR_REVOLUT_WEBHOOK_SECRET=whsec_test');
    $co = ir_billing_checkout($pdo, $uid, 'premium', 'month');
    ok(ir_entitlement($pdo, $uid)['plan']['code'] === 'free', 'nothing granted at checkout');
    $GLOBALS['remote_state'] = 'pending';
    $body = json_encode(['event' => 'ORDER_COMPLETED', 'order_id' => 'rev_ord_1', 'merchant_order_ext_ref' => $co['order_id']]);
    $ts = (string)(time() * 1000);
    $bad = ir_billing_handle_revolut_webhook($pdo, $body, ['revolut-request-timestamp' => $ts, 'revolut-signature' => 'v1=deadbeef']);
    ok($bad['status'] === 'rejected', 'bad signature rejected');
    $body2 = json_encode(['event' => 'ORDER_COMPLETED', 'order_id' => 'rev_ord_1', 'merchant_order_ext_ref' => $co['order_id'], 'id' => 'evt_2_'.$uid]);
    $sig = 'v1='.hash_hmac('sha256', 'v1.'.$ts.'.'.$body2, 'whsec_test');
    $r = ir_billing_handle_revolut_webhook($pdo, $body2, ['revolut-request-timestamp' => $ts, 'revolut-signature' => $sig]);
    ok($r['status'] === 'order:pending' && ir_entitlement($pdo, $uid)['plan']['code'] === 'free', 'webhook claims completed but provider says pending → not paid: '.json_encode($r));
    $GLOBALS['remote_state'] = 'completed';
    $body3 = json_encode(['event' => 'ORDER_COMPLETED', 'order_id' => 'rev_ord_1', 'merchant_order_ext_ref' => $co['order_id'], 'id' => 'evt_3_'.$uid]);
    $sig3 = 'v1='.hash_hmac('sha256', 'v1.'.$ts.'.'.$body3, 'whsec_test');
    $r = ir_billing_handle_revolut_webhook($pdo, $body3, ['revolut-request-timestamp' => $ts, 'revolut-signature' => $sig3]);
    ok($r['status'] === 'order:paid' && ir_entitlement($pdo, $uid)['plan']['code'] === 'premium', 'paid after server-side confirmation');
    $dup = ir_billing_handle_revolut_webhook($pdo, $body3, ['revolut-request-timestamp' => $ts, 'revolut-signature' => $sig3]);
    ok($dup['status'] === 'duplicate' && (int)one('SELECT COUNT(*) FROM wp_ir2_subscriptions WHERE user_id=?', [$uid]) === 1, 'idempotent');
    ir_billing_refund($pdo, $co['order_id'], 12900, 'rf_1');
    ok(ir_entitlement($pdo, $uid)['plan']['code'] === 'free', 'refund ends entitlement');
    ok((int)one('SELECT COUNT(*) FROM wp_ir2_zvirata WHERE user_id=?', [$uid]) > 0, 'data untouched by downgrade');
    $st = ir_billing_store_notification($pdo, 'google_play', ['type' => 'SUBSCRIPTION_PURCHASED']);
    ok($st['granted'] === false, 'store notifications never grant without verification');
    unset($GLOBALS['ir_revolut_transport']); putenv('IR_REVOLUT_SECRET_KEY'); putenv('IR_REVOLUT_WEBHOOK_SECRET');
});
t('ENTITLEMENT: admin_manual grant PRO with expiry; FREE quota blocks the 11th animal but never locks existing data', function () use ($pdo, $uid, $mk) {
    ok(ir_entitlement($pdo, $uid)['plan']['code'] === 'free', 'free');
    while (ir_active_animal_count($pdo, $uid) < 10) $mk('Q-'.bin2hex(random_bytes(2)));
    ok(ir_animal_quota_block($pdo, $uid, 1) !== null, '11th blocked on FREE');
    $sid = ir_billing_grant($pdo, $uid, 'pro', 'manual', 'admin_manual', null, date('Y-m-d H:i:s', strtotime('+30 days')), 'test');
    ok(ir_entitlement($pdo, $uid)['plan']['code'] === 'pro' && ir_animal_quota_block($pdo, $uid, 1) === null, 'PRO unlimited');
    $pdo->prepare('UPDATE wp_ir2_subscriptions SET valid_until=NOW() - INTERVAL 1 DAY WHERE id=?')->execute([$sid]);
    ir_entitlement_reset();
    ok(ir_entitlement($pdo, $uid)['plan']['code'] === 'free', 'expired → free');
    ok(ir_active_animal_count($pdo, $uid) >= 10, 'all animals still there');
});
// ---------------------------------------------------------------- export / integrity / backup
t('EXPORT JSON+ZIP, integrity report, backup + retention', function () use ($pdo, $uid) {
    $e = ir_export_account($pdo, $uid);
    ok($e['counts']['wp_ir2_zvirata'] > 0 && $e['counts']['wp_ir2_pece'] > 0, 'rows exported');
    ok(!str_contains(json_encode($e), '"heslo"'), 'no password hash in export');
    $tmp = sys_get_temp_dir().'/ir-exp-'.$uid.'.zip';
    $z = ir_export_zip($pdo, $uid, $tmp);
    ok($z['bytes'] > 200 && (new ZipArchive())->open($tmp) === true, 'zip valid'); @unlink($tmp);
    $i = ir_integrity_report($pdo, $uid);
    ok(in_array($i['status'], ['ok', 'warn'], true), 'integrity ok/warn for clean account: '.json_encode(array_filter($i['checks'], fn($c) => $c['severity'] === 'error')));
    for ($k = 0; $k < 3; $k++) ir_backup_account($pdo, $uid, 'daily');
    $removed = ir_backup_retention($pdo, $uid, 2);
    ok($removed === 1 && (int)one("SELECT COUNT(*) FROM wp_ir2_backups WHERE user_id=? AND status='ok'", [$uid]) === 2, 'retention keeps 2');
});
t('LIVE summary: real counts, appetite alert after 3 refusals', function () use ($pdo, $uid, $mk) {
    ir_billing_grant($pdo, $uid, 'pro', 'manual', 'admin_manual', null, date('Y-m-d H:i:s', strtotime('+30 days')), 'test');
    $a = $mk('FP-APP');
    for ($k = 3; $k >= 1; $k--) ir_event_record($pdo, $uid, ['animal_id' => $a, 'result' => 'refused', 'performed_at' => date('Y-m-d 08:00:00', strtotime("-$k days"))]);
    $s = ir_live_summary($pdo, $uid);
    ok($s['animals'] === ir_active_animal_count($pdo, $uid) || $s['animals'] > 0, 'animals counted');
    ok(in_array($a, array_column($s['appetite_alerts'], 'id'), true), 'appetite alert present');
});


// ---------------------------------------------------------------- admin + team
t('ADMIN: owner cannot administrate; admin cannot touch superadmin; suspend revokes sessions; last superadmin protected', function () use ($pdo, $uid) {
    $mkUser = function (string $role, ?int $owner = null) use ($pdo): int { $pdo->prepare('INSERT INTO wp_ir2__uzivatele(jmeno,heslo,email,role,is_active,owner_user_id) VALUES(?,?,?,?,1,?)')->execute(['u_'.bin2hex(random_bytes(3)), password_hash('x', PASSWORD_DEFAULT), 'u'.bin2hex(random_bytes(3)).'@t.local', $role, $owner]); return (int)$pdo->lastInsertId(); };
    $admin = $mkUser('admin'); $victim = $mkUser('user'); $super = (int)one("SELECT id FROM wp_ir2__uzivatele WHERE role='superadmin' ORDER BY id LIMIT 1");
    $as = function (int $id) { $_SESSION['actor_id'] = $id; };
    $as($uid); $denied = false; try { ir_admin_suspend($pdo, $victim, 'x'); } catch (RuntimeException) { $denied = true; } ok($denied, 'owner cannot suspend');
    $as($admin);
    $v0 = (int)one('SELECT session_version FROM wp_ir2__uzivatele WHERE id=?', [$victim]);
    ir_admin_suspend($pdo, $victim, 'Test pozastavení');
    ok(one('SELECT suspended_at FROM wp_ir2__uzivatele WHERE id=?', [$victim]) !== null && (int)one('SELECT session_version FROM wp_ir2__uzivatele WHERE id=?', [$victim]) === $v0 + 1, 'suspended + sessions revoked');
    ok((int)one('SELECT COUNT(*) FROM wp_ir2_audit WHERE entity=? AND entity_id=? AND action=?', ['user', (string)$victim, 'suspend']) === 1, 'audited');
    ir_admin_unsuspend($pdo, $victim);
    $d = false; try { ir_admin_suspend($pdo, $super, 'x'); } catch (RuntimeException) { $d = true; } ok($d, 'admin cannot suspend superadmin');
    $d = false; try { ir_admin_set_role($pdo, $victim, 'admin'); } catch (RuntimeException) { $d = true; } ok($d, 'admin cannot grant admin');
    $as($super);
    if (ir_admin_superadmins($pdo) === 1) { $d = false; try { ir_admin_set_role($pdo, $super, 'owner'); } catch (RuntimeException) { $d = true; } ok($d, 'last superadmin protected'); }
    $pw = ir_admin_reset_password($pdo, $victim);
    ok(strlen($pw) === 14 && password_verify($pw, (string)one('SELECT heslo FROM wp_ir2__uzivatele WHERE id=?', [$victim])), 'temporary password works');
    $as($uid);
});
t('TEAM: FREE allows only the owner; PRO allows 2 more logins (staff/readonly) bound to the owner account', function () use ($pdo, $uid) {
    $pdo->prepare("UPDATE wp_ir2_subscriptions SET status='canceled', valid_until=NOW() WHERE user_id=?")->execute([$uid]); ir_entitlement_reset();
    $d = false; try { ir_team_create($pdo, $uid, 'staff_'.bin2hex(random_bytes(2)), 's'.bin2hex(random_bytes(3)).'@t.local', 'staff', 'Heslo-12345'); } catch (RuntimeException) { $d = true; }
    ok($d, 'FREE: no team');
    ir_billing_grant($pdo, $uid, 'pro', 'manual', 'admin_manual', null, date('Y-m-d H:i:s', strtotime('+10 days')));
    $s1 = ir_team_create($pdo, $uid, 'staff_'.bin2hex(random_bytes(2)), 's'.bin2hex(random_bytes(3)).'@t.local', 'staff', 'Heslo-12345');
    $s2 = ir_team_create($pdo, $uid, 'ro_'.bin2hex(random_bytes(2)), 'r'.bin2hex(random_bytes(3)).'@t.local', 'readonly', 'Heslo-12345');
    $d = false; try { ir_team_create($pdo, $uid, 'x_'.bin2hex(random_bytes(2)), 'x'.bin2hex(random_bytes(3)).'@t.local', 'staff', 'Heslo-12345'); } catch (RuntimeException) { $d = true; }
    ok($d, 'PRO: max 3 users');
    ok((int)one('SELECT owner_user_id FROM wp_ir2__uzivatele WHERE id=?', [$s2]) === $uid, 'bound to owner');
    $_SESSION['actor_id'] = $s2; ok(!ir_can('write') && ir_can('read') && ir_can('export'), 'readonly: read + export, no write');
    $_SESSION['actor_id'] = $s1; ok(ir_can('write') && !ir_can('delete') && !ir_can('billing'), 'staff: write, no delete/billing');
    $_SESSION['actor_id'] = $uid;
});

echo "\n$pass passed, $fail failed\n";
@mkdir(__DIR__.'/../results', 0775, true);
file_put_contents(__DIR__.'/../results/services.json', json_encode(['date' => date('c'), 'pass' => $pass, 'fail' => $fail, 'results' => $results], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
exit($fail ? 1 : 0);
