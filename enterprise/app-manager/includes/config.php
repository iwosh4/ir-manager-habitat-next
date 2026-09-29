<?php
declare(strict_types=1);

const IR_APP_NAME = 'IR Manager';
const IR_APP_VERSION = 'beta-1.0-final';
const IR_ACCENT = '#f28b28';

if (!defined('IR_ROOT')) define('IR_ROOT', dirname(__DIR__));
date_default_timezone_set('Europe/Prague');
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');

/* Load private configuration before session setup so HTTPS/proxy policy is known
   before cookies are created. */
$localConfigFile = IR_ROOT.'/config.local.php';
if (!is_file($localConfigFile)) {
    http_response_code(500);
    exit('Chybí soukromý soubor /app-manager/config.local.php.');
}
$localConfig = require $localConfigFile;
if (!is_array($localConfig)) { http_response_code(500); exit('config.local.php musí vracet konfigurační pole.'); }
define('IR_CONFIG_SOURCE', $localConfigFile);

$trustProxyHeaders=(bool)($localConfig['trust_proxy_headers']??false);
$forwardedProto=$trustProxyHeaders ? strtolower(trim(explode(',',(string)($_SERVER['HTTP_X_FORWARDED_PROTO']??''))[0]??'')) : '';
$isHttps = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
    || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443
    || $forwardedProto === 'https';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name('IR_APP_MANAGER_' . substr(hash('sha256', IR_ROOT), 0, 12));
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

if (!headers_sent()) {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(self), microphone=(self), geolocation=()');
    header('Cache-Control: private, no-store, max-age=0');
}

function ir_e(?string $value): string { return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function ir_redirect(string $url): never { header('Location: ' . $url); exit; }
function ir_flash(string $type, string $message): void { $_SESSION['ir_flash'][] = ['type'=>$type,'message'=>$message]; }
function ir_pull_flashes(): array { $items=$_SESSION['ir_flash']??[]; unset($_SESSION['ir_flash']); return is_array($items)?$items:[]; }
function ir_csrf_token(): string { if (empty($_SESSION['ir_csrf']) || !is_string($_SESSION['ir_csrf'])) $_SESSION['ir_csrf']=bin2hex(random_bytes(32)); return $_SESSION['ir_csrf']; }
function ir_csrf_field(): string { return '<input type="hidden" name="_csrf" value="'.ir_e(ir_csrf_token()).'"><input type="hidden" name="_submission" value="'.bin2hex(random_bytes(16)).'">'; }
function ir_verify_csrf(): void {
    $token=(string)($_POST['_csrf']??'');$known=(string)($_SESSION['ir_csrf']??'');
    if($known===''||$token===''||!hash_equals($known,$token)){http_response_code(419);exit('Relace formuláře vypršela. Obnov stránku a zkus to znovu.');}
    $submission=(string)($_POST['_submission']??'');
    if($submission!==''){
        if(!preg_match('/^[a-f0-9]{32}$/D',$submission)){http_response_code(400);exit('Neplatný formulář.');}
        $used=$_SESSION['ir_submissions']??[];
        if(isset($used[$submission])){http_response_code(409);exit('Tento formulář už byl odeslán. Obnov stránku pro aktuální stav.');}
        $used[$submission]=time();$_SESSION['ir_submissions']=array_slice($used,-100,null,true);
    }
}

function ir_logged_in(): bool { return !empty($_SESSION['user_id']); }
function ir_current_user_id(): int { return (int)($_SESSION['user_id']??0); }
function ir_current_user_name(): string { return (string)($_SESSION['user_name']??''); }
function ir_require_login(): void { if(!ir_logged_in()) ir_redirect('auth.php'); }

if (!function_exists('e')) { function e(?string $v): string { return ir_e($v); } }
if (!function_exists('redirect')) { function redirect(string $u): never { ir_redirect($u); } }
if (!function_exists('flash')) { function flash(string $t,string $m): void { ir_flash($t,$m); } }
if (!function_exists('pull_flashes')) { function pull_flashes(): array { return ir_pull_flashes(); } }
if (!function_exists('csrf_token')) { function csrf_token(): string { return ir_csrf_token(); } }
if (!function_exists('csrf_field')) { function csrf_field(): string { return ir_csrf_field(); } }
if (!function_exists('verify_csrf')) { function verify_csrf(): void { ir_verify_csrf(); } }
if (!function_exists('current_user_id')) { function current_user_id(): int { return ir_current_user_id(); } }
if (!function_exists('require_login')) { function require_login(): void { ir_require_login(); } }

if (!(defined('IR_PUBLIC_PAGE') && IR_PUBLIC_PAGE === true)) ir_require_login();

/* /app-manager is self-contained and uses only this private configuration. */
function ir_config_value(array $c,string $env,string $key): string { $v=getenv($env); return $v!==false&&$v!==''?(string)$v:(string)($c[$key]??''); }
$dbHost=ir_config_value($localConfig,'IR_DB_HOST','db_host');
$dbName=ir_config_value($localConfig,'IR_DB_NAME','db_name');
$dbUser=ir_config_value($localConfig,'IR_DB_USER','db_user');
$dbPass=ir_config_value($localConfig,'IR_DB_PASS','db_pass');
$dbPort=(int)($localConfig['db_port']??3306);
if($dbHost===''||$dbName===''||$dbUser===''||$dbPass===''){http_response_code(500);exit('Databázová konfigurace není kompletní.');}
try{
    $pdo=new PDO("mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4",$dbUser,$dbPass,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false,PDO::ATTR_STRINGIFY_FETCHES=>false]);
    /* Keep SQL NOW()/CURDATE() aligned with PHP's Europe/Prague clock without
       changing the historical storage policy of the existing application. */
    $dbOffset=(new DateTimeImmutable('now',new DateTimeZone('Europe/Prague')))->format('P');
    $pdo->exec("SET time_zone=".$pdo->quote($dbOffset));
}catch(PDOException $e){error_log('IR Next DB failed: '.$e->getMessage());http_response_code(500);exit('Nepodařilo se připojit k databázi.');}

$authTable=preg_replace('/[^A-Za-z0-9_]/','',(string)($localConfig['auth_table']??'wp_ir2__uzivatele'));
define('IR_AUTH_TABLE',$authTable!==''?$authTable:'wp_ir2__uzivatele');

/* Security-sensitive links must use the configured canonical URL.  Never build
   password-reset URLs from the request Host header. */
$configuredPublic=rtrim(trim((string)($localConfig['public_url']??'')),'/');
$publicParts=$configuredPublic!==''?parse_url($configuredPublic):false;
if($configuredPublic!=='' && (!is_array($publicParts)||!in_array(strtolower((string)($publicParts['scheme']??'')),['http','https'],true)||empty($publicParts['host'])||isset($publicParts['user'])||isset($publicParts['pass'])||isset($publicParts['query'])||isset($publicParts['fragment']))){
    error_log('IR config: invalid public_url');$configuredPublic='';$publicParts=false;
}
define('IR_PUBLIC_URL',$configuredPublic);
define('IR_ALLOW_REGISTRATION',(bool)($localConfig['allow_registration']??false));
define('IR_FORCE_HTTPS',(bool)($localConfig['force_https']??true));
define('IR_TRUST_PROXY_HEADERS',$trustProxyHeaders);
if(!defined('IR_MAIL_FROM')&&!empty($localConfig['mail_from'])) define('IR_MAIL_FROM',(string)$localConfig['mail_from']);
if(!defined('IR_MAIL_FROM_NAME')&&!empty($localConfig['mail_from_name'])) define('IR_MAIL_FROM_NAME',(string)$localConfig['mail_from_name']);

/* Reject unknown Host headers when a canonical host is configured. */
$requestHost=strtolower(preg_replace('/:\d+$/','',trim((string)($_SERVER['HTTP_HOST']??''))));
$canonicalHost=is_array($publicParts)?strtolower((string)($publicParts['host']??'')):'';
$allowedHosts=array_values(array_filter(array_map(static fn($v)=>strtolower(trim((string)$v)),(array)($localConfig['allowed_hosts']??[]))));
if($canonicalHost!=='')$allowedHosts[]=$canonicalHost;
$allowedHosts=array_values(array_unique($allowedHosts));
if(PHP_SAPI!=='cli' && $requestHost!=='' && $allowedHosts && !in_array($requestHost,$allowedHosts,true)){
    http_response_code(400);exit('Neplatný host požadavku.');
}
if(PHP_SAPI!=='cli' && IR_FORCE_HTTPS && !$isHttps && IR_PUBLIC_URL!=='' && str_starts_with(strtolower(IR_PUBLIC_URL),'https://')){
    $script=basename((string)($_SERVER['SCRIPT_NAME']??'index.php'));
    $query=(string)($_SERVER['QUERY_STRING']??'');
    header('Location: '.IR_PUBLIC_URL.'/'.$script.($query!==''?'?'.$query:''),true,301);exit;
}
if($isHttps&&!headers_sent()) header('Strict-Transport-Security: max-age=31536000');

function ir_current_user_role(): string {
    if(!ir_logged_in()) return 'guest';
    global $pdo;
    try{$st=$pdo->prepare('SELECT role FROM '.IR_AUTH_TABLE.' WHERE id=? AND is_active=1 LIMIT 1');$st->execute([(int)($_SESSION['actor_id']??ir_current_user_id())]);$role=strtolower(trim((string)($st->fetchColumn()?:'user')));return $role!==''?$role:'user';}catch(Throwable){return 'user';}
}
function ir_is_admin(): bool { return in_array(ir_current_user_role(),['admin','superadmin'],true); }
function ir_require_admin(): void { if(!ir_is_admin()){http_response_code(403);exit('Pouze pro administrátora.');} }

if(ir_logged_in()){
    /* BETA 1.0: the session is re-validated for the ACTOR (the person who logged in): active, not suspended,
       password unchanged, session not revoked (session_version). Staff/read-only work on their owner's account. */
    try{
        $actorId=(int)($_SESSION['actor_id']??ir_current_user_id());
        $st=$pdo->prepare('SELECT * FROM '.IR_AUTH_TABLE.' WHERE id=? LIMIT 1');$st->execute([$actorId]);$account=$st->fetch();
        $revoked=$account&&array_key_exists('session_version',$account)&&(int)$account['session_version']!==(int)($_SESSION['session_version']??0);
        $suspended=$account&&!empty($account['suspended_at']);
        if(!$account||!(int)$account['is_active']||$suspended||$revoked||!hash_equals(hash('sha256',(string)$account['heslo']),(string)($_SESSION['auth_password_fingerprint']??''))){$_SESSION=[];session_regenerate_id(true);ir_redirect('auth.php'.($suspended?'?suspended=1':''));}
        $_SESSION['user_name']=$account['jmeno']; $_SESSION['user_role']=$account['role'];
        if(!isset($_SESSION['actor_id']))$_SESSION['actor_id']=$actorId;
    }catch(Throwable $e){error_log('IR Next account check: '.$e->getMessage());}
}
require_once __DIR__.'/svc-core.php';
ir_guard_mutation();

function ir_icon(string $name,string $class=''): string {
    $safe=preg_replace('/[^a-z0-9\-]/','',strtolower($name));
    if($safe==='')$safe='dashboard';
    return '<svg class="ir-icon '.ir_e($class).'" aria-hidden="true"><use href="assets/icons/sprite.svg#'.ir_e($safe).'"></use></svg>';
}

function ir_visual_icon(string $name,string $class=''): string {
    $safe=preg_replace('/[^a-z0-9\-]/','',strtolower($name));
    if($safe==='') $safe='dashboard';
    $map=[
        'dashboard'=>'dashboard','animals'=>'animals','tasks'=>'calendar-doc','task'=>'calendar-doc','care'=>'care',
        'reproduction'=>'reproduction','habitat'=>'habitat','inventory'=>'inventory','finance'=>'finance',
        'other'=>'other','module'=>'other','quick-add'=>'quick-add','plus'=>'quick-add','scan'=>'scan',
        'search'=>'search','user'=>'profile','profile'=>'profile','settings'=>'settings','admin'=>'admin',
        'help'=>'help','logout'=>'logout','community'=>'animals','groups'=>'animals','calendar'=>'calendar','calendar-doc'=>'calendar-doc',
        'edit'=>'edit','delete'=>'delete','save'=>'save','view'=>'view','warning'=>'status-warning','check'=>'status-ok',
        'feeding'=>'feeding','food'=>'feeding','water'=>'water','mist'=>'mist','humidity'=>'humidity','temperature'=>'temperature','supplement'=>'supplement',
        'cleaning'=>'cleaning','health'=>'health','treatment'=>'treatment','medicine'=>'medicine','weight'=>'weight','shedding'=>'shedding','vet-record'=>'vet-record',
        'quarantine'=>'quarantine','photo'=>'photo','notification'=>'notification','clock'=>'clock-action','repeat'=>'repeat-action',
        'add'=>'add','checklist'=>'calendar-doc','task-check'=>'calendar-doc','first-aid'=>'first-aid','feces'=>'feces'
    ];
    if(!isset($map[$safe])) return ir_icon($safe,$class);
    return '<img class="ir-visual-icon '.ir_e($class).'" src="assets/icons/custom/'.ir_e($map[$safe]).'.webp" alt="" aria-hidden="true" loading="eager" decoding="async">';
}

function ir_table_exists(PDO $pdo,string $table): bool {
    static $cache=[]; if(array_key_exists($table,$cache)) return $cache[$table];
    try{$st=$pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?');$st->execute([$table]);return $cache[$table]=((int)$st->fetchColumn()>0);}catch(Throwable){return $cache[$table]=false;}
}
function ir_scalar(PDO $pdo,string $sql,array $params=[],$default=0){try{$st=$pdo->prepare($sql);$st->execute($params);$v=$st->fetchColumn();return $v===false?$default:$v;}catch(Throwable $e){error_log('IR Next scalar: '.$e->getMessage());return $default;}}

if (!function_exists('ir_db_table_exists')) { function ir_db_table_exists(PDO $pdo,string $table): bool { return ir_table_exists($pdo,$table); } }
if (!function_exists('ir_db_column_exists')) { function ir_db_column_exists(PDO $pdo,string $table,string $column): bool { static $c=[];$k=$table.'.'.$column;if(isset($c[$k]))return $c[$k];if(!preg_match('/^[A-Za-z0-9_]+$/',$table)||!preg_match('/^[A-Za-z0-9_]+$/',$column))return false;try{$q=$pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?');$q->execute([$table,$column]);return $c[$k]=(int)$q->fetchColumn()>0;}catch(Throwable){return $c[$k]=false;} } }
if (!function_exists('ir_action_owned')) { function ir_action_owned(PDO $pdo,string $table,int $uid,int $id): bool { if($id<1||!ir_db_table_exists($pdo,$table)||!ir_db_column_exists($pdo,$table,'user_id'))return false;$q=$pdo->prepare("SELECT 1 FROM `$table` WHERE id=? AND user_id=? LIMIT 1");$q->execute([$id,$uid]);return (bool)$q->fetchColumn(); } }
