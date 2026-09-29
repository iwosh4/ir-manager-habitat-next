<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';
header('Content-Type: application/json; charset=utf-8');
try {
    $uid=ir_current_user_id();
    if ($_SERVER['REQUEST_METHOD']==='POST') {
        ir_verify_csrf();
        $id=filter_var($_POST['id']??null,FILTER_VALIDATE_INT);
        if (!$id || $id<1) { http_response_code(400); echo json_encode(['error'=>'Neplatné oznámení.']); exit; }
        $pdo->prepare('UPDATE wp_ir2_notifikace SET precteno=? WHERE user_id=? AND id=?')->execute([(int)(($_POST['read']??'1')==='1'),$uid,$id]);
    } elseif ($_SERVER['REQUEST_METHOD']!=='GET') { http_response_code(405); exit; }
    $q=$pdo->prepare('SELECT id,titulek,zprava,url,precteno,created_at FROM wp_ir2_notifikace WHERE user_id=? ORDER BY precteno,created_at DESC,id DESC LIMIT 100');
    $q->execute([$uid]); $rows=$q->fetchAll();
    foreach($rows as &$row) {
        // Only actual local app pages are navigation targets; never execute stored schemes.
        $url=(string)$row['url']; $parts=parse_url($url); $path=$parts['path']??'';
        $base=basename($path);
        $row['url']=!isset($parts['scheme'])&&!isset($parts['host'])&&!str_contains($url,'\\')&&!str_contains($path,'..')&&preg_match('/^[a-z][a-z-]*\.php$/D',$base)&&is_file(__DIR__.'/'.$base)
            ? $base.(isset($parts['query'])?'?'.$parts['query']:'') : '';
    } unset($row);
    $q=$pdo->prepare('SELECT COUNT(*) FROM wp_ir2_notifikace WHERE user_id=? AND precteno=0');$q->execute([$uid]);
    echo json_encode(['items'=>$rows,'unread'=>(int)$q->fetchColumn()],JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);
} catch(Throwable $e) { error_log('IR notifications: '.$e->getMessage()); http_response_code(500); echo json_encode(['error'=>'Oznámení se nepodařilo načíst. Zkus to znovu.']); }
