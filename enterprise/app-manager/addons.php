<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';
require __DIR__.'/includes/live.php';
require __DIR__.'/includes/shell.php';
require __DIR__.'/includes/reptile_core.php';

function ir_addon_file(string $path): bool {return is_file(IR_ROOT.'/'.$path);}
function ir_addon_status(bool $fileOk,array $tables=[]): array {
    global $pdo;$tableOk=true;foreach($tables as $t)if(!ir_table_exists($pdo,$t)){$tableOk=false;break;}
    if($fileOk&&$tableOk)return ['Připraveno','is-ok'];
    if($fileOk||$tableOk)return ['Částečně dostupné','is-warn'];
    return ['Nedostupné','is-off'];
}
$addons=[
 ['Habitat Studio','Vizuální návrh sestav a virtuální místnosti.','habitat','habitat-studio.php',ir_addon_file('habitat-studio.php'),['wp_ir2_habitat_rooms_71','wp_ir2_habitat_room_items_71']],
 ['Home Assistant a senzory','Napojení čidel, zdrojů dat a technických prvků ubikací.','habitat','habitat-home-assistant.php',ir_addon_file('habitat-home-assistant.php'),['wp_ir2_habitat_sources_15','wp_ir2_habitat_sensor_bindings_15']],
 ['Hlasový asistent','Hands-free zadávání péče a rychlé hlasové ovládání.','care','voice.php',ir_addon_file('voice.php'),[]],
 ['Automatizace','Pravidla, intervaly a automaticky vytvářené úkoly.','automation','automation.php',ir_addon_file('automation.php'),['wp_ir2_automation_rules']],
 ['Dokumenty','Přílohy, šablony, původ zvířat a tiskové výstupy.','document','documents.php',ir_addon_file('documents.php'),['wp_ir2_documents']],
 ['Genetická kalkulačka','Genetické projekty a výpočty párování.','reproduction','genetics.php',ir_addon_file('genetics.php'),[]],
 ['Burzy a akce','Kalendář teraristických burz a vlastních návštěv.','calendar','events.php',ir_addon_file('events.php'),['wp_ir2_events']],
 ['QR centrum','QR otevření zvířete, ubikace nebo rychlého záznamu.','scan','scan.php',ir_addon_file('scan.php'),[]],
 ['PWA instalace','Instalace IR Manageru na plochu a základní offline shell.','dashboard','manifest.webmanifest',ir_addon_file('manifest.webmanifest')&&ir_addon_file('sw.js'),[]],
 ['Reporty','Provozní přehledy, filtry a exporty.','dashboard','reports.php',ir_addon_file('reports.php'),[]],
 ['Záloha a import / export','Zálohování aplikace a přenos provozních dat.','save','backup.php',ir_addon_file('backup.php')&&ir_addon_file('import.php'),[]],
 ['Adresář','Chovatelé, zákazníci, veterináři, dodavatelé a dopravci.','profile','contacts.php',ir_addon_file('contacts.php'),[]],
];
$ready=0;foreach($addons as $a){[$label]=$s=ir_addon_status((bool)$a[4],$a[5]);if($label==='Připraveno')$ready++;}
ir_page_start('Správa doplňků','other','DOPLŇKY');echo ir_back('settings.php','Zpět do nastavení');
?>
<section class="panel glow-panel addon-summary"><header class="panel-head"><div><span class="panel-kicker">DOPLŇKY A INTEGRACE</span><h2>Skutečný stav dostupných částí aplikace</h2></div></header><p>Tato stránka nic nesimuluje: stav vychází z přítomnosti potřebných souborů a tam, kde je to relevantní, také databázových tabulek.</p><div class="addon-summary-metrics"><article><strong><?=$ready?></strong><span>připravených</span></article><article><strong><?=count($addons)-$ready?></strong><span>k ověření / doplnění</span></article></div></section>
<section class="addon-grid">
<?php foreach($addons as $a):[$name,$desc,$icon,$href,$fileOk,$tables]=$a;[$status,$class]=ir_addon_status((bool)$fileOk,$tables);?>
<a class="addon-card panel glow-panel" href="<?=ir_e($href)?>"><?=ir_visual_icon($icon)?><div><strong><?=ir_e($name)?></strong><span><?=ir_e($desc)?></span><small class="addon-status <?=$class?>"><?=$status?></small></div><b>→</b></a>
<?php endforeach;?>
</section>
<?php ir_page_end();
