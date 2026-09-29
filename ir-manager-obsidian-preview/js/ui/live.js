// ŽIVÝ PÁS — useful operational information, one message at a time (step ticker, not a marquee).
// Behaviour: 6.5 s per message, 280 ms slide · pauses on hover / focus / inactive tab / user pause ·
// priority messages (overdue, alerts) take over first · prefers-reduced-motion → no movement, manual stepping.
import { esc, $, actions } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { buildTimeline, groupItems, isOpen } from '../engine/timeline.js';
import { TYPE } from '../engine/ops.js';
import { SPECIES, latin } from '../data/species.js';
import { DAY, HOUR, startOfDay, hm, rel, daysBetween, dShort } from '../core/time.js';

const STEP_MS = 6500;
const S = { i: 0, msgs: [], timer: 0, paused: false, hover: false, userPaused: false, sig: '' };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';
const prefs = () => store.get().prefs.live || { enabled: true };

export function liveMessages(db = store.get(), nowTs = Date.now()) {
  const sod = startOfDay(nowTs), out = [];
  const items = buildTimeline(db, { from: nowTs - 7 * DAY, to: sod + 2 * DAY, includeHistory: false, nowTs }).filter((i) => i.kind !== 'phase');
  const open = items.filter(isOpen), overdue = open.filter((i) => i.status === 'overdue');
  const todayOpen = open.filter((i) => i.t < sod + DAY);
  const doneToday = db.records.filter((r) => r.t >= sod && r.by === 'you').length + Object.values(db.occ).filter((o) => o.status === 'done' && o.at >= sod && o.by !== 'you').length;
  // PRIORITY
  const odG = groupItems(overdue);
  if (odG.length) out.push({ prio: true, icon: 'status-warning', text: `${odG.length} ${odG.length === 1 ? 'úkol' : odG.length < 5 ? 'úkoly' : 'úkolů'} po termínu`, detail: odG.slice(0, 3).map((i) => i.kind === 'group' ? `${TYPE[i.type]?.label} ×${i.items.length}` : `${TYPE[i.type]?.label || 'Úkol'}${i.sub?.code ? ` ${i.sub.code}` : ''}`).join(' · '), href: '#/ukoly/dnes' });
  const alert = db.health.find((h) => !h.resolved && h.followUp && h.followUp < nowTs);
  if (alert) { const a = db.animals.find((x) => x.id === alert.animal); out.push({ prio: true, icon: 'health', text: `Zdravotní kontrola po termínu · ${a?.code}`, detail: alert.title, href: `#/zvirata/karta/${alert.animal}?sekce=zdravi` }); }
  // NORMAL stream
  out.push({ icon: 'tasks', text: `${todayOpen.length} ${todayOpen.length === 1 ? 'úkol' : todayOpen.length < 5 ? 'úkoly' : 'úkolů'} dnes`, detail: doneToday ? `${doneToday} už hotovo` : 'nic zatím nezapsáno', href: '#/ukoly/dnes', dot: true });
  const next = groupItems(open.filter((i) => i.t >= nowTs - 30 * 60e3 && i.status !== 'overdue').sort((a, b) => a.t - b.t))[0];
  if (next) {
    const T = TYPE[next.type] || TYPE.task, grp = next.kind === 'group', first = grp ? next.items[0] : next, sp = first.sub?.species;
    out.push({ icon: T.icon, text: `${T.label}${sp ? ` ${sp.latin.replace(/^(\w)\w+ /, '$1. ')}${sp.ssp ? ` ${sp.ssp.replace(/[“”]/g, '')}` : ''}` : ''}${grp ? ` ×${next.items.length}` : first.sub?.code ? ` · ${first.sub.code}` : ''} · ${hm(next.t)}`, detail: first.meta?.supplement || rel(next.t), href: '#/ukoly/planovac' });
  }
  for (const cl of db.clutches.filter((c) => c.status === 'incubating').sort((a, b) => (a.laid + a.expected[0] * DAY) - (b.laid + b.expected[0] * DAY)).slice(0, 2)) {
    const d = daysBetween(cl.laid, nowTs);
    out.push({ icon: 'reproduction', text: `Inkubace ${cl.code} · den ${d} / ${cl.expected[0]}–${cl.expected[1]}`, detail: SPECIES[cl.species].latin, href: `#/reprodukce/snuska/${cl.id}` });
  }
  const mist = open.filter((i) => i.type === 'misting' && i.t > nowTs).sort((a, b) => a.t - b.t)[0];
  if (mist) out.push({ icon: 'mist', text: `Další rosení · ${hm(mist.t)}`, detail: rel(mist.t), href: '#/ukoly/planovac' });
  const low = db.inventory.filter((x) => x.qty < x.min);
  if (low.length) out.push({ icon: 'inventory', text: `Nízký stav: ${low.slice(0, 2).map((x) => x.name.split(' (')[0]).join(', ')}${low.length > 2 ? ` +${low.length - 2}` : ''}`, detail: 'přidat do nákupu', href: '#/sklad/prehled' });
  const cy = db.cycles.filter((c) => c.status === 'active' && c.next).sort((a, b) => a.next.due - b.next.due)[0];
  if (cy) out.push({ icon: 'reproduction', text: `${cy.next.label}`, detail: `${cy.name} · ${rel(cy.next.due)}`, href: `#/reprodukce/cyklus/${cy.id}` });
  const last = [...db.records].reverse().find((r) => r.by === 'you') || [...db.records].reverse().find((r) => r.t <= nowTs);
  if (last) { const a = db.animals.find((x) => x.id === last.subject) || db.enclosures.find((x) => x.id === last.subject); out.push({ icon: TYPE[last.type]?.icon || 'tasks', text: `Poslední záznam · ${TYPE[last.type]?.label || 'Záznam'}${a ? ` ${a.code}` : ''}`, detail: rel(last.t), href: '#/prehled' }); }
  out.push({ icon: 'calendar', text: 'Terraristika Expo Praha · 18. 10.', detail: 'rezervovány 2 stoly', href: '#/adresar/akce' });
  return out;
}

function render(dir = 1) {
  const host = $('[data-role=live]'); if (!host) return;
  const p = prefs();
  host.hidden = p.enabled === false;
  if (p.enabled === false) return;
  const m = S.msgs[S.i] || S.msgs[0]; if (!m) return;
  const cur = host.querySelector('.lv-msg');
  const html = `<a class="lv-msg ${m.prio ? 'prio' : ''}" href="${m.href}" data-i="${S.i}">${ico(m.icon, 'lv-ico')}<b>${esc(m.text)}</b>${m.detail ? `<span>${esc(m.detail)}</span>` : ''}${gl('arrow-right', 'lv-go')}</a>`;
  if (!host.querySelector('.lv-track')) {
    host.innerHTML = `<span class="lv-tag" title="Živé informace z vašeho chovu"><i class="lv-dot"></i>ŽIVĚ</span>
      <div class="lv-track" aria-live="polite">${html}</div>
      <span class="lv-count" data-role="lv-count"></span>
      <div class="lv-ctl"><button class="icon-btn sm" data-act="live-prev" aria-label="Předchozí zpráva">${gl('chevron-left')}</button><button class="icon-btn sm" data-act="live-pause" data-role="lv-pause" aria-label="Pozastavit">${gl('pause')}</button><button class="icon-btn sm" data-act="live-next" aria-label="Další zpráva">${gl('chevron-right')}</button></div>
      <span class="lv-sync saved" data-role="live-sync">${gl('cloud-check')}<span>Uloženo</span></span>`;
    wire(host);
  } else if (cur && !reduced()) {
    const track = host.querySelector('.lv-track');
    const nx = document.createElement('div'); nx.innerHTML = html; const el = nx.firstElementChild;
    el.classList.add(dir > 0 ? 'enter' : 'enter-rev'); track.append(el);
    cur.classList.add(dir > 0 ? 'leave' : 'leave-rev');
    setTimeout(() => cur.remove(), 300);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('enter', 'enter-rev')));
  } else { host.querySelector('.lv-track').innerHTML = html; }
  host.classList.toggle('has-prio', !!m.prio);
  const c = host.querySelector('[data-role=lv-count]'); if (c) c.textContent = `${S.i + 1}/${S.msgs.length}`;
  const pb = host.querySelector('[data-role=lv-pause]'); if (pb) { pb.innerHTML = gl(S.userPaused ? 'play' : 'pause'); pb.setAttribute('aria-label', S.userPaused ? 'Pokračovat' : 'Pozastavit'); }
  host.classList.toggle('paused', isPaused());
}
function wire(host) {
  host.addEventListener('mouseenter', () => { S.hover = true; host.classList.add('paused'); });
  host.addEventListener('mouseleave', () => { S.hover = false; host.classList.toggle('paused', isPaused()); });
  host.addEventListener('focusin', () => { S.hover = true; });
  host.addEventListener('focusout', () => { S.hover = false; });
}
const isPaused = () => S.userPaused || S.hover || document.hidden;
function tick() {
  clearTimeout(S.timer);
  S.timer = setTimeout(() => {
    if (!isPaused() && !reduced() && S.msgs.length > 1) { S.i = (S.i + 1) % S.msgs.length; render(1); }
    tick();
  }, STEP_MS);
}
export function refreshLive({ force = false } = {}) {
  const msgs = liveMessages();
  const sig = msgs.map((m) => m.text).join('|');
  const newPrio = msgs.find((m) => m.prio && !S.msgs.some((o) => o.text === m.text));
  S.msgs = msgs;
  if (newPrio) { S.i = msgs.indexOf(newPrio); render(1); $('[data-role=live]')?.classList.add('flash'); setTimeout(() => $('[data-role=live]')?.classList.remove('flash'), 900); }
  else if (force || sig !== S.sig) { if (S.i >= msgs.length) S.i = 0; render(0); }
  S.sig = sig;
}
export function startLive() {
  S.msgs = liveMessages(); S.sig = S.msgs.map((m) => m.text).join('|'); S.i = 0; render(0); tick();
  document.addEventListener('visibilitychange', () => { $('[data-role=live]')?.classList.toggle('paused', isPaused()); });
}
actions({
  'live-next': () => { S.i = (S.i + 1) % S.msgs.length; render(1); tick(); },
  'live-prev': () => { S.i = (S.i - 1 + S.msgs.length) % S.msgs.length; render(-1); tick(); },
  'live-pause': () => { S.userPaused = !S.userPaused; render(0); },
});
