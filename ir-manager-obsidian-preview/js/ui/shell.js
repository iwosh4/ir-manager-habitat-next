// SHELL — sidebar (IR brand + modules), premium header, live information strip, mobile bottom nav.
// Header order (zadání): Rychlý záznam · QR · Hlas · Hledat · Oznámení · Profil · kajman (podpis značky).
import { esc, $, $$ } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { NAV, SECONDARY, MODULES } from '../nav.js';
import { notifications } from '../engine/notify.js';
import { buildTimeline, isOpen } from '../engine/timeline.js';
import { DAY, startOfDay } from '../core/time.js';

export function shellHTML() {
  const db = store.get();
  return `
  <aside class="sb" aria-label="Hlavní navigace">
    <a class="sb-brand" href="#/prehled" aria-label="IR Manager — Přehled"><img src="assets/ir/ir-logo-mark.webp" alt=""><span><b>IR MANAGER</b><i>TERARISTIKA</i></span></a>
    <nav class="sb-nav" data-role="sb-nav">
      <i class="sb-ind" data-role="sb-ind" aria-hidden="true"></i>
      ${NAV.map((m) => `<div class="sb-grp" data-grp="${m.id}">
        <a class="sb-item" href="#/${m.id}${m.subs[0] ? `/${m.subs[0][0]}` : ''}" data-mod="${m.id}" title="${esc(m.label)}">${ico(m.icon, 'sb-ico')}<span>${esc(m.label)}</span><em class="sb-badge" data-badge="${m.id}"></em></a>
        ${m.subs.length ? `<div class="sb-subs">${m.subs.map(([k, l]) => `<a href="#/${m.id}/${k}" data-sub="${m.id}/${k}">${esc(l)}</a>`).join('')}</div>` : ''}
      </div>`).join('')}
    </nav>
    <div class="sb-foot">
      ${SECONDARY.map((m) => `<a class="sb-item sm" href="#/${m.id}" data-mod="${m.id}" title="${esc(m.label)}">${gl(m.icon, 'sb-gl')}<span>${esc(m.label)}</span><kbd>T</kbd></a>`).join('')}
      <a class="sb-studio" href="#/ubikace/studio" title="Habitat Studio"><img src="assets/img/enclosures/room-iso.webp" alt="" loading="lazy"><span><b>Habitat Studio</b><i>3D návrh chovné místnosti</i></span>${gl('arrow-right')}</a>
      <button class="sb-collapse icon-btn sm" data-act="sb-toggle" aria-label="Sbalit navigaci" title="Sbalit navigaci">${gl('chevron-left')}</button>
    </div>
  </aside>
  <div class="stage">
    <header class="hd" role="banner">
      <a class="hd-mbrand" href="#/prehled" aria-label="IR Manager"><img src="assets/ir/ir-logo-mark.webp" alt=""></a>
      <div class="hd-mtitle" data-role="m-title"></div>
      <div class="hd-actions" aria-label="Rychlé akce">
        <button class="hd-rec" data-act="quick-record" title="Rychlý záznam (Q)">${ico('quick-add', 'hd-rec-ico')}<span>Rychlý záznam</span><kbd>Q</kbd></button>
        <button class="hd-tool" data-act="qr" data-role="qr" title="Skenovat QR kód">${ico('scan', 'hd-tico')}<span>QR</span><i class="scanline" aria-hidden="true"></i></button>
        <button class="hd-tool" data-act="voice" data-role="voice" title="Hlasové zadání">${gl('mic', 'hd-gl')}<span>Hlas</span><i class="wave" aria-hidden="true"><b></b><b></b><b></b><b></b></i></button>
      </div>
      <button class="hd-search" data-act="search" aria-label="Hledat">${ico('search', 'hd-sico')}<span>Hledat zvíře, úkol, ubikaci…</span><kbd>Ctrl K</kbd></button>
      <div class="hd-right">
        <button class="hd-icon hd-m" data-act="search" aria-label="Hledat">${gl('search')}</button>
        <button class="hd-bell" data-act="notifications" data-role="bell" aria-label="Oznámení">${ico('notification', 'hd-bico')}<em class="hd-badge" data-role="bell-count"></em><i class="ring" aria-hidden="true"></i></button>
        <button class="hd-profile" data-act="profile" aria-label="Účet uživatele"><span class="hd-av">${esc(db.user.initials)}<i class="hd-sync" data-role="sync-dot" title="Uloženo"></i></span><span class="hd-pt"><b>${esc(db.user.name)}</b><i>Chovatel · místnost A</i></span>${gl('chevron-down')}</button>
        <a class="hd-caiman" href="#/prehled" aria-label="IR Manager" title="IR Manager"><img src="assets/ir/caiman-eye-crop.webp" alt=""><i class="glint" aria-hidden="true"></i></a>
      </div>
    </header>
    <div class="live" data-role="live" aria-label="Živé provozní informace"></div>
    <main id="view" class="view" tabindex="-1"></main>
  </div>
  <nav class="bn" aria-label="Mobilní navigace">
    <a href="#/prehled" data-bn="prehled">${gl('home')}<span>Domů</span></a>
    <a href="#/zvirata/mrizka" data-bn="zvirata">${gl('animals')}<span>Zvířata</span></a>
    <button class="bn-plus" data-act="quick-record" aria-label="Rychlý záznam">${gl('plus')}</button>
    <a href="#/ukoly/dnes" data-bn="ukoly">${gl('task')}<span>Úkoly</span><em class="bn-badge" data-role="bn-tasks"></em></a>
    <button data-act="more" data-bn="more">${gl('menu')}<span>Více</span></button>
  </nav>`;
}

/** Active module: amber edge indicator glides to the active item (transform only). */
export function markActive(route) {
  for (const a of $$('.sb-item')) a.classList.toggle('on', a.dataset.mod === route.mod);
  for (const g of $$('.sb-grp')) g.classList.toggle('open', g.dataset.grp === route.mod);
  for (const a of $$('.sb-subs a')) a.classList.toggle('on', a.dataset.sub === `${route.mod}/${route.sub}`);
  for (const a of $$('.bn [data-bn]')) a.classList.toggle('on', a.dataset.bn === route.mod || (a.dataset.bn === 'more' && !['prehled', 'zvirata', 'ukoly'].includes(route.mod)));
  requestAnimationFrame(() => {
    const on = $('.sb-nav .sb-item.on'), ind = $('[data-role=sb-ind]'), nav = $('[data-role=sb-nav]');
    if (!ind || !nav) return;
    if (!on) { ind.style.opacity = 0; return; }
    const y = on.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
    ind.style.opacity = 1; ind.style.transform = `translateY(${y}px)`; ind.style.height = `${on.offsetHeight}px`;
  });
  const t = $('[data-role=m-title]'); if (t) t.textContent = MODULES[route.mod]?.label || 'IR Manager';
}

let lastBell = { n: -1, urgent: false };
export function refreshBadges() {
  const db = store.get(), n = notifications(db).filter((x) => !x.read), urgent = n.some((x) => x.prio === 'high');
  const b = $('[data-role=bell-count]'), bell = $('[data-role=bell]');
  if (b) { b.textContent = n.length ? (n.length > 99 ? '99+' : String(n.length)) : ''; }
  if (bell) {
    bell.classList.toggle('urgent', urgent);
    // pulse once when the count grows (new information), never loop
    if (lastBell.n >= 0 && n.length > lastBell.n) { bell.classList.remove('pulse'); void bell.offsetWidth; bell.classList.add('pulse'); }
  }
  lastBell = { n: n.length, urgent };
  const nowTs = Date.now(), items = buildTimeline(db, { from: nowTs - 7 * DAY, to: startOfDay(nowTs) + DAY, includeHistory: false }).filter(isOpen);
  const od = items.filter((i) => i.status === 'overdue').length, today = items.length;
  const tb = $('[data-badge=ukoly]'); if (tb) { tb.textContent = today || ''; tb.classList.toggle('bad', od > 0); }
  const bt = $('[data-role=bn-tasks]'); if (bt) bt.textContent = od ? String(od) : '';
  const hb = $('[data-badge=zdravi]'); if (hb) hb.textContent = db.health.filter((h) => !h.resolved).length || '';
  const ib = $('[data-badge=sklad]'); if (ib) { const low = db.inventory.filter((x) => x.qty < x.min).length; ib.textContent = low || ''; }
  const rb = $('[data-badge=reprodukce]'); if (rb) rb.textContent = db.clutches.filter((c) => c.status === 'incubating').length || '';
}

/** Save / sync state: saving → rotating ring, saved → brief check, offline → disconnected. */
let syncT = 0;
export function setSync(state) {
  const d = $('[data-role=sync-dot]'), l = $('[data-role=live-sync]');
  for (const x of [d, l]) { if (!x) continue; x.classList.remove('saving', 'saved', 'offline'); x.classList.add(state); }
  if (l) l.innerHTML = state === 'saving' ? `${gl('sync')}<span>Ukládám…</span>` : state === 'offline' ? `${gl('cloud-off')}<span>Offline · ukládá se v zařízení</span>` : `${gl('cloud-check')}<span>Uloženo</span>`;
  if (d) d.title = state === 'saving' ? 'Ukládám…' : state === 'offline' ? 'Offline' : 'Uloženo';
  clearTimeout(syncT);
  if (state === 'saved') syncT = setTimeout(() => { d?.classList.remove('saved'); l?.classList.remove('saved'); }, 1600);
}
