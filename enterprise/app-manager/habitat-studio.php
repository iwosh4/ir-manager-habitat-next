<?php
require __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/room-layout.php';
require_once __DIR__ . '/includes/assembly-layout.php';
require_once __DIR__ . '/includes/live.php';
require_once __DIR__ . '/includes/shell.php';
require_once __DIR__ . '/includes/habitat-types.php';

$uid = ir_current_user_id();
global $pdo;
$notice = '';
$error = '';

function hs13_num($value, float $default = 0.0): float {
    if ($value === null || $value === '') return $default;
    return (float)str_replace(',', '.', (string)$value);
}
function hs13_dims(?string $raw): array {
    $raw = mb_strtolower(trim((string)$raw), 'UTF-8');
    preg_match_all('/\d+(?:[\.,]\d+)?/', $raw, $m);
    $n = array_map(static fn($v)=>(float)str_replace(',','.',$v), $m[0] ?? []);
    return [max(1,$n[0] ?? 40), max(1,$n[1] ?? 40), max(1,$n[2] ?? 40)];
}
function hs13_fmt(float $n): string {
    $s = number_format($n, 1, '.', '');
    return rtrim(rtrim($s, '0'), '.');
}
function hs13_redirect(array $params = []): never {
    $q = $params ? '?' . http_build_query($params) : '';
    header('Location: habitat-studio.php' . $q);
    exit;
}
function hs13_table(PDO $pdo, string $table): bool {
    return ir_table_exists($pdo, $table);
}
function hs13_visual_style(string $name, array $blocks = []): string {
    $hay = mb_strtolower($name . ' ' . implode(' ', array_map(static fn($b)=>(string)($b['type']??''), $blocks)), 'UTF-8');
    if (str_contains($hay, 'rack') || str_contains($hay, 'box') || str_contains($hay, 'plast')) return 'rackbox';
    if (str_contains($hay, 'palud') || str_contains($hay, 'akva')) return 'paludarium';
    if (str_contains($hay, 'lamino') || str_contains($hay, 'skříň') || str_contains($hay, 'skrin')) return 'lamino';
    return 'glass';
}
function hs13_habitat_kind(string $type): string {
    $t = mb_strtolower(trim($type), 'UTF-8');
    // Inkubační/karanténní box musí být rozpoznán dřív než obecné "box", protože oba názvy slovo "box" obsahují.
    if (str_contains($t,'inkuba')) return 'incubation';
    if (str_contains($t,'karant')) return 'quarantine';
    if (str_contains($t,'palud') || str_contains($t,'akva')) return 'paludarium';
    if (str_contains($t,'rack') || str_contains($t,'plast') || str_contains($t,'box')) return 'box';
    return 'glass';
}

function hs13_extra_catalog(): array {static $catalog;return $catalog??=json_decode((string)file_get_contents(__DIR__.'/assets/habitat-catalog.json'),true,32,JSON_THROW_ON_ERROR);}
function hs13_prop_dims(string $type): array {
    $extra=hs13_extra_catalog()[$type]??null;if($extra)return [$extra['w'],$extra['d'],$extra['h']];
    return match($type) {
        'desk'   => [140, 70, 85],
        'sink'   => [100, 65, 92],
        'ro'     => [70, 55, 175],
        'tank'   => [120, 100, 135],
        'misting'=> [110, 28, 185],
        'cabinet'=> [80, 50, 190],
        'shelf'  => [110, 45, 190],
        'cart'   => [75, 45, 105],
        'fan'    => [45, 30, 180],
        'light'  => [120, 18, 18],
        'heater' => [55, 30, 95],
        'sensor' => [18, 6, 25],
        'thermostat' => [18, 6, 25],
        'pipe-water','pipe-drain','pipe-cable' => [100, 4, 4],
        'plant'  => [55, 55, 125],
        'door'   => [90, 15, 205],
        'window' => [120, 12, 100],
        default  => [80, 50, 90],
    };
}
function hs13_check_placement(PDO $pdo,int $uid,int $roomId,array $input,array $stored): array {
    $q=$pdo->prepare('SELECT r.width_cm w,r.depth_cm d,COALESCE(m.height_cm,260) h FROM wp_ir2_habitat_rooms_71 r LEFT JOIN wp_ir2_habitat_room_meta_130 m ON m.room_id=r.id AND m.user_id=r.user_id WHERE r.user_id=? AND r.id=?');$q->execute([$uid,$roomId]);$room=$q->fetch();if(!$room)throw new RuntimeException('Místnost nebyla nalezena.');
    $g=ir_room_item_geometry($input,$stored,$room);
    $q=$pdo->prepare('SELECT i.id,i.rack_id,i.x_cm x,i.y_cm y,COALESCE(m.width_cm,i.width_cm) w,COALESCE(m.depth_cm,i.depth_cm) d,COALESCE(m.height_cm,i.height_cm) h,i.elevation_cm elevation,i.rotation FROM wp_ir2_habitat_room_items_71 i LEFT JOIN wp_ir2_habitat_rack_meta_71 m ON m.rack_id=i.rack_id AND m.user_id=i.user_id WHERE i.user_id=? AND i.room_id=?');$q->execute([$uid,$roomId]);
    foreach($q as $other){if(!empty($stored['rack_id'])&&(int)$other['rack_id']===(int)$stored['rack_id'])continue;if(ir_room_items_overlap($g,$other))throw new RuntimeException('Na vybraném místě už je jiný objekt.');}
    return $g;
}
function hs13_recalc_assembly(PDO $pdo, int $uid, int $rackId): array {
    if ($rackId <= 0) return [0,0,0];
    [$w,$h,$d]=ir_assembly_dimensions($pdo,$uid,$rackId);
    $q=$pdo->prepare("INSERT INTO wp_ir2_habitat_rack_meta_71 (user_id,rack_id,assembly_type,width_cm,depth_cm,height_cm)
                      VALUES (?,?,'modular',?,?,?)
                      ON DUPLICATE KEY UPDATE assembly_type='modular',width_cm=VALUES(width_cm),depth_cm=VALUES(depth_cm),height_cm=VALUES(height_cm)");
    $q->execute([$uid,$rackId,$w,$d,$h]);
    $q=$pdo->prepare('UPDATE wp_ir2_habitat_room_items_71 SET width_cm=?, depth_cm=? WHERE user_id=? AND rack_id=?');
    $q->execute([$w,$d,$uid,$rackId]);
    return [$w,$h,$d];
}
$hasRooms = hs13_table($pdo,'wp_ir2_habitat_rooms_71');
$hasRoomItems = hs13_table($pdo,'wp_ir2_habitat_room_items_71');
$hasGeometry = hs13_table($pdo,'wp_ir2_habitat_geometry_74');
$hasRackMeta = hs13_table($pdo,'wp_ir2_habitat_rack_meta_71');
$hasBlocks = hs13_table($pdo,'wp_ir2_habitat_assembly_blocks_130');
$hasRoomMeta = hs13_table($pdo,'wp_ir2_habitat_room_meta_130');
$hasItemDetails = ir_db_column_exists($pdo,'wp_ir2_habitat_room_items_71','height_cm') && ir_db_column_exists($pdo,'wp_ir2_habitat_room_items_71','elevation_cm') && ir_db_column_exists($pdo,'wp_ir2_habitat_room_items_71','wall_side');
if (!$hasRooms || !$hasRoomItems || !$hasGeometry || !$hasRackMeta || !$hasBlocks || !$hasRoomMeta) {
    $error = 'Habitat Studio nemá kompletní databázové schéma očekávané aktuálním buildem. Ověř nasazený databázový export před dalšími změnami.';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        ir_verify_csrf();
        $action=(string)($_POST['action']??'');
        $mode=(string)($_POST['mode']??'room');

        if($action==='save_room' && $hasRooms){
            $id=(int)($_POST['room_id']??0);
            $name=trim((string)($_POST['nazev']??'Místnost')) ?: 'Místnost';
            $w=max(200,min(2000,(int)($_POST['width_cm']??500)));
            $d=max(200,min(2000,(int)($_POST['depth_cm']??400)));
            $h=max(210,min(500,(int)($_POST['height_cm']??260)));
            $grid=max(5,min(100,(int)($_POST['grid_cm']??10)));
            $floor=in_array((string)($_POST['floor_style']??'wood'),['wood','graphite','tile','industrial'],true)?(string)$_POST['floor_style']:'wood';
            $wall=in_array((string)($_POST['wall_style']??'light'),['light','warm','sage','bluegray','charcoal','brick'],true)?(string)$_POST['wall_style']:'light';
            if($id>0){
                if(!ir_action_owned($pdo,'wp_ir2_habitat_rooms_71',$uid,$id)) throw new RuntimeException('Místnost nebyla nalezena.');
                $q=$pdo->prepare('UPDATE wp_ir2_habitat_rooms_71 SET nazev=?,width_cm=?,depth_cm=?,grid_cm=? WHERE id=? AND user_id=?');
                $q->execute([$name,$w,$d,$grid,$id,$uid]);
            }else{
                $q=$pdo->prepare('INSERT INTO wp_ir2_habitat_rooms_71 (user_id,nazev,width_cm,depth_cm,grid_cm,poradi) VALUES (?,?,?,?,?,99)');
                $q->execute([$uid,$name,$w,$d,$grid]);
                $id=(int)$pdo->lastInsertId();
            }
            $q=$pdo->prepare("INSERT INTO wp_ir2_habitat_room_meta_130 (user_id,room_id,height_cm,floor_style,wall_style) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE height_cm=VALUES(height_cm),floor_style=VALUES(floor_style),wall_style=VALUES(wall_style)");
            $q->execute([$uid,$id,$h,$floor,$wall]);
            hs13_redirect(['mode'=>'room','room'=>$id,'saved'=>1]);
        }

        if($action==='create_assembly'){
            $name=trim((string)($_POST['nazev']??'Nová sestava')) ?: 'Nová sestava';
            $pdo->beginTransaction();
            $q=$pdo->prepare('INSERT INTO wp_ir2_racky (user_id,nazev,pocet_radku,pocet_sloupcu,poradi) VALUES (?,?,1,1,99)');
            $q->execute([$uid,$name]);
            $rackId=(int)$pdo->lastInsertId();
            $q=$pdo->prepare("INSERT INTO wp_ir2_habitat_rack_meta_71 (user_id,rack_id,assembly_type,width_cm,depth_cm,height_cm) VALUES (?,?,'modular',0,0,0)");
            $q->execute([$uid,$rackId]);
            $pdo->commit();
            hs13_redirect(['mode'=>'assembly','rack'=>$rackId,'saved'=>1]);
        }

        if($action==='rename_assembly'){
            $rackId=(int)($_POST['rack_id']??0);
            $name=trim((string)($_POST['nazev']??''));
            if($rackId<=0 || $name==='') throw new RuntimeException('Neplatná sestava.');
            if(!ir_action_owned($pdo,'wp_ir2_racky',$uid,$rackId)) throw new RuntimeException('Sestava nebyla nalezena.');
            $q=$pdo->prepare('UPDATE wp_ir2_racky SET nazev=? WHERE id=? AND user_id=?');
            $q->execute([$name,$rackId,$uid]);
            hs13_redirect(['mode'=>'assembly','rack'=>$rackId,'saved'=>1]);
        }

        if($action==='delete_assembly' && $hasBlocks && $hasRackMeta){
            $rackId=(int)($_POST['rack_id']??0);$confirm=(string)($_POST['confirm']??'');
            if($confirm!=='DELETE')throw new RuntimeException('Chybí potvrzení smazání sestavy.');
            if(!$rackId || !ir_action_owned($pdo,'wp_ir2_racky',$uid,$rackId))throw new RuntimeException('Sestava nebyla nalezena.');
            if($hasRoomItems){$q=$pdo->prepare('SELECT COUNT(*) FROM wp_ir2_habitat_room_items_71 WHERE user_id=? AND rack_id=?');$q->execute([$uid,$rackId]);if((int)$q->fetchColumn()>0)throw new RuntimeException('Sestava je umístěná v místnosti. Nejprve ji z místnosti odeber.');}
            $pdo->beginTransaction();
            $pdo->prepare('UPDATE wp_ir2_ubikace SET rack_id=NULL,grid_row=NULL,grid_col=NULL WHERE user_id=? AND rack_id=?')->execute([$uid,$rackId]);
            $pdo->prepare('DELETE FROM wp_ir2_habitat_assembly_blocks_130 WHERE user_id=? AND rack_id=?')->execute([$uid,$rackId]);
            $pdo->prepare('DELETE FROM wp_ir2_habitat_rack_meta_71 WHERE user_id=? AND rack_id=?')->execute([$uid,$rackId]);
            $pdo->prepare('DELETE FROM wp_ir2_racky WHERE id=? AND user_id=?')->execute([$rackId,$uid]);
            $pdo->commit();
            hs13_redirect(['mode'=>'assembly','saved'=>1]);
        }

        if($action==='create_habitat'){
            $name=trim((string)($_POST['nazev']??'Nová ubikace')) ?: 'Nová ubikace';
            $type=trim((string)($_POST['typ']??'Terárium')) ?: 'Terárium';
            $type=ir_habitat_type($type);
            $w=max(10,min(600,hs13_num($_POST['width_cm']??40,40)));
            $h=max(10,min(400,hs13_num($_POST['height_cm']??40,40)));
            $d=max(10,min(300,hs13_num($_POST['depth_cm']??40,40)));
            $temp=($_POST['teplota_den']??'')!==''?hs13_num($_POST['teplota_den']):null;
            $hum=($_POST['vlhkost']??'')!==''?max(0,min(100,(int)$_POST['vlhkost'])):null;
            $dims=hs13_fmt($w).'x'.hs13_fmt($d).'x'.hs13_fmt($h);
            $pdo->beginTransaction();
            $q=$pdo->prepare('INSERT INTO wp_ir2_ubikace (user_id,nazev,typ,rozmery,teplota_den,vlhkost,rack_id,grid_row,grid_col) VALUES (?,?,?,?,?,?,NULL,NULL,NULL)');
            $q->execute([$uid,$name,$type,$dims,$temp,$hum]);
            $hid=(int)$pdo->lastInsertId();
            if($hasGeometry){
                $q=$pdo->prepare("INSERT INTO wp_ir2_habitat_geometry_74 (user_id,habitat_id,shape,width_cm,depth_cm,height_cm) VALUES (?,?,'rect',?,?,?) ON DUPLICATE KEY UPDATE width_cm=VALUES(width_cm),depth_cm=VALUES(depth_cm),height_cm=VALUES(height_cm)");
                $q->execute([$uid,$hid,$w,$d,$h]);
            }
            $pdo->commit();
            hs13_redirect(['mode'=>'habitat','saved'=>1]);
        }

        if($action==='save_habitat'){
            $hid=(int)($_POST['habitat_id']??0);
            if(!$hid || !ir_action_owned($pdo,'wp_ir2_ubikace',$uid,$hid)) throw new RuntimeException('Ubikace nebyla nalezena.');
            $name=trim((string)($_POST['nazev']??''));if($name==='')throw new RuntimeException('Název ubikace je povinný.');
            $type=trim((string)($_POST['typ']??'Terárium')) ?: 'Terárium';
            $type=ir_habitat_type($type);
            $w=max(10,min(600,hs13_num($_POST['width_cm']??40,40)));$h=max(10,min(400,hs13_num($_POST['height_cm']??40,40)));$d=max(10,min(300,hs13_num($_POST['depth_cm']??40,40)));
            $temp=($_POST['teplota_den']??'')!==''?hs13_num($_POST['teplota_den']):null;$hum=($_POST['vlhkost']??'')!==''?max(0,min(100,(int)$_POST['vlhkost'])):null;
            $dims=hs13_fmt($w).'x'.hs13_fmt($d).'x'.hs13_fmt($h);
            $pdo->beginTransaction();
            $rackQ=$pdo->prepare('SELECT rack_id FROM wp_ir2_ubikace WHERE id=? AND user_id=?');$rackQ->execute([$hid,$uid]);$affectedRack=(int)($rackQ->fetchColumn()?:0);
            $pdo->prepare('UPDATE wp_ir2_ubikace SET nazev=?,typ=?,rozmery=?,teplota_den=?,vlhkost=? WHERE id=? AND user_id=?')->execute([$name,$type,$dims,$temp,$hum,$hid,$uid]);
            $pdo->prepare("INSERT INTO wp_ir2_habitat_geometry_74 (user_id,habitat_id,shape,width_cm,depth_cm,height_cm) VALUES (?,?,'rect',?,?,?) ON DUPLICATE KEY UPDATE width_cm=VALUES(width_cm),depth_cm=VALUES(depth_cm),height_cm=VALUES(height_cm)")->execute([$uid,$hid,$w,$d,$h]);
            $pdo->commit();
            if($affectedRack)hs13_recalc_assembly($pdo,$uid,$affectedRack);
            hs13_redirect(['mode'=>'habitat','saved'=>1]);
        }

        if($action==='clone_habitat'){
            $sourceId=(int)($_POST['habitat_id']??0);
            if(!$sourceId || !ir_action_owned($pdo,'wp_ir2_ubikace',$uid,$sourceId)) throw new RuntimeException('Ubikace nebyla nalezena.');
            $q=$pdo->prepare('SELECT * FROM wp_ir2_ubikace WHERE id=? AND user_id=?');$q->execute([$sourceId,$uid]);$source=$q->fetch();
            $pdo->beginTransaction();
            $q=$pdo->prepare('INSERT INTO wp_ir2_ubikace (user_id,nazev,skupina_rack,typ,rozmery,teplota_den,teplota_noc,vlhkost,poznamka,rack_id,grid_row,grid_col) VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)');
            $q->execute([$uid,mb_substr((string)$source['nazev'].' – kopie',0,150,'UTF-8'),null,$source['typ'],$source['rozmery'],$source['teplota_den'],$source['teplota_noc'],$source['vlhkost'],$source['poznamka']]);
            $newId=(int)$pdo->lastInsertId();
            if($hasGeometry){$g=$pdo->prepare("INSERT INTO wp_ir2_habitat_geometry_74 (user_id,habitat_id,shape,width_cm,depth_cm,height_cm,return_cm,orientation) SELECT user_id,?,shape,width_cm,depth_cm,height_cm,return_cm,orientation FROM wp_ir2_habitat_geometry_74 WHERE user_id=? AND habitat_id=?");$g->execute([$newId,$uid,$sourceId]);}
            $pdo->commit();
            hs13_redirect(['mode'=>'habitat','edit'=>$newId,'saved'=>1]);
        }

        if($action==='delete_habitat'){
            $hid=(int)($_POST['habitat_id']??0);$confirm=(string)($_POST['confirm']??'');
            if($confirm!=='DELETE')throw new RuntimeException('Chybí potvrzení smazání.');
            if(!$hid || !ir_action_owned($pdo,'wp_ir2_ubikace',$uid,$hid))throw new RuntimeException('Ubikace nebyla nalezena.');
            $q=$pdo->prepare('SELECT COUNT(*) FROM wp_ir2_zvirata WHERE user_id=? AND ubikace_id=?');$q->execute([$uid,$hid]);if((int)$q->fetchColumn()>0)throw new RuntimeException('Obsazenou ubikaci nelze smazat. Nejprve bezpečně přesuň zvířata.');
            if(ir_db_table_exists($pdo,'wp_ir2_ubikace_udalosti')){$q=$pdo->prepare('SELECT COUNT(*) FROM wp_ir2_ubikace_udalosti WHERE user_id=? AND ubikace_id=?');$q->execute([$uid,$hid]);if((int)$q->fetchColumn()>0)throw new RuntimeException('Ubikace má historii událostí a nelze ji trvale smazat.');}
            $pdo->beginTransaction();
            $rackQ=$pdo->prepare('SELECT rack_id FROM wp_ir2_ubikace WHERE id=? AND user_id=?');$rackQ->execute([$hid,$uid]);$affectedRack=(int)($rackQ->fetchColumn()?:0);
            if($hasBlocks)$pdo->prepare('DELETE FROM wp_ir2_habitat_assembly_blocks_130 WHERE user_id=? AND habitat_id=?')->execute([$uid,$hid]);
            if($hasGeometry)$pdo->prepare('DELETE FROM wp_ir2_habitat_geometry_74 WHERE user_id=? AND habitat_id=?')->execute([$uid,$hid]);
            if(ir_db_table_exists($pdo,'wp_ir2_ubikace_pravidla'))$pdo->prepare('DELETE FROM wp_ir2_ubikace_pravidla WHERE user_id=? AND ubikace_id=?')->execute([$uid,$hid]);
            $pdo->prepare('DELETE FROM wp_ir2_ubikace WHERE id=? AND user_id=?')->execute([$hid,$uid]);
            $pdo->commit();if($affectedRack)hs13_recalc_assembly($pdo,$uid,$affectedRack);
            hs13_redirect(['mode'=>'habitat','saved'=>1]);
        }

        if($action==='save_assembly_layout' && $hasBlocks){
            $rackId=(int)($_POST['rack_id']??0);
            $payload=json_decode((string)($_POST['layout_json']??'[]'),true);
            if($rackId<=0 || !is_array($payload)) throw new RuntimeException('Neplatné rozložení sestavy.');
            if(!ir_action_owned($pdo,'wp_ir2_racky',$uid,$rackId)) throw new RuntimeException('Sestava nebyla nalezena.');
            $ids=[];
            foreach($payload as $p){$id=(int)($p['habitatId']??0); if($id>0)$ids[$id]=true;}
            $valid=[];
            if($ids){
                $ph=implode(',',array_fill(0,count($ids),'?'));
                $q=$pdo->prepare("SELECT id FROM wp_ir2_ubikace WHERE user_id=? AND id IN ($ph)");
                $q->execute(array_merge([$uid],array_keys($ids)));
                foreach($q->fetchAll(PDO::FETCH_COLUMN) ?: [] as $id)$valid[(int)$id]=true;
            }
            if(count($payload)>200)throw new RuntimeException('Sestava může obsahovat nejvýše 200 bloků.');
            if(count($valid)!==count($ids))throw new RuntimeException('Některá ubikace není dostupná.');
            $rects=[];$seen=[];
            foreach($payload as $p){
                $hid=(int)($p['habitatId']??0);
                if($hid>0){
                    if(isset($seen[$hid]))throw new RuntimeException('Ubikace je v sestavě vícekrát.');$seen[$hid]=true;
                    $q=$pdo->prepare('SELECT u.rozmery,g.width_cm,g.height_cm,g.depth_cm FROM wp_ir2_ubikace u LEFT JOIN wp_ir2_habitat_geometry_74 g ON g.habitat_id=u.id AND g.user_id=u.user_id WHERE u.user_id=? AND u.id=?');$q->execute([$uid,$hid]);$r=$q->fetch();
                    [$dw,$dd,$dh]=hs13_dims($r['rozmery']??'');$w=hs13_num($r['width_cm']??null,$dw);$h=hs13_num($r['height_cm']??null,$dh);$d=hs13_num($r['depth_cm']??null,$dd);
                }else{$w=hs13_num($p['w']??0);$h=hs13_num($p['h']??0);$d=hs13_num($p['d']??0);}
                $x=hs13_num($p['x']??-1);$z=hs13_num($p['z']??-1);
                if(min($w,$h,$d)<1||max($w,$h,$d)>2000||min($x,$z)<0||max($x+$w,$z+$h)>10000)throw new RuntimeException('Neplatné rozměry nebo pozice bloku.');
                foreach($rects as $a)if($x+.25<$a['x']+$a['w']&&$x+$w-.25>$a['x']&&$z+.25<$a['z']+$a['h']&&$z+$h-.25>$a['z'])throw new RuntimeException('Bloky sestavy se překrývají.');
                $rects[]=compact('x','z','w','h','d');
            }
            $oldRackIds=[];
            if($valid){
                $ph=implode(',',array_fill(0,count($valid),'?'));
                $q=$pdo->prepare("SELECT DISTINCT rack_id FROM wp_ir2_habitat_assembly_blocks_130 WHERE user_id=? AND habitat_id IN ($ph)");
                $q->execute(array_merge([$uid],array_keys($valid)));
                foreach($q->fetchAll(PDO::FETCH_COLUMN) ?: [] as $r)$oldRackIds[(int)$r]=true;
            }
            $pdo->beginTransaction();
            $q=$pdo->prepare('SELECT habitat_id FROM wp_ir2_habitat_assembly_blocks_130 WHERE user_id=? AND rack_id=?');
            $q->execute([$uid,$rackId]);
            $previous=array_map('intval',$q->fetchAll(PDO::FETCH_COLUMN) ?: []);
            $q=$pdo->prepare('DELETE FROM wp_ir2_habitat_assembly_blocks_130 WHERE user_id=? AND rack_id=?');
            $q->execute([$uid,$rackId]);
            if($valid){
                $ph=implode(',',array_fill(0,count($valid),'?'));
                $q=$pdo->prepare("DELETE FROM wp_ir2_habitat_assembly_blocks_130 WHERE user_id=? AND habitat_id IN ($ph)");
                $q->execute(array_merge([$uid],array_keys($valid)));
            }
            $ins=$pdo->prepare('INSERT INTO wp_ir2_habitat_assembly_blocks_130 (user_id,rack_id,habitat_id,x_cm,z_cm,sort_order,reserve_width_cm,reserve_height_cm,reserve_depth_cm) VALUES (?,?,?,?,?,?,?,?,?)');
            $placed=[]; $order=0;
            foreach($payload as $p){
                $hid=(int)($p['habitatId']??0);
                if($hid>0 && empty($valid[$hid])) throw new RuntimeException('Ubikace není dostupná.');
                $x=max(0,hs13_num($p['x']??0)); $z=max(0,hs13_num($p['z']??0));
                $ins->execute([$uid,$rackId,$hid>0?$hid:null,round($x,1),round($z,1),++$order,$hid>0?null:hs13_num($p['w']),$hid>0?null:hs13_num($p['h']),$hid>0?null:hs13_num($p['d'])]);
                if($hid>0)$placed[]=$hid;
            }
            if($previous){
                $ph=implode(',',array_fill(0,count($previous),'?'));
                $q=$pdo->prepare("UPDATE wp_ir2_ubikace SET rack_id=NULL,grid_row=NULL,grid_col=NULL WHERE user_id=? AND id IN ($ph)");
                $q->execute(array_merge([$uid],$previous));
            }
            if($placed){
                $ph=implode(',',array_fill(0,count($placed),'?'));
                $q=$pdo->prepare("UPDATE wp_ir2_ubikace SET rack_id=?,grid_row=NULL,grid_col=NULL WHERE user_id=? AND id IN ($ph)");
                $q->execute(array_merge([$rackId,$uid],$placed));
            }
            hs13_recalc_assembly($pdo,$uid,$rackId);
            foreach(array_keys($oldRackIds) as $old)if($old!==$rackId)hs13_recalc_assembly($pdo,$uid,$old);
            $pdo->commit();
            hs13_redirect(['mode'=>'assembly','rack'=>$rackId,'saved'=>1]);
        }

        if($action==='add_room_rack' && $hasRoomItems){
            $roomId=(int)($_POST['room_id']??0); $rackId=(int)($_POST['rack_id']??0);
            if($roomId<=0 || $rackId<=0) throw new RuntimeException('Vyber místnost a sestavu.');
            if(!ir_action_owned($pdo,'wp_ir2_habitat_rooms_71',$uid,$roomId)) throw new RuntimeException('Místnost nebyla nalezena.');
            $q=$pdo->prepare('SELECT r.nazev,m.width_cm,m.depth_cm,m.height_cm FROM wp_ir2_racky r LEFT JOIN wp_ir2_habitat_rack_meta_71 m ON m.rack_id=r.id AND m.user_id=r.user_id WHERE r.id=? AND r.user_id=?');
            $q->execute([$rackId,$uid]); $r=$q->fetch(); if(!$r)throw new RuntimeException('Sestava nebyla nalezena.');
            $w=max(20,hs13_num($r['width_cm']??40,40)); $d=max(10,hs13_num($r['depth_cm']??40,40));
            $x=round(max(0,hs13_num($_POST['x_cm']??30,30))); $y=round(max(0,hs13_num($_POST['y_cm']??30,30)));
            $q=$pdo->prepare("INSERT INTO wp_ir2_habitat_room_items_71 (user_id,room_id,item_type,rack_id,label,x_cm,y_cm,width_cm,depth_cm,rotation,z_index)
                              VALUES (?,?,'rack',?,?,?,?,?,?,?,20)
                              ON DUPLICATE KEY UPDATE room_id=VALUES(room_id),label=VALUES(label),width_cm=VALUES(width_cm),depth_cm=VALUES(depth_cm),x_cm=VALUES(x_cm),y_cm=VALUES(y_cm),rotation=VALUES(rotation)");
            $rotation=(int)($_POST['rotation']??0);if(!in_array($rotation,[0,90,180,270],true))throw new RuntimeException('Neplatná rotace.');
            $g=hs13_check_placement($pdo,$uid,$roomId,['x'=>$x,'y'=>$y,'rotation'=>$rotation],['rack_id'=>$rackId,'item_type'=>'rack','rack_w'=>$w,'rack_d'=>$d,'rack_h'=>max(1,hs13_num($r['height_cm'],40))]);
            $q->execute([$uid,$roomId,$rackId,$r['nazev'],$g['x'],$g['y'],$w,$d,$rotation]);
            hs13_redirect(['mode'=>'room','room'=>$roomId,'saved'=>1]);
        }

        if($action==='add_room_prop' && $hasRoomItems){
            $roomId=(int)($_POST['room_id']??0); $type=trim((string)($_POST['item_type']??'desk'));
            if($roomId<=0) throw new RuntimeException('Vyber místnost.');
            if(!ir_action_owned($pdo,'wp_ir2_habitat_rooms_71',$uid,$roomId)) throw new RuntimeException('Místnost nebyla nalezena.');
            $roomQ=$pdo->prepare('SELECT width_cm,depth_cm FROM wp_ir2_habitat_rooms_71 WHERE id=? AND user_id=?');$roomQ->execute([$roomId,$uid]);$roomDim=$roomQ->fetch()?:['width_cm'=>500,'depth_cm'=>400];
            [$w,$d,$h]=hs13_prop_dims($type);
            $allowed=['desk','sink','ro','tank','misting','cabinet','shelf','cart','fan','light','heater','sensor','thermostat','pipe-water','pipe-drain','pipe-cable','plant','door','window'];
            $allowed=array_merge($allowed,array_keys(hs13_extra_catalog()));if(!in_array($type,$allowed,true)) throw new RuntimeException('Neplatný typ vybavení.');
            $label=trim((string)($_POST['label']??'')) ?: (hs13_extra_catalog()[$type]['name']??'');if($label==='')$label=match($type){'desk'=>'Pracovní stůl','sink'=>'Dřez / mycí zóna','ro'=>'RO systém','tank'=>'Nádrž na vodu','misting'=>'Mlžicí systém','cabinet'=>'Technická skříň','shelf'=>'Regál','cart'=>'Servisní vozík','fan'=>'Ventilace','light'=>'LED světlo','heater'=>'Topení','sensor'=>'Senzor','thermostat'=>'Termostat','pipe-water'=>'Rozvod vody','pipe-drain'=>'Odpad','pipe-cable'=>'Kabelový rozvod','plant'=>'Rostlina','door'=>'Dveře','window'=>'Okno',default=>'Vybavení'};
            $x=max(0,hs13_num($_POST['x_cm']??40,40)); $y=max(0,hs13_num($_POST['y_cm']??40,40));
            $rotation=(int)($_POST['rotation']??0);if(!in_array($rotation,[0,90,180,270],true))throw new RuntimeException('Neplatná rotace.');
            $x=round($x); $y=round($y);
            $wall=(string)($_POST['wall_side']??'');
            if(!in_array($wall,['','north','east','south','west'],true))$wall='';
            $elevation=max(0,round(hs13_num($_POST['elevation_cm']??0)));
            if(str_starts_with($type,'door'))$elevation=0;
            if($hasItemDetails){
                if(in_array(explode('-',$type)[0],['door','window'],true) && $wall!==''){
                    $rotation=['north'=>0,'east'=>90,'south'=>180,'west'=>270][$wall];
                    $bw=$rotation%180===0?$w:$d; $bd=$rotation%180===0?$d:$w;
                    if($wall==='north')$y=0;
                    elseif($wall==='south')$y=max(0,hs13_num($roomDim['depth_cm']??400)-$bd);
                    elseif($wall==='west')$x=0;
                    elseif($wall==='east')$x=max(0,hs13_num($roomDim['width_cm']??500)-$bw);
                }
                $g=hs13_check_placement($pdo,$uid,$roomId,['x'=>$x,'y'=>$y,'rotation'=>$rotation,'wall'=>$wall,'elevation'=>$elevation],['item_type'=>$type,'width_cm'=>$w,'depth_cm'=>$d,'height_cm'=>$h]);$x=$g['x'];$y=$g['y'];$rotation=$g['rotation'];
                $q=$pdo->prepare('INSERT INTO wp_ir2_habitat_room_items_71 (user_id,room_id,item_type,rack_id,label,x_cm,y_cm,width_cm,depth_cm,height_cm,elevation_cm,wall_side,rotation,z_index) VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,?,30)');
                $q->execute([$uid,$roomId,$type,$label,$x,$y,$w,$d,$h,$elevation,$wall,$rotation]);
            }else{
                $q=$pdo->prepare('INSERT INTO wp_ir2_habitat_room_items_71 (user_id,room_id,item_type,rack_id,label,x_cm,y_cm,width_cm,depth_cm,rotation,z_index) VALUES (?,?,?,NULL,?,?,?,?,?,?,30)');
                $q->execute([$uid,$roomId,$type,$label,$x,$y,$w,$d,$rotation]);
            }
            hs13_redirect(['mode'=>'room','room'=>$roomId,'saved'=>1]);
        }

        if($action==='delete_room_item' && $hasRoomItems){
            $roomId=(int)($_POST['room_id']??0); $itemId=(int)($_POST['item_id']??0);
            if(!ir_action_owned($pdo,'wp_ir2_habitat_rooms_71',$uid,$roomId)) throw new RuntimeException('Místnost nebyla nalezena.');
            $q=$pdo->prepare('DELETE FROM wp_ir2_habitat_room_items_71 WHERE id=? AND user_id=? AND room_id=?');
            $q->execute([$itemId,$uid,$roomId]);
            hs13_redirect(['mode'=>'room','room'=>$roomId,'saved'=>1]);
        }

        if($action==='delete_room' && $hasRooms && $hasRoomItems && $hasRoomMeta){
            $roomId=(int)($_POST['room_id']??0);$confirm=(string)($_POST['confirm']??'');
            if($confirm!=='DELETE')throw new RuntimeException('Chybí potvrzení smazání místnosti.');
            if(!$roomId || !ir_action_owned($pdo,'wp_ir2_habitat_rooms_71',$uid,$roomId))throw new RuntimeException('Místnost nebyla nalezena.');
            $pdo->beginTransaction();
            $pdo->prepare('DELETE FROM wp_ir2_habitat_room_items_71 WHERE user_id=? AND room_id=?')->execute([$uid,$roomId]);
            $pdo->prepare('DELETE FROM wp_ir2_habitat_room_meta_130 WHERE user_id=? AND room_id=?')->execute([$uid,$roomId]);
            $pdo->prepare('DELETE FROM wp_ir2_habitat_rooms_71 WHERE id=? AND user_id=?')->execute([$roomId,$uid]);
            $pdo->commit();
            hs13_redirect(['mode'=>'room','saved'=>1]);
        }

        if($action==='save_room_layout' && $hasRoomItems){
            if (!$hasItemDetails) throw new RuntimeException('Pro ukládání nových vlastností místnosti nejdřív aplikuj migraci 17.0 beta 1.');
            $roomId=(int)($_POST['room_id']??0);
            $payload=json_decode((string)($_POST['layout_json']??'[]'),true);
            if($roomId<=0 || !is_array($payload)) throw new RuntimeException('Neplatné rozložení místnosti.');
            if(!ir_action_owned($pdo,'wp_ir2_habitat_rooms_71',$uid,$roomId)) throw new RuntimeException('Místnost nebyla nalezena.');
            $floor=in_array((string)($_POST['floor_style']??'wood'),['wood','graphite','tile','industrial'],true)?(string)$_POST['floor_style']:'wood';
            $wall=in_array((string)($_POST['wall_style']??'light'),['light','warm','sage','bluegray','charcoal','brick'],true)?(string)$_POST['wall_style']:'light';
            $pdo->beginTransaction();
            $r=$pdo->prepare('SELECT r.width_cm w,r.depth_cm d,COALESCE(m.height_cm,260) h FROM wp_ir2_habitat_rooms_71 r LEFT JOIN wp_ir2_habitat_room_meta_130 m ON m.room_id=r.id AND m.user_id=r.user_id WHERE r.id=? AND r.user_id=? FOR UPDATE');
            $r->execute([$roomId,$uid]); $bounds=$r->fetch();
            $read=$pdo->prepare('SELECT i.*,m.width_cm rack_w,m.depth_cm rack_d,m.height_cm rack_h FROM wp_ir2_habitat_room_items_71 i LEFT JOIN wp_ir2_habitat_rack_meta_71 m ON m.rack_id=i.rack_id AND m.user_id=i.user_id WHERE i.id=? AND i.user_id=? AND i.room_id=?');
            $q=$pdo->prepare('UPDATE wp_ir2_habitat_room_items_71 SET x_cm=?,y_cm=?,rotation=?,z_index=?,width_cm=?,depth_cm=?,height_cm=?,elevation_cm=?,wall_side=?,label=?,appearance=? WHERE id=? AND user_id=? AND room_id=?');
            $seen=[];$geometries=[];
            foreach($payload as $p){
                if (!is_array($p) || isset($seen[(int)($p['id']??0)])) throw new RuntimeException('Neplatný nebo opakovaný objekt.');
                $id=(int)($p['id']??0); $seen[$id]=true;
                $read->execute([$id,$uid,$roomId]); $stored=$read->fetch();
                if (!$stored) throw new RuntimeException('Objekt místnosti nebyl nalezen. Obnov stránku.');
                $stored['height_cm'] ??= hs13_prop_dims((string)$stored['item_type'])[2];
                $g=ir_room_item_geometry($p,$stored,$bounds);$geometries[]=[$id,$g];
                $q->execute([$g['x'],$g['y'],$g['rotation'],max(1,min(10000,(int)($p['zIndex']??20))),$g['w'],$g['d'],$g['h'],$g['elevation'],$g['wall'],!empty($stored['rack_id'])?$stored['label']:mb_substr(trim((string)($p['label']??$stored['label'])),0,190),in_array($p['appearance']??'',['graphite','steel','wood','white'],true)?$p['appearance']:'graphite',$id,$uid,$roomId]);
                // Verify the persisted coordinates inside the same transaction. This prevents a false “saved” state.
                $verify=$pdo->prepare('SELECT x_cm,y_cm,rotation FROM wp_ir2_habitat_room_items_71 WHERE id=? AND user_id=? AND room_id=?');
                $verify->execute([$id,$uid,$roomId]); $saved=$verify->fetch();
                if(!$saved || abs((float)$saved['x_cm']-(float)$g['x'])>.11 || abs((float)$saved['y_cm']-(float)$g['y'])>.11 || (int)$saved['rotation']!==(int)$g['rotation']) {
                    throw new RuntimeException('Pozici objektu se nepodařilo potvrdit v databázi. Uložení bylo zrušeno.');
                }
            }
            $count=$pdo->prepare('SELECT COUNT(*) FROM wp_ir2_habitat_room_items_71 WHERE user_id=? AND room_id=?');$count->execute([$uid,$roomId]);if((int)$count->fetchColumn()!==count($geometries))throw new RuntimeException('Obsah místnosti se mezitím změnil. Obnov stránku.');
            for($i=0;$i<count($geometries);$i++)for($j=$i+1;$j<count($geometries);$j++)if(ir_room_items_overlap($geometries[$i][1],$geometries[$j][1]))throw new RuntimeException('Objekty #'.$geometries[$i][0].' a #'.$geometries[$j][0].' se překrývají. Uprav jejich umístění.');
            $q=$pdo->prepare('UPDATE wp_ir2_habitat_room_meta_130 SET floor_style=?,wall_style=? WHERE user_id=? AND room_id=?');
            $q->execute([$floor,$wall,$uid,$roomId]);
            $pdo->commit();
            hs13_redirect(['mode'=>'room','room'=>$roomId,'saved'=>1]);
        }

    } catch(Throwable $e){
        if($pdo->inTransaction())$pdo->rollBack();
        error_log('Habitat Studio: '.$e->getMessage());
        $error=$e instanceof PDOException?'Změnu se nepodařilo uložit. Ověř databázové schéma v System Check.':$e->getMessage();
    }
}
if(isset($_GET['saved']))$notice='Změny byly uloženy.';

$mode=(string)($_GET['mode']??'room');
if(!in_array($mode,['room','assembly','habitat','maintenance'],true))$mode='room';
$rendererV2=((string)($_GET['renderer']??''))==='v2';

$rooms=[]; $racks=[]; $habitats=[]; $animalsByHabitat=[]; $blocksByRack=[]; $roomItems=[];
if($hasRooms){
    $q=$pdo->prepare("SELECT r.*,COALESCE(m.height_cm,260) room_height_cm,COALESCE(m.floor_style,'wood') floor_style,COALESCE(m.wall_style,'light') wall_style FROM wp_ir2_habitat_rooms_71 r LEFT JOIN wp_ir2_habitat_room_meta_130 m ON m.room_id=r.id AND m.user_id=r.user_id WHERE r.user_id=? ORDER BY r.poradi,r.id");
    $q->execute([$uid]); $rooms=$q->fetchAll() ?: [];
}
$q=$pdo->prepare("SELECT r.*,COALESCE(m.width_cm,0) width_cm,COALESCE(m.depth_cm,0) depth_cm,COALESCE(m.height_cm,0) height_cm,COALESCE(m.assembly_type,'modular') assembly_type
                  FROM wp_ir2_racky r LEFT JOIN wp_ir2_habitat_rack_meta_71 m ON m.rack_id=r.id AND m.user_id=r.user_id WHERE r.user_id=? ORDER BY r.poradi,r.id");
$q->execute([$uid]); $racks=$q->fetchAll() ?: [];
if($hasGeometry){
    $q=$pdo->prepare('SELECT u.*,g.width_cm geo_w,g.depth_cm geo_d,g.height_cm geo_h FROM wp_ir2_ubikace u LEFT JOIN wp_ir2_habitat_geometry_74 g ON g.habitat_id=u.id AND g.user_id=u.user_id WHERE u.user_id=? ORDER BY u.nazev,u.id');
}else{
    $q=$pdo->prepare('SELECT u.*,NULL geo_w,NULL geo_d,NULL geo_h FROM wp_ir2_ubikace u WHERE u.user_id=? ORDER BY u.nazev,u.id');
}
$q->execute([$uid]); $habitats=$q->fetchAll() ?: [];
$q=$pdo->prepare("SELECT id,jmeno_kod,latinsky_nazev,druh,foto,ubikace_id FROM wp_ir2_zvirata WHERE user_id=? AND ubikace_id IS NOT NULL AND COALESCE(status_chovu,'') NOT IN ('Prodáno','Uhynulo','Archiv') ORDER BY id");
$q->execute([$uid]); foreach($q->fetchAll() ?: [] as $a)$animalsByHabitat[(int)$a['ubikace_id']][]=$a;
if($hasBlocks){
    $q=$pdo->prepare('SELECT * FROM wp_ir2_habitat_assembly_blocks_130 WHERE user_id=? ORDER BY rack_id,sort_order,id');
    $q->execute([$uid]); foreach($q->fetchAll() ?: [] as $b)$blocksByRack[(int)$b['rack_id']][]=$b;
}

$habitatById=[];
foreach($habitats as &$h){
    [$pw,$pd,$ph]=hs13_dims($h['rozmery']??'');
    $h['_w']=max(1,hs13_num($h['geo_w']??null,$pw));
    $h['_d']=max(1,hs13_num($h['geo_d']??null,$pd));
    $h['_h']=max(1,hs13_num($h['geo_h']??null,$ph));
    $habitatById[(int)$h['id']]=$h;
}
unset($h);

$roomId=(int)($_GET['room']??0); if(!$roomId && $rooms)$roomId=(int)$rooms[0]['id'];
$room=null; foreach($rooms as $r)if((int)$r['id']===$roomId){$room=$r;break;}
if(!$room && $rooms){$room=$rooms[0];$roomId=(int)$room['id'];}
$rackId=(int)($_GET['rack']??0); if(!$rackId && $racks)$rackId=(int)$racks[0]['id'];
$selectedRack=null; foreach($racks as $r)if((int)$r['id']===$rackId){$selectedRack=$r;break;}
if(!$selectedRack && $racks){$selectedRack=$racks[0];$rackId=(int)$selectedRack['id'];}

if($room && $hasRoomItems){
    $q=$pdo->prepare("SELECT i.*,r.nazev rack_name,COALESCE(m.width_cm,i.width_cm) rack_w,COALESCE(m.depth_cm,i.depth_cm) rack_d,COALESCE(m.height_cm,0) rack_h
                      FROM wp_ir2_habitat_room_items_71 i
                      LEFT JOIN wp_ir2_racky r ON r.id=i.rack_id AND r.user_id=i.user_id
                      LEFT JOIN wp_ir2_habitat_rack_meta_71 m ON m.rack_id=i.rack_id AND m.user_id=i.user_id
                      WHERE i.user_id=? AND i.room_id=? ORDER BY i.z_index,i.id");
    $q->execute([$uid,$roomId]); $roomItems=$q->fetchAll() ?: [];
}

$rackPayload=[];
$assignedHabitatIds=[];
foreach($racks as $r){
    $rid=(int)$r['id']; $blocks=[];
    foreach($blocksByRack[$rid]??[] as $b){
        $hid=(int)$b['habitat_id'];
        if(!$hid){$blocks[]=['habitatId'=>-(int)$b['id'],'reserved'=>true,'name'=>'Rezervovaná pozice','type'=>'Rezerva','x'=>hs13_num($b['x_cm']),'z'=>hs13_num($b['z_cm']),'w'=>hs13_num($b['reserve_width_cm'],40),'h'=>hs13_num($b['reserve_height_cm'],40),'d'=>hs13_num($b['reserve_depth_cm'],40),'occupied'=>false];continue;}
        if(!isset($habitatById[$hid]))continue;
        $h=$habitatById[$hid]; $occ=$animalsByHabitat[$hid][0]??null;
        $assignedHabitatIds[$hid]=true;
        $blocks[]=[
            'habitatId'=>$hid,'name'=>(string)$h['nazev'],'type'=>(string)($h['typ']??'Terárium'),
            'x'=>hs13_num($b['x_cm']),'z'=>hs13_num($b['z_cm']),'w'=>(float)$h['_w'],'h'=>(float)$h['_h'],'d'=>(float)$h['_d'],
            'occupied'=>(bool)$occ,'animal'=>implode(' · ',array_map(static fn($a)=>(string)($a['jmeno_kod']?:$a['latinsky_nazev']?:$a['druh']),$animalsByHabitat[$hid]??[])),
            'animals'=>array_map(static fn($a)=>['id'=>(int)$a['id'],'name'=>(string)($a['jmeno_kod']?:$a['latinsky_nazev'])],$animalsByHabitat[$hid]??[]),'photo'=>$occ?ir_asset_photo_url((string)($occ['foto']??'')):'','temperature'=>$h['teplota_den']!==null?(float)$h['teplota_den']:null,'humidity'=>$h['vlhkost']!==null?(int)$h['vlhkost']:null,
        ];
    }
    if($blocks){$r['width_cm']=max(array_map(fn($b)=>$b['x']+$b['w'],$blocks));$r['height_cm']=max(array_map(fn($b)=>$b['z']+$b['h'],$blocks));$r['depth_cm']=max(array_column($blocks,'d'));}
    $rackPayload[$rid]=[
        'id'=>$rid,'name'=>(string)$r['nazev'],'w'=>(float)$r['width_cm'],'h'=>(float)$r['height_cm'],'d'=>(float)$r['depth_cm'],
        'style'=>hs13_visual_style((string)$r['nazev'],$blocks),'blocks'=>$blocks,
        // 'material' jen přeposílá dnešní wp_ir2_habitat_rack_meta_71.assembly_type (dnes vždy 'modular') do
        // 3D rendereru pro budoucí volbu dekoru sestavy. Zápis/validace se v tomto patchi NEMĚNÍ - žádný
        // formulář dnes nenabízí jinou hodnotu, takže je to čistě neaktivní, připravené mapování.
        'material'=>(string)($r['assembly_type']??'modular'),
    ];
}
$habitatPayload=[];
foreach($habitats as $h){
    $hid=(int)$h['id']; $occ=$animalsByHabitat[$hid][0]??null;
    $habitatPayload[]=[
        'id'=>$hid,'name'=>(string)$h['nazev'],'type'=>(string)($h['typ']??'Terárium'),'kind'=>hs13_habitat_kind((string)($h['typ']??'Terárium')),'w'=>(float)$h['_w'],'h'=>(float)$h['_h'],'d'=>(float)$h['_d'],
        'assigned'=>isset($assignedHabitatIds[$hid]),'rackId'=>(int)($h['rack_id']??0),'occupied'=>(bool)$occ,
        'animal'=>implode(' · ',array_map(static fn($a)=>(string)($a['jmeno_kod']?:$a['latinsky_nazev']?:$a['druh']),$animalsByHabitat[$hid]??[])),'animals'=>array_map(static fn($a)=>['id'=>(int)$a['id'],'name'=>(string)($a['jmeno_kod']?:$a['latinsky_nazev'])],$animalsByHabitat[$hid]??[]),'photo'=>$occ?ir_asset_photo_url((string)($occ['foto']??'')):'',
        'temperature'=>$h['teplota_den']!==null?(float)$h['teplota_den']:null,'humidity'=>$h['vlhkost']!==null?(int)$h['vlhkost']:null,
    ];
}
$itemPayload=[];
foreach($roomItems as $it){
    $type=(string)$it['item_type']; $rid=(int)($it['rack_id']??0);
    if($rid){
        // Editor sestavy je jediný zdroj pravdy pro geometrii v místnosti.
        // Starší room_items/rack_meta mohou obsahovat rozměry z doby vložení a nesmí přepisovat aktuální sestavu.
        $rp=$rackPayload[$rid]??null;
        $w=$rp?hs13_num($rp['w'],40):hs13_num($it['rack_w'],40);
        $d=$rp?hs13_num($rp['d'],40):hs13_num($it['rack_d'],40);
        $h=$rp?hs13_num($rp['h'],40):hs13_num($it['rack_h'],40);
    }else{[$dw,$dd,$dh]=hs13_prop_dims($type);$w=hs13_num($it['width_cm'],$dw);$d=hs13_num($it['depth_cm'],$dd);$h=hs13_num($it['height_cm']??null,$dh);}
    $itemPayload[]=[
        'id'=>(int)$it['id'],'type'=>$type,'rackId'=>$rid?:null,'label'=>(string)($it['label']?:$it['rack_name']?:ucfirst($type)),
        'style'=>$rid ? (string)($rackPayload[$rid]['style']??'glass') : $type,
        'appearance'=>(string)($it['appearance']??'graphite'),'elevation'=>(float)($it['elevation_cm']??0),'wall'=>(string)($it['wall_side']??''),
        'x'=>hs13_num($it['x_cm']),'y'=>hs13_num($it['y_cm']),'w'=>$w,'d'=>$d,'h'=>$h,'rotation'=>((int)$it['rotation']%360+360)%360,'zIndex'=>(int)$it['z_index']
    ];
}
$roomPayload=[
    'id'=>$roomId,'name'=>(string)($room['nazev']??'Místnost'),'w'=>(float)($room['width_cm']??500),'d'=>(float)($room['depth_cm']??400),'h'=>(float)($room['room_height_cm']??260),'grid'=>(float)($room['grid_cm']??10),
    'floor'=>(string)($room['floor_style']??'wood'),'wall'=>(string)($room['wall_style']??'light')
];
$payload=['mode'=>$mode,'room'=>$roomPayload,'items'=>$itemPayload,'assemblies'=>$rackPayload,'habitats'=>$habitatPayload,'selectedRackId'=>$rackId,'assetBase'=>'assets/img/habitat/'];

$selectedBlocks=$rackPayload[$rackId]['blocks']??[];
$unassigned=array_values(array_filter($habitatPayload,static fn($h)=>!$h['assigned'] || (int)$h['rackId']===$rackId));
$editHabitatId=(int)($_GET['edit']??0);
$editHabitat=$editHabitatId>0 && isset($habitatById[$editHabitatId]) ? $habitatById[$editHabitatId] : null;

ir_page_start('Habitat Studio','habitat');
?>
<link rel="stylesheet" href="assets/css/habitat-studio.css?v=62.0">
<div class="hs13" data-hs13-root data-mode="<?= ir_e($mode) ?>">
<nav class="hs15-module-tabs" aria-label="Habitat Studio"><a class="<?= $mode==='room'?'is-active':'' ?>" href="habitat-studio.php?mode=room"><?= ir_visual_icon('habitat') ?><span>Místnosti</span></a><a class="<?= $mode==='assembly'?'is-active':'' ?>" href="habitat-studio.php?mode=assembly"><?= ir_visual_icon('inventory') ?><span>Sestavy</span></a><a class="<?= $mode==='habitat'?'is-active':'' ?>" href="habitat-studio.php?mode=habitat"><?= ir_visual_icon('animals') ?><span>Ubikace</span></a><a class="<?= $mode==='maintenance'?'is-active':'' ?>" href="habitat-studio.php?mode=maintenance"><?= ir_visual_icon('care') ?><span>Údržba</span></a><a href="habitat-home-assistant.php"><?= ir_visual_icon('automation') ?><span>Home Assistant</span></a></nav>
    <?php if($notice): ?><div class="hs13-toast is-ok"><?= ir_icon('check') ?><span><?= ir_e($notice) ?></span></div><?php endif; ?>
    <?php if($error): ?><div class="hs13-toast is-bad"><?= ir_icon('warning') ?><span><?= ir_e($error) ?></span></div><?php endif; ?>

    <header class="hs13-topbar hs13-topbar-compact">
        <div class="hs13-title"><strong>Pracovní plocha</strong><span>UBIKACE → SESTAVY → MÍSTNOSTI</span></div>
        <div class="hs13-top-actions">
            <button type="button" data-hs13-dialog="habitat-new"><?= ir_icon('plus') ?><span>Ubikace</span></button>
            <button type="button" data-hs13-dialog="assembly-new"><?= ir_icon('plus') ?><span>Sestava</span></button>
            <button type="button" data-hs13-dialog="room-new"><?= ir_icon('plus') ?><span>Místnost</span></button>
        </div>
    </header>

    <?php if($mode==='room'): ?>
    <section class="hs13-workspace hs13-room-workspace">
        <aside class="hs13-sidebar hs13-library-panel">
            <div class="hs13-panel-head"><div><small>MÍSTNOST</small><h2><?= ir_e($room['nazev']??'Bez místnosti') ?></h2></div><button type="button" data-hs13-dialog="room-edit" title="Upravit"><?= ir_icon('settings') ?></button></div>
            <label class="hs13-select-label">Aktivní místnost
                <select data-hs13-room-select><?php foreach($rooms as $r): ?><option value="<?= (int)$r['id'] ?>" <?= (int)$r['id']===$roomId?'selected':'' ?>><?= ir_e($r['nazev']) ?></option><?php endforeach; ?></select>
            </label>
            <div class="hs13-room-metrics"><span><small>Šířka</small><b><?= hs13_fmt((float)$roomPayload['w']) ?> cm</b></span><span><small>Hloubka</small><b><?= hs13_fmt((float)$roomPayload['d']) ?> cm</b></span><span><small>Výška</small><b><?= hs13_fmt((float)$roomPayload['h']) ?> cm</b></span><span><small>Mřížka</small><b><?= hs13_fmt((float)$roomPayload['grid']) ?> cm</b></span></div>
            <?php if($room): ?><form method="post" class="hs13-danger-form" onsubmit="return confirm('Trvale smazat místnost a její rozmístění? Sestavy a ubikace zůstanou zachované.');"><?= ir_csrf_field() ?><input type="hidden" name="action" value="delete_room"><input type="hidden" name="room_id" value="<?= $roomId ?>"><input type="hidden" name="confirm" value="DELETE"><button type="submit"><?= ir_icon('delete') ?>Smazat místnost</button></form><?php endif; ?>

            <div class="hs13-section-title"><span>Sestavy</span><small>přetáhni nebo klikni</small></div>
            <div class="hs13-assembly-library">
                <?php foreach($racks as $r): $rp=$rackPayload[(int)$r['id']]??null; if(!$rp)continue; ?>
                <button type="button" draggable="true" class="hs13-library-card" data-hs13-place-rack="<?= (int)$r['id'] ?>">
                    <span class="hs13-mini-cabinet"><?php foreach(array_slice($rp['blocks'],0,6) as $b): ?><i class="<?= $b['occupied']?'on':'' ?>"></i><?php endforeach; ?></span>
                    <span><b><?= ir_e($r['nazev']) ?></b><small><?= hs13_fmt((float)$rp['w']) ?> × <?= hs13_fmt((float)$rp['h']) ?> × <?= hs13_fmt((float)$rp['d']) ?> cm</small><em><?= count($rp['blocks']) ?> ubikací</em></span>
                </button>
                <?php endforeach; ?>
                <?php if(!$racks): ?><div class="hs13-empty-mini">Nejdřív vytvoř sestavu.</div><?php endif; ?>
            </div>

            <script>window.IR_HABITAT_CATALOG=<?=json_encode(hs13_extra_catalog(),JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT)?>;</script>
            <div class="hs13-section-title"><span>Knihovna variant</span></div>
            <?php $extraGroups=[];foreach(hs13_extra_catalog() as $type=>$definition)$extraGroups[$definition['category']][$type]=$definition;foreach($extraGroups as $categoryName=>$definitions):?><details class="hs13-catalog-group"><summary><?=ir_e($categoryName)?></summary><div class="hs13-prop-grid"><?php foreach($definitions as $type=>$definition):?><button type="button" draggable="true" data-hs13-place-prop="<?=ir_e($type)?>"><span class="hs13-prop-icon" style="--hs-prop-image:url('assets/img/habitat/<?=in_array($definition['base'],['door','window','sink'],true)?$definition['base']:($definition['base']==='desk'?'worktable':'storage-rack')?>.webp')"></span><strong><?=ir_e($definition['name'])?></strong><small><?=$definition['w']?> × <?=$definition['h']?> × <?=$definition['d']?> cm</small></button><?php endforeach?></div></details><?php endforeach?>
            <div class="hs13-section-title"><span>Vybavení místnosti</span><small>přetáhni nebo klikni</small></div>
            <label class="hs13-section-title">Kategorie<select data-prop-category><option value="all">Vše</option><option value="openings">Dveře a okna</option><option value="furniture">Nábytek a úložiště</option><option value="water">Voda</option><option value="technical">Technika</option><option value="decor">Dekor</option></select></label><div class="hs13-prop-grid">
                <?php foreach(['desk'=>'Pracovní stůl','sink'=>'Dřez','ro'=>'RO systém','tank'=>'Nádrž','misting'=>'Mlžení','cabinet'=>'Skříň','shelf'=>'Regál','cart'=>'Vozík','plant'=>'Rostlina','fan'=>'Ventilace','light'=>'LED světlo','heater'=>'Topení','sensor'=>'Senzor','thermostat'=>'Termostat','pipe-water'=>'Rozvod vody','pipe-drain'=>'Odpad','pipe-cable'=>'Kabelový rozvod','door'=>'Dveře','window'=>'Okno'] as $type=>$label): ?>
                <button type="button" draggable="true" data-category="<?=in_array(explode('-',$type)[0],['door','window'],true)?'openings':(in_array($type,['desk','cabinet','shelf','cart'],true)?'furniture':(in_array($type,['sink','ro','tank','misting','pipe-water','pipe-drain'],true)?'water':($type==='plant'?'decor':'technical')))?>" data-hs13-place-prop="<?= ir_e($type) ?>"><span class="hs13-prop-icon" data-type="<?= ir_e($type) ?>" style="--hs-prop-image:url('assets/img/habitat/<?= ir_e(match($type){'desk'=>'worktable','ro'=>'ro-system','tank'=>'water-tank','fan'=>'ventilation','light'=>'led','cabinet'=>'storage-rack','pipe-water','pipe-drain','pipe-cable','thermostat'=>'sensor',default=>$type}) ?>.webp')"></span><small><?= ir_e($label) ?></small></button>
                <?php endforeach; ?>
            </div>
        </aside>

        <main class="hs13-stage-panel" data-hs13-fullscreen-target>
            <div class="hs13-stage-toolbar hs15-room-toolbar">
                <div class="hs15-room-title"><strong data-hs15-view-title>Provozní 3D</strong><span><?= ir_e($roomPayload['name']) ?></span></div>
                <div class="hs15-view-switch" role="group" aria-label="Pohled místnosti">
                    <button type="button" class="is-active" data-hs15-view="illustration">Provozní 3D</button><button type="button" data-hs15-view="iso">Perspektiva</button>
                    <button type="button" data-hs15-view="top">2D půdorys</button>
                </div>
                <div class="hs15-material-tools">
                    <label>Podlaha<select data-hs13-floor><option value="wood" <?= $roomPayload['floor']==='wood'?'selected':'' ?>>Dřevo</option><option value="graphite" <?= $roomPayload['floor']==='graphite'?'selected':'' ?>>Grafit</option><option value="tile" <?= $roomPayload['floor']==='tile'?'selected':'' ?>>Dlažba</option><option value="industrial" <?= $roomPayload['floor']==='industrial'?'selected':'' ?>>Industrial</option></select></label>
                    <label>Stěny<select data-hs13-wall><option value="light" <?= $roomPayload['wall']==='light'?'selected':'' ?>>Světlé</option><option value="warm" <?= $roomPayload['wall']==='warm'?'selected':'' ?>>Teplá béžová</option><option value="sage" <?= $roomPayload['wall']==='sage'?'selected':'' ?>>Šalvějová</option><option value="bluegray" <?= $roomPayload['wall']==='bluegray'?'selected':'' ?>>Modrošedá</option><option value="charcoal" <?= $roomPayload['wall']==='charcoal'?'selected':'' ?>>Antracit</option><option value="brick" <?= $roomPayload['wall']==='brick'?'selected':'' ?>>Cihla</option></select></label>
                </div>
                <div class="hs13-camera-tools">
                    <span class="hs-v2-proof-badge <?= $rendererV2?'is-v2':'' ?>"><?= $rendererV2?'RENDERER V2 · PROOF':'RENDERER V1' ?></span><a class="hs-v2-switch <?= $rendererV2?'is-active':'' ?>" href="habitat-studio.php?mode=room<?= $rendererV2?'':'&renderer=v2' ?>"><?= $rendererV2?'Vrátit V1':'Spustit V2 PROOF' ?></a>
                    <label><input type="checkbox" data-hs13-grid> Mřížka</label>
                    <label><input type="checkbox" data-hs13-snap checked> Přichytávání</label>
                    <span class="hs-premium-save-state" data-hs-premium-save-state>Připraveno</span><label class="hs-premium-quality">Kvalita <select data-hs-premium-quality><option value="hq" selected>HQ</option><option value="balanced">Vyvážená</option></select></label><button type="button" data-hs-premium-fit title="Zobrazit celou místnost">Fit</button><button type="button" data-hs-premium-focus title="Přiblížit vybraný objekt">Focus</button><button type="button" data-hs13-camera-left title="Otočit místnost doleva">↶</button>
                    <button type="button" data-hs13-camera-right title="Otočit místnost doprava">↷</button>
                    <button type="button" data-hs13-zoom-out title="Oddálit">−</button><button type="button" data-hs13-zoom-in title="Přiblížit">+</button>
                    <span class="hs13-camera-presets" role="group" aria-label="Přednastavené pohledy">
                        <button type="button" data-hs13-view-iso title="Izometrie">Izo</button>
                        <button type="button" data-hs13-view-front title="Zepředu">Zepředu</button>
                        <button type="button" data-hs13-view-left title="Zleva">Zleva</button>
                        <button type="button" data-hs13-view-right title="Zprava">Zprava</button>
                        <button type="button" data-hs13-view-reset title="Výchozí pohled">Reset</button>
                    </span>
                    <button type="button" data-hs13-help-toggle title="Nápověda ovládání" aria-expanded="false">?</button>
                    <button type="button" class="hs13-fullscreen-btn" data-hs13-fullscreen-toggle title="Celá obrazovka"><span aria-hidden="true">⛶</span>Celá obrazovka</button>
                    <button class="primary" type="button" data-hs13-save-room><?= ir_icon('save') ?>Uložit</button>
                </div>
            </div>
            <div class="hs13-room-canvas-wrap hs15-game-room">
                <canvas data-hs13-room-canvas></canvas>
                <button type="button" class="hs13-drawer-toggle hs13-drawer-toggle-left" data-hs13-drawer-toggle="library" aria-label="Knihovna sestav a vybavení" hidden>☰</button>
                <button type="button" class="hs13-drawer-toggle hs13-drawer-toggle-right" data-hs13-drawer-toggle="inspector" aria-label="Inspektor" hidden>▤</button>
                <div class="hs15-room-hud"><span><b><?= count($roomItems) ?></b> objektů</span><span><b><?= count(array_filter($roomItems,static fn($i)=>(int)($i['rack_id']??0)>0)) ?></b> sestav</span><span><i></i> 3D místnost</span></div>
                <div class="hs15-placement-message" data-hs13-placement-message hidden>Pusť objekt na volné místo · <b>R</b> otočit · <b>Esc</b> zrušit</div>
                <div class="hs13-game-hint"><span>●</span> Přetáhni sestavu zleva přímo do místnosti · levé tlačítko/prst = orbit · Shift+táhnutí = posun · dvojklik = nový cíl kamery · kolečko = zoom (v celé obrazovce)</div>
                <div class="hs13-help-overlay" data-hs13-help-overlay hidden>
                    <header><strong>Ovládání kamery a editoru</strong><button type="button" data-hs13-help-close aria-label="Zavřít nápovědu">×</button></header>
                    <ul>
                        <li><b>Levé tlačítko / jeden prst</b> orbit kolem cíle</li>
                        <li><b>Shift + levé tlačítko</b> nebo <b>prostřední tlačítko</b> posun (pan)</li>
                        <li><b>Kolečko myši</b> zoom · aktivní jen v celé obrazovce</li>
                        <li><b>Dvojklik</b> nastaví nový cíl kamery na objekt / podlahu</li>
                        <li><b>Q / E</b> otočení kamery, <b>R</b> otočení vybraného objektu</li>
                        <li><b>G</b> mřížka, <b>Ctrl + S</b> uložení</li>
                        <li><b>Esc</b> zrušit umísťování / ukončit celou obrazovku</li>
                    </ul>
                </div>
            </div>
        </main>


        <aside class="hs13-sidebar hs13-inspector">
            <div class="hs13-panel-head"><div><small>INSPEKTOR</small><h2 data-hs13-inspector-title>Vyber objekt</h2></div></div>
            <label>Objekt místnosti<select data-room-object><option value="">Vyber objekt</option><?php foreach($itemPayload as $object):?><option value="<?=$object['id']?>"><?=ir_e($object['label'])?></option><?php endforeach?></select></label><div class="hs13-selected-preview" data-hs13-selected-preview><span></span><div><b>Nic není vybráno</b><small>Klikni na sestavu nebo vybavení.</small></div></div>
            <div data-room-habitats class="hs-room-habitats"></div><div class="hs13-property-grid" data-hs13-item-properties>
                <span><small>X</small><b data-prop="x">—</b></span><span><small>Y</small><b data-prop="y">—</b></span><span><small>Šířka</small><b data-prop="w">—</b></span><span><small>Hloubka</small><b data-prop="d">—</b></span><span><small>Výška</small><b data-prop="h">—</b></span><span><small>Rotace</small><b data-prop="rotation">—</b></span>
            </div>
            <div class="hs13-inspector-actions"><button type="button" data-hs13-rotate><?= ir_icon('sync') ?>Otočit 90°</button><button type="button" class="danger" data-hs13-delete><?= ir_icon('delete') ?>Odstranit</button></div>
            <?php if($hasItemDetails): ?>
            <form data-room-editor hidden class="hs13-room-editor">
                <div class="hs13-section-title"><span>Rozměry a umístění · cm</span></div><p class="hs19-editor-hint">Pozice X/Y jsou vždy celé centimetry. U sestavy můžeš zvolit volné umístění nebo konkrétní stěnu; zvolená stěna má přednost před automatickým přichycením.</p>
                <div class="hs13-property-grid">
                    <?php foreach(['x'=>'X','y'=>'Y','w'=>'Šířka','d'=>'Hloubka','h'=>'Výška','elevation'=>'Nad podlahou'] as $key=>$label): ?><label><?= ir_e($label) ?><input type="number" name="<?= $key ?>" min="<?= in_array($key,['w','d','h'],true)?1:0 ?>" max="2000" step="<?= in_array($key,['x','y','elevation'],true)?1:0.5 ?>" required></label><?php endforeach; ?>
                </div>
                <label>Název objektu<input name="label" maxlength="190" required></label><label>Vzhled vlastního objektu<select name="appearance"><option value="graphite">Grafit</option><option value="steel">Ocel</option><option value="wood">Dřevo</option><option value="white">Bílá</option></select></label><label>Umístění<select name="wall"><option value="">Volně v místnosti</option><option value="north">Severní stěna</option><option value="east">Východní stěna</option><option value="south">Jižní stěna</option><option value="west">Západní stěna</option></select></label>
                <button type="submit">Použít v náhledu</button><p role="status" aria-live="polite"></p>
            </form>
            <?php else: ?><p>Úpravy rozměrů vyžadují databázovou migraci 17.0 beta 1.</p><?php endif; ?>
            <div class="hs13-section-title"><span>Ovládání</span></div>
            <ul class="hs13-help"><li><b>Shift + drag / prostřední tlačítko</b> posun kamery</li><li><b>Tažení od stěny</b> odpojí objekt</li><li><b>Drag pozadí</b> 360° kamera</li><li><b>Drag objektu</b> přesun po podlaze</li><li><b>R</b> otočení objektu</li><li><b>Q / E</b> otočení kamery</li><li><b>G</b> mřížka</li><li><b>Ctrl + S</b> uložení</li></ul>
        </aside>
    </section>

    <?php elseif($mode==='assembly'): ?>
    <section class="hs13-workspace hs13-assembly-workspace">
        <aside class="hs13-sidebar hs13-builder-library">
            <div class="hs13-panel-head"><div><small>SESTAVA</small><h2><?= ir_e($selectedRack['nazev']??'Bez sestavy') ?></h2></div><button type="button" data-hs13-dialog="assembly-new"><?= ir_icon('plus') ?></button></div>
            <label class="hs13-select-label">Aktivní sestava
                <select data-hs13-rack-select><?php foreach($racks as $r): ?><option value="<?= (int)$r['id'] ?>" <?= (int)$r['id']===$rackId?'selected':'' ?>><?= ir_e($r['nazev']) ?></option><?php endforeach; ?></select>
            </label>
            <div class="hs13-builder-metrics"><span><small>Šířka</small><b data-hs13-assembly-w><?= hs13_fmt((float)($rackPayload[$rackId]['w']??0)) ?> cm</b></span><span><small>Výška</small><b data-hs13-assembly-h><?= hs13_fmt((float)($rackPayload[$rackId]['h']??0)) ?> cm</b></span><span><small>Hloubka</small><b data-hs13-assembly-d><?= hs13_fmt((float)($rackPayload[$rackId]['d']??0)) ?> cm</b></span></div>
            <form data-hs13-reserve-form class="hs13-room-editor"><b>Prázdná rezervovaná pozice</b><div class="hs13-property-grid"><label>Šířka<input name="w" type="number" min="1" max="2000" step="0.5" value="60" required></label><label>Výška<input name="h" type="number" min="1" max="2000" step="0.5" value="40" required></label><label>Hloubka<input name="d" type="number" min="1" max="2000" step="0.5" value="40" required></label></div><button type="submit">+ Rezervovat prostor</button></form>
            <div class="hs13-section-title"><span>Knihovna ubikací</span><small>kliknutím přidat</small></div>
            <div class="hs13-habitat-library">
                <?php foreach($habitatPayload as $h): ?>
                <button type="button" class="hs13-habitat-card <?= $h['assigned'] && (int)$h['rackId']!==$rackId?'is-assigned':'' ?>" data-hs13-add-habitat="<?= (int)$h['id'] ?>">
                    <span class="hs13-habitat-thumb <?= $h['occupied']?'is-lit':'' ?>"><i></i><i></i><i></i></span>
                    <span><b><?= ir_e($h['name']) ?></b><small><?= hs13_fmt((float)$h['w']) ?> × <?= hs13_fmt((float)$h['h']) ?> × <?= hs13_fmt((float)$h['d']) ?> cm</small><em><?= $h['occupied']?ir_e($h['animal']):'Volná' ?></em></span>
                    <?php if($h['assigned'] && (int)$h['rackId']!==$rackId): ?><mark>jiná sestava</mark><?php else: ?><i class="add">+</i><?php endif; ?>
                </button>
                <?php endforeach; ?>
            </div>
        </aside>

        <main class="hs13-stage-panel">
            <div class="hs13-stage-toolbar"><div><strong>Editor sestavy</strong><span>Rozměry · pozice · rezervovaný prostor</span></div><div class="hs13-camera-tools"><label><input type="checkbox" data-hs13-builder-snap checked> Přichytávání</label><button type="button" data-hs13-builder-auto>Auto sestavit</button><button class="primary" type="button" data-hs13-save-assembly><?= ir_icon('save') ?>Uložit sestavu</button></div></div>
            <div class="hs13-assembly-canvas-wrap"><canvas data-hs13-assembly-canvas></canvas><div class="hs13-game-hint"><span>●</span> Ubikace jsou skutečné 3D bloky · táhni je k hranám ostatních · rozměr sestavy se počítá automaticky</div></div>
        </main>

        <aside class="hs13-sidebar hs13-assembly-inspector">
            <div class="hs13-panel-head"><div><small>VÝSLEDNÁ SESTAVA</small><h2><?= ir_e($selectedRack['nazev']??'Sestava') ?></h2></div><button type="button" data-hs13-dialog="assembly-rename"><?= ir_icon('edit') ?></button></div>
            <div class="hs13-assembly-visual"><span class="hs13-cabinet-shadow"></span><div class="hs13-cabinet-mini" data-hs13-cabinet-mini></div></div>
            <div class="hs13-property-grid"><span><small>Šířka</small><b data-hs13-assembly-w><?= hs13_fmt((float)($rackPayload[$rackId]['w']??0)) ?> cm</b></span><span><small>Výška</small><b data-hs13-assembly-h><?= hs13_fmt((float)($rackPayload[$rackId]['h']??0)) ?> cm</b></span><span><small>Hloubka</small><b data-hs13-assembly-d><?= hs13_fmt((float)($rackPayload[$rackId]['d']??0)) ?> cm</b></span><span><small>Ubikace</small><b data-hs13-assembly-count><?= count($selectedBlocks) ?></b></span></div>
            <div class="hs13-depth-warning" data-hs13-depth-warning hidden><?= ir_icon('warning') ?><span>Ubikace mají rozdílnou hloubku. Sestava použije největší hloubku.</span></div>
            <div data-hs13-block-list class="hs13-help"></div><div class="hs13-section-title"><span>Vybraná ubikace</span></div>
            <div class="hs13-selected-preview" data-hs13-builder-selected><span></span><div><b>Vyber blok</b><small>Pak ho můžeš přesunout nebo odebrat.</small></div></div>
            <div class="hs13-nudge-grid"><button data-hs13-nudge="left">←</button><button data-hs13-nudge="up">↑</button><button data-hs13-nudge="down">↓</button><button data-hs13-nudge="right">→</button></div>
            <button type="button" class="danger hs13-full" data-hs13-remove-habitat>Odebrat ze sestavy</button>
            <?php if($selectedRack): ?><form method="post" class="hs13-danger-form" onsubmit="return confirm('Trvale smazat sestavu? Ubikace zůstanou zachované jako samostatné.');"><?= ir_csrf_field() ?><input type="hidden" name="action" value="delete_assembly"><input type="hidden" name="rack_id" value="<?= $rackId ?>"><input type="hidden" name="confirm" value="DELETE"><button type="submit"><?= ir_icon('delete') ?>Smazat sestavu</button></form><?php endif; ?>
        </aside>
    </section>

    <?php elseif($mode==='habitat'): ?>
    <section class="hs13-catalog-page">
        <header><div><small>ZÁKLADNÍ STAVEBNÍ JEDNOTKA</small><h1>Ubikace</h1><p>Každá ubikace má vlastní šířku, výšku a hloubku. Z těchto objektů se následně skládají sestavy.</p></div><button class="primary" type="button" data-hs13-dialog="habitat-new"><?= ir_icon('plus') ?>Nová ubikace</button></header>
        <?php if($editHabitat): ?><form method="post" class="hs13-habitat-editor"><?= ir_csrf_field() ?><input type="hidden" name="action" value="save_habitat"><input type="hidden" name="habitat_id" value="<?= (int)$editHabitat['id'] ?>"><header><div><small>EDITACE UBIKACE #<?= (int)$editHabitat['id'] ?></small><h2><?= ir_e((string)$editHabitat['nazev']) ?></h2></div><a href="habitat-studio.php?mode=habitat">Zavřít</a></header><div class="hs13-form"><label>Název<input name="nazev" value="<?= ir_e((string)$editHabitat['nazev']) ?>" required></label><label>Typ<select name="typ"><?php foreach(ir_habitat_types() as $type): ?><option <?= (string)$editHabitat['typ']===$type?'selected':'' ?>><?= ir_e($type) ?></option><?php endforeach; ?></select></label><div><label>Šířka cm<input name="width_cm" type="number" step="0.1" min="10" value="<?= hs13_fmt((float)$editHabitat['_w']) ?>"></label><label>Výška cm<input name="height_cm" type="number" step="0.1" min="10" value="<?= hs13_fmt((float)$editHabitat['_h']) ?>"></label><label>Hloubka cm<input name="depth_cm" type="number" step="0.1" min="10" value="<?= hs13_fmt((float)$editHabitat['_d']) ?>"></label><label>Teplota °C<input name="teplota_den" type="number" step="0.1" value="<?= ir_e((string)$editHabitat['teplota_den']) ?>"></label><label>Vlhkost %<input name="vlhkost" type="number" min="0" max="100" value="<?= ir_e((string)$editHabitat['vlhkost']) ?>"></label></div></div><footer><a href="habitat-studio.php?mode=habitat">Zrušit</a><button class="primary" type="submit">Uložit změny</button></footer></form><?php endif; ?>
        <div class="hs13-habitat-grid">
            <?php foreach($habitatPayload as $h): ?>
            <article class="hs13-habitat-detail-card hs13-kind-<?= ir_e($h['kind']) ?>">
                <div class="hs13-habitat-illustration <?= $h['occupied']?'is-lit':'' ?> hs13-kind-<?= ir_e($h['kind']) ?>">
                    <div class="glass"></div><div class="habitat-water"></div><div class="box-face"><span></span><i></i><i></i><i></i><i></i><i></i></div><span class="branch"></span><i class="leaf l1"></i><i class="leaf l2"></i><em><?= ir_e($h['type']) ?></em>
                </div>
                <div class="body"><div><h3><?= ir_e($h['name']) ?></h3><p><?= $h['occupied']?ir_e($h['animal']):'Volná ubikace' ?></p></div><span class="status <?= $h['occupied']?'on':'' ?>"><?= $h['occupied']?'Obsazeno':'Volná' ?></span></div>
                <div class="dims"><span><small>Šířka</small><b><?= hs13_fmt((float)$h['w']) ?> cm</b></span><span><small>Výška</small><b><?= hs13_fmt((float)$h['h']) ?> cm</b></span><span><small>Hloubka</small><b><?= hs13_fmt((float)$h['d']) ?> cm</b></span></div>
                <footer><span><?= $h['temperature']!==null?ir_e((string)$h['temperature']).' °C':'— °C' ?></span><span><?= $h['humidity']!==null?ir_e((string)$h['humidity']).' %':'— %' ?></span><span><?= $h['assigned']?'V sestavě':'Samostatná' ?></span></footer><div class="hs13-card-actions"><a href="habitat-studio.php?mode=habitat&amp;edit=<?= (int)$h['id'] ?>"><?= ir_icon('edit') ?>Upravit</a><form method="post"><?= ir_csrf_field() ?><input type="hidden" name="action" value="clone_habitat"><input type="hidden" name="habitat_id" value="<?= (int)$h['id'] ?>"><button type="submit"><?= ir_icon('plus') ?>Klonovat</button></form><?php if(!$h['occupied']): ?><form method="post" onsubmit="return confirm('Trvale smazat neobsazenou ubikaci bez historie?');"><?= ir_csrf_field() ?><input type="hidden" name="action" value="delete_habitat"><input type="hidden" name="habitat_id" value="<?= (int)$h['id'] ?>"><input type="hidden" name="confirm" value="DELETE"><button class="danger" type="submit"><?= ir_icon('delete') ?>Smazat</button></form><?php endif; ?></div>
            </article>
            <?php endforeach; ?>
        </div>
    </section>

    <?php else: ?>
    <section class="hs13-maintenance-page">
        <header><small>STAV HABITATU</small><h1>Údržba</h1><p>Rychlý přehled obsazení, podmínek a prvků vyžadujících pozornost.</p></header>
        <div class="hs13-maintenance-grid">
            <article><span class="big"><?= count($habitats) ?></span><h3>Ubikací</h3><p><?= count($assignedHabitatIds) ?> vložených do sestav</p></article>
            <article><span class="big"><?= count($racks) ?></span><h3>Sestav</h3><p><?= count(array_filter($rackPayload,static fn($r)=>count($r['blocks'])>0)) ?> aktivních</p></article>
            <article><span class="big"><?= count($roomItems) ?></span><h3>Prvků v místnosti</h3><p><?= ir_e($roomPayload['name']) ?></p></article>
            <article><span class="big"><?= count($animalsByHabitat) ?></span><h3>Obsazených ubikací</h3><p>živá data z karet zvířat</p></article>
        </div>
        <div class="hs13-maintenance-list">
            <?php foreach($habitatPayload as $h): ?><div><span class="dot <?= $h['occupied']?'on':'' ?>"></span><b><?= ir_e($h['name']) ?></b><small><?= $h['temperature']!==null?ir_e((string)$h['temperature']).' °C':'bez teploty' ?> · <?= $h['humidity']!==null?ir_e((string)$h['humidity']).' %':'bez vlhkosti' ?></small><em><?= $h['assigned']?'Sestava':'Samostatně' ?></em></div><?php endforeach; ?>
        </div>
    </section>
    <?php endif; ?>
</div>

<script type="application/json" id="hs13-data"><?= json_encode($payload, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT) ?></script>
<form method="post" class="hs13-hidden" data-hs13-save-room-form><?= ir_csrf_field() ?><input type="hidden" name="action" value="save_room_layout"><input type="hidden" name="room_id" value="<?= $roomId ?>"><input type="hidden" name="layout_json" data-hs13-room-json><input type="hidden" name="floor_style" data-hs13-room-floor value="<?= ir_e($roomPayload['floor']) ?>"><input type="hidden" name="wall_style" data-hs13-room-wall value="<?= ir_e($roomPayload['wall']) ?>"></form>
<form method="post" class="hs13-hidden" data-hs13-save-assembly-form><?= ir_csrf_field() ?><input type="hidden" name="action" value="save_assembly_layout"><input type="hidden" name="rack_id" value="<?= $rackId ?>"><input type="hidden" name="layout_json" data-hs13-assembly-json></form>
<form method="post" class="hs13-hidden" data-hs13-place-rack-form><?= ir_csrf_field() ?><input type="hidden" name="action" value="add_room_rack"><input type="hidden" name="room_id" value="<?= $roomId ?>"><input type="hidden" name="rack_id" data-hs13-place-rack-id><input type="hidden" name="x_cm" data-hs13-place-rack-x><input type="hidden" name="y_cm" data-hs13-place-rack-y></form>
<form method="post" class="hs13-hidden" data-hs13-place-prop-form><?= ir_csrf_field() ?><input type="hidden" name="action" value="add_room_prop"><input type="hidden" name="room_id" value="<?= $roomId ?>"><input type="hidden" name="item_type" data-hs13-place-prop-type><input type="hidden" name="x_cm" data-hs13-place-prop-x><input type="hidden" name="y_cm" data-hs13-place-prop-y><input type="hidden" name="wall_side"><input type="hidden" name="elevation_cm" value="0"></form>
<form method="post" class="hs13-hidden" data-hs13-delete-item-form><?= ir_csrf_field() ?><input type="hidden" name="action" value="delete_room_item"><input type="hidden" name="room_id" value="<?= $roomId ?>"><input type="hidden" name="item_id" data-hs13-delete-item-id></form>

<dialog class="hs13-dialog" data-hs13-dialog-window="room-new"><form method="post"><header><h3>Nová místnost</h3><button type="button" data-hs13-dialog-close>×</button></header><?= ir_csrf_field() ?><input type="hidden" name="action" value="save_room"><input type="hidden" name="room_id" value="0"><div class="hs13-form"><label>Název<input name="nazev" value="Nová místnost" required></label><div><label>Šířka cm<input name="width_cm" type="number" value="500" min="200"></label><label>Hloubka cm<input name="depth_cm" type="number" value="400" min="200"></label><label>Výška cm<input name="height_cm" type="number" value="260" min="210"></label><label>Mřížka cm<input name="grid_cm" type="number" value="10" min="5"></label><label>Podlaha<select name="floor_style"><option value="wood">Dřevo</option><option value="graphite">Grafit</option><option value="tile">Dlažba</option><option value="industrial">Industrial</option></select></label><label>Stěny<select name="wall_style"><option value="light">Světlé</option><option value="warm">Teplá béžová</option><option value="sage">Šalvějová</option><option value="bluegray">Modrošedá</option><option value="charcoal">Antracit</option><option value="brick">Cihla</option></select></label></div></div><footer><button type="button" data-hs13-dialog-close>Zrušit</button><button class="primary">Vytvořit</button></footer></form></dialog>
<dialog class="hs13-dialog" data-hs13-dialog-window="room-edit"><form method="post"><header><h3>Upravit místnost</h3><button type="button" data-hs13-dialog-close>×</button></header><?= ir_csrf_field() ?><input type="hidden" name="action" value="save_room"><input type="hidden" name="room_id" value="<?= $roomId ?>"><div class="hs13-form"><label>Název<input name="nazev" value="<?= ir_e($roomPayload['name']) ?>" required></label><div><label>Šířka cm<input name="width_cm" type="number" value="<?= hs13_fmt((float)$roomPayload['w']) ?>"></label><label>Hloubka cm<input name="depth_cm" type="number" value="<?= hs13_fmt((float)$roomPayload['d']) ?>"></label><label>Výška cm<input name="height_cm" type="number" value="<?= hs13_fmt((float)$roomPayload['h']) ?>"></label><label>Mřížka cm<input name="grid_cm" type="number" value="<?= hs13_fmt((float)$roomPayload['grid']) ?>"></label><label>Podlaha<select name="floor_style"><option value="wood" <?= $roomPayload['floor']==='wood'?'selected':'' ?>>Dřevo</option><option value="graphite" <?= $roomPayload['floor']==='graphite'?'selected':'' ?>>Grafit</option><option value="tile" <?= $roomPayload['floor']==='tile'?'selected':'' ?>>Dlažba</option><option value="industrial" <?= $roomPayload['floor']==='industrial'?'selected':'' ?>>Industrial</option></select></label><label>Stěny<select name="wall_style"><option value="light" <?= $roomPayload['wall']==='light'?'selected':'' ?>>Světlé</option><option value="warm" <?= $roomPayload['wall']==='warm'?'selected':'' ?>>Teplá béžová</option><option value="sage" <?= $roomPayload['wall']==='sage'?'selected':'' ?>>Šalvějová</option><option value="bluegray" <?= $roomPayload['wall']==='bluegray'?'selected':'' ?>>Modrošedá</option><option value="charcoal" <?= $roomPayload['wall']==='charcoal'?'selected':'' ?>>Antracit</option><option value="brick" <?= $roomPayload['wall']==='brick'?'selected':'' ?>>Cihla</option></select></label></div></div><footer><button type="button" data-hs13-dialog-close>Zrušit</button><button class="primary">Uložit</button></footer></form></dialog>
<dialog class="hs13-dialog" data-hs13-dialog-window="assembly-new"><form method="post"><header><h3>Nová sestava</h3><button type="button" data-hs13-dialog-close>×</button></header><?= ir_csrf_field() ?><input type="hidden" name="action" value="create_assembly"><div class="hs13-form"><label>Název sestavy<input name="nazev" placeholder="Např. Lamino stěna A" required></label><p>Rozměry se nezadávají. Vypočítají se automaticky z ubikací, které do sestavy poskládáš.</p></div><footer><button type="button" data-hs13-dialog-close>Zrušit</button><button class="primary">Vytvořit builder</button></footer></form></dialog>
<dialog class="hs13-dialog" data-hs13-dialog-window="assembly-rename"><form method="post"><header><h3>Přejmenovat sestavu</h3><button type="button" data-hs13-dialog-close>×</button></header><?= ir_csrf_field() ?><input type="hidden" name="action" value="rename_assembly"><input type="hidden" name="rack_id" value="<?= $rackId ?>"><div class="hs13-form"><label>Název<input name="nazev" value="<?= ir_e($selectedRack['nazev']??'Sestava') ?>" required></label></div><footer><button type="button" data-hs13-dialog-close>Zrušit</button><button class="primary">Uložit</button></footer></form></dialog>
<dialog class="hs13-dialog" data-hs13-dialog-window="habitat-new"><form method="post"><header><h3>Nová ubikace</h3><button type="button" data-hs13-dialog-close>×</button></header><?= ir_csrf_field() ?><input type="hidden" name="action" value="create_habitat"><div class="hs13-form"><label>Název<input name="nazev" placeholder="Např. Terárium Morelia 01" required></label><label>Typ<select name="typ"><option>Terárium</option><option>Paludárium</option><option>Akvaterárium</option><option>Plastový box</option><option>Rack box</option></select></label><div><label>Šířka cm<input name="width_cm" type="number" value="60" min="10"></label><label>Výška cm<input name="height_cm" type="number" value="60" min="10"></label><label>Hloubka cm<input name="depth_cm" type="number" value="50" min="10"></label><label>Teplota °C<input name="teplota_den" type="number" step="0.1" value="26"></label><label>Vlhkost %<input name="vlhkost" type="number" value="70"></label></div><p>Ubikace vznikne jako samostatný 3D objekt. Do sestavy ji vložíš až v Builderu sestav.</p></div><footer><button type="button" data-hs13-dialog-close>Zrušit</button><button class="primary">Vytvořit ubikaci</button></footer></form></dialog>

<?php if($rendererV2): ?><script type="module" src="assets/js/habitat-room-3d-v2.js?v=62.0"></script><?php else: ?><script type="module" src="assets/js/habitat-room-3d.js?v=61.0"></script><?php endif; ?>
<script src="assets/js/habitat-studio.js?v=45.1"></script>
<script>document.querySelector('[data-prop-category]')?.addEventListener('change',e=>document.querySelectorAll('[data-category]').forEach(b=>b.hidden=e.target.value!=='all'&&b.dataset.category!==e.target.value));</script><?php ir_page_end(); ?>

