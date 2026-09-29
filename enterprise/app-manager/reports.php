<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';require __DIR__.'/includes/reptile_core.php';
$uid=ir_current_user_id();
$feed=[];$types=[];$weights=[];$refusals=[];$healthOpen=0;$overdue=0;$reproActive=0;$lowStock=0;
try{
 $st=$pdo->prepare("SELECT COALESCE(NULLIF(hodnota,''),'Neuvedeno') item,COUNT(*) cnt FROM wp_ir2_pece WHERE user_id=? AND typ='Krmení' AND datum>=DATE_SUB(NOW(),INTERVAL 90 DAY) GROUP BY item ORDER BY cnt DESC LIMIT 12");$st->execute([$uid]);$feed=$st->fetchAll()?:[];
 $st=$pdo->prepare("SELECT typ,COUNT(*) cnt FROM wp_ir2_pece WHERE user_id=? AND datum>=DATE_SUB(NOW(),INTERVAL 30 DAY) GROUP BY typ ORDER BY cnt DESC");$st->execute([$uid]);$types=$st->fetchAll()?:[];
 $st=$pdo->prepare("SELECT z.jmeno_kod,z.latinsky_nazev,p.zvire_id,p.datum,p.hodnota FROM wp_ir2_pece p JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE p.user_id=? AND p.typ='Vážení' AND p.hodnota REGEXP '^[0-9]+([.,][0-9]+)?$' ORDER BY p.datum DESC LIMIT 30");$st->execute([$uid]);$weights=$st->fetchAll()?:[];
 $st=$pdo->prepare("SELECT z.id,z.jmeno_kod,z.latinsky_nazev,COUNT(*) cnt,MAX(p.datum) last_date FROM wp_ir2_pece p JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE p.user_id=? AND (LOWER(p.typ) LIKE '%odmítn%' OR LOWER(COALESCE(p.hodnota,'')) LIKE '%odmítn%') AND p.datum>=DATE_SUB(NOW(),INTERVAL 60 DAY) GROUP BY z.id,z.jmeno_kod,z.latinsky_nazev ORDER BY cnt DESC,last_date DESC LIMIT 6");$st->execute([$uid]);$refusals=$st->fetchAll()?:[];
}catch(Throwable $e){error_log('reports: '.$e->getMessage());}
$healthOpen=ir_table_exists($pdo,'wp_ir2_zdravi')?(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_zdravi WHERE user_id=? AND status NOT IN ('Ukončeno','Hotovo','Uzavřeno')",[$uid],0):0;
$overdue=ir_table_exists($pdo,'wp_ir2_planovac')?(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_planovac WHERE user_id=? AND stav='Aktivní' AND datum_termin<CURDATE()",[$uid],0):0;
$reproActive=ir_table_exists($pdo,'wp_ir2_snusky')?(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_snusky WHERE user_id=? AND stav IN ('Aktivní','Inkubace')",[$uid],0):0;
$lowStock=ir_table_exists($pdo,'wp_ir2_sklad')?(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_sklad WHERE user_id=? AND mnozstvi<=minimum",[$uid],0):0;
$activityTotal=array_sum(array_map(static fn($r)=>(int)$r['cnt'],$types));$feedTotal=array_sum(array_map(static fn($r)=>(int)$r['cnt'],$feed));$weightedAnimals=count(array_unique(array_map(static fn($r)=>(int)$r['zvire_id'],$weights)));
$costs=(float)ir_scalar($pdo,"SELECT COALESCE(SUM(CASE WHEN typ IN ('Výdaj','Náklad','Nákup') THEN castka ELSE 0 END),0) FROM wp_ir2_finance WHERE smazano IS NULL AND user_id=? AND datum>=DATE_FORMAT(CURDATE(),'%Y-%m-01')",[$uid],0);
$income=(float)ir_scalar($pdo,"SELECT COALESCE(SUM(CASE WHEN typ IN ('Příjem','Prodej') THEN castka ELSE 0 END),0) FROM wp_ir2_finance WHERE smazano IS NULL AND user_id=? AND datum>=DATE_FORMAT(CURDATE(),'%Y-%m-01')",[$uid],0);
ir_page_start('Reporty','other');
?>
<div class="module-toolbar report-toolbar"><div class="module-tabs"><a class="is-active" href="reports.php">Přehled</a><a href="export.php?type=activities&format=csv">Aktivity CSV</a><a href="export.php?type=animals&format=csv">Zvířata CSV</a></div><a class="btn secondary" href="import.php">Import / Export</a></div>

<section class="report-question-grid">
 <a href="tasks.php?view=overdue" class="report-question-card is-alert"><span><?=ir_visual_icon('warning')?></span><div><small>Co hoří?</small><strong><?=$overdue?> úkolů po termínu</strong><em>otevřít a vyřešit</em></div></a>
 <a href="health.php" class="report-question-card is-health"><span><?=ir_visual_icon('health')?></span><div><small>Kdo je ve sledování?</small><strong><?=$healthOpen?> aktivních zdravotních stavů</strong><em>léčba / karanténa / kontrola</em></div></a>
 <a href="clutches.php" class="report-question-card is-repro"><span><?=ir_visual_icon('reproduction')?></span><div><small>Co běží v reprodukci?</small><strong><?=$reproActive?> aktivních cyklů</strong><em>včetně inkubací</em></div></a>
 <a href="inventory.php?tab=items&view=low" class="report-question-card is-stock"><span><?=ir_visual_icon('inventory')?></span><div><small>Co dochází?</small><strong><?=$lowStock?> položek pod minimem</strong><em>přejít do skladu</em></div></a>
</section>

<section class="metric-grid report-kpis">
 <article class="mini-metric glow-panel"><span><?=ir_visual_icon('care')?></span><div><small>Aktivity 30 dní</small><strong><?=$activityTotal?></strong><em>záznamů péče</em></div></article>
 <article class="mini-metric glow-panel"><span><?=ir_visual_icon('feeding')?></span><div><small>Krmení 90 dní</small><strong><?=$feedTotal?></strong><em>evidovaných příjmů</em></div></article>
 <article class="mini-metric glow-panel"><span><?=ir_visual_icon('weight')?></span><div><small>Vážení</small><strong><?=count($weights)?></strong><em><?=$weightedAnimals?> zvířat</em></div></article>
 <article class="mini-metric glow-panel"><span><?=ir_visual_icon('finance')?></span><div><small>Měsíc</small><strong><?=number_format($income-$costs,0,',',' ')?> Kč</strong><em><?=number_format($income,0,',',' ')?> příjem / <?=number_format($costs,0,',',' ')?> náklad</em></div></article>
</section>

<div class="report-insight-grid">
 <section class="panel glow-panel report-visual-card"><header class="panel-head"><div><span class="panel-kicker">30 DNÍ</span><h2>Co se v chovu děje</h2></div><?=ir_visual_icon('tasks')?></header><div class="bar-list report-bars"><?php $max=max(1,...array_map(fn($r)=>(int)$r['cnt'],$types));foreach(array_slice($types,0,10) as $r):$icon=ir_activity_icon_key('activity',(string)$r['typ']);?><div><span class="report-bar-label"><?=ir_visual_icon($icon)?><b><?=ir_e((string)$r['typ'])?></b></span><strong><?=ir_int($r['cnt'])?></strong><i style="--w:<?=round(((int)$r['cnt']/$max)*100)?>%"></i></div><?php endforeach;if(!$types):?><p class="empty-state small">Bez aktivit za posledních 30 dní.</p><?php endif;?></div></section>
 <section class="panel glow-panel report-visual-card"><header class="panel-head"><div><span class="panel-kicker">90 DNÍ</span><h2>Krmení a spotřeba</h2></div><?=ir_visual_icon('feeding')?></header><div class="bar-list report-bars"><?php $maxf=max(1,...array_map(fn($r)=>(int)$r['cnt'],$feed));foreach($feed as $r):?><div><span class="report-bar-label"><?=ir_visual_icon('feeding')?><b><?=ir_e((string)$r['item'])?></b></span><strong><?=ir_int($r['cnt'])?>×</strong><i style="--w:<?=round(((int)$r['cnt']/$maxf)*100)?>%"></i></div><?php endforeach;if(!$feed):?><p class="empty-state small">Bez krmení za posledních 90 dní.</p><?php endif;?></div></section>
 <section class="panel glow-panel report-watch-card"><header class="panel-head"><div><span class="panel-kicker">SLEDOVAT</span><h2>Odmítání potravy</h2></div><?=ir_visual_icon('warning')?></header><div class="report-watch-list"><?php foreach($refusals as $r):?><a href="animal.php?id=<?=$r['id']?>"><span><?=ir_visual_icon('feeding')?></span><div><strong><?=ir_e((string)($r['latinsky_nazev']?:$r['jmeno_kod']))?></strong><small><?=ir_e((string)$r['jmeno_kod'])?> · naposledy <?=date('d.m.Y',strtotime((string)$r['last_date']))?></small></div><b><?=$r['cnt']?>×</b></a><?php endforeach;if(!$refusals):?><div class="empty-state small">Za posledních 60 dní bez evidovaného odmítání.</div><?php endif;?></div></section>
</div>

<section class="panel glow-panel report-weight-panel"><header class="panel-head"><div><span class="panel-kicker">RŮST</span><h2>Poslední vážení</h2></div><?=ir_visual_icon('weight')?></header><div class="table-scroll"><table class="data-table"><thead><tr><th>Zvíře</th><th>Datum</th><th>Hmotnost</th><th>Akce</th></tr></thead><tbody><?php foreach($weights as $r):?><tr><td><a href="animal.php?id=<?=$r['zvire_id']?>"><strong><?=ir_e((string)($r['latinsky_nazev']?:$r['jmeno_kod']))?></strong><small><?=ir_e((string)$r['jmeno_kod'])?></small></a></td><td><?=date('d.m.Y',strtotime((string)$r['datum']))?></td><td><strong><?=ir_e((string)$r['hodnota'])?></strong></td><td><a class="btn tiny" href="animal.php?id=<?=$r['zvire_id']?>#prehled">Karta</a></td></tr><?php endforeach;if(!$weights):?><tr><td colspan="4"><div class="table-empty">Zatím bez měření hmotnosti.</div></td></tr><?php endif;?></tbody></table></div></section>
<?php ir_page_end();
