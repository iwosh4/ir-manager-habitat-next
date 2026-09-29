<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';
$m=preg_replace('/[^a-z\-]/','',(string)($_GET['m']??''));
$view=preg_replace('/[^a-z\-]/','',(string)($_GET['view']??''));
$map=[
 'animals'=>'animals.php','tasks'=>'tasks.php','care'=>'activities.php','reproduction'=>'clutches.php','habitat'=>'habitats.php','inventory'=>'inventory.php','quick'=>'quick.php','scan'=>'scan.php','search'=>'animals.php','other'=>'reports.php','reports'=>'reports.php','import'=>'import.php','actions'=>'actions.php'
];
if(isset($map[$m])){ $url=$map[$m]; if($view!=='' && in_array($m,['animals','tasks'],true)) $url.=(str_contains($url,'?')?'&':'?').'view='.rawurlencode($view); if($m==='search'&&!empty($_GET['q']))$url.='?q='.rawurlencode((string)$_GET['q']); ir_redirect($url); }
require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';
$title=$m==='finance'?'Finance':($m==='documents'?'Dokumenty':($m==='genetics'?'Genetická kalkulačka':'Modul'));
ir_page_start($title,$m==='finance'?'finance':'other');echo ir_back('index.php','Zpět');
?><section class="panel glow-panel migration-module"><div class="module-mark"><?=ir_visual_icon($m==='finance'?'finance':'other')?></div><div><span class="panel-kicker">DALŠÍ IR MODUL</span><h2><?=ir_e($title)?></h2><p>Tento modul není součástí funkčního jádra inspirovaného Reptile Scan a zůstává připraven pro další rozšíření IR Manageru.</p></div></section><?php ir_page_end();
