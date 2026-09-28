// WORKSPACE — customizable widget grid inside safe design constraints (controlled 12-column grid, 4 sizes,
// curated accents & frames). Edit mode: add, remove, move (drag or ← →), resize, configure, duplicate, reset, presets.
import { esc, actions, $ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as store from '../core/store.js';
import { modal, panel, close as closeOv, menu, toast, isMobile, confirmDialog } from '../core/overlay.js';
import { ws, saveWs, wid, newDoc, doc } from './wsstore.js';
import { WIDGETS, DEFAULTS, PRESETS, CATS, ACCENTS, FRAMES } from './registry.js';
import { renderTool, TOOLS } from './tools.js';

const SIZES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large'], ['w', 'Wide']];
const ICONS = ['dashboard', 'star', 'feed', 'repro', 'egg', 'health', 'shopping', 'notebook', 'checklist', 'calculator', 'flag', 'pin', 'truck', 'coins', 'sun', 'leaf', 'bug', 'box3d', 'tag', 'bolt'];
let editing = null; // workspace key in edit mode

function materialize(inst) {
  const W = WIDGETS[inst.type];
  const o = { id: wid(), type: inst.type, size: inst.size || W?.size || 'm', title: inst.title || '', accent: inst.accent || (W?.doc ? 'neutral' : 'neutral'), frame: inst.frame || (inst.accent ? 'strip' : 'line'), icon: inst.icon || '', density: inst.density || 'comfortable', collapsed: false, cfg: inst.cfg || {} };
  if (W?.doc) o.docId = newDoc(W.doc, { title: inst.title || W.name, accent: inst.accent || 'neutral', ...(inst.seed || {}), items: (inst.seed?.items || []).map((x) => ({ id: Math.random().toString(36).slice(2, 8), done: false, ...x })) });
  return o;
}
export function layout(key) {
  const S = ws();
  if (!S.layouts[key]) { S.layouts[key] = (DEFAULTS[key] || []).map(materialize); saveWs(); }
  return S.layouts[key];
}
const find = (key, id) => layout(key).find((x) => x.id === id);

/** Render a workspace grid. */
export function workspaceHTML(key, { title = '', lead = '' } = {}) {
  const items = layout(key), ed = editing === key;
  return `<section class="wsp ${ed ? 'editing' : ''}" data-ws="${key}">
    <div class="wsp-bar">${title ? `<h2 class="wsp-t">${title}</h2>` : ''}${lead}<span class="spacer"></span>
      ${ed ? `<span class="wsp-hint">${icon('drag')}Drag widgets or use ← → · sizes S M L W · ${icon('palette')} colours</span><button class="btn sm" data-act="ws-add" data-ws="${key}">${icon('plus')}${t('Add widget')}</button>${key === 'dashboard' ? `<button class="btn sm" data-act="ws-presets" data-ws="${key}">${icon('layout')}Presets</button>` : ''}<button class="btn sm ghost" data-act="ws-reset" data-ws="${key}">${icon('refresh')}${t('Reset to default')}</button><button class="btn sm primary" data-act="ws-done">${icon('check')}${t('Done editing')}</button>`
      : `<button class="btn sm ghost ws-editbtn" data-act="ws-edit" data-ws="${key}">${icon('layout')}${t('Edit workspace')}</button>`}
    </div>
    <div class="wgrid" data-grid="${key}">${items.map((w, i) => widgetHTML(key, w, i, items.length)).join('')}${ed ? `<button class="w-addtile" data-act="ws-add" data-ws="${key}">${icon('plusCircle')}<b>${t('Add widget')}</b><span>Library · ${Object.keys(WIDGETS).length} widgets & tools</span></button>` : ''}</div>
  </section>`;
}
function widgetHTML(key, w, i, n) {
  const W = WIDGETS[w.type]; if (!W) return '';
  const d = w.docId ? doc(w.docId) : null;
  const title = w.title || d?.title || W.name, accent = d?.accent && d.accent !== 'neutral' ? d.accent : w.accent;
  const ed = editing === key;
  const frame = W.noFrame && !ed ? 'none' : w.frame;
  let body = '';
  if (!W.tool) { try { body = W.render.call(W, w) ; } catch (e) { console.error(e); body = `<p class="muted">Widget error: ${esc(e.message)}</p>`; } }
  return `<article class="w w-${w.size} acc-${accent || 'neutral'} fr-${frame} dn-${w.density} ${w.collapsed ? 'collapsed' : ''} ${W.noFrame && !ed ? 'bare' : ''}" data-wid="${w.id}" data-type="${w.type}" style="--acc:var(--acc-${accent || 'neutral'})">
    ${W.noFrame && !ed ? '' : `<header class="w-h">${ed ? `<span class="w-drag" data-drag title="Drag to move" aria-hidden="true">${icon('drag')}</span>` : ''}<span class="w-ico">${icon(w.icon || W.icon)}</span><h3>${esc(title)}</h3>
      <span class="w-a">${ed ? `<button class="icon-btn sm" data-act="ws-move" data-ws="${key}" data-id="${w.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} title="Move earlier" aria-label="Move earlier">${icon('arrowLeft')}</button><button class="icon-btn sm" data-act="ws-move" data-ws="${key}" data-id="${w.id}" data-d="1" ${i === n - 1 ? 'disabled' : ''} title="Move later" aria-label="Move later">${icon('arrowRight')}</button>
        <span class="w-sz">${W.sizes.map((s) => `<button class="${w.size === s ? 'on' : ''}" data-act="ws-size" data-ws="${key}" data-id="${w.id}" data-v="${s}" title="${SIZES.find((x) => x[0] === s)[1]}">${s.toUpperCase()}</button>`).join('')}</span>
        <button class="icon-btn sm" data-act="ws-config" data-ws="${key}" data-id="${w.id}" title="Configure" aria-label="Configure">${icon('palette')}</button>${W.multi || !W.tool ? `<button class="icon-btn sm" data-act="ws-dup" data-ws="${key}" data-id="${w.id}" title="Duplicate" aria-label="Duplicate">${icon('copy')}</button>` : ''}<button class="icon-btn sm" data-act="ws-remove" data-ws="${key}" data-id="${w.id}" title="Remove" aria-label="Remove">${icon('trash')}</button>`
        : `<button class="icon-btn sm w-col" data-act="ws-collapse" data-ws="${key}" data-id="${w.id}" title="${w.collapsed ? 'Expand' : 'Collapse'}" aria-expanded="${!w.collapsed}">${icon(w.collapsed ? 'chevronDown' : 'chevronUp')}</button>${W.tool ? `<button class="icon-btn sm hide-m" data-act="tools-drawer" data-tool="${W.tool}" title="Open in Multitool">${icon('maximize')}</button>` : ''}`}</span></header>`}
    <div class="w-b" ${W.tool ? `data-tool-mount="${W.tool}" data-key="${w.id}" data-doc="${w.docId || ''}" data-ctx="${w.cfg?.ctx || key}"` : ''}>${body}</div>
  </article>`;
}
/** After the view HTML is in the DOM: mount tool widgets & drag. */
export function mountWorkspace(root) {
  for (const el of root.querySelectorAll('[data-tool-mount]')) renderTool(el, el.dataset.toolMount, { key: el.dataset.key, docId: el.dataset.doc || null, ctx: el.dataset.ctx });
  for (const g of root.querySelectorAll('.wsp.editing .wgrid')) enableDrag(g);
}

// ---------------------------------------------------------------- drag & drop reordering (pointer events, FLIP)
function enableDrag(grid) {
  const key = grid.dataset.grid;
  grid.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-drag]'); if (!h) return;
    const card = h.closest('.w'); e.preventDefault();
    const r = card.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const ghost = card.cloneNode(true); ghost.classList.add('w-ghost'); ghost.style.width = `${r.width}px`; ghost.style.height = `${r.height}px`; document.body.append(ghost);
    card.classList.add('w-placeholder');
    const move = (ev) => {
      ghost.style.transform = `translate(${ev.clientX - ox}px, ${ev.clientY - oy}px) rotate(1deg)`;
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.wgrid > .w');
      if (over && over !== card && over.parentElement === grid) {
        const before = [...grid.children].indexOf(over) < [...grid.children].indexOf(card);
        const first = new Map([...grid.children].map((c) => [c, c.getBoundingClientRect()]));
        grid.insertBefore(card, before ? over : over.nextSibling);
        for (const c of grid.children) { const f = first.get(c), l = c.getBoundingClientRect(); if (!f || c === card) continue; const dx = f.left - l.left, dy = f.top - l.top; if (dx || dy) { c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }); } }
      }
      const vh = innerHeight; const v = $('#view'); if (ev.clientY > vh - 60) v.scrollTop += 14; if (ev.clientY < 120) v.scrollTop -= 14;
    };
    const up = () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); ghost.remove(); card.classList.remove('w-placeholder');
      const order = [...grid.querySelectorAll('.w')].map((c) => c.dataset.wid);
      const L = layout(key); L.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); saveWs(); store.emit('change');
    };
    move(e);
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  });
}

// ---------------------------------------------------------------- library
function openLibrary(key) {
  let q = '', cat = 'All';
  const h = modal({ title: 'Widget library', sub: `Add to ${key === 'dashboard' ? 'Dashboard' : key} · curated tools & information`, icon: 'library', width: 860, cls: 'lib-modal', body: '<div data-lib></div>' });
  const draw = () => {
    const list = Object.entries(WIDGETS).filter(([k, w]) => (cat === 'All' || w.cat === cat) && (!q || `${w.name} ${w.desc} ${w.cat} ${k}`.toLowerCase().includes(q.toLowerCase())));
    const counts = {}; for (const w of Object.values(WIDGETS)) counts[w.cat] = (counts[w.cat] || 0) + 1;
    h.el.querySelector('[data-lib]').innerHTML = `<div class="lib"><aside class="lib-cats"><button class="${cat === 'All' ? 'on' : ''}" data-cat="All">All<em>${Object.keys(WIDGETS).length}</em></button>${CATS.filter((c) => counts[c]).map((c) => `<button class="${cat === c ? 'on' : ''}" data-cat="${c}">${c}<em>${counts[c]}</em></button>`).join('')}</aside>
      <div class="lib-main"><div class="qr-search"><span>${icon('search')}</span><input type="search" placeholder="Search: shopping, notes, calculator, incubation, stock…" value="${esc(q)}" data-libq autofocus></div>
      <div class="lib-grid">${list.map(([k, w]) => `<button class="lib-i" data-add="${k}"><span class="lib-prev c-${w.cat.toLowerCase()}">${icon(w.icon)}${w.multi ? '<em>multi</em>' : ''}</span><span class="lib-t"><b>${esc(w.name)}</b><span>${esc(w.desc)}</span><i>${esc(w.cat)} · ${w.sizes.map((s) => s.toUpperCase()).join(' ')}</i></span><span class="lib-plus">${icon('plus')}</span></button>`).join('') || '<p class="muted pad">No widget matches.</p>'}</div></div></div>`;
    const inp = h.el.querySelector('[data-libq]'); inp.oninput = () => { q = inp.value; const pos = inp.selectionStart; draw(); const i2 = h.el.querySelector('[data-libq]'); i2.focus(); i2.setSelectionRange(pos, pos); };
  };
  h.el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; draw(); return; }
    const a = e.target.closest('[data-add]'); if (a) {
      const W = WIDGETS[a.dataset.add];
      const inst = materialize({ type: a.dataset.add, size: W.size, cfg: { ctx: key }, accent: W.doc ? ['amber', 'blue', 'violet', 'teal', 'green'][layout(key).filter((x) => x.type === a.dataset.add).length % 5] : undefined, title: W.doc ? undefined : undefined });
      layout(key).push(inst); saveWs(); closeOv(h); store.emit('change');
      toast(`Added “${W.name}”`, { undo: () => { const L = layout(key); L.splice(L.findIndex((x) => x.id === inst.id), 1); saveWs(); store.emit('change'); } });
      setTimeout(() => document.querySelector(`[data-wid="${inst.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
    }
  });
  draw();
}
function openConfig(key, id) {
  const w = find(key, id), W = WIDGETS[w.type], d = w.docId ? doc(w.docId) : null;
  const acc = d ? d.accent : w.accent;
  const body = `<div class="stack">
    <label class="field"><span>Title</span><input type="text" data-c="title" value="${esc(w.title || d?.title || W.name)}"></label>
    <div class="field"><span>Accent colour</span><div class="acc-pick">${ACCENTS.map((a) => `<button class="acc-sw ${acc === a ? 'on' : ''}" data-c-acc="${a}" style="--acc:var(--acc-${a})" title="${a}" aria-label="${a}"></button>`).join('')}</div></div>
    <div class="field"><span>Frame style</span><div class="chips">${FRAMES.map(([k, l]) => `<button class="chip ${w.frame === k ? 'on' : ''}" data-c-frame="${k}">${l}</button>`).join('')}</div></div>
    <div class="grid2"><div class="field"><span>Size</span><div class="seg">${SIZES.filter(([s]) => W.sizes.includes(s)).map(([s, l]) => `<button class="${w.size === s ? 'on' : ''}" data-c-size="${s}">${l}</button>`).join('')}</div></div>
    <div class="field"><span>Density</span><div class="seg"><button class="${w.density !== 'compact' ? 'on' : ''}" data-c-den="comfortable">Comfortable</button><button class="${w.density === 'compact' ? 'on' : ''}" data-c-den="compact">Compact</button></div></div></div>
    <div class="field"><span>Icon</span><div class="ico-pick">${['', ...ICONS].map((ic) => `<button class="${(w.icon || '') === ic ? 'on' : ''}" data-c-ico="${ic}" title="${ic || 'default'}">${icon(ic || W.icon)}</button>`).join('')}</div></div>
    ${w.type === 'budget' ? `<div class="field"><span>Monthly budget (Kč)</span>${Object.entries(w.cfg?.budget || W.cfg.budget).map(([k, v]) => `<label class="row"><span style="width:110px">${k}</span><input type="number" data-c-bud="${k}" value="${v}"></label>`).join('')}</div>` : ''}
    <div class="w-prev" data-prev></div></div>`;
  const h = panel({ title: 'Configure widget', sub: `${W.name}${W.multi ? ' · this instance only' : ''}`, icon: 'palette', width: 440, body, footer: `<button class="btn ghost" data-close>Close</button>` });
  const upd = (fn) => { fn(); if (d) { d.title = w.title || d.title; } saveWs(); store.emit('change'); draw(); };
  const draw = () => { const p = h.el.querySelector('[data-prev]'); const a2 = d ? d.accent : w.accent; p.innerHTML = `<div class="w w-prevbox acc-${a2} fr-${w.frame}" style="--acc:var(--acc-${a2})"><header class="w-h"><span class="w-ico">${icon(w.icon || W.icon)}</span><h3>${esc(w.title || d?.title || W.name)}</h3></header><div class="w-b"><p class="muted small">Preview of frame & accent</p></div></div>`; h.el.querySelectorAll('[data-c-acc]').forEach((b) => b.classList.toggle('on', b.dataset.cAcc === a2)); h.el.querySelectorAll('[data-c-frame]').forEach((b) => b.classList.toggle('on', b.dataset.cFrame === w.frame)); h.el.querySelectorAll('[data-c-size]').forEach((b) => b.classList.toggle('on', b.dataset.cSize === w.size)); h.el.querySelectorAll('[data-c-den]').forEach((b) => b.classList.toggle('on', b.dataset.cDen === w.density)); h.el.querySelectorAll('[data-c-ico]').forEach((b) => b.classList.toggle('on', b.dataset.cIco === (w.icon || ''))); };
  h.el.querySelector('[data-c=title]').addEventListener('input', (e) => { w.title = e.target.value; if (d) d.title = e.target.value; saveWs(); store.emit('change'); draw(); });
  h.el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cAcc) upd(() => { if (d) d.accent = b.dataset.cAcc; w.accent = b.dataset.cAcc; if (w.frame === 'none') w.frame = 'strip'; });
    if (b.dataset.cFrame) upd(() => { w.frame = b.dataset.cFrame; });
    if (b.dataset.cSize) upd(() => { w.size = b.dataset.cSize; });
    if (b.dataset.cDen) upd(() => { w.density = b.dataset.cDen; });
    if (b.dataset.cIco != null && b.hasAttribute('data-c-ico')) upd(() => { w.icon = b.dataset.cIco; });
  });
  h.el.querySelectorAll('[data-c-bud]').forEach((inp) => inp.addEventListener('change', () => { w.cfg.budget = { ...(w.cfg.budget || W.cfg.budget), [inp.dataset.cBud]: +inp.value }; saveWs(); store.emit('change'); }));
  draw();
}

actions({
  'ws-edit': (el) => { editing = el.dataset.ws; document.body.classList.add('ws-edit'); store.emit('change'); },
  'ws-done': () => { editing = null; document.body.classList.remove('ws-edit'); saveWs(true); store.emit('change'); toast('Workspace saved', { kind: 'ok', ms: 2200 }); },
  'ws-add': (el) => openLibrary(el.dataset.ws),
  'ws-config': (el) => openConfig(el.dataset.ws, el.dataset.id),
  'ws-size': (el) => { find(el.dataset.ws, el.dataset.id).size = el.dataset.v; saveWs(); store.emit('change'); },
  'ws-collapse': (el) => { const w = find(el.dataset.ws, el.dataset.id); w.collapsed = !w.collapsed; saveWs(); store.emit('change'); },
  'ws-move': (el) => { const L = layout(el.dataset.ws), i = L.findIndex((x) => x.id === el.dataset.id), j = i + +el.dataset.d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; saveWs(); store.emit('change'); requestAnimationFrame(() => document.querySelector(`[data-wid="${el.dataset.id}"] [data-act=ws-move][data-d="${el.dataset.d}"]`)?.focus()); },
  'ws-dup': (el) => { const L = layout(el.dataset.ws), w = find(el.dataset.ws, el.dataset.id), c = JSON.parse(JSON.stringify(w)); c.id = wid(); if (w.docId) { const d = doc(w.docId); c.docId = newDoc(d.kind, { ...JSON.parse(JSON.stringify(d)), title: `${d.title} (copy)` }); c.title = `${d.title} (copy)`; } L.splice(L.indexOf(w) + 1, 0, c); saveWs(); store.emit('change'); toast('Widget duplicated', { kind: 'ok', ms: 2000 }); },
  'ws-remove': (el) => { const L = layout(el.dataset.ws), i = L.findIndex((x) => x.id === el.dataset.id), [w] = L.splice(i, 1); saveWs(); store.emit('change'); toast(`Removed “${w.title || WIDGETS[w.type].name}”`, { undo: () => { L.splice(i, 0, w); saveWs(); store.emit('change'); } }); },
  'ws-reset': async (el) => { const key = el.dataset.ws; if (!(await confirmDialog({ title: 'Reset to default?', text: 'Restores the default layout for this workspace. Your notes and shopping lists are kept in the Multitool.', ok: 'Reset', danger: false }))) return; const S = ws(), prev = S.layouts[key]; delete S.layouts[key]; layout(key); saveWs(); store.emit('change'); toast('Layout reset', { undo: () => { S.layouts[key] = prev; saveWs(); store.emit('change'); } }); },
  'ws-presets': (el) => menu(el, Object.entries(PRESETS).map(([k, p]) => ({ icon: 'layout', label: p.name, hint: p.desc, run: () => { const S = ws(), key = el.dataset.ws, prev = S.layouts[key]; S.layouts[key] = p.layout().map(materialize); saveWs(); store.emit('change'); toast(`Applied preset “${p.name}”`, { undo: () => { S.layouts[key] = prev; saveWs(); store.emit('change'); } }); } })), { title: 'Workspace presets' }),
  'w-bulk': (el) => import('../engine/actions.js').then((A) => import('../ui/feedback.js').then((F) => F.done(A.complete(el.dataset.ids.split(','))))),
  'w-shop1': (el) => import('./tools.js').then((m) => { const r = m.addItemToShopping(el.dataset.id); toast(r?.dup ? `Already on “${r.title}”` : `Added to “${r.title}”`, { kind: r?.dup ? 'info' : 'ok', action: () => import('./tooldrawer.js').then((x) => x.openToolDrawer('shopping', r.id)), actionLabel: 'Open list' }); store.emit('change'); }),
  'w-shopall': () => import('./tools.js').then((m) => { const n = m.addLowStockToShopping(); toast(n ? `Added ${n} low-stock items to shopping lists` : 'All low-stock items are already on a list', { kind: n ? 'ok' : 'info', action: () => import('./tooldrawer.js').then((x) => x.openToolDrawer('shopping')), actionLabel: 'Open lists' }); store.emit('change'); }),
});
export const isEditing = () => editing;
export function exitEdit() { editing = null; document.body.classList.remove('ws-edit'); }
