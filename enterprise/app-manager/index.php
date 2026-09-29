<?php
declare(strict_types=1);
require __DIR__.'/includes/config.php';
require __DIR__.'/includes/live.php';
require __DIR__.'/includes/shell.php';
require __DIR__.'/includes/reptile_core.php';
require_once __DIR__.'/includes/events_catalog.php';

/*
 * Dashboard 063 je záměrně vykreslen přes includes/workspace.php (approved design lock).
 * Tím zůstává výchozí obrazovka kompaktní, přizpůsobitelná a bez
 * duplicitních bloků pod hlavním přehledem. Veškerá data zůstávají živá.
 */
ir_page_start('Přehled','dashboard');
ir_page_end();
