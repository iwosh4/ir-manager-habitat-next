<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';require __DIR__.'/includes/reptile_core.php';
$uid=ir_current_user_id();$id=ir_int($_GET['id']??0);$a=ir_animal($pdo,$uid,$id);if(!$a){http_response_code(404);exit('Zvíře nebylo nalezeno.');}
if($_SERVER['REQUEST_METHOD']==='POST'){ir_verify_csrf();$act=(string)($_POST['action']??'');try{if($act==='archive'){ir_require_perm('delete');ir_animal_archive($pdo,$uid,$id,(string)($_POST['reason']??'Archiv'));ir_flash('success','Zvíře bylo archivováno. Historie zůstává zachována a lze jej kdykoli obnovit.');}elseif($act==='restore'){ir_require_perm('write');ir_animal_restore($pdo,$uid,$id);ir_flash('success','Zvíře bylo obnoveno.');}}catch(Throwable $e){ir_flash('error',$e->getMessage());}ir_redirect('animal.php?id='.$id);}
$b1Appetite=ir_appetite($pdo,$uid,$a);$b1Shed=ir_shed_estimate($pdo,$uid,$a);$b1Locked=ir_animal_is_locked($pdo,$uid,$id);$b1Archived=!empty($a['archivovano']);
$b1FeedJson=json_encode(['id'=>$id,'name'=>(string)$a['jmeno_kod'],'latin'=>(string)$a['latinsky_nazev'],'species'=>(string)$a['druh'],'feed'=>(string)($a['potrava']??''),'photo'=>function_exists('ir_asset_photo_url')?ir_asset_photo_url((string)($a['foto']??'')):'','appetite'=>['alert'=>$b1Appetite['alert'],'consecutive_refusals'=>$b1Appetite['consecutive_refusals']],'shed'=>['state'=>$b1Shed['state']??'']],JSON_UNESCAPED_UNICODE);
$history=ir_activity_rows($pdo,$uid,['animal_id'=>$id],150);$clutches=[];$photos=[];$animalDocs=[];$father=null;$mother=null;
try{if(ir_table_exists($pdo,'wp_ir2_snusky')){$st=$pdo->prepare("SELECT * FROM wp_ir2_snusky WHERE user_id=? AND (matka_id=? OR otec_id=?) ORDER BY COALESCE(datum_snusky,datum_zahajeni,vytvoreno) DESC");$st->execute([$uid,$id,$id]);$clutches=$st->fetchAll()?:[];}if(ir_table_exists($pdo,'wp_ir2_zvire_fotky')){$st=$pdo->prepare("SELECT * FROM wp_ir2_zvire_fotky WHERE user_id=? AND zvire_id=? ORDER BY poradi,datum DESC,id DESC");$st->execute([$uid,$id]);$photos=$st->fetchAll()?:[];}}catch(Throwable){}
if(ir_table_exists($pdo,'wp_ir2_documents')){try{$st=$pdo->prepare('SELECT id,title,category,file_name,mime_type,created_at FROM wp_ir2_documents WHERE user_id=? AND animal_id=? ORDER BY created_at DESC LIMIT 12');$st->execute([$uid,$id]);$animalDocs=$st->fetchAll()?:[];}catch(Throwable){}}
if((int)($a['otec_id']??0)>0)$father=ir_animal($pdo,$uid,(int)$a['otec_id']);if((int)($a['matka_id']??0)>0)$mother=ir_animal($pdo,$uid,(int)$a['matka_id']);
$lastFeed=ir_last_activity($pdo,$uid,$id,'Krmení');$lastShed=ir_last_activity($pdo,$uid,$id,'Svlek');$feedingType=ir_animal_feeding_type_label($pdo,$uid,$id);$inbreed=ir_inbreeding_pair($pdo,$uid,(int)($a['otec_id']??0),(int)($a['matka_id']??0));
$species=ir_species_row($pdo,$uid,(int)($a['druh_id']??0));$suppRec=ir_supplement_recommendation($pdo,$uid,$a);$suppWinner=$suppRec['winner']??null;$rotation=ir_get_species_rotation($pdo,$uid,$a);$rotationStatus=ir_supplement_rotation_status($pdo,$uid,$a,$suppRec);$cycles=ir_reproduction_cycles_for_animal($pdo,$uid,$id,8);
$careMap=[
'Denní teplota'=>ir_effective_value($a,$species,'teplota_den','denni_teplota'),'Noční teplota / pokles'=>ir_effective_value($a,$species,'teplota_noc','nocni_teplota'),'Výhřevné místo'=>ir_effective_value($a,$species,'vyhrevne_misto','vyhrevne_misto'),'Vlhkost'=>ir_effective_value($a,$species,'vlhkost','bezna_vlhkost'),'Vlhkost při svleku'=>ir_effective_value($a,$species,'vlhkost_svlek','vlhkost_svlek'),'Rosení'=>ir_effective_value($a,$species,'interval_roseni','roseni'),'Fotoperioda'=>ir_effective_value($a,$species,'fotoperioda','fotoperioda'),'UVB'=>ir_effective_value($a,$species,'uvb','uvb'),'Ubikace'=>['value'=>(string)($a['ubikace_nazev']??''),'source'=>'jedinec'],'Doporučená ubikace'=>ir_effective_value($a,$species,'doporucena_ubikace','doporucena_ubikace'),'Substrát'=>ir_effective_value($a,$species,'substrat','substrat'),'Vybavení'=>ir_effective_value($a,$species,'vybaveni_ubikace','vybaveni'),'Interval krmení'=>['value'=>ir_feeding_interval_days($pdo,$uid,$a).' dní','source'=>'výpočet'],'Typ krmení'=>['value'=>$feedingType,'source'=>'jedinec'],'Další suplement'=>['value'=>(string)($suppWinner['name']??''),'source'=>$suppWinner?((string)($suppWinner['source']??'rotace')):'']];
$breedMap=['Období páření'=>ir_effective_value($a,$species,'mesice_pareni','obdobi_pareni'),'Pohlavní dospělost ♂'=>ir_effective_value($a,$species,'pohlavni_dospelost_samec','pohlavni_dospelost_samec'),'Pohlavní dospělost ♀'=>ir_effective_value($a,$species,'pohlavni_dospelost_samice','pohlavni_dospelost_samice'),'Min. věk ♂'=>ir_effective_value($a,$species,'min_vek_pareni_samec','min_vek_pareni_samec'),'Min. věk ♀'=>ir_effective_value($a,$species,'min_vek_pareni_samice','min_vek_pareni_samice'),'Min. hmotnost ♂'=>ir_effective_value($a,$species,'min_vaha_pareni_samec','min_vaha_pareni_samec'),'Min. hmotnost ♀'=>ir_effective_value($a,$species,'min_vaha_pareni_samice','min_vaha_pareni_samice'),'Teplotní cyklus'=>ir_effective_value($a,$species,'teplotni_cyklus_pareni','teplotni_cyklus'),'Fotoperioda páření'=>ir_effective_value($a,$species,'fotoperioda_pareni','fotoperioda_pareni'),'Vlhkost páření'=>ir_effective_value($a,$species,'vlhkost_pareni','vlhkost_pareni'),'Příprava páření'=>ir_effective_value($a,$species,'priprava_pareni','priprava_pareni'),'Brumace'=>ir_effective_value($a,$species,'obdobi_brumace','obdobi_brumace'),'Brumace doporučená'=>['value'=>(!empty($a['brumace_doporucena'])||!empty($species['brumace_doporucena']))?'Ano':'Ne','source'=>!empty($a['brumace_doporucena'])?'jedinec':(!empty($species['brumace_doporucena'])?'druh':'')],'Brumace nutná'=>['value'=>(!empty($a['brumace_nutna'])||!empty($species['brumace_nutna']))?'Ano':'Ne','source'=>!empty($a['brumace_nutna'])?'jedinec':(!empty($species['brumace_nutna'])?'druh':'')],'Teplota brumace'=>ir_effective_value($a,$species,'teplota_brumace','teplota_brumace'),'Délka brumace'=>ir_effective_value($a,$species,'delka_brumace','delka_brumace'),'Příprava brumace'=>ir_effective_value($a,$species,'priprava_brumace','priprava_brumace'),'Ukončení brumace'=>ir_effective_value($a,$species,'ukonceni_brumace','ukonceni_brumace'),'Typ reprodukce'=>['value'=>(string)($species['typ_reprodukce']??''),'source'=>(!empty($species['typ_reprodukce'])?'druh':'')],'Reprodukční cyklus'=>['value'=>(string)($species['reprodukcni_cyklus']??''),'source'=>(!empty($species['reprodukcni_cyklus'])?'druh':'')],'Inkubační teplota'=>['value'=>(string)($species['inkubacni_teplota']??''),'source'=>(!empty($species['inkubacni_teplota'])?'druh':'')],'Délka inkubace'=>['value'=>(string)($species['delka_inkubace']??''),'source'=>(!empty($species['delka_inkubace'])?'druh':'')],'Velikost snůšky'=>['value'=>(string)($species['velikost_snusky']??''),'source'=>(!empty($species['velikost_snusky'])?'druh':'')]];
/* Zdraví: pokud existuje strukturovaná tabulka wp_ir2_zdravi (health.php), čteme reálná data
   (typ_zaznamu, status, veterinář, příznaky, diagnóza, léčba, lék, dávkování, datum_od/datum_do).
   Beze změny schématu - jen čtení. Bezpečný fallback na dosavadní filtr nad historií aktivit,
   pokud tabulka neexistuje nebo dotaz selže (stejné chování jako dřív). */
$healthUsesTable=ir_table_exists($pdo,'wp_ir2_zdravi');$healthRecords=[];
if($healthUsesTable){
    try{$st=$pdo->prepare("SELECT * FROM wp_ir2_zdravi WHERE user_id=? AND zvire_id=? ORDER BY COALESCE(datum_od,DATE(vytvoreno)) DESC,id DESC LIMIT 50");$st->execute([$uid,$id]);$healthRecords=$st->fetchAll()?:[];}catch(Throwable){$healthUsesTable=false;}
}
$healthHistory=[];foreach($history as $row){$t=mb_strtolower((string)($row['typ']??''),'UTF-8');if(str_contains($t,'zdrav')||str_contains($t,'léč')||str_contains($t,'karant')||str_contains($t,'veter')||str_contains($t,'kontrol'))$healthHistory[]=$row;}
$milestones=[];$gallery=[];foreach($photos as $p){$cat=mb_strtolower(trim((string)($p['kategorie']??'')),'UTF-8');if(in_array($cat,['vývoj','vyvoj','milník','milnik'],true)&&count($milestones)<5)$milestones[]=$p;else $gallery[]=$p;}
require_once __DIR__.'/includes/pedigree.php';$pedigreeTree=ir_pedigree_tree_for_animal($pdo,$uid,$a,4);
$weightVals=[];$lengthVals=[];$feedDays=[];
foreach(array_reverse($history) as $r){if($r['typ']==='Vážení'&&is_numeric(str_replace(',','.',(string)$r['hodnota'])))$weightVals[]=$r['hodnota'];if($r['typ']==='Délka'&&is_numeric(str_replace(',','.',(string)$r['hodnota'])))$lengthVals[]=$r['hodnota'];if($r['typ']==='Krmení')$feedDays[]=1;}
/* Plánovač: aktivní úkoly tohoto konkrétního zvířete, agregované stejnou logikou jako
   tasks.php / planner-agenda.php (ir_planner_group_tasks) - jen čtení, žádný zápis. */
$animalTasks=[];try{$st=$pdo->prepare("SELECT * FROM wp_ir2_planovac WHERE user_id=? AND zvire_id=? AND stav='Aktivní' ORDER BY datum_termin,id");$st->execute([$uid,$id]);$animalTasks=ir_planner_group_tasks($st->fetchAll()?:[]);}catch(Throwable){}
$latin=trim((string)($a['latinsky_nazev']??''));$czech=trim((string)($a['druh']??''));$code=trim((string)($a['jmeno_kod']??''));
$photo=ir_animal_photo($a);ir_page_start(ir_animal_display($a),'animals');echo ir_back('animals.php','Zpět na zvířata');
$tabs=['prehled'=>'Přehled','popis'=>'Popis','chov'=>'Chov & parametry','reprodukce'=>'Reprodukce','zdravi'=>'Zdraví','galerie'=>'Galerie','rodokmen'=>'Rodokmen','puvod'=>'Původ & dokumenty','automatizace'=>'Automatizace'];
?>
<?php
$sexRaw=trim((string)($a['pohlavi']??''));
$sexSymbol='';$sexClass='is-unknown';
if(mb_strtolower($sexRaw,'UTF-8')==='samec'){$sexSymbol='♂';$sexClass='is-male';}
elseif(mb_strtolower($sexRaw,'UTF-8')==='samice'){$sexSymbol='♀';$sexClass='is-female';}
$feedInterval=ir_feeding_interval_days($pdo,$uid,$a);
$nextFeedDate=$lastFeed?date('d.m.Y',strtotime('+'.$feedInterval.' days',strtotime((string)$lastFeed['datum']))):'Nyní';
$healthLabel='V pořádku';
if($healthUsesTable){$activeHealth=array_filter($healthRecords,static fn($r)=>(string)($r['status']??'')!=='Ukončeno');if(count($activeHealth)>0)$healthLabel=count($activeHealth).' aktivní';}
elseif(!empty($healthHistory)){$healthLabel='Záznam '.date('d.m.Y',strtotime((string)$healthHistory[0]['datum']));}
$activeCycle=null;foreach($cycles as $cy){if((string)($cy['stav']??'')==='Aktivní'){$activeCycle=$cy;break;}}
?>
<section class="animal-profile-hero panel glow-panel">
  <div class="animal-profile-media-column">
    <button type="button" class="animal-profile-main-photo" <?php if($photo):?>data-photo-full="<?=ir_e($photo)?>" data-photo-label="<?=ir_e($latin!==''?$latin:ir_animal_display($a))?>"<?php endif;?> aria-label="Zobrazit profilovou fotografii">
      <?php if($photo):?><img src="<?=ir_e($photo)?>" alt="<?=ir_e($latin!==''?$latin:ir_animal_display($a))?>"><?php else:?><span class="animal-photo-empty"><?=ir_visual_icon('animals')?><b>Bez fotografie</b></span><?php endif;?>
    </button>
    <section class="animal-development-gallery" aria-label="Galerie vývoje">
      <header><div><strong>Galerie vývoje</strong><small>1–5 milníků vývoje zvířete</small></div><a href="animal-media.php?id=<?=$id?>">Spravovat</a></header>
      <div class="animal-development-thumbs">
        <?php foreach(array_slice($milestones,0,5) as $mi=>$mp):$mu=ir_asset_photo_url((string)($mp['soubor']??''));if(!$mu)continue;$mlabel=trim((string)($mp['popis']??''));$mdate=trim((string)($mp['datum']??''));?>
          <button type="button" class="animal-development-thumb" data-photo-full="<?=ir_e($mu)?>" data-photo-label="<?=ir_e($mlabel!==''?$mlabel:'Vývoj '.($mi+1))?>">
            <span><img src="<?=ir_e($mu)?>" alt=""></span>
            <small><?=ir_e($mdate!==''?date('m/Y',strtotime($mdate)):('Milník '.($mi+1)))?></small>
          </button>
        <?php endforeach;?>
        <?php if(!$milestones):?><a class="animal-development-empty" href="animal-media.php?id=<?=$id?>">+ Přidat vývojovou fotku</a><?php endif;?>
      </div>
    </section>
  </div>

  <div class="animal-profile-summary">
    <div class="animal-profile-titlebar">
      <div class="animal-profile-identity">
        <div class="chip-row"><span class="is-status"><?=ir_e((string)($a['status_chovu']??'Aktivní'))?></span><span><?=ir_e((string)($a['ubikace_nazev']??'Bez ubikace'))?></span><?php if(!empty($a['morf_linie'])):?><span><?=ir_e((string)$a['morf_linie'])?></span><?php endif;?></div>
        <h1><?=ir_e($latin!==''?$latin:($code!==''?$code:'Zvíře'))?><?php if($sexSymbol!==''):?><b class="animal-sex-symbol <?=$sexClass?>" aria-label="<?=ir_e($sexRaw)?>"><?=$sexSymbol?></b><?php endif;?></h1>
        <p><?php if($czech!==''&&$czech!==$latin):?><?=ir_e($czech)?><?php endif;?><?php if($code!==''):?> · <?=ir_e($code)?><?php endif;?><?php if($sexRaw!==''):?> · <?=ir_e($sexRaw)?><?php endif;?></p>
      </div>
      <div class="animal-profile-actions"><?php if(!$b1Archived&&!$b1Locked&&ir_can('write')&&!in_array($a['pohlavi'],['Skupina','Pár'],true)):?><button type="button" class="btn primary" data-feed-animal="<?=ir_e($b1FeedJson)?>" data-source="profile">Krmení</button><?php endif;?><a class="btn secondary" href="<?=in_array($a['pohlavi'],['Skupina','Pár'],true)?'quick.php?parent_id='.$id:'activity.php?animal_id='.$id?>">+ Aktivita</a><a class="btn secondary" href="animal-edit.php?id=<?=$id?>">Upravit</a><a class="btn secondary" href="print.php?type=label&id=<?=$id?>" target="_blank">QR</a><a class="btn secondary" href="export.php?type=animal&id=<?=$id?>">Export</a><?php if($b1Archived&&ir_can('write')):?><form method="post" class="b1-inline-mini"><?=ir_csrf_field()?><input type="hidden" name="action" value="restore"><button class="btn secondary">Obnovit z archivu</button></form><?php elseif(!$b1Archived&&ir_can('delete')):?><details class="b1-archive"><summary class="btn secondary">Archivovat…</summary><form method="post" class="b1-archive-pop"><?=ir_csrf_field()?><input type="hidden" name="action" value="archive"><label>Důvod<select class="input" name="reason"><option value="Archiv">Archiv</option><option value="Prodáno">Prodáno</option><option value="Uhynulo">Uhynulo</option></select></label><p class="muted">Nic se nemaže: historie, fotky a dokumenty zůstávají. Otevřené úkoly se pozastaví.</p><button class="btn danger">Archivovat</button></form></details><?php endif;?></div>
    </div>

    <?php if($b1Archived):?><div class="flash warning">Archivováno <?=date('j. n. Y',strtotime((string)$a['archivovano']))?> (<?=ir_e((string)$a['status_chovu'])?>). Karta je jen pro čtení, dokud zvíře neobnovíte.</div><?php elseif($b1Locked):?><div class="flash warning">Zvíře je nad limitem tarifu — jen pro čtení. Data zůstávají zachována. <a href="plans.php?need=animals">Zvýšit tarif</a></div><?php endif;?>
    <div class="b1-intel"><span class="b1-chip <?=$b1Appetite['alert']?'miss':'ok'?>"><?=ir_visual_icon('feeding')?> Chuť: <?=$b1Appetite['consecutive_refusals']?'odmítnuto '.$b1Appetite['consecutive_refusals'].'× za sebou':'v pořádku'?><?=$b1Appetite['days_since_success']!==null?' · snědlo před '.$b1Appetite['days_since_success'].' d':''?></span><span class="b1-chip <?=in_array($b1Shed['state']??'',['window','observed'],true)?'miss':'ok'?>"><?=ir_visual_icon('shedding')?> Svlek: <?=ir_e(IR_SHED_STATES[$b1Shed['state']??'insufficient']??'—')?><?=!empty($b1Shed['from'])?' · okno '.date('j. n.',strtotime((string)$b1Shed['from'])).'–'.date('j. n.',strtotime((string)$b1Shed['to'])):''?></span></div>
    <div class="animal-hero-metrics">
      <article><span><?=ir_visual_icon('calendar')?></span><div><small>Poslední krmení</small><strong><?=$lastFeed?date('d.m.Y',strtotime((string)$lastFeed['datum'])):'—'?></strong></div></article>
      <article><span><?=ir_visual_icon('calendar')?></span><div><small>Další krmení</small><strong><?=$nextFeedDate?></strong></div></article>
      <article><span><?=ir_visual_icon('tasks')?></span><div><small>Poslední svlek</small><strong><?=$lastShed?date('d.m.Y',strtotime((string)$lastShed['datum'])):'—'?></strong></div></article>
      <article><span><?=ir_visual_icon('health')?></span><div><small>Zdravotní stav</small><strong><?=ir_e($healthLabel)?></strong></div></article>
      <article><span><?=ir_visual_icon('animals')?></span><div><small>ID zvířete</small><strong><?=ir_e((string)($a['animal_id']?:'IR-'.$id))?></strong></div></article>
    </div>

    <div class="animal-overview-primary-grid">
      <section class="animal-overview-card animal-overview-basic">
        <header><div><strong>Základní informace</strong><small>Identifikace a původ</small></div><a href="animal-edit.php?id=<?=$id?>">Upravit</a></header>
        <dl>
          <div><dt>Druh</dt><dd><?=ir_e($latin?:'—')?></dd></div>
          <div><dt>Český název</dt><dd><?=ir_e($czech?:'—')?></dd></div>
          <div><dt>Pohlaví</dt><dd><?php if($sexSymbol!==''):?><b class="animal-sex-symbol compact <?=$sexClass?>"><?=$sexSymbol?></b><?php endif;?><?=ir_e($sexRaw?:'Neurčeno')?></dd></div>
          <div><dt>Fáze / morfa</dt><dd><?=ir_e((string)($a['morf_linie']?:'—'))?></dd></div>
          <div><dt>Datum narození</dt><dd><?=ir_e((string)($a['datum_narozeni']?:'—'))?></dd></div>
          <div><dt>Původ</dt><dd><?=ir_e((string)($a['puvod']?:'—'))?></dd></div>
          <div><dt>Ubikace</dt><dd><?=ir_e((string)($a['ubikace_nazev']??'Bez ubikace'))?></dd></div>
          <div><dt>ID zvířete</dt><dd><?=ir_e((string)($a['animal_id']?:'IR-'.$id))?></dd></div>
        </dl>
      </section>

      <section class="animal-overview-card animal-overview-care">
        <header><div><strong>Chovné prostředí</strong><small>Aktuální nastavení a doporučení</small></div><a href="#chov" data-tab-jump="chov">Vše →</a></header>
        <div class="animal-care-tiles">
          <?php foreach(['Denní teplota','Noční teplota / pokles','Vlhkost','Ubikace','Typ krmení','UVB','Rosení','Substrát'] as $k):$item=$careMap[$k]??null;if(!$item)continue;?><article><small><?=ir_e($k)?></small><strong><?=ir_e((string)($item['value']?:'—'))?></strong></article><?php endforeach;?>
        </div>
      </section>
    </div>
  </div>
</section>

<nav class="animal-tabs" role="tablist">
<?php foreach($tabs as $key=>$labelTab):?><a href="#<?=$key?>" data-tab-btn="<?=$key?>" role="tab"><?=ir_e($labelTab)?></a><?php endforeach;?>
</nav>
<section class="animal-fast-actions" aria-label="Rychlé záznamy zvířete">
  <div class="animal-fast-actions-label"><strong>Rychlý zápis</strong><small>zápis přímo do historie tohoto zvířete</small></div>
  <a href="quick.php?animal_id=<?=$id?>&type=Krmení"><?=ir_visual_icon('feeding')?><span>Krmení</span></a>
  <a href="quick.php?animal_id=<?=$id?>&type=Výměna%20vody"><?=ir_visual_icon('water')?><span>Voda</span></a>
  <a href="quick.php?animal_id=<?=$id?>&type=Rosení"><?=ir_visual_icon('mist')?><span>Rosení</span></a>
  <a href="quick.php?animal_id=<?=$id?>&type=Čištění"><?=ir_visual_icon('cleaning')?><span>Úklid</span></a>
  <a href="quick.php?animal_id=<?=$id?>&type=Vážení"><?=ir_visual_icon('weight')?><span>Vážení</span></a>
  <a href="quick.php?animal_id=<?=$id?>&type=Svlek"><?=ir_visual_icon('shedding')?><span>Svlek</span></a>
  <a href="health.php?animal_id=<?=$id?>"><?=ir_visual_icon('health')?><span>Zdraví</span></a>
  <a href="print.php?type=label&id=<?=$id?>" target="_blank"><?=ir_visual_icon('scan')?><span>QR karta</span></a>
  <a href="voice.php?animal_id=<?=$id?>" class="is-voice"><?=ir_visual_icon('quick-add')?><span>Hlas</span></a>
</section>
<?php require __DIR__.'/includes/animal-members.php'; ?>

<section class="animal-tab-panel animal-overview-tab" id="tab-prehled" data-tab-panel="prehled">
  <div class="animal-overview-secondary-grid">
    <section class="animal-overview-card animal-overview-feeding">
      <header><div><strong>Krmení / suplementace</strong><small>Krmný režim a doplňky</small></div><a href="#chov" data-tab-jump="chov">Detail →</a></header>
      <div class="animal-detail-tiles">
        <article><small>Typ krmení</small><strong><?=ir_e($feedingType?:'—')?></strong></article>
        <article><small>Interval</small><strong><?=$feedInterval?> dní</strong></article>
        <article><small>Další suplement</small><strong><?=ir_e((string)($suppWinner['name']??'—'))?></strong></article>
        <article><small>Další krmení</small><strong><?=$nextFeedDate?></strong></article>
      </div>
    </section>

    <section class="animal-overview-card animal-overview-repro">
      <header><div><strong>Reprodukce a stav</strong><small>Aktuální cyklus a klíčové informace</small></div><a href="#reprodukce" data-tab-jump="reprodukce">Detail →</a></header>
      <div class="animal-detail-tiles">
        <article><small>Aktuální cyklus</small><strong><?=ir_e($activeCycle?(string)$activeCycle['nazev']:'Neaktivní')?></strong></article>
        <article><small>Období páření</small><strong><?=ir_e((string)($breedMap['Období páření']['value']?:'—'))?></strong></article>
        <article><small>Brumace</small><strong><?php $brumaceAno=(($breedMap['Brumace nutná']['value']??'')==='Ano')?'Nutná':((($breedMap['Brumace doporučená']['value']??'')==='Ano')?'Doporučená':'Ne');echo ir_e($brumaceAno);?></strong></article>
        <article><small>Historie snůšek</small><strong><?=count($clutches)?></strong></article>
      </div>
    </section>

    <section class="animal-overview-card animal-overview-growth">
      <header><div><strong>Růst a hmotnost</strong><small>Vývoj v čase</small></div></header>
      <div class="animal-growth-modern"><article><small>Hmotnost</small><?=ir_svg_sparkline($weightVals)?></article><article><small>Délka</small><?=ir_svg_sparkline($lengthVals)?></article><article class="animal-growth-count"><small>Krmení v historii</small><strong><?=count($feedDays)?></strong><span>záznamů</span></article></div>
    </section>
  </div>
</section>

<section class="animal-tab-panel panel glow-panel" id="tab-popis" data-tab-panel="popis" hidden>
 <header class="panel-head"><div><span class="panel-kicker">POPIS</span><h2>Charakteristika a poznámky</h2></div><a href="animal-edit.php?id=<?=$id?>">Upravit</a></header>
 <div class="param-groups">
  <div class="param-group"><h3>Taxonomie</h3><div class="profile-data-grid">
   <div><small>Poddruh</small><strong><?=ir_e((string)($a['poddruh']?:'—'))?></strong></div>
   <div><small>Lokalita</small><strong><?=ir_e((string)($a['lokalita']?:'—'))?></strong></div>
   <div><small>Aktivita</small><strong><?=ir_e((string)($a['aktivita']?:'—'))?></strong></div>
   <div><small>Délka dožití</small><strong><?=ir_e((string)($a['delka_doziti']?:'—'))?></strong></div>
  </div></div>
 </div>
 <div class="param-groups">
  <div class="param-group"><h3>Popis zvířete</h3><p><?=nl2br(ir_e((string)($a['poznamka']?:'Bez poznámky.')))?></p></div>
  <div class="param-group"><h3>Přirozený výskyt</h3><p><?=nl2br(ir_e((string)($a['prirozeny_vyskyt']?:'Neuvedeno.')))?></p></div>
  <div class="param-group"><h3>Biotop</h3><p><?=nl2br(ir_e((string)($a['biotop']?:'Neuvedeno.')))?></p></div>
 </div>
</section>

<section class="animal-tab-panel panel glow-panel" id="tab-chov" data-tab-panel="chov" hidden>
 <header class="panel-head"><div><span class="panel-kicker">CHOV &amp; PARAMETRY</span><h2>Prostředí, krmení a chovné parametry</h2></div><a href="animal-edit.php?id=<?=$id?>">Upravit</a></header>
 <div class="param-groups">
  <div class="param-group"><h3>Prostředí</h3><div class="profile-data-grid">
  <?php foreach(['Denní teplota','Noční teplota / pokles','Vlhkost','UVB','Substrát','Vybavení','Doporučená ubikace','Fotoperioda','Rosení','Vlhkost při svleku'] as $k):$item=$careMap[$k]??null;if(!$item)continue;?>
  <div><small><?=ir_e($k)?></small><strong><?=ir_e((string)($item['value']?:'—'))?></strong></div>
  <?php endforeach;?>
  </div></div>
  <div class="param-group"><h3>Krmení</h3><div class="profile-data-grid">
   <div><small>Potrava</small><strong><?=ir_e((string)($a['potrava']?:'—'))?></strong></div>
   <div><small>Typ krmení</small><strong><?=ir_e((string)($careMap['Typ krmení']['value']?:'—'))?></strong></div>
   <div><small>Interval krmení</small><strong><?=ir_e((string)($careMap['Interval krmení']['value']?:'—'))?></strong></div>
   <div><small>Suplementace</small><strong><?=ir_e((string)($careMap['Další suplement']['value']?:'—'))?></strong></div>
   <div><small>Aktuální krok rotace</small><strong><?=ir_e((string)($rotationStatus['current']['nazev']??$rotationStatus['current']['typ']??'—'))?></strong></div>
   <?php if(trim((string)($a['vitaminova_rotace']??''))!==''):?><div><small>Poznámka k rotaci</small><strong><?=ir_e((string)$a['vitaminova_rotace'])?></strong></div><?php endif;?>
  </div></div>
  <div class="param-group"><h3>Chovné parametry</h3><div class="profile-data-grid">
   <div><small>Chovný status</small><strong><?=ir_e((string)($a['status_chovu']?:'—'))?></strong></div>
   <div><small>Období páření</small><strong><?=ir_e((string)($breedMap['Období páření']['value']?:'—'))?></strong></div>
   <div><small>Brumace</small><strong><?php $brumaceAno=(($breedMap['Brumace nutná']['value']??'')==='Ano')?'Nutná':((($breedMap['Brumace doporučená']['value']??'')==='Ano')?'Doporučená':'Ne');$brumaceObdobi=trim((string)($breedMap['Brumace']['value']??''));echo ir_e($brumaceAno.($brumaceObdobi!==''&&$brumaceObdobi!=='—'?' · '.$brumaceObdobi:''));?></strong></div>
   <div><small>Délka inkubace</small><strong><?=ir_e((string)($breedMap['Délka inkubace']['value']?:'—'))?></strong></div>
  </div><span class="empty-state small">Podrobné reprodukční parametry a historii najdeš v záložce Reprodukce.</span></div>
 </div>
</section>

<section class="animal-tab-panel panel glow-panel" id="tab-reprodukce" data-tab-panel="reprodukce" hidden>
 <header class="panel-head"><div><span class="panel-kicker">REPRODUKCE</span><h2>Cykly, páření a snůšky</h2></div><a href="clutches.php?animal_id=<?=$id?>">Otevřít modul Reprodukce</a></header>
 <div class="param-group"><h3>Aktuální cyklus</h3>
 <?php if($activeCycle):?><div class="profile-data-grid"><div><small>Název</small><strong><?=ir_e((string)$activeCycle['nazev'])?></strong></div><div><small>Fáze (páření / ovulace / inkubace / líhnutí…)</small><strong><?=ir_e((string)($activeCycle['aktualni_faze']?:'—'))?></strong></div><div><small>Další akce</small><strong><?=ir_e((string)($activeCycle['dalsi_akce']?:'—'))?></strong></div><div><small>Termín</small><strong><?=!empty($activeCycle['dalsi_akce_datum'])?date('d.m.Y',strtotime((string)$activeCycle['dalsi_akce_datum'])):'—'?></strong></div></div>
 <?php else:?><div class="empty-state small">Bez aktivního reprodukčního cyklu.</div><?php endif;?></div>
 <div class="profile-data-grid breeding-data-grid"><?php foreach($breedMap as $label=>$item):?><div><small><?=ir_e($label)?></small><strong><?=ir_e((string)($item['value']?:'—'))?></strong></div><?php endforeach;?></div>
 <div class="cycle-mini-list"><h3>Historie reprodukce (cykly)</h3><?php foreach($cycles as $cycle):?><a href="clutches.php?id=<?=$cycle['id']?>"><div><strong><?=ir_e((string)$cycle['nazev'])?></strong><small><?=ir_e((string)($cycle['aktualni_faze']?:$cycle['stav']))?> · <?=ir_e((string)($cycle['dalsi_akce']?:'bez další akce'))?></small></div><time><?=!empty($cycle['dalsi_akce_datum'])?date('d.m.Y',strtotime((string)$cycle['dalsi_akce_datum'])):'—'?></time></a><?php endforeach;if(!$cycles):?><div class="empty-state small">Bez reprodukčního cyklu.</div><?php endif;?></div>
 <div class="simple-list"><h3>Snůšky / porody</h3><?php foreach(array_slice($clutches,0,8) as $c):?><a href="clutches.php?id=<?=$c['id']?>"><strong><?=ir_e((string)$c['nazev'])?></strong><span><?=ir_e((string)$c['stav'])?> · <?=ir_e((string)($c['datum_snusky']??$c['datum_zahajeni']??''))?></span></a><?php endforeach;if(!$clutches):?><div class="empty-state small">Bez snůšek.</div><?php endif;?></div>
</section>

<section class="animal-tab-panel panel glow-panel" id="tab-zdravi" data-tab-panel="zdravi" hidden>
 <header class="panel-head"><div><span class="panel-kicker">ZDRAVÍ</span><h2>Zdravotní záznamy a kontroly</h2></div><div class="chip-row"><a href="activity.php?animal_id=<?=$id?>&type=Zdravotní%20kontrola">+ Rychlý záznam</a><?php if($healthUsesTable):?><a href="health.php">Modul Zdraví →</a><?php endif;?></div></header>
 <?php if($healthUsesTable):$activeH=array_values(array_filter($healthRecords,static fn($r)=>(string)($r['status']??'')!=='Ukončeno'));?>
 <div class="health-summary"><article><small>Stav chovu</small><strong><?=ir_e((string)($a['status_chovu']?:'—'))?></strong></article><article><small>Aktivní řešení</small><strong><?=count($activeH)?></strong></article><article><small>Zdravotních záznamů</small><strong><?=count($healthRecords)?></strong></article></div>
 <div class="health-record-list">
 <?php foreach($healthRecords as $hr):$status=(string)($hr['status']??'');$pillClass=$status==='Ukončeno'?'is-closed':(mb_stripos($status,'sledov')!==false?'is-watch':'is-open');?>
 <a href="health.php"><time><?=!empty($hr['datum_od'])?date('d.m.Y',strtotime((string)$hr['datum_od'])):'—'?><?=!empty($hr['datum_do'])?' → '.date('d.m.Y',strtotime((string)$hr['datum_do'])):''?></time>
  <div><strong><?=ir_e((string)($hr['typ_zaznamu']?:'Zdravotní záznam'))?></strong><span class="health-status-pill <?=$pillClass?>"><?=ir_e($status?:'Aktivní')?></span>
   <small><?=ir_e(trim(implode(' · ',array_filter([($hr['veterinar']??'')!==''?'Veterinář: '.$hr['veterinar']:'',($hr['diagnoza']??'')!==''?'Dg: '.$hr['diagnoza']:'',($hr['lecba']??'')!==''?'Léčba: '.$hr['lecba']:'',($hr['lek']??'')!==''?'Lék: '.$hr['lek'].(($hr['davkovani']??'')!==''?' ('.$hr['davkovani'].')':''):''])),' ·'))?></small>
   <?php if(($hr['priznaky']??'')!==''):?><small>Příznaky: <?=ir_e((string)$hr['priznaky'])?></small><?php endif;?>
  </div></a>
 <?php endforeach;if(!$healthRecords):?><div class="empty-state small">Bez zdravotních záznamů v modulu Zdraví.</div><?php endif;?>
 </div>
 <?php else:?>
 <div class="health-summary"><article><small>Stav chovu</small><strong><?=ir_e((string)($a['status_chovu']?:'—'))?></strong></article><article><small>Poslední zdravotní záznam</small><strong><?=!empty($healthHistory)?date('d.m.Y',strtotime((string)$healthHistory[0]['datum'])):'—'?></strong></article><article><small>Zdravotních záznamů</small><strong><?=count($healthHistory)?></strong></article></div>
 <div class="health-record-list"><?php foreach(array_slice($healthHistory,0,10) as $hr):?><a href="activity.php?id=<?=$hr['id']?>"><time><?=date('d.m.Y',strtotime((string)$hr['datum']))?></time><div><strong><?=ir_e((string)$hr['typ'])?></strong><small><?=ir_e(trim((string)($hr['hodnota']??'').' · '.(string)($hr['detail']??''),' ·'))?></small></div></a><?php endforeach;if(!$healthHistory):?><div class="empty-state small">Bez zdravotních záznamů.</div><?php endif;?></div>
 <p class="empty-state small">Modul Zdraví (wp_ir2_zdravi) není v této instalaci k dispozici - zobrazena je historie aktivit filtrovaná podle klíčových slov.</p>
 <?php endif;?>
</section>

<section class="animal-tab-panel panel glow-panel" id="tab-galerie" data-tab-panel="galerie" hidden>
 <header class="panel-head"><div><span class="panel-kicker">GALERIE</span><h2>Vývoj a fotografie</h2></div><a href="animal-media.php?id=<?=$id?>">Správa fotek</a></header>
 <div class="milestone-photo-grid"><article class="is-profile"><small>Hlavní fotografie</small><?php if($photo):?><img src="<?=ir_e($photo)?>" alt=""><?php else:?><div class="photo-placeholder"><?=ir_visual_icon('animals')?></div><?php endif;?></article><?php for($mi=0;$mi<5;$mi++):$mp=$milestones[$mi]??null;$mu=$mp?ir_asset_photo_url((string)$mp['soubor']):'';?><article><small>Milník <?=$mi+1?></small><?php if($mu):?><img src="<?=ir_e($mu)?>" alt=""><span><?=ir_e((string)($mp['popis']??''))?></span><?php else:?><a class="photo-placeholder" href="animal-media.php?id=<?=$id?>">+ Přidat</a><?php endif;?></article><?php endfor;?></div>
 <div class="gallery-preview"><?php foreach($gallery as $gp):$gu=ir_asset_photo_url((string)$gp['soubor']);if(!$gu)continue;?><img src="<?=ir_e($gu)?>" alt=""><?php endforeach;if(!$gallery):?><div class="empty-state small">Bez dalších fotografií v galerii.</div><?php endif;?></div>
</section>

<section class="animal-tab-panel panel glow-panel" id="tab-rodokmen" data-tab-panel="rodokmen" hidden>
 <header class="panel-head"><div><span class="panel-kicker">RODOKMEN</span><h2>Původ a příbuznost</h2></div><a href="pedigree.php?animal_id=<?=$id?>#parent-editor">Upravit</a></header>
 <div class="param-groups">
  <div class="param-group"><h3>Otec</h3><?php if($father):?><a href="animal.php?id=<?=$father['id']?>"><strong><?=ir_e(ir_animal_display($father))?></strong></a><?php else:?><span class="empty-state small">Bez evidovaného otce (otec_id) - viz strom níže pro externí záznam z rodokmenu.</span><?php endif;?></div>
  <div class="param-group"><h3>Matka</h3><?php if($mother):?><a href="animal.php?id=<?=$mother['id']?>"><strong><?=ir_e(ir_animal_display($mother))?></strong></a><?php else:?><span class="empty-state small">Bez evidované matky (matka_id) - viz strom níže pro externí záznam z rodokmenu.</span><?php endif;?></div>
 </div>
 <p class="empty-state small">Strom níže spojuje oba zdroje: evidovaná zvířata (otec_id/matka_id) i externí předky z evidence rodokmenu (wp_ir2_rodokmen_osoby / wp_ir2_rodokmen_vazby).</p>
 <div class="pedigree-tree-scroll"><?=ir_pedigree_branch_html($pedigreeTree,'Aktuální zvíře')?></div>
 <div class="pedigree-score"><small>Odhad inbreeding</small><strong><?=number_format($inbreed,2,',',' ')?> %</strong><a href="pedigree.php?animal_id=<?=$id?>">Otevřít celý rodokmen →</a></div>
</section>

<section class="animal-tab-panel panel glow-panel" id="tab-puvod" data-tab-panel="puvod" hidden>
 <header class="panel-head"><div><span class="panel-kicker">PŮVOD &amp; DOKUMENTY</span><h2>Původ, doklady a přílohy</h2></div><a href="documents.php?animal_id=<?=$id?>">+ Přiložit dokument</a></header>
 <div class="profile-data-grid">
  <div><small>Původ</small><strong><?=ir_e((string)($a['puvod']?:'—'))?></strong></div>
  <div><small>Chovatel / zdroj</small><strong><?=ir_e((string)($a['chovatel_puvod']?:'—'))?></strong></div>
  <div><small>Datum pořízení</small><strong><?=ir_e((string)($a['datum_porizeni']?:'—'))?></strong></div>
  <div><small>CITES</small><strong><?=ir_e((string)($a['cites_cislo']?:'—'))?></strong></div>
 </div>
 <?php if(trim((string)($a['rodokmen_info']??''))!==''):?><div class="param-group"><h3>Poznámka k rodokmenu / původu</h3><p><?=nl2br(ir_e((string)$a['rodokmen_info']))?></p></div><?php endif;?>
 <div class="simple-list"><h3>Dokumenty</h3><?php foreach($animalDocs as $d):?><a href="<?=$d['file_name']?'document-file.php?id='.$d['id']:'documents.php?edit='.$d['id']?>" target="<?=$d['file_name']?'_blank':'_self'?>"><strong><?=ir_e($d['title'])?></strong><span><?=ir_e($d['category'])?> · <?=date('d.m.Y',strtotime($d['created_at']))?></span></a><?php endforeach;if(!$animalDocs):?><div class="empty-state small">Bez přiložených smluv, výsledků nebo RTG.</div><?php endif?></div>
</section>

<section class="animal-tab-panel panel glow-panel" id="tab-automatizace" data-tab-panel="automatizace" hidden>
 <header class="panel-head"><div><span class="panel-kicker">AUTOMATIZACE</span><h2>Plán péče, rotace a Plánovač</h2></div><a href="supplements.php">Spravovat rotace</a></header>
 <div class="profile-data-grid">
  <div><small>Typ krmení</small><strong><?=ir_e($feedingType?:'Nenastaveno')?></strong></div>
  <div><small>Interval krmení</small><strong><?=ir_e((string)($careMap['Interval krmení']['value']?:'—'))?></strong></div>
 </div>
 <?php if($rotation&&$rotation['steps']):?>
 <div class="rotation-overview">
  <div class="rotation-summary">
   <div><small>Výchozí typ krmení</small><strong><?=ir_e($feedingType?:'Nenastaveno')?></strong><span>Z vlastní aktivity označené jako krmení</span></div>
   <div class="active"><small>Aktuální krok</small><strong><?=ir_e((string)($rotationStatus['current']['nazev']??$rotationStatus['current']['typ']??'—'))?></strong><span><?=!empty($rotationStatus['due'])?'pro krmení '.date('d.m.Y',strtotime((string)$rotationStatus['due'])):'Při dalším krmení'?></span></div>
   <div><small>Následuje</small><strong><?=ir_e((string)($rotationStatus['next']['nazev']??$rotationStatus['next']['typ']??'—'))?></strong><span>Posun až po uloženém krmení</span></div>
  </div>
  <div class="rotation-chain compact"><?php foreach($rotation['steps'] as $step):$isNext=$suppWinner&&($suppWinner['source']??'')==='rotation'&&(int)($suppWinner['step_order']??0)===(int)$step['poradi'];?><span class="<?=$isNext?'is-next':''?>"><b><?=intval($step['poradi'])?></b><strong><?=ir_e((string)($step['nazev']?:$step['typ']))?></strong></span><?php endforeach;?></div>
  <div class="rotation-actions"><span>Rychlý záznam automaticky spojí <b><?=ir_e($feedingType?:'typ krmení')?></b> + aktuální suplement. Odmítnutí potravy rotaci neposouvá.</span><a class="btn tiny secondary" href="supplements.php">Spravovat rotace</a></div>
 </div>
 <?php else:?><div class="empty-state small">Pro tento druh není nastavena vitaminová rotace.</div><?php endif;?>
 <div class="simple-list"><h3>Naplánované úkoly v Plánovači</h3>
 <?php foreach($animalTasks as $g):$t=$g['first'];$items=$g['items'];$lbl=count($items)===1?(string)$t['nazev_ukolu']:$g['label'];?>
 <a href="tasks.php?task=<?=(int)$t['id']?>"><strong><?=ir_e($lbl)?><?=count($items)>1?' ('.count($items).')':''?></strong><span><?=date('d.m.Y',strtotime((string)$t['datum_termin']))?> · <?=ir_e((string)$t['kategorie'])?></span></a>
 <?php endforeach;if(!$animalTasks):?><div class="empty-state small">Bez aktivních úkolů pro toto zvíře.</div><?php endif;?>
 </div>
</section>

<section class="panel glow-panel animal-history-panel" id="historie" data-tab-panel="prehled"><header class="panel-head"><div><span class="panel-kicker">HISTORIE</span><h2>Aktivity a události (všechny záložky)</h2></div><a href="activities.php?animal_id=<?=$id?>">Celá historie</a></header>
<div class="accordion-list">
<?php $historyGroups=[];foreach($history as $r)$historyGroups[$r['typ']][]=$r;foreach($historyGroups as $type=>$items):?><details class="history-group" <?=in_array($type,['Krmení','Svlek'],true)?'open':''?>><summary><?=ir_visual_icon(ir_activity_icon_for_user($pdo,$uid,$type))?><strong><?=ir_e($type)?></strong><span><?=count($items)?> záznamů</span><a href="activity.php?animal_id=<?=$id?>&type=<?=urlencode($type)?>">+ Přidat</a></summary><div class="history-items"><?php foreach($items as $r):?><div class="history-row"><time><?=date('d.m.Y H:i',strtotime((string)$r['datum']))?></time><div><strong><?=ir_e((string)($r['hodnota']??''))?></strong><small><?=ir_e((string)($r['detail']??''))?></small></div><div class="row-actions"><a href="activity.php?id=<?=$r['id']?>">Upravit</a></div></div><?php endforeach;?></div></details><?php endforeach;if(!$history):?><div class="empty-state">Zatím bez historie.</div><?php endif;?>
</div></section>
<section class="panel glow-panel animal-overview-gallery-bottom" data-tab-panel="prehled">
  <header class="panel-head"><div><span class="panel-kicker">GALERIE</span><h2>Fotogalerie zvířete</h2></div><a href="animal-media.php?id=<?=$id?>">Spravovat fotografie</a></header>
  <div class="animal-general-gallery">
    <?php $galleryShown=0;foreach($gallery as $gp):$gu=ir_asset_photo_url((string)($gp['soubor']??''));if(!$gu)continue;$galleryShown++;if($galleryShown>10)break;?><button type="button" class="animal-general-thumb" data-photo-full="<?=ir_e($gu)?>" data-photo-label="<?=ir_e((string)($gp['popis']??'Fotografie'))?>"><img src="<?=ir_e($gu)?>" alt=""></button><?php endforeach;?>
    <?php if($galleryShown===0):?><a class="animal-gallery-empty" href="animal-media.php?id=<?=$id?>">+ Přidat fotografie do galerie</a><?php endif;?>
  </div>
</section>
<div class="animal-photo-lightbox" data-animal-lightbox hidden><button type="button" class="animal-photo-lightbox__backdrop" data-lightbox-close aria-label="Zavřít"></button><figure><button type="button" class="animal-photo-lightbox__close" data-lightbox-close aria-label="Zavřít">×</button><img src="" alt="" data-lightbox-image><figcaption data-lightbox-caption></figcaption></figure></div>
<script>
(function(){
 var tabs=document.querySelectorAll('[data-tab-btn]');
 var panels=document.querySelectorAll('[data-tab-panel]');
 function activate(key){
  tabs.forEach(function(b){b.classList.toggle('is-active',b.dataset.tabBtn===key);});
  panels.forEach(function(p){p.hidden=(p.dataset.tabPanel!==key);});
 }
 tabs.forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();activate(b.dataset.tabBtn);if(history.replaceState)history.replaceState(null,'',location.pathname+location.search+'#'+b.dataset.tabBtn);});});
 document.querySelectorAll('[data-tab-jump]').forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();activate(b.dataset.tabJump);window.scrollTo({top:0,behavior:'smooth'});if(history.replaceState)history.replaceState(null,'',location.pathname+location.search+'#'+b.dataset.tabJump);});});
 var initial=(location.hash||'').replace('#','');
 var known=Array.prototype.map.call(tabs,function(b){return b.dataset.tabBtn;});
 activate(known.indexOf(initial)>-1?initial:(known[0]||'prehled'));
 var lightbox=document.querySelector('[data-animal-lightbox]');
 var lightboxImage=lightbox?lightbox.querySelector('[data-lightbox-image]'):null;
 var lightboxCaption=lightbox?lightbox.querySelector('[data-lightbox-caption]'):null;
 document.querySelectorAll('[data-photo-full]').forEach(function(el){el.addEventListener('click',function(){if(!lightbox||!lightboxImage)return;lightboxImage.src=el.getAttribute('data-photo-full')||'';lightboxImage.alt=el.getAttribute('data-photo-label')||'';if(lightboxCaption)lightboxCaption.textContent=el.getAttribute('data-photo-label')||'';lightbox.hidden=false;document.body.classList.add('animal-lightbox-open');});});
 if(lightbox){lightbox.querySelectorAll('[data-lightbox-close]').forEach(function(el){el.addEventListener('click',function(){lightbox.hidden=true;document.body.classList.remove('animal-lightbox-open');if(lightboxImage)lightboxImage.src='';});});}
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&lightbox&&!lightbox.hidden){lightbox.hidden=true;document.body.classList.remove('animal-lightbox-open');if(lightboxImage)lightboxImage.src='';}});
})();
</script>
<?php ir_page_end();
