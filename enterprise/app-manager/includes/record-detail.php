<?php
declare(strict_types=1);
function ir_render_record_detail(string $module): void {
 global $pdo;$uid=ir_current_user_id();$id=(int)($_GET['id']??$_GET['edit']??0);if($id<1)return;
 $models=[
  'habitats'=>['wp_ir2_ubikace',['nazev'=>'Název','typ'=>'Typ','rozmery'=>'Rozměry','teplota_den'=>'Denní teplota','vlhkost'=>'Vlhkost','poznamka'=>'Poznámka']],
  'health'=>['wp_ir2_zdravi',['typ_zaznamu'=>'Záznam','status'=>'Stav','datum_od'=>'Od','datum_do'=>'Do','priznaky'=>'Příznaky','diagnoza'=>'Diagnóza','lecba'=>'Léčba','veterinar'=>'Veterinář','poznamka'=>'Poznámka']],
  'finance'=>['wp_ir2_finance',['typ'=>'Typ','datum'=>'Datum','castka'=>'Částka v Kč','kategorie'=>'Kategorie','popis'=>'Popis']]
 ];if(!isset($models[$module]))return;[$table,$fields]=$models[$module];
 $q=$pdo->prepare("SELECT * FROM `$table` WHERE id=? AND user_id=?");$q->execute([$id,$uid]);$row=$q->fetch();
 echo '<section class="panel record-detail" id="record-detail"><header class="panel-head"><h2>Detail záznamu</h2><a href="'.ir_e($module).'.php">Zpět na přehled</a></header>';
 if(!$row){echo '<p>Záznam nebyl nalezen.</p></section>';return;}
 echo '<dl class="record-fields">';foreach($fields as $key=>$label)echo '<div><dt>'.ir_e($label).'</dt><dd>'.ir_e((string)($row[$key]??'—')).'</dd></div>';echo '</dl>';
 if($module==='habitats'){
  $q=$pdo->prepare('SELECT id,jmeno_kod FROM wp_ir2_zvirata WHERE user_id=? AND ubikace_id=? ORDER BY jmeno_kod');$q->execute([$uid,$id]);$animals=$q->fetchAll();echo '<h3>Obyvatelé</h3>';foreach($animals as $a)echo '<a class="widget-row" href="animal.php?id='.(int)$a['id'].'">'.ir_e($a['jmeno_kod']).'</a>';if(!$animals)echo '<p>Volná ubikace.</p>';
  $q=$pdo->prepare("SELECT p.typ,p.datum FROM wp_ir2_pece p JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE z.user_id=? AND z.ubikace_id=? ORDER BY p.datum DESC LIMIT 1");$q->execute([$uid,$id]);if($care=$q->fetch())echo '<p>Poslední péče: '.ir_e($care['typ'].' · '.$care['datum']).'</p>';
  $q=$pdo->prepare("SELECT p.id,p.nazev_ukolu,p.datum_termin FROM wp_ir2_planovac p JOIN wp_ir2_zvirata z ON z.id=p.zvire_id AND z.user_id=p.user_id WHERE z.user_id=? AND z.ubikace_id=? AND p.stav='Aktivní' ORDER BY p.datum_termin,p.id LIMIT 1");$q->execute([$uid,$id]);if($task=$q->fetch())echo '<a class="widget-row" href="tasks.php?task='.(int)$task['id'].'">Nejbližší úkol: '.ir_e($task['nazev_ukolu'].' · '.$task['datum_termin']).'</a>';
  echo '<a class="btn" href="habitat-studio.php?mode=habitat">Otevřít v Habitat Studiu</a>';
 }elseif(!empty($row['zvire_id']))echo '<a class="btn" href="animal.php?id='.(int)$row['zvire_id'].'">Otevřít zvíře</a>';
 echo '</section>';
}
