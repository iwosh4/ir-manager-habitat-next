<?php
declare(strict_types=1);
require_once __DIR__.'/live.php';
require_once __DIR__.'/workspace.php';
require_once __DIR__.'/record-detail.php';

function ir_nav_items(): array {
    return [
        ['dashboard','Dashboard','dashboard','index.php',[]],
        ['animals','Zvířata','animals','animals.php',[
            ['Přehled zvířat','animals.php','animals'],
            ['Karanténa / léčba','animals.php?view=quarantine','quarantine'],
            ['Prodáno','animals.php?view=sold','finance'],
            ['Uhynulo / archiv','animals.php?view=archive','health'],
            ['Skupiny','animals.php?view=groups','groups'],
        ]],
        ['tasks','Úkoly & péče','tasks','tasks.php',[
            ['Dnes','tasks.php?view=today','calendar'],
            ['Plánovač','tasks.php','calendar-doc'],
            ['Rychlá péče','quick.php','care'],
            ['Suplementace','supplements.php','supplement'],
        ]],
        ['care','Zdraví','health','health.php',[
            ['Přehled','health.php','health'],
            ['Záznamy','activities.php?type=Zdravotní%20kontrola','vet-record'],
        ]],
        ['reproduction','Reprodukce','reproduction','clutches.php',[
            ['Přehled','clutches.php','reproduction'],
            ['Cykly & snůšky','clutches.php','calendar'],
            ['Genetická kalkulačka','genetics.php','reproduction'],
        ]],
        ['habitat','Ubikace','habitat','habitats.php',[
            ['Přehled','habitats.php?view=overview','habitat'],
            ['Nová ubikace','habitats.php?view=new','add'],
            ['Sestavy','habitats.php?view=assemblies','inventory'],
            ['Habitat Studio','habitat-studio.php','habitat'],
        ]],
        ['inventory','Sklad','inventory','inventory.php',[
            ['Přehled','inventory.php','inventory'],
            ['Položky','inventory.php#items','checklist'],
        ]],
        ['finance','Finance','finance','finance.php',[
            ['Přehled','finance.php','finance'],
            ['Záznamy','finance.php#records','calendar-doc'],
        ]],
        ['other','Ostatní','other','reports.php',[
            ['Adresář','contacts.php','profile'],
            ['Dokumenty','documents.php','calendar-doc'],
            ['Burzy & akce','events.php','calendar'],
            ['Reporty','reports.php','dashboard'],
            ['Import / Export','import.php','save'],
        ]],
    ];
}

function ir_task_icon_key(array $task): string {
    return ir_activity_icon_key('task',(string)($task['kategorie']??$task['nazev_ukolu']??''));
}
function ir_time_label(?string $value): string {
    $v=trim((string)$value); if($v==='') return '—'; return substr($v,0,5);
}
function ir_recent_time_label(string $value): string {
    $ts=strtotime($value); if(!$ts) return '';
    $today=date('Y-m-d'); $day=date('Y-m-d',$ts);
    if($day===$today) return 'Dnes '.date('H:i',$ts);
    if($day===date('Y-m-d',strtotime('-1 day'))) return 'Včera '.date('H:i',$ts);
    return date('d.m. H:i',$ts);
}
function ir_render_sidebar(string $active): void {
    $user=ir_current_user_name() ?: 'Uživatel';
    echo '<aside class="app-sidebar" data-sidebar>';
    echo '<a class="sidebar-brand" href="index.php"><img src="assets/img/ir-logo-mark.webp" alt=""><span><strong>IR MANAGER</strong><small>TERARISTIKA</small></span></a>';
    echo '<nav class="sidebar-nav">';
    foreach(ir_nav_items() as [$key,$label,$icon,$href,$subs]){
        $is=$active===$key?' is-active':'';
        if($subs){
            $expanded=$active===$key?'true':'false';
            echo '<div class="nav-group'.$is.'" data-nav-group><a class="nav-main'.$is.'" href="'.ir_e($href).'">'.ir_visual_icon(['tasks'=>'tasks','other'=>'other'][$icon]??$icon,'nav-visual-icon').'<span>'.ir_e($label).'</span></a><button class="nav-expand" type="button" aria-label="Rozbalit '.ir_e($label).'" aria-controls="nav-'.ir_e($key).'" aria-expanded="'.$expanded.'">'.ir_icon('chevron-down').'</button><div class="nav-sub" id="nav-'.ir_e($key).'">';
            foreach($subs as $sub){
                [$slabel,$shref,$sicon]=array_pad($sub,3,'');
                echo '<a href="'.ir_e((string)$shref).'">'.($sicon!==''?ir_visual_icon((string)$sicon,'nav-sub-icon'):'').'<span>'.ir_e((string)$slabel).'</span></a>';
            }
            echo '</div></div>';
        } else {
            echo '<a class="nav-main'.$is.'" href="'.ir_e($href).'">'.ir_visual_icon(['tasks'=>'tasks','other'=>'other'][$icon]??$icon,'nav-visual-icon').'<span>'.ir_e($label).'</span></a>';
        }
    }
    echo '</nav>';
    echo '</aside>';
}

function ir_profile_avatar_url(?int $uid=null): string {
    global $pdo;
    $uid=$uid??ir_current_user_id(); if($uid<=0) return '';
    $relative='';
    try{
        $st=$pdo->prepare("SELECT setting_value FROM wp_ir2_user_settings WHERE user_id=? AND setting_key='profile.avatar' LIMIT 1");
        $st->execute([$uid]); $relative=trim((string)($st->fetchColumn()?:''));
    }catch(Throwable){}
    $allowed=['uploads/profile/'.$uid.'/','uploads/users/'.$uid.'/'];
    $valid=function(string $rel) use($allowed): bool {
        if($rel===''||str_contains($rel,'..')) return false;
        foreach($allowed as $prefix) if(str_starts_with($rel,$prefix)) return is_file(IR_ROOT.'/'.$rel);
        return false;
    };
    if($valid($relative)) return $relative;
    $legacy=[];
    foreach(['jpg','jpeg','png','webp'] as $ext) foreach((array)glob(IR_ROOT.'/uploads/profile/'.$uid.'/*.'.$ext) as $file) $legacy[]=$file;
    if($legacy){usort($legacy,static fn($a,$b)=>(filemtime($b)?:0)<=>(filemtime($a)?:0));$file=$legacy[0];return ltrim(str_replace('\\','/',substr($file,strlen(IR_ROOT))),'/');}
    return '';
}
function ir_header_avatar_html(int $uid,string $class='header-profile-avatar'): string {
    $url=ir_profile_avatar_url($uid);
    if($url!=='') return '<span class="'.ir_e($class).' has-photo"><img src="'.ir_e($url).'" alt=""></span>';
    return '<span class="'.ir_e($class).'">'.ir_visual_icon('profile').'</span>';
}
function ir_render_header_profile(): void {
    $user=ir_current_user_name() ?: 'Uživatel'; $uid=ir_current_user_id();
    echo '<div class="header-profile-wrap"><button type="button" class="header-profile" data-header-profile-toggle aria-label="Účet uživatele" aria-expanded="false" aria-controls="header-profile-menu">'.ir_header_avatar_html($uid).'<span><strong>'.ir_e($user).'</strong><small>'.(ir_is_admin()?'Administrátor':'Chovatel').'</small></span>'.ir_icon('chevron-down').'</button>';
    echo '<div id="header-profile-menu" class="header-profile-menu" data-header-profile-menu hidden>';
    echo '<a href="profile.php">'.ir_visual_icon('profile').'<span>Můj účet</span></a>';
    echo '<a href="settings.php">'.ir_visual_icon('settings').'<span>Nastavení aplikace</span></a>';
    echo '<a href="addons.php">'.ir_visual_icon('other').'<span>Správa doplňků</span></a>';
    if(ir_is_admin()) echo '<a href="admin.php">'.ir_visual_icon('admin').'<span>Admin panel</span></a>';
    echo '<form method="post" action="auth.php">'.ir_csrf_field().'<input type="hidden" name="action" value="logout"><button type="submit">'.ir_visual_icon('logout').'<span>Odhlásit se</span></button></form>';
    echo '</div></div>';
}

function ir_render_fixed_header(): void {
    global $ir_stats;
    ?>
    <header class="global-header">
      <div class="header-caiman" aria-hidden="true"><img src="assets/img/caiman-hero.webp" alt=""></div>
      <div class="global-header-top">
        <button class="mobile-nav-toggle" type="button" aria-label="Otevřít navigaci" aria-expanded="false" data-mobile-nav><?=ir_icon('menu')?></button>
        <a class="mobile-brand" href="index.php" aria-label="IR Manager – domů"><img src="assets/img/ir-logo-mark.webp" alt=""><span><strong>IR MANAGER</strong><small><span data-live-date><?=ir_e(date('d.m.Y'))?></span><b data-live-clock><?=ir_e(date('H:i'))?></b></small></span></a>
        <div class="mobile-header-tools" aria-label="Mobilní nástroje"><a href="search.php" aria-label="Vyhledávání"><?=ir_visual_icon('search')?></a><a href="voice.php" aria-label="Hlasový asistent"><?=ir_icon('mic')?></a></div>
        <div class="header-action-cluster" aria-label="Rychlé akce">
          <a class="header-action is-primary" href="quick.php" aria-label="Přidat záznam" title="Přidat záznam"><?=ir_visual_icon('quick-add')?><span>Přidat záznam</span></a>
          <a class="header-action" href="scan.php" aria-label="Skenovat QR" title="Skenovat QR"><?=ir_visual_icon('scan')?><span>Skenovat QR</span></a>
          <a class="header-action" href="voice.php" aria-label="Hlasový vstup" title="Hlasový vstup"><?=ir_icon('mic')?><span>Hlasový vstup</span></a>
        </div>
        <form class="global-search" action="search.php" method="get"><?=ir_visual_icon('search')?><input name="q" placeholder="Hledat zvíře, druh, ubikaci, úkol…" autocomplete="off"><kbd>Ctrl + K</kbd></form>
        <div class="header-datetime" aria-label="Datum a čas"><span class="header-date" data-live-date><?=ir_e(date('d.m.Y'))?></span><strong class="header-time" data-live-clock><?=ir_e(date('H:i'))?></strong></div>
        <div class="notification-wrap">
          <button type="button" class="header-notification" data-notification-toggle aria-label="Oznámení" aria-expanded="false" aria-controls="notification-panel">
            <?=ir_visual_icon('notification')?>
            <?php $unread=(int)ir_scalar($GLOBALS['pdo'],'SELECT COUNT(*) FROM wp_ir2_notifikace WHERE user_id=? AND precteno=0',[ir_current_user_id()],0); ?>
            <span class="notification-badge" <?=$unread?'':'hidden'?>><?=$unread>99?'99+':$unread?></span>
          </button>
          <section id="notification-panel" class="notification-panel panel" data-notification-panel data-csrf="<?=ir_e(ir_csrf_token())?>" hidden><header><strong>Oznámení</strong><button type="button" data-notification-refresh>Obnovit</button></header><div data-notification-list aria-live="polite"></div></section>
        </div>
        <div class="global-header-account"><?php ir_render_header_profile(); ?></div>
      </div>
    </header>
    <?php
}

function ir_render_mobile_bottom_nav(string $active): void {
    $moreActive=!in_array($active,['dashboard','animals','tasks'],true);
    echo '<nav class="mobile-bottom-nav" aria-label="Hlavní mobilní navigace">';
    echo '<a class="'.($active==='dashboard'?'is-active':'').'" href="index.php">'.ir_icon('dashboard').'<span>Domů</span></a>';
    echo '<a class="'.($active==='animals'?'is-active':'').'" href="animals.php">'.ir_visual_icon('animals').'<span>Zvířata</span></a>';
    echo '<a class="mobile-bottom-plus" href="quick.php" aria-label="Rychlý záznam">'.ir_icon('plus').'</a>';
    echo '<a class="'.($active==='tasks'?'is-active':'').'" href="tasks.php">'.ir_visual_icon('tasks').'<span>Úkoly</span></a>';
    echo '<button type="button" class="'.($moreActive?'is-active':'').'" data-mobile-nav aria-label="Více modulů" aria-expanded="false">'.ir_icon('more').'<span>Více</span></button>';
    echo '</nav>';
}

function ir_page_start(string $title,string $active='dashboard',string $eyebrow='IR MANAGER',array $actions=[]): void {
    ?><!doctype html><html lang="cs"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <meta name="theme-color" content="#070a0c"><meta name="color-scheme" content="dark">
    <title><?=ir_e($title)?> · IR Manager</title>
    <link rel="icon" href="favicon.ico" sizes="any"><link rel="apple-touch-icon" href="apple-touch-icon.png"><link rel="manifest" href="manifest.webmanifest">
    <link rel="stylesheet" href="assets/css/core.css?v=65.0">
    <link rel="stylesheet" href="assets/css/workspace.css?v=65.0"><link rel="stylesheet" href="assets/css/compact.css?v=65.0"><link rel="stylesheet" href="assets/css/visual-lock.css?v=65.0"><link rel="stylesheet" href="assets/css/premium-ui.css?v=65.0"><link rel="stylesheet" href="assets/css/lock063.css?v=65.0"><link rel="stylesheet" href="assets/css/lock064.css?v=65.0"><link rel="stylesheet" href="assets/css/security065.css?v=65.0"><link rel="stylesheet" href="assets/css/beta1.css?v=b1.0"></head><body data-active-module="<?=ir_e($active)?>"><div class="app-shell"><?php ir_render_sidebar($active); ?><div class="app-stage"><?php ir_render_fixed_header(); ir_render_mobile_bottom_nav($active); ?><main class="app-main" data-page-title="<?=ir_e($title)?>" data-module="<?=ir_e($active)?>">
    <?php
    $module=basename((string)($_SERVER['SCRIPT_NAME']??''),'.php');
    foreach(ir_pull_flashes() as $flash)echo '<div class="flash '.ir_e((string)$flash['type']).'" role="status">'.ir_e((string)$flash['message']).'</div>';
    $headingIcons=['dashboard'=>'dashboard','animals'=>'animals','tasks'=>'tasks','care'=>'health','reproduction'=>'reproduction','habitat'=>'habitat','inventory'=>'inventory','finance'=>'finance','other'=>'other'];
    $headingSub=['dashboard'=>'Okamžitý přehled chovu a práce, která vyžaduje pozornost.','animals'=>'Rychlá orientace v chovu, skupinách, stavech a historii.','tasks'=>'Denní práce, plánovač, automatizace a rychlé dokončení.','care'=>'Zdravotní stav, léčba, karanténa a kritická upozornění.','reproduction'=>'Cykly, snůšky, inkubace a další krok bez ručního počítání.','habitat'=>'Ubikace, sestavy a provozní stav chovatelského prostoru.','inventory'=>'Zásoby podle vlastních kategorií, minima a nákupní potřeby.','finance'=>'Náklady, příjmy, rezervace a skutečná hodnota chovu.','other'=>'Dokumenty, kontakty, reporty a další provozní nástroje.'];
    $headingIcon=$headingIcons[$active]??'dashboard';
    $headingText=$headingSub[$active]??'IR Manager';
    if($module==='index'){echo '<header class="page-heading premium-page-heading dashboard-hero-heading"><div><h1>'.ir_e($title).'</h1><p>Vaše zvířata, péče, zdraví a chov na jednom místě.</p></div></header>';}else{echo '<header class="page-heading premium-page-heading"><div class="page-heading-icon">'.ir_visual_icon($headingIcon).'</div><div><h1>'.ir_e($title).'</h1><p>'.ir_e($headingText).'</p></div></header>';}
    ir_render_record_detail($module);
    /* Premium operational lock: generic workspace belongs to the Dashboard only.
       Module pages keep their own purpose-built compact layouts instead of duplicating
       dark overview cards above the real work surface. */
    if($module==='index') ir_render_workspace('dashboard');
}

function ir_page_end(): void {
    ?></main><footer class="app-footer"><span>IR Manager · Teraristika</span><span><?=ir_e(IR_APP_VERSION)?></span></footer></div></div>
    <script src="assets/js/core.js?v=65.0"></script><script src="assets/js/notifications.js?v=65.0"></script><script src="assets/js/workspace.js?v=65.0"></script><script src="assets/js/tables.js?v=65.0"></script><script src="assets/js/premium-ui.js?v=65.0"></script></body></html><?php
}

function ir_back(string $href,string $label='Zpět'): string { return '<a class="back-link" href="'.ir_e($href).'">'.ir_icon('chevron-left').'<span>'.ir_e($label).'</span></a>'; }

