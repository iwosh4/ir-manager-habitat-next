<?php
declare(strict_types=1);
function ir_assembly_dimensions(PDO $pdo,int $uid,int $rackId): array {
    $q=$pdo->prepare('SELECT b.x_cm,b.z_cm,u.rozmery,COALESCE(b.reserve_width_cm,g.width_cm) w,COALESCE(b.reserve_height_cm,g.height_cm) h,COALESCE(b.reserve_depth_cm,g.depth_cm) d FROM wp_ir2_habitat_assembly_blocks_130 b LEFT JOIN wp_ir2_ubikace u ON u.id=b.habitat_id AND u.user_id=b.user_id LEFT JOIN wp_ir2_habitat_geometry_74 g ON g.habitat_id=u.id AND g.user_id=u.user_id WHERE b.user_id=? AND b.rack_id=?');
    $q->execute([$uid,$rackId]);$w=$h=$d=0.0;
    foreach($q as $b){preg_match_all('/\d+(?:[.,]\d+)?/',(string)($b['rozmery']??''),$match);$fallback=array_map(fn($v)=>(float)str_replace(',','.',$v),$match[0]);
        $bw=max(1,(float)($b['w']??$fallback[0]??40));$bd=max(1,(float)($b['d']??$fallback[1]??40));$bh=max(1,(float)($b['h']??$fallback[2]??40));
        $w=max($w,(float)$b['x_cm']+$bw);$h=max($h,(float)$b['z_cm']+$bh);$d=max($d,$bd);
    }return [$w,$h,$d];
}
