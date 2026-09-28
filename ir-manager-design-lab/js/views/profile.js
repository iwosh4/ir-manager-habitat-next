// ANIMAL PROFILE — the central record of a living animal. Hierarchy instead of ten equal tabs:
// hero + frequent actions → Overview (now & next, care, weight, breeding, health) → focused sections.
import { esc, actions } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { panel, close as closeOv, menu, toast } from '../core/overlay.js';
import { SPECIES, SUPPLEMENTS, latin, imgFor, macroFor } from '../data/species.js';
import { rotationState, lastRecord, lastWeight, nextOcc, TYPE } from '../engine/ops.js';
import { isOpen } from '../engine/timeline.js';
import * as A from '../engine/actions.js';
import { streamHTML, contextItems } from '../ui/timeline.js';
import { avatar, sexIcon, sexText, statusPill, breedPill, spName, empty, spark, rangeBar, typeDot, money } from '../ui/components.js';
import { done } from '../ui/feedback.js';
import { openQuickRecord, editRecordPanel } from '../ui/quickrecord.js';
import { DAY, HOUR, rel, ageText, dShort, dLong, hm, startOfDay, daysBetween } from '../core/time.js';

const SECTIONS = [['overview', 'Overview', 'dashboard'], ['care', 'Care', 'feed'], ['breeding', 'Breeding', 'repro'], ['health', 'Health', 'health'], ['records', 'Records', 'history'], ['details', 'Details', 'info']];
let sec = 'overview';
export function onEnter(r) {
  if (r.sub !== 'a') return;
  sec = r.q.get('tab') === 'health' ? 'health' : r.q.get('tab') === 'origin' ? 'details' : 'overview';
  store.mutate(null, (db) => { db.recent.animals = [r.id, ...db.recent.animals.filter((x) => x !== r.id)].slice(0, 12); }, { silent: true });
}
export function context(r) {
  const db = store.get(), a = db.animals.find((x) => x.id === r.id);
  if (!a) return { title: 'Animal not found', back: '#/animals/grid' };
  return { titleHTML: `<span class="code">${esc(a.code)}</span> ${esc(a.name || '')}`, mTitle: a.code, sub: `<i class="latin">${esc(latin(SPECIES[a.species]))}</i>`, back: '#/animals/grid', tabs: [],
    actions: [{ label: db.favorites.includes(a.id) ? 'Favourite' : 'Star', icon: 'star', act: 'pf-fav', data: { id: a.id }, ghost: true, hideM: true }, { label: 'Edit', icon: 'edit', act: 'pf-edit', data: { id: a.id }, hideM: true }, { label: 'Record', icon: 'plus', act: 'quick-record', data: { subject: a.id }, primary: true, kbd: 'Q' }] };
}
export function render(r) {
  const db = store.get(), a = db.animals.find((x) => x.id === r.id);
  if (!a) return empty('Animal not found', 'It may have been deleted or the link is outdated.', 'empty', '<a class="btn" href="#/animals/grid">Back to animals</a>');
  const sp = SPECIES[a.species], e = db.enclosures.find((x) => x.id === a.enclosureId), n = Date.now();
  const w = lastWeight(db, a.id), wh = db.records.filter((x) => x.subject === a.id && x.type === 'weight');
  const fplan = db.plans.find((p) => p.type === 'feeding' && p.subject === a.id), rs = fplan ? rotationState(db, fplan) : null;
  const nf = nextOcc(db, a.id, 'feeding'), lf = lastRecord(db, a.id, 'feeding');
  const openH = db.health.filter((h) => h.animal === a.id && !h.resolved);
  const archived = ['sold', 'deceased'].includes(a.status);
  return `<div class="pf">
    <section class="pf-hero">
      <img class="pf-macro" src="${macroFor(a.species)}" alt="" aria-hidden="true"><div class="pf-shade"></div>
      <div class="pf-photo"><img src="${imgFor(a)}" alt="${esc(latin(sp))} ${esc(a.code)}"><button class="pf-fav ${db.favorites.includes(a.id) ? 'on' : ''}" data-act="pf-fav" data-id="${a.id}" aria-label="Favourite">${icon('star')}</button></div>
      <div class="pf-id">
        <div class="pf-tags">${statusPill(a.status)}${breedPill(a.breeding)}${a.tags.includes('venomous') ? '<span class="pill danger">VENOMOUS</span>' : ''}${openH.length ? `<span class="pill warn">${icon('health')}${openH.length} open</span>` : ''}</div>
        <h2><i class="latin">${esc(latin(sp))}</i></h2>
        <p class="pf-common">${esc(sp.common)} · ${esc(sp.cz)}</p>
        <div class="pf-code"><b class="code">${esc(a.code)}</b>${a.name ? `<span>${esc(a.name)}</span>` : ''}${a.morph ? `<em>${esc(a.morph)}</em>` : ''}</div>
        <dl class="pf-facts"><div><dt>Sex</dt><dd>${a.kind === 'group' ? `${sexText(a)} <span class="muted">(${a.count})</span>` : `${sexIcon(a.sex)} ${a.sex === 'm' ? 'Male' : a.sex === 'f' ? 'Female' : 'Unsexed'}`}</dd></div><div><dt>Age</dt><dd>${ageText(a.born)}</dd></div><div><dt>Weight</dt><dd>${a.kind === 'group' ? '—' : w != null ? `${w} g` : '—'}</dd></div><div><dt>Enclosure</dt><dd>${e ? `<a href="#/enclosures/e/${e.id}" class="mono">${esc(e.code)}</a>` : '—'}</dd></div></dl>
      </div>
      ${archived ? '' : `<div class="pf-actions">
        <button class="pa pa-main" data-act="${nf && nf.t < startOfDay(n) + DAY ? 'pf-feed' : 'qr-type'}" data-type="feeding" data-subject="${a.id}" data-id="${a.id}" style="--c:var(--c-feed)">${icon('feed')}<span><b>${nf && nf.t < startOfDay(n) + DAY ? 'FED' : 'Feed'}</b><em>${nf ? `${nf.t < n ? 'due now' : nf.t < startOfDay(n) + DAY ? `today ${hm(nf.t)}` : rel(nf.t)}${rs?.next ? ` · ${esc(rs.next)}` : ''}` : 'unscheduled'}</em></span></button>
        ${[['water', 'Water'], db.plans.some((p) => p.subject === a.id && p.type === 'misting') ? ['misting', 'Mist'] : ['shed', 'Shed'], ['weight', 'Weight'], ['health', 'Health'], ['repro', 'Breeding']].filter(([k]) => a.kind !== 'group' || k !== 'weight' && k !== 'shed').map(([k, l]) => `<button class="pa" data-act="qr-type" data-type="${k}" data-subject="${a.id}" style="--c:${TYPE[k].color}">${icon(TYPE[k].icon)}<span><b>${l}</b></span></button>`).join('')}
        <button class="pa" data-act="pf-more" data-id="${a.id}">${icon('more')}<span><b>More</b></span></button></div>`}
    </section>
    <nav class="pf-nav" role="tablist">${SECTIONS.map(([k, l, ic]) => `<button role="tab" class="${sec === k ? 'on' : ''}" data-act="pf-sec" data-v="${k}" aria-selected="${sec === k}">${icon(ic)}<span>${l}</span>${k === 'health' && openH.length ? `<em>${openH.length}</em>` : ''}</button>`).join('')}</nav>
    <div class="pf-body">${{ overview, care, breeding, health, records, details }[sec](db, a, { sp, e, w, wh, fplan, rs, nf, lf, openH })}</div>
  </div>`;
}
function overview(db, a, c) {
  const n = Date.now(), items = contextItems({ from: startOfDay(n) - 2 * DAY, to: startOfDay(n) + 8 * DAY, subject: a.id, includeHistory: true }).filter((i) => i.kind !== 'phase');
  return `<div class="pf-grid">
    <section class="card span-7"><header class="card-h"><span class="card-ico">${icon('planner')}</span><h3>Now & next</h3><span class="card-sub">this animal's timeline</span><span class="card-a"><a class="btn sm ghost" href="#/planner/timeline">${icon('planner')}Planner</a></span></header><div class="card-b">${streamHTML(items, { mode: 'compact', showDone: true, empty: 'Nothing scheduled this week' })}</div></section>
    <div class="span-5 stack">
      ${feedCard(db, a, c)}
      ${a.kind === 'group' ? membersCard(a) : weightCard(db, a, c)}
    </div>
    ${breedCard(db, a, 'span-6')}${healthCard(db, a, c, 'span-6')}
  </div>`;
}
function feedCard(db, a, { fplan, rs, nf, lf }) {
  if (!fplan) return `<section class="card"><header class="card-h"><span class="card-ico">${icon('feed')}</span><h3>Feeding</h3></header><div class="card-b"><p class="muted">No feeding plan — feedings are recorded as unscheduled.</p></div></section>`;
  return `<section class="card feedc"><header class="card-h"><span class="card-ico" style="color:var(--c-feed)">${icon('feed')}</span><h3>Feeding & supplements</h3><span class="card-sub">${esc(fplan.protocol)}</span></header><div class="card-b">
    <div class="fc-row"><div><span class="lbl">Feeder</span><b>${esc(fplan.feeder)}</b><em>${esc(fplan.qty)} · every ${fplan.every === 1 ? 'day' : `${fplan.every} d`} · ${fplan.times.map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`).join(', ')}</em></div>
      <div><span class="lbl">Last</span><b>${lf ? rel(lf.t) : '—'}</b><em>${lf?.data?.refused ? '<span class="danger-t">refused</span>' : esc(lf?.data?.supplement || '')}</em></div><div><span class="lbl">Next</span><b class="${nf?.t < Date.now() ? 'danger-t' : ''}">${nf ? (nf.t < startOfDay(Date.now()) + DAY ? `today ${hm(nf.t)}` : dShort(nf.t)) : '—'}</b><em>${esc(rs?.next || '')}</em></div></div>
    ${rs?.rot.length > 1 ? `<div class="rotbig"><span class="lbl">Supplement rotation — recorded automatically with every feeding</span><div class="rot-seq big">${rs.rot.map((s, i) => `<i class="${i === rs.index ? 'next' : ''} ${i === (rs.index - 1 + rs.rot.length) % rs.rot.length ? 'last' : ''}" style="--c:${SUPPLEMENTS[s]?.color}">${i === rs.index ? '<b>NEXT</b>' : i === (rs.index - 1 + rs.rot.length) % rs.rot.length ? '<b>LAST</b>' : ''}${esc(s)}</i>`).join('')}</div><p class="muted small">Position ${rs.index + 1} of ${rs.rot.length} · ${rs.count} feedings recorded on this plan · override per feeding in Quick Record → Details.</p></div>` : ''}
  </div></section>`;
}
function weightCard(db, a, { w, wh }) {
  const pts = wh.map((r) => r.data.g), first = pts[0], last = pts[pts.length - 1];
  return `<section class="card"><header class="card-h"><span class="card-ico" style="color:var(--c-weight)">${icon('weight')}</span><h3>Weight</h3><span class="card-sub">${pts.length} weigh-ins</span><span class="card-a"><button class="btn sm" data-act="qr-type" data-type="weight" data-subject="${a.id}">${icon('plus')}Weigh</button></span></header><div class="card-b">
    <div class="wt"><b>${w ?? '—'}<small> g</small></b>${pts.length > 1 ? `<em class="${last >= first ? 'ok-t' : 'danger-t'}">${last >= first ? '+' : ''}${(((last - first) / first) * 100).toFixed(0)} % over ${pts.length} records</em>` : ''}</div>
    ${pts.length > 1 ? `<div class="wt-chart">${spark(pts, { w: 360, h: 80, color: 'var(--c-weight)', dots: true })}</div><div class="wt-ax"><span>${dShort(wh[0].t)}</span><span>${dShort(wh[wh.length - 1].t)}</span></div>` : '<p class="muted small">Weigh regularly to see growth.</p>'}</div></section>`;
}
function membersCard(a) {
  return `<section class="card"><header class="card-h"><span class="card-ico">${icon('group')}</span><h3>Members</h3><span class="card-sub">${a.sexes.m}.${a.sexes.f}.${a.sexes.u} · group husbandry</span></header><div class="card-b"><div class="members">${a.members.map((m) => `<div class="mem-r">${sexIcon(m.sex)}<b class="code">${esc(m.code)}</b><input class="inl" value="${esc(m.note || '')}" placeholder="note…" data-change="pf-mnote" data-id="${a.id}" data-m="${m.id}" aria-label="Note for ${esc(m.code)}"></div>`).join('')}</div><p class="muted small">${icon('info')} Care recorded on ${esc(a.code)} applies to all ${a.count} members — no repetitive individual entries.</p></div></section>`;
}
function breedCard(db, a, span = '') {
  const cys = db.cycles.filter((c) => c.female === a.id || c.male === a.id), cls = db.clutches.filter((c) => c.female === a.id || c.male === a.id);
  const n = Date.now();
  return `<section class="card ${span}"><header class="card-h"><span class="card-ico" style="color:var(--c-repro)">${icon('repro')}</span><h3>Reproduction</h3><span class="card-a"><button class="btn sm" data-act="qr-type" data-type="repro" data-subject="${a.id}">${icon('plus')}Event</button></span></header><div class="card-b">
    ${cys.length ? cys.map((c) => { const cur = [...c.phases].reverse().find((p) => p.start <= n) || c.phases[0]; return `<a class="li" href="#/reproduction/cycle/${c.id}">${typeDot('repro')}<span class="li-main"><b>${esc(c.name)}</b><span><span class="pill repro">${esc(cur.label)}</span> ${c.next ? `next: ${esc(c.next.label)} · ${rel(c.next.due)}` : c.status}</span></span></a>`; }).join('') : '<p class="muted">No breeding cycles.</p>'}
    ${cls.filter((c) => c.status === 'incubating').map((c) => { const d = daysBetween(c.laid, n); return `<a class="clutch-mini" href="#/reproduction/clutch/${c.id}"><img src="assets/img/kpi/${c.img}.webp" alt="" loading="lazy"><div><b class="code">${esc(c.code)}</b> · day ${d} · ${c.fertile}/${c.eggs} eggs${rangeBar(d, c.expected, { label: false })}</div></a>`; }).join('')}
  </div></section>`;
}
function healthCard(db, a, { openH }, span = '') {
  const recent = db.health.filter((h) => h.animal === a.id).slice(0, 4);
  return `<section class="card ${span}"><header class="card-h"><span class="card-ico" style="color:var(--c-health)">${icon('health')}</span><h3>Health</h3><span class="card-a"><button class="btn sm" data-act="qr-type" data-type="health" data-subject="${a.id}">${icon('plus')}Record</button></span></header><div class="card-b">
    ${recent.length ? recent.map((h) => `<div class="li">${typeDot('health')}<span class="li-main"><b>${esc(h.title)}</b><span>${dShort(h.t)} · ${esc(h.kind)}${h.followUp && !h.resolved ? ` · follow-up ${dShort(h.followUp)}` : ''}</span></span><span class="pill ${h.resolved ? 'mute' : h.severity === 'alert' ? 'danger' : h.severity === 'watch' ? 'warn' : ''}">${h.resolved ? 'resolved' : h.severity}</span></div>`).join('') : '<p class="muted">No health records — good.</p>'}
    ${db.meds.filter((m) => m.animal === a.id && m.done < m.count).map((m) => `<div class="li">${typeDot('medication')}<span class="li-main"><b>${esc(m.drug)}</b><span>${esc(m.dose)} · ${esc(m.route)} · dose ${m.done}/${m.count}</span></span></div>`).join('')}
  </div></section>`;
}
function care(db, a, c) {
  const plans = db.plans.filter((p) => p.subject === a.id || (p.subjectKind === 'enclosure' && p.subject === a.enclosureId));
  const sp = c.sp;
  return `<div class="pf-grid">${feedCard(db, a, c).replace('class="card feedc"', 'class="card feedc span-6"')}
    <section class="card span-6"><header class="card-h"><span class="card-ico">${icon('thermo')}</span><h3>Husbandry parameters</h3><span class="card-sub">species targets · live readings</span></header><div class="card-b"><dl class="kv">
      <dt>Day temperature</dt><dd>${sp.env.day.join('–')} °C${c.e ? ` · now <b>${c.e.readings.t} °C</b>` : ''}</dd>${sp.env.basking ? `<dt>Basking</dt><dd>${sp.env.basking.join('–')} °C</dd>` : ''}<dt>Night</dt><dd>${sp.env.night.join('–')} °C</dd>
      <dt>Humidity</dt><dd>${sp.env.rh.join('–')} %${c.e ? ` · now <b class="${c.e.readings.rh < sp.env.rh[0] - 5 ? 'warn-t' : ''}">${c.e.readings.rh} %</b>` : ''}</dd>${sp.env.uvb ? `<dt>UVB</dt><dd>${esc(sp.env.uvb)}</dd>` : ''}${sp.env.brumation ? `<dt>Brumation</dt><dd>${sp.env.brumation.join('–')} °C</dd>` : ''}
      <dt>Enclosure</dt><dd>${c.e ? `${esc(c.e.code)} · ${c.e.dims.w} × ${c.e.dims.d} × ${c.e.dims.h} cm (W × D × H)` : '—'}</dd></dl></div></section>
    <section class="card span-12"><header class="card-h"><span class="card-ico">${icon('bolt')}</span><h3>Automation · care plans</h3><span class="card-sub">generate the Planner — edit interval & time inline</span></header><div class="card-b"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Activity</th><th>Protocol</th><th>Every</th><th>Time</th><th>Details</th><th>Active</th></tr></thead><tbody>
      ${plans.map((p) => `<tr><td>${typeDot(p.type)} ${esc(TYPE[p.type]?.label)}</td><td class="dim">${esc(p.protocol)}${p.auto ? ` <span class="org auto">${icon('bolt')}${esc(p.auto)}</span>` : ''}</td><td><select class="inl" data-change="pf-plan" data-id="${p.id}" data-k="every">${[1, 2, 3, 4, 5, 7, 10, 14, 21, 30].map((d) => `<option value="${d}" ${p.every === d ? 'selected' : ''}>${d === 1 ? 'day' : `${d} days`}</option>`).join('')}</select></td><td><input class="inl" type="time" value="${String(p.times[0][0]).padStart(2, '0')}:${String(p.times[0][1]).padStart(2, '0')}" data-change="pf-plan" data-id="${p.id}" data-k="time">${p.times.length > 1 ? ` <span class="dim">+${p.times.length - 1}</span>` : ''}</td><td class="dim">${esc(p.feeder ? `${p.feeder} · ${p.qty}` : p.subjectKind === 'enclosure' ? 'enclosure' : '')}</td><td><input type="checkbox" class="switch" data-change="pf-plan" data-id="${p.id}" data-k="active" ${p.active ? 'checked' : ''}></td></tr>`).join('')}
    </tbody></table></div></div></section></div>`;
}
function breeding(db, a) {
  const g = a.genetics || [];
  return `<div class="pf-grid">${breedCard(db, a, 'span-7')}<section class="card span-5"><header class="card-h"><span class="card-ico">${icon('genetics')}</span><h3>Genetics</h3></header><div class="card-b">${g.length ? `<div class="chips">${g.map((x) => `<span class="pill ${x.zyg === 'visual' ? 'amber' : x.zyg === 'het' ? 'repro' : 'mute'}">${esc(x.gene)} · ${esc(x.zyg)}</span>`).join('')}</div>` : '<p class="muted">No genetic traits recorded.</p>'}<a class="btn sm" href="#/genetics/calculator">${icon('genetics')}Open calculator</a></div></section>
    ${pedigree(db, a)}</div>`;
}
function pedigree(db, a) {
  const cl = db.clutches.find((c) => c.offspring?.includes(a.id)), f = cl && db.animals.find((x) => x.id === cl.female), m = cl && db.animals.find((x) => x.id === cl.male);
  const box = (x, role) => x ? `<a class="ped-b" href="#/animals/a/${x.id}">${avatar(x, 38)}<span><em>${role}</em><b class="code">${esc(x.code)}</b><span>${esc(x.name || '')} ${esc(x.morph || '')}</span></span></a>` : `<div class="ped-b unk"><span><em>${role}</em><b>unknown</b><span>${a.origin?.from ? esc(db.contacts.find((c) => c.id === a.origin.from)?.org || '') : 'external origin'}</span></span></div>`;
  return `<section class="card span-12"><header class="card-h"><span class="card-ico">${icon('users')}</span><h3>Pedigree</h3>${cl ? `<span class="card-sub">from clutch <a href="#/reproduction/clutch/${cl.id}" class="code">${esc(cl.code)}</a></span>` : ''}</header><div class="card-b"><div class="ped"><div class="ped-me">${avatar(a, 54)}<span><b class="code">${esc(a.code)}</b><span>${esc(a.name || '')}</span></span></div><div class="ped-lines"></div><div class="ped-par">${box(m, 'Sire ♂')}${box(f, 'Dam ♀')}</div></div></div></section>`;
}
function health(db, a, c) {
  const list = db.health.filter((h) => h.animal === a.id);
  return `<div class="pf-grid"><section class="card span-8"><header class="card-h"><span class="card-ico">${icon('health')}</span><h3>Health history</h3><span class="card-a"><button class="btn sm primary" data-act="qr-type" data-type="health" data-subject="${a.id}">${icon('plus')}New record</button></span></header><div class="card-b">
    ${list.length ? list.map((h) => `<article class="hrec sev-${h.severity} ${h.resolved ? 'res' : ''}"><header>${typeDot('health')}<div><b>${esc(h.title)}</b><span class="muted">${dLong(h.t)} · ${esc(h.kind)}${h.vet ? ` · ${esc(db.contacts.find((x) => x.id === h.vet)?.name || '')}` : ''}</span></div><span class="pill ${h.resolved ? 'mute' : h.severity === 'alert' ? 'danger' : h.severity === 'watch' ? 'warn' : ''}">${h.resolved ? 'resolved' : h.severity}</span>${h.resolved ? '' : `<button class="btn sm" data-act="pf-resolve" data-id="${h.id}">${icon('check')}Resolve</button>`}</header>
      ${h.diagnosis ? `<p><b>Diagnosis:</b> ${esc(h.diagnosis)}</p>` : ''}${h.notes ? `<p class="dim">${esc(h.notes)}</p>` : ''}${h.lab ? `<table class="tbl mini"><thead><tr><th>Test</th><th>Result</th><th>Reference</th></tr></thead><tbody>${h.lab.map((l) => `<tr><td>${esc(l.test)}</td><td><b>${esc(l.result)}</b></td><td class="dim">${esc(l.ref)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${h.attachments?.length ? `<div class="atts">${h.attachments.map((x) => `<span class="att">${icon(x.kind === 'image' ? 'image' : 'paperclip')}${esc(x.name)}</span>`).join('')}</div>` : ''}${h.followUp && !h.resolved ? `<p class="small">${icon('calendarClock')} Follow-up ${dLong(h.followUp)}</p>` : ''}</article>`).join('') : empty('No health records', '', 'health')}
  </div></section><div class="span-4 stack">${healthCard(db, a, c).replace('<h3>Health</h3>', '<h3>Summary</h3>')}</div></div>`;
}
function records(db, a) {
  const recs = db.records.filter((r) => r.subject === a.id || r.subject === a.enclosureId).slice().reverse().slice(0, 120);
  return `<section class="card"><header class="card-h"><span class="card-ico">${icon('history')}</span><h3>All records</h3><span class="card-sub">one history — from Planner, Tasks, Quick Record, Profile and automation</span></header><div class="card-b"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Activity</th><th>Details</th><th>Source</th><th></th></tr></thead><tbody>
    ${recs.map((r) => `<tr><td class="mono">${dShort(r.t)} ${hm(r.t)}</td><td>${typeDot(r.type)} ${esc(TYPE[r.type]?.label || r.type)}${r.data?.refused ? ' <span class="danger-t">refused</span>' : ''}</td><td class="dim">${esc([r.data?.feeder, r.data?.supplement, r.data?.g != null ? `${r.data.g} g` : '', r.data?.label, r.data?.title, r.data?.note].filter(Boolean).join(' · '))}</td><td><span class="org">${esc(r.source || '')}</span></td><td>${r.by === 'you' ? `<button class="icon-btn sm" data-act="edit-record" data-id="${r.id}" title="Edit">${icon('edit')}</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div></div></section>`;
}
function details(db, a, { sp, e }) {
  const docs = db.documents.filter((d) => d.animal === a.id), from = db.contacts.find((c) => c.id === a.origin?.from);
  return `<div class="pf-grid">
    <section class="card span-7"><header class="card-h"><span class="card-ico">${icon('file')}</span><h3>Description</h3><span class="card-a"><button class="btn sm" data-act="pf-edit" data-id="${a.id}">${icon('edit')}Edit</button></span></header><div class="card-b"><p class="pf-desc">${esc(a.description || 'No description yet.')}</p>${a.notes ? `<p class="dim">${esc(a.notes)}</p>` : ''}</div></section>
    <section class="card span-5"><header class="card-h"><span class="card-ico">${icon('leaf')}</span><h3>Taxonomy</h3></header><div class="card-b"><dl class="kv"><dt>Class</dt><dd>${esc(sp.cls)}</dd><dt>Order</dt><dd>${esc(sp.order)}</dd><dt>Family</dt><dd>${esc(sp.family)}</dd><dt>Species</dt><dd><i class="latin">${esc(latin(sp))}</i></dd><dt>Common</dt><dd>${esc(sp.common)}</dd><dt>Czech</dt><dd>${esc(sp.cz)}</dd></dl></div></section>
    <section class="card span-6"><header class="card-h"><span class="card-ico">${icon('mapPin')}</span><h3>Origin & documents</h3></header><div class="card-b"><dl class="kv"><dt>Origin</dt><dd>${esc(a.origin?.type || '—')}${a.origin?.gen ? ` · ${esc(a.origin.gen)}` : ''}</dd><dt>Source</dt><dd>${from ? `<a href="#/directory/all/${from.id}">${esc(from.org || from.name)}</a>` : '—'}</dd><dt>Hatched</dt><dd>${a.born ? dLong(a.born) : '—'}</dd></dl>
      <div class="list">${docs.map((d) => `<div class="li"><span class="sp-ico">${icon('file')}</span><span class="li-main"><b>${esc(d.name)}</b><span>${esc(d.kind)} · ${dShort(d.date)} · ${esc(d.size)}</span></span></div>`).join('') || '<p class="muted small">No documents.</p>'}</div></div></section>
    <section class="card span-6"><header class="card-h"><span class="card-ico">${icon('image')}</span><h3>Gallery</h3></header><div class="card-b"><div class="gal">${[0, 1, 2, 3, 4, 5].map((v) => `<img src="assets/img/species/${sp.img}-${v + 1}.webp" alt="" loading="lazy" class="${(a.imgVariant ?? 0) % 6 === v ? 'cur' : ''}" data-act="pf-photo" data-id="${a.id}" data-v="${v}" title="Use as profile photo">`).join('')}</div><p class="muted small">Tap to set the profile photo.</p></div></section>
    ${pedigree(db, a)}</div>`;
}

actions({
  'pf-sec': (el) => { sec = el.dataset.v; store.emit('change'); document.getElementById('view').scrollTo({ top: 0 }); },
  'pf-feed': (el) => { const db = store.get(), nx = nextOcc(db, el.dataset.id, 'feeding'); if (nx) done(A.complete([nx.id], { source: 'profile' }), { edit: (r) => r.records?.[0] && editRecordPanel(r.records[0].id) }); },
  'pf-fav': (el) => { const id = el.dataset.id; store.mutate(null, (d) => { d.favorites = d.favorites.includes(id) ? d.favorites.filter((x) => x !== id) : [id, ...d.favorites]; }); },
  'pf-edit': (el) => import('./animals.js').then((m) => m.openEditAnimal(el.dataset.id)),
  'pf-more': (el) => { const id = el.dataset.id; menu(el, [
    { icon: 'edit', label: 'Edit animal', run: () => import('./animals.js').then((m) => m.openEditAnimal(id)) },
    { icon: 'shed', label: 'Shed', run: () => openQuickRecord({ type: 'shed', subjects: [id] }) },
    { icon: 'clean', label: 'Cleaning', run: () => openQuickRecord({ type: 'cleaning', subjects: [id] }) },
    { icon: 'note', label: 'Note', run: () => import('../ui/global.js').then((m) => m.openCommand(false)) },
    { sep: true },
    { icon: 'tag', label: 'Mark for sale', run: () => { store.mutate('Marked for sale', (d) => { const a = d.animals.find((x) => x.id === id); a.status = 'for-sale'; if (!d.sales.some((s) => s.animal === id && s.status !== 'sold')) d.sales.push({ id: `sl_${id}`, animal: id, status: 'for-sale', price: a.price || 0, listed: Date.now() }); }); done({ label: 'Marked for sale' }); } },
    { icon: 'printer', label: 'Print label', run: () => import('../widgets/tooldrawer.js').then((m) => m.openToolDrawer('labels')) },
  ], { title: 'More' }); },
  'pf-plan': (el) => { const id = el.dataset.id, k = el.dataset.k; A.resolve; store.mutate('Edited care plan', (d) => { const p = d.plans.find((x) => x.id === id); if (k === 'every') p.every = +el.value; if (k === 'active') p.active = el.checked; if (k === 'time') { const [h, m] = el.value.split(':').map(Number); p.times[0] = [h, m]; } }); done({ label: 'Care plan updated — Planner regenerated' }); },
  'pf-mnote': (el) => store.mutate(null, (d) => { const a = d.animals.find((x) => x.id === el.dataset.id); const m = a.members.find((x) => x.id === el.dataset.m); m.note = el.value; }),
  'pf-resolve': (el) => { store.mutate('Resolved health record', (d) => { const h = d.health.find((x) => x.id === el.dataset.id); h.resolved = true; }); done({ label: 'Health record resolved' }); },
  'pf-photo': (el) => store.mutate('Changed photo', (d) => { d.animals.find((x) => x.id === el.dataset.id).imgVariant = +el.dataset.v; }),
});
