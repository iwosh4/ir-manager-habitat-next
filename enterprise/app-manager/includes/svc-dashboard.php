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

/** LIVE strip messages from real account data (one message at a time in the UI). */
function ir_live_messages(array $s): array {
    $pl = static fn(int $n, string $one, string $few, string $many) => $n === 1 ? $one : ($n >= 2 && $n <= 4 ? $few : $many);
    $m = [];
    if ($s['tasks_overdue'] > 0) $m[] = ['prio' => true, 'icon' => 'status-warning', 'text' => $s['tasks_overdue'].' '.$pl($s['tasks_overdue'], 'úkol', 'úkoly', 'úkolů').' po termínu', 'detail' => 'otevřít plánovač', 'href' => 'tasks.php'];
    foreach (array_slice($s['appetite_alerts'], 0, 2) as $a) $m[] = ['prio' => true, 'icon' => 'feeding', 'text' => $a['name'].' · '.$a['refusals'].'× odmítnutí za sebou', 'detail' => 'zkontrolovat chuť k jídlu', 'href' => 'animal.php?id='.$a['id']];
    $m[] = ['icon' => 'tasks', 'text' => $s['tasks_today'].' '.$pl($s['tasks_today'], 'úkol', 'úkoly', 'úkolů').' dnes', 'detail' => $s['done_today'] ? $s['done_today'].' '.$pl($s['done_today'], 'záznam', 'záznamy', 'záznamů').' už zapsáno' : 'zatím nic nezapsáno', 'href' => 'tasks.php'];
    if ($s['fed_today'] || $s['refused_today']) $m[] = ['icon' => 'feeding', 'text' => 'Krmení dnes · '.$s['fed_today'].' snědlo', 'detail' => $s['refused_today'] ? $s['refused_today'].' odmítlo' : 'bez odmítnutí', 'href' => 'activities.php'];
    if ($s['shed_window'] > 0) $m[] = ['icon' => 'shedding', 'text' => $s['shed_window'].' '.$pl($s['shed_window'], 'zvíře', 'zvířata', 'zvířat').' v okně svlékání', 'detail' => 'krmení může být odmítnuto', 'href' => 'animals.php'];
    if ($s['incubating'] > 0) $m[] = ['icon' => 'reproduction', 'text' => 'Inkubace · '.$s['incubating'].' '.$pl($s['incubating'], 'snůška', 'snůšky', 'snůšek'), 'detail' => 'reprodukce', 'href' => 'clutches.php'];
    elseif ($s['repro_active'] > 0) $m[] = ['icon' => 'reproduction', 'text' => $s['repro_active'].' '.$pl($s['repro_active'], 'aktivní reprodukční cyklus', 'aktivní reprodukční cykly', 'aktivních reprodukčních cyklů'), 'detail' => 'reprodukce', 'href' => 'clutches.php'];
    if ($s['health_open'] > 0) $m[] = ['icon' => 'health', 'text' => $s['health_open'].' '.$pl($s['health_open'], 'otevřený zdravotní záznam', 'otevřené zdravotní záznamy', 'otevřených zdravotních záznamů'), 'detail' => 'zdraví', 'href' => 'health.php'];
    if ($s['low_stock'] > 0) $m[] = ['icon' => 'inventory', 'text' => 'Nízký stav skladu · '.$s['low_stock'].' '.$pl($s['low_stock'], 'položka', 'položky', 'položek'), 'detail' => 'přidat do nákupu', 'href' => 'inventory.php'];
    if (!empty($s['last_event'])) $m[] = ['icon' => 'care', 'text' => 'Poslední záznam · '.$s['last_event']['typ'].($s['last_event']['jmeno_kod'] ? ' · '.$s['last_event']['jmeno_kod'] : ''), 'detail' => ir_human_day(substr((string)$s['last_event']['datum'], 0, 10)).' '.substr((string)$s['last_event']['datum'], 11, 5), 'href' => 'activities.php'];
    $m[] = ['icon' => 'animals', 'text' => $s['animals'].' '.$pl($s['animals'], 'zvíře', 'zvířata', 'zvířat').' · '.$s['groups'].' '.$pl($s['groups'], 'skupina', 'skupiny', 'skupin').' · '.$s['enclosures'].' '.$pl($s['enclosures'], 'ubikace', 'ubikace', 'ubikací'), 'detail' => 'přehled chovu', 'href' => 'animals.php'];
    return $m;
}
