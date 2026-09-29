<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';
require __DIR__.'/includes/live.php';
require __DIR__.'/includes/shell.php';
require __DIR__.'/includes/reptile_core.php';

$uid=ir_current_user_id();

function ir_profile_safe_file_remove(string $relative,int $uid): void {
    $relative=trim(str_replace('\\','/',$relative));
    if($relative===''||str_contains($relative,'..')) return;
    $prefix='uploads/profile/'.$uid.'/';
    if(!str_starts_with($relative,$prefix)) return;
    $full=IR_ROOT.'/'.$relative;
    if(is_file($full)) @unlink($full);
}
function ir_profile_count(PDO $pdo,string $table,int $uid,string $extra=''): int {
    if(!ir_table_exists($pdo,$table)) return 0;
    try{$st=$pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE user_id=? {$extra}");$st->execute([$uid]);return (int)$st->fetchColumn();}catch(Throwable){return 0;}
}

if($_SERVER['REQUEST_METHOD']==='POST'){
    ir_verify_csrf();
    $action=(string)($_POST['action']??'');
    try{
        if($action==='save_account'){
            $name=trim((string)($_POST['jmeno']??''));
            $email=trim((string)($_POST['email']??''));
            $language=strtolower(trim((string)($_POST['jazyk']??'cs')));
            if(mb_strlen($name)<3||mb_strlen($name)>100) throw new RuntimeException('Uživatelské jméno musí mít 3 až 100 znaků.');
            if($email!==''&&!filter_var($email,FILTER_VALIDATE_EMAIL)) throw new RuntimeException('E-mail nemá platný formát.');
            if(!in_array($language,['cs','en','de','pl'],true)) $language='cs';
            $st=$pdo->prepare('SELECT id FROM '.IR_AUTH_TABLE.' WHERE jmeno=? AND id<>? LIMIT 1');$st->execute([$name,$uid]);
            if($st->fetchColumn()) throw new RuntimeException('Toto uživatelské jméno už používá jiný účet.');
            if($email!==''){$st=$pdo->prepare('SELECT id FROM '.IR_AUTH_TABLE.' WHERE email=? AND id<>? LIMIT 1');$st->execute([$email,$uid]);if($st->fetchColumn()) throw new RuntimeException('Tento e-mail už používá jiný účet.');}
            $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET jmeno=?,email=?,jazyk=? WHERE id=?')->execute([$name,$email!==''?$email:null,$language,$uid]);
            $_SESSION['user_name']=$name;
            ir_flash('success','Údaje účtu byly uloženy.');
        }elseif($action==='change_password'){
            $current=(string)($_POST['current_password']??'');
            $new=(string)($_POST['new_password']??'');
            $confirm=(string)($_POST['confirm_password']??'');
            $st=$pdo->prepare('SELECT heslo FROM '.IR_AUTH_TABLE.' WHERE id=? LIMIT 1');$st->execute([$uid]);$hash=(string)($st->fetchColumn()?:'');
            if($hash===''||!password_verify($current,$hash)) throw new RuntimeException('Současné heslo není správné.');
            if(strlen($new)<8) throw new RuntimeException('Nové heslo musí mít alespoň 8 znaků.');
            if($new!==$confirm) throw new RuntimeException('Nová hesla se neshodují.');
            $newHash=password_hash($new,PASSWORD_DEFAULT);
            $pdo->prepare('UPDATE '.IR_AUTH_TABLE.' SET heslo=? WHERE id=?')->execute([$newHash,$uid]);
            $_SESSION['auth_password_fingerprint']=hash('sha256',$newHash);
            ir_flash('success','Heslo bylo změněno.');
        }elseif($action==='upload_avatar'){
            if(empty($_FILES['avatar'])||!is_array($_FILES['avatar'])||($_FILES['avatar']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK) throw new RuntimeException('Vyber obrázek avatara.');
            $f=$_FILES['avatar'];
            if((int)$f['size']>5*1024*1024) throw new RuntimeException('Avatar může mít maximálně 5 MB.');
            $info=@getimagesize((string)$f['tmp_name']);
            if(!$info||empty($info['mime'])) throw new RuntimeException('Soubor není platný obrázek.');
            $map=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];$mime=(string)$info['mime'];
            if(!isset($map[$mime])) throw new RuntimeException('Povolen je JPG, PNG nebo WEBP.');
            if((int)$info[0]<80||(int)$info[1]<80) throw new RuntimeException('Avatar je příliš malý.');
            $dir=IR_ROOT.'/uploads/profile/'.$uid;if(!is_dir($dir)&&!mkdir($dir,0775,true)&&!is_dir($dir)) throw new RuntimeException('Nepodařilo se vytvořit složku pro avatar.');
            $old=ir_profile_avatar_url($uid);
            $relative='uploads/profile/'.$uid.'/avatar-'.date('Ymd-His').'-'.bin2hex(random_bytes(4)).'.'.$map[$mime];
            $absolute=IR_ROOT.'/'.$relative;
            if(!move_uploaded_file((string)$f['tmp_name'],$absolute)) throw new RuntimeException('Avatar se nepodařilo uložit.');
            $absolute=ir_optimize_image_file_webp($absolute,$mime);
            $relative=ltrim(str_replace('\\','/',substr($absolute,strlen(IR_ROOT))),'/');
            ir_user_setting_set($pdo,$uid,'profile.avatar',$relative);
            if($old!==''&&$old!==$relative) ir_profile_safe_file_remove($old,$uid);
            ir_flash('success','Avatar byl změněn.');
        }elseif($action==='remove_avatar'){
            $old=ir_profile_avatar_url($uid);ir_user_setting_delete($pdo,$uid,'profile.avatar');if($old!=='') ir_profile_safe_file_remove($old,$uid);
            ir_flash('success','Avatar byl odstraněn.');
        }
    }catch(Throwable $e){ir_flash('error',$e->getMessage());}
    ir_redirect('profile.php');
}

$st=$pdo->prepare('SELECT id,jmeno,email,jazyk,role,is_active,COALESCE(created_at,vytvoreno) AS created_at FROM '.IR_AUTH_TABLE.' WHERE id=? LIMIT 1');$st->execute([$uid]);$account=$st->fetch();
if(!$account){http_response_code(404);exit('Účet nebyl nalezen.');}
$avatar=ir_profile_avatar_url($uid);
$stats=[
    ['Zvířata',ir_profile_count($pdo,'wp_ir2_zvirata',$uid),ir_visual_icon('animals')],
    ['Ubikace',ir_profile_count($pdo,'wp_ir2_ubikace',$uid),ir_visual_icon('habitat')],
    ['Aktivní úkoly',ir_profile_count($pdo,'wp_ir2_planovac',$uid,"AND COALESCE(stav,'') NOT IN ('Hotovo','Splněno','Zrušeno')"),ir_visual_icon('tasks')],
    ['Záznamy péče',ir_profile_count($pdo,'wp_ir2_pece',$uid),ir_visual_icon('care')],
];
ir_page_start('Můj účet','other','ÚČET');echo ir_back('index.php','Zpět na přehled');
?>
<section class="account-hero panel glow-panel">
  <div class="account-avatar-large"><?php if($avatar!==''):?><img src="<?=ir_e($avatar)?>" alt="Avatar uživatele"><?php else:?><?=ir_visual_icon('profile')?><?php endif;?></div>
  <div><span class="panel-kicker">MŮJ ÚČET</span><h2><?=ir_e((string)$account['jmeno'])?></h2><p><?=ir_e((string)($account['email']?:'E-mail není nastaven'))?> · <?=($account['role']==='admin'?'Administrátor':'Chovatel')?></p></div>
  <div class="account-hero-actions"><a class="btn" href="settings.php">Nastavení aplikace</a><?php if(ir_is_admin()):?><a class="btn" href="admin.php">Admin panel</a><?php endif;?></div>
</section>
<div class="account-stat-grid"><?php foreach($stats as [$label,$value,$icon]):?><article class="account-stat-card panel glow-panel"><?=$icon?><div><strong><?=$value?></strong><span><?=ir_e($label)?></span></div></article><?php endforeach;?></div>
<section class="account-layout">
  <article class="panel glow-panel account-card">
    <header class="panel-head"><div><span class="panel-kicker">PROFIL</span><h2>Základní údaje</h2></div></header>
    <form method="post" class="form-grid two"><?=ir_csrf_field()?><input type="hidden" name="action" value="save_account">
      <label><span>Uživatelské jméno</span><input class="input" name="jmeno" value="<?=ir_e((string)$account['jmeno'])?>" required maxlength="100"></label>
      <label><span>E-mail</span><input class="input" type="email" name="email" value="<?=ir_e((string)($account['email']??''))?>" placeholder="vas@email.cz"></label>
      <label><span>Jazyk</span><select class="input" name="jazyk"><?php foreach(['cs'=>'Čeština','en'=>'English','de'=>'Deutsch','pl'=>'Polski'] as $k=>$v):?><option value="<?=$k?>" <?=($account['jazyk']===$k?'selected':'')?>><?=$v?></option><?php endforeach;?></select></label>
      <label><span>Role</span><input class="input" value="<?=($account['role']==='admin'?'Administrátor':'Chovatel')?>" readonly></label>
      <div class="form-actions"><button class="btn primary" type="submit">Uložit údaje</button></div>
    </form>
  </article>
  <article class="panel glow-panel account-card">
    <header class="panel-head"><div><span class="panel-kicker">AVATAR</span><h2>Profilová fotografie</h2></div></header>
    <div class="account-avatar-editor"><div class="account-avatar-preview"><?php if($avatar!==''):?><img src="<?=ir_e($avatar)?>" alt="Avatar"><?php else:?><?=ir_visual_icon('profile')?><?php endif;?></div><div><p>JPG, PNG nebo WEBP · maximálně 5 MB.</p><form method="post" enctype="multipart/form-data"><?=ir_csrf_field()?><input type="hidden" name="action" value="upload_avatar"><input class="input" type="file" name="avatar" accept="image/jpeg,image/png,image/webp" required><button class="btn primary" type="submit">Nahrát avatar</button></form><?php if($avatar!==''):?><form method="post" class="inline-form" onsubmit="return confirm('Odstranit avatar?')"><?=ir_csrf_field()?><input type="hidden" name="action" value="remove_avatar"><button class="btn" type="submit">Odstranit avatar</button></form><?php endif;?></div></div>
  </article>
  <article class="panel glow-panel account-card">
    <header class="panel-head"><div><span class="panel-kicker">ZABEZPEČENÍ</span><h2>Změna hesla</h2></div></header>
    <form method="post" class="form-grid"><?=ir_csrf_field()?><input type="hidden" name="action" value="change_password">
      <label><span>Současné heslo</span><input class="input" type="password" name="current_password" autocomplete="current-password" required></label>
      <label><span>Nové heslo</span><input class="input" type="password" name="new_password" autocomplete="new-password" minlength="8" required></label>
      <label><span>Nové heslo znovu</span><input class="input" type="password" name="confirm_password" autocomplete="new-password" minlength="8" required></label>
      <div class="form-actions"><button class="btn primary" type="submit">Změnit heslo</button></div>
    </form>
  </article>
  <article class="panel glow-panel account-card">
    <header class="panel-head"><div><span class="panel-kicker">SPRÁVA</span><h2>Účet a aplikace</h2></div></header>
    <div class="settings-link-grid compact-account-links"><a class="settings-link-card" href="settings.php"><?=ir_visual_icon('settings')?><div><strong>Nastavení aplikace</strong><span>Funkce, automatizace a provozní nastavení.</span></div><b>→</b></a><a class="settings-link-card" href="addons.php"><?=ir_visual_icon('other')?><div><strong>Správa doplňků</strong><span>Kontrola dostupnosti modulů a integrací.</span></div><b>→</b></a><?php if(ir_is_admin()):?><a class="settings-link-card" href="admin.php"><?=ir_visual_icon('admin')?><div><strong>Admin panel</strong><span>Uživatelé, aktivita a datové využití účtů.</span></div><b>→</b></a><?php endif;?></div>
  </article>
</section>
<?php ir_page_end();
