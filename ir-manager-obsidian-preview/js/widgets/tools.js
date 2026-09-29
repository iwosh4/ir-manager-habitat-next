// NÁSTROJE (multitool) — praktické pracovní nástroje. Každý nástroj se vykreslí do kořenového prvku a sám
// obsluhuje své události, takže stejný nástroj funguje jako widget na Přehledu, v modulu i na stránce Nástroje.
import { esc } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { toast } from '../core/overlay.js';
import { SPECIES, latin } from '../data/species.js';
import { ws, saveWs, doc, newDoc, docsOf } from './wsstore.js';
import { DAY, startOfDay, dShort, dLong, toDateInput, daysBetween, hm, plural } from '../core/time.js';

export const TOOLS = {
  calculator: { name: 'Kalkulačka', icon: 'calculator', glossy: 'finance', desc: 'Rychlá kalkulačka s historií a kontextovými klávesami (DPH, marže).' },
  converter: { name: 'Převodník jednotek', icon: 'ruler', glossy: 'repeat-action', desc: 'g ↔ oz, cm ↔ in, °C ↔ °F, litry ↔ galony.' },
  dates: { name: 'Datumová kalkulačka', icon: 'calendar', glossy: 'calendar-31', desc: 'Datum ± dny, počet dní mezi daty, den N snůšky.' },
  incubation: { name: 'Inkubační kalkulačka', icon: 'egg', glossy: 'reproduction', desc: 'Očekávané okno líhnutí z data snůšky a druhu — vždy jako rozmezí.' },
  volume: { name: 'Objem ubikace', icon: 'cube', glossy: 'habitat', desc: 'Š × H × V → litry a plocha dna; převezme rozměry existující ubikace.' },
  substrate: { name: 'Množství substrátu', icon: 'box', glossy: 'cleaning', desc: 'Plocha × výška vrstvy → litry substrátu a počet balení.' },
  price: { name: 'Cena × množství', icon: 'tag', glossy: 'finance', desc: 'Cena × množství s DPH a slevou; prodejní cena z nákladů a marže.' },
  energy: { name: 'Náklady na elektřinu', icon: 'bolt', glossy: 'lighting', desc: 'Měsíční provoz světel, topení a čerpadel podle příkonu a hodin.' },
  feedplan: { name: 'Spotřeba krmiva', icon: 'feeding', glossy: 'feeding', desc: 'Týdenní spotřeba krmiva z plánů péče vs. zásoba — objednat rozdíl.' },
  shopping: { name: 'Nákupní seznamy', icon: 'cart', glossy: 'inventory', desc: 'Více seznamů: množství, jednotka, cena, dodavatel, poznámka, pořadí.', doc: 'shopping' },
  notes: { name: 'Poznámky', icon: 'note', glossy: 'edit', desc: 'Automaticky ukládané poznámky, připnutí a archiv.', doc: 'notes' },
  checklist: { name: 'Checklisty', icon: 'check-circle', glossy: 'checklist', desc: 'Lehké osobní checklisty (burza, převoz, zavírání místnosti).', doc: 'checklist' },
  pricelist: { name: 'Expo ceník', icon: 'tag', glossy: 'qr-info', desc: 'Ceník ke zkopírování nebo tisku ze zvířat označených na prodej.' },
  links: { name: 'Rychlé odkazy', icon: 'link', glossy: 'view', desc: 'Vaše zkratky: oblíbená zvířata, aktivní snůška, dodavatel, Habitat Studio.', doc: 'links' },
};
const ST = new Map();
const st = (key, init) => { if (!ST.has(key)) ST.set(key, init()); return ST.get(key); };
const n2 = (v, d = 2) => (Number.isFinite(v) ? (+v.toFixed(d)).toLocaleString('cs-CZ', { maximumFractionDigits: d }) : '—');
const czk = (v) => `${Math.round(v).toLocaleString('cs-CZ').replace(/\s/g, ' ')} Kč`;

export function renderTool(root, kind, opts = {}) {
  const T = TOOLS[kind]; if (!T) return;
  if (T.doc && !opts.docId) opts.docId = docsOf(T.doc)[0]?.id || seedDoc(T.doc);
  root.dataset.toolKind = kind; root.dataset.toolKey = opts.key || kind; if (opts.docId) root.dataset.docId = opts.docId; root.dataset.ctx = opts.ctx || '';
  root.innerHTML = R[kind](opts);
  if (!root.dataset.bound) { root.dataset.bound = 1; for (const ev of ['click', 'input', 'change', 'keydown']) root.addEventListener(ev, onEvt); }
}
const rerenderRoot = (root) => renderTool(root, root.dataset.toolKind, { key: root.dataset.toolKey, docId: root.dataset.docId, ctx: root.dataset.ctx });
function onEvt(e) {
  const root = e.currentTarget, h = H[root.dataset.toolKind]; if (!h) return;
  const el = e.target.closest('[data-t]'); if (!el && e.type !== 'keydown') return;
  e.stopPropagation(); h(e, el, root);
}
function saving(root) { const s = root.querySelector('.tsave'); if (!s) return; s.classList.add('saving'); s.innerHTML = `${gl('sync')}Ukládám…`; clearTimeout(s._t); s._t = setTimeout(() => { s.classList.remove('saving'); s.innerHTML = `${gl('cloud-check')}Uloženo ${hm(Date.now())}`; }, 450); }
const saveTag = () => `<span class="tsave">${gl('cloud-check')}Uloženo</span>`;
const R = {}, H = {};

// ================================================================ NÁKUPNÍ SEZNAM
R.shopping = ({ docId }) => {
  const d = doc(docId); if (!d) return '<p class="muted">Seznam nenalezen.</p>';
  const db = store.get(), sup = db.contacts.filter((c) => ['supplier', 'breeder'].includes(c.kind));
  const items = d.items, open = items.filter((i) => !i.done), doneN = items.length - open.length;
  const total = open.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
  return `<div class="tool shop">
    <div class="shop-add"><input class="input" type="text" placeholder="Přidat položku… např. „Dubia 500 ks 1,6“" aria-label="Nová položka" data-t="add-in" autocomplete="off"><button class="btn primary sm" data-t="add" aria-label="Přidat">${gl('plus')}</button></div>
    <ul class="shop-l" role="list">${items.map((it, i) => `<li class="si ${it.done ? 'done' : ''} ${it.prio === 'h' ? 'hot' : ''}" data-i="${i}">
      <input type="checkbox" class="cb" data-t="done" ${it.done ? 'checked' : ''} aria-label="Koupeno">
      <span class="si-b"><input class="inl nm" value="${esc(it.name)}" data-t="name" aria-label="Položka">
        <span class="si-m"><input class="inl q" type="number" min="0" step="any" value="${it.qty ?? ''}" data-t="qty" aria-label="Množství"><input class="inl u" value="${esc(it.unit || '')}" data-t="unit" placeholder="jedn." aria-label="Jednotka"><span class="x">×</span><input class="inl p" type="number" min="0" step="any" value="${it.price || ''}" data-t="price" placeholder="cena" aria-label="Cena za jednotku"><em>Kč</em>
        <select class="inl s" data-t="supplier" aria-label="Dodavatel"><option value="">dodavatel…</option>${sup.map((c) => `<option value="${c.id}" ${it.supplier === c.id ? 'selected' : ''}>${esc(c.org || c.name)}</option>`).join('')}</select></span>
        <input class="inl nt" value="${esc(it.note || '')}" data-t="note" placeholder="poznámka" aria-label="Poznámka"></span>
      <span class="si-sum">${it.price ? czk(it.price * (it.qty || 1)) : ''}</span>
      <span class="si-mv"><button class="icon-btn sm" data-t="up" title="Posunout nahoru" aria-label="Posunout nahoru" ${i === 0 ? 'disabled' : ''}>${gl('chevron-up')}</button><button class="icon-btn sm" data-t="down" title="Posunout dolů" aria-label="Posunout dolů" ${i === items.length - 1 ? 'disabled' : ''}>${gl('chevron-down')}</button></span>
      <button class="icon-btn sm" data-t="del" title="Smazat" aria-label="Smazat položku">${gl('x')}</button></li>`).join('') || '<li class="empty-li muted">Prázdný seznam — přidejte položku nahoře, nebo sem pošlete nízký stav ze Skladu.</li>'}</ul>
    <div class="tfoot"><span>${open.length} ${plural(open.length, 'položka', 'položky', 'položek')} k nákupu${total ? ` · celkem <b>${czk(total)}</b>` : ''}</span><span class="spacer"></span>${doneN ? `<button class="btn sm tertiary" data-t="clear">${gl('trash')}Smazat hotové (${doneN})</button>` : ''}<button class="btn sm tertiary" data-t="copy">${gl('copy')}Kopírovat</button>${saveTag()}</div></div>`;
};
function parseItem(s) {
  const m = s.trim().match(/^(.*?)(?:\s+(\d+(?:[.,]\d+)?)\s*([a-zA-Zčšřžýáíéůú%]+)?)?(?:\s+(\d+(?:[.,]\d+)?)\s*(?:kč|czk)?)?$/i);
  const name = (m?.[1] || s).trim();
  return { id: Math.random().toString(36).slice(2, 8), name: name || s.trim(), qty: m?.[2] ? parseFloat(m[2].replace(',', '.')) : 1, unit: m?.[3] || 'ks', price: m?.[4] ? parseFloat(m[4].replace(',', '.')) : 0, supplier: '', note: '', prio: 'n', done: false };
}
H.shopping = (e, el, root) => {
  const d = doc(root.dataset.docId); if (!d) return;
  const i = +el?.closest('[data-i]')?.dataset.i, t = el?.dataset.t;
  const commit = (re = true) => { d.updated = Date.now(); saveWs(); if (re) rerenderRoot(root); else saving(root); };
  const add = () => { const inp = root.querySelector('[data-t=add-in]'); if (!inp.value.trim()) return; d.items.push(parseItem(inp.value)); commit(); root.querySelector('[data-t=add-in]')?.focus(); };
  if (e.type === 'keydown') { if (e.key === 'Enter' && e.target.dataset.t === 'add-in') { e.preventDefault(); add(); } return; }
  if (e.type === 'click') {
    if (t === 'add') add();
    if (t === 'del') { const [x] = d.items.splice(i, 1); commit(); toast(`Odebráno „${x.name}“`, { undo: () => { d.items.splice(i, 0, x); commit(); } }); }
    if (t === 'up' && i > 0) { [d.items[i - 1], d.items[i]] = [d.items[i], d.items[i - 1]]; commit(); }
    if (t === 'down' && i < d.items.length - 1) { [d.items[i + 1], d.items[i]] = [d.items[i], d.items[i + 1]]; commit(); }
    if (t === 'clear') { const prev = d.items.slice(); d.items = d.items.filter((x) => !x.done); commit(); toast('Hotové položky smazány', { undo: () => { d.items = prev; commit(); } }); }
    if (t === 'copy') { const txt = `${d.title}\n${d.items.filter((x) => !x.done).map((x) => `• ${x.name} — ${x.qty} ${x.unit}${x.price ? ` × ${n2(x.price)} Kč` : ''}`).join('\n')}`; navigator.clipboard?.writeText(txt).then(() => toast('Seznam zkopírován', { kind: 'info', ms: 2000 }), () => toast('Kopírování zde není dostupné', { kind: 'warn' })); }
    return;
  }
  if (e.type === 'change' && t === 'done') { d.items[i].done = el.checked; el.closest('.si')?.classList.toggle('done', el.checked); commit(false); setTimeout(() => rerenderRoot(root), 260); return; }
  if (['name', 'unit', 'note'].includes(t)) { d.items[i][t] = el.value; commit(false); }
  if (['qty', 'price'].includes(t)) { d.items[i][t] = parseFloat(el.value) || 0; commit(e.type === 'change'); }
  if (t === 'supplier' && e.type === 'change') { d.items[i].supplier = el.value; commit(false); }
};

// ================================================================ POZNÁMKY (autosave)
R.notes = ({ docId }) => {
  const d = doc(docId); if (!d) return '<p class="muted">Poznámka nenalezena.</p>';
  return `<div class="tool notes"><textarea class="note-ta" data-t="text" placeholder="Pište… ukládá se automaticky." aria-label="${esc(d.title)}">${esc(d.text || '')}</textarea>
    <div class="tfoot"><button class="icon-btn sm ${d.pinned ? 'on' : ''}" data-t="pin" title="${d.pinned ? 'Odepnout' : 'Připnout'}" aria-pressed="${!!d.pinned}">${gl('pin')}</button><button class="icon-btn sm" data-t="archive" title="Archivovat">${gl('archive')}</button><span class="muted small">${(d.text || '').trim() ? `${(d.text || '').trim().split(/\s+/).length} slov` : 'prázdné'}</span><span class="spacer"></span>${saveTag()}</div></div>`;
};
H.notes = (e, el, root) => {
  const d = doc(root.dataset.docId); if (!d) return; const t = el?.dataset.t;
  if (t === 'text' && e.type === 'input') { d.text = el.value; d.updated = Date.now(); saveWs(); saving(root); }
  if (t === 'pin' && e.type === 'click') { d.pinned = !d.pinned; saveWs(); rerenderRoot(root); }
  if (t === 'archive' && e.type === 'click') { d.archived = true; saveWs(); toast(`Poznámka „${d.title}“ archivována`, { undo: () => { d.archived = false; saveWs(); store.emit('change'); } }); store.emit('change'); }
};

// ================================================================ CHECKLIST
R.checklist = ({ docId }) => {
  const d = doc(docId); if (!d) return '<p class="muted">Checklist nenalezen.</p>';
  const n = d.items.filter((x) => x.done).length;
  return `<div class="tool chk"><div class="chk-prog"><i style="transform:scaleX(${d.items.length ? n / d.items.length : 0})"></i></div>
    <ul class="chk-l" role="list">${d.items.map((it, i) => `<li class="${it.done ? 'done' : ''}" data-i="${i}"><input type="checkbox" class="cb" data-t="done" ${it.done ? 'checked' : ''} aria-label="Hotovo"><input class="inl" value="${esc(it.text)}" data-t="text" aria-label="Bod"><button class="icon-btn sm" data-t="del" aria-label="Smazat bod">${gl('x')}</button></li>`).join('')}</ul>
    <div class="shop-add"><input class="input" type="text" placeholder="Přidat bod…" data-t="add-in" aria-label="Nový bod"><button class="btn sm" data-t="add" aria-label="Přidat bod">${gl('plus')}</button></div>
    <div class="tfoot"><span class="muted small">${n}/${d.items.length} hotovo</span><span class="spacer"></span>${n ? `<button class="btn sm tertiary" data-t="reset">${gl('undo')}Odškrtnout vše</button>` : ''}${saveTag()}</div></div>`;
};
H.checklist = (e, el, root) => {
  const d = doc(root.dataset.docId); if (!d) return; const i = +el?.closest('[data-i]')?.dataset.i, t = el?.dataset.t;
  const commit = (re = true) => { d.updated = Date.now(); saveWs(); re ? rerenderRoot(root) : saving(root); };
  const add = () => { const inp = root.querySelector('[data-t=add-in]'); if (!inp.value.trim()) return; d.items.push({ id: Math.random().toString(36).slice(2, 8), text: inp.value.trim(), done: false }); commit(); root.querySelector('[data-t=add-in]')?.focus(); };
  if (e.type === 'keydown') { if (e.key === 'Enter' && e.target.dataset.t === 'add-in') { e.preventDefault(); add(); } return; }
  if (e.type === 'click') { if (t === 'add') add(); if (t === 'del') { d.items.splice(i, 1); commit(); } if (t === 'reset') { d.items.forEach((x) => (x.done = false)); commit(); } return; }
  if (t === 'done' && e.type === 'change') { d.items[i].done = el.checked; commit(); }
  if (t === 'text' && e.type === 'input') { d.items[i].text = el.value; commit(false); }
};

// ================================================================ KALKULAČKA
R.calculator = ({ key, ctx }) => {
  const s = st(`calc:${key}`, () => ({ expr: '', hist: [] }));
  const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', ',', '⌫', '='];
  const extra = ctx === 'finance' || ctx === 'sklad' ? [['+21 %', 'vat'], ['−21 %', 'novat'], ['% z', 'pct']] : [['x²', 'sq'], ['√', 'sqrt'], ['%', 'pct']];
  const res = evalExpr(s.expr);
  return `<div class="tool calc"><div class="calc-d"><div class="calc-e" aria-live="polite">${esc(s.expr) || '0'}</div><div class="calc-r">${s.expr && Number.isFinite(res) ? `= ${n2(res, 6)}` : '&nbsp;'}</div></div>
    <div class="calc-x">${extra.map(([l, k]) => `<button class="chip" data-t="fn" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="calc-k">${keys.map((k) => `<button class="ck ${/[÷×−+]/.test(k) ? 'op' : ''} ${k === '=' ? 'eq' : ''} ${k === 'C' ? 'clr' : ''}" data-t="key" data-k="${k}">${k}</button>`).join('')}</div>
    ${s.hist.length ? `<div class="calc-h">${s.hist.slice(-3).reverse().map((h) => `<button data-t="hist" data-v="${esc(h.r)}"><span>${esc(h.e)}</span><b>${esc(h.r)}</b></button>`).join('')}</div>` : ''}</div>`;
};
function evalExpr(expr) {
  const js = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '.').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
  if (!js || /[^0-9+\-*/().\s]/.test(js)) return NaN;
  try { return Function(`"use strict";return (${js})`)(); } catch { return NaN; }
}
H.calculator = (e, el, root) => {
  const s = st(`calc:${root.dataset.toolKey}`, () => ({ expr: '', hist: [] }));
  if (e.type === 'keydown') { const k = e.key; if (/^[0-9+\-*/().,]$/.test(k)) s.expr += { '*': '×', '/': '÷', '-': '−' }[k] || k; else if (k === 'Enter' || k === '=') eq(); else if (k === 'Backspace') s.expr = s.expr.slice(0, -1); else if (k === 'Escape') s.expr = ''; else return; e.preventDefault(); rerenderRoot(root); root.querySelector('.calc')?.focus(); return; }
  if (e.type !== 'click') return;
  function eq() { const r = evalExpr(s.expr); if (Number.isFinite(r)) { s.hist.push({ e: s.expr, r: n2(r, 6) }); s.expr = String(+r.toFixed(8)).replace('.', ','); } }
  const t = el.dataset.t, k = el.dataset.k;
  if (t === 'key') { if (k === 'C') s.expr = ''; else if (k === '⌫') s.expr = s.expr.slice(0, -1); else if (k === '=') eq(); else s.expr += k; }
  if (t === 'fn') { const v = evalExpr(s.expr || '0'); const f = { vat: v * 1.21, novat: v / 1.21, sq: v * v, sqrt: Math.sqrt(v), pct: v / 100 }[k]; if (Number.isFinite(f)) { s.hist.push({ e: `${s.expr} ${el.textContent}`, r: n2(f, 6) }); s.expr = String(+f.toFixed(8)).replace('.', ','); } }
  if (t === 'hist') s.expr = el.dataset.v.replace(/\s/g, '');
  rerenderRoot(root);
};

// ================================================================ PŘEVODNÍK
const CONV = [['g', 'oz', 0.035274], ['kg', 'lb', 2.20462], ['cm', 'in', 0.393701], ['l', 'gal (US)', 0.264172], ['°C', '°F', null]];
R.converter = ({ key }) => {
  const s = st(`conv:${key}`, () => ({ v: CONV.map(() => '') }));
  return `<div class="tool conv">${CONV.map(([a, b, f], i) => { const x = parseFloat(String(s.v[i]).replace(',', '.')); const y = Number.isFinite(x) ? (f ? x * f : x * 9 / 5 + 32) : NaN; return `<div class="cv-r"><label><input class="input" type="number" step="any" value="${esc(s.v[i])}" data-t="v" data-i="${i}" aria-label="${a}"><em>${a}</em></label>${gl('arrow-right')}<b>${Number.isFinite(y) ? n2(y, 3) : '—'}</b><em>${b}</em></div>`; }).join('')}</div>`;
};
H.converter = (e, el, root) => { if (el?.dataset.t !== 'v' || e.type !== 'input') return; const s = st(`conv:${root.dataset.toolKey}`, () => ({ v: CONV.map(() => '') })); s.v[+el.dataset.i] = el.value; const row = el.closest('.cv-r'), [, , f] = CONV[+el.dataset.i]; const x = parseFloat(el.value.replace(',', '.')); row.querySelector('b').textContent = Number.isFinite(x) ? n2(f ? x * f : x * 9 / 5 + 32, 3) : '—'; };

// ================================================================ DATUMOVÁ KALKULAČKA
R.dates = ({ key }) => {
  const s = st(`date:${key}`, () => ({ a: startOfDay(Date.now()), b: startOfDay(Date.now()) + 60 * DAY, days: 60 }));
  const plus = s.a + s.days * DAY;
  return `<div class="tool dates"><div class="fields two"><label class="field"><span>Od data</span><input class="input" type="date" value="${toDateInput(s.a)}" data-t="a"></label><label class="field"><span>Do data</span><input class="input" type="date" value="${toDateInput(s.b)}" data-t="b"></label></div>
    <div class="dt-res"><span>Rozdíl</span><b>${daysBetween(s.a, s.b)} ${plural(daysBetween(s.a, s.b), 'den', 'dny', 'dní')}</b><em>${n2(daysBetween(s.a, s.b) / 7, 1)} týdne</em></div>
    <label class="field"><span>Od data + dní</span><input class="input" type="number" value="${s.days}" data-t="days"></label>
    <div class="dt-res"><span>Výsledek</span><b>${dLong(plus)}</b></div></div>`;
};
H.dates = (e, el, root) => { const s = st(`date:${root.dataset.toolKey}`, () => ({})); const t = el?.dataset.t; if (!t || e.type !== 'change') return; if (t === 'days') s.days = +el.value || 0; else { const v = new Date(el.value).getTime(); if (v) s[t] = v; } rerenderRoot(root); };

// ================================================================ INKUBAČNÍ KALKULAČKA
R.incubation = ({ key }) => {
  const eggSp = Object.entries(SPECIES).filter(([, x]) => x.repro.incubation);
  const s = st(`inc:${key}`, () => ({ sp: 'python-regius', laid: startOfDay(Date.now()) - 20 * DAY }));
  const sp = SPECIES[s.sp], [a, b] = sp.repro.incubation, day = daysBetween(s.laid, Date.now());
  const w0 = s.laid + a * DAY, w1 = s.laid + b * DAY, max = b * 1.12, pct = (x) => `${Math.min(100, (x / max) * 100).toFixed(1)}%`;
  return `<div class="tool incc"><div class="fields two"><label class="field"><span>Druh</span><select class="select" data-t="sp">${eggSp.map(([k, x]) => `<option value="${k}" ${k === s.sp ? 'selected' : ''}>${esc(latin(x))}</option>`).join('')}</select></label><label class="field"><span>Datum snůšky</span><input class="input" type="date" value="${toDateInput(s.laid)}" data-t="laid"></label></div>
    <div class="ic-win"><div class="rb st-${day < a ? 'before' : day <= b ? 'in' : 'after'}"><div class="rb-track"><i class="rb-fill" style="--w:${pct(Math.min(day, max))}"></i><i class="rb-win" style="left:${pct(a)};width:calc(${pct(b)} - ${pct(a)})"></i><i class="rb-now" style="left:${pct(Math.max(0, Math.min(day, max)))}"><em>den ${day}</em></i></div></div></div>
    <div class="dt-res"><span>Očekávané líhnutí</span><b>${dShort(w0)} – ${dShort(w1)}</b><em>${a}–${b} dní · ${esc(sp.repro.temp || '')}</em></div>
    <p class="muted small">${esc(sp.repro.note)} Rozmezí je orientační — skutečný den závisí na teplotě a snůšce.</p></div>`;
};
H.incubation = (e, el, root) => { const s = st(`inc:${root.dataset.toolKey}`, () => ({})); const t = el?.dataset.t; if (!t || e.type !== 'change') return; if (t === 'sp') s.sp = el.value; else s.laid = new Date(el.value).getTime() || s.laid; rerenderRoot(root); };

// ================================================================ OBJEM UBIKACE / SUBSTRÁT
const encOptions = (sel) => store.get().enclosures.filter((e) => e.dims).map((e) => `<option value="${e.id}" ${sel === e.id ? 'selected' : ''}>${esc(e.code)} · ${esc(e.name)}</option>`).join('');
R.volume = ({ key }) => {
  const s = st(`vol:${key}`, () => ({ w: 90, d: 45, h: 60, enc: '' }));
  const l = (s.w * s.d * s.h) / 1000, area = (s.w * s.d) / 10000;
  return `<div class="tool vol"><label class="field"><span>Převzít z ubikace</span><select class="select" data-t="enc"><option value="">— vlastní rozměry —</option>${encOptions(s.enc)}</select></label>
    <div class="fields three">${[['w', 'Šířka'], ['d', 'Hloubka'], ['h', 'Výška']].map(([k, lb]) => `<label class="field"><span>${lb} (cm)</span><input class="input" type="number" value="${s[k]}" data-t="${k}"></label>`).join('')}</div>
    <div class="kv3"><div><span>Objem</span><b>${n2(l, 0)} l</b></div><div><span>Plocha dna</span><b>${n2(area, 2)} m²</b></div><div><span>Přední sklo</span><b>${n2((s.w * s.h) / 10000, 2)} m²</b></div></div></div>`;
};
H.volume = (e, el, root) => { const s = st(`vol:${root.dataset.toolKey}`, () => ({})); const t = el?.dataset.t; if (!t || e.type !== 'change') return; if (t === 'enc') { s.enc = el.value; const en = store.get().enclosures.find((x) => x.id === el.value); if (en?.dims) Object.assign(s, { w: en.dims.w, d: en.dims.d, h: en.dims.h }); } else s[t] = +el.value || 0; rerenderRoot(root); };
R.substrate = ({ key }) => {
  const s = st(`sub:${key}`, () => ({ w: 90, d: 45, depth: 8, bag: 20, enc: '' }));
  const l = (s.w * s.d * s.depth) / 1000, bags = Math.ceil(l / (s.bag || 1));
  return `<div class="tool vol"><label class="field"><span>Převzít z ubikace</span><select class="select" data-t="enc"><option value="">— vlastní rozměry —</option>${encOptions(s.enc)}</select></label>
    <div class="fields two">${[['w', 'Šířka (cm)'], ['d', 'Hloubka (cm)'], ['depth', 'Výška vrstvy (cm)'], ['bag', 'Balení (l)']].map(([k, lb]) => `<label class="field"><span>${lb}</span><input class="input" type="number" value="${s[k]}" data-t="${k}"></label>`).join('')}</div>
    <div class="kv3"><div><span>Substrát</span><b>${n2(l, 1)} l</b></div><div><span>Balení</span><b>${bags} ×</b></div><div><span>Rezerva 10 %</span><b>${n2(l * 1.1, 1)} l</b></div></div></div>`;
};
H.substrate = (e, el, root) => { const s = st(`sub:${root.dataset.toolKey}`, () => ({})); const t = el?.dataset.t; if (!t || e.type !== 'change') return; if (t === 'enc') { s.enc = el.value; const en = store.get().enclosures.find((x) => x.id === el.value); if (en?.dims) Object.assign(s, { w: en.dims.w, d: en.dims.d }); } else s[t] = +el.value || 0; rerenderRoot(root); };

// ================================================================ CENA × MNOŽSTVÍ
R.price = ({ key }) => {
  const s = st(`price:${key}`, () => ({ unit: 1.6, qty: 500, disc: 0, vat: 21, cost: 850, margin: 60 }));
  const base = s.unit * s.qty * (1 - s.disc / 100), sale = s.cost * (1 + s.margin / 100);
  return `<div class="tool price"><div class="fields three"><label class="field"><span>Cena / ks (Kč)</span><input class="input" type="number" step="any" value="${s.unit}" data-t="unit"></label><label class="field"><span>Množství</span><input class="input" type="number" value="${s.qty}" data-t="qty"></label><label class="field"><span>Sleva %</span><input class="input" type="number" value="${s.disc}" data-t="disc"></label></div>
    <div class="kv3"><div><span>Bez DPH</span><b>${czk(base)}</b></div><div><span>DPH ${s.vat} %</span><b>${czk(base * s.vat / 100)}</b></div><div class="hl"><span>Celkem</span><b>${czk(base * (1 + s.vat / 100))}</b></div></div>
    <div class="fields two"><label class="field"><span>Náklady na zvíře (Kč)</span><input class="input" type="number" value="${s.cost}" data-t="cost"></label><label class="field"><span>Marže %</span><input class="input" type="number" value="${s.margin}" data-t="margin"></label></div>
    <div class="dt-res"><span>Doporučená prodejní cena</span><b>${czk(sale)}</b><em>zisk ${czk(sale - s.cost)}</em></div></div>`;
};
H.price = (e, el, root) => { const s = st(`price:${root.dataset.toolKey}`, () => ({})); const t = el?.dataset.t; if (!t || e.type !== 'change') return; s[t] = +el.value || 0; rerenderRoot(root); };

// ================================================================ ELEKTŘINA
R.energy = ({ key }) => {
  const s = st(`en:${key}`, () => ({ price: 6.2, rows: [{ n: 'LED 6500 K (žabí stěna)', w: 48, h: 12, q: 6 }, { n: 'UVB T5 54 W', w: 54, h: 12, q: 3 }, { n: 'Výhřevné kabely (regály)', w: 25, h: 18, q: 8 }, { n: 'Čerpadlo rosení', w: 60, h: 0.5, q: 1 }, { n: 'Inkubátor', w: 40, h: 14, q: 1 }] }));
  const kwh = s.rows.reduce((t, r) => t + (r.w * r.h * r.q * 30) / 1000, 0);
  return `<div class="tool energy"><table class="tbl mini"><thead><tr><th>Spotřebič</th><th class="num">W</th><th class="num">h/den</th><th class="num">ks</th><th class="num">kWh/měs.</th></tr></thead><tbody>${s.rows.map((r, i) => `<tr><td>${esc(r.n)}</td>${['w', 'h', 'q'].map((k) => `<td class="num"><input class="inl num" type="number" step="any" value="${r[k]}" data-t="${k}" data-i="${i}" aria-label="${k}"></td>`).join('')}<td class="num">${n2((r.w * r.h * r.q * 30) / 1000, 1)}</td></tr>`).join('')}</tbody></table>
    <div class="row"><label class="field" style="max-width:170px"><span>Cena Kč / kWh</span><input class="input" type="number" step="any" value="${s.price}" data-t="price"></label><div class="kv3 grow"><div><span>kWh / měsíc</span><b>${n2(kwh, 0)}</b></div><div class="hl"><span>Náklady / měsíc</span><b>${czk(kwh * s.price)}</b></div><div><span>Za rok</span><b>${czk(kwh * s.price * 12)}</b></div></div></div></div>`;
};
H.energy = (e, el, root) => { const s = st(`en:${root.dataset.toolKey}`, () => ({})); const t = el?.dataset.t; if (!t || e.type !== 'change') return; if (t === 'price') s.price = +el.value; else s.rows[+el.dataset.i][t] = +el.value; rerenderRoot(root); };

// ================================================================ SPOTŘEBA KRMIVA
export function feedDemand() {
  const db = store.get(), dem = {};
  for (const p of db.plans.filter((x) => x.active && x.type === 'feeding' && x.stockItem)) { const a = db.animals.find((x) => x.id === p.subject); if (!a || ['sold', 'deceased'].includes(a.status)) continue; dem[p.stockItem] = (dem[p.stockItem] || 0) + ((p.qtyN || 1) * 7) / p.every; }
  const frog = db.plans.filter((x) => x.active && x.type === 'feeding' && /Drosophila/i.test(x.feeder));
  if (frog.length) dem.i_dhyd = (dem.i_dhyd || 0) + frog.length * 0.5;
  return Object.entries(dem).map(([id, w]) => { const it = db.inventory.find((x) => x.id === id); return { id, it, week: w, days: it ? it.qty / (w / 7) : 0, order: it ? Math.max(0, Math.ceil(w * 2 - it.qty)) : 0 }; }).filter((x) => x.it);
}
R.feedplan = () => {
  const rows = feedDemand();
  return `<div class="tool feedplan"><table class="tbl mini"><thead><tr><th>Krmivo</th><th class="num">za týden</th><th class="num">skladem</th><th class="num">vydrží</th><th class="num">objednat (2 týd.)</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.it.name)}</td><td class="num">${n2(r.week, 1)} ${esc(r.it.unit)}</td><td class="num">${r.it.qty}</td><td class="num ${r.days < 7 ? 'bad-t' : r.days < 14 ? 'warn-t' : ''}">${n2(r.days, 0)} d</td><td class="num"><b>${r.order || '—'}</b></td></tr>`).join('')}</tbody></table>
    <div class="tfoot"><span class="muted small">Z aktivních plánů krmení (množství × frekvence).</span><span class="spacer"></span><button class="btn sm primary" data-t="order" ${rows.some((r) => r.order) ? '' : 'disabled'}>${gl('cart')}Do nákupního seznamu</button></div></div>`;
};
H.feedplan = (e, el) => {
  if (e.type !== 'click' || el?.dataset.t !== 'order') return;
  const id = ensureList(), d = doc(id); let n = 0;
  for (const r of feedDemand().filter((x) => x.order)) { if (d.items.some((x) => x.ref === r.id && !x.done)) continue; d.items.push({ id: Math.random().toString(36).slice(2, 8), name: r.it.name, qty: r.order, unit: r.it.unit, price: r.it.price, supplier: r.it.supplier || '', note: 'spotřeba 2 týdny', prio: 'n', done: false, ref: r.id }); n++; }
  d.updated = Date.now(); saveWs(); toast(n ? `Přidáno ${n} položek do „${d.title}“` : 'Vše už je v seznamu', { kind: n ? 'ok' : 'info', action: () => (location.hash = '#/sklad/nakup'), actionLabel: 'Otevřít' }); store.emit('change');
};

// ================================================================ EXPO CENÍK
R.pricelist = () => {
  const db = store.get(), rows = db.sales.filter((s) => s.status === 'for-sale').map((s) => ({ s, a: db.animals.find((x) => x.id === s.animal) })).filter((x) => x.a);
  const txt = `Terraristika Expo Praha · ${dShort(Date.now())}\n` + rows.map(({ s, a }) => `${latin(SPECIES[a.species])} — ${a.code}${a.morph ? ` ${a.morph}` : ''} · ${a.sex === 'm' ? '1.0' : a.sex === 'f' ? '0.1' : '0.0.1'} · ${czk(s.price)}`).join('\n');
  return `<div class="tool pl"><ul class="pl-l">${rows.map(({ s, a }) => `<li><b class="latin">${esc(latin(SPECIES[a.species]))}</b><span class="code">${esc(a.code)}</span><span class="muted">${esc(a.morph || '')}</span><span class="spacer"></span><b>${czk(s.price)}</b></li>`).join('') || '<li class="muted">Žádná zvířata na prodej.</li>'}</ul>
    <textarea class="pl-txt" readonly aria-label="Text ceníku">${esc(txt)}</textarea><div class="tfoot"><span class="muted small">${rows.length} zvířat na prodej</span><span class="spacer"></span><button class="btn sm" data-t="copy">${gl('copy')}Kopírovat</button><button class="btn sm tertiary" data-t="print">${gl('printer')}Tisk</button></div></div>`;
};
H.pricelist = (e, el, root) => { if (e.type !== 'click') return; if (el?.dataset.t === 'copy') navigator.clipboard?.writeText(root.querySelector('.pl-txt').value).then(() => toast('Ceník zkopírován', { kind: 'info', ms: 2000 }), () => toast('Kopírování zde není dostupné', { kind: 'warn' })); if (el?.dataset.t === 'print') { const w = window.open('', '_blank'); if (w) { w.document.write(`<title>Expo ceník</title><pre style="font:14px/1.6 system-ui">${esc(root.querySelector('.pl-txt').value)}</pre>`); w.print(); } } };

// ================================================================ RYCHLÉ ODKAZY
R.links = ({ docId }) => {
  const d = doc(docId); if (!d) return '';
  return `<div class="tool links"><div class="lk-g">${d.items.map((l, i) => `<a class="lk" href="${esc(l.href)}" data-i="${i}">${gl(l.icon || 'link')}<span>${esc(l.label)}</span><button class="icon-btn sm lk-x" data-t="del" aria-label="Odebrat odkaz">${gl('x')}</button></a>`).join('')}</div>
    <div class="shop-add"><input class="input" type="text" placeholder="Přidat aktuální stránku jako odkaz…" data-t="add-in" aria-label="Název odkazu"><button class="btn sm" data-t="add">${gl('plus')}Přidat</button></div></div>`;
};
H.links = (e, el, root) => {
  const d = doc(root.dataset.docId); if (!d) return; const t = el?.dataset.t;
  const add = () => { const inp = root.querySelector('[data-t=add-in]'); const label = inp.value.trim() || document.title.split(' · ')[0]; d.items.push({ label, href: location.hash || '#/prehled', icon: 'link' }); saveWs(); rerenderRoot(root); };
  if (e.type === 'keydown') { if (e.key === 'Enter' && e.target.dataset.t === 'add-in') { e.preventDefault(); add(); } return; }
  if (e.type !== 'click') return;
  if (t === 'add') add();
  if (t === 'del') { e.preventDefault(); d.items.splice(+el.closest('[data-i]').dataset.i, 1); saveWs(); rerenderRoot(root); }
};

// ================================================================ výchozí dokumenty & napojení na Sklad
export function seedDoc(kind) {
  const db = store.get();
  if (kind === 'shopping') return newDoc('shopping', { title: 'Krmivo — objednávka', accent: 'amber', items: [
    { id: 's1', name: 'Dubia (M)', qty: 500, unit: 'ks', price: 1.6, supplier: 'c_sup1', note: 'doplnit chov', prio: 'h', done: false, ref: 'i_dubia' },
    { id: 's2', name: 'Myš adult (mraž.)', qty: 50, unit: 'ks', price: 14, supplier: 'c_sup2', note: '', prio: 'n', done: false },
    { id: 's3', name: 'Dendrocare', qty: 1, unit: 'dóza', price: 420, supplier: 'c_sup1', note: 'suplementační rotace', prio: 'n', done: false },
    { id: 's4', name: 'Kokosové vlákno', qty: 2, unit: 'bal.', price: 129, supplier: '', note: 'FW-3 přestavba', prio: 'n', done: true } ].map((x) => ({ ...x, supplier: db.contacts.some((c) => c.id === x.supplier) ? x.supplier : '' })) });
  if (kind === 'notes') return newDoc('notes', { title: 'Chovná místnost — poznámky', accent: 'violet', pinned: true, text: 'AS-01: držet vlhkost 85 %, dokud nespadne oční čepička.\nMSP-04: čekáme na PCR (Cryptosporidium) — zeptat se MVDr. Horákové.\nPR-02: po předsnůškovém svleku připravit snáškový box.' });
  if (kind === 'checklist') return newDoc('checklist', { title: 'Příprava na burzu', accent: 'green', items: [['Vytisknout ceník', true], ['Boxy + štítky pro CC-03, CC-04', false], ['Termotaška a heatpacky', false], ['CITES doklady FP-03', false], ['Drobné na vracení', false]].map(([text, done], i) => ({ id: `c${i}`, text, done })) });
  if (kind === 'links') return newDoc('links', { title: 'Rychlé odkazy', items: [{ label: 'Snůška CL-2026-04', href: '#/reprodukce/snuska/cl_msp', icon: 'egg' }, { label: 'PR-02 Tessa', href: '#/zvirata/karta/a_pr02', icon: 'snake' }, { label: 'Nákupní seznam', href: '#/sklad/nakup', icon: 'cart' }, { label: 'Habitat Studio', href: '#/ubikace/studio', icon: 'cube' }, { label: 'Karanténa', href: '#/zvirata/karantena', icon: 'quarantine' }] });
  return newDoc(kind);
}
export function ensureList() { return docsOf('shopping')[0]?.id || seedDoc('shopping'); }
export function addItemToShopping(itemId) {
  const db = store.get(), it = db.inventory.find((x) => x.id === itemId); if (!it) return null;
  const id = ensureList(), d = doc(id);
  if (d.items.find((x) => x.ref === it.id && !x.done)) return { id, dup: true, title: d.title };
  d.items.push({ id: Math.random().toString(36).slice(2, 8), name: it.name, qty: Math.max(1, it.reorder - it.qty), unit: it.unit, price: it.price, supplier: it.supplier || '', note: `stav ${it.qty}/${it.min}`, prio: it.qty < it.min ? 'h' : 'n', done: false, ref: it.id }); d.updated = Date.now(); saveWs();
  return { id, title: d.title };
}
export function addLowStockToShopping() { let n = 0; for (const it of store.get().inventory.filter((x) => x.qty < x.min)) { const r = addItemToShopping(it.id); if (r && !r.dup) n++; } return n; }
export { ws };
