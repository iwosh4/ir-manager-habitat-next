<?php
declare(strict_types=1);

function ir_habitat_connector_ensure_tables(PDO $pdo): void {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS wp_ir2_habitat_sources_15 (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,name VARCHAR(120) NOT NULL,kind VARCHAR(40) NOT NULL DEFAULT 'home_assistant',base_url VARCHAR(255) NOT NULL,token_enc TEXT NOT NULL,enabled TINYINT(1) NOT NULL DEFAULT 1,last_sync DATETIME NULL,last_error VARCHAR(500) NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $pdo->exec("CREATE TABLE IF NOT EXISTS wp_ir2_habitat_sensor_bindings_15 (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,source_id BIGINT UNSIGNED NOT NULL,habitat_id BIGINT UNSIGNED NULL,entity_id VARCHAR(190) NOT NULL,label VARCHAR(120) NULL,metric VARCHAR(40) NOT NULL DEFAULT 'temperature',unit VARCHAR(30) NULL,last_value VARCHAR(100) NULL,last_seen DATETIME NULL,enabled TINYINT(1) NOT NULL DEFAULT 1,UNIQUE KEY uniq_binding(user_id,source_id,entity_id,habitat_id),INDEX(user_id),INDEX(habitat_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {
        error_log('IR habitat connector schema: '.$e->getMessage());
    }
}

function ir_habitat_secret_keys(): array {
    global $localConfig;
    $explicit=(string)(getenv('IR_APP_SECRET') ?: ($localConfig['app_secret'] ?? ''));
    $dbSecret=(string)($localConfig['db_pass'] ?? '');
    $dbName=(string)($localConfig['db_name'] ?? '');
    $material=$explicit!=='' ? 'app|'.$explicit : 'db|'.$dbSecret.'|'.$dbName.'|'.IR_AUTH_TABLE.'|'.IR_ROOT;
    $new=hash('sha256',$material,true);
    $legacy=hash('sha256',IR_ROOT.'|'.IR_AUTH_TABLE,true);
    return hash_equals($new,$legacy)?[$new]:[$new,$legacy];
}

function ir_habitat_secret_encrypt(string $plain): string {
    $keys=ir_habitat_secret_keys();$key=$keys[0];$iv=random_bytes(12);$tag='';
    $enc=openssl_encrypt($plain,'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag);
    if($enc===false)throw new RuntimeException('Token se nepodařilo zašifrovat.');
    return 'v2:'.base64_encode($iv.$tag.$enc);
}

function ir_habitat_secret_decrypt(string $stored): string {
    $payload=str_starts_with($stored,'v2:')?substr($stored,3):$stored;
    $raw=base64_decode($payload,true);if($raw===false||strlen($raw)<29)return '';
    $iv=substr($raw,0,12);$tag=substr($raw,12,16);$enc=substr($raw,28);
    foreach(ir_habitat_secret_keys() as $key){$plain=openssl_decrypt($enc,'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag);if(is_string($plain)&&$plain!=='')return $plain;}
    return '';
}

function ir_habitat_ip_scope(string $ip): string {
    if(filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_IPV4)){
        $n=ip2long($ip);if($n===false)return 'invalid';$u=(int)sprintf('%u',$n);
        $in=static fn(string $a,string $b):bool=>$u>=(int)sprintf('%u',ip2long($a))&&$u<=(int)sprintf('%u',ip2long($b));
        if($in('127.0.0.0','127.255.255.255')||$in('169.254.0.0','169.254.255.255')||$in('0.0.0.0','0.255.255.255')||$in('224.0.0.0','255.255.255.255'))return 'blocked';
        if($in('10.0.0.0','10.255.255.255')||$in('172.16.0.0','172.31.255.255')||$in('192.168.0.0','192.168.255.255'))return 'private';
        return 'public';
    }
    if(filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_IPV6)){
        $packed=@inet_pton($ip);if($packed===false)return 'invalid';$hex=strtolower(bin2hex($packed));
        if($ip==='::'||$ip==='::1'||str_starts_with($hex,'fe8')||str_starts_with($hex,'fe9')||str_starts_with($hex,'fea')||str_starts_with($hex,'feb'))return 'blocked';
        $first=hexdec(substr($hex,0,2));if(($first&0xfe)===0xfc)return 'private';
        if($first===0xff)return 'blocked';
        return 'public';
    }
    return 'invalid';
}

function ir_habitat_allowed_hosts(): array {
    global $localConfig;
    $items=(array)($localConfig['ha_allowed_hosts']??[]);$out=[];
    foreach($items as $item){$item=strtolower(trim((string)$item));if($item!==''&&preg_match('/^[a-z0-9.:-]+$/D',$item))$out[]=$item;}
    return array_values(array_unique($out));
}

function ir_habitat_validate_base_url(string $url): string {
    global $localConfig;
    $url=rtrim(trim($url),'/');$parts=parse_url($url);
    if(!is_array($parts)||!in_array(strtolower((string)($parts['scheme']??'')),['http','https'],true)||empty($parts['host']))throw new RuntimeException('URL Home Assistant musí začínat http:// nebo https://.');
    if(isset($parts['user'])||isset($parts['pass'])||isset($parts['query'])||isset($parts['fragment']))throw new RuntimeException('URL Home Assistant nesmí obsahovat přihlašovací údaje, query ani fragment.');
    $host=strtolower((string)$parts['host']);
    if(strcasecmp($host,'localhost')===0)throw new RuntimeException('Loopback localhost není pro konektor povolen. Použij LAN adresu Home Assistantu.');
    $explicit=in_array($host,ir_habitat_allowed_hosts(),true);
    $allowPrivate=(bool)($localConfig['ha_allow_private_networks']??true);
    $ips=[];
    if(filter_var($host,FILTER_VALIDATE_IP))$ips=[$host];
    else{
        $v4=@gethostbynamel($host);if(is_array($v4))$ips=array_merge($ips,$v4);
        if(function_exists('dns_get_record')){foreach((array)@dns_get_record($host,DNS_AAAA) as $rec)if(!empty($rec['ipv6']))$ips[]=(string)$rec['ipv6'];}
    }
    $ips=array_values(array_unique($ips));if(!$ips&&!$explicit)throw new RuntimeException('Host Home Assistantu se nepodařilo bezpečně přeložit.');
    foreach($ips as $ip){$scope=ir_habitat_ip_scope($ip);if($scope==='blocked'||$scope==='invalid')throw new RuntimeException('Tato síťová adresa není pro konektor povolena.');if($scope==='public'&&!$explicit)throw new RuntimeException('Veřejná adresa Home Assistantu musí být výslovně uvedena v ha_allowed_hosts.');if($scope==='private'&&!$allowPrivate&&!$explicit)throw new RuntimeException('Privátní síť Home Assistantu není v konfiguraci povolena.');}
    $port=(int)($parts['port']??0);if($port<0||$port>65535)throw new RuntimeException('Neplatný port Home Assistantu.');
    return $url;
}

function ir_habitat_request(string $baseUrl,string $token,string $path): array {
    if(!function_exists('curl_init'))throw new RuntimeException('PHP cURL není na serveru dostupné.');
    $baseUrl=ir_habitat_validate_base_url($baseUrl);if(!in_array($path,['/api/','/api/states'],true))throw new RuntimeException('Nepovolený endpoint konektoru.');
    $ch=curl_init($baseUrl.$path);$opts=[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>5,CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_MAXREDIRS=>0,CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$token,'Content-Type: application/json'],CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2];
    if(defined('CURLOPT_PROTOCOLS'))$opts[CURLOPT_PROTOCOLS]=CURLPROTO_HTTP|CURLPROTO_HTTPS;
    if(defined('CURLOPT_REDIR_PROTOCOLS'))$opts[CURLOPT_REDIR_PROTOCOLS]=CURLPROTO_HTTP|CURLPROTO_HTTPS;
    curl_setopt_array($ch,$opts);$body=curl_exec($ch);$code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);$err=curl_error($ch);curl_close($ch);
    if($body===false||$code<200||$code>=300)throw new RuntimeException($err?:'Home Assistant HTTP '.$code);
    $json=json_decode($body,true);return is_array($json)?$json:[];
}

function ir_habitat_sync_source(PDO $pdo,int $uid,int $sourceId): int {
    ir_habitat_connector_ensure_tables($pdo);
    $q=$pdo->prepare('SELECT * FROM wp_ir2_habitat_sources_15 WHERE user_id=? AND id=? AND enabled=1 LIMIT 1');$q->execute([$uid,$sourceId]);$src=$q->fetch();if(!$src)throw new RuntimeException('Zdroj nebyl nalezen.');
    $token=ir_habitat_secret_decrypt((string)$src['token_enc']);if($token==='')throw new RuntimeException('Token konektoru nelze dešifrovat. Ulož zdroj znovu.');
    try{
        $states=ir_habitat_request((string)$src['base_url'],$token,'/api/states');$map=[];foreach($states as $state)if(is_array($state)&&isset($state['entity_id']))$map[(string)$state['entity_id']]=$state;
        $q=$pdo->prepare('SELECT * FROM wp_ir2_habitat_sensor_bindings_15 WHERE user_id=? AND source_id=? AND enabled=1');$q->execute([$uid,$sourceId]);$bindings=$q->fetchAll()?:[];
        $upd=$pdo->prepare('UPDATE wp_ir2_habitat_sensor_bindings_15 SET last_value=?,unit=?,last_seen=? WHERE id=? AND user_id=?');$count=0;
        foreach($bindings as $b){$state=$map[(string)$b['entity_id']]??null;if(!$state)continue;$seen=date('Y-m-d H:i:s');if(!empty($state['last_updated'])&&strtotime((string)$state['last_updated']))$seen=date('Y-m-d H:i:s',strtotime((string)$state['last_updated']));$upd->execute([(string)($state['state']??''),(string)($state['attributes']['unit_of_measurement']??''),$seen,(int)$b['id'],$uid]);$count++;}
        $pdo->prepare('UPDATE wp_ir2_habitat_sources_15 SET last_sync=NOW(),last_error=NULL WHERE id=? AND user_id=?')->execute([$sourceId,$uid]);return $count;
    }catch(Throwable $e){$pdo->prepare('UPDATE wp_ir2_habitat_sources_15 SET last_error=? WHERE id=? AND user_id=?')->execute([mb_substr($e->getMessage(),0,500,'UTF-8'),$sourceId,$uid]);throw $e;}
}

function ir_habitat_sync_due_sources(PDO $pdo,int $uid,int $maxAgeSeconds=3600): int {
    ir_habitat_connector_ensure_tables($pdo);$cutoff=date('Y-m-d H:i:s',time()-max(60,$maxAgeSeconds));$q=$pdo->prepare("SELECT id FROM wp_ir2_habitat_sources_15 WHERE user_id=? AND enabled=1 AND (CASE WHEN last_error IS NOT NULL AND last_error<>'' THEN updated_at ELSE last_sync END IS NULL OR CASE WHEN last_error IS NOT NULL AND last_error<>'' THEN updated_at ELSE last_sync END<?) ORDER BY COALESCE(last_sync,'1970-01-01'),id");$q->execute([$uid,$cutoff]);$n=0;
    foreach($q->fetchAll(PDO::FETCH_COLUMN)?:[] as $id){try{ir_habitat_sync_source($pdo,$uid,(int)$id);$n++;}catch(Throwable $e){error_log('IR HA auto sync source '.(int)$id.': '.$e->getMessage());}}
    return $n;
}

function ir_habitat_sensor_map(PDO $pdo,int $uid): array {
    if(!ir_table_exists($pdo,'wp_ir2_habitat_sensor_bindings_15'))return [];
    $q=$pdo->prepare("SELECT habitat_id,metric,last_value,unit,last_seen,entity_id,label FROM wp_ir2_habitat_sensor_bindings_15 WHERE user_id=? AND enabled=1 AND habitat_id IS NOT NULL ORDER BY habitat_id,metric,(last_seen IS NULL),last_seen DESC,id DESC");$q->execute([$uid]);$out=[];
    foreach($q->fetchAll()?:[] as $r){$hid=(int)$r['habitat_id'];$metric=(string)$r['metric'];if(isset($out[$hid][$metric]))continue;$out[$hid][$metric]=$r;}
    return $out;
}
