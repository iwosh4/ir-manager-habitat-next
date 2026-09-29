<?php
declare(strict_types=1);

/*
 * FINANCE — multi-line documents (purchase / sale / expense). Header in wp_ir2_finance (castka = sum of
 * lines, so every existing report keeps working); lines in wp_ir2_finance_lines. A sale of an animal can
 * mark the animal sold (archived with status "Prodáno", history kept). Deleting is soft (smazano).
 */
function ir_finance_line_totals(array $l): array {
    $qty = max(0, (float)str_replace(',', '.', (string)($l['qty'] ?? 1)));
    $price = max(0, (float)str_replace(',', '.', (string)($l['unit_price'] ?? 0)));
    $disc = min(100, max(0, (float)str_replace(',', '.', (string)($l['discount_pct'] ?? 0))));
    $vat = min(100, max(0, (float)str_replace(',', '.', (string)($l['vat_pct'] ?? 0))));
    $sub = round($qty * $price * (1 - $disc / 100), 2);
    return ['qty' => $qty, 'unit_price' => $price, 'discount_pct' => $disc ?: null, 'vat_pct' => $vat ?: null, 'subtotal' => $sub, 'total' => round($sub * (1 + $vat / 100), 2)];
}
/**
 * Save a document. $h = [typ, kategorie, datum, zvire_id, popis, doklad, sold(bool)]; $lines = [[item, qty, unit, unit_price, discount_pct, vat_pct], …]
 * Returns the finance id.
 */
function ir_finance_save(PDO $pdo, int $uid, array $h, array $lines, int $id = 0): int {
    $typ = in_array($h['typ'] ?? '', ['Příjem', 'Výdaj'], true) ? (string)$h['typ'] : throw new RuntimeException('Neplatný typ dokladu.');
    $date = (string)($h['datum'] ?? '') ?: date('Y-m-d');
    if (!preg_match('~^\d{4}-\d{2}-\d{2}$~', $date)) throw new RuntimeException('Neplatné datum.');
    $aid = (int)($h['zvire_id'] ?? 0) ?: null;
    if ($aid && !ir_animal($pdo, $uid, $aid)) throw new RuntimeException('Zvíře nebylo nalezeno.');
    $clean = [];
    foreach ($lines as $l) { $item = trim((string)($l['item'] ?? '')); if ($item === '' && (float)str_replace(',', '.', (string)($l['unit_price'] ?? 0)) == 0.0) continue; $clean[] = ['item' => mb_substr($item !== '' ? $item : 'Položka', 0, 190), 'unit' => mb_substr(trim((string)($l['unit'] ?? '')), 0, 20) ?: null] + ir_finance_line_totals($l); }
    if (!$clean) throw new RuntimeException('Doklad musí mít alespoň jednu položku s cenou.');
    $sum = round(array_sum(array_column($clean, 'total')), 2);
    $own = !$pdo->inTransaction(); if ($own) $pdo->beginTransaction();
    try {
        $hasDoc = ir_db_column_exists($pdo, 'wp_ir2_finance', 'doklad');
        if ($id) {
            if (!(int)ir_scalar($pdo, 'SELECT COUNT(*) FROM wp_ir2_finance WHERE user_id=? AND id=?', [$uid, $id], 0)) throw new RuntimeException('Doklad nebyl nalezen.');
            $pdo->prepare('UPDATE wp_ir2_finance SET typ=?,kategorie=?,castka=?,datum=?,zvire_id=?,popis=?'.($hasDoc ? ',doklad=?' : '').',upraveno=NOW() WHERE user_id=? AND id=?')->execute(array_merge([$typ, trim((string)($h['kategorie'] ?? '')), $sum, $date, $aid, trim((string)($h['popis'] ?? ''))], $hasDoc ? [trim((string)($h['doklad'] ?? '')) ?: null] : [], [$uid, $id]));
            $pdo->prepare('DELETE FROM wp_ir2_finance_lines WHERE user_id=? AND finance_id=?')->execute([$uid, $id]);
        } else {
            $pdo->prepare('INSERT INTO wp_ir2_finance(user_id,typ,kategorie,castka,datum,zvire_id,popis'.($hasDoc ? ',doklad' : '').') VALUES(?,?,?,?,?,?,?'.($hasDoc ? ',?' : '').')')->execute(array_merge([$uid, $typ, trim((string)($h['kategorie'] ?? '')), $sum, $date, $aid, trim((string)($h['popis'] ?? ''))], $hasDoc ? [trim((string)($h['doklad'] ?? '')) ?: null] : []));
            $id = (int)$pdo->lastInsertId();
        }
        $ins = $pdo->prepare('INSERT INTO wp_ir2_finance_lines(user_id,finance_id,item,qty,unit,unit_price,discount_pct,vat_pct,subtotal,total,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
        foreach ($clean as $i => $l) $ins->execute([$uid, $id, $l['item'], $l['qty'], $l['unit'], $l['unit_price'], $l['discount_pct'], $l['vat_pct'], $l['subtotal'], $l['total'], $i]);
        if ($typ === 'Příjem' && $aid && !empty($h['sold'])) {
            $pdo->prepare('UPDATE wp_ir2_zvirata SET prodejni_cena=? WHERE user_id=? AND id=?')->execute([$sum, $uid, $aid]);
            ir_animal_archive($pdo, $uid, $aid, 'Prodáno');
        }
        ir_audit($pdo, 'finance', $id, 'save', null, ['typ' => $typ, 'sum' => $sum, 'lines' => count($clean)]);
        if ($own) $pdo->commit();
        return $id;
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}
function ir_finance_lines(PDO $pdo, int $uid, int $id): array {
    $q = $pdo->prepare('SELECT * FROM wp_ir2_finance_lines WHERE user_id=? AND finance_id=? ORDER BY sort_order,id'); $q->execute([$uid, $id]);
    return $q->fetchAll() ?: [];
}
function ir_finance_delete(PDO $pdo, int $uid, int $id): void {
    $pdo->prepare('UPDATE wp_ir2_finance SET smazano=NOW() WHERE user_id=? AND id=?')->execute([$uid, $id]);
    ir_audit($pdo, 'finance', $id, 'delete');
}
