// OPERATIONAL TIMELINE SYSTEM — one item model for every context (full Planner, dashboard compact, animal,
// reproduction, enclosure). Sources: care-plan occurrences, manual tasks, reproduction phases & milestones,
// clutch checks & hatch windows, health follow-ups, medication doses, stock reminders and completed history.
import { DAY, HOUR, MIN, startOfDay, dShort } from '../core/time.js';
import { SPECIES, latin } from '../data/species.js';
import { occurrences, rotationState, subjectOf, TYPE } from './ops.js';

const OVERDUE_GRACE = 30 * MIN;

function statusOf(st, t, nowTs) {
  if (st?.status === 'done') return 'done';
  if (st?.status === 'skipped') return 'skipped';
  if (st?.status === 'cancelled') return 'cancelled';
  return t < nowTs - OVERDUE_GRACE ? 'overdue' : 'open';
}

export function buildTimeline(db, { from, to, nowTs = Date.now(), includeHistory = true, subject = null, cycle = null, enclosure = null } = {}) {
  const items = [];
  const push = (it) => items.push(it);
  const encOfAnimal = (id) => db.animals.find((a) => a.id === id)?.enclosureId;

  // ---- care-plan occurrences
  for (const o of occurrences(db, from, to)) {
    const p = o.plan, s = subjectOf(db, p.subject, p.subjectKind);
    const status = statusOf(o.st, o.t, nowTs);
    const it = { id: o.id, src: 'occ', kind: 'occ', type: p.type, t: o.t, due: o.due, status, planId: p.id, subject: p.subject, subjectKind: p.subjectKind || 'animal', sub: s,
      title: p.title || TYPE[p.type]?.label || p.type, origin: p.auto ? 'auto' : 'care-plan', group: p.group ? `${p.group}@${o.t}` : null,
      why: `Generated from: ${p.protocol || 'care plan'} · every ${p.every === 1 ? 'day' : `${p.every} days`}${p.times.length > 1 ? ` · ${p.times.map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`).join(', ')}` : ''}${p.auto ? ` · executed by ${p.auto}` : ''}`,
      postponed: o.st?.status === 'postponed', recordId: o.st?.recordId, doneAt: o.st?.at, note: o.st?.note };
    if (p.type === 'feeding') {
      const rs = rotationState(db, p); it.meta = { feeder: p.feeder, qty: p.qty, supplement: status === 'done' ? db.records.find((r) => r.id === o.st?.recordId)?.data?.supplement : rs.next, rotation: rs, refused: db.records.find((r) => r.id === o.st?.recordId)?.data?.refused };
    }
    if (p.type === 'weight') it.meta = { last: lastW(db, p.subject) };
    it.enclosure = it.subjectKind === 'enclosure' ? p.subject : encOfAnimal(p.subject);
    push(it);
  }
  // ---- manual tasks
  for (const k of db.tasks) {
    if (k.status === 'deleted') continue;
    const t = k.postponedTo || k.due; if (t < from || t >= to) continue;
    const status = k.status === 'done' ? 'done' : k.status === 'skipped' ? 'skipped' : k.status === 'cancelled' ? 'cancelled' : t < nowTs - OVERDUE_GRACE ? 'overdue' : 'open';
    push({ id: k.id, src: 'task', kind: 'task', type: k.kind || 'task', t, due: k.due, status, subject: k.subject, subjectKind: k.subjectKind || (k.subject?.startsWith('e_') ? 'enclosure' : 'animal'), sub: subjectOf(db, k.subject, k.subjectKind), title: k.title, note: k.note, priority: k.priority, origin: k.origin === 'reproduction' ? 'reproduction' : 'manual', why: k.origin === 'reproduction' ? 'Created from a reproduction cycle' : 'Manual task', postponed: !!k.postponedTo, doneAt: k.doneAt, enclosure: k.subjectKind === 'enclosure' ? k.subject : encOfAnimal(k.subject) });
  }
  // ---- reproduction: phases (spans), milestones, next actions
  for (const cy of db.cycles) {
    if (cy.status !== 'active' && !cycle) continue;
    const sp = SPECIES[cy.species];
    for (const [i, ph] of cy.phases.entries()) {
      const end = ph.end ?? ph.start;
      if (end < from || ph.start >= to) continue;
      const isMs = ph.milestone || ph.start === end;
      push({ id: `ph:${cy.id}:${i}`, src: 'cycle', kind: isMs ? 'milestone' : 'phase', type: ph.key === 'incubation' || ph.key === 'hatch' ? 'incubation' : 'repro', t: ph.start, end, status: isMs ? (ph.observed ? 'done' : ph.start < nowTs ? 'overdue' : 'open') : 'span',
        subject: cy.female, subjectKind: 'animal', sub: subjectOf(db, cy.female), title: ph.label, cycle: cy.id, cycleName: cy.name, expected: !!ph.expected, planned: !!ph.planned, basis: ph.basis || (Array.isArray(ph.expected) ? `${ph.expected[0]}–${ph.expected[1]} d` : ''),
        origin: 'reproduction', why: `${cy.name} · ${latin(sp)}${ph.basis ? ` · expected ${ph.basis}` : ''}` });
    }
    if (cy.next && cy.status === 'active' && cy.next.due >= from && cy.next.due < to) {
      const st = db.occ[`next:${cy.id}:${cy.next.due}`];
      push({ id: `next:${cy.id}:${cy.next.due}`, src: 'cycle-next', kind: 'occ', type: 'repro', t: st?.status === 'postponed' ? st.to : cy.next.due, due: cy.next.due, status: statusOf(st, st?.status === 'postponed' ? st.to : cy.next.due, nowTs), subject: cy.female, subjectKind: 'animal', sub: subjectOf(db, cy.female), title: cy.next.label, cycle: cy.id, cycleName: cy.name, origin: 'reproduction', why: `Next step of ${cy.name}`, doneAt: st?.at });
    }
  }
  // ---- clutches: check schedule + expected hatch windows
  for (const cl of db.clutches) {
    if (cl.status === 'hatched' && !cycle) continue;
    const dayN = Math.floor((nowTs - cl.laid) / DAY);
    const w0 = cl.laid + cl.expected[0] * DAY, w1 = cl.laid + cl.expected[1] * DAY;
    if (w1 >= from && w0 < to) push({ id: `hatch:${cl.id}`, src: 'clutch', kind: 'phase', type: 'incubation', t: w0, end: w1, status: 'span', expected: true, subject: cl.female, subjectKind: 'animal', sub: subjectOf(db, cl.female), title: `Expected hatch · ${cl.code}`, clutch: cl.id, cycle: cl.cycleId, basis: `day ${cl.expected[0]}–${cl.expected[1]}`, origin: 'reproduction', why: `${cl.code}: ${SPECIES[cl.species].repro.note}` });
    if (cl.status === 'incubating') {
      for (let t = cl.lastCheck + cl.checkEvery * DAY; t < to; t += cl.checkEvery * DAY) {
        const id = `chk:${cl.id}:${startOfDay(t)}`, st = db.occ[id], tt = st?.status === 'postponed' ? st.to : startOfDay(t) + 9.5 * HOUR;
        if (tt < from) continue;
        push({ id, src: 'clutch-check', kind: 'occ', type: 'incubation', t: tt, due: startOfDay(t) + 9.5 * HOUR, status: statusOf(st, tt, nowTs), subject: cl.female, subjectKind: 'animal', sub: subjectOf(db, cl.female), title: `Incubation check · ${cl.code}`, clutch: cl.id, cycle: cl.cycleId, enclosure: cl.incubator,
          meta: { day: Math.floor((tt - cl.laid) / DAY), expected: cl.expected, eggs: cl.eggs, fertile: cl.fertile }, origin: 'reproduction', why: `Clutch check every ${cl.checkEvery} d · incubator ${cl.temp} °C`, doneAt: st?.at });
        if (t > nowTs + 60 * DAY) break;
      }
      for (const r of db.records) if (r.type === 'incubation' && r.data?.clutch === cl.id && r.t >= from && r.t < to && includeHistory && !r.occId) push(recordItem(db, r));
    }
  }
  // ---- health follow-ups
  for (const h of db.health) {
    if (!h.followUp || h.resolved) continue;
    if (h.followUp < from || h.followUp >= to) continue;
    const st = db.occ[`fu:${h.id}`];
    const t = st?.status === 'postponed' ? st.to : h.followUp;
    push({ id: `fu:${h.id}`, src: 'followup', kind: 'occ', type: 'health', t, due: h.followUp, status: statusOf(st, t, nowTs), subject: h.animal, subjectKind: 'animal', sub: subjectOf(db, h.animal), title: `Follow-up · ${h.title}`, health: h.id, origin: 'manual', why: `Follow-up scheduled in health record (${dShort(h.t)})`, severity: h.severity, doneAt: st?.at, enclosure: encOfAnimal(h.animal) });
  }
  // ---- medication doses
  for (const m of db.meds) {
    for (let i = 0; i < m.count; i++) {
      const due = m.from + i * m.everyH * HOUR, id = `dose:${m.id}:${i}`, st = db.occ[id];
      const t = st?.status === 'postponed' ? st.to : due;
      if (t < from || t >= to) continue;
      const status = i < m.done ? 'done' : statusOf(st, t, nowTs);
      push({ id, src: 'dose', kind: 'occ', type: 'medication', t, due, status, subject: m.animal, subjectKind: 'animal', sub: subjectOf(db, m.animal), title: `${m.drug}`, meta: { dose: m.dose, amount: m.amount, route: m.route, n: i + 1, of: m.count }, med: m.id, origin: 'manual', why: `Medication course · every ${m.everyH} h × ${m.count}`, doneAt: st?.at, enclosure: encOfAnimal(m.animal) });
    }
  }
  // ---- stock reminder (one actionable item per day, today)
  const low = db.inventory.filter((x) => x.qty < x.min);
  const today = startOfDay(nowTs) + 12 * HOUR;
  if (low.length && today >= from && today < to) {
    const st = db.occ[`stock:${startOfDay(nowTs)}`];
    push({ id: `stock:${startOfDay(nowTs)}`, src: 'stock', kind: 'occ', type: 'inventory', t: st?.status === 'postponed' ? st.to : today, due: today, status: statusOf(st, today, nowTs + OVERDUE_GRACE * 10), title: `Low stock · ${low.length} items`, meta: { items: low.map((x) => x.id) }, origin: 'auto', why: 'Automatic: stock below minimum level', doneAt: st?.at });
  }
  // ---- history records not tied to a scheduled occurrence (quick records, repro events, health notes)
  if (includeHistory) {
    for (const r of db.records) {
      if (r.t < from || r.t >= to || r.occId || r.hidden) continue;
      if (r.source === 'history' && r.type === 'weight') continue; // long-term weight history lives in the profile chart
      push(recordItem(db, r));
    }
  }
  // ---- context filters
  let out = items;
  if (subject) { const grp = db.animals.find((a) => a.id === subject); out = out.filter((x) => x.subject === subject || x.enclosure === grp?.enclosureId && x.subjectKind === 'enclosure'); }
  if (cycle) { const cy = db.cycles.find((c) => c.id === cycle); out = out.filter((x) => x.cycle === cycle || (cy && x.clutch && db.clutches.find((c) => c.id === x.clutch)?.cycleId === cycle) || (cy && (x.subject === cy.female || x.subject === cy.male) && ['repro', 'incubation'].includes(x.type))); }
  if (enclosure) { const ids = new Set(db.animals.filter((a) => a.enclosureId === enclosure).map((a) => a.id)); out = out.filter((x) => x.enclosure === enclosure || x.subject === enclosure || ids.has(x.subject)); }
  return out.sort((a, b) => a.t - b.t || (a.kind === 'phase') - (b.kind === 'phase'));
}

function lastW(db, id) { for (let i = db.records.length - 1; i >= 0; i--) { const r = db.records[i]; if (r.subject === id && r.type === 'weight') return r.data.g; } return db.animals.find((a) => a.id === id)?.weightG; }

export function recordItem(db, r) {
  const T = TYPE[r.type] || TYPE.note;
  let title = T.label;
  if (r.type === 'repro') title = r.data?.label || 'Reproduction event';
  if (r.type === 'health') title = r.data?.title || 'Health record';
  if (r.type === 'feeding' && r.data?.refused) title = 'Feeding refused';
  if (r.type === 'shed') title = r.data?.complete === false ? 'Shed — incomplete' : 'Shed';
  if (r.type === 'note') title = r.data?.text?.slice(0, 60) || 'Note';
  if (r.type === 'incubation') title = `Incubation check${r.data?.code ? ` · ${r.data.code}` : ''}`;
  return { id: `rec:${r.id}`, src: 'record', kind: 'record', type: r.type, t: r.t, status: 'done', subject: r.subject, subjectKind: r.subjectKind || 'animal', sub: subjectOf(db, r.subject, r.subjectKind), title, recordId: r.id, record: r, origin: r.source === 'automation' ? 'auto' : r.source === 'quick' ? 'manual' : 'manual', why: r.source === 'quick' ? 'Unscheduled — recorded with Quick Record' : r.source === 'history' ? 'Imported history' : 'Recorded', doneAt: r.t,
    meta: r.type === 'feeding' ? { feeder: r.data?.feeder, qty: r.data?.qty, supplement: r.data?.supplement, refused: r.data?.refused } : r.type === 'weight' ? { g: r.data?.g } : null };
}

/** Group compatible open work: same group key & time → one card ("Feeding ×8"). */
export function groupItems(items) {
  const out = [], groups = new Map();
  for (const it of items) {
    if (it.group && it.kind === 'occ') {
      let g = groups.get(it.group);
      if (!g) { g = { id: `grp:${it.group}`, kind: 'group', type: it.type, t: it.t, items: [], group: it.group, origin: it.origin }; groups.set(it.group, g); out.push(g); }
      g.items.push(it);
    } else out.push(it);
  }
  // a group of one is just the item
  return out.map((x) => (x.kind === 'group' && x.items.length === 1 ? x.items[0] : x)).map((x) => {
    if (x.kind !== 'group') return x;
    const open = x.items.filter((i) => i.status === 'open' || i.status === 'overdue');
    x.status = open.length === 0 ? (x.items.every((i) => i.status === 'skipped') ? 'skipped' : 'done') : open.some((i) => i.status === 'overdue') ? 'overdue' : 'open';
    x.count = x.items.reduce((s, i) => s + (i.sub?.count || 1), 0);
    const sup = {}; for (const i of x.items) if (i.meta?.supplement) sup[i.meta.supplement] = (sup[i.meta.supplement] || 0) + 1;
    x.supplement = Object.entries(sup).sort((a, b) => b[1] - a[1])[0]?.[0];
    x.feeder = x.items[0].meta?.feeder;
    x.why = x.items[0].why;
    x.openCount = open.length;
    return x;
  });
}

export const isOpen = (it) => it.status === 'open' || it.status === 'overdue';
export const FILTERS = {
  all: () => true,
  care: (it) => ['feeding', 'water', 'misting', 'cleaning', 'weight', 'shed'].includes(it.type),
  feeding: (it) => it.type === 'feeding',
  health: (it) => ['health', 'medication'].includes(it.type),
  repro: (it) => ['repro', 'incubation'].includes(it.type),
  enclosures: (it) => it.subjectKind === 'enclosure' || it.subjectKind === 'assembly' || it.type === 'maintenance',
  manual: (it) => it.origin === 'manual',
  auto: (it) => it.origin === 'auto' || it.origin === 'care-plan',
};
