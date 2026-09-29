<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
define('IR_PUBLIC_PAGE',true);require dirname(__DIR__).'/includes/config.php';require __DIR__.'/run.php';
try{ir_run_migrations($pdo);}catch(Throwable $e){error_log('Migration 046: '.$e->getMessage());fwrite(STDERR,"Migrace selhala; podrobnosti jsou v PHP logu.\n");exit(1);}
