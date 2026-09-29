<?php
declare(strict_types=1);

/*
 * LIVE strip + dashboard KPIs — one account-scoped summary computed from real data (no demo values).
 * Used server-side in the shell and by api.php?a=live.summary for the 60 s refresh.
 */
function ir_live_summary(PDO $pdo, int $uid): array {
    $today = date('Y-m-d');
    $n = static fn(string $sql, array $p = []) => (int)ir_scalar($pdo, $sql, $p, 0);
    $active = ir_status_active_sql('z');
    $s = [
        'animals' => $n("SELECT COUNT(*) FROM wp_ir2_zvirata z WHERE z.user_id=? AND $active AND COALESCE(z.pohlavi,'') NOT IN ('Skupina','Pár')", [$uid]),
        'groups' => ir_table_exists($pdo, 'wp_ir2_skupiny') ? $n("SELECT COUNT(*) FROM wp_ir2_skupiny WHERE user_id=? AND status='Aktivní'", [$uid]) : 0,
        'enclosures' => $n('SELECT COUNT(*) FROM wp_ir2_ubikace u WHERE u.user_id=? AND '.ir_enclosure_live_sql($pdo, 'u'), [$uid]),
        'tasks_today' => $n("SELECT COUNT(*) FROM wp_ir2_planovac WHERE user_id=? AND stav='Aktivní' AND datum_termin=?", [$uid, $today]),
        'tasks_overdue' => $n("SELECT COUNT(*) FROM wp_ir2_planovac WHERE user_id=? AND stav='Aktivní' AND datum_termin<?", [$uid, $today]),
        'done_today' => $n("SELECT COUNT(*) FROM wp_ir2_pece WHERE user_id=? AND DATE(datum)=?", [$uid, $today]),
        'fed_today' => $n("SELECT COUNT(*) FROM wp_ir2_pece WHERE user_id=? AND DATE(datum)=? AND typ='Krmení'", [$uid, $today]),
        'refused_today' => $n("SELECT COUNT(*) FROM wp_ir2_pece WHERE user_id=? AND DATE(datum)=? AND typ='Odmítnutí potravy'", [$uid, $today]),
        'repro_active' => ir_table_exists($pdo, 'wp_ir2_snusky') ? $n("SELECT COUNT(*) FROM wp_ir2_snusky WHERE user_id=? AND stav IN ('Aktivní','Inkubace')", [$uid]) : 0,
        'incubating' => ir_table_exists($pdo, 'wp_ir2_snusky') ? $n("SELECT COUNT(*) FROM wp_ir2_snusky WHERE user_id=? AND stav='Inkubace'", [$uid]) : 0,
        'health_open' => ir_table_exists($pdo, 'wp_ir2_zdravi') ? $n("SELECT COUNT(*) FROM wp_ir2_zdravi WHERE user_id=? AND COALESCE(status,'')<>'Ukončeno'", [$uid]) : 0,
        'low_stock' => ir_table_exists($pdo, 'wp_ir2_sklad') ? $n('SELECT COUNT(*) FROM wp_ir2_sklad WHERE user_id=? AND minimum IS NOT NULL AND minimum>0 AND mnozstvi<=minimum', [$uid]) : 0,
        'finance_month' => (float)ir_scalar($pdo, "SELECT COALESCE(SUM(CASE WHEN typ='Příjem' THEN castka ELSE -castka END),0) FROM wp_ir2_finance WHERE user_id=? AND YEAR(datum)=YEAR(CURDATE()) AND MONTH(datum)=MONTH(CURDATE())", [$uid], 0),
    ];
    // appetite alerts + shed windows (bounded: active animals only)
    $alerts = []; $shed = 0;
    try {
        $st = $pdo->prepare("SELECT z.* FROM wp_ir2_zvirata z WHERE z.user_id=? AND $active AND COALESCE(z.pohlavi,'') NOT IN ('Skupina','Pár') ORDER BY z.id LIMIT 400");
        $st->execute([$uid]);
        foreach ($st->fetchAll() ?: [] as $a) {
            $ap = ir_appetite($pdo, $uid, $a);
            if (!empty($ap['alert'])) $alerts[] = ['id' => (int)$a['id'], 'name' => (string)$a['jmeno_kod'], 'refusals' => (int)$ap['consecutive_refusals']];
            $sh = ir_shed_estimate($pdo, $uid, $a);
            if (in_array($sh['state'] ?? '', ['window', 'observed'], true)) $shed++;
        }
    } catch (Throwable $e) { error_log('IR live summary: '.$e->getMessage()); }
    $s['appetite_alerts'] = $alerts;
    $s['shed_window'] = $shed;
    $last = null;
    try { $q = $pdo->prepare('SELECT p.typ, p.datum, z.jmeno_kod FROM wp_ir2_pece p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE p.user_id=? ORDER BY p.datum DESC, p.id DESC LIMIT 1'); $q->execute([$uid]); $last = $q->fetch() ?: null; } catch (Throwable) {}
    $s['last_event'] = $last;
    $s['generated_at'] = date('c');
    return $s;
}
