<?php
declare(strict_types=1);

/*
 * Central ownership rules for user data.  Most IR2 tables are directly owned
 * through user_id.  The exceptions below are deliberately explicit so backup
 * and account deletion do not silently miss dependent/shared rows.
 */
function ir_user_data_special_specs(): array {
    return [
        'wp_ir2_supp_occurrences' => ['kind'=>'supp_occurrences'],
        'wp_ir2_transport_requests' => ['kind'=>'transport_requests'],
    ];
}

function ir_user_data_specs(PDO $pdo): array {
    static $cache=null;
    if($cache!==null) return $cache;
    $specs=[];
    try{
        $st=$pdo->query("SELECT DISTINCT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME='user_id' AND TABLE_NAME LIKE 'wp\\_ir2\\_%' ESCAPE '\\\\' ORDER BY TABLE_NAME");
        foreach($st->fetchAll(PDO::FETCH_COLUMN)?:[] as $table){
            $table=(string)$table;
            if($table===IR_AUTH_TABLE || in_array($table,['wp_ir2_auth_limits','wp_ir2_schema_migrations'],true)) continue;
            if(preg_match('/^wp_ir2_[A-Za-z0-9_]+$/D',$table)) $specs[$table]=['kind'=>'user_id'];
        }
    }catch(Throwable $e){
        error_log('IR user-data schema discovery: '.$e->getMessage());
    }
    foreach(ir_user_data_special_specs() as $table=>$spec){
        if(ir_table_exists($pdo,$table)) $specs[$table]=$spec;
    }
    /* Dependent rows must be processed before their parent direct tables. */
    uksort($specs,static function(string $a,string $b): int {
        $priority=['wp_ir2_supp_occurrences'=>0,'wp_ir2_transport_requests'=>1];
        return ($priority[$a]??10)<=>($priority[$b]??10) ?: strcmp($a,$b);
    });
    return $cache=$specs;
}

function ir_user_data_columns(PDO $pdo,string $table): array {
    if(!preg_match('/^wp_ir2_[A-Za-z0-9_]+$/D',$table)) return [];
    $st=$pdo->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION');
    $st->execute([$table]);
    return array_map('strval',$st->fetchAll(PDO::FETCH_COLUMN)?:[]);
}

function ir_user_data_rows(PDO $pdo,int $uid,string $table,array $spec): array {
    if(!preg_match('/^wp_ir2_[A-Za-z0-9_]+$/D',$table)) return [];
    $kind=(string)($spec['kind']??'');
    if($kind==='user_id'){
        $st=$pdo->prepare("SELECT * FROM `{$table}` WHERE user_id=? ORDER BY 1");$st->execute([$uid]);return $st->fetchAll()?:[];
    }
    if($kind==='transport_requests'){
        $st=$pdo->prepare("SELECT * FROM `{$table}` WHERE owner_user_id=? OR requester_user_id=? ORDER BY id");$st->execute([$uid,$uid]);return $st->fetchAll()?:[];
    }
    if($kind==='supp_occurrences'){
        $st=$pdo->prepare('SELECT o.* FROM wp_ir2_supp_occurrences o JOIN wp_ir2_supp_cycles c ON c.id=o.cycle_id WHERE c.user_id=? ORDER BY o.cycle_id,o.datum');$st->execute([$uid]);return $st->fetchAll()?:[];
    }
    return [];
}

function ir_user_data_count(PDO $pdo,int $uid,string $table,array $spec): int {
    $kind=(string)($spec['kind']??'');
    try{
        if($kind==='user_id'){$st=$pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE user_id=?");$st->execute([$uid]);return (int)$st->fetchColumn();}
        if($kind==='transport_requests'){$st=$pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE owner_user_id=? OR requester_user_id=?");$st->execute([$uid,$uid]);return (int)$st->fetchColumn();}
        if($kind==='supp_occurrences'){$st=$pdo->prepare('SELECT COUNT(*) FROM wp_ir2_supp_occurrences o JOIN wp_ir2_supp_cycles c ON c.id=o.cycle_id WHERE c.user_id=?');$st->execute([$uid]);return (int)$st->fetchColumn();}
    }catch(Throwable $e){error_log('IR user-data count '.$table.': '.$e->getMessage());}
    return 0;
}

function ir_user_data_delete(PDO $pdo,int $uid,string $table,array $spec): void {
    $kind=(string)($spec['kind']??'');
    if($kind==='user_id'){$pdo->prepare("DELETE FROM `{$table}` WHERE user_id=?")->execute([$uid]);return;}
    if($kind==='transport_requests'){$pdo->prepare("DELETE FROM `{$table}` WHERE owner_user_id=? OR requester_user_id=?")->execute([$uid,$uid]);return;}
    if($kind==='supp_occurrences'){$pdo->prepare('DELETE o FROM wp_ir2_supp_occurrences o JOIN wp_ir2_supp_cycles c ON c.id=o.cycle_id WHERE c.user_id=?')->execute([$uid]);return;}
}
