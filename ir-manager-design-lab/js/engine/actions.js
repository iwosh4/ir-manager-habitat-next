// Actions layer — the ONLY place that changes operational data. Every interface (Planner, Tasks, Dashboard
// widgets, Animal Profile, Quick Record, Reproduction, voice/command line) calls these functions, so a feeding
// completed anywhere produces the same record, the same supplement rotation step and the same stock movement.
import * as store from '../core/store.js';
import { DAY, HOUR, MIN, startOfDay, dayKey } from '../core/time.js';
import { occurrences, recordFromOcc, rotationState, subjectOf, TYPE } from './ops.js';
import { buildTimeline } from './timeline.js';

const rid = (p = 'r') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Resolve timeline item ids → live items (from a window around now). */
export function resolve(ids) {
  const db = store.get(), n = Date.now();
  // Fast path: almost every action targets something near "now" — build a narrow window first (≈10× cheaper),
  // widen to the full range (incl. history) only for ids not found there.
  const due = ids.map((id) => +String(id).split('@')[1]).filter(Number.isFinite);
  const lo = Math.min(n - 4 * DAY, ...due.map((t) => t - DAY)), hi = Math.max(n + 15 * DAY, ...due.map((t) => t + DAY));
  let m = new Map(buildTimeline(db, { from: lo, to: hi, includeHistory: false }).map((i) => [i.id, i]));
  if (ids.some((id) => !m.has(id))) m = new Map(buildTimeline(db, { from: n - 45 * DAY, to: n + 400 * DAY, includeHistory: true }).map((i) => [i.id, i]));
  return ids.map((id) => m.get(id)).filter(Boolean);
}

function stockMove(db, itemId, delta, reason, ref) {
  const it = db.inventory.find((x) => x.id === itemId); if (!it) return;
  it.qty = Math.max(0, +(it.qty + delta).toFixed(2));
  db.stock.unshift({ id: rid('s'), t: Date.now(), item: itemId, delta, reason, ref });
}

function completeOne(db, it, opts, nowTs) {
  const refused = opts.refused?.has(it.subject) || opts.refused?.has(it.id);
  const t = opts.t || nowTs;
  if (it.src === 'occ') {
    const plan = db.plans.find((p) => p.id === it.planId);
    const r = recordFromOcc(db, { id: it.id, plan }, { t, refused, g: opts.g, note: opts.note, supplement: opts.supplement, qty: opts.qty, feeder: opts.feeder });
    r.source = opts.source || 'planner'; db.records.push(r);
    db.occ[it.id] = { status: 'done', at: t, recordId: r.id, by: 'you' };
    if (plan.type === 'feeding' && plan.stockItem && !refused) stockMove(db, plan.stockItem, -(plan.qtyN || 1), `Feeding · ${it.sub?.code || ''}`, r.id);
    if (plan.type === 'weight' && opts.g != null) { const a = db.animals.find((x) => x.id === plan.subject); if (a) a.weightG = opts.g; }
    return r;
  }
  if (it.src === 'task') { const k = db.tasks.find((x) => x.id === it.id); if (k) { k.status = 'done'; k.doneAt = t; } return null; }
  if (it.src === 'cycle-next') {
    const cy = db.cycles.find((c) => c.id === it.cycle);
    const r = { id: rid(), t, type: 'repro', subject: it.subject, data: { cycle: it.cycle, kind: 'confirm', label: `${it.title} — confirmed` }, source: opts.source || 'planner', by: 'you' };
    db.records.push(r); db.occ[it.id] = { status: 'done', at: t, recordId: r.id };
    if (cy) { cy.events.push({ t, type: 'confirm', label: `${it.title} — confirmed` }); advanceCycle(cy, t); }
    return r;
  }
  if (it.src === 'cycle' && it.kind === 'milestone') {
    const cy = db.cycles.find((c) => c.id === it.cycle); const idx = +it.id.split(':')[2];
    if (cy?.phases[idx]) { cy.phases[idx].observed = true; cy.phases[idx].start = t; cy.phases[idx].end = t; cy.events.push({ t, type: cy.phases[idx].key, label: `${cy.phases[idx].label} — observed` }); }
    const r = { id: rid(), t, type: 'repro', subject: it.subject, data: { cycle: it.cycle, kind: cy?.phases[idx]?.key, label: `${it.title} — observed` }, source: opts.source || 'planner', by: 'you' };
    db.records.push(r); return r;
  }
  if (it.src === 'clutch-check') {
    const cl = db.clutches.find((c) => c.id === it.clutch);
    const r = { id: rid(), t, type: 'incubation', subject: it.subject, data: { clutch: cl.id, code: cl.code, day: Math.floor((t - cl.laid) / DAY), note: opts.note || 'All eggs OK', fertile: cl.fertile }, source: opts.source || 'planner', by: 'you', occId: it.id };
    db.records.push(r); db.occ[it.id] = { status: 'done', at: t, recordId: r.id }; cl.lastCheck = t;
    return r;
  }
  if (it.src === 'followup') {
    const h = db.health.find((x) => x.id === it.health);
    const r = { id: rid(), t, type: 'health', subject: it.subject, data: { health: h?.id, title: `Follow-up — ${h?.title}`, severity: 'info', note: opts.note || 'Checked' }, source: opts.source || 'planner', by: 'you', occId: it.id };
    db.records.push(r); db.occ[it.id] = { status: 'done', at: t, recordId: r.id };
    return r;
  }
  if (it.src === 'dose') {
    const m = db.meds.find((x) => x.id === it.med); if (m) m.done = Math.max(m.done, it.meta.n);
    const r = { id: rid(), t, type: 'medication', subject: it.subject, data: { med: m?.id, drug: m?.drug, dose: m?.dose, n: it.meta.n }, source: opts.source || 'planner', by: 'you', occId: it.id };
    db.records.push(r); db.occ[it.id] = { status: 'done', at: t, recordId: r.id };
    return r;
  }
  if (it.src === 'stock') { db.occ[it.id] = { status: 'done', at: t }; return null; }
  return null;
}
function advanceCycle(cy, t) {
  // simple forward rules for the demo protocols
  const lbl = cy.next?.label || '';
  if (/pre-lay shed/i.test(lbl)) { const i = cy.phases.findIndex((p) => p.key === 'prelay'); if (i >= 0) { cy.phases[i] = { ...cy.phases[i], label: 'Pre-lay shed', start: t, end: t, milestone: true, observed: true, expected: false }; } const lay = cy.phases.find((p) => p.key === 'lay'); if (lay) { lay.start = t + 25 * DAY; lay.end = t + 35 * DAY; } const inc = cy.phases.find((p) => p.key === 'incubation'); if (inc) { inc.start = t + 35 * DAY; inc.end = t + 95 * DAY; } cy.next = { label: 'Prepare laying box', due: startOfDay(t) + 20 * DAY + 19 * HOUR }; return; }
  if (/lay box|laying box/i.test(lbl)) { cy.next = { label: 'Check for clutch', due: startOfDay(t) + DAY + 8 * HOUR }; return; }
  if (/incubator/i.test(lbl)) { cy.next = { label: 'Check eggs (fungus / development)', due: startOfDay(t) + 3 * DAY + 9 * HOUR }; return; }
  if (/hatch window/i.test(lbl)) { cy.next = { label: 'Check for pipping', due: startOfDay(t) + DAY + 9 * HOUR }; return; }
  cy.next = null;
}

const SUMMARY = (items) => { const t = items[0]?.type; const n = items.length; return `${n > 1 ? `${n}× ` : ''}${(TYPE[t]?.label || 'Item').toLowerCase()}`; };

/** Complete one or many items. opts: { refused:Set(subjectIds|itemIds), g, note, supplement, t, source } */
export function complete(ids, opts = {}) {
  const items = resolve([].concat(ids)).filter((i) => i.status === 'open' || i.status === 'overdue' || (i.kind === 'milestone' && i.status !== 'done'));
  if (!items.length) return null;
  const nRef = items.filter((i) => opts.refused?.has(i.subject) || opts.refused?.has(i.id)).length;
  const label = `Recorded ${SUMMARY(items)}${nRef ? ` (${nRef} refused)` : ''}`;
  const nowTs = Date.now();
  const recs = store.mutate(label, (db) => items.map((it) => completeOne(db, it, opts, nowTs)).filter(Boolean));
  return { label, count: items.length, records: recs };
}
export function skip(ids, reason = '') {
  const items = resolve([].concat(ids)).filter((i) => i.status === 'open' || i.status === 'overdue');
  if (!items.length) return null;
  const label = `Skipped ${SUMMARY(items)}`;
  store.mutate(label, (db) => { for (const it of items) { if (it.src === 'task') { const k = db.tasks.find((x) => x.id === it.id); k.status = 'skipped'; k.doneAt = Date.now(); } else db.occ[it.id] = { status: 'skipped', at: Date.now(), reason }; } });
  return { label };
}
export function cancel(ids) {
  const items = resolve([].concat(ids)); if (!items.length) return null;
  const label = `Cancelled ${SUMMARY(items)}`;
  store.mutate(label, (db) => { for (const it of items) { if (it.src === 'task') { const k = db.tasks.find((x) => x.id === it.id); k.status = 'cancelled'; } else db.occ[it.id] = { status: 'cancelled', at: Date.now() }; } });
  return { label };
}
/** Postpone: to = absolute ts, or preset '1h' | 'later' | 'tomorrow' | '2d' */
export function postponeTarget(preset, from = Date.now(), due = from) {
  const base = Math.max(from, due);
  if (preset === '1h') return base + HOUR;
  if (preset === 'later') { const d = new Date(from); const h = d.getHours(); return startOfDay(from) + Math.min(21, Math.max(h + 3, 17)) * HOUR; }
  if (preset === 'tomorrow') { const d = new Date(due); return startOfDay(from) + DAY + d.getHours() * HOUR + d.getMinutes() * MIN; }
  if (preset === '2d') { const d = new Date(due); return startOfDay(from) + 2 * DAY + d.getHours() * HOUR + d.getMinutes() * MIN; }
  return +preset;
}
export function postpone(ids, preset) {
  const items = resolve([].concat(ids)).filter((i) => i.status === 'open' || i.status === 'overdue');
  if (!items.length) return null;
  const to = postponeTarget(preset, Date.now(), items[0].due || items[0].t);
  const label = `Postponed ${SUMMARY(items)}`;
  store.mutate(label, (db) => { for (const it of items) { if (it.src === 'task') { const k = db.tasks.find((x) => x.id === it.id); k.postponedTo = to; } else db.occ[it.id] = { status: 'postponed', to, from: it.due, at: Date.now() }; } });
  return { label, to };
}
/** Re-open a completed / skipped item (correction). Removes the linked record and restores stock. */
export function reopen(id) {
  const [it] = resolve([id]); if (!it) return null;
  const label = `Re-opened ${(TYPE[it.type]?.label || 'item').toLowerCase()}`;
  store.mutate(label, (db) => {
    if (it.src === 'task') { const k = db.tasks.find((x) => x.id === it.id); k.status = 'open'; delete k.doneAt; return; }
    const st = db.occ[it.id];
    if (st?.recordId) { db.records = db.records.filter((r) => r.id !== st.recordId); const mv = db.stock.filter((s) => s.ref === st.recordId); for (const s of mv) { const inv = db.inventory.find((x) => x.id === s.item); if (inv) inv.qty = +(inv.qty - s.delta).toFixed(2); } db.stock = db.stock.filter((s) => s.ref !== st.recordId); }
    if (it.src === 'dose') { const m = db.meds.find((x) => x.id === it.med); if (m) m.done = Math.min(m.done, it.meta.n - 1); }
    delete db.occ[it.id];
  });
  return { label };
}
export function setNote(id, note) {
  const [it] = resolve([id]); if (!it) return;
  store.mutate('Edited note', (db) => {
    if (it.src === 'task') { db.tasks.find((x) => x.id === it.id).note = note; return; }
    if (it.recordId) { const r = db.records.find((x) => x.id === it.recordId); if (r) r.data.note = note; }
    db.occ[it.id] = { ...(db.occ[it.id] || { status: 'open' }), note };
    if (db.occ[it.id].status === 'open') db.occ[it.id].status = undefined;
  });
}
/** Reschedule to an exact time (inline editing of date/time). */
export function reschedule(id, ts) { return postpone([id], ts); }

/** Quick Record: record for subjects; fulfils today's open scheduled occurrence of the same type if there is one. */
export function quickRecord(type, subjects, data = {}) {
  const db = store.get(), nowTs = Date.now();
  const open = buildTimeline(db, { from: startOfDay(nowTs) - DAY, to: startOfDay(nowTs) + DAY + 12 * HOUR, includeHistory: false }).filter((i) => i.kind === 'occ' && i.type === type && (i.status === 'open' || i.status === 'overdue'));
  const fulfil = [], extra = [];
  for (const s of subjects) { const o = open.find((i) => i.subject === s && !fulfil.includes(i)); if (o && !data.unscheduled) fulfil.push(o); else extra.push(s); }
  const label = `Recorded ${subjects.length > 1 ? `${subjects.length}× ` : ''}${(TYPE[type]?.label || type).toLowerCase()}${data.refused ? ' (refused)' : ''}`;
  const recs = store.mutate(label, (d) => {
    const out = [];
    for (const it of fulfil) out.push(completeOne(d, it, { refused: data.refused ? new Set([it.subject]) : null, g: data.g, note: data.note, supplement: data.supplement, qty: data.qty, feeder: data.feeder, source: 'quick' }, nowTs));
    for (const s of extra) {
      const sub = subjectOf(d, s);
      const r = { id: rid(), t: data.t || nowTs, type, subject: s, subjectKind: sub?.kind || 'animal', data: { ...data }, source: 'quick', by: 'you' };
      delete r.data.t; delete r.data.unscheduled;
      if (type === 'feeding' && !data.refused) {
        const plan = d.plans.find((p) => p.type === 'feeding' && p.subject === s);
        if (plan) { const rs = rotationState(d, plan); r.planId = plan.id; r.data.feeder ||= plan.feeder; r.data.qty ||= plan.qty; if (rs.next && !r.data.supplement) r.data.supplement = rs.next; if (plan.stockItem) stockMove(d, plan.stockItem, -(plan.qtyN || 1), `Feeding · ${sub?.code || ''}`, r.id); }
      }
      if (type === 'weight' && data.g != null) { const a = d.animals.find((x) => x.id === s); if (a) a.weightG = data.g; }
      if (type === 'health' && data.title) { const h = { id: rid('h'), t: r.t, animal: s, kind: data.kind || 'observation', title: data.title, severity: data.severity || 'info', notes: data.note || '', resolved: false, followUp: data.followUp || null, attachments: data.attachments || [], vet: data.vet || null, diagnosis: data.diagnosis || '' }; d.health.unshift(h); r.data.health = h.id; }
      if (type === 'repro' && data.cycle) { const cy = d.cycles.find((c) => c.id === data.cycle); if (cy) cy.events.push({ t: r.t, type: data.kind || 'note', label: data.label || 'Event' }); }
      d.records.push(r); out.push(r);
    }
    d.records.sort((a, b) => a.t - b.t);
    return out;
  });
  return { label, records: recs, fulfilled: fulfil.length };
}
export function editRecord(recordId, patch) {
  store.mutate('Edited record', (db) => { const r = db.records.find((x) => x.id === recordId); if (!r) return; if (patch.t) r.t = patch.t; Object.assign(r.data, patch.data || {}); if (r.type === 'weight' && patch.data?.g != null) { const a = db.animals.find((x) => x.id === r.subject); if (a) a.weightG = patch.data.g; } });
}
export function deleteRecord(recordId) {
  store.mutate('Deleted record', (db) => { const r = db.records.find((x) => x.id === recordId); db.records = db.records.filter((x) => x.id !== recordId); for (const [k, v] of Object.entries(db.occ)) if (v.recordId === recordId) delete db.occ[k]; const mv = db.stock.filter((s) => s.ref === recordId); for (const s of mv) { const inv = db.inventory.find((x) => x.id === s.item); if (inv) inv.qty = +(inv.qty - s.delta).toFixed(2); } db.stock = db.stock.filter((s) => s.ref !== recordId); return r; });
}
export function lastOwnRecord() { const db = store.get(); for (let i = db.records.length - 1; i >= 0; i--) if (db.records[i].by === 'you') return db.records[i]; return null; }

// ------------------------------------------------------------------ tasks
export function addTask(o) {
  const id = rid('k');
  store.mutate(`Created task “${o.title}”`, (db) => { db.tasks.push({ id, type: 'task', status: 'open', priority: o.priority || 'normal', origin: 'manual', created: Date.now(), due: o.due || Date.now() + HOUR, title: o.title, note: o.note || '', subject: o.subject || null, subjectKind: o.subjectKind || (o.subject?.startsWith('e_') ? 'enclosure' : o.subject ? 'animal' : null), kind: o.kind || 'task' }); });
  return id;
}
export function updateTask(id, patch, label = 'Edited task') { store.mutate(label, (db) => { const k = db.tasks.find((x) => x.id === id); if (k) Object.assign(k, patch); }); }
export function deleteTask(id) { store.mutate('Deleted task', (db) => { const k = db.tasks.find((x) => x.id === id); if (k) k.status = 'deleted'; }); }
/** Inline edit of a plan-generated occurrence: quantity / supplement override for this occurrence only. */
export function setOccOverride(id, patch) { store.mutate('Edited occurrence', (db) => { db.occ[id] = { ...(db.occ[id] || {}), ...patch }; }); }

// ------------------------------------------------------------------ inventory helpers used by widgets / tools
export function adjustStock(itemId, delta, reason = 'Stock count') { store.mutate(`${delta > 0 ? 'Added' : 'Removed'} stock`, (db) => stockMove(db, itemId, delta, reason, null)); }
export function setStock(itemId, qty) { store.mutate('Stock count', (db) => { const it = db.inventory.find((x) => x.id === itemId); if (!it) return; stockMove(db, itemId, qty - it.qty, 'Stock count', null); }); }
export const todayKey = () => dayKey(Date.now());
