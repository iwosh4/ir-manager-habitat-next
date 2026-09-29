// ADRESÁŘ — Kontakty · Dokumenty · Burzy & akce · detail kontaktu.
import { esc, actions } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { SPECIES, latin } from '../data/species.js';
import { pageHead, block, empty, money, avatar } from '../ui/components.js';
import { dShort, dNum, rel, DAY } from '../core/time.js';

const KIND = { 'veterinář': ['Veterinář', 'health'], supplier: ['Dodavatel', 'inventory'], breeder: ['Chovatel', 'animals'], contact: ['Zákazník', 'profile'] };
const F = { k: '', q: '' };
const EVENTS = [
  { name: 'Terraristika Expo Praha', date: new Date(2026, 9, 18).getTime(), place: 'PVA Expo Praha, Letňany', note: 'Stůl B-14 · předání FP-03 a PR-H3 · ceník připraven v Nástrojích', mine: true },
  { name: 'Reptile Burza Brno', date: new Date(2026, 10, 8).getTime(), place: 'BVV, pavilon G2', note: 'Jen nákup — krmivo a technika' },
  { name: 'Terarijní burza Plzeň', date: new Date(2026, 11, 6).getTime(), place: 'Parkhotel Plzeň', note: '' },
  { name: 'Hamm Reptile Show', date: new Date(2026, 11, 12).getTime(), place: 'Zentralhallen Hamm (DE)', note: 'Zvážit — Furcifer pardalis „Ambilobe“' },
];
const initials = (n) => n.replace(/^(MVDr\.|Ing\.)\s*/, '').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();

function contacts() {
  const db = store.get(), q = F.q.toLowerCase(), L = db.contacts.filter((c) => (!F.k || c.kind === F.k) && (!q || `${c.name} ${c.org} ${c.city} ${c.tags?.join(' ')}`.toLowerCase().includes(q)));
  return `<div class="pl-bar"><label class="searchbox">${gl('search')}<input type="search" id="ad-q" value="${esc(F.q)}" data-input="ad-q" placeholder="Jméno, firma, město, štítek…" aria-label="Hledat kontakt"></label><div class="chips">${[['', 'Vše'], ...Object.entries(KIND).map(([k, [l]]) => [k, l])].map(([k, l]) => `<button class="chip ${F.k === k ? 'on' : ''}" data-act="ad-k" data-v="${k}">${l}</button>`).join('')}</div></div>
  <div class="g3">${L.map((c) => `<a class="ct blk lvl-secondary" href="#/adresar/kontakty/${c.id}"><div class="ct-h"><span class="ct-av k-${c.kind === 'veterinář' ? 'vet' : c.kind}">${initials(c.name)}</span><span class="li-main"><b>${esc(c.name)}</b><span>${esc(c.org || '')}</span></span><span class="pill mute">${KIND[c.kind]?.[0] || c.kind}</span></div><div class="ct-m"><span>${gl('pin')}${esc(c.city)}, ${esc(c.country)}</span><span>${gl('bell')}${esc(c.phone)}</span></div><div class="chips">${(c.tags || []).map((t) => `<span class="pill mute">${esc(t)}</span>`).join('')}</div></a>`).join('') || empty('Nikdo neodpovídá', '', 'profile')}</div>`;
}
function contactDetail(id) {
  const db = store.get(), c = db.contacts.find((x) => x.id === id); if (!c) return empty('Kontakt nenalezen', '', 'profile');
  const fin = db.finance.filter((f) => f.contact === id), sales = db.sales.filter((s) => s.buyer === id), animals = db.animals.filter((a) => a.origin?.from === id);
  return `<a class="back" href="#/adresar/kontakty">${gl('arrow-left')}Adresář</a>
  <header class="ph"><div class="ph-row"><span class="ct-av big k-${c.kind === 'veterinář' ? 'vet' : c.kind}">${initials(c.name)}</span><div class="ph-t"><span class="kicker">${KIND[c.kind]?.[0] || c.kind}</span><h1 class="t-page">${esc(c.name)}</h1><p class="muted">${esc(c.org || '')} · ${esc(c.city)}, ${esc(c.country)}</p></div><div class="ph-a"><a class="btn" href="tel:${esc(c.phone)}">${gl('bell')}Zavolat</a><a class="btn primary" href="mailto:${esc(c.email)}">${gl('external')}E-mail</a></div></div></header>
  <div class="g-main"><div class="stack">${block('Kontakt', `<dl class="kv"><dt>Telefon</dt><dd>${esc(c.phone)}</dd><dt>E-mail</dt><dd>${esc(c.email)}</dd><dt>Město</dt><dd>${esc(c.city)}</dd><dt>Hodnocení</dt><dd>${'★'.repeat(c.rating || 0)}<span class="dim">${'★'.repeat(5 - (c.rating || 0))}</span></dd></dl>${c.notes ? `<p class="muted sec">${esc(c.notes)}</p>` : ''}`, { icon: 'profile', level: 'primary' })}
    ${fin.length ? block('Platby', `<div class="list">${fin.map((f) => `<div class="li"><span class="mv ${f.kind === 'expense' ? 'out' : 'in'}">${f.kind === 'expense' ? '−' : '+'}${Math.round(f.amount).toLocaleString('cs-CZ')}</span><span class="li-main"><b>${esc(f.cat)}</b><span>${esc(f.note || '')}</span></span><em class="muted small">${dShort(f.t)}</em></div>`).join('')}</div>`, { icon: 'finance', level: 'secondary' }) : ''}</div>
  <div class="stack">${animals.length ? block('Zvířata od tohoto chovatele', `<div class="list">${animals.map((a) => `<a class="li" href="#/zvirata/karta/${a.id}">${avatar(a, 32)}<span class="li-main"><b class="latin">${esc(latin(SPECIES[a.species]))}</b><span class="code">${esc(a.code)}</span></span></a>`).join('')}</div>`, { icon: 'animals', level: 'secondary' }) : ''}
    ${sales.length ? block('Prodeje & rezervace', `<div class="list">${sales.map((s) => { const a = db.animals.find((x) => x.id === s.animal); return `<a class="li" href="#/zvirata/karta/${a.id}">${avatar(a, 32)}<span class="li-main"><b class="code">${esc(a.code)}</b><span>${money(s.price)}${s.deposit ? ` · záloha ${money(s.deposit)}` : ''}</span></span><span class="pill ${s.status === 'sold' ? 'mute' : 'info'}">${s.status === 'sold' ? 'prodáno' : 'rezervace'}</span></a>`; }).join('')}</div>`, { icon: 'finance', level: 'detail' }) : ''}</div></div>`;
}
function documents() {
  const db = store.get();
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Dokument</th><th>Typ</th><th>Zvíře</th><th>Datum</th><th class="num">Velikost</th></tr></thead><tbody>${db.documents.map((d) => { const a = db.animals.find((x) => x.id === d.animal); return `<tr><td><div class="row">${ico('view', 'sm')}<b>${esc(d.name)}</b></div></td><td><span class="pill mute">${esc(d.kind)}</span></td><td>${a ? `<a class="code" href="#/zvirata/karta/${a.id}?sekce=detaily">${esc(a.code)}</a>` : '—'}</td><td class="mono">${dNum(d.date)}</td><td class="num muted">${esc(d.size)}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function events() {
  return `<div class="g2">${EVENTS.map((e) => `<article class="ev blk ${e.mine ? 'lvl-primary' : 'lvl-secondary'}"><div class="ev-d"><b>${new Date(e.date).getDate()}.</b><span>${new Date(e.date).toLocaleDateString('cs-CZ', { month: 'long' })}</span></div><div class="ev-b"><b>${esc(e.name)}</b><span class="muted small">${gl('pin')}${esc(e.place)} · ${rel(e.date)}</span>${e.note ? `<p class="small">${esc(e.note)}</p>` : ''}${e.mine ? `<div class="row wrap"><span class="pill am">vystavuji</span><a class="btn sm" href="#/nastroje?n=pricelist">${gl('tag')}Expo ceník</a></div>` : ''}</div></article>`).join('')}</div>`;
}
export function render(r) {
  if (r.sub === 'kontakty' && r.id) return contactDetail(r.id);
  const db = store.get();
  return `${pageHead({ mod: 'adresar', cur: r.sub, title: 'Adresář', sub: `${db.contacts.length} kontaktů · ${db.documents.length} dokumentů · ${EVENTS.length} burzy`, tabs: [['kontakty', 'Kontakty', db.contacts.length], ['dokumenty', 'Dokumenty', db.documents.length], ['akce', 'Burzy & akce']] })}${r.sub === 'dokumenty' ? documents() : r.sub === 'akce' ? events() : contacts()}`;
}
actions({ 'ad-k': (el) => { F.k = el.dataset.v; store.emit('change'); }, 'ad-q': (el) => { F.q = el.value; store.emit('change'); } });
