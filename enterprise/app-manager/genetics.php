<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';
$uid=ir_current_user_id();$error='';
if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
    ir_verify_csrf();
    try{
        $action=(string)($_POST['action']??'save');
        if($action==='delete'){$id=(int)($_POST['id']??0);$pdo->prepare('DELETE FROM wp_ir2_genetic_projects WHERE user_id=? AND id=?')->execute([$uid,$id]);ir_redirect('genetics.php');}
        $name=trim((string)($_POST['name']??''));$species=trim((string)($_POST['species']??''));$json=(string)($_POST['project_json']??'');$data=json_decode($json,true,64,JSON_THROW_ON_ERROR);
        if($name==='')$name=trim((string)($data['father']['name']??'Otec')).' × '.trim((string)($data['mother']['name']??'Matka'));
        if(mb_strlen($name)>190)$name=mb_substr($name,0,190);if(mb_strlen($species)>190)$species=mb_substr($species,0,190);
        if(!is_array($data)||!isset($data['genes'])||!is_array($data['genes']))throw new RuntimeException('Projekt neobsahuje genetická data.');
        /* No artificial gene-count limit: the JSON is bounded only by the DB TEXT field. */
        if(strlen($json)>60000)throw new RuntimeException('Projekt je příliš rozsáhlý pro jedno uložení. Rozděl jej do více projektů.');
        $father=json_encode(['schema'=>'ir-genetics-v3','parent'=>$data['father']??[],'genes'=>$data['genes']],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        $mother=json_encode(['schema'=>'ir-genetics-v3','parent'=>$data['mother']??[],'genes'=>$data['genes']],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        $notes=json_encode(['schema'=>'ir-genetics-v3','raw'=>$data['notes']??''],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        $pdo->prepare('INSERT INTO wp_ir2_genetic_projects(user_id,name,species,male_traits,female_traits,notes) VALUES(?,?,?,?,?,?)')->execute([$uid,$name,$species,$father,$mother,$notes]);
        ir_redirect('genetics.php?saved=1');
    }catch(Throwable $e){error_log('Genetics 2.0: '.$e->getMessage());$error=$e->getMessage()?:'Projekt se nepodařilo uložit.';}
}
$animals=[];$saved=[];
try{$q=$pdo->prepare('SELECT id,jmeno_kod,druh,latinsky_nazev,pohlavi,morf_linie,genetika,hetero_geni FROM wp_ir2_zvirata WHERE user_id=? ORDER BY COALESCE(latinsky_nazev,druh),jmeno_kod');$q->execute([$uid]);$animals=$q->fetchAll()?:[];$q=$pdo->prepare('SELECT * FROM wp_ir2_genetic_projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 40');$q->execute([$uid]);$saved=$q->fetchAll()?:[];}catch(Throwable $e){error_log('Genetics load 2.0: '.$e->getMessage());}
ir_page_start('Genetická kalkulačka','reproduction');
?>
<link rel="stylesheet" href="assets/css/genetics.css?v=1.0">
<section class="genetics-hero-063 genetics-hero-2 glow-panel panel"><div><?=ir_visual_icon('reproduction')?><span><span class="panel-kicker">UNIVERZÁLNÍ GENETIKA 2.0</span><h2>Otec × matka · libovolný druh · libovolný počet genů</h2><p>Rodiče nemusí být v databázi. Zadej libovolný taxon, neomezený počet genů, typ dědičnosti (recesivní, dominantní, kodominantní, neúplně dominantní, sex-linked, vlastní), stav genu a míru jistoty.</p></span></div><div class="genetics-legend"><span>Recesivní</span><span>Dominantní</span><span>Kodominantní</span><span>Neúplná dominance</span><span>Sex-linked</span></div></section>
<?php if($error):?><div class="flash danger"><?=ir_e($error)?></div><?php endif;if(isset($_GET['saved'])):?><div class="flash success">Genetický projekt byl uložen.</div><?php endif?>
<section class="panel glow-panel genetics-universal-063 genetics-universal-2">
<header class="panel-head"><div><span class="panel-kicker">KALKULACE</span><h2>Zadej rodiče a geny</h2><p>Začátečník: vyplň rodiče, přidej geny, stiskni Vypočítat. Pokročilý: rozbal genotypy, sex-linked, vazbu genů a detail výpočtu níže.</p></div><button type="button" class="btn primary" id="g-add">+ Přidat gen</button></header>
<div class="form-grid cols-2 genetics-project-meta-063"><label>Druh / taxon<input id="g-species" placeholder="např. Pantherophis guttatus, Python regius, Correlophus ciliatus…"></label><label>Název projektu<input id="g-name" placeholder="např. 2027 – Pantherophis Snow projekt"></label></div>

<div class="gg-parent-cards">
<?php foreach(['father'=>['OTEC','♂','male'],'mother'=>['MATKA','♀','female']] as $side=>$meta):if($side==='mother'):?>
  <button type="button" class="gg-swap-btn" id="g-swap" title="Prohodit rodiče">⇄</button>
<?php endif;?>
<section class="gg-parent-card <?=$meta[2]?>"><header><span class="gg-sex"><?=$meta[1]?></span><div><small><?=$meta[0]?></small><strong>Libovolný rodič</strong></div></header>
<label>Jméno / označení<input data-parent="<?=$side?>" data-field="name" placeholder="např. Corn snake ♂ / samec A"></label>
<label>Volitelně z vlastního chovu<select data-parent-pick="<?=$side?>"><option value="">— ruční zadání / zvíře mimo chov —</option><?php foreach($animals as $a):?><option value="<?=$a['id']?>" data-name="<?=ir_e((string)($a['jmeno_kod']?:$a['latinsky_nazev']))?>" data-species="<?=ir_e((string)($a['latinsky_nazev']?:$a['druh']))?>" data-genetics="<?=ir_e(trim((string)($a['morf_linie']??'').' · '.(string)($a['genetika']??'').' · '.(string)($a['hetero_geni']??''),' ·'))?>"><?=ir_e((string)($a['latinsky_nazev']?:$a['druh']).' · '.(string)$a['jmeno_kod'])?></option><?php endforeach?></select></label>
<label>Známé geny / morfa / linie<textarea data-parent="<?=$side?>" data-field="description" rows="3" placeholder="Volný popis, např. Amelanistic visual; 50% het. Anery; Tessera…"></textarea></label>
<label>Poznámky k původu / nejistotě<textarea data-parent="<?=$side?>" data-field="notes" rows="2" placeholder="Původ, linie, testovací páření…"></textarea></label>
</section>
<?php endforeach?>
</div>

<section class="genetics-loci-shell genetics-loci-063">
<div class="gg-loci-head"><h3>Geny / lokusy — neomezený počet</h3></div>
<div id="g-loci"></div>
<button type="button" class="btn" id="g-add-bottom">+ Další gen</button>
</section>
<label class="genetics-raw-notes-063">Doplňující genetické informace / nejistoty<textarea id="g-notes" rows="3" placeholder="Sem můžeš zapsat cokoli, co se do tabulky nevejde. Výsledek zůstane uložený u projektu."></textarea></label>
<div class="module-toolbar genetics-actions"><button type="button" class="btn primary" id="g-calc">Vypočítat předpoklad potomstva</button><button type="button" class="btn secondary" id="g-clear">Vyčistit</button></div>
</section>
<section class="genetics-result-grid genetics-result-grid-063"><section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">VÝSLEDEK</span><h2>Předpoklad potomstva</h2></div></header><div id="g-result" class="genetics-result-063"><div class="empty-state">Zadej rodiče a geny a spusť výpočet.</div></div></section><aside class="panel glow-panel genetics-saved"><header class="panel-head"><div><span class="panel-kicker">PROJEKTY</span><h2>Uložené kombinace</h2></div></header><form method="post" id="g-save"><?=ir_csrf_field()?><input type="hidden" name="action" value="save"><input type="hidden" name="name"><input type="hidden" name="species"><input type="hidden" name="project_json"><button class="btn primary" type="submit">Uložit aktuální projekt</button></form><div class="saved-genetics-list"><?php foreach($saved as $s):?><div class="saved-genetics-row"><button type="button" data-project-id="<?=$s['id']?>"><strong><?=ir_e($s['name'])?></strong><small><?=ir_e((string)$s['species'])?></small></button><form method="post" onsubmit="return confirm('Smazat uložený genetický projekt?')"><?=ir_csrf_field()?><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?=$s['id']?>"><button class="btn small danger">×</button></form></div><?php endforeach;if(!$saved):?><p class="empty-state small">Zatím žádné uložené kombinace.</p><?php endif?></div></aside></section>
<script type="application/json" id="g-data"><?=json_encode(['projects'=>$saved],JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_INVALID_UTF8_SUBSTITUTE)?></script>
<script type="module" src="assets/js/genetics-ui.mjs?v=100"></script>
<?php ir_page_end();
