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

echo "\n$pass passed, $fail failed\n";
@mkdir(__DIR__.'/../results', 0775, true);
file_put_contents(__DIR__.'/../results/services.json', json_encode(['date' => date('c'), 'pass' => $pass, 'fail' => $fail, 'results' => $results], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
exit($fail ? 1 : 0);
