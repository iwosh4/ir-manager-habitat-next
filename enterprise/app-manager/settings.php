<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';require __DIR__.'/includes/live.php';require __DIR__.'/includes/shell.php';require __DIR__.'/includes/reptile_core.php';
ir_page_start('Nastavení aplikace','settings');echo ir_back('index.php','Zpět');
?>
<section class="panel glow-panel"><header class="panel-head"><div><span class="panel-kicker">NASTAVENÍ APLIKACE</span><h2>Funkce, data a nástroje IR Manageru</h2></div></header><div class="settings-link-grid">
<a class="settings-link-card" href="profile.php"><?=ir_visual_icon('profile')?><div><strong>Můj účet</strong><span>E-mail, heslo, avatar, jazyk a základní údaje účtu.</span></div><b>→</b></a>
<a class="settings-link-card" href="addons.php"><?=ir_visual_icon('other')?><div><strong>Správa doplňků</strong><span>Stav Habitat Studia, senzorů, hlasu, QR, dokumentů a dalších integrací.</span></div><b>→</b></a>
<a class="settings-link-card" href="actions.php"><?=ir_visual_icon('care')?><div><strong>Aktivity</strong><span>Vlastní aktivity, typy krmení a jejich přiřazení zvířatům.</span></div><b>→</b></a>
<a class="settings-link-card" href="supplements.php"><?=ir_visual_icon('supplement')?><div><strong>Suplementační rotace</strong><span>Druhové cykly vitamínů a minerálů, priority a napojení na krmení a Plánovač.</span></div><b>→</b></a>
<a class="settings-link-card" href="automation.php"><?=ir_visual_icon('automation')?><div><strong>Automatizace</strong><span>Pravidla, intervaly a automaticky vytvářené úkoly.</span></div><b>→</b></a>
<a class="settings-link-card" href="backup.php"><?=ir_visual_icon('download')?><div><strong>Záloha & Import / Export</strong><span>Jedna kompletní ZIP záloha dat i souborů, obnova a přenos CSV/JSON.</span></div><b>→</b></a>
<a class="settings-link-card" href="contacts.php"><?=ir_visual_icon('profile')?><div><strong>Adresář</strong><span>Chovatelé, zákazníci, veterináři, dodavatelé a dopravci.</span></div><b>→</b></a>
<a class="settings-link-card" href="documents.php"><?=ir_visual_icon('document')?><div><strong>Dokumenty</strong><span>Dokumentové šablony, přílohy a tiskové výstupy.</span></div><b>→</b></a>
<a class="settings-link-card" href="genetics.php"><?=ir_visual_icon('reproduction')?><div><strong>Genetická kalkulačka</strong><span>Genetické projekty a plánování párování.</span></div><b>→</b></a>
<a class="settings-link-card" href="events.php"><?=ir_visual_icon('calendar')?><div><strong>Burzy & akce</strong><span>Kalendář chovatelských akcí a vlastní plánované návštěvy.</span></div><b>→</b></a>
<a class="settings-link-card" href="reports.php"><?=ir_visual_icon('dashboard')?><div><strong>Reporty</strong><span>Přehledy, filtry a export provozních dat.</span></div><b>→</b></a>
<a class="settings-link-card" href="habitat-home-assistant.php"><?=ir_visual_icon('habitat')?><div><strong>Integrace & senzory</strong><span>Home Assistant, zdroje dat, čidla a technické vazby Habitat Studia.</span></div><b>→</b></a>
<a class="settings-link-card" href="scan.php"><?=ir_visual_icon('scan')?><div><strong>QR centrum</strong><span>Skenování a rychlé otevření zvířat, ubikací a pracovních záznamů.</span></div><b>→</b></a>
<a class="settings-link-card" href="voice.php"><?=ir_icon('mic')?><div><strong>Hlasový režim</strong><span>Hlasové záznamy a ovládání při práci v chovu bez zbytečného klikání.</span></div><b>→</b></a>
<?php if(ir_is_admin()):?><a class="settings-link-card" href="admin.php"><?=ir_visual_icon('admin')?><div><strong>Administrace</strong><span>Uživatelé, aktivace účtů a administrátorské nástroje.</span></div><b>→</b></a><?php endif;?>
<button class="settings-link-card settings-install-card" type="button" data-pwa-install><?=ir_visual_icon('dashboard')?><div><strong>Nainstalovat IR Manager</strong><span data-pwa-install-status>PWA režim, ikona na ploše a základní offline shell aplikace.</span></div><b>+</b></button>
</div></section>
<?php ir_page_end();
