<?php
declare(strict_types=1);
require_once __DIR__.'/events_catalog.php';

function ir_widget_registry(): array {
    return [
        'tasks'=>['name'=>'Nejbližší úkoly','icon'=>'tasks','modules'=>['dashboard','tasks'],'sizes'=>[1,2,3],'size'=>1,'source'=>'wp_ir2_planovac','href'=>'tasks.php'],
        'feeding'=>['name'=>'Krmení – priorita','icon'=>'feeding','modules'=>['dashboard','animals'],'sizes'=>[1,2,3],'size'=>1,'source'=>'wp_ir2_zvirata + wp_ir2_pece','href'=>'animals.php?view=needs-feed'],
        'animals'=>['name'=>'Moje zvířata','icon'=>'animals','modules'=>['dashboard','animals'],'sizes'=>[1,2,3],'size'=>2,'source'=>'wp_ir2_zvirata','href'=>'animals.php'],
        'health'=>['name'=>'Zdravotní upozornění','icon'=>'health','modules'=>['dashboard','health'],'sizes'=>[1,2,3],'size'=>1,'source'=>'wp_ir2_zdravi','href'=>'health.php'],
        'habitats'=>['name'=>'Ubikace','icon'=>'habitat','modules'=>['dashboard','habitats'],'sizes'=>[1,2,3],'size'=>1,'source'=>'wp_ir2_ubikace','href'=>'habitats.php'],
        'reproduction'=>['name'=>'Reprodukce – aktuální cykly','icon'=>'reproduction','modules'=>['dashboard','clutches'],'sizes'=>[1,2,3],'size'=>2,'source'=>'wp_ir2_snusky','href'=>'clutches.php'],
        'stock'=>['name'=>'Nízké zásoby','icon'=>'inventory','modules'=>['dashboard','inventory'],'sizes'=>[1,2,3],'size'=>1,'source'=>'wp_ir2_sklad','href'=>'inventory.php?view=low'],
        'finance'=>['name'=>'Finance tento měsíc','icon'=>'finance','modules'=>['dashboard','finance'],'sizes'=>[1,2,3],'size'=>1,'source'=>'wp_ir2_finance','href'=>'finance.php'],
        'contacts'=>['name'=>'Adresář','icon'=>'profile','modules'=>['contacts'],'sizes'=>[1,2,3],'size'=>1,'source'=>'wp_ir2_contacts','href'=>'contacts.php'],
        'events'=>['name'=>'Nadcházející burzy','icon'=>'calendar','modules'=>['dashboard','events'],'sizes'=>[1,2,3],'size'=>1,'source'=>'events_catalog + wp_ir2_events','href'=>'events.php'],
        'cycles'=>['name'=>'Probíhající cykly','icon'=>'reproduction','modules'=>['dashboard','clutches'],'sizes'=>[1,2,3],'size'=>1,'source'=>'wp_ir2_snusky + wp_ir2_repro_faze','href'=>'clutches.php'],
        'activities'=>['name'=>'Poslední aktivity','icon'=>'clock','modules'=>['dashboard'],'sizes'=>[1,2,3],'size'=>1,'source'=>'wp_ir2_pece','href'=>'activities.php'],
    ];
}

function ir_workspace_modules(): array {
    return ['dashboard','animals','tasks','health','habitats','clutches','inventory','finance','contacts','events'];
}

function ir_workspace_layout(PDO $pdo,int $uid,string $module): array {
    $saved=[];
    if($module==='dashboard'){
        try{
            $v=$pdo->prepare("SELECT setting_value FROM wp_ir2_user_settings WHERE user_id=? AND setting_key='overview.dashboard.__design_version' LIMIT 1");
            $v->execute([$uid]);
            if((string)($v->fetchColumn()?:'')!=='64-final-lock'){
                $pdo->beginTransaction();
                $pdo->prepare('DELETE FROM wp_ir2_user_settings WHERE user_id=? AND setting_key LIKE ?')->execute([$uid,'overview.dashboard.%']);
                $pdo->prepare('INSERT INTO wp_ir2_user_settings(user_id,setting_key,setting_value) VALUES(?,?,?)')->execute([$uid,'overview.dashboard.__design_version','64-final-lock']);
                $pdo->commit();
            }
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();error_log('Dashboard layout v62: '.$e->getMessage());}
    }
    $q=$pdo->prepare('SELECT setting_key,setting_value FROM wp_ir2_user_settings WHERE user_id=? AND setting_key LIKE ?');
    $q->execute([$uid,'overview.'.$module.'.%']);
    foreach($q as $row){
        $short=substr($row['setting_key'],strlen('overview.'.$module.'.'));
        if(str_starts_with($short,'__')) continue;
        $saved[$short]=json_decode((string)$row['setting_value'],true)?:[];
    }

    /* Dashboard 061 design lock: the default is intentionally compact and image-led.
       Existing explicit user customisation remains respected. */
    $dashboardDefault=['animals','tasks','cycles','activities','events','feeding'];
    $dashboardDefaults=[
        'animals'=>['order'=>0,'size'=>2,'limit'=>4],
        'tasks'=>['order'=>1,'size'=>1,'limit'=>6],
        'cycles'=>['order'=>2,'size'=>2,'limit'=>4],
        'activities'=>['order'=>3,'size'=>1,'limit'=>5],
        'events'=>['order'=>4,'size'=>1,'limit'=>3],
        'feeding'=>['order'=>5,'size'=>2,'limit'=>5],
        'health'=>['order'=>6,'size'=>1,'limit'=>4],
        'stock'=>['order'=>7,'size'=>1,'limit'=>4],
        'finance'=>['order'=>8,'size'=>1,'limit'=>4],
        'reproduction'=>['order'=>9,'size'=>1,'limit'=>4],
    ];

    $layout=[];
    foreach(ir_widget_registry() as $id=>$widget){
        $v=$saved[$id]??[];
        $defaultEnabled=$module==='dashboard'?in_array($id,$dashboardDefault,true):in_array($module,$widget['modules'],true);
        $dashboardPreset=$module==='dashboard'?($dashboardDefaults[$id]??[]):[];
        $defaultSize=(int)($dashboardPreset['size']??$widget['size']);
        $defaultLimit=(int)($dashboardPreset['limit']??6);
        $defaultOrder=(int)($dashboardPreset['order']??count($layout));
        $layout[$id]=[
            'id'=>$id,
            'order'=>(int)($v['order']??$defaultOrder),
            'size'=>in_array($v['size']??0,$widget['sizes'],true)?(int)$v['size']:$defaultSize,
            'enabled'=>(bool)($v['enabled']??$defaultEnabled),
            'limit'=>in_array($v['limit']??0,[3,6,12],true)?(int)$v['limit']:$defaultLimit,
        ];
    }
    uasort($layout,fn($a,$b)=>$a['order']<=>$b['order']);
    return $layout;
}

function ir_widget_rows(PDO $pdo,int $uid,string $id,int $limit): array {
    if($id==='tasks'){
        $rows=[];
        $remaining=max(1,$limit);
        foreach([
            'Zpožděné'=>"stav='Aktivní' AND datum_termin<CURDATE()",
            'Dnes'=>"stav='Aktivní' AND datum_termin=CURDATE()",
            'Budoucí'=>"stav='Aktivní' AND datum_termin>CURDATE()",
        ] as $group=>$condition){
            if($remaining<=0) break;
            $q=$pdo->prepare("SELECT id,nazev_ukolu title,datum_termin,kategorie,CONCAT(datum_termin,' · ',kategorie) detail FROM wp_ir2_planovac WHERE user_id=? AND $condition ORDER BY datum_termin,cas_termin,id LIMIT ".(int)$remaining);
            $q->execute([$uid]);
            foreach($q as $r){
                $r['href']='tasks.php?task='.$r['id'];
                $r['group']=$group;
                $rows[]=$r;
                $remaining--;
            }
        }
        return $rows;
    }

    if($id==='feeding'){
        $rows=[];
        if(function_exists('ir_needs_feed')){
            foreach(array_slice(ir_needs_feed($pdo,$uid,max(1,$limit)),0,$limit) as $a){
                $interval=max(1,(int)($a['feeding_interval_days']??1));
                $overdue=$a['feed_overdue_days']??null;
                if($overdue===null)$when='Bez termínu';
                elseif((int)$overdue>0)$when=(int)$overdue.' d po termínu';
                elseif((int)$overdue===0)$when='Dnes';
                else $when='Za '.abs((int)$overdue).' d';
                $rows[]=['id'=>(int)$a['id'],'title'=>(string)($a['latinsky_nazev']?:$a['jmeno_kod']?:'Zvíře'),'detail'=>trim((string)($a['jmeno_kod']??'')).' · interval '.$interval.' dní · '.$when,'href'=>'animal.php?id='.(int)$a['id'],'icon'=>'feeding'];
            }
        }
        return $rows;
    }

    $queries=[
        'animals'=>['SELECT z.id,z.jmeno_kod title,z.latinsky_nazev detail,z.foto,z.pohlavi,u.nazev ubikace FROM wp_ir2_zvirata z LEFT JOIN wp_ir2_ubikace u ON u.id=z.ubikace_id AND u.user_id=z.user_id WHERE z.user_id=? AND COALESCE(z.status_chovu,\'Aktivní\') NOT IN (\'Prodáno\',\'Uhynulo\',\'Archiv\') AND COALESCE(z.pohlavi,\'\') NOT IN (\'Skupina\',\'Pár\') ORDER BY z.upraveno DESC,z.id DESC','animal.php?id='],
        'health'=>["SELECT id,typ_zaznamu title,CONCAT(status,' · ',COALESCE(datum_do,datum_od)) detail FROM wp_ir2_zdravi WHERE user_id=? AND status NOT IN ('Ukončeno','Hotovo','Uzavřeno') ORDER BY datum_od DESC",'health.php?id='],
        'habitats'=>["SELECT u.id,u.nazev title,CONCAT((SELECT COUNT(*) FROM wp_ir2_zvirata z WHERE z.user_id=u.user_id AND z.ubikace_id=u.id),' zvířat') detail FROM wp_ir2_ubikace u WHERE u.user_id=? ORDER BY u.nazev",'habitats.php?id='],
        'reproduction'=>["SELECT id,nazev title,CONCAT(stav,' · ',COALESCE(dalsi_akce_datum,predpoklad_lihnuti,'')) detail FROM wp_ir2_snusky WHERE user_id=? AND stav IN ('Aktivní','Inkubace') ORDER BY COALESCE(dalsi_akce_datum,predpoklad_lihnuti)",'clutches.php?id='],
        'stock'=>['SELECT id,nazev title,CONCAT(mnozstvi,\' \',jednotka,\' / minimum \',minimum) detail FROM wp_ir2_sklad WHERE user_id=? AND mnozstvi<=minimum ORDER BY mnozstvi-minimum','inventory.php?edit='],
        'finance'=>["SELECT id,typ title,CONCAT(castka,' Kč · ',datum) detail FROM wp_ir2_finance WHERE smazano IS NULL AND user_id=? AND datum>=DATE_FORMAT(CURDATE(),'%Y-%m-01') AND datum<DATE_ADD(LAST_DAY(CURDATE()),INTERVAL 1 DAY) ORDER BY datum DESC",'finance.php?id='],
        'contacts'=>['SELECT id,name title,email detail FROM wp_ir2_contacts WHERE user_id=? ORDER BY name','contacts.php?edit='],
    ];

    if($id==='cycles'){
        $q=$pdo->prepare("SELECT id,druh_id,nazev,stav,aktualni_faze,datum_zahajeni,datum_snusky,predpoklad_lihnuti,dalsi_akce,dalsi_akce_datum FROM wp_ir2_snusky WHERE user_id=? AND stav IN ('Aktivní','Inkubace') ORDER BY COALESCE(dalsi_akce_datum,predpoklad_lihnuti,'9999-12-31'),id LIMIT ".(int)$limit);
        $q->execute([$uid]);
        $rows=$q->fetchAll()?:[];
        foreach($rows as &$r){
            $r['href']='clutches.php?id='.$r['id'];
            $r['title']=$r['nazev'];
            $r['detail']=trim((string)($r['aktualni_faze']?:$r['stav']));
            $lower=mb_strtolower($r['detail'].' '.$r['stav'],'UTF-8');
            $r['is_incubation']=str_contains($lower,'inkub');
            $window=function_exists('ir_repro_phase_window')?ir_repro_phase_window($pdo,$uid,(int)($r['druh_id']??0),(string)$r['detail']):['from'=>0,'to'=>0];
            $r['range_from']=(int)($window['from']??0);
            $r['range_to']=(int)($window['to']??0);
            $start=(string)($r['datum_snusky']?:$r['datum_zahajeni']?:'');
            $r['elapsed_days']=$start!==''&&strtotime($start)?max(0,(int)floor((time()-strtotime($start))/86400)):0;

            if($r['is_incubation']){
                if($r['range_to']<=0 && $start!=='' && !empty($r['predpoklad_lihnuti']) && strtotime((string)$r['predpoklad_lihnuti'])>strtotime($start)){
                    $r['range_to']=max(1,(int)round((strtotime((string)$r['predpoklad_lihnuti'])-strtotime($start))/86400));
                    $r['range_from']=$r['range_to'];
                }
            } else {
                $plan=function_exists('ir_repro_phase_plan')?ir_repro_phase_plan($pdo,$uid,(int)($r['druh_id']??0)):[];
                $r['phase_total']=count($plan);
                $r['phase_index']=0;
                foreach($plan as $i=>$phase){
                    if(mb_strtolower(trim((string)($phase['faze']??'')),'UTF-8')===mb_strtolower($r['detail'],'UTF-8')){
                        $r['phase_index']=$i+1;
                        break;
                    }
                }
            }
        }
        unset($r);
        return $rows;
    }

    if($id==='activities'){
        $q=$pdo->prepare("SELECT p.typ title,COUNT(*) cnt,MAX(p.datum) last_date,MAX(COALESCE(z.latinsky_nazev,z.jmeno_kod,'')) sample FROM wp_ir2_pece p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE p.user_id=? GROUP BY p.typ ORDER BY last_date DESC LIMIT ".(int)$limit);
        $q->execute([$uid]);
        $rows=$q->fetchAll()?:[];
        foreach($rows as &$r){
            $r['href']='activities.php?type='.rawurlencode((string)$r['title']);
            $r['detail']=(int)$r['cnt'].' záznamů · '.(!empty($r['last_date'])?ir_recent_time_label((string)$r['last_date']):'');
            $r['icon']=ir_activity_icon_key('activity',(string)$r['title']);
        }
        unset($r);
        return $rows;
    }

    if($id==='events'){
        $rows=[];
        foreach(ir_public_event_catalog() as $index=>$e){
            if(substr($e[0],0,7)===date('Y-m')) $rows[]=['title'=>$e[1],'detail'=>date('d.m.',strtotime($e[0])).' · '.$e[2],'href'=>'events.php?public='.$index];
        }
        $q=$pdo->prepare("SELECT id,title,city,starts_at FROM wp_ir2_events WHERE user_id=? AND starts_at>=DATE_FORMAT(CURDATE(),'%Y-%m-01') AND starts_at<DATE_ADD(LAST_DAY(CURDATE()),INTERVAL 1 DAY) ORDER BY starts_at");
        $q->execute([$uid]);
        foreach($q as $e) $rows[]=['title'=>$e['title'],'detail'=>date('d.m.',strtotime($e['starts_at'])).' · '.$e['city'],'href'=>'events.php?id='.$e['id']];
        return array_slice($rows,0,$limit);
    }

    [$sql,$href]=$queries[$id];
    $q=$pdo->prepare($sql.' LIMIT '.(int)$limit);
    $q->execute([$uid]);
    $rows=$q->fetchAll()?:[];
    foreach($rows as &$r) $r['href']=$href.$r['id'];
    unset($r);
    return $rows;
}

function ir_dashboard_kpis(PDO $pdo,int $uid): array {
    $animals=(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_zvirata WHERE user_id=? AND COALESCE(status_chovu,'Aktivní') NOT IN ('Prodáno','Uhynulo','Archiv') AND COALESCE(pohlavi,'') NOT IN ('Skupina','Pár')",[$uid],0);
    $todayTasks=(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_planovac WHERE user_id=? AND stav='Aktivní' AND datum_termin=CURDATE()",[$uid],0);
    $overdue=(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_planovac WHERE user_id=? AND stav='Aktivní' AND datum_termin<CURDATE()",[$uid],0);
    $feeding=0;
    if(function_exists('ir_needs_feed')){try{$feeding=count(ir_needs_feed($pdo,$uid,500));}catch(Throwable){$feeding=0;}}
    $repro=(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_snusky WHERE user_id=? AND stav IN ('Aktivní','Inkubace')",[$uid],0);
    $low=(int)ir_scalar($pdo,"SELECT COUNT(*) FROM wp_ir2_sklad WHERE user_id=? AND mnozstvi<=minimum",[$uid],0);
    $costs=(float)ir_scalar($pdo,"SELECT COALESCE(SUM(CASE WHEN typ IN ('Výdaj','Náklad','Nákup') THEN castka ELSE 0 END),0) FROM wp_ir2_finance WHERE smazano IS NULL AND user_id=? AND datum>=DATE_FORMAT(CURDATE(),'%Y-%m-01') AND datum<DATE_ADD(LAST_DAY(CURDATE()),INTERVAL 1 DAY)",[$uid],0);
    return [
        ['Zvířata','animals',(string)$animals,'aktivních v chovu','animals.php','kpi-animals','Zvířata'],
        ['Úkoly dnes','tasks',(string)$todayTasks,$overdue?($overdue.' po termínu'):'bez zpoždění','tasks.php?view=today','kpi-tasks','Dnes'],
        ['Krmení','feeding',(string)$feeding,'vyžaduje pozornost','animals.php?view=needs-feed','kpi-feeding','Péče'],
        ['Reprodukce','reproduction',(string)$repro,'aktivní cykly / inkubace','clutches.php','kpi-repro','Chov'],
        ['Nízké zásoby','inventory',(string)$low,$low?'je třeba doplnit':'vše v normě','inventory.php?view=low','kpi-stock','Sklad'],
        ['Náklady','finance',number_format($costs,0,',',' ').' Kč','v tomto měsíci','finance.php','kpi-finance','Finance'],
    ];
}

function ir_render_workspace(string $module): void {
    global $pdo;
    if($module!=='dashboard') return;
    $uid=ir_current_user_id();

    $scalar=function(string $sql,array $params=[]) use($pdo){
        try{$q=$pdo->prepare($sql);$q->execute($params);return $q->fetchColumn();}catch(Throwable $e){error_log('Dashboard scalar: '.$e->getMessage());return 0;}
    };

    /* KPI cards deliberately match the approved visual lock: animals, sex ratio,
       habitats, clutches, health and monthly costs. */
    $animals=(int)$scalar("SELECT COUNT(*) FROM wp_ir2_zvirata z WHERE z.user_id=? AND ".ir_status_active_sql('z')." AND COALESCE(z.pohlavi,'') NOT IN ('Skupina','Pár')",[$uid]);
    $males=(int)$scalar("SELECT COUNT(*) FROM wp_ir2_zvirata z WHERE z.user_id=? AND ".ir_status_active_sql('z')." AND z.pohlavi IN ('Samec','♂')",[$uid]);
    $females=(int)$scalar("SELECT COUNT(*) FROM wp_ir2_zvirata z WHERE z.user_id=? AND ".ir_status_active_sql('z')." AND z.pohlavi IN ('Samice','♀')",[$uid]);
    $habitats=(int)$scalar("SELECT COUNT(*) FROM wp_ir2_ubikace WHERE user_id=?",[$uid]);
    $occupied=(int)$scalar("SELECT COUNT(DISTINCT ubikace_id) FROM wp_ir2_zvirata z WHERE z.user_id=? AND z.ubikace_id IS NOT NULL AND ".ir_status_active_sql('z'),[$uid]);
    $clutches=(int)$scalar("SELECT COUNT(*) FROM wp_ir2_snusky WHERE user_id=? AND COALESCE(stav,'') NOT IN ('Ukončeno','Archiv','Zrušeno')",[$uid]);
    $incubating=(int)$scalar("SELECT COUNT(*) FROM wp_ir2_snusky WHERE user_id=? AND (LOWER(COALESCE(aktualni_faze,'')) LIKE '%inkub%' OR LOWER(COALESCE(stav,'')) LIKE '%inkub%')",[$uid]);
    $health=(int)$scalar("SELECT COUNT(*) FROM wp_ir2_zdravi WHERE user_id=? AND datum_od>=DATE_SUB(CURDATE(),INTERVAL 30 DAY)",[$uid]);
    $costs=(float)$scalar("SELECT COALESCE(SUM(CASE WHEN typ IN ('Výdaj','Náklad','Nákup') THEN castka ELSE 0 END),0) FROM wp_ir2_finance WHERE smazano IS NULL AND user_id=? AND datum>=DATE_FORMAT(CURDATE(),'%Y-%m-01') AND datum<DATE_ADD(LAST_DAY(CURDATE()),INTERVAL 1 DAY)",[$uid]);

    $cards=[
        ['Zvířat','animals',(string)$animals,'aktivních v chovu','animals.php','animals'],
        ['Samců / Samic','sex',$males.' / '.$females,'aktuální poměr','animals.php','sex'],
        ['Ubikací','habitat',(string)$habitats,$occupied.' aktivních','habitats.php','habitat'],
        ['Snůšek','eggs',(string)$clutches,$incubating.' v inkubaci','clutches.php','eggs'],
        ['Zdravotní události','health',(string)$health,'v posledních 30 dnech','health.php','health'],
        ['Náklady','finance',number_format($costs,0,',',' ').' Kč','v tomto měsíci','finance.php','finance'],
    ];

    $animalsRows=[];
    try{
        $sql="SELECT z.*,u.nazev ubikace_nazev,g.id skupina_id,g.pocet skupina_pocet,
            (SELECT COUNT(*) FROM wp_ir2_skupiny_clenove c JOIN wp_ir2_zvirata x ON x.id=c.zvire_id AND x.user_id=c.user_id WHERE c.user_id=z.user_id AND c.skupina_id=g.id AND c.datum_do IS NULL AND c.stav='Ve skupině' AND x.pohlavi IN ('Samec','♂')) group_males,
            (SELECT COUNT(*) FROM wp_ir2_skupiny_clenove c JOIN wp_ir2_zvirata x ON x.id=c.zvire_id AND x.user_id=c.user_id WHERE c.user_id=z.user_id AND c.skupina_id=g.id AND c.datum_do IS NULL AND c.stav='Ve skupině' AND x.pohlavi IN ('Samice','♀')) group_females
          FROM wp_ir2_zvirata z
          LEFT JOIN wp_ir2_ubikace u ON u.id=z.ubikace_id AND u.user_id=z.user_id
          LEFT JOIN wp_ir2_skupiny g ON g.user_id=z.user_id AND g.main_animal_id=z.id AND g.status='Aktivní'
          WHERE z.user_id=? AND ".ir_status_active_sql('z')." AND ".ir_visible_animal_sql('z')."
          ORDER BY z.upraveno DESC,z.id DESC LIMIT 4";
        $q=$pdo->prepare($sql);$q->execute([$uid]);$animalsRows=$q->fetchAll()?:[];
    }catch(Throwable $e){error_log('Dashboard animals 064: '.$e->getMessage());}

    $tasks=[];
    try{
        $q=$pdo->prepare("SELECT p.*,z.jmeno_kod,z.latinsky_nazev,z.foto FROM wp_ir2_planovac p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE p.user_id=? AND p.stav='Aktivní' ORDER BY (p.datum_termin<CURDATE()) DESC,ABS(DATEDIFF(p.datum_termin,CURDATE())),COALESCE(p.cas_termin,'23:59:59'),p.id LIMIT 36");
        $q->execute([$uid]);$tasks=$q->fetchAll()?:[];
    }catch(Throwable $e){error_log('Dashboard tasks 064: '.$e->getMessage());}

    $cycles=[];
    try{
        $q=$pdo->prepare("SELECT s.*,d.latinsky_nazev,d.cesky_nazev,
            COALESCE(NULLIF(m.foto,''),NULLIF(o.foto,''),'') AS cycle_photo,
            COALESCE(NULLIF(m.jmeno_kod,''),NULLIF(o.jmeno_kod,''),'') AS cycle_animal
          FROM wp_ir2_snusky s
          LEFT JOIN wp_ir2_druhy d ON d.id=s.druh_id AND d.user_id=s.user_id
          LEFT JOIN wp_ir2_zvirata m ON m.id=s.matka_id AND m.user_id=s.user_id
          LEFT JOIN wp_ir2_zvirata o ON o.id=s.otec_id AND o.user_id=s.user_id
          WHERE s.user_id=? AND s.stav IN ('Aktivní','Inkubace')
          ORDER BY CASE WHEN LOWER(COALESCE(s.aktualni_faze,'')) LIKE '%inkub%' THEN 0 ELSE 1 END,COALESCE(s.dalsi_akce_datum,s.predpoklad_lihnuti,'9999-12-31'),s.id LIMIT 3");
        $q->execute([$uid]);$cycles=$q->fetchAll()?:[];
    }catch(Throwable $e){error_log('Dashboard cycles 064: '.$e->getMessage());}

    $activities=[];
    try{
        $q=$pdo->prepare("SELECT p.id,p.typ,p.hodnota,p.datum,z.jmeno_kod,z.latinsky_nazev,z.foto FROM wp_ir2_pece p LEFT JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE p.user_id=? ORDER BY p.datum DESC,p.id DESC LIMIT 5");
        $q->execute([$uid]);$activities=$q->fetchAll()?:[];
    }catch(Throwable $e){error_log('Dashboard activities 064: '.$e->getMessage());}

    $events=[];
    try{
        foreach(ir_public_event_catalog() as $i=>$e){if((string)$e[0]>=date('Y-m-d'))$events[]=['title'=>$e[1],'date'=>$e[0],'city'=>$e[2],'href'=>'events.php?public='.$i];}
        usort($events,static fn($a,$b)=>strcmp($a['date'],$b['date']));$events=array_slice($events,0,2);
    }catch(Throwable){}

    echo '<section class="dashboard-lock-063">';
    echo '<div class="dashboard-kpis-063">';
    foreach($cards as [$label,$icon,$value,$sub,$href,$tone]){
        echo '<a class="dashboard-kpi-063 tone-'.$tone.'" href="'.ir_e($href).'" aria-label="'.ir_e($label.' '.$value).'"><span class="dashboard-kpi-data-063"><strong>'.ir_e($value).'</strong><b>'.ir_e($label).'</b><small>'.ir_e($sub).'</small></span></a>';
    }
    echo '</div>';

    echo '<div class="dashboard-main-grid-063">';
    echo '<div class="dashboard-main-left-063">';
    echo '<section class="dash-panel-063 dash-animals-063"><header><h2>Moje zvířata</h2><a href="animals.php">Zobrazit všechna →</a></header><div class="dash-animal-grid-063">';
    foreach($animalsRows as $a){
        $photo=ir_asset_photo_url((string)($a['foto']??''));$sex=(string)($a['pohlavi']??'');
        $sexBadge=in_array($sex,['Samec','♂'],true)?'<i class="dash-sex male">♂</i>':(in_array($sex,['Samice','♀'],true)?'<i class="dash-sex female">♀</i>':'');
        $isGroup=!empty($a['skupina_id'])||in_array($sex,['Skupina','Pár'],true);
        $name=(string)($a['latinsky_nazev']?:$a['druh']?:$a['jmeno_kod']);
        $secondary=$isGroup?'Chovná skupina · '.(int)($a['skupina_pocet']??0).' jedinců':(string)($a['druh']?:$a['jmeno_kod']);
        $href=$isGroup&&!empty($a['skupina_id'])?'group.php?id='.(int)$a['skupina_id']:'animal.php?id='.(int)$a['id'];
        echo '<a class="dash-animal-063" href="'.ir_e($href).'"><span class="dash-animal-photo-063">'.($photo!==''?'<img src="'.ir_e($photo).'" alt="" loading="lazy">':ir_visual_icon('animals')).'</span>'.$sexBadge.'<span class="dash-animal-text-063"><strong>'.ir_e($name).'</strong><small>'.ir_e($secondary).'</small><em>'.ir_visual_icon('habitat').ir_e((string)($a['ubikace_nazev']?:'Bez ubikace')).'</em></span></a>';
    }
    if(!$animalsRows)echo '<div class="dash-empty-063">Žádná aktivní zvířata.</div>';
    echo '</div></section>';

    echo '<section class="dash-panel-063 dash-cycles-063"><header><h2>Reprodukce – aktuální cykly</h2><a href="clutches.php">Zobrazit všechny →</a></header><div class="dash-cycle-grid-063">';
    foreach($cycles as $c){
        $phase=trim((string)($c['aktualni_faze']?:$c['stav']));$lower=mb_strtolower($phase.' '.(string)$c['stav'],'UTF-8');$inc=str_contains($lower,'inkub');
        $name=(string)($c['nazev']?:$c['latinsky_nazev']?:'Reprodukce');
        $cyclePhoto=ir_asset_photo_url((string)($c['cycle_photo']??''));
        $media=$cyclePhoto!==''?'<span class="dash-cycle-media-064"><img src="'.ir_e($cyclePhoto).'" alt="" loading="lazy"></span>':'<span class="dash-cycle-media-064 is-icon">'.ir_visual_icon('reproduction').'</span>';
        if($inc){
            $window=function_exists('ir_repro_phase_window')?ir_repro_phase_window($pdo,$uid,(int)($c['druh_id']??0),$phase):['from'=>0,'to'=>0];
            $from=(int)($window['from']??0);$to=(int)($window['to']??0);$start=(string)($c['datum_snusky']?:$c['datum_zahajeni']?:'');
            if($to<=0&&$start!==''&&!empty($c['predpoklad_lihnuti'])&&strtotime((string)$c['predpoklad_lihnuti'])>strtotime($start)){$to=max(1,(int)round((strtotime((string)$c['predpoklad_lihnuti'])-strtotime($start))/86400));$from=$to;}
            if($from<=0)$from=max(1,$to?:1);if($to<$from)$to=$from;
            $elapsed=$start&&strtotime($start)?max(0,(int)floor((time()-strtotime($start))/86400)):0;
            $p1=max(0,min(100,($elapsed/max(1,$from))*100));$p2=$to>$from&&$elapsed>$from?max(0,min(100,(($elapsed-$from)/($to-$from))*100)):0;
            $state=$elapsed>$to&&$to>0?'+'.($elapsed-$to).' dní nad horní hranicí · ZKONTROLOVAT':($elapsed>=$from&&$to>$from?'OKNO LÍHNUTÍ · zbývá '.max(0,$to-$elapsed).' dní':'Do okna líhnutí '.max(0,$from-$elapsed).' dní');
            echo '<article class="dash-cycle-card-063 is-incubation has-media">'.$media.'<div class="dash-cycle-body-064"><div class="dash-cycle-title-063"><span class="dash-cycle-type-icon">'.ir_visual_icon('reproduction').'</span><span><strong>'.ir_e($name).'</strong><small>Snůška · inkubace</small></span><b>INKUBACE</b></div><div class="dash-phase-label-063"><strong>Den '.$elapsed.' / '.$to.'</strong><span>'.ir_e($from.'–'.$to.' dní').'</span></div><div class="incubation-progress-063"><span class="incubation-before"><b style="width:'.number_format($p1,2,'.','').'%"></b></span><span class="incubation-window"><b style="width:'.number_format($p2,2,'.','').'%"></b></span></div><div class="incubation-scale-063"><span>0–'.$from.'. den · vývoj</span><strong>'.ir_e($state).'</strong><span>'.$from.'–'.$to.'. den · líhnutí</span></div></div></article>';
        }else{
            $plan=function_exists('ir_repro_phase_plan')?ir_repro_phase_plan($pdo,$uid,(int)($c['druh_id']??0)):[];$total=max(1,count($plan));$idx=0;
            foreach($plan as $i=>$row)if(mb_strtolower(trim((string)($row['faze']??'')),'UTF-8')===mb_strtolower($phase,'UTF-8')){$idx=$i+1;break;}
            if($idx<=0)$idx=1;
            echo '<article class="dash-cycle-card-063 is-reproduction has-media">'.$media.'<div class="dash-cycle-body-064"><div class="dash-cycle-title-063"><span class="dash-cycle-type-icon">'.ir_visual_icon('reproduction').'</span><span><strong>'.ir_e($name).'</strong><small>Reprodukční cyklus</small></span><b>'.ir_e(mb_strtoupper($phase,'UTF-8')).'</b></div><div class="dash-phase-label-063"><strong>Fáze '.$idx.' / '.$total.' · '.ir_e($phase).'</strong><span>'.ir_e((string)($c['dalsi_akce']?:'Další krok podle plánu')).'</span></div><div class="repro-segments-063">';
            for($i=1;$i<=$total;$i++)echo '<i class="'.($i<$idx?'done':($i===$idx?'current':'')).'"></i>';
            echo '</div><form method="post" action="clutches.php">'.ir_csrf_field().'<input type="hidden" name="id" value="'.(int)$c['id'].'"><input type="hidden" name="return_to" value="index.php"><button name="action" value="advance">Potvrdit další fázi →</button></form></div></article>';
        }
    }
    if(!$cycles)echo '<div class="dash-empty-063">Žádné aktivní reprodukční cykly.</div>';
    echo '</div></section>';

    echo '</div>';

    echo '<aside class="dashboard-main-right-063"><section class="dash-panel-063 dash-tasks-063"><header><h2>Aktuální úkoly</h2><a href="tasks.php">Zobrazit vše →</a></header><div class="dash-task-list-063">';
    $taskGroups=function_exists('ir_planner_group_tasks')?array_slice(array_values(ir_planner_group_tasks($tasks)),0,6):array_map(static fn($t)=>['first'=>$t,'items'=>[$t],'label'=>(string)$t['nazev_ukolu']],array_slice($tasks,0,6));
    foreach($taskGroups as $tg){
        $t=$tg['first'];$items=$tg['items'];$count=count($items);$label=$count>1?(string)$tg['label']:(string)$t['nazev_ukolu'];
        $icon=ir_activity_icon_key('task',$label.' '.(string)$t['kategorie']);$date=(string)$t['datum_termin'];$when=$date<date('Y-m-d')?'Po termínu':($date===date('Y-m-d')?'Dnes':date('d.m.',strtotime($date)));$cls=$date<date('Y-m-d')?' late':($date===date('Y-m-d')?' today':'');
        $detail=$count>1?($count.' zvířata / položky'):(string)($t['jmeno_kod']?:$t['latinsky_nazev']?:$t['kategorie']);
        echo '<div class="dash-task-row-063'.$cls.'"><a href="tasks.php?task='.(int)$t['id'].'"><span>'.ir_visual_icon($icon).'</span><strong>'.ir_e($label).($count>1?' <b class="dash-task-count-064">×'.$count.'</b>':'').'<small>'.ir_e($detail).'</small></strong><em>'.ir_e($when).'</em></a><form method="post" action="tasks.php">'.ir_csrf_field().'<input type="hidden" name="return_to" value="index.php">';
        if($count>1){foreach($items as $it)echo '<input type="hidden" name="ids[]" value="'.(int)$it['id'].'">';echo '<button name="action" value="complete_group" title="Vše hotovo">✓</button>';}
        else echo '<input type="hidden" name="id" value="'.(int)$t['id'].'"><button name="action" value="complete" title="Hotovo">✓</button>';
        echo '</form></div>';
    }
    if(!$taskGroups)echo '<div class="dash-empty-063">Vše je hotovo.</div>';echo '</div></section>';

    echo '<section class="dash-panel-063 dash-fast-063 dashboard-fast-reference-064"><header><h2>Rychlé akce</h2></header><div class="dash-fast-grid-063">';
    foreach([['Přidat zvíře','animals','animal-edit.php'],['Skenovat QR','scan','scan.php'],['Hlasový vstup','quick-add','voice.php'],['Vytvořit úkol','tasks','tasks.php#new-task']] as [$l,$i,$h])echo '<a href="'.ir_e($h).'">'.ir_visual_icon($i).'<span>'.ir_e($l).'</span></a>';
    echo '</div></section>';
    echo '</aside></div>';

    echo '<div class="dashboard-secondary-064">';
    echo '<section class="dash-panel-063 dash-events-063"><header><h2>Burzy & akce</h2><a href="events.php">Zobrazit všechny →</a></header>';
    foreach($events as $e)echo '<a class="dash-event-row-063" href="'.ir_e($e['href']).'">'.ir_visual_icon('calendar').'<span><strong>'.ir_e($e['title']).'</strong><small>'.date('d.m.Y',strtotime($e['date'])).' · '.ir_e($e['city']).'</small></span></a>';
    if(!$events)echo '<div class="dash-empty-063">Žádná nadcházející akce.</div>';echo '</section>';
    echo '<section class="dash-panel-063 dash-activities-063"><header><h2>Poslední aktivity</h2><a href="activities.php">Zobrazit všechny →</a></header><div class="dash-activity-list-063">';
    foreach($activities as $a){$icon=ir_activity_icon_key('activity',(string)$a['typ']);$name=(string)($a['jmeno_kod']?:$a['latinsky_nazev']?:'Chov');echo '<a href="activities.php"><span>'.ir_visual_icon($icon).'</span><strong>'.ir_e((string)$a['typ']).'<small>'.ir_e($name).'</small></strong><time>'.ir_e(ir_recent_time_label((string)$a['datum'])).'</time><b>✓</b></a>';}
    if(!$activities)echo '<div class="dash-empty-063">Zatím žádná aktivita.</div>';echo '</div></section>';
    echo '</div></section>';
}
