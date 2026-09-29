/* ==========================================================================
 * IR Manager — Universal Breeding Genetics Engine
 * Single source of truth for ALL genetic probability math in the app.
 * genetics-ui.mjs (and any future caller) MUST import from here and MUST
 * NOT re-implement any part of this math locally.
 *
 * Model summary
 * -------------
 * - Every locus is autosomal (2 copies) unless a sex system is set, in which
 *   case one sex is hemizygous (1 copy) for that locus: XY -> males
 *   hemizygous, ZW -> females hemizygous.
 * - A parent's knowledge about a locus is expressed as a PROBABILITY
 *   DISTRIBUTION over how many mutant alleles ("dose") they actually carry
 *   (0, 1, or 2 - or 0/1 if hemizygous), never as a single "transmission
 *   chance" scalar. "50% het" means: 50% chance the true dose is 1, 50%
 *   chance it is 0 - NOT a 50% chance of passing the allele. This module
 *   marginalises correctly over that uncertainty (see parentDistribution()).
 * - Gametes are derived from a dose distribution via standard Mendelian
 *   segregation (dose 0 -> always wild-type gamete, dose 2 -> always mutant
 *   gamete, dose 1 -> 50/50), marginalised over the caller's dose
 *   distribution. This is exact: P(gamete=mutant) = sum_d P(dose=d) * d/copies.
 * - Independent loci are combined by an exact cross product of their
 *   per-locus offspring distributions (independent assortment).
 * - Optionally exactly two loci may be declared "linked" with a
 *   recombination rate and a parental phase (cis/trans/unknown). This is
 *   modelled as a joint two-locus haplotype gamete distribution per parent,
 *   only where that parent is heterozygous at BOTH loci simultaneously -
 *   everywhere else linkage has no observable effect and the loci reduce to
 *   independent segregation. Chains of 3+ linked loci are intentionally
 *   NOT supported (documented limitation) - keeping the math exactly
 *   correct for the common two-locus case was prioritised over an
 *   approximate multi-point model.
 * - Nothing here invents species biology, allele frequencies, or
 *   recombination rates. Every number comes from the caller (the user).
 * ========================================================================== */

'use strict';

/* ---------------------------------------------------------------------- */
/* 1. Parent genotype -> probability distribution over allele dose        */
/* ---------------------------------------------------------------------- */

/**
 * @param {object} state
 *   {kind:'normal'|'visual'|'het'|'possibleHet'|'homozygous'|'uncertainZygosity'|'custom'|'unknown',
 *    pct?:number,               // 0-100, required for 'possibleHet' and 'uncertainZygosity'
 *    custom?:{p0:number,p1:number,p2:number}} // required for 'custom', percentages summing to 100
 * @param {number} copies  1 (hemizygous) or 2 (diploid)
 * @returns {{excluded:boolean, dist:Array<{count:number,p:number}>, uncertain:boolean}}
 */
export function parentDistribution(state, copies) {
    if (copies !== 1 && copies !== 2) throw new Error('copies musí být 1 (hemizygot) nebo 2 (diploid).');
    const kind = state && state.kind;
    const clampPct = v => Math.max(0, Math.min(100, Number(v)));

    if (kind === 'unknown') {
        // Honest handling: we do not invent an allele frequency / prior, so an
        // "unknown" parent genotype is excluded from the quantitative result
        // rather than silently guessed as "normal".
        return { excluded: true, dist: [], uncertain: true };
    }
    if (kind === 'normal') {
        return { excluded: false, dist: [{ count: 0, p: 1 }], uncertain: false };
    }
    if (kind === 'visual' || kind === 'homozygous') {
        return { excluded: false, dist: [{ count: copies, p: 1 }], uncertain: false };
    }
    if (kind === 'het') {
        if (copies !== 2) throw new Error('Heterozygotní stav dává smysl jen u dvou kopií (diploidní / netýká se hemizygotní strany sex-linked lokusu).');
        return { excluded: false, dist: [{ count: 1, p: 1 }], uncertain: false };
    }
    if (kind === 'possibleHet') {
        // "X % het" = X % chance the true dose is 1 (carrier), otherwise dose 0.
        // This is the literal, non-transmission reading required by spec.
        const p = clampPct(state.pct) / 100;
        if (copies === 1) {
            // Hemizygous "possible carrier" - dose is 0 or 1 directly.
            return { excluded: false, dist: [{ count: 1, p }, { count: 0, p: 1 - p }].filter(x => x.p > 0), uncertain: p > 0 && p < 1 };
        }
        return { excluded: false, dist: [{ count: 1, p }, { count: 0, p: 1 - p }].filter(x => x.p > 0), uncertain: p > 0 && p < 1 };
    }
    if (kind === 'uncertainZygosity') {
        // Visible/expressing animal whose exact zygosity is not confirmed:
        // X % chance fully homozygous (or hemizygous mutant), otherwise heterozygous.
        if (copies !== 2) throw new Error('Nejistá zygozita (het/homozygot) dává smysl jen u dvou kopií.');
        const p = clampPct(state.pct) / 100;
        return { excluded: false, dist: [{ count: 2, p }, { count: 1, p: 1 - p }].filter(x => x.p > 0), uncertain: p > 0 && p < 1 };
    }
    if (kind === 'custom') {
        const c = state.custom || {};
        const p0 = clampPct(c.p0 ?? 0) / 100, p1 = clampPct(c.p1 ?? 0) / 100, p2 = clampPct(c.p2 ?? 0) / 100;
        const sum = p0 + p1 + p2;
        if (Math.abs(sum - 1) > 0.01) throw new Error('Vlastní procenta genotypu musí dát dohromady 100 %.');
        const norm = v => v / sum; // absorb tiny rounding so downstream sums are exact
        const dist = copies === 1
            ? [{ count: 0, p: norm(p0) }, { count: 1, p: norm(p1 + p2) }].filter(x => x.p > 0)
            : [{ count: 0, p: norm(p0) }, { count: 1, p: norm(p1) }, { count: 2, p: norm(p2) }].filter(x => x.p > 0);
        return { excluded: false, dist, uncertain: dist.length > 1 };
    }
    throw new Error(`Neznámý stav genotypu: ${kind}`);
}

/** Dose distribution -> gamete allele distribution (exact marginalisation). */
function gametesFromDose(dist, copies) {
    if (copies === 1) {
        // Hemizygous individual transmits exactly what they have - no meiotic 50/50 for this locus.
        return dist.map(d => ({ a: d.count ? 1 : 0, p: d.p }));
    }
    const pMutant = dist.reduce((s, d) => s + d.p * (d.count / 2), 0);
    const out = [];
    if (pMutant > 0) out.push({ a: 1, p: pMutant });
    if (pMutant < 1) out.push({ a: 0, p: 1 - pMutant });
    return out;
}

/* ---------------------------------------------------------------------- */
/* 2. Phenotype naming                                                     */
/* ---------------------------------------------------------------------- */

const DEFAULT_NAMES = {
    recessive: { p0: 'Normal', p1: 'Het. nositel', p2: 'Visual' },
    dominant: { p0: 'Normal', p1: 'Dominantní forma', p2: 'Dominantní forma (homozygot)' },
    codominant: { p0: 'Normal', p1: 'Heterozygotní forma', p2: 'Homozygotní / super forma' },
    incomplete: { p0: 'Normal', p1: 'Heterozygotní forma', p2: 'Homozygotní forma' },
    sexlinked: { p0: 'Normal', p1: 'Het. nositelka', p2: 'Visual' },
    custom: { p0: 'Stav A', p1: 'Stav B', p2: 'Stav C' },
};

function resolveNames(locus) {
    const base = DEFAULT_NAMES[locus.mode] || DEFAULT_NAMES.custom;
    const n = locus.names || {};
    return {
        p0: (n.p0 && n.p0.trim()) || base.p0,
        p1: (n.p1 && n.p1.trim()) || base.p1,
        p2: (n.p2 && n.p2.trim()) || base.p2,
    };
}

function phenotypeFor(locus, count, copies, names) {
    if (copies === 1) return count ? names.p2 : names.p0; // hemizygous: only "absent" or "full" exist
    if (count === 0) return names.p0;
    if (count === 1) return names.p1;
    return names.p2;
}

function isCarrierFor(locus, count, copies) {
    return copies === 2 && count === 1 && (locus.mode === 'recessive' || locus.mode === 'sexlinked');
}
function isVisualFor(locus, count, copies) {
    if (count === 0) return false;
    if (locus.mode === 'recessive' || locus.mode === 'sexlinked') return count === copies;
    return true; // dominant / codominant / incomplete / custom: any non-zero dose expresses something
}

/* ---------------------------------------------------------------------- */
/* 3. Single-locus cross                                                   */
/* ---------------------------------------------------------------------- */

/**
 * @param {object} locus  {id,name,mode,system:'autosomal'|'XY'|'ZW',
 *                          father:{state}, mother:{state}, names:{p0,p1,p2}}
 * @returns {{excluded:boolean, warnings:string[], perSex:Array<{sex,rows:Array}>, explain:object}}
 */
export function crossLocus(locus) {
    const system = locus.system || 'autosomal';
    if (!['autosomal', 'XY', 'ZW'].includes(system)) throw new Error('Neznámý chromozomový systém (povoleno: autosomal, XY, ZW).');
    const maleHemi = system === 'XY', femaleHemi = system === 'ZW';
    const warnings = [];

    const fatherCopies = maleHemi ? 1 : 2;
    const motherCopies = femaleHemi ? 1 : 2;
    const fatherD = parentDistribution(locus.father.state, fatherCopies);
    const motherD = parentDistribution(locus.mother.state, motherCopies);

    if (fatherD.excluded || motherD.excluded) {
        warnings.push(`Lokus "${locus.name}": genotyp jednoho z rodičů je neznámý (Unknown) - lokus byl vynechán z výpočtu.`);
        return { excluded: true, warnings, perSex: [], explain: { locus, fatherD, motherD } };
    }
    if (fatherD.uncertain || motherD.uncertain) warnings.push(`Lokus "${locus.name}" obsahuje nejistý genotyp - výsledek je pravděpodobnostní, ne jistý.`);

    const names = resolveNames(locus);
    const sexes = system === 'autosomal' ? ['unspecified'] : ['male', 'female'];
    const perSex = sexes.map(sex => {
        const paternalGametes = (system === 'XY' && sex === 'male') ? [{ a: null, p: 1 }] : gametesFromDose(fatherD.dist, fatherCopies);
        const maternalGametes = (system === 'ZW' && sex === 'female') ? [{ a: null, p: 1 }] : gametesFromDose(motherD.dist, motherCopies);
        const buckets = new Map();
        for (const pat of paternalGametes) for (const mat of maternalGametes) {
            const count = (pat.a || 0) + (mat.a || 0);
            const copies = (pat.a === null ? 0 : 1) + (mat.a === null ? 0 : 1);
            const key = `${count}/${copies}`;
            buckets.set(key, (buckets.get(key) || 0) + pat.p * mat.p);
        }
        const rows = [...buckets].map(([key, p]) => {
            const [count, copies] = key.split('/').map(Number);
            return {
                p, count, copies, sex,
                phenotype: phenotypeFor(locus, count, copies, names),
                carrier: isCarrierFor(locus, count, copies),
                visual: isVisualFor(locus, count, copies),
                genotypeLabel: genotypeLabel(locus, count, copies, system, sex),
            };
        });
        return { sex, rows };
    });

    return {
        excluded: false, warnings, perSex,
        explain: {
            locus, names,
            father: { input: locus.father.state, dist: fatherD.dist, copies: fatherCopies },
            mother: { input: locus.mother.state, dist: motherD.dist, copies: motherCopies },
        },
    };
}

function genotypeLabel(locus, count, copies, system, sex) {
    const wt = locus.alleleWild || '+', mt = locus.alleleName || locus.name.slice(0, 3).toLowerCase();
    const letters = [...Array(count).fill(mt), ...Array(copies - count).fill(wt)].sort().join('/');
    if (system === 'autosomal') return letters || `${wt}/${wt}`;
    const chromo = system === 'XY' ? (sex === 'male' ? 'Y' : letters.split('/')[1] || wt) : (sex === 'female' ? 'W' : letters.split('/')[1] || wt);
    if (copies === 1) return `${letters}/${system === 'XY' ? 'Y' : 'W'}`;
    return letters;
}

/* ---------------------------------------------------------------------- */
/* 4. Linking exactly two loci (optional, advanced)                        */
/* ---------------------------------------------------------------------- */

/**
 * Computes the joint offspring distribution for two linked autosomal loci.
 * Only supports two loci per link group by design (see file header).
 * @param {object} pair {locusA, locusB, recombinationRate:0-50, phase:'cis'|'trans'|'unknown'}
 */
export function crossLinkedPair(pair) {
    const { locusA, locusB } = pair;
    const rate = Math.max(0, Math.min(50, Number(pair.recombinationRate ?? 0))) / 100;
    const phase = pair.phase || 'unknown';
    if ((locusA.system && locusA.system !== 'autosomal') || (locusB.system && locusB.system !== 'autosomal')) {
        throw new Error('Vazba genů je podporována jen pro autosomální lokusy.');
    }
    const warnings = [];
    const namesA = resolveNames(locusA), namesB = resolveNames(locusB);

    function parentHaplotypeGametes(distA, distB) {
        // Enumerate the parent's possible TRUE genotype at both loci (independent per-locus
        // uncertainty), then for each combination compute haplotype gametes - using the
        // cis/trans linkage formula only where the parent is truly double-heterozygous.
        const out = new Map(); // key "a|b" -> probability
        for (const da of distA.dist) for (const db of distB.dist) {
            const jointP = da.p * db.p;
            if (jointP <= 0) continue;
            if (da.count === 1 && db.count === 1) {
                const combos = phase === 'cis'
                    ? [['1', '1', (1 - rate) / 2], ['0', '0', (1 - rate) / 2], ['1', '0', rate / 2], ['0', '1', rate / 2]]
                    : phase === 'trans'
                        ? [['1', '0', (1 - rate) / 2], ['0', '1', (1 - rate) / 2], ['1', '1', rate / 2], ['0', '0', rate / 2]]
                        : [['1', '1', 0.25], ['0', '0', 0.25], ['1', '0', 0.25], ['0', '1', 0.25]]; // phase unknown -> symmetric, rate has no observable effect (see file header)
                for (const [a, b, p] of combos) { const k = `${a}|${b}`; out.set(k, (out.get(k) || 0) + jointP * p); }
            } else {
                // Not double-heterozygous in this branch: each locus segregates independently.
                const gA = da.count === 2 ? [{ a: '1', p: 1 }] : da.count === 0 ? [{ a: '0', p: 1 }] : [{ a: '1', p: 0.5 }, { a: '0', p: 0.5 }];
                const gB = db.count === 2 ? [{ a: '1', p: 1 }] : db.count === 0 ? [{ a: '0', p: 1 }] : [{ a: '1', p: 0.5 }, { a: '0', p: 0.5 }];
                for (const ga of gA) for (const gb of gB) { const k = `${ga.a}|${gb.a}`; out.set(k, (out.get(k) || 0) + jointP * ga.p * gb.p); }
            }
        }
        return [...out].map(([k, p]) => { const [a, b] = k.split('|'); return { a: Number(a), b: Number(b), p }; });
    }

    const fatherD_A = parentDistribution(locusA.father.state, 2), fatherD_B = parentDistribution(locusB.father.state, 2);
    const motherD_A = parentDistribution(locusA.mother.state, 2), motherD_B = parentDistribution(locusB.mother.state, 2);
    if (fatherD_A.excluded || fatherD_B.excluded || motherD_A.excluded || motherD_B.excluded) {
        warnings.push(`Vazba "${locusA.name} + ${locusB.name}": genotyp jednoho z rodičů je neznámý - pár byl vynechán z výpočtu.`);
        return { excluded: true, warnings, rows: [] };
    }
    if ([fatherD_A, fatherD_B, motherD_A, motherD_B].some(d => d.uncertain)) warnings.push(`Vazba "${locusA.name} + ${locusB.name}" obsahuje nejistý genotyp rodiče - výsledek je pravděpodobnostní.`);
    if (phase === 'unknown') warnings.push(`Vazba "${locusA.name} + ${locusB.name}": fáze (cis/trans) nebyla zadána, takže míra rekombinace nemá na tento výpočet pozorovatelný vliv (viz vysvětlení výpočtu).`);

    const fatherGametes = parentHaplotypeGametes(fatherD_A, fatherD_B);
    const motherGametes = parentHaplotypeGametes(motherD_A, motherD_B);
    const buckets = new Map();
    for (const fg of fatherGametes) for (const mg of motherGametes) {
        const countA = fg.a + mg.a, countB = fg.b + mg.b, key = `${countA}/${countB}`;
        buckets.set(key, (buckets.get(key) || 0) + fg.p * mg.p);
    }
    const rows = [...buckets].map(([key, p]) => {
        const [countA, countB] = key.split('/').map(Number);
        return {
            p,
            genes: [
                { name: locusA.name, count: countA, copies: 2, phenotype: phenotypeFor(locusA, countA, 2, namesA), carrier: isCarrierFor(locusA, countA, 2), visual: isVisualFor(locusA, countA, 2), genotypeLabel: genotypeLabel(locusA, countA, 2, 'autosomal') },
                { name: locusB.name, count: countB, copies: 2, phenotype: phenotypeFor(locusB, countB, 2, namesB), carrier: isCarrierFor(locusB, countB, 2), visual: isVisualFor(locusB, countB, 2), genotypeLabel: genotypeLabel(locusB, countB, 2, 'autosomal') },
            ],
        };
    });
    return { excluded: false, warnings, rows };
}

/* ---------------------------------------------------------------------- */
/* 5. Multi-locus combination                                              */
/* ---------------------------------------------------------------------- */

const MAX_ROWS = 200000; // generous safety ceiling against runaway combinatorics, not an arbitrary "gene count" limit

/**
 * @param {object} input {loci:[...], linkedPairs:[{locusIdA,locusIdB,recombinationRate,phase}]}
 * @returns {{rows:Array<{p, genes:Array}>, warnings:string[], perLocusExplain:Array, excludedLoci:string[]}}
 */
export function calculate(input) {
    const loci = input.loci || [];
    if (!loci.length) throw new Error('Zadej alespoň jeden gen.');
    const names = loci.map(l => (l.name || '').trim());
    if (names.some(n => !n)) throw new Error('Každý gen potřebuje název.');
    const dupCheck = new Set(names.map(n => n.toLocaleLowerCase()));
    if (dupCheck.size !== names.length) throw new Error('Každý gen potřebuje jedinečný název (v rámci jednoho výpočtu).');

    const linkedPairs = input.linkedPairs || [];
    const linkedIds = new Set();
    for (const lp of linkedPairs) {
        if (linkedIds.has(lp.locusIdA) || linkedIds.has(lp.locusIdB)) throw new Error('Jeden lokus může být součástí jen jedné vazby (podporovány jsou pouze dvojice, ne řetězce 3+ genů).');
        linkedIds.add(lp.locusIdA); linkedIds.add(lp.locusIdB);
    }

    const warnings = [];
    const excludedLoci = [];
    const perLocusExplain = [];

    // Every sex-linked locus in the same cross must share ONE consistent offspring sex -
    // it is wrong to combine e.g. locus A's "male" branch with locus B's "female" branch,
    // since a given offspring has exactly one sex. So sex is resolved ONCE per outer branch,
    // and every locus contributes only its branch matching that same sex.
    const hasSexLinked = loci.some(l => l.system && l.system !== 'autosomal');
    const sexBranches = hasSexLinked ? ['male', 'female'] : ['unspecified'];

    // Pre-compute each non-linked locus once (both sex branches, if any) and record explain data once.
    const locusResults = new Map();
    for (const locus of loci) {
        if (linkedIds.has(locus.id)) continue;
        const result = crossLocus(locus);
        warnings.push(...result.warnings);
        perLocusExplain.push({ name: locus.name, ...result.explain, perSex: result.perSex });
        if (result.excluded) excludedLoci.push(locus.name);
        locusResults.set(locus.id, result);
    }

    // Pre-compute each linked pair once (autosomal-only, so it does not depend on offspring sex).
    const linkedResults = [];
    for (const lp of linkedPairs) {
        const locusA = loci.find(l => l.id === lp.locusIdA), locusB = loci.find(l => l.id === lp.locusIdB);
        if (!locusA || !locusB) throw new Error('Vazba odkazuje na neexistující gen.');
        const result = crossLinkedPair({ locusA, locusB, recombinationRate: lp.recombinationRate, phase: lp.phase });
        warnings.push(...result.warnings);
        perLocusExplain.push({ name: `${locusA.name} + ${locusB.name} (vazba)`, linked: true, recombinationRate: lp.recombinationRate, phase: lp.phase, rows: result.rows });
        if (result.excluded) excludedLoci.push(`${locusA.name} + ${locusB.name}`);
        linkedResults.push(result);
    }

    let combined = [];
    for (const sex of sexBranches) {
        const sexP = sexBranches.length > 1 ? 0.5 : 1;
        let branchRows = [{ p: 1, genes: [] }];
        let anyIncluded = false;
        for (const locus of loci) {
            if (linkedIds.has(locus.id)) continue;
            const result = locusResults.get(locus.id);
            if (result.excluded) continue;
            const sexGroup = result.perSex.find(s => s.sex === sex) || result.perSex.find(s => s.sex === 'unspecified');
            if (!sexGroup) continue;
            anyIncluded = true;
            const next = [];
            for (const c of branchRows) for (const r of sexGroup.rows) next.push({ p: c.p * r.p, genes: [...c.genes, { name: locus.name, ...r }] });
            branchRows = next;
            if (branchRows.length > MAX_ROWS) throw new Error(`Výpočet překročil bezpečný limit ${MAX_ROWS.toLocaleString('cs-CZ')} kombinací. Zkus snížit počet nejistých (possible het) lokusů nebo rozděl výpočet na víc kroků.`);
        }
        for (const result of linkedResults) {
            if (result.excluded) continue;
            anyIncluded = true;
            const next = [];
            for (const c of branchRows) for (const r of result.rows) next.push({ p: c.p * r.p, genes: [...c.genes, ...r.genes] });
            branchRows = next;
            if (branchRows.length > MAX_ROWS) throw new Error(`Výpočet překročil bezpečný limit ${MAX_ROWS.toLocaleString('cs-CZ')} kombinací. Zkus snížit počet nejistých (possible het) lokusů nebo rozděl výpočet na víc kroků.`);
        }
        if (anyIncluded) combined.push(...branchRows.map(r => ({ p: r.p * sexP, genes: r.genes })));
    }

    // Merge rows with identical resulting genotype signature.
    const merged = new Map();
    for (const row of combined) {
        const key = row.genes.map(g => `${g.name}:${g.count}/${g.copies}`).join('|');
        if (!merged.has(key)) merged.set(key, { p: 0, genes: row.genes });
        merged.get(key).p += row.p;
    }
    const finalRows = [...merged.values()].sort((a, b) => b.p - a.p);

    const totalP = finalRows.reduce((s, r) => s + r.p, 0);
    if (Math.abs(totalP - 1) > 1e-6 && finalRows.length) warnings.push(`Součet pravděpodobností je ${(totalP * 100).toFixed(4)} % (očekáváno 100 %) - zkontroluj vstupy.`);

    return { rows: finalRows, warnings, perLocusExplain, excludedLoci, uncertain: warnings.some(w => w.includes('nejist')) };
}

/* ---------------------------------------------------------------------- */
/* 6. Lightweight self-check (used by the automated test file)             */
/* ---------------------------------------------------------------------- */

export function probabilitiesSumTo1(rows, tolerance = 1e-6) {
    const total = rows.reduce((s, r) => s + r.p, 0);
    return Math.abs(total - 1) <= tolerance;
}
