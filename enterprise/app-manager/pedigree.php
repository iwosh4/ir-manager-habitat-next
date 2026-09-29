<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';
require __DIR__.'/includes/live.php';
require __DIR__.'/includes/shell.php';
require __DIR__.'/includes/reptile_core.php';
require __DIR__.'/includes/pedigree.php';

$uid=ir_current_user_id();
$id=ir_int($_GET['animal_id']??$_GET['id']??0);
$animal=ir_animal($pdo,$uid,$id);
if(!$animal){http_response_code(404);exit('Zvíře nebylo nalezeno.');}

$error='';
$depth=max(2,min(20,(int)($_GET['depth']??6)));
$rootPersonId=0;
try{$rootPersonId=ir_pedigree_ensure_person($pdo,$uid,$animal);}catch(Throwable $e){error_log('Pedigree root: '.$e->getMessage());}

if($_SERVER['REQUEST_METHOD']==='POST'){
    ir_verify_csrf();
    $action=(string)($_POST['action']??'');
    try{
        if($action==='save_parent_link'){
            $childPersonId=ir_int($_POST['child_person_id']??0);
            $role=(string)($_POST['role']??'');
            if(!in_array($role,['otec','matka'],true))throw new RuntimeException('Neplatná role rodiče.');
            $childPerson=ir_pedigree_person_by_id($pdo,$uid,$childPersonId);
            if(!$childPerson)throw new RuntimeException('Uzel rodokmenu nebyl nalezen.');
            $selected=ir_int($_POST['internal_zvire_id']??0);
            $remove=!empty($_POST['remove_parent']);
            $name=trim((string)($_POST['name']??''));
            $code=trim((string)($_POST['code']??''));
            $breeder=trim((string)($_POST['breeder']??''));
            $year=trim((string)($_POST['year']??''));
            $locality=trim((string)($_POST['locality']??''));
            $line=trim((string)($_POST['line']??''));
            $note=trim((string)($_POST['note']??''));
            $parentPersonId=0;$selectedInternalId=null;$newFile='';

            $pdo->beginTransaction();
            if(!$remove&&$selected>0){
                $selectedAnimal=ir_animal($pdo,$uid,$selected);
                if(!$selectedAnimal)throw new RuntimeException('Vybraný rodič není dostupný.');
                $parentPersonId=ir_pedigree_ensure_person($pdo,$uid,$selectedAnimal);
                $selectedInternalId=$selected;
                $seen=[];
                if(ir_pedigree_person_reaches($pdo,$uid,$parentPersonId,$childPersonId,$seen))throw new RuntimeException('Tato vazba by vytvořila kruh v rodokmenu.');
            }elseif(!$remove){
                if($name==='')$name=$role==='otec'?'Neznámý otec':'Neznámá matka';
                $sex=$role==='otec'?'Samec':'Samice';
                $photo=null;
                if(($_FILES['photo']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE){
                    $photo=ir_store_image_upload($_FILES['photo'],$uid,$id);$newFile=(string)$photo;
                }
                $pdo->prepare('INSERT INTO wp_ir2_rodokmen_osoby(user_id,jmeno,kod,pohlavi,druh,latinsky_nazev,lokalita,morf_linie,rok_narozeni,chovatel,foto,poznamka) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
                    ->execute([$uid,$name,$code,$sex,$animal['druh']??null,$animal['latinsky_nazev']??null,$locality,$line,$year,$breeder,$photo,$note]);
                $parentPersonId=(int)$pdo->lastInsertId();
            }

            $pdo->prepare('DELETE FROM wp_ir2_rodokmen_vazby WHERE user_id=? AND dite_osoba_id=? AND role=?')->execute([$uid,$childPersonId,$role]);
            if($parentPersonId>0)$pdo->prepare('INSERT INTO wp_ir2_rodokmen_vazby(user_id,dite_osoba_id,rodic_osoba_id,role) VALUES(?,?,?,?)')->execute([$uid,$childPersonId,$parentPersonId,$role]);

            if(!empty($childPerson['internal_zvire_id'])){
                $field=$role==='otec'?'otec_id':'matka_id';
                $pdo->prepare("UPDATE wp_ir2_zvirata SET {$field}=?,upraveno=NOW() WHERE user_id=? AND id=?")
                    ->execute([$selectedInternalId,$uid,(int)$childPerson['internal_zvire_id']]);
            }
            $pdo->commit();
            ir_flash('success',$remove?'Rodič byl odpojen.':'Rodokmen byl rozšířen o dalšího předka.');
            ir_redirect('pedigree.php?animal_id='.$id.'&depth='.$depth.'#pedigree-tree');
        }
    }catch(Throwable $e){
        if($pdo->inTransaction())$pdo->rollBack();
        if(!empty($newFile)&&is_file(IR_ROOT.'/'.$newFile))@unlink(IR_ROOT.'/'.$newFile);
        error_log('Pedigree editor: '.$e->getMessage());
        $error=$e instanceof PDOException?'Rodokmen se nepodařilo uložit.':$e->getMessage();
    }
}

$q=$pdo->prepare("SELECT id,jmeno_kod,latinsky_nazev,pohlavi FROM wp_ir2_zvirata WHERE user_id=? AND COALESCE(pohlavi,'') NOT IN ('Skupina','Pár') ORDER BY jmeno_kod");
$q->execute([$uid]);$animalChoices=$q->fetchAll()?:[];
$tree=$rootPersonId?ir_pedigree_person_tree($pdo,$uid,$rootPersonId,$depth):null;

$editPersonId=ir_int($_GET['edit_person']??$rootPersonId);
$editRole=(string)($_GET['role']??'otec');if(!in_array($editRole,['otec','matka'],true))$editRole='otec';
$editPerson=ir_pedigree_person_by_id($pdo,$uid,$editPersonId)?:ir_pedigree_person_by_id($pdo,$uid,$rootPersonId);
$currentParents=$editPerson?ir_pedigree_person_parent_rows($pdo,$uid,(int)$editPerson['id']):['otec'=>null,'matka'=>null];
$currentParent=$currentParents[$editRole]??null;

function ir_pedigree_graph_html(?array $node,int $animalId,int $depth,int $generation=0,string $role='Jedinec'): string {
    if(!$node)return '';
    $pid=ir_pedigree_node_person_id($node);
    $name=ir_pedigree_node_display($node);$secondary=ir_pedigree_node_secondary($node);$photo=ir_pedigree_node_photo($node);$sex=ir_pedigree_node_sex($node);
    $sexMark=$sex==='male'?'♂':($sex==='female'?'♀':'');
    $html='<article class="pedigree-graph-node sex-'.ir_e($sex).' gen-'.$generation.'"><div class="pedigree-graph-card">';
    $html.=$photo?'<img src="'.ir_e($photo).'" alt="">':'<span class="pedigree-avatar">'.ir_visual_icon('animals').'</span>';
    $html.='<div class="pedigree-graph-copy"><small>'.ir_e($role).' · G'.$generation.'</small><strong>'.ir_e($name).' <b>'.ir_e($sexMark).'</b></strong><span>'.ir_e($secondary).'</span></div>';
    if($pid>0)$html.='<div class="pedigree-node-actions"><a href="pedigree.php?animal_id='.$animalId.'&depth='.$depth.'&edit_person='.$pid.'&role=otec#ancestor-editor">+ otec</a><a href="pedigree.php?animal_id='.$animalId.'&depth='.$depth.'&edit_person='.$pid.'&role=matka#ancestor-editor">+ matka</a></div>';
    $html.='</div>';
    $father=$node['father']??null;$mother=$node['mother']??null;
    if($generation<$depth&&($father||$mother||$pid>0)){
        $html.='<div class="pedigree-graph-parents">';
        if($father)$html.=ir_pedigree_graph_html($father,$animalId,$depth,$generation+1,'Otec');
        elseif($pid>0)$html.='<a class="pedigree-empty-slot sex-male" href="pedigree.php?animal_id='.$animalId.'&depth='.$depth.'&edit_person='.$pid.'&role=otec#ancestor-editor"><span>♂</span><strong>Přidat otce</strong><small>Generace '.($generation+1).'</small></a>';
        if($mother)$html.=ir_pedigree_graph_html($mother,$animalId,$depth,$generation+1,'Matka');
        elseif($pid>0)$html.='<a class="pedigree-empty-slot sex-female" href="pedigree.php?animal_id='.$animalId.'&depth='.$depth.'&edit_person='.$pid.'&role=matka#ancestor-editor"><span>♀</span><strong>Přidat matku</strong><small>Generace '.($generation+1).'</small></a>';
        $html.='</div>';
    }
    return $html.'</article>';
}

ir_page_start('Rodokmen · '.ir_animal_display($animal),'animals');
echo ir_back('animal.php?id='.$id,'Zpět na kartu');
if($error)echo '<div class="flash danger" role="alert">'.ir_e($error).'</div>';
?>
<section class="panel pedigree-visual-shell" id="pedigree-tree">
 <header class="panel-head pedigree-visual-head">
  <div><span class="panel-kicker">VIZUÁLNÍ RODOKMEN</span><h2><?=ir_e(ir_animal_display($animal))?></h2><small>Datový model není omezen počtem generací. Zobrazení načítej postupně podle potřeby.</small></div>
  <div class="pedigree-depth-controls"><a class="btn small" href="pedigree.php?animal_id=<?=$id?>&depth=<?=max(2,$depth-2)?>#pedigree-tree">− generace</a><strong><?=$depth?></strong><a class="btn small primary" href="pedigree.php?animal_id=<?=$id?>&depth=<?=min(20,$depth+2)?>#pedigree-tree">+ další generace</a></div>
 </header>
 <div class="pedigree-graph-scroll"><?php if($tree):?><?=ir_pedigree_graph_html($tree,$id,$depth)?><?php else:?><p class="empty-state">Rodokmen zatím nemá žádná data.</p><?php endif;?></div>
</section>

<section class="panel ancestor-editor" id="ancestor-editor">
 <header class="panel-head"><div><span class="panel-kicker">PŘIDAT / UPRAVIT PŘEDKA</span><h2><?=ir_e($editRole==='otec'?'Otec':'Matka')?> pro <?=ir_e((string)($editPerson['jmeno']??ir_animal_display($animal)))?></h2></div><a href="pedigree.php?animal_id=<?=$id?>&depth=<?=$depth?>#pedigree-tree">Zavřít editor</a></header>
 <form method="post" enctype="multipart/form-data" class="pedigree-editor-form"><?=ir_csrf_field()?>
  <input type="hidden" name="action" value="save_parent_link"><input type="hidden" name="child_person_id" value="<?=(int)($editPerson['id']??$rootPersonId)?>"><input type="hidden" name="role" value="<?=ir_e($editRole)?>">
  <div class="form-grid cols-3">
   <label class="span-3">Existující zvíře v evidenci<select name="internal_zvire_id"><option value="">Externí předek / ruční údaje</option><?php foreach($animalChoices as $c):?><option value="<?=(int)$c['id']?>" <?=((int)($currentParent['internal_zvire_id']??0)===(int)$c['id'])?'selected':''?>><?=ir_e((string)$c['jmeno_kod'])?> · <?=ir_e((string)$c['latinsky_nazev'])?> · <?=ir_e((string)$c['pohlavi'])?></option><?php endforeach;?></select></label>
   <label>Jméno / označení<input name="name" maxlength="190" value="<?=ir_e((string)($currentParent['jmeno']??''))?>"></label>
   <label>Kód<input name="code" maxlength="190" value="<?=ir_e((string)($currentParent['kod']??''))?>"></label>
   <label>Rok narození<input name="year" maxlength="20" value="<?=ir_e((string)($currentParent['rok_narozeni']??''))?>"></label>
   <label>Chovatel / původ<input name="breeder" maxlength="190" value="<?=ir_e((string)($currentParent['chovatel']??''))?>"></label>
   <label>Lokalita<input name="locality" maxlength="190" value="<?=ir_e((string)($currentParent['lokalita']??''))?>"></label>
   <label>Linie / morph<input name="line" maxlength="190" value="<?=ir_e((string)($currentParent['morf_linie']??''))?>"></label>
   <label class="span-2">Poznámka<textarea name="note" rows="3"><?=ir_e((string)($currentParent['poznamka']??''))?></textarea></label>
   <label>Fotografie<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>
   <label class="check-line span-3"><input type="checkbox" name="remove_parent" value="1"> Odpojit tohoto rodiče od uzlu</label>
  </div>
  <div class="pedigree-editor-actions"><button class="btn primary">Uložit předka</button><small>Každý přidaný předek se okamžitě stává dalším uzlem, ke kterému lze znovu přidat otce a matku.</small></div>
 </form>
</section>
<?php ir_page_end();
