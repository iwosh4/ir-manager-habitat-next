// REPRODUCTION — cycles as honest biological timelines (observed vs expected ranges), clutches with incubation
// windows, one-tap checks and a hatch flow that creates the offspring records in one step.
import { esc, actions, uid } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { panel, close as closeOv } from '../core/overlay.js';
import { SPECIES, latin } from '../data/species.js';
import { streamHTML, contextItems } from '../ui/timeline.js';
import { avatar, rangeBar, empty, kpi, spName, sexIcon } from '../ui/components.js';
import { done, info } from '../ui/feedback.js';
import { openQuickRecord } from '../ui/quickrecord.js';
import { workspaceHTML, mountWorkspace } from '../widgets/workspace.js';
import { DAY, HOUR, rel, dShort, dLong, startOfDay, daysBetween, hm } from '../core/time.js';

const A = (db, id) => db.animals.find((a) => a.id === id);
const incubating = (db) => db.clutches.filter((c) => c.status === 'incubating');
const dayOf = (cl, n = Date.now()) => Math.floor((n - cl.laid) / DAY);

export function context(r) {
  const db = store.get();
  if (r.sub === 'cycle') { const cy = db.cycles.find((c) => c.id === r.id); return { title: cy?.name || 'Cycle', sub: cy ? `<i class="latin">${esc(latin(SPECIES[cy.species]))}</i> · season ${cy.season}` : '', back: '#/reproduction/cycles', tabs: [], actions: cy ? [{ label: 'Event', icon: 'plus', act: 'rp-event', data: { id: cy.id }, primary: true }] : [] }; }
  if (r.sub === 'clutch') { const cl = db.clutches.find((c) => c.id === r.id); return { title: cl ? `Clutch ${cl.code}` : 'Clutch', sub: cl ? `<i class="latin">${esc(latin(SPECIES[cl.species]))}</i> · laid ${dShort(cl.laid)}` : '', back: '#/reproduction/incubation', tabs: [], actions: cl && cl.status === 'incubating' ? [{ label: 'Check', icon: 'check', act: 'rp-check', data: { id: cl.id } }, { label: 'Hatch', icon: 'egg', act: 'rp-hatch', data: { id: cl.id }, primary: true }] : [] }; }
  return { counts: { cycles: db.cycles.filter((c) => c.status === 'active').length, incubation: incubating(db).length }, sub: 'Cycles · clutches · incubation', actions: [{ label: 'New cycle', icon: 'plus', act: 'rp-newcycle', hideM: true }, { label: 'Clutch', icon: 'egg', act: 'rp-newclutch', primary: true, kbd: 'N' }] };
}
export function onNew() { openNewClutch(); }
export function render(r) {
  const sub = r.sub || 'overview';
  if (sub === 'cycle') return cycleDetail(r.id);
  if (sub === 'clutch') return clutchDetail(r.id);
  if (sub === 'cycles') return cyclesList();
  if (sub === 'incubation') return incubation();
  if (sub === 'history') return history();
  return overview();
}
export function mount(root) { mountWorkspace(root); }

function overview() {
  const db = store.get(), n = Date.now(), inc = incubating(db), act = db.cycles.filter((c) => c.status === 'active');
  const eggs = inc.reduce((s, c) => s + c.fertile, 0), soon = inc.filter((c) => c.laid + c.expected[0] * DAY - n < 14 * DAY);
  const items = contextItems({ from: startOfDay(n) - DAY, to: startOfDay(n) + 10 * DAY, includeHistory: false }).filter((i) => ['repro', 'incubation'].includes(i.type) && i.kind !== 'phase');
  return `<div class="rp">
    <div class="kpis">${kpi({ label: 'Active cycles', value: act.length, sub: `${act.filter((c) => c.phases.some((p) => p.key === 'pairing' && p.start <= n && p.end >= n)).length} pairing now`, img: 'assets/img/species/python-regius-macro.webp', href: '#/reproduction/cycles' })}${kpi({ label: 'Clutches incubating', value: inc.length, sub: `${eggs} fertile eggs`, img: 'assets/img/kpi/clutch-python.webp', href: '#/reproduction/incubation' })}${kpi({ label: 'Hatch windows ≤ 14 d', value: soon.length, sub: soon.map((c) => c.code).join(', ') || 'none', img: 'assets/img/kpi/clutch-gecko.webp', tone: soon.length ? 'amber' : '' })}${kpi({ label: 'Hatched 2026', value: db.clutches.filter((c) => c.status === 'hatched').reduce((s, c) => s + (c.hatched || 0), 0), sub: 'offspring registered', img: 'assets/img/kpi/clutch-chameleon.webp', href: '#/reproduction/history' })}</div>
    <div class="pf-grid">
      <section class="card span-7"><header class="card-h"><span class="card-ico" style="color:var(--c-repro)">${icon('repro')}</span><h3>Next biological steps</h3><span class="card-sub">confirm when observed — the cycle moves forward</span></header><div class="card-b">${streamHTML(items, { mode: 'compact', showDone: false, empty: 'No reproduction steps in the next 10 days' })}</div></section>
      <section class="card span-5"><header class="card-h"><span class="card-ico" style="color:var(--c-incub)">${icon('egg')}</span><h3>Incubator</h3><span class="card-sub">INC-1 · ${db.enclosures.find((e) => e.id === 'e_inc')?.readings?.t ?? '—'} °C · ${db.enclosures.find((e) => e.id === 'e_inc')?.readings?.rh ?? '—'} %</span></header><div class="card-b">${inc.map(clutchRow).join('')}</div></section>
      <section class="card span-12">${cycleGantt(act)}</section>
    </div>
    ${workspaceHTML('reproduction', { title: 'Breeding workspace' })}
  </div>`;
}
function clutchRow(cl) {
  const d = dayOf(cl);
  return `<a class="clutch-mini" href="#/reproduction/clutch/${cl.id}"><img src="assets/img/kpi/${cl.img}.webp" alt="" loading="lazy"><div><div class="row"><b class="code">${esc(cl.code)}</b><i class="latin small">${esc(SPECIES[cl.species].latin)}</i><span class="spacer"></span><span class="mono small">day ${d}</span></div>${rangeBar(d, cl.expected, { label: false })}<span class="muted small">${cl.fertile}/${cl.eggs} eggs · window ${cl.expected[0]}–${cl.expected[1]} d · ${d < cl.expected[0] ? `opens ${rel(cl.laid + cl.expected[0] * DAY)}` : d <= cl.expected[1] ? '<b class="warn-t">in hatch window</b>' : '<b class="danger-t">past window</b>'}</span></div></a>`;
}
function cycleGantt(cycles, { days = [-60, 90] } = {}) {
  const n = Date.now(), from = startOfDay(n) + days[0] * DAY, to = startOfDay(n) + days[1] * DAY, span = to - from;
  const x = (t) => Math.max(0, Math.min(100, ((t - from) / span) * 100));
  const ticks = []; for (let d = startOfDay(from); d <= to; d += DAY) if (new Date(d).getDate() === 1) ticks.push(d);
  return `<header class="card-h"><span class="card-ico">${icon('layers3')}</span><h3>Season timeline</h3><span class="card-sub">solid = observed · hatched = expected range (never a fake exact date)</span></header><div class="card-b"><div class="ln-wrap"><div class="ln-ticks">${ticks.map((d) => `<span style="left:${x(d)}%"><b>${new Date(d).toLocaleString('en', { month: 'short' })}</b></span>`).join('')}</div>
    ${cycles.map((cy) => `<a class="ln" href="#/reproduction/cycle/${cy.id}"><span class="ln-l"><b>${esc(cy.name)}</b><i class="latin">${esc(SPECIES[cy.species].latin)}</i></span><span class="ln-track">${cy.phases.filter((p) => (p.end ?? p.start) >= from && p.start <= to).map((p) => p.milestone || p.start === p.end ? `<i class="ln-ms ${p.observed ? 'obs' : ''}" style="left:${x(p.start)}%" title="${esc(p.label)} · ${dShort(p.start)}"></i>` : `<i class="ln-bar k-${p.key} ${p.expected ? 'exp' : ''} ${p.planned ? 'plan' : ''}" style="left:${x(p.start)}%;width:${Math.max(0.8, x(p.end) - x(p.start))}%" title="${esc(p.label)} · ${dShort(p.start)}–${dShort(p.end)}"><em>${esc(p.label)}</em></i>`).join('')}</span></a>`).join('')}
    <i class="ln-now" style="left:calc(210px + (100% - 210px) * ${((n - from) / span).toFixed(4)})"><em>NOW</em></i></div></div>`;
}
function cyclesList() {
  const db = store.get(), n = Date.now();
  const list = db.cycles.filter((c) => c.status === 'active');
  return `<div class="cy-list">${list.map((cy) => { const f = A(db, cy.female), m = A(db, cy.male), cur = [...cy.phases].reverse().find((p) => p.start <= n) || cy.phases[0]; const cl = db.clutches.find((c) => c.cycleId === cy.id && c.status === 'incubating');
    return `<a class="cy-card" href="#/reproduction/cycle/${cy.id}"><div class="cy-pair">${avatar(f, 52)}${cy.group ? '' : avatar(m, 52)}</div><div class="cy-b"><div class="row"><b>${esc(cy.name)}</b><span class="spacer"></span><span class="pill repro">${esc(cur.label)}</span></div><i class="latin">${esc(latin(SPECIES[cy.species]))}</i>
      <div class="cy-phases">${cy.phases.map((p) => `<span class="cyp ${p.observed || (p.end ?? p.start) < n ? 'past' : p.start <= n ? 'cur' : ''} ${p.expected ? 'exp' : ''}" title="${esc(p.label)}"></span>`).join('')}</div>
      <span class="muted small">${cy.next ? `${icon('arrowRight')} ${esc(cy.next.label)} · <b>${rel(cy.next.due)}</b>` : 'no next step'}${cl ? ` · clutch ${esc(cl.code)} day ${dayOf(cl)}` : ''}</span></div></a>`; }).join('')}
    <button class="cy-card add" data-act="rp-newcycle">${icon('plus')}<span>New cycle<br><small class="muted">pair, species template, expected ranges</small></span></button></div>`;
}
function cycleDetail(id) {
  const db = store.get(), cy = db.cycles.find((c) => c.id === id), n = Date.now();
  if (!cy) return empty('Cycle not found');
  const f = A(db, cy.female), m = A(db, cy.male), sp = SPECIES[cy.species], cl = db.clutches.filter((c) => c.cycleId === cy.id);
  const items = contextItems({ from: startOfDay(n) - 3 * DAY, to: startOfDay(n) + 30 * DAY, cycle: cy.id, includeHistory: true });
  return `<div class="pf-grid">
    <section class="card span-12 cy-hero"><div class="cy-pair big">${[f, cy.group ? null : m].filter(Boolean).map((a) => `<a href="#/animals/a/${a.id}" class="cy-an">${avatar(a, 64)}<span><b class="code">${esc(a.code)}</b> ${esc(a.name || '')}<br><span class="muted small">${esc(a.morph || sp.common)}</span></span></a>`).join('<span class="cy-x">×</span>')}</div>
      <div class="cy-goal">${cy.goal ? `<span class="lbl">Goal</span><p>${esc(cy.goal)}</p>` : ''}${cy.next ? `<div class="cy-next"><span class="lbl">Next step</span><b>${esc(cy.next.label)}</b><span class="muted">${dLong(cy.next.due)} · ${rel(cy.next.due)}</span></div>` : ''}</div></section>
    <section class="card span-12">${cycleGantt([cy], { days: [-Math.min(200, Math.ceil((n - cy.phases[0].start) / DAY) + 10), 130] })}</section>
    <section class="card span-7"><header class="card-h"><span class="card-ico">${icon('planner')}</span><h3>Cycle timeline</h3><span class="card-sub">same Planner items, filtered to this cycle</span></header><div class="card-b">${streamHTML(items, { mode: 'compact', showDone: true, empty: 'Nothing scheduled for this cycle' })}</div></section>
    <div class="span-5 stack">
      <section class="card"><header class="card-h"><span class="card-ico">${icon('history')}</span><h3>Observed events</h3><span class="card-a"><button class="btn sm" data-act="rp-event" data-id="${cy.id}">${icon('plus')}Event</button></span></header><div class="card-b"><ol class="ev-list">${[...cy.events].reverse().map((e) => `<li><i class="ev-${e.type}"></i><div><b>${esc(e.label)}</b><span class="muted small">${dLong(e.t)} ${hm(e.t)}</span></div></li>`).join('')}</ol></div></section>
      <section class="card"><header class="card-h"><span class="card-ico">${icon('info')}</span><h3>Species reference</h3></header><div class="card-b"><p class="small">${esc(sp.repro.note)}</p><dl class="kv"><dt>Clutch size</dt><dd>${sp.repro.clutch ? sp.repro.clutch.join('–') + ' eggs' : 'live birth'}</dd>${sp.repro.incubation ? `<dt>Incubation</dt><dd>${sp.repro.incubation.join('–')} d</dd>` : ''}${sp.repro.develop ? `<dt>Development</dt><dd>${sp.repro.develop.join('–')} d</dd>` : ''}</dl></div></section>
      ${cl.map((c) => `<section class="card"><div class="card-b">${clutchRow(c)}</div></section>`).join('')}
    </div></div>`;
}
function clutchDetail(id) {
  const db = store.get(), cl = db.clutches.find((c) => c.id === id), n = Date.now();
  if (!cl) return empty('Clutch not found');
  const d = dayOf(cl), f = A(db, cl.female), m = A(db, cl.male), w0 = cl.laid + cl.expected[0] * DAY, w1 = cl.laid + cl.expected[1] * DAY;
  const checks = db.records.filter((r) => r.type === 'incubation' && r.data?.clutch === cl.id).reverse();
  const eggs = Array.from({ length: cl.eggs }, (_, i) => i < (cl.hatched || 0) ? 'hatched' : i < cl.fertile ? 'fertile' : 'slug');
  return `<div class="pf-grid">
    <section class="card span-12 cl-hero"><img src="assets/img/kpi/${cl.img}.webp" alt="Clutch ${esc(cl.code)}"><div class="cl-main">
      <div class="row"><span class="pill ${cl.status === 'hatched' ? 'ok' : 'repro'}">${cl.status}</span><span class="muted">${f ? `${esc(f.code)} ${esc(f.name)}` : ''}${m && m !== f ? ` × ${esc(m.code)} ${esc(m.name)}` : ''}</span></div>
      <div class="cl-day"><b>Day ${cl.status === 'hatched' ? Math.round((cl.hatchedAt - cl.laid) / DAY) : d}</b><span>of an expected <b>${cl.expected[0]}–${cl.expected[1]}</b> days · ${cl.temp} °C · ${cl.rh} % RH</span></div>
      ${rangeBar(cl.status === 'hatched' ? Math.round((cl.hatchedAt - cl.laid) / DAY) : d, cl.expected)}
      <p class="muted small">${cl.status === 'hatched' ? `Hatched ${dLong(cl.hatchedAt)}` : `Hatch window ${dShort(w0)} – ${dShort(w1)}${n < w0 ? ` · opens ${rel(w0)}` : n <= w1 ? ' · <b class="warn-t">window open — check daily</b>' : ' · past expected window'}`} · biological range, not an exact date.</p>
      <div class="eggs">${eggs.map((e, i) => `<button class="egg ${e}" data-act="rp-egg" data-id="${cl.id}" data-i="${i}" title="Egg ${i + 1} · ${e}">${icon('egg')}</button>`).join('')}</div>
      <span class="muted small">${cl.fertile} fertile · ${cl.slugs || 0} slug${cl.hatched ? ` · ${cl.hatched} hatched` : ''} — tap an egg to mark it lost</span></div></section>
    <section class="card span-7"><header class="card-h"><span class="card-ico" style="color:var(--c-incub)">${icon('thermo')}</span><h3>Checks</h3><span class="card-sub">every ${cl.checkEvery} d · last ${rel(cl.lastCheck)}</span>${cl.status === 'incubating' ? `<span class="card-a"><button class="btn sm primary" data-act="rp-check" data-id="${cl.id}">${icon('check')}Check OK</button></span>` : ''}</header><div class="card-b">
      ${checks.length ? checks.map((r) => `<div class="li">${icon('check')}<span class="li-main"><b>${esc(r.data.note || 'Check — all eggs OK')}</b><span>${dLong(r.t)} ${hm(r.t)}${r.data.temp ? ` · ${r.data.temp} °C` : ''}</span></span></div>`).join('') : `<p class="muted">No checks recorded in this demo session yet. Last check (history): ${dLong(cl.lastCheck)}.</p>`}</div></section>
    <section class="card span-5"><header class="card-h"><span class="card-ico">${icon('file')}</span><h3>Notes & offspring</h3></header><div class="card-b"><p>${esc(cl.notes || '')}</p>
      ${(cl.offspring || []).map((oid) => { const o = A(db, oid); return o ? `<a class="li" href="#/animals/a/${o.id}">${avatar(o, 36)}<span class="li-main"><b class="code">${esc(o.code)}</b><span>${esc(o.morph || '')} · ${sexIcon(o.sex)}</span></span></a>` : ''; }).join('')}</div></section>
  </div>`;
}
function incubation() {
  const db = store.get(), inc = incubating(db), e = db.enclosures.find((x) => x.id === 'e_inc');
  return `<div class="inc-head card"><img src="assets/img/enclosures/incubator.webp" alt="Incubator"><div><h3>INC-1 · ${esc(e?.name || '')}</h3><div class="stats"><div class="stat"><b>${e?.readings?.t} °C</b><span>now (${e?.readings?.tMin}–${e?.readings?.tMax})</span></div><div class="stat"><b>${e?.readings?.rh} %</b><span>humidity</span></div><div class="stat"><b>${inc.length}</b><span>clutches</span></div><div class="stat"><b>${inc.reduce((s, c) => s + c.fertile, 0)}</b><span>fertile eggs</span></div></div></div></div>
    <div class="inc-grid">${inc.sort((a, b) => (a.laid + a.expected[0] * DAY) - (b.laid + b.expected[0] * DAY)).map((cl) => { const d = dayOf(cl); return `<article class="inc-card"><a href="#/reproduction/clutch/${cl.id}" class="inc-img"><img src="assets/img/kpi/${cl.img}.webp" alt="" loading="lazy"><span class="pill">${esc(cl.code)}</span></a><div class="inc-b"><i class="latin">${esc(latin(SPECIES[cl.species]))}</i><div class="cl-day sm"><b>Day ${d}</b><span>/ ${cl.expected[0]}–${cl.expected[1]}</span></div>${rangeBar(d, cl.expected, { label: false })}<span class="muted small">${cl.fertile}/${cl.eggs} eggs · ${cl.temp} °C · check every ${cl.checkEvery} d</span>
      <div class="row"><button class="btn sm" data-act="rp-check" data-id="${cl.id}">${icon('check')}Check OK</button><button class="btn sm ghost" data-act="rp-hatch" data-id="${cl.id}">${icon('egg')}Hatch…</button></div></div></article>`; }).join('')}</div>`;
}
function history() {
  const db = store.get(), done = db.cycles.filter((c) => c.status !== 'active'), hatched = db.clutches.filter((c) => c.status !== 'incubating');
  return `<div class="pf-grid"><section class="card span-6"><header class="card-h"><h3>Completed cycles</h3></header><div class="card-b">${done.map((cy) => `<a class="li" href="#/reproduction/cycle/${cy.id}"><span class="tdot" style="--c:var(--c-repro)">${icon('repro')}</span><span class="li-main"><b>${esc(cy.name)}</b><span>${esc(cy.events.at(-1)?.label || '')}</span></span></a>`).join('') || '<p class="muted">None yet.</p>'}</div></section>
    <section class="card span-6"><header class="card-h"><h3>Hatched & closed clutches</h3></header><div class="card-b">${hatched.map((cl) => `<a class="li" href="#/reproduction/clutch/${cl.id}"><img class="li-img" src="assets/img/kpi/${cl.img}.webp" alt=""><span class="li-main"><b class="code">${esc(cl.code)}</b><span>${cl.hatched || 0}/${cl.eggs} hatched · ${cl.hatchedAt ? dLong(cl.hatchedAt) : cl.status}</span></span></a>`).join('')}</div></section>
    <section class="card span-12"><header class="card-h"><h3>Season statistics</h3></header><div class="card-b"><div class="stats">${Object.entries(db.clutches.reduce((o, c) => { (o[c.species] ||= { eggs: 0, fertile: 0, hatched: 0 }); o[c.species].eggs += c.eggs; o[c.species].fertile += c.fertile; o[c.species].hatched += c.hatched || 0; return o; }, {})).map(([k, v]) => `<div class="stat"><b>${Math.round((v.fertile / v.eggs) * 100)} %</b><span><i class="latin">${esc(SPECIES[k].latin)}</i><br>fertility · ${v.eggs} eggs · ${v.hatched} hatched</span></div>`).join('')}</div></div></section></div>`;
}

// ---------------------------------------------------------------- actions
function openNewClutch(female) {
  const db = store.get(), fem = db.animals.filter((a) => (a.sex === 'f' || a.kind === 'group') && a.status !== 'sold' && a.status !== 'deceased' && SPECIES[a.species].repro.kind === 'eggs');
  const S = { f: female || db.cycles.find((c) => c.status === 'active' && c.female && A(db, c.female)?.breeding === 'gravid')?.female || fem[0].id, eggs: 2, fertile: 2 };
  const draw = () => { const a = A(db, S.f), sp = SPECIES[a.species], cy = db.cycles.find((c) => c.female === a.id && c.status === 'active'); const rng = sp.repro.incubation || sp.repro.develop || [60, 90];
    return `<div class="field"><label>Female / group</label><div class="chips wrap">${fem.map((x) => `<button class="chip ${S.f === x.id ? 'on' : ''}" data-f="${x.id}">${esc(x.code)} ${esc(x.name || '')}</button>`).join('')}</div></div>
      <div class="grid g2"><div class="field"><label>Eggs laid</label><div class="num-in"><button data-d="eggs:-1">−</button><b>${S.eggs}</b><button data-d="eggs:1">+</button></div></div><div class="field"><label>Fertile</label><div class="num-in"><button data-d="fertile:-1">−</button><b>${S.fertile}</b><button data-d="fertile:1">+</button></div></div></div>
      <p class="muted small">${icon('info')} Cycle: <b>${esc(cy?.name || 'new cycle will be created')}</b> · expected ${rng.join('–')} d (${esc(sp.common)} template) · incubator INC-1 · checks scheduled automatically.</p>`; };
  const h = panel({ title: 'New clutch', sub: 'Laid today — everything else is prefilled', icon: 'egg', body: `<div data-b>${draw()}</div>`, footer: `<button class="btn primary lg" data-save>${icon('check')}Save clutch</button>` });
  h.el.addEventListener('click', (e) => { const f = e.target.closest('[data-f]'); if (f) S.f = f.dataset.f; const d = e.target.closest('[data-d]'); if (d) { const [k, v] = d.dataset.d.split(':'); S[k] = Math.max(0, S[k] + +v); if (S.fertile > S.eggs) S.fertile = S.eggs; }
    if (f || d) h.el.querySelector('[data-b]').innerHTML = draw();
    if (e.target.closest('[data-save]')) { let code; store.mutate('New clutch', (dd) => { const a = dd.animals.find((x) => x.id === S.f), sp = SPECIES[a.species], cy = dd.cycles.find((c) => c.female === a.id && c.status === 'active'); const n = Date.now(); code = `CL-2026-${String(dd.clutches.length + 1).padStart(2, '0')}`; const rng = sp.repro.incubation || sp.repro.develop || [60, 90];
      const cl = { id: uid('cl'), code, cycleId: cy?.id, species: a.species, female: a.id, male: cy?.male || a.id, laid: n, eggs: S.eggs, fertile: S.fertile, slugs: S.eggs - S.fertile, incubator: 'e_inc', temp: 28, rh: 85, expected: rng, checkEvery: 3, lastCheck: n, status: 'incubating', img: a.species.includes('python') || a.species.includes('morelia') ? 'clutch-python' : a.species.includes('furcifer') ? 'clutch-chameleon' : 'clutch-gecko', notes: '' };
      dd.clutches.push(cl); if (cy) { cy.events.push({ t: n, type: 'clutch', label: `Clutch laid — ${S.eggs} eggs (${S.fertile} fertile)` }); cy.phases.push({ key: 'incubation', label: 'Incubation', start: n, end: n + rng[1] * DAY, expected: rng }); cy.next = { label: 'Check eggs (fungus / development)', due: startOfDay(n) + 3 * DAY + 9 * HOUR }; }
      a.breeding = 'post-lay'; dd.records.push({ id: uid('r'), t: n, type: 'repro', subject: a.id, data: { kind: 'clutch', label: `Clutch ${code} — ${S.eggs} eggs`, cycle: cy?.id }, source: 'reproduction', by: 'you' }); });
      closeOv(h); done({ label: `Clutch ${code} saved — checks scheduled` }); }
  });
}
function openHatch(id) {
  const db = store.get(), cl = db.clutches.find((c) => c.id === id), sp = SPECIES[cl.species], f = A(db, cl.female);
  const S = { n: Math.max(1, cl.fertile - (cl.hatched || 0)) };
  const prefix = f.code.split('-')[0];
  const draw = () => `<div class="field"><label>Hatched now</label><div class="num-in lg"><button data-d="-1">−</button><b>${S.n}</b><button data-d="1">+</button></div></div><p class="muted small">Creates <b>${S.n}</b> animal record${S.n > 1 ? 's' : ''} (${prefix}-H…, unsexed, origin: own breeding from ${esc(cl.code)}, parents linked), puts them in the hatchling enclosure and adds a first-feeding task in 10 days.</p>`;
  const h = panel({ title: `Hatch · ${cl.code}`, sub: latin(sp), icon: 'egg', body: `<div data-b>${draw()}</div>`, footer: `<button class="btn primary lg" data-save>${icon('check')}Register hatchlings</button>` });
  h.el.addEventListener('click', (e) => { const d = e.target.closest('[data-d]'); if (d) { S.n = Math.max(1, Math.min(cl.fertile, S.n + +d.dataset.d)); h.el.querySelector('[data-b]').innerHTML = draw(); }
    if (e.target.closest('[data-save]')) { store.mutate(`Hatched ${S.n}`, (dd) => { const c = dd.clutches.find((x) => x.id === id), n = Date.now(); c.offspring ||= []; const base = dd.animals.filter((a) => a.code.startsWith(`${prefix}-H`)).length;
      for (let i = 0; i < S.n; i++) { const aid = uid('a'); dd.animals.push({ id: aid, code: `${prefix}-H${base + i + 1}`, name: '', species: c.species, sex: 'u', kind: 'individual', status: 'active', breeding: 'resting', tags: [], genetics: [], notes: '', enclosureId: c.species === 'python-regius' ? 'e_r5' : c.species.includes('correlophus') ? 'e_t03' : null, born: n, origin: { type: 'own-breeding', clutch: c.id }, imgVariant: i % 6, weightG: null }); c.offspring.push(aid); }
      c.hatched = (c.hatched || 0) + S.n; if (c.hatched >= c.fertile) { c.status = 'hatched'; c.hatchedAt = n; }
      const cy = dd.cycles.find((x) => x.id === c.cycleId); if (cy) { cy.events.push({ t: n, type: 'hatch', label: `${c.code} hatched ${S.n}` }); if (c.status === 'hatched') cy.next = null; }
      dd.tasks.push({ id: uid('k'), type: 'task', status: 'open', priority: 'normal', origin: 'auto', created: n, title: `First feeding — ${c.code} hatchlings`, subject: c.female, subjectKind: 'animal', due: startOfDay(n) + 10 * DAY + 19 * HOUR }); });
      closeOv(h); done({ label: `${S.n} hatchling${S.n > 1 ? 's' : ''} registered` }); }
  });
}
actions({
  'rp-newclutch': () => openNewClutch(),
  'rp-hatch': (el) => openHatch(el.dataset.id),
  'rp-check': (el) => { const id = el.dataset.id; store.mutate('Clutch check', (d) => { const c = d.clutches.find((x) => x.id === id), n = Date.now(); c.lastCheck = n; d.records.push({ id: uid('r'), t: n, type: 'incubation', subject: c.female, data: { clutch: c.id, note: `Check ${c.code} — all ${c.fertile} eggs OK`, temp: d.enclosures.find((e) => e.id === c.incubator)?.readings?.t }, source: 'reproduction', by: 'you' }); const k = `chk:${c.id}:${startOfDay(n)}`; if (!d.occ[k]) d.occ[k] = { status: 'done', at: n }; }); done({ label: 'Check recorded — eggs OK' }); },
  'rp-egg': (el) => { const id = el.dataset.id; store.mutate('Egg marked lost', (d) => { const c = d.clutches.find((x) => x.id === id); if (c.fertile > (c.hatched || 0)) { c.fertile--; c.slugs = (c.slugs || 0) + 1; } }); done({ label: 'Egg marked lost' }); },
  'rp-event': (el) => { const db = store.get(), cy = db.cycles.find((c) => c.id === el.dataset.id); openQuickRecord({ type: 'repro', subjects: [cy.female], cycle: cy.id }); },
  'rp-newcycle': () => info('New cycle: pick a pair in Quick Record → Reproduction → “Pairing”. A species template adds expected phases.'),
});
