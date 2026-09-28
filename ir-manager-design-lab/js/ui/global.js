// Global interactions available everywhere: Quick Record, Search, Notifications, QR / code entry, Voice & command line,
// Multitool drawer, mobile More menu, profile menu, keyboard shortcuts.
import { esc, $, action, actions } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, setLang } from '../core/i18n.js';
import { modal, panel, close as closeOv, closeAll, overlayOpen, topOverlay, closeMenu, menu, isMobile, confirmDialog, toast } from '../core/overlay.js';
import * as store from '../core/store.js';
import { SPECIES, latin } from '../data/species.js';
import { NAV } from '../nav.js';
import { notifications } from '../engine/notify.js';
import { buildTimeline } from '../engine/timeline.js';
import { TYPE, subjectOf } from '../engine/ops.js';
import * as A from '../engine/actions.js';
import { openQuickRecord, editRecordPanel } from './quickrecord.js';
import { avatar } from './components.js';
import { done, info } from './feedback.js';
import { DAY, startOfDay, rel, dShort, hm } from '../core/time.js';

let G = null;
export function installGlobal(g) {
  G = g;
  document.addEventListener('keydown', onKey);
}

/** Context for Quick Record from the current route (animal / enclosure / cycle already selected). */
export function routeContext() {
  const r = G?.app.route; if (!r) return {};
  if (r.mod === 'animals' && r.sub === 'a' && r.id) return { subjects: [r.id] };
  if (r.mod === 'enclosures' && r.sub === 'e' && r.id) return { enclosure: r.id };
  if (r.mod === 'reproduction' && r.sub === 'cycle' && r.id) { const cy = store.get().cycles.find((c) => c.id === r.id); return cy ? { type: 'repro', cycle: cy.id, subjects: [cy.female] } : {}; }
  return {};
}

actions({
  'quick-record': (el) => openQuickRecord({ ...routeContext(), ...(el?.dataset?.type ? { type: el.dataset.type } : {}), ...(el?.dataset?.subject ? { subjects: el.dataset.subject.split(',') } : {}) }),
  'qr-type': (el) => openQuickRecord({ ...routeContext(), type: el.dataset.type }),
  'edit-record': (el) => editRecordPanel(el.dataset.id),
  search: () => openSearch(),
  notifications: () => openNotifications(),
  qr: () => openCodeEntry(),
  voice: () => openCommand(true),
  command: () => openCommand(false),
  'tools-drawer': (el) => import('../widgets/tooldrawer.js').then((m) => m.openToolDrawer(el?.dataset?.tool)),
  more: () => openMore(),
  'profile-menu': (el) => profileMenu(el),
  'undo': () => { const l = store.undo(); if (l) info(`Undone: ${l}`); },
  'go': (el) => { closeAll(); const h = el.dataset.href; if (h.startsWith('#')) location.hash = h; else window.open(h, '_blank', 'noopener'); },
});

// ---------------------------------------------------------------- keyboard shortcuts (enhancements, not requirements)
let gPrefix = 0;
function onKey(e) {
  const typing = e.target.matches('input, textarea, select, [contenteditable]');
  if (e.key === 'Escape') { if (closeMenu()) return; if (overlayOpen()) { e.preventDefault(); closeOv(topOverlay()); return; } if (document.body.classList.contains('ws-edit')) { runAct('ws-done'); return; } }
  if (typing || e.metaKey || e.altKey) return;
  if ((e.ctrlKey && e.key.toLowerCase() === 'z')) { e.preventDefault(); const l = store.undo(); if (l) info(`Undone: ${l}`); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
  if (e.ctrlKey || overlayOpen()) return;
  const k = e.key.toLowerCase();
  if (Date.now() - gPrefix < 900) { gPrefix = 0; const map = { d: 'dashboard', p: 'planner', t: 'tasks', a: 'animals', r: 'reproduction', h: 'health', e: 'enclosures', i: 'inventory', f: 'finance', s: 'settings' }; if (map[k]) { location.hash = `#/${map[k]}`; e.preventDefault(); } return; }
  if (k === 'g') { gPrefix = Date.now(); return; }
  if (k === 'q') { e.preventDefault(); openQuickRecord(routeContext()); }
  else if (k === '/') { e.preventDefault(); openSearch(); }
  else if (k === 'n') { e.preventDefault(); const v = G.app.view; if (v?.onNew) v.onNew(G.app.route); else openQuickRecord({ ...routeContext(), type: 'task' }); }
  else if (k === 't') { e.preventDefault(); runAct('tools-drawer'); }
  else if (k === '?') { e.preventDefault(); shortcuts(); }
}
function runAct(name) { import('../core/dom.js').then((m) => m.runAction(name, document.body, null)); }
function shortcuts() {
  const rows = [['Q', 'Quick Record'], ['/', 'Global search'], ['Ctrl K', 'Global search'], ['N', 'New (contextual)'], ['T', 'Multitool'], ['G then D/P/T/A/R/H/E/I/F', 'Go to workspace'], ['Ctrl Z', 'Undo last action'], ['Esc', 'Close / exit edit mode'], ['1–0', 'Quick Record action (in dialog)']];
  modal({ title: 'Keyboard shortcuts', icon: 'keyboard', width: 460, body: `<dl class="kv sc">${rows.map(([k, l]) => `<dt>${k.split(' ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</dt><dd>${l}</dd>`).join('')}</dl>` });
}

// ---------------------------------------------------------------- global search (command palette)
function searchIndex(q) {
  const db = store.get(), Q = q.trim().toLowerCase(), m = (s) => String(s || '').toLowerCase().includes(Q);
  const res = { Animals: [], Tasks: [], Enclosures: [], Reproduction: [], Documents: [], Contacts: [], Commands: [] };
  if (!Q) {
    res.Animals = db.recent.animals.map((id) => db.animals.find((a) => a.id === id)).filter(Boolean).slice(0, 5).map(animalHit);
    res.Commands = commands().slice(0, 6);
    return res;
  }
  res.Animals = db.animals.filter((a) => m(a.code) || m(a.name) || m(SPECIES[a.species]?.latin) || m(SPECIES[a.species]?.common) || m(SPECIES[a.species]?.cz) || m(a.morph) || (a.members || []).some((x) => m(x.code))).slice(0, 8).map(animalHit);
  const n = Date.now();
  res.Tasks = buildTimeline(db, { from: startOfDay(n) - 2 * DAY, to: startOfDay(n) + 7 * DAY, includeHistory: false }).filter((i) => i.kind !== 'phase' && (i.status === 'open' || i.status === 'overdue') && (m(i.title) || m(i.sub?.code) || m(i.sub?.name) || m(TYPE[i.type]?.label))).slice(0, 6)
    .map((i) => ({ icon: TYPE[i.type]?.icon || 'tasks', title: `${i.title}${i.sub ? ` · ${i.sub.code}` : ''}`, sub: `${i.status === 'overdue' ? 'Overdue · ' : ''}${rel(i.t)}`, href: `#/planner/timeline?focus=${encodeURIComponent(i.id)}` }));
  res.Enclosures = db.enclosures.filter((e) => m(e.code) || m(e.name)).slice(0, 6).map((e) => ({ icon: 'enclosure', title: `${e.code} · ${e.name}`, sub: `${e.dims.w} × ${e.dims.d} × ${e.dims.h} cm · ${db.animals.filter((a) => a.enclosureId === e.id).map((a) => a.code).join(', ') || 'empty'}`, href: `#/enclosures/e/${e.id}` }));
  res.Reproduction = [...db.cycles.filter((c) => m(c.name) || m(SPECIES[c.species]?.latin)).map((c) => ({ icon: 'repro', title: c.name, sub: latin(SPECIES[c.species]), href: `#/reproduction/cycle/${c.id}` })), ...db.clutches.filter((c) => m(c.code) || m(SPECIES[c.species]?.latin) || m('clutch')).map((c) => ({ icon: 'egg', title: `Clutch ${c.code}`, sub: `${c.eggs} eggs · day ${Math.floor((n - c.laid) / DAY)}`, href: `#/reproduction/clutch/${c.id}` }))].slice(0, 6);
  res.Documents = db.documents.filter((d) => m(d.name) || m(d.kind)).slice(0, 5).map((d) => ({ icon: 'file', title: d.name, sub: `${d.kind} · ${dShort(d.date)}`, href: d.animal ? `#/animals/a/${d.animal}?tab=origin` : '#/settings/app' }));
  res.Contacts = db.contacts.filter((c) => m(c.name) || m(c.org) || c.tags.some(m)).slice(0, 5).map((c) => ({ icon: c.kind === 'vet' ? 'stethoscope' : c.kind === 'supplier' ? 'truck' : 'user', title: c.name, sub: `${c.org || c.kind} · ${c.city}`, href: `#/directory/all/${c.id}` }));
  res.Commands = commands().filter((c) => m(c.title) || m(c.sub)).slice(0, 5);
  return res;
}
function animalHit(a) { const sp = SPECIES[a.species]; return { animal: a, title: `${a.code}${a.name ? ` · ${a.name}` : ''}`, sub: `${latin(sp)} · ${sp.common}`, href: `#/animals/a/${a.id}` }; }
function commands() {
  return [
    { icon: 'plus', title: 'Quick Record', sub: 'Q', run: () => openQuickRecord(routeContext()) },
    { icon: 'planner', title: 'Open Planner — NOW', sub: 'G P', href: '#/planner/timeline' },
    { icon: 'tasks', title: 'Overdue tasks', sub: 'Tasks', href: '#/tasks/overdue' },
    { icon: 'plus', title: 'New task', sub: 'N', run: () => openQuickRecord({ type: 'task' }) },
    { icon: 'animals', title: 'Add animal', sub: 'Animals', run: () => import('../views/animals.js').then((m) => m.openAddAnimal()) },
    { icon: 'shopping', title: 'Shopping lists', sub: 'Multitool', run: () => import('../widgets/tooldrawer.js').then((m) => m.openToolDrawer('shopping')) },
    { icon: 'calculator', title: 'Calculator', sub: 'Multitool', run: () => import('../widgets/tooldrawer.js').then((m) => m.openToolDrawer('calculator')) },
    { icon: 'notebook', title: 'Notes', sub: 'Multitool', run: () => import('../widgets/tooldrawer.js').then((m) => m.openToolDrawer('notes')) },
    { icon: 'repro', title: 'Incubation', sub: 'Reproduction', href: '#/reproduction/incubation' },
    { icon: 'cube', title: 'Open Habitat Studio', sub: 'Enclosures', href: '#/enclosures/habitat' },
    { icon: 'moon', title: 'Toggle light / dark theme', sub: 'Appearance', run: toggleTheme },
    { icon: 'command', title: 'Command line / voice', sub: '“fed az-01”, “weight msp-04 1850”', run: () => openCommand(false) },
    { icon: 'keyboard', title: 'Keyboard shortcuts', sub: '?', run: shortcuts },
  ];
}
export function openSearch(initial = '') {
  const h = modal({ title: '', width: 680, cls: 'search-modal', body: `<div class="sp"><div class="sp-in">${icon('search')}<input type="search" placeholder="${t('Search animals, tasks, enclosures…')}" value="${esc(initial)}" autofocus aria-label="Search" data-sp-in><kbd>Esc</kbd></div><div class="sp-res" data-sp-res role="listbox"></div><div class="sp-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span>Tip: type a code — <b>az</b>, <b>msp-04</b>, <b>CL-2026</b></span></div></div>` });
  const inp = h.el.querySelector('[data-sp-in]'), box = h.el.querySelector('[data-sp-res]');
  let flat = [], sel = 0;
  const draw = () => {
    const res = searchIndex(inp.value); flat = [];
    box.innerHTML = Object.entries(res).filter(([, v]) => v.length).map(([g, arr]) => `<div class="sp-g"><h6>${g}</h6>${arr.map((x) => { flat.push(x); const i = flat.length - 1; return `<button class="sp-row ${i === sel ? 'on' : ''}" data-i="${i}" role="option">${x.animal ? avatar(x.animal, 32) : `<span class="sp-ico">${icon(x.icon)}</span>`}<span class="sp-t"><b>${esc(x.title)}</b><em>${esc(x.sub || '')}</em></span>${icon('arrowRight')}</button>`; }).join('')}</div>`).join('') || `<div class="empty"><h3>No results for “${esc(inp.value)}”</h3><p>Search covers animals, members of groups, tasks, enclosures, clutches, documents and contacts.</p></div>`;
  };
  const go = (x) => { if (!x) return; closeOv(h); if (x.run) x.run(); else location.hash = x.href; };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(flat.length - 1, sel + 1); draw(); box.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); box.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') { e.preventDefault(); go(flat[sel]); }
  });
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) go(flat[+b.dataset.i]); });
  draw();
}

// ---------------------------------------------------------------- notification center
export function openNotifications() {
  const h = panel({ title: t('Notifications'), sub: 'Derived from your collection — always current', icon: 'bell', width: 460, body: '<div data-nc></div>', footer: `<button class="btn ghost" data-nc-all>${icon('check')}Mark all read</button><a class="btn" href="#/settings/notifications" data-close>${icon('settings')}Settings</a>` });
  const draw = () => {
    const list = notifications(store.get());
    const grp = { high: 'Needs attention', normal: 'Soon', low: 'Later' };
    h.el.querySelector('[data-nc]').innerHTML = list.length ? Object.entries(grp).map(([p, l]) => { const arr = list.filter((n) => n.prio === p); return arr.length ? `<div class="nc-g"><h6>${l}</h6>${arr.map((n) => `<div class="nc ${n.read ? 'read' : ''} p-${n.prio}"><span class="nc-ico">${icon(n.icon)}</span><div class="nc-t"><b>${esc(n.title)}</b><span>${esc(n.text)}</span><em>${rel(n.t)}</em></div><div class="nc-a">${n.kind === 'stock' ? `<button class="btn sm" data-nc-shop>${icon('cart')}To list</button>` : ''}<a class="btn sm" href="${n.link}" data-nc-open="${esc(n.id)}">Open</a>${n.read ? '' : `<button class="icon-btn sm" data-nc-read="${esc(n.id)}" title="Mark read">${icon('check')}</button>`}</div></div>`).join('')}</div>` : ''; }).join('') : `<div class="empty"><h3>All clear</h3><p>No overdue work, alerts or low stock.</p></div>`;
  };
  const read = (ids) => store.mutate(null, (db) => { db.readNotifications = [...new Set([...db.readNotifications, ...ids])].slice(-300); });
  h.el.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-nc-read]'); if (r) { read([r.dataset.ncRead]); draw(); return; }
    const o = e.target.closest('[data-nc-open]'); if (o) { read([o.dataset.ncOpen]); closeOv(h); return; }
    if (e.target.closest('[data-nc-all]')) { read(notifications(store.get()).map((n) => n.id)); draw(); return; }
    if (e.target.closest('[data-nc-shop]')) { const m = await import('../widgets/registry.js'); const n = m.addLowStockToShopping(); toast(n ? `Added ${n} low-stock items to Shopping List` : 'Low-stock items already on the list', { kind: n ? 'ok' : 'info' }); }
  });
  draw();
}

// ---------------------------------------------------------------- QR / code entry (BarcodeDetector when available)
export function openCodeEntry() {
  const hasBD = 'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia;
  const h = modal({ title: 'Scan or enter code', sub: 'Enclosure labels carry QR codes with the enclosure / animal code', icon: 'qr', width: 460, body: `<div class="stack">
    ${hasBD ? `<button class="btn lg block" data-cam>${icon('camera')}Start camera scan</button><video data-vid playsinline muted class="qr-vid" hidden></video>` : `<p class="muted">${icon('info')} Camera scanning uses the browser BarcodeDetector API, which this browser does not provide — type or paste the code instead (hardware scanners type into this field too).</p>`}
    <div class="qr-search"><span>${icon('hash')}</span><input type="text" data-code placeholder="AZ-01, FW-1, CL-2026-04 …" autofocus autocomplete="off" autocapitalize="characters"></div><div data-code-res class="list"></div></div>` });
  const inp = h.el.querySelector('[data-code]'), out = h.el.querySelector('[data-code-res]');
  const find = (v) => { const db = store.get(), q = v.trim().toLowerCase(); if (!q) return []; return [...db.animals.filter((a) => a.code.toLowerCase().startsWith(q) || (a.members || []).some((m) => m.code.toLowerCase().startsWith(q))).map((a) => ({ t: `${a.code} · ${a.name || SPECIES[a.species].common}`, href: `#/animals/a/${a.id}`, ic: 'animals' })), ...db.enclosures.filter((e) => e.code.toLowerCase().startsWith(q)).map((e) => ({ t: `${e.code} · ${e.name}`, href: `#/enclosures/e/${e.id}`, ic: 'enclosure' })), ...db.clutches.filter((c) => c.code.toLowerCase().includes(q)).map((c) => ({ t: `Clutch ${c.code}`, href: `#/reproduction/clutch/${c.id}`, ic: 'egg' }))].slice(0, 6); };
  const draw = () => { const r = find(inp.value); out.innerHTML = r.map((x, i) => `<a class="li" href="${x.href}" data-close>${icon(x.ic)}<span class="li-main"><b>${esc(x.t)}</b></span>${i === 0 ? '<kbd>Enter</kbd>' : ''}</a>`).join(''); };
  inp.addEventListener('input', draw);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = find(inp.value)[0]; if (r) { closeOv(h); location.hash = r.href; } } });
  h.el.querySelector('[data-cam]')?.addEventListener('click', async () => {
    try {
      const v = h.el.querySelector('[data-vid]'), stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); v.hidden = false; v.srcObject = stream; await v.play();
      const bd = new window.BarcodeDetector({ formats: ['qr_code', 'code_128'] });
      const tick = async () => { if (!document.body.contains(v)) { stream.getTracks().forEach((t) => t.stop()); return; } const c = await bd.detect(v).catch(() => []); if (c[0]) { inp.value = c[0].rawValue; draw(); stream.getTracks().forEach((t) => t.stop()); } else requestAnimationFrame(tick); };
      tick();
    } catch (err) { info('Camera not available'); }
  });
}

// ---------------------------------------------------------------- voice / command line: "fed az-01", "weight msp-04 1850", "water cc-01 cc-02", "refused pr-03", "mist all", "note pr-02 …"
const VERBS = [[/^(fed|feed|feeding|nakrmen[oa]?)$/, 'feeding'], [/^(refused|refuse|odmítl[a]?)$/, 'refused'], [/^(water|voda)$/, 'water'], [/^(mist|misted|misting|rosen[ií])$/, 'misting'], [/^(clean|cleaned|cleaning)$/, 'cleaning'], [/^(weight|weigh|w|váha)$/, 'weight'], [/^(shed|svlek)$/, 'shed'], [/^(note|poznámka)$/, 'note'], [/^(task|úkol)$/, 'task']];
export function parseCommand(text) {
  const db = store.get(), words = text.trim().toLowerCase().replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const vm = VERBS.find(([re]) => re.test(words[0])); if (!vm) return { error: `Unknown action “${words[0]}”. Try: fed, refused, water, mist, clean, weight, shed, note, task.` };
  const verb = vm[1], rest = words.slice(1);
  if (verb === 'task') return { verb, title: text.trim().split(/\s+/).slice(1).join(' ') };
  const subjects = [], nums = []; let noteWords = [];
  for (const w of rest) {
    const a = db.animals.find((x) => x.code.toLowerCase() === w || x.code.toLowerCase().replace('-', '') === w.replace('-', ''));
    if (a) { subjects.push(a.id); continue; }
    if (w === 'all' || w === 'due') { const n = Date.now(); const due = buildTimeline(db, { from: startOfDay(n) - DAY, to: startOfDay(n) + DAY, includeHistory: false }).filter((i) => i.type === (verb === 'refused' ? 'feeding' : verb) && (i.status === 'open' || i.status === 'overdue')); subjects.push(...new Set(due.map((i) => i.subject))); continue; }
    if (/^\d+([.,]\d+)?g?$/.test(w)) { nums.push(parseFloat(w.replace(',', '.'))); continue; }
    noteWords.push(w);
  }
  if (!subjects.length) return { error: 'No animal code recognised — e.g. “fed AZ-01”.' };
  if (verb === 'weight' && !nums.length) return { error: 'Add the weight, e.g. “weight MSP-04 1850”.' };
  return { verb, subjects: [...new Set(subjects)], g: nums[0], note: noteWords.join(' ') };
}
export function runCommand(p) {
  if (!p || p.error) return null;
  if (p.verb === 'task') { A.addTask({ title: p.title, due: Date.now() + 3600e3 }); return { label: `Created task “${p.title}”` }; }
  if (p.verb === 'note') return A.quickRecord('note', p.subjects, { text: p.note, note: p.note });
  if (p.verb === 'refused') return A.quickRecord('feeding', p.subjects, { refused: true });
  return A.quickRecord(p.verb, p.subjects, { g: p.g, note: p.note || undefined });
}
export function openCommand(voice = false) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const h = modal({ title: voice ? 'Voice & command line' : 'Command line', sub: 'Say or type what you did — IR Manager parses it', icon: voice ? 'mic' : 'command', width: 520, body: `<div class="stack">
    ${SR ? `<button class="btn lg block" data-mic>${icon('mic')}Hold to speak</button>` : voice ? `<p class="muted">${icon('info')} Speech recognition is not available in this browser — the command line below accepts the same phrases (and a dictation keyboard works too).</p>` : ''}
    <div class="qr-search"><span>${icon('command')}</span><input type="text" data-cmd placeholder="fed az-01 az-03 · weight msp-04 1850 · mist all" autofocus autocomplete="off"></div>
    <div data-cmd-out class="cmd-out"></div>
    <div class="chips">${['fed az-01', 'mist all', 'weight msp-04 1850', 'refused pr-03', 'task order dubia'].map((x) => `<button class="chip" data-ex="${x}">${x}</button>`).join('')}</div></div>` });
  const inp = h.el.querySelector('[data-cmd]'), out = h.el.querySelector('[data-cmd-out]');
  const preview = () => { const p = parseCommand(inp.value); if (!inp.value.trim()) { out.innerHTML = ''; return; } const db = store.get(); out.innerHTML = p?.error ? `<p class="danger-t">${esc(p.error)}</p>` : `<div class="cmd-pv">${icon(TYPE[p.verb === 'refused' ? 'feeding' : p.verb]?.icon || 'tasks')}<b>${esc(p.verb === 'refused' ? 'Feeding refused' : TYPE[p.verb]?.label || 'Task')}</b>${p.subjects ? `<span>${p.subjects.map((id) => esc(db.animals.find((a) => a.id === id)?.code)).join(', ')}</span>` : `<span>${esc(p.title)}</span>`}${p.g ? `<span class="mono">${p.g} g</span>` : ''}<button class="btn primary sm" data-run>${icon('check')}Record</button></div>`; };
  const run = () => { const p = parseCommand(inp.value); if (!p || p.error) return; const res = runCommand(p); closeOv(h); done(res); };
  inp.addEventListener('input', preview);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  h.el.addEventListener('click', (e) => { const x = e.target.closest('[data-ex]'); if (x) { inp.value = x.dataset.ex; preview(); inp.focus(); } if (e.target.closest('[data-run]')) run(); });
  const mic = h.el.querySelector('[data-mic]');
  if (mic && SR) { mic.onclick = () => { const r = new SR(); r.lang = store.get().prefs.lang === 'cs' ? 'cs-CZ' : 'en-US'; r.interimResults = true; mic.classList.add('rec'); r.onresult = (ev) => { inp.value = [...ev.results].map((x) => x[0].transcript).join(' '); preview(); }; r.onend = () => mic.classList.remove('rec'); r.onerror = () => { mic.classList.remove('rec'); info('Voice not available'); }; r.start(); }; }
}

// ---------------------------------------------------------------- mobile MORE menu — dedicated, large rows, accordion in place (no navigation)
export function openMore() {
  let open = {}; try { open = JSON.parse(localStorage.getItem('irmB.more') || '{}'); } catch {}
  const cur = G.app.route;
  const body = `<div class="more">${NAV.map((g) => `<div class="more-g"><h6>${t(g.group)}</h6>${g.items.map((it) => {
    const has = it.subs.length > 0, isOpen = open[it.id] ?? (cur.mod === it.id);
    return `<div class="more-i ${cur.mod === it.id ? 'cur' : ''} ${isOpen ? 'open' : ''}" data-mi="${it.id}">
      ${has ? `<button class="more-row" data-more-toggle="${it.id}" aria-expanded="${isOpen}">${icon(it.icon)}<span>${t(it.label)}</span><em class="chev">${icon('chevronDown')}</em></button>` : `<a class="more-row" href="#/${it.id}" data-close>${icon(it.icon)}<span>${t(it.label)}</span>${icon('chevronRight')}</a>`}
      ${has ? `<div class="more-subs">${it.subs.map(([k, l]) => `<a href="#/${it.id}/${k}" data-close class="${cur.mod === it.id && (cur.sub || it.subs[0][0]) === k ? 'on' : ''}">${t(l)}</a>`).join('')}</div>` : ''}</div>`;
  }).join('')}</div>`).join('')}</div>`;
  const h = panel({ title: t('More'), kind: 'sheet', cls: 'more-sheet', body });
  h.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-more-toggle]'); if (!b) return;
    const it = b.closest('.more-i'); it.classList.toggle('open'); b.setAttribute('aria-expanded', it.classList.contains('open'));
    open[b.dataset.moreToggle] = it.classList.contains('open'); try { localStorage.setItem('irmB.more', JSON.stringify(open)); } catch {}
  });
}

// ---------------------------------------------------------------- profile menu
function toggleTheme() { store.mutate(null, (db) => { db.prefs.theme = db.prefs.theme === 'light' ? 'dark' : 'light'; }); document.documentElement.dataset.theme = store.get().prefs.theme; }
function profileMenu(el) {
  const db = store.get();
  menu(el, [
    { icon: db.prefs.theme === 'light' ? 'moon' : 'sun', label: db.prefs.theme === 'light' ? 'Dark theme' : 'Light theme', run: toggleTheme },
    { icon: 'languages', label: db.prefs.lang === 'cs' ? 'English' : 'Čeština', run: () => { store.mutate(null, (d) => { d.prefs.lang = d.prefs.lang === 'cs' ? 'en' : 'cs'; }); location.reload(); } },
    { icon: 'keyboard', label: 'Keyboard shortcuts', hint: '?', run: shortcuts },
    { sep: true },
    { icon: 'settings', label: 'Settings', run: () => (location.hash = '#/settings/app') },
    { icon: 'refresh', label: 'Reset demo data', danger: true, run: async () => { if (await confirmDialog({ title: 'Reset demo data?', text: 'Restores the demo collection and removes everything recorded in this browser. Workspaces and notes are kept.', ok: 'Reset' })) { store.reset(); info('Demo data restored'); } } },
  ], { title: db.user.name, align: 'start' });
}
export { toggleTheme };
