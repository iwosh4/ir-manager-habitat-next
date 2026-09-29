<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';require __DIR__.'/includes/reptile_core.php';
$uid=ir_current_user_id();$id=ir_int($_GET['id']??0);$g=null;$members=[];
try{$st=$pdo->prepare("SELECT g.*,u.nazev ubikace_nazev,d.latinsky_nazev,d.cesky_nazev FROM wp_ir2_skupiny g LEFT JOIN wp_ir2_ubikace u ON u.id=g.ubikace_id AND u.user_id=g.user_id LEFT JOIN wp_ir2_druhy d ON d.id=g.druh_id AND d.user_id=g.user_id WHERE g.user_id=? AND g.id=? LIMIT 1");$st->execute([$uid,$id]);$g=$st->fetch()?:null;if($g){$st=$pdo->prepare("SELECT z.*,c.datum_od,c.stav,u.nazev ubikace_nazev FROM wp_ir2_skupiny_clenove c JOIN wp_ir2_zvirata z ON z.id=c.zvire_id AND z.user_id=c.user_id LEFT JOIN wp_ir2_ubikace u ON u.id=z.ubikace_id AND u.user_id=z.user_id WHERE c.user_id=? AND c.skupina_id=? AND c.datum_do IS NULL AND c.stav='Ve skupině' ORDER BY z.jmeno_kod,z.id");$st->execute([$uid,$id]);$members=$st->fetchAll()?:[];}}catch(Throwable $e){error_log('group: '.$e->getMessage());}
if(!$g){http_response_code(404);exit('Skupina nebyla nalezena.');}
if(!empty($g['main_animal_id']))ir_redirect('animal.php?id='.(int)$g['main_animal_id']);
$photo=ir_asset_photo_url((string)($g['foto']??''));
ir_page_start((string)$g['nazev'],'animals');echo ir_back('animals.php','Zpět na zvířata');
?>
<section class="group-profile-hero panel glow-panel">
 <div class="group-profile-photo"><?php if($photo):?><img src="<?=ir_e($photo)?>" alt=""><?php else:?><?=ir_visual_icon('groups')?><?php endif;?></div>
 <div class="group-profile-main"><span class="panel-kicker">SKUPINOVÝ CHOV · HLAVNÍ KARTA</span><h1><?=ir_e((string)$g['nazev'])?></h1><p><strong><?=ir_e((string)($g['latinsky_nazev']??''))?></strong><?php if(!empty($g['cesky_nazev'])):?> · <?=ir_e((string)$g['cesky_nazev'])?><?php endif;?></p><div class="chip-row"><span><?=count($members)?> jedinců</span><span><?=ir_e((string)($g['ubikace_nazev']??'Bez ubikace'))?></span><span><?=ir_e((string)$g['status'])?></span><?php if(!empty($g['morf_linie'])):?><span><?=ir_e((string)$g['morf_linie'])?></span><?php endif;?></div></div>
 <div class="animal-hero-actions"><a class="btn primary" href="quick.php?group_id=<?=$id?>">+ Záznam celé skupině</a><a class="btn secondary" href="animals.php">Přehled zvířat</a></div>
</section>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">JEDINCI</span><h2>Mini karty členů skupiny</h2></div><span><?=count($members)?> aktivních</span></header><div class="group-member-grid">
<?php foreach($members as $a):$ap=ir_animal_photo($a);$lf=ir_last_activity($pdo,$uid,(int)$a['id'],'Krmení');$ls=ir_last_activity($pdo,$uid,(int)$a['id'],'Svlek');?>
<a class="group-member-card" href="animal.php?id=<?=$a['id']?>"><span class="group-member-photo"><?php if($ap):?><img src="<?=ir_e($ap)?>" alt=""><?php else:?><?=ir_visual_icon('animals')?><?php endif;?></span><span class="group-member-copy"><strong><?=ir_e((string)($a['jmeno_kod']?:$a['animal_id']?:'IR-'.$a['id']))?></strong><small><?=ir_e((string)($a['latinsky_nazev']?:$a['druh']))?> · <?=ir_e((string)$a['pohlavi'])?></small><em>Krmení <?=$lf?date('d.m.',strtotime((string)$lf['datum'])):'—'?> · Svlek <?=$ls?date('d.m.',strtotime((string)$ls['datum'])):'—'?></em></span><b>›</b></a>
<?php endforeach;if(!$members):?><div class="empty-state">Skupina zatím nemá přiřazené individuální karty.</div><?php endif;?></div></section>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">PRINCIP ZÁZNAMU</span><h2>Jedna akce, individuální historie</h2></div></header><div class="group-action-note"><?=ir_visual_icon('quick-add')?><div><strong>Hromadný záznam se uloží každému členovi zvlášť.</strong><span>Každý jedinec si tak ponechá vlastní historii i po pozdějším oddělení ze skupiny. V rychlém záznamu můžeš před potvrzením jednotlivé členy odškrtnout.</span></div><a class="btn primary" href="quick.php?group_id=<?=$id?>">Zapsat aktivitu</a></div></section>
<?php ir_page_end();
