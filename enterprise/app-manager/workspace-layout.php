<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/workspace.php';
header('Content-Type: application/json; charset=utf-8');
if($_SERVER['REQUEST_METHOD']!=='POST'){http_response_code(405);exit;}
ir_verify_csrf();$module=(string)($_POST['module']??'');
if(!in_array($module,ir_workspace_modules(),true)){http_response_code(400);echo json_encode(['error'=>'Neplatný modul.']);exit;}
try {
 $uid=ir_current_user_id();$data=json_decode((string)($_POST['layout']??''),true,32,JSON_THROW_ON_ERROR);$registry=ir_widget_registry();
 if(!is_array($data)||count($data)>count($registry))throw new InvalidArgumentException();
 $seen=[];foreach($data as $w){if(!is_array($w)||!isset($registry[$w['id']??''])||isset($seen[$w['id']])||!in_array($w['size']??null,$registry[$w['id']]['sizes'],true)||!in_array($w['limit']??null,[3,6,12],true))throw new InvalidArgumentException();$seen[$w['id']]=true;}
 $pdo->beginTransaction();$pdo->prepare('DELETE FROM wp_ir2_user_settings WHERE user_id=? AND setting_key LIKE ?')->execute([$uid,'overview.'.$module.'.%']);
 if(($_POST['reset']??'')!=='1')foreach($data as $order=>$w){$value=json_encode(['order'=>$order,'size'=>$w['size'],'enabled'=>(bool)($w['enabled']??false),'limit'=>$w['limit']]);$pdo->prepare('INSERT INTO wp_ir2_user_settings(user_id,setting_key,setting_value) VALUES(?,?,?)')->execute([$uid,'overview.'.$module.'.'.$w['id'],$value]);}
 if($module==='dashboard'){$pdo->prepare('INSERT INTO wp_ir2_user_settings(user_id,setting_key,setting_value) VALUES(?,?,?)')->execute([$uid,'overview.dashboard.__design_version','61']);}
 $pdo->commit();echo json_encode(['ok'=>true]);
}catch(InvalidArgumentException|JsonException $e){http_response_code(400);echo json_encode(['error'=>'Neplatné rozložení.']);}
catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();error_log('Layout: '.$e->getMessage());http_response_code(500);echo json_encode(['error'=>'Rozložení se nepodařilo uložit.']);}
