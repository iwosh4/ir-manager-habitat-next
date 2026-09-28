// GENETICS — Python regius morph calculator (recessive, incomplete-dominant, dominant; possible-het weighting),
// breeding projects and saved pairings. Parents can be picked from the collection so nothing is re-typed.
import { esc, actions, uid } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { avatar, empty } from '../ui/components.js';
import { done } from '../ui/feedback.js';
import { dShort } from '../core/time.js';

export const GENES = {
  Clown: { t: 'rec' }, Piebald: { t: 'rec' }, Albino: { t: 'rec' }, Axanthic: { t: 'rec' },
  Pastel: { t: 'inc', sup: 'Super Pastel' }, Mojave: { t: 'inc', sup: 'Blue-eyed Leucistic' }, Enchi: { t: 'inc', sup: 'Super Enchi' }, 'Yellow Belly': { t: 'inc', sup: 'Ivory' },
  Spider: { t: 'dom' },
};
const OPTS = { rec: ['het', 'visual', 'poss-het 66%', 'poss-het 50%'], inc: ['single', 'super'], dom: ['visual'] };
const S = { a: { name: 'PR-01 Clownfish', id: 'a_pr01', g: { Clown: 'visual' } }, b: { name: 'PR-02 Tessa', id: 'a_pr02', g: { Pastel: 'single', Clown: 'het' } } };

// ---- maths: per-gene parent genotype distribution → offspring class distribution
const parentDist = (gene, st) => {
  const t = GENES[gene].t;
  if (!st) return [[0, 1]]; // number of mutant alleles, weight
  if (t === 'rec') { if (st === 'het') return [[1, 1]]; if (st === 'visual') return [[2, 1]]; const p = st.includes('66') ? 2 / 3 : 0.5; return [[1, p], [0, 1 - p]]; }
  if (t === 'inc') return [[st === 'super' ? 2 : 1, 1]];
  return [[1, 1]]; // dominant, assume heterozygous
};
function geneOutcome(gene, sa, sb) {
  const res = [0, 0, 0]; // offspring with 0/1/2 mutant alleles
  for (const [ma, wa] of parentDist(gene, sa)) for (const [mb, wb] of parentDist(gene, sb)) {
    const ga = ma / 2, gb = mb / 2; // probability each parent passes a mutant allele
    res[2] += wa * wb * ga * gb; res[1] += wa * wb * (ga * (1 - gb) + gb * (1 - ga)); res[0] += wa * wb * (1 - ga) * (1 - gb);
  }
  const t = GENES[gene].t;
  if (t === 'rec') { const vis = res[2], non = res[0] + res[1], h = non ? res[1] / non : 0; const hl = h > 0.999 ? `het ${gene}` : h < 0.001 ? '' : `${Math.round(h * 100)}% poss het ${gene}`; return [[vis, gene, ''], [non, '', hl]].filter((x) => x[0] > 1e-9); }
  if (t === 'inc') return [[res[0], '', ''], [res[1], gene, ''], [res[2], GENES[gene].sup, '']].filter((x) => x[0] > 1e-9);
  return [[res[0], '', ''], [res[1] + res[2], gene, '']].filter((x) => x[0] > 1e-9);
}
export function calc(ga, gb) {
  const genes = [...new Set([...Object.keys(ga), ...Object.keys(gb)])].filter((g) => ga[g] || gb[g]).sort((x, y) => (GENES[x].t === 'rec') - (GENES[y].t === 'rec'));
  let out = [{ p: 1, vis: [], het: [] }];
  for (const g of genes) { const next = []; for (const o of out) for (const [p, v, h] of geneOutcome(g, ga[g], gb[g])) next.push({ p: o.p * p, vis: v ? [...o.vis, v] : o.vis, het: h ? [...o.het, h] : o.het }); out = next; }
  const m = new Map();
  for (const o of out) { const label = `${o.vis.join(' ') || 'Normal'}${o.het.length ? ` ${o.het.join(', ')}` : ''}`; m.set(label, (m.get(label) || 0) + o.p); }
  return [...m.entries()].map(([label, p]) => ({ label, p })).sort((a, b) => b.p - a.p);
}
const fromAnimal = (a) => { const g = {}; for (const x of a.genetics || []) { const T = GENES[x.gene]?.t; if (!T) continue; g[x.gene] = T === 'inc' ? (x.zyg === 'super' ? 'super' : 'single') : T === 'dom' ? 'visual' : x.zyg; } return g; };

export function context(r) {
  const db = store.get();
  return { counts: { projects: db.genetics.length, saved: db.geneticsSaved.length }, sub: '<i class="latin">Python regius</i> morph calculator · projects', actions: r.sub === 'calculator' || !r.sub ? [{ label: 'Save pairing', icon: 'pin', act: 'gn-save', primary: true }] : [] };
}
export function render(r) {
  const sub = r.sub || 'calculator', db = store.get();
  if (sub === 'projects') return `<div class="cy-list">${db.genetics.map((p) => `<section class="card"><div class="card-b gp"><div class="row"><b>${esc(p.name)}</b><span class="spacer"></span><i class="latin small">Python regius</i></div><p class="muted">${esc(p.goal)}</p>${p.pairs.map((x) => { const m = db.animals.find((a) => a.id === x.m), f = db.animals.find((a) => a.id === x.f); const res = calc(fromAnimal(m), fromAnimal(f)); return `<div class="gp-pair">${avatar(m, 40)}<span>×</span>${avatar(f, 40)}<div class="li-main"><b>${esc(m.code)} × ${esc(f.code)}</b><span>${esc(x.note)}</span></div><button class="btn sm" data-act="gn-load" data-m="${m.id}" data-f="${f.id}">${icon('calculator')}Open</button></div><div class="res-mini">${res.slice(0, 4).map((o) => `<span><b>${fmtP(o.p)}</b> ${esc(o.label)}</span>`).join('')}</div>`; }).join('')}<p class="small">${esc(p.notes)}</p></div></section>`).join('')}</div>`;
  if (sub === 'saved') return db.geneticsSaved.length ? `<div class="list card"><div class="card-b">${db.geneticsSaved.slice().reverse().map((s) => `<div class="li"><span class="li-main"><b>${esc(s.a.name)} × ${esc(s.b.name)}</b><span>${dShort(s.t)} · ${calc(Object.fromEntries(s.a.genes.map(([g, z]) => [g, GENES[g]?.t === 'inc' && z === 'het' ? 'single' : z])), Object.fromEntries(s.b.genes.map(([g, z]) => [g, GENES[g]?.t === 'inc' && z === 'het' ? 'single' : z]))).slice(0, 3).map((o) => `${fmtP(o.p)} ${esc(o.label)}`).join(' · ')}</span></span><button class="btn sm" data-act="gn-open" data-id="${s.id}">${icon('calculator')}Open</button></div>`).join('')}</div></div>` : empty('No saved pairings', 'Use “Save pairing” in the calculator.', 'genetics');
  return calculator(db);
}
const fmtP = (p) => { const pc = p * 100; return `${pc < 1 ? pc.toFixed(2) : +pc.toFixed(1)} %`; };
function parentHTML(db, side) {
  const P = S[side], pool = db.animals.filter((a) => a.species === 'python-regius' && a.status !== 'deceased' && a.sex === (side === 'a' ? 'm' : 'f'));
  return `<section class="card gpar"><header class="card-h"><span class="card-ico">${icon(side === 'a' ? 'male' : 'female')}</span><h3>${side === 'a' ? 'Sire' : 'Dam'}</h3><span class="card-a"><select class="sm-sel" data-change="gn-pick" data-side="${side}" aria-label="Pick from collection"><option value="">From collection…</option>${pool.map((a) => `<option value="${a.id}" ${P.id === a.id ? 'selected' : ''}>${esc(a.code)} ${esc(a.name || '')} · ${esc(a.morph)}</option>`).join('')}<option value="__custom">Custom (not owned)</option></select></span></header><div class="card-b">
    <div class="gsel">${Object.keys(P.g).filter((g) => P.g[g]).map((g) => `<span class="gchip t-${GENES[g].t}"><b>${esc(g)}</b><select data-change="gn-set" data-side="${side}" data-g="${g}">${OPTS[GENES[g].t].map((o) => `<option ${P.g[g] === o ? 'selected' : ''}>${o}</option>`).join('')}</select><button data-act="gn-rm" data-side="${side}" data-g="${g}" aria-label="Remove ${g}">${icon('x')}</button></span>`).join('') || '<span class="muted">Normal (no genes)</span>'}</div>
    <div class="gadd">${Object.keys(GENES).filter((g) => !P.g[g]).map((g) => `<button class="chip sm" data-act="gn-add" data-side="${side}" data-g="${g}">+ ${esc(g)}</button>`).join('')}</div></div></section>`;
}
function calculator(db) {
  const res = calc(S.a.g, S.b.g);
  return `<div class="gcalc">${parentHTML(db, 'a')}<div class="gx">×</div>${parentHTML(db, 'b')}</div>
    <section class="card gres"><header class="card-h"><span class="card-ico">${icon('genetics')}</span><h3>Expected offspring</h3><span class="card-sub">${res.length} outcomes · per egg probability · clutch of 6 ≈</span></header><div class="card-b">
      ${res.map((o) => `<div class="gr"><span class="gr-bar"><i style="width:${o.p * 100}%"></i></span><b class="gr-p">${fmtP(o.p)}</b><span class="gr-l">${esc(o.label)}</span><span class="gr-n">${(o.p * 6).toFixed(1)} / 6</span></div>`).join('')}
      <p class="muted small">${icon('info')} Recessive (Clown, Piebald, Albino, Axanthic), incomplete-dominant (Pastel, Mojave, Enchi, Yellow Belly — super forms), dominant (Spider). Possible-het parents are weighted (66 % / 50 %). Probabilities are per egg; real clutches vary.</p></div></section>`;
}
actions({
  'gn-add': (el) => { const g = el.dataset.g; S[el.dataset.side].g[g] = OPTS[GENES[g].t][0]; S[el.dataset.side].id = null; store.emit('change'); },
  'gn-rm': (el) => { delete S[el.dataset.side].g[el.dataset.g]; S[el.dataset.side].id = null; store.emit('change'); },
  'gn-set': (el) => { S[el.dataset.side].g[el.dataset.g] = el.value; store.emit('change'); },
  'gn-pick': (el) => { const side = el.dataset.side; if (el.value === '__custom') { S[side] = { name: 'Custom', id: null, g: {} }; } else if (el.value) { const a = store.get().animals.find((x) => x.id === el.value); S[side] = { name: `${a.code} ${a.name || ''}`.trim(), id: a.id, g: fromAnimal(a) }; } store.emit('change'); },
  'gn-load': (el) => { const db = store.get(), m = db.animals.find((a) => a.id === el.dataset.m), f = db.animals.find((a) => a.id === el.dataset.f); S.a = { name: m.code, id: m.id, g: fromAnimal(m) }; S.b = { name: f.code, id: f.id, g: fromAnimal(f) }; location.hash = '#/genetics/calculator'; },
  'gn-open': (el) => { const s = store.get().geneticsSaved.find((x) => x.id === el.dataset.id); const conv = (p) => ({ name: p.name, id: null, g: Object.fromEntries(p.genes.map(([g, z]) => [g, GENES[g]?.t === 'inc' && z === 'het' ? 'single' : z])) }); S.a = conv(s.a); S.b = conv(s.b); location.hash = '#/genetics/calculator'; },
  'gn-save': () => { store.mutate('Saved pairing', (d) => d.geneticsSaved.push({ id: uid('gs'), t: Date.now(), a: { name: S.a.name, genes: Object.entries(S.a.g) }, b: { name: S.b.name, genes: Object.entries(S.b.g) } })); done({ label: 'Pairing saved' }); },
});
