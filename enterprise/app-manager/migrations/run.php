<?php
declare(strict_types=1);

function ir_migration_ensure_table(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS wp_ir2_schema_migrations (id INT UNSIGNED NOT NULL AUTO_INCREMENT,migration VARCHAR(190) NOT NULL,notes TEXT NULL,applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),UNIQUE KEY uq_migration(migration)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}
function ir_migration_has(PDO $pdo,string $key): bool {$st=$pdo->prepare('SELECT COUNT(*) FROM wp_ir2_schema_migrations WHERE migration=?');$st->execute([$key]);return (int)$st->fetchColumn()>0;}
function ir_migration_mark(PDO $pdo,string $key,string $notes): void {$pdo->prepare('INSERT IGNORE INTO wp_ir2_schema_migrations(migration,notes) VALUES(?,?)')->execute([$key,$notes]);}

function ir_run_migrations(PDO $pdo): void {
    ir_migration_ensure_table($pdo);

    /* Repair 046 predates unified migration tracking. Detect an already-upgraded
       schema instead of executing the repair again just because its marker is absent. */
    $m046='20260918_046_records';
    if(!ir_migration_has($pdo,$m046)){
        $already=ir_db_column_exists($pdo,'wp_ir2_druhy','merged_into_id')&&ir_db_column_exists($pdo,'wp_ir2_skupiny','main_animal_id')&&ir_table_exists($pdo,'wp_ir2_repair_history');
        if($already){ir_migration_mark($pdo,$m046,'Detected as already applied before unified migration tracking.');echo "Migrace 046: existující stav rozpoznán, neopakuje se.\n";}
        else{require __DIR__.'/046-records.php';ir_migration_mark($pdo,$m046,'Group/catalog repair 046 applied.');}
    }

    $m065='20260926_065_security_hardening';
    if(!ir_migration_has($pdo,$m065)){
        $file=__DIR__.'/065-security-hardening.php';if(!is_file($file))throw new RuntimeException('Chybí povinná migrace 065-security-hardening.php. Aktualizace byla zastavena.');
        require $file;ir_migration_mark($pdo,$m065,'Security hardening: unique email + self-contained contacts/documents schema.');
    } else echo "Migrace 065: již byla aplikována.\n";

    // BETA 1.0 FINAL (070): additive, idempotent — safe to re-run; never drops or rewrites user data
    require_once dirname(__DIR__).'/includes/schema-beta1.php';
    $steps=ir_schema_beta1_apply($pdo);
    echo 'Migrace 070 (BETA 1.0 FINAL): '.(count($steps)?count($steps).' kroků provedeno':'schéma je aktuální')."\n";
    foreach($steps as $st)echo ' · '.(is_array($st)?json_encode($st,JSON_UNESCAPED_UNICODE):(string)$st)."\n";
    if(!ir_migration_has($pdo,IR_SCHEMA_VERSION))ir_migration_mark($pdo,IR_SCHEMA_VERSION,'BETA 1.0 FINAL additive schema (events, audit, billing, files, habitat bridge).');
}
