// TOOLS — the full-page Multitool: every tool in a searchable catalogue; open one inline or pin it as a widget.
import { esc, actions } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { toast } from '../core/overlay.js';
import { TOOLS, renderTool } from '../widgets/tools.js';
import { openToolDrawer } from '../widgets/tooldrawer.js';
import { docsOf, ws, saveWs } from '../widgets/wsstore.js';
import { materialize } from '../widgets/workspace.js';

const GROUPS = [['Lists & notes', ['shopping', 'notes', 'checklist']], ['Calculate', ['calculator', 'converter', 'dates', 'price', 'energy', 'volume', 'incubation']], ['Collection', ['feedplan', 'stockcount', 'pricelist', 'labels', 'links']]];
let cur = 'feedplan', q = '';
export function context() { return { sub: `${Object.keys(TOOLS).length} work tools · also in the header (wrench) and as widgets`, actions: [{ label: 'Open drawer', icon: 'tools', act: 'tools-drawer', hideM: true }] }; }
export function render() {
  const T = TOOLS[cur], match = (k) => !q || `${TOOLS[k].name} ${TOOLS[k].desc}`.toLowerCase().includes(q.toLowerCase());
  return `<div class="tp"><aside class="tp-cat"><div class="search-in"><span>${icon('search')}</span><input id="tp-q" type="search" placeholder="Find a tool…" value="${esc(q)}" data-input="tp-q"></div>
    ${GROUPS.map(([g, ks]) => { const vis = ks.filter(match); return vis.length ? `<h6>${g}</h6>${vis.map((k) => `<button class="tp-i ${cur === k ? 'on' : ''}" data-act="tp-open" data-k="${k}">${icon(TOOLS[k].icon)}<span><b>${esc(TOOLS[k].name)}</b><em>${esc(TOOLS[k].desc)}</em></span>${TOOLS[k].doc ? `<i class="pill mute">${docsOf(TOOLS[k].doc).length}</i>` : ''}</button>`).join('')}` : ''; }).join('')}</aside>
    <section class="card tp-main"><header class="card-h"><span class="card-ico">${icon(T.icon)}</span><h3>${esc(T.name)}</h3><span class="card-sub">${esc(T.desc)}</span><span class="card-a"><button class="btn sm" data-act="tp-pin" data-k="${cur}">${icon('pin')}Add to dashboard</button></span></header><div class="card-b" id="tp-root"></div></section></div>`;
}
export function mount(root) {
  const el = root.querySelector('#tp-root'); if (!el) return;
  const T = TOOLS[cur];
  if (T.doc) { const d = docsOf(T.doc)[0]; if (d) renderTool(el, cur, { key: `tp-${d.id}`, docId: d.id, ctx: 'tools' }); else el.innerHTML = `<p class="muted">No ${T.name.toLowerCase()} yet.</p><button class="btn primary" data-act="tp-drawer" data-k="${cur}">${icon('plus')}Create in Multitool</button>`; }
  else renderTool(el, cur, { key: `tp-${cur}`, ctx: 'tools' });
}
actions({
  'tp-open': (el) => { cur = el.dataset.k; store.emit('change'); },
  'tp-q': (el) => { q = el.value; store.emit('change'); },
  'tp-drawer': (el) => openToolDrawer(el.dataset.k),
  'tp-pin': (el) => { const S = ws(), k = el.dataset.k, T = TOOLS[k]; S.layouts.dashboard ||= []; const d = T.doc ? docsOf(T.doc)[0] : null; const inst = materialize({ type: k, size: 'm' }); if (d) inst.docId = d.id; S.layouts.dashboard.unshift(inst); saveWs(true); toast(`${T.name} added to your dashboard`, { action: () => { location.hash = '#/dashboard'; }, actionLabel: 'View' }); },
});
