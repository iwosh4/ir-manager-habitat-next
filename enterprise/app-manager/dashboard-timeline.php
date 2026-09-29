<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';
require __DIR__.'/includes/live.php';
header('Content-Type: application/json; charset=utf-8');
$uid=ir_current_user_id();
$from=(string)($_GET['from']??date('Y-m-d',strtotime('-14 days')));
$to=(string)($_GET['to']??date('Y-m-d',strtotime('+30 days')));
if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$from)||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$to)){http_response_code(400);echo json_encode(['error'=>'Neplatné datum']);exit;}
$a=new DateTimeImmutable($from);$b=new DateTimeImmutable($to);if($b<$a||$a->diff($b)->days>93){http_response_code(400);echo json_encode(['error'=>'Rozsah může mít nejvýše 93 dní']);exit;}
$days=[];
for($d=$a;$d<=$b;$d=$d->modify('+1 day'))$days[$d->format('Y-m-d')]=['date'=>$d->format('Y-m-d'),'tasks'=>[],'history'=>[]];
if(ir_table_exists($pdo,'wp_ir2_planovac')){
 try{$q=$pdo->prepare("SELECT p.id,p.nazev_ukolu,p.kategorie,p.datum_termin,p.cas_termin,p.stav,p.zvire_id,z.jmeno_kod,z.latinsky_nazev FROM wp_ir2_planovac p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE p.user_id=? AND p.datum_termin BETWEEN ? AND ? AND p.stav IN ('Aktivní','Hotovo','Splněno','Vynecháno') ORDER BY p.datum_termin,p.cas_termin,p.id");$q->execute([$uid,$from,$to]);$groups=[];foreach($q->fetchAll()?:[] as $r){$date=(string)$r['datum_termin'];$key=$date.'|'.mb_strtolower(trim((string)$r['nazev_ukolu']),'UTF-8').'|'.mb_strtolower(trim((string)$r['kategorie']),'UTF-8');if(!isset($groups[$key]))$groups[$key]=['date'=>$date,'title'=>(string)$r['nazev_ukolu'],'category'=>(string)$r['kategorie'],'icon'=>ir_activity_icon_key('task',(string)$r['nazev_ukolu']),'count'=>0,'active'=>0,'done'=>0,'skipped'=>0,'items'=>[]];$groups[$key]['count']++;if($r['stav']==='Aktivní')$groups[$key]['active']++;elseif($r['stav']==='Vynecháno')$groups[$key]['skipped']++;else $groups[$key]['done']++;$groups[$key]['items'][]=['id'=>(int)$r['id'],'animal'=>(string)($r['jmeno_kod']?:$r['latinsky_nazev']?:'Bez zvířete'),'time'=>substr((string)($r['cas_termin']??''),0,5),'status'=>(string)$r['stav']];}foreach($groups as $g)if(isset($days[$g['date']]))$days[$g['date']]['tasks'][]=$g;}catch(Throwable $e){error_log('Dashboard timeline tasks: '.$e->getMessage());}
}
if(ir_table_exists($pdo,'wp_ir2_pece')){
 try{$q=$pdo->prepare("SELECT p.id,p.typ,p.datum,p.hodnota,p.detail,z.jmeno_kod,z.latinsky_nazev FROM wp_ir2_pece p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE p.user_id=? AND DATE(p.datum) BETWEEN ? AND ? ORDER BY p.datum DESC,p.id DESC");$q->execute([$uid,$from,$to]);foreach($q->fetchAll()?:[] as $r){$date=substr((string)$r['datum'],0,10);if(!isset($days[$date]))continue;$days[$date]['history'][]=['id'=>(int)$r['id'],'title'=>(string)$r['typ'],'icon'=>ir_activity_icon_key('care',(string)$r['typ']),'animal'=>(string)($r['jmeno_kod']?:$r['latinsky_nazev']?:''),'value'=>(string)($r['hodnota']??''),'time'=>substr((string)$r['datum'],11,5)];}}catch(Throwable $e){error_log('Dashboard timeline history: '.$e->getMessage());}
}
echo json_encode(['days'=>array_values($days)],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
