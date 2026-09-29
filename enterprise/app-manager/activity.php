<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';require __DIR__.'/includes/reptile_core.php';
$uid=ir_current_user_id();$id=ir_int($_GET['id']??$_POST['id']??0);$animalId=ir_int($_GET['animal_id']??$_POST['animal_id']??0);$record=null;
if($id){$st=$pdo->prepare('SELECT * FROM wp_ir2_pece WHERE user_id=? AND id=? LIMIT 1');$st->execute([$uid,$id]);$record=$st->fetch()?:null;if($record)$animalId=(int)$record['zvire_id'];}
$animal=$animalId?ir_animal($pdo,$uid,$animalId):null;if(!$animal){http_response_code(404);exit('Vyber zvíře.');}
$type=(string)($_GET['type']??$record['typ']??'Krmení');$catalog=ir_activity_catalog_for_user($pdo,$uid);
if($_SERVER['REQUEST_METHOD']==='POST'){
 ir_verify_csrf();$action=(string)($_POST['action']??'save');
 try{
  if($action==='delete'&&$id){ir_delete_activity($pdo,$uid,$id);ir_flash('success','Záznam byl smazán.');ir_redirect('animal.php?id='.$animalId);}
  $type=trim((string)($_POST['type']??''));if($type==='Vlastní')$type=trim((string)($_POST['custom_type']??''));$date=(string)($_POST['date']??'');$value=trim((string)($_POST['value']??''));$detail=trim((string)($_POST['detail']??''));
  if($id){ir_update_activity($pdo,$uid,$id,$type,$date,$value,$detail);ir_flash('success','Záznam byl upraven.');}else{ir_log_activity($pdo,$uid,$animalId,$type,$date,$value,$detail);ir_flash('success','Aktivita byla zapsána do historie.');}
  ir_redirect('animal.php?id='.$animalId);
 }catch(Throwable $e){error_log('IR action: '.$e->getMessage());$error=$e instanceof PDOException?'Změnu se nepodařilo uložit. Zkus to znovu.':$e->getMessage();}
}
$meta=ir_activity_meta_for_user($pdo,$uid,$type);$defaultValue=$record&&($record['typ']??'')==='Krmení'?ir_activity_base_feed($record):(string)($record['hodnota']??'');if(!$record&&in_array($type,['Krmení','Odmítnutí potravy'],true))$defaultValue=ir_animal_default_feed_value($pdo,$uid,$animal);$suppPreview=!$record&&$type==='Krmení'?ir_supplement_recommendation($pdo,$uid,$animal,substr(ir_datetime_input(),0,10)):[];$suppName=(string)($suppPreview['winner']['name']??'');ir_page_start($id?'Upravit aktivitu':'Nová aktivita','care');echo ir_back('animal.php?id='.$animalId,'Zpět na kartu');if(!empty($error))echo '<div class="flash danger">'.ir_e($error).'</div>';
?>
<form class="panel glow-panel form-panel narrow-form" method="post"><?=ir_csrf_field()?><input type="hidden" name="id" value="<?=$id?>"><input type="hidden" name="animal_id" value="<?=$animalId?>"><header class="panel-head"><div><span class="panel-kicker">AKTIVITA</span><h2><?=ir_e(ir_animal_display($animal))?></h2></div><button class="btn primary">Uložit záznam</button></header>
<div class="form-grid cols-2"><label>Typ<select name="type" data-activity-type><?php foreach(array_keys($catalog) as $t):?><option <?=($t===$type)?'selected':''?>><?=ir_e($t)?></option><?php endforeach;?><option value="Vlastní" <?=isset($catalog[$type])?'':'selected'?>>Vlastní</option></select></label><label>Vlastní název<input name="custom_type" value="<?=isset($catalog[$type])?'':ir_e($type)?>" placeholder="Např. Kontrola očí"></label><label>Datum a čas<input type="datetime-local" name="date" required value="<?=ir_e(ir_datetime_input((string)($record['datum']??'')))?>"></label><label>Hodnota / údaj<input name="value" value="<?=ir_e($defaultValue)?>" placeholder="<?=ir_e((string)($meta['value']??'Hodnota'))?>"></label><label class="span-2">Detail<textarea name="detail" placeholder="<?=ir_e((string)($meta['detail']??'Poznámka'))?>"><?=ir_e((string)($record['detail']??''))?></textarea></label></div><?php if(!$record&&$type==='Krmení'):?><div class="form-help feeding-preview"><strong>Automatický zápis:</strong> <?=ir_e(ir_compose_feed_value($defaultValue,$suppName)?:'Typ krmení není nastaven')?><?php if($suppName!==''):?> · další krok rotace: <?=ir_e($suppName)?><?php endif;?></div><?php endif;?>
<?php if($id):?><div class="form-danger"><button class="btn danger" name="action" value="delete" onclick="return confirm('Smazat tento záznam?')">Smazat záznam</button></div><?php endif;?></form>
<?php ir_page_end();
