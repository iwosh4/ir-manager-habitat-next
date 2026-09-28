// ENCLOSURES — physical places: occupants, climate vs species targets, technical state (lamp life), care,
// assemblies, and the entry into Habitat Studio (which is NOT rebuilt here — it is linked).
import { esc, actions } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { SPECIES, latin } from '../data/species.js';
import { streamHTML, contextItems } from '../ui/timeline.js';
import { avatar, empty, kpi } from '../ui/components.js';
import { done } from '../ui/feedback.js';
import { openQuickRecord } from '../ui/quickrecord.js';
import { workspaceHTML, mountWorkspace } from '../widgets/workspace.js';
import { DAY, rel, dShort, startOfDay } from '../core/time.js';

export const HABITAT_URL = '../index.html';
const F = { q: '', type: '' };
const occupants = (db, e) => db.animals.filter((a) => a.enclosureId === e.id && !['sold', 'deceased'].includes(a.status));
const lifeLeft = (t) => Math.round(t.lifeDays - (Date.now() - t.installed) / DAY);
function climate(db, e) {
  const occ = occupants(db, e), sp = SPECIES[occ[0]?.species];
  if (!e.readings) return { ok: true };
  if (!sp) return { ok: true, sp: null };
  const tOk = e.readings.t >= sp.env.night[0] - 1 && e.readings.t <= (sp.env.basking?.[1] ?? sp.env.day[1]) + 1, rhOk = e.readings.rh >= sp.env.rh[0] - 8 && e.readings.rh <= sp.env.rh[1] + 8;
  return { ok: tOk && rhOk, tOk, rhOk, sp };
}
function status(db, e) {
  const worn = e.tech.filter((t) => lifeLeft(t) < 30), c = climate(db, e);
  if (e.status === 'attention' || worn.length) return ['attention', worn.length ? `${worn[0].label} · ${lifeLeft(worn[0])} d left` : 'Check'];
  if (!c.ok) return ['warn', !c.tOk ? 'Temperature outside target' : 'Humidity outside target'];
  return ['ok', 'OK'];
}

export function context(r) {
  const db = store.get();
  if (r.sub === 'e') { const e = db.enclosures.find((x) => x.id === r.id); return { title: e ? `${e.code} · ${e.name}` : 'Enclosure', sub: e ? `${e.dims.w} × ${e.dims.d} × ${e.dims.h} cm (W × D × H) · ${e.type}` : '', back: '#/enclosures/list', tabs: [], actions: e ? [{ label: 'Open in Habitat Studio', icon: 'cube', act: 'go', data: { href: `${HABITAT_URL}#enclosure=${e.code}` }, hideM: true }, { label: 'Clean', icon: 'clean', act: 'en-clean', data: { id: e.id }, primary: true }] : [] }; }
  return { counts: { list: db.enclosures.length, assemblies: db.assemblies.length }, sub: `${db.enclosures.length} enclosures · ${db.assemblies.length} assemblies · room A`, actions: [{ label: 'Habitat Studio', icon: 'cube', act: 'go', data: { href: '#/enclosures/habitat' }, primary: true }] };
}
export function render(r) {
  const sub = r.sub || 'overview';
  if (sub === 'e') return detail(r.id);
  if (sub === 'list') return list();
  if (sub === 'assemblies') return assemblies();
  if (sub === 'habitat') return habitat();
  return overview();
}
export function mount(root) { mountWorkspace(root); }

function overview() {
  const db = store.get(), att = db.enclosures.map((e) => [e, status(db, e)]).filter(([, s]) => s[0] !== 'ok');
  const worn = db.enclosures.flatMap((e) => e.tech.map((t) => ({ e, t, left: lifeLeft(t) }))).filter((x) => x.left < 60).sort((a, b) => a.left - b.left);
  return `<div class="rp">
    <a class="hab-hero" href="#/enclosures/habitat"><img src="assets/img/enclosures/room-hero.webp" alt="Breeding room A rendered in Habitat Studio"><div class="hab-shade"></div><div class="hab-t"><span class="brief-k">Habitat Studio · Breeding room A</span><h2>${db.enclosures.length} enclosures in ${db.assemblies.length} assemblies</h2><p>Plan racks and walls in 3D, then open any enclosure straight from its record.</p><span class="btn primary">${icon('cube')}Open planner preview</span></div></a>
    <div class="pf-grid">
      <section class="card span-6"><header class="card-h"><span class="card-ico">${icon('alert')}</span><h3>Needs attention</h3></header><div class="card-b">${att.length ? att.map(([e, s]) => encRow(db, e, s)).join('') : '<p class="muted">All enclosures are within target.</p>'}</div></section>
      <section class="card span-6"><header class="card-h"><span class="card-ico">${icon('lamp')}</span><h3>Technical service</h3><span class="card-sub">lamp & device life</span></header><div class="card-b">${worn.map(({ e, t, left }) => `<div class="li"><span class="tdot" style="--c:${left < 30 ? 'var(--danger)' : 'var(--warn)'}">${icon(t.kind === 'uvb' ? 'sun' : t.kind === 'mist' ? 'mist' : t.kind === 'sensor' ? 'thermo' : 'lamp')}</span><span class="li-main"><b>${esc(t.label)} · <a href="#/enclosures/e/${e.id}" class="code">${esc(e.code)}</a></b><span>${left < 0 ? `${-left} d overdue` : `${left} d left`} of ${t.lifeDays} d</span></span><div class="life"><i style="width:${Math.max(0, Math.min(100, (1 - left / t.lifeDays) * 100))}%"></i></div><button class="btn sm" data-act="en-tech" data-id="${e.id}" data-k="${t.kind}">${icon('refresh')}Replaced</button></div>`).join('') || '<p class="muted">Nothing due in 60 days.</p>'}</div></section>
    </div>
    ${workspaceHTML('enclosures', { title: 'Enclosure workspace' })}
  </div>`;
}
function encRow(db, e, s = status(db, e)) {
  const occ = occupants(db, e);
  return `<a class="enc-row" href="#/enclosures/e/${e.id}"><img src="assets/img/enclosures/${e.img}.webp" alt="" loading="lazy"><span class="li-main"><b><span class="code">${esc(e.code)}</span> ${esc(e.name)}</b><span>${occ.map((a) => esc(a.code)).join(', ') || 'empty'}${e.readings ? ` · ${e.readings.t} °C · ${e.readings.rh} %` : ''}</span></span><span class="pill ${s[0] === 'attention' ? 'danger' : s[0] === 'warn' ? 'warn' : 'ok'}">${esc(s[1])}</span></a>`;
}
function list() {
  const db = store.get(); let L = db.enclosures;
  if (F.type) L = L.filter((e) => e.type === F.type);
  if (F.q) { const q = F.q.toLowerCase(); L = L.filter((e) => `${e.code} ${e.name} ${occupants(db, e).map((a) => `${a.code} ${a.name}`).join(' ')}`.toLowerCase().includes(q)); }
  return `<div class="toolbar"><div class="search-in"><span>${icon('search')}</span><input id="en-q" type="search" placeholder="Code, name, occupant…" value="${esc(F.q)}" data-input="en-q"></div><div class="an-chips">${[['', 'All'], ['glass', 'Glass'], ['mesh', 'Mesh'], ['pvc', 'PVC'], ['tub', 'Tub'], ['incubator', 'Incubator']].map(([v, l]) => `<button class="chip ${F.type === v ? 'on' : ''}" data-act="en-type" data-v="${v}">${l}</button>`).join('')}</div></div>
  <div class="enc-grid">${L.map((e) => { const occ = occupants(db, e), s = status(db, e), c = climate(db, e); return `<article class="enc-card st-${s[0]}"><a class="enc-img" href="#/enclosures/e/${e.id}"><img src="assets/img/enclosures/${e.img}.webp" alt="" loading="lazy"><span class="pill ${s[0] === 'attention' ? 'danger' : s[0] === 'warn' ? 'warn' : 'ok'}">${esc(s[1])}</span>${e.venomous ? '<span class="pill danger ven">VENOMOUS</span>' : ''}</a>
    <div class="enc-b"><a href="#/enclosures/e/${e.id}" class="row"><b class="code">${esc(e.code)}</b><span>${esc(e.name)}</span></a><span class="muted small">${e.dims.w} × ${e.dims.d} × ${e.dims.h} cm · ${esc(e.type)}</span>
      ${e.readings ? `<div class="clim"><span class="${c.tOk === false ? 'warn-t' : ''}">${icon('thermo')}${e.readings.t} °C</span><span class="${c.rhOk === false ? 'warn-t' : ''}">${icon('droplets')}${e.readings.rh} %</span>${c.sp ? `<em>target ${c.sp.env.day.join('–')} °C · ${c.sp.env.rh.join('–')} %</em>` : ''}</div>` : ''}
      <div class="stackav">${occ.slice(0, 4).map((a) => avatar(a, 28)).join('')}<span class="muted small">&nbsp;${occ.map((a) => esc(a.code)).join(', ') || 'empty'}</span></div></div></article>`; }).join('')}</div>`;
}
function detail(id) {
  const db = store.get(), e = db.enclosures.find((x) => x.id === id), n = Date.now();
  if (!e) return empty('Enclosure not found');
  const occ = occupants(db, e), c = climate(db, e), as = db.assemblies.find((a) => a.members.includes(e.id));
  const items = contextItems({ from: startOfDay(n) - DAY, to: startOfDay(n) + 7 * DAY, enclosure: e.id, includeHistory: true }).filter((i) => i.kind !== 'phase');
  return `<div class="pf-grid">
    <section class="card span-12 enc-hero"><img src="assets/img/enclosures/${e.img}.webp" alt="${esc(e.name)}"><div class="cl-main"><div class="row">${e.venomous ? '<span class="pill danger">VENOMOUS — hook & tube only</span>' : ''}${as ? `<a class="pill" href="#/enclosures/assemblies">${icon('layers3')}${esc(as.name)}</a>` : ''}</div>
      <div class="stats">${e.readings ? `<div class="stat"><b class="${c.tOk === false ? 'warn-t' : ''}">${e.readings.t} °C</b><span>now · 24 h ${e.readings.tMin}–${e.readings.tMax}</span></div><div class="stat"><b class="${c.rhOk === false ? 'warn-t' : ''}">${e.readings.rh} %</b><span>humidity · ${rel(e.readings.at)}</span></div>` : ''}${c.sp ? `<div class="stat"><b>${c.sp.env.day.join('–')} °C</b><span>target day${c.sp.env.basking ? ` · bask ${c.sp.env.basking.join('–')}` : ''}</span></div><div class="stat"><b>${c.sp.env.rh.join('–')} %</b><span>target RH</span></div>` : ''}<div class="stat"><b>${Math.round((e.dims.w * e.dims.d * e.dims.h) / 1000)} l</b><span>volume</span></div></div>
      <a class="btn" href="${HABITAT_URL}#enclosure=${esc(e.code)}" target="_blank" rel="noopener">${icon('cube')}Open in Habitat Studio${icon('external')}</a></div></section>
    <section class="card span-7"><header class="card-h"><span class="card-ico">${icon('planner')}</span><h3>Care in this enclosure</h3><span class="card-sub">occupants + enclosure tasks</span></header><div class="card-b">${streamHTML(items, { mode: 'compact', showDone: true, empty: 'Nothing scheduled' })}</div></section>
    <div class="span-5 stack">
      <section class="card"><header class="card-h"><span class="card-ico">${icon('animals')}</span><h3>Occupants</h3></header><div class="card-b">${occ.map((a) => `<a class="li" href="#/animals/a/${a.id}">${avatar(a, 40)}<span class="li-main"><b><span class="code">${esc(a.code)}</span> ${esc(a.name || '')}</b><i class="latin small">${esc(latin(SPECIES[a.species]))}</i></span></a>`).join('') || '<p class="muted">Empty — ready for new animals.</p>'}</div></section>
      <section class="card"><header class="card-h"><span class="card-ico">${icon('plug')}</span><h3>Technology</h3></header><div class="card-b">${e.tech.map((t) => { const left = lifeLeft(t); return `<div class="li"><span class="li-main"><b>${esc(t.label)}</b><span>installed ${dShort(t.installed)} · ${left < 0 ? `<b class="danger-t">${-left} d overdue</b>` : `${left} d left`}</span></span><div class="life"><i class="${left < 30 ? 'bad' : ''}" style="width:${Math.max(0, Math.min(100, (1 - left / t.lifeDays) * 100))}%"></i></div><button class="icon-btn sm" data-act="en-tech" data-id="${e.id}" data-k="${t.kind}" title="Replaced today">${icon('refresh')}</button></div>`; }).join('')}</div></section>
    </div></div>`;
}
function assemblies() {
  const db = store.get();
  return `<div class="as-list">${db.assemblies.map((a) => { const mem = a.members.map((id) => db.enclosures.find((e) => e.id === id)); return `<section class="card as-card"><img src="assets/img/enclosures/${mem[0]?.img === 'rack-glass' ? 'rack-glass' : 'rack-tubs'}.webp" alt=""><div class="card-b"><div class="row"><b>${esc(a.name)}</b><span class="pill">${esc(a.kind)}</span><span class="spacer"></span><span class="muted small">${a.dims.w} × ${a.dims.d} × ${a.dims.h} cm · ${esc(a.frame)}</span></div>
    <div class="as-cells" style="--n:${Math.min(3, mem.length)}">${mem.map((e) => { const s = status(db, e); return `<a href="#/enclosures/e/${e.id}" class="as-cell st-${s[0]}"><b class="code">${esc(e.code)}</b><span>${occupants(db, e).map((x) => esc(x.code)).join(', ') || '—'}</span>${e.readings ? `<em>${e.readings.t}° · ${e.readings.rh}%</em>` : ''}</a>`; }).join('')}</div>
    <div class="row"><button class="btn sm" data-act="en-asclean" data-id="${a.id}">${icon('clean')}Clean all ${mem.length}</button><a class="btn sm ghost" href="${HABITAT_URL}#assembly=${encodeURIComponent(a.name)}" target="_blank" rel="noopener">${icon('cube')}Edit in Habitat Studio</a></div></div></section>`; }).join('')}</div>`;
}
function habitat() {
  return `<div class="hab-page"><div class="hab-views">${[['room-hero', 'Room A — perspective'], ['room-iso', 'Isometric plan'], ['room-interior', 'Interior walk-through'], ['rack-glass', 'Frog wall A'], ['rack-tubs', 'Ball python rack'], ['paludarium', 'Paludarium PAL-1']].map(([k, l], i) => `<figure class="hv ${i === 0 ? 'big' : ''}"><img src="assets/img/enclosures/${k}.webp" alt="${esc(l)}" loading="lazy"><figcaption>${esc(l)}</figcaption></figure>`).join('')}</div>
    <section class="card hab-cta"><div class="card-b"><h3>${icon('cube')} Habitat Studio</h3><p>The 3D room planner, enclosure designer and assembly builder live in their own app. Concept B does not rebuild it — it links records to it: every enclosure and assembly opens directly in the planner.</p><p class="muted small">Renders above were produced by Habitat Studio's painted Planner renderer.</p><a class="btn primary lg" href="${HABITAT_URL}" target="_blank" rel="noopener">${icon('external')}Open Habitat Studio</a></div></section></div>`;
}
actions({
  'en-q': (el) => { F.q = el.value; store.emit('change'); },
  'en-type': (el) => { F.type = el.dataset.v; store.emit('change'); },
  'en-clean': (el) => { const res = openQuickRecord({ type: 'cleaning', subjects: [el.dataset.id] }); return res; },
  'en-asclean': (el) => { const db = store.get(), a = db.assemblies.find((x) => x.id === el.dataset.id); openQuickRecord({ type: 'cleaning', subjects: a.members }); },
  'en-tech': (el) => { store.mutate('Device replaced', (d) => { const e = d.enclosures.find((x) => x.id === el.dataset.id), t = e.tech.find((x) => x.kind === el.dataset.k); t.installed = Date.now(); if (e.status === 'attention') e.status = 'ok'; }); done({ label: 'Replacement recorded — life counter reset' }); },
});
