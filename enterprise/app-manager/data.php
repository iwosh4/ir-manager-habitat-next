<?php
declare(strict_types=1);
/* DATA SAFETY — export, integrity check, recycle bin (care records), archived animals and enclosures. */
require __DIR__.'/includes/config.php';
require __DIR__.'/includes/live.php';
require __DIR__.'/includes/shell.php';
require __DIR__.'/includes/reptile_core.php';
ir_require_perm('read');
$uid = ir_account_id();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    ir_verify_csrf();
    $a = (string)($_POST['action'] ?? '');
    try {
        if ($a === 'export_json' || $a === 'export_zip') {
            ir_require_perm('export'); ir_rate_limit('export', 5, 300);
            $stamp = date('Y-m-d-His');
            if ($a === 'export_json') {
                ir_audit($pdo, 'export', null, 'json');
                header('Content-Type: application/json; charset=utf-8');
                header('Content-Disposition: attachment; filename="ir-manager-export-'.$stamp.'.json"');
                header('X-Content-Type-Options: nosniff');
                echo json_encode(ir_export_account($pdo, $uid), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE);
                exit;
            }
            $tmp = tempnam(sys_get_temp_dir(), 'irx');
            $s = ir_export_zip($pdo, $uid, $tmp, true);
            ir_audit($pdo, 'export', null, 'zip', null, ['bytes' => $s['bytes'], 'media' => $s['media']]);
            header('Content-Type: application/zip');
            header('Content-Length: '.filesize($tmp));
            header('Content-Disposition: attachment; filename="ir-manager-export-'.$stamp.'.zip"');
            readfile($tmp); @unlink($tmp); exit;
        }
        if ($a === 'restore_event') { ir_require_perm('write'); ir_event_restore($pdo, $uid, (int)$_POST['bin']); ir_flash('success', 'Záznam byl obnoven do historie.'); }
        if ($a === 'restore_animal') { ir_require_perm('write'); ir_animal_restore($pdo, $uid, (int)$_POST['id']); ir_flash('success', 'Zvíře bylo obnoveno.'); }
        if ($a === 'restore_enclosure') { ir_require_perm('write'); ir_enclosure_restore($pdo, $uid, (int)$_POST['id']); ir_flash('success', 'Ubikace byla obnovena.'); }
    } catch (Throwable $e) { ir_flash('error', $e->getMessage()); }
    ir_redirect('data.php');
}
$report = ir_integrity_report($pdo, $uid);
$bin = $pdo->prepare('SELECT k.*, z.jmeno_kod FROM wp_ir2_pece_kos k LEFT JOIN wp_ir2_zvirata z ON z.id=k.zvire_id AND z.user_id=k.user_id WHERE k.user_id=? AND k.obnoveno IS NULL ORDER BY k.smazano DESC LIMIT 100'); $bin->execute([$uid]); $bin = $bin->fetchAll() ?: [];
$arch = $pdo->prepare('SELECT id, jmeno_kod, druh, status_chovu, archivovano FROM wp_ir2_zvirata WHERE user_id=? AND archivovano IS NOT NULL ORDER BY archivovano DESC LIMIT 200'); $arch->execute([$uid]); $arch = $arch->fetchAll() ?: [];
$archE = $pdo->prepare('SELECT id, nazev, typ, archivovano FROM wp_ir2_ubikace WHERE user_id=? AND archivovano IS NOT NULL ORDER BY archivovano DESC LIMIT 200'); $archE->execute([$uid]); $archE = $archE->fetchAll() ?: [];
$sev = ['ok' => ['is-ok', 'V pořádku'], 'warn' => ['', 'Upozornění'], 'error' => ['is-off', 'Vyžaduje pozornost']];

ir_page_start('Bezpečnost dat', 'settings');
echo ir_back('settings.php', 'Zpět do nastavení');
?>
<section class="panel glow-panel">
  <header class="panel-head"><div><span class="panel-kicker">DATA JSOU VAŠE</span><h2>Export celého účtu</h2><p class="muted">Databáze je jediný zdroj pravdy. Export obsahuje všechny záznamy účtu; ZIP navíc fotografie a přílohy se SHA-256 kontrolními součty. Hesla se nikdy neexportují.</p></div></header>
  <form method="post" class="b1-inline" data-download><?=ir_csrf_field()?><button class="btn primary" name="action" value="export_zip">Stáhnout ZIP (data + soubory)</button><button class="btn" name="action" value="export_json">Stáhnout JSON (jen data)</button><a class="btn" href="backup.php">Záloha & obnova</a></form>
</section>
<section class="panel glow-panel">
  <header class="panel-head"><div><span class="panel-kicker">KONTROLA INTEGRITY</span><h2>Stav dat účtu</h2><p class="muted">Poslední záloha na serveru: <?=$report['last_backup'] ? date('j. n. Y H:i', strtotime($report['last_backup'])) : 'zatím žádná'?> · schéma <?=ir_e($report['schema_version'])?></p></div><span class="status-pill <?=$sev[$report['status']][0]?>"><?=$sev[$report['status']][1]?></span></header>
  <dl class="b1-kv"><?php foreach ($report['counts'] as $l => $n): ?><div><dt><?=ir_e($l)?></dt><dd><?=$n?></dd></div><?php endforeach ?><div><dt>V koši</dt><dd><?=$report['trash']?></dd></div><div><dt>Archivovaná zvířata</dt><dd><?=$report['archived_animals']?></dd></div></dl>
  <ul class="b1-checks"><?php foreach ($report['checks'] as $c): ?><li class="is-<?=$c['severity']?>"><span class="status-pill <?=$sev[$c['severity']][0]?>"><?=$c['severity'] === 'ok' ? '✓' : $c['count']?></span> <?=ir_e($c['label'])?><?=$c['sample'] ? ' <small class="muted">('.ir_e(implode(', ', array_map('strval', $c['sample']))).')</small>' : ''?></li><?php endforeach ?></ul>
</section>
<section class="panel glow-panel">
  <header class="panel-head"><div><span class="panel-kicker">KOŠ</span><h2>Smazané záznamy péče</h2><p class="muted">Smazaný záznam se jen přesune do koše a lze jej obnovit včetně původního data.</p></div></header>
  <div class="table-wrap"><table class="data-table b1-table"><thead><tr><th>Smazáno</th><th>Zvíře</th><th>Záznam</th><th></th></tr></thead><tbody>
  <?php foreach ($bin as $b): $r = json_decode((string)$b['row_json'], true) ?: []; ?>
    <tr><td><?=date('j. n. Y H:i', strtotime($b['smazano']))?></td><td><?=ir_e((string)$b['jmeno_kod'])?></td><td><?=ir_e(($r['typ'] ?? '').' · '.(isset($r['datum']) ? date('j. n. Y', strtotime($r['datum'])) : '').(!empty($r['hodnota']) ? ' · '.$r['hodnota'] : ''))?></td>
      <td><?php if (ir_can('write')): ?><form method="post"><?=ir_csrf_field()?><input type="hidden" name="action" value="restore_event"><input type="hidden" name="bin" value="<?=(int)$b['id']?>"><button class="btn small">Obnovit</button></form><?php endif ?></td></tr>
  <?php endforeach; if (!$bin): ?><tr><td colspan="4" class="muted">Koš je prázdný.</td></tr><?php endif ?>
  </tbody></table></div>
</section>
<section class="panel glow-panel">
  <header class="panel-head"><div><span class="panel-kicker">ARCHIV</span><h2>Archivovaná zvířata</h2></div></header>
  <div class="table-wrap"><table class="data-table b1-table"><thead><tr><th>Zvíře</th><th>Druh</th><th>Důvod</th><th>Archivováno</th><th></th></tr></thead><tbody>
  <?php foreach ($arch as $z): ?><tr><td><a href="animal.php?id=<?=(int)$z['id']?>"><?=ir_e($z['jmeno_kod'])?></a></td><td><?=ir_e((string)$z['druh'])?></td><td><?=ir_e((string)$z['status_chovu'])?></td><td><?=date('j. n. Y', strtotime($z['archivovano']))?></td><td><?php if (ir_can('write')): ?><form method="post"><?=ir_csrf_field()?><input type="hidden" name="action" value="restore_animal"><input type="hidden" name="id" value="<?=(int)$z['id']?>"><button class="btn small">Obnovit</button></form><?php endif ?></td></tr><?php endforeach; if (!$arch): ?><tr><td colspan="5" class="muted">Žádná archivovaná zvířata.</td></tr><?php endif ?>
  </tbody></table></div>
  <?php if ($archE): ?><h3 class="b1-subhead">Archivované ubikace</h3><ul class="b1-list"><?php foreach ($archE as $e): ?><li><b><?=ir_e($e['nazev'])?></b> · <?=ir_e((string)$e['typ'])?> · <?=date('j. n. Y', strtotime($e['archivovano']))?> <?php if (ir_can('write')): ?><form method="post" class="b1-inline-mini"><?=ir_csrf_field()?><input type="hidden" name="action" value="restore_enclosure"><input type="hidden" name="id" value="<?=(int)$e['id']?>"><button class="btn small">Obnovit</button></form><?php endif ?></li><?php endforeach ?></ul><?php endif ?>
</section>
<?php ir_page_end();
