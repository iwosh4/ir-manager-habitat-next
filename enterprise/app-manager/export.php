<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/reptile_core.php';
$uid=ir_current_user_id();$type=(string)($_GET['type']??'activities');$format=strtolower((string)($_GET['format']??'json'));
$rows=[];$name='ir-manager-export';
if($type==='animal'){$id=ir_int($_GET['id']??0);$a=ir_animal($pdo,$uid,$id);if(!$a){http_response_code(404);exit('Nenalezeno.');}$rows=['animal'=>$a,'activities'=>ir_activity_rows($pdo,$uid,['animal_id'=>$id],500)];$name='animal-'.$id;}
elseif($type==='animals'){$st=$pdo->prepare("SELECT * FROM wp_ir2_zvirata WHERE user_id=? ORDER BY id");$st->execute([$uid]);$rows=$st->fetchAll()?:[];$name='animals';}
else{$rows=ir_activity_rows($pdo,$uid,[],1000);$name='activities';}

if($format==='csv' && is_array($rows) && array_is_list($rows)){
 header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="'.$name.'-'.date('Ymd').'.csv"');$out=fopen('php://output','w');fwrite($out,"\xEF\xBB\xBF");
 if($type==='activities'){
   $header=['reptile_id','date','kind','type','size','count','note','weight','length','enddate'];fputcsv($out,$header,';','"','');
   foreach($rows as $r){
     $typ=trim((string)($r['typ']??''));$value=trim((string)($r['hodnota']??''));$detail=trim((string)($r['detail']??''));$kind='event';$typeValue=$typ;$size=$value;$count='';$weight='';$length='';$end='';
     if(mb_strtolower($typ)==='vážení'){$kind='weight';$weight=$value;$typeValue='';$size='';}
     elseif(mb_strtolower($typ)==='délka'){$kind='length';$length=$value;$typeValue='';$size='';}
     elseif(mb_strtolower($typ)==='brumace'){$kind='brumation';$end=$value;$typeValue='';$size='';}
     elseif(mb_strtolower($typ)==='poznámka'){$kind='note';$typeValue='';$size='';}
     fputcsv($out,[(int)($r['zvire_id']??0),(string)($r['datum']??''),$kind,$typeValue,$size,$count,$detail,$weight,$length,$end],';','"','');
   }
 }elseif($rows){fputcsv($out,array_keys($rows[0]),';','"','');foreach($rows as $r)fputcsv($out,array_values($r),';','"','');}
 fclose($out);exit;
}
header('Content-Type: application/json; charset=utf-8');header('Content-Disposition: attachment; filename="'.$name.'-'.date('Ymd').'.json"');echo json_encode($rows,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
