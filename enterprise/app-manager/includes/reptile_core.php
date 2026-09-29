<?php
declare(strict_types=1);

function ir_int(mixed $v): int { return max(0,(int)$v); }
function ir_date_input(?string $v=null): string { $ts=$v?strtotime($v):time(); return $ts?date('Y-m-d',$ts):date('Y-m-d'); }
function ir_datetime_input(?string $v=null): string { $ts=$v?strtotime($v):time(); return $ts?date('Y-m-d\TH:i',$ts):date('Y-m-d\TH:i'); }
function ir_status_active_sql(string $alias='z'): string { return "COALESCE({$alias}.status_chovu,'Aktivní') NOT IN ('Prodáno','Uhynulo','Archiv','Mrtvé','Dead','Sold')"; }

function ir_activity_catalog(): array {
    return [
        'Krmení'=>['icon'=>'feeding','category'=>'Péče','value'=>'Krmivo / množství','detail'=>'Poznámka','planner'=>'feed'],
        'Odmítnutí potravy'=>['icon'=>'feeding','category'=>'Péče','value'=>'Nabídnuté krmivo','detail'=>'Důvod / poznámka','planner'=>'refeed'],
        'Nekrmeno'=>['icon'=>'feeding','category'=>'Péče','value'=>'Důvod (ve svleku / jiný)','detail'=>'Poznámka','planner'=>null],
        'Svlek'=>['icon'=>'shedding','category'=>'Péče','value'=>'Stav svleku','detail'=>'Kompletní / částečný / problémový','planner'=>null],
        'Čištění'=>['icon'=>'cleaning','category'=>'Péče','value'=>'Rozsah','detail'=>'Poznámka','planner'=>null],
        'Defekace'=>['icon'=>'feces','category'=>'Péče','value'=>'Stav','detail'=>'Poznámka','planner'=>null],
        'Vážení'=>['icon'=>'weight','category'=>'Měření','value'=>'Hmotnost','detail'=>'Číslo v preferované jednotce','planner'=>null],
        'Délka'=>['icon'=>'animals','category'=>'Měření','value'=>'Délka','detail'=>'Číslo v preferované jednotce','planner'=>null],
        'Zdravotní kontrola'=>['icon'=>'health','category'=>'Zdraví','value'=>'Výsledek','detail'=>'Nález / poznámka','planner'=>null],
        'Medikace'=>['icon'=>'medicine','category'=>'Zdraví','value'=>'Lék / dávka','detail'=>'Poznámka','planner'=>null],
        'Ultrazvuk'=>['icon'=>'veterinary','category'=>'Zdraví','value'=>'Velikost folikulů','detail'=>'Poznámka','planner'=>null],
        'Páření'=>['icon'=>'reproduction','category'=>'Reprodukce','value'=>'Partner / výsledek','detail'=>'Poznámka','planner'=>null],
        'Brumace'=>['icon'=>'reproduction','category'=>'Péče','value'=>'Datum konce','detail'=>'Poznámka','planner'=>null],
        'Výměna vody'=>['icon'=>'water','category'=>'Péče','value'=>'Rozsah','detail'=>'Poznámka','planner'=>null],
        'Rosení'=>['icon'=>'mist','category'=>'Péče','value'=>'Rozsah','detail'=>'Poznámka','planner'=>null],
        'Kontrola'=>['icon'=>'checklist','category'=>'Péče','value'=>'Výsledek','detail'=>'Poznámka','planner'=>null],
        'Poznámka'=>['icon'=>'calendar-doc','category'=>'Evidence','value'=>'Kategorie','detail'=>'Obsah','planner'=>null],
    ];
}
function ir_activity_meta(string $type): array {
    $catalog=ir_activity_catalog();
    return $catalog[$type]??['icon'=>ir_activity_icon_key('care',$type),'category'=>'Vlastní','value'=>'Hodnota','detail'=>'Poznámka','planner'=>null];
}
function ir_activity_icon(string $type): string { return (string)(ir_activity_meta($type)['icon']??'tasks'); }

function ir_animal(PDO $pdo,int $uid,int $id): ?array {
    $st=$pdo->prepare("SELECT z.*,u.nazev AS ubikace_nazev,u.typ AS ubikace_typ FROM wp_ir2_zvirata z LEFT JOIN wp_ir2_ubikace u ON u.id=z.ubikace_id AND u.user_id=z.user_id WHERE z.user_id=? AND z.id=? LIMIT 1");
    $st->execute([$uid,$id]); $r=$st->fetch(); return $r?:null;
}
function ir_animal_display(array $a): string {
    $latin=trim((string)($a['latinsky_nazev']??''));
    $name=trim((string)($a['jmeno_kod']??''));
    return $latin!==''?$latin:($name!==''?$name:(string)($a['druh']??'Zvíře'));
}
function ir_animal_secondary(array $a): string {
    $name=trim((string)($a['jmeno_kod']??'')); $latin=trim((string)($a['latinsky_nazev']??''));
    if($name!=='' && $name!==$latin) return $name;
    return trim((string)($a['druh']??''));
}
function ir_animal_photo(array $a): string {
    $p=ir_asset_photo_url((string)($a['foto']??''));
    return $p;
}
function ir_feeding_interval_days(PDO $pdo,int $uid,array $animal): int {
    $direct=trim((string)($animal['interval_krmeni']??''));
    if($direct!=='' && preg_match('/(\d+)/u',$direct,$m)) return max(1,(int)$m[1]);
    $did=(int)($animal['druh_id']??0);
    if($did>0 && ir_table_exists($pdo,'wp_ir2_druhy')){
        try{
            $st=$pdo->prepare("SELECT interval_krmeni_mlade,interval_krmeni_juvenile,interval_krmeni_subadult,interval_krmeni_adult FROM wp_ir2_druhy WHERE user_id=? AND id=? LIMIT 1");
            $st->execute([$uid,$did]);$sp=$st->fetch()?:[];
            $cat=ir_supp_target_from_category((string)($animal['kategorie']??''));
            $field=match($cat){'mlade'=>'interval_krmeni_mlade','juvenile'=>'interval_krmeni_juvenile','subadult'=>'interval_krmeni_subadult',default=>'interval_krmeni_adult'};
            if(!empty($sp[$field]) && preg_match('/(\d+)/u',(string)$sp[$field],$m)) return max(1,(int)$m[1]);
        }catch(Throwable){}
    }
    if($did>0 && ir_table_exists($pdo,'wp_ir2_pece_pravidla')){
        try{$st=$pdo->prepare("SELECT interval_dni FROM wp_ir2_pece_pravidla WHERE user_id=? AND druh_id=? AND typ='Krmení' LIMIT 1");$st->execute([$uid,$did]);$v=(int)$st->fetchColumn();if($v>0)return $v;}catch(Throwable){}
    }
    return 7;
}

function ir_refeed_interval_days(PDO $pdo,int $uid,array $animal): int {
    $did=(int)($animal['druh_id']??0);
    if($did>0 && ir_table_exists($pdo,'wp_ir2_pece_pravidla')){
        try{$st=$pdo->prepare("SELECT interval_dni FROM wp_ir2_pece_pravidla WHERE user_id=? AND druh_id=? AND typ='refeed_after_refusal' LIMIT 1");$st->execute([$uid,$did]);$v=(int)$st->fetchColumn();if($v>0)return $v;}catch(Throwable){}
    }
    return 3;
}
function ir_is_brumming(PDO $pdo,int $uid,int $animalId,?string $date=null): bool {
    $date=$date?:date('Y-m-d');
    try{
        $st=$pdo->prepare("SELECT datum,hodnota FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ='Brumace' AND DATE(datum)<=? ORDER BY datum DESC,id DESC LIMIT 1");
        $st->execute([$uid,$animalId,$date]); $r=$st->fetch(); if(!$r)return false;
        $end=trim((string)($r['hodnota']??'')); if($end==='') return false;
        return $date<=substr($end,0,10);
    }catch(Throwable){return false;}
}
function ir_last_activity(PDO $pdo,int $uid,int $animalId,string $type): ?array {
    try{$st=$pdo->prepare("SELECT * FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ=? ORDER BY datum DESC,id DESC LIMIT 1");$st->execute([$uid,$animalId,$type]);$r=$st->fetch();return $r?:null;}catch(Throwable){return null;}
}

function ir_supp_target_from_category(?string $category): string {
    $value=mb_strtolower(trim((string)$category),'UTF-8');
    if(preg_match('~mlád|mlad|hatch|baby~u',$value))return 'mlade';
    if(preg_match('~juven~u',$value))return 'juvenile';
    if(preg_match('~subadult|sub adult~u',$value))return 'subadult';
    if(preg_match('~chov|breeding|gravid|repro~u',$value))return 'breeding';
    return 'adult';
}
function ir_species_row(PDO $pdo,int $uid,int $speciesId): array {
    if($speciesId<=0||!ir_table_exists($pdo,'wp_ir2_druhy'))return [];
    try{$st=$pdo->prepare('SELECT * FROM wp_ir2_druhy WHERE user_id=? AND id=? LIMIT 1');$st->execute([$uid,$speciesId]);return $st->fetch()?:[];}catch(Throwable){return [];}
}
function ir_effective_value(array $animal,array $species,string $animalKey,?string $speciesKey=null): array {
    $value=trim((string)($animal[$animalKey]??''));if($value!=='')return ['value'=>$value,'source'=>'jedinec'];
    $speciesKey=$speciesKey?:$animalKey;$value=trim((string)($species[$speciesKey]??''));
    return ['value'=>$value,'source'=>$value!==''?'druh':''];
}
function ir_get_species_rotation(PDO $pdo,int $uid,array $animal): ?array {
    if(empty($animal['druh_id'])||!ir_table_exists($pdo,'wp_ir2_suplement_rotace')||!ir_table_exists($pdo,'wp_ir2_suplement_kroky'))return null;
    $target=ir_supp_target_from_category((string)($animal['kategorie']??''));
    $st=$pdo->prepare("SELECT * FROM wp_ir2_suplement_rotace WHERE user_id=? AND druh_id=? AND aktivni=1 AND cil IN (?, 'all') ORDER BY (cil=?) DESC,id LIMIT 1");
    $st->execute([$uid,(int)$animal['druh_id'],$target,$target]);$rotation=$st->fetch();if(!$rotation)return null;
    $q=$pdo->prepare('SELECT * FROM wp_ir2_suplement_kroky WHERE user_id=? AND rotace_id=? ORDER BY poradi,id');$q->execute([$uid,(int)$rotation['id']]);$rotation['steps']=$q->fetchAll()?:[];return $rotation;
}
function ir_supplement_recommendation(PDO $pdo,int $uid,array $animal,?string $onDate=null): array {
    $date=$onDate&&strtotime($onDate)?new DateTimeImmutable(substr($onDate,0,10)):new DateTimeImmutable('today');$independent=null;
    if(ir_table_exists($pdo,'wp_ir2_planovac')){
        try{$st=$pdo->prepare("SELECT * FROM wp_ir2_planovac WHERE user_id=? AND zvire_id=? AND stav='Aktivní' AND datum_termin<=? AND nazev_ukolu LIKE 'Suplementace:%' ORDER BY datum_termin,id");$st->execute([$uid,(int)$animal['id'],$date->format('Y-m-d')]);foreach($st->fetchAll()?:[] as $task){$priority=80;if(preg_match('~\[IR-SUPP-PRIORITY:(\d+)\]~',(string)($task['poznamka']??''),$m))$priority=(int)$m[1];$name=preg_replace('~^Suplementace:\s*~u','',trim((string)$task['nazev_ukolu']))?:trim((string)$task['nazev_ukolu']);if($independent===null||$priority>$independent['priority'])$independent=['name'=>$name,'priority'=>$priority,'task_id'=>(int)$task['id'],'interval_days'=>(int)($task['interval_hodnota']??0),'due'=>(string)$task['datum_termin'],'source'=>'task'];}}catch(Throwable){}
    }
    if(ir_table_exists($pdo,'wp_ir2_supp_cycles')){
        try{$st=$pdo->prepare('SELECT * FROM wp_ir2_supp_cycles WHERE user_id=? AND zvire_id=? AND active=1 ORDER BY id');$st->execute([$uid,(int)$animal['id']]);foreach($st->fetchAll()?:[] as $cycle){$rules=json_decode((string)($cycle['rules_json']??'[]'),true);if(!is_array($rules))$rules=[];$last=null;if(ir_table_exists($pdo,'wp_ir2_supp_occurrences')){$o=$pdo->prepare('SELECT MAX(o.datum) FROM wp_ir2_supp_occurrences o JOIN wp_ir2_supp_cycles c ON c.id=o.cycle_id WHERE o.cycle_id=? AND c.user_id=?');$o->execute([(int)$cycle['id'],$uid]);$last=$o->fetchColumn()?:null;}$start=new DateTimeImmutable((string)$cycle['start_date']);$days=max(1,(int)$cycle['cycle_days']);$due=$last?(new DateTimeImmutable((string)$last))->modify('+'.$days.' days'):$start;if($date>=$due){$name=trim((string)($rules[0]['name']??$cycle['nazev']))?:'Suplement';$priority=(int)($rules[0]['priority']??100);if($independent===null||$priority>$independent['priority'])$independent=['name'=>$name,'priority'=>$priority,'cycle_id'=>(int)$cycle['id'],'due'=>$due->format('Y-m-d'),'source'=>'independent'];}}}catch(Throwable){}
    }
    $rotation=ir_get_species_rotation($pdo,$uid,$animal);$regular=null;
    if($rotation&&!empty($rotation['steps'])){$state=1;if(ir_table_exists($pdo,'wp_ir2_suplement_stav')){try{$q=$pdo->prepare('SELECT dalsi_poradi FROM wp_ir2_suplement_stav WHERE user_id=? AND zvire_id=? AND rotace_id=? LIMIT 1');$q->execute([$uid,(int)$animal['id'],(int)$rotation['id']]);$state=(int)($q->fetchColumn()?:1);}catch(Throwable){}}$step=null;foreach($rotation['steps'] as $item)if((int)$item['poradi']===$state){$step=$item;break;}if(!$step)$step=$rotation['steps'][0];$name=trim((string)($step['nazev']??''))?:trim((string)($step['typ']??''))?:'Bez suplementu';$regular=['name'=>$name,'rotation_id'=>(int)$rotation['id'],'step_order'=>(int)$step['poradi'],'source'=>'rotation','priority'=>30,'rotation'=>$rotation];}
    $winner=$independent&&(!$regular||$independent['priority']>=$regular['priority'])?$independent:$regular;return ['winner'=>$winner,'independent'=>$independent,'regular'=>$regular];
}
function ir_supplement_rotation_status(PDO $pdo,int $uid,array $animal,array $recommendation=[]): array {
    $rotation=ir_get_species_rotation($pdo,$uid,$animal);if(!$rotation||empty($rotation['steps']))return [];
    if(!$recommendation)$recommendation=ir_supplement_recommendation($pdo,$uid,$animal);
    $regular=$recommendation['regular']??null;$currentOrder=(int)($regular['step_order']??0);$steps=array_values($rotation['steps']);
    $currentIndex=0;foreach($steps as $i=>$step){if((int)$step['poradi']===$currentOrder){$currentIndex=$i;break;}}
    $current=$steps[$currentIndex]??$steps[0];$next=$steps[($currentIndex+1)%count($steps)]??$steps[0];
    $last=null;try{$st=$pdo->prepare("SELECT * FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ='Krmení' ORDER BY datum DESC,id DESC LIMIT 1");$st->execute([$uid,(int)$animal['id']]);$last=$st->fetch()?:null;}catch(Throwable){}
    $days=ir_feeding_interval_days($pdo,$uid,$animal);$due=$last&&!empty($last['datum'])?date('Y-m-d',strtotime('+'.$days.' days',strtotime((string)$last['datum']))):date('Y-m-d');
    return ['rotation'=>$rotation,'current'=>$current,'next'=>$next,'winner'=>$recommendation['winner']??null,'due'=>$due,'last_feed'=>$last];
}
function ir_supplement_is_none(?string $name): bool { $n=mb_strtolower(trim((string)$name),'UTF-8');return $n===''||preg_match('~^(bez|bez suplementu|none|no supplement)$~u',$n)===1; }
function ir_compose_feed_value(string $base,?string $supplement): string {
    $base=trim($base);$supplement=trim((string)$supplement);if($base===''||ir_supplement_is_none($supplement))return $base;
    if(mb_stripos($base,$supplement,0,'UTF-8')!==false)return $base;return $base.' + '.$supplement;
}
function ir_supplement_snapshot(PDO $pdo,int $uid,int $animalId,array $recommendation,string $baseFeed): array {
    $winner=$recommendation['winner']??null;$effect=['version'=>2,'source'=>'none','base_feed'=>$baseFeed];
    if(!$winner)return $effect;
    if(($winner['source']??'')==='rotation'&&!empty($winner['rotation_id'])){$rid=(int)$winner['rotation_id'];$before=null;if(ir_table_exists($pdo,'wp_ir2_suplement_stav')){$q=$pdo->prepare('SELECT dalsi_poradi FROM wp_ir2_suplement_stav WHERE user_id=? AND zvire_id=? AND rotace_id=?');$q->execute([$uid,$animalId,$rid]);$v=$q->fetchColumn();$before=$v===false?null:(int)$v;}$effect=array_merge($effect,['source'=>'rotation','rotation_id'=>$rid,'before'=>$before,'step_order'=>(int)($winner['step_order']??1),'steps'=>array_map(static fn($s)=>(int)$s['poradi'],$winner['rotation']['steps']??[]),'supplement'=>(string)($winner['name']??'')]);}
    elseif(($winner['source']??'')==='task')$effect=array_merge($effect,['source'=>'task','task_id'=>(int)($winner['task_id']??0),'supplement'=>(string)($winner['name']??'')]);
    elseif(($winner['source']??'')==='independent')$effect=array_merge($effect,['source'=>'independent','cycle_id'=>(int)($winner['cycle_id']??0),'supplement'=>(string)($winner['name']??'')]);
    return $effect;
}
function ir_advance_supplement_after_feeding(PDO $pdo,int $uid,array $animal,array $recommendation,string $onDate): void {
    if(ir_user_setting_get($pdo,$uid,'supplements_advance_on_feeding','1')==='0')return;$winner=$recommendation['winner']??null;if(!$winner)return;$onDate=substr($onDate,0,10);
    if(($winner['source']??'')==='task'&&!empty($winner['task_id'])){$taskId=(int)$winner['task_id'];$q=$pdo->prepare('SELECT * FROM wp_ir2_planovac WHERE id=? AND user_id=? LIMIT 1');$q->execute([$taskId,$uid]);$task=$q->fetch();if($task){$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Hotovo' WHERE id=? AND user_id=?")->execute([$taskId,$uid]);$days=(int)($task['interval_hodnota']??0);if($days>0){$next=(new DateTimeImmutable($onDate))->modify('+'.$days.' days')->format('Y-m-d');$pdo->prepare("INSERT INTO wp_ir2_planovac(user_id,zvire_id,nazev_ukolu,kategorie,datum_termin,priorita,stav,opakovani,interval_hodnota,poznamka) VALUES(?,?,?,?,?,'Vysoká','Aktivní','interval',?,?)")->execute([$uid,(int)$animal['id'],$task['nazev_ukolu'],'Suplementace',$next,$days,$task['poznamka']]);}}return;}
    if(($winner['source']??'')==='independent'&&!empty($winner['cycle_id'])&&ir_table_exists($pdo,'wp_ir2_supp_occurrences')){$pdo->prepare('INSERT IGNORE INTO wp_ir2_supp_occurrences(cycle_id,datum,task_id) VALUES(?,?,NULL)')->execute([(int)$winner['cycle_id'],$onDate]);return;}
    if(($winner['source']??'')!=='rotation'||empty($winner['rotation_id'])||!ir_table_exists($pdo,'wp_ir2_suplement_stav'))return;$steps=$winner['rotation']['steps']??[];if(!$steps)return;$orders=array_map(static fn($s)=>(int)$s['poradi'],$steps);sort($orders);$current=(int)($winner['step_order']??$orders[0]);$index=array_search($current,$orders,true);$next=$orders[(($index===false?0:$index+1)%count($orders))];$pdo->prepare('INSERT INTO wp_ir2_suplement_stav(user_id,zvire_id,rotace_id,dalsi_poradi) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE dalsi_poradi=VALUES(dalsi_poradi),upraveno=CURRENT_TIMESTAMP')->execute([$uid,(int)$animal['id'],(int)$winner['rotation_id'],$next]);
}
function ir_finish_supplement_effect(PDO $pdo,int $uid,int $careId,int $animalId,array $effect): void {
    if(($effect['source']??'')==='rotation'&&!empty($effect['rotation_id'])){$q=$pdo->prepare('SELECT dalsi_poradi FROM wp_ir2_suplement_stav WHERE user_id=? AND zvire_id=? AND rotace_id=?');$q->execute([$uid,$animalId,(int)$effect['rotation_id']]);$v=$q->fetchColumn();$effect['after']=$v===false?null:(int)$v;}
    $pdo->prepare('UPDATE wp_ir2_pece SET supplement_effect=? WHERE id=? AND user_id=?')->execute([json_encode($effect,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$careId,$uid]);
}
function ir_undo_supplement_effect(PDO $pdo,int $uid,array $care): bool {
    $effect=json_decode((string)($care['supplement_effect']??''),true);if(!is_array($effect)||!in_array((int)($effect['version']??0),[1,2],true))return true;$source=(string)($effect['source']??'none');if($source==='none')return true;if($source!=='rotation')return false;$rid=(int)($effect['rotation_id']??0);$animalId=(int)$care['zvire_id'];if(!$rid||!ir_table_exists($pdo,'wp_ir2_suplement_stav'))return false;
    $q=$pdo->prepare("SELECT supplement_effect FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND id>? AND typ='Krmení' ORDER BY id");$q->execute([$uid,$animalId,(int)$care['id']]);foreach($q->fetchAll(PDO::FETCH_COLUMN)?:[] as $raw){$later=json_decode((string)$raw,true);if(is_array($later)&&($later['source']??'')==='rotation'&&(int)($later['rotation_id']??0)===$rid)return false;}
    $q=$pdo->prepare('SELECT poradi FROM wp_ir2_suplement_kroky WHERE user_id=? AND rotace_id=? ORDER BY poradi,id');$q->execute([$uid,$rid]);$orders=array_map('intval',$q->fetchAll(PDO::FETCH_COLUMN)?:[]);if(!empty($effect['steps'])&&$orders!==array_map('intval',(array)$effect['steps']))return false;
    $q=$pdo->prepare('SELECT dalsi_poradi FROM wp_ir2_suplement_stav WHERE user_id=? AND zvire_id=? AND rotace_id=?');$q->execute([$uid,$animalId,$rid]);$current=$q->fetchColumn();if(array_key_exists('after',$effect)&&$effect['after']!==null&&$current!==false&&(int)$current!==(int)$effect['after'])return false;
    if(($effect['before']??null)===null)$pdo->prepare('DELETE FROM wp_ir2_suplement_stav WHERE user_id=? AND zvire_id=? AND rotace_id=?')->execute([$uid,$animalId,$rid]);else $pdo->prepare('UPDATE wp_ir2_suplement_stav SET dalsi_poradi=?,upraveno=CURRENT_TIMESTAMP WHERE user_id=? AND zvire_id=? AND rotace_id=?')->execute([(int)$effect['before'],$uid,$animalId,$rid]);return true;
}
function ir_activity_base_feed(array $care): string { $effect=json_decode((string)($care['supplement_effect']??''),true);if(is_array($effect)&&trim((string)($effect['base_feed']??''))!=='')return trim((string)$effect['base_feed']);return trim((string)($care['hodnota']??'')); }
function ir_resync_feed_task(PDO $pdo,int $uid,int $animalId): void { $animal=ir_animal($pdo,$uid,$animalId);if(!$animal)return;$q=$pdo->prepare("SELECT MAX(datum) FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ='Krmení'");$q->execute([$uid,$animalId]);$base=(string)($q->fetchColumn()?:date('Y-m-d'));ir_sync_feed_task($pdo,$uid,$animal,$base,false); }
function ir_reproduction_cycles_for_animal(PDO $pdo,int $uid,int $animalId,int $limit=10): array { if(!ir_table_exists($pdo,'wp_ir2_snusky'))return [];try{$st=$pdo->prepare("SELECT * FROM wp_ir2_snusky WHERE user_id=? AND (matka_id=? OR otec_id=?) ORDER BY (stav='Aktivní') DESC,COALESCE(dalsi_akce_datum,predpoklad_lihnuti,datum_snusky,datum_zahajeni,vytvoreno) DESC LIMIT ".max(1,min(50,$limit)));$st->execute([$uid,$animalId,$animalId]);return $st->fetchAll()?:[];}catch(Throwable){return [];} }
function ir_days_from_text(?string $value,int $fallback=0): int {
    $value=trim((string)$value);if($value==='')return $fallback;
    if(preg_match_all('~\d+~',$value,$m)&&!empty($m[0])){$nums=array_map('intval',$m[0]);if(count($nums)>=2)return max(1,(int)round(($nums[0]+$nums[1])/2));return max(1,$nums[0]);}
    return $fallback;
}
function ir_repro_autofill(PDO $pdo,int $uid,array $vals): array {
    $species=[];$sid=(int)($vals['druh_id']??0);if($sid&&ir_table_exists($pdo,'wp_ir2_druhy')){try{$q=$pdo->prepare('SELECT * FROM wp_ir2_druhy WHERE user_id=? AND id=? LIMIT 1');$q->execute([$uid,$sid]);$species=$q->fetch()?:[];}catch(Throwable){}}
    $phase=(string)($vals['aktualni_faze']??'Příprava');$today=date('Y-m-d');
    if(empty($vals['predpoklad_lihnuti'])&&!empty($vals['datum_snusky'])){$days=ir_days_from_text((string)($species['delka_inkubace']??''),0);if($days>0)$vals['predpoklad_lihnuti']=(new DateTimeImmutable((string)$vals['datum_snusky']))->modify('+'.$days.' days')->format('Y-m-d');}
    if(empty($vals['dalsi_akce']))$vals['dalsi_akce']=ir_repro_next_action_for_phase($phase);
    if(empty($vals['dalsi_akce_datum'])){
        $base=null;$days=0;
        if($phase==='Příprava'){$base=$vals['datum_zahajeni']?:$today;$days=7;}
        elseif($phase==='Cyklování'){$base=$vals['datum_zahajeni']?:$today;$days=14;}
        elseif($phase==='Spojení páru'){$base=$vals['datum_zahajeni']?:$today;$days=3;}
        elseif($phase==='Páření'){$base=$vals['datum_pareni']?:$today;$days=14;}
        elseif($phase==='Ovulace'){$base=$vals['datum_ovulace']?:$today;$days=18;}
        elseif($phase==='Předsnůškový svlek'){$base=$vals['datum_pos']?:$today;$days=28;}
        elseif($phase==='Snůška'){$base=$vals['datum_snusky']?:$today;$days=1;}
        elseif($phase==='Inkubace'&&!empty($vals['predpoklad_lihnuti'])){$vals['dalsi_akce_datum']=$vals['predpoklad_lihnuti'];}
        elseif($phase==='Líhnutí'){$base=$vals['datum_lihnuti']??$today;$days=1;}
        if(empty($vals['dalsi_akce_datum'])&&$base&&$days>0)$vals['dalsi_akce_datum']=(new DateTimeImmutable((string)$base))->modify('+'.$days.' days')->format('Y-m-d');
    }
    return $vals;
}
function ir_group_care_summary(PDO $pdo,int $uid): array {
    $out=['groups'=>0,'members'=>0,'due_feed'=>0];if(!ir_table_exists($pdo,'wp_ir2_skupiny')||!ir_table_exists($pdo,'wp_ir2_skupiny_clenove'))return $out;
    try{$q=$pdo->prepare("SELECT s.id,COUNT(c.zvire_id) members FROM wp_ir2_skupiny s JOIN wp_ir2_skupiny_clenove c ON c.skupina_id=s.id AND c.user_id=s.user_id AND c.datum_do IS NULL AND c.stav='Ve skupině' WHERE s.user_id=? GROUP BY s.id");$q->execute([$uid]);$rows=$q->fetchAll()?:[];$out['groups']=count($rows);$out['members']=array_sum(array_map(fn($r)=>(int)$r['members'],$rows));foreach($rows as $r){$st=$pdo->prepare("SELECT z.* FROM wp_ir2_zvirata z JOIN wp_ir2_skupiny_clenove c ON c.zvire_id=z.id AND c.user_id=z.user_id WHERE c.user_id=? AND c.skupina_id=? AND c.datum_do IS NULL AND c.stav='Ve skupině'");$st->execute([$uid,(int)$r['id']]);foreach($st->fetchAll()?:[] as $a){$last=ir_scalar($pdo,"SELECT MAX(datum) FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ='Krmení'",[$uid,(int)$a['id']],null);$days=ir_feeding_interval_days($pdo,$uid,$a);if(!$last||strtotime('+'.$days.' days',strtotime((string)$last))<=strtotime(date('Y-m-d'))){$out['due_feed']++;break;}}}}catch(Throwable){}return $out;
}
function ir_repro_phase_plan(PDO $pdo,int $uid,int $speciesId): array {
    if($speciesId<=0||!ir_table_exists($pdo,'wp_ir2_repro_faze'))return [];
    try{$q=$pdo->prepare('SELECT faze,delka_dni_od,delka_dni_do,pokyny,poradi FROM wp_ir2_repro_faze WHERE user_id=? AND druh_id=? ORDER BY poradi,id');$q->execute([$uid,$speciesId]);return $q->fetchAll()?:[];}catch(Throwable){return [];}
}
function ir_repro_phase_window(PDO $pdo,int $uid,int $speciesId,string $phase): array {
    foreach(ir_repro_phase_plan($pdo,$uid,$speciesId) as $row)if(mb_strtolower(trim((string)$row['faze']))===mb_strtolower(trim($phase)))return ['from'=>(int)($row['delka_dni_od']??0),'to'=>(int)($row['delka_dni_do']??0),'instructions'=>(string)($row['pokyny']??'')];
    return ['from'=>0,'to'=>0,'instructions'=>''];
}
function ir_repro_advance_cycle(PDO $pdo,int $uid,int $cycleId): array {
    $q=$pdo->prepare('SELECT * FROM wp_ir2_snusky WHERE user_id=? AND id=? LIMIT 1 FOR UPDATE');$q->execute([$uid,$cycleId]);$cycle=$q->fetch();if(!$cycle)throw new RuntimeException('Reprodukční cyklus nebyl nalezen.');
    $fallback=['Příprava','Cyklování','Spojení páru','Páření','Ovulace','Předsnůškový svlek','Snůška','Inkubace','Líhnutí','Ukončení'];
    $plan=ir_repro_phase_plan($pdo,$uid,(int)($cycle['druh_id']??0));$names=$plan?array_values(array_map(static fn($r)=>(string)$r['faze'],$plan)):$fallback;
    $current=trim((string)($cycle['aktualni_faze']??'Příprava'));$idx=null;foreach($names as $i=>$name)if(mb_strtolower(trim($name))===mb_strtolower($current)){$idx=$i;break;}
    if($idx===null)$idx=-1;$next=$names[$idx+1]??'Ukončení';$final=mb_strtolower($next)===mb_strtolower('Ukončení');
    $window=ir_repro_phase_window($pdo,$uid,(int)($cycle['druh_id']??0),$next);$nextDate=null;
    if(!$final){$days=max(0,(int)$window['from']);if($days>0)$nextDate=(new DateTimeImmutable('today'))->modify('+'.$days.' days')->format('Y-m-d');else $nextDate=(new DateTimeImmutable('today'))->modify('+1 day')->format('Y-m-d');}
    $state=$final?'Ukončeno':(mb_strtolower($next)===mb_strtolower('Inkubace')?'Inkubace':'Aktivní');$action=$final?'Hotovo':ir_repro_next_action_for_phase($next);
    $pdo->prepare('UPDATE wp_ir2_snusky SET aktualni_faze=?,stav=?,dalsi_akce=?,dalsi_akce_datum=?,datum_ukonceni=CASE WHEN ? THEN CURDATE() ELSE datum_ukonceni END WHERE user_id=? AND id=?')->execute([$next,$state,$action,$nextDate,$final?1:0,$uid,$cycleId]);
    ir_sync_repro_task($pdo,$uid,$cycleId);return ['phase'=>$next,'state'=>$state,'date'=>$nextDate,'window'=>$window];
}
function ir_repro_next_action_for_phase(string $phase): string { return ['Příprava'=>'Zahájit cyklování','Cyklování'=>'Spojit pár','Spojení páru'=>'Sledovat páření','Páření'=>'Sledovat ovulaci','Ovulace'=>'Sledovat předsnůškový svlek','Předsnůškový svlek'=>'Připravit snáškové místo','Snůška'=>'Zahájit inkubaci','Inkubace'=>'Kontrolovat inkubaci','Líhnutí'=>'Založit karty mláďat','Ukončení'=>'Hotovo','Ukončeno'=>'Hotovo'][$phase]??'Kontrola cyklu'; }
function ir_sync_repro_task(PDO $pdo,int $uid,int $cycleId): void { if(!ir_table_exists($pdo,'wp_ir2_snusky')||!ir_table_exists($pdo,'wp_ir2_planovac'))return;$q=$pdo->prepare('SELECT * FROM wp_ir2_snusky WHERE id=? AND user_id=? LIMIT 1');$q->execute([$cycleId,$uid]);$c=$q->fetch();if(!$c)return;$marker='[IR-REPRO:'.$cycleId.']';$q=$pdo->prepare("SELECT id FROM wp_ir2_planovac WHERE user_id=? AND poznamka LIKE ? AND stav='Aktivní' ORDER BY id DESC");$q->execute([$uid,$marker.'%']);$ids=array_map('intval',$q->fetchAll(PDO::FETCH_COLUMN)?:[]);if(!in_array((string)$c['stav'],['Aktivní','Inkubace'],true)||empty($c['dalsi_akce_datum'])){foreach($ids as $taskId)$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Zrušeno' WHERE user_id=? AND id=?")->execute([$uid,$taskId]);return;}$date=(string)$c['dalsi_akce_datum'];$title=trim((string)($c['dalsi_akce']??''))?:ir_repro_next_action_for_phase((string)($c['aktualni_faze']??'Příprava'));$animalId=(int)($c['matka_id']?:$c['otec_id'])?:null;$keep=array_shift($ids);foreach($ids as $taskId)$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Zrušeno' WHERE user_id=? AND id=?")->execute([$uid,$taskId]);$note=$marker.' Cyklus: '.trim((string)$c['nazev']);if($keep)$pdo->prepare("UPDATE wp_ir2_planovac SET zvire_id=?,nazev_ukolu=?,kategorie='Reprodukce',datum_termin=?,poznamka=? WHERE user_id=? AND id=?")->execute([$animalId,$title,$date,$note,$uid,$keep]);else $pdo->prepare("INSERT INTO wp_ir2_planovac(user_id,zvire_id,nazev_ukolu,kategorie,datum_termin,priorita,stav,opakovani,poznamka) VALUES(?,?,?,'Reprodukce',?,'Normální','Aktivní','none',?)")->execute([$uid,$animalId,$title,$date,$note]); }


function ir_sync_feed_task(PDO $pdo,int $uid,array $animal,string $baseDate,bool $refused=false): void {
    $marker=$refused?'[IR-CORE:REFEED:'.$animal['id'].']':'[IR-CORE:FEED:'.$animal['id'].']';
    if(ir_is_brumming($pdo,$uid,(int)$animal['id'],substr($baseDate,0,10))){try{$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Zrušeno' WHERE user_id=? AND zvire_id=? AND stav='Aktivní' AND poznamka LIKE ?")->execute([$uid,(int)$animal['id'],$marker.'%']);}catch(Throwable){}return;}
    $days=$refused?ir_refeed_interval_days($pdo,$uid,$animal):ir_feeding_interval_days($pdo,$uid,$animal);$due=date('Y-m-d',strtotime(substr($baseDate,0,10).' +'.$days.' days'));
    $baseFeed=ir_animal_default_feed_value($pdo,$uid,$animal);$rec=ir_supplement_recommendation($pdo,$uid,$animal,$due);$supp=(string)($rec['winner']['name']??'');$planned=ir_compose_feed_value($baseFeed,$supp);
    $title=$refused?'Znovu nabídnout potravu':'Krmení';if($planned!=='')$title.=' · '.$planned;
    try{$st=$pdo->prepare("SELECT id FROM wp_ir2_planovac WHERE user_id=? AND zvire_id=? AND poznamka LIKE ? AND stav='Aktivní' ORDER BY id DESC LIMIT 1");$st->execute([$uid,(int)$animal['id'],$marker.'%']);$id=(int)$st->fetchColumn();$note=$marker."\nAutomaticky z historie aktivit. Interval: {$days} dní.".($planned!==''?"\nPlánovaný typ: {$planned}":'');if($id){$pdo->prepare("UPDATE wp_ir2_planovac SET nazev_ukolu=?,kategorie='Péče',datum_termin=?,stav='Aktivní',opakovani='none',interval_hodnota=?,poznamka=? WHERE user_id=? AND id=?")->execute([$title,$due,$days,$note,$uid,$id]);}else{$pdo->prepare("INSERT INTO wp_ir2_planovac(user_id,zvire_id,nazev_ukolu,kategorie,datum_termin,priorita,stav,opakovani,interval_hodnota,poznamka) VALUES(?,?,?,'Péče',?,'Normální','Aktivní','none',?,?)")->execute([$uid,(int)$animal['id'],$title,$due,$days,$note]);}}catch(Throwable $e){error_log('IR feed task sync: '.$e->getMessage());throw $e;}
}

function ir_complete_related_task(PDO $pdo,int $uid,int $animalId,string $type,string $date): void {
    $pattern = match($type){
        'Krmení','Odmítnutí potravy' => '%Krmen%',
        'Vážení' => '%Váž%',
        'Svlek' => '%Svlek%',
        'Čištění' => '%Čiště%',
        'Výměna vody' => '%vod%',
        'Rosení' => '%Rosen%',
        'Zdravotní kontrola' => '%kontrol%',
        default => '%'.str_replace(['%','_'],['\%','\_'],$type).'%'
    };
    try{
        $st=$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Hotovo' WHERE user_id=? AND zvire_id=? AND stav='Aktivní' AND datum_termin<=? AND nazev_ukolu LIKE ?");
        $st->execute([$uid,$animalId,substr($date,0,10),$pattern]);
    }catch(Throwable){}
}


function ir_automation_ensure_table(PDO $pdo): void {
    if(ir_table_exists($pdo,'wp_ir2_automation_rules'))return;
    if($pdo->inTransaction())throw new RuntimeException('Nejdřív spusť databázovou migraci automatizací.');
    try{$pdo->exec("CREATE TABLE IF NOT EXISTS wp_ir2_automation_rules (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,user_id BIGINT UNSIGNED NOT NULL,title VARCHAR(180) NOT NULL,trigger_type VARCHAR(120) NOT NULL,delay_days INT NOT NULL DEFAULT 0,task_title VARCHAR(180) NOT NULL,task_category VARCHAR(80) NOT NULL DEFAULT 'Péče',enabled TINYINT(1) NOT NULL DEFAULT 1,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,PRIMARY KEY(id),KEY user_enabled(user_id,enabled),KEY trigger_idx(user_id,trigger_type)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");}catch(Throwable $e){error_log('IR automation table: '.$e->getMessage());}
}
function ir_run_activity_automations(PDO $pdo,int $uid,array $animal,string $type,string $date): void {
    ir_automation_ensure_table($pdo);$animalId=(int)($animal['id']??0);if($animalId<=0)return;
    try{$st=$pdo->prepare('SELECT * FROM wp_ir2_automation_rules WHERE user_id=? AND enabled=1 AND trigger_type=? ORDER BY id');$st->execute([$uid,$type]);foreach($st->fetchAll()?:[] as $r){$due=(new DateTimeImmutable(substr($date,0,10)))->modify('+'.max(0,(int)$r['delay_days']).' days')->format('Y-m-d');$marker='[IR-AUTO:'.(int)$r['id'].':'.$animalId.':'.substr($date,0,10).']';$check=$pdo->prepare("SELECT id FROM wp_ir2_planovac WHERE user_id=? AND zvire_id=? AND poznamka LIKE ? LIMIT 1");$check->execute([$uid,$animalId,'%'.$marker.'%']);if($check->fetchColumn())continue;$note=$marker.' Automaticky vytvořeno po aktivitě: '.$type;$pdo->prepare("INSERT INTO wp_ir2_planovac(user_id,zvire_id,nazev_ukolu,kategorie,datum_termin,cas_termin,priorita,stav,opakovani,poznamka) VALUES(?,?,?,?,?,NULL,'Normální','Aktivní','none',?)")->execute([$uid,$animalId,(string)$r['task_title'],(string)$r['task_category'],$due,$note]);}}catch(Throwable $e){error_log('IR automation run: '.$e->getMessage());}
}

function ir_log_activity(PDO $pdo,int $uid,int $animalId,string $type,string $date,string $value='',string $detail=''): int {
    $animal=ir_animal($pdo,$uid,$animalId);if(!$animal)throw new RuntimeException('Zvíře nebylo nalezeno.');$type=trim($type);if($type==='')throw new RuntimeException('Chybí typ aktivity.');$dt=strtotime($date);if(!$dt)throw new RuntimeException('Neplatné datum.');$dateSql=date('Y-m-d H:i:s',$dt);$baseFeed=$value;$recommendation=[];$effect=['version'=>2,'source'=>'none','base_feed'=>''];
    if($type==='Krmení'){$baseFeed=trim($value)!==''?trim($value):ir_animal_default_feed_value($pdo,$uid,$animal);if($baseFeed==='')throw new RuntimeException('Na kartě zvířete nastav Typ krmení nebo vyplň krmivo.');$recommendation=ir_supplement_recommendation($pdo,$uid,$animal,substr($dateSql,0,10));$supp=(string)($recommendation['winner']['name']??'');$value=ir_compose_feed_value($baseFeed,$supp);if($supp!==''){$suppText='Suplement: '.$supp;$detail=trim($detail)===''?$suppText:trim($detail).' · '.$suppText;}$effect=ir_supplement_snapshot($pdo,$uid,$animalId,$recommendation,$baseFeed);}
    $st=$pdo->prepare("INSERT INTO wp_ir2_pece(user_id,zvire_id,typ,datum,hodnota,detail,supplement_effect) VALUES(?,?,?,?,?,?,?)");$st->execute([$uid,$animalId,$type,$dateSql,$value!==''?$value:null,$detail!==''?$detail:null,json_encode($effect,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]);$id=(int)$pdo->lastInsertId();
    if($type==='Vážení'&&is_numeric(str_replace(',','.',$value))){$v=(float)str_replace(',','.',$value);$pdo->prepare("UPDATE wp_ir2_zvirata SET aktualni_vaha=?,upraveno=NOW() WHERE user_id=? AND id=?")->execute([$v,$uid,$animalId]);}
    if($type==='Délka'&&is_numeric(str_replace(',','.',$value))){$v=(float)str_replace(',','.',$value);$pdo->prepare("UPDATE wp_ir2_zvirata SET aktualni_delka=?,upraveno=NOW() WHERE user_id=? AND id=?")->execute([$v,$uid,$animalId]);}
    ir_complete_related_task($pdo,$uid,$animalId,$type,$dateSql);
    if($type==='Krmení'){ir_feed_inventory_decrement($pdo,$uid,$baseFeed);ir_advance_supplement_after_feeding($pdo,$uid,$animal,$recommendation,substr($dateSql,0,10));ir_finish_supplement_effect($pdo,$uid,$id,$animalId,$effect);ir_sync_feed_task($pdo,$uid,$animal,$dateSql,false);}
    if($type==='Odmítnutí potravy')ir_sync_feed_task($pdo,$uid,$animal,$dateSql,true);ir_run_activity_automations($pdo,$uid,$animal,$type,$dateSql);return $id;
}
function ir_update_activity(PDO $pdo,int $uid,int $id,string $type,string $date,string $value='',string $detail=''): void {
    $st=$pdo->prepare("SELECT * FROM wp_ir2_pece WHERE user_id=? AND id=? LIMIT 1");$st->execute([$uid,$id]);$old=$st->fetch();if(!$old)throw new RuntimeException('Záznam nebyl nalezen.');$dt=strtotime($date);if(!$dt)throw new RuntimeException('Neplatné datum.');$animal=ir_animal($pdo,$uid,(int)$old['zvire_id']);if(!$animal)throw new RuntimeException('Zvíře nebylo nalezeno.');
    if((string)$old['typ']==='Krmení'){if(!ir_undo_supplement_effect($pdo,$uid,$old))throw new RuntimeException('Tento starší záznam krmení už navazuje na další suplementační krok. Uprav nejprve novější krmení.');ir_feed_inventory_increment($pdo,$uid,ir_activity_base_feed($old));}
    $dateSql=date('Y-m-d H:i:s',$dt);$baseFeed=$value;$effect=['version'=>2,'source'=>'none','base_feed'=>''];$recommendation=[];
    if($type==='Krmení'){$baseFeed=trim($value)!==''?trim($value):ir_animal_default_feed_value($pdo,$uid,$animal);if($baseFeed==='')throw new RuntimeException('Na kartě zvířete nastav Typ krmení nebo vyplň krmivo.');$recommendation=ir_supplement_recommendation($pdo,$uid,$animal,substr($dateSql,0,10));$supp=(string)($recommendation['winner']['name']??'');$value=ir_compose_feed_value($baseFeed,$supp);$detail=preg_replace('~(?:\s*·\s*)?Suplement:\s*[^·]+~u','',trim($detail))??trim($detail);if($supp!=='')$detail=trim($detail)===''?'Suplement: '.$supp:trim($detail).' · Suplement: '.$supp;$effect=ir_supplement_snapshot($pdo,$uid,(int)$old['zvire_id'],$recommendation,$baseFeed);}
    $pdo->prepare("UPDATE wp_ir2_pece SET typ=?,datum=?,hodnota=?,detail=?,supplement_effect=? WHERE user_id=? AND id=?")->execute([$type,$dateSql,$value!==''?$value:null,$detail!==''?$detail:null,json_encode($effect,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$uid,$id]);
    if($type==='Krmení'){ir_feed_inventory_decrement($pdo,$uid,$baseFeed);ir_advance_supplement_after_feeding($pdo,$uid,$animal,$recommendation,substr($dateSql,0,10));ir_finish_supplement_effect($pdo,$uid,$id,(int)$old['zvire_id'],$effect);ir_sync_feed_task($pdo,$uid,$animal,$dateSql,false);}elseif($type==='Odmítnutí potravy')ir_sync_feed_task($pdo,$uid,$animal,$dateSql,true);else ir_resync_feed_task($pdo,$uid,(int)$old['zvire_id']);
    ir_complete_related_task($pdo,$uid,(int)$old['zvire_id'],$type,$dateSql);
}
function ir_delete_activity(PDO $pdo,int $uid,int $id): void {
    $st=$pdo->prepare("SELECT * FROM wp_ir2_pece WHERE user_id=? AND id=? LIMIT 1");$st->execute([$uid,$id]);$old=$st->fetch();if(!$old)return;$animalId=(int)$old['zvire_id'];if((string)$old['typ']==='Krmení'){if(!ir_undo_supplement_effect($pdo,$uid,$old))throw new RuntimeException('Tento starší záznam krmení už navazuje na další suplementační krok. Smaž nejprve novější krmení.');ir_feed_inventory_increment($pdo,$uid,ir_activity_base_feed($old));}ir_cancel_future_automation_tasks($pdo,$uid,$animalId,(string)$old['typ'],(string)$old['datum']);$pdo->prepare("DELETE FROM wp_ir2_pece WHERE user_id=? AND id=?")->execute([$uid,$id]);ir_resync_feed_task($pdo,$uid,$animalId);
}



function ir_column_exists(PDO $pdo,string $table,string $column): bool {try{$q=$pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?');$q->execute([$table,$column]);return (int)$q->fetchColumn()>0;}catch(Throwable){return false;}}

/* === Planner brain / central synchronization ================================= */
function ir_planner_upsert_source_task(PDO $pdo,int $uid,?int $animalId,string $marker,string $title,string $category,?string $date,int $interval=0,string $priority='Normální'): void {
    if(!ir_table_exists($pdo,'wp_ir2_planovac'))return;
    $q=$pdo->prepare("SELECT id FROM wp_ir2_planovac WHERE user_id=? AND stav='Aktivní' AND poznamka LIKE ? ORDER BY id");
    $q->execute([$uid,'%'.$marker.'%']);$ids=array_map('intval',$q->fetchAll(PDO::FETCH_COLUMN)?:[]);$keep=$date!==null?array_shift($ids):null;
    foreach($ids as $tid)$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Zrušeno' WHERE user_id=? AND id=?")->execute([$uid,$tid]);
    if($date===null)return;
    if($keep){$pdo->prepare("UPDATE wp_ir2_planovac SET zvire_id=?,nazev_ukolu=?,kategorie=?,datum_termin=?,priorita=?,stav='Aktivní',opakovani='none',interval_hodnota=?,poznamka=? WHERE user_id=? AND id=?")->execute([$animalId,$title,$category,$date,$priority,$interval?:null,$marker,$uid,$keep]);}
    else{$pdo->prepare("INSERT INTO wp_ir2_planovac(user_id,zvire_id,nazev_ukolu,kategorie,datum_termin,priorita,stav,opakovani,interval_hodnota,poznamka) VALUES(?,?,?,?,?,?,'Aktivní','none',?,?)")->execute([$uid,$animalId,$title,$category,$date,$priority,$interval?:null,$marker]);}
}
function ir_sync_health_tasks(PDO $pdo,int $uid): int {
    if(!ir_table_exists($pdo,'wp_ir2_zdravi')||!ir_table_exists($pdo,'wp_ir2_planovac'))return 0;$count=0;
    try{$q=$pdo->prepare("SELECT id,zvire_id,datum_do,status FROM wp_ir2_zdravi WHERE user_id=?");$q->execute([$uid]);foreach($q->fetchAll()?:[] as $r){$due=((string)$r['status']!=='Ukončeno'&&!empty($r['datum_do']))?substr((string)$r['datum_do'],0,10):null;ir_planner_upsert_source_task($pdo,$uid,(int)$r['zvire_id'],'[IR-HEALTH:'.(int)$r['id'].']','Kontrola léčby','Zdraví',$due,0,'Vysoká');if($due)$count++;}}catch(Throwable $e){error_log('IR health sync: '.$e->getMessage());}return $count;
}
function ir_sync_all_repro_tasks(PDO $pdo,int $uid): int {if(!ir_table_exists($pdo,'wp_ir2_snusky'))return 0;$n=0;try{$q=$pdo->prepare('SELECT id FROM wp_ir2_snusky WHERE user_id=?');$q->execute([$uid]);foreach($q->fetchAll(PDO::FETCH_COLUMN)?:[] as $id){ir_sync_repro_task($pdo,$uid,(int)$id);$n++;}}catch(Throwable $e){error_log('IR repro all sync: '.$e->getMessage());}return $n;}
function ir_sync_group_feed_tasks(PDO $pdo,int $uid): int {
    if(!ir_table_exists($pdo,'wp_ir2_skupiny')||!ir_table_exists($pdo,'wp_ir2_skupiny_clenove')||!ir_table_exists($pdo,'wp_ir2_planovac'))return 0;
    $n=0;
    try{
        $q=$pdo->prepare("SELECT id,nazev FROM wp_ir2_skupiny WHERE user_id=? AND status='Aktivní' ORDER BY id");$q->execute([$uid]);
        foreach($q->fetchAll()?:[] as $g){
            $gid=(int)$g['id'];$marker='[IR-GROUP:FEED:'.$gid.']';
            $m=$pdo->prepare("SELECT z.* FROM wp_ir2_skupiny_clenove c JOIN wp_ir2_zvirata z ON z.id=c.zvire_id AND z.user_id=c.user_id WHERE c.user_id=? AND c.skupina_id=? AND c.datum_do IS NULL AND c.stav='Ve skupině' AND ".ir_status_active_sql('z'));
            $m->execute([$uid,$gid]);$members=$m->fetchAll()?:[];$due=null;
            foreach($members as $a){
                if(ir_is_brumming($pdo,$uid,(int)$a['id']))continue;
                $last=ir_scalar($pdo,"SELECT MAX(datum) FROM wp_ir2_pece WHERE user_id=? AND zvire_id=? AND typ='Krmení'",[$uid,(int)$a['id']],null);
                $base=$last?substr((string)$last,0,10):date('Y-m-d');$candidate=date('Y-m-d',strtotime($base.' +'.ir_feeding_interval_days($pdo,$uid,$a).' days'));
                if($due===null||$candidate<$due)$due=$candidate;
                try{$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Zrušeno' WHERE user_id=? AND zvire_id=? AND stav='Aktivní' AND (poznamka LIKE '[IR-CORE:FEED:%' OR poznamka LIKE '[IR-CORE:REFEED:%')")->execute([$uid,(int)$a['id']]);}catch(Throwable){}
            }
            ir_planner_upsert_source_task($pdo,$uid,null,$marker,'Krmení skupiny · '.trim((string)$g['nazev']),'Krmení',$members?$due:null,0,'Normální');
            if($members)$n++;
        }
    }catch(Throwable $e){error_log('IR group feed sync: '.$e->getMessage());}
    return $n;
}
function ir_sync_all_feed_tasks(PDO $pdo,int $uid): int {
    if(!ir_table_exists($pdo,'wp_ir2_zvirata'))return 0;$n=0;$grouped=array_flip(ir_group_membership_ids($pdo,$uid));
    try{$q=$pdo->prepare("SELECT id FROM wp_ir2_zvirata z WHERE user_id=? AND ".ir_status_active_sql('z')." AND COALESCE(pohlavi,'') NOT IN ('Skupina','Pár')");$q->execute([$uid]);foreach($q->fetchAll(PDO::FETCH_COLUMN)?:[] as $id){$id=(int)$id;if(isset($grouped[$id]))continue;ir_resync_feed_task($pdo,$uid,$id);$n++;}}catch(Throwable $e){error_log('IR feed all sync: '.$e->getMessage());}
    return $n+ir_sync_group_feed_tasks($pdo,$uid);
}
function ir_planner_brain_sync(PDO $pdo,int $uid): array {$out=['feeding'=>0,'reproduction'=>0,'health'=>0,'duplicates'=>0,'conflicts'=>0];$out['feeding']=ir_sync_all_feed_tasks($pdo,$uid);$out['reproduction']=ir_sync_all_repro_tasks($pdo,$uid);$out['health']=ir_sync_health_tasks($pdo,$uid);try{$q=$pdo->prepare("SELECT poznamka,COUNT(*) c FROM wp_ir2_planovac WHERE user_id=? AND stav='Aktivní' AND poznamka LIKE '[IR-%' GROUP BY poznamka HAVING COUNT(*)>1");$q->execute([$uid]);$out['duplicates']=count($q->fetchAll()?:[]);}catch(Throwable){}$out['conflicts']=ir_planner_conflict_summary($pdo,$uid)['animals'];return $out;}
function ir_planner_priority_weight(string $priority): int { return ['Kritická'=>400,'Vysoká'=>300,'Normální'=>200,'Nízká'=>100][$priority]??200; }
function ir_planner_category_weight(string $category): int { return ['Zdraví'=>60,'Reprodukce'=>50,'Krmení'=>40,'Péče'=>30,'Údržba'=>20,'Kontrola'=>10][$category]??0; }
function ir_planner_task_score(array $task): int { $score=ir_planner_priority_weight((string)($task['priorita']??'Normální'))+ir_planner_category_weight((string)($task['kategorie']??''));$d=(string)($task['datum_termin']??'');if($d!==''){$delta=(int)floor((strtotime(date('Y-m-d'))-strtotime($d))/86400);if($delta>0)$score+=min(90,$delta*5);elseif($delta===0)$score+=25;}return $score; }
function ir_planner_task_state(array $task): string {$d=(string)($task['datum_termin']??'');if((string)($task['stav']??'')!=='Aktivní')return 'done';if($d<date('Y-m-d'))return 'overdue';if($d===date('Y-m-d'))return 'today';return 'upcoming';}
function ir_planner_order_tasks(array $tasks): array {usort($tasks,static function(array $a,array $b): int {$da=(string)($a['datum_termin']??'9999-12-31');$db=(string)($b['datum_termin']??'9999-12-31');if($da!==$db)return $da<=>$db;$score=ir_planner_task_score($b)<=>ir_planner_task_score($a);if($score!==0)return $score;$ta=(string)($a['cas_termin']??'23:59:59');$tb=(string)($b['cas_termin']??'23:59:59');return $ta<=>$tb;});return $tasks;}
function ir_planner_conflict_summary(PDO $pdo,int $uid,int $days=14): array {$out=['dates'=>0,'animals'=>0,'tasks'=>0,'critical'=>0];if(!ir_table_exists($pdo,'wp_ir2_planovac'))return $out;try{$to=(new DateTimeImmutable('today'))->modify('+'.max(1,$days).' days')->format('Y-m-d');$q=$pdo->prepare("SELECT datum_termin,COALESCE(zvire_id,0) animal_id,COUNT(*) c,MAX(CASE WHEN priorita IN ('Kritická','Vysoká') THEN 1 ELSE 0 END) hi FROM wp_ir2_planovac WHERE user_id=? AND stav='Aktivní' AND datum_termin BETWEEN CURDATE() AND ? GROUP BY datum_termin,COALESCE(zvire_id,0) HAVING COUNT(*)>1");$q->execute([$uid,$to]);$rows=$q->fetchAll()?:[];$out['dates']=count(array_unique(array_column($rows,'datum_termin')));$out['animals']=count($rows);$out['tasks']=array_sum(array_map(static fn($r)=>(int)$r['c'],$rows));$out['critical']=array_sum(array_map(static fn($r)=>(int)$r['hi'],$rows));}catch(Throwable){}return $out;}
function ir_cancel_future_automation_tasks(PDO $pdo,int $uid,int $animalId,string $type,string $activityDate): void {if(!ir_table_exists($pdo,'wp_ir2_automation_rules')||!ir_table_exists($pdo,'wp_ir2_planovac'))return;try{$q=$pdo->prepare('SELECT id FROM wp_ir2_automation_rules WHERE user_id=? AND enabled=1 AND trigger_type=?');$q->execute([$uid,$type]);foreach($q->fetchAll(PDO::FETCH_COLUMN)?:[] as $rid){$marker='[IR-AUTO:'.(int)$rid.':'.$animalId.':'.substr($activityDate,0,10).']';$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Zrušeno' WHERE user_id=? AND stav='Aktivní' AND poznamka LIKE ?")->execute([$uid,'%'.$marker.'%']);}}catch(Throwable $e){error_log('IR automation cancel: '.$e->getMessage());}}
function ir_task_activity_type(array $task): ?string {$note=(string)($task['poznamka']??'');$title=(string)($task['nazev_ukolu']??'');if(str_contains($note,'[IR-CORE:FEED:')||($task['kategorie']??'')==='Krmení')return 'Krmení';if(str_contains($note,'[IR-CORE:REFEED:'))return 'Odmítnutí potravy';foreach(['Vážení','Svlek','Čištění','Výměna vody','Rosení','Zdravotní kontrola','Kontrola'] as $t)if(mb_stripos($title,$t)!==false)return $t;return null;}
function ir_complete_planner_task(PDO $pdo,int $uid,int $taskId,bool $recordActivity=true): void {
    $lock='ir-task:'.$uid.':'.$taskId;
    $q=$pdo->prepare('SELECT GET_LOCK(?,5)');$q->execute([$lock]);
    if((int)$q->fetchColumn()!==1)throw new RuntimeException('Úkol právě zpracovává jiný požadavek.');
    $transaction=!$pdo->inTransaction();
    try { if($transaction)$pdo->beginTransaction();ir_complete_planner_task_locked($pdo,$uid,$taskId,$recordActivity);if($transaction)$pdo->commit(); }
    catch(Throwable $e){if($transaction&&$pdo->inTransaction())$pdo->rollBack();throw $e;}
    finally { $q=$pdo->prepare('SELECT RELEASE_LOCK(?)');$q->execute([$lock]); }
}
function ir_complete_planner_task_locked(PDO $pdo,int $uid,int $taskId,bool $recordActivity=true): void {
    $q=$pdo->prepare('SELECT * FROM wp_ir2_planovac WHERE user_id=? AND id=? LIMIT 1 FOR UPDATE');$q->execute([$uid,$taskId]);$task=$q->fetch();if(!$task)throw new RuntimeException('Úkol nebyl nalezen.');if((string)$task['stav']!=='Aktivní')return;
    $note=(string)($task['poznamka']??'');
    if($recordActivity&&preg_match('~\[IR-GROUP:FEED:(\d+)\]~',$note,$m)){
        $gid=(int)$m[1];$st=$pdo->prepare("SELECT z.id FROM wp_ir2_skupiny_clenove c JOIN wp_ir2_zvirata z ON z.id=c.zvire_id AND z.user_id=c.user_id WHERE c.user_id=? AND c.skupina_id=? AND c.datum_do IS NULL AND c.stav='Ve skupině' AND ".ir_status_active_sql('z').' ORDER BY z.id');$st->execute([$uid,$gid]);
        /* BETA 1.0: group feeding fans out to individual member records in ONE batch (unified event service) */
        $results=[];foreach($st->fetchAll(PDO::FETCH_COLUMN)?:[] as $aid){if(ir_is_brumming($pdo,$uid,(int)$aid))$results[(int)$aid]='skip';}
        ir_event_group($pdo,$uid,$gid,'eaten',$results,['source'=>'planner','planner_task_id'=>$taskId,'note'=>'Splněno ze skupinového úkolu v Plánovači','allow_duplicate'=>true]);
        $pdo->prepare("UPDATE wp_ir2_planovac SET stav='Hotovo' WHERE user_id=? AND id=?")->execute([$uid,$taskId]);ir_sync_group_feed_tasks($pdo,$uid);return;
    }
    $type=$recordActivity?ir_task_activity_type($task):null;if($type&&!empty($task['zvire_id'])){$when=date('Y-m-d H:i:s');$careId=ir_event_record($pdo,$uid,['animal_id'=>(int)$task['zvire_id'],'type'=>$type==='Odmítnutí potravy'?'Krmení':$type,'performed_at'=>$when,'note'=>'Splněno z Plánovače','source'=>'planner','planner_task_id'=>$taskId,'allow_duplicate'=>true]);if(ir_column_exists($pdo,'wp_ir2_planovac','care_record_id'))$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Hotovo',care_record_id=? WHERE user_id=? AND id=?")->execute([$careId,$uid,$taskId]);else $pdo->prepare("UPDATE wp_ir2_planovac SET stav='Hotovo' WHERE user_id=? AND id=?")->execute([$uid,$taskId]);}else{$pdo->prepare("UPDATE wp_ir2_planovac SET stav='Hotovo' WHERE user_id=? AND id=?")->execute([$uid,$taskId]);}
}

function ir_activity_rows(PDO $pdo,int $uid,array $filters=[],int $limit=100): array {
    $w=['p.user_id=?'];$params=[$uid];
    if(!empty($filters['animal_id'])){$w[]='p.zvire_id=?';$params[]=(int)$filters['animal_id'];}
    if(!empty($filters['type'])){$w[]='p.typ=?';$params[]=(string)$filters['type'];}
    if(!empty($filters['from'])){$w[]='DATE(p.datum)>=?';$params[]=(string)$filters['from'];}
    if(!empty($filters['to'])){$w[]='DATE(p.datum)<=?';$params[]=(string)$filters['to'];}
    $limit=max(1,min(500,$limit));
    $sql="SELECT p.*,z.jmeno_kod,z.latinsky_nazev,z.druh,z.foto FROM wp_ir2_pece p JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE ".implode(' AND ',$w)." ORDER BY p.datum DESC,p.id DESC LIMIT {$limit}";
    try{$st=$pdo->prepare($sql);$st->execute($params);return $st->fetchAll()?:[];}catch(Throwable $e){error_log('IR activities: '.$e->getMessage());return [];}
}
function ir_needs_feed(PDO $pdo,int $uid,int $limit=200): array {
    $sql="SELECT z.*,MAX(CASE WHEN p.typ='Krmení' THEN p.datum END) AS last_feed FROM wp_ir2_zvirata z LEFT JOIN wp_ir2_pece p ON p.zvire_id=z.id AND p.user_id=z.user_id WHERE z.user_id=? AND ".ir_status_active_sql('z')." AND COALESCE(z.pohlavi,'') NOT IN ('Skupina','Pár') GROUP BY z.id ORDER BY last_feed IS NULL DESC,last_feed ASC LIMIT ".max(1,min(500,$limit));
    try{$st=$pdo->prepare($sql);$st->execute([$uid]);$rows=$st->fetchAll()?:[];}catch(Throwable){return [];}
    $out=[];$today=strtotime(date('Y-m-d'));$grouped=array_flip(ir_group_membership_ids($pdo,$uid));
    foreach($rows as $r){if(isset($grouped[(int)$r['id']]))continue;if(ir_is_brumming($pdo,$uid,(int)$r['id']))continue;$days=ir_feeding_interval_days($pdo,$uid,$r);$last=!empty($r['last_feed'])?strtotime((string)$r['last_feed']):null;$due=$last?strtotime('+'.$days.' days',$last):null;$r['feeding_interval_days']=$days;$r['feed_due_date']=$due?date('Y-m-d',$due):'';$r['feed_overdue_days']=$due?(int)floor(($today-$due)/86400):null;if(!$last||($due!==null&&$due<=$today))$out[]=$r;}
    usort($out,static function(array $a,array $b): int {$av=$a['feed_overdue_days'];$bv=$b['feed_overdue_days'];if($av===null&&$bv===null)return strnatcasecmp((string)($a['latinsky_nazev']??$a['jmeno_kod']??''),(string)($b['latinsky_nazev']??$b['jmeno_kod']??''));if($av===null)return 1;if($bv===null)return -1;return (int)$bv<=>(int)$av;});return $out;
}
function ir_group_membership_ids(PDO $pdo,int $uid): array {
    if(!ir_table_exists($pdo,'wp_ir2_skupiny_clenove'))return [];
    try{$st=$pdo->prepare("SELECT zvire_id FROM wp_ir2_skupiny_clenove WHERE user_id=? AND datum_do IS NULL AND stav='Ve skupině'");$st->execute([$uid]);return array_map('intval',array_column($st->fetchAll()?:[],'zvire_id'));}catch(Throwable){return [];}
}
function ir_ancestor_paths(PDO $pdo,int $uid,int $animalId,int $maxDepth=5): array {
    $paths=[];
    $walk=function(int $id,int $depth,array $seen) use (&$walk,&$paths,$pdo,$uid,$maxDepth){
        if($id<=0||$depth>$maxDepth||isset($seen[$id]))return;$seen[$id]=true;
        $a=ir_animal($pdo,$uid,$id);if(!$a)return;
        foreach(['otec_id','matka_id'] as $f){$pid=(int)($a[$f]??0);if($pid>0){if(!isset($paths[$pid])||$depth<$paths[$pid])$paths[$pid]=$depth;$walk($pid,$depth+1,$seen);}}
    };
    $walk($animalId,1,[]);return $paths;
}
function ir_inbreeding_pair(PDO $pdo,int $uid,int $fatherId,int $motherId): float {
    if($fatherId<=0||$motherId<=0)return 0.0;
    if($fatherId===$motherId)return 25.0;
    $a=ir_ancestor_paths($pdo,$uid,$fatherId);$b=ir_ancestor_paths($pdo,$uid,$motherId);$sum=0.0;
    foreach(array_intersect_key($a,$b) as $ancestor=>$n1){$n2=$b[$ancestor];$sum+=pow(0.5,$n1+$n2+1);}
    return round($sum*100,2);
}
function ir_age_label(?string $birth): string {
    $birth=trim((string)$birth);if($birth==='')return '—';
    if(preg_match('/^(\d{4})-(\d{2})$/',$birth,$m))$birth=$m[1].'-'.$m[2].'-15';
    $ts=strtotime($birth);if(!$ts)return $birth;$d=(new DateTimeImmutable('@'.$ts))->setTimezone(new DateTimeZone('Europe/Prague'));$now=new DateTimeImmutable('now',new DateTimeZone('Europe/Prague'));$diff=$d->diff($now);return $diff->y>0?$diff->y.' r. '.$diff->m.' m.':$diff->m.' m.';
}

function ir_user_setting_get(PDO $pdo,int $uid,string $key,string $default=''): string {
    if(!ir_table_exists($pdo,'wp_ir2_user_settings')) return $default;
    try{$st=$pdo->prepare("SELECT setting_value FROM wp_ir2_user_settings WHERE user_id=? AND setting_key=? LIMIT 1");$st->execute([$uid,$key]);$v=$st->fetchColumn();return $v===false?$default:(string)$v;}catch(Throwable){return $default;}
}
function ir_user_setting_set(PDO $pdo,int $uid,string $key,string $value): void {
    if(!ir_table_exists($pdo,'wp_ir2_user_settings')) throw new RuntimeException('Tabulka uživatelského nastavení není dostupná.');
    $st=$pdo->prepare("INSERT INTO wp_ir2_user_settings(user_id,setting_key,setting_value) VALUES(?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)");
    $st->execute([$uid,$key,substr($value,0,255)]);
}
function ir_user_setting_delete(PDO $pdo,int $uid,string $key): void {
    if(!ir_table_exists($pdo,'wp_ir2_user_settings')) return;
    $pdo->prepare("DELETE FROM wp_ir2_user_settings WHERE user_id=? AND setting_key=?")->execute([$uid,$key]);
}
function ir_custom_action_decode(string $value,string $settingKey=''): ?array {
    $value=trim($value); if($value==='') return null;
    $json=json_decode($value,true);
    if(is_array($json)){
        $label=trim((string)($json['label']??'')); if($label==='') return null;
        $category=trim((string)($json['category']??'Vlastní'))?:'Vlastní';
        $icon=trim((string)($json['icon']??'tasks'))?:'tasks';
        $feeding=!empty($json['feeding']) || in_array(strtolower($category),['krmení','krmeni','feeding','feedings'],true);
        return ['label'=>$label,'icon'=>$icon,'category'=>$category,'feeding'=>$feeding,'value'=>'Hodnota','detail'=>'Poznámka','planner'=>null,'setting_key'=>$settingKey];
    }
    $parts=explode('|',$value,4);$label=trim($parts[0]??'');if($label==='')return null;
    $category=trim($parts[1]??'Vlastní')?:'Vlastní';$icon=trim($parts[2]??'tasks')?:'tasks';
    $feeding=(($parts[3]??'')==='1')||in_array(strtolower($category),['krmení','krmeni','feeding','feedings'],true);
    return ['label'=>$label,'icon'=>$icon,'category'=>$category,'feeding'=>$feeding,'value'=>'Hodnota','detail'=>'Poznámka','planner'=>null,'setting_key'=>$settingKey];
}
function ir_custom_actions(PDO $pdo,int $uid): array {
    if(!ir_table_exists($pdo,'wp_ir2_user_settings')) return [];
    try{$st=$pdo->prepare("SELECT setting_key,setting_value FROM wp_ir2_user_settings WHERE user_id=? AND setting_key LIKE 'custom_action_%' ORDER BY setting_key");$st->execute([$uid]);$rows=$st->fetchAll()?:[];}catch(Throwable){return [];}
    $out=[];
    foreach($rows as $r){
        $meta=ir_custom_action_decode((string)$r['setting_value'],(string)$r['setting_key']); if(!$meta) continue;
        $out[$meta['label']]=$meta;
    }
    uasort($out,fn($a,$b)=>strnatcasecmp((string)$a['label'],(string)$b['label']));
    return $out;
}
function ir_custom_actions_by_key(PDO $pdo,int $uid): array {
    $out=[];foreach(ir_custom_actions($pdo,$uid) as $meta){$out[(string)$meta['setting_key']]=$meta;}return $out;
}
function ir_custom_feeding_types(PDO $pdo,int $uid): array {
    return array_filter(ir_custom_actions_by_key($pdo,$uid),fn($m)=>!empty($m['feeding']));
}

function ir_pedigree_tree(PDO $pdo,int $uid,int $animalId,int $depth=4,array &$seen=[]): ?array {
    if($animalId<=0||$depth<0||isset($seen[$animalId]))return null;
    $a=ir_animal($pdo,$uid,$animalId);if(!$a)return null;$seen[$animalId]=true;
    $node=['animal'=>$a,'father'=>null,'mother'=>null];
    if($depth>0){$fid=(int)($a['otec_id']??0);$mid=(int)($a['matka_id']??0);if($fid)$node['father']=ir_pedigree_tree($pdo,$uid,$fid,$depth-1,$seen);if($mid)$node['mother']=ir_pedigree_tree($pdo,$uid,$mid,$depth-1,$seen);}
    unset($seen[$animalId]);return $node;
}
function ir_pedigree_branch_html(?array $node,string $role='Jedinec',int $level=0): string {
    if(!$node)return '<div class="pedigree-node is-empty"><small>'.ir_e($role).'</small><strong>Nezadán</strong><span>Rodiče lze doplnit v editaci karty.</span></div>';
    $a=$node['animal'];$photo=ir_animal_photo($a);$html='<div class="pedigree-node level-'.$level.'"><div class="pedigree-node-card">'.($photo?'<img src="'.ir_e($photo).'" alt="">':'<span class="pedigree-node-icon">'.ir_visual_icon('animals').'</span>').'<div><small>'.ir_e($role).'</small><strong>'.ir_e(ir_animal_display($a)).'</strong><span>'.ir_e(ir_animal_secondary($a)).'</span></div></div>';
    if(!empty($node['father'])||!empty($node['mother']))$html.='<div class="pedigree-parents">'.ir_pedigree_branch_html($node['father'],'Otec',$level+1).ir_pedigree_branch_html($node['mother'],'Matka',$level+1).'</div>';
    return $html.'</div>';
}

function ir_activity_catalog_for_user(PDO $pdo,int $uid): array { return ir_activity_catalog()+ir_custom_actions($pdo,$uid); }
function ir_activity_meta_for_user(PDO $pdo,int $uid,string $type): array { $catalog=ir_activity_catalog_for_user($pdo,$uid); return $catalog[$type]??ir_activity_meta($type); }
function ir_activity_icon_for_user(PDO $pdo,int $uid,string $type): string { return (string)(ir_activity_meta_for_user($pdo,$uid,$type)['icon']??'tasks'); }
function ir_animal_feeding_type_key(PDO $pdo,int $uid,int $animalId): string {
    return $animalId>0?ir_user_setting_get($pdo,$uid,'animal_feed_type_'.$animalId,''):'';
}
function ir_animal_feeding_type_label(PDO $pdo,int $uid,int $animalId): string {
    if($animalId<=0)return '';
    $stored=ir_animal_feeding_type_key($pdo,$uid,$animalId); if($stored==='')return '';
    $all=ir_custom_actions_by_key($pdo,$uid);
    if(isset($all[$stored])) return (string)$all[$stored]['label'];
    foreach($all as $meta){if((string)$meta['label']===$stored)return (string)$meta['label'];}
    return '';
}
function ir_animal_default_feed_value(PDO $pdo,int $uid,array $animal): string {
    $label=ir_animal_feeding_type_label($pdo,$uid,(int)($animal['id']??0));
    if($label!=='')return $label;
    return trim((string)($animal['potrava']??''));
}
function ir_save_animal_feeding_type(PDO $pdo,int $uid,int $animalId,string $settingKey): void {
    if($animalId<=0)return;$settingKey=trim($settingKey);
    if($settingKey===''){ir_user_setting_delete($pdo,$uid,'animal_feed_type_'.$animalId);return;}
    $feeding=ir_custom_feeding_types($pdo,$uid);if(!isset($feeding[$settingKey]))throw new RuntimeException('Vybraný typ krmení už není dostupný.');
    ir_user_setting_set($pdo,$uid,'animal_feed_type_'.$animalId,$settingKey);
}

function ir_optimize_image_file_webp(string $absolutePath,string $mime): string {
    if(!is_file($absolutePath)||filesize($absolutePath)<=0)return $absolutePath;
    if($mime==='image/webp')return $absolutePath;
    $webp=dirname($absolutePath).'/'.pathinfo($absolutePath,PATHINFO_FILENAME).'.webp';
    try{
        if(class_exists('Imagick')){
            $im=new Imagick($absolutePath);
            if(method_exists($im,'autoOrient'))@$im->autoOrient();
            $im->stripImage();
            $im->setImageFormat('webp');
            $im->setOption('webp:lossless','true');
            $im->setImageCompressionQuality(100);
            $im->writeImage($webp);
            $im->clear();$im->destroy();
        }elseif(function_exists('imagewebp')&&defined('IMG_WEBP_LOSSLESS')){
            $src=null;
            if($mime==='image/jpeg'&&function_exists('imagecreatefromjpeg'))$src=@imagecreatefromjpeg($absolutePath);
            elseif($mime==='image/png'&&function_exists('imagecreatefrompng'))$src=@imagecreatefrompng($absolutePath);
            if($src){
                if($mime==='image/jpeg'&&function_exists('exif_read_data')){
                    $exif=@exif_read_data($absolutePath);$orientation=(int)($exif['Orientation']??1);
                    if($orientation===3)$src=@imagerotate($src,180,0);
                    elseif($orientation===6)$src=@imagerotate($src,-90,0);
                    elseif($orientation===8)$src=@imagerotate($src,90,0);
                    elseif($orientation===2&&function_exists('imageflip'))@imageflip($src,IMG_FLIP_HORIZONTAL);
                    elseif($orientation===4&&function_exists('imageflip'))@imageflip($src,IMG_FLIP_VERTICAL);
                    elseif(in_array($orientation,[5,7],true)&&function_exists('imageflip')){@imageflip($src,IMG_FLIP_HORIZONTAL);$src=@imagerotate($src,$orientation===5?-90:90,0);}
                }
                @imagepalettetotruecolor($src);@imagealphablending($src,true);@imagesavealpha($src,true);
                @imagewebp($src,$webp,IMG_WEBP_LOSSLESS);@imagedestroy($src);
            }
        }
        if(is_file($webp)&&filesize($webp)>0&&filesize($webp)<=filesize($absolutePath)){
            @unlink($absolutePath);return $webp;
        }
        if(is_file($webp))@unlink($webp);
    }catch(Throwable $e){error_log('IR lossless WebP optimization: '.$e->getMessage());if(is_file($webp))@unlink($webp);}
    return $absolutePath;
}
function ir_store_image_upload(array $file,int $uid,int $animalId): string {
    if(($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK) throw new RuntimeException('Nahrání fotografie se nezdařilo.');
    if((int)($file['size']??0)>16*1024*1024) throw new RuntimeException('Fotografie je příliš velká (max. 16 MB).');
    $tmp=(string)($file['tmp_name']??'');$finfo=new finfo(FILEINFO_MIME_TYPE);$mime=(string)$finfo->file($tmp);
    $allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];$ext=$allowed[$mime]??'';if($ext==='')throw new RuntimeException('Povolen je JPEG, PNG nebo WEBP.');
    $dir=IR_ROOT.'/uploads/animals/'.$uid.'/'.$animalId;if(!is_dir($dir)&&!mkdir($dir,0755,true)&&!is_dir($dir))throw new RuntimeException('Nelze vytvořit adresář pro fotografie.');
    $base=date('Ymd-His').'-'.bin2hex(random_bytes(4));$dest=$dir.'/'.$base.'.'.$ext;
    if(!move_uploaded_file($tmp,$dest))throw new RuntimeException('Fotografii nelze uložit.');
    $saved=ir_optimize_image_file_webp($dest,$mime);
    return 'uploads/animals/'.$uid.'/'.$animalId.'/'.basename($saved);
}

function ir_feed_inventory_adjust(PDO $pdo,int $uid,string $value,float $direction): void {
    if(!ir_table_exists($pdo,'wp_ir2_sklad'))return;$value=trim($value);if($value==='')return;$count=1.0;$item=$value;
    if(preg_match('/^\s*([0-9]+(?:[.,][0-9]+)?)\s*[×x]\s*(.+)$/u',$value,$m)){$count=(float)str_replace(',','.',$m[1]);$item=trim($m[2]);}
    if($item==='')return;
    try{$st=$pdo->prepare("SELECT id,mnozstvi FROM wp_ir2_sklad WHERE user_id=? AND LOWER(nazev)=LOWER(?) LIMIT 1");$st->execute([$uid,$item]);$r=$st->fetch();if($r){$pdo->prepare("UPDATE wp_ir2_sklad SET mnozstvi=GREATEST(0,mnozstvi+?) WHERE user_id=? AND id=?")->execute([$count*$direction,$uid,(int)$r['id']]);}}catch(Throwable){}
}
function ir_feed_inventory_decrement(PDO $pdo,int $uid,string $value): void { ir_feed_inventory_adjust($pdo,$uid,$value,-1.0); }
function ir_feed_inventory_increment(PDO $pdo,int $uid,string $value): void { ir_feed_inventory_adjust($pdo,$uid,$value,1.0); }

function ir_svg_sparkline(array $values,int $w=280,int $h=72): string {
    $nums=array_values(array_filter(array_map(fn($v)=>is_numeric(str_replace(',','.',(string)$v))?(float)str_replace(',','.',(string)$v):null,$values),fn($v)=>$v!==null));
    if(count($nums)<2)return '<div class="chart-empty">Málo dat</div>';
    $min=min($nums);$max=max($nums);$range=max(0.0001,$max-$min);$n=count($nums);$pts=[];
    foreach($nums as $i=>$v){$x=8+($n===1?0:$i*($w-16)/($n-1));$y=8+($max-$v)*($h-16)/$range;$pts[]=round($x,1).','.round($y,1);}return '<svg class="sparkline" viewBox="0 0 '.$w.' '.$h.'" role="img"><polyline points="'.ir_e(implode(' ',$pts)).'" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
}

/* PATCH 063: shared planner grouping + group-card visibility helpers. */
if(!function_exists('ir_planner_group_key')){
function ir_planner_group_key(array $task): string {
    $name=mb_strtolower(trim((string)($task['nazev_ukolu']??'')),'UTF-8');
    $category=mb_strtolower(trim((string)($task['kategorie']??'')),'UTF-8');
    $date=trim((string)($task['datum_termin']??''));
    $note=mb_strtolower(trim((string)($task['poznamka']??'')),'UTF-8');
    /* Automated markers identify the conceptual task more reliably than free text. */
    if(preg_match('/\[(IR-[A-Z0-9:_-]+)\]/u',$note,$m)){
        $marker=preg_replace('/:\d+\]$/',']',$m[0]);
        return $date.'|'.$category.'|'.$marker;
    }
    $name=preg_replace('/\s*[·\-–—]\s*(?:myš|potrava|drosophila|cvrček|šváb|krmivo).*$/u','',$name)??$name;
    $name=preg_replace('/\s+/u',' ',$name)??$name;
    return $date.'|'.$category.'|'.$name;
}}
if(!function_exists('ir_planner_group_tasks')){
function ir_planner_group_tasks(array $tasks): array {
    $groups=[];
    foreach($tasks as $task){
        if(!is_array($task))continue;
        $key=ir_planner_group_key($task);
        if(!isset($groups[$key]))$groups[$key]=['key'=>$key,'label'=>trim((string)($task['nazev_ukolu']??'Úkol')),'first'=>$task,'items'=>[]];
        $groups[$key]['items'][]=$task;
    }
    foreach($groups as &$group){
        $count=count($group['items']);
        if($count>1){
            $base=trim((string)($group['first']['nazev_ukolu']??'Úkol'));
            $base=preg_replace('/\s*[·\-–—]\s*(?:myš|potrava|drosophila|cvrček|šváb|krmivo).*$/iu','',$base)??$base;
            $group['label']=$base!==''?$base:'Úkol';
        }
    }
    unset($group);
    return $groups;
}}
if(!function_exists('ir_visible_animal_sql')){
function ir_visible_animal_sql(string $alias='z'): string {
    $a=preg_replace('/[^a-zA-Z0-9_]/','',$alias)?:'z';
    return "NOT EXISTS (SELECT 1 FROM wp_ir2_skupiny_clenove irgmc JOIN wp_ir2_skupiny irg ON irg.id=irgmc.skupina_id AND irg.user_id=irgmc.user_id WHERE irgmc.user_id={$a}.user_id AND irgmc.zvire_id={$a}.id AND irgmc.datum_do IS NULL AND irgmc.stav='Ve skupině' AND irg.status='Aktivní')";
}}

require_once __DIR__.'/svc-events.php';
require_once __DIR__.'/svc-files.php';
require_once __DIR__.'/svc-taxonomy.php';
require_once __DIR__.'/svc-habitat.php';
require_once __DIR__.'/svc-entities.php';
require_once __DIR__.'/svc-dashboard.php';
require_once __DIR__.'/svc-billing.php';
require_once __DIR__.'/svc-export.php';
require_once __DIR__.'/svc-admin.php';
