// FINANCE — breeder-scale bookkeeping: income, expenses, deposits; per-animal links; month view; calculators.
import { esc, actions, uid } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { panel, close as closeOv } from '../core/overlay.js';
import { empty, kpi, money, bars } from '../ui/components.js';
import { done } from '../ui/feedback.js';
import { workspaceHTML, mountWorkspace } from '../widgets/workspace.js';
import { renderTool } from '../widgets/tools.js';
import { DAY, dShort, monthName } from '../core/time.js';

const F = { kind: '', cat: '', q: '' };
const CATS = ['Feed', 'Equipment', 'Veterinary', 'Energy', 'Expo', 'Sale', 'Deposit', 'Other'];
function months(n = 12) {
  const db = store.get(), now = new Date(), out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1), e = new Date(d.getFullYear(), d.getMonth() + 1, 1); const L = db.finance.filter((f) => f.t >= +d && f.t < +e); out.push({ d, inc: L.filter((f) => f.kind === 'income').reduce((s, f) => s + f.amount, 0), exp: L.filter((f) => f.kind === 'expense').reduce((s, f) => s + f.amount, 0), dep: L.filter((f) => f.kind === 'deposit').reduce((s, f) => s + f.amount, 0), L }); }
  return out;
}
export function context() {
  return { sub: 'Income · expenses · deposits (CZK)', actions: [{ label: 'Expense', icon: 'minus', act: 'fi-new', data: { kind: 'expense' }, hideM: true }, { label: 'Income', icon: 'plus', act: 'fi-new', data: { kind: 'income' }, primary: true, kbd: 'N' }] };
}
export function onNew() { openTx('expense'); }
export function render(r) {
  const sub = r.sub || 'overview';
  if (sub === 'transactions') return txList();
  if (sub === 'monthly') return monthly();
  if (sub === 'tools') return `<div class="calc-page">${['calculator', 'price', 'energy', 'converter'].map((k) => `<section class="card"><div class="card-b" id="fi-t-${k}"></div></section>`).join('')}</div>`;
  return overview();
}
export function mount(root, r) {
  mountWorkspace(root);
  for (const k of ['calculator', 'price', 'energy', 'converter']) { const el = root.querySelector(`#fi-t-${k}`); if (el) renderTool(el, k, { key: `fi-${k}`, ctx: 'finance' }); }
}
function overview() {
  const M = months(12), cur = M[M.length - 1], prev = M[M.length - 2], yr = M.reduce((s, m) => ({ inc: s.inc + m.inc, exp: s.exp + m.exp }), { inc: 0, exp: 0 });
  const db = store.get(), dep = db.sales.filter((s) => s.status === 'reserved').reduce((s, x) => s + (x.deposit || 0), 0);
  return `<div class="rp"><div class="kpis">${kpi({ label: `${monthName(cur.d.getMonth())} result`, value: money(cur.inc - cur.exp), sub: `${money(cur.inc)} in · ${money(cur.exp)} out`, artKey: 'finance', tone: cur.inc - cur.exp >= 0 ? '' : 'amber' })}${kpi({ label: '12-month result', value: money(yr.inc - yr.exp), sub: `${money(yr.inc)} income`, artKey: 'finance' })}${kpi({ label: 'Deposits held', value: money(dep), sub: `${db.sales.filter((s) => s.status === 'reserved').length} reservations`, artKey: 'finance', href: '#/sales/reserved' })}${kpi({ label: 'Expenses vs last month', value: `${prev.exp ? Math.round(((cur.exp - prev.exp) / prev.exp) * 100) : 0} %`, sub: `${money(prev.exp)} in ${monthName(prev.d.getMonth())}`, artKey: 'finance' })}</div>
    ${workspaceHTML('finance', { title: 'Finance workspace' })}</div>`;
}
function txList() {
  const db = store.get(); let L = db.finance.slice().sort((a, b) => b.t - a.t);
  if (F.kind) L = L.filter((f) => f.kind === F.kind);
  if (F.cat) L = L.filter((f) => f.cat === F.cat);
  if (F.q) L = L.filter((f) => `${f.note} ${f.cat}`.toLowerCase().includes(F.q.toLowerCase()));
  const tot = L.reduce((s, f) => s + (f.kind === 'expense' ? -f.amount : f.amount), 0);
  return `<div class="toolbar"><div class="search-in"><span>${icon('search')}</span><input id="fi-q" type="search" placeholder="Search note, category…" value="${esc(F.q)}" data-input="fi-q"></div><div class="an-chips">${[['', 'All'], ['income', 'Income'], ['expense', 'Expenses'], ['deposit', 'Deposits']].map(([v, l]) => `<button class="chip ${F.kind === v ? 'on' : ''}" data-act="fi-kind" data-v="${v}">${l}</button>`).join('')}</div><div class="an-chips">${['', ...CATS].map((c) => `<button class="chip ${F.cat === c ? 'on' : ''}" data-act="fi-cat" data-v="${c}">${c || 'Any category'}</button>`).join('')}</div><span class="spacer"></span><b class="${tot < 0 ? 'danger-t' : 'ok-t'}">${money(tot)}</b></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Note</th><th>Link</th><th class="num">Amount</th></tr></thead><tbody>${L.map((f) => { const a = f.animal && db.animals.find((x) => x.id === f.animal), c = f.contact && db.contacts.find((x) => x.id === f.contact); return `<tr><td class="mono">${dShort(f.t)}</td><td><span class="pill ${f.kind === 'income' ? 'ok' : f.kind === 'deposit' ? 'info' : 'mute'}">${f.kind}</span></td><td>${esc(f.cat)}</td><td>${esc(f.note)}</td><td>${a ? `<a class="code" href="#/animals/a/${a.id}">${esc(a.code)}</a> ` : ''}${c ? `<a href="#/directory/all/${c.id}" class="dim">${esc(c.org || c.name)}</a>` : ''}</td><td class="num ${f.kind === 'expense' ? 'danger-t' : 'ok-t'}"><b>${f.kind === 'expense' ? '−' : '+'}${money(f.amount)}</b></td></tr>`; }).join('')}</tbody></table></div>`;
}
function monthly() {
  const M = months(12);
  const cats = {}; for (const m of M) for (const f of m.L.filter((x) => x.kind === 'expense')) cats[f.cat] = (cats[f.cat] || 0) + f.amount;
  const totE = Object.values(cats).reduce((s, v) => s + v, 0);
  return `<div class="pf-grid"><section class="card span-8"><header class="card-h"><span class="card-ico">${icon('barChart')}</span><h3>Income vs expenses</h3><span class="card-sub">12 months</span></header><div class="card-b">${bars([M.map((m) => m.inc), M.map((m) => m.exp)], M.map((m) => monthName(m.d.getMonth()).slice(0, 3)), { h: 220, names: ['Income', 'Expenses'], fmt: (v) => money(v) })}</div></section>
    <section class="card span-4"><header class="card-h"><span class="card-ico">${icon('pieChart')}</span><h3>Where money goes</h3></header><div class="card-b">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="cat-r"><span>${esc(k)}</span><b>${money(v)}</b><div class="life wide"><i style="width:${(v / totE) * 100}%"></i></div></div>`).join('')}</div></section>
    <section class="card span-12"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th class="num">Income</th><th class="num">Expenses</th><th class="num">Deposits</th><th class="num">Result</th></tr></thead><tbody>${M.slice().reverse().map((m) => `<tr><td>${monthName(m.d.getMonth())} ${m.d.getFullYear()}</td><td class="num ok-t">${money(m.inc)}</td><td class="num">${money(m.exp)}</td><td class="num dim">${money(m.dep)}</td><td class="num"><b class="${m.inc - m.exp < 0 ? 'danger-t' : ''}">${money(m.inc - m.exp)}</b></td></tr>`).join('')}</tbody></table></div></section></div>`;
}
function openTx(kind) {
  const S = { kind, cat: kind === 'income' ? 'Sale' : 'Feed', amount: '', note: '' };
  const h = panel({ title: kind === 'income' ? 'Income' : 'Expense', sub: 'Today · CZK', icon: 'finance', body: `<div class="field"><label>Amount</label><div class="num-in"><input type="number" inputmode="decimal" data-k="amount" placeholder="0" autofocus><em>Kč</em></div></div>
    <div class="field"><label>Category</label><div class="chips wrap">${CATS.map((c) => `<button class="chip ${S.cat === c ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('')}</div></div><div class="field"><label>Note</label><input data-k="note" placeholder="e.g. FeederFarm order"></div>`,
    footer: `<button class="btn primary lg" data-save>${icon('check')}Save</button>` });
  h.el.addEventListener('input', (e) => { const k = e.target.dataset.k; if (k) S[k] = e.target.value; });
  h.el.addEventListener('keydown', (e) => { if (e.key === 'Enter') h.el.querySelector('[data-save]').click(); });
  h.el.addEventListener('click', (e) => { const c = e.target.closest('[data-cat]'); if (c) { S.cat = c.dataset.cat; h.el.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('on', b === c)); }
    if (e.target.closest('[data-save]')) { if (!(+S.amount > 0)) { h.el.querySelector('[data-k=amount]').focus(); return; } store.mutate(`${kind === 'income' ? 'Income' : 'Expense'} saved`, (d) => d.finance.push({ id: uid('f'), t: Date.now(), kind, cat: S.cat, amount: +S.amount, note: S.note || S.cat })); closeOv(h); done({ label: `${money(+S.amount)} ${kind} saved` }); } });
}
actions({
  'fi-new': (el) => openTx(el.dataset.kind),
  'fi-kind': (el) => { F.kind = el.dataset.v; store.emit('change'); },
  'fi-cat': (el) => { F.cat = el.dataset.v; store.emit('change'); },
  'fi-q': (el) => { F.q = el.value; store.emit('change'); },
});
