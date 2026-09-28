// Pure operational model: care-plan occurrences, supplement rotation, record construction, subject lookup.
// No UI and no store access — used by the store (history seeding), the timeline and the actions layer.
import { DAY, HOUR, MIN, startOfDay } from '../core/time.js';
import { SPECIES } from '../data/species.js';

export const TYPE = {
  feeding: { label: 'Feeding', icon: 'feed', color: 'var(--c-feed)', verb: 'Fed', done: 'FED' },
  water: { label: 'Water', icon: 'water', color: 'var(--c-water)', verb: 'Water changed', done: 'DONE' },
  misting: { label: 'Misting', icon: 'mist', color: 'var(--c-mist)', verb: 'Misted', done: 'DONE' },
  cleaning: { label: 'Cleaning', icon: 'clean', color: 'var(--c-clean)', verb: 'Cleaned', done: 'DONE' },
  weight: { label: 'Weight', icon: 'weight', color: 'var(--c-weight)', verb: 'Weighed', done: 'SAVE' },
  shed: { label: 'Shed', icon: 'shed', color: 'var(--c-shed)', verb: 'Shed recorded', done: 'SHED' },
  health: { label: 'Health', icon: 'health', color: 'var(--c-health)', verb: 'Health note', done: 'SAVE' },
  medication: { label: 'Medication', icon: 'pill', color: 'var(--c-med)', verb: 'Dose given', done: 'GIVEN' },
  repro: { label: 'Reproduction', icon: 'repro', color: 'var(--c-repro)', verb: 'Event recorded', done: 'CONFIRM' },
  incubation: { label: 'Incubation', icon: 'thermo', color: 'var(--c-incub)', verb: 'Checked', done: 'CHECK' },
  maintenance: { label: 'Maintenance', icon: 'wrench', color: 'var(--c-encl)', verb: 'Done', done: 'DONE' },
  inventory: { label: 'Inventory', icon: 'inventory', color: 'var(--c-inv)', verb: 'Done', done: 'DONE' },
  note: { label: 'Note', icon: 'note', color: 'var(--c-note)', verb: 'Note', done: 'SAVE' },
  task: { label: 'Task', icon: 'tasks', color: 'var(--c-task)', verb: 'Done', done: 'DONE' },
};

/** Subject lookup: animal / enclosure / assembly */
export function subjectOf(db, id, kind) {
  if (!id) return null;
  if (kind === 'enclosure' || id.startsWith('e_')) { const e = db.enclosures.find((x) => x.id === id); return e && { kind: 'enclosure', id, code: e.code, name: e.name, obj: e }; }
  if (kind === 'assembly' || id.startsWith('as_')) { const a = db.assemblies.find((x) => x.id === id); return a && { kind: 'assembly', id, code: a.name, name: a.name, obj: a }; }
  const a = db.animals.find((x) => x.id === id); if (!a) return null;
  const sp = SPECIES[a.species];
  return { kind: 'animal', id, code: a.code, name: a.name, obj: a, species: sp, count: a.kind === 'group' ? a.count : 1 };
}

/** Next supplement for a feeding plan = position in the rotation from the number of accepted feedings. */
export function rotationState(db, plan) {
  const rot = plan.rotation || ['—'];
  if (rot.length <= 1 || rot[0] === '—') return { rot, index: 0, next: null, last: null };
  const fed = db.records.filter((r) => r.planId === plan.id && r.type === 'feeding' && !r.data?.refused);
  const index = fed.length % rot.length;
  const last = fed.length ? fed[fed.length - 1].data?.supplement : null;
  return { rot, index, next: rot[index], last, after: rot[(index + 1) % rot.length], count: fed.length };
}

/** Occurrences of all active plans with due time in [from, to). Effective time honours postponement. */
export function occurrences(db, from, to) {
  const out = [];
  const margin = 21 * DAY; // postponed occurrences may move into the window
  for (const plan of db.plans) {
    if (!plan.active) continue;
    const anchor = startOfDay(plan.anchor), step = plan.every * DAY;
    const k0 = Math.max(0, Math.floor((from - margin - anchor) / step)), k1 = Math.ceil((to + margin - anchor) / step);
    for (let k = k0; k <= k1; k++) {
      const day = anchor + k * step;
      for (const [h, m] of plan.times) {
        const due = day + h * HOUR + m * MIN;
        const id = `${plan.id}@${due}`;
        const st = db.occ[id];
        const t = st?.status === 'postponed' ? st.to : due;
        if (t < from || t >= to) continue;
        out.push({ id, plan, due, t, st });
      }
    }
  }
  return out;
}

export function recordFromOcc(db, o, extra = {}) {
  const p = o.plan, type = p.type === 'incubation' ? 'incubation' : p.type;
  const data = {};
  if (type === 'feeding') {
    const rs = rotationState(db, p);
    data.feeder = extra.feeder || p.feeder; data.qty = extra.qty || p.qty;
    if (extra.refused) data.refused = true;
    else if (rs.next) data.supplement = extra.supplement || rs.next;
  }
  if (extra.note) data.note = extra.note;
  if (extra.g != null) data.g = extra.g;
  return { id: `r_${o.id}_${Math.random().toString(36).slice(2, 6)}`, t: extra.t || Date.now(), type, subject: p.subject, subjectKind: p.subjectKind || 'animal', planId: p.id, occId: o.id, data, by: extra.by || 'you' };
}

/** Latest record of a type for a subject. */
export function lastRecord(db, subject, type, pred) {
  for (let i = db.records.length - 1; i >= 0; i--) { const r = db.records[i]; if (r.subject === subject && r.type === type && (!pred || pred(r))) return r; }
  return null;
}
export function lastWeight(db, id) { return lastRecord(db, id, 'weight')?.data?.g ?? db.animals.find((a) => a.id === id)?.weightG ?? null; }

/** Next open occurrence for a subject (+type). */
export function nextOcc(db, subject, type, nowTs = Date.now()) {
  const occ = occurrences(db, nowTs - 3 * DAY, nowTs + 30 * DAY).filter((o) => o.plan.subject === subject && (!type || o.plan.type === type) && !['done', 'skipped', 'cancelled'].includes(o.st?.status)).sort((a, b) => a.t - b.t);
  return occ[0] || null;
}
