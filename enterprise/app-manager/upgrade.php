<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/shell.php';require __DIR__.'/migrations/run.php';
ir_require_admin();
$error='';$result='';
if($_SERVER['REQUEST_METHOD']==='POST'){
 ir_verify_csrf();$locked=false;
 try{$q=$pdo->query("SELECT GET_LOCK('ir-manager-migration',10)");$locked=(int)$q->fetchColumn()===1;if(!$locked)throw new RuntimeException('Aktualizace již probíhá.');ob_start();try{ir_run_migrations($pdo);$result=(string)ob_get_contents();}finally{ob_end_clean();}ir_flash('success','Databázová aktualizace PATCH 065 byla dokončena.');}
 catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();error_log('Upgrade 065: '.$e->getMessage());$error=$e->getMessage();}
 finally{if($locked)$pdo->query("SELECT RELEASE_LOCK('ir-manager-migration')");}
}
ir_page_start('Aktualizace databáze','other');
?>
<section class="panel form-panel"><header class="panel-head"><h2>Aktualizace databáze · PATCH 065</h2></header><div class="form-grid"><?php if($error):?><div class="flash danger"><?=ir_e($error)?></div><?php endif;?><?php if($result):?><pre><?=ir_e($result)?></pre><a class="btn primary" href="index.php">Otevřít přehled</a><?php else:?><p>Aktualizace používá jednotnou tabulku migrací, neopakuje již rozpoznanou opravu 046 a přidá bezpečnostní změny PATCH 065. Před spuštěním ponech svou existující zálohu.</p><form method="post"><?=ir_csrf_field()?><button class="btn primary">Spustit PATCH 065</button></form><?php endif;?></div></section>
<?php ir_page_end();
