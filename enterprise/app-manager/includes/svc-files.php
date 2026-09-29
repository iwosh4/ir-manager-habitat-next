<?php
declare(strict_types=1);

/*
 * FILE SERVICE — real attachments for health records, animal documents, enclosures, finance.
 * Files are stored under uploads/files/<account>/<entity>/ (web access denied by .htaccess) with random
 * names, and are only served through file.php after an ownership check. MIME is sniffed from content and
 * must match the extension allow-list; executable/script content is rejected.
 */
const IR_FILE_TYPES = [
    'application/pdf' => ['pdf'],
    'image/jpeg' => ['jpg', 'jpeg'],
    'image/png' => ['png'],
    'image/webp' => ['webp'],
    'image/gif' => ['gif'],
    'image/tiff' => ['tif', 'tiff'],
    'application/dicom' => ['dcm'],
    'text/plain' => ['txt'],
    'text/csv' => ['csv'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['docx'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['xlsx'],
    'application/msword' => ['doc'],
    'application/vnd.ms-excel' => ['xls'],
    'application/zip' => ['docx', 'xlsx'], // OOXML sniffed as zip on some hosts
];
const IR_FILE_ENTITIES = ['health', 'animal', 'enclosure', 'finance', 'group'];
const IR_FILE_MAX_BYTES = 25 * 1024 * 1024;

function ir_files_root(): string { return IR_ROOT.'/uploads/files'; }

/** Ensure the protected storage directory exists (deny-all .htaccess + index guard). */
function ir_files_ensure_root(): void {
    $root = ir_files_root();
    if (!is_dir($root) && !@mkdir($root, 0755, true) && !is_dir($root)) throw new RuntimeException('Úložiště souborů nelze vytvořit (oprávnění uploads/).');
    if (!is_file($root.'/.htaccess')) @file_put_contents($root.'/.htaccess', "Options -Indexes\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n");
}

/** Validate + store an uploaded file ($_FILES item). Returns the new wp_ir2_files id. */
function ir_file_store(PDO $pdo, int $uid, string $entity, int $entityId, array $file, string $kind = '', string $note = ''): int {
    if (!in_array($entity, IR_FILE_ENTITIES, true) || $entityId < 1) throw new RuntimeException('Neplatný cíl přílohy.');
    $err = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($err !== UPLOAD_ERR_OK) throw new RuntimeException(match ($err) { UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Soubor je příliš velký.', UPLOAD_ERR_NO_FILE => 'Nebyl vybrán žádný soubor.', default => 'Nahrání souboru selhalo (kód '.$err.').' });
    $size = (int)($file['size'] ?? 0);
    if ($size <= 0) throw new RuntimeException('Soubor je prázdný.');
    if ($size > IR_FILE_MAX_BYTES) throw new RuntimeException('Soubor je příliš velký (max. 25 MB).');
    $tmp = (string)($file['tmp_name'] ?? '');
    if (!is_uploaded_file($tmp) && !(defined('IR_TESTING') && is_file($tmp))) throw new RuntimeException('Neplatný upload.');
    $orig = preg_replace('~[^\pL\pN ._()\-]+~u', '_', basename((string)($file['name'] ?? 'soubor'))) ?: 'soubor';
    $orig = mb_substr($orig, 0, 180);
    $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
    $mime = (string)((new finfo(FILEINFO_MIME_TYPE))->file($tmp) ?: '');
    if (!isset(IR_FILE_TYPES[$mime]) || !in_array($ext, IR_FILE_TYPES[$mime], true)) throw new RuntimeException('Nepovolený typ souboru ('.($ext ?: '?').', '.$mime.'). Povoleno: PDF, obrázky (JPG, PNG, WEBP, GIF, TIFF), DICOM, TXT/CSV, DOC(X), XLS(X).');
    // defence in depth: no scripts hiding in "documents"
    $head = (string)file_get_contents($tmp, false, null, 0, 4096);
    if (preg_match('~<\?php|<\?=|<script\b|#!/~i', $head) && !in_array($mime, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff'], true)) throw new RuntimeException('Soubor obsahuje spustitelný obsah a nebyl přijat.');
    if (str_starts_with($mime, 'text/') && preg_match('~<\?php|<\?=~', (string)file_get_contents($tmp))) throw new RuntimeException('Soubor obsahuje spustitelný obsah a nebyl přijat.');
    ir_files_ensure_root();
    $dir = ir_files_root().'/'.$uid.'/'.$entity;
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) throw new RuntimeException('Adresář přílohy nelze vytvořit.');
    $name = date('Ymd-His').'-'.bin2hex(random_bytes(8)).'.'.$ext;
    $dest = $dir.'/'.$name;
    $moved = is_uploaded_file($tmp) ? move_uploaded_file($tmp, $dest) : copy($tmp, $dest);
    if (!$moved) throw new RuntimeException('Soubor nelze uložit.');
    @chmod($dest, 0644);
    $sha = hash_file('sha256', $dest);
    $rel = 'uploads/files/'.$uid.'/'.$entity.'/'.$name;
    $pdo->prepare('INSERT INTO wp_ir2_files(user_id,entity,entity_id,kind,original_name,stored_path,mime,size_bytes,sha256,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,NOW())')
        ->execute([$uid, $entity, $entityId, $kind !== '' ? mb_substr($kind, 0, 40) : null, $orig, $rel, $mime, filesize($dest), $sha, $note !== '' ? mb_substr($note, 0, 255) : null]);
    $id = (int)$pdo->lastInsertId();
    ir_audit($pdo, 'file', $id, 'upload', null, ['entity' => $entity, 'entity_id' => $entityId, 'name' => $orig, 'mime' => $mime, 'size' => filesize($dest)]);
    return $id;
}

/** Files attached to an entity (live only). */
function ir_files_for(PDO $pdo, int $uid, string $entity, int $entityId): array {
    if (!ir_table_exists($pdo, 'wp_ir2_files')) return [];
    $q = $pdo->prepare('SELECT * FROM wp_ir2_files WHERE user_id=? AND entity=? AND entity_id=? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC');
    $q->execute([$uid, $entity, $entityId]);
    return $q->fetchAll() ?: [];
}
function ir_file_get(PDO $pdo, int $uid, int $id): ?array {
    if (!ir_table_exists($pdo, 'wp_ir2_files')) return null;
    $q = $pdo->prepare('SELECT * FROM wp_ir2_files WHERE user_id=? AND id=? AND deleted_at IS NULL LIMIT 1');
    $q->execute([$uid, $id]);
    return $q->fetch() ?: null;
}
/** Soft delete (file stays on disk + in DB for recovery; hidden from UI). */
function ir_file_delete(PDO $pdo, int $uid, int $id): void {
    $f = ir_file_get($pdo, $uid, $id); if (!$f) return;
    $pdo->prepare('UPDATE wp_ir2_files SET deleted_at=NOW() WHERE user_id=? AND id=?')->execute([$uid, $id]);
    ir_audit($pdo, 'file', $id, 'delete', $f, null);
}
function ir_file_is_previewable(array $f): bool { return in_array((string)$f['mime'], ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/plain'], true); }
function ir_human_size(int $b): string { return $b >= 1048576 ? number_format($b / 1048576, 1, ',', ' ').' MB' : ($b >= 1024 ? number_format($b / 1024, 0, ',', ' ').' kB' : $b.' B'); }
/** Storage usage of an account in bytes (plan quota + admin overview). */
function ir_storage_used(PDO $pdo, int $uid): int {
    $n = 0;
    if (ir_table_exists($pdo, 'wp_ir2_files')) $n += (int)ir_scalar($pdo, 'SELECT COALESCE(SUM(size_bytes),0) FROM wp_ir2_files WHERE user_id=? AND deleted_at IS NULL', [$uid], 0);
    foreach (['animals', 'profile', 'pedigree'] as $d) {
        $dir = IR_ROOT.'/uploads/'.$d.'/'.$uid;
        if (is_dir($dir)) foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $f) $n += $f->getSize();
    }
    return $n;
}
/** Plan storage quota check before an upload. */
function ir_storage_block(PDO $pdo, int $uid, int $adding): ?string {
    $mb = (int)(ir_entitlement($pdo, $uid)['plan']['storage_mb'] ?? 200);
    if (in_array(ir_role(), ['superadmin', 'admin'], true) || $mb <= 0) return null;
    return ir_storage_used($pdo, $uid) + $adding > $mb * 1048576 ? 'Úložiště tarifu ('.$mb.' MB) je plné. Existující soubory zůstávají dostupné; pro další nahrávání uvolněte místo nebo zvyšte tarif.' : null;
}
