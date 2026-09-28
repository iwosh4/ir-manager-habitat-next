// Overlays: toasts (with UNDO), side panel (desktop) / bottom sheet (mobile), modal, popover menus, confirm.
// One layer stack: Esc closes the top-most overlay; focus is trapped and restored.
import { esc, el } from './dom.js';
import { icon } from './icons.js';

const stack = [];
export const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
function root() { let r = document.getElementById('overlays'); if (!r) { r = document.createElement('div'); r.id = 'overlays'; document.body.append(r); } return r; }

// ------------------------------------------------------------------ toasts
let toastHost = null;
export function toast(msg, { undo, action, actionLabel, kind = 'ok', ms = 6000 } = {}) {
  if (!toastHost) { toastHost = document.createElement('div'); toastHost.className = 'toasts'; toastHost.setAttribute('role', 'status'); toastHost.setAttribute('aria-live', 'polite'); document.body.append(toastHost); }
  const t = el(`<div class="toast t-${kind}"><span class="t-ico">${icon(kind === 'ok' ? 'checkCircle' : kind === 'warn' ? 'alert' : 'info')}</span><span class="t-msg">${esc(msg)}</span>${action ? `<button class="t-act">${esc(actionLabel || 'Open')}</button>` : ''}${undo ? `<button class="t-undo">${icon('undo')}Undo</button>` : ''}<button class="t-x" aria-label="Dismiss">${icon('x')}</button><i class="t-bar" style="animation-duration:${ms}ms"></i></div>`);
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 220); };
  t.querySelector('.t-x').onclick = close;
  if (undo) t.querySelector('.t-undo').onclick = () => { undo(); close(); };
  if (action) t.querySelector('.t-act').onclick = () => { action(); close(); };
  toastHost.append(t);
  while (toastHost.children.length > 3) toastHost.firstElementChild.remove();
  setTimeout(close, ms);
  return close;
}

// ------------------------------------------------------------------ panel (side drawer on desktop, bottom sheet on mobile)
export function panel({ title, sub, body, footer, width = 460, cls = '', onClose, mount, kind = 'auto', icon: ic } = {}) {
  const sheet = kind === 'sheet' || (kind === 'auto' && isMobile());
  const w = el(`<div class="ov ${sheet ? 'ov-sheet' : 'ov-drawer'} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title || '')}">
    <div class="ov-scrim" data-close></div>
    <section class="ov-box" style="${sheet ? '' : `width:min(${width}px, 100vw)`}">
      ${sheet ? '<div class="grab" data-close aria-hidden="true"><i></i></div>' : ''}
      ${title ? `<header class="ov-head">${ic ? `<span class="ov-ico">${icon(ic)}</span>` : ''}<div><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="icon-btn ov-x" data-close aria-label="Close">${icon('x')}</button></header>` : ''}
      <div class="ov-body">${body || ''}</div>
      ${footer ? `<footer class="ov-foot">${footer}</footer>` : ''}
    </section></div>`);
  return open(w, { onClose, mount });
}
export function modal({ title, sub, body, footer, width = 560, cls = '', onClose, mount, icon: ic } = {}) {
  if (isMobile()) return panel({ title, sub, body, footer, cls, onClose, mount, kind: 'sheet', icon: ic });
  const w = el(`<div class="ov ov-modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title || '')}">
    <div class="ov-scrim" data-close></div>
    <section class="ov-box" style="width:min(${width}px, calc(100vw - 32px))">
      ${title ? `<header class="ov-head">${ic ? `<span class="ov-ico">${icon(ic)}</span>` : ''}<div><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="icon-btn ov-x" data-close aria-label="Close">${icon('x')}</button></header>` : ''}
      <div class="ov-body">${body || ''}</div>${footer ? `<footer class="ov-foot">${footer}</footer>` : ''}
    </section></div>`);
  return open(w, { onClose, mount });
}
function open(w, { onClose, mount }) {
  const prev = document.activeElement;
  root().append(w);
  const h = { el: w, close: () => close(h), onClose, prev };
  stack.push(h);
  w.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { e.preventDefault(); h.close(); } });
  requestAnimationFrame(() => { w.classList.add('in'); const f = w.querySelector('[autofocus], .ov-body input:not([type=hidden]), .ov-body button, .ov-body [tabindex]'); (f || w.querySelector('.ov-box')).focus?.({ preventScroll: true }); });
  if (mount) mount(w, h);
  // swipe-down to close bottom sheets
  if (w.classList.contains('ov-sheet')) {
    const box = w.querySelector('.ov-box'), grab = w.querySelector('.grab'); let y0 = null;
    grab?.addEventListener('pointerdown', (e) => { y0 = e.clientY; grab.setPointerCapture(e.pointerId); });
    grab?.addEventListener('pointermove', (e) => { if (y0 != null) box.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
    grab?.addEventListener('pointerup', (e) => { if (y0 != null && e.clientY - y0 > 80) h.close(); else box.style.transform = ''; y0 = null; });
  }
  return h;
}
export function close(h = stack[stack.length - 1]) {
  if (!h) return;
  const i = stack.indexOf(h); if (i >= 0) stack.splice(i, 1);
  h.el.classList.remove('in'); h.el.classList.add('out');
  setTimeout(() => h.el.remove(), 200);
  h.onClose?.();
  h.prev?.focus?.({ preventScroll: true });
}
export function closeAll() { while (stack.length) close(stack[stack.length - 1]); }
export const topOverlay = () => stack[stack.length - 1];
export const overlayOpen = () => stack.length > 0;

// ------------------------------------------------------------------ popover menu (anchored), e.g. postpone presets, ••• actions
let pop = null;
export function menu(anchor, items, { align = 'end', title } = {}) {
  closeMenu();
  if (isMobile()) { // action sheet
    const body = `<div class="menu-sheet">${items.map((it, i) => it.sep ? '<hr>' : `<button class="ms-row ${it.danger ? 'danger' : ''}" data-mi="${i}" ${it.disabled ? 'disabled' : ''}>${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span>${it.hint ? `<em>${esc(it.hint)}</em>` : ''}</button>`).join('')}</div>`;
    const h = panel({ title: title || 'Actions', body, kind: 'sheet', cls: 'ov-menu' });
    h.el.querySelectorAll('[data-mi]').forEach((b) => (b.onclick = () => { h.close(); items[+b.dataset.mi].run?.(); }));
    return h;
  }
  const m = el(`<div class="menu" role="menu">${title ? `<div class="menu-t">${esc(title)}</div>` : ''}${items.map((it, i) => it.sep ? '<hr>' : `<button role="menuitem" class="${it.danger ? 'danger' : ''}" data-mi="${i}" ${it.disabled ? 'disabled' : ''}>${it.icon ? icon(it.icon) : '<i class="i"></i>'}<span>${esc(it.label)}</span>${it.hint ? `<em>${esc(it.hint)}</em>` : ''}</button>`).join('')}</div>`);
  document.body.append(m);
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  let x = align === 'end' ? r.right - mw : r.left, y = r.bottom + 6;
  if (y + mh > innerHeight - 8) y = r.top - mh - 6;
  m.style.left = `${Math.max(8, Math.min(innerWidth - mw - 8, x))}px`; m.style.top = `${Math.max(8, y)}px`;
  m.querySelectorAll('[data-mi]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); closeMenu(); items[+b.dataset.mi].run?.(); }));
  pop = m; m.querySelector('button:not([disabled])')?.focus();
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  return m;
}
function outside(e) { if (pop && !pop.contains(e.target)) closeMenu(); }
export function closeMenu() { if (pop) { pop.remove(); pop = null; document.removeEventListener('pointerdown', outside, true); return true; } return false; }

export function confirmDialog({ title, text, ok = 'Delete', danger = true }) {
  return new Promise((res) => {
    const h = modal({ title, width: 420, body: `<p class="confirm-text">${text}</p>`, footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>`, onClose: () => res(false) });
    h.el.querySelector('[data-ok]').onclick = () => { h.onClose = null; h.close(); res(true); };
  });
}
