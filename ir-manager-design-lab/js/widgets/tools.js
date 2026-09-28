// MULTITOOL — practical work tools. Each tool renders into a root element and handles its own events, so the
// same tool works as a dashboard/module widget, in the Tools drawer (global) and on the Tools page.
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { toast } from '../core/overlay.js';
import { SPECIES, latin, imgFor } from '../data/species.js';
import * as A from '../engine/actions.js';
import { ws, saveWs, doc, newDoc, docsOf, wsStatus } from './wsstore.js';
import { DAY, startOfDay, dShort, dLong, toDateInput, daysBetween, rel, ageText } from '../core/time.js';

export const TOOLS = {
  shopping: { name: 'Shopping list', icon: 'shopping', desc: 'Lists with quantity, unit, price, category, priority — several lists, each with its own colour.', doc: 'shopping' },
  notes: { name: 'Notes', icon: 'notebook', desc: 'Autosaved notepad with pinning, checklist mode and a large editor.', doc: 'notes' },
  checklist: { name: 'Checklist', icon: 'checklist', desc: 'Lightweight personal checklist (expo prep, transport, room close-down).', doc: 'checklist' },
  calculator: { name: 'Calculator', icon: 'calculator', desc: 'Fast calculator with context keys (VAT & margin in Finance, volume in Enclosures).' },
  converter: { name: 'Unit converter', icon: 'ruler', desc: 'g ↔ oz, cm ↔ in, °C ↔ °F, litres ↔ gallons.' },
  dates: { name: 'Date calculator', icon: 'calendar', desc: 'Date ± days, days between dates, day N of a clutch.' },
  incubation: { name: 'Incubation window', icon: 'repro', desc: 'Expected hatch window from lay date and species data — shown as a range.' },
  volume: { name: 'Enclosure volume & substrate', icon: 'box3d', desc: 'W × D × H → litres, floor area, substrate litres & bags.' },
  price: { name: 'Price & margin', icon: 'percent', desc: 'Price × quantity with VAT; sale price from costs and margin.' },
  energy: { name: 'Electricity cost', icon: 'zap', desc: 'Monthly running cost of lamps, heat and pumps.' },
  feedplan: { name: 'Feed demand planner', icon: 'feed', desc: 'Weekly feeder demand from your care plans vs. stock — order the difference.' },
  stockcount: { name: 'Stock count', icon: 'inventory', desc: 'Count live & frozen feed with steppers; saves movements.' },
  pricelist: { name: 'Expo price list', icon: 'tag', desc: 'Builds a copy-ready price list from animals marked for sale.' },
  labels: { name: 'Label printer', icon: 'printer', desc: 'Print enclosure / animal labels with code, Latin name, sex and hatch date.' },
  links: { name: 'Quick links', icon: 'link', desc: 'Your shortcuts: favourite animals, active clutch, supplier, Habitat Studio.' },
};
const ST = new Map(); // transient per-root state (calculator input, converter values…)
const st = (key, init) => { if (!ST.has(key)) ST.set(key, init()); return ST.get(key); };
const n2 = (v, d = 2) => (Number.isFinite(v) ? (+v.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d }) : '—');
const czk = (v) => `${Math.round(v).toLocaleString('cs-CZ').replace(/ /g, ' ')} Kč`;

/** Render a tool into `root`. opts: { key (instance id), docId, ctx (workspace/module), compact } */
export function renderTool(root, kind, opts = {}) {
  const T = TOOLS[kind]; if (!T) return;
  root.dataset.toolKind = kind; root.dataset.toolKey = opts.key || kind; if (opts.docId) root.dataset.docId = opts.docId; root.dataset.ctx = opts.ctx || '';
  root.innerHTML = R[kind](opts);
  if (!root.dataset.bound) { root.dataset.bound = 1; root.addEventListener('click', onEvt); root.addEventListener('input', onEvt); root.addEventListener('change', onEvt); root.addEventListener('keydown', onEvt); }
}
const rerenderRoot = (root) => renderTool(root, root.dataset.toolKind, { key: root.dataset.toolKey, docId: root.dataset.docId, ctx: root.dataset.ctx });

function onEvt(e) {
  const root = e.currentTarget, kind = root.dataset.toolKind, h = H[kind];
  if (!h) return;
  const el = e.target.closest('[data-t]'); if (!el && e.type !== 'keydown') return;
  h(e, el, root);
}
function saving(root) { const s = root.querySelector('.tl-save'); if (s) { s.textContent = 'Saving…'; clearTimeout(s._t); s._t = setTimeout(() => { s.textContent = `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; }, 500); } }

// ================================================================ renderers
const R = {};
const H = {};

// ---------------- SHOPPING LIST
R.shopping = ({ docId }) => {
  const d = doc(docId); if (!d) return '<p class="muted">List not found.</p>';
  const items = d.items, open = items.filter((i) => !i.done), doneN = items.length - open.length;
  const total = items.filter((i) => !i.done).reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
  const cats = ['feed', 'supplement', 'equipment', 'substrate', 'other'];
  return `<div class="tool shop">
    <form class="shop-add" data-t="add-form"><input type="text" name="n" placeholder="Add item… e.g. “Dubia 500 pcs 1.6”" aria-label="New item" data-t="add-in" autocomplete="off"><button class="btn sm primary" data-t="add">${icon('plus')}</button></form>
    <ul class="shop-l" role="list">${items.map((it, i) => `<li class="si ${it.done ? 'done' : ''} p-${it.prio || 'n'}" data-i="${i}">
      <input type="checkbox" class="cb" data-t="done" ${it.done ? 'checked' : ''} aria-label="Bought">
      <span class="si-t"><input class="inl" value="${esc(it.name)}" data-t="name" aria-label="Item"><span class="si-m"><input class="inl q" type="number" min="0" step="any" value="${it.qty ?? ''}" data-t="qty" aria-label="Quantity"><input class="inl u" value="${esc(it.unit || '')}" data-t="unit" placeholder="unit" aria-label="Unit">${it.price ? `<em>× ${n2(it.price)} Kč</em>` : ''}<select class="inl c" data-t="cat" aria-label="Category">${cats.map((c) => `<option ${it.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>${it.note ? `<em class="nt">${esc(it.note)}</em>` : ''}</span></span>
      <button class="icon-btn sm ${it.prio === 'h' ? 'hot' : ''}" data-t="prio" title="Priority">${icon('flag')}</button>
      <span class="si-mv"><button class="icon-btn sm" data-t="up" title="Move up" ${i === 0 ? 'disabled' : ''}>${icon('chevronUp')}</button><button class="icon-btn sm" data-t="down" title="Move down" ${i === items.length - 1 ? 'disabled' : ''}>${icon('chevronDown')}</button></span>
      <button class="icon-btn sm" data-t="del" title="Delete">${icon('x')}</button></li>`).join('') || `<li class="muted empty-li">Empty list — add items above, or send low stock here from Inventory.</li>`}</ul>
    <div class="shop-f"><span>${open.length} to buy${total ? ` · ≈ <b>${czk(total)}</b>` : ''}</span>${doneN ? `<button class="btn sm ghost" data-t="clear">${icon('trash')}Clear ${doneN} bought</button>` : ''}<button class="btn sm ghost" data-t="copy">${icon('copy')}Copy</button><span class="tl-save muted">Saved</span></div></div>`;
};
function parseItem(s) {
  const m = s.trim().match(/^(.*?)(?:\s+(\d+(?:[.,]\d+)?)\s*([a-zA-Zčšřžýáíéůú%]+)?)?(?:\s+(\d+(?:[.,]\d+)?)\s*(?:kč|czk)?)?$/i);
  const name = (m?.[1] || s).trim();
  return { id: Math.random().toString(36).slice(2, 8), name: name || s.trim(), qty: m?.[2] ? parseFloat(m[2].replace(',', '.')) : 1, unit: m?.[3] || 'pcs', price: m?.[4] ? parseFloat(m[4].replace(',', '.')) : 0, cat: /dubia|cricket|mouse|rat|drosoph|spring|feed/i.test(name) ? 'feed' : /calc|vit|dendro|pollen/i.test(name) ? 'supplement' : /coco|substr|verm|leaf|soil/i.test(name) ? 'substrate' : /uvb|nozzle|hose|sensor|lamp|pump|tube/i.test(name) ? 'equipment' : 'other', prio: 'n', done: false };
}
H.shopping = (e, el, root) => {
  const d = doc(root.dataset.docId); if (!d) return;
  const i = +el?.closest('[data-i]')?.dataset.i;
  const t = el?.dataset.t;
  const commit = (re = true) => { d.updated = Date.now(); saveWs(); if (re) rerenderRoot(root); else saving(root); };
  if (e.type === 'keydown') { if (e.key === 'Enter' && e.target.dataset.t === 'add-in') { e.preventDefault(); add(); } return; }
  function add() { const inp = root.querySelector('[data-t=add-in]'); if (!inp.value.trim()) return; d.items.push(parseItem(inp.value)); inp.value = ''; commit(); root.querySelector('[data-t=add-in]')?.focus(); }
  if (e.type === 'click') {
    if (t === 'add') { e.preventDefault(); add(); }
    if (t === 'prio') { d.items[i].prio = d.items[i].prio === 'h' ? 'n' : 'h'; commit(); }
    if (t === 'del') { const [x] = d.items.splice(i, 1); commit(); toast(`Removed “${x.name}”`, { undo: () => { d.items.splice(i, 0, x); commit(); } }); }
    if (t === 'up' && i > 0) { [d.items[i - 1], d.items[i]] = [d.items[i], d.items[i - 1]]; commit(); }
    if (t === 'down' && i < d.items.length - 1) { [d.items[i + 1], d.items[i]] = [d.items[i], d.items[i + 1]]; commit(); }
    if (t === 'clear') { const kept = d.items.filter((x) => !x.done), rem = d.items.filter((x) => x.done); d.items = kept; commit(); toast(`Cleared ${rem.length} bought items`, { undo: () => { d.items.push(...rem); commit(); } }); }
    if (t === 'copy') { const txt = `${d.title}\n${d.items.filter((x) => !x.done).map((x) => `☐ ${x.name} — ${x.qty ?? ''} ${x.unit || ''}`).join('\n')}`; navigator.clipboard?.writeText(txt).then(() => toast('List copied', { kind: 'info', ms: 2000 }), () => toast('Copy not available', { kind: 'warn' })); }
    return;
  }
  if (e.type === 'change' && t === 'done') { d.items[i].done = el.checked; commit(); }
  if (e.type === 'change' && t === 'cat') { d.items[i].cat = el.value; commit(false); }
  if (e.type === 'input' && (t === 'name' || t === 'unit')) { d.items[i][t] = el.value; commit(false); }
  if (e.type === 'input' && t === 'qty') { d.items[i].qty = el.value === '' ? null : +el.value; commit(false); }
};

// ---------------- NOTES
R.notes = ({ docId }) => {
  const d = doc(docId); if (!d) return '<p class="muted">Note not found.</p>';
  const check = d.mode === 'check';
  return `<div class="tool notes">
    <div class="nt-bar"><button class="chip ${check ? '' : 'on'}" data-t="mode" data-v="text">${icon('note')}Text</button><button class="chip ${check ? 'on' : ''}" data-t="mode" data-v="check">${icon('checklist')}Checklist</button><span class="spacer"></span><button class="icon-btn sm ${d.pinned ? 'hot' : ''}" data-t="pin" title="${d.pinned ? 'Unpin' : 'Pin'}">${icon('pin')}</button><button class="icon-btn sm" data-t="expand" title="Open large editor">${icon('maximize')}</button></div>
    ${check ? `<ul class="nt-check">${(d.text || '').split('\n').filter((l) => l.trim()).map((l, i) => { const on = /^\[x\]/i.test(l); return `<li><label><input type="checkbox" class="cb" data-t="chk" data-i="${i}" ${on ? 'checked' : ''}><span class="${on ? 'done' : ''}">${esc(l.replace(/^\[.?\]\s*/, ''))}</span></label></li>`; }).join('')}</ul><input type="text" class="nt-add" data-t="chk-add" placeholder="Add line…">`
    : `<textarea class="nt-ta" data-t="text" placeholder="Write anything — autosaved…" aria-label="Note text">${esc(d.text || '')}</textarea>`}
    <div class="nt-f"><span class="muted">${d.pinned ? `${icon('pin')} pinned · ` : ''}edited ${rel(d.updated)}</span><span class="tl-save muted">Saved</span></div></div>`;
};
H.notes = (e, el, root) => {
  const d = doc(root.dataset.docId); if (!d) return;
  const t = el?.dataset.t;
  if (e.type === 'input' && t === 'text') { d.text = el.value; d.updated = Date.now(); saveWs(); saving(root); return; }
  if (e.type === 'keydown' && e.key === 'Enter' && e.target.dataset.t === 'chk-add') { const v = e.target.value.trim(); if (v) { d.text = `${(d.text || '').replace(/\n*$/, '')}\n[ ] ${v}`.replace(/^\n/, ''); d.updated = Date.now(); saveWs(); rerenderRoot(root); root.querySelector('[data-t=chk-add]')?.focus(); } return; }
  if (e.type === 'change' && t === 'chk') { const lines = (d.text || '').split('\n').filter((l) => l.trim()); const i = +el.dataset.i; lines[i] = `[${el.checked ? 'x' : ' '}] ${lines[i].replace(/^\[.?\]\s*/, '')}`; d.text = lines.join('\n'); d.updated = Date.now(); saveWs(); rerenderRoot(root); return; }
  if (e.type !== 'click') return;
  if (t === 'mode') { const to = el.dataset.v; if (to === 'check' && d.mode !== 'check') d.text = (d.text || '').split('\n').filter((l) => l.trim()).map((l) => (/^\[.?\]/.test(l) ? l : `[ ] ${l}`)).join('\n'); if (to === 'text' && d.mode === 'check') d.text = (d.text || '').split('\n').map((l) => l.replace(/^\[ \]\s*/, '').replace(/^\[x\]\s*/i, '✓ ')).join('\n'); d.mode = to; d.updated = Date.now(); saveWs(); rerenderRoot(root); }
  if (t === 'pin') { d.pinned = !d.pinned; saveWs(); rerenderRoot(root); }
  if (t === 'expand') import('../core/overlay.js').then(({ panel }) => { const hh = panel({ title: d.title, sub: 'Autosaved', icon: 'notebook', width: 720, body: '<div data-big></div>', onClose: () => rerenderRoot(root) }); renderTool(hh.el.querySelector('[data-big]'), 'notes', { key: `${root.dataset.toolKey}-big`, docId: root.dataset.docId }); hh.el.querySelector('.nt-ta')?.classList.add('big'); hh.el.querySelector('.nt-ta')?.focus(); });
};

// ---------------- CHECKLIST
R.checklist = ({ docId }) => {
  const d = doc(docId); if (!d) return '<p class="muted">Checklist not found.</p>';
  const doneN = d.items.filter((i) => i.done).length;
  return `<div class="tool check">
    <div class="ck-prog"><div class="bar-mini"><i style="width:${d.items.length ? (doneN / d.items.length) * 100 : 0}%"></i></div><span class="mono">${doneN}/${d.items.length}</span></div>
    <ul class="ck-l">${d.items.map((it, i) => `<li class="${it.done ? 'done' : ''}" data-i="${i}"><label><input type="checkbox" class="cb" data-t="done" ${it.done ? 'checked' : ''}><span>${esc(it.text)}</span></label><button class="icon-btn sm" data-t="del" title="Remove">${icon('x')}</button></li>`).join('')}</ul>
    <input type="text" class="nt-add" data-t="add" placeholder="Add item & Enter…">
    <div class="shop-f">${doneN ? `<button class="btn sm ghost" data-t="reset">${icon('refresh')}Uncheck all</button>` : ''}<span class="spacer"></span><span class="tl-save muted">Saved</span></div></div>`;
};
H.checklist = (e, el, root) => {
  const d = doc(root.dataset.docId); if (!d) return;
  const i = +el?.closest('[data-i]')?.dataset.i, t = el?.dataset.t;
  const commit = () => { d.updated = Date.now(); saveWs(); rerenderRoot(root); };
  if (e.type === 'keydown' && e.key === 'Enter' && e.target.dataset.t === 'add') { const v = e.target.value.trim(); if (v) { d.items.push({ text: v, done: false }); commit(); root.querySelector('[data-t=add]')?.focus(); } return; }
  if (e.type === 'change' && t === 'done') { d.items[i].done = el.checked; commit(); }
  if (e.type === 'click' && t === 'del') { d.items.splice(i, 1); commit(); }
  if (e.type === 'click' && t === 'reset') { d.items.forEach((x) => (x.done = false)); commit(); }
};

// ---------------- CALCULATOR (context keys)
R.calculator = ({ key, ctx }) => {
  const s = st(`calc:${key}`, () => ({ expr: '', res: null, hist: [] }));
  const keys = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '±', '0', '.', '='];
  const ctxKeys = ctx === 'finance' ? [['+21% VAT', '*1.21'], ['−VAT', '/1.21'], ['÷12', '/12'], ['+30% margin', '*1.3']] : ctx === 'enclosures' ? [['cm³→L', '/1000'], ['L→gal', '/3.785'], ['×0.5', '*0.5']] : ctx === 'inventory' ? [['×7 d', '*7'], ['×30 d', '*30'], ['÷ pack 500', '/500']] : [['x²', '**2'], ['√', 'sqrt'], ['1/x', 'inv']];
  return `<div class="tool calc" tabindex="0" aria-label="Calculator — type with keyboard">
    <div class="calc-d"><span class="calc-e">${esc(s.expr || '0')}</span><b>${s.res == null ? '&nbsp;' : `= ${esc(fmtNum(s.res))}`}</b></div>
    <div class="calc-ctx">${ctxKeys.map(([l, op]) => `<button class="chip" data-t="op" data-v="${op}">${l}</button>`).join('')}</div>
    <div class="calc-k">${keys.map((k) => `<button class="ck ${/[÷×−+=]/.test(k) ? 'op' : ''} ${k === '=' ? 'eq' : ''} ${k === 'C' ? 'clr' : ''}" data-t="k" data-v="${k}">${k}</button>`).join('')}</div>
    ${s.hist.length ? `<div class="calc-h">${s.hist.slice(-3).reverse().map((h) => `<button data-t="hist" data-v="${esc(h.r)}"><span>${esc(h.e)}</span><b>${esc(fmtNum(h.r))}</b></button>`).join('')}</div>` : ''}</div>`;
};
const fmtNum = (v) => (Number.isFinite(v) ? (+v.toPrecision(12)).toLocaleString('en-US', { maximumFractionDigits: 8 }) : 'Error');
function evalExpr(expr) {
  const js = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
  if (!/^[\d+\-*/().\s]*$/.test(js)) return NaN;
  try { return Function(`"use strict";return (${js || 0})`)(); } catch { return NaN; }
}
H.calculator = (e, el, root) => {
  const s = st(`calc:${root.dataset.toolKey}`, () => ({ expr: '', res: null, hist: [] }));
  const press = (k) => {
    if (k === 'C') { s.expr = ''; s.res = null; }
    else if (k === '⌫') s.expr = s.expr.slice(0, -1);
    else if (k === '=') { const r = evalExpr(s.expr); if (Number.isFinite(r)) { s.hist.push({ e: s.expr, r }); s.expr = String(+r.toPrecision(12)); s.res = null; } else s.res = NaN; return rerenderRoot(root); }
    else if (k === '±') s.expr = s.expr.startsWith('-') ? s.expr.slice(1) : `-${s.expr}`;
    else s.expr += k;
    const r = evalExpr(s.expr); s.res = /[+\-×÷−*/%]/.test(s.expr.replace(/^-/, '')) && Number.isFinite(r) ? r : null;
    rerenderRoot(root); root.querySelector('.calc')?.focus();
  };
  if (e.type === 'keydown') {
    const map = { '*': '×', '/': '÷', '-': '−', Enter: '=', '=': '=', Backspace: '⌫', Escape: 'C', Delete: 'C', ',': '.' };
    const k = map[e.key] || (/^[0-9.+%]$/.test(e.key) ? e.key : null);
    if (k && e.target.closest('.calc')) { e.preventDefault(); e.stopPropagation(); press(k); }
    return;
  }
  if (e.type !== 'click') return;
  if (el.dataset.t === 'k') press(el.dataset.v);
  if (el.dataset.t === 'hist') { s.expr = el.dataset.v; s.res = null; rerenderRoot(root); }
  if (el.dataset.t === 'op') { const v = evalExpr(s.expr) || 0, op = el.dataset.v; const r = op === 'sqrt' ? Math.sqrt(v) : op === 'inv' ? 1 / v : op === '**2' ? v * v : evalExpr(`${v}${op.replace('*', '×').replace('/', '÷')}`); s.hist.push({ e: `${fmtNum(v)} ${el.textContent}`, r }); s.expr = String(+r.toPrecision(12)); s.res = null; rerenderRoot(root); }
};

// ---------------- UNIT CONVERTER
const UNITS = { weight: [['g', 1], ['kg', 1000], ['oz', 28.3495], ['lb', 453.592]], length: [['cm', 1], ['mm', 0.1], ['m', 100], ['in', 2.54], ['ft', 30.48]], volume: [['l', 1], ['ml', 0.001], ['gal (US)', 3.78541], ['ft³', 28.3168]], temp: [['°C'], ['°F']] };
R.converter = ({ key }) => {
  const s = st(`conv:${key}`, () => ({ cat: 'weight', v: 100, from: 0, to: 2 }));
  const U = UNITS[s.cat];
  let out;
  if (s.cat === 'temp') out = s.from === 0 ? s.v * 9 / 5 + 32 : (s.v - 32) * 5 / 9; else out = (s.v * U[s.from][1]) / U[s.to][1];
  const to = s.cat === 'temp' ? 1 - s.from : s.to;
  return `<div class="tool conv"><div class="chips">${Object.keys(UNITS).map((c) => `<button class="chip ${s.cat === c ? 'on' : ''}" data-t="cat" data-v="${c}">${c}</button>`).join('')}</div>
    <div class="conv-r"><input type="number" step="any" value="${s.v}" data-t="v" aria-label="Value"><select data-t="from">${U.map((u, i) => `<option value="${i}" ${i === s.from ? 'selected' : ''}>${u[0]}</option>`).join('')}</select></div>
    <button class="icon-btn conv-sw" data-t="swap" title="Swap">${icon('repeat')}</button>
    <div class="conv-r out"><b>${n2(out, 3)}</b><select data-t="to" ${s.cat === 'temp' ? 'disabled' : ''}>${U.map((u, i) => `<option value="${i}" ${i === to ? 'selected' : ''}>${u[0]}</option>`).join('')}</select></div></div>`;
};
H.converter = (e, el, root) => {
  const s = st(`conv:${root.dataset.toolKey}`, () => ({})); const t = el?.dataset.t; if (!t) return;
  if (t === 'cat' && e.type === 'click') { s.cat = el.dataset.v; s.from = 0; s.to = UNITS[s.cat].length > 2 ? 2 : 1; rerenderRoot(root); }
  if (t === 'v' && e.type === 'input') { s.v = +el.value; const o = root.querySelector('.out b'); const U = UNITS[s.cat]; const out = s.cat === 'temp' ? (s.from === 0 ? s.v * 9 / 5 + 32 : (s.v - 32) * 5 / 9) : (s.v * U[s.from][1]) / U[s.to][1]; if (o) o.textContent = n2(out, 3); }
  if ((t === 'from' || t === 'to') && e.type === 'change') { s[t] = +el.value; rerenderRoot(root); }
  if (t === 'swap' && e.type === 'click') { if (s.cat === 'temp') s.from = 1 - s.from; else [s.from, s.to] = [s.to, s.from]; rerenderRoot(root); }
};

// ---------------- DATE CALCULATOR
R.dates = ({ key }) => {
  const s = st(`date:${key}`, () => ({ a: Date.now(), days: 30, b: Date.now() + 60 * DAY }));
  const plus = s.a + s.days * DAY;
  return `<div class="tool dates"><label class="field"><span>From date</span><input type="date" data-t="a" value="${toDateInput(s.a)}"></label>
    <div class="dt-row"><span>+</span><input type="number" data-t="days" value="${s.days}" aria-label="Days"><span>days =</span><b>${dLong(plus)}</b></div>
    <div class="dt-row"><span>Until</span><input type="date" data-t="b" value="${toDateInput(s.b)}"><b>${daysBetween(s.a, s.b)} days</b><em class="muted">${(daysBetween(s.a, s.b) / 7).toFixed(1)} weeks</em></div>
    <p class="muted small">Tip: “From” = lay date → “+ days” gives a hatch date; “Until” shows the day number today.</p></div>`;
};
H.dates = (e, el, root) => { const s = st(`date:${root.dataset.toolKey}`, () => ({})); const t = el?.dataset.t; if (!t || e.type !== 'change' && e.type !== 'input') return; if (t === 'days') s.days = +el.value || 0; else { const v = new Date(el.value).getTime(); if (v) s[t] = v; } if (e.type === 'change' || t === 'days') rerenderRoot(root); };

// ---------------- INCUBATION WINDOW HELPER (species data → range, never a single date)
R.incubation = ({ key }) => {
  const s = st(`inc:${key}`, () => ({ sp: 'python-regius', laid: startOfDay(Date.now()) - 20 * DAY, a: null, b: null }));
  const spc = SPECIES[s.sp], rp = spc.repro, base = rp.incubation || rp.gestation || rp.develop || [0, 0];
  const a = s.a ?? base[0], b = s.b ?? base[1], day = daysBetween(s.laid, Date.now());
  return `<div class="tool incu"><div class="grid2"><label class="field"><span>Species</span><select data-t="sp">${Object.entries(SPECIES).filter(([, x]) => x.repro.incubation || x.repro.develop).map(([k, x]) => `<option value="${k}" ${k === s.sp ? 'selected' : ''}>${esc(latin(x))}</option>`).join('')}</select></label>
    <label class="field"><span>Lay date</span><input type="date" data-t="laid" value="${toDateInput(s.laid)}"></label></div>
    <div class="grid2"><label class="field"><span>Range from (d)</span><input type="number" data-t="a" value="${a}"></label><label class="field"><span>to (d)</span><input type="number" data-t="b" value="${b}"></label></div>
    <div class="incu-out"><div><span>Expected window</span><b>${dShort(s.laid + a * DAY)} – ${dShort(s.laid + b * DAY)}</b></div><div><span>Today</span><b>day ${day}</b></div><div><span>Window opens</span><b>${a - day > 0 ? `in ${a - day} d` : 'open now'}</b></div></div>
    <p class="warn-note">${icon('info')}Basis: ${esc(rp.note || 'species data')}${rp.temp ? ` Typical temperature ${esc(rp.temp)}.` : ''} Biological ranges vary with temperature and protocol — edit the range to match your incubator.</p></div>`;
};
H.incubation = (e, el, root) => { const s = st(`inc:${root.dataset.toolKey}`, () => ({})); const t = el?.dataset.t; if (!t || e.type !== 'change') return; if (t === 'sp') { s.sp = el.value; s.a = null; s.b = null; } else if (t === 'laid') s.laid = new Date(el.value).getTime() || s.laid; else s[t] = +el.value; rerenderRoot(root); };

// ---------------- ENCLOSURE VOLUME & SUBSTRATE (W × D × H)
R.volume = ({ key }) => {
  const s = st(`vol:${key}`, () => ({ w: 60, d: 45, h: 60, sub: 8, bag: 10, enc: '' }));
  const L = (s.w * s.d * s.h) / 1000, area = (s.w * s.d) / 10000, subL = (s.w * s.d * s.sub) / 1000, glass = (2 * (s.w * s.h + s.d * s.h) + s.w * s.d) / 10000;
  const db = store.get();
  return `<div class="tool vol"><label class="field"><span>Prefill from enclosure</span><select data-t="enc"><option value="">— custom —</option>${db.enclosures.map((e) => `<option value="${e.id}" ${s.enc === e.id ? 'selected' : ''}>${esc(e.code)} · ${e.dims.w} × ${e.dims.d} × ${e.dims.h} cm</option>`).join('')}</select></label>
    <div class="grid3"><label class="field"><span>Width W</span><input type="number" data-t="w" value="${s.w}"></label><label class="field"><span>Depth D</span><input type="number" data-t="d" value="${s.d}"></label><label class="field"><span>Height H</span><input type="number" data-t="h" value="${s.h}"></label></div>
    <div class="grid2"><label class="field"><span>Substrate depth (cm)</span><input type="number" data-t="sub" value="${s.sub}"></label><label class="field"><span>Bag size (l)</span><input type="number" data-t="bag" value="${s.bag}"></label></div>
    <div class="incu-out"><div><span>Volume</span><b>${n2(L, 1)} l</b></div><div><span>Floor</span><b>${n2(area, 3)} m²</b></div><div><span>Substrate</span><b>${n2(subL, 1)} l · ${Math.ceil(subL / s.bag)} bags</b></div><div><span>Glass / panels</span><b>${n2(glass, 2)} m²</b></div></div></div>`;
};
H.volume = (e, el, root) => { const s = st(`vol:${root.dataset.toolKey}`, () => ({})); const t = el?.dataset.t; if (!t || (e.type !== 'change' && e.type !== 'input')) return; if (t === 'enc') { s.enc = el.value; const en = store.get().enclosures.find((x) => x.id === el.value); if (en) Object.assign(s, { w: en.dims.w, d: en.dims.d, h: en.dims.h }); rerenderRoot(root); return; } s[t] = +el.value || 0; if (e.type === 'change') rerenderRoot(root); };

// ---------------- PRICE & MARGIN
R.price = ({ key }) => {
  const s = st(`price:${key}`, () => ({ unit: 1.6, qty: 500, vat: 21, cost: 900, margin: 60 }));
  const net = s.unit * s.qty, gross = net * (1 + s.vat / 100), sale = s.cost * (1 + s.margin / 100);
  return `<div class="tool price"><h6>Price × quantity</h6><div class="grid3"><label class="field"><span>Unit price</span><input type="number" step="any" data-t="unit" value="${s.unit}"></label><label class="field"><span>Quantity</span><input type="number" data-t="qty" value="${s.qty}"></label><label class="field"><span>VAT %</span><input type="number" data-t="vat" value="${s.vat}"></label></div>
    <div class="incu-out"><div><span>Net</span><b>${czk(net)}</b></div><div><span>With VAT</span><b>${czk(gross)}</b></div></div>
    <h6>Sale price from costs</h6><div class="grid2"><label class="field"><span>Cost per animal</span><input type="number" data-t="cost" value="${s.cost}"></label><label class="field"><span>Margin %</span><input type="number" data-t="margin" value="${s.margin}"></label></div>
    <div class="incu-out"><div><span>Suggested price</span><b>${czk(sale)}</b></div><div><span>Profit</span><b>${czk(sale - s.cost)}</b></div></div></div>`;
};
H.price = (e, el, root) => { const s = st(`price:${root.dataset.toolKey}`, () => ({})); const t = el?.dataset.t; if (!t || e.type !== 'change') return; s[t] = +el.value || 0; rerenderRoot(root); };

// ---------------- ELECTRICITY COST
R.energy = ({ key }) => {
  const db = store.get();
  const s = st(`en:${key}`, () => {
    const W = { led: 20, uvb: 54, bask: 50, heat: 28, mist: 0, sensor: 0 }, H = { led: 12, uvb: 10, bask: 8, heat: 16, mist: 0, sensor: 0 };
    const agg = {}; for (const e of db.enclosures) for (const t of e.tech) if (W[t.kind]) { (agg[t.kind] ||= { n: 0 }).n++; }
    return { price: 6.2, rows: Object.entries(agg).map(([k, v]) => ({ k, label: { led: 'LED lights', uvb: 'UVB tubes', bask: 'Basking lamps', heat: 'Heat tape / heaters' }[k], n: v.n, w: W[k], h: H[k] })).concat([{ k: 'pump', label: 'Mist pump', n: 1, w: 24, h: 0.2 }, { k: 'ac', label: 'Dehumidifier', n: 1, w: 210, h: 6 }]) };
  });
  const kwh = s.rows.reduce((a, r) => a + (r.n * r.w * r.h) / 1000, 0);
  return `<div class="tool energy"><table class="tbl mini"><thead><tr><th>Device</th><th class="num">n</th><th class="num">W</th><th class="num">h/day</th><th class="num">kWh/mo</th></tr></thead><tbody>${s.rows.map((r, i) => `<tr><td>${esc(r.label)}</td><td class="num"><input type="number" data-t="n" data-i="${i}" value="${r.n}"></td><td class="num"><input type="number" data-t="w" data-i="${i}" value="${r.w}"></td><td class="num"><input type="number" step="0.5" data-t="h" data-i="${i}" value="${r.h}"></td><td class="num">${n2((r.n * r.w * r.h * 30) / 1000, 1)}</td></tr>`).join('')}</tbody></table>
    <div class="grid2"><label class="field"><span>Price per kWh (Kč)</span><input type="number" step="0.1" data-t="price" value="${s.price}"></label><div class="incu-out"><div><span>Per month</span><b>${n2(kwh * 30, 0)} kWh · ${czk(kwh * 30 * s.price)}</b></div></div></div>
    <p class="muted small">Prefilled from the technical state of your ${db.enclosures.length} enclosures.</p></div>`;
};
H.energy = (e, el, root) => { const s = st(`en:${root.dataset.toolKey}`, () => ({})); const t = el?.dataset.t; if (!t || e.type !== 'change') return; if (t === 'price') s.price = +el.value; else s.rows[+el.dataset.i][t] = +el.value; rerenderRoot(root); };

// ---------------- FEED DEMAND PLANNER (from care plans)
export function feedDemand() {
  const db = store.get(), dem = {};
  for (const p of db.plans.filter((x) => x.active && x.type === 'feeding' && x.stockItem)) { const a = db.animals.find((x) => x.id === p.subject); if (!a || ['sold', 'deceased'].includes(a.status)) continue; dem[p.stockItem] = (dem[p.stockItem] || 0) + ((p.qtyN || 1) * 7) / p.every; }
  // frog cultures: 8 groups fed daily ≈ 0.5 culture per group per week
  const frogPlans = db.plans.filter((x) => x.active && x.type === 'feeding' && /Drosophila/i.test(x.feeder));
  if (frogPlans.length) dem.i_dhyd = (dem.i_dhyd || 0) + frogPlans.length * 0.5;
  return Object.entries(dem).map(([id, w]) => { const it = db.inventory.find((x) => x.id === id); return { id, it, week: w, days: it ? (it.qty / (w / 7)) : 0, order: it ? Math.max(0, Math.ceil(w * 2 - it.qty)) : 0 }; }).filter((x) => x.it);
}
R.feedplan = () => {
  const rows = feedDemand();
  return `<div class="tool feedplan"><table class="tbl mini"><thead><tr><th>Feeder</th><th class="num">per week</th><th class="num">in stock</th><th class="num">lasts</th><th class="num">order (2 wk)</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.it.name)}</td><td class="num">${n2(r.week, 1)} ${esc(r.it.unit)}</td><td class="num">${r.it.qty}</td><td class="num ${r.days < 7 ? 'danger-t' : r.days < 14 ? 'warn-t' : ''}">${n2(r.days, 0)} d</td><td class="num"><b>${r.order || '—'}</b></td></tr>`).join('')}</tbody></table>
    <div class="shop-f"><span class="muted small">From active feeding plans (quantity × frequency).</span><span class="spacer"></span><button class="btn sm primary" data-t="order" ${rows.some((r) => r.order) ? '' : 'disabled'}>${icon('cart')}Add order to shopping list</button></div></div>`;
};
H.feedplan = (e, el) => {
  if (e.type !== 'click' || el?.dataset.t !== 'order') return;
  const rows = feedDemand().filter((r) => r.order);
  const id = ensureListFor('feed');
  const d = doc(id);
  let n = 0; for (const r of rows) { const ex = d.items.find((x) => x.ref === r.id && !x.done); if (ex) ex.qty = Math.max(ex.qty, r.order); else { d.items.push({ id: Math.random().toString(36).slice(2, 8), name: r.it.name, qty: r.order, unit: r.it.unit, price: r.it.price, cat: 'feed', prio: r.days < 7 ? 'h' : 'n', done: false, ref: r.id, note: 'from feed planner' }); n++; } }
  d.updated = Date.now(); saveWs();
  toast(`${n ? `Added ${n}` : 'Updated'} feed order on “${d.title}”`, { action: () => import('./tooldrawer.js').then((m) => m.openToolDrawer('shopping', id)), actionLabel: 'Open list' });
};

// ---------------- STOCK COUNT
R.stockcount = ({ key }) => {
  const db = store.get(), s = st(`sc:${key}`, () => ({ cat: 'live', counts: {} }));
  const items = db.inventory.filter((i) => i.cat === s.cat);
  const changed = Object.keys(s.counts).length;
  return `<div class="tool stockcount"><div class="chips">${['live', 'frozen', 'supplement', 'equipment', 'substrate'].map((c) => `<button class="chip ${s.cat === c ? 'on' : ''}" data-t="cat" data-v="${c}">${c}</button>`).join('')}</div>
    <ul class="sc-l">${items.map((i) => { const v = s.counts[i.id] ?? i.qty; return `<li class="${v !== i.qty ? 'chg' : ''}"><span class="sc-n"><b>${esc(i.name)}</b><em>${i.qty} ${esc(i.unit)} recorded${i.qty < i.min ? ' · low' : ''}</em></span><span class="num-in sm"><button data-t="dec" data-id="${i.id}">${icon('minus')}</button><input type="number" data-t="set" data-id="${i.id}" value="${v}"><button data-t="inc" data-id="${i.id}">${icon('plus')}</button></span></li>`; }).join('')}</ul>
    <div class="shop-f"><span class="muted">${changed ? `${changed} changed` : 'Adjust counts, then save'}</span><span class="spacer"></span><button class="btn sm primary" data-t="save" ${changed ? '' : 'disabled'}>${icon('check')}Save count</button></div></div>`;
};
H.stockcount = (e, el, root) => {
  const s = st(`sc:${root.dataset.toolKey}`, () => ({ cat: 'live', counts: {} })), t = el?.dataset.t; if (!t) return;
  const db = store.get(), it = db.inventory.find((x) => x.id === el.dataset.id);
  const step = it && it.qty > 50 ? 10 : 1;
  if (e.type === 'click' && t === 'cat') { s.cat = el.dataset.v; rerenderRoot(root); }
  if (e.type === 'click' && (t === 'inc' || t === 'dec')) { const v = (s.counts[it.id] ?? it.qty) + (t === 'inc' ? step : -step); s.counts[it.id] = Math.max(0, v); if (s.counts[it.id] === it.qty) delete s.counts[it.id]; rerenderRoot(root); }
  if (e.type === 'change' && t === 'set') { s.counts[it.id] = Math.max(0, +el.value); if (s.counts[it.id] === it.qty) delete s.counts[it.id]; rerenderRoot(root); }
  if (e.type === 'click' && t === 'save') { const n = Object.keys(s.counts).length; for (const [id, q] of Object.entries(s.counts)) A.setStock(id, q); s.counts = {}; toast(`Stock count saved · ${n} items`, { undo: () => { for (let i = 0; i < n; i++) store.undo(); } }); }
};

// ---------------- EXPO PRICE LIST
R.pricelist = () => {
  const db = store.get(), list = db.animals.filter((a) => a.status === 'for-sale');
  const txt = list.map((a) => `${a.code} · ${latin(SPECIES[a.species])}${a.morph ? ` ${a.morph}` : ''} · ${a.sex === 'm' ? '1.0' : a.sex === 'f' ? '0.1' : '0.0.1'} · ${ageText(a.born)} · ${a.price?.toLocaleString('cs-CZ')} Kč`).join('\n');
  return `<div class="tool pricelist"><ul class="pl-l">${list.map((a) => `<li><img src="${imgFor(a)}" alt="" loading="lazy"><span><b class="code">${esc(a.code)}</b> <i class="latin">${esc(latin(SPECIES[a.species]))}</i><em>${esc(a.morph || '')} · ${a.sex === 'm' ? '♂' : a.sex === 'f' ? '♀' : 'unsexed'} · ${ageText(a.born)}</em></span><b class="mono">${a.price?.toLocaleString('cs-CZ')} Kč</b></li>`).join('') || '<li class="muted">No animals marked for sale.</li>'}</ul>
    <textarea readonly class="pl-txt" rows="3" aria-label="Price list text">${esc(txt)}</textarea><div class="shop-f"><button class="btn sm primary" data-t="copy">${icon('copy')}Copy price list</button><button class="btn sm" data-t="print">${icon('printer')}Print</button></div></div>`;
};
H.pricelist = (e, el, root) => { if (e.type !== 'click') return; if (el?.dataset.t === 'copy') navigator.clipboard?.writeText(root.querySelector('.pl-txt').value).then(() => toast('Price list copied', { kind: 'info', ms: 2000 }), () => toast('Copy not available here', { kind: 'warn' })); if (el?.dataset.t === 'print') printSheet('Price list', root.querySelector('.pl-l').outerHTML); };

// ---------------- LABEL PRINTER
R.labels = ({ key }) => {
  const db = store.get(), s = st(`lab:${key}`, () => ({ sel: new Set(db.animals.filter((a) => a.status === 'active').slice(0, 6).map((a) => a.id)) }));
  const list = db.animals.filter((a) => !['sold', 'deceased'].includes(a.status));
  return `<div class="tool labels"><ul class="lb-l">${list.map((a) => `<li><label><input type="checkbox" class="cb" data-t="sel" data-id="${a.id}" ${s.sel.has(a.id) ? 'checked' : ''}><span class="code">${esc(a.code)}</span><i class="latin">${esc(latin(SPECIES[a.species]))}</i></label></li>`).join('')}</ul>
    <div class="shop-f"><span class="muted">${s.sel.size} labels · 70 × 36 mm</span><span class="spacer"></span><button class="btn sm primary" data-t="print" ${s.sel.size ? '' : 'disabled'}>${icon('printer')}Print labels</button></div></div>`;
};
H.labels = (e, el, root) => {
  const s = st(`lab:${root.dataset.toolKey}`, () => ({ sel: new Set() })), t = el?.dataset.t; if (!t) return;
  if (e.type === 'change' && t === 'sel') { el.checked ? s.sel.add(el.dataset.id) : s.sel.delete(el.dataset.id); rerenderRoot(root); }
  if (e.type === 'click' && t === 'print') { const db = store.get(); printSheet('Enclosure labels', `<div class="labels-sheet">${[...s.sel].map((id) => { const a = db.animals.find((x) => x.id === id), sp = SPECIES[a.species], e2 = db.enclosures.find((x) => x.id === a.enclosureId); return `<div class="lbl"><b>${esc(a.code)}</b><i>${esc(latin(sp))}</i><span>${esc(sp.cz)}</span><span>${a.kind === 'group' ? `${a.sexes.m}.${a.sexes.f}.${a.sexes.u}` : a.sex === 'm' ? '1.0' : a.sex === 'f' ? '0.1' : '0.0.1'} · hatched ${a.born ? dShort(a.born) : '—'}${e2 ? ` · ${esc(e2.code)}` : ''}</span></div>`; }).join('')}</div>`); }
};
function printSheet(title, html) {
  const w = window.open('', '_blank', 'width=800,height=900'); if (!w) { toast('Pop-up blocked — allow pop-ups to print', { kind: 'warn' }); return; }
  w.document.write(`<!doctype html><title>${esc(title)}</title><style>body{font:12px system-ui;margin:16px}h1{font-size:16px}.labels-sheet{display:grid;grid-template-columns:repeat(3,70mm);gap:4mm}.lbl{border:1px solid #333;border-radius:3mm;height:36mm;padding:3mm;display:grid;align-content:start;gap:1mm}.lbl b{font:700 16px monospace}.lbl i{font-family:Georgia,serif}ul{list-style:none;padding:0}li{display:flex;gap:10px;align-items:center;border-bottom:1px solid #ccc;padding:6px 0}li img{width:40px;height:40px;object-fit:cover;border-radius:6px}</style><h1>${esc(title)}</h1>${html}<script>setTimeout(()=>print(),300)<\/script>`);
  w.document.close();
}

// ---------------- QUICK LINKS
R.links = ({ docId, key }) => {
  const db = store.get(), d = st(`links:${key}`, () => ({}));
  const list = [
    ...db.favorites.slice(0, 4).map((id) => { const a = db.animals.find((x) => x.id === id); return a && { href: `#/animals/a/${a.id}`, icon: 'star', label: a.code, sub: a.name || SPECIES[a.species].common, img: imgFor(a) }; }).filter(Boolean),
    ...db.clutches.filter((c) => c.status === 'incubating').slice(0, 2).map((c) => ({ href: `#/reproduction/clutch/${c.id}`, icon: 'egg', label: c.code, sub: `day ${daysBetween(c.laid, Date.now())}` })),
    { href: '#/directory/all/c_sup1', icon: 'truck', label: 'FeederFarm CZ', sub: 'Supplier' }, { href: '#/finance/overview', icon: 'finance', label: 'Finance', sub: 'This month' },
    { href: '#/enclosures/habitat', icon: 'cube', label: 'Habitat Studio', sub: 'Room planner' }, { href: '#/genetics/calculator', icon: 'genetics', label: 'Genetics', sub: 'Calculator' },
  ];
  return `<div class="tool links"><div class="ql">${list.map((l) => `<a class="ql-i" href="${l.href}">${l.img ? `<img src="${l.img}" alt="" loading="lazy">` : `<span class="ql-ico">${icon(l.icon)}</span>`}<span><b>${esc(l.label)}</b><em>${esc(l.sub)}</em></span></a>`).join('')}</div><p class="muted small">Favourites follow the ☆ on animal profiles.</p></div>`;
};
H.links = () => {};

// ---------------- helpers used by inventory / notifications / feed planner
export function ensureListFor(kind = 'feed') {
  const lists = docsOf('shopping');
  const hit = lists.find((l) => (kind === 'feed' ? /feed/i.test(l.title) : /equip/i.test(l.title))) || lists[0];
  if (hit) return hit.id;
  return newDoc('shopping', { title: kind === 'feed' ? 'FEED ORDER' : 'EQUIPMENT', accent: kind === 'feed' ? 'amber' : 'blue' });
}
export function addLowStockToShopping() {
  const db = store.get(), low = db.inventory.filter((x) => x.qty < x.min);
  let n = 0;
  for (const it of low) {
    const id = ensureListFor(it.cat === 'equipment' || it.cat === 'substrate' ? 'equipment' : 'feed'), d = doc(id);
    if (d.items.some((x) => x.ref === it.id && !x.done)) continue;
    d.items.push({ id: Math.random().toString(36).slice(2, 8), name: it.name, qty: Math.max(1, it.reorder - it.qty), unit: it.unit, price: it.price, cat: it.cat === 'live' || it.cat === 'frozen' ? 'feed' : it.cat, prio: it.qty === 0 ? 'h' : 'n', done: false, ref: it.id, note: `stock ${it.qty}/${it.min}` }); d.updated = Date.now(); n++;
  }
  saveWs(); return n;
}
export function addItemToShopping(itemId) {
  const db = store.get(), it = db.inventory.find((x) => x.id === itemId); if (!it) return null;
  const id = ensureListFor(it.cat === 'equipment' || it.cat === 'substrate' ? 'equipment' : 'feed'), d = doc(id);
  const ex = d.items.find((x) => x.ref === it.id && !x.done);
  if (ex) return { id, dup: true, title: d.title };
  d.items.push({ id: Math.random().toString(36).slice(2, 8), name: it.name, qty: Math.max(1, it.reorder - it.qty), unit: it.unit, price: it.price, cat: it.cat === 'live' || it.cat === 'frozen' ? 'feed' : it.cat, prio: it.qty < it.min ? 'h' : 'n', done: false, ref: it.id }); d.updated = Date.now(); saveWs();
  return { id, title: d.title };
}
export { wsStatus };
