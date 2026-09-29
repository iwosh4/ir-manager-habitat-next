<?php
declare(strict_types=1);
function ir_pedigree_person(PDO $pdo,int $uid,int $animalId): ?array {
 $q=$pdo->prepare('SELECT * FROM wp_ir2_rodokmen_osoby WHERE user_id=? AND internal_zvire_id=? ORDER BY id LIMIT 1');$q->execute([$uid,$animalId]);return $q->fetch()?:null;
}
function ir_pedigree_parents(PDO $pdo,int $uid,array $animal): array {
 $parents=['otec'=>null,'matka'=>null];$person=ir_pedigree_person($pdo,$uid,(int)$animal['id']);
 if($person){$q=$pdo->prepare('SELECT p.*,v.role FROM wp_ir2_rodokmen_vazby v JOIN wp_ir2_rodokmen_osoby p ON p.id=v.rodic_osoba_id AND p.user_id=v.user_id WHERE v.user_id=? AND v.dite_osoba_id=? ORDER BY v.id');$q->execute([$uid,$person['id']]);foreach($q as $p)$parents[$p['role']]=$p;}
 foreach(['otec','matka'] as $role)if(!empty($animal[$role.'_id'])){$a=ir_animal($pdo,$uid,(int)$animal[$role.'_id']);if($a)$parents[$role]=array_merge($parents[$role]??[],['internal_zvire_id'=>$a['id'],'jmeno'=>$a['jmeno_kod'],'kod'=>$a['animal_id'],'foto'=>$a['foto'],'latinsky_nazev'=>$a['latinsky_nazev'],'morf_linie'=>$a['morf_linie'],'chovatel'=>$a['chovatel_puvod'],'poznamka'=>$parents[$role]['poznamka']??'']);}
 return $parents;
}
function ir_pedigree_ensure_person(PDO $pdo,int $uid,array $animal): int {
 $p=ir_pedigree_person($pdo,$uid,(int)$animal['id']);if($p)return (int)$p['id'];
 $q=$pdo->prepare('INSERT INTO wp_ir2_rodokmen_osoby(user_id,internal_zvire_id,druh_id,jmeno,kod,pohlavi,druh,latinsky_nazev,foto) VALUES(?,?,?,?,?,?,?,?,?)');$q->execute([$uid,$animal['id'],$animal['druh_id'],$animal['jmeno_kod'],$animal['animal_id'],$animal['pohlavi'],$animal['druh'],$animal['latinsky_nazev'],$animal['foto']]);return (int)$pdo->lastInsertId();
}
function ir_pedigree_has_ancestor(PDO $pdo,int $uid,int $start,int $target,array &$seen): bool {
 if($start===$target)return true;if(isset($seen[$start]))return false;$seen[$start]=true;$a=ir_animal($pdo,$uid,$start);if(!$a)return false;
 foreach(['otec_id','matka_id'] as $k)if(!empty($a[$k])&&ir_pedigree_has_ancestor($pdo,$uid,(int)$a[$k],$target,$seen))return true;return false;
}
function ir_pedigree_full_tree(PDO $pdo,int $uid,array $animal,int $depth=3,array $seen=[]): array {
 $key='a'.$animal['id'];$node=['animal'=>$animal,'father'=>null,'mother'=>null];if(isset($seen[$key])||$depth<=0)return $node;$seen[$key]=true;
 foreach(ir_pedigree_parents($pdo,$uid,$animal) as $role=>$p){if(!$p)continue;$slot=$role==='otec'?'father':'mother';if(!empty($p['internal_zvire_id'])){$pa=ir_animal($pdo,$uid,(int)$p['internal_zvire_id']);if($pa)$node[$slot]=ir_pedigree_full_tree($pdo,$uid,$pa,$depth-1,$seen);}else{$pa=['id'=>0,'jmeno_kod'=>$p['jmeno'],'animal_id'=>$p['kod'],'latinsky_nazev'=>$p['latinsky_nazev'],'druh'=>$p['druh']??'Rodič mimo chov','foto'=>$p['foto']];$node[$slot]=['animal'=>$pa,'father'=>null,'mother'=>null];}}
 return $node;
}
function ir_pedigree_sync_internal(PDO $pdo,int $uid,int $animalId): void {
 $a=ir_animal($pdo,$uid,$animalId);if(!$a)return;$root=ir_pedigree_person($pdo,$uid,$animalId);
 foreach(['otec','matka'] as $role){$pid=(int)($a[$role.'_id']??0);if($pid){$parent=ir_animal($pdo,$uid,$pid);if(!$parent)throw new RuntimeException('Rodič nebyl nalezen.');$seen=[];if(ir_pedigree_has_ancestor($pdo,$uid,$pid,$animalId,$seen))throw new RuntimeException('Tato vazba by vytvořila kruh v rodokmenu.');$child=$root?(int)$root['id']:ir_pedigree_ensure_person($pdo,$uid,$a);$person=ir_pedigree_ensure_person($pdo,$uid,$parent);$pdo->prepare('DELETE FROM wp_ir2_rodokmen_vazby WHERE user_id=? AND dite_osoba_id=? AND role=?')->execute([$uid,$child,$role]);$pdo->prepare('INSERT INTO wp_ir2_rodokmen_vazby(user_id,dite_osoba_id,rodic_osoba_id,role) VALUES(?,?,?,?)')->execute([$uid,$child,$person,$role]);}
 elseif($root)$pdo->prepare('DELETE v FROM wp_ir2_rodokmen_vazby v JOIN wp_ir2_rodokmen_osoby p ON p.id=v.rodic_osoba_id AND p.user_id=v.user_id WHERE v.user_id=? AND v.dite_osoba_id=? AND v.role=? AND p.internal_zvire_id IS NOT NULL')->execute([$uid,$root['id'],$role]);
 }
}


/* PATCH 052 — generic pedigree-person graph.
 * wp_ir2_rodokmen_vazby already supports arbitrary depth. These helpers expose
 * that graph for both internal animals and external ancestors without a schema change.
 */
function ir_pedigree_person_by_id(PDO $pdo,int $uid,int $personId): ?array {
    if($personId<=0)return null;
    $q=$pdo->prepare('SELECT * FROM wp_ir2_rodokmen_osoby WHERE user_id=? AND id=? LIMIT 1');
    $q->execute([$uid,$personId]);
    return $q->fetch()?:null;
}
function ir_pedigree_person_parent_rows(PDO $pdo,int $uid,int $childPersonId): array {
    $out=['otec'=>null,'matka'=>null];
    if($childPersonId<=0)return $out;
    $q=$pdo->prepare('SELECT p.*,v.role FROM wp_ir2_rodokmen_vazby v JOIN wp_ir2_rodokmen_osoby p ON p.id=v.rodic_osoba_id AND p.user_id=v.user_id WHERE v.user_id=? AND v.dite_osoba_id=? ORDER BY v.id');
    $q->execute([$uid,$childPersonId]);
    foreach($q as $row)$out[(string)$row['role']]=$row;
    return $out;
}
function ir_pedigree_person_reaches(PDO $pdo,int $uid,int $startPersonId,int $targetPersonId,array &$seen=[]): bool {
    if($startPersonId<=0||$targetPersonId<=0)return false;
    if($startPersonId===$targetPersonId)return true;
    if(isset($seen[$startPersonId]))return false;
    $seen[$startPersonId]=true;
    foreach(ir_pedigree_person_parent_rows($pdo,$uid,$startPersonId) as $parent){
        if($parent&&ir_pedigree_person_reaches($pdo,$uid,(int)$parent['id'],$targetPersonId,$seen))return true;
    }
    return false;
}
function ir_pedigree_person_tree(PDO $pdo,int $uid,int $personId,int $depth=6,array $seen=[]): ?array {
    if($personId<=0||$depth<0||isset($seen[$personId]))return null;
    $p=ir_pedigree_person_by_id($pdo,$uid,$personId);
    if(!$p)return null;
    $seen[$personId]=true;
    $animal=null;
    if(!empty($p['internal_zvire_id']))$animal=ir_animal($pdo,$uid,(int)$p['internal_zvire_id']);
    $node=['person'=>$p,'animal'=>$animal,'father'=>null,'mother'=>null];
    if($depth>0){
        $parents=ir_pedigree_person_parent_rows($pdo,$uid,$personId);
        if($parents['otec'])$node['father']=ir_pedigree_person_tree($pdo,$uid,(int)$parents['otec']['id'],$depth-1,$seen);
        if($parents['matka'])$node['mother']=ir_pedigree_person_tree($pdo,$uid,(int)$parents['matka']['id'],$depth-1,$seen);
    }
    return $node;
}
function ir_pedigree_tree_for_animal(PDO $pdo,int $uid,array $animal,int $depth=6): array {
    $person=ir_pedigree_person($pdo,$uid,(int)$animal['id']);
    if($person){
        $tree=ir_pedigree_person_tree($pdo,$uid,(int)$person['id'],$depth);
        if($tree)return $tree;
    }
    // Read-only fallback for animals whose pedigree person was never created.
    $legacy=ir_pedigree_full_tree($pdo,$uid,$animal,$depth);
    return ['person'=>null,'animal'=>$legacy['animal']??$animal,'father'=>$legacy['father']??null,'mother'=>$legacy['mother']??null,'legacy'=>true];
}
function ir_pedigree_node_person_id(?array $node): int {
    return (int)($node['person']['id']??0);
}
function ir_pedigree_node_display(?array $node): string {
    if(!$node)return 'Nezadán';
    if(!empty($node['animal']))return ir_animal_display($node['animal']);
    return trim((string)($node['person']['jmeno']??'Předek'))?:'Předek';
}
function ir_pedigree_node_secondary(?array $node): string {
    if(!$node)return '';
    if(!empty($node['animal']))return ir_animal_secondary($node['animal']);
    $p=$node['person']??[];
    return trim((string)($p['latinsky_nazev']??$p['druh']??$p['kod']??''));
}
function ir_pedigree_node_photo(?array $node): string {
    if(!$node)return '';
    if(!empty($node['animal']))return ir_animal_photo($node['animal']);
    return ir_asset_photo_url((string)($node['person']['foto']??''));
}
function ir_pedigree_node_sex(?array $node): string {
    if(!$node)return '';
    $sex=(string)($node['animal']['pohlavi']??$node['person']['pohlavi']??'');
    $low=mb_strtolower($sex,'UTF-8');
    if(str_contains($low,'samec'))return 'male';
    if(str_contains($low,'samice'))return 'female';
    return 'unknown';
}
