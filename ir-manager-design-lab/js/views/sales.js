// SALES & ARCHIVE — for sale → reserved (deposit, pickup) → sold; deceased archive. Status changes are one tap
// with undo; finance entries are created automatically.
import { esc, actions, uid } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { panel, close as closeOv } from '../core/overlay.js';
import { SPECIES, latin, imgFor } from '../data/species.js';
import { empty, money, sexText, avatar } from '../ui/components.js';
import { done } from '../ui/feedback.js';
import { openToolDrawer } from '../widgets/tooldrawer.js';
import { DAY, rel, dShort, dLong, ageText } from '../core/time.js';

const A = (db, id) => db.animals.find((a) => a.id === id);
export function context() {
  const db = store.get(), c = (s) => db.sales.filter((x) => x.status === s).length;
  return { counts: { forsale: c('for-sale'), reserved: c('reserved'), sold: c('sold'), archive: db.animals.filter((a) => a.status === 'deceased').length }, sub: `${money(db.sales.filter((s) => s.status !== 'sold').reduce((s, x) => s + x.price, 0))} listed · ${money(db.sales.filter((s) => s.status === 'sold').reduce((s, x) => s + x.price, 0))} sold`,
    actions: [{ label: 'Expo price list', icon: 'tag', act: 'sl-pricelist', primary: true }] };
}
export function render(r) {
  const sub = r.sub || 'forsale', db = store.get();
  if (sub === 'archive') { const L = db.animals.filter((a) => a.status === 'deceased'); return L.length ? `<div class="sale-grid">${L.map((a) => `<article class="sale-card dec"><a class="sale-img" href="#/animals/a/${a.id}"><img src="${imgFor(a)}" alt="" loading="lazy"></a><div class="sale-b"><div class="row"><b class="code">${esc(a.code)}</b> ${esc(a.name)}<span class="spacer"></span><span class="pill mute">deceased</span></div><i class="latin">${esc(latin(SPECIES[a.species]))}</i><span class="muted small">${a.diedAt ? `† ${dLong(a.diedAt)}` : ''} · ${esc(a.notes || '')}</span></div></article>`).join('')}</div>` : empty('No deceased animals', '', 'empty'); }
  const st = { forsale: 'for-sale', reserved: 'reserved', sold: 'sold' }[sub];
  const L = db.sales.filter((s) => s.status === st).sort((a, b) => (b.date || b.listed || 0) - (a.date || a.listed || 0));
  if (!L.length) return empty(sub === 'forsale' ? 'Nothing listed' : sub === 'reserved' ? 'No reservations' : 'No sales yet', 'Mark an animal for sale from its profile → More.', 'finance');
  return `<div class="sale-grid">${L.map((s) => card(db, s)).join('')}</div>`;
}
function card(db, s) {
  const a = A(db, s.animal), sp = SPECIES[a.species], b = db.contacts.find((c) => c.id === s.buyer);
  return `<article class="sale-card st-${s.status}"><a class="sale-img" href="#/animals/a/${a.id}"><img src="${imgFor(a)}" alt="" loading="lazy"><span class="price">${money(s.price)}</span></a><div class="sale-b">
    <div class="row"><b class="code">${esc(a.code)}</b> ${esc(a.name || '')}<span class="spacer"></span>${sexText(a)}</div><i class="latin">${esc(latin(sp))}</i><span class="muted small">${esc(a.morph || sp.common)} · ${ageText(a.born)}${a.weightG ? ` · ${a.weightG} g` : ''}</span>
    ${s.status === 'reserved' ? `<div class="res"><span>${icon('user')}${b ? `<a href="#/directory/all/${b.id}">${esc(b.name)}</a>` : '—'}</span><span>${icon('coins')}deposit ${money(s.deposit || 0)}</span><span>${icon('calendar')}pickup ${s.pickup ? `${dShort(s.pickup)} (${rel(s.pickup)})` : '—'}</span>${s.note ? `<em>${esc(s.note)}</em>` : ''}</div>` : ''}
    ${s.status === 'sold' ? `<span class="small">${icon('check')} sold ${s.date ? dLong(s.date) : ''}${b ? ` to <a href="#/directory/all/${b.id}">${esc(b.name)}</a>` : ''}</span>` : ''}
    <div class="row">${s.status === 'for-sale' ? `<button class="btn sm" data-act="sl-reserve" data-id="${s.id}">${icon('user')}Reserve…</button><button class="btn sm primary" data-act="sl-sold" data-id="${s.id}">${icon('check')}Sold</button>` : s.status === 'reserved' ? `<button class="btn sm ghost" data-act="sl-unreserve" data-id="${s.id}">Cancel reservation</button><button class="btn sm primary" data-act="sl-sold" data-id="${s.id}">${icon('check')}Handed over · sold</button>` : ''}</div></div></article>`;
}
function openReserve(id) {
  const db = store.get(), s = db.sales.find((x) => x.id === id), buyers = db.contacts.filter((c) => ['contact', 'breeder'].includes(c.kind) && c.id !== 'c_expo');
  const S = { buyer: buyers[0]?.id, deposit: Math.round(s.price * 0.3 / 100) * 100, pickup: 14 };
  const h = panel({ title: 'Reserve', sub: `${A(db, s.animal).code} · ${money(s.price)}`, icon: 'user', body: `<div class="field"><label>Buyer</label><select data-k="buyer">${buyers.map((c) => `<option value="${c.id}">${esc(c.name)}${c.org ? ` · ${esc(c.org)}` : ''}</option>`).join('')}</select></div>
    <div class="field"><label>Deposit</label><div class="num-in"><input type="number" data-k="deposit" value="${S.deposit}"><em>Kč</em></div></div>
    <div class="field"><label>Pickup</label><div class="seg">${[[7, '1 week'], [14, '2 weeks'], [21, 'Expo (3 wk)'], [30, '1 month']].map(([v, l]) => `<button data-p="${v}" class="${S.pickup === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`, footer: `<button class="btn primary lg" data-save>${icon('check')}Reserve</button>` });
  h.el.addEventListener('input', (e) => { const k = e.target.dataset.k; if (k) S[k] = k === 'deposit' ? +e.target.value : e.target.value; });
  h.el.addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) S[k] = e.target.value; });
  h.el.addEventListener('click', (e) => { const p = e.target.closest('[data-p]'); if (p) { S.pickup = +p.dataset.p; h.el.querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('on', b === p)); }
    if (e.target.closest('[data-save]')) { store.mutate('Reserved', (d) => { const x = d.sales.find((y) => y.id === id); Object.assign(x, { status: 'reserved', buyer: S.buyer, deposit: S.deposit, pickup: Date.now() + S.pickup * DAY }); d.animals.find((a) => a.id === x.animal).status = 'reserved'; if (S.deposit) d.finance.push({ id: uid('f'), t: Date.now(), kind: 'deposit', cat: 'Deposit', amount: S.deposit, note: `Deposit ${d.animals.find((a) => a.id === x.animal).code}`, contact: S.buyer, animal: x.animal }); }); closeOv(h); done({ label: 'Reserved — deposit booked in Finance' }); } });
}
actions({
  'sl-reserve': (el) => openReserve(el.dataset.id),
  'sl-unreserve': (el) => { store.mutate('Reservation cancelled', (d) => { const x = d.sales.find((y) => y.id === el.dataset.id); x.status = 'for-sale'; delete x.buyer; d.animals.find((a) => a.id === x.animal).status = 'for-sale'; }); done({ label: 'Back to for sale' }); },
  'sl-sold': (el) => { const db = store.get(), s = db.sales.find((y) => y.id === el.dataset.id), a = A(db, s.animal); store.mutate(`Sold ${a.code}`, (d) => { const x = d.sales.find((y) => y.id === s.id), an = d.animals.find((y) => y.id === x.animal); x.status = 'sold'; x.date = Date.now(); an.status = 'sold'; an.soldAt = Date.now(); an.soldTo = x.buyer; an.enclosureId = null; d.finance.push({ id: uid('f'), t: Date.now(), kind: 'income', cat: 'Sale', amount: x.price - (x.deposit || 0), note: `${an.code} sold${x.deposit ? ' (balance after deposit)' : ''}`, contact: x.buyer, animal: an.id }); }); done({ label: `${a.code} sold — income booked, moved to archive` }); },
  'sl-pricelist': () => openToolDrawer('pricelist'),
});
