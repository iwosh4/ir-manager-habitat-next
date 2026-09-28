// DIRECTORY — breeders, vets, suppliers and customers, with everything linked to them (animals, purchases, sales,
// health visits, stock). One tap to call / e-mail / reorder.
import { esc, actions, uid } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { panel, close as closeOv } from '../core/overlay.js';
import { avatar, empty, money } from '../ui/components.js';
import { done } from '../ui/feedback.js';
import { dShort } from '../core/time.js';
import { toast } from '../core/overlay.js';
import { addLowStockToShopping } from '../widgets/tools.js';

const KIND = { vet: ['Veterinarian', 'stethoscope', 'var(--c-health)'], supplier: ['Supplier', 'truck', 'var(--c-inv)'], breeder: ['Breeder', 'users', 'var(--c-repro)'], contact: ['Contact', 'user', 'var(--text-3)'] };
const F = { q: '' };
const initials = (c) => c.name.split(' ').filter((w) => !/^MVDr\.?$/.test(w)).map((w) => w[0]).slice(0, 2).join('');

export function context(r) {
  const db = store.get();
  if (r.id) { const c = db.contacts.find((x) => x.id === r.id); return { title: c?.name || 'Contact', sub: c ? `${KIND[c.kind][0]}${c.org ? ` · ${esc(c.org)}` : ''}` : '', back: `#/directory/${r.sub || 'all'}`, tabs: [], actions: c ? [{ label: 'Call', icon: 'phone', act: 'go', data: { href: `tel:${c.phone}` }, hideM: true }, { label: 'E-mail', icon: 'mail', act: 'go', data: { href: `mailto:${c.email}` }, primary: true }] : [] }; }
  const n = (k) => db.contacts.filter((c) => c.kind === k).length;
  return { counts: { all: db.contacts.length, breeders: n('breeder'), vets: n('vet'), suppliers: n('supplier') }, sub: 'Breeders · veterinarians · suppliers · customers', actions: [{ label: 'Contact', icon: 'plus', act: 'dr-new', primary: true, kbd: 'N' }] };
}
export function onNew() { openNew(); }
export function render(r) {
  const db = store.get();
  if (r.id) return detail(db, r.id);
  const kind = { breeders: 'breeder', vets: 'vet', suppliers: 'supplier' }[r.sub];
  let L = db.contacts.filter((c) => !kind || c.kind === kind);
  if (F.q) L = L.filter((c) => `${c.name} ${c.org} ${c.city} ${c.tags.join(' ')}`.toLowerCase().includes(F.q.toLowerCase()));
  return `<div class="toolbar"><div class="search-in"><span>${icon('search')}</span><input id="dr-q" type="search" placeholder="Name, organisation, city, tag…" value="${esc(F.q)}" data-input="dr-q"></div></div>
    <div class="dir-grid">${L.map((c) => { const [kl, ki, kc] = KIND[c.kind]; return `<a class="dir-card" href="#/directory/${r.sub || 'all'}/${c.id}"><span class="dir-av" style="--c:${kc}">${esc(initials(c))}<i>${icon(ki)}</i></span><div class="dir-b"><b>${esc(c.name)}</b><span>${esc(c.org || kl)}</span><span class="muted small">${icon('mapPin')}${esc(c.city)}, ${esc(c.country)}</span><div class="dir-tags">${c.tags.slice(0, 3).map((t) => `<span class="pill mute">${esc(t)}</span>`).join('')}</div></div>${c.rating ? `<span class="stars">${'★'.repeat(c.rating)}</span>` : ''}</a>`; }).join('') || empty('No contacts match', '', 'directory')}</div>`;
}
function detail(db, id) {
  const c = db.contacts.find((x) => x.id === id); if (!c) return empty('Contact not found', '', 'directory');
  const [kl, ki, kc] = KIND[c.kind];
  const animals = db.animals.filter((a) => a.origin?.from === c.id || a.soldTo === c.id);
  const fin = db.finance.filter((f) => f.contact === c.id).sort((a, b) => b.t - a.t);
  const visits = db.health.filter((h) => h.vet === c.id);
  const items = db.inventory.filter((i) => i.supplier === c.id);
  return `<div class="pf-grid"><section class="card span-12 dir-hero"><span class="dir-av xl" style="--c:${kc}">${esc(initials(c))}<i>${icon(ki)}</i></span><div class="cl-main"><div class="row"><span class="pill">${kl}</span>${c.rating ? `<span class="stars">${'★'.repeat(c.rating)}</span>` : ''}</div><h2>${esc(c.name)}</h2><span class="muted">${esc(c.org || '')} · ${esc(c.city)}, ${esc(c.country)}</span>
      <div class="row"><a class="btn" href="tel:${esc(c.phone)}">${icon('phone')}${esc(c.phone)}</a><a class="btn" href="mailto:${esc(c.email)}">${icon('mail')}${esc(c.email)}</a></div>${c.notes ? `<p class="pf-desc">${esc(c.notes)}</p>` : ''}</div></section>
    ${animals.length ? `<section class="card span-6"><header class="card-h"><h3>Animals</h3><span class="card-sub">bought from / sold to</span></header><div class="card-b">${animals.map((a) => `<a class="li" href="#/animals/a/${a.id}">${avatar(a, 36)}<span class="li-main"><b class="code">${esc(a.code)}</b><span>${esc(a.name || '')} · ${a.soldTo === c.id ? 'sold to' : 'bought from'}</span></span></a>`).join('')}</div></section>` : ''}
    ${fin.length ? `<section class="card span-6"><header class="card-h"><h3>Transactions</h3><span class="card-sub">${money(fin.reduce((s, f) => s + (f.kind === 'expense' ? -f.amount : f.amount), 0))} net</span></header><div class="card-b">${fin.map((f) => `<div class="li"><span class="li-main"><b>${esc(f.note)}</b><span>${dShort(f.t)} · ${esc(f.cat)}</span></span><b class="${f.kind === 'expense' ? 'danger-t' : 'ok-t'}">${f.kind === 'expense' ? '−' : '+'}${money(f.amount)}</b></div>`).join('')}</div></section>` : ''}
    ${visits.length ? `<section class="card span-6"><header class="card-h"><h3>Health visits</h3></header><div class="card-b">${visits.map((h) => `<a class="li" href="#/animals/a/${h.animal}?tab=health"><span class="li-main"><b>${esc(h.title)}</b><span>${dShort(h.t)} · ${esc(db.animals.find((a) => a.id === h.animal)?.code || '')}</span></span></a>`).join('')}</div></section>` : ''}
    ${items.length ? `<section class="card span-6"><header class="card-h"><h3>Supplied items</h3><span class="card-a"><button class="btn sm primary" data-act="dr-reorder">${icon('cart')}Reorder low stock</button></span></header><div class="card-b">${items.map((i) => `<div class="li"><span class="li-main"><b>${esc(i.name)}</b><span>${i.qty} ${esc(i.unit)} · ${money(i.price)}/${esc(i.unit)}</span></span>${i.qty < i.min ? '<span class="pill warn">low</span>' : ''}</div>`).join('')}</div></section>` : ''}
  </div>`;
}
function openNew() {
  const S = { kind: 'breeder', name: '', org: '', city: '', phone: '', email: '' };
  const h = panel({ title: 'New contact', icon: 'directory', body: `<div class="field"><label>Type</label><div class="seg">${Object.entries(KIND).map(([k, [l]]) => `<button data-kind="${k}" class="${S.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>${[['name', 'Name'], ['org', 'Organisation'], ['city', 'City'], ['phone', 'Phone'], ['email', 'E-mail']].map(([k, l]) => `<div class="field"><label>${l}</label><input data-k="${k}" ${k === 'name' ? 'autofocus' : ''}></div>`).join('')}`, footer: `<button class="btn primary lg" data-save>${icon('check')}Save</button>` });
  h.el.addEventListener('input', (e) => { const k = e.target.dataset.k; if (k) S[k] = e.target.value; });
  h.el.addEventListener('click', (e) => { const k = e.target.closest('[data-kind]'); if (k) { S.kind = k.dataset.kind; h.el.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b === k)); }
    if (e.target.closest('[data-save]')) { if (!S.name) { h.el.querySelector('[data-k=name]').focus(); return; } const id = uid('c'); store.mutate('New contact', (d) => d.contacts.push({ id, ...S, country: 'CZ', tags: [], notes: '', rating: 0 })); closeOv(h); done({ label: `${S.name} added` }); location.hash = `#/directory/all/${id}`; } });
}
actions({ 'dr-reorder': () => { const n = addLowStockToShopping(); toast(n ? `${n} low items added to shopping lists` : 'Low items are already on your lists', { kind: n ? 'ok' : 'info' }); }, 'dr-q': (el) => { F.q = el.value; store.emit('change'); }, 'dr-new': () => openNew() });
