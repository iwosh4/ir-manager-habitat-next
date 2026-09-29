<?php
declare(strict_types=1);

/*
 * TAXONOMY — Latin-first. The scientific name is the identity; Czech / English / trade names, synonyms,
 * localities and morphs are secondary aliases. A taxon without a Czech name is perfectly valid, and new
 * taxa can always be created manually (offline-capable: no external service is required).
 * Sources: the account's own catalogue (wp_ir2_druhy + wp_ir2_taxon_aliases) and the bundled reference
 * list assets/data/taxa.json (used for suggestions; a reference taxon is copied into the catalogue on use).
 */

function ir_taxa_reference(): array {
    static $ref = null;
    if ($ref === null) { $raw = @file_get_contents(IR_ROOT.'/assets/data/taxa.json'); $ref = json_decode((string)$raw, true) ?: []; }
    return $ref;
}
function ir_tax_norm(string $s): string {
    $s = mb_strtolower(trim($s), 'UTF-8');
    $s = strtr($s, ['á' => 'a', 'č' => 'c', 'ď' => 'd', 'é' => 'e', 'ě' => 'e', 'í' => 'i', 'ň' => 'n', 'ó' => 'o', 'ř' => 'r', 'š' => 's', 'ť' => 't', 'ú' => 'u', 'ů' => 'u', 'ý' => 'y', 'ž' => 'z', 'ä' => 'a', 'ö' => 'o', 'ü' => 'u', 'ß' => 'ss']);
    return preg_replace('~\s+~', ' ', $s) ?? $s;
}
/** Score: exact Latin > Latin prefix > Latin word prefix > alias prefix > contains. */
function ir_tax_score(string $q, string $latin, array $aliases): int {
    $qn = ir_tax_norm($q); $ln = ir_tax_norm($latin);
    if ($qn === '') return 0;
    if ($ln === $qn) return 1000;
    if (str_starts_with($ln, $qn)) return 900 - strlen($ln);
    foreach (explode(' ', $ln) as $w) if (str_starts_with($w, $qn)) return 700 - strlen($ln);
    foreach ($aliases as $a) { $an = ir_tax_norm((string)$a); if ($an === '') continue; if ($an === $qn) return 650; if (str_starts_with($an, $qn)) return 600 - strlen($an); foreach (explode(' ', $an) as $w) if (str_starts_with($w, $qn)) return 500; }
    if (str_contains($ln, $qn)) return 300;
    foreach ($aliases as $a) if (str_contains(ir_tax_norm((string)$a), $qn)) return 200;
    return 0;
}

/**
 * Autocomplete. Returns rows: {source: catalog|reference, id?, latin, czech, english, aliases[], group, subspecies, form}.
 */
function ir_taxon_search(PDO $pdo, int $uid, string $q, int $limit = 12): array {
    $q = trim($q);
    if (mb_strlen($q, 'UTF-8') < 2) return [];
    $out = []; $seenLatin = [];
    $aliases = [];
    if (ir_table_exists($pdo, 'wp_ir2_taxon_aliases')) {
        $a = $pdo->prepare('SELECT druh_id, alias, typ FROM wp_ir2_taxon_aliases WHERE user_id=?'); $a->execute([$uid]);
        foreach ($a->fetchAll() ?: [] as $r) $aliases[(int)$r['druh_id']][] = (string)$r['alias'];
    }
    $st = $pdo->prepare('SELECT id,latinsky_nazev,cesky_nazev,anglicky_nazev,poddruh,forma,lokalita,celed,kategorie_chovu FROM wp_ir2_druhy WHERE user_id=? AND (merged_into_id IS NULL OR merged_into_id=0)');
    $st->execute([$uid]);
    foreach ($st->fetchAll() ?: [] as $r) {
        $al = array_values(array_filter(array_merge([(string)$r['cesky_nazev'], (string)$r['anglicky_nazev'], (string)$r['forma'], (string)$r['poddruh']], $aliases[(int)$r['id']] ?? [])));
        $s = ir_tax_score($q, (string)$r['latinsky_nazev'], $al);
        if ($s <= 0) continue;
        $out[] = ['score' => $s + 50, 'source' => 'catalog', 'id' => (int)$r['id'], 'latin' => (string)$r['latinsky_nazev'], 'czech' => (string)($r['cesky_nazev'] ?? ''), 'english' => (string)($r['anglicky_nazev'] ?? ''), 'subspecies' => (string)($r['poddruh'] ?? ''), 'form' => (string)($r['forma'] ?? ''), 'aliases' => $aliases[(int)$r['id']] ?? [], 'group' => (string)($r['kategorie_chovu'] ?? '')];
        $seenLatin[ir_tax_norm((string)$r['latinsky_nazev'])] = true;
    }
    foreach (ir_taxa_reference() as $t) {
        if (isset($seenLatin[ir_tax_norm($t['l'])])) continue;
        $s = ir_tax_score($q, $t['l'], [$t['cs'] ?? '', $t['en'] ?? '']);
        if ($s <= 0) continue;
        $out[] = ['score' => $s, 'source' => 'reference', 'id' => null, 'latin' => $t['l'], 'czech' => (string)($t['cs'] ?? ''), 'english' => (string)($t['en'] ?? ''), 'subspecies' => '', 'form' => '', 'aliases' => [], 'group' => (string)($t['g'] ?? '')];
    }
    usort($out, static fn($a, $b) => $b['score'] <=> $a['score'] ?: strcmp($a['latin'], $b['latin']));
    return array_slice($out, 0, max(1, min(50, $limit)));
}

/** Validates a scientific name: Genus species [subspecies] — capitalised genus, lowercase epithets, optional quotes/cf./aff./sp. */
function ir_taxon_latin_valid(string $latin): bool {
    return (bool)preg_match('~^[A-Z][a-z]+(?:\s(?:cf\.|aff\.|sp\.|spp\.|x)?\s?[a-z\-]+){0,3}(?:\s[“"\'][^"”\']+[”"\'])?$~u', trim($latin));
}

/**
 * Create (or reuse) a catalogue taxon. $d = [latin*, czech, english, subspecies, form, locality, family, group,
 * synonyms[] / aliases[] / localities[] / morphs[]]. Czech name optional. Returns druh id.
 */
function ir_taxon_create(PDO $pdo, int $uid, array $d): int {
    $latin = preg_replace('~\s+~u', ' ', trim((string)($d['latin'] ?? ''))) ?? '';
    if ($latin === '') throw new RuntimeException('Vědecký (latinský) název je povinný.');
    // normalise capitalisation: Genus epithet [subspecies] (quoted trade names / locality keep their case)
    if (preg_match('~^([^"“\']+)(.*)$~u', $latin, $mm)) {
        $w = explode(' ', trim($mm[1]));
        foreach ($w as $k => $x) $w[$k] = $k === 0 ? mb_strtoupper(mb_substr($x, 0, 1)).mb_strtolower(mb_substr($x, 1)) : mb_strtolower($x);
        $latin = trim(implode(' ', $w).' '.trim($mm[2]));
    }
    if (!ir_taxon_latin_valid($latin)) throw new RuntimeException('Vědecký název zadejte ve tvaru „Rod druh [poddruh]“, např. Python regius.');
    $q = $pdo->prepare('SELECT id FROM wp_ir2_druhy WHERE user_id=? AND LOWER(latinsky_nazev)=LOWER(?) AND (merged_into_id IS NULL OR merged_into_id=0) LIMIT 1');
    $q->execute([$uid, $latin]);
    $id = (int)$q->fetchColumn();
    if (!$id) {
        $ref = null;
        foreach (ir_taxa_reference() as $t) if (ir_tax_norm($t['l']) === ir_tax_norm($latin)) { $ref = $t; break; }
        $parts = explode(' ', $latin);
        $pdo->prepare('INSERT INTO wp_ir2_druhy(user_id,latinsky_nazev,cesky_nazev,anglicky_nazev,rod,druh,poddruh,forma,lokalita,celed,kategorie_chovu) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$uid, $latin, trim((string)($d['czech'] ?? '')) ?: ($ref['cs'] ?? null) ?: null, trim((string)($d['english'] ?? '')) ?: ($ref['en'] ?? null) ?: null,
                $parts[0] ?? null, $parts[1] ?? null, trim((string)($d['subspecies'] ?? '')) ?: ($parts[2] ?? null), trim((string)($d['form'] ?? '')) ?: null, trim((string)($d['locality'] ?? '')) ?: null, trim((string)($d['family'] ?? '')) ?: null, trim((string)($d['group'] ?? '')) ?: (string)($ref['g'] ?? 'Nezařazeno')]);
        $id = (int)$pdo->lastInsertId();
        ir_audit($pdo, 'taxon', $id, 'create', null, ['latin' => $latin, 'source' => $ref ? 'reference' : 'manual']);
    }
    if (ir_table_exists($pdo, 'wp_ir2_taxon_aliases')) {
        foreach (['synonyms' => 'synonym', 'aliases' => 'common', 'localities' => 'locality', 'morphs' => 'morph'] as $key => $typ) {
            foreach ((array)($d[$key] ?? []) as $alias) {
                $alias = trim((string)$alias); if ($alias === '') continue;
                $x = $pdo->prepare('SELECT 1 FROM wp_ir2_taxon_aliases WHERE user_id=? AND druh_id=? AND alias=? LIMIT 1'); $x->execute([$uid, $id, $alias]);
                if (!$x->fetchColumn()) $pdo->prepare('INSERT INTO wp_ir2_taxon_aliases(user_id,druh_id,alias,typ) VALUES(?,?,?,?)')->execute([$uid, $id, mb_substr($alias, 0, 190), $typ]);
            }
        }
    }
    return $id;
}

/** Voice / search vocabulary: Latin names (+ genus), aliases and animal names of the account. */
function ir_taxon_vocabulary(PDO $pdo, int $uid): array {
    $v = [];
    $st = $pdo->prepare('SELECT latinsky_nazev,cesky_nazev,anglicky_nazev FROM wp_ir2_druhy WHERE user_id=?'); $st->execute([$uid]);
    foreach ($st->fetchAll() ?: [] as $r) foreach ($r as $x) if (trim((string)$x) !== '') $v[] = trim((string)$x);
    return array_values(array_unique($v));
}
