// FINANCE — PŘÍJMY · VÝDAJE · VÝSLEDEK · NÁKLADY CHOVU; 12 měsíců, výdaje podle kategorie, záznamy.
import { esc, actions } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { panel, close as closeOv } from '../core/overlay.js';
import { SPECIES, latin } from '../data/species.js';
import { pageHead, block, money, avatar } from '../ui/components.js';
import { done } from '../ui/feedback.js';
import { monthAgg, months12 } from '../widgets/registry.js';
import { workspaceHTML, mountWorkspace } from '../widgets/workspace.js';
import { DAY, dShort, dMonth, toDateInput } from '../core/time.js';

const KIND = { income: ['Příjem', 'ok'], expense: ['Výdaj', 'mute'], deposit: ['Záloha', 'info'] };
const F = { kind: '', q: '' };

function overview() {
  const db = store.get(), f = monthAgg(0), p = monthAgg(1), res = f.inc - f.exp, careCats = ['Krmivo', 'Veterina', 'Energie', 'Technika'];
  const care = careCats.reduce((s, c) => s + (f.byCat[c] || 0), 0), heads = db.animals.filter((a) => !['sold', 'deceased'].includes(a.status)).reduce((s, a) => s + (a.kind === 'group' ? a.count : 1), 0);
  const y = months12(), yExp = {}; for (const m of y) for (const [k, v] of Object.entries(m.byCat)) yExp[k] = (yExp[k] || 0) + v;
  const yTot = Object.values(yExp).reduce((a, b) => a + b, 0) || 1;
  const trend = (a, b) => (b ? `${a >= b ? '▲' : '▼'} ${Math.abs(Math.round(((a - b) / b) * 100))} % vs. minulý měsíc` : 'minulý měsíc bez dat');
  return `<div class="kpis k4">
    <div class="kpi plain"><span class="kpi-l">Příjmy · ${dMonth(Date.now())}</span><b class="kpi-v ok-t">${money(f.inc)}</b><span class="kpi-s">${trend(f.inc, p.inc)}</span>${ico('finance', 'md kpi-ico')}</div>
    <div class="kpi plain"><span class="kpi-l">Výdaje</span><b class="kpi-v">${money(f.exp)}</b><span class="kpi-s">${trend(f.exp, p.exp)}</span>${ico('inventory', 'md kpi-ico')}</div>
    <div class="kpi plain ${res < 0 ? 'warn' : ''}"><span class="kpi-l">Výsledek</span><b class="kpi-v ${res >= 0 ? 'ok-t' : ''}">${res >= 0 ? '+' : '−'}${money(Math.abs(res))}</b><span class="kpi-s">zálohy ${money(f.dep)} (mimo výsledek)</span>${ico(res >= 0 ? 'status-ok' : 'status-warning', 'md kpi-ico')}</div>
    <div class="kpi plain"><span class="kpi-l">Náklady chovu</span><b class="kpi-v">${money(care)}</b><span class="kpi-s">≈ ${money(care / Math.max(1, heads))} na zvíře · krmivo, veterina, energie, technika</span>${ico('care', 'md kpi-ico')}</div>
  </div>
  <div class="g-main"><div class="stack">${workspaceHTML('finance', { editLabel: 'UPRAVIT' })}</div>
  <div class="stack">${block('Výdaje podle kategorie · 12 měsíců', `<div class="sv-bars">${Object.entries(yExp).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div><span>${esc(k)}</span><i style="transform:scaleX(${(v / yTot).toFixed(3)})"></i><em>${money(v)}</em></div>`).join('')}</div>`, { icon: 'finance', level: 'secondary' })}
    ${block('Poslední pohyby', `<div class="list">${db.finance.slice().sort((a, b) => b.t - a.t).slice(0, 7).map((x) => `<div class="li"><span class="mv ${x.kind === 'expense' ? 'out' : 'in'}">${x.kind === 'expense' ? '−' : '+'}${Math.round(x.amount).toLocaleString('cs-CZ')}</span><span class="li-main"><b>${esc(x.cat)}</b><span>${esc(x.note || '')}</span></span><em class="muted small">${dShort(x.t)}</em></div>`).join('')}</div>`, { icon: 'clock-action', level: 'detail', actions: `<a class="btn sm tertiary" href="#/finance/zaznamy">Vše</a>` })}</div></div>`;
}
function records() {
  const db = store.get(), q = F.q.toLowerCase(), L = db.finance.filter((x) => (!F.kind || x.kind === F.kind) && (!q || `${x.cat} ${x.note}`.toLowerCase().includes(q))).sort((a, b) => b.t - a.t);
  return `<div class="pl-bar"><label class="searchbox">${gl('search')}<input type="search" id="fi-q" value="${esc(F.q)}" data-input="fi-q" placeholder="Hledat…" aria-label="Hledat"></label><div class="seg">${[['', 'Vše'], ['income', 'Příjmy'], ['expense', 'Výdaje'], ['deposit', 'Zálohy']].map(([k, l]) => `<button class="${F.kind === k ? 'on' : ''}" data-act="fi-kind" data-v="${k}">${l}</button>`).join('')}</div><span class="spacer"></span><span class="muted small">${L.length} záznamů · součet ${money(L.reduce((s, x) => s + (x.kind === 'expense' ? -x.amount : x.amount), 0))}</span></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Datum</th><th>Typ</th><th>Kategorie</th><th>Popis</th><th>Kontakt</th><th class="num">Částka</th></tr></thead><tbody>${L.map((x) => `<tr><td class="mono">${dShort(x.t)}</td><td><span class="pill ${KIND[x.kind][1]}">${KIND[x.kind][0]}</span></td><td>${esc(x.cat)}</td><td class="muted">${esc(x.note || '')}</td><td class="muted">${esc(db.contacts.find((c) => c.id === x.contact)?.name || '—')}</td><td class="num ${x.kind === 'expense' ? '' : 'ok-t'}"><b>${x.kind === 'expense' ? '−' : '+'}${money(x.amount)}</b></td></tr>`).join('')}</tbody></table></div>`;
}
function addRecord() {
  const cats = ['Krmivo', 'Technika', 'Veterina', 'Energie', 'Burzy', 'Prodej', 'Záloha', 'Ostatní'];
  const h = panel({ title: 'Nový finanční záznam', icon: 'plus', width: 440, body: `<div class="stack"><div class="seg" data-k>${Object.entries(KIND).map(([k, [l]], i) => `<button class="${i === 1 ? 'on' : ''}" data-kind="${k}">${l}</button>`).join('')}</div><div class="fields two"><label class="field"><span>Částka (Kč)</span><input class="input" type="number" data-f="amount" autofocus></label><label class="field"><span>Datum</span><input class="input" type="date" data-f="t" value="${toDateInput(Date.now())}"></label></div><label class="field"><span>Kategorie</span><select class="select" data-f="cat">${cats.map((c) => `<option>${c}</option>`).join('')}</select></label><label class="field"><span>Popis</span><input class="input" data-f="note" placeholder="např. Dubia 500 ks"></label></div>`, footer: `<span class="spacer"></span><button class="btn tertiary" data-close>Zrušit</button><button class="btn primary" data-ok>${gl('check')}Uložit</button>` });
  let kind = 'expense';
  h.el.querySelector('[data-k]').onclick = (e) => { const b = e.target.closest('[data-kind]'); if (!b) return; kind = b.dataset.kind; h.el.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('on', x === b)); };
  const v = (k) => h.el.querySelector(`[data-f=${k}]`).value;
  h.el.querySelector('[data-ok]').onclick = () => { const amount = +v('amount'); if (!amount) return h.el.querySelector('[data-f=amount]').focus(); store.mutate(`${KIND[kind][0]} ${money(amount)}`, (d) => d.finance.push({ id: `f_${Date.now().toString(36)}`, t: new Date(v('t')).getTime() + 12 * 3600e3, kind, cat: v('cat'), amount, note: v('note') })); closeOv(h); done({ label: `Zapsáno: ${KIND[kind][0].toLowerCase()} ${money(amount)}` }); };
}
export function render(r) {
  const db = store.get();
  return `${pageHead({ mod: 'finance', cur: r.sub, sub: `${dMonth(Date.now())} · ${db.sales.filter((s) => s.status === 'reserved').length} rezervace se zálohou · ${db.sales.filter((s) => s.status === 'for-sale').length} zvířata na prodej`, tabs: [['prehled', 'Přehled'], ['zaznamy', 'Záznamy', db.finance.length]], actions: `<button class="btn primary" data-act="fi-add">${gl('plus')}Nový záznam</button>` })}${r.sub === 'zaznamy' ? records() : overview()}`;
}
export function mount(host) { mountWorkspace(host); }
export function onNew() { addRecord(); }
actions({ 'fi-add': () => addRecord(), 'fi-kind': (el) => { F.kind = el.dataset.v; store.emit('change'); }, 'fi-q': (el) => { F.q = el.value; store.emit('change'); } });
