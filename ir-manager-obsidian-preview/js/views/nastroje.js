// NÁSTROJE (multitool) — všechny nástroje na jednom místě; osobní dokumenty (seznamy, poznámky, checklisty) s více instancemi.
import { esc, actions } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { pageHead, block } from '../ui/components.js';
import { TOOLS, renderTool } from '../widgets/tools.js';
import { docsOf, newDoc, doc, saveWs } from '../widgets/wsstore.js';
import { toast } from '../core/overlay.js';

const GROUPS = [['Výpočty', ['calculator', 'converter', 'dates', 'incubation']], ['Ubikace & provoz', ['volume', 'substrate', 'energy', 'feedplan']], ['Obchod', ['price', 'pricelist']], ['Osobní', ['shopping', 'notes', 'checklist', 'links']]];
let cur = 'calculator', docId = {};

export function render(r) {
  const n = r.q.get('n'); if (n && TOOLS[n]) cur = n;
  const T = TOOLS[cur], docs = T.doc ? docsOf(T.doc) : [];
  if (T.doc && (!docId[cur] || !doc(docId[cur]))) docId[cur] = docs[0]?.id;
  return `${pageHead({ mod: 'nastroje', title: 'Nástroje', icon: 'settings', sub: `${Object.keys(TOOLS).length} praktických nástrojů · stejné nástroje přidáte jako widget na Přehled`, tabs: [] })}
  <div class="tools-l">
    <nav class="tool-nav" aria-label="Nástroje">${GROUPS.map(([g, ks]) => `<div class="tn-g"><span class="kicker mute">${g}</span>${ks.map((k) => `<a class="tn ${k === cur ? 'on' : ''}" href="#/nastroje?n=${k}">${ico(TOOLS[k].glossy, 'sm')}<span>${esc(TOOLS[k].name)}</span>${TOOLS[k].doc ? `<em>${docsOf(TOOLS[k].doc).length}</em>` : ''}</a>`).join('')}</div>`).join('')}</nav>
    <div class="stack">
      ${T.doc ? `<div class="doc-tabs">${docs.map((d) => `<button class="chip ${d.id === docId[cur] ? 'on' : ''}" data-act="tool-doc" data-id="${d.id}"><i class="acc-dot" style="--acc:var(--acc-${d.accent || 'neutral'})"></i>${esc(d.title)}${d.pinned ? gl('pin') : ''}</button>`).join('')}<button class="chip" data-act="tool-newdoc">${gl('plus')}Nový</button>${docsOf(T.doc, { archived: true }).length ? `<button class="chip" data-act="tool-arch">${gl('archive')}Archiv (${docsOf(T.doc, { archived: true }).length})</button>` : ''}</div>` : ''}
      ${block(T.doc && docId[cur] ? doc(docId[cur]).title : T.name, `<div data-tool-page></div>`, { icon: T.glossy, level: 'primary', kicker: T.doc ? T.name : '', sub: esc(T.desc), cls: 'tool-page' })}
    </div>
  </div>`;
}
export function mount(host) { const el = host.querySelector('[data-tool-page]'); if (el) renderTool(el, cur, { key: `page-${cur}`, docId: docId[cur] || null, ctx: 'nastroje' }); }
actions({
  'tool-doc': (el) => { docId[cur] = el.dataset.id; store.emit('change'); },
  'tool-newdoc': () => { const k = TOOLS[cur].doc; docId[cur] = newDoc(k, { title: `${TOOLS[cur].name.replace(/y$/, '')} ${docsOf(k).length + 1}`, accent: ['amber', 'blue', 'violet', 'green'][docsOf(k).length % 4] }); store.emit('change'); toast('Vytvořeno', { kind: 'ok', ms: 1600 }); },
  'tool-arch': () => { const k = TOOLS[cur].doc; for (const d of docsOf(k, { archived: true })) doc(d.id).archived = false; saveWs(); store.emit('change'); toast('Archiv obnoven', { kind: 'info', ms: 1800 }); },
});
