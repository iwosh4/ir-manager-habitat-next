<?php
declare(strict_types=1);

function ir_auth_rate_limit(PDO $pdo,string $action,string $identifier): bool
{
    $ip=(string)($_SERVER['REMOTE_ADDR']??'unknown');
    $bucket=(string)intdiv(time(),900);
    $limit=match($action){'forgot'=>5,'register'=>10,default=>20};
    $keys=[hash('sha256','ip|'.$ip.'|'.$action.'|'.$bucket)=>max(30,$limit)];
    if($identifier!=='')$keys[hash('sha256','account|'.mb_strtolower($identifier,'UTF-8').'|'.$action.'|'.$bucket)]=$limit;
    foreach($keys as $key=>$max){
        $q=$pdo->prepare('INSERT INTO wp_ir2_auth_limits (bucket_hash,attempts,expires_at) VALUES (?,1,DATE_ADD(NOW(),INTERVAL 1 DAY)) ON DUPLICATE KEY UPDATE attempts=attempts+1');$q->execute([$key]);
        $q=$pdo->prepare('SELECT attempts FROM wp_ir2_auth_limits WHERE bucket_hash=?');$q->execute([$key]);
        if((int)$q->fetchColumn()>$max)return false;
    }
    $pdo->exec('DELETE FROM wp_ir2_auth_limits WHERE expires_at<NOW() LIMIT 500');
    return true;
}
