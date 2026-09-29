// SKLAD — KPI (HODNOTA ZÁSOB · NÍZKÝ STAV · KRMIVO · TECHNIKA) → hlavní ZÁSOBY + boční NÁKUPNÍ SEZNAM → POSLEDNÍ POHYBY.
import { esc, actions } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import * as A from '../engine/actions.js';
import { pageHead, block, money } from '../ui/components.js';
import { done } from '../ui/feedback.js';
import { INV_CAT } from '../widgets/registry.js';
import { renderTool, feedDemand, addLowStockToShopping, addItemToShopping } from '../widgets/tools.js';
import { docsOf, newDoc, doc, saveWs } from '../widgets/wsstore.js';
import { workspaceHTML, mountWorkspace } from '../widgets/workspace.js';
import { toast, panel, close as closeOv } from '../core/overlay.js';
import { rel, dShort } from '../core/time.js';

const S = { cat: '', q: '', list: null };
const val = (i) => i.qty * i.price;

function kpis(db) {
  const inv = db.inventory, low = inv.filter((x) => x.qty < x.min), feed = inv.filter((x) => x.cat === 'live' || x.cat === 'frozen'), tech = inv.filter((x) => x.cat === 'equipment');
  const fd = feedDemand(), minDays = Math.min(...fd.map((r) => r.days));
  return `<div class="kpis k4">
    <div class="kpi plain"><span class="kpi-l">Hodnota zásob</span><b class="kpi-v">${money(inv.reduce((s, x) => s + val(x), 0))}</b><span class="kpi-s">${inv.length} položek · 5 kategorií</span>${ico('finance', 'md kpi-ico')}</div>
    <div class="kpi plain ${low.length ? 'warn' : ''}"><span class="kpi-l">Nízký stav</span><b class="kpi-v">${low.length}<em>položek</em></b><span class="kpi-s">${low.length ? `<button class="link" data-act="w-shopall">vše do nákupu →</button>` : 'zásoby v pořádku'}</span>${ico('status-warning', 'md kpi-ico')}</div>
    <div class="kpi plain"><span class="kpi-l">Krmivo</span><b class="kpi-v">${Number.isFinite(minDays) ? Math.floor(minDays) : '—'}<em>dní nejkratší zásoba</em></b><span class="kpi-s">${feed.length} druhů · ${money(feed.reduce((s, x) => s + val(x), 0))}</span>${ico('feeding', 'md kpi-ico')}</div>
    <div class="kpi plain"><span class="kpi-l">Technika</span><b class="kpi-v">${tech.reduce((s, x) => s + x.qty, 0)}<em>ks</em></b><span class="kpi-s">${tech.filter((x) => x.qty < x.min).length} pod minimem · ${money(tech.reduce((s, x) => s + val(x), 0))}</span>${ico('lighting', 'md kpi-ico')}</div>
  </div>`;
}
function stockRows(db, items) {
  return items.map((x) => { const p = Math.min(1, x.qty / Math.max(1, x.reorder || x.min * 2)), low = x.qty < x.min; return `<div class="stk ${low ? 'low' : ''}"><span class="inv-ico">${x.img ? `<img src="assets/img/${x.img}" alt="" loading="lazy">` : ico(x.cat === 'equipment' ? 'lighting' : x.cat === 'substrate' ? 'cleaning' : 'supplement', 'sm')}</span>
    <span class="li-main"><b>${esc(x.name)}</b><span>${esc(INV_CAT[x.cat] || x.cat)} · ${esc(db.contacts.find((c) => c.id === x.supplier)?.org || '—')}${x.note ? ` · ${esc(x.note)}` : ''}</span></span>
    <span class="stk-bar" title="min. ${x.min} · doobjednat do ${x.reorder}"><i style="transform:scaleX(${p.toFixed(3)})"></i><em style="left:${Math.min(100, (x.min / Math.max(1, x.reorder || x.min * 2)) * 100)}%"></em></span>
    <span class="stk-q"><button class="icon-btn sm" data-act="stk-adj" data-id="${x.id}" data-d="-1" aria-label="Odebrat">${gl('minus')}</button><b class="${low ? 'warn-t' : ''}">${String(x.qty).replace('.', ',')}</b><em>${esc(x.unit)}</em><button class="icon-btn sm" data-act="stk-adj" data-id="${x.id}" data-d="1" aria-label="Přidat">${gl('plus')}</button></span>
    <span class="stk-v mono">${money(val(x))}</span><button class="icon-btn sm" data-act="w-shop1" data-id="${x.id}" title="Do nákupního seznamu" aria-label="Do nákupního seznamu">${gl('cart')}</button></div>`; }).join('');
}
function filtered(db) { const q = S.q.toLowerCase(); return db.inventory.filter((x) => (!S.cat || x.cat === S.cat) && (!q || x.name.toLowerCase().includes(q))).sort((a, b) => (a.qty < a.min ? 0 : 1) - (b.qty < b.min ? 0 : 1) || a.cat.localeCompare(b.cat)); }
function filters(db) { return `<div class="pl-bar"><label class="searchbox">${gl('search')}<input type="search" id="stk-q" value="${esc(S.q)}" data-input="stk-q" placeholder="Hledat položku…" aria-label="Hledat položku"></label><div class="chips">${[['', 'Vše'], ...Object.entries(INV_CAT)].map(([k, l]) => `<button class="chip ${S.cat === k ? 'on' : ''}" data-act="stk-cat" data-v="${k}">${l}<em>${k ? db.inventory.filter((x) => x.cat === k).length : db.inventory.length}</em></button>`).join('')}</div></div>`; }
function moves(db) { return `<div class="list">${db.stock.slice(0, 10).map((s) => { const it = db.inventory.find((x) => x.id === s.item); return `<div class="li"><span class="mv ${s.delta > 0 ? 'in' : 'out'}">${s.delta > 0 ? '+' : ''}${String(s.delta).replace('.', ',')}</span><span class="li-main"><b>${esc(it?.name || s.item)}</b><span>${esc(s.reason)}${s.ref ? ' · automaticky z krmení' : ''}</span></span><em class="muted small">${dShort(s.t)} · ${rel(s.t)}</em></div>`; }).join('')}</div>`; }

function overview() {
  const db = store.get(), list = docsOf('shopping')[0];
  return `${kpis(db)}<div class="g-main wide">
    ${block('Zásoby', `${filters(db)}<div class="stk-l">${stockRows(db, filtered(db))}</div>`, { icon: 'inventory', level: 'primary', sub: 'Pod minimem nahoře · krmení odepisuje automaticky', actions: `<a class="btn sm tertiary" href="#/sklad/polozky">Tabulka</a>` })}
    <div class="stack">${block(list ? list.title : 'Nákupní seznam', `<div data-shop-mount="${list?.id || ''}"></div>`, { icon: 'cart', level: 'secondary', kicker: 'Nákupní seznam', actions: `<a class="btn sm tertiary" href="#/sklad/nakup">Všechny seznamy</a>` })}</div>
  </div>
  <div class="g2 sec">${block('Poslední pohyby', moves(db), { icon: 'repeat-action', level: 'detail' })}<div>${workspaceHTML('sklad', { editLabel: 'UPRAVIT' })}</div></div>`;
}
function items() {
  const db = store.get();
  return `${filters(db)}<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Položka</th><th>Kategorie</th><th>Dodavatel</th><th class="num">Stav</th><th class="num">Min.</th><th class="num">Cena/j.</th><th class="num">Hodnota</th><th></th></tr></thead><tbody>${filtered(db).map((x) => `<tr><td><div class="row"><span class="inv-ico">${x.img ? `<img src="assets/img/${x.img}" alt="">` : ico('inventory', 'sm')}</span><b>${esc(x.name)}</b></div></td><td class="muted">${esc(INV_CAT[x.cat])}</td><td class="muted">${esc(db.contacts.find((c) => c.id === x.supplier)?.org || '—')}</td><td class="num ${x.qty < x.min ? 'warn-t' : ''}"><b>${String(x.qty).replace('.', ',')}</b> ${esc(x.unit)}</td><td class="num muted">${x.min}</td><td class="num">${money(x.price)}</td><td class="num">${money(val(x))}</td><td class="num"><button class="icon-btn sm" data-act="w-shop1" data-id="${x.id}" aria-label="Do nákupu">${gl('cart')}</button></td></tr>`).join('')}</tbody></table></div>`;
}
function shopping() {
  const lists = docsOf('shopping'); if (!S.list || !doc(S.list)) S.list = lists[0]?.id;
  const cur = S.list ? doc(S.list) : null;
  return `<div class="g-main"><div class="stack">${cur ? block(cur.title, `<div data-shop-mount="${S.list}"></div>`, { icon: 'cart', level: 'primary', kicker: 'Nákupní seznam', actions: `<button class="btn sm tertiary" data-act="shop-rename" data-id="${S.list}">${gl('edit')}Přejmenovat</button><button class="btn sm tertiary" data-act="w-shopall">${gl('inventory')}Nízký stav</button>` }) : ''}</div>
    <div class="stack">${block('Seznamy', `<div class="list">${lists.map((l) => { const open = l.items.filter((i) => !i.done); return `<button class="li hov shop-li ${l.id === S.list ? 'on' : ''}" data-act="shop-pick" data-id="${l.id}"><i class="acc-dot" style="--acc:var(--acc-${l.accent || 'neutral'})"></i><span class="li-main"><b>${esc(l.title)}</b><span>${open.length} k nákupu · ${money(open.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0))}</span></span></button>`; }).join('')}</div><div class="w-foot"><button class="btn sm" data-act="shop-new">${gl('plus')}Nový seznam</button></div>`, { icon: 'checklist', level: 'secondary' })}
    ${block('Spotřeba krmiva', '<div data-tool="feedplan"></div>', { icon: 'feeding', level: 'detail' })}</div></div>`;
}

export function render(r) {
  const db = store.get(), low = db.inventory.filter((x) => x.qty < x.min).length;
  return `${pageHead({ mod: 'sklad', cur: r.sub, sub: `${db.inventory.length} položek · ${low} pod minimem · krmení se odepisuje automaticky`, tabs: [['prehled', 'Přehled'], ['polozky', 'Položky', db.inventory.length], ['nakup', 'Nákupní seznam', docsOf('shopping').length]], actions: `<button class="btn" data-act="w-shopall">${gl('cart')}Nízký stav do nákupu</button>` })}${r.sub === 'polozky' ? items() : r.sub === 'nakup' ? shopping() : overview()}`;
}
export function mount(host) {
  mountWorkspace(host);
  for (const el of host.querySelectorAll('[data-shop-mount]')) renderTool(el, 'shopping', { key: `shop-${el.dataset.shopMount}`, docId: el.dataset.shopMount || null, ctx: 'sklad' });
  for (const el of host.querySelectorAll('[data-tool]')) renderTool(el, el.dataset.tool, { key: `sk-${el.dataset.tool}`, ctx: 'sklad' });
}

actions({
  'stk-adj': (el) => { const d = +el.dataset.d, it = store.get().inventory.find((x) => x.id === el.dataset.id); const step = it.unit === 'ks' && it.qty >= 50 ? 10 * d : d; A.adjustStock(it.id, step, step > 0 ? 'Naskladnění' : 'Ruční výdej'); },
  'stk-cat': (el) => { S.cat = el.dataset.v; store.emit('change'); },
  'stk-q': (el) => { S.q = el.value; store.emit('change'); },
  'shop-pick': (el) => { S.list = el.dataset.id; store.emit('change'); },
  'shop-new': () => { S.list = newDoc('shopping', { title: `Nákup ${dShort(Date.now())}`, accent: ['blue', 'violet', 'green', 'amber'][docsOf('shopping').length % 4] }); store.emit('change'); toast('Nový nákupní seznam vytvořen', { kind: 'ok', ms: 2000 }); },
  'shop-rename': (el) => { const d = doc(el.dataset.id); const h = panel({ title: 'Přejmenovat seznam', icon: 'edit', width: 380, body: `<label class="field"><span>Název</span><input class="input" data-nm value="${esc(d.title)}" autofocus></label>`, footer: `<span class="spacer"></span><button class="btn tertiary" data-close>Zrušit</button><button class="btn primary" data-ok>${gl('check')}Uložit</button>` }); h.el.querySelector('[data-ok]').onclick = () => { d.title = h.el.querySelector('[data-nm]').value.trim() || d.title; saveWs(); closeOv(h); store.emit('change'); }; },
});
export { addLowStockToShopping, addItemToShopping };
