// HEALTH — open problems first (follow-ups, running courses, quarantine), then the full medical record.
import { esc, actions, uid } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { panel, close as closeOv } from '../core/overlay.js';
import { SPECIES, latin } from '../data/species.js';
import { streamHTML, contextItems } from '../ui/timeline.js';
import { avatar, empty, kpi, typeDot } from '../ui/components.js';
import { done } from '../ui/feedback.js';
import { openQuickRecord } from '../ui/quickrecord.js';
import { workspaceHTML, mountWorkspace } from '../widgets/workspace.js';
import { DAY, HOUR, rel, dShort, dLong, hm, startOfDay } from '../core/time.js';

const F = { sev: '', kind: '', q: '' };
const A = (db, id) => db.animals.find((a) => a.id === id);
const sevPill = (h) => `<span class="pill ${h.resolved ? 'mute' : h.severity === 'alert' ? 'danger' : h.severity === 'watch' ? 'warn' : ''}">${h.resolved ? 'resolved' : h.severity}</span>`;

export function context(r) {
  const db = store.get();
  return { counts: { records: db.health.filter((h) => !h.resolved).length || null, medication: db.meds.filter((m) => m.done < m.count).length || null }, sub: 'Problems first · full medical history',
    actions: [{ label: 'Medication', icon: 'pill', act: 'hl-med', hideM: true }, { label: 'Health record', icon: 'plus', act: 'quick-record', data: { type: 'health' }, primary: true, kbd: 'N' }] };
}
export function onNew() { openQuickRecord({ type: 'health' }); }
export function render(r) {
  const sub = r.sub || 'overview';
  if (sub === 'records') return records();
  if (sub === 'medication') return medication();
  return overview();
}
export function mount(root) { mountWorkspace(root); }

function overview() {
  const db = store.get(), n = Date.now(), open = db.health.filter((h) => !h.resolved), q = db.animals.filter((a) => a.status === 'quarantine'), meds = db.meds.filter((m) => m.done < m.count);
  const items = contextItems({ from: startOfDay(n) - 3 * DAY, to: startOfDay(n) + 7 * DAY, includeHistory: false }).filter((i) => ['health', 'medication'].includes(i.type) && i.kind !== 'phase');
  return `<div class="rp">
    <div class="kpis">${kpi({ label: 'Open problems', value: open.length, sub: `${open.filter((h) => h.severity === 'alert').length} alert · ${open.filter((h) => h.severity === 'watch').length} watch`, artKey: 'health', tone: open.length ? 'amber' : '', href: '#/health/records' })}${kpi({ label: 'Running courses', value: meds.length, sub: meds.map((m) => A(db, m.animal)?.code).join(', ') || 'none', artKey: 'health', href: '#/health/medication' })}${kpi({ label: 'Quarantine', value: q.length, sub: q.map((a) => a.code).join(', ') || 'empty', img: 'assets/img/enclosures/quarantine.webp' })}${kpi({ label: 'Vet visits (12 mo)', value: db.health.filter((h) => h.vet && h.t > n - 365 * DAY).length, sub: `${db.finance.filter((f) => f.cat === 'Veterinary' && f.t > n - 365 * DAY).reduce((s, f) => s + f.amount, 0).toLocaleString('cs-CZ')} Kč`, artKey: 'finance' })}</div>
    <div class="pf-grid">
      <section class="card span-7"><header class="card-h"><span class="card-ico" style="color:var(--c-health)">${icon('alert')}</span><h3>Needs attention</h3><span class="card-sub">sorted by severity</span></header><div class="card-b">
        ${open.length ? open.sort((a, b) => ({ alert: 0, watch: 1, info: 2 }[a.severity] - { alert: 0, watch: 1, info: 2 }[b.severity])).map((h) => probRow(db, h)).join('') : empty('No open problems', 'All animals are healthy.', 'health')}</div></section>
      <section class="card span-5"><header class="card-h"><span class="card-ico">${icon('planner')}</span><h3>Follow-ups & doses</h3></header><div class="card-b">${streamHTML(items, { mode: 'compact', showDone: false, empty: 'No follow-ups or doses due this week' })}</div></section>
      ${q.map((a) => quarantineCard(db, a)).join('')}
    </div>
    ${workspaceHTML('health', { title: 'Health workspace' })}
  </div>`;
}
function probRow(db, h) {
  const a = A(db, h.animal);
  return `<article class="prob sev-${h.severity}"><a href="#/animals/a/${a.id}?tab=health">${avatar(a, 46)}</a><div class="prob-b"><div class="row"><b>${esc(h.title)}</b>${sevPill(h)}</div><span class="muted small"><b class="code">${esc(a.code)}</b> ${esc(a.name || '')} · <i class="latin">${esc(latin(SPECIES[a.species]))}</i> · ${rel(h.t)}</span>${h.notes ? `<p class="small">${esc(h.notes)}</p>` : ''}${h.followUp ? `<span class="small ${h.followUp < Date.now() ? 'danger-t' : ''}">${icon('calendarClock')} follow-up ${dShort(h.followUp)} ${hm(h.followUp)} · ${rel(h.followUp)}</span>` : ''}</div>
    <div class="prob-a"><button class="btn sm" data-act="hl-resolve" data-id="${h.id}">${icon('check')}Resolved</button><button class="btn sm ghost" data-act="hl-follow" data-id="${h.id}" title="Follow-up +3 d">${icon('later')}+3 d</button></div></article>`;
}
function quarantineCard(db, a) {
  const since = db.records.find((r) => r.subject === a.id)?.t || Date.now() - 20 * DAY, day = Math.floor((Date.now() - since) / DAY), len = 60;
  const steps = [['Arrival exam', true], ['Faecal flotation', true], ['Direct smear', true], ['Cryptosporidium PCR', false], ['Second faecal (day 45)', day >= 45], ['Release decision', false]];
  return `<section class="card span-12 qcard"><img src="assets/img/enclosures/quarantine.webp" alt=""><div class="card-b"><div class="row"><span class="pill warn">${icon('shield')}Quarantine</span><a class="code" href="#/animals/a/${a.id}">${esc(a.code)}</a> ${esc(a.name)} · <i class="latin">${esc(latin(SPECIES[a.species]))}</i><span class="spacer"></span><span class="mono">day ${day} / ${len}</span></div>
    <div class="q-prog"><i style="width:${Math.min(100, (day / len) * 100)}%"></i></div><div class="q-steps">${steps.map(([l, ok]) => `<span class="${ok ? 'ok' : ''}">${icon(ok ? 'checkCircle' : 'clock')}${esc(l)}</span>`).join('')}</div></div></section>`;
}
function records() {
  const db = store.get();
  let list = db.health.slice().sort((a, b) => b.t - a.t);
  if (F.sev) list = list.filter((h) => (F.sev === 'open' ? !h.resolved : h.severity === F.sev));
  if (F.kind) list = list.filter((h) => h.kind === F.kind);
  if (F.q) { const q = F.q.toLowerCase(); list = list.filter((h) => `${h.title} ${h.notes} ${h.diagnosis || ''} ${A(db, h.animal)?.code}`.toLowerCase().includes(q)); }
  return `<div class="toolbar"><div class="search-in"><span>${icon('search')}</span><input id="hl-q" type="search" placeholder="Search diagnosis, notes, animal…" value="${esc(F.q)}" data-input="hl-q"></div>
    <div class="an-chips">${[['', 'All'], ['open', 'Open'], ['alert', 'Alert'], ['watch', 'Watch'], ['info', 'Info']].map(([v, l]) => `<button class="chip ${F.sev === v ? 'on' : ''}" data-act="hl-sev" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="an-chips">${[['', 'Any type'], ['observation', 'Observation'], ['vet', 'Vet'], ['lab', 'Lab'], ['diagnosis', 'Diagnosis'], ['preventive', 'Preventive']].map(([v, l]) => `<button class="chip ${F.kind === v ? 'on' : ''}" data-act="hl-kind" data-v="${v}">${l}</button>`).join('')}</div></div>
    <div class="h-list">${list.map((h) => { const a = A(db, h.animal), vet = db.contacts.find((c) => c.id === h.vet); return `<article class="hrec sev-${h.severity} ${h.resolved ? 'res' : ''}"><header><a href="#/animals/a/${a.id}?tab=health">${avatar(a, 40)}</a><div><b>${esc(h.title)}</b><span class="muted small"><b class="code">${esc(a.code)}</b> · ${dLong(h.t)} · ${esc(h.kind)}${vet ? ` · ${esc(vet.name)}` : ''}</span></div>${sevPill(h)}${h.resolved ? '' : `<button class="btn sm" data-act="hl-resolve" data-id="${h.id}">${icon('check')}Resolve</button>`}</header>
      ${h.diagnosis ? `<p><b>Diagnosis:</b> ${esc(h.diagnosis)}</p>` : ''}${h.notes ? `<p class="dim">${esc(h.notes)}</p>` : ''}${h.lab ? `<table class="tbl mini"><thead><tr><th>Test</th><th>Result</th><th>Reference</th></tr></thead><tbody>${h.lab.map((l) => `<tr><td>${esc(l.test)}</td><td><b class="${l.result === 'Pending' ? 'warn-t' : ''}">${esc(l.result)}</b></td><td class="dim">${esc(l.ref)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${h.attachments?.length ? `<div class="atts">${h.attachments.map((x) => `<span class="att">${icon(x.kind === 'image' ? 'image' : 'paperclip')}${esc(x.name)}</span>`).join('')}</div>` : ''}</article>`; }).join('') || empty('No records match', '', 'health')}</div>`;
}
function medication() {
  const db = store.get(), n = Date.now();
  return `<div class="med-grid">${db.meds.map((m) => { const a = A(db, m.animal), next = m.done < m.count ? m.from + m.done * m.everyH * HOUR : null; return `<article class="card med ${m.done >= m.count ? 'fin' : ''}"><div class="card-b">
    <div class="row">${avatar(a, 44)}<div class="li-main"><b>${esc(m.drug)}</b><span class="muted small"><b class="code">${esc(a.code)}</b> ${esc(a.name)} · ${esc(m.dose)} (${esc(m.amount)}) · ${esc(m.route)} · every ${m.everyH} h</span></div></div>
    <div class="doses">${Array.from({ length: m.count }, (_, i) => `<i class="${i < m.done ? 'ok' : i === m.done ? 'next' : ''}" title="Dose ${i + 1} · ${dShort(m.from + i * m.everyH * HOUR)}">${i + 1}</i>`).join('')}</div>
    <div class="row"><span class="muted small">${m.done}/${m.count} doses${next ? ` · next ${dShort(next)} ${hm(next)} (${rel(next)})` : ' · course finished'}</span><span class="spacer"></span>${next ? `<button class="btn sm primary" data-act="hl-dose" data-id="${m.id}">${icon('check')}GIVEN</button>` : ''}</div>
    ${m.note ? `<p class="small dim">${esc(m.note)}</p>` : ''}</div></article>`; }).join('')}
    <button class="cy-card add" data-act="hl-med">${icon('plus')}<span>New course<br><small class="muted">doses are generated into the Planner</small></span></button></div>`;
}
function openMed() {
  const db = store.get(), S = { a: db.animals.find((x) => x.status === 'quarantine')?.id || db.animals[0].id, drug: '', dose: '', route: 'PO', everyH: 24, count: 5 };
  const live = db.animals.filter((a) => !['sold', 'deceased'].includes(a.status) && a.kind !== 'group');
  const h = panel({ title: 'Medication course', sub: 'Doses appear in Planner & Tasks automatically', icon: 'pill', body: `<div class="field"><label>Animal</label><select data-k="a">${live.map((a) => `<option value="${a.id}" ${a.id === S.a ? 'selected' : ''}>${esc(a.code)} ${esc(a.name || '')}</option>`).join('')}</select></div>
    <div class="field"><label>Drug</label><input data-k="drug" placeholder="e.g. Metronidazole" list="drugs"><datalist id="drugs"><option>Metronidazole</option><option>Enrofloxacin (Baytril 2.5 %)</option><option>Fenbendazole (Panacur)</option><option>Meloxicam</option><option>Eye lubricant (hypromellose)</option></datalist></div>
    <div class="grid g2"><div class="field"><label>Dose</label><input data-k="dose" placeholder="50 mg/kg"></div><div class="field"><label>Route</label><div class="seg">${['PO', 'IM', 'SC', 'topical', 'bath'].map((r) => `<button data-route="${r}" class="${S.route === r ? 'on' : ''}">${r}</button>`).join('')}</div></div></div>
    <div class="grid g2"><div class="field"><label>Every</label><div class="seg">${[12, 24, 48, 72].map((x) => `<button data-every="${x}" class="${S.everyH === x ? 'on' : ''}">${x} h</button>`).join('')}</div></div><div class="field"><label>Doses</label><input type="number" data-k="count" value="5" min="1" max="60"></div></div>`,
    footer: `<button class="btn primary lg" data-save>${icon('check')}Start course</button>` });
  h.el.addEventListener('input', (e) => { const k = e.target.dataset.k; if (k) S[k] = k === 'count' ? +e.target.value : e.target.value; });
  h.el.addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) S[k] = e.target.value; });
  h.el.addEventListener('click', (e) => { const r = e.target.closest('[data-route]'); if (r) { S.route = r.dataset.route; h.el.querySelectorAll('[data-route]').forEach((b) => b.classList.toggle('on', b === r)); } const ev = e.target.closest('[data-every]'); if (ev) { S.everyH = +ev.dataset.every; h.el.querySelectorAll('[data-every]').forEach((b) => b.classList.toggle('on', b === ev)); }
    if (e.target.closest('[data-save]')) { if (!S.drug) { h.el.querySelector('[data-k=drug]').focus(); return; } store.mutate('Medication course', (d) => d.meds.push({ id: uid('m'), animal: S.a, drug: S.drug, dose: S.dose || '—', amount: S.dose || '—', route: S.route, everyH: S.everyH, from: Math.ceil(Date.now() / HOUR) * HOUR, count: S.count, done: 0, vet: null, note: '' })); closeOv(h); done({ label: `Course started — ${S.count} doses in the Planner` }); } });
}
actions({
  'hl-resolve': (el) => { store.mutate('Resolved health record', (d) => { d.health.find((x) => x.id === el.dataset.id).resolved = true; }); done({ label: 'Marked resolved' }); },
  'hl-follow': (el) => { store.mutate('Follow-up moved', (d) => { const h = d.health.find((x) => x.id === el.dataset.id); h.followUp = Math.max(Date.now(), h.followUp || Date.now()) + 3 * DAY; }); done({ label: 'Follow-up in 3 days' }); },
  'hl-dose': (el) => { const db = store.get(), m = db.meds.find((x) => x.id === el.dataset.id); store.mutate('Dose given', (d) => { const mm = d.meds.find((x) => x.id === m.id); mm.done++; d.records.push({ id: uid('r'), t: Date.now(), type: 'medication', subject: mm.animal, data: { med: mm.id, drug: mm.drug, dose: mm.dose, n: mm.done }, source: 'health', by: 'you' }); d.occ[`dose:${mm.id}:${mm.done - 1}`] = { status: 'done', at: Date.now() }; }); done({ label: `Dose ${m.done + 1}/${m.count} recorded` }); },
  'hl-med': () => openMed(),
  'hl-sev': (el) => { F.sev = el.dataset.v; store.emit('change'); },
  'hl-kind': (el) => { F.kind = el.dataset.v; store.emit('change'); },
  'hl-q': (el) => { F.q = el.value; store.emit('change'); },
});
