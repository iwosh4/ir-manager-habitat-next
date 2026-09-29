<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';
require __DIR__.'/includes/live.php';
require __DIR__.'/includes/shell.php';
require __DIR__.'/includes/reptile_core.php';
$uid=ir_current_user_id();
$view=preg_replace('/[^a-z\-]/','',(string)($_GET['view']??'all'));
$mode=((string)($_GET['mode']??'table'))==='grid'?'grid':'table';
$q=trim((string)($_GET['q']??''));
$groupMemberIds=ir_group_membership_ids($pdo,$uid);
$rows=[];$groups=[];
if($view==='needs-feed'){
    $rows=ir_needs_feed($pdo,$uid,400);
}else{
    $where=['z.user_id=?'];$params=[$uid];
    if($view==='archive')$where[]="COALESCE(z.status_chovu,'') IN ('Uhynulo','Archiv','Mrtvé','Dead')";
    elseif($view==='sold')$where[]="COALESCE(z.status_chovu,'') IN ('Prodáno','Sold')";
    elseif($view==='groups')$where[]="1=0";
    else $where[]=ir_status_active_sql('z');
    if($view==='breeding')$where[]="COALESCE(z.status_chovu,'') IN ('Chov','Aktivní')";
    if($view==='quarantine')$where[]="COALESCE(z.status_chovu,'') IN ('Karanténa','Léčba','V léčbě')";
    if($q!==''){$where[]='(z.jmeno_kod LIKE ? OR z.animal_id LIKE ? OR z.latinsky_nazev LIKE ? OR z.druh LIKE ?)';$like='%'.$q.'%';array_push($params,$like,$like,$like,$like);}
    $sql="SELECT z.*,u.nazev ubikace_nazev,(SELECT MAX(datum) FROM wp_ir2_pece p WHERE p.user_id=z.user_id AND p.zvire_id=z.id AND p.typ='Krmení') last_feed,(SELECT MAX(datum) FROM wp_ir2_pece p WHERE p.user_id=z.user_id AND p.zvire_id=z.id AND p.typ='Svlek') last_shed FROM wp_ir2_zvirata z LEFT JOIN wp_ir2_ubikace u ON u.id=z.ubikace_id AND u.user_id=z.user_id WHERE ".implode(' AND ',$where)." ORDER BY COALESCE(z.latinsky_nazev,z.druh),z.jmeno_kod,z.id";
    try{$st=$pdo->prepare($sql);$st->execute($params);$rows=$st->fetchAll()?:[];}catch(Throwable $e){error_log('animals: '.$e->getMessage());}
}
if(!in_array($view,['archive','sold'],true) && ir_table_exists($pdo,'wp_ir2_skupiny')){
    try{$st=$pdo->prepare("SELECT g.*,d.latinsky_nazev,d.cesky_nazev,u.nazev ubikace_nazev,(SELECT COUNT(*) FROM wp_ir2_skupiny_clenove c WHERE c.user_id=g.user_id AND c.skupina_id=g.id AND c.datum_do IS NULL AND c.stav='Ve skupině') real_count,(SELECT COUNT(*) FROM wp_ir2_skupiny_clenove c JOIN wp_ir2_zvirata gz ON gz.id=c.zvire_id AND gz.user_id=c.user_id WHERE c.user_id=g.user_id AND c.skupina_id=g.id AND c.datum_do IS NULL AND c.stav='Ve skupině' AND gz.pohlavi IN ('Samec','♂')) male_count,(SELECT COUNT(*) FROM wp_ir2_skupiny_clenove c JOIN wp_ir2_zvirata gz ON gz.id=c.zvire_id AND gz.user_id=c.user_id WHERE c.user_id=g.user_id AND c.skupina_id=g.id AND c.datum_do IS NULL AND c.stav='Ve skupině' AND gz.pohlavi IN ('Samice','♀')) female_count,(SELECT COUNT(*) FROM wp_ir2_skupiny_clenove c JOIN wp_ir2_zvirata gz ON gz.id=c.zvire_id AND gz.user_id=c.user_id WHERE c.user_id=g.user_id AND c.skupina_id=g.id AND c.datum_do IS NULL AND c.stav='Ve skupině' AND COALESCE(gz.pohlavi,'Neurčeno') NOT IN ('Samec','♂','Samice','♀')) unknown_count FROM wp_ir2_skupiny g LEFT JOIN wp_ir2_druhy d ON d.id=g.druh_id AND d.user_id=g.user_id LEFT JOIN wp_ir2_ubikace u ON u.id=g.ubikace_id AND u.user_id=g.user_id WHERE g.user_id=? AND g.status='Aktivní' ORDER BY g.nazev");$st->execute([$uid]);$groups=$st->fetchAll()?:[];}catch(Throwable){}
}
if(!in_array($view,['archive','sold','needs-feed'],true)){
    $rows=array_values(array_filter($rows,function($r) use($groupMemberIds){
        if(!empty($r['skupina_parent_id'])) return false;
        return !$groupMemberIds || !in_array((int)$r['id'],$groupMemberIds,true);
    }));
}
foreach($rows as &$row){
    $row['_href']='animal.php?id='.$row['id'];$row['_edit']='animal-edit.php?id='.$row['id'];$row['_activity']='activity.php?animal_id='.$row['id'];$row['_group_count']=null;$row['_group_composition']=[];
    if(in_array($row['pohlavi'],['Skupina','Pár'],true)){
        $cq=$pdo->prepare("SELECT COUNT(*) total,SUM(CASE WHEN pohlavi IN ('Samec','♂') THEN 1 ELSE 0 END) males,SUM(CASE WHEN pohlavi IN ('Samice','♀') THEN 1 ELSE 0 END) females,SUM(CASE WHEN COALESCE(pohlavi,'Neurčeno') NOT IN ('Samec','♂','Samice','♀') THEN 1 ELSE 0 END) unknowns FROM wp_ir2_zvirata z WHERE z.user_id=? AND z.skupina_parent_id=? AND ".ir_status_active_sql('z'));$cq->execute([$uid,$row['id']]);$gc=$cq->fetch()?:[];$row['_group_count']=(int)($gc['total']??0);$row['_group_composition']=['male'=>(int)($gc['males']??0),'female'=>(int)($gc['females']??0),'unknown'=>(int)($gc['unknowns']??0)];$row['_activity']='quick.php?parent_id='.$row['id'];
    }
}unset($row);
if(in_array($view,['all','groups'],true))foreach($groups as $g){
    if(!empty($g['main_animal_id']))continue;if($q!==''&&mb_stripos($g['nazev'].' '.$g['latinsky_nazev'],$q)===false)continue;
    $rows[]=['id'=>-(int)$g['id'],'animal_id'=>'SK-'.$g['id'],'jmeno_kod'=>$g['nazev'],'latinsky_nazev'=>$g['latinsky_nazev']??'','druh'=>$g['cesky_nazev']??'','druh_id'=>$g['druh_id'],'pohlavi'=>'Skupina','status_chovu'=>$g['status'],'foto'=>$g['foto'],'ubikace_nazev'=>$g['ubikace_nazev'],'last_feed'=>null,'last_shed'=>null,'interval_krmeni'=>'','_href'=>'group.php?id='.$g['id'],'_edit'=>'group.php?id='.$g['id'],'_activity'=>'quick.php?group_id='.$g['id'],'_group_count'=>(int)$g['real_count'],'_group_composition'=>['male'=>(int)($g['male_count']??0),'female'=>(int)($g['female_count']??0),'unknown'=>(int)($g['unknown_count']??0)]];
}
usort($rows,static fn($a,$b)=>strnatcasecmp((string)$a['jmeno_kod'],(string)$b['jmeno_kod']));
function ir_gender_badge(string $sex,?int $count=null,array $composition=[]): string {
    $s=mb_strtolower(trim($sex));
    if(in_array($s,['samec','♂'],true)) return '<span class="gender-symbol male" title="Samec">♂</span><span class="gender-text">Samec</span>';
    if(in_array($s,['samice','♀'],true)) return '<span class="gender-symbol female" title="Samice">♀</span><span class="gender-text">Samice</span>';
    if(in_array($s,['skupina','pár'],true)){
        $parts=[];$m=(int)($composition['male']??0);$f=(int)($composition['female']??0);$u=(int)($composition['unknown']??0);
        if($m)$parts[]=$m.' ♂';if($f)$parts[]=$f.' ♀';if($u)$parts[]=$u.' ?';
        $detail=$parts?'<small>'.ir_e(implode(' · ',$parts)).'</small>':'';
        return '<span class="gender-group-mark" aria-hidden="true">—</span><span class="gender-text gender-group-text">Skupina'.($count!==null?' · '.(int)$count:'').$detail.'</span>';
    }
    return '<span class="gender-symbol unknown" title="Pohlaví neurčeno">?</span><span class="gender-text">Neurčeno</span>';
}
ir_page_start('Zvířata','animals');
?>
<div class="animals-overview-head">
  <div class="module-tabs animals-tabs">
    <a class="<?= $view==='all'?'is-active':''?>" href="animals.php?view=all&mode=<?=$mode?>">Přehled</a>
    <a class="<?= $view==='quarantine'?'is-active':''?>" href="animals.php?view=quarantine&mode=<?=$mode?>">Karanténa / léčba</a>
    <a class="<?= $view==='sold'?'is-active':''?>" href="animals.php?view=sold&mode=<?=$mode?>">Prodáno</a>
    <a class="<?= $view==='archive'?'is-active':''?>" href="animals.php?view=archive&mode=<?=$mode?>">Uhynulo / archiv</a>
    <a class="<?= $view==='groups'?'is-active':''?>" href="animals.php?view=groups&mode=<?=$mode?>">Skupiny</a>
    <a class="<?= $view==='breeding'?'is-active':''?>" href="animals.php?view=breeding&mode=<?=$mode?>">Chov</a>
    <a class="<?= $view==='needs-feed'?'is-active':''?>" href="animals.php?view=needs-feed&mode=<?=$mode?>">Krmení</a>
  </div>
  <div class="toolbar-actions animals-tools">
    <form class="compact-search" method="get"><input type="hidden" name="view" value="<?=ir_e($view)?>"><input type="hidden" name="mode" value="<?=ir_e($mode)?>"><input name="q" value="<?=ir_e($q)?>" placeholder="Jméno, ID, druh…"><button class="btn">Hledat</button></form>
    <a class="btn secondary" href="animals.php?view=<?=ir_e($view)?>&mode=<?=$mode==='grid'?'table':'grid'?>"><?=$mode==='grid'?'Tabulka':'Karty'?></a>
    <a class="btn secondary" href="batch-create.php">Hromadně</a>
    <a class="btn primary" href="animal-edit.php">+ Nová karta</a>
  </div>
</div>
<?php if($mode==='grid'): ?>
<section class="animal-grid animal-grid--dense">
<?php foreach($rows as $a): $photo=ir_animal_photo($a);$lf=!empty($a['last_feed'])?strtotime((string)$a['last_feed']):null;$fd=ir_feeding_interval_days($pdo,$uid,$a); ?>
<article class="animal-card glow-panel">
  <a class="animal-photo animal-photo--contain" href="<?=ir_e($a['_href'])?>">
    <?php if($photo): ?><img src="<?=ir_e($photo)?>" alt="<?=ir_e(ir_animal_display($a))?>" loading="lazy"><?php else: ?><?=ir_visual_icon('animals')?><?php endif; ?>
  </a>
  <div class="animal-card-body">
    <div class="animal-card-top"><span><?=ir_e((string)($a['animal_id']?:'IR-'.$a['id']))?></span><em><?=ir_e((string)$a['status_chovu'])?></em></div>
    <h3><?=ir_e(ir_animal_display($a))?></h3>
    <p class="animal-card-species"><?=ir_e(ir_animal_secondary($a))?></p>
    <div class="animal-card-gender"><?=ir_gender_badge((string)$a['pohlavi'],$a['_group_count'],$a['_group_composition']??[])?></div>
    <div class="animal-card-facts">
      <div><span>Ubikace</span><strong><?=ir_e((string)($a['ubikace_nazev']??'Bez přiřazení'))?></strong></div>
      <div><span>Poslední krmení</span><strong><?=$lf?date('d.m.Y',$lf):'—'?></strong></div>
      <div><span>Další krmení</span><strong><?=$lf?date('d.m.Y',strtotime('+'.$fd.' days',$lf)):'Nyní'?></strong></div>
    </div>
    <div class="card-actions"><a href="<?=ir_e($a['_activity'])?>&type=Krmení">Krmení</a><a href="<?=ir_e($a['_href'])?>">Detail</a><a href="<?=ir_e($a['_edit'])?>">Upravit</a></div>
  </div>
</article>
<?php endforeach; ?>
</section>
<?php else: ?>
<section class="panel glow-panel animals-table-panel">
  <div class="animals-table-meta"><strong><?=count($rows)?> záznamů</strong><span>Latinský název je hlavní identifikace.</span></div>
  <div class="table-scroll"><table class="data-table animals-table" data-no-enhance="1"><thead><tr><th>Foto</th><th>Zvíře</th><th>Druh</th><th>Pohlaví</th><th>Ubikace</th><th>Krmení</th><th>Další</th><th>Svlek</th><th>Status</th><th>Správa</th></tr></thead><tbody>
  <?php foreach($rows as $a): $photo=ir_animal_photo($a);$lf=!empty($a['last_feed'])?strtotime((string)$a['last_feed']):null;$fd=ir_feeding_interval_days($pdo,$uid,$a); ?>
  <tr>
    <td><a class="table-avatar animal-photo--contain" href="<?=ir_e($a['_href'])?>"><?php if($photo): ?><img src="<?=ir_e($photo)?>" alt="" loading="lazy"><?php else: ?><?=ir_visual_icon('animals')?><?php endif;?></a></td>
    <td><a href="<?=ir_e($a['_href'])?>"><strong><?=ir_e((string)$a['jmeno_kod'])?></strong></a><small><?=ir_e((string)($a['animal_id']?:'IR-'.$a['id']))?></small></td>
    <td><strong class="latin"><?=ir_e((string)($a['latinsky_nazev']?:$a['druh']))?></strong><small><?=ir_e((string)$a['druh'])?></small></td>
    <td><div class="gender-cell"><?=ir_gender_badge((string)$a['pohlavi'],$a['_group_count'],$a['_group_composition']??[])?></div></td>
    <td><?=ir_e((string)($a['ubikace_nazev']??'—'))?></td>
    <td><?=$lf?date('d.m.Y',$lf):'—'?></td>
    <td><?=$lf?date('d.m.Y',strtotime('+'.$fd.' days',$lf)):'Nyní'?></td>
    <td><?=!empty($a['last_shed'])?date('d.m.Y',strtotime((string)$a['last_shed'])):'—'?></td>
    <td><span class="status-pill amber"><?=ir_e((string)$a['status_chovu'])?></span></td>
    <td><div class="row-actions animal-row-actions"><a href="<?=ir_e($a['_href'])?>">Detail</a><a href="<?=ir_e($a['_edit'])?>">Upravit</a><a href="<?=ir_e($a['_activity'])?>">Akce</a></div></td>
  </tr>
  <?php endforeach; if(!$rows): ?><tr><td colspan="10"><div class="table-empty">Žádná zvířata pro tento filtr.</div></td></tr><?php endif; ?>
  </tbody></table></div>
</section>
<?php endif; ?>
<?php ir_page_end();
