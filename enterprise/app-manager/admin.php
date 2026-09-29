<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';
ir_require_admin();
require __DIR__.'/includes/live.php';
require __DIR__.'/includes/shell.php';
require __DIR__.'/includes/reptile_core.php';
require_once __DIR__.'/includes/user-data-schema.php';

function ir_admin_user_tables(PDO $pdo): array { return array_keys(ir_user_data_specs($pdo)); }
function ir_admin_user_columns(PDO $pdo,string $table): array { return ir_user_data_columns($pdo,$table); }
function ir_admin_count(PDO $pdo,string $table,int $uid,string $extra=''): int {
    $specs=ir_user_data_specs($pdo);if(!isset($specs[$table]))return 0;
    if($extra!==''&&($specs[$table]['kind']??'')==='user_id'){try{$st=$pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE user_id=? {$extra}");$st->execute([$uid]);return (int)$st->fetchColumn();}catch(Throwable){return 0;}}
    return ir_user_data_count($pdo,$uid,$table,$specs[$table]);
}
function ir_admin_record_count(PDO $pdo,int $uid,array $tables): int { $n=0;$specs=ir_user_data_specs($pdo);foreach($tables as $t)if(isset($specs[$t]))$n+=ir_user_data_count($pdo,$uid,$t,$specs[$t]);return $n; }
function ir_admin_upload_refs(PDO $pdo,int $uid,array $tables): array {
    $refs=[];
    foreach($tables as $t){
        $cols=ir_admin_user_columns($pdo,$t);$pathCols=array_values(array_filter($cols,static fn($c)=>(bool)preg_match('/(foto|soubor|file|path|avatar|priloha|obrazek)/i',(string)$c)));
        if(!$pathCols)continue;
        $safeCols=[];foreach($pathCols as $c)if(preg_match('/^[A-Za-z0-9_]+$/D',$c))$safeCols[]='`'.$c.'`';
        if(!$safeCols)continue;
        try{$st=$pdo->prepare('SELECT '.implode(',',$safeCols).' FROM `'.$t.'` WHERE user_id=?');$st->execute([$uid]);foreach($st as $row)foreach($row as $v){if(!is_string($v))continue;$v=trim(str_replace('\\','/',$v));if($v!==''&&!str_contains($v,'..')&&str_starts_with($v,'uploads/'))$refs[$v]=true;}}catch(Throwable){}
    }
    $dir=IR_ROOT.'/uploads/profile/'.$uid;if(is_dir($dir))foreach(new DirectoryIterator($dir) as $f)if($f->isFile())$refs['uploads/profile/'.$uid.'/'.$f->getFilename()]=true;
    return array_keys($refs);
}
function ir_admin_file_usage(int $uid,array $refs): array {
    $bytes=0;$count=0;
    foreach($refs as $rel){$full=IR_ROOT.'/'.ltrim($rel,'/');if(is_file($full)){$bytes+=(int)(filesize($full)?:0);$count++;}}
    return [$count,$bytes];
}
function ir_admin_bytes(int $bytes): string {
    if($bytes<1024)return $bytes.' B';if($bytes<1048576)return number_format($bytes/1024,1,',',' ').' KB';if($bytes<1073741824)return number_format($bytes/1048576,1,',',' ').' MB';return number_format($bytes/1073741824,2,',',' ').' GB';
}
function ir_admin_last_activity(PDO $pdo,int $uid): string {
    if(!ir_table_exists($pdo,'wp_ir2_pece'))return '—';try{$st=$pdo->prepare('SELECT MAX(datum) FROM wp_ir2_pece WHERE user_id=?');$st->execute([$uid]);$v=(string)($st->fetchColumn()?:'');return $v!==''?date('d.m.Y H:i',strtotime($v)):'—';}catch(Throwable){return '—';}
}
function ir_admin_active_admins(PDO $pdo): int {try{return (int)$pdo->query("SELECT COUNT(*) FROM ".IR_AUTH_TABLE." WHERE role='admin' AND is_active=1")->fetchColumn();}catch(Throwable){return 0;}}
function ir_admin_remove_file(string $rel): void {$rel=trim(str_replace('\\','/',$rel));if($rel===''||str_contains($rel,'..')||!str_starts_with($rel,'uploads/'))return;$full=IR_ROOT.'/'.$rel;$uploads=realpath(IR_ROOT.'/uploads');$parent=realpath(dirname($full));if($uploads&&$parent&&str_starts_with($parent,$uploads)&&is_file($full))@unlink($full);}
function ir_admin_remove_dir(string $dir): void {if(!is_dir($dir))return;$it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);foreach($it as $f){$f->isDir()?@rmdir($f->getPathname()):@unlink($f->getPathname());}@rmdir($dir);}

$tables=ir_admin_user_tables($pdo);
if($_SERVER['REQUEST_METHOD']==='POST'){
    ir_verify_csrf();$action=(string)($_POST['action']??'');$target=(int)($_POST['user_id']??0);
    try{
        if($target<=0)throw new RuntimeException('Neplatný účet.');
        $st=$pdo->prepare('SELECT id,jmeno,role,is_active FROM '.IR_AUTH_TABLE.' WHERE id=? LIMIT 1');$st->execute([$target]);$targetUser=$st->fetch();if(!$targetUser)throw new RuntimeException('Účet nebyl nalezen.');
        if($action==='toggle_active'){
            if($target===ir_current_user_id())throw new RuntimeException('Vlastní aktivní účet nelze deaktivovat z této stránky.');
            $new=(int)$targetUser['is_active']?0:1;
            if(!$new&&$targetUser['role']==='admin'&&ir_admin_active_admins($pdo)<=1)throw new RuntimeException('Poslední aktivní administrátor nesmí být deaktivován.');
            $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET is_active=? WHERE id=?')->execute([$new,$target]);
            ir_flash('success',$new?'Účet byl aktivován.':'Účet byl deaktivován.');
        }elseif($action==='set_role'){
            $role=(string)($_POST['role']??'user');if(!in_array($role,['user','admin'],true))$role='user';
            if($targetUser['role']==='admin'&&$role!=='admin'&&(int)$targetUser['is_active']===1&&ir_admin_active_admins($pdo)<=1)throw new RuntimeException('Poslední aktivní administrátor musí zůstat administrátorem.');
            $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET role=? WHERE id=?')->execute([$role,$target]);ir_flash('success','Role účtu byla změněna.');
        }elseif($action==='delete_user'){
            if($target===ir_current_user_id())throw new RuntimeException('Aktuálně přihlášený účet nelze smazat.');
            if($targetUser['role']==='admin'&&(int)$targetUser['is_active']===1&&ir_admin_active_admins($pdo)<=1)throw new RuntimeException('Poslední aktivní administrátor nesmí být smazán.');
            if((string)($_POST['confirm_delete']??'')!=='SMAZAT')throw new RuntimeException('Pro úplné smazání napiš potvrzení SMAZAT.');
            $refs=ir_admin_upload_refs($pdo,$target,$tables);
            $pdo->beginTransaction();$fkOff=false;
            try{$pdo->exec('SET FOREIGN_KEY_CHECKS=0');$fkOff=true;$specs=ir_user_data_specs($pdo);foreach($specs as $t=>$spec)ir_user_data_delete($pdo,$target,$t,$spec);$pdo->prepare('DELETE FROM '.IR_AUTH_TABLE.' WHERE id=?')->execute([$target]);$pdo->exec('SET FOREIGN_KEY_CHECKS=1');$fkOff=false;$pdo->commit();}catch(Throwable $e){if($fkOff)try{$pdo->exec('SET FOREIGN_KEY_CHECKS=1');}catch(Throwable){}if($pdo->inTransaction())$pdo->rollBack();throw $e;}
            foreach($refs as $rel)ir_admin_remove_file($rel);ir_admin_remove_dir(IR_ROOT.'/uploads/profile/'.$target);ir_admin_remove_dir(IR_ROOT.'/uploads/users/'.$target);ir_admin_remove_dir(IR_ROOT.'/uploads/animals/'.$target);
            ir_flash('success','Účet a jeho uživatelská data byly úplně odstraněny.');
        }
    }catch(Throwable $e){ir_flash('error',$e->getMessage());}
    ir_redirect('admin.php');
}

$users=$pdo->query('SELECT id,jmeno,email,jazyk,role,is_active,COALESCE(created_at,vytvoreno) AS created_at FROM '.IR_AUTH_TABLE.' ORDER BY is_active DESC,role DESC,jmeno')->fetchAll();
$recentActivity=[];if(ir_table_exists($pdo,'wp_ir2_pece')){try{$recentActivity=$pdo->query('SELECT p.user_id,p.typ,p.datum,u.jmeno FROM wp_ir2_pece p LEFT JOIN '.IR_AUTH_TABLE.' u ON u.id=p.user_id ORDER BY p.datum DESC LIMIT 10')->fetchAll();}catch(Throwable){$recentActivity=[];}}
$cards=[];$totalRecords=0;$totalBytes=0;$activeCount=0;
foreach($users as $u){$id=(int)$u['id'];$refs=ir_admin_upload_refs($pdo,$id,$tables);[$fileCount,$bytes]=ir_admin_file_usage($id,$refs);$records=ir_admin_record_count($pdo,$id,$tables);$totalRecords+=$records;$totalBytes+=$bytes;if((int)$u['is_active'])$activeCount++;$cards[]=['user'=>$u,'records'=>$records,'files'=>$fileCount,'bytes'=>$bytes,'animals'=>ir_admin_count($pdo,'wp_ir2_zvirata',$id),'habitats'=>ir_admin_count($pdo,'wp_ir2_ubikace',$id),'tasks'=>ir_admin_count($pdo,'wp_ir2_planovac',$id,"AND COALESCE(stav,'') NOT IN ('Hotovo','Splněno','Zrušeno')"),'care'=>ir_admin_count($pdo,'wp_ir2_pece',$id),'last'=>ir_admin_last_activity($pdo,$id)];}

ir_page_start('Admin panel','other','ADMINISTRACE');echo ir_back('settings.php','Zpět do nastavení');
?>
<section class="panel glow-panel admin-overview"><header class="panel-head"><div><span class="panel-kicker">ADMINISTRACE</span><h2>Správa uživatelů a dat</h2></div></header><div class="admin-overview-grid"><article><strong><?=count($users)?></strong><span>účtů celkem</span></article><article><strong><?=$activeCount?></strong><span>aktivních účtů</span></article><article><strong><?=number_format($totalRecords,0,',',' ')?></strong><span>uživatelských DB záznamů</span></article><article><strong><?=ir_admin_bytes($totalBytes)?></strong><span>nalezených příloh a avatarů</span></article></div></section>
<?php if($recentActivity):?><section class="panel glow-panel admin-recent"><header class="panel-head"><div><span class="panel-kicker">AKTIVITA</span><h2>Poslední záznamy napříč účty</h2></div></header><div class="admin-recent-list"><?php foreach($recentActivity as $r):?><div><span><?=ir_visual_icon('care')?></span><strong><?=ir_e((string)($r['jmeno']?:'Uživatel'))?></strong><em><?=ir_e((string)$r['typ'])?></em><time><?=date('d.m.Y H:i',strtotime((string)$r['datum']))?></time></div><?php endforeach;?></div></section><?php endif;?>
<section class="admin-user-list">
<?php foreach($cards as $c):$u=$c['user'];$id=(int)$u['id'];$active=(int)$u['is_active']===1;?>
<article class="panel glow-panel admin-user-card">
 <header><div class="admin-user-identity"><?=ir_header_avatar_html($id,'admin-user-avatar')?><div><strong><?=ir_e((string)$u['jmeno'])?></strong><span><?=ir_e((string)($u['email']?:'bez e-mailu'))?></span></div></div><div class="admin-user-badges"><span class="status-pill <?=$active?'is-ok':'is-off'?>"><?=$active?'Aktivní':'Deaktivovaný'?></span><span class="status-pill is-role"><?=($u['role']==='admin'?'Administrátor':'Chovatel')?></span></div></header>
 <div class="admin-user-metrics"><div><b><?=$c['animals']?></b><span>Zvířata</span></div><div><b><?=$c['habitats']?></b><span>Ubikace</span></div><div><b><?=$c['tasks']?></b><span>Aktivní úkoly</span></div><div><b><?=$c['care']?></b><span>Péče</span></div><div><b><?=number_format($c['records'],0,',',' ')?></b><span>DB záznamy</span></div><div><b><?=ir_admin_bytes($c['bytes'])?></b><span><?=$c['files']?> souborů</span></div></div>
 <div class="admin-user-meta"><span>Poslední aktivita: <strong><?=ir_e($c['last'])?></strong></span><span>Účet od: <strong><?=!empty($u['created_at'])?date('d.m.Y',strtotime((string)$u['created_at'])):'—'?></strong></span></div>
 <div class="admin-user-actions">
  <form method="post"><?=ir_csrf_field()?><input type="hidden" name="action" value="set_role"><input type="hidden" name="user_id" value="<?=$id?>"><select class="input" name="role"><option value="user" <?=$u['role']==='user'?'selected':''?>>Chovatel</option><option value="admin" <?=$u['role']==='admin'?'selected':''?>>Administrátor</option></select><button class="btn" type="submit">Uložit roli</button></form>
  <?php if($id!==ir_current_user_id()):?><form method="post"><?=ir_csrf_field()?><input type="hidden" name="action" value="toggle_active"><input type="hidden" name="user_id" value="<?=$id?>"><button class="btn <?=$active?'danger-soft':'primary'?>" type="submit"><?=$active?'Deaktivovat':'Aktivovat'?></button></form><?php endif;?>
  <?php if($id!==ir_current_user_id()):?><form method="post" class="admin-delete-form" onsubmit="return confirm('Opravdu úplně smazat účet a jeho data? Tuto akci nelze vrátit.')"><?=ir_csrf_field()?><input type="hidden" name="action" value="delete_user"><input type="hidden" name="user_id" value="<?=$id?>"><input class="input" name="confirm_delete" placeholder="Napiš SMAZAT" autocomplete="off"><button class="btn danger" type="submit">Úplně smazat</button></form><?php endif;?>
 </div>
</article>
<?php endforeach;?></section>
<p class="admin-data-note">Využití dat zobrazuje počet uživatelských databázových záznamů a velikost souborů, které jsou v databázi nebo uživatelských složkách skutečně dohledatelné. Nejde o odhad velikosti databázových indexů.</p>
<?php ir_page_end();
