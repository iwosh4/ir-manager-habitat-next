<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';
require __DIR__.'/includes/live.php';
require __DIR__.'/includes/shell.php';
require __DIR__.'/includes/reptile_core.php';

$uid=ir_current_user_id();

function ir_document_remove_owned_file(string $path,int $uid): void {
    $path=trim(str_replace('\\','/',$path),'/');if($path===''||str_contains($path,'..')||!str_starts_with($path,'uploads/documents/'))return;
    $base=realpath(__DIR__.'/uploads/documents');$full=realpath(__DIR__.'/'.$path);if(!$base||!$full||!str_starts_with($full,$base.DIRECTORY_SEPARATOR)||!is_file($full))return;
    // New files are user-scoped. Legacy unscoped paths are still removable only
    // when the caller already proved ownership through the document DB row.
    @unlink($full);
}
$ok=ir_table_exists($pdo,'wp_ir2_documents');
$animals=[];$contacts=[];
try{$q=$pdo->prepare('SELECT id,jmeno_kod,latinsky_nazev FROM wp_ir2_zvirata WHERE user_id=? ORDER BY jmeno_kod');$q->execute([$uid]);$animals=$q->fetchAll()?:[];}catch(Throwable){}
if(ir_table_exists($pdo,'wp_ir2_contacts')){try{$q=$pdo->prepare('SELECT id,name FROM wp_ir2_contacts WHERE user_id=? ORDER BY name');$q->execute([$uid]);$contacts=$q->fetchAll()?:[];}catch(Throwable){}}
$templates=[
 'purchase'=>'Kupní smlouva',
 'sale'=>'Prodejní smlouva',
 'handover'=>'Předávací protokol',
 'origin'=>'Potvrzení o původu',
 'transport'=>'Převozní dokument',
 'receipt'=>'Potvrzení o převzetí',
 'custom'=>'Vlastní dokument',
];
if($ok&&$_SERVER['REQUEST_METHOD']==='POST'){
 ir_verify_csrf();$action=(string)($_POST['action']??'save');$id=(int)($_POST['id']??0);
 try{
  if($action==='delete'&&$id){
   $q=$pdo->prepare('SELECT file_path FROM wp_ir2_documents WHERE id=? AND user_id=?');$q->execute([$id,$uid]);$path=(string)($q->fetchColumn()?:'');
   if($path)ir_document_remove_owned_file($path,$uid);
   $pdo->prepare('DELETE FROM wp_ir2_documents WHERE id=? AND user_id=?')->execute([$id,$uid]);ir_flash('success','Dokument byl odstraněn.');ir_redirect('documents.php');
  }
  $title=trim((string)($_POST['title']??''));if($title==='')throw new RuntimeException('Zadej název dokumentu.');
  $oldFilePath='';if($id){$q=$pdo->prepare('SELECT file_path FROM wp_ir2_documents WHERE id=? AND user_id=?');$q->execute([$id,$uid]);$oldFilePath=(string)($q->fetchColumn()?:'');}
  $fileName=$filePath=$mime=null;$fileSize=null;$newStoredPath='';
  if(isset($_FILES['attachment'])&&is_uploaded_file((string)($_FILES['attachment']['tmp_name']??''))){
   $allowed=['application/pdf'=>'pdf','image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];$fi=new finfo(FILEINFO_MIME_TYPE);$mime=(string)$fi->file((string)$_FILES['attachment']['tmp_name']);
   if(!isset($allowed[$mime])||(int)$_FILES['attachment']['size']>20*1024*1024)throw new RuntimeException('Povolen je PDF, JPG, PNG nebo WEBP do 20 MB.');
   $relDir='uploads/documents/'.$uid.'/'.date('Y/m');$dir=__DIR__.'/'.$relDir;if(!is_dir($dir)&&!mkdir($dir,0750,true)&&!is_dir($dir))throw new RuntimeException('Nelze vytvořit složku dokumentů.');
   $safe=bin2hex(random_bytes(16)).'.'.$allowed[$mime];$dest=$dir.'/'.$safe;if(!move_uploaded_file((string)$_FILES['attachment']['tmp_name'],$dest))throw new RuntimeException('Přílohu se nepodařilo uložit.');
   if(str_starts_with($mime,'image/')){$dest=ir_optimize_image_file_webp($dest,$mime);$detected=(new finfo(FILEINFO_MIME_TYPE))->file($dest);if(is_string($detected)&&$detected!=='')$mime=$detected;}
   $fileName=basename((string)$_FILES['attachment']['name']);$filePath=$relDir.'/'.basename($dest);$newStoredPath=$filePath;$fileSize=(int)(filesize($dest)?:0);
  }
  $vals=[(int)($_POST['animal_id']??0)?:null,(int)($_POST['contact_id']??0)?:null,trim((string)($_POST['health_ref']??''))?:null,trim((string)($_POST['category']??'ostatni')),$title,trim((string)($_POST['language_mode']??'CZ')),trim((string)($_POST['template_key']??'custom')),trim((string)($_POST['body_cs']??'')),trim((string)($_POST['body_en']??'')),trim((string)($_POST['body_de']??''))];
  if($id){$sql='UPDATE wp_ir2_documents SET animal_id=?,contact_id=?,health_ref=?,category=?,title=?,language_mode=?,template_key=?,body_cs=?,body_en=?,body_de=?';$par=$vals;if($filePath){$sql.=',file_name=?,file_path=?,mime_type=?,file_size=?';array_push($par,$fileName,$filePath,$mime,$fileSize);}$sql.=' WHERE id=? AND user_id=?';array_push($par,$id,$uid);$pdo->prepare($sql)->execute($par);if($filePath&&$oldFilePath!==''&&$oldFilePath!==$filePath)ir_document_remove_owned_file($oldFilePath,$uid);}
  else{$pdo->prepare('INSERT INTO wp_ir2_documents(user_id,animal_id,contact_id,health_ref,category,title,language_mode,template_key,body_cs,body_en,body_de,file_name,file_path,mime_type,file_size) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$uid,...$vals,$fileName,$filePath,$mime,$fileSize]);}
  ir_flash('success','Dokument byl uložen.');ir_redirect('documents.php');
 }catch(Throwable $e){if(!empty($newStoredPath))ir_document_remove_owned_file($newStoredPath,$uid);ir_flash('error',$e->getMessage());ir_redirect($id?'documents.php?edit='.$id:'documents.php');}
}
$edit=null;$rows=[];$prefillAnimal=(int)($_GET['animal_id']??0);
if($ok){
 if(isset($_GET['edit'])){$q=$pdo->prepare('SELECT * FROM wp_ir2_documents WHERE id=? AND user_id=?');$q->execute([(int)$_GET['edit'],$uid]);$edit=$q->fetch()?:null;}
 $q=$pdo->prepare('SELECT d.*,z.jmeno_kod,c.name contact_name FROM wp_ir2_documents d LEFT JOIN wp_ir2_zvirata z ON z.id=d.animal_id AND z.user_id=d.user_id LEFT JOIN wp_ir2_contacts c ON c.id=d.contact_id AND c.user_id=d.user_id WHERE d.user_id=? ORDER BY d.created_at DESC,d.id DESC');$q->execute([$uid]);$rows=$q->fetchAll()?:[];
}
$files=array_filter($rows,fn($r)=>!empty($r['file_path']));$contracts=array_filter($rows,fn($r)=>in_array((string)($r['category']??''),['smlouva','převoz','původ'],true));$healthDocs=array_filter($rows,fn($r)=>in_array((string)($r['category']??''),['zdraví','laboratoř','RTG'],true));
ir_page_start('Dokumentové centrum','other');
?>
<div class="module-toolbar"><div class="module-tabs"><a href="contacts.php">Adresář</a><a class="is-active" href="documents.php">Dokumenty</a><a href="genetics.php">Genetika</a><a href="events.php">Burzy & akce</a></div></div>
<?php if(!$ok):?>
<section class="panel glow-panel"><div class="empty-state">Modul dokumentů není v databázi dostupný.</div></section>
<?php else:?>
<div class="kpi-grid doc-kpi-grid">
 <article class="kpi-card"><span class="kpi-visual"><?=ir_visual_icon('calendar-doc')?></span><div><small>Dokumenty</small><strong><?=count($rows)?></strong><span>celkem</span></div></article>
 <article class="kpi-card"><span class="kpi-visual"><?=ir_visual_icon('finance')?></span><div><small>Smlouvy a předání</small><strong><?=count($contracts)?></strong><span>původ, prodej, převoz</span></div></article>
 <article class="kpi-card"><span class="kpi-visual"><?=ir_visual_icon('health')?></span><div><small>Zdravotní dokumenty</small><strong><?=count($healthDocs)?></strong><span>laboratoř, RTG, zdraví</span></div></article>
 <article class="kpi-card"><span class="kpi-visual"><?=ir_visual_icon('gallery')?></span><div><small>Přílohy</small><strong><?=count($files)?></strong><span>PDF a fotografie</span></div></article>
</div>
<div class="documents-layout">
<section class="panel glow-panel document-studio">
 <header class="panel-head"><div><span class="panel-kicker">DOKUMENT STUDIO</span><h2><?=$edit?'Upravit dokument':'Vytvořit dokument'?></h2><p>Vyber šablonu, doplň údaje a ulož tisknutelný záznam k příslušnému zvířeti nebo kontaktu.</p></div></header>
 <div class="document-template-strip" data-document-templates><?php foreach($templates as $k=>$v):?><button type="button" class="document-template-chip" data-template-key="<?=ir_e($k)?>"><?=ir_e($v)?></button><?php endforeach?></div>
 <form method="post" enctype="multipart/form-data" class="form-grid cols-3" data-document-form><?=ir_csrf_field()?><input type="hidden" name="id" value="<?=ir_e((string)($edit['id']??''))?>">
  <label>Název dokumentu<input name="title" required value="<?=ir_e($edit['title']??'')?>"></label>
  <label>Šablona<select name="template_key"><?php foreach($templates as $k=>$v):?><option value="<?=$k?>" <?=$k===($edit['template_key']??'')?'selected':''?>><?=ir_e($v)?></option><?php endforeach?></select></label>
  <label>Jazyk<select name="language_mode"><?php foreach(['CZ'=>'Čeština','EN'=>'Angličtina','DE'=>'Němčina','CZ+EN+DE'=>'CZ + EN + DE'] as $x=>$label):?><option value="<?=$x?>" <?=$x===($edit['language_mode']??'CZ')?'selected':''?>><?=$label?></option><?php endforeach?></select></label>
  <label>Kategorie<select name="category"><?php foreach(['smlouva'=>'Smlouva','převoz'=>'Převoz','původ'=>'Původ','zdraví'=>'Zdraví','laboratoř'=>'Laboratoř','RTG'=>'RTG','ostatni'=>'Ostatní'] as $x=>$label):?><option value="<?=$x?>" <?=$x===($edit['category']??'')?'selected':''?>><?=ir_e($label)?></option><?php endforeach?></select></label>
  <label>Zvíře<select name="animal_id"><option value="">— bez vazby —</option><?php foreach($animals as $animal):?><option value="<?=$animal['id']?>" <?=(int)($edit['animal_id']??$prefillAnimal)===(int)$animal['id']?'selected':''?>><?=ir_e($animal['jmeno_kod'].' · '.($animal['latinsky_nazev']??''))?></option><?php endforeach?></select></label>
  <label>Kontakt<select name="contact_id"><option value="">— bez vazby —</option><?php foreach($contacts as $contact):?><option value="<?=$contact['id']?>" <?=(int)($edit['contact_id']??0)===(int)$contact['id']?'selected':''?>><?=ir_e($contact['name'])?></option><?php endforeach?></select></label>
  <label class="span-3">Vazba na zdravotní událost<input name="health_ref" value="<?=ir_e($edit['health_ref']??'')?>" placeholder="např. RTG 22.09.2026"></label>
  <label class="span-3">Česká verze<textarea name="body_cs" rows="12" placeholder="Obsah dokumentu…"><?=ir_e($edit['body_cs']??'')?></textarea></label>
  <label class="span-3">Anglická verze<textarea name="body_en" rows="9" placeholder="Volitelná anglická verze…"><?=ir_e($edit['body_en']??'')?></textarea></label>
  <label class="span-3">Německá verze<textarea name="body_de" rows="9" placeholder="Volitelná německá verze…"><?=ir_e($edit['body_de']??'')?></textarea></label>
  <label class="span-3">Příloha<input type="file" name="attachment" accept="application/pdf,image/jpeg,image/png,image/webp"><small>PDF/JPG/PNG/WEBP do 20 MB. Fotografie se při uložení bezeztrátově optimalizují, pokud tím ušetří místo.</small></label>
  <div class="form-actions span-3"><button class="btn primary" type="submit">Uložit dokument</button><?php if($edit):?><a class="btn" href="documents.php">Zrušit úpravy</a><?php endif?></div>
 </form>
</section>
<section class="panel glow-panel document-guide"><header class="panel-head"><div><span class="panel-kicker">KONTROLA</span><h2>Co má dokument obsahovat</h2></div></header><div class="document-checklist"><span>✓ identifikace zvířete</span><span>✓ údaje protistrany</span><span>✓ datum a místo</span><span>✓ cena / předání, pokud se týká</span><span>✓ prohlášení a poznámky</span><span>✓ prostor pro podpisy</span></div><p class="muted">Šablona slouží jako pracovní osnova. Před použitím dokumentu vůči třetí straně zkontroluj jeho věcnou správnost.</p></section>
</div>
<section class="panel glow-panel" style="margin-top:12px"><header class="panel-head"><div><span class="panel-kicker">ARCHIV</span><h2>Dokumenty a přílohy</h2></div></header><div class="table-scroll"><table class="data-table"><thead><tr><th>Dokument</th><th>Vazba</th><th>Jazyk</th><th>Příloha</th><th>Akce</th></tr></thead><tbody><?php if(!$rows):?><tr><td colspan="5" class="empty-state">Zatím nejsou uložené žádné dokumenty.</td></tr><?php endif;foreach($rows as $r):?><tr><td><strong><?=ir_e($r['title'])?></strong><small><?=ir_e($r['category'])?></small></td><td><?=ir_e(trim(($r['jmeno_kod']??'').' '.($r['contact_name']??'')))?></td><td><?=ir_e($r['language_mode'])?></td><td><?php if($r['file_path']):?><a href="document-file.php?id=<?=$r['id']?>" target="_blank"><?=ir_e($r['file_name'])?></a><?php else:?>—<?php endif?></td><td><div class="row-actions"><a class="btn small" href="document-print.php?id=<?=$r['id']?>" target="_blank">Tisk</a><a class="btn small" href="documents.php?edit=<?=$r['id']?>">Upravit</a><form method="post" onsubmit="return confirm('Opravdu odstranit tento dokument?')"><?=ir_csrf_field()?><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?=$r['id']?>"><button class="btn small danger" type="submit">Smazat</button></form></div></td></tr><?php endforeach?></tbody></table></div></section>
<script>
(()=>{const form=document.querySelector('[data-document-form]');if(!form)return;const select=form.querySelector('[name="template_key"]'),title=form.querySelector('[name="title"]'),body=form.querySelector('[name="body_cs"]');
const samples={purchase:['Kupní smlouva','Prodávající:\nKupující:\n\nPředmět smlouvy:\nZvíře / druh / ID:\nPůvod a známý zdravotní stav:\n\nKupní cena:\nDatum a způsob předání:\n\nProhlášení stran:\n\nPodpis prodávajícího:                         Podpis kupujícího:'],sale:['Prodejní smlouva','Prodávající:\nKupující:\n\nIdentifikace zvířete:\nDruh / ID / pohlaví / původ:\n\nCena a úhrada:\nPředání:\n\nDoplňující podmínky:\n\nPodpis prodávajícího:                         Podpis kupujícího:'],handover:['Předávací protokol','Předávající:\nPřebírající:\n\nZvíře / ID:\nDatum a místo předání:\nStav při předání:\nPředané dokumenty a vybavení:\n\nPoznámky:\n\nPodpisy:'],origin:['Potvrzení o původu','Chovatel:\n\nDruh:\nID zvířete:\nDatum narození / líhnutí:\nPohlaví:\nRodiče / linie / lokalita:\n\nProhlášení o původu:\n\nDatum a podpis chovatele:'],transport:['Převozní dokument','Odesílatel:\nPříjemce:\n\nPřepravované zvíře / druh / ID:\nDatum přepravy:\nVýchozí místo:\nCílové místo:\nPodmínky přepravy:\n\nKontaktní údaje:\nPoznámky:'],receipt:['Potvrzení o převzetí','Přebírající potvrzuje převzetí:\n\nZvíře / předmět:\nDatum a místo:\nStav při převzetí:\nPředané dokumenty:\n\nJméno a podpis přebírajícího:'],custom:['Vlastní dokument','']};
const apply=key=>{select.value=key;if(samples[key]){if(!title.value.trim())title.value=samples[key][0];if(!body.value.trim())body.value=samples[key][1];}};document.querySelectorAll('[data-template-key]').forEach(btn=>btn.addEventListener('click',()=>apply(btn.dataset.templateKey||'custom')));})();
</script>
<?php endif;ir_page_end();
