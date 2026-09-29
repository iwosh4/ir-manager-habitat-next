// PRACOVNÍ PLOCHA — widgety v bezpečných mezích (12sloupcová mřížka, 5 velikostí, kurátorované akcenty a rámy).
// „UPRAVIT PŘEHLED“ → přidat, odebrat, přesunout (tažením nebo ← →), změnit velikost, nastavit, duplikovat, obnovit.
import { esc, actions, $ } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { modal, panel, close as closeOv, toast, confirmDialog } from '../core/overlay.js';
import { ws, saveWs, wid, newDoc, doc } from './wsstore.js';
import { WIDGETS, DEFAULTS, CATS, ACCENTS, FRAMES, SIZES } from './registry.js';
import { renderTool, seedDoc } from './tools.js';

const ICONS = ['', 'dashboard', 'feeding', 'reproduction', 'health', 'inventory', 'finance', 'edit', 'checklist', 'calendar', 'reminder', 'habitat', 'temperature', 'humidity', 'supplement', 'care', 'lighting', 'scan', 'groups', 'status-ok'];
let editing = null;
const reduced = () => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function materialize(inst) {
  const W = WIDGETS[inst.type];
  const o = { id: wid(), type: inst.type, size: inst.size || W?.size || 'm', title: inst.title || '', accent: inst.accent || 'neutral', frame: inst.frame || 'line', icon: inst.icon || '', density: inst.density || 'comfortable', collapsed: false, cfg: inst.cfg || {} };
  if (W?.doc) {
    if (inst.seedKind) { o.docId = seedDoc(inst.seedKind); const d = doc(o.docId); if (inst.title) d.title = inst.title; if (inst.accent) d.accent = inst.accent; }
    else o.docId = newDoc(W.doc, { title: inst.title || W.name, accent: inst.accent || 'neutral', ...(inst.seed || {}), items: (inst.seed?.items || []).map((x) => ({ id: Math.random().toString(36).slice(2, 8), done: false, ...x })) });
  }
  return o;
}
export function layout(key) {
  const S = ws();
  if (!S.layouts[key]) { S.layouts[key] = (DEFAULTS[key] || []).map(materialize); saveWs(); }
  return S.layouts[key];
}
const find = (key, id) => layout(key).find((x) => x.id === id);

/** Mřížka widgetů. */
export function workspaceHTML(key, { title = '', kicker = '', editLabel = 'UPRAVIT PŘEHLED' } = {}) {
  const items = layout(key), ed = editing === key;
  return `<section class="wsp ${ed ? 'editing' : ''}" data-ws="${key}">
    <div class="wsp-bar">${title ? `<div>${kicker ? `<span class="kicker mute">${esc(kicker)}</span>` : ''}<h2 class="t-module">${esc(title)}</h2></div>` : ''}<span class="spacer"></span>
      ${ed ? `<span class="wsp-hint hide-s">${gl('drag')}Přetáhněte za úchyt nebo použijte ← → · velikost S–W · ${gl('sliders')} vzhled</span><button class="btn sm" data-act="ws-reset" data-ws="${key}">${gl('undo')}Výchozí</button><button class="btn sm" data-act="ws-add" data-ws="${key}">${gl('plus')}PŘIDAT WIDGET</button><button class="btn sm primary" data-act="ws-done">${gl('check')}HOTOVO</button>`
      : `<button class="btn sm tertiary ws-editbtn" data-act="ws-edit" data-ws="${key}">${gl('sliders')}${esc(editLabel)}</button>`}
    </div>
    <div class="wgrid" data-grid="${key}">${items.map((w, i) => widgetHTML(key, w, i, items.length)).join('')}${ed ? `<button class="w-addtile" data-act="ws-add" data-ws="${key}">${gl('plus')}<b>+ PŘIDAT WIDGET</b><span>Knihovna · ${Object.keys(WIDGETS).length} widgetů a nástrojů</span></button>` : ''}</div>
  </section>`;
}
function widgetHTML(key, w, i, n) {
  const W = WIDGETS[w.type]; if (!W) return '';
  const d = w.docId ? doc(w.docId) : null;
  const title = w.title || d?.title || W.name, accent = (d?.accent && d.accent !== 'neutral' ? d.accent : w.accent) || 'neutral';
  const ed = editing === key, bare = W.noFrame && !ed, frame = bare ? 'none' : w.frame;
  let body = '';
  if (!W.tool) { try { body = W.render.call(W, w); } catch (e) { console.error(e); body = `<p class="muted">Chyba widgetu: ${esc(e.message)}</p>`; } }
  const szBtns = SIZES.filter(([s]) => W.sizes.includes(s)).map(([s, l, t]) => `<button class="${w.size === s ? 'on' : ''}" data-act="ws-size" data-ws="${key}" data-id="${w.id}" data-v="${s}" title="${t}" aria-label="Velikost ${t}">${l}</button>`).join('');
  return `<article class="w w-${w.size} lvl-${W.level || 'detail'} acc-${accent} fr-${frame} dn-${w.density} ${w.collapsed ? 'collapsed' : ''} ${bare ? 'bare' : ''}" data-wid="${w.id}" data-type="${w.type}" style="--acc:var(--acc-${accent})">
    ${bare ? '' : `<header class="w-h">${ed ? `<span class="w-drag" data-drag title="Přetáhnout" aria-hidden="true">${gl('drag')}</span>` : ''}<span class="w-ico">${ico(w.icon || W.icon, 'sm')}</span><h3>${esc(title)}</h3>
      <span class="w-a">${ed ? `<button class="icon-btn sm" data-act="ws-move" data-ws="${key}" data-id="${w.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Posunout dříve">${gl('arrow-left')}</button><button class="icon-btn sm" data-act="ws-move" data-ws="${key}" data-id="${w.id}" data-d="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Posunout později">${gl('arrow-right')}</button>
        <span class="w-sz">${szBtns}</span><button class="icon-btn sm" data-act="ws-config" data-ws="${key}" data-id="${w.id}" title="Vzhled a nastavení" aria-label="Vzhled a nastavení">${gl('sliders')}</button>${W.multi || !W.tool ? `<button class="icon-btn sm" data-act="ws-dup" data-ws="${key}" data-id="${w.id}" title="Duplikovat" aria-label="Duplikovat">${gl('copy')}</button>` : ''}<button class="icon-btn sm" data-act="ws-remove" data-ws="${key}" data-id="${w.id}" title="Odebrat" aria-label="Odebrat">${gl('trash')}</button>`
        : `<button class="icon-btn sm w-col" data-act="ws-collapse" data-ws="${key}" data-id="${w.id}" title="${w.collapsed ? 'Rozbalit' : 'Sbalit'}" aria-expanded="${!w.collapsed}">${gl(w.collapsed ? 'chevron-down' : 'chevron-up')}</button>`}</span></header>`}
    <div class="w-b" ${W.tool ? `data-tool-mount="${W.tool}" data-key="${w.id}" data-doc="${w.docId || ''}" data-ctx="${w.cfg?.ctx || key}"` : ''}>${body}</div>
  </article>`;
}
export function mountWorkspace(root) {
  for (const el of root.querySelectorAll('[data-tool-mount]')) renderTool(el, el.dataset.toolMount, { key: el.dataset.key, docId: el.dataset.doc || null, ctx: el.dataset.ctx });
  for (const g of root.querySelectorAll('.wsp.editing .wgrid')) enableDrag(g);
}

// ---------------------------------------------------------------- přesun tažením (pointer events, FLIP)
function enableDrag(grid) {
  const key = grid.dataset.grid;
  grid.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-drag]'); if (!h) return;
    const card = h.closest('.w'); e.preventDefault();
    const r = card.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const ghost = card.cloneNode(true); ghost.classList.add('w-ghost'); ghost.style.width = `${r.width}px`; ghost.style.height = `${Math.min(r.height, 320)}px`; document.body.append(ghost);
    card.classList.add('w-placeholder');
    const move = (ev) => {
      ghost.style.transform = `translate(${ev.clientX - ox}px, ${ev.clientY - oy}px)`;
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.wgrid > .w');
      if (over && over !== card && over.parentElement === grid) {
        const before = [...grid.children].indexOf(over) < [...grid.children].indexOf(card);
        const first = new Map([...grid.children].map((c) => [c, c.getBoundingClientRect()]));
        grid.insertBefore(card, before ? over : over.nextSibling);
        if (!reduced()) for (const c of grid.children) { const f = first.get(c), l = c.getBoundingClientRect(); if (!f || c === card) continue; const dx = f.left - l.left, dy = f.top - l.top; if (dx || dy) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.16,1,.3,1)' }); }
      }
      const v = $('#view'); if (ev.clientY > innerHeight - 60) v.scrollTop += 14; if (ev.clientY < 140) v.scrollTop -= 14;
    };
    const up = () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); ghost.remove(); card.classList.remove('w-placeholder');
      const order = [...grid.querySelectorAll('.w')].map((c) => c.dataset.wid);
      layout(key).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); saveWs(); store.emit('change');
    };
    move(e);
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  });
}

// ---------------------------------------------------------------- knihovna widgetů
export function openLibrary(key) {
  let q = '', cat = 'Vše';
  const h = modal({ title: 'Knihovna widgetů', sub: 'Přidat na plochu · kurátorované informace a nástroje', icon: 'layout', width: 900, cls: 'lib-modal', body: '<div data-lib></div>' });
  const draw = () => {
    const list = Object.entries(WIDGETS).filter(([k, w]) => (cat === 'Vše' || w.cat === cat) && (!q || `${w.name} ${w.desc} ${w.cat} ${k}`.toLowerCase().includes(q.toLowerCase())));
    const counts = {}; for (const w of Object.values(WIDGETS)) counts[w.cat] = (counts[w.cat] || 0) + 1;
    h.el.querySelector('[data-lib]').innerHTML = `<div class="lib"><aside class="lib-cats" role="tablist">${['Vše', ...CATS].map((c) => `<button class="${cat === c ? 'on' : ''}" data-cat="${c}">${c.toUpperCase()}<em>${c === 'Vše' ? Object.keys(WIDGETS).length : counts[c] || 0}</em></button>`).join('')}</aside>
      <div class="lib-main"><label class="searchbox">${gl('search')}<input type="search" placeholder="Hledat: nákup, poznámky, kalkulačka, inkubace, sklad…" value="${esc(q)}" data-libq autofocus aria-label="Hledat widget"></label>
      <div class="lib-grid">${list.map(([k, w]) => `<button class="lib-i" data-add="${k}"><span class="tile">${ico(w.icon)}</span><span class="lib-t"><b>${esc(w.name)}${w.personal ? '<em class="pill mute">osobní · více instancí</em>' : ''}</b><span>${esc(w.desc)}</span><i>${esc(w.cat)} · ${w.sizes.map((s) => s.toUpperCase()).join(' ')}</i></span><span class="lib-plus">${gl('plus')}</span></button>`).join('') || '<p class="muted">Žádný widget neodpovídá.</p>'}</div></div></div>`;
    const inp = h.el.querySelector('[data-libq]'); inp.oninput = () => { q = inp.value; const pos = inp.selectionStart; draw(); const i2 = h.el.querySelector('[data-libq]'); i2.focus(); i2.setSelectionRange(pos, pos); };
  };
  h.el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; draw(); return; }
    const a = e.target.closest('[data-add]'); if (!a) return;
    const W = WIDGETS[a.dataset.add], n = layout(key).filter((x) => x.type === a.dataset.add).length;
    const inst = materialize({ type: a.dataset.add, size: W.size, cfg: { ctx: key }, accent: W.doc ? ['amber', 'blue', 'violet', 'green'][n % 4] : undefined, title: W.doc && n ? `${W.name} ${n + 1}` : undefined });
    layout(key).push(inst); saveWs(); closeOv(h); store.emit('change');
    toast(`Přidáno: ${W.name}`, { undo: () => { const L = layout(key); L.splice(L.findIndex((x) => x.id === inst.id), 1); saveWs(); store.emit('change'); } });
    setTimeout(() => { const el = document.querySelector(`[data-wid="${inst.id}"]`); el?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); el?.classList.add('w-new'); }, 90);
  });
  draw();
}
function openConfig(key, id) {
  const w = find(key, id), W = WIDGETS[w.type], d = w.docId ? doc(w.docId) : null;
  const body = `<div class="stack">
    <label class="field"><span>Název</span><input class="input" type="text" data-c="title" value="${esc(w.title || d?.title || W.name)}"></label>
    <div class="field"><span>Akcent</span><div class="acc-pick">${ACCENTS.map(([a, l]) => `<button class="acc-sw" data-c-acc="${a}" style="--acc:var(--acc-${a})" title="${l}" aria-label="${l}"></button>`).join('')}</div></div>
    <div class="field"><span>Rám</span><div class="chips">${FRAMES.map(([k, l]) => `<button class="chip" data-c-frame="${k}">${l}</button>`).join('')}</div></div>
    <div class="fields two"><div class="field"><span>Velikost</span><div class="seg">${SIZES.filter(([s]) => W.sizes.includes(s)).map(([s, l, t]) => `<button data-c-size="${s}" title="${t}">${l}</button>`).join('')}</div></div>
    <div class="field"><span>Hustota</span><div class="seg"><button data-c-den="comfortable">Vzdušná</button><button data-c-den="compact">Kompaktní</button></div></div></div>
    <div class="field"><span>Ikona</span><div class="ico-pick">${ICONS.map((ic) => `<button data-c-ico="${ic}" title="${ic || 'výchozí'}">${ico(ic || W.icon, 'sm')}</button>`).join('')}</div></div>
    <div class="field"><span>Náhled</span><div data-prev></div></div></div>`;
  const h = panel({ title: 'Upravit widget', sub: `${esc(W.name)}${W.multi ? ' · jen tato instance' : ''}`, icon: 'sliders', width: 440, body, footer: `<span class="spacer"></span><button class="btn primary" data-close>${gl('check')}Hotovo</button>` });
  const draw = () => {
    const acc = (d ? d.accent : w.accent) || 'neutral';
    h.el.querySelector('[data-prev]').innerHTML = `<div class="w w-prevbox acc-${acc} fr-${w.frame} dn-${w.density}" style="--acc:var(--acc-${acc})"><header class="w-h"><span class="w-ico">${ico(w.icon || W.icon, 'sm')}</span><h3>${esc(w.title || d?.title || W.name)}</h3></header><div class="w-b"><p class="muted small">Takto bude widget vypadat na ploše.</p></div></div>`;
    h.el.querySelectorAll('[data-c-acc]').forEach((b) => b.classList.toggle('on', b.dataset.cAcc === acc));
    h.el.querySelectorAll('[data-c-frame]').forEach((b) => b.classList.toggle('on', b.dataset.cFrame === w.frame));
    h.el.querySelectorAll('[data-c-size]').forEach((b) => b.classList.toggle('on', b.dataset.cSize === w.size));
    h.el.querySelectorAll('[data-c-den]').forEach((b) => b.classList.toggle('on', b.dataset.cDen === (w.density || 'comfortable')));
    h.el.querySelectorAll('[data-c-ico]').forEach((b) => b.classList.toggle('on', b.dataset.cIco === (w.icon || '')));
  };
  const upd = (fn) => { fn(); saveWs(); store.emit('change'); draw(); };
  h.el.querySelector('[data-c=title]').addEventListener('input', (e) => { w.title = e.target.value; if (d) d.title = e.target.value; saveWs(); store.emit('change'); draw(); });
  h.el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cAcc) upd(() => { if (d) d.accent = b.dataset.cAcc; w.accent = b.dataset.cAcc; if (w.frame === 'none') w.frame = 'line'; });
    if (b.dataset.cFrame) upd(() => { w.frame = b.dataset.cFrame; });
    if (b.dataset.cSize) upd(() => { w.size = b.dataset.cSize; });
    if (b.dataset.cDen) upd(() => { w.density = b.dataset.cDen; });
    if (b.hasAttribute('data-c-ico')) upd(() => { w.icon = b.dataset.cIco; });
  });
  draw();
}

actions({
  'ws-edit': (el) => { editing = el.dataset.ws; document.body.classList.add('ws-edit'); store.emit('change'); },
  'ws-done': () => { editing = null; document.body.classList.remove('ws-edit'); saveWs(true); store.emit('change'); toast('Rozvržení uloženo', { kind: 'ok', ms: 2200 }); },
  'ws-add': (el) => openLibrary(el.dataset.ws),
  'ws-config': (el) => openConfig(el.dataset.ws, el.dataset.id),
  'ws-size': (el) => { find(el.dataset.ws, el.dataset.id).size = el.dataset.v; saveWs(); store.emit('change'); },
  'ws-collapse': (el) => { const w = find(el.dataset.ws, el.dataset.id); w.collapsed = !w.collapsed; saveWs(); store.emit('change'); },
  'ws-move': (el) => { const L = layout(el.dataset.ws), i = L.findIndex((x) => x.id === el.dataset.id), j = i + +el.dataset.d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; saveWs(); store.emit('change'); requestAnimationFrame(() => document.querySelector(`[data-wid="${el.dataset.id}"] [data-act=ws-move][data-d="${el.dataset.d}"]`)?.focus()); },
  'ws-dup': (el) => { const L = layout(el.dataset.ws), w = find(el.dataset.ws, el.dataset.id), c = JSON.parse(JSON.stringify(w)); c.id = wid(); if (w.docId) { const d = doc(w.docId); c.docId = newDoc(d.kind, { ...JSON.parse(JSON.stringify(d)), title: `${d.title} (kopie)` }); c.title = `${d.title} (kopie)`; } L.splice(L.indexOf(w) + 1, 0, c); saveWs(); store.emit('change'); toast('Widget duplikován', { kind: 'ok', ms: 2000 }); },
  'ws-remove': (el) => { const L = layout(el.dataset.ws), i = L.findIndex((x) => x.id === el.dataset.id), [w] = L.splice(i, 1); saveWs(); store.emit('change'); toast(`Odebráno: ${w.title || WIDGETS[w.type].name}`, { undo: () => { L.splice(i, 0, w); saveWs(); store.emit('change'); } }); },
  'ws-reset': async (el) => { const key = el.dataset.ws; if (!(await confirmDialog({ title: 'Obnovit výchozí rozvržení?', text: 'Obnoví výchozí widgety této plochy. Vaše poznámky a nákupní seznamy zůstanou v Nástrojích.', ok: 'Obnovit', danger: false }))) return; const S = ws(), prev = S.layouts[key]; delete S.layouts[key]; layout(key); saveWs(); store.emit('change'); toast('Rozvržení obnoveno', { undo: () => { S.layouts[key] = prev; saveWs(); store.emit('change'); } }); },
  'w-bulk': (el) => import('../engine/actions.js').then((A) => import('../ui/feedback.js').then((F) => F.done(A.complete(el.dataset.ids.split(','))))),
  'w-shop1': (el) => import('./tools.js').then((m) => { const r = m.addItemToShopping(el.dataset.id); toast(r?.dup ? `Už je v seznamu „${r.title}“` : `Přidáno do „${r.title}“`, { kind: r?.dup ? 'info' : 'ok', action: () => (location.hash = '#/sklad/nakup'), actionLabel: 'Otevřít' }); store.emit('change'); }),
  'w-shopall': () => import('./tools.js').then((m) => { const n = m.addLowStockToShopping(); toast(n ? `Přidáno ${n} položek do nákupního seznamu` : 'Vše už je v nákupním seznamu', { kind: n ? 'ok' : 'info', action: () => (location.hash = '#/sklad/nakup'), actionLabel: 'Otevřít' }); store.emit('change'); }),
});
export const isEditing = () => editing;
export function exitEdit() { editing = null; document.body.classList.remove('ws-edit'); }
