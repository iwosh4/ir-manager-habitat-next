<?php
declare(strict_types=1);

$uid=ir_current_user_id();
$ir_stats=['animals'=>0,'tasks'=>0,'overdue'=>0,'repro'=>0,'habitats'=>0,'groups'=>0,'health'=>0,'finance_month'=>0.0];
if(ir_table_exists($pdo,'wp_ir2_zvirata')) $ir_stats['animals']=(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_zvirata WHERE user_id=? AND COALESCE(pohlavi,'') NOT IN ('Skupina','Pár')",[$uid]);
if(ir_table_exists($pdo,'wp_ir2_planovac')){
    $ir_stats['tasks']=(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_planovac WHERE user_id=? AND stav='Aktivní'",[$uid]);
    $ir_stats['overdue']=(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_planovac WHERE user_id=? AND stav='Aktivní' AND datum_termin<CURDATE()",[$uid]);
}
if(ir_table_exists($pdo,'wp_ir2_snusky')) $ir_stats['repro']=(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_snusky WHERE user_id=? AND stav='Aktivní'",[$uid]);
if(ir_table_exists($pdo,'wp_ir2_ubikace')) $ir_stats['habitats']=(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_ubikace WHERE user_id=?",[$uid]);
if(ir_table_exists($pdo,'wp_ir2_skupiny')) $ir_stats['groups']=(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_skupiny WHERE user_id=? AND status='Aktivní'",[$uid]);
if(ir_table_exists($pdo,'wp_ir2_zdravi')) $ir_stats['health']=(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_zdravi WHERE user_id=?",[$uid]);
if(ir_table_exists($pdo,'wp_ir2_finance')) $ir_stats['finance_month']=(float)ir_scalar($pdo,"SELECT COALESCE(SUM(CASE WHEN typ='Příjem' THEN castka ELSE -castka END),0) FROM wp_ir2_finance WHERE smazano IS NULL AND user_id=? AND YEAR(datum)=YEAR(CURDATE()) AND MONTH(datum)=MONTH(CURDATE())",[$uid],0);

if(!function_exists('ir_asset_photo_url')){
    function ir_asset_photo_url(?string $path): string {
        $path=trim((string)$path);
        if($path==='') return '';
        if(preg_match('~^https?://~i',$path)) return $path;

        $path=ltrim(str_replace('\\','/',$path),'/');
        foreach(['manager/','databaze1/'] as $legacyPrefix){
            if(str_starts_with($path,$legacyPrefix)) $path=substr($path,strlen($legacyPrefix));
        }

        if(str_starts_with($path,'uploads/')){
            return is_file(IR_ROOT.'/'.$path)?$path:'assets/icons/custom/animals.webp';
        }

        $candidate='uploads/'.ltrim($path,'/');
        return is_file(IR_ROOT.'/'.$candidate)?$candidate:'assets/icons/custom/animals.webp';
    }
}
if(!function_exists('ir_activity_icon_key')){
    function ir_activity_icon_key(string $source,string $title): string {
        $t=function_exists('mb_strtolower')?mb_strtolower($title,'UTF-8'):strtolower($title);
        if(str_contains($t,'krmen')||str_contains($t,'potrav')) return 'feeding';
        if(str_contains($t,'vod')) return 'water';
        if(str_contains($t,'rosen')||str_contains($t,'mlžen')) return 'mist';
        if(str_contains($t,'teplot')) return 'temperature';
        if(str_contains($t,'vlhk')) return 'humidity';
        if(str_contains($t,'čiště')||str_contains($t,'údržb')||str_contains($t,'úklid')) return 'cleaning';
        if(str_contains($t,'váž')||str_contains($t,'hmot')) return 'weight';
        if(str_contains($t,'svlek')) return 'shedding';
        if(str_contains($t,'zdrav')||$source==='health') return 'health';
        if(str_contains($t,'léč')||str_contains($t,'lék')) return 'treatment';
        if(str_contains($t,'snů')||str_contains($t,'inkub')||$source==='reproduction') return 'reproduction';
        if($source==='finance') return 'finance';
        if($source==='group') return 'groups';
        return 'tasks';
    }
}

$ir_upcoming=[];
if(ir_table_exists($pdo,'wp_ir2_planovac')){
    try{
        $st=$pdo->prepare("SELECT p.id,p.nazev_ukolu,p.datum_termin,p.cas_termin,p.kategorie,p.stav,p.zvire_id,z.jmeno_kod,z.latinsky_nazev,z.foto
                           FROM wp_ir2_planovac p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id
                           WHERE p.user_id=? AND p.stav='Aktivní'
                           ORDER BY p.datum_termin,COALESCE(p.cas_termin,'23:59:59'),p.id LIMIT 8");
        $st->execute([$uid]);
        $ir_upcoming=$st->fetchAll()?:[];
    }catch(Throwable $e){error_log('IR Next tasks: '.$e->getMessage());}
}
