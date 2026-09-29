<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/reptile_core.php';

if($_SERVER['REQUEST_METHOD']!=='POST'){http_response_code(405);exit('Method not allowed');}
ir_verify_csrf();
$uid=ir_current_user_id();
$action=(string)($_POST['action']??'');
$id=(int)($_POST['id']??0);
$return=(string)($_POST['return']??'index.php');
if($id<1){http_response_code(400);exit('Neplatný záznam.');}

function ir_header_safe_return(string $value): string {
    $value=trim($value);
    if($value===''||str_contains($value,'://')||str_starts_with($value,'//')||str_contains($value,"\n")||str_contains($value,"\r")||str_contains($value,'..')) return 'index.php';
    $path=parse_url($value,PHP_URL_PATH);
    if(!is_string($path)) return 'index.php';
    $base=basename($path);
    $allowed=['index.php','module.php','profile.php','settings.php','admin.php'];
    if(!in_array($base,$allowed,true)) return 'index.php';
    $query=parse_url($value,PHP_URL_QUERY);
    return $base.($query?'?'.$query:'');
}

try{
    if($action==='toggle_task'){
        $st=$pdo->prepare("SELECT stav FROM wp_ir2_planovac WHERE id=? AND user_id=? LIMIT 1");$st->execute([$id,$uid]);$state=(string)($st->fetchColumn()?:'');
        if($state==='') throw new RuntimeException('Úkol nebyl nalezen.');
        $new=in_array($state,['Hotovo','Splněno'],true)?'Aktivní':'Hotovo';
        if($new==='Hotovo')ir_complete_planner_task($pdo,$uid,$id);else{$up=$pdo->prepare("UPDATE wp_ir2_planovac SET stav=? WHERE id=? AND user_id=?");$up->execute([$new,$id,$uid]);}
    } elseif($action==='snooze_task'){
        $up=$pdo->prepare("UPDATE wp_ir2_planovac SET datum_termin=DATE_ADD(GREATEST(datum_termin,CURDATE()),INTERVAL 1 DAY), stav='Aktivní' WHERE id=? AND user_id=?");
        $up->execute([$id,$uid]);
    } else {
        http_response_code(400);exit('Neplatná akce.');
    }
}catch(Throwable $e){error_log('IR Next header action: '.$e->getMessage());http_response_code(500);exit('Akci se nepodařilo uložit.');}

ir_redirect(ir_header_safe_return($return));
