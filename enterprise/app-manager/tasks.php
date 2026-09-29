<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';require __DIR__.'/includes/reptile_core.php';
$uid=ir_current_user_id();
if($_SERVER['REQUEST_METHOD']==='POST'){
 ir_verify_csrf();$action=(string)($_POST['action']??'');$id=ir_int($_POST['id']??0);
 try{
  if($action==='complete'&&$id)ir_complete_planner_task($pdo,$uid,$id);
  elseif($action==='reopen'&&$id)$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Aktivní' WHERE user_id=? AND id=?")->execute([$uid,$id]);
  elseif($action==='postpone'&&$id){$days=max(1,min(3,(int)($_POST['days']??1)));$pdo->prepare("UPDATE wp_ir2_planovac SET datum_termin=DATE_ADD(GREATEST(datum_termin,CURDATE()),INTERVAL {$days} DAY),stav='Aktivní' WHERE user_id=? AND id=?")->execute([$uid,$id]);}
  elseif($action==='skip'&&$id){$reason=trim((string)($_POST['skip_reason']??''));$note=$reason!==''?'Vynecháno: '.$reason:'Vynecháno';$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Vynecháno',poznamka=CASE WHEN COALESCE(poznamka,'')='' THEN ? ELSE CONCAT(poznamka,' · ',?) END WHERE user_id=? AND id=? AND stav='Aktivní'")->execute([$note,$note,$uid,$id]);}
  elseif(in_array($action,['complete_group','skip_group','postpone_group'],true)){
   $ids=array_values(array_unique(array_filter(array_map('intval',(array)($_POST['ids']??[])),static fn($v)=>$v>0)));
   if($ids){
    if($action==='complete_group'){foreach($ids as $taskId)ir_complete_planner_task($pdo,$uid,$taskId);}
    elseif($action==='postpone_group'){$days=max(1,min(3,(int)($_POST['days']??1)));foreach($ids as $taskId)$pdo->prepare("UPDATE wp_ir2_planovac SET datum_termin=DATE_ADD(GREATEST(datum_termin,CURDATE()),INTERVAL {$days} DAY),stav='Aktivní' WHERE user_id=? AND id=?")->execute([$uid,$taskId]);}
    else{$reason=trim((string)($_POST['skip_reason']??''));$note=$reason!==''?'Vynecháno: '.$reason:'Vynecháno';foreach($ids as $taskId)$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Vynecháno',poznamka=CASE WHEN COALESCE(poznamka,'')='' THEN ? ELSE CONCAT(poznamka,' · ',?) END WHERE user_id=? AND id=? AND stav='Aktivní'")->execute([$note,$note,$uid,$taskId]);}
   }
  }
  elseif($action==='delete'&&$id){$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Zrušeno' WHERE user_id=? AND id=?")->execute([$uid,$id]);ir_audit($pdo,'task',$id,'cancel');}
  elseif($action==='save'){$animal=ir_int($_POST['zvire_id']??0)?:null;$name=trim((string)($_POST['nazev_ukolu']??''));$date=(string)($_POST['datum_termin']??date('Y-m-d'));$time=trim((string)($_POST['cas_termin']??''))?:null;$cat=trim((string)($_POST['kategorie']??'Péče'));$note=trim((string)($_POST['poznamka']??''));$priority=in_array((string)($_POST['priorita']??''),['Nízká','Normální','Vysoká','Kritická'],true)?(string)$_POST['priorita']:'Normální';if($name==='')throw new RuntimeException('Chybí název úkolu.');if($animal&&!ir_animal($pdo,$uid,(int)$animal))throw new RuntimeException('Zvíře nebylo nalezeno.');if(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date)||date('Y-m-d',strtotime($date))!==$date)throw new RuntimeException('Neplatné datum.');$pdo->prepare("INSERT INTO wp_ir2_planovac(user_id,zvire_id,nazev_ukolu,kategorie,datum_termin,cas_termin,priorita,stav,opakovani,poznamka) VALUES(?,?,?,?,?,?,?,'Aktivní','none',?)")->execute([$uid,$animal,$name,$cat,$date,$time,$priority,$note]);}
  $returnTo=(string)($_POST['return_to']??'');if(!preg_match('~^(?:index|tasks)\.php(?:[?#][a-zA-Z0-9=&_.#-]*)?$~',$returnTo))$returnTo='tasks.php'.(!empty($_GET['view'])?'?view='.urlencode((string)$_GET['view']):'');ir_redirect($returnTo);
 }catch(Throwable $e){error_log('Planner: '.$e->getMessage());$error='Úkol se nepodařilo uložit. Zkontroluj údaje a zkus to znovu.';}
}
$view=preg_replace('/[^a-z\-]/','',(string)($_GET['view']??'active'));$where="p.user_id=?";$params=[$uid];
$focusTaskId=(int)($_GET['task']??0);$focusTask=null;
if($focusTaskId>0){
 try{$fq=$pdo->prepare('SELECT * FROM wp_ir2_planovac WHERE user_id=? AND id=? LIMIT 1');$fq->execute([$uid,$focusTaskId]);$focusTask=$fq->fetch()?:null;}catch(Throwable){}
 if($focusTask){$where.=' AND p.datum_termin=? AND p.kategorie=?';$params[]=(string)$focusTask['datum_termin'];$params[]=(string)$focusTask['kategorie'];}
 else{$where.=' AND p.id=?';$params[]=$focusTaskId;}
}
elseif($view==='today')$where.=" AND p.stav='Aktivní' AND p.datum_termin=CURDATE()";
elseif($view==='upcoming')$where.=" AND p.stav='Aktivní' AND p.datum_termin>CURDATE()";
elseif($view==='overdue')$where.=" AND p.stav='Aktivní' AND p.datum_termin<CURDATE()";
elseif($view==='done')$where.=" AND p.stav<>'Aktivní'";
else $where.=" AND p.stav='Aktivní'";
$tasks=[];$animals=[];try{$st=$pdo->prepare("SELECT p.*,z.jmeno_kod,z.latinsky_nazev FROM wp_ir2_planovac p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE {$where} ORDER BY p.datum_termin,COALESCE(p.cas_termin,'23:59:59'),p.id");$st->execute($params);$tasks=$st->fetchAll()?:[];$st=$pdo->prepare('SELECT id,jmeno_kod,latinsky_nazev FROM wp_ir2_zvirata WHERE user_id=? ORDER BY jmeno_kod');$st->execute([$uid]);$animals=$st->fetchAll()?:[];}catch(Throwable){}
if($focusTaskId>0&&$focusTask){$focusKey=ir_planner_group_key($focusTask);$tasks=array_values(array_filter($tasks,static fn($t)=>ir_planner_group_key($t)===$focusKey));}
$groups=ir_planner_group_tasks($tasks);
require_once __DIR__.'/includes/planner-agenda.php';
ir_page_start('Úkoly','tasks');
try{
    require_once __DIR__.'/includes/planner-rail.php';
    ir_render_planner_rail($pdo,$uid,(string)($_GET['pv']??'day'),(string)($_GET['d']??date('Y-m-d')));
}catch(Throwable $e){
    error_log('Planner agenda render 064: '.$e->getMessage());
    echo '<section class="panel glow-panel planner-recovery-064"><header class="panel-head"><div><span class="panel-kicker">PLÁNOVAČ</span><h2>Plánovač se nepodařilo načíst</h2></div></header><div class="empty-state">Seznam úkolů níže zůstává dostupný. Chyba byla zapsána do serverového logu.</div></section>';
}
if(!empty($error))echo '<div class="flash danger">'.ir_e($error).'</div>';
?>
<div class="module-toolbar"><div class="module-tabs"><a class="<?=$view==='active'?'is-active':''?>" href="tasks.php">Aktivní</a><a class="<?=$view==='today'?'is-active':''?>" href="tasks.php?view=today">Dnes</a><a class="<?=$view==='upcoming'?'is-active':''?>" href="tasks.php?view=upcoming">Nadcházející</a><a class="<?=$view==='overdue'?'is-active':''?>" href="tasks.php?view=overdue">Po termínu</a><a class="<?=$view==='done'?'is-active':''?>" href="tasks.php?view=done">Hotovo</a></div><a class="btn primary" href="#new-task">+ Nový úkol</a></div>
<details class="panel planner-task-list" <?=isset($_GET['view'])||isset($_GET['task'])?'open':''?>><summary>Seznam úkolů a hromadné akce</summary>
<?php
$timelineBands=['past'=>[],'today'=>[],'future'=>[]];$today=date('Y-m-d');
foreach($groups as $key=>$g){$d=(string)$g['first']['datum_termin'];$timelineBands[$d<$today?'past':($d===$today?'today':'future')][$key]=$g;}
$bandMeta=[
 'past'=>['label'=>$view==='done'?'HISTORIE':'ZPOŽDĚNÉ','title'=>$view==='done'?'Dokončené':'Po termínu','class'=>'planner-period--past'],
 'today'=>['label'=>date('d.m.Y'),'title'=>'DNES','class'=>'planner-period--today'],
 'future'=>['label'=>'DALŠÍ','title'=>'Nadcházející','class'=>'planner-period--future'],
];
?>
<div class="planner-timeline">
<?php foreach($bandMeta as $bandKey=>$meta):$band=$timelineBands[$bandKey];?>
<section class="planner-period <?=$meta['class']?>"><i class="planner-axis"></i><header class="planner-period__head"><div><small><?=$meta['label']?></small><strong><?=$meta['title']?></strong></div><span class="planner-period__count"><?=count($band)?></span></header><div class="planner-period__body">
<?php foreach($band as $g):$t=$g['first'];$items=$g['items'];$label=count($items)===1?(string)$t['nazev_ukolu']:$g['label'];$late=$t['stav']==='Aktivní'&&$t['datum_termin']<$today;$gid='tg'.md5($g['key']);?>
<button type="button" class="planner-row planner-group-row <?=$late?'is-late':''?>" data-task-group="<?=$gid?>"><div class="planner-date"><strong><?=date('d.m.',strtotime((string)$t['datum_termin']))?></strong><small><?=count($items)===1?ir_time_label((string)$t['cas_termin']):'—'?></small></div><span class="planner-icon"><?=ir_visual_icon(ir_activity_icon_key('task',$label))?></span><div class="planner-main"><strong><?=ir_e($label)?></strong><small><?=ir_e((string)$t['kategorie'])?></small></div><strong class="planner-group-count">( <?=count($items)?> )</strong></button>
<dialog class="planner-group-dialog" id="<?=$gid?>"><header><div><small><?=date('d.m.Y',strtotime((string)$t['datum_termin']))?></small><h3><?=ir_e($label)?> <span>( <?=count($items)?> )</span></h3></div><button type="button" data-close>×</button></header>
<?php if($t['stav']==='Aktivní' && count($items)>1):?><form method="post" class="planner-group-bulk"><?=ir_csrf_field()?><?php foreach($items as $gi):?><input type="hidden" name="ids[]" value="<?=(int)$gi['id']?>"><?php endforeach;?><button class="btn small success" name="action" value="complete_group">✓ Vše hotovo</button><select name="skip_reason" aria-label="Důvod vynechání"><option value="">Vynechat bez důvodu</option><option>Odmítnuto</option><option>Není potřeba</option><option>Zdravotní důvod</option><option>Jiné</option></select><button class="btn small" name="action" value="skip_group">⊘ Vše vynechat</button><select name="days" aria-label="Odložit vše"><option value="1">+1 den</option><option value="2">+2 dny</option><option value="3">+3 dny</option></select><button class="btn small" name="action" value="postpone_group">Odložit vše</button></form><?php endif?>
<div class="planner-group-list"><?php foreach($items as $it):?><article id="task-<?=$it['id']?>"><div><strong><?=ir_e((string)($it['jmeno_kod']?:$it['latinsky_nazev']?:'Obecný úkol'))?></strong><small><?=ir_e((string)($it['poznamka']?:$it['kategorie']))?><?=!empty($it['cas_termin'])?' · '.ir_time_label((string)$it['cas_termin']):''?></small></div><form method="post"><?=ir_csrf_field()?><input type="hidden" name="id" value="<?=$it['id']?>"><?php if($it['stav']==='Aktivní'):?><button class="btn small success" name="action" value="complete">✓ Hotovo</button><select name="skip_reason" aria-label="Důvod vynechání"><option value="">Důvod…</option><option>Odmítnuto</option><option>Není potřeba</option><option>Zdravotní důvod</option><option>Jiné</option></select><button class="btn small" name="action" value="skip">⊘ Vynechat</button><select name="days" aria-label="Odložit"><option value="1">+1 den</option><option value="2">+2 dny</option><option value="3">+3 dny</option></select><button class="btn small" name="action" value="postpone">Odložit</button><?php else:?><span class="status-pill <?=($it['stav']==='Vynecháno'?'amber':'') ?>"><?=ir_e((string)$it['stav'])?></span><button class="btn small" name="action" value="reopen">Obnovit</button><?php endif?></form></article><?php endforeach?></div></dialog>
<?php endforeach;if(!$band):?><div class="planner-period__empty">V této části nejsou žádné položky.</div><?php endif?></div></section>
<?php endforeach?>
</div></details>
<form id="new-task" class="panel glow-panel form-panel planner-create" method="post"><?=ir_csrf_field()?><input type="hidden" name="action" value="save"><header class="panel-head"><div><span class="panel-kicker">NOVÝ ZÁZNAM DO PLÁNU</span><h2>Úkol, checklist nebo upozornění</h2></div><button class="btn primary">Uložit</button></header><div class="planner-template-strip"><button type="button" data-task-template="Úkol">✓ Úkol</button><button type="button" data-task-template="Checklist">☑ Checklist</button><button type="button" data-task-template="Poznámka">✎ Poznámka</button><button type="button" data-task-template="Upozornění">! Upozornění</button></div><div class="form-grid cols-3"><label>Název<input name="nazev_ukolu" required placeholder="Co je potřeba udělat?"></label><label>Kategorie<select name="kategorie"><option>Péče</option><option>Krmení</option><option>Zdraví</option><option>Reprodukce</option><option>Údržba</option><option>Kontrola</option><option>Checklist</option><option>Poznámka</option><option>Upozornění</option></select></label><label>Priorita<select name="priorita"><option>Nízká</option><option selected>Normální</option><option>Vysoká</option><option>Kritická</option></select></label><label>Zvíře<select name="zvire_id"><option value="">Obecný úkol</option><?php foreach($animals as $a):?><option value="<?=$a['id']?>"><?=ir_e((string)$a['jmeno_kod'])?> · <?=ir_e((string)$a['latinsky_nazev'])?></option><?php endforeach?></select></label><label>Datum<input type="date" name="datum_termin" value="<?=date('Y-m-d')?>" required></label><label>Čas<input type="time" name="cas_termin"></label><label class="span-3">Poznámka / checklist<textarea name="poznamka" placeholder="Detaily, jednotlivé kroky nebo text připomínky…"></textarea></label></div></form>
<script>document.querySelectorAll('[data-task-group]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.taskGroup)?.showModal()));document.querySelectorAll('.planner-group-dialog [data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));document.querySelectorAll('[data-task-template]').forEach(b=>b.addEventListener('click',()=>{const f=document.getElementById('new-task');if(!f)return;f.elements.kategorie.value=b.dataset.taskTemplate==='Úkol'?'Péče':b.dataset.taskTemplate;if(b.dataset.taskTemplate==='Upozornění')f.elements.priorita.value='Vysoká';f.elements.nazev_ukolu.focus();}));</script>
<?php if((int)($_GET['task']??0)>0):?><script>document.querySelector('.planner-group-dialog')?.showModal();</script><?php endif; ir_page_end();
