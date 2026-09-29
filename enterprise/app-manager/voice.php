<?php
declare(strict_types=1);
/* VOICE — hands-free dialogue (CZ/EN/DE, Latin names, TTS confirmation) + pronunciation aliases. */
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';require __DIR__.'/includes/reptile_core.php';
ir_require_perm('read');
$uid=ir_current_user_id();
if($_SERVER['REQUEST_METHOD']==='POST'){
    ir_verify_csrf();
    try{
        if(!ir_table_exists($pdo,'wp_ir2_voice_aliases'))throw new RuntimeException('Tabulka hlasových aliasů není dostupná.');
        $a=(string)($_POST['action']??'');
        if($a==='alias'){
            $aid=ir_int($_POST['animal_id']??0);if(!$aid||!ir_animal($pdo,$uid,$aid))throw new RuntimeException('Vyberte platné zvíře.');
            $alias=mb_substr(trim((string)($_POST['alias']??'')),0,190);if($alias==='')throw new RuntimeException('Napište výslovnost nebo přezdívku.');
            $pdo->prepare('INSERT IGNORE INTO wp_ir2_voice_aliases(user_id,zvire_id,alias) VALUES(?,?,?)')->execute([$uid,$aid,$alias]);
            ir_flash('success','Hlasový alias uložen.');
        }elseif($a==='alias_delete'){
            $pdo->prepare('DELETE FROM wp_ir2_voice_aliases WHERE user_id=? AND id=?')->execute([$uid,ir_int($_POST['id']??0)]);
            ir_flash('success','Alias odstraněn.');
        }
    }catch(Throwable $e){ir_flash('error',$e->getMessage());}
    ir_redirect('voice.php');
}
$animals=[];try{$st=$pdo->prepare("SELECT id,jmeno_kod,animal_id,latinsky_nazev FROM wp_ir2_zvirata z WHERE user_id=? AND ".ir_status_active_sql('z')." ORDER BY jmeno_kod");$st->execute([$uid]);$animals=$st->fetchAll()?:[];}catch(Throwable){}
$aliases=[];if(ir_table_exists($pdo,'wp_ir2_voice_aliases')){$st=$pdo->prepare('SELECT a.id,a.alias,z.jmeno_kod FROM wp_ir2_voice_aliases a JOIN wp_ir2_zvirata z ON z.id=a.zvire_id AND z.user_id=a.user_id WHERE a.user_id=? ORDER BY z.jmeno_kod,a.alias');$st->execute([$uid]);$aliases=$st->fetchAll()?:[];}
ir_page_start('Hlasové ovládání','care');echo ir_back('quick.php','Rychlý záznam');
?>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">BEZ RUKOU · ČEŠTINA · ENGLISH · DEUTSCH</span><h2>Hlasové ovládání</h2><p class="muted">Řekněte zvíře (i latinsky, např. „P. regius“) a co se stalo: snědlo, odmítlo, ve svleku, nekrmeno, vážení 120 gramů, rosení… Asistent se doptá na chybějící údaj, při shodě jmen nabídne možnosti a před uložením vše přečte. Uloží se až po „ano“.</p></div></header>
<div class="b1-voice-inline" data-voice-inline></div></section>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">VÝSLOVNOST</span><h2>Hlasové aliasy zvířat</h2><p class="muted">Přezdívka nebo způsob, jakým jméno vyslovujete. Asistent ji pozná stejně jako jméno a latinský název.</p></div></header>
<?php if(ir_can('write')):?><form method="post" class="b1-inline" style="padding:0 12px"><?=ir_csrf_field()?><input type="hidden" name="action" value="alias"><label>Zvíře<select class="input" name="animal_id" required><?php foreach($animals as $a):?><option value="<?=(int)$a['id']?>"><?=ir_e($a['jmeno_kod'].($a['animal_id']?' · '.$a['animal_id']:''))?></option><?php endforeach;?></select></label><label class="b1-grow">Alias<input class="input" name="alias" required maxlength="190" placeholder="např. Pastelka, pajton"></label><button class="btn">Přidat alias</button></form><?php endif;?>
<ul class="b1-list"><?php foreach($aliases as $al):?><li><b><?=ir_e($al['alias'])?></b> → <?=ir_e($al['jmeno_kod'])?><?php if(ir_can('write')):?><form method="post" class="b1-inline-mini"><?=ir_csrf_field()?><input type="hidden" name="action" value="alias_delete"><input type="hidden" name="id" value="<?=(int)$al['id']?>"><button class="btn small">Odebrat</button></form><?php endif;?></li><?php endforeach;if(!$aliases):?><li class="muted">Zatím žádné aliasy.</li><?php endif;?></ul></section>
<?php ir_page_end();
