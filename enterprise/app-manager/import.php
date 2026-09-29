<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';require __DIR__.'/includes/reptile_core.php';
$uid=ir_current_user_id();$result=null;
if(($_GET['template']??'')==='activities'){
 header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename=ir-manager-import-aktivity-vzor.csv');
 $out=fopen('php://output','w');fwrite($out,"\xEF\xBB\xBF");fputcsv($out,['reptile_id','date','kind','type','size','count','note','weight','length','enddate'],';','"','');
 fputcsv($out,['ID_ZVIRETE',date('Y-m-d H:i'),'event','Krmení','Myš - Hole','1','Volitelná poznámka','','',''],';','"','');fclose($out);exit;
}
if($_SERVER['REQUEST_METHOD']==='POST'){
 ir_verify_csrf();
 try{
  if(!isset($_FILES['csv'])||($_FILES['csv']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK)throw new RuntimeException('Vyber CSV soubor.');
  $fh=fopen((string)$_FILES['csv']['tmp_name'],'rb');if(!$fh)throw new RuntimeException('CSV nelze otevřít.');$header=fgetcsv($fh,0,';');if(!$header)throw new RuntimeException('CSV je prázdné.');$header=array_map(fn($v)=>strtolower(trim((string)$v)),$header);$ok=0;$skip=0;$pdo->beginTransaction();
  while(($row=fgetcsv($fh,0,';'))!==false){$data=[];foreach($header as $i=>$h)$data[$h]=$row[$i]??'';$aid=ir_int($data['reptile id']??$data['reptile_id']??$data['zvire_id']??0);if(!$aid||!ir_animal($pdo,$uid,$aid)){$skip++;continue;}$kind=strtolower(trim((string)($data['record']??$data['kind']??'event')));$date=trim((string)($data['date']??$data['datum']??''))?:date('Y-m-d H:i');
   if($kind==='weight'||isset($data['weight'])){$value=(string)($data['weight']??$data['value']??'');ir_log_activity($pdo,$uid,$aid,'Vážení',$date,$value,trim((string)($data['note']??'')));$ok++;continue;}
   if($kind==='length'||isset($data['length'])){$value=(string)($data['length']??$data['value']??'');ir_log_activity($pdo,$uid,$aid,'Délka',$date,$value,trim((string)($data['note']??'')));$ok++;continue;}
   if($kind==='brumation'){$end=(string)($data['enddate']??$data['end']??'');ir_log_activity($pdo,$uid,$aid,'Brumace',$date,$end,trim((string)($data['note']??'')));$ok++;continue;}
   if($kind==='note'){$cat=trim((string)($data['category']??'Poznámka'));$content=trim((string)($data['content']??$data['note']??''));ir_log_activity($pdo,$uid,$aid,'Poznámka',$date,$cat,$content);$ok++;continue;}
   $type=trim((string)($data['type']??$data['category']??'Poznámka'));$size=trim((string)($data['size']??''));$count=trim((string)($data['count']??''));$value=trim(($count!==''?$count.'× ':'').$size);$note=trim((string)($data['note']??''));ir_log_activity($pdo,$uid,$aid,$type,$date,$value,$note);$ok++;
  }
  fclose($fh);$pdo->commit();$result=['ok'=>$ok,'skip'=>$skip];
 }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();error_log('IR action: '.$e->getMessage());$error=$e instanceof PDOException?'Změnu se nepodařilo uložit. Zkus to znovu.':$e->getMessage();}
}
ir_page_start('Import / Export','other');if(!empty($error))echo '<div class="flash danger">'.ir_e($error).'</div>';if($result)echo '<div class="flash success">Importováno '.$result['ok'].' řádků, přeskočeno '.$result['skip'].'.</div>';
?>
<div class="two-column-layout"><form class="panel glow-panel form-panel" method="post" enctype="multipart/form-data"><?=ir_csrf_field()?><header class="panel-head"><div><span class="panel-kicker">IMPORT</span><h2>CSV aktivity</h2></div><button class="btn primary">Importovat</button></header><p>Import a export aktivit používají stejný formát. Povinný je platný <code>reptile_id</code>; datum může být <code>YYYY-MM-DD HH:MM</code>.</p><div class="action-links"><a class="btn secondary" href="import.php?template=activities">Stáhnout vzor CSV</a><a class="btn secondary" href="export.php?type=activities&format=csv">Exportovat současná data</a></div><p><small>Sloupce: <code>reptile_id; date; kind; type; size; count; note; weight; length; enddate</code></small></p><label>CSV soubor<input type="file" name="csv" accept=".csv,text/csv" required></label></form><section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">EXPORT</span><h2>Data ven ze systému</h2></div></header><div class="action-links"><a class="btn secondary" href="export.php?type=animals&format=csv">Zvířata CSV</a><a class="btn secondary" href="export.php?type=activities&format=csv">Aktivity CSV</a><a class="btn secondary" href="export.php?type=animals">Zvířata JSON</a><a class="btn secondary" href="export.php?type=activities">Aktivity JSON</a></div></section></div>
<?php ir_page_end();
