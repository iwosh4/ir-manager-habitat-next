// WIDGET REGISTRY — curated, useful widgets. Many are ACTIONABLE (complete, check, add to list) to save navigation.
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as store from '../core/store.js';
import { SPECIES, SUPPLEMENTS, latin, imgFor, macroFor } from '../data/species.js';
import { TYPE, rotationState, lastWeight } from '../engine/ops.js';
import { buildTimeline, groupItems, isOpen } from '../engine/timeline.js';
import { notifications } from '../engine/notify.js';
import { streamHTML, contextItems } from '../ui/timeline.js';
import { avatar, sexText, kpi, spark, bars, ring, rangeBar, money, empty, breedPill, typeDot } from '../ui/components.js';
import { art } from '../ui/art.js';
import { TOOLS, feedDemand } from './tools.js';
import { DAY, HOUR, startOfDay, hm, dShort, rel, daysBetween, monthName, ageText } from '../core/time.js';
export { addLowStockToShopping, addItemToShopping } from './tools.js';

export const CATS = ['Overview', 'Care', 'Tasks', 'Planner', 'Animals', 'Reproduction', 'Health', 'Enclosures', 'Inventory', 'Finance', 'Tools', 'Notes'];
export const ACCENTS = ['neutral', 'amber', 'blue', 'violet', 'red', 'green', 'teal', 'sand'];
export const FRAMES = [['strip', 'Header strip'], ['line', 'Side line'], ['tint', 'Tint'], ['outline', 'Outline'], ['none', 'Plain']];
const sod = () => startOfDay(Date.now());
const act = (db) => db.animals.filter((a) => !['sold', 'deceased'].includes(a.status));
const more = (href, label = 'Open') => `<a class="w-more" href="${href}">${label}${icon('arrowRight')}</a>`;

export const WIDGETS = {
  // ---------------------------------------------------------------- OVERVIEW
  kpis: { name: 'Collection KPIs', icon: 'gauge', cat: 'Overview', desc: 'Visual key figures: animals, enclosures, clutches, health, finance.', sizes: ['w', 'l'], size: 'w', noFrame: true,
    render(i) {
      const db = store.get(), a = act(db), n = Date.now();
      const heads = a.reduce((s, x) => s + (x.kind === 'group' ? x.count : 1), 0);
      const sx = a.reduce((m, x) => { if (x.kind === 'group') { m.m += x.sexes.m; m.f += x.sexes.f; m.u += x.sexes.u; } else m[x.sex]++; return m; }, { m: 0, f: 0, u: 0 });
      const inc = db.clutches.filter((c) => c.status === 'incubating'), eggs = inc.reduce((s, c) => s + c.fertile, 0);
      const alerts = db.health.filter((h) => !h.resolved && h.severity !== 'info').length;
      const monthIn = db.finance.filter((f) => f.t > n - 30 * DAY && f.kind !== 'expense').reduce((s, f) => s + f.amount, 0), monthOut = db.finance.filter((f) => f.t > n - 30 * DAY && f.kind === 'expense').reduce((s, f) => s + f.amount, 0);
      const occEnc = new Set(a.map((x) => x.enclosureId)).size;
      return `<div class="kpis">${kpi({ label: 'Animals', value: heads, sub: `<b>${a.length}</b> records · ${sx.m}.${sx.f}.${sx.u} <span class="muted">m.f.u</span>`, img: 'assets/img/species/dendrobates-tinctorius-azureus-macro.webp', href: '#/animals/grid', size: 'lg' })}
        ${kpi({ label: 'Incubating', value: eggs, unit: 'eggs', sub: `${inc.length} clutches · next window ${dShort(Math.min(...inc.map((c) => c.laid + c.expected[0] * DAY)))}`, img: 'assets/img/kpi/clutch-macro.webp', href: '#/reproduction/incubation' })}
        ${kpi({ label: 'Enclosures', value: occEnc, unit: `/ ${db.enclosures.length}`, sub: `${db.assemblies.length} assemblies · ${db.enclosures.filter((e) => e.status !== 'ok').length} need attention`, img: 'assets/img/enclosures/rack-glass.webp', href: '#/enclosures/overview' })}
        ${kpi({ label: 'Health', value: alerts, unit: 'open', sub: `${db.meds.filter((m) => m.done < m.count).length} medication course · ${db.health.filter((h) => h.followUp && !h.resolved).length} follow-ups`, artKey: 'health', href: '#/health/overview', tone: alerts ? 'warn' : '' })}
        ${kpi({ label: 'Month result', value: `${monthIn - monthOut >= 0 ? '+' : ''}${Math.round((monthIn - monthOut) / 100) / 10}k`, unit: 'Kč', sub: `in ${money(monthIn)} · out ${money(monthOut)}`, artKey: 'finance', href: '#/finance/overview', trend: { dir: monthIn >= monthOut ? 'up' : 'down', text: '30 days' } })}</div>`;
    } },
  attention: { name: 'Needs attention', icon: 'alert', cat: 'Overview', desc: 'Everything urgent in one place — overdue care, alerts, windows, low stock.', sizes: ['m', 'l', 'w'], size: 'l',
    render() {
      const list = notifications(store.get()).filter((n) => n.prio !== 'low').slice(0, 7);
      return list.length ? `<div class="list att">${list.map((n) => `<a class="li p-${n.prio}" href="${n.link}"><span class="nc-ico">${icon(n.icon)}</span><span class="li-main"><b>${esc(n.title)}</b><span>${esc(n.text)}</span></span><em class="muted mono">${rel(n.t)}</em></a>`).join('')}</div>` : empty('All clear', 'Nothing urgent.', 'empty');
    } },
  collection: { name: 'Collection overview', icon: 'animals', cat: 'Animals', desc: 'Species in your collection with counts and sex distribution.', sizes: ['m', 'l'], size: 'm',
    render() {
      const db = store.get(), by = {};
      for (const a of act(db)) { const k = a.species; (by[k] ||= { n: 0, m: 0, f: 0, u: 0, rec: 0 }); const s = by[k]; s.rec++; if (a.kind === 'group') { s.n += a.count; s.m += a.sexes.m; s.f += a.sexes.f; s.u += a.sexes.u; } else { s.n++; s[a.sex]++; } }
      const max = Math.max(...Object.values(by).map((x) => x.n));
      return `<div class="list">${Object.entries(by).sort((a, b) => b[1].n - a[1].n).map(([k, s]) => `<a class="li coll" href="#/animals/grid?sp=${k}"><img class="coll-img" src="assets/img/species/${SPECIES[k].img}-1.webp" alt="" loading="lazy"><span class="li-main"><b class="latin">${esc(latin(SPECIES[k]))}</b><span>${esc(SPECIES[k].common)}</span></span><span class="coll-bar"><i style="width:${(s.n / max) * 100}%"></i></span><span class="mono coll-n"><b>${s.n}</b> ${s.m}.${s.f}.${s.u}</span></a>`).join('')}</div>`;
    } },
  activity: { name: 'Recent activity', icon: 'history', cat: 'Overview', desc: 'What changed recently — records from every interface.', sizes: ['m', 'l'], size: 'm',
    render() {
      const db = store.get(), rec = db.records.filter((r) => r.source !== 'history' || r.t > Date.now() - 2 * DAY).slice(-60).reverse().slice(0, 9);
      return `<div class="list">${rec.map((r) => { const a = db.animals.find((x) => x.id === r.subject), e = db.enclosures.find((x) => x.id === r.subject); return `<div class="li">${typeDot(r.type)}<span class="li-main"><b>${esc(TYPE[r.type]?.label || r.type)}${r.data?.refused ? ' — refused' : ''} · <span class="code">${esc(a?.code || e?.code || '')}</span></b><span>${esc([r.data?.supplement, r.data?.g ? `${r.data.g} g` : '', r.data?.label, r.data?.title, r.source === 'automation' ? 'automation' : r.source === 'quick' ? 'Quick Record' : ''].filter(Boolean).join(' · '))}</span></span><em class="muted mono">${rel(r.t)}</em>${r.by === 'you' ? `<button class="icon-btn sm" data-act="edit-record" data-id="${r.id}" title="Edit">${icon('edit')}</button>` : ''}</div>`; }).join('')}</div>`;
    } },
  // ---------------------------------------------------------------- CARE / TASKS / PLANNER
  today: { name: 'Today & Upcoming', icon: 'planner', cat: 'Planner', desc: 'Compact operational timeline: overdue, NOW, today, tomorrow — complete from here.', sizes: ['m', 'l', 'w'], size: 'l',
    render() {
      const n = Date.now(), items = contextItems({ from: sod() - 3 * DAY, to: sod() + 2 * DAY, includeHistory: false }).filter((i) => i.kind !== 'phase' && isOpen(i));
      const grouped = groupItems(items), shown = grouped.slice(0, 7), restN = grouped.length - shown.length;
      const flat = shown.flatMap((g) => (g.kind === 'group' ? g.items : [g]));
      return `${streamHTML(flat, { mode: 'compact', showDone: false, empty: 'Nothing due' })}<div class="w-foot">${restN > 0 ? `<span class="muted">+${restN} upcoming</span>` : ''}${more('#/planner/timeline', t('Open Planner'))}</div>`;
    } },
  overdue: { name: 'Overdue', icon: 'alert', cat: 'Tasks', desc: 'Late work with one-tap completion.', sizes: ['s', 'm', 'l'], size: 'm',
    render() {
      const items = contextItems({ from: sod() - 14 * DAY, to: Date.now(), includeHistory: false }).filter((i) => i.status === 'overdue');
      return items.length ? `${streamHTML(items.slice(0, 8), { mode: 'compact', showDone: false })}${items.length > 8 ? `<div class="w-foot">${more('#/tasks/overdue', `All ${items.length}`)}</div>` : ''}` : `<div class="w-ok">${icon('checkCircle')}<b>Nothing overdue</b></div>`;
    } },
  quickcare: { name: 'Quick Care', icon: 'zap', cat: 'Care', desc: 'Due routine care grouped by activity — complete a whole group in one tap.', sizes: ['s', 'm', 'l'], size: 'm',
    render() {
      const items = contextItems({ from: sod() - 3 * DAY, to: sod() + DAY, includeHistory: false }).filter((i) => i.kind === 'occ' && isOpen(i) && ['feeding', 'water', 'misting', 'cleaning'].includes(i.type));
      const by = {}; for (const i of items) (by[i.type] ||= []).push(i);
      return Object.keys(by).length ? `<div class="qcw">${Object.entries(by).map(([k, arr]) => `<div class="qcw-r" style="--c:${TYPE[k].color}"><span class="tdot">${icon(TYPE[k].icon)}</span><span class="li-main"><b>${TYPE[k].label} ×${arr.length}</b><span>${arr.slice(0, 5).map((x) => esc(x.sub?.code)).join(', ')}${arr.length > 5 ? '…' : ''}</span></span><button class="btn sm primary" data-act="w-bulk" data-ids="${arr.map((x) => x.id).join(',')}">${icon('check')}${k === 'feeding' ? 'FED' : 'DONE'}</button></div>`).join('')}</div><div class="w-foot">${more('#/tasks/quick', 'Quick Care board')}</div>` : `<div class="w-ok">${icon('checkCircle')}<b>Routine care done</b><span class="muted">Next: tomorrow</span></div>`;
    } },
  rotation: { name: 'Supplement rotation', icon: 'pill', cat: 'Care', desc: 'Where each feeding rotation stands — next supplement is recorded automatically.', sizes: ['m', 'l'], size: 'm',
    render() {
      const db = store.get(), plans = db.plans.filter((p) => p.type === 'feeding' && p.rotation?.length > 1 && p.active).slice(0, 7);
      return `<div class="rot">${plans.map((p) => { const rs = rotationState(db, p), a = db.animals.find((x) => x.id === p.subject); return `<div class="rot-r"><span class="code">${esc(a?.code)}</span><span class="rot-seq">${rs.rot.map((s, i) => `<i class="${i === rs.index ? 'next' : ''} ${i === (rs.index - 1 + rs.rot.length) % rs.rot.length ? 'last' : ''}" style="--c:${SUPPLEMENTS[s]?.color}" title="${esc(s)}">${esc(s.split(' ')[0].slice(0, 5))}</i>`).join('')}</span><b style="color:${SUPPLEMENTS[rs.next]?.color}">${esc(rs.next)}</b></div>`; }).join('')}</div><p class="muted small">${icon('info')} Completing a feeding anywhere advances the rotation — no manual choice needed.</p>`;
    } },
  weighin: { name: 'Weigh-in queue', icon: 'weight', cat: 'Care', desc: 'Who is due for weighing, with last weight and trend — enter weights inline.', sizes: ['m', 'l'], size: 'm',
    render() {
      const db = store.get(), items = contextItems({ from: sod() - 7 * DAY, to: sod() + 7 * DAY, includeHistory: false }).filter((i) => i.type === 'weight' && isOpen(i)).slice(0, 6);
      return items.length ? `<div class="list">${items.map((i) => { const a = i.sub.obj, hist = db.records.filter((r) => r.subject === a.id && r.type === 'weight').slice(-8).map((r) => r.data.g); return `<div class="li wq">${avatar(a, 34)}<span class="li-main"><b class="code">${esc(a.code)}</b><span>${i.status === 'overdue' ? '<em class="danger-t">late</em> · ' : ''}${dShort(i.t)} · last ${lastWeight(db, a.id) ?? '—'} g</span></span>${spark(hist, { w: 70, h: 24, color: 'var(--c-weight)' })}<span class="tl-wt"><input type="number" step="0.1" placeholder="g" data-enter="tl-weight" data-id="${esc(i.id)}" id="w-${esc(i.id)}" aria-label="Weight ${esc(a.code)}"></span><button class="btn sm" data-act="tl-weight" data-id="${esc(i.id)}">${icon('check')}</button></div>`; }).join('')}</div>` : `<div class="w-ok">${icon('checkCircle')}<b>No weigh-ins due</b></div>`;
    } },
  upcoming: { name: 'Upcoming events', icon: 'calendarClock', cat: 'Planner', desc: 'Non-routine events in the next 14 days: tasks, reproduction, health, maintenance.', sizes: ['m', 'l'], size: 'm',
    render() {
      const items = contextItems({ from: Date.now(), to: sod() + 14 * DAY, includeHistory: false }).filter((i) => isOpen(i) && !['feeding', 'water', 'misting', 'cleaning'].includes(i.type) && i.kind !== 'phase').slice(0, 8);
      return `<div class="list">${items.map((i) => `<a class="li" href="#/planner/timeline?focus=${encodeURIComponent(i.id)}">${typeDot(i.type)}<span class="li-main"><b>${esc(i.title)}</b><span>${esc(i.sub?.code || '')}${i.cycleName ? ` · ${esc(i.cycleName)}` : ''}</span></span><em class="muted mono">${dShort(i.t)}</em></a>`).join('')}</div>`;
    } },
  // ---------------------------------------------------------------- ANIMALS
  favorites: { name: 'Favourites', icon: 'star', cat: 'Animals', desc: 'Your starred animals with their next action.', sizes: ['s', 'm', 'l'], size: 'm',
    render() { const db = store.get(); return animalTiles(db.favorites.map((id) => db.animals.find((a) => a.id === id)).filter(Boolean)); } },
  recent: { name: 'Recent animals', icon: 'history', cat: 'Animals', desc: 'Animals you opened or recorded recently.', sizes: ['s', 'm', 'l'], size: 'm',
    render() { const db = store.get(); return animalTiles(db.recent.animals.map((id) => db.animals.find((a) => a.id === id)).filter(Boolean).slice(0, 8)); } },
  groups: { name: 'Group overview', icon: 'group', cat: 'Animals', desc: 'Group-kept animals (frogs) as one card each — members inside.', sizes: ['m', 'l'], size: 'l',
    render() { const db = store.get(); return `<div class="grp-w">${act(db).filter((a) => a.kind === 'group').map((a) => `<a class="gw" href="#/animals/a/${a.id}">${avatar(a, 44)}<span class="li-main"><b><span class="code">${esc(a.code)}</span> ×${a.count}</b><i class="latin">${esc(latin(SPECIES[a.species]))}</i><span>${sexText(a)} · ${esc(db.enclosures.find((e) => e.id === a.enclosureId)?.code || '')}</span></span>${breedPill(a.breeding)}</a>`).join('')}</div>`; } },
  // ---------------------------------------------------------------- REPRODUCTION
  repro: { name: 'Active reproduction', icon: 'repro', cat: 'Reproduction', desc: 'Every active cycle: where we are, what is next, when.', sizes: ['m', 'l', 'w'], size: 'l',
    render() {
      const db = store.get(), n = Date.now();
      return `<div class="list">${db.cycles.filter((c) => c.status === 'active').map((c) => { const cur = [...c.phases].reverse().find((p) => p.start <= n) || c.phases[0]; const f = db.animals.find((a) => a.id === c.female); return `<a class="li rp" href="#/reproduction/cycle/${c.id}">${avatar(f, 38)}<span class="li-main"><b>${esc(c.name)}</b><span><em class="pill repro">${esc(cur.label)}</em> ${c.next ? `→ ${esc(c.next.label)} · ${rel(c.next.due)}` : ''}</span></span></a>`; }).join('')}</div>`;
    } },
  incubation: { name: 'Incubation', icon: 'egg', cat: 'Reproduction', desc: 'Clutches with day count, expected range and one-tap check.', sizes: ['m', 'l', 'w'], size: 'l',
    render() {
      const db = store.get(), n = Date.now(), items = contextItems({ from: sod() - 7 * DAY, to: sod() + 14 * DAY, includeHistory: false }).filter((i) => i.src === 'clutch-check' && isOpen(i));
      return `<div class="incw">${db.clutches.filter((c) => c.status === 'incubating').map((c) => { const d = daysBetween(c.laid, n), chk = items.find((i) => i.clutch === c.id); return `<div class="iw"><a class="iw-img" href="#/reproduction/clutch/${c.id}"><img src="assets/img/kpi/${c.img}.webp" alt="" loading="lazy"></a><div class="iw-b"><div class="row between"><b class="code">${esc(c.code)}</b><span class="muted small">${c.fertile}/${c.eggs} eggs · ${c.temp} °C</span></div><i class="latin">${esc(latin(SPECIES[c.species]))}</i><div class="iw-day"><b>DAY ${d}</b><span>expected ${c.expected[0]}–${c.expected[1]} days</span></div>${rangeBar(d, c.expected)}<div class="row">${chk ? `<button class="btn sm primary" data-act="tl-done" data-id="${esc(chk.id)}">${icon('check')}CHECK</button><span class="muted small">${chk.status === 'overdue' ? 'check overdue' : `next check ${rel(chk.t)}`}</span>` : ''}</div></div></div>`; }).join('')}</div>`;
    } },
  hatch: { name: 'Expected hatchings', icon: 'baby', cat: 'Reproduction', desc: 'Hatch windows on a shared axis — honest ranges, not single dates.', sizes: ['m', 'l', 'w'], size: 'm',
    render() {
      const db = store.get(), n = Date.now(), from = sod(), to = from + 150 * DAY, x = (tt) => `${Math.max(0, Math.min(100, ((tt - from) / (to - from)) * 100))}%`;
      return `<div class="hw">${db.clutches.filter((c) => c.status === 'incubating').sort((a, b) => a.laid + a.expected[0] * DAY - (b.laid + b.expected[0] * DAY)).map((c) => { const a = c.laid + c.expected[0] * DAY, b = c.laid + c.expected[1] * DAY; return `<a class="hw-r" href="#/reproduction/clutch/${c.id}"><span class="hw-l"><b class="code">${esc(c.code)}</b><em>${dShort(a)} – ${dShort(b)}</em></span><span class="hw-t"><i style="left:${x(a)};width:calc(${x(b)} - ${x(a)})" class="${a <= n ? 'open' : ''}"></i></span></a>`; }).join('')}<div class="hw-ax"><span>today</span><span>+50 d</span><span>+100 d</span><span>+150 d</span></div></div>`;
    } },
  // ---------------------------------------------------------------- HEALTH
  healthalerts: { name: 'Health alerts', icon: 'health', cat: 'Health', desc: 'Open observations and diagnoses by severity.', sizes: ['s', 'm', 'l'], size: 'm',
    render() {
      const db = store.get(), open = db.health.filter((h) => !h.resolved).sort((a, b) => ({ alert: 0, watch: 1, info: 2 }[a.severity] - { alert: 0, watch: 1, info: 2 }[b.severity]));
      return open.length ? `<div class="list">${open.slice(0, 6).map((h) => { const a = db.animals.find((x) => x.id === h.animal); return `<a class="li" href="#/animals/a/${a.id}?tab=health">${avatar(a, 34)}<span class="li-main"><b>${esc(h.title)}</b><span><span class="code">${esc(a.code)}</span> · ${rel(h.t)}${h.followUp ? ` · follow-up ${dShort(h.followUp)}` : ''}</span></span><span class="pill ${h.severity === 'alert' ? 'danger' : h.severity === 'watch' ? 'warn' : ''}">${h.severity}</span></a>`; }).join('')}</div>` : `<div class="w-ok">${icon('checkCircle')}<b>No open health issues</b></div>`;
    } },
  followups: { name: 'Follow-ups', icon: 'stethoscope', cat: 'Health', desc: 'Scheduled health follow-ups — confirm in one tap.', sizes: ['s', 'm'], size: 'm',
    render() { const items = contextItems({ from: sod() - 7 * DAY, to: sod() + 14 * DAY, includeHistory: false }).filter((i) => i.src === 'followup' && isOpen(i)); return items.length ? streamHTML(items, { mode: 'compact', showDone: false }) : `<div class="w-ok">${icon('checkCircle')}<b>No follow-ups</b></div>`; } },
  meds: { name: 'Medication', icon: 'pill', cat: 'Health', desc: 'Active courses with dose progress and next dose.', sizes: ['s', 'm', 'l'], size: 'm',
    render() {
      const db = store.get(), active = db.meds.filter((m) => m.done < m.count);
      return active.length ? `<div class="list">${active.map((m) => { const a = db.animals.find((x) => x.id === m.animal), next = m.from + m.done * m.everyH * HOUR; return `<div class="li">${ring(m.done / m.count, { size: 42, stroke: 4, color: 'var(--c-med)', label: `${m.done}/${m.count}` })}<span class="li-main"><b>${esc(m.drug)}</b><span><span class="code">${esc(a.code)}</span> · ${esc(m.dose)} ${esc(m.route)} · next ${rel(next)}</span></span></div>`; }).join('')}</div>` : `<div class="w-ok">${icon('checkCircle')}<b>No active courses</b></div>`;
    } },
  // ---------------------------------------------------------------- ENCLOSURES
  enclosures: { name: 'Enclosure status', icon: 'enclosure', cat: 'Enclosures', desc: 'Readings, technical warnings and maintenance at a glance.', sizes: ['m', 'l', 'w'], size: 'm',
    render() {
      const db = store.get(), n = Date.now();
      const rows = db.enclosures.map((e) => { const warn = e.tech.filter((t) => n - t.installed > (t.lifeDays - 30) * DAY); const sp = db.animals.find((a) => a.enclosureId === e.id)?.species; const env = sp ? SPECIES[sp].env : null; const rhOk = env ? e.readings.rh >= env.rh[0] - 5 && e.readings.rh <= env.rh[1] + 5 : true; return { e, warn, rhOk, sp }; }).sort((a, b) => b.warn.length - a.warn.length || a.rhOk - b.rhOk);
      return `<div class="list">${rows.slice(0, 7).map(({ e, warn, rhOk }) => `<a class="li" href="#/enclosures/e/${e.id}"><span class="tl-eico ${warn.length ? 'warn' : ''}">${icon(warn.length ? 'alert' : 'enclosure')}</span><span class="li-main"><b><span class="code">${esc(e.code)}</span> ${esc(e.name)}</b><span>${warn.length ? `<em class="warn-t">${esc(warn.map((w) => w.label).join(', '))} due</em> · ` : ''}${e.readings.t} °C · <span class="${rhOk ? '' : 'warn-t'}">${e.readings.rh} % RH</span></span></span></a>`).join('')}</div>`;
    } },
  habitat: { name: 'Habitat Studio', icon: 'cube', cat: 'Enclosures', desc: 'Room preview, assemblies and the entry to the 3D planner.', sizes: ['m', 'l', 'w'], size: 'l', noFrame: true,
    render() { const db = store.get(); return `<a class="hab-w" href="#/enclosures/habitat"><img src="assets/img/enclosures/room-hero.webp" alt="Breeding room A — Habitat Studio render" loading="lazy"><span class="hab-o"><b>Breeding room A</b><span>${db.enclosures.length} enclosures · ${db.assemblies.length} assemblies · 5.00 × 4.00 × 2.70 m</span><span class="btn sm primary">${icon('cube')}${t('Open Habitat Studio')}</span></span></a>`; } },
  // ---------------------------------------------------------------- INVENTORY
  lowstock: { name: 'Low stock', icon: 'inventory', cat: 'Inventory', desc: 'Items under minimum — add them to a shopping list in one tap.', sizes: ['s', 'm', 'l'], size: 'm',
    render() {
      const db = store.get(), low = db.inventory.filter((x) => x.qty < x.min).sort((a, b) => a.qty / a.min - b.qty / b.min);
      return low.length ? `<div class="list">${low.map((x) => `<div class="li"><span class="inv-ico">${x.img ? `<img src="assets/img/${x.img}" alt="" loading="lazy">` : icon(x.icon || 'inventory')}</span><span class="li-main"><b>${esc(x.name)}</b><span><em class="${x.qty === 0 ? 'danger-t' : 'warn-t'}">${x.qty} ${esc(x.unit)}</em> · min ${x.min}${x.lowNote ? ` · ${esc(x.lowNote)}` : ''}</span></span><button class="icon-btn sm" data-act="w-shop1" data-id="${x.id}" title="Add to shopping list">${icon('cart')}</button></div>`).join('')}</div><button class="btn sm block primary" data-act="w-shopall">${icon('cart')}Add all to shopping list</button>` : `<div class="w-ok">${icon('checkCircle')}<b>Stock OK</b></div>`;
    } },
  stockvalue: { name: 'Stock value', icon: 'coins', cat: 'Inventory', desc: 'Value of stock by category.', sizes: ['s', 'm'], size: 's',
    render() { const db = store.get(), by = {}; for (const i of db.inventory) by[i.cat] = (by[i.cat] || 0) + i.qty * i.price; const tot = Object.values(by).reduce((a, b) => a + b, 0); return `<div class="sv"><b class="big-n">${money(tot)}</b><div class="sv-bars">${Object.entries(by).map(([k, v]) => `<div><span>${k}</span><i style="width:${(v / tot) * 100}%"></i><em>${money(v)}</em></div>`).join('')}</div></div>`; } },
  moves: { name: 'Recent stock movements', icon: 'activity', cat: 'Inventory', desc: 'Purchases, feedings and counts — including automatic deductions from feedings.', sizes: ['m', 'l'], size: 'm',
    render() { const db = store.get(); return `<div class="list">${db.stock.slice(0, 8).map((s) => { const it = db.inventory.find((x) => x.id === s.item); return `<div class="li"><span class="mv ${s.delta > 0 ? 'in' : 'out'}">${s.delta > 0 ? '+' : ''}${s.delta}</span><span class="li-main"><b>${esc(it?.name || s.item)}</b><span>${esc(s.reason)}</span></span><em class="muted mono">${rel(s.t)}</em></div>`; }).join('')}</div>`; } },
  feeddemand: { name: 'Feed demand', icon: 'feed', cat: 'Inventory', desc: 'How long feeders last at the current care plans.', sizes: ['m', 'l'], size: 'm', tool: 'feedplan' },
  // ---------------------------------------------------------------- FINANCE
  finsum: { name: 'Finance summary', icon: 'finance', cat: 'Finance', desc: 'This month: income, expenses, deposits and result.', sizes: ['s', 'm', 'l'], size: 'm',
    render() { const f = monthAgg(0), p = monthAgg(1); return `<div class="fs"><div class="fs-r"><span>Income</span><b class="ok-t">${money(f.inc)}</b></div><div class="fs-r"><span>Expenses</span><b class="danger-t">${money(f.exp)}</b></div><div class="fs-r"><span>Deposits held</span><b>${money(f.dep)}</b></div><div class="fs-r tot"><span>Result</span><b>${money(f.inc - f.exp)}</b><em class="${f.inc - f.exp >= p.inc - p.exp ? 'ok-t' : 'danger-t'}">${f.inc - f.exp >= p.inc - p.exp ? '▲' : '▼'} vs last month</em></div></div>`; } },
  monthly: { name: 'Monthly overview', icon: 'barChart', cat: 'Finance', desc: '12 months of income vs expenses.', sizes: ['m', 'l', 'w'], size: 'l',
    render() { const m = months12(); return `${bars([m.map((x) => x.inc), m.map((x) => x.exp)], m.map((x) => x.label), { names: ['Income', 'Expenses'], fmt: money, h: 140 })}<div class="legend"><span style="--c:var(--c-fin)"><i></i>Income</span><span style="--c:var(--danger)"><i></i>Expenses</span></div>`; } },
  sales: { name: 'Recent sales & reservations', icon: 'tag', cat: 'Finance', desc: 'Sold, reserved (deposits, pickups) and for sale.', sizes: ['m', 'l'], size: 'm',
    render() { const db = store.get(); return `<div class="list">${db.sales.slice().sort((a, b) => ({ reserved: 0, 'for-sale': 1, sold: 2 }[a.status] - { reserved: 0, 'for-sale': 1, sold: 2 }[b.status])).slice(0, 7).map((s) => { const a = db.animals.find((x) => x.id === s.animal), c = db.contacts.find((x) => x.id === s.buyer); return `<a class="li" href="#/sales/${s.status === 'for-sale' ? 'forsale' : s.status}">${avatar(a, 34)}<span class="li-main"><b><span class="code">${esc(a.code)}</span> ${esc(a.morph || SPECIES[a.species].common)}</b><span>${s.status === 'reserved' ? `reserved · ${esc(c?.name || '')} · deposit ${money(s.deposit)} · pickup ${dShort(s.pickup)}` : s.status === 'sold' ? `sold ${dShort(s.date)} · ${esc(c?.name || '')}` : 'for sale'}</span></span><b class="mono">${money(s.price)}</b></a>`; }).join('')}</div>`; } },
  budget: { name: 'Monthly budget', icon: 'piggy', cat: 'Finance', desc: 'Spending against your monthly budget per category.', sizes: ['s', 'm'], size: 'm', cfg: { budget: { Feed: 3500, Equipment: 2000, Veterinary: 1500, Energy: 1400 } },
    render(i) { const f = monthAgg(0), b = i.cfg?.budget || this.cfg.budget; return `<div class="bud">${Object.entries(b).map(([k, v]) => { const s = f.byCat[k] || 0, p = s / v; return `<div class="bud-r"><div class="row between"><span>${k}</span><span class="mono ${p > 1 ? 'danger-t' : ''}">${money(s)} / ${money(v)}</span></div><div class="bar-mini"><i style="width:${Math.min(100, p * 100)}%;background:${p > 1 ? 'var(--danger)' : p > 0.8 ? 'var(--warn)' : 'var(--c-fin)'}"></i></div></div>`; }).join('')}</div>`; } },
  docs: { name: 'Document shortcuts', icon: 'file', cat: 'Overview', desc: 'CITES, invoices, lab reports and registers.', sizes: ['s', 'm'], size: 'm',
    render() { const db = store.get(); return `<div class="list">${db.documents.map((d) => `<a class="li" href="${d.animal ? `#/animals/a/${d.animal}?tab=origin` : '#/settings/app'}"><span class="sp-ico">${icon('file')}</span><span class="li-main"><b>${esc(d.name)}</b><span>${esc(d.kind)} · ${dShort(d.date)} · ${esc(d.size)}</span></span></a>`).join('')}</div>`; } },
};
// ---------------------------------------------------------------- TOOL WIDGETS (multi-instance where useful)
for (const [k, T] of Object.entries(TOOLS)) {
  if (WIDGETS[k]) continue;
  WIDGETS[k] = { name: T.name, icon: T.icon, cat: T.doc === 'notes' || T.doc === 'checklist' ? 'Notes' : T.doc === 'shopping' ? 'Inventory' : 'Tools', desc: T.desc, sizes: ['s', 'm', 'l', 'w'], size: k === 'calculator' ? 's' : k === 'energy' || k === 'feedplan' || k === 'labels' ? 'l' : 'm', tool: k, multi: !!T.doc || k === 'calculator', doc: T.doc };
}
WIDGETS.feeddemand.tool = 'feedplan';

function animalTiles(list) {
  const db = store.get();
  return list.length ? `<div class="at">${list.map((a) => { const e = db.enclosures.find((x) => x.id === a.enclosureId); return `<a class="at-i" href="#/animals/a/${a.id}"><img src="${imgFor(a)}" alt="" loading="lazy"><span><b class="code">${esc(a.code)}</b><i class="latin">${esc(SPECIES[a.species].latin)}</i><em>${a.name ? esc(a.name) + ' · ' : ''}${esc(e?.code || '')}</em></span></a>`; }).join('')}</div>` : empty('Nothing yet', 'Star animals on their profile to pin them here.');
}
function monthAgg(back = 0) {
  const db = store.get(), d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - back); const a = d.getTime(); d.setMonth(d.getMonth() + 1); const b = d.getTime();
  const rows = db.finance.filter((f) => f.t >= a && f.t < b); const byCat = {}; for (const f of rows.filter((x) => x.kind === 'expense')) byCat[f.cat] = (byCat[f.cat] || 0) + f.amount;
  return { inc: rows.filter((f) => f.kind === 'income').reduce((s, f) => s + f.amount, 0), exp: rows.filter((f) => f.kind === 'expense').reduce((s, f) => s + f.amount, 0), dep: rows.filter((f) => f.kind === 'deposit').reduce((s, f) => s + f.amount, 0), byCat };
}
export function months12() { const out = []; for (let k = 11; k >= 0; k--) { const m = monthAgg(k), d = new Date(); d.setMonth(d.getMonth() - k); out.push({ ...m, label: monthName(d.getMonth()) }); } return out; }
export { monthAgg };

// ---------------------------------------------------------------- DEFAULT LAYOUTS & PRESETS (strong defaults — customisation is optional)
const I = (type, size, extra = {}) => ({ type, size: size || WIDGETS[type].size, ...extra });
export const DEFAULTS = {
  dashboard: [I('kpis', 'w'), I('today', 'l'), I('attention', 'l'), I('incubation', 'l'), I('repro', 'l'), I('quickcare', 'm'), I('lowstock', 'm'), I('healthalerts', 'm'), I('activity', 'm'), I('favorites', 'm'), I('habitat', 'l'), I('notes', 'm', { title: 'Breeding room notes', accent: 'violet', seed: { text: 'Raise AS-01 humidity to 85 % until the eye cap comes off.\nAsk Horáková about PCR result (MSP-04).\nExpo 18 Oct — bring 2 frog boxes.' } })],
  animals: [I('collection', 'm'), I('groups', 'l'), I('favorites', 'm'), I('weighin', 'm'), I('recent', 'm')],
  tasks: [I('quickcare', 'm'), I('overdue', 'm'), I('rotation', 'm'), I('weighin', 'l'), I('upcoming', 'm')],
  planner: [I('today', 'l'), I('upcoming', 'm'), I('rotation', 'm')],
  health: [I('healthalerts', 'l'), I('followups', 'm'), I('meds', 'm'), I('notes', 'm', { title: 'Vet questions', accent: 'red', seed: { text: 'MSP-04: PCR Cryptosporidium result?\nAS-01: safe to use eye lubricant daily?\nFP-01: annual check next spring.' } }), I('activity', 'm')],
  reproduction: [I('repro', 'l'), I('incubation', 'l'), I('hatch', 'm'), I('notes', 'm', { title: 'Breeding notes', accent: 'violet', seed: { text: 'Pastel Clown project — hold back 2 females from 2026.\nLEU-02: petri under the leaf, move at 20:00.' } }), I('checklist', 'm', { title: 'Hatching prep', accent: 'teal', seed: { items: [{ text: 'Hatchling tubs cleaned', done: true }, { text: 'Paper towel + hides', done: true }, { text: 'Label templates', done: false }, { text: 'Pinkie stock ≥ 20', done: false }] } })],
  enclosures: [I('enclosures', 'l'), I('habitat', 'l'), I('volume', 'm'), I('energy', 'l')],
  inventory: [I('lowstock', 'm'), I('shopping', 'm', { title: 'FEED ORDER', accent: 'amber', seed: { items: [{ name: 'Dubia roach (M)', qty: 500, unit: 'pcs', price: 1.6, cat: 'feed', prio: 'h' }, { name: 'Crickets (Acheta)', qty: 300, unit: 'pcs', price: 1.1, cat: 'feed' }, { name: 'Dendrocare', qty: 1, unit: 'jar', price: 420, cat: 'supplement', prio: 'h' }, { name: 'Calcium D3', qty: 2, unit: 'jar', price: 180, cat: 'supplement' }] } }), I('shopping', 'm', { title: 'EQUIPMENT', accent: 'blue', seed: { items: [{ name: 'UVB T5 6 % 54 W', qty: 2, unit: 'pcs', price: 690, cat: 'equipment', prio: 'h' }, { name: 'Mist nozzle (MistKing)', qty: 2, unit: 'pcs', price: 240, cat: 'equipment' }, { name: 'PVC tubing 4 mm', qty: 10, unit: 'm', price: 18, cat: 'equipment' }, { name: 'T/RH sensor (BLE)', qty: 1, unit: 'pcs', price: 520, cat: 'equipment' }] } }), I('feeddemand', 'l'), I('moves', 'm'), I('stockvalue', 's'), I('calculator', 's', { cfg: { ctx: 'inventory' } }), I('notes', 'm', { title: 'Supplier notes', accent: 'sand', seed: { text: 'FeederFarm: order before Tue 12:00 → ships Wed.\nColdChain: frozen Thu, min. 2 000 Kč.' } })],
  finance: [I('finsum', 'm'), I('budget', 'm'), I('calculator', 's', { cfg: { ctx: 'finance' } }), I('monthly', 'l'), I('sales', 'm'), I('price', 'm'), I('checklist', 'm', { title: 'Month-end', accent: 'green', seed: { items: [{ text: 'Enter expo income', done: true }, { text: 'Match deposits', done: false }, { text: 'Electricity share', done: false }] } })],
};
DEFAULTS.reproduction = [I('repro', 'l'), I('incubation', 'l'), I('hatch', 'm'), I('notes', 'm', { title: 'Breeding notes', accent: 'violet', seed: { text: 'Pastel Clown project — hold back 2 females from 2026.\nLEU-02: petri under the leaf, move at 20:00.' } }), I('checklist', 'm', { title: 'Hatching prep', accent: 'teal', seed: { items: [{ text: 'Hatchling tubs cleaned', done: true }, { text: 'Paper towel + hides', done: true }, { text: 'Label templates', done: false }, { text: 'Pinkie stock ≥ 20', done: false }] } })];
export const PRESETS = {
  default: { name: 'Balanced (default)', desc: 'A bit of everything', layout: () => DEFAULTS.dashboard },
  breeding: { name: 'Breeding focus', desc: 'Reproduction, incubation, hatch windows, notes', layout: () => [I('kpis', 'w'), I('repro', 'l'), I('incubation', 'l'), I('hatch', 'l'), I('today', 'l'), I('rotation', 'm'), I('notes', 'm', { title: 'Breeding notes', accent: 'violet' }), I('checklist', 'm', { title: 'Hatching prep', accent: 'teal' })] },
  daily: { name: 'Daily care', desc: 'Today, Quick Care, weigh-ins, overdue — big actions', layout: () => [I('today', 'l'), I('quickcare', 'l'), I('overdue', 'm'), I('weighin', 'm'), I('rotation', 'm'), I('followups', 'm'), I('checklist', 'm', { title: 'Room close-down', accent: 'teal', seed: { items: [{ text: 'Lights & timers', done: false }, { text: 'Misting reservoir', done: false }, { text: 'Incubator temp', done: false }, { text: 'Door locked', done: false }] } })] },
  sales: { name: 'Inventory & sales', desc: 'Stock, shopping, sales, finance', layout: () => [I('kpis', 'w'), I('lowstock', 'm'), I('shopping', 'm', { title: 'FEED ORDER', accent: 'amber' }), I('sales', 'm'), I('finsum', 'm'), I('monthly', 'l'), I('pricelist', 'm'), I('calculator', 's', { cfg: { ctx: 'finance' } })] },
};
