// Notification center: derived from live data (never a separate list to maintain). Priority: high / normal / low.
import { DAY, HOUR, startOfDay, dShort, hm } from '../core/time.js';
import { buildTimeline, isOpen } from './timeline.js';
import { TYPE } from './ops.js';
import { SPECIES } from '../data/species.js';

let cache = { key: '', list: [] };
export function notifications(db, nowTs = Date.now()) {
  const key = `${db.records.length}|${Object.keys(db.occ).length}|${db.tasks.length}|${db.readNotifications.length}|${db.inventory.map((i) => i.qty).join(',')}|${Math.floor(nowTs / (5 * 60e3))}|${JSON.stringify(db.prefs.notify)}`;
  if (cache.key === key) return cache.list;
  const out = [], P = db.prefs.notify || {};
  const items = buildTimeline(db, { from: nowTs - 7 * DAY, to: nowTs + 14 * DAY, includeHistory: false, nowTs });
  // overdue work grouped by type
  if (P.overdue !== false) {
    const od = items.filter((i) => i.status === 'overdue' && i.kind === 'occ' || i.status === 'overdue' && i.kind === 'task');
    const byType = {}; for (const i of od) (byType[i.type] ||= []).push(i);
    for (const [type, arr] of Object.entries(byType)) out.push({ id: `od:${type}:${arr.map((a) => a.id).join(',').length}:${arr[0].id}`, kind: 'overdue', prio: 'high', icon: TYPE[type]?.icon || 'status-warning', title: `${TYPE[type]?.label || 'Úkol'} po termínu${arr.length > 1 ? ` ×${arr.length}` : ''}`, text: arr.slice(0, 3).map((a) => a.sub?.code || a.title).join(', ') + (arr.length > 3 ? ` +${arr.length - 3}` : ''), t: arr[0].t, link: '#/ukoly/dnes', count: arr.length });
  }
  // incubation windows
  if (P.incubation !== false) for (const cl of db.clutches.filter((c) => c.status === 'incubating')) {
    const w0 = cl.laid + cl.expected[0] * DAY, w1 = cl.laid + cl.expected[1] * DAY, day = Math.floor((nowTs - cl.laid) / DAY);
    if (nowTs >= w0 - 7 * DAY && nowTs <= w1) out.push({ id: `inc:${cl.id}:${startOfDay(nowTs)}`, kind: 'incubation', prio: nowTs >= w0 ? 'high' : 'normal', icon: 'reproduction', title: nowTs >= w0 ? `Okno líhnutí otevřeno · ${cl.code}` : `Okno líhnutí za ${Math.ceil((w0 - nowTs) / DAY)} dní · ${cl.code}`, text: `${SPECIES[cl.species].latin} · den ${day} z ${cl.expected[0]}–${cl.expected[1]}`, t: w0, link: `#/reprodukce/snuska/${cl.id}` });
  }
  // health follow-ups & doses
  if (P.health !== false) {
    for (const i of items.filter((x) => x.type === 'health' && isOpen(x) && x.t < nowTs + 2 * DAY)) out.push({ id: `hf:${i.id}`, kind: 'health', prio: i.status === 'overdue' ? 'high' : 'normal', icon: 'health', title: `Zdravotní kontrola · ${i.sub?.code}`, text: i.title.replace('Kontrola · ', ''), t: i.t, link: `#/zvirata/karta/${i.subject}` });
    for (const i of items.filter((x) => x.type === 'medication' && isOpen(x) && x.t < startOfDay(nowTs) + DAY)) out.push({ id: `md:${i.id}`, kind: 'health', prio: 'high', icon: 'first-aid', title: `Dávka léku · ${i.sub?.code}`, text: `${i.title} · ${i.meta.dose} · ${hm(i.t)}`, t: i.t, link: '#/zdravi/lecba' });
  }
  // stock
  if (P.stock !== false) {
    const low = db.inventory.filter((x) => x.qty < x.min);
    if (low.length) out.push({ id: `st:${low.map((x) => x.id).join(',')}`, kind: 'stock', prio: low.some((x) => x.qty === 0) ? 'high' : 'normal', icon: 'inventory', title: `Nízký stav · ${low.length} položek`, text: low.slice(0, 4).map((x) => x.name.split(' (')[0]).join(', '), t: startOfDay(nowTs) + 12 * HOUR, link: '#/sklad/prehled' });
  }
  // reproduction steps & phase changes
  if (P.repro !== false) for (const cy of db.cycles.filter((c) => c.status === 'active')) {
    if (cy.next && cy.next.due < nowTs + 2 * DAY) out.push({ id: `rp:${cy.id}:${cy.next.due}`, kind: 'repro', prio: 'normal', icon: 'reproduction', title: cy.next.label, text: `${cy.name} · ${cy.next.due < nowTs ? 'nyní' : dShort(cy.next.due)}`, t: cy.next.due, link: `#/reprodukce/cyklus/${cy.id}` });
    for (const ph of cy.phases) if (!ph.milestone && ph.start > nowTs && ph.start < nowTs + 10 * DAY) out.push({ id: `pc:${cy.id}:${ph.key}:${ph.start}`, kind: 'repro', prio: 'low', icon: 'calendar', title: `Změna fáze · ${ph.label}`, text: `${cy.name} · začíná ${dShort(ph.start)}`, t: ph.start, link: `#/reprodukce/cyklus/${cy.id}` });
  }
  // technical: UVB end of life
  for (const e of db.enclosures) for (const tc of e.tech) if (tc.kind === 'uvb' && nowTs - tc.installed > (tc.lifeDays - 30) * DAY) out.push({ id: `uv:${e.id}:${tc.installed}`, kind: 'enclosure', prio: 'normal', icon: 'lighting', title: `Výměna UVB · ${e.code}`, text: `${Math.round((nowTs - tc.installed) / DAY)} z ${tc.lifeDays} dní`, t: tc.installed + tc.lifeDays * DAY, link: `#/ubikace/detail/${e.id}` });
  const read = new Set(db.readNotifications);
  for (const n of out) n.read = read.has(n.id);
  const rank = { high: 0, normal: 1, low: 2 };
  out.sort((a, b) => a.read - b.read || rank[a.prio] - rank[b.prio] || a.t - b.t);
  cache = { key, list: out };
  return out;
}
