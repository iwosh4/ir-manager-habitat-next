// INVENTORY — stock linked to feeding plans (automatic deduction), quick ± steppers, reorder → shopping list.
import { esc, actions } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { toast } from '../core/overlay.js';
import * as A from '../engine/actions.js';
import { empty, kpi, money } from '../ui/components.js';
import { workspaceHTML, mountWorkspace } from '../widgets/workspace.js';
import { renderTool, feedDemand, addLowStockToShopping, addItemToShopping } from '../widgets/tools.js';
import { openToolDrawer } from '../widgets/tooldrawer.js';
import { docsOf } from '../widgets/wsstore.js';
import { DAY, rel, dShort, hm } from '../core/time.js';

const CATS = [['', 'All'], ['live', 'Live feed'], ['frozen', 'Frozen'], ['supplement', 'Supplements'], ['equipment', 'Equipment'], ['substrate', 'Substrate']];
const F = { cat: '', q: '', low: false };
const itemImg = (i) => (i.img ? `<img src="assets/img/${i.img}" alt="" loading="lazy">` : `<span class="inv-ico">${icon(i.icon || 'inventory')}</span>`);

export function context() {
  const db = store.get(), low = db.inventory.filter((x) => x.qty < x.min).length;
  return { counts: { stock: db.inventory.length, shopping: docsOf('shopping').reduce((s, d) => s + d.items.filter((x) => !x.done).length, 0) || null }, sub: `${db.inventory.length} items · ${low} below minimum · stock value ${money(db.inventory.reduce((s, i) => s + i.qty * i.price, 0))}`,
    actions: [{ label: 'Stock count', icon: 'clipboard', act: 'iv-count', hideM: true }, { label: 'Low → shopping', icon: 'cart', act: 'iv-lowshop', primary: true }] };
}
export function render(r) {
  const sub = r.sub || 'overview';
  if (sub === 'stock') return stock();
  if (sub === 'transactions') return transactions();
  if (sub === 'shopping') return '<div class="tool-page card"><div class="card-b" id="iv-shop"></div></div>';
  return overview();
}
export function mount(root, r) {
  mountWorkspace(root);
  const fp = root.querySelector('#iv-fp'); if (fp) renderTool(fp, 'feedplan', { key: 'iv-fp', ctx: 'inventory' });
  const s = root.querySelector('#iv-shop'); if (s) { const id = docsOf('shopping')[0]?.id; if (id) renderTool(s, 'shopping', { key: 'iv-shop', docId: id, ctx: 'inventory' }); else s.innerHTML = '<p class="muted">No shopping lists yet — create one from the Multitool.</p>'; }
}
function overview() {
  const db = store.get(), low = db.inventory.filter((x) => x.qty < x.min), dem = feedDemand();
  const spent = db.finance.filter((f) => f.kind === 'expense' && f.cat === 'Feed' && f.t > Date.now() - 30 * DAY).reduce((s, f) => s + f.amount, 0);
  return `<div class="rp"><div class="kpis">${kpi({ label: 'Below minimum', value: low.length, sub: low.map((x) => x.name.split(' (')[0]).slice(0, 3).join(', '), img: 'assets/img/feeders/dubia-macro.webp', tone: low.length ? 'amber' : '', href: '#/inventory/stock' })}${kpi({ label: 'Feed runs out first', value: dem.length ? `${Math.floor(Math.min(...dem.map((d) => d.days)))} d` : '—', sub: dem.sort((a, b) => a.days - b.days)[0]?.it?.name || '', img: 'assets/img/feeders/cricket.webp' })}${kpi({ label: 'Feed spend · 30 d', value: money(spent), sub: 'from Finance', img: 'assets/img/feeders/dubia.webp', href: '#/finance/transactions' })}${kpi({ label: 'Supplements', value: db.inventory.filter((i) => i.cat === 'supplement' && i.unit === 'jar').length, sub: 'jars in rotation', img: 'assets/img/feeders/jar-dendrocare.webp' })}</div>
    <div class="pf-grid"><section class="card span-7"><header class="card-h"><span class="card-ico">${icon('alert')}</span><h3>Reorder now</h3><span class="card-a"><button class="btn sm primary" data-act="iv-lowshop">${icon('cart')}All to shopping list</button></span></header><div class="card-b">${low.map(row).join('') || '<p class="muted">Everything is above minimum.</p>'}</div></section>
      <section class="card span-5"><header class="card-h"><span class="card-ico">${icon('feed')}</span><h3>Feed demand</h3><span class="card-sub">from care plans</span></header><div class="card-b" id="iv-fp"></div></section></div>
    ${workspaceHTML('inventory', { title: 'Inventory workspace' })}</div>`;
}
function row(i) {
  const pct = Math.min(100, (i.qty / Math.max(i.min * 2, 1)) * 100), step = i.qty > 50 ? 10 : 1;
  return `<div class="inv-row ${i.qty < i.min ? 'low' : ''}">${itemImg(i)}<span class="li-main"><b>${esc(i.name)}</b><span>${i.qty} ${esc(i.unit)} · min ${i.min} · ${money(i.price)}/${esc(i.unit)}</span><span class="lvl"><i style="width:${pct}%"></i><em style="left:${Math.min(100, (i.min / Math.max(i.min * 2, 1)) * 100)}%"></em></span></span>
    <div class="num-in sm"><button data-act="iv-adj" data-id="${i.id}" data-d="-${step}" aria-label="Remove ${step}">−</button><b>${i.qty}</b><button data-act="iv-adj" data-id="${i.id}" data-d="${step}" aria-label="Add ${step}">+</button></div>
    <button class="icon-btn sm" data-act="iv-shop" data-id="${i.id}" title="Add to shopping list">${icon('cart')}</button></div>`;
}
function stock() {
  const db = store.get(); let L = db.inventory;
  if (F.cat) L = L.filter((i) => i.cat === F.cat);
  if (F.low) L = L.filter((i) => i.qty < i.min);
  if (F.q) L = L.filter((i) => i.name.toLowerCase().includes(F.q.toLowerCase()));
  const linked = (id) => db.plans.filter((p) => p.stockItem === id && p.active).length;
  return `<div class="toolbar"><div class="search-in"><span>${icon('search')}</span><input id="iv-q" type="search" placeholder="Search stock…" value="${esc(F.q)}" data-input="iv-q"></div><div class="an-chips">${CATS.map(([v, l]) => `<button class="chip ${F.cat === v ? 'on' : ''}" data-act="iv-cat" data-v="${v}">${l}</button>`).join('')}<button class="chip ${F.low ? 'on' : ''}" data-act="iv-low">${icon('alert')}Below minimum</button></div></div>
    <div class="tbl-wrap"><table class="tbl inv-tbl"><thead><tr><th></th><th>Item</th><th>Category</th><th class="num">Stock</th><th class="num">Min</th><th class="num">Price</th><th class="num">Value</th><th>Auto-deduct</th><th></th></tr></thead><tbody>
    ${L.map((i) => `<tr class="${i.qty < i.min ? 'low' : ''}"><td class="c-photo">${itemImg(i)}</td><td><b>${esc(i.name)}</b>${i.note ? `<br><span class="dim small">${esc(i.note)}</span>` : ''}</td><td class="dim">${esc(i.cat)}</td><td class="num"><div class="num-in sm"><button data-act="iv-adj" data-id="${i.id}" data-d="-${i.qty > 50 ? 10 : 1}">−</button><input type="number" value="${i.qty}" data-change="iv-set" data-id="${i.id}" aria-label="Stock of ${esc(i.name)}"><button data-act="iv-adj" data-id="${i.id}" data-d="${i.qty > 50 ? 10 : 1}">+</button></div></td><td class="num">${i.min}</td><td class="num">${money(i.price)}</td><td class="num">${money(i.qty * i.price)}</td><td>${linked(i.id) ? `<span class="org auto">${icon('bolt')}${linked(i.id)} plans</span>` : '<span class="dim">—</span>'}</td><td><button class="icon-btn sm" data-act="iv-shop" data-id="${i.id}" title="Add to shopping list">${icon('cart')}</button></td></tr>`).join('')}</tbody></table></div>`;
}
function transactions() {
  const db = store.get(), list = db.stock.slice().sort((a, b) => b.t - a.t);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Item</th><th class="num">Change</th><th>Reason</th></tr></thead><tbody>${list.map((m) => { const it = db.inventory.find((x) => x.id === m.item); return `<tr><td class="mono">${dShort(m.t)} ${hm(m.t)}</td><td>${esc(it?.name || m.item)}</td><td class="num ${m.delta < 0 ? 'danger-t' : 'ok-t'}">${m.delta > 0 ? '+' : ''}${m.delta} ${esc(it?.unit || '')}</td><td class="dim">${esc(m.reason)}${m.record ? ` <span class="org auto">${icon('bolt')}auto</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
}
actions({
  'iv-adj': (el) => { A.adjustStock(el.dataset.id, +el.dataset.d, 'Quick adjust'); },
  'iv-set': (el) => { A.setStock(el.dataset.id, Math.max(0, +el.value)); },
  'iv-cat': (el) => { F.cat = el.dataset.v; store.emit('change'); },
  'iv-low': () => { F.low = !F.low; store.emit('change'); },
  'iv-q': (el) => { F.q = el.value; store.emit('change'); },
  'iv-shop': (el) => { const r = addItemToShopping(el.dataset.id); if (r) toast(r.dup ? `Already on “${r.title}”` : `Added to “${r.title}”`, { kind: r.dup ? 'info' : 'ok', action: () => openToolDrawer('shopping', r.id), actionLabel: 'Open list' }); },
  'iv-lowshop': () => { const n = addLowStockToShopping(); toast(n ? `${n} low items added to shopping lists` : 'Low items are already on your lists', { kind: n ? 'ok' : 'info', action: () => openToolDrawer('shopping'), actionLabel: 'Open' }); store.emit('change'); },
  'iv-count': () => openToolDrawer('stockcount'),
});
