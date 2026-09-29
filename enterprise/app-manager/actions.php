<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';require __DIR__.'/includes/reptile_core.php';
$uid=ir_current_user_id();
$allByKey=ir_custom_actions_by_key($pdo,$uid);$editKey=trim((string)($_GET['edit']??''));$editing=$editKey!==''&&isset($allByKey[$editKey])?$allByKey[$editKey]:null;
if($_SERVER['REQUEST_METHOD']==='POST'){
 ir_verify_csrf();$action=(string)($_POST['action']??'save');$key=preg_replace('/[^a-z0-9_\-]/','',(string)($_POST['key']??''));
 try{
  if($action==='delete'){
   if($key==='')throw new RuntimeException('Chybí aktivita ke smazání.');
   $pdo->beginTransaction();
   $pdo->prepare("DELETE FROM wp_ir2_user_settings WHERE user_id=? AND setting_key=? AND setting_key LIKE 'custom_action_%'")->execute([$uid,$key]);
   $pdo->prepare("DELETE FROM wp_ir2_user_settings WHERE user_id=? AND setting_key LIKE 'animal_feed_type_%' AND setting_value=?")->execute([$uid,$key]);
   $pdo->commit();ir_flash('success','Aktivita byla smazána.');ir_redirect('actions.php');
  }
  $label=trim((string)($_POST['label']??''));$category=trim((string)($_POST['category']??''))?:'Vlastní';$icon=trim((string)($_POST['icon']??''))?:'tasks';$feeding=!empty($_POST['feeding']);
  if($label==='')throw new RuntimeException('Chybí název aktivity.');
  if(strlen($label)>90)throw new RuntimeException('Název aktivity je příliš dlouhý.');
  foreach(ir_activity_catalog() as $builtin=>$meta){if(strtolower($builtin)===strtolower($label))throw new RuntimeException('Stejný název už používá systémová aktivita.');}
  foreach(ir_custom_actions_by_key($pdo,$uid) as $existingKey=>$meta){if($existingKey!==$key&&strtolower((string)$meta['label'])===strtolower($label))throw new RuntimeException('Aktivita s tímto názvem už existuje.');}
  if($key===''||!str_starts_with($key,'custom_action_'))$key='custom_action_'.substr(hash('sha1',$label.'|'.microtime(true)),0,12);
  $payload=json_encode(['label'=>$label,'category'=>substr($category,0,50),'icon'=>$icon,'feeding'=>$feeding?1:0],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
  if(!is_string($payload)||strlen($payload)>255)throw new RuntimeException('Nastavení aktivity je příliš dlouhé.');
  ir_user_setting_set($pdo,$uid,$key,$payload);ir_flash('success',$editing?'Aktivita byla upravena.':'Aktivita byla vytvořena.');ir_redirect('actions.php');
 }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();error_log('IR action: '.$e->getMessage());$error=$e instanceof PDOException?'Změnu se nepodařilo uložit. Zkus to znovu.':$e->getMessage();}
}
$custom=ir_custom_actions_by_key($pdo,$uid);$editing=$editKey!==''&&isset($custom[$editKey])?$custom[$editKey]:null;
$icons=['feeding','water','cleaning','shedding','feces','weight','health','medicine','reproduction','care','calendar-doc','tasks'];
ir_page_start('Aktivity','care');echo ir_back('settings.php','Zpět do nastavení');if(!empty($error))echo '<div class="flash danger">'.ir_e($error).'</div>';
?>
<div class="two-column-layout activity-settings-layout">
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">AKTIVITY</span><h2>Vlastní aktivity</h2></div><span class="muted-note"><?=count($custom)?> vlastních</span></header>
<div class="simple-list activity-definition-list"><?php foreach($custom as $key=>$meta):?><div class="custom-action-row"><span class="activity-definition-icon"><?=ir_visual_icon((string)$meta['icon'])?></span><div><strong><?=ir_e((string)$meta['label'])?></strong><span><?=ir_e((string)$meta['category'])?><?php if(!empty($meta['feeding'])):?> · <b>Typ krmení</b><?php endif;?></span></div><div class="row-actions"><a href="actions.php?edit=<?=urlencode((string)$key)?>">Upravit</a><form method="post" onsubmit="return confirm('Smazat tuto aktivitu? Zvířatům bude případné přiřazení typu krmení odebráno.')"><?=ir_csrf_field()?><input type="hidden" name="key" value="<?=ir_e((string)$key)?>"><button class="danger" name="action" value="delete">Smazat</button></form></div></div><?php endforeach;if(!$custom):?><div class="empty-state small">Zatím bez vlastních aktivit. Vpravo vytvoř první.</div><?php endif;?></div></section>
<form class="panel glow-panel form-panel" method="post"><?=ir_csrf_field()?><input type="hidden" name="action" value="save"><input type="hidden" name="key" value="<?=ir_e((string)($editing['setting_key']??''))?>"><header class="panel-head"><div><span class="panel-kicker"><?=$editing?'ÚPRAVA':'NOVÁ AKTIVITA'?></span><h2><?=$editing?'Upravit aktivitu':'Vytvořit aktivitu'?></h2></div><button class="btn primary">Uložit</button></header><div class="form-grid">
<label>Název<input name="label" required value="<?=ir_e((string)($editing['label']??''))?>" placeholder="Např. Drosophila hydei + Calcium"></label>
<label>Kategorie<input name="category" value="<?=ir_e((string)($editing['category']??''))?>" placeholder="Krmení / Čištění / Reprodukce / Vlastní"></label>
<label>Ikona<select name="icon"><?php foreach($icons as $i):?><option value="<?=$i?>" <?=($editing['icon']??'')===$i?'selected':''?>><?=$i?></option><?php endforeach;?></select></label>
<label class="check-line"><input type="checkbox" name="feeding" value="1" <?=!empty($editing['feeding'])?'checked':''?>><span>Použít jako <strong>Typ krmení</strong> na kartě zvířete</span></label>
</div><div class="form-help">Aktivita se okamžitě objeví v Rychlém záznamu. Pokud ji označíš jako Typ krmení, můžeš ji přiřadit konkrétním zvířatům a při hromadném krmení se každému automaticky uloží jeho vlastní typ.</div><?php if($editing):?><div class="form-actions"><a class="btn secondary" href="actions.php">Zrušit úpravu</a></div><?php endif;?></form>
</div>
<?php ir_page_end();
