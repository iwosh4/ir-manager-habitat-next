<?php
declare(strict_types=1);
/* Authenticated file delivery (attachments, documents): ownership-checked, never a direct public URL. */
require __DIR__.'/includes/config.php';
require_once __DIR__.'/includes/reptile_core.php';
require_once __DIR__.'/includes/svc-files.php';
ir_require_perm('read');
$uid = ir_current_user_id();
$f = ir_file_get($pdo, $uid, (int)($_GET['id'] ?? 0));
if (!$f) { http_response_code(404); exit('Soubor nebyl nalezen.'); }
$path = realpath(IR_ROOT.'/'.$f['stored_path']);
$root = realpath(ir_files_root());
if (!$path || !$root || !str_starts_with($path, $root.DIRECTORY_SEPARATOR) || !is_file($path)) { http_response_code(404); exit('Soubor chybí v úložišti.'); }
$inline = !empty($_GET['preview']) && ir_file_is_previewable($f);
header('Content-Type: '.$f['mime']);
header('Content-Length: '.filesize($path));
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
header('Cache-Control: private, max-age=300');
header('Content-Disposition: '.($inline ? 'inline' : 'attachment').'; filename="'.addcslashes(preg_replace('~[^\x20-\x7e]~', '_', $f['original_name']), '"\\').'"; filename*=UTF-8\'\''.rawurlencode($f['original_name']));
readfile($path);
