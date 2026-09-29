<?php
declare(strict_types=1);

function ir_room_items_overlap(array $a,array $b): bool {
    if(($a['id']??null)!==null&&($a['id']??null)===($b['id']??null))return false;
    $az=(float)($a['elevation']??0);$bz=(float)($b['elevation']??0);
    if($az>=$bz+$b['h']||$bz>=$az+$a['h'])return false;
    $aw=$a['rotation']%180===0?$a['w']:$a['d'];$ad=$a['rotation']%180===0?$a['d']:$a['w'];
    $bw=$b['rotation']%180===0?$b['w']:$b['d'];$bd=$b['rotation']%180===0?$b['d']:$b['w'];
    return $a['x']+1<$b['x']+$bw&&$a['x']+$aw-1>$b['x']&&$a['y']+1<$b['y']+$bd&&$a['y']+$ad-1>$b['y'];
}

/** Coordinates are centimetres: x/y on the floor, elevation above it. */
function ir_room_item_geometry(array $input, array $stored, array $room): array
{
    $number = static function ($v, float $min, float $max): float {
        if (!is_scalar($v) || !is_numeric($v) || !is_finite((float)$v) || (float)$v < $min || (float)$v > $max) {
            throw new RuntimeException('Rozměr nebo souřadnice objektu je mimo povolený rozsah.');
        }
        return round((float)$v, 1);
    };
    $rack = !empty($stored['rack_id']);
    $w = $number($rack ? $stored['rack_w'] : ($input['w'] ?? $stored['width_cm']), 1, 2000);
    $d = $number($rack ? $stored['rack_d'] : ($input['d'] ?? $stored['depth_cm']), 1, 2000);
    $h = $number($rack ? $stored['rack_h'] : ($input['h'] ?? $stored['height_cm']), 1, 2000);
    $elevation = round($number($input['elevation'] ?? 0, 0, 2000));
    $rotation = (int)($input['rotation'] ?? 0);
    if (!in_array($rotation, [0,90,180,270], true)) throw new RuntimeException('Rotace musí být násobkem 90°.');
    $wall = (string)($input['wall'] ?? '');
    if (!in_array($wall, ['', 'north','east','south','west'], true)) throw new RuntimeException('Neplatná stěna.');
    if (str_starts_with((string)($stored['item_type'] ?? ''),'door')) $elevation = 0;
    if ($wall !== '') $rotation = ['north'=>0,'east'=>90,'south'=>180,'west'=>270][$wall];
    $bw = $rotation % 180 === 0 ? $w : $d;
    $bd = $rotation % 180 === 0 ? $d : $w;
    if ($bw > $room['w'] || $bd > $room['d'] || $h + $elevation > $room['h']) throw new RuntimeException('Objekt se s těmito rozměry a výškou nevejde do místnosti.');
    $x = round($number($input['x'] ?? 0, 0, 2000));
    $y = round($number($input['y'] ?? 0, 0, 2000));
    if ($wall === 'north') $y = 0;
    if ($wall === 'south') $y = $room['d'] - $bd;
    if ($wall === 'west') $x = 0;
    if ($wall === 'east') $x = $room['w'] - $bw;
    if ($x + $bw > $room['w'] + .1 || $y + $bd > $room['d'] + .1) throw new RuntimeException('Objekt přesahuje půdorys místnosti.');
    return ['x'=>$x,'y'=>$y,'w'=>$w,'d'=>$d,'h'=>$h,'elevation'=>$elevation,'rotation'=>$rotation,'wall'=>$wall];
}
