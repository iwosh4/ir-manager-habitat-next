// Globální chování hlavičky: Rychlý záznam · QR (skenování) · Hlas (poslech) · Hledat · Oznámení · Profil · Více (mobil).
import { esc, $, $$, actions, debounce } from '../core/dom.js';
import { gl, ico, tile } from '../core/icons.js';
import { modal, panel, menu, close as closeOv, closeAll, closeMenu, overlayOpen, topOverlay, isMobile, toast, confirmDialog } from '../core/overlay.js';
import * as store from '../core/store.js';
import { SPECIES, latin } from '../data/species.js';
import { TYPE } from '../engine/ops.js';
import { buildTimeline, isOpen } from '../engine/timeline.js';
import { notifications } from '../engine/notify.js';
import * as A from '../engine/actions.js';
import { NAV, SECONDARY, MODULES } from '../nav.js';
import { avatar } from './components.js';
import { done, info } from './feedback.js';
import { openQuickRecord } from './quickrecord.js';
import { DAY, HOUR, startOfDay, hm, rel, dShort } from '../core/time.js';

let G = null;
export function installGlobal(g) { G = g; document.addEventListener('keydown', onKey); }

/** Context from the current route — Quick Record never asks for what the screen already knows. */
export function routeContext() {
  const r = G.app.route || {};
  if (r.mod === 'zvirata' && r.sub === 'karta' && r.id) return { subjects: [r.id] };
  if (r.mod === 'ubikace' && r.sub === 'detail' && r.id) return { enclosure: r.id };
  if (r.mod === 'reprodukce' && r.sub === 'cyklus' && r.id) { const cy = store.get().cycles.find((c) => c.id === r.id); return cy ? { type: 'repro', subjects: [cy.female], cycle: cy.id } : {}; }
  return {};
}

// ------------------------------------------------------------------ QR: scanning state (viewfinder + scan line), code entry fallback
function openQR() {
  const btn = $('[data-role=qr]'); btn?.classList.add('scanning');
  const db = store.get(), demo = ['a_pr02', 'a_az01', 'e_inc', 'a_msp04'].map((id) => db.animals.find((a) => a.id === id) || db.enclosures.find((e) => e.id === id));
  const h = modal({ title: 'Skenovat QR', sub: 'Namiřte kameru na štítek terária nebo boxu', icon: 'scan', width: 480, cls: 'qr-scan', onClose: () => btn?.classList.remove('scanning'),
    body: `<div class="scan-view"><div class="scan-frame"><i></i><i></i><i></i><i></i><b class="scan-line"></b></div><span class="scan-state" data-role="scan-state">${gl('scan')}Hledám kód…</span></div>
      <div class="searchbox">${gl('tag')}<input data-code placeholder="nebo zadejte kód (např. PR-02, INC-1)" autofocus></div>
      <div class="chips"><span class="meta">Ukázkové štítky:</span>${demo.map((x) => `<button class="chip" data-demo="${x.code}">${esc(x.code)}</button>`).join('')}</div>` });
  const resolve = (code) => {
    const c = code.trim().toUpperCase(); if (!c) return;
    const a = db.animals.find((x) => x.code.toUpperCase() === c), e = db.enclosures.find((x) => x.code.toUpperCase() === c);
    const st = h.el.querySelector('[data-role=scan-state]');
    if (!a && !e) { st.innerHTML = `${gl('alert')}Kód ${esc(c)} nenalezen`; st.className = 'scan-state bad'; return; }
    st.innerHTML = `${gl('check-circle')}Nalezeno · ${esc(c)}`; st.className = 'scan-state ok'; h.el.querySelector('.scan-frame').classList.add('found');
    setTimeout(() => { closeOv(h); location.hash = a ? `#/zvirata/karta/${a.id}` : `#/ubikace/detail/${e.id}`; }, 420);
  };
  h.el.addEventListener('click', (ev) => { const d = ev.target.closest('[data-demo]'); if (d) resolve(d.dataset.demo); });
  h.el.querySelector('[data-code]').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') resolve(ev.target.value); });
  if ('BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia) h.el.querySelector('.scan-view').insertAdjacentHTML('beforeend', '<span class="meta scan-hint">Kamera se zapne po povolení v prohlížeči.</span>');
}

// ------------------------------------------------------------------ VOICE: idle → listening (waveform) → processing → result
const VOICE_HELP = ['„nakrmit PR-02“', '„rosení AZ-01“', '„vážení Mango 48“', '„najít Tessa“', '„otevřít sklad“'];
export function parseCommand(text) {
  const db = store.get(), t = text.toLowerCase().trim();
  const find = () => db.animals.find((a) => t.includes(a.code.toLowerCase()) || (a.name && t.includes(a.name.toLowerCase())));
  const a = find();
  const typ = /nakrm|krmen/.test(t) ? 'feeding' : /ros/.test(t) ? 'misting' : /vod/.test(t) ? 'water' : /váž|vaz/.test(t) ? 'weight' : /svl/.test(t) ? 'shed' : /úkl|ukl|čišt/.test(t) ? 'cleaning' : null;
  const g = t.match(/(\d+(?:[.,]\d+)?)\s*g?\b/);
  if (/^(najít|najdi|hledat|hledej)\b/.test(t)) return { kind: 'search', q: t.replace(/^(najít|najdi|hledat|hledej)\s*/, '') };
  if (/otevř|jdi|přejdi/.test(t)) { const m = NAV.find((x) => t.includes(x.label.toLowerCase().slice(0, 5))); if (m) return { kind: 'go', href: `#/${m.id}`, label: m.label }; }
  if (typ && a) return { kind: 'record', type: typ, subject: a, g: typ === 'weight' && g ? +g[1].replace(',', '.') : null };
  if (a) return { kind: 'open', subject: a };
  return { kind: 'unknown' };
}
function openVoice() {
  const btn = $('[data-role=voice]'); const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const setState = (s) => { btn?.classList.remove('listening', 'processing'); if (s) btn?.classList.add(s); const el = h?.el.querySelector('[data-role=v-state]'); if (el) { el.className = `v-state ${s || ''}`; el.innerHTML = s === 'listening' ? `<i class="wave big"><b></b><b></b><b></b><b></b><b></b></i><span>Poslouchám…</span>` : s === 'processing' ? `${gl('sync')}<span>Zpracovávám…</span>` : `${gl('mic')}<span>Klepněte a mluvte, nebo napište příkaz</span>`; } };
  let rec = null;
  const h = panel({ title: 'Hlasové zadání', sub: 'Česky: záznam, vyhledání nebo navigace', icon: 'mic', width: 460, kind: isMobile() ? 'sheet' : 'auto', onClose: () => { try { rec?.stop(); } catch {} setState(null); },
    body: `<div class="voice"><button class="v-orb" data-v="listen" aria-label="Spustit poslech">${gl('mic')}</button><div class="v-state" data-role="v-state"></div>
      <div class="searchbox">${gl('edit')}<input data-v-in placeholder="např. nakrmit PR-02" autofocus></div><div class="v-out" data-role="v-out"></div>
      <div class="v-help"><span class="meta">Zkuste:</span>${VOICE_HELP.map((x) => `<button class="chip" data-v-ex="${esc(x.replace(/[„“]/g, ''))}">${esc(x)}</button>`).join('')}</div></div>` });
  const run = (text) => {
    setState('processing');
    setTimeout(() => {
      const p = parseCommand(text), out = h.el.querySelector('[data-role=v-out]');
      setState(null);
      if (p.kind === 'record') { out.innerHTML = `<div class="v-res">${avatar(p.subject, 40)}<div><b>${esc(TYPE[p.type].label)} · <span class="code">${esc(p.subject.code)}</span>${p.g ? ` · ${p.g} g` : ''}</b><span class="meta">Rozpoznáno: „${esc(text)}“</span></div><button class="btn primary" data-v-do>${gl('check')}Zapsat</button></div>`; out.querySelector('[data-v-do]').onclick = () => { closeOv(h); if (p.type === 'weight' && p.g) done(A.quickRecord('weight', [p.subject.id], { g: p.g }), { msg: 'Hmotnost uložena' }); else if (p.type === 'weight') openQuickRecord({ type: 'weight', subjects: [p.subject.id] }); else done(A.quickRecord(p.type, [p.subject.id], {}), { msg: `${TYPE[p.type].label} zapsáno · ${p.subject.code}` }); }; }
      else if (p.kind === 'search') { closeOv(h); openSearch(p.q); }
      else if (p.kind === 'go') { closeOv(h); location.hash = p.href; }
      else if (p.kind === 'open') { closeOv(h); location.hash = `#/zvirata/karta/${p.subject.id}`; }
      else out.innerHTML = `<div class="v-res bad">${gl('alert')}<span>Nerozuměl jsem: „${esc(text)}“. Zkuste kód zvířete a činnost.</span></div>`;
    }, 450);
  };
  h.el.addEventListener('click', (e) => {
    const ex = e.target.closest('[data-v-ex]'); if (ex) { h.el.querySelector('[data-v-in]').value = ex.dataset.vEx; run(ex.dataset.vEx); return; }
    if (e.target.closest('[data-v=listen]')) {
      if (!SR) { setState('listening'); setTimeout(() => { setState(null); info('Rozpoznávání řeči není v tomto prohlížeči dostupné — napište příkaz.'); }, 1400); return; }
      rec = new SR(); rec.lang = 'cs-CZ'; rec.interimResults = false; setState('listening');
      rec.onresult = (ev) => { const txt = ev.results[0][0].transcript; h.el.querySelector('[data-v-in]').value = txt; run(txt); };
      rec.onerror = () => setState(null); rec.onend = () => { if (btn?.classList.contains('listening')) setState(null); };
      try { rec.start(); } catch { setState(null); }
    }
  });
  h.el.querySelector('[data-v-in]').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value.trim()) run(e.target.value); });
  setState(null);
}

// ------------------------------------------------------------------ SEARCH: grouped command palette
export function openSearch(initial = '') {
  const db = store.get();
  const h = modal({ title: '', width: 700, cls: 'search-modal', body: `<div class="sp"><div class="sp-in">${ico('search')}<input type="search" placeholder="Hledat zvíře, úkol, ubikaci, kontakt…" value="${esc(initial)}" autofocus aria-label="Hledat"><kbd>Esc</kbd></div><div class="sp-res" data-role="sp-res"></div></div>` });
  const inp = h.el.querySelector('input'), res = h.el.querySelector('[data-role=sp-res]'); let sel = 0, flat = [];
  const groups = (q) => {
    const Q = q.toLowerCase().trim(), m = (s) => !Q || s.toLowerCase().includes(Q);
    const out = [];
    const an = db.animals.filter((a) => a.status !== 'deceased' && m(`${a.code} ${a.name} ${latin(SPECIES[a.species])} ${SPECIES[a.species].cz} ${a.morph || ''}`)).slice(0, Q ? 8 : 5);
    out.push(['Zvířata', an.map((a) => ({ href: `#/zvirata/karta/${a.id}`, html: `${avatar(a, 34)}<span class="sp-t"><b><span class="code">${esc(a.code)}</span> ${esc(a.name || '')}</b><span class="latin small">${esc(latin(SPECIES[a.species]))}</span></span>` }))]);
    const now = Date.now(), tl = buildTimeline(db, { from: now - 3 * DAY, to: now + 3 * DAY, includeHistory: false }).filter((i) => isOpen(i) && m(`${i.title} ${i.sub?.code || ''}`)).slice(0, Q ? 6 : 3);
    out.push(['Úkoly', tl.map((i) => ({ href: '#/ukoly/planovac', html: `${ico(TYPE[i.type]?.icon || 'tasks', 'sm')}<span class="sp-t"><b>${esc(i.title)}${i.sub ? ` · <span class="code">${esc(i.sub.code)}</span>` : ''}</b><span class="meta">${i.status === 'overdue' ? 'po termínu · ' : ''}${hm(i.t)} · ${rel(i.t)}</span></span>` }))]);
    out.push(['Ubikace', db.enclosures.filter((e) => m(`${e.code} ${e.name}`)).slice(0, Q ? 5 : 2).map((e) => ({ href: `#/ubikace/detail/${e.id}`, html: `${ico('habitat', 'sm')}<span class="sp-t"><b><span class="code">${esc(e.code)}</span> ${esc(e.name)}</b><span class="meta">${e.dims.w} × ${e.dims.d} × ${e.dims.h} cm</span></span>` }))]);
    out.push(['Reprodukce', [...db.cycles.filter((c) => c.status === 'active' && m(c.name)).map((c) => ({ href: `#/reprodukce/cyklus/${c.id}`, html: `${ico('reproduction', 'sm')}<span class="sp-t"><b>${esc(c.name)}</b><span class="meta">cyklus</span></span>` })), ...db.clutches.filter((c) => m(c.code)).map((c) => ({ href: `#/reprodukce/snuska/${c.id}`, html: `${ico('reproduction', 'sm')}<span class="sp-t"><b>${esc(c.code)}</b><span class="meta">snůška · ${esc(SPECIES[c.species].latin)}</span></span>` }))].slice(0, Q ? 5 : 2)]);
    out.push(['Dokumenty', db.documents.filter((d) => m(d.name)).slice(0, Q ? 4 : 1).map((d) => ({ href: '#/adresar/dokumenty', html: `${gl('file')}<span class="sp-t"><b>${esc(d.name)}</b><span class="meta">${esc(d.kind)} · ${dShort(d.date)}</span></span>` }))]);
    out.push(['Kontakty', db.contacts.filter((c) => m(`${c.name} ${c.org} ${c.city}`)).slice(0, Q ? 4 : 1).map((c) => ({ href: `#/adresar/kontakty/${c.id}`, html: `${gl('user')}<span class="sp-t"><b>${esc(c.name)}</b><span class="meta">${esc(c.org || c.city)}</span></span>` }))]);
    out.push(['Moduly', [...NAV, ...SECONDARY].filter((x) => Q && m(x.label)).map((x) => ({ href: `#/${x.id}`, html: `${ico(x.icon, 'sm')}<span class="sp-t"><b>${esc(x.label)}</b><span class="meta">modul</span></span>` }))]);
    return out.filter(([, l]) => l.length);
  };
  const draw = () => {
    const G2 = groups(inp.value); flat = G2.flatMap(([, l]) => l); sel = Math.min(sel, flat.length - 1);
    let k = 0; res.innerHTML = G2.length ? G2.map(([g, l]) => `<div class="sp-g"><h6>${g}</h6>${l.map((x) => `<a class="sp-row ${k === sel ? 'on' : ''}" href="${x.href}" data-k="${k++}">${x.html}${gl('arrow-right', 'sp-go')}</a>`).join('')}</div>`).join('') : `<div class="sp-empty">${gl('search')}<span>Nic nenalezeno pro „${esc(inp.value)}“</span></div>`;
  };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(flat.length - 1, sel + 1); draw(); } if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); } if (e.key === 'Enter' && flat[sel]) { e.preventDefault(); closeOv(h); location.hash = flat[sel].href; } });
  res.addEventListener('click', (e) => { const a = e.target.closest('.sp-row'); if (a) { e.preventDefault(); closeOv(h); location.hash = a.getAttribute('href'); } });
  draw();
}

// ------------------------------------------------------------------ NOTIFICATIONS: priority categories with direct actions
const CAT = [['overdue', 'Po termínu', 'status-warning'], ['health', 'Zdraví', 'health'], ['incubation', 'Inkubace', 'reproduction'], ['repro', 'Reprodukce', 'reproduction'], ['stock', 'Sklad', 'inventory'], ['enclosure', 'Ubikace', 'habitat']];
function notifBody() {
  const db = store.get(), n = notifications(db), now = Date.now();
  const od = buildTimeline(db, { from: now - 7 * DAY, to: now, includeHistory: false }).filter((i) => i.status === 'overdue' && (i.kind === 'occ' || i.kind === 'task')).slice(0, 8);
  const rows = { overdue: od.map((i) => ({ id: i.id, prio: 'high', icon: TYPE[i.type]?.icon || 'tasks', title: `${(TYPE[i.type]?.label || 'Úkol').toUpperCase()} PO TERMÍNU`, text: `${i.sub?.species ? latin(i.sub.species) : i.title} ${i.sub?.code ? `· ${i.sub.code}` : ''}`, meta: `${hm(i.t)} · ${rel(i.t)}`, acts: `<button class="btn sm primary" data-n-done="${esc(i.id)}">${gl('check')}${i.type === 'feeding' ? 'NAKRMIT' : 'HOTOVO'}</button><button class="btn sm" data-n-later="${esc(i.id)}">${gl('later')}ODLOŽIT</button>` })) };
  for (const x of n.filter((x) => x.kind !== 'overdue')) (rows[x.kind] ||= []).push({ id: x.id, prio: x.prio, icon: x.icon, title: x.title, text: x.text, meta: rel(x.t), read: x.read, acts: `<a class="btn sm" href="${x.link}" data-n-go="${esc(x.id)}">Otevřít</a>` });
  const total = Object.values(rows).reduce((s, a) => s + a.length, 0);
  return `<div class="nc">${total ? CAT.filter(([k]) => rows[k]?.length).map(([k, l, ic]) => `<section class="nc-g"><h6>${ico(ic, 'xs')}${l}<em>${rows[k].length}</em></h6>${rows[k].map((r) => `<article class="nc-i p-${r.prio} ${r.read ? 'read' : ''}">${ico(r.icon, 'sm')}<div class="nc-t"><b>${esc(r.title)}</b><span>${esc(r.text || '')}</span><em class="meta">${esc(r.meta)}</em></div><div class="nc-a">${r.acts}</div></article>`).join('')}</section>`).join('') : `<div class="empty">${tile('status-ok', 'lg')}<b>Vše vyřízeno</b><span class="muted small">Žádná nová oznámení.</span></div>`}</div>`;
}
function openNotifications() {
  const bell = $('[data-role=bell]'); bell?.classList.remove('pulse');
  const h = panel({ title: 'Oznámení', sub: 'Podle priority — akce přímo odsud', icon: 'bell', width: 460, body: notifBody(), footer: `<button class="btn tertiary" data-n-read>${gl('check')}Označit vše jako přečtené</button><span class="spacer"></span><a class="btn sm" href="#/nastaveni/oznameni" data-close>${gl('settings')}Nastavení</a>` });
  const redraw = () => { h.el.querySelector('.ov-body').innerHTML = notifBody(); };
  h.el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-n-done]'); if (d) { const art = d.closest('.nc-i'); art.classList.add('is-done'); setTimeout(() => { done(A.complete([d.dataset.nDone], { source: 'notifications' })); redraw(); }, 220); return; }
    const l = e.target.closest('[data-n-later]'); if (l) { done(A.postpone([l.dataset.nLater], '1h')); redraw(); return; }
    const g = e.target.closest('[data-n-go]'); if (g) { store.mutate(null, (db) => { if (!db.readNotifications.includes(g.dataset.nGo)) db.readNotifications.push(g.dataset.nGo); }, { silent: true }); closeOv(h); }
    if (e.target.closest('[data-n-read]')) { store.mutate(null, (db) => { for (const x of notifications(db)) if (!db.readNotifications.includes(x.id)) db.readNotifications.push(x.id); }); redraw(); info('Vše označeno jako přečtené'); }
  });
}

// ------------------------------------------------------------------ PROFILE menu & mobile MORE
function profileMenu(el) {
  const db = store.get(), liveOn = db.prefs.live?.enabled !== false, motionOn = db.prefs.motion !== 'off';
  menu(el, [
    { icon: 'user', label: 'Můj účet', run: () => (location.hash = '#/nastaveni/aplikace') },
    { icon: 'settings', label: 'Nastavení aplikace', run: () => (location.hash = '#/nastaveni/aplikace') },
    { sep: true },
    { icon: liveOn ? 'pause' : 'play', label: liveOn ? 'Skrýt živý pás' : 'Zobrazit živý pás', run: () => { store.mutate(null, (d) => { d.prefs.live = { ...(d.prefs.live || {}), enabled: !liveOn }; }); import('./live.js').then((m) => m.refreshLive({ force: true })); } },
    { icon: 'wave', label: motionOn ? 'Omezit pohyb' : 'Zapnout pohyb', run: () => { store.mutate(null, (d) => { d.prefs.motion = motionOn ? 'off' : 'full'; }); document.documentElement.dataset.motion = motionOn ? 'off' : 'full'; } },
    { icon: 'calculator', label: 'Nástroje', hint: 'T', run: () => (location.hash = '#/nastroje') },
    { icon: 'help', label: 'Klávesové zkratky', hint: '?', run: shortcuts },
    { sep: true },
    { icon: 'sync', label: 'Obnovit ukázková data', run: async () => { if (await confirmDialog({ title: 'Obnovit ukázková data?', text: 'Všechny změny v náhledu budou nahrazeny čerstvou ukázkovou sbírkou.', ok: 'Obnovit', danger: false })) { store.reset(); info('Ukázková data obnovena'); } } },
    { icon: 'door-out', label: 'Odhlásit se', hint: 'náhled', run: () => info('V náhledu se neodhlašuje — data jsou jen v tomto prohlížeči.') },
  ], { title: db.user.name });
}
function shortcuts() {
  modal({ title: 'Klávesové zkratky', icon: 'help', width: 440, body: `<dl class="kbd-list">${[['Q', 'Rychlý záznam'], ['/', 'Hledat'], ['Ctrl K', 'Hledat'], ['N', 'Nový záznam v kontextu'], ['T', 'Nástroje'], ['G potom P', 'Přehled'], ['G potom Z', 'Zvířata'], ['G potom U', 'Úkoly & péče'], ['G potom R', 'Reprodukce'], ['G potom S', 'Sklad'], ['Ctrl Z', 'Zpět (poslední akce)'], ['Esc', 'Zavřít']].map(([k, l]) => `<dt><kbd>${k}</kbd></dt><dd>${l}</dd>`).join('')}</dl>` });
}
let moreOpen = {};
function openMore() {
  const r = G.app.route || {};
  try { moreOpen = JSON.parse(localStorage.getItem('irmO.more') || '{}'); } catch {}
  const body = `<nav class="more">${[...NAV, ...SECONDARY, { id: 'nastaveni', label: 'Nastavení', icon: 'settings', subs: MODULES.nastaveni.subs }].map((m) => { const open = moreOpen[m.id] ?? m.id === r.mod; return `<div class="more-i ${open ? 'open' : ''} ${m.id === r.mod ? 'cur' : ''}" data-more-i="${m.id}">
    <div class="more-row"><a href="#/${m.id}${m.subs?.[0] ? `/${m.subs[0][0]}` : ''}" data-close>${ico(m.icon, 'md')}<span>${esc(m.label)}</span></a>${m.subs?.length ? `<button class="icon-btn" data-more-toggle="${m.id}" aria-expanded="${open}" aria-label="Rozbalit ${esc(m.label)}">${gl('chevron-down')}</button>` : ''}</div>
    ${m.subs?.length ? `<div class="more-subs">${m.subs.map(([k, l]) => `<a href="#/${m.id}/${k}" class="${r.mod === m.id && r.sub === k ? 'on' : ''}" data-close>${esc(l)}</a>`).join('')}</div>` : ''}</div>`; }).join('')}</nav>`;
  const h = panel({ title: 'Více', icon: 'menu', kind: 'sheet', cls: 'more-sheet', body });
  h.el.addEventListener('click', (e) => { const b = e.target.closest('[data-more-toggle]'); if (!b) return; const it = b.closest('.more-i'); it.classList.toggle('open'); b.setAttribute('aria-expanded', it.classList.contains('open')); moreOpen[b.dataset.moreToggle] = it.classList.contains('open'); try { localStorage.setItem('irmO.more', JSON.stringify(moreOpen)); } catch {} });
}

// ------------------------------------------------------------------ keyboard
let gPending = 0;
function onKey(e) {
  const typing = e.target.matches('input, textarea, select, [contenteditable]');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); closeAll(); openSearch(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); const l = store.undo(); if (l) info(`Vráceno: ${l}`); return; }
  if (e.key === 'Escape') { if (closeMenu()) return; if (overlayOpen()) { closeOv(topOverlay()); return; } }
  if (typing || e.ctrlKey || e.metaKey || e.altKey || overlayOpen()) return;
  const k = e.key.toLowerCase();
  if (gPending && Date.now() - gPending < 1200) { gPending = 0; const map = { p: 'prehled', z: 'zvirata', u: 'ukoly', h: 'zdravi', b: 'ubikace', r: 'reprodukce', s: 'sklad', f: 'finance', a: 'adresar', n: 'nastroje' }; if (map[k]) { e.preventDefault(); location.hash = `#/${map[k]}`; } return; }
  if (k === 'g') { gPending = Date.now(); return; }
  if (k === 'q') { e.preventDefault(); openQuickRecord(routeContext()); }
  else if (k === '/') { e.preventDefault(); openSearch(); }
  else if (k === 'n') { e.preventDefault(); const v = G.app.view; if (v?.onNew) v.onNew(G.app.route); else openQuickRecord({ ...routeContext(), type: 'task' }); }
  else if (k === 't') { e.preventDefault(); location.hash = '#/nastroje'; }
  else if (k === '?') { e.preventDefault(); shortcuts(); }
}

actions({
  'quick-record': (el) => openQuickRecord({ ...routeContext(), ...(el.dataset.type ? { type: el.dataset.type } : {}), ...(el.dataset.subject ? { subjects: [el.dataset.subject] } : {}) }),
  'qr-type': (el) => openQuickRecord({ ...routeContext(), type: el.dataset.type, ...(el.dataset.subject ? { subjects: [el.dataset.subject] } : {}) }),
  qr: () => openQR(),
  voice: () => openVoice(),
  search: () => openSearch(),
  notifications: () => openNotifications(),
  profile: (el) => profileMenu(el),
  more: () => openMore(),
  go: (el) => { closeAll(); const h = el.dataset.href; if (h.startsWith('#')) location.hash = h; else window.open(h, '_blank', 'noopener'); },
  'edit-record': (el) => import('./quickrecord.js').then((m) => m.editRecordPanel(el.dataset.id)),
  undo: () => { const l = store.undo(); if (l) info(`Vráceno: ${l}`); },
});
export { openNotifications, openMore, openQR, openVoice, shortcuts };
