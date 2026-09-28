// QUICK RECORD — the signature interaction. Context is reused aggressively: from an Animal Profile the animal is
// preset, from an Enclosure its occupants, from a Task its activity + animal, from a Reproduction cycle the cycle.
// Normal case: action → (target) → ✓ = saved, with UNDO. Details are progressive disclosure.
import { esc, $, $$ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { modal, panel, close as closeOv, isMobile } from '../core/overlay.js';
import * as store from '../core/store.js';
import { SPECIES, SUPPLEMENTS, latin } from '../data/species.js';
import { TYPE, rotationState, lastWeight, subjectOf } from '../engine/ops.js';
import { buildTimeline } from '../engine/timeline.js';
import * as A from '../engine/actions.js';
import { avatar, sexText, spName } from './components.js';
import { done } from './feedback.js';
import { DAY, HOUR, startOfDay, hm, rel, toLocalInput } from '../core/time.js';

export const QR_ACTIONS = [
  ['feeding', 'Feeding', 'feed'], ['water', 'Water', 'water'], ['misting', 'Misting', 'mist'], ['cleaning', 'Cleaning', 'clean'], ['weight', 'Weight', 'weight'],
  ['shed', 'Shed', 'shed'], ['health', 'Health', 'health'], ['repro', 'Reproduction', 'repro'], ['task', 'Task', 'tasks'], ['animal', 'Add animal', 'plus'],
];
const OBS = ['Not eating', 'Retained shed', 'Lethargic', 'Regurgitation', 'Wound / injury', 'Weight loss', 'Respiratory signs', 'Parasite suspicion', 'Other'];
const REPRO_EV = [['pairing', 'Pairing'], ['mating', 'Observed mating'], ['ovulation', 'Ovulation'], ['prelay', 'Pre-lay shed'], ['clutch', 'Clutch / birth'], ['calling', 'Calling / courtship'], ['note', 'Note']];

let S = null; // current flow state
const active = (db) => db.animals.filter((a) => !['sold', 'deceased'].includes(a.status));

/** open(ctx) — ctx: { type, subjects:[ids], cycle, taskId, enclosure } */
export function openQuickRecord(ctx = {}) {
  const db = store.get();
  S = { type: ctx.type || null, subjects: new Set(ctx.subjects || []), cycle: ctx.cycle || null, enclosure: ctx.enclosure || null, preset: !!(ctx.subjects && ctx.subjects.length), filter: 'due', q: '', adv: false, data: {} };
  if (ctx.enclosure && !S.subjects.size) for (const a of active(db).filter((x) => x.enclosureId === ctx.enclosure)) S.subjects.add(a.id);
  if (S.subjects.size) S.preset = true;
  if (S.type === 'animal') { closeOv(); import('../views/animals.js').then((m) => m.openAddAnimal()); return; }
  const h = modal({ title: 'Quick Record', sub: 'Record what you just did — context is filled in for you', icon: 'plus', width: 640, cls: 'qr-modal', body: '<div class="qr" data-role="qr"></div>' });
  S.h = h; draw();
  h.el.addEventListener('click', onClick); h.el.addEventListener('input', onInput); h.el.addEventListener('keydown', onKey);
}

function draw() {
  const box = S.h.el.querySelector('[data-role=qr]'); if (!box) return;
  const step = !S.type ? 'action' : (!S.subjects.size && !['task'].includes(S.type)) || S.pickMore ? 'target' : 'detail';
  S.step = step;
  box.innerHTML = step === 'action' ? actionStep() : step === 'target' ? targetStep() : detailStep();
  const head = S.h.el.querySelector('.ov-head h2'); if (head) head.textContent = S.type ? `Quick Record · ${TYPE[S.type]?.label || (S.type === 'repro' ? 'Reproduction' : S.type)}` : 'Quick Record';
  box.querySelector('[autofocus]')?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- step 1: what
function actionStep() {
  const db = store.get(), last = A.lastOwnRecord();
  const ctxLine = S.subjects.size ? `<div class="qr-ctx">${icon('pin')}<span>For <b>${[...S.subjects].map((id) => esc(subjectOf(db, id)?.code || id)).join(', ')}</b></span><button class="link" data-q="clear-subj">change</button></div>` : '';
  return `${ctxLine}<div class="qr-actions">${QR_ACTIONS.map(([k, l, ic], i) => `<button class="qa" data-q="type" data-v="${k}" style="--c:${TYPE[k]?.color || (k === 'animal' ? 'var(--amber)' : 'var(--c-repro)')}"><span class="qa-ico">${icon(ic)}</span><span>${l}</span><kbd>${(i + 1) % 10}</kbd></button>`).join('')}</div>
  ${last ? `<div class="qr-last"><span>${icon('history')} Last record</span><b>${esc(TYPE[last.type]?.label || last.type)} · ${esc(subjectOf(db, last.subject)?.code || '')}</b><em>${rel(last.t)}</em><button class="btn sm" data-q="edit-last">${icon('edit')}Edit</button><button class="btn sm" data-q="repeat-last" data-type="${last.type}" data-subject="${last.subject}">${icon('repeat')}Repeat</button></div>` : ''}`;
}

// ---------------------------------------------------------------- step 2: for whom (recent / favourites / due now / groups / search), multi-select
function candidates() {
  const db = store.get(), n = Date.now();
  const due = buildTimeline(db, { from: startOfDay(n) - 3 * DAY, to: startOfDay(n) + DAY, includeHistory: false }).filter((i) => i.kind === 'occ' && (i.status === 'open' || i.status === 'overdue') && (S.type === 'repro' ? i.type === 'repro' : i.type === S.type) && i.subjectKind === 'animal');
  const dueIds = [...new Set(due.map((i) => i.subject))];
  let list = active(db);
  if (S.filter === 'due') list = list.filter((a) => dueIds.includes(a.id));
  if (S.filter === 'recent') list = db.recent.animals.map((id) => list.find((a) => a.id === id)).filter(Boolean);
  if (S.filter === 'fav') list = list.filter((a) => db.favorites.includes(a.id));
  if (S.filter === 'groups') list = list.filter((a) => a.kind === 'group');
  if (S.q) { const q = S.q.toLowerCase(); list = active(db).filter((a) => `${a.code} ${a.name} ${SPECIES[a.species]?.latin} ${SPECIES[a.species]?.common} ${SPECIES[a.species]?.cz} ${db.enclosures.find((e) => e.id === a.enclosureId)?.code || ''}`.toLowerCase().includes(q)); }
  return { list, dueIds };
}
function targetStep() {
  const db = store.get(), { list, dueIds } = candidates();
  const f = (k, l, n) => `<button class="chip ${S.filter === k && !S.q ? 'on' : ''}" data-q="filter" data-v="${k}">${l}${n != null ? ` <em>${n}</em>` : ''}</button>`;
  const selN = S.subjects.size;
  return `<div class="qr-search"><span>${icon('search')}</span><input type="search" placeholder="Code, name, species, enclosure…" value="${esc(S.q)}" data-q-input="q" autofocus aria-label="Find animal"></div>
  <div class="qr-filters">${f('due', `Due now`, dueIds.length)}${f('recent', 'Recent')}${f('fav', 'Favourites', db.favorites.length)}${f('groups', 'Groups')}${f('all', 'All')}</div>
  ${S.filter === 'due' && !S.q && list.length > 1 ? `<button class="qr-selall" data-q="select-all">${icon('checkCircle')}Select all ${list.length} due</button>` : ''}
  <div class="qr-targets">${list.length ? list.map((a) => { const sp = SPECIES[a.species], on = S.subjects.has(a.id), e = db.enclosures.find((x) => x.id === a.enclosureId); return `<button class="qt ${on ? 'on' : ''}" data-q="toggle" data-id="${a.id}" aria-pressed="${on}">${avatar(a, 40)}<span class="qt-t"><b><span class="code">${esc(a.code)}</span>${a.name ? ` ${esc(a.name)}` : ''}${a.kind === 'group' ? ` <em>×${a.count}</em>` : ''}</b><i class="latin">${esc(latin(sp))}</i></span><span class="qt-m">${e ? esc(e.code) : ''}${dueIds.includes(a.id) ? `<span class="pill amber">due</span>` : ''}</span><span class="qt-cb">${icon('check')}</span></button>`; }).join('') : `<p class="muted pad">Nothing ${S.filter === 'due' ? 'due for this activity now' : 'here'} — try <button class="link" data-q="filter" data-v="all">All animals</button>.</p>`}</div>
  <div class="qr-foot"><span class="muted">${selN ? `${selN} selected` : 'Tap to select — select several for bulk care'}</span><button class="btn primary lg" data-q="targets-done" ${selN ? '' : 'disabled'}>Continue ${icon('arrowRight')}</button></div>`;
}

// ---------------------------------------------------------------- step 3: minimal details → one primary action
function subjLine() {
  const db = store.get(), ids = [...S.subjects];
  const a0 = db.animals.find((a) => a.id === ids[0]);
  if (ids.length === 1 && a0) return `<div class="qr-subj">${avatar(a0, 46)}<div><b><span class="code">${esc(a0.code)}</span> ${esc(a0.name || '')}${a0.kind === 'group' ? ` · ${a0.count} animals` : ''}</b>${spName(a0.species)}</div>${S.preset ? '' : `<button class="link" data-q="back-target">change</button>`}</div>`;
  return `<div class="qr-subj multi"><div class="stackav">${ids.slice(0, 5).map((id) => { const a = db.animals.find((x) => x.id === id); return a ? avatar(a, 34) : ''; }).join('')}</div><div><b>${ids.length} targets</b><span class="muted">${ids.map((id) => esc(db.animals.find((x) => x.id === id)?.code || subjectOf(db, id)?.code || id)).join(', ')}</span></div><button class="link" data-q="back-target">change</button></div>`;
}
function detailStep() {
  const db = store.get(), t = S.type, ids = [...S.subjects];
  const plan = ids.length === 1 ? db.plans.find((p) => p.subject === ids[0] && p.type === t) : null;
  if (t === 'feeding') {
    const rs = plan ? rotationState(db, plan) : null;
    const sup = S.data.supplement || rs?.next;
    return `${subjLine()}
      <div class="qr-sum">${plan ? `<div><span>Feeder</span><b>${esc(S.data.feeder || plan.feeder)}</b></div><div><span>Quantity</span><b>${esc(S.data.qty || plan.qty)}</b></div>` : `<div><span>Feeder</span><b>From each animal's care plan</b></div>`}
      ${sup ? `<div class="sup" style="--c:${SUPPLEMENTS[sup]?.color || 'var(--amber)'}"><span>Supplement · rotation</span><b>${esc(sup)}</b>${rs ? `<em>${rs.index + 1}/${rs.rot.length}</em>` : ''}</div>` : ids.length > 1 ? `<div><span>Supplement</span><b>Rotation per animal</b></div>` : ''}</div>
      ${adv(`<div class="grid2"><label class="field"><span>Feeder</span><input type="text" data-q-input="feeder" value="${esc(S.data.feeder || plan?.feeder || '')}" placeholder="From care plan"></label><label class="field"><span>Quantity</span><input type="text" data-q-input="qty" value="${esc(S.data.qty || plan?.qty || '')}"></label></div>
        <label class="field"><span>Supplement override</span><select data-q-input="supplement"><option value="">Rotation (${esc(rs?.next || '—')})</option>${Object.keys(SUPPLEMENTS).map((s) => `<option ${S.data.supplement === s ? 'selected' : ''}>${s}</option>`).join('')}<option value="none">None this time</option></select></label>
        ${timeNote()}`)}
      <div class="qr-go"><button class="btn lg" data-q="save" data-refused="1">${icon('ban')}Refused</button><button class="btn primary lg grow" data-q="save" autofocus>${icon('check')}FED${ids.length > 1 ? ` · ${ids.length}` : ''}</button></div>`;
  }
  if (['water', 'misting', 'cleaning'].includes(t)) return `${subjLine()}${adv(timeNote())}<div class="qr-go"><button class="btn primary lg grow" data-q="save" autofocus>${icon('check')}DONE${ids.length > 1 ? ` · ${ids.length}` : ''}</button></div>`;
  if (t === 'weight') {
    const last = ids.length === 1 ? lastWeight(db, ids[0]) : null;
    const v = S.data.g ?? last ?? '';
    return `${subjLine()}<div class="qr-weight"><label class="field"><span>Weight ${last != null ? `<em class="hint">last ${last} g</em>` : ''}</span>
      <div class="num-in big"><button data-q="step" data-v="-${last > 500 ? 10 : 1}">${icon('minus')}</button><input type="number" inputmode="decimal" step="0.1" data-q-input="g" value="${v}" autofocus aria-label="Weight in grams"><em>g</em><button data-q="step" data-v="${last > 500 ? 10 : 1}">${icon('plus')}</button></div></label>
      ${last != null && S.data.g != null ? `<p class="delta ${S.data.g >= last ? 'ok-t' : 'danger-t'}">${S.data.g >= last ? '+' : ''}${(S.data.g - last).toFixed(1)} g (${(((S.data.g - last) / last) * 100).toFixed(1)} %)</p>` : ''}</div>
      ${adv(timeNote())}<div class="qr-go"><button class="btn primary lg grow" data-q="save">${icon('check')}SAVE WEIGHT</button></div>`;
  }
  if (t === 'shed') return `${subjLine()}${adv(timeNote())}<div class="qr-go"><button class="btn lg" data-q="save" data-incomplete="1">${icon('alert')}Incomplete</button><button class="btn primary lg grow" data-q="save" autofocus>${icon('check')}COMPLETE SHED</button></div>`;
  if (t === 'health') return `${subjLine()}<div class="field"><span>Observation</span><div class="chips">${OBS.map((o) => `<button class="chip ${S.data.title === o ? 'on' : ''}" data-q="obs" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>
      <label class="field"><span>Short note</span><textarea rows="2" data-q-input="note" placeholder="What did you see?">${esc(S.data.note || '')}</textarea></label>
      <div class="field"><span>Severity</span><div class="seg">${[['info', 'Info'], ['watch', 'Watch'], ['alert', 'Alert']].map(([k, l]) => `<button class="${(S.data.severity || 'watch') === k ? 'on' : ''}" data-q="sev" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${adv(`<div class="grid2"><label class="field"><span>+ Diagnosis</span><input type="text" data-q-input="diagnosis" value="${esc(S.data.diagnosis || '')}"></label><label class="field"><span>+ Veterinarian</span><select data-q-input="vet"><option value="">—</option>${db.contacts.filter((c) => c.kind === 'vet').map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label></div>
        <div class="grid2"><label class="field"><span>+ Follow-up</span><select data-q-input="followUp"><option value="">No follow-up</option><option value="1">Tomorrow</option><option value="3">In 3 days</option><option value="7">In a week</option></select></label><label class="field"><span>+ Photo / attachment</span><input type="file" accept="image/*,application/pdf" data-q-file capture="environment"></label></div>`, 'Veterinary details')}
      <div class="qr-go"><button class="btn primary lg grow" data-q="save" ${S.data.title ? '' : 'disabled'}>${icon('check')}SAVE HEALTH RECORD</button></div>`;
  if (t === 'repro') {
    const cys = db.cycles.filter((c) => c.status === 'active' && (!ids.length || ids.includes(c.female) || ids.includes(c.male)));
    if (!S.cycle && cys.length === 1) S.cycle = cys[0].id;
    return `${subjLine()}<div class="field"><span>Cycle</span><div class="chips">${cys.map((c) => `<button class="chip ${S.cycle === c.id ? 'on' : ''}" data-q="cycle" data-v="${c.id}">${esc(c.name)}</button>`).join('') || '<span class="muted">No active cycle — event is recorded on the animal.</span>'}</div></div>
      <div class="field"><span>Event</span><div class="chips">${REPRO_EV.map(([k, l]) => `<button class="chip ${S.data.kind === k ? 'on' : ''}" data-q="rkind" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${S.data.kind === 'clutch' ? `<label class="field"><span>Eggs / neonates</span><div class="num-in"><button data-q="eggs" data-v="-1">${icon('minus')}</button><input type="number" data-q-input="eggs" value="${S.data.eggs ?? 2}"><button data-q="eggs" data-v="1">${icon('plus')}</button></div></label>` : ''}
      ${adv(timeNote())}<div class="qr-go"><button class="btn primary lg grow" data-q="save" ${S.data.kind ? '' : 'disabled'}>${icon('check')}CONFIRM EVENT</button></div>`;
  }
  if (t === 'task') {
    const due = S.data.dueK || 'today';
    return `<label class="field"><span>Task</span><input type="text" data-q-input="title" value="${esc(S.data.title || '')}" placeholder="e.g. Replace mist nozzle FW-3" autofocus data-enter-q="save"></label>
      <div class="field"><span>When</span><div class="chips">${[['now', 'In 1 h'], ['today', 'Today 18:00'], ['tomorrow', 'Tomorrow'], ['2d', 'In 2 days'], ['week', 'Next week']].map(([k, l]) => `<button class="chip ${due === k ? 'on' : ''}" data-q="due" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${S.subjects.size ? subjLine() : `<button class="link" data-q="pick-subject">${icon('link')} Link to an animal or enclosure (optional)</button>`}
      ${adv(`<div class="grid2"><label class="field"><span>Priority</span><select data-q-input="priority"><option>normal</option><option>high</option><option>low</option></select></label><label class="field"><span>Exact time</span><input type="datetime-local" data-q-input="dueAt"></label></div><label class="field"><span>Note</span><textarea rows="2" data-q-input="note"></textarea></label>`)}
      <div class="qr-go"><button class="btn primary lg grow" data-q="save" ${S.data.title ? '' : 'disabled'}>${icon('plus')}CREATE TASK</button></div>`;
  }
  return '';
}
const timeNote = () => `<div class="grid2"><label class="field"><span>When</span><input type="datetime-local" data-q-input="t" value="${toLocalInput(S.data.t || Date.now())}"></label><label class="field"><span>Note</span><input type="text" data-q-input="note" value="${esc(S.data.note || '')}" placeholder="Optional"></label></div>`;
const adv = (inner, label = 'Details') => `<details class="qr-adv" ${S.adv ? 'open' : ''}><summary data-q="adv">${icon('sliders')}${label}<span class="muted">optional</span></summary><div class="stack">${inner}</div></details>`;

// ---------------------------------------------------------------- events
function onInput(e) {
  const k = e.target.dataset.qInput; if (!k) return;
  let v = e.target.value;
  if (k === 'q') { S.q = v; const box = S.h.el.querySelector('.qr-targets'); const sel = e.target.selectionStart; draw(); const inp = S.h.el.querySelector('[data-q-input=q]'); inp.focus(); inp.setSelectionRange(sel, sel); return; }
  if (k === 'g') { S.data.g = v === '' ? null : +v; const d = S.h.el.querySelector('.delta'); const last = lastWeight(store.get(), [...S.subjects][0]); if (d && last != null && S.data.g != null) { d.textContent = `${S.data.g >= last ? '+' : ''}${(S.data.g - last).toFixed(1)} g (${(((S.data.g - last) / last) * 100).toFixed(1)} %)`; d.className = `delta ${S.data.g >= last ? 'ok-t' : 'danger-t'}`; } return; }
  if (k === 't' || k === 'dueAt') v = v ? new Date(v).getTime() : null;
  if (k === 'eggs') v = +v;
  S.data[k] = v;
  if (k === 'title') { const b = S.h.el.querySelector('[data-q=save]'); if (b) b.disabled = !v.trim(); }
}
function onKey(e) {
  if (S.step === 'action' && /^[0-9]$/.test(e.key) && !e.target.matches('input,textarea')) { const i = (+e.key + 9) % 10; const a = QR_ACTIONS[i]; if (a) { e.preventDefault(); pickType(a[0]); } }
  if (e.key === 'Enter' && e.target.matches('[data-enter-q]')) { e.preventDefault(); save(); }
  if (e.key === 'Enter' && S.step === 'target' && e.target.matches('[data-q-input=q]')) { const first = S.h.el.querySelector('[data-q=toggle]'); if (first) { S.subjects.add(first.dataset.id); S.pickMore = false; draw(); } }
}
function pickType(type) {
  if (type === 'animal') { closeOv(S.h); import('../views/animals.js').then((m) => m.openAddAnimal()); return; }
  S.type = type; S.data = {};
  if (S.subjects.size) S.pickMore = false;
  draw();
}
function onClick(e) {
  const b = e.target.closest('[data-q]'); if (!b) return;
  const q = b.dataset.q, v = b.dataset.v;
  if (q === 'adv') { S.adv = !S.adv; return; }
  e.preventDefault();
  if (q === 'type') return pickType(v);
  if (q === 'clear-subj') { S.subjects.clear(); S.preset = false; return draw(); }
  if (q === 'filter') { S.filter = v; S.q = ''; return draw(); }
  if (q === 'toggle') { S.subjects.has(b.dataset.id) ? S.subjects.delete(b.dataset.id) : S.subjects.add(b.dataset.id); b.classList.toggle('on'); b.setAttribute('aria-pressed', S.subjects.has(b.dataset.id)); const f = S.h.el.querySelector('[data-q=targets-done]'); f.disabled = !S.subjects.size; S.h.el.querySelector('.qr-foot .muted').textContent = S.subjects.size ? `${S.subjects.size} selected` : 'Tap to select — select several for bulk care'; return; }
  if (q === 'select-all') { for (const id of candidates().list.map((a) => a.id)) S.subjects.add(id); S.pickMore = false; return draw(); }
  if (q === 'targets-done') { S.pickMore = false; return draw(); }
  if (q === 'back-target') { S.pickMore = true; S.preset = false; return draw(); }
  if (q === 'pick-subject') { S.pickMore = true; S.filter = 'recent'; return draw(); }
  if (q === 'step') { S.data.g = +(((S.data.g ?? lastWeight(store.get(), [...S.subjects][0]) ?? 0) + +v).toFixed(1)); return draw(); }
  if (q === 'eggs') { S.data.eggs = Math.max(0, (S.data.eggs ?? 2) + +v); return draw(); }
  if (q === 'obs') { S.data.title = v; return draw(); }
  if (q === 'sev') { S.data.severity = v; return draw(); }
  if (q === 'cycle') { S.cycle = v; return draw(); }
  if (q === 'rkind') { S.data.kind = v; return draw(); }
  if (q === 'due') { S.data.dueK = v; return draw(); }
  if (q === 'edit-last') { const r = A.lastOwnRecord(); closeOv(S.h); if (r) editRecordPanel(r.id); return; }
  if (q === 'repeat-last') { S.type = b.dataset.type; S.subjects = new Set([b.dataset.subject]); S.preset = true; return draw(); }
  if (q === 'save') return save({ refused: !!b.dataset.refused, incomplete: !!b.dataset.incomplete });
}
async function save({ refused = false, incomplete = false } = {}) {
  const ids = [...S.subjects], t = S.type, d = { ...S.data };
  let res;
  if (t === 'task') {
    if (!d.title?.trim()) return;
    const n = Date.now(), sod = startOfDay(n);
    const due = d.dueAt || { now: n + HOUR, today: sod + 18 * HOUR, tomorrow: sod + DAY + 9 * HOUR, '2d': sod + 2 * DAY + 9 * HOUR, week: sod + 7 * DAY + 9 * HOUR }[d.dueK || 'today'];
    A.addTask({ title: d.title.trim(), due: Math.max(due, n + 60e3), priority: d.priority, note: d.note, subject: ids[0] || null });
    res = { label: `Created task “${d.title.trim()}”` };
  } else {
    if (t === 'feeding') { if (refused) d.refused = true; if (d.supplement === 'none') { d.supplement = undefined; d.noSupplement = true; } }
    if (t === 'shed') d.complete = !incomplete;
    if (t === 'health') { if (d.followUp) d.followUp = startOfDay(Date.now()) + (+d.followUp) * DAY + 18 * HOUR; else delete d.followUp; const f = S.h.el.querySelector('[data-q-file]')?.files?.[0]; if (f) d.attachments = [{ name: f.name, kind: f.type.startsWith('image') ? 'image' : 'pdf', src: 'local' }]; d.kind = d.diagnosis ? 'diagnosis' : d.vet ? 'vet' : 'observation'; }
    if (t === 'repro') { d.cycle = S.cycle; d.label = `${REPRO_EV.find((x) => x[0] === d.kind)?.[1]}${d.kind === 'clutch' ? ` — ${d.eggs ?? 2} eggs` : ''}`; }
    if (t === 'weight' && (d.g == null || isNaN(d.g))) return;
    res = A.quickRecord(t, ids, d);
    store.mutate(null, (db) => { db.recent.animals = [...ids, ...db.recent.animals.filter((x) => !ids.includes(x))].slice(0, 12); }, { silent: true });
  }
  closeOv(S.h);
  done(res, { edit: res.records?.length === 1 ? () => editRecordPanel(res.records[0].id) : null });
}

/** Edit any record (correction) — drawer / bottom sheet. */
export function editRecordPanel(recordId) {
  const db = store.get(), r = db.records.find((x) => x.id === recordId); if (!r) return;
  const sub = subjectOf(db, r.subject, r.subjectKind);
  const body = `<div class="stack">
    <div class="qr-subj">${sub?.obj && sub.kind === 'animal' ? avatar(sub.obj, 42) : ''}<div><b>${esc(TYPE[r.type]?.label || r.type)} · <span class="code">${esc(sub?.code || '')}</span></b><span class="muted">${esc(r.source === 'quick' ? 'Quick Record' : r.source || '')} · ${new Date(r.t).toLocaleString()}</span></div></div>
    <label class="field"><span>Time</span><input type="datetime-local" data-e="t" value="${toLocalInput(r.t)}"></label>
    ${r.type === 'weight' ? `<label class="field"><span>Weight (g)</span><input type="number" step="0.1" data-e="g" value="${r.data.g ?? ''}"></label>` : ''}
    ${r.type === 'feeding' ? `<div class="grid2"><label class="field"><span>Feeder</span><input type="text" data-e="feeder" value="${esc(r.data.feeder || '')}"></label><label class="field"><span>Quantity</span><input type="text" data-e="qty" value="${esc(r.data.qty || '')}"></label></div>
      <div class="grid2"><label class="field"><span>Supplement</span><select data-e="supplement"><option value="">—</option>${Object.keys(SUPPLEMENTS).map((s) => `<option ${r.data.supplement === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="field row"><input type="checkbox" class="cb" data-e="refused" ${r.data.refused ? 'checked' : ''}><span>Refused</span></label></div>` : ''}
    <label class="field"><span>Note</span><textarea rows="3" data-e="note">${esc(r.data.note || '')}</textarea></label></div>`;
  const h = panel({ title: 'Edit record', sub: 'Corrections keep the same history entry', icon: 'edit', body, footer: `<button class="btn danger" data-e-del>${icon('trash')}Delete</button><span class="spacer"></span><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-e-save>${icon('check')}Save</button>` });
  h.el.querySelector('[data-e-save]').onclick = () => {
    const g = (k) => h.el.querySelector(`[data-e=${k}]`);
    const patch = { t: new Date(g('t').value).getTime(), data: { note: g('note').value } };
    if (g('g')) patch.data.g = +g('g').value;
    if (g('feeder')) Object.assign(patch.data, { feeder: g('feeder').value, qty: g('qty').value, supplement: g('supplement').value || undefined, refused: g('refused').checked });
    A.editRecord(recordId, patch); closeOv(h); done({ label: 'Record updated' });
  };
  h.el.querySelector('[data-e-del]').onclick = () => { A.deleteRecord(recordId); closeOv(h); done({ label: 'Record deleted' }); };
}
