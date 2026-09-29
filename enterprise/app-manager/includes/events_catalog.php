<?php
function ir_public_event_catalog(): array { return [
 ['2026-09-26 09:00:00','TERRABAZAR','Praha','CZ','Horáčkova 1100, Praha 4','https://www.terrabazar.cz/'],
 ['2026-09-27 08:00:00','Ostravské Fauna trhy','Ostrava','CZ','','https://fauna-trhy.cz/'],
 ['2026-10-04 09:00:00','Verona Reptiles','Cerea / Verona','IT','','https://www.veronareptiles.it/'],
 ['2026-10-17 09:00:00','Živá Exotika','Praha','CZ','Blažimská 1781/4, Praha 4','https://zivaexotika.cz/'],
 ['2026-10-18 10:00:00','Akva-Tera burza Ústí nad Labem','Ústí nad Labem','CZ','Dům kultury Ústí nad Labem','https://www.teraristikausti.cz/'],
 ['2026-10-24 09:00:00','TERRABAZAR','Praha','CZ','Horáčkova 1100, Praha 4','https://www.terrabazar.cz/'],
 ['2026-10-25 08:00:00','Ostravské Fauna trhy','Ostrava','CZ','','https://fauna-trhy.cz/'],
 ['2026-11-07 09:00:00','TERRABAZAR','Praha','CZ','Horáčkova 1100, Praha 4','https://www.terrabazar.cz/'],
 ['2026-11-15 08:00:00','Ostravské Fauna trhy','Ostrava','CZ','','https://fauna-trhy.cz/'],
 ['2026-11-21 09:00:00','Živá Exotika','Praha','CZ','Blažimská 1781/4, Praha 4','https://zivaexotika.cz/'],
 ['2026-12-05 09:00:00','TERRABAZAR','Praha','CZ','Horáčkova 1100, Praha 4','https://www.terrabazar.cz/'],
 ['2026-12-06 09:00:00','Terraria Houten','Houten','NL','','https://www.vhm-events.com/'],
 ['2026-12-12 09:00:00','Terraristika Hamm','Hamm','DE','','https://www.terraristika.com/'],
 ['2026-12-13 08:00:00','Ostravské Fauna trhy','Ostrava','CZ','','https://fauna-trhy.cz/'],
 ['2026-12-19 09:00:00','Živá Exotika','Praha','CZ','Blažimská 1781/4, Praha 4','https://zivaexotika.cz/'],
 ]; }
function ir_upcoming_public_events(int $limit=99): array {$now=time();$r=array_values(array_filter(ir_public_event_catalog(),fn($e)=>strtotime($e[0])>=$now-86400));usort($r,fn($a,$b)=>strcmp($a[0],$b[0]));return array_slice($r,0,$limit);}

/** One event owns many occurrences; preserves every supplied date without inventing schedules. */
function ir_event_series(): array {
    $series=[];foreach(ir_public_event_catalog() as $id=>$e){$key=hash('sha256',$e[1].'|'.$e[2]);
        if(!isset($series[$key]))$series[$key]=['id'=>$key,'name'=>$e[1],'organizer'=>'','place'=>$e[4],'city'=>$e[2],'country'=>$e[3],'url'=>$e[5],'source'=>$e[5],'description'=>'','type'=>'burza','dates'=>[]];
        $series[$key]['dates'][]=['id'=>$id,'starts_at'=>$e[0]];
    }
    $series['fauna-liberec']=['id'=>'fauna-liberec','name'=>'FAUNA TRHY Liberec','organizer'=>'','place'=>'Centrum Babylon Liberec','city'=>'Liberec','country'=>'CZ','url'=>'','source'=>'Zadání uživatele','description'=>'Pravidelná akce. Termíny nebyly dodány.','type'=>'burza','dates'=>[]];
    return array_values($series);
}
