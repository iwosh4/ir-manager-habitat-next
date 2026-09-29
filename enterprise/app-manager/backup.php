<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';
require __DIR__.'/includes/live.php';
require __DIR__.'/includes/shell.php';
require __DIR__.'/includes/reptile_core.php';
require_once __DIR__.'/includes/user-data-schema.php';

$uid=ir_current_user_id();

const IR_BACKUP_MAX_ZIP_BYTES = 536870912;      // 512 MB compressed upload
const IR_BACKUP_MAX_TOTAL_BYTES = 2147483648;   // 2 GB expanded files
const IR_BACKUP_MAX_FILE_BYTES = 67108864;      // 64 MB per file
const IR_BACKUP_MAX_MANIFEST_BYTES = 16777216;  // 16 MB backup.json
const IR_BACKUP_MAX_FILES = 10000;
const IR_BACKUP_MAX_RATIO = 100;

function ir_backup_allowed_mimes(): array {
    return [
        'jpg'=>['image/jpeg'],'jpeg'=>['image/jpeg'],'png'=>['image/png'],'webp'=>['image/webp'],'pdf'=>['application/pdf'],
    ];
}

function ir_backup_safe_restore_path(string $rel,int $uid): bool {
    $rel=trim(str_replace('\\','/',$rel),'/');
    if($rel===''||str_contains($rel,'..')||str_contains($rel,"\0"))return false;
    foreach(explode('/',$rel) as $part)if($part===''||str_starts_with($part,'.'))return false;
    $prefixes=["uploads/animals/{$uid}/","uploads/profile/{$uid}/","uploads/users/{$uid}/","uploads/documents/{$uid}/"];
    $ok=false;foreach($prefixes as $prefix)if(str_starts_with($rel,$prefix)){$ok=true;break;}if(!$ok)return false;
    $ext=strtolower(pathinfo($rel,PATHINFO_EXTENSION));return isset(ir_backup_allowed_mimes()[$ext]);
}

function ir_backup_restore_path(string $source,int $uid): ?string {
    $source=trim(str_replace('\\','/',$source),'/');
    if($source===''||!str_starts_with($source,'uploads/')||str_contains($source,'..')||str_contains($source,"\0"))return null;
    if(ir_backup_safe_restore_path($source,$uid))return $source;
    $ext=strtolower(pathinfo($source,PATHINFO_EXTENSION));if(!isset(ir_backup_allowed_mimes()[$ext]))return null;
    $base=preg_replace('/[^A-Za-z0-9._-]/','_',basename($source));if($base===''||str_starts_with($base,'.'))return null;
    if(str_starts_with($source,'uploads/documents/'))return 'uploads/documents/'.$uid.'/legacy/'.substr(hash('sha256',$source),0,12).'-'.$base;
    return 'uploads/users/'.$uid.'/restored/'.substr(hash('sha256',$source),0,12).'-'.$base;
}

function ir_backup_prepare_payload(PDO $pdo,int $uid): array {
    $payload=[
        'format'=>'ir-manager-account-backup','version'=>3,'created_at'=>date(DATE_ATOM),'app_version'=>IR_APP_VERSION,
        'account_user_id'=>$uid,'scope'=>'same-account-same-instance','tables'=>[],'files'=>[],
    ];
    $fileMap=[];
    foreach(ir_user_data_specs($pdo) as $table=>$spec){
        $rows=ir_user_data_rows($pdo,$uid,$table,$spec);
        foreach($rows as &$row){
            foreach($row as $column=>$value){
                if(!is_string($value)||!str_starts_with(str_replace('\\','/',$value),'uploads/'))continue;
                $restore=ir_backup_restore_path($value,$uid);if($restore===null)continue;
                $source=trim(str_replace('\\','/',$value),'/');$row[$column]=$restore;$fileMap[$restore]=$source;
            }
        }unset($row);
        $payload['tables'][$table]=$rows;
    }
    // Profile avatar may be stored outside a DB reference on older installs.
    foreach((array)glob(IR_ROOT.'/uploads/profile/'.$uid.'/*.{jpg,jpeg,png,webp}',GLOB_BRACE) as $full){
        if(!is_file($full))continue;$rel=ltrim(str_replace('\\','/',substr($full,strlen(IR_ROOT))),'/');if(ir_backup_safe_restore_path($rel,$uid))$fileMap[$rel]=$rel;
    }
    foreach($fileMap as $restore=>$source)$payload['files'][]=['path'=>$restore,'source'=>$source];
    usort($payload['files'],static fn($a,$b)=>strcmp((string)$a['path'],(string)$b['path']));
    return $payload;
}

function ir_backup_columns(PDO $pdo,string $table): array {return ir_user_data_columns($pdo,$table);}

function ir_backup_zip_preflight(ZipArchive $zip,int $uid): array {
    if($zip->numFiles>IR_BACKUP_MAX_FILES+8)throw new RuntimeException('Záloha obsahuje příliš mnoho souborů.');
    $total=0;$files=0;$manifestSize=0;
    for($i=0;$i<$zip->numFiles;$i++){
        $stat=$zip->statIndex($i,ZipArchive::FL_UNCHANGED);if(!is_array($stat))throw new RuntimeException('ZIP obsahuje nečitelnou položku.');
        $name=str_replace('\\','/',(string)($stat['name']??''));if($name===''||str_starts_with($name,'/')||str_contains($name,'../')||str_contains($name,"\0"))throw new RuntimeException('ZIP obsahuje nebezpečnou cestu.');
        if(str_ends_with($name,'/'))continue;
        $size=(int)($stat['size']??0);$comp=max(1,(int)($stat['comp_size']??0));
        if($name==='backup.json'){$manifestSize=$size;if($size>IR_BACKUP_MAX_MANIFEST_BYTES)throw new RuntimeException('Manifest zálohy je příliš velký.');continue;}
        if($name==='README.txt')continue;
        if(!str_starts_with($name,'files/'))throw new RuntimeException('ZIP obsahuje nepovolenou položku.');
        $rel=substr($name,6);if(!ir_backup_safe_restore_path($rel,$uid))throw new RuntimeException('ZIP obsahuje nepovolenou cestu souboru.');
        if($size>IR_BACKUP_MAX_FILE_BYTES)throw new RuntimeException('Jeden ze souborů v záloze překračuje limit 64 MB.');
        if($size/$comp>IR_BACKUP_MAX_RATIO)throw new RuntimeException('ZIP má podezřelý kompresní poměr.');
        $total+=$size;$files++;if($total>IR_BACKUP_MAX_TOTAL_BYTES)throw new RuntimeException('Rozbalený obsah zálohy je příliš velký.');
        if(method_exists($zip,'getExternalAttributesIndex')){$opsys=0;$attr=0;if($zip->getExternalAttributesIndex($i,$opsys,$attr)){if((($attr>>16)&0170000)===0120000)throw new RuntimeException('Symbolické odkazy v záloze nejsou povoleny.');}}
    }
    if($manifestSize<=0)throw new RuntimeException('V ZIPu chybí backup.json.');
    return ['files'=>$files,'bytes'=>$total];
}

function ir_backup_validate_staged_file(string $path,string $rel): void {
    $ext=strtolower(pathinfo($rel,PATHINFO_EXTENSION));$allowed=ir_backup_allowed_mimes()[$ext]??[];if(!$allowed)throw new RuntimeException('Nepovolený typ souboru v záloze.');
    $mime=(new finfo(FILEINFO_MIME_TYPE))->file($path);if(!is_string($mime)||!in_array($mime,$allowed,true))throw new RuntimeException('Obsah souboru neodpovídá povolenému typu.');
}

function ir_backup_collision_check(PDO $pdo,int $uid,string $table,array $spec,array $rows): void {
    $columns=ir_user_data_columns($pdo,$table);if(!in_array('id',$columns,true))return;
    $kind=(string)($spec['kind']??'');if(!in_array($kind,['user_id','transport_requests'],true))return;
    foreach($rows as $row){if(!is_array($row)||empty($row['id']))continue;$id=(int)$row['id'];
        if($kind==='user_id'){$st=$pdo->prepare("SELECT user_id FROM `{$table}` WHERE id=? LIMIT 1");$st->execute([$id]);$owner=$st->fetchColumn();if($owner!==false&&(int)$owner!==$uid)throw new RuntimeException("Kolize ID v tabulce {$table}. Obnova byla bezpečně zastavena.");}
        else{$st=$pdo->prepare("SELECT owner_user_id,requester_user_id FROM `{$table}` WHERE id=? LIMIT 1");$st->execute([$id]);$existing=$st->fetch();if($existing&&$uid!==(int)$existing['owner_user_id']&&$uid!==(int)$existing['requester_user_id'])throw new RuntimeException("Kolize ID v tabulce {$table}. Obnova byla bezpečně zastavena.");}
    }
}

if($_SERVER['REQUEST_METHOD']==='POST'){
    ir_verify_csrf();$action=(string)($_POST['action']??'');
    if($action==='download'){
        if(!class_exists('ZipArchive')){ir_flash('danger','Server nemá aktivní PHP ZipArchive. Kompletní ZIP zálohu nelze vytvořit.');ir_redirect('backup.php');}
        $payload=ir_backup_prepare_payload($pdo,$uid);$tmp=tempnam(sys_get_temp_dir(),'irbackup_');$zip=new ZipArchive();if($tmp===false||$zip->open($tmp,ZipArchive::OVERWRITE)!==true)throw new RuntimeException('Zálohu se nepodařilo vytvořit.');
        $json=json_encode($payload,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE);if($json===false||strlen($json)>IR_BACKUP_MAX_MANIFEST_BYTES)throw new RuntimeException('Manifest zálohy je příliš velký.');$zip->addFromString('backup.json',$json);
        foreach($payload['files'] as $entry){$source=(string)$entry['source'];$restore=(string)$entry['path'];$full=IR_ROOT.'/'.$source;if(is_file($full)&&is_readable($full))$zip->addFile($full,'files/'.$restore);}
        $zip->addFromString('README.txt',"IR Manager account backup v3\nCreated: ".date(DATE_ATOM)."\nScope: same account / same application instance.\n");$zip->close();
        $name='ir-manager-account-backup-'.date('Y-m-d_H-i').'.zip';header('Content-Type: application/zip');header('Content-Disposition: attachment; filename="'.$name.'"');header('Content-Length: '.filesize($tmp));readfile($tmp);@unlink($tmp);exit;
    }
    if($action==='restore'){
        $zip=null;$stageDir='';
        try{
            if(!class_exists('ZipArchive'))throw new RuntimeException('Server nemá aktivní PHP ZipArchive.');
            $tmpName=(string)($_FILES['backup']['tmp_name']??'');if($tmpName===''||!is_uploaded_file($tmpName))throw new RuntimeException('Vyber ZIP zálohu IR Manageru.');
            $zipSize=(int)($_FILES['backup']['size']??0);if($zipSize<=0||$zipSize>IR_BACKUP_MAX_ZIP_BYTES)throw new RuntimeException('ZIP záloha překračuje bezpečný limit 512 MB.');
            $zip=new ZipArchive();if($zip->open($tmpName)!==true)throw new RuntimeException('ZIP zálohu nelze otevřít.');ir_backup_zip_preflight($zip,$uid);
            $raw=$zip->getFromName('backup.json');if($raw===false||strlen($raw)>IR_BACKUP_MAX_MANIFEST_BYTES)throw new RuntimeException('Manifest zálohy je neplatný.');
            $data=json_decode($raw,true,512,JSON_THROW_ON_ERROR);if(!is_array($data)||($data['format']??'')!=='ir-manager-account-backup'||(int)($data['version']??0)!==3||!is_array($data['tables']??null))throw new RuntimeException('Soubor není podporovaná záloha IR Manageru.');
            if((int)($data['account_user_id']??0)!==$uid)throw new RuntimeException('Tato záloha patří jinému účtu. Obnova napříč účty není z bezpečnostních důvodů podporována.');
            $specs=ir_user_data_specs($pdo);foreach($data['tables'] as $table=>$rows){if(isset($specs[$table])&&is_array($rows))ir_backup_collision_check($pdo,$uid,(string)$table,$specs[$table],$rows);}

            $stageDir=sys_get_temp_dir().'/ir-restore-'.bin2hex(random_bytes(8));if(!mkdir($stageDir,0700,true))throw new RuntimeException('Nelze vytvořit dočasný prostor pro kontrolu zálohy.');
            foreach((array)($data['files']??[]) as $entry){if(!is_array($entry))continue;$rel=(string)($entry['path']??'');if(!ir_backup_safe_restore_path($rel,$uid))throw new RuntimeException('Manifest obsahuje nepovolenou cestu.');$zipEntry='files/'.$rel;$idx=$zip->locateName($zipEntry);if($idx===false)continue;$stat=$zip->statIndex($idx);if(!is_array($stat)||(int)($stat['size']??0)>IR_BACKUP_MAX_FILE_BYTES)throw new RuntimeException('Soubor v záloze překračuje limit.');$stream=$zip->getStream($zipEntry);if(!$stream)throw new RuntimeException('Soubor ze zálohy nelze načíst.');$tmpFile=$stageDir.'/'.hash('sha256',$rel);$out=fopen($tmpFile,'wb');if(!$out){fclose($stream);throw new RuntimeException('Dočasný soubor nelze vytvořit.');}$copied=stream_copy_to_stream($stream,$out,IR_BACKUP_MAX_FILE_BYTES+1);fclose($out);fclose($stream);if($copied===false||$copied>IR_BACKUP_MAX_FILE_BYTES)throw new RuntimeException('Soubor v záloze překračuje limit.');ir_backup_validate_staged_file($tmpFile,$rel);}

            $pdo->beginTransaction();$fkOff=false;$inserted=0;
            try{
                $pdo->exec('SET FOREIGN_KEY_CHECKS=0');$fkOff=true;
                foreach($specs as $table=>$spec)ir_user_data_delete($pdo,$uid,$table,$spec);
                foreach($data['tables'] as $table=>$rows){if(!isset($specs[$table])||!is_array($rows))continue;$columns=ir_backup_columns($pdo,(string)$table);$columnSet=array_flip($columns);$kind=(string)($specs[$table]['kind']??'');
                    foreach($rows as $row){if(!is_array($row))continue;if($kind==='user_id')$row['user_id']=$uid;if($kind==='transport_requests'&&$uid!==(int)($row['owner_user_id']??0)&&$uid!==(int)($row['requester_user_id']??0))continue;$use=array_values(array_filter(array_keys($row),static fn($c)=>isset($columnSet[$c])));if(!$use)continue;$sql="INSERT INTO `{$table}` (`".implode('`,`',$use)."`) VALUES (".implode(',',array_fill(0,count($use),'?')).")";$pdo->prepare($sql)->execute(array_map(static fn($c)=>$row[$c],$use));$inserted++;}
                }
                $pdo->exec('SET FOREIGN_KEY_CHECKS=1');$fkOff=false;$pdo->commit();
            }catch(Throwable $e){if($fkOff)try{$pdo->exec('SET FOREIGN_KEY_CHECKS=1');}catch(Throwable){}if($pdo->inTransaction())$pdo->rollBack();throw $e;}

            $restoredFiles=0;foreach((array)($data['files']??[]) as $entry){if(!is_array($entry))continue;$rel=(string)($entry['path']??'');if(!ir_backup_safe_restore_path($rel,$uid))continue;$tmpFile=$stageDir.'/'.hash('sha256',$rel);if(!is_file($tmpFile))continue;$dest=IR_ROOT.'/'.$rel;$dir=dirname($dest);if(!is_dir($dir)&&!mkdir($dir,0750,true)&&!is_dir($dir))throw new RuntimeException('Nelze vytvořit cílovou složku příloh.');$tmpDest=$dest.'.restore-'.bin2hex(random_bytes(4));if(!copy($tmpFile,$tmpDest))throw new RuntimeException('Obnovený soubor nelze uložit.');chmod($tmpDest,0640);if(!rename($tmpDest,$dest)){@unlink($tmpDest);throw new RuntimeException('Obnovený soubor nelze aktivovat.');}$restoredFiles++;}
            $zip->close();$zip=null;
            ir_flash('success','Záloha obnovena: '.$inserted.' databázových záznamů a '.$restoredFiles.' bezpečně ověřených souborů.');ir_redirect('backup.php');
        }catch(Throwable $e){if($zip instanceof ZipArchive)@$zip->close();error_log('IR restore: '.$e->getMessage());ir_flash('danger','Obnova se nezdařila: '.$e->getMessage());ir_redirect('backup.php');}
        finally{if($stageDir!==''&&is_dir($stageDir)){foreach((array)glob($stageDir.'/*') as $f)if(is_file($f))@unlink($f);@rmdir($stageDir);}}
    }
}

$specs=ir_user_data_specs($pdo);$counts=[];foreach($specs as $table=>$spec){$n=ir_user_data_count($pdo,$uid,$table,$spec);if($n)$counts[$table]=$n;}
$payload=ir_backup_prepare_payload($pdo,$uid);$fileCount=0;$fileBytes=0;foreach($payload['files'] as $entry){$full=IR_ROOT.'/'.(string)$entry['source'];if(is_file($full)){$fileCount++;$fileBytes+=(int)(filesize($full)?:0);}}
ir_page_start('Záloha a obnova','settings');echo ir_back('settings.php','Zpět do nastavení');
?>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">KOMPLETNÍ ZÁLOHA</span><h2>Bezpečný snapshot účtu</h2></div></header>
<p class="module-intro">ZIP obsahuje databázová data aktuálního účtu a jeho dohledatelné fotografie/dokumenty. Obnova je záměrně určena pro <strong>stejný účet ve stejné instanci</strong>; nepřenáší databázová ID mezi různými účty.</p>
<div class="backup-grid"><article class="backup-card"><?=ir_visual_icon('download')?><div><strong>Stáhnout zálohu účtu</strong><p>Vytvoří ZIP s manifestem a pouze soubory navázanými na tento účet.</p><form method="post"><?=ir_csrf_field()?><input type="hidden" name="action" value="download"><button class="btn primary" type="submit">Stáhnout ZIP</button></form></div></article>
<article class="backup-card danger-zone"><?=ir_visual_icon('upload')?><div><strong>Obnovit zálohu</strong><p>ZIP se nejprve zkontroluje: velikost, cesty, typy souborů, kompresní poměr a kolize databázových ID. Teprve potom se obnovují data.</p><form method="post" enctype="multipart/form-data" onsubmit="return confirm('Opravdu nahradit současná data tohoto účtu zálohou?');"><?=ir_csrf_field()?><input type="hidden" name="action" value="restore"><input type="file" name="backup" accept="application/zip,.zip" required><button class="btn secondary" type="submit">Obnovit ze ZIP</button></form></div></article></div>
<div class="backup-summary"><strong>Obsah účtu připravený k záloze</strong><span><?=array_sum($counts)?> databázových záznamů · <?=$fileCount?> souborů · <?=number_format($fileBytes/1048576,1,',',' ')?> MB příloh</span></div></section>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">PŘENOS DAT</span><h2>Import a export v jiných formátech</h2></div></header><p>CSV/JSON je určeno pro tabulkový přenos. Není to náhrada snapshotu účtu.</p><div class="action-links"><a class="btn secondary" href="import.php">Otevřít Import / Export</a><a class="btn secondary" href="export.php?type=animals&format=csv">Zvířata CSV</a><a class="btn secondary" href="export.php?type=activities&format=csv">Aktivity CSV</a></div></section>
<?php ir_page_end();
