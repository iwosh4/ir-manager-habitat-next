// MULTITOOL drawer — global, one tap from anywhere (header wrench / T / mobile More). Lists, notes and checklists
// are the SAME documents that appear as widgets on any workspace.
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { panel, close as closeOv, confirmDialog, toast, menu } from '../core/overlay.js';
import { TOOLS, renderTool } from './tools.js';
import { docsOf, newDoc, doc, ws, saveWs } from './wsstore.js';
import { ACCENTS } from './registry.js';
import * as store from '../core/store.js';

const GROUPS = [['Lists & notes', ['shopping', 'notes', 'checklist']], ['Calculate', ['calculator', 'converter', 'dates', 'price', 'energy', 'volume', 'incubation']], ['Collection', ['feedplan', 'stockcount', 'pricelist', 'labels', 'links']]];
let cur = 'shopping', curDoc = null;

export function openToolDrawer(kind, docId) {
  if (kind) cur = kind; if (docId) curDoc = docId;
  const h = panel({ title: 'Multitool', sub: 'Work tools — available everywhere', icon: 'tools', width: 860, cls: 'tooldrawer', onClose: () => store.emit('change'), body: '<div class="td"><nav class="td-nav" data-tdnav></nav><div class="td-main" data-tdmain></div></div>' });
  const draw = () => {
    h.el.querySelector('[data-tdnav]').innerHTML = GROUPS.map(([g, ks]) => `<h6>${g}</h6>${ks.map((k) => { const T = TOOLS[k]; const n = T.doc ? docsOf(T.doc).length : 0; return `<button class="td-i ${cur === k ? 'on' : ''}" data-tk="${k}">${icon(T.icon)}<span>${esc(T.name)}</span>${T.doc ? `<em>${n}</em>` : ''}</button>`; }).join('')}`).join('');
    const T = TOOLS[cur], main = h.el.querySelector('[data-tdmain]');
    if (T.doc) {
      const docs = docsOf(T.doc);
      if (!curDoc || !doc(curDoc) || doc(curDoc).kind !== T.doc) curDoc = docs[0]?.id || null;
      main.innerHTML = `<div class="td-docs">${docs.map((d) => `<button class="td-doc acc-${d.accent} ${d.id === curDoc ? 'on' : ''}" data-doc="${d.id}" style="--acc:var(--acc-${d.accent})"><i></i><span>${esc(d.title)}</span>${d.kind === 'shopping' ? `<em>${d.items.filter((x) => !x.done).length}</em>` : d.kind === 'checklist' ? `<em>${d.items.filter((x) => x.done).length}/${d.items.length}</em>` : d.pinned ? icon('pin') : ''}</button>`).join('')}<button class="td-doc new" data-new>${icon('plus')}New ${T.doc === 'shopping' ? 'list' : T.doc === 'notes' ? 'note' : 'checklist'}</button></div>
        ${curDoc ? `<div class="td-dochead acc-${doc(curDoc).accent}" style="--acc:var(--acc-${doc(curDoc).accent})"><input class="td-title" value="${esc(doc(curDoc).title)}" data-dtitle aria-label="Title"><span class="acc-pick sm">${ACCENTS.map((a) => `<button class="acc-sw ${doc(curDoc).accent === a ? 'on' : ''}" data-dacc="${a}" style="--acc:var(--acc-${a})" aria-label="${a}"></button>`).join('')}</span><button class="icon-btn sm" data-ddel title="Delete">${icon('trash')}</button></div><div class="td-tool" data-tool-root></div>` : `<div class="empty"><h3>No ${T.name.toLowerCase()} yet</h3><button class="btn primary" data-new>${icon('plus')}Create</button></div>`}`;
      if (curDoc) renderTool(main.querySelector('[data-tool-root]'), cur, { key: `drawer-${curDoc}`, docId: curDoc, ctx: 'drawer' });
    } else {
      main.innerHTML = `<div class="td-head">${icon(T.icon)}<div><b>${esc(T.name)}</b><span class="muted">${esc(T.desc)}</span></div></div><div class="td-tool" data-tool-root></div>`;
      renderTool(main.querySelector('[data-tool-root]'), cur, { key: `drawer-${cur}`, ctx: 'drawer' });
    }
  };
  h.el.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-tk]'); if (k) { cur = k.dataset.tk; curDoc = null; draw(); return; }
    const d = e.target.closest('[data-doc]'); if (d) { curDoc = d.dataset.doc; draw(); return; }
    if (e.target.closest('[data-new]')) { const T = TOOLS[cur]; const n = docsOf(T.doc).length; curDoc = newDoc(T.doc, { title: T.doc === 'shopping' ? `List ${n + 1}` : T.doc === 'notes' ? `Note ${n + 1}` : `Checklist ${n + 1}`, accent: ACCENTS[(n + 1) % ACCENTS.length] }); draw(); h.el.querySelector('[data-dtitle]')?.select(); return; }
    const a = e.target.closest('[data-dacc]'); if (a) { doc(curDoc).accent = a.dataset.dacc; saveWs(); draw(); return; }
    if (e.target.closest('[data-ddel]')) { const dd = doc(curDoc); if (await confirmDialog({ title: `Delete “${dd.title}”?`, text: 'Widgets showing this document will be removed as well.', ok: 'Delete' })) { const S = ws(), id = curDoc; delete S.docs[id]; for (const L of Object.values(S.layouts)) { const i = L.findIndex((w) => w.docId === id); if (i >= 0) L.splice(i, 1); } saveWs(); curDoc = null; draw(); toast('Deleted', { kind: 'info' }); } }
  });
  h.el.addEventListener('input', (e) => { if (e.target.matches('[data-dtitle]')) { doc(curDoc).title = e.target.value; doc(curDoc).updated = Date.now(); saveWs(); const b = h.el.querySelector(`[data-doc="${curDoc}"] span`); if (b) b.textContent = e.target.value; } });
  draw();
  return h;
}
