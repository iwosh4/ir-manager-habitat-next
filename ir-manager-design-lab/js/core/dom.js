// Tiny DOM helpers: HTML-string templating with escaping, delegated actions, element lookup.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = (o) => Object.entries(o).filter(([, v]) => v !== false && v != null).map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`)).join(' ');
export const cls = (...a) => a.filter(Boolean).join(' ');
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const when = (c, a, b = '') => (c ? a : b);
export const each = (arr, fn) => (arr || []).map(fn).join('');
export function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

/** Global delegated action registry: <button data-act="name" data-x="..">. Handlers get (el, event). */
const ACTIONS = new Map();
export function action(name, fn) { ACTIONS.set(name, fn); }
export function actions(obj) { for (const [k, v] of Object.entries(obj)) ACTIONS.set(k, v); }
export function runAction(name, el, ev) { const fn = ACTIONS.get(name); if (!fn) { console.warn('no action', name); return; } return fn(el, ev); }
export function installDelegation(root = document) {
  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]');
    if (!t || t.disabled || t.closest('[inert]')) return;
    if (t.tagName === 'A' && !t.dataset.keepHref) ev.preventDefault();
    ev.stopPropagation();
    runAction(t.dataset.act, t, ev);
  });
  root.addEventListener('change', (ev) => { const t = ev.target.closest('[data-change]'); if (t) runAction(t.dataset.change, t, ev); });
  root.addEventListener('input', (ev) => { const t = ev.target.closest('[data-input]'); if (t) runAction(t.dataset.input, t, ev); });
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.matches('[data-enter]')) { ev.preventDefault(); runAction(ev.target.dataset.enter, ev.target, ev); }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-act]:not(button):not(a):not(input)')) { ev.preventDefault(); runAction(ev.target.dataset.act, ev.target, ev); }
  });
}

export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] ||= []).push(x); return m; }, {});
export const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
