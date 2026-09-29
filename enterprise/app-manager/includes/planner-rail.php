<?php
declare(strict_types=1);

/*
 * PLANNER TIME RAIL — the PLANNER is the future (tasks); records are written by the event service.
 * Views: Den (hour rail + "během dne" lane + overdue lane), Týden (7 columns, grouped ×N),
 * Měsíc (calendar with load per day), Biologická osa (per animal, 60 days: feeding plan, shed window,
 * reproduction next step, health follow-ups, brumation). Feeding items open the result sheet
 * (EATEN / REFUSED / IN SHED / NOT FED) — completing a feeding task always creates a real record.
 */

function ir_rail_task_kind(array $t): array {
    $n = (string)($t['poznamka'] ?? '');
    if (preg_match('~\[IR-GROUP:FEED:(\d+)\]~', $n, $m)) return ['group_feed', (int)$m[1]];
    if (preg_match('~\[IR-CORE:(?:RE)?FEED:\d+\]~', $n) || str_starts_with(mb_strtolower((string)$t['nazev_ukolu'], 'UTF-8'), 'krmení')) return ['feed', 0];
    if (preg_match('~\[IR-REPRO:\d+\]~', $n)) return ['repro', 0];
    if (preg_match('~\[IR-HEALTH:\d+\]~', $n)) return ['health', 0];
    return ['task', 0];
}
function ir_rail_tasks(PDO $pdo, int $uid, string $from, string $to, bool $withOverdue = false): array {
    $w = "p.user_id=? AND p.stav='Aktivní' AND (p.datum_termin BETWEEN ? AND ?".($withOverdue ? ' OR p.datum_termin<?' : '').')';
    $a = [$uid, $from, $to]; if ($withOverdue) $a[] = $from;
    $st = $pdo->prepare("SELECT p.*,z.jmeno_kod,z.latinsky_nazev,z.druh,z.foto,z.potrava,z.pohlavi FROM wp_ir2_planovac p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE $w ORDER BY p.datum_termin,COALESCE(p.cas_termin,'99:99'),p.kategorie,p.id LIMIT 2000");
    $st->execute($a);
    return $st->fetchAll() ?: [];
}
/** Group same-type items of one day into one accordion entry ("Krmení ×11"). */
function ir_rail_group(array $tasks): array {
    $g = [];
    foreach ($tasks as $t) {
        [$kind] = ir_rail_task_kind($t);
        $title = preg_replace('~\s*[·:-].*$~u', '', trim((string)$t['nazev_ukolu'])) ?: 'Úkol';
        $key = $t['datum_termin'].'|'.($t['cas_termin'] ?: '').'|'.$kind.'|'.mb_strtolower($title, 'UTF-8');
        $g[$key]['title'] = $title; $g[$key]['kind'] = $kind; $g[$key]['date'] = $t['datum_termin']; $g[$key]['time'] = $t['cas_termin'] ? substr((string)$t['cas_termin'], 0, 5) : null;
        $g[$key]['items'][] = $t;
    }
    return array_values($g);
}
function ir_rail_feed_json(array $t): string {
    return json_encode(['id' => (int)$t['zvire_id'], 'name' => (string)($t['jmeno_kod'] ?? ''), 'latin' => (string)($t['latinsky_nazev'] ?? ''), 'species' => (string)($t['druh'] ?? ''), 'feed' => (string)($t['potrava'] ?? ''), 'photo' => function_exists('ir_asset_photo_url') ? ir_asset_photo_url((string)($t['foto'] ?? '')) : ''], JSON_UNESCAPED_UNICODE);
}
/** One task row with the right action for its kind. */
function ir_rail_item_html(array $t, string $returnTo): string {
    [$kind, $gid] = ir_rail_task_kind($t);
    $who = trim((string)($t['jmeno_kod'] ?? '')) ?: 'Obecný úkol';
    $late = (string)$t['datum_termin'] < date('Y-m-d');
    $act = '';
    if (ir_can('write')) {
        if ($kind === 'group_feed') $act = '<button type="button" class="btn small primary" data-group-feed="'.$gid.'" data-task-id="'.(int)$t['id'].'">Zapsat výsledky</button>';
        elseif ($kind === 'feed' && (int)$t['zvire_id'] > 0) $act = '<button type="button" class="btn small primary" data-feed-animal="'.ir_e(ir_rail_feed_json($t)).'" data-source="planner" data-task-id="'.(int)$t['id'].'">Výsledek</button>';
        else $act = '<form method="post" action="tasks.php" class="b1-inline-mini">'.ir_csrf_field().'<input type="hidden" name="return_to" value="'.ir_e($returnTo).'"><input type="hidden" name="id" value="'.(int)$t['id'].'"><button class="btn small" name="action" value="complete" title="Hotovo">✓</button></form>';
        $act .= '<form method="post" action="tasks.php" class="b1-inline-mini">'.ir_csrf_field().'<input type="hidden" name="return_to" value="'.ir_e($returnTo).'"><input type="hidden" name="id" value="'.(int)$t['id'].'"><input type="hidden" name="days" value="1"><button class="btn small" name="action" value="postpone" title="Odložit o den">+1</button></form>';
    }
    return '<li class="b1-rail-item is-'.$kind.($late ? ' is-late' : '').'"><span class="b1-rail-who"><b>'.ir_e($who).'</b>'.(($t['latinsky_nazev'] ?? '') && $t['latinsky_nazev'] !== $who ? '<small><i>'.ir_e((string)$t['latinsky_nazev']).'</i></small>' : '').'<small>'.ir_e(trim((string)$t['nazev_ukolu'])).($late ? ' · <em class="warn">po termínu '.date('j. n.', strtotime((string)$t['datum_termin'])).'</em>' : '').'</small></span><span class="b1-rail-act">'.$act.'</span></li>';
}
function ir_rail_group_html(array $g, string $returnTo, bool $open = false): string {
    $n = count($g['items']);
    $icon = ['feed' => 'feeding', 'group_feed' => 'groups', 'repro' => 'reproduction', 'health' => 'health'][$g['kind']] ?? ir_activity_icon_key('task', $g['title']);
    $h = '<details class="b1-rail-group is-'.$g['kind'].'" '.($open || $n <= 2 ? 'open' : '').'><summary>'.ir_visual_icon($icon).'<b>'.ir_e($g['title']).($n > 1 ? ' ×'.$n : '').'</b>'.($g['time'] ? '<small>'.ir_e($g['time']).'</small>' : '').'</summary><ul>';
    foreach ($g['items'] as $t) $h .= ir_rail_item_html($t, $returnTo);
    return $h.'</ul></details>';
}

function ir_render_planner_rail(PDO $pdo, int $uid, string $view, string $date): void {
    $date = preg_match('~^\d{4}-\d{2}-\d{2}$~', $date) ? $date : date('Y-m-d');
    $today = date('Y-m-d');
    $views = ['day' => 'Den', 'week' => 'Týden', 'month' => 'Měsíc', 'bio' => 'Biologická osa'];
    if (!isset($views[$view])) $view = 'day';
    $ret = 'tasks.php?pv='.$view.'&d='.$date;
    $nav = static function (string $d) use ($view): string { return 'tasks.php?pv='.$view.'&d='.$d; };
    $step = ['day' => '1 day', 'week' => '7 days', 'month' => '1 month', 'bio' => '14 days'][$view];
    $prev = date('Y-m-d', strtotime($date.' -'.$step)); $next = date('Y-m-d', strtotime($date.' +'.$step));
    $title = match ($view) {
        'day' => ($date === $today ? 'Dnes · ' : ($date === date('Y-m-d', strtotime('+1 day')) ? 'Zítra · ' : '')).date('j. n. Y', strtotime($date)).' · '.['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'][(int)date('w', strtotime($date))],
        'week' => 'Týden '.date('j. n.', strtotime('monday this week', strtotime($date))).' – '.date('j. n. Y', strtotime('sunday this week', strtotime($date))),
        'month' => ['', 'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'][(int)date('n', strtotime($date))].' '.date('Y', strtotime($date)),
        'bio' => 'Biologická osa · '.date('j. n.', strtotime($date)).' – '.date('j. n. Y', strtotime($date.' +59 days')),
    };
    echo '<section class="panel glow-panel b1-rail" data-rail><header class="b1-rail-head"><div><span class="panel-kicker">PLÁNOVAČ · BUDOUCNOST</span><h2>'.ir_e($title).'</h2></div>';
    echo '<nav class="b1-seg b1-rail-views" aria-label="Zobrazení">';
    foreach ($views as $k => $l) echo '<a href="tasks.php?pv='.$k.'&d='.$date.'" role="tab" aria-selected="'.($k === $view ? 'true' : 'false').'" class="'.($k === $view ? 'is-on' : '').'">'.$l.'</a>';
    echo '</nav><div class="b1-rail-nav"><a class="btn small" href="'.ir_e($nav($prev)).'" aria-label="Předchozí">‹</a><a class="btn small" href="'.ir_e($nav($today)).'">Dnes</a><a class="btn small" href="'.ir_e($nav($next)).'" aria-label="Další">›</a></div></header>';

    if ($view === 'day') {
        $tasks = ir_rail_tasks($pdo, $uid, $date, $date, $date === $today);
        $overdue = array_values(array_filter($tasks, fn($t) => (string)$t['datum_termin'] < $date));
        $dayTasks = array_values(array_filter($tasks, fn($t) => (string)$t['datum_termin'] === $date));
        $untimed = array_values(array_filter($dayTasks, fn($t) => empty($t['cas_termin'])));
        $timed = array_values(array_filter($dayTasks, fn($t) => !empty($t['cas_termin'])));
        echo '<div class="b1-rail-day">';
        if ($overdue) { echo '<section class="b1-lane is-overdue"><h3>Po termínu <span>'.count($overdue).'</span></h3>'; foreach (ir_rail_group($overdue) as $g) echo ir_rail_group_html($g, $ret); echo '</section>'; }
        echo '<section class="b1-lane"><h3>Během dne <span>'.count($untimed).'</span></h3>';
        foreach (ir_rail_group($untimed) as $g) echo ir_rail_group_html($g, $ret);
        if (!$untimed) echo '<p class="muted b1-empty">Nic bez konkrétního času.</p>';
        echo '</section><section class="b1-lane b1-hours"><h3>Časová osa</h3><ol class="b1-hour-rail">';
        $byHour = []; foreach ($timed as $t) $byHour[(int)substr((string)$t['cas_termin'], 0, 2)][] = $t;
        $nowH = (int)date('G');
        for ($h = 6; $h <= 22; $h++) {
            $items = $byHour[$h] ?? [];
            echo '<li class="'.($date === $today && $h === $nowH ? 'is-now' : '').($items ? ' has-items' : '').'"><time>'.sprintf('%02d:00', $h).'</time><div>';
            foreach (ir_rail_group($items) as $g) echo ir_rail_group_html($g, $ret, true);
            echo '</div></li>';
        }
        foreach ($byHour as $h => $items) if ($h < 6 || $h > 22) { echo '<li class="has-items"><time>'.sprintf('%02d:00', $h).'</time><div>'; foreach (ir_rail_group($items) as $g) echo ir_rail_group_html($g, $ret, true); echo '</div></li>'; }
        echo '</ol></section></div>';
    } elseif ($view === 'week') {
        $mon = date('Y-m-d', strtotime('monday this week', strtotime($date)));
        $sun = date('Y-m-d', strtotime($mon.' +6 days'));
        $tasks = ir_rail_tasks($pdo, $uid, $mon, $sun);
        $by = []; foreach ($tasks as $t) $by[(string)$t['datum_termin']][] = $t;
        echo '<div class="b1-week">';
        for ($i = 0; $i < 7; $i++) {
            $d = date('Y-m-d', strtotime($mon.' +'.$i.' days')); $items = $by[$d] ?? [];
            echo '<section class="b1-wday'.($d === $today ? ' is-today' : '').($d < $today ? ' is-past' : '').'"><h3><a href="tasks.php?pv=day&d='.$d.'">'.['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'][$i].' <b>'.date('j. n.', strtotime($d)).'</b></a><span>'.count($items).'</span></h3>';
            foreach (ir_rail_group($items) as $g) echo ir_rail_group_html($g, 'tasks.php?pv=week&d='.$date);
            if (!$items) echo '<p class="muted b1-empty">—</p>';
            echo '</section>';
        }
        echo '</div>';
    } elseif ($view === 'month') {
        $first = date('Y-m-01', strtotime($date)); $last = date('Y-m-t', strtotime($date));
        $st = $pdo->prepare("SELECT datum_termin d, kategorie k, COUNT(*) n FROM wp_ir2_planovac WHERE user_id=? AND stav='Aktivní' AND datum_termin BETWEEN ? AND ? GROUP BY datum_termin, kategorie");
        $st->execute([$uid, $first, $last]);
        $load = []; foreach ($st->fetchAll() ?: [] as $r) $load[(string)$r['d']][(string)$r['k']] = (int)$r['n'];
        $done = $pdo->prepare('SELECT DATE(datum) d, COUNT(*) n FROM wp_ir2_pece WHERE user_id=? AND datum BETWEEN ? AND ? GROUP BY DATE(datum)'); $done->execute([$uid, $first.' 00:00:00', $last.' 23:59:59']);
        $rec = []; foreach ($done->fetchAll() ?: [] as $r) $rec[(string)$r['d']] = (int)$r['n'];
        echo '<div class="b1-month"><div class="b1-mhead">'.implode('', array_map(fn($x) => '<span>'.$x.'</span>', ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'])).'</div><div class="b1-mgrid">';
        $pad = ((int)date('N', strtotime($first))) - 1; for ($i = 0; $i < $pad; $i++) echo '<span class="b1-mcell is-pad"></span>';
        for ($d = $first; $d <= $last; $d = date('Y-m-d', strtotime($d.' +1 day'))) {
            $l = $load[$d] ?? []; $n = array_sum($l);
            echo '<a class="b1-mcell'.($d === $today ? ' is-today' : '').($d < $today && $n ? ' is-late' : '').'" href="tasks.php?pv=day&d='.$d.'"><b>'.(int)date('j', strtotime($d)).'</b>';
            if ($n) { echo '<span class="b1-mload">'; foreach (array_slice($l, 0, 3, true) as $k => $c) echo '<i>'.ir_e($k).' '.$c.'</i>'; echo '</span>'; }
            if (!empty($rec[$d])) echo '<small class="b1-mrec">'.$rec[$d].' zapsáno</small>';
            echo '</a>';
        }
        echo '</div></div>';
    } else {
        // biological axis: per animal, next 60 days
        $days = 60; $end = date('Y-m-d', strtotime($date.' +'.($days - 1).' days'));
        $pct = static fn(string $d) => max(0, min(100, (strtotime($d) - strtotime($date)) / 86400 / $days * 100));
        $st = $pdo->prepare("SELECT z.* FROM wp_ir2_zvirata z WHERE z.user_id=? AND ".ir_status_active_sql('z')." AND COALESCE(z.pohlavi,'') NOT IN ('Skupina','Pár') ORDER BY z.latinsky_nazev, z.jmeno_kod LIMIT 150");
        $st->execute([$uid]); $animals = $st->fetchAll() ?: [];
        $tk = $pdo->prepare("SELECT zvire_id, datum_termin, nazev_ukolu, poznamka FROM wp_ir2_planovac WHERE user_id=? AND stav='Aktivní' AND datum_termin BETWEEN ? AND ?"); $tk->execute([$uid, date('Y-m-d', strtotime($date.' -30 days')), $end]);
        $byA = []; foreach ($tk->fetchAll() ?: [] as $t) $byA[(int)$t['zvire_id']][] = $t;
        $rp = []; if (ir_table_exists($pdo, 'wp_ir2_snusky')) { $q = $pdo->prepare("SELECT matka_id, otec_id, dalsi_akce, dalsi_akce_datum, aktualni_faze FROM wp_ir2_snusky WHERE user_id=? AND stav IN ('Aktivní','Inkubace') AND dalsi_akce_datum IS NOT NULL"); $q->execute([$uid]); foreach ($q->fetchAll() ?: [] as $r) foreach ([(int)$r['matka_id'], (int)$r['otec_id']] as $aid) if ($aid) $rp[$aid][] = $r; }
        echo '<div class="b1-bio"><div class="b1-bio-scale"><span></span><div>';
        for ($i = 0; $i < $days; $i += 7) echo '<i style="left:'.round($i / $days * 100, 2).'%">'.date('j. n.', strtotime($date.' +'.$i.' days')).'</i>';
        echo '<b class="b1-bio-now" style="left:'.round($pct($today), 2).'%"></b></div></div>';
        echo '<p class="b1-bio-legend"><span class="lg-feed">plánované krmení</span><span class="lg-shed">okno svlékání</span><span class="lg-repro">reprodukce</span><span class="lg-health">zdraví</span><span class="lg-late">po termínu</span></p>';
        foreach ($animals as $a) {
            $marks = '';
            $sh = ir_shed_estimate($pdo, $uid, $a);
            if (!empty($sh['from']) && !empty($sh['to']) && $sh['to'] >= $date && $sh['from'] <= $end) { $l = $pct(max($date, (string)$sh['from'])); $r = $pct(min($end, (string)$sh['to'])); $marks .= '<span class="bio-shed" style="left:'.$l.'%;width:'.max(1.2, $r - $l).'%" title="Okno svlékání '.date('j. n.', strtotime((string)$sh['from'])).'–'.date('j. n.', strtotime((string)$sh['to'])).'"></span>'; }
            foreach ($byA[(int)$a['id']] ?? [] as $t) {
                [$kind] = ir_rail_task_kind($t); $late = $t['datum_termin'] < $today;
                $cls = $late ? 'bio-late' : ['feed' => 'bio-feed', 'group_feed' => 'bio-feed', 'repro' => 'bio-repro', 'health' => 'bio-health'][$kind] ?? 'bio-task';
                $marks .= '<a class="'.$cls.'" style="left:'.$pct(max($date, (string)$t['datum_termin'])).'%" href="tasks.php?pv=day&d='.ir_e((string)$t['datum_termin']).'" title="'.ir_e($t['nazev_ukolu'].' · '.date('j. n.', strtotime((string)$t['datum_termin']))).'"></a>';
            }
            foreach ($rp[(int)$a['id']] ?? [] as $r) if ($r['dalsi_akce_datum'] >= $date && $r['dalsi_akce_datum'] <= $end) $marks .= '<span class="bio-repro is-big" style="left:'.$pct((string)$r['dalsi_akce_datum']).'%" title="'.ir_e(($r['dalsi_akce'] ?: $r['aktualni_faze']).' · '.date('j. n.', strtotime((string)$r['dalsi_akce_datum']))).'"></span>';
            if ($marks === '') continue;
            echo '<div class="b1-bio-row"><a class="b1-bio-name" href="animal.php?id='.(int)$a['id'].'"><b>'.ir_e((string)$a['jmeno_kod']).'</b><small>'.ir_e(IR_SHED_STATES[$sh['state'] ?? 'insufficient'] ?? '').'</small></a><div class="b1-bio-track">'.$marks.'<b class="b1-bio-now" style="left:'.round($pct($today), 2).'%"></b></div></div>';
        }
        echo '</div>';
    }
    echo '</section>';
}
