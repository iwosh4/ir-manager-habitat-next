<?php
declare(strict_types=1);
/*
 * HABITAT STUDIO 4.2 inside IR Manager. Loaded only on this page (the Manager shell stays light).
 * Persistence: api.php habitat.load / habitat.save (MySQL is the source of truth); Manager enclosures appear
 * in MOJE UBIKACE, assemblies are Manager "Sestavy"; ← IR MANAGER saves and returns.
 */
require __DIR__.'/includes/config.php';
require_once __DIR__.'/includes/reptile_core.php';
ir_require_perm('read');
if (!ir_feature('habitat_planner')) ir_redirect('plans.php?need=habitat_studio');
$room = preg_replace('~[^a-z0-9_-]~i', '', (string)($_GET['room'] ?? 'main')) ?: 'main';
$base = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/habitat-studio.php'))), '/');
$ret = (string)($_GET['return'] ?? '');
if (!preg_match('~^[a-z0-9_-]+\.php(\?[a-zA-Z0-9=&_.%-]*)?$~', $ret)) $ret = 'habitats.php?view=overview';
$cfg = [
    'api' => $base.'/api.php',
    'csrf' => ir_csrf_token(),
    'room' => $room,
    'returnUrl' => $base.'/'.$ret,
    'account' => ir_account_id(),
    'readonly' => !ir_can('write'),
    'lang' => 'cs',
    'features' => ['techplan' => ir_feature('habitat_techplan'), 'showcase' => ir_feature('habitat_showcase')],
];
$v = static fn(string $p): string => (string)@filemtime(__DIR__.'/habitat/'.$p);
header('Cache-Control: no-store');
?><!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="<?=ir_e($base)?>/habitat/">
  <title>Habitat Studio · IR Manager</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="<?=ir_e($base)?>/favicon.ico">
  <link rel="stylesheet" href="src/styles/app.css?v=<?=$v('src/styles/app.css')?>">
  <script>window.IR_HABITAT = <?=json_encode($cfg, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP)?>;</script>
  <script type="importmap">{ "imports": { "three": "./vendor/three/build/three.module.js", "three/addons/": "./vendor/three/examples/jsm/" } }</script>
</head>
<body>
  <div id="app">
    <header id="toolbar" class="toolbar"></header>
    <div class="workspace">
      <aside id="library" class="panel panel-left"></aside>
      <main id="viewport" class="viewport">
        <div class="loading" id="loading">
          <div class="loading-card">
            <div class="brand"><span class="brand-mark"></span><span class="brand-name">IR MANAGER</span><span class="brand-sep"></span><span class="brand-app">Habitat Studio</span></div>
            <div class="loading-bar"><i id="loading-fill"></i></div>
            <div class="loading-text" id="loading-text">Spouštím…</div>
            <p class="loading-hint"><a href="<?=ir_e($cfg['returnUrl'])?>">← Zpět do IR Manageru</a></p>
          </div>
        </div>
      </main>
      <aside id="inspector" class="panel panel-right"></aside>
    </div>
  </div>
  <noscript>Habitat Studio vyžaduje JavaScript a WebGL 2. <a href="<?=ir_e($cfg['returnUrl'])?>">Zpět do IR Manageru</a></noscript>
  <script type="module" src="src/main.js?v=<?=$v('src/main.js')?>"></script>
</body>
</html>
