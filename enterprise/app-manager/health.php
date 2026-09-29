<?php
declare(strict_types=1);
/* HEALTH — treatments, checks, quarantine; real attachments (lab results, X-ray, vet reports) stored privately
   and served only through file.php after an ownership check. Follow-up dates feed the planner. */
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';require __DIR__.'/includes/reptile_core.php';
ir_require_perm('read');
$uid=ir_current_user_id();
try{$pdo->exec("CREATE TABLE IF NOT EXISTS wp_ir2_zdravi (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,zvire_id BIGINT UNSIGNED NOT NULL,typ_zaznamu VARCHAR(100) NOT NULL DEFAULT 'Preventivní kontrola',status VARCHAR(60) NOT NULL DEFAULT 'Aktivní řešení',datum_od DATE NULL,datum_do DATE NULL,veterinar VARCHAR(190) NULL,priznaky TEXT NULL,diagnoza TEXT NULL,lecba TEXT NULL,lek VARCHAR(190) NULL,davkovani VARCHAR(190) NULL,poznamka TEXT NULL,vytvoreno TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(user_id),INDEX(zvire_id),INDEX(datum_do)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");}catch(Throwable $e){}
$filterAnimal=ir_int($_GET['animal_id']??0);
/** Normalise $_FILES['files'] (multiple) into a list of single-file arrays. */
function ir_health_files(): array { $f=$_FILES['files']??null;if(!$f||!is_array($f['name']??null))return $f&&($f['error']??4)!==4?[$f]:[];$out=[];foreach($f['name'] as $i=>$n){if(($f['error'][$i]??4)===UPLOAD_ERR_NO_FILE)continue;$out[]=['name'=>$n,'type'=>$f['type'][$i],'tmp_name'=>$f['tmp_name'][$i],'error'=>$f['error'][$i],'size'=>$f['size'][$i]];}return $out; }
if($_SERVER['REQUEST_METHOD']==='POST'){
    ir_verify_csrf();$op=(string)($_POST['op']??'');$back='health.php'.($filterAnimal?'?animal_id='.$filterAnimal:'');
    try{
        if($op==='save'){
            ir_require_perm('write');
            $aid=ir_int($_POST['zvire_id']??0);if(!$aid||!ir_animal($pdo,$uid,$aid))throw new RuntimeException('Vyberte platné zvíře.');
            $files=ir_health_files();$bytes=array_sum(array_map(fn($x)=>(int)$x['size'],$files));if($files&&($b=ir_storage_block($pdo,$uid,$bytes)))throw new RuntimeException($b);
            $from=(string)($_POST['datum_od']??'')?:date('Y-m-d');
            $pdo->beginTransaction();
            $pdo->prepare("INSERT INTO wp_ir2_zdravi(user_id,zvire_id,typ_zaznamu,status,datum_od,datum_do,veterinar,priznaky,diagnoza,lecba,lek,davkovani,poznamka) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")->execute([$uid,$aid,trim((string)$_POST['typ']),trim((string)$_POST['status']),$from,($_POST['datum_do']??'')?:null,trim((string)$_POST['veterinar']),trim((string)$_POST['priznaky']),trim((string)$_POST['diagnoza']),trim((string)$_POST['lecba']),trim((string)$_POST['lek']),trim((string)$_POST['davkovani']),trim((string)$_POST['poznamka'])]);
            $hid=(int)$pdo->lastInsertId();
            $stored=0;foreach($files as $f){ir_file_store($pdo,$uid,'health',$hid,$f,trim((string)($_POST['kind']??'')));$stored++;}
            ir_event_record($pdo,$uid,['animal_id'=>$aid,'type'=>'Zdravotní kontrola','performed_at'=>$from.' 12:00:00','value'=>trim((string)$_POST['typ']),'note'=>trim((string)$_POST['diagnoza']),'source'=>'manual','allow_duplicate'=>true]);
            ir_audit($pdo,'health',$hid,'create',null,['animal'=>$aid,'files'=>$stored]);
            $pdo->commit();ir_sync_health_tasks($pdo,$uid);
            ir_flash('success','Zdravotní záznam uložen'.($stored?' včetně '.$stored.' '.($stored===1?'přílohy':'příloh'):'').'.');
            ir_redirect('health.php?open='.$hid.($filterAnimal?'&animal_id='.$filterAnimal:''));
        }
        if($op==='attach'){
            ir_require_perm('write');$hid=ir_int($_POST['id']??0);
            if(!ir_scalar($pdo,'SELECT COUNT(*) FROM wp_ir2_zdravi WHERE id=? AND user_id=?',[$hid,$uid],0))throw new RuntimeException('Záznam nebyl nalezen.');
            $files=ir_health_files();if(!$files)throw new RuntimeException('Vyberte soubor.');
            if($b=ir_storage_block($pdo,$uid,array_sum(array_map(fn($x)=>(int)$x['size'],$files))))throw new RuntimeException($b);
            foreach($files as $f)ir_file_store($pdo,$uid,'health',$hid,$f,trim((string)($_POST['kind']??'')));
            ir_flash('success',count($files)===1?'Příloha nahrána.':count($files).' přílohy nahrány.');ir_redirect('health.php?open='.$hid.($filterAnimal?'&animal_id='.$filterAnimal:''));
        }
        if($op==='file_delete'){ir_require_perm('delete');ir_file_delete($pdo,$uid,ir_int($_POST['file_id']??0));ir_flash('success','Příloha odstraněna (lze obnovit správcem).');ir_redirect('health.php?open='.ir_int($_POST['id']??0).($filterAnimal?'&animal_id='.$filterAnimal:''));}
        if($op==='close'){ir_require_perm('write');$id=ir_int($_POST['id']??0);$pdo->prepare("UPDATE wp_ir2_zdravi SET status='Ukončeno',upraveno=NOW() WHERE id=? AND user_id=?")->execute([$id,$uid]);ir_audit($pdo,'health',$id,'close');ir_sync_health_tasks($pdo,$uid);ir_redirect($back);}
        if($op==='followup'){ir_require_perm('write');$id=ir_int($_POST['id']??0);$d=(string)($_POST['datum_do']??'');$pdo->prepare('UPDATE wp_ir2_zdravi SET datum_do=?,upraveno=NOW() WHERE id=? AND user_id=?')->execute([$d?:null,$id,$uid]);ir_sync_health_tasks($pdo,$uid);ir_flash('success','Termín kontroly uložen a převeden do plánovače.');ir_redirect('health.php?open='.$id);}
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();error_log('IR health: '.$e->getMessage());ir_flash('error',$e instanceof PDOException?'Změnu se nepodařilo uložit. Nic nebylo zapsáno.':$e->getMessage());ir_redirect($back);}
}
$animals=[];$rows=[];
$q=$pdo->prepare("SELECT id,jmeno_kod,latinsky_nazev FROM wp_ir2_zvirata z WHERE user_id=? AND ".ir_status_active_sql('z')." ORDER BY latinsky_nazev,jmeno_kod");$q->execute([$uid]);$animals=$q->fetchAll()?:[];
$q=$pdo->prepare("SELECT h.*,z.jmeno_kod,z.latinsky_nazev,(SELECT COUNT(*) FROM wp_ir2_files f WHERE f.user_id=h.user_id AND f.entity='health' AND f.entity_id=h.id AND f.deleted_at IS NULL) AS files FROM wp_ir2_zdravi h LEFT JOIN wp_ir2_zvirata z ON z.id=h.zvire_id AND z.user_id=h.user_id WHERE h.user_id=?".($filterAnimal?' AND h.zvire_id=?':'')." ORDER BY (h.status='Ukončeno'), COALESCE(h.datum_od,DATE(h.vytvoreno)) DESC,h.id DESC LIMIT 300");$q->execute($filterAnimal?[$uid,$filterAnimal]:[$uid]);$rows=$q->fetchAll()?:[];
$active=count(array_filter($rows,fn($r)=>(string)$r['status']!=='Ukončeno'));$overdue=count(array_filter($rows,fn($r)=>(string)$r['status']!=='Ukončeno'&&!empty($r['datum_do'])&&(string)$r['datum_do']<date('Y-m-d')));$withFiles=array_sum(array_map(fn($r)=>(int)$r['files'],$rows));
$open=ir_int($_GET['open']??0);$canW=ir_can('write');$canD=ir_can('delete');
$accept='.pdf,.jpg,.jpeg,.png,.webp,.gif,.tif,.tiff,.dcm,.txt,.csv,.doc,.docx,.xls,.xlsx';
ir_page_start('Zdraví','care');echo ir_back($filterAnimal?'animal.php?id='.$filterAnimal:'index.php',$filterAnimal?'Zpět na kartu':'Přehled');
?>
<section class="metric-grid health-kpis b1-metrics"><article class="mini-metric glow-panel"><span><?=ir_visual_icon('health')?></span><div><small>Aktivní řešení</small><strong><?=$active?></strong><em>léčba / sledování</em></div></article><article class="mini-metric glow-panel"><span><?=ir_visual_icon('status-warning')?></span><div><small>Kontrola po termínu</small><strong><?=$overdue?></strong><em>vyžaduje pozornost</em></div></article><article class="mini-metric glow-panel"><span><?=ir_visual_icon('vet-record')?></span><div><small>Přílohy</small><strong><?=$withFiles?></strong><em>zprávy, snímky, výsledky</em></div></article><article class="mini-metric glow-panel"><span><?=ir_visual_icon('check')?></span><div><small>Záznamů</small><strong><?=count($rows)?></strong><em><?=$filterAnimal?'u tohoto zvířete':'celkem'?></em></div></article></section>
<div class="b1-health">
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">ZDRAVOTNÍ HISTORIE</span><h2>Zdravotní evidence</h2></div><form method="get" class="b1-inline"><select class="input" name="animal_id" onchange="this.form.submit()"><option value="">Všechna zvířata</option><?php foreach($animals as $a):?><option value="<?=(int)$a['id']?>" <?=(int)$a['id']===$filterAnimal?'selected':''?>><?=ir_e((string)$a['jmeno_kod'])?></option><?php endforeach;?></select></form></header>
<div class="b1-hlist">
<?php foreach($rows as $r):$closed=(string)$r['status']==='Ukončeno';$late=!$closed&&!empty($r['datum_do'])&&(string)$r['datum_do']<date('Y-m-d');?>
<details class="b1-hrec <?=$closed?'is-closed':''?> <?=$late?'is-late':''?>" id="h<?=(int)$r['id']?>" <?=$open===(int)$r['id']?'open':''?>>
 <summary><?=ir_visual_icon($closed?'check':'health')?><span><b><?=ir_e((string)$r['typ_zaznamu'])?> · <?=ir_e((string)($r['jmeno_kod']?:$r['latinsky_nazev']))?></b><small><?=ir_e((string)($r['diagnoza']?:$r['priznaky']?:$r['lecba']?:'Bez detailu'))?></small></span><span class="b1-hrec-meta"><?php if((int)$r['files']):?><em class="b1-tag">📎 <?=(int)$r['files']?></em><?php endif;?><span class="status-pill <?=$closed?'':'amber'?>"><?=ir_e((string)$r['status'])?></span><time><?=$r['datum_od']?date('j. n. Y',strtotime((string)$r['datum_od'])):''?></time></span></summary>
 <div class="b1-hrec-body">
  <dl class="b1-kv"><?php foreach(['Příznaky'=>'priznaky','Diagnóza'=>'diagnoza','Léčba'=>'lecba','Lék'=>'lek','Dávkování'=>'davkovani','Veterinář'=>'veterinar','Poznámka'=>'poznamka'] as $l=>$k)if(trim((string)($r[$k]??''))!==''):?><div><dt><?=$l?></dt><dd><?=nl2br(ir_e((string)$r[$k]))?></dd></div><?php endif;?><div><dt>Kontrola</dt><dd><?=$r['datum_do']?date('j. n. Y',strtotime((string)$r['datum_do'])).($late?' · <span class="warn">po termínu</span>':''):'—'?></dd></div></dl>
  <?php $files=ir_files_for($pdo,$uid,'health',(int)$r['id']);?>
  <div class="b1-files"><h4>Přílohy</h4><?php if($files):?><ul><?php foreach($files as $f):$pv=ir_file_is_previewable($f);?><li><span class="b1-file-ico"><?=str_starts_with((string)$f['mime'],'image/')?'<img src="file.php?id='.(int)$f['id'].'&preview=1" alt="" loading="lazy">':'<b>'.ir_e(strtoupper(pathinfo((string)$f['original_name'],PATHINFO_EXTENSION))).'</b>'?></span><span class="b1-file-name"><b><?=ir_e((string)$f['original_name'])?></b><small><?=ir_human_size((int)$f['size_bytes'])?><?=$f['kind']?' · '.ir_e((string)$f['kind']):''?> · <?=date('j. n. Y',strtotime((string)$f['created_at']))?></small></span><?php if($pv):?><a class="btn small" href="file.php?id=<?=(int)$f['id']?>&preview=1" target="_blank" rel="noopener">Náhled</a><?php endif;?><a class="btn small" href="file.php?id=<?=(int)$f['id']?>">Stáhnout</a><?php if($canD):?><form method="post" class="b1-inline-mini" onsubmit="return confirm('Odstranit přílohu?')"><?=ir_csrf_field()?><input type="hidden" name="op" value="file_delete"><input type="hidden" name="id" value="<?=(int)$r['id']?>"><input type="hidden" name="file_id" value="<?=(int)$f['id']?>"><button class="btn small danger" aria-label="Odstranit přílohu">✕</button></form><?php endif;?></li><?php endforeach;?></ul><?php else:?><p class="muted">Zatím bez příloh.</p><?php endif;?>
  <?php if($canW):?><form method="post" enctype="multipart/form-data" class="b1-inline b1-upload"><?=ir_csrf_field()?><input type="hidden" name="op" value="attach"><input type="hidden" name="id" value="<?=(int)$r['id']?>"><input class="input b1-grow" type="file" name="files[]" multiple accept="<?=$accept?>" required aria-label="Soubory"><select class="input" name="kind"><option value="">Druh přílohy</option><option>Veterinární zpráva</option><option>Laboratorní výsledek</option><option>RTG / snímek</option><option>Fotografie</option><option>Recept</option><option>Jiné</option></select><button class="btn">Nahrát</button></form><?php endif;?></div>
  <?php if($canW&&!$closed):?><div class="b1-inline"><form method="post" class="b1-inline"><?=ir_csrf_field()?><input type="hidden" name="op" value="followup"><input type="hidden" name="id" value="<?=(int)$r['id']?>"><label>Kontrola<input class="input" type="date" name="datum_do" value="<?=ir_e((string)$r['datum_do'])?>"></label><button class="btn">Uložit termín</button></form><form method="post" class="b1-inline-mini"><?=ir_csrf_field()?><input type="hidden" name="op" value="close"><input type="hidden" name="id" value="<?=(int)$r['id']?>"><button class="btn primary">Ukončit řešení</button></form></div><?php endif;?>
 </div>
</details>
<?php endforeach;if(!$rows):?><div class="empty-state small">Bez zdravotních záznamů.</div><?php endif;?>
</div></section>
<?php if($canW):?>
<form class="panel glow-panel form-panel" method="post" enctype="multipart/form-data"><?=ir_csrf_field()?><input type="hidden" name="op" value="save"><header class="panel-head"><div><span class="panel-kicker">NOVÝ ZÁZNAM</span><h2>Léčba / kontrola</h2></div><button class="btn primary">Uložit</button></header><div class="form-grid cols-2">
<label>Zvíře<select name="zvire_id" required><option value="">Vyberte</option><?php foreach($animals as $a):?><option value="<?=(int)$a['id']?>" <?=(int)$a['id']===$filterAnimal?'selected':''?>><?=ir_e((string)($a['latinsky_nazev']?:$a['jmeno_kod']))?> · <?=ir_e((string)$a['jmeno_kod'])?></option><?php endforeach;?></select></label>
<label>Typ<select name="typ"><option>Preventivní kontrola</option><option>Léčba</option><option>Úraz</option><option>Karanténa</option><option>Medikace</option><option>Parazitologie</option></select></label>
<label>Stav<select name="status"><option>Aktivní řešení</option><option>Sledování</option><option>Ukončeno</option></select></label>
<label>Datum<input type="date" name="datum_od" value="<?=date('Y-m-d')?>" max="<?=date('Y-m-d')?>"></label><label>Kontrola / do<input type="date" name="datum_do"></label><label>Veterinář<input name="veterinar"></label>
<label>Příznaky<textarea name="priznaky"></textarea></label><label>Diagnóza<textarea name="diagnoza"></textarea></label><label>Léčba<textarea name="lecba"></textarea></label><label>Lék / dávkování<input name="lek" placeholder="Lék"><input name="davkovani" placeholder="Dávkování"></label>
<label class="span-2">Poznámka<textarea name="poznamka"></textarea></label>
<label class="span-2">Přílohy (PDF, snímky, DICOM, výsledky · max. 25 MB / soubor)<input type="file" name="files[]" multiple accept="<?=$accept?>"></label>
<input type="hidden" name="kind" value="Veterinární zpráva">
</div></form>
<?php endif;?>
</div>
<?php ir_page_end();
