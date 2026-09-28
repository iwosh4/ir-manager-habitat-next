// ANIMALS — Grid (visual), Table (dense, column chooser, bulk), Groups, Archive. Profile lives in profile.js.
import { esc, actions } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as store from '../core/store.js';
import { panel, close as closeOv, menu, toast, isMobile } from '../core/overlay.js';
import { SPECIES, latin, imgFor } from '../data/species.js';
import { rotationState, lastRecord, lastWeight, nextOcc, TYPE } from '../engine/ops.js';
import * as A from '../engine/actions.js';
import { avatar, sexIcon, sexText, statusPill, breedPill, spName, empty, spark, chip, seg } from '../ui/components.js';
import { done } from '../ui/feedback.js';
import { openQuickRecord } from '../ui/quickrecord.js';
import { workspaceHTML, mountWorkspace } from '../widgets/workspace.js';
import * as profile from './profile.js';
import { DAY, HOUR, rel, ageText, dShort, hm, startOfDay, toDateInput } from '../core/time.js';

const load = () => { try { return JSON.parse(localStorage.getItem('irmB.animals') || '{}'); } catch { return {}; } };
const F = Object.assign({ q: '', sp: '', sex: '', status: '', breed: '', sort: 'code', dir: 1, cols: ['photo', 'code', 'species', 'sex', 'age', 'weight', 'enclosure', 'status', 'lastfed', 'nextfeed', 'health'], sel: [] }, load());
F.sel = new Set(F.sel || []);
const save = () => { try { localStorage.setItem('irmB.animals', JSON.stringify({ ...F, q: '', sel: [] })); } catch {} };
const COLS = { photo: 'Photo', code: 'Code', name: 'Name', species: 'Species', sex: 'Sex', age: 'Age', weight: 'Weight', enclosure: 'Enclosure', status: 'Status', breeding: 'Breeding', lastfed: 'Last fed', nextfeed: 'Next feeding', health: 'Health', morph: 'Morph' };

export function onEnter(r) { if (r.q.get('sp')) F.sp = r.q.get('sp'); profile.onEnter?.(r); }
export function context(r) {
  if (r.sub === 'a') return profile.context(r);
  const db = store.get(), live = db.animals.filter((a) => !['sold', 'deceased'].includes(a.status));
  return { sub: `${live.length} records · ${live.reduce((s, a) => s + (a.kind === 'group' ? a.count : 1), 0)} animals`, counts: { grid: live.length, table: live.length, groups: live.filter((a) => a.kind === 'group').length, archive: db.animals.length - live.length },
    actions: [{ label: 'Filters', icon: 'filter', act: 'an-filters', ghost: true, hideM: true }, { label: t('Add Animal'), icon: 'plus', act: 'an-add', primary: true, kbd: 'N' }] };
}
export function onNew(r) { if (r.sub === 'a') openQuickRecord({ subjects: [r.id] }); else openAddAnimal(); }
export function render(r) {
  if (r.sub === 'a') return profile.render(r);
  const sub = r.sub || 'grid';
  if (sub === 'groups') return groupsView();
  const list = filtered(sub === 'archive');
  return `${toolbar(sub, list)}${list.length ? (sub === 'table' ? tableView(list) : sub === 'archive' ? archiveView(list) : gridView(list)) : empty('No animals match', 'Clear filters or search for a code, Latin name or morph.', 'empty', `<button class="btn" data-act="an-clear">${icon('x')}Clear filters</button>`)}${F.sel.size && sub === 'table' ? bulkBar() : ''}${sub !== 'archive' ? `<div class="an-ws">${workspaceHTML('animals', { title: 'Collection workspace' })}</div>` : ''}`;
}
export function mount(root, r) { if (r.sub === 'a') return profile.mount?.(root, r); mountWorkspace(root); }

function filtered(archive = false) {
  const db = store.get(), q = F.q.toLowerCase();
  let list = db.animals.filter((a) => (archive ? ['sold', 'deceased'].includes(a.status) : !['sold', 'deceased'].includes(a.status)));
  if (F.sp) list = list.filter((a) => a.species === F.sp);
  if (F.sex) list = list.filter((a) => (a.kind === 'group' ? (F.sex === 'group') : a.sex === F.sex));
  if (F.status) list = list.filter((a) => a.status === F.status);
  if (F.breed) list = list.filter((a) => a.breeding && a.breeding !== 'resting');
  if (q) list = list.filter((a) => `${a.code} ${a.name} ${a.morph || ''} ${SPECIES[a.species]?.latin} ${SPECIES[a.species]?.ssp || ''} ${SPECIES[a.species]?.common} ${SPECIES[a.species]?.cz} ${db.enclosures.find((e) => e.id === a.enclosureId)?.code || ''} ${(a.members || []).map((m) => m.code).join(' ')}`.toLowerCase().includes(q));
  const key = { code: (a) => a.code, species: (a) => SPECIES[a.species].latin, age: (a) => -(a.born || 0), weight: (a) => lastWeight(db, a.id) || 0, enclosure: (a) => db.enclosures.find((e) => e.id === a.enclosureId)?.code || 'zz', nextfeed: (a) => nextOcc(db, a.id, 'feeding')?.t || 9e15, lastfed: (a) => -(lastRecord(db, a.id, 'feeding')?.t || 0), status: (a) => a.status }[F.sort] || ((a) => a.code);
  return list.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * F.dir);
}
function toolbar(sub, list) {
  const db = store.get(), sps = [...new Set(db.animals.filter((a) => (sub === 'archive') === ['sold', 'deceased'].includes(a.status)).map((a) => a.species))];
  return `<div class="toolbar an-tb">
    <div class="search-in"><span>${icon('search')}</span><input type="search" id="an-q" placeholder="Code, name, species, morph, enclosure…" value="${esc(F.q)}" data-input="an-q" aria-label="Search animals"></div>
    ${seg([['grid', 'Grid', 'grid'], ['table', 'Table', 'table']], sub === 'table' ? 'table' : 'grid', 'an-view')}
    <div class="an-chips">${chip('All species', { act: 'an-sp', data: { v: '' }, on: !F.sp })}${sps.map((k) => `<button class="chip sp-chip ${F.sp === k ? 'on' : ''}" data-act="an-sp" data-v="${k}"><img src="assets/img/species/${SPECIES[k].img}-1.webp" alt="" loading="lazy"><i class="latin">${esc(SPECIES[k].latin.split(' ')[0].slice(0, 1))}. ${esc(SPECIES[k].latin.split(' ')[1])}${SPECIES[k].ssp ? ` ${esc(SPECIES[k].ssp.replace(/[“”]/g, ''))}` : ''}</i></button>`).join('')}</div>
    <div class="an-chips">${[['', 'Any sex'], ['m', '♂ Male'], ['f', '♀ Female'], ['u', 'Unsexed'], ['group', 'Groups']].map(([v, l]) => chip(l, { act: 'an-sex', data: { v }, on: F.sex === v })).join('')}${sub !== 'archive' ? [['', 'Any status'], ['for-sale', 'For sale'], ['reserved', 'Reserved'], ['quarantine', 'Quarantine']].map(([v, l]) => chip(l, { act: 'an-status', data: { v }, on: F.status === v })).join('') + chip('Breeding', { act: 'an-breed', on: !!F.breed, icon: 'repro' }) : ''}</div>
    <span class="spacer"></span><span class="muted small">${list.length} shown</span>
    ${sub === 'table' ? `<button class="btn sm" data-act="an-cols">${icon('columns')}Columns</button>` : ''}
    <select class="sm-sel" data-change="an-sort" aria-label="Sort by">${[['code', 'Code'], ['species', 'Species'], ['age', 'Age'], ['weight', 'Weight'], ['enclosure', 'Enclosure'], ['nextfeed', 'Next feeding'], ['lastfed', 'Last fed']].map(([k, l]) => `<option value="${k}" ${F.sort === k ? 'selected' : ''}>Sort: ${l}</option>`).join('')}</select>
  </div>`;
}
function feedInfo(db, a) {
  const last = lastRecord(db, a.id, 'feeding'), nx = nextOcc(db, a.id, 'feeding'), plan = db.plans.find((p) => p.type === 'feeding' && p.subject === a.id);
  return { last, nx, plan, sup: plan ? rotationState(db, plan).next : null };
}
function gridView(list) {
  const db = store.get(), n = Date.now();
  return `<div class="an-grid">${list.map((a) => {
    const sp = SPECIES[a.species], e = db.enclosures.find((x) => x.id === a.enclosureId), fi = feedInfo(db, a), open = fi.nx && fi.nx.t < startOfDay(n) + DAY;
    const hl = db.health.find((h) => h.animal === a.id && !h.resolved && h.severity !== 'info');
    return `<article class="ac ${fi.nx?.t < n - 1800e3 ? 'late' : ''}">
      <a class="ac-img" href="#/animals/a/${a.id}"><img src="${imgFor(a)}" alt="${esc(latin(sp))}" loading="lazy" decoding="async"><span class="ac-tags">${a.kind === 'group' ? `<span class="pill">×${a.count}</span>` : ''}${a.status !== 'active' ? statusPill(a.status) : ''}${breedPill(a.breeding)}${hl ? `<span class="pill ${hl.severity === 'alert' ? 'danger' : 'warn'}">${icon('health')}${esc(hl.severity)}</span>` : ''}</span>${db.favorites.includes(a.id) ? `<span class="ac-fav">${icon('star')}</span>` : ''}</a>
      <div class="ac-b"><a href="#/animals/a/${a.id}" class="ac-t"><b class="code">${esc(a.code)}</b>${a.name ? `<span>${esc(a.name)}</span>` : ''}<span class="spacer"></span>${sexText(a)}</a>
        <div class="ac-sp"><i class="latin">${esc(latin(sp))}</i><span>${esc(a.morph || sp.common)}</span></div>
        <div class="ac-m"><span>${icon('enclosure')}${esc(e?.code || '—')}</span><span>${icon('feed')}${fi.last ? rel(fi.last.t) : '—'}</span></div>
        <div class="ac-next ${open ? 'due' : ''}">${fi.nx ? `<span>${open ? (fi.nx.t < n ? '<b class="danger-t">due now</b>' : `<b>today ${hm(fi.nx.t)}</b>`) : `next ${rel(fi.nx.t)}`}${fi.sup ? ` · <em>${esc(fi.sup)}</em>` : ''}</span>${open ? `<button class="btn sm primary" data-act="an-feed" data-id="${a.id}" title="Record scheduled feeding">${icon('check')}FED</button>` : ''}` : '<span class="muted">no feeding plan</span>'}<button class="icon-btn sm" data-act="quick-record" data-subject="${a.id}" title="Quick Record for ${esc(a.code)}">${icon('plus')}</button></div>
      </div></article>`;
  }).join('')}</div>`;
}
function tableView(list) {
  const db = store.get(), n = Date.now(), C = F.cols;
  const th = (k) => `<th ${['code', 'species', 'age', 'weight', 'enclosure', 'nextfeed', 'lastfed', 'status'].includes(k) ? `data-act="an-sortby" data-v="${k}"` : ''} class="${['weight', 'age'].includes(k) ? 'num' : ''} c-${k}">${COLS[k]}${F.sort === k ? icon(F.dir > 0 ? 'arrowDown' : 'arrowUp') : ''}</th>`;
  const allSel = list.every((a) => F.sel.has(a.id));
  return `<div class="tbl-wrap an-tbl"><table class="tbl"><thead><tr><th class="c-sel"><input type="checkbox" class="cb" data-act="an-selall" ${allSel ? 'checked' : ''} aria-label="Select all visible"></th>${C.map(th).join('')}<th></th></tr></thead><tbody>
    ${list.map((a) => { const sp = SPECIES[a.species], e = db.enclosures.find((x) => x.id === a.enclosureId), fi = feedInfo(db, a), w = lastWeight(db, a.id), hl = db.health.find((h) => h.animal === a.id && !h.resolved && h.severity !== 'info');
      const cell = { photo: `<td class="c-photo">${avatar(a, 30)}</td>`, code: `<td><a class="code" href="#/animals/a/${a.id}">${esc(a.code)}</a>${a.name ? ` <span class="dim">${esc(a.name)}</span>` : ''}</td>`, name: `<td>${esc(a.name || '—')}</td>`, species: `<td><i class="latin">${esc(latin(sp))}</i></td>`, sex: `<td>${sexText(a)}</td>`, age: `<td class="num">${ageText(a.born)}</td>`,
        weight: `<td class="num">${a.kind === 'group' ? '—' : w != null ? `${w} g` : '—'}</td>`, enclosure: `<td>${e ? `<a href="#/enclosures/e/${e.id}" class="mono">${esc(e.code)}</a>` : '—'}</td>`, status: `<td>${statusPill(a.status)}</td>`, breeding: `<td>${breedPill(a.breeding) || '—'}</td>`,
        lastfed: `<td class="mono">${fi.last ? `${rel(fi.last.t)}${fi.last.data?.refused ? ' <span class="danger-t">refused</span>' : ''}` : '—'}</td>`, nextfeed: `<td class="mono">${fi.nx ? `<span class="${fi.nx.t < n ? 'danger-t' : ''}">${fi.nx.t < startOfDay(n) + DAY ? `today ${hm(fi.nx.t)}` : dShort(fi.nx.t)}</span>${fi.sup ? ` <em class="dim">${esc(fi.sup)}</em>` : ''}` : '—'}</td>`,
        health: `<td>${hl ? `<span class="pill ${hl.severity === 'alert' ? 'danger' : 'warn'}">${esc(hl.title.slice(0, 24))}</span>` : '<span class="ok-t">●</span>'}</td>`, morph: `<td>${esc(a.morph || '—')}</td>` };
      return `<tr class="${F.sel.has(a.id) ? 'sel' : ''}"><td class="c-sel"><input type="checkbox" class="cb" data-act="an-sel" data-id="${a.id}" ${F.sel.has(a.id) ? 'checked' : ''} aria-label="Select ${esc(a.code)}"></td>${C.map((k) => cell[k]).join('')}<td class="c-act">${fi.nx && fi.nx.t < startOfDay(n) + DAY ? `<button class="btn sm" data-act="an-feed" data-id="${a.id}">${icon('check')}Fed</button>` : ''}<button class="icon-btn sm" data-act="quick-record" data-subject="${a.id}" title="Quick Record">${icon('plus')}</button></td></tr>`; }).join('')}
  </tbody></table></div>
  <div class="an-cards">${list.map((a) => { const sp = SPECIES[a.species], e = db.enclosures.find((x) => x.id === a.enclosureId), fi = feedInfo(db, a); return `<details class="an-row"><summary>${avatar(a, 44)}<span class="li-main"><b><span class="code">${esc(a.code)}</span> ${esc(a.name || '')}</b><i class="latin">${esc(latin(sp))}</i></span>${sexText(a)}<span class="mono small ${fi.nx?.t < n ? 'danger-t' : ''}">${fi.nx ? (fi.nx.t < startOfDay(n) + DAY ? hm(fi.nx.t) : dShort(fi.nx.t)) : ''}</span></summary><dl class="kv"><dt>Enclosure</dt><dd>${esc(e?.code || '—')}</dd><dt>Age</dt><dd>${ageText(a.born)}</dd><dt>Weight</dt><dd>${lastWeight(db, a.id) ?? '—'} g</dd><dt>Last fed</dt><dd>${fi.last ? rel(fi.last.t) : '—'}</dd><dt>Status</dt><dd>${statusPill(a.status)} ${breedPill(a.breeding)}</dd></dl><div class="row"><a class="btn sm" href="#/animals/a/${a.id}">${icon('eye')}Open</a><button class="btn sm primary" data-act="quick-record" data-subject="${a.id}">${icon('plus')}Record</button></div></details>`; }).join('')}</div>`;
}
function bulkBar() {
  return `<div class="bulkbar"><b>${F.sel.size}</b><span>selected</span><span class="spacer"></span>
    ${[['feeding', 'Fed'], ['water', 'Water'], ['misting', 'Mist'], ['cleaning', 'Clean']].map(([k, l]) => `<button class="btn sm" data-act="an-bulk" data-type="${k}">${icon(TYPE[k].icon)}${l}</button>`).join('')}
    <button class="btn sm" data-act="an-bulk-more">${icon('more')}More</button><button class="btn sm ghost" data-act="an-selnone">${icon('x')}Clear</button></div>`;
}
function archiveView(list) {
  const db = store.get();
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Code</th><th>Species</th><th>Status</th><th>Date</th><th>To / note</th><th class="num">Price</th></tr></thead><tbody>${list.map((a) => { const c = db.contacts.find((x) => x.id === a.soldTo); return `<tr><td>${avatar(a, 30, 'arch')}</td><td><a class="code" href="#/animals/a/${a.id}">${esc(a.code)}</a> ${esc(a.name || '')}</td><td><i class="latin">${esc(latin(SPECIES[a.species]))}</i></td><td>${statusPill(a.status)}</td><td class="mono">${dShort(a.soldAt || a.diedAt)}</td><td class="dim">${esc(c?.name || a.notes || '')}</td><td class="num">${a.price ? `${a.price.toLocaleString('cs-CZ')} Kč` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function groupsView() {
  const db = store.get(), groups = db.animals.filter((a) => a.kind === 'group' && !['sold', 'deceased'].includes(a.status));
  return `<p class="muted lead">Group-kept animals appear as <b>one representative card</b>. Care recorded on the group applies to all members (group husbandry); members keep their own codes and notes inside the group profile.</p>
  <div class="grp-cards">${groups.map((a) => { const sp = SPECIES[a.species], e = db.enclosures.find((x) => x.id === a.enclosureId), fi = feedInfo(db, a); return `<article class="gcard"><a class="gc-img" href="#/animals/a/${a.id}"><img src="${imgFor(a)}" alt="" loading="lazy"></a><div class="gc-b"><div class="row"><b class="code">${esc(a.code)}</b><span>${esc(a.name)}</span><span class="spacer"></span>${breedPill(a.breeding)}</div><i class="latin">${esc(latin(sp))}</i>
    <div class="gc-sex"><span class="sx m">${icon('male')}${a.sexes.m}</span><span class="sx f">${icon('female')}${a.sexes.f}</span><span class="sx u">${icon('unknownSex')}${a.sexes.u}</span><span class="muted">· ${a.count} animals · ${esc(e?.code || '')}</span></div>
    <div class="gc-mem">${a.members.map((m) => `<span class="mem">${sexIcon(m.sex)}<span class="mono">${esc(m.code.split('/')[1])}</span></span>`).join('')}</div>
    <div class="row">${fi.nx ? `<span class="small ${fi.nx.t < Date.now() ? 'danger-t' : 'dim'}">${icon('feed')} ${fi.nx.t < startOfDay(Date.now()) + DAY ? `today ${hm(fi.nx.t)}` : dShort(fi.nx.t)} · ${esc(fi.sup || '')}</span>` : ''}<span class="spacer"></span><button class="btn sm primary" data-act="an-feed" data-id="${a.id}" ${fi.nx && fi.nx.t < startOfDay(Date.now()) + DAY ? '' : 'disabled'}>${icon('check')}Fed</button><a class="btn sm" href="#/animals/a/${a.id}">Open group</a></div></div></article>`; }).join('')}</div>`;
}

// ---------------------------------------------------------------- add animal (stepper: species → identity → place)
export function openAddAnimal(preset = {}) {
  const db = store.get(), S = { step: preset.species ? 1 : 0, sp: preset.species || '', kind: 'individual', sex: 'u', count: 3, m: 0, f: 0, name: '', code: '', enc: '', born: Date.now() - 90 * DAY, plans: true, q: '' };
  const nextCode = (sp) => { const pre = { 'dendrobates-tinctorius-azureus': 'AZ', 'dendrobates-leucomelas': 'LEU', 'correlophus-ciliatus': 'CC', 'furcifer-pardalis': 'FP', 'morelia-spilota': 'MSP', 'python-regius': 'PR', 'atheris-squamigera': 'AS', 'pantherophis-obsoletus-lindheimeri': 'PL' }[sp] || 'AN'; const nums = db.animals.filter((a) => a.code.startsWith(pre + '-')).map((a) => parseInt(a.code.split('-')[1], 10)).filter((x) => !isNaN(x)); return `${pre}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0')}`; };
  const h = panel({ title: t('Add Animal'), sub: 'Three short steps — details can be added later', icon: 'plus', width: 560, body: '<div data-add></div>' });
  const draw = () => {
    const box = h.el.querySelector('[data-add]');
    const steps = ['Species', 'Identity', 'Place'];
    const head = `<ol class="stepper">${steps.map((s, i) => `<li class="${i === S.step ? 'on' : i < S.step ? 'ok' : ''}">${i < S.step ? icon('check') : `<b>${i + 1}</b>`}<span>${s}</span></li>`).join('')}</ol>`;
    if (S.step === 0) box.innerHTML = `${head}<div class="qr-search"><span>${icon('search')}</span><input type="search" data-aq placeholder="Latin or common name…" value="${esc(S.q)}" autofocus></div><div class="sp-pick">${Object.entries(SPECIES).filter(([, x]) => !S.q || `${x.latin} ${x.ssp || ''} ${x.common} ${x.cz}`.toLowerCase().includes(S.q.toLowerCase())).map(([k, x]) => `<button class="spp ${S.sp === k ? 'on' : ''}" data-sp="${k}"><img src="assets/img/species/${x.img}-1.webp" alt="" loading="lazy"><span><i class="latin">${esc(latin(x))}</i><em>${esc(x.common)} · ${esc(x.cz)}</em></span></button>`).join('')}</div>`;
    if (S.step === 1) { const sp = SPECIES[S.sp]; if (!S.code) S.code = nextCode(S.sp); if (sp.group && S.kind === 'individual' && !S.kindTouched) S.kind = 'group';
      box.innerHTML = `${head}<div class="stack"><div class="row">${`<img class="sp-sm" src="assets/img/species/${sp.img}-1.webp" alt="">`}<div>${spName(S.sp)}</div></div>
        <div class="seg">${[['individual', 'Individual'], ['group', 'Group (one card)']].map(([k, l]) => `<button class="${S.kind === k ? 'on' : ''}" data-kind="${k}">${l}</button>`).join('')}</div>
        <div class="grid2"><label class="field"><span>Code</span><input type="text" data-f="code" value="${esc(S.code)}"></label><label class="field"><span>${S.kind === 'group' ? 'Group name' : 'Name (optional)'}</span><input type="text" data-f="name" value="${esc(S.name)}"></label></div>
        ${S.kind === 'group' ? `<div class="grid3"><label class="field"><span>Males</span><input type="number" min="0" data-f="m" value="${S.m}"></label><label class="field"><span>Females</span><input type="number" min="0" data-f="f" value="${S.f}"></label><label class="field"><span>Unsexed</span><input type="number" min="0" data-f="count" value="${S.count}"></label></div>`
          : `<div class="field"><span>Sex</span><div class="seg">${[['m', '♂ Male'], ['f', '♀ Female'], ['u', 'Unsexed']].map(([k, l]) => `<button class="${S.sex === k ? 'on' : ''}" data-sex="${k}">${l}</button>`).join('')}</div></div>`}
        <label class="field"><span>Hatch / birth date</span><input type="date" data-f="born" value="${toDateInput(S.born)}"></label></div>`; }
    if (S.step === 2) { const sp = SPECIES[S.sp];
      box.innerHTML = `${head}<div class="stack"><label class="field"><span>Enclosure</span><select data-f="enc"><option value="">— not placed yet —</option>${db.enclosures.map((e) => { const occ = db.animals.filter((a) => a.enclosureId === e.id && !['sold', 'deceased'].includes(a.status)); return `<option value="${e.id}" ${S.enc === e.id ? 'selected' : ''}>${esc(e.code)} · ${esc(e.name)} · ${e.dims.w} × ${e.dims.d} × ${e.dims.h} cm${occ.length ? ` · ${occ.map((a) => a.code).join(', ')}` : ' · empty'}</option>`; }).join('')}</select></label>
        <label class="row opt"><input type="checkbox" class="cb" data-plans ${S.plans ? 'checked' : ''}><span><b>Create care plan from species defaults</b><br><span class="muted small">Feeding ${esc(sp.feeding.feeder)} every ${sp.feeding.every === 1 ? 'day' : `${sp.feeding.every} days`}${sp.feeding.rotation.length > 1 ? `, supplement rotation ${esc(sp.feeding.rotation.join(' → '))}` : ''}; weekly cleaning. Editable later.</span></span></label>
        <div class="add-sum">${avatar({ id: S.code, species: S.sp }, 56)}<div><b class="code">${esc(S.code)}</b> ${esc(S.name)}<br>${spName(S.sp)}<span class="muted small">${S.kind === 'group' ? `group · ${+S.m + +S.f + +S.count} animals (${S.m}.${S.f}.${S.count})` : S.sex === 'm' ? 'male' : S.sex === 'f' ? 'female' : 'unsexed'} · hatched ${dShort(S.born)}</span></div></div></div>`; }
    h.el.querySelector('.ov-foot')?.remove();
    const foot = document.createElement('footer'); foot.className = 'ov-foot';
    foot.innerHTML = `${S.step > 0 ? `<button class="btn ghost" data-back>${icon('arrowLeft')}Back</button>` : ''}<span class="spacer"></span>${S.step < 2 ? `<button class="btn primary" data-next ${S.step === 0 && !S.sp ? 'disabled' : ''}>Continue${icon('arrowRight')}</button>` : `<button class="btn primary" data-create>${icon('check')}Create animal</button>`}`;
    h.el.querySelector('.ov-box').append(foot);
    box.querySelector('[autofocus]')?.focus();
  };
  h.el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sp) { S.sp = b.dataset.sp; S.code = ''; S.step = 1; draw(); }
    if (b.dataset.kind) { S.kind = b.dataset.kind; S.kindTouched = true; draw(); }
    if (b.dataset.sex) { S.sex = b.dataset.sex; draw(); }
    if (b.hasAttribute('data-next')) { S.step++; draw(); }
    if (b.hasAttribute('data-back')) { S.step--; draw(); }
    if (b.hasAttribute('data-create')) create();
  });
  h.el.addEventListener('input', (e) => { if (e.target.matches('[data-aq]')) { S.q = e.target.value; const p = e.target.selectionStart; draw(); const i = h.el.querySelector('[data-aq]'); i.focus(); i.setSelectionRange(p, p); } const f = e.target.dataset.f; if (f) S[f] = f === 'born' ? new Date(e.target.value).getTime() || S.born : e.target.value; });
  h.el.addEventListener('change', (e) => { if (e.target.matches('[data-plans]')) S.plans = e.target.checked; const f = e.target.dataset.f; if (f === 'enc') S.enc = e.target.value; });
  const create = () => {
    const id = `a_${Date.now().toString(36)}`, sp = SPECIES[S.sp];
    store.mutate(`Added ${S.code}`, (d) => {
      const base = { id, code: S.code.trim() || nextCode(S.sp), name: S.name.trim(), species: S.sp, enclosureId: S.enc || null, born: S.born, status: 'active', tags: [], genetics: [], favorite: false, notes: '', breeding: 'resting', origin: { type: 'own-breeding' }, imgVariant: Math.floor(Math.random() * 6), created: Date.now() };
      if (S.kind === 'group') { const m = +S.m, f = +S.f, u = +S.count; d.animals.push({ ...base, kind: 'group', count: m + f + u, sexes: { m, f, u }, members: [...Array(m).fill('m'), ...Array(f).fill('f'), ...Array(u).fill('u')].map((sx, i) => ({ id: `${id}_${i + 1}`, code: `${base.code}/${i + 1}`, sex: sx, note: '' })) }); }
      else d.animals.push({ ...base, kind: 'individual', sex: S.sex });
      if (S.plans) {
        const T0 = startOfDay(Date.now());
        d.plans.push({ id: `p_feed_${id}`, type: 'feeding', subject: id, every: sp.feeding.every, times: [sp.feeding.time], anchor: T0 + DAY, feeder: sp.feeding.feeder, qty: sp.feeding.qty, rotation: sp.feeding.rotation, protocol: `${sp.latin} default feeding`, active: true, origin: 'care-plan' });
        if (S.enc) d.plans.push({ id: `p_clean_${id}`, type: 'cleaning', subject: S.enc, subjectKind: 'enclosure', every: 7, times: [[11, 0]], anchor: T0 + 2 * DAY, protocol: 'Weekly spot clean & glass', active: true, origin: 'care-plan' });
      }
      d.recent.animals = [id, ...d.recent.animals].slice(0, 12);
    });
    closeOv(h); done({ label: `Added ${S.code} — ${sp.latin}` }); location.hash = `#/animals/a/${id}`;
  };
  draw();
}
// ---------------------------------------------------------------- edit animal (drawer)
export function openEditAnimal(id) {
  const db = store.get(), a = db.animals.find((x) => x.id === id); if (!a) return;
  const body = `<div class="stack"><div class="grid2"><label class="field"><span>Code</span><input type="text" data-e="code" value="${esc(a.code)}"></label><label class="field"><span>Name</span><input type="text" data-e="name" value="${esc(a.name || '')}"></label></div>
    <label class="field"><span>Species</span><select data-e="species">${Object.entries(SPECIES).map(([k, x]) => `<option value="${k}" ${a.species === k ? 'selected' : ''}>${esc(latin(x))}</option>`).join('')}</select></label>
    ${a.kind === 'group' ? `<div class="grid3"><label class="field"><span>Males</span><input type="number" data-e="m" value="${a.sexes.m}"></label><label class="field"><span>Females</span><input type="number" data-e="f" value="${a.sexes.f}"></label><label class="field"><span>Unsexed</span><input type="number" data-e="u" value="${a.sexes.u}"></label></div>` : `<label class="field"><span>Sex</span><select data-e="sex">${[['m', 'Male'], ['f', 'Female'], ['u', 'Unsexed']].map(([k, l]) => `<option value="${k}" ${a.sex === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
    <div class="grid2"><label class="field"><span>Morph / locality</span><input type="text" data-e="morph" value="${esc(a.morph || '')}"></label><label class="field"><span>Hatch date</span><input type="date" data-e="born" value="${toDateInput(a.born)}"></label></div>
    <div class="grid2"><label class="field"><span>Enclosure</span><select data-e="enclosureId"><option value="">—</option>${db.enclosures.map((e) => `<option value="${e.id}" ${a.enclosureId === e.id ? 'selected' : ''}>${esc(e.code)} · ${esc(e.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Status</span><select data-e="status">${['active', 'quarantine', 'for-sale', 'reserved', 'sold', 'deceased'].map((s) => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
    <div class="grid2"><label class="field"><span>Breeding state</span><select data-e="breeding">${['resting', 'cycling', 'paired', 'breeding', 'gravid', 'post-lay', 'pre-brumation'].map((s) => `<option ${a.breeding === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="field"><span>Price (Kč)</span><input type="number" data-e="price" value="${a.price || ''}"></label></div>
    <label class="field"><span>Description</span><textarea rows="3" data-e="description">${esc(a.description || '')}</textarea></label><label class="field"><span>Notes</span><textarea rows="2" data-e="notes">${esc(a.notes || '')}</textarea></label></div>`;
  const h = panel({ title: `Edit ${a.code}`, icon: 'edit', width: 520, body, footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-save>${icon('check')}Save</button>` });
  h.el.querySelector('[data-save]').onclick = () => {
    const v = (k) => h.el.querySelector(`[data-e=${k}]`)?.value;
    store.mutate(`Edited ${a.code}`, (d) => { const x = d.animals.find((y) => y.id === id); Object.assign(x, { code: v('code'), name: v('name'), species: v('species'), morph: v('morph'), born: new Date(v('born')).getTime() || x.born, enclosureId: v('enclosureId') || null, status: v('status'), breeding: v('breeding'), price: +v('price') || null, description: v('description'), notes: v('notes') }); if (x.kind === 'group') { x.sexes = { m: +v('m'), f: +v('f'), u: +v('u') }; x.count = x.sexes.m + x.sexes.f + x.sexes.u; } else x.sex = v('sex'); });
    closeOv(h); done({ label: `Saved ${v('code')}` });
  };
}

actions({
  'an-add': () => openAddAnimal(),
  'an-q': (el) => { F.q = el.value; store.emit('change'); },
  'an-view': (el) => { location.hash = `#/animals/${el.dataset.v}`; },
  'an-sp': (el) => { F.sp = F.sp === el.dataset.v ? '' : el.dataset.v; save(); store.emit('change'); },
  'an-sex': (el) => { F.sex = el.dataset.v; save(); store.emit('change'); },
  'an-status': (el) => { F.status = el.dataset.v; save(); store.emit('change'); },
  'an-breed': () => { F.breed = F.breed ? '' : '1'; save(); store.emit('change'); },
  'an-clear': () => { Object.assign(F, { q: '', sp: '', sex: '', status: '', breed: '' }); save(); store.emit('change'); },
  'an-sort': (el) => { F.sort = el.value; F.dir = 1; save(); store.emit('change'); },
  'an-sortby': (el) => { if (F.sort === el.dataset.v) F.dir *= -1; else { F.sort = el.dataset.v; F.dir = 1; } save(); store.emit('change'); },
  'an-filters': (el) => document.getElementById('an-q')?.focus(),
  'an-cols': (el) => menu(el, Object.entries(COLS).map(([k, l]) => ({ icon: F.cols.includes(k) ? 'check' : 'dot', label: l, run: () => { F.cols = F.cols.includes(k) ? F.cols.filter((c) => c !== k) : Object.keys(COLS).filter((c) => F.cols.includes(c) || c === k); save(); store.emit('change'); } })), { title: 'Columns' }),
  'an-sel': (el) => { F.sel.has(el.dataset.id) ? F.sel.delete(el.dataset.id) : F.sel.add(el.dataset.id); store.emit('change'); },
  'an-selall': () => { const ids = filtered().map((a) => a.id); const all = ids.every((id) => F.sel.has(id)); ids.forEach((id) => (all ? F.sel.delete(id) : F.sel.add(id))); store.emit('change'); },
  'an-selnone': () => { F.sel.clear(); store.emit('change'); },
  'an-bulk': (el) => { const ids = [...F.sel]; done(A.quickRecord(el.dataset.type, ids, {})); F.sel.clear(); },
  'an-bulk-more': (el) => menu(el, [
    { icon: 'weight', label: 'Weigh (one after another)', run: () => openQuickRecord({ type: 'weight', subjects: [[...F.sel][0]] }) },
    { icon: 'health', label: 'Health observation', run: () => openQuickRecord({ type: 'health', subjects: [...F.sel] }) },
    { icon: 'tag', label: 'Mark for sale', run: () => { const ids = [...F.sel]; store.mutate(`Marked ${ids.length} for sale`, (d) => { for (const id of ids) { const a = d.animals.find((x) => x.id === id); a.status = 'for-sale'; if (!d.sales.some((s) => s.animal === id && s.status !== 'sold')) d.sales.push({ id: `sl_${id}`, animal: id, status: 'for-sale', price: a.price || 0, listed: Date.now() }); } }); F.sel.clear(); done({ label: `Marked ${ids.length} for sale` }); } },
    { icon: 'printer', label: 'Print labels', run: () => import('../widgets/tooldrawer.js').then((m) => m.openToolDrawer('labels')) },
  ], { title: `${F.sel.size} selected` }),
  'an-feed': (el) => { const db = store.get(), nx = nextOcc(db, el.dataset.id, 'feeding'); if (!nx) return; done(A.complete([nx.id], { source: 'animals' })); },
});
