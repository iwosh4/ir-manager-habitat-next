// PROVOZNÍ ČASOVÁ OSA — jeden renderer pro Plánovač (full), Přehled (compact), Kartu zvířete (animal),
// Reprodukci (repro) a Ubikace (enclosure). Klidná osa: PO TERMÍNU / TEĎ / DNES / ZÍTRA / NÁSLEDUJÍCÍ.
// Každá položka nese přímé akce HOTOVO · ODLOŽIT · VYNECHAT · DETAIL.
import { esc, actions } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { menu, panel, close as closeOv, toast } from '../core/overlay.js';
import { SUPPLEMENTS, latin } from '../data/species.js';
import { TYPE, rotationState } from '../engine/ops.js';
import { buildTimeline, groupItems, isOpen, FILTERS } from '../engine/timeline.js';
import * as A from '../engine/actions.js';
import { avatar, rangeBar } from './components.js';
import { done } from './feedback.js';
import { editRecordPanel } from './quickrecord.js';
import { DAY, HOUR, MIN, startOfDay, hm, dShort, rel, wd, wdLong, toLocalInput, daysBetween, plural } from '../core/time.js';

const lateShort = (t) => { const m = Math.round((Date.now() - t) / 60e3); if (m < 1) return ''; return m < 60 ? `+${m} min` : m < 1440 ? `+${Math.round(m / 60)} h` : `+${Math.round(m / 1440)} d`; };
const late = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 60 ? `${m} min po termínu` : m < 1440 ? `${Math.round(m / 60)} h po termínu` : `${Math.round(m / 1440)} d po termínu`; };
export const UI = { expanded: new Set(), sel: new Map(), refused: new Set(), detail: null, doneOpen: false };
const reduced = () => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- sekce na časové ose
export function sections(items, nowTs, { showDone = true } = {}) {
  const sod = startOfDay(nowTs), tom = sod + DAY, after = tom + DAY;
  const S = [];
  const add = (key, label, arr, extra = {}) => { if (arr.length) S.push({ key, label, items: arr, ...extra }); };
  const vis = items.filter((i) => showDone || isOpen(i) || i.kind === 'milestone' && i.status !== 'done' || i.kind === 'phase');
  const overdue = vis.filter((i) => i.status === 'overdue');
  const rest = vis.filter((i) => i.status !== 'overdue');
  const past = rest.filter((i) => i.t < sod && i.kind !== 'phase');
  const doneToday = rest.filter((i) => i.t >= sod && i.t < tom && i.kind !== 'phase' && !isOpen(i) && i.status !== 'span' && i.t < nowTs + 90 * MIN);
  const nowWin = rest.filter((i) => i.t >= sod && i.t < nowTs + 90 * MIN && !doneToday.includes(i) && i.kind !== 'phase');
  const today = rest.filter((i) => i.t >= nowTs + 90 * MIN && i.t < tom && i.kind !== 'phase');
  if (past.length) add('past', 'Dříve', past, { cls: 'sec-past', collapsible: true });
  add('overdue', 'Po termínu', overdue, { cls: 'sec-overdue', icon: 'alert' });
  if (doneToday.length) add('done', `Dnes hotovo`, doneToday, { cls: 'sec-done', collapsible: true });
  S.push({ key: 'now', label: 'Teď', items: nowWin, cls: 'sec-now', now: true });
  add('today', `Dnes · později`, today, { cls: 'sec-today' });
  add('tomorrow', `Zítra · ${wd(tom)} ${dShort(tom)}`, rest.filter((i) => i.t >= tom && i.t < after && i.kind !== 'phase'), { cls: 'sec-tomorrow' });
  const up = rest.filter((i) => i.t >= after && i.kind !== 'phase'); const byDay = {};
  for (const i of up) (byDay[startOfDay(i.t)] ||= []).push(i);
  const days = Object.entries(byDay).sort((a, b) => a[0] - b[0]);
  if (days.length) S.push({ key: 'next', label: 'Následující', cls: 'sec-next', days: days.map(([d, arr]) => ({ d: +d, items: arr })), items: up });
  const spans = rest.filter((i) => i.kind === 'phase');
  if (spans.length) add('phases', 'Biologická okna', spans, { cls: 'sec-phases' });
  return S;
}

// ---------------------------------------------------------------- položka
const doneLabel = (it) => ({ feeding: 'NAKRMENO', incubation: 'KONTROLA', medication: 'PODÁNO', repro: 'POTVRDIT', inventory: 'VIDĚNO' }[it.type] || 'HOTOVO');
export const typeTile = (type, size = '') => { const T = TYPE[type] || TYPE.task; return `<span class="tt ${size}" style="--c:${T.color}">${ico(T.icon)}</span>`; };

function subjectHTML(it, compact) {
  const s = it.sub; if (!s) return '';
  if (s.kind === 'animal') { const a = s.obj; return `<a class="tl-subj" href="#/zvirata/karta/${a.id}">${avatar(a, compact ? 28 : 36)}<span><b class="latin">${esc(latin(s.species))}</b><em><span class="code">${esc(a.code)}</span>${a.kind === 'group' ? ` · ×${a.count}` : a.name ? ` · ${esc(a.name)}` : ''}</em></span></a>`; }
  return `<a class="tl-subj" href="#/ubikace/${s.kind === 'assembly' ? 'sestavy' : `detail/${s.id}`}"><span class="tl-eico">${gl(s.kind === 'assembly' ? 'layout' : 'habitat')}</span><span><b>${esc(s.name)}</b><em class="code">${esc(s.code)}</em></span></a>`;
}
function subjectChip(it) {
  const s = it.sub; if (!s) return '';
  if (s.kind === 'animal') return `<a class="mt subj" href="#/zvirata/karta/${s.obj.id}">${avatar(s.obj, 18)}<b class="code">${esc(s.code)}</b>${s.obj.name ? esc(s.obj.name) : `<i class="latin">${esc(latin(s.species))}</i>`}</a>`;
  return `<a class="mt subj" href="#/ubikace/${s.kind === 'assembly' ? 'sestavy' : `detail/${s.id}`}">${gl('habitat')}<b class="code">${esc(s.code)}</b>${esc(s.name)}</a>`;
}
function metaHTML(it) {
  const m = it.meta || {}, out = [];
  if (it.type === 'feeding') {
    if (m.feeder) out.push(`<span class="mt">${gl('feeding')}${esc(m.feeder)}${m.qty ? ` · ${esc(m.qty)}` : ''}</span>`);
    if (m.supplement) out.push(`<span class="mt sup" style="--c:${SUPPLEMENTS[m.supplement]?.color || 'var(--am)'}"><i></i>${esc(m.supplement)}${m.rotation && it.status !== 'done' ? `<em>${m.rotation.index + 1}/${m.rotation.rot.length}</em>` : ''}</span>`);
    if (m.refused) out.push('<span class="mt bad">odmítnuto</span>');
  }
  if (it.type === 'weight' && it.status !== 'done' && m.last != null) out.push(`<span class="mt">${gl('weight')}naposledy ${m.last} g</span>`);
  if (it.type === 'weight' && m.g != null) out.push(`<span class="mt">${m.g} g</span>`);
  if (it.type === 'medication' && m.dose) out.push(`<span class="mt">${gl('medication')}${esc(m.dose)} · ${esc(m.amount)} · ${esc(m.route)}</span><span class="mt">dávka ${m.n}/${m.of}</span>`);
  if (it.type === 'incubation' && m.day != null) out.push(`<span class="mt">${gl('egg')}${m.fertile}/${m.eggs} vajec</span><span class="mt">den ${m.day} · okno ${m.expected[0]}–${m.expected[1]}</span>`);
  if (it.priority === 'high') out.push('<span class="mt hi">vysoká priorita</span>');
  if (it.postponed && it.status !== 'done') out.push(`<span class="mt">${gl('later')}odloženo${it.due ? ` z ${hm(it.due)}` : ''}</span>`);
  if (it.note) out.push(`<span class="mt note">${gl('note')}${esc(it.note)}</span>`);
  if (it.type === 'inventory' && m.items) { const db = store.get(); out.push(`<span class="mt note">${m.items.map((id) => esc(db.inventory.find((x) => x.id === id)?.name.split(' (')[0])).join(', ')}</span>`); }
  if (it.origin === 'auto' && it.why?.includes('provádí')) out.push(`<span class="mt auto">${gl('bolt')}automaticky</span>`);
  return out.join('');
}
function actionsHTML(it, mode) {
  const id = esc(it.id), compact = mode === 'compact';
  if (it.kind === 'phase') return `<a class="btn sm" href="#/reprodukce/${it.clutch ? `snuska/${it.clutch}` : `cyklus/${it.cycle}`}">${gl('reproduction')}Otevřít</a>`;
  if (it.status === 'done' || it.status === 'skipped' || it.status === 'cancelled') {
    return `<span class="tl-done-t ${it.status}">${gl(it.status === 'done' ? 'check-circle' : 'skip')}${it.status === 'done' ? (it.doneAt ? hm(it.doneAt) : 'hotovo') : it.status === 'skipped' ? 'vynecháno' : 'zrušeno'}</span>${it.recordId ? `<button class="icon-btn sm" data-act="edit-record" data-id="${esc(it.recordId)}" title="Upravit záznam">${gl('edit')}</button>` : ''}${it.kind !== 'record' ? `<button class="icon-btn sm" data-act="tl-reopen" data-id="${id}" title="Znovu otevřít (oprava)">${gl('undo')}</button>` : ''}`;
  }
  if (it.type === 'weight' && it.src === 'occ') return `<span class="tl-wt"><input type="number" inputmode="decimal" step="0.1" placeholder="${it.meta?.last ?? 'g'}" aria-label="Hmotnost v gramech" data-enter="tl-weight" data-id="${id}" id="w-${id}"><em>g</em></span><button class="btn sm done" data-act="tl-weight" data-id="${id}">${gl('check')}ULOŽIT</button>${compact ? '' : `<button class="btn sm" data-act="tl-later" data-id="${id}">${gl('later')}<span class="hide-s">ODLOŽIT</span></button>`}<button class="icon-btn sm" data-act="tl-more" data-id="${id}" aria-label="Detail a další akce">${gl('more')}</button>`;
  if (it.type === 'inventory') return `<button class="btn sm done" data-act="tl-shop" data-id="${id}">${gl('cart')}DO NÁKUPU</button><button class="btn sm tertiary" data-act="tl-done" data-id="${id}">VIDĚNO</button>`;
  return `<button class="btn sm done tl-go" data-act="tl-done" data-id="${id}">${gl('check')}${doneLabel(it)}</button>${it.type === 'feeding' && !compact ? `<button class="btn sm tertiary hide-s" data-act="tl-refused" data-id="${id}" title="Krmení odmítnuto">Odmítl</button>` : ''}<button class="btn sm" data-act="tl-later" data-id="${id}">${gl('later')}<span class="hide-s">ODLOŽIT</span></button>${compact ? '' : `<button class="btn sm tertiary hide-s" data-act="tl-skip" data-id="${id}">VYNECHAT</button>`}<button class="icon-btn sm" data-act="tl-detail" data-id="${id}" title="Detail" aria-label="Detail">${gl('more')}</button>`;
}
export function itemHTML(it, mode = 'full') {
  const compact = mode === 'compact', st = it.status, T = TYPE[it.type] || TYPE.task;
  if (it.kind === 'phase') {
    const n = Date.now(), total = Math.max(1, it.end - it.t), p = Math.max(0, Math.min(1, (n - it.t) / total));
    return `<div class="tl-it phase ${it.expected ? 'expected' : ''}" data-id="${esc(it.id)}" style="--c:${T.color}">
      <div class="tl-time"><b>${dShort(it.t)}</b><em>– ${dShort(it.end)}</em></div><span class="tl-node"></span>
      <div class="tl-card"><div class="tl-main">${typeTile(it.type)}<div class="tl-tx"><div class="tl-title"><b>${esc(it.title)}</b>${it.expected ? '<span class="pill mute">očekávané rozmezí</span>' : ''}</div>
      <div class="tl-sub">${esc(it.cycleName || '')}${it.basis ? ` · ${esc(it.basis)}` : ''}</div><div class="span-bar ${it.expected ? 'exp' : ''}"><i style="transform:scaleX(${p.toFixed(3)})"></i></div></div>
      ${subjectHTML(it, compact)}</div><div class="tl-acts">${actionsHTML(it, mode)}</div></div></div>`;
  }
  const title = it.kind === 'milestone' ? it.title : it.src === 'occ' ? T.label : it.title;
  const second = it.src === 'occ' && it.title !== T.label ? it.title : '';
  const soon = isOpen(it) && it.t > Date.now() && daysBetween(Date.now(), it.t) === 0 && it.t - Date.now() < 12 * HOUR ? rel(it.t) : '';
  return `<div class="tl-it st-${st} ${it.kind === 'milestone' ? 'milestone' : ''} ${it.kind === 'record' ? 'rec' : ''}" data-id="${esc(it.id)}" data-type="${it.type}" style="--c:${T.color}">
    <div class="tl-time"><button class="tl-hm" ${isOpen(it) && it.kind !== 'milestone' ? `data-act="tl-time" data-id="${esc(it.id)}" title="Přeplánovat"` : 'tabindex="-1"'}>${hm(it.t)}</button><em ${st === 'overdue' ? `class="late" title="${late(it.t)}"` : ''}>${st === 'overdue' ? lateShort(it.t) : soon}</em></div><span class="tl-node"></span>
    <div class="tl-card">
      <div class="tl-main">${typeTile(it.type)}<div class="tl-tx"><div class="tl-title"><b>${esc(title)}</b>${second ? `<span class="dim">${esc(second)}</span>` : ''}</div>
        <div class="tl-meta">${compact ? subjectChip(it) : ''}${metaHTML(it)}</div>
        ${it.type === 'incubation' && it.meta?.day != null && !compact ? `<div class="tl-rb">${rangeBar(it.meta.day, it.meta.expected, { compact: true })}</div>` : ''}</div>
        ${compact || mode === 'animal' ? '' : subjectHTML(it, compact)}</div>
      <div class="tl-acts">${actionsHTML(it, mode)}</div>
    </div></div>`;
}
export function groupHTML(g, mode = 'full') {
  const T = TYPE[g.type] || TYPE.task, open = UI.expanded.has(g.id), st = g.status;
  const openItems = g.items.filter(isOpen);
  const sel = UI.sel.get(g.id) || new Set(openItems.map((i) => i.id));
  const avs = g.items.slice(0, 5).map((i) => (i.sub?.obj && i.sub.kind === 'animal' ? avatar(i.sub.obj, 26) : '')).join('') + (g.items.length > 5 ? `<span class="av more">+${g.items.length - 5}</span>` : '');
  const refusedN = openItems.filter((i) => UI.refused.has(i.id)).length;
  return `<div class="tl-it grp st-${st} ${open ? 'open' : ''}" data-id="${esc(g.id)}" style="--c:${T.color}">
    <div class="tl-time"><b>${hm(g.t)}</b><em ${st === 'overdue' ? `class="late" title="${late(g.t)}"` : ''}>${st === 'overdue' ? lateShort(g.t) : ''}</em></div><span class="tl-node"></span>
    <div class="tl-card">
      <div class="tl-main">${typeTile(g.type)}<div class="tl-tx"><div class="tl-title"><b>${T.label.toUpperCase()} <span class="x">×${g.items.length}</span></b><span class="dim">${g.count} ${plural(g.count, 'zvíře', 'zvířata', 'zvířat')}</span></div>
        <div class="tl-meta">${g.feeder ? `<span class="mt">${gl('feeding')}${esc(g.feeder)}</span>` : ''}${g.supplement ? `<span class="mt sup" style="--c:${SUPPLEMENTS[g.supplement]?.color}"><i></i>${esc(g.supplement)}</span>` : ''}${st !== 'done' && g.items.length - openItems.length ? `<span class="mt">${openItems.length} zbývá · ${g.items.length - openItems.length} hotovo</span>` : ''}</div></div>
        <div class="stackav">${avs}</div></div>
      <div class="tl-acts">${openItems.length ? `<button class="btn sm done tl-go" data-act="tl-group-done" data-id="${esc(g.id)}">${gl('check')}HOTOVO VŠE${refusedN ? ` · ${refusedN} odmítl` : ''}</button><button class="btn sm" data-act="tl-expand" data-id="${esc(g.id)}" aria-expanded="${open}">${gl(open ? 'chevron-up' : 'chevron-down')}${open ? 'SBALIT' : 'ROZBALIT'}</button>${mode === 'compact' ? '' : `<button class="btn sm tertiary hide-s" data-act="tl-group-later" data-id="${esc(g.id)}">${gl('later')}ODLOŽIT</button>`}` : `<span class="tl-done-t done">${gl('check-circle')}vše hotovo</span><button class="btn sm tertiary" data-act="tl-expand" data-id="${esc(g.id)}">${gl(open ? 'chevron-up' : 'chevron-down')}${g.items.length}</button>`}</div>
      ${open ? `<div class="grp-list">
        ${openItems.length ? `<div class="grp-bar"><label class="row"><input type="checkbox" class="cb" data-act="tl-sel-all" data-id="${esc(g.id)}" ${sel.size === openItems.length ? 'checked' : ''}><span>Vybrat vše</span></label><span class="muted small">${sel.size} vybráno</span><span class="spacer"></span><button class="btn sm done" data-act="tl-group-sel" data-id="${esc(g.id)}" ${sel.size ? '' : 'disabled'}>${gl('check')}HOTOVO VYBRANÉ</button><button class="btn sm tertiary" data-act="tl-group-skip" data-id="${esc(g.id)}" ${sel.size ? '' : 'disabled'}>VYNECHAT</button></div>` : ''}
        ${g.items.map((i) => { const a = i.sub?.obj; const on = sel.has(i.id), ref = UI.refused.has(i.id); return `<div class="grp-row st-${i.status}" data-id="${esc(i.id)}">${isOpen(i) ? `<input type="checkbox" class="cb" data-act="tl-sel" data-g="${esc(g.id)}" data-id="${esc(i.id)}" ${on ? 'checked' : ''} aria-label="Vybrat ${esc(i.sub?.code)}">` : `<span class="gr-ok">${gl(i.status === 'done' ? 'check' : 'skip')}</span>`}
          ${a ? avatar(a, 30) : ''}<span class="gr-t"><b class="latin">${esc(latin(i.sub?.species))}</b><em class="code">${esc(i.sub?.code || '')}</em></span>${i.meta?.supplement ? `<span class="mt sup" style="--c:${SUPPLEMENTS[i.meta.supplement]?.color}"><i></i>${esc(i.meta.supplement)}</span>` : ''}
          ${isOpen(i) ? (i.type === 'feeding' ? `<button class="chip ${ref ? 'on bad' : ''}" data-act="tl-ref" data-id="${esc(i.id)}">${ref ? 'Odmítl' : 'Odmítl?'}</button>` : '') + `<button class="btn sm done" data-act="tl-done" data-id="${esc(i.id)}" aria-label="Hotovo ${esc(i.sub?.code || '')}">${gl('check')}</button>` : `<span class="muted mono small">${i.doneAt ? hm(i.doneAt) : ''}${i.meta?.refused ? ' · odmítl' : ''}</span><button class="icon-btn sm" data-act="tl-reopen" data-id="${esc(i.id)}" title="Znovu otevřít">${gl('undo')}</button>`}</div>`; }).join('')}</div>` : ''}
    </div></div>`;
}
const render1 = (x, mode) => (x.kind === 'group' ? groupHTML(x, mode) : itemHTML(x, mode));

/** Celý proud. */
export function streamHTML(items, { mode = 'full', nowTs = Date.now(), showDone = true, empty = 'Nic naplánováno', limitNext = 0 } = {}) {
  const grouped = groupItems(items);
  const secs = sections(grouped, nowTs, { showDone });
  if (!secs.some((s) => s.items.length)) return `<div class="tl-empty">${ico('status-ok', 'lg')}<b>${esc(empty)}</b></div>`;
  const sec = (s) => {
    if (s.now) return `<div class="tl-sec sec-now" id="tl-now"><div class="tl-sech now"><span class="now-pill"><i class="now-dot"></i>TEĎ · ${hm(nowTs)}</span><i class="now-line"></i></div>${s.items.length ? s.items.map((x) => render1(x, mode)).join('') : `<div class="tl-quiet">${gl('check-circle')}Právě teď nic nečeká</div>`}</div>`;
    if (s.collapsible) { const open = s.key === 'done' ? UI.doneOpen : UI.expanded.has(`sec:${s.key}`); return `<div class="tl-sec ${s.cls} ${open ? 'open' : 'closed'}" id="sec-${s.key}"><button class="tl-sech tgl" data-act="tl-sec" data-id="${s.key}" aria-expanded="${open}"><b>${esc(s.label)}</b><em>${s.items.length}</em><i></i>${gl(open ? 'chevron-up' : 'chevron-down')}</button>${open ? s.items.map((x) => render1(x, mode)).join('') : ''}</div>`; }
    if (s.days) { const days = limitNext ? s.days.slice(0, limitNext) : s.days; return `<div class="tl-sec ${s.cls}" id="sec-next"><div class="tl-sech"><b>${esc(s.label)}</b><em>${s.items.length}</em><i></i></div>${days.map((d) => `<div class="tl-day"><span>${wdLong(d.d)} ${dShort(d.d)}</span><em>za ${daysBetween(nowTs, d.d)} ${plural(daysBetween(nowTs, d.d), 'den', 'dny', 'dní')}</em></div>${d.items.map((x) => render1(x, mode)).join('')}`).join('')}</div>`; }
    return `<div class="tl-sec ${s.cls}" id="sec-${s.key}"><div class="tl-sech">${s.icon ? gl(s.icon) : ''}<b>${esc(s.label)}</b><em>${s.items.length}</em><i></i></div>${s.items.map((x) => render1(x, mode)).join('')}</div>`;
  };
  return `<div class="tl tl-${mode}">${secs.map(sec).join('')}</div>`;
}

// ---------------------------------------------------------------- akce (sdílené všemi kontexty)
function groupOf(gid) {
  const db = store.get(), n = Date.now();
  return groupItems(buildTimeline(db, { from: startOfDay(n) - 21 * DAY, to: startOfDay(n) + 30 * DAY, includeHistory: false })).find((g) => g.id === gid);
}
function postponeMenu(el, ids) {
  const [it] = A.resolve([ids[0]]); const due = it?.due || it?.t || Date.now();
  const hint = (p) => { const x = A.postponeTarget(p, Date.now(), due); return hm(x) + (x >= startOfDay(Date.now()) + DAY ? ` · ${dShort(x)}` : ''); };
  const opt = (p, l) => ({ icon: 'later', label: l, hint: hint(p), run: () => done(A.postpone(ids, p)) });
  menu(el, [opt('1h', 'O hodinu'), opt('later', 'Později dnes'), opt('tomorrow', 'Zítra'), opt('2d', 'Za 2 dny'), { sep: true }, { icon: 'calendar', label: 'Vybrat datum a čas…', run: () => chooseTime(ids, due) }], { title: 'Odložit' });
}
function chooseTime(ids, due) {
  const h = panel({ title: 'Přeplánovat', icon: 'calendar', width: 380, body: `<label class="field"><span>Nové datum a čas</span><input class="input" type="datetime-local" data-rt value="${toLocalInput(Math.max(Date.now() + HOUR, due))}"></label>`, footer: `<button class="btn tertiary" data-close>Zrušit</button><span class="spacer"></span><button class="btn primary" data-rt-ok>${gl('check')}Přeplánovat</button>` });
  h.el.querySelector('[data-rt-ok]').onclick = () => { const v = new Date(h.el.querySelector('[data-rt]').value).getTime(); if (v) { done(A.postpone(ids, v)); closeOv(h); } };
}
/** DETAIL — proč tu položka je, úprava tohoto výskytu, poznámka, navigace. */
export function editItemPanel(id) {
  const [it] = A.resolve([id]); if (!it) return;
  const db = store.get(), task = it.src === 'task' ? db.tasks.find((x) => x.id === id) : null;
  const plan = it.planId ? db.plans.find((p) => p.id === it.planId) : null;
  const T = TYPE[it.type] || TYPE.task;
  const links = [];
  if (it.subjectKind === 'animal' && it.subject) links.push(`<a class="chip" href="#/zvirata/karta/${it.subject}">${gl('animals')}Karta ${esc(it.sub?.code || '')}</a>`);
  if (it.enclosure) links.push(`<a class="chip" href="#/ubikace/detail/${it.enclosure}">${gl('habitat')}Ubikace</a>`);
  if (it.cycle) links.push(`<a class="chip" href="#/reprodukce/cyklus/${it.cycle}">${gl('reproduction')}Cyklus</a>`);
  const body = `<div class="stack">
    <div class="det-head">${typeTile(it.type, 'lg')}<div><span class="kicker">${esc(T.label)}</span><b class="t-block">${esc(it.title)}</b>${it.sub ? `<div class="muted small">${it.sub.species ? `<i class="latin">${esc(latin(it.sub.species))}</i> · ` : ''}<span class="code">${esc(it.sub.code)}</span></div>` : ''}</div></div>
    <div class="det-why">${gl('info')}<span><b>Proč je to tady:</b> ${esc(it.why || '')}</span></div>
    ${links.length ? `<div class="chips">${links.join('')}</div>` : ''}
    ${task ? `<label class="field"><span>Název</span><input class="input" type="text" data-ed="title" value="${esc(task.title)}"></label>` : ''}
    <div class="fields two"><label class="field"><span>Datum a čas</span><input class="input" type="datetime-local" data-ed="t" value="${toLocalInput(it.t)}"></label>
    ${task ? `<label class="field"><span>Priorita</span><select class="select" data-ed="priority">${[['low', 'nízká'], ['normal', 'běžná'], ['high', 'vysoká']].map(([p, l]) => `<option value="${p}" ${task.priority === p ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : `<label class="field"><span>Stav</span><select class="select" data-ed="status"><option value="open">otevřeno</option><option value="skip">vynechat</option><option value="cancel">zrušit tento výskyt</option></select></label>`}</div>
    ${plan?.type === 'feeding' ? `<div class="fields two"><label class="field"><span>Množství (tentokrát)</span><input class="input" type="text" data-ed="qty" value="${esc(db.occ[id]?.qty || plan.qty)}"></label><label class="field"><span>Suplement (tentokrát)</span><select class="select" data-ed="supplement"><option value="">Rotace (${esc(rotationState(db, plan).next || '—')})</option>${Object.keys(SUPPLEMENTS).map((s) => `<option ${db.occ[id]?.supplement === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>` : ''}
    <label class="field"><span>Poznámka</span><textarea class="textarea" rows="3" data-ed="note">${esc(it.note || task?.note || '')}</textarea></label>
    ${plan ? `<p class="muted small">${gl('repeat')} Součást plánu <b>${esc(plan.protocol)}</b>. Změny platí jen pro tento výskyt.</p>` : ''}</div>`;
  const h = panel({ title: 'Detail', sub: `${esc(T.label)}${it.sub ? ` · ${esc(it.sub.code)}` : ''} · ${hm(it.t)} ${dShort(it.t)}`, icon: 'info', body,
    footer: `${task ? `<button class="btn danger sm" data-ed-del>${gl('trash')}Smazat</button>` : isOpen(it) ? `<button class="btn tertiary" data-ed-skip>VYNECHAT</button>` : ''}<span class="spacer"></span><button class="btn tertiary" data-close>Zavřít</button><button class="btn primary" data-ed-save>${gl('check')}Uložit</button>` });
  const v = (k) => h.el.querySelector(`[data-ed=${k}]`)?.value;
  h.el.querySelector('[data-ed-save]').onclick = () => {
    const tNew = new Date(v('t')).getTime();
    if (task) A.updateTask(id, { title: v('title'), priority: v('priority'), note: v('note'), ...(tNew !== it.t ? { postponedTo: tNew } : {}) });
    else {
      if (v('status') === 'skip') A.skip([id]); else if (v('status') === 'cancel') A.cancel([id]);
      else { if (tNew && Math.abs(tNew - it.t) > 60e3) A.postpone([id], tNew); const patch = {}; if (v('qty') != null) patch.qty = v('qty'); if (v('supplement') != null) patch.supplement = v('supplement') || undefined; if (v('note') !== (it.note || '')) patch.note = v('note'); if (Object.keys(patch).length) A.setOccOverride(id, patch); }
    }
    closeOv(h); done({ label: 'Změny uloženy' });
  };
  h.el.querySelector('[data-ed-skip]')?.addEventListener('click', () => { closeOv(h); done(A.skip([id])); });
  h.el.querySelector('[data-ed-del]')?.addEventListener('click', () => { A.deleteTask(id); closeOv(h); done({ label: 'Úkol smazán' }); });
}

/** Dokončovací pohyb (200–350 ms): položka se potvrdí, zezelená a složí; pak zápis + toast „Zapsáno · Zpět“. */
function finish(el, fn) {
  const row = el.closest('.tl-it, .grp-row, .dn-row, .nt-row');
  if (!row || reduced()) return fn();
  row.classList.add('is-done');
  el.disabled = true;
  setTimeout(fn, 280);
}

actions({
  'tl-done': (el) => finish(el, () => done(A.complete([el.dataset.id], { refused: UI.refused.has(el.dataset.id) ? new Set([el.dataset.id]) : null }), { edit: (r) => r.records?.[0] && editRecordPanel(r.records[0].id) })),
  'tl-refused': (el) => finish(el, () => done(A.complete([el.dataset.id], { refused: new Set([el.dataset.id]) }))),
  'tl-skip': (el) => done(A.skip([el.dataset.id])),
  'tl-later': (el) => postponeMenu(el, [el.dataset.id]),
  'tl-detail': (el) => editItemPanel(el.dataset.id),
  'tl-more': (el) => editItemPanel(el.dataset.id),
  'tl-reopen': (el) => done(A.reopen(el.dataset.id)),
  'tl-time': (el) => { const [it] = A.resolve([el.dataset.id]); if (it) chooseTime([it.id], it.due || it.t); },
  'tl-sec': (el) => { const k = el.dataset.id; if (k === 'done') UI.doneOpen = !UI.doneOpen; else { const key = `sec:${k}`; UI.expanded.has(key) ? UI.expanded.delete(key) : UI.expanded.add(key); } store.emit('change'); },
  'tl-weight': (el) => { const inp = document.getElementById(`w-${el.dataset.id}`) || el.closest('.tl-it')?.querySelector('input[type=number]'); const g = parseFloat(inp?.value); if (!g) { inp?.focus(); toast('Nejdřív zadejte hmotnost', { kind: 'warn', ms: 2500 }); return; } finish(el, () => done(A.complete([el.dataset.id], { g }))); },
  'tl-shop': async (el) => { const m = await import('../widgets/registry.js'); const n = m.addLowStockToShopping(); A.complete([el.dataset.id]); toast(n ? `Přidáno ${n} položek do nákupního seznamu` : 'Už je v nákupním seznamu', { kind: n ? 'ok' : 'info', action: () => (location.hash = '#/sklad/nakup'), actionLabel: 'Otevřít' }); },
  'tl-expand': (el) => { const id = el.dataset.id; UI.expanded.has(id) ? UI.expanded.delete(id) : UI.expanded.add(id); store.emit('change'); },
  'tl-sel': (el) => { const g = groupOf(el.dataset.g); if (!g) return; const s = UI.sel.get(g.id) || new Set(g.items.filter(isOpen).map((i) => i.id)); s.has(el.dataset.id) ? s.delete(el.dataset.id) : s.add(el.dataset.id); UI.sel.set(g.id, s); store.emit('change'); },
  'tl-sel-all': (el) => { const g = groupOf(el.dataset.id); if (!g) return; const open = g.items.filter(isOpen).map((i) => i.id); const s = UI.sel.get(g.id); UI.sel.set(g.id, s && s.size === open.length ? new Set() : new Set(open)); store.emit('change'); },
  'tl-ref': (el) => { const id = el.dataset.id; UI.refused.has(id) ? UI.refused.delete(id) : UI.refused.add(id); store.emit('change'); },
  'tl-group-done': (el) => { const g = groupOf(el.dataset.id); if (!g) return; const ids = g.items.filter(isOpen).map((i) => i.id); const refused = new Set(ids.filter((i) => UI.refused.has(i))); finish(el, () => { const r = A.complete(ids, { refused }); for (const i of ids) UI.refused.delete(i); UI.sel.delete(g.id); done(r); }); },
  'tl-group-sel': (el) => { const g = groupOf(el.dataset.id); if (!g) return; const s = UI.sel.get(g.id) || new Set(g.items.filter(isOpen).map((i) => i.id)); const ids = [...s]; const r = A.complete(ids, { refused: new Set(ids.filter((i) => UI.refused.has(i))) }); UI.sel.delete(g.id); done(r); },
  'tl-group-skip': (el) => { const g = groupOf(el.dataset.id); if (!g) return; const s = UI.sel.get(g.id) || new Set(g.items.filter(isOpen).map((i) => i.id)); done(A.skip([...s])); UI.sel.delete(g.id); },
  'tl-group-later': (el) => { const g = groupOf(el.dataset.id); if (g) postponeMenu(el, g.items.filter(isOpen).map((i) => i.id)); },
});

/** Položky pro kontext v rozsahu. */
export function contextItems({ from, to, subject, cycle, enclosure, filter = 'all', q = '', includeHistory = true } = {}) {
  let items = buildTimeline(store.get(), { from, to, subject, cycle, enclosure, includeHistory });
  if (FILTERS[filter]) items = items.filter(FILTERS[filter]);
  if (q) { const Q = q.toLowerCase(); items = items.filter((i) => `${i.title} ${i.sub?.code || ''} ${i.sub?.name || ''} ${i.sub?.species?.latin || ''} ${i.sub?.species?.cz || ''} ${TYPE[i.type]?.label || ''} ${i.cycleName || ''} ${i.meta?.feeder || ''}`.toLowerCase().includes(Q)); }
  return items;
}
export { finish };
