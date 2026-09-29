import { parentDistribution, crossLocus, crossLinkedPair, calculate, probabilitiesSumTo1 } from './genetics-engine.mjs';

let pass = 0, fail = 0;
function approx(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }
function check(name, cond, detail = '') {
    if (cond) { pass++; console.log(`  OK   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
}
function section(title) { console.log(`\n=== ${title} ===`); }

function locus(name, mode, fatherState, motherState, extra = {}) {
    return { id: name, name, mode, system: 'autosomal', father: { state: fatherState }, mother: { state: motherState }, ...extra };
}
function rowsFor(name, mode, fatherState, motherState, extra = {}) {
    const r = crossLocus(locus(name, mode, fatherState, motherState, extra));
    return r.perSex[0].rows;
}
function pctOf(rows, pred) { return rows.filter(pred).reduce((s, r) => s + r.p, 0); }

/* ---------------- RECESSIVE ---------------- */
section('RECESSIVE');
{
    const rows = rowsFor('Albino', 'recessive', { kind: 'het' }, { kind: 'het' });
    check('het x het -> 25% AA(count2) / 50% Aa(count1) / 25% aa(count0)',
        approx(pctOf(rows, r => r.count === 2), 0.25) && approx(pctOf(rows, r => r.count === 1), 0.5) && approx(pctOf(rows, r => r.count === 0), 0.25),
        JSON.stringify(rows.map(r => [r.count, r.p])));
    check('het x het -> visual (count=copies=2) is exactly 25%', approx(pctOf(rows, r => r.visual), 0.25));
    check('het x het -> non-visual is 75%', approx(pctOf(rows, r => !r.visual), 0.75));
    check('probabilities sum to 1', probabilitiesSumTo1(rows));
}
{
    const rows = rowsFor('Albino', 'recessive', { kind: 'normal' }, { kind: 'visual' }); // visual x normal
    check('visual x normal -> 100% het (count=1)', approx(pctOf(rows, r => r.count === 1), 1) && rows.length === 1);
}
{
    const rows = rowsFor('Albino', 'recessive', { kind: 'het' }, { kind: 'visual' }); // visual x het
    check('visual x het -> 50% visual / 50% het', approx(pctOf(rows, r => r.count === 2), 0.5) && approx(pctOf(rows, r => r.count === 1), 0.5));
}
{
    const rows = rowsFor('Albino', 'recessive', { kind: 'normal' }, { kind: 'normal' });
    check('normal x normal -> 100% normal (count=0)', approx(pctOf(rows, r => r.count === 0), 1));
}
{
    const rows = rowsFor('Albino', 'recessive', { kind: 'visual' }, { kind: 'visual' });
    check('visual x visual -> 100% visual', approx(pctOf(rows, r => r.count === 2), 1));
}

/* ---------------- DOMINANT ---------------- */
section('DOMINANT');
{
    const rows = rowsFor('Pied', 'dominant', { kind: 'normal' }, { kind: 'het' }); // het dominant x normal
    check('het dominant x normal -> 50% dominant phenotype (count>=1) / 50% normal',
        approx(pctOf(rows, r => r.count >= 1), 0.5) && approx(pctOf(rows, r => r.count === 0), 0.5));
}
{
    const rows = rowsFor('Pied', 'dominant', { kind: 'het' }, { kind: 'het' });
    check('het x het dominant -> 25% homo(2) / 50% het(1) / 25% normal(0)',
        approx(pctOf(rows, r => r.count === 2), 0.25) && approx(pctOf(rows, r => r.count === 1), 0.5) && approx(pctOf(rows, r => r.count === 0), 0.25));
}
{
    const rows = rowsFor('Pied', 'dominant', { kind: 'normal' }, { kind: 'homozygous' }); // homozygous dominant x normal
    check('homozygous dominant x normal -> 100% het (count=1), 0% normal', approx(pctOf(rows, r => r.count === 1), 1) && approx(pctOf(rows, r => r.count === 0), 0));
}

/* ---------------- CODOMINANT / INCOMPLETE (user-named) ---------------- */
section('CODOMINANT / INCOMPLETE DOMINANCE');
{
    const rows = rowsFor('Pastel', 'codominant', { kind: 'het' }, { kind: 'het' }, { names: { p0: 'Normal', p1: 'Pastel', p2: 'Super Pastel' } });
    check('het x het codominant -> 25/50/25 with custom names',
        approx(pctOf(rows, r => r.phenotype === 'Super Pastel'), 0.25) &&
        approx(pctOf(rows, r => r.phenotype === 'Pastel'), 0.5) &&
        approx(pctOf(rows, r => r.phenotype === 'Normal'), 0.25));
}
{
    const rows = rowsFor('Pastel', 'incomplete', { kind: 'normal' }, { kind: 'homozygous' }, { names: { p0: 'Normal', p1: 'Pastel', p2: 'Super Pastel' } });
    check('super x normal (incomplete) -> 100% heterozygous phenotype', approx(pctOf(rows, r => r.phenotype === 'Pastel'), 1));
}

/* ---------------- POSSIBLE HET (probability of genotype, not transmission) ---------------- */
section('POSSIBLE HET');
{
    // 50% het (father, possible) x visual (mother)
    const rows = rowsFor('Anery', 'recessive', { kind: 'possibleHet', pct: 50 }, { kind: 'visual' });
    // If father truly het (p=.5): Aa x aa -> 50% visual, 50% het.  If father truly normal (p=.5): AA x aa -> 100% het.
    // Combined: visual = .5*.5=.25 ; het = .5*.5 + .5*1 = .75
    check('50% possible het x visual -> 25% visual, 75% het (probability-weighted genotype mix)',
        approx(pctOf(rows, r => r.count === 2), 0.25) && approx(pctOf(rows, r => r.count === 1), 0.75),
        JSON.stringify(rows.map(r => [r.count, r.p])));
}
{
    const rows = rowsFor('Hypo', 'recessive', { kind: 'possibleHet', pct: 66 }, { kind: 'het' });
    // father: 66% carrier (dose=1), 34% clean (dose=0) - "possible het" remainder is "not a carrier
    // at all", NOT "homozygous". Mother: 100% het (dose=1).
    // Branch 1 (father dose1, p=.66): Aa x Aa -> .25 dose0, .5 dose1, .25 dose2
    // Branch 2 (father dose0, p=.34): AA(clean) x Aa -> .5 dose0, .5 dose1, 0 dose2
    const expDose0 = 0.66 * 0.25 + 0.34 * 0.5;
    const expDose1 = 0.66 * 0.5 + 0.34 * 0.5;
    const expDose2 = 0.66 * 0.25 + 0.34 * 0;
    check('66% het x het -> matches manual weighted-average computation',
        approx(pctOf(rows, r => r.count === 0), expDose0, 1e-9) &&
        approx(pctOf(rows, r => r.count === 1), expDose1, 1e-9) &&
        approx(pctOf(rows, r => r.count === 2), expDose2, 1e-9),
        JSON.stringify(rows.map(r => [r.count, r.p])) + ` vs expected dose0=${expDose0} dose1=${expDose1} dose2=${expDose2}`);
}
{
    const rows = rowsFor('Stripe', 'recessive', { kind: 'possibleHet', pct: 25 }, { kind: 'possibleHet', pct: 50 });
    check('25% het x 50% het -> probabilities sum to 1', probabilitiesSumTo1(rows));
    check('25% het x 50% het -> no impossible outcome eliminated (all 3 classes present)', rows.length === 3);
}

/* ---------------- UNKNOWN EXCLUSION (never silently guessed) ---------------- */
section('UNKNOWN STATE');
{
    const r = crossLocus(locus('Mystery', 'recessive', { kind: 'unknown' }, { kind: 'het' }));
    check('unknown parent genotype excludes the locus from calculation', r.excluded === true && r.perSex.length === 0);
    check('unknown parent genotype produces a warning, not a silent guess', r.warnings.length > 0);
}

/* ---------------- SEX-LINKED (XY) ---------------- */
section('SEX-LINKED (XY)');
{
    // Father hemizygous visual (has the X-linked recessive allele), mother normal.
    const r = crossLocus({ id: 'xl', name: 'XL', mode: 'sexlinked', system: 'XY', father: { state: { kind: 'visual' } }, mother: { state: { kind: 'normal' } } });
    const daughters = r.perSex.find(s => s.sex === 'female').rows;
    const sons = r.perSex.find(s => s.sex === 'male').rows;
    check('XY: visual father x normal mother -> ALL daughters carriers (count=1 of 2)', approx(pctOf(daughters, x => x.count === 1), 1));
    check('XY: visual father x normal mother -> ALL sons normal (father cannot give sons his X)', approx(pctOf(sons, x => x.count === 0), 1));
}

/* ---------------- LINKAGE SELF-CONSISTENCY ---------------- */
section('LINKAGE SELF-CONSISTENCY');
{
    const locusA = locus('Motley', 'recessive', { kind: 'het' }, { kind: 'het' });
    const locusB = locus('Stripe', 'recessive', { kind: 'het' }, { kind: 'het' });
    const linkedUnknown = crossLinkedPair({ locusA, locusB, recombinationRate: 10, phase: 'unknown' });
    // Independent-assortment reference: cross-product of the two single-locus results.
    const a = crossLocus(locusA).perSex[0].rows, b = crossLocus(locusB).perSex[0].rows;
    const indepMap = new Map();
    for (const ra of a) for (const rb of b) {
        const k = `${ra.count}/${rb.count}`;
        indepMap.set(k, (indepMap.get(k) || 0) + ra.p * rb.p);
    }
    const linkedMap = new Map();
    for (const row of linkedUnknown.rows) linkedMap.set(`${row.genes[0].count}/${row.genes[1].count}`, row.p);
    let allMatch = true;
    for (const [k, p] of indepMap) { if (!approx(p, linkedMap.get(k) || 0, 1e-9)) allMatch = false; }
    check('phase=unknown gives IDENTICAL result to independent assortment (any recombination rate)', allMatch);

    const linkedRate50 = crossLinkedPair({ locusA, locusB, recombinationRate: 50, phase: 'cis' });
    const linkedMap50 = new Map();
    for (const row of linkedRate50.rows) linkedMap50.set(`${row.genes[0].count}/${row.genes[1].count}`, row.p);
    let allMatch50 = true;
    for (const [k, p] of indepMap) { if (!approx(p, linkedMap50.get(k) || 0, 1e-9)) allMatch50 = false; }
    check('recombinationRate=50% gives IDENTICAL result to independent assortment (any phase)', allMatch50);

    const linkedCis0 = crossLinkedPair({ locusA, locusB, recombinationRate: 0, phase: 'cis' });
    const totalCis0 = linkedCis0.rows.reduce((s, r) => s + r.p, 0);
    check('fully linked (0% recombination, cis) still sums to 100%', approx(totalCis0, 1));
    const mismatched = linkedCis0.rows.filter(r => r.genes[0].count !== r.genes[1].count).reduce((s, r) => s + r.p, 0);
    const doubleHomo = linkedCis0.rows.filter(r => r.genes[0].count === 2 && r.genes[1].count === 2).reduce((s, r) => s + r.p, 0);
    const doubleHet = linkedCis0.rows.filter(r => r.genes[0].count === 1 && r.genes[1].count === 1).reduce((s, r) => s + r.p, 0);
    const doubleNormal = linkedCis0.rows.filter(r => r.genes[0].count === 0 && r.genes[1].count === 0).reduce((s, r) => s + r.p, 0);
    check('fully linked cis, 0% recombination -> ONLY matched classes appear (25% double-homo / 50% double-het / 25% double-normal), 0% recombinant mix',
        approx(mismatched, 0) && approx(doubleHomo, 0.25) && approx(doubleHet, 0.5) && approx(doubleNormal, 0.25),
        `mismatched=${mismatched} doubleHomo=${doubleHomo} doubleHet=${doubleHet} doubleNormal=${doubleNormal}`);
}

/* ---------------- MULTI-LOCUS ---------------- */
section('MULTI-LOCUS COMBINATION');
for (const n of [2, 3, 5]) {
    const loci = [];
    for (let i = 0; i < n; i++) loci.push(locus(`Gene${i}`, 'recessive', { kind: 'het' }, { kind: 'het' }));
    const result = calculate({ loci });
    const total = result.rows.reduce((s, r) => s + r.p, 0);
    check(`${n} independent het x het loci -> probabilities sum to 100% (rows=${result.rows.length}, expected ${Math.pow(3, n)})`,
        approx(total, 1, 1e-6) && result.rows.length === Math.pow(3, n));
}
{
    // A more realistic mixed multi-locus case from the spec's own example.
    const loci = [
        locus('Snow-Amel', 'recessive', { kind: 'normal' }, { kind: 'visual' }),
        locus('Snow-Anery', 'recessive', { kind: 'normal' }, { kind: 'visual' }),
        locus('Hypo', 'recessive', { kind: 'normal' }, { kind: 'possibleHet', pct: 50 }),
    ];
    const result = calculate({ loci });
    const total = result.rows.reduce((s, r) => s + r.p, 0);
    check('mixed 3-locus example sums to 100%', approx(total, 1, 1e-6));
    check('mixed 3-locus example flags uncertainty (contains a possible-het input)', result.uncertain === true);
}

/* ---------------- PARENT ORDER SYMMETRY (autosomal) ---------------- */
section('PARENT ORDER SYMMETRY');
{
    const a = rowsFor('Anery', 'recessive', { kind: 'possibleHet', pct: 66 }, { kind: 'het' });
    const b = rowsFor('Anery', 'recessive', { kind: 'het' }, { kind: 'possibleHet', pct: 66 }); // swapped
    const norm = rows => rows.map(r => [r.count, Number(r.p.toFixed(9))]).sort((x, y) => x[0] - y[0]);
    check('autosomal locus: swapping mother/father inputs gives the same result', JSON.stringify(norm(a)) === JSON.stringify(norm(b)), JSON.stringify(norm(a)) + ' vs ' + JSON.stringify(norm(b)));
}

/* ---------------- TWO SEX-LINKED LOCI: consistent sex per branch (regression) ---------------- */
section('TWO SEX-LINKED LOCI CONSISTENCY');
{
    const lx1 = { id: 'lx1', name: 'XL1', mode: 'sexlinked', system: 'XY', father: { state: { kind: 'visual' } }, mother: { state: { kind: 'normal' } } };
    const lx2 = { id: 'lx2', name: 'XL2', mode: 'sexlinked', system: 'XY', father: { state: { kind: 'normal' } }, mother: { state: { kind: 'het' } } };
    const out = calculate({ loci: [lx1, lx2] });
    const total = out.rows.reduce((s, r) => s + r.p, 0);
    check('two X-linked loci together still sum to 100%', approx(total, 1, 1e-9), `total=${total}`);
    // Sanity content check: every row's two genes must be jointly consistent with ONE sex -
    // e.g. XL1 full-copy (count=2, only possible in a female/2-copy branch) must never appear
    // paired with an XL2 outcome that could only arise in the male (1-copy) branch, and vice
    // versa. We check this indirectly: copies for both genes in a row must match (both 1 or both 2),
    // since both loci share the same XY system and therefore the same offspring sex determines
    // both loci's copy number simultaneously.
    const consistent = out.rows.every(r => r.genes[0].copies === r.genes[1].copies);
    check('every combined row has matching copy-count (=consistent single sex) across both X-linked loci', consistent,
        JSON.stringify(out.rows.map(r => r.genes.map(g => [g.name, g.count, g.copies]))));
}

/* ---------------- SUMMARY ---------------- */
console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
