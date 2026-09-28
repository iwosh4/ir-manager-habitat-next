// Application shell: desktop rail, two-layer ACTIVE HEADER (global + contextual), mobile top bar, bottom navigation.
import { esc, $, $$, action } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { NAV, MODULES } from '../nav.js';
import * as store from '../core/store.js';
import { notifications } from '../engine/notify.js';

export const BRAND = `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc16b"/><stop offset="1" stop-color="#d9781a"/></linearGradient></defs><path d="M16 2.5 28 9.5v13L16 29.5 4 22.5v-13Z" fill="url(#bm)"/><path d="M16 8.5 22.5 12.3v7.4L16 23.5l-6.5-3.8v-7.4Z" fill="#1b1206" opacity=".88"/><path d="M16 12.2 19.3 14.1v3.8L16 19.8l-3.3-1.9v-3.8Z" fill="url(#bm)"/></svg>`;

export function shellHTML() {
  const db = store.get();
  return `
  <a class="skip" href="#view">Skip to content</a>
  <aside class="rail" aria-label="Main navigation">
    <div class="rail-brand"><a href="#/dashboard" class="brand" aria-label="IR Manager — Dashboard">${BRAND}<span class="brand-txt"><b>IR MANAGER</b><i>Enterprise · Concept B</i></span></a><button class="icon-btn rail-toggle" data-act="rail-toggle" aria-label="Collapse navigation" title="Collapse">${icon('chevronLeft')}</button></div>
    <nav class="rail-nav">${NAV.filter((g) => g.group !== 'System').map((g) => `<div class="rail-group"><h6>${t(g.group)}</h6>${g.items.filter((i) => i.id !== 'tools' && i.id !== 'settings').map((i) => `<a href="#/${i.id}" class="rail-item" data-mod="${i.id}" title="${esc(t(i.label))}">${icon(i.icon)}<span>${t(i.label)}</span><em class="rail-badge" data-badge="${i.id}"></em></a>`).join('')}</div>`).join('')}</nav>
    <div class="rail-foot">
      <a href="#/tools" class="rail-item" data-mod="tools" title="${t('Tools')}">${icon('tools')}<span>${t('Tools')}</span></a>
      <a href="#/settings" class="rail-item" data-mod="settings" title="${t('Settings')}">${icon('settings')}<span>${t('Settings')}</span></a>
      <button class="rail-user" data-act="profile-menu"><span class="avatar">${esc(db.user.initials)}</span><span class="ru-txt"><b>${esc(db.user.name)}</b><i>${esc(db.user.role)}</i></span>${icon('moreV')}</button>
    </div>
  </aside>
  <div class="main-col">
    <header class="top" role="banner">
      <a href="#/dashboard" class="m-brand" aria-label="IR Manager">${BRAND}</a>
      <div class="m-title" data-role="m-title"></div>
      <button class="search-trigger" data-act="search" aria-label="${t('Search')}">${icon('search')}<span>${t('Search animals, tasks, enclosures…')}</span><kbd>/</kbd></button>
      <div class="top-tools">
        <button class="btn primary rec-btn" data-act="quick-record" title="Quick Record (Q)">${icon('plus')}<span>${t('Record')}</span><kbd>Q</kbd></button>
        <button class="icon-btn hide-m" data-act="qr" title="Scan QR / enter code">${icon('qr')}</button>
        <button class="icon-btn hide-m" data-act="voice" title="Voice / command">${icon('mic')}</button>
        <button class="icon-btn hide-m" data-act="tools-drawer" title="Multitool (T)">${icon('tools')}</button>
        <button class="icon-btn m-only" data-act="search" aria-label="${t('Search')}">${icon('search')}</button>
        <button class="icon-btn bell" data-act="notifications" title="${t('Notifications')}" aria-label="${t('Notifications')}">${icon('bell')}<em class="dot" data-role="bell-count"></em></button>
        <span class="sync hide-m" data-role="sync" title="Local persistence">${icon('cloud')}<span>${t('Saved')}</span></span>
      </div>
    </header>
    <div class="ctx" data-role="ctx"></div>
    <main id="view" class="view" tabindex="-1"></main>
  </div>
  <nav class="bnav" aria-label="Primary">
    <a href="#/dashboard" data-bn="dashboard">${icon('home')}<span>${t('Home')}</span></a>
    <a href="#/animals" data-bn="animals">${icon('animals')}<span>${t('Animals')}</span></a>
    <button class="bn-rec" data-act="quick-record" aria-label="${t('Quick Record')}">${icon('plus')}</button>
    <a href="#/tasks" data-bn="tasks">${icon('tasks')}<span>${t('Tasks')}</span><em class="bn-badge" data-role="bn-tasks"></em></a>
    <button data-act="more" data-bn="more">${icon('menu')}<span>${t('More')}</span></button>
  </nav>`;
}

/** Context bar: workspace title, sub-destinations, contextual actions (from the view). */
export function renderContext(route, ctx = {}) {
  const mod = MODULES[route.mod];
  const tabs = ctx.tabs ?? mod?.subs ?? [];
  const cur = ctx.activeTab ?? route.sub ?? tabs[0]?.[0];
  const title = ctx.title ?? t(mod?.label || '');
  const acts = ctx.actions || [];
  const bar = $('[data-role=ctx]');
  bar.innerHTML = `
    <div class="ctx-l">
      ${ctx.back ? `<a class="icon-btn ctx-back" href="${ctx.back}" aria-label="Back">${icon('arrowLeft')}</a>` : `<span class="ctx-ico">${icon(ctx.icon || mod?.icon || 'dot')}</span>`}
      <div class="ctx-t"><h1>${ctx.titleHTML || esc(title)}</h1>${ctx.sub ? `<span class="ctx-sub">${ctx.sub}</span>` : ''}</div>
      ${tabs.length ? `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" href="#/${route.mod}/${k}" class="tab ${k === cur ? 'on' : ''}" aria-selected="${k === cur}">${t(l)}${ctx.counts?.[k] != null ? `<em>${ctx.counts[k]}</em>` : ''}</a>`).join('')}</div>` : ''}
    </div>
    <div class="ctx-r">${ctx.extra || ''}${acts.map((a) => `<button class="btn ${a.primary ? 'primary' : a.ghost ? 'ghost' : ''} ${a.hideM ? 'hide-m' : ''}" data-act="${a.act}" ${Object.entries(a.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} title="${esc(a.title || a.label)}">${a.icon ? icon(a.icon) : ''}<span>${esc(a.label)}</span>${a.kbd ? `<kbd>${a.kbd}</kbd>` : ''}</button>`).join('')}</div>`;
  $('[data-role=m-title]').innerHTML = `<b>${esc(ctx.mTitle || title)}</b>`;
  bar.hidden = !!ctx.hideCtx;
}

export function markActive(route) {
  for (const a of $$('.rail-item')) a.classList.toggle('on', a.dataset.mod === route.mod);
  for (const a of $$('.bnav [data-bn]')) a.classList.toggle('on', a.dataset.bn === route.mod || (a.dataset.bn === 'more' && !['dashboard', 'animals', 'tasks'].includes(route.mod)));
}

export function refreshBadges() {
  const n = notifications(store.get()).filter((x) => !x.read);
  const b = $('[data-role=bell-count]'); if (b) { b.textContent = n.length ? String(n.length) : ''; b.classList.toggle('hot', n.some((x) => x.prio === 'high')); }
  const overdue = n.filter((x) => x.kind === 'overdue').reduce((s, x) => s + (x.count || 1), 0);
  const bt = $('[data-role=bn-tasks]'); if (bt) bt.textContent = overdue ? String(overdue) : '';
  for (const e of $$('[data-badge]')) {
    const k = e.dataset.badge;
    const v = k === 'tasks' ? overdue : k === 'health' ? n.filter((x) => x.kind === 'health').length : k === 'inventory' ? n.filter((x) => x.kind === 'stock').length : k === 'reproduction' ? n.filter((x) => x.kind === 'repro' || x.kind === 'incubation').length : 0;
    e.textContent = v ? String(v) : ''; e.classList.toggle('hot', k === 'tasks' && v > 0);
  }
}
export function refreshSync() {
  const s = $('[data-role=sync]'); if (!s) return;
  s.classList.toggle('busy', !store.status.saved);
  s.querySelector('span').textContent = store.status.saved ? (store.status.storage === 'memory' ? 'Not persisted' : t('Saved')) : t('Saving…');
}

action('rail-toggle', () => { document.body.classList.toggle('rail-c'); try { localStorage.setItem('irmB.rail', document.body.classList.contains('rail-c') ? 'c' : ''); } catch {} });
