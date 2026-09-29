<?php
$memberQuery=$pdo->prepare("SELECT z.*,u.nazev ubikace_nazev,(SELECT MAX(p.datum) FROM wp_ir2_pece p WHERE p.user_id=z.user_id AND p.zvire_id=z.id AND p.typ='Krmení') last_feed FROM wp_ir2_zvirata z LEFT JOIN wp_ir2_ubikace u ON u.id=z.ubikace_id AND u.user_id=z.user_id WHERE z.user_id=? AND z.skupina_parent_id=? ORDER BY z.jmeno_kod,z.id");
$memberQuery->execute([$uid,$id]);
$allMembers=$memberQuery->fetchAll();
$members=[];$formerMembers=[];
foreach($allMembers as $member){
    if(in_array($member['status_chovu'],['Archiv','Prodáno','Uhynulo','Mrtvé','Dead','Sold'],true))$formerMembers[]=$member;
    else $members[]=$member;
}
if($allMembers||in_array($a['pohlavi'],['Skupina','Pár'],true)):
?>
<section class="panel glow-panel group-members-panel" id="jedinci">
  <header class="panel-head">
    <div><span class="panel-kicker">SKUPINOVÝ CHOV</span><h2>Jedinci ve skupině <span class="muted">· <?=count($members)?></span></h2></div>
    <div class="group-members-actions">
      <a class="btn secondary" href="animal-edit.php?parent_id=<?=$id?>">+ Přidat jedince</a>
      <a class="btn primary group-care-button" href="quick.php?parent_id=<?=$id?>">Zapsat péči skupině</a>
    </div>
  </header>
  <div class="table-scroll group-members-table-wrap">
    <table class="data-table group-members-table">
      <thead><tr><th>Foto</th><th>Jedinec</th><th>Pohlaví</th><th>Status</th><th>Ubikace</th><th>Poslední krmení</th><th>Akce</th></tr></thead>
      <tbody>
      <?php foreach($members as $member):$memberPhoto=ir_animal_photo($member);?>
      <tr>
        <td><a class="group-member-thumb" href="animal.php?id=<?=$member['id']?>"><?php if($memberPhoto):?><img src="<?=ir_e($memberPhoto)?>" alt=""><?php else:?><?=ir_visual_icon('animals')?><?php endif;?></a></td>
        <td><a class="group-member-name" href="animal.php?id=<?=$member['id']?>"><strong><?=ir_e((string)$member['jmeno_kod'])?></strong><small><?=ir_e((string)($member['latinsky_nazev']??''))?></small></a></td>
        <td><span class="sex-label <?=mb_strtolower((string)$member['pohlavi'],'UTF-8')==='samec'?'is-male':(mb_strtolower((string)$member['pohlavi'],'UTF-8')==='samice'?'is-female':'')?>"><?=ir_e((string)$member['pohlavi'])?></span></td>
        <td><span class="status-pill amber"><?=ir_e((string)$member['status_chovu'])?></span></td>
        <td><?=ir_e((string)($member['ubikace_nazev']?:'Bez ubikace'))?></td>
        <td><?=!empty($member['last_feed'])?date('d.m.Y',strtotime((string)$member['last_feed'])):'—'?></td>
        <td><div class="row-actions"><a href="animal.php?id=<?=$member['id']?>">Detail</a><a href="animal-edit.php?id=<?=$member['id']?>">Upravit</a></div></td>
      </tr>
      <?php endforeach;?>
      <?php if(!$members):?><tr><td colspan="7"><div class="table-empty">Zatím nejsou přiřazeni žádní aktivní jedinci.</div></td></tr><?php endif;?>
      </tbody>
    </table>
  </div>
  <?php if($formerMembers):?><details class="former-members"><summary>Archivovaní / bývalí jedinci (<?=count($formerMembers)?>)</summary><?php foreach($formerMembers as $member):?><a href="animal.php?id=<?=$member['id']?>"><?=ir_e((string)$member['jmeno_kod'])?> · <?=ir_e((string)$member['status_chovu'])?></a><?php endforeach;?></details><?php endif;?>
</section>
<?php endif;?>
