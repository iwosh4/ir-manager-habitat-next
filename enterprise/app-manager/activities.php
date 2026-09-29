<?php
declare(strict_types=1);
/* ACTIVITY HISTORY — grouped by human date (DNES / VČERA / 27. 9. 2026), batches summarised
   ("Krmení ×4 · 3 snědlo · 1 odmítlo"), every row directly editable in place (result, time, feed, amount,
   value, note) and deletable to the recycle bin with undo. Records stay tied to their animal. */
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';require __DIR__.'/includes/reptile_core.php';
ir_require_perm('read');
$uid=ir_current_user_id();
$f=['animal_id'=>ir_int($_GET['animal_id']??0),'type'=>trim((string)($_GET['type']??'')),'from'=>trim((string)($_GET['from']??'')),'to'=>trim((string)($_GET['to']??'')),'species'=>trim((string)($_GET['species']??'')),'enclosure_id'=>ir_int($_GET['enclosure_id']??0)];
$range=trim((string)($_GET['range']??($f['from']===''&&$f['to']===''&&!$f['animal_id']?'month':'')));
if($range==='today'){$f['from']=$f['to']=date('Y-m-d');}elseif($range==='week'){$f['from']=date('Y-m-d',strtotime('-6 days'));$f['to']=date('Y-m-d');}elseif($range==='month'){$f['from']=date('Y-m-d',strtotime('-29 days'));$f['to']=date('Y-m-d');}elseif($range==='year'){$f['from']=date('Y-m-d',strtotime('-364 days'));$f['to']=date('Y-m-d');}
$days=ir_history_groups($pdo,$uid,array_filter($f),3000);
$source=trim((string)($_GET['source']??''));
if($source!==''){foreach($days as $d=>&$day){foreach($day['groups'] as $gi=>&$g){$g['rows']=array_values(array_filter($g['rows'],fn($r)=>(string)($r['zdroj']??'')===$source));if(!$g['rows'])unset($day['groups'][$gi]);}unset($g);$day['groups']=array_values($day['groups']);if(!$day['groups'])unset($days[$d]);}unset($day);}
$aq=$pdo->prepare('SELECT id,jmeno_kod,latinsky_nazev FROM wp_ir2_zvirata WHERE user_id=? ORDER BY jmeno_kod');$aq->execute([$uid]);$animals=$aq->fetchAll()?:[];
$eq=$pdo->prepare('SELECT id,nazev FROM wp_ir2_ubikace WHERE user_id=? AND archivovano IS NULL ORDER BY nazev');$eq->execute([$uid]);$encs=$eq->fetchAll()?:[];
$types=array_keys(ir_activity_catalog_for_user($pdo,$uid));
$srcLabels=['manual'=>'Ručně','quick'=>'Rychlý záznam','qr'=>'QR','nfc'=>'NFC','voice'=>'Hlas','planner'=>'Plánovač','profile'=>'Karta zvířete','bulk'=>'Hromadně','enclosure'=>'Ubikace','import'=>'Import','habitat'=>'Habitat'];
$resLabels=array_map(fn($x)=>$x['label'],IR_FEED_RESULTS);
$canEdit=ir_can('write');$canDel=ir_can('delete');
$qs=fn(array $o)=>'?'.http_build_query(array_filter(array_merge(['animal_id'=>$f['animal_id']?:null,'type'=>$f['type']?:null,'species'=>$f['species']?:null,'enclosure_id'=>$f['enclosure_id']?:null,'source'=>$source?:null],$o),fn($v)=>$v!==null&&$v!==''));
$total=0;foreach($days as $d)foreach($d['groups'] as $g)$total+=count($g['rows']);
ir_page_start('Historie aktivit','care');echo ir_back($f['animal_id']?'animal.php?id='.$f['animal_id']:'index.php','Zpět');
?>
<section class="panel glow-panel b1-history" data-history>
<header class="panel-head"><div><span class="panel-kicker">HISTORIE · <?=$total?> záznamů</span><h2>Co se v chovu stalo</h2><p class="muted">Seskupeno podle dne. Každý řádek lze upravit přímo v tabulce; smazaný záznam jde do koše a lze jej obnovit.</p></div><a class="btn primary" href="quick.php">+ Rychlý záznam</a></header>
<div class="history-range-tabs"><?php foreach(['today'=>'Dnes','week'=>'7 dní','month'=>'30 dní','year'=>'Rok','all'=>'Vše'] as $k=>$l):?><a class="<?=($range===$k||($k==='all'&&$range===''&&$f['from']===''))?'active':''?>" href="<?=ir_e($qs(['range'=>$k==='all'?'all':$k]))?>"><?=$l?></a><?php endforeach;?></div>
<form class="b1-inline b1-filter" method="get">
 <select class="input" name="animal_id"><option value="">Všechna zvířata</option><?php foreach($animals as $a):?><option value="<?=(int)$a['id']?>" <?=(int)$a['id']===$f['animal_id']?'selected':''?>><?=ir_e((string)$a['jmeno_kod'])?></option><?php endforeach;?></select>
 <select class="input" name="type"><option value="">Všechny aktivity</option><option value="feeding" <?=$f['type']==='feeding'?'selected':''?>>Krmení (všechny výsledky)</option><?php foreach($types as $t):?><option <?=$t===$f['type']?'selected':''?>><?=ir_e($t)?></option><?php endforeach;?></select>
 <input class="input" name="species" value="<?=ir_e($f['species'])?>" placeholder="Druh (latinsky / česky)">
 <select class="input" name="enclosure_id"><option value="">Všechny ubikace</option><?php foreach($encs as $e):?><option value="<?=(int)$e['id']?>" <?=(int)$e['id']===$f['enclosure_id']?'selected':''?>><?=ir_e((string)$e['nazev'])?></option><?php endforeach;?></select>
 <select class="input" name="source"><option value="">Všechny zdroje</option><?php foreach($srcLabels as $k=>$l):?><option value="<?=$k?>" <?=$source===$k?'selected':''?>><?=$l?></option><?php endforeach;?></select>
 <input class="input" type="date" name="from" value="<?=ir_e($f['from'])?>" aria-label="Od"><input class="input" type="date" name="to" value="<?=ir_e($f['to'])?>" aria-label="Do"><input type="hidden" name="range" value="custom"><button class="btn">Filtrovat</button>
</form>
<?php foreach($days as $day=>$d):$dayCount=0;foreach($d['groups'] as $g)$dayCount+=count($g['rows']);?>
<section class="b1-hday"><header><h3><?=ir_e($d['label'])?></h3><span><?=$dayCount?> <?=$dayCount===1?'záznam':($dayCount<5?'záznamy':'záznamů')?></span></header>
<?php foreach($d['groups'] as $g):$n=count($g['rows']);$sum=[];foreach($g['summary'] as $k=>$c)if($k!=='_')$sum[]=$c.' '.mb_strtolower($resLabels[$k]??$k,'UTF-8');$feeding=$g['type']==='Krmení';?>
<details class="b1-hgroup" <?=$n<=3?'open':''?>>
 <summary><?=ir_visual_icon(ir_activity_icon_for_user($pdo,$uid,$g['type']))?><b><?=ir_e($g['type'])?><?=$n>1?' ×'.$n:''?></b><?php if($sum):?><span class="b1-hsum"><?=ir_e(implode(' · ',$sum))?></span><?php endif;?><?php if($g['batch']):?><em class="b1-tag">dávka</em><?php endif;?><small><?=ir_e(date('H:i',strtotime((string)$g['rows'][count($g['rows'])-1]['datum'])).($n>1?'–'.date('H:i',strtotime((string)$g['rows'][0]['datum'])):''))?></small></summary>
 <div class="table-wrap"><table class="b1-table b1-htable"><thead><tr><th>Čas</th><th>Zvíře</th><th><?=$feeding?'Výsledek':'Záznam'?></th><?php if($feeding):?><th>Krmivo</th><th>Ks</th><th>Suplement</th><?php else:?><th>Hodnota</th><?php endif;?><th>Poznámka</th><th>Zdroj</th><th></th></tr></thead><tbody>
 <?php foreach($g['rows'] as $r):$res=ir_event_result($r);?>
  <tr data-id="<?=(int)$r['id']?>" data-feeding="<?=$feeding?1:0?>">
   <td><input class="b1-cell" type="datetime-local" name="performed_at" value="<?=ir_e(date('Y-m-d\TH:i',strtotime((string)$r['datum'])))?>" max="<?=date('Y-m-d\TH:i')?>" <?=$canEdit?'':'disabled'?> aria-label="Čas"></td>
   <td><a href="animal.php?id=<?=(int)$r['zvire_id']?>"><b><?=ir_e((string)$r['jmeno_kod'])?></b></a><?php if(trim((string)$r['latinsky_nazev'])!==''&&$r['latinsky_nazev']!==$r['jmeno_kod']):?><br><small><i><?=ir_e((string)$r['latinsky_nazev'])?></i></small><?php endif;?></td>
   <?php if($feeding):?>
   <td><select class="b1-cell b1-res-sel is-<?=ir_e((string)$res)?>" name="result" <?=$canEdit?'':'disabled'?> aria-label="Výsledek"><?php foreach($resLabels as $k=>$l):?><option value="<?=$k?>" <?=$res===$k?'selected':''?>><?=ir_e($l)?></option><?php endforeach;?></select></td>
   <td><input class="b1-cell" name="feed" value="<?=ir_e((string)($r['krmivo']??ir_activity_base_feed($r)))?>" <?=$canEdit?'':'disabled'?> aria-label="Krmivo"></td>
   <td><input class="b1-cell b1-num" name="qty" inputmode="decimal" value="<?=ir_e($r['mnozstvi']!==null?rtrim(rtrim((string)$r['mnozstvi'],'0'),'.'):'')?>" <?=$canEdit?'':'disabled'?> aria-label="Počet"></td>
   <td><small><?=ir_e((string)($r['suplement']??''))?></small></td>
   <?php else:?>
   <td><?=ir_e((string)$r['typ'])?></td>
   <td><input class="b1-cell" name="value" value="<?=ir_e((string)($r['hodnota']??''))?>" <?=$canEdit?'':'disabled'?> aria-label="Hodnota"></td>
   <?php endif;?>
   <td><input class="b1-cell" name="note" value="<?=ir_e((string)($r['detail']??''))?>" <?=$canEdit?'':'disabled'?> aria-label="Poznámka"></td>
   <td><small class="muted"><?=ir_e($srcLabels[(string)($r['zdroj']??'')]??'—')?></small></td>
   <td class="b1-rowact"><?php if($canEdit):?><button type="button" class="b1-icon-btn" data-save hidden title="Uložit změnu" aria-label="Uložit změnu">✓</button><?php endif;?><?php if($canDel):?><button type="button" class="b1-icon-btn danger" data-del title="Smazat do koše" aria-label="Smazat do koše">🗑</button><?php endif;?></td>
  </tr>
 <?php endforeach;?>
 </tbody></table></div>
</details>
<?php endforeach;?></section>
<?php endforeach;if(!$days):?><div class="empty-state">V tomto období nejsou žádné záznamy.</div><?php endif;?>
</section>
<script>
addEventListener('DOMContentLoaded',()=>{const root=document.querySelector('[data-history]');if(!root||!window.IR)return;const{api,toast}=window.IR;
root.addEventListener('input',e=>{const tr=e.target.closest('tr[data-id]');if(tr){tr.classList.add('is-dirty');tr.querySelector('[data-save]')?.removeAttribute('hidden');}});
root.addEventListener('change',e=>{if(e.target.matches('.b1-res-sel')){e.target.className=e.target.className.replace(/is-\w+/,'is-'+e.target.value);const tr=e.target.closest('tr');tr.classList.add('is-dirty');tr.querySelector('[data-save]')?.removeAttribute('hidden');}});
root.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('.b1-cell')){e.preventDefault();e.target.closest('tr').querySelector('[data-save]')?.click();}});
root.addEventListener('click',async e=>{
 const tr=e.target.closest('tr[data-id]');if(!tr)return;
 if(e.target.closest('[data-save]')){const patch={};tr.querySelectorAll('.b1-cell').forEach(i=>{if(!i.disabled)patch[i.name]=i.value.replace('T',' ');});
  try{await api('events.update',{id:+tr.dataset.id,patch},{post:true});tr.classList.remove('is-dirty');tr.classList.add('is-saved');tr.querySelector('[data-save]').hidden=true;toast('Záznam upraven. Sklad a suplementace přepočítány.');setTimeout(()=>tr.classList.remove('is-saved'),1600);}catch(err){toast(err.message,'bad',7000);}}
 if(e.target.closest('[data-del]')){if(!confirm('Přesunout záznam do koše? Lze jej obnovit.'))return;
  try{const r=await api('events.delete',{id:+tr.dataset.id},{post:true});tr.hidden=true;
   const t=document.createElement('div');t.className='b1-undo';t.innerHTML='Záznam je v koši. <button type="button" class="btn small">Vrátit</button>';document.body.append(t);
   const done=setTimeout(()=>t.remove(),9000);t.querySelector('button').onclick=async()=>{clearTimeout(done);t.remove();try{await api('events.restore',{bin_id:r.bin_id},{post:true});location.reload();}catch(err){toast(err.message,'bad');}};
  }catch(err){toast(err.message,'bad',7000);}}
});});
</script>
<?php ir_page_end();
