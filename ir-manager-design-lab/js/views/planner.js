// PLANNER — the universal operational timeline: overview, planning, daily work, automation, direct actions, history.
import { esc, actions } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as store from '../core/store.js';
import { menu } from '../core/overlay.js';
import { SPECIES } from '../data/species.js';
import { TYPE } from '../engine/ops.js';
import { groupItems, isOpen } from '../engine/timeline.js';
import { streamHTML, contextItems } from '../ui/timeline.js';
import { openQuickRecord } from '../ui/quickrecord.js';
import { ring, seg, chip } from '../ui/components.js';
import { DAY, HOUR, startOfDay, dShort, hm, wd, dLong } from '../core/time.js';

const load = () => { try { return JSON.parse(localStorage.getItem('irmB.planner') || '{}'); } catch { return {}; } };
const S = Object.assign({ scale: '3d', filter: 'all', q: '', showDone: true, extra: 0, past: 0, sp: '', enc: '', lanes: true }, load());
const save = () => { try { const { q, extra, past, ...keep } = S; localStorage.setItem('irmB.planner', JSON.stringify(keep)); } catch {} };
const SCALES = [['today', 'Today'], ['3d', '3 Days'], ['week', 'Week'], ['month', 'Month']];
const DAYS = { today: 1, '3d': 3, week: 7, month: 30 };
let focusId = null;

export function onEnter(r) {
  if (r.sub === 'today') S.scale = 'today'; else if (r.sub === 'week') S.scale = 'week';
  focusId = r.q.get('focus'); S.extra = 0;
}
function range(r) {
  const n = Date.now(), sod = startOfDay(n);
  if (r.sub === 'history') return { from: sod - (14 + S.past) * DAY, to: n, history: true };
  return { from: sod - (1 + S.past) * DAY, to: sod + (DAYS[S.scale] + S.extra) * DAY };
}
export function context(r) {
  return {
    sub: r.sub === 'history' ? 'Operational history · completed, skipped, postponed' : `${dLong(Date.now())} · ${hm(Date.now())}`,
    actions: [
      { label: t('Now'), icon: 'clock', act: 'pl-now', title: 'Jump to NOW' },
      { label: t('Add'), icon: 'plus', act: 'pl-add', primary: true, title: '+ ADD — Task, Care, Health, Reproduction event, Note (N)' },
    ],
  };
}
export function onNew() { openQuickRecord({ type: 'task' }); }

export function render(r) {
  const n = Date.now(), rg = range(r), db = store.get();
  let items = contextItems({ from: rg.from, to: rg.to, filter: S.filter, q: S.q, includeHistory: true });
  if (S.sp) items = items.filter((i) => i.sub?.obj?.species === S.sp);
  if (S.enc) items = items.filter((i) => i.enclosure === S.enc || i.subject === S.enc);
  if (rg.history) items = items.filter((i) => !isOpen(i) && i.kind !== 'phase').sort((a, b) => b.t - a.t);
  const open = items.filter((i) => i.kind !== 'phase' && isOpen(i) && i.t < startOfDay(n) + DAY);
  const doneToday = items.filter((i) => i.kind !== 'phase' && i.status === 'done' && i.t >= startOfDay(n) && i.t < startOfDay(n) + DAY);
  const tot = open.length + doneToday.length;
  const fl = [['all', 'All'], ['care', 'Care'], ['feeding', 'Feeding'], ['health', 'Health'], ['repro', 'Reproduction'], ['enclosures', 'Enclosures'], ['manual', 'Manual'], ['auto', 'Automatic']];
  const counts = {}; for (const [k] of fl) counts[k] = 0;
  const spOpts = [...new Set(db.animals.filter((a) => !['sold', 'deceased'].includes(a.status)).map((a) => a.species))];
  return `<div class="planner ${rg.history ? 'is-history' : ''}">
    <div class="pl-bar">
      ${rg.history ? '' : seg(SCALES, S.scale, 'pl-scale')}
      <div class="pl-filters">${fl.map(([k, l]) => chip(l, { act: 'pl-filter', data: { v: k }, on: S.filter === k })).join('')}</div>
      <div class="pl-right">
        <div class="search-in sm">${icon('search')}<input type="search" placeholder="Animal, code, species, task, clutch…" value="${esc(S.q)}" data-input="pl-q" id="pl-q" aria-label="Search the timeline"></div>
        <button class="btn sm ${S.sp || S.enc ? 'on-f' : ''}" data-act="pl-more-f">${icon('filter')}Filters${S.sp || S.enc ? ' ·1+' : ''}</button>
        ${rg.history ? '' : `<label class="row sm-t"><input type="checkbox" class="switch" data-change="pl-done" ${S.showDone ? 'checked' : ''}><span>Completed</span></label>`}
      </div>
    </div>
    <div class="pl-grid">
      <div class="pl-main">
        ${!rg.history && S.lanes ? lanesHTML() : ''}
        ${!rg.history ? `<button class="btn ghost sm pl-earlier" data-act="pl-earlier">${icon('history')}Show earlier (${S.past ? `${S.past + 1} days loaded` : 'yesterday loaded'})</button>` : ''}
        ${rg.history ? historyHTML(items) : streamHTML(items, { mode: 'full', showDone: S.showDone, empty: S.q ? `No match for “${S.q}”` : 'Nothing scheduled in this range' })}
        <button class="btn block pl-more" data-act="${rg.history ? 'pl-earlier' : 'pl-later'}">${icon(rg.history ? 'history' : 'calendarPlus')}${rg.history ? 'Load 7 earlier days' : `Load next 7 days (showing to ${dShort(rg.to - 1)})`}</button>
      </div>
      <aside class="pl-side">
        <section class="card pl-prog"><div class="card-b">
          <div class="row">${ring(tot ? doneToday.length / tot : 1, { size: 64, label: `${doneToday.length}/${tot}` })}<div><b class="big">${open.length ? `${open.length} open today` : 'Today complete'}</b><div class="muted">${open.filter((i) => i.status === 'overdue').length} overdue · ${doneToday.length} done</div></div></div>
          <div class="pl-types">${Object.entries(groupBy(open, (i) => i.type)).map(([k, arr]) => `<button class="pl-type" data-act="pl-filter" data-v="${k === 'feeding' ? 'feeding' : ['health', 'medication'].includes(k) ? 'health' : ['repro', 'incubation'].includes(k) ? 'repro' : 'care'}" style="--c:${TYPE[k]?.color}">${icon(TYPE[k]?.icon || 'dot')}<span>${TYPE[k]?.label || k}</span><b>${arr.length}</b></button>`).join('')}</div>
        </div></section>
        <section class="card"><header class="card-h"><span class="card-ico">${icon('repro')}</span><h3>Biology next</h3></header><div class="card-b list">${bioNext()}</div></section>
        <section class="card"><header class="card-h"><span class="card-ico">${icon('info')}</span><h3>Legend</h3></header><div class="card-b legend">
          ${['feeding', 'water', 'misting', 'cleaning', 'weight', 'health', 'medication', 'repro', 'incubation', 'maintenance'].map((k) => `<span style="--c:${TYPE[k].color}"><i></i>${TYPE[k].label}</span>`).join('')}
          <p class="muted small">${icon('repeat')} PLAN = generated by a care plan · ${icon('bolt')} AUTO = automatic · ${icon('edit')} MANUAL · ${icon('repro')} REPRO = from a reproduction cycle. Tap ${icon('help')} on any item to see why it is there.</p></div></section>
      </aside>
    </div>
  </div>`;
}
const groupBy = (arr, fn) => arr.reduce((m, x) => { (m[fn(x)] ||= []).push(x); return m; }, {});

function lanesHTML() {
  const db = store.get(), n = Date.now(), from = startOfDay(n) - 14 * DAY, to = startOfDay(n) + 76 * DAY, span = to - from;
  const x = (tt) => `${Math.max(0, Math.min(100, ((tt - from) / span) * 100))}%`;
  const lanes = [];
  for (const cy of db.cycles.filter((c) => c.status === 'active')) {
    const bars = cy.phases.filter((p) => (p.end ?? p.start) >= from && p.start <= to).map((p) => ({ ...p, end: p.end ?? p.start }));
    const cl = db.clutches.find((c) => c.cycleId === cy.id && c.status === 'incubating');
    lanes.push({ id: cy.id, label: cy.name, sp: cy.species, bars, cl, href: `#/reproduction/cycle/${cy.id}` });
  }
  for (const m of db.meds.filter((m) => m.done < m.count)) lanes.push({ id: m.id, label: `${m.drug.split(' (')[0]} · ${db.animals.find((a) => a.id === m.animal)?.code}`, bars: [{ key: 'med', label: 'Course', start: m.from, end: m.from + (m.count - 1) * m.everyH * HOUR }], href: '#/health/medication', med: true });
  const ticks = []; for (let d = startOfDay(from); d <= to; d += DAY) { if (new Date(d).getDay() === 1) ticks.push(d); }
  return `<section class="card lanes"><header class="card-h"><span class="card-ico">${icon('layers3')}</span><h3>Biological timeline</h3><span class="card-sub">phases, expected windows & courses · 90 days</span><span class="card-a"><button class="icon-btn sm" data-act="pl-lanes" title="Hide">${icon('minimize')}</button></span></header>
    <div class="card-b"><div class="ln-wrap"><div class="ln-ticks">${ticks.map((d) => `<span style="left:${x(d)}">${new Date(d).getDate() <= 7 ? `<b>${dShort(d)}</b>` : dShort(d)}</span>`).join('')}</div>
    ${lanes.map((l) => `<a class="ln" href="${l.href}"><span class="ln-l"><b>${esc(l.label)}</b>${l.sp ? `<i class="latin">${esc(SPECIES[l.sp].latin)}</i>` : ''}</span><span class="ln-track">${l.bars.map((b) => b.milestone || b.start === b.end ? `<i class="ln-ms ${b.observed ? 'obs' : ''}" style="left:${x(b.start)}" title="${esc(b.label)} · ${dShort(b.start)}"></i>` : `<i class="ln-bar k-${b.key} ${b.expected ? 'exp' : ''} ${b.planned ? 'plan' : ''}" style="left:${x(b.start)};width:calc(${x(b.end)} - ${x(b.start)})" title="${esc(b.label)} · ${dShort(b.start)} → ${dShort(b.end)}${b.basis ? ` · ${esc(b.basis)}` : ''}"><em>${esc(b.label)}</em></i>`).join('')}</span></a>`).join('')}
    <i class="ln-now" style="left:calc(210px + (100% - 210px) * ${((n - from) / span).toFixed(4)})"><em>NOW</em></i></div></div></section>`;
}
function bioNext() {
  const db = store.get(), n = Date.now(), rows = [];
  for (const cl of db.clutches.filter((c) => c.status === 'incubating')) { const d = Math.floor((n - cl.laid) / DAY); rows.push({ t: cl.laid + cl.expected[0] * DAY, html: `<a class="li" href="#/reproduction/clutch/${cl.id}"><span class="tdot" style="--c:var(--c-incub)">${icon('egg')}</span><span class="li-main"><b>${esc(cl.code)} · day ${d}</b><span>hatch ${cl.expected[0]}–${cl.expected[1]} d · ${esc(SPECIES[cl.species].latin)}</span></span></a>` }); }
  for (const cy of db.cycles.filter((c) => c.status === 'active' && c.next)) rows.push({ t: cy.next.due, html: `<a class="li" href="#/reproduction/cycle/${cy.id}"><span class="tdot" style="--c:var(--c-repro)">${icon('repro')}</span><span class="li-main"><b>${esc(cy.next.label)}</b><span>${esc(cy.name)} · ${dShort(cy.next.due)}</span></span></a>` });
  return rows.sort((a, b) => a.t - b.t).slice(0, 6).map((r) => r.html).join('');
}
function historyHTML(items) {
  const byDay = {}; for (const i of items) (byDay[startOfDay(i.t)] ||= []).push(i);
  return `<div class="hist">${Object.entries(byDay).sort((a, b) => b[0] - a[0]).map(([d, arr]) => `<div class="tl-sec sec-past"><div class="tl-sech"><b>${wd(+d)} ${dShort(+d)}</b><em>${arr.length}</em><i></i></div>${streamHTML(arr, { mode: 'full', showDone: true }).replace(/<div class="tl-sec sec-now"[\s\S]*?Nothing due right now<\/div><\/div>/, '')}</div>`).join('') || '<div class="tl-empty">No history in range</div>'}</div>`;
}
export function mount(root) {
  if (focusId) { const el = root.querySelector(`[data-id="${CSS.escape(focusId)}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); } focusId = null; return; }
  if (!root.dataset.plScrolled) { const now = root.querySelector('#tl-now'); if (now && root.scrollTop < 20) { root.dataset.plScrolled = 1; } }
}

actions({
  'pl-scale': (el) => { S.scale = el.dataset.v; S.extra = 0; save(); store.emit('change'); },
  'pl-filter': (el) => { S.filter = S.filter === el.dataset.v && el.dataset.v !== 'all' ? 'all' : el.dataset.v; save(); store.emit('change'); },
  'pl-q': (el) => { S.q = el.value; store.emit('change'); },
  'pl-done': (el) => { S.showDone = el.checked; save(); store.emit('change'); },
  'pl-later': () => { S.extra += 7; store.emit('change'); },
  'pl-earlier': () => { S.past += location.hash.includes('history') ? 7 : 2; store.emit('change'); },
  'pl-lanes': () => { S.lanes = false; save(); store.emit('change'); },
  'pl-now': () => { if (!location.hash.startsWith('#/planner')) { location.hash = '#/planner/timeline'; setTimeout(() => document.getElementById('tl-now')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300); return; } if (S.lanes === false) { S.lanes = true; save(); store.emit('change'); } setTimeout(() => document.getElementById('tl-now')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); },
  'pl-add': (el) => menu(el, [
    { icon: 'tasks', label: 'Task', hint: 'N', run: () => openQuickRecord({ type: 'task' }) },
    { icon: 'feed', label: 'Care (feeding, water, misting…)', run: () => openQuickRecord({}) },
    { icon: 'health', label: 'Health record', run: () => openQuickRecord({ type: 'health' }) },
    { icon: 'repro', label: 'Reproduction event', run: () => openQuickRecord({ type: 'repro' }) },
    { icon: 'note', label: 'Note on an animal', run: () => import('../ui/global.js').then((m) => m.openCommand(false)) },
  ], { title: '+ Add to timeline' }),
  'pl-more-f': (el) => {
    const db = store.get();
    const sps = [...new Set(db.animals.filter((a) => !['sold', 'deceased'].includes(a.status)).map((a) => a.species))];
    menu(el, [
      { icon: S.sp ? 'x' : 'filter', label: S.sp ? 'Clear species filter' : 'Species', disabled: !S.sp, run: () => { S.sp = ''; save(); store.emit('change'); } },
      ...sps.map((k) => ({ icon: S.sp === k ? 'check' : 'animals', label: SPECIES[k].latin + (SPECIES[k].ssp ? ` ${SPECIES[k].ssp}` : ''), run: () => { S.sp = k; save(); store.emit('change'); } })),
      { sep: true },
      { icon: S.enc ? 'x' : 'enclosure', label: S.enc ? 'Clear enclosure filter' : 'Enclosure: Frog wall', run: () => { S.enc = S.enc ? '' : 'e_fw1'; save(); store.emit('change'); } },
    ], { title: 'Filter timeline' });
  },
});
