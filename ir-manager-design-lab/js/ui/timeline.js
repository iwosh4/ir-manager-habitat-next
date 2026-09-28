// OPERATIONAL TIMELINE — one renderer, several contexts: 'full' (Planner), 'compact' (Dashboard widget),
// 'animal' (Animal Profile), 'repro' (cycle), 'enclosure'. Every item is an action surface.
import { esc, actions } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as store from '../core/store.js';
import { menu, panel, close as closeOv, isMobile, toast } from '../core/overlay.js';
import { SUPPLEMENTS, SPECIES, latin } from '../data/species.js';
import { TYPE, rotationState } from '../engine/ops.js';
import { buildTimeline, groupItems, isOpen, FILTERS } from '../engine/timeline.js';
import * as A from '../engine/actions.js';
import { avatar, typeDot, originTag, rangeBar } from './components.js';
import { done } from './feedback.js';
import { editRecordPanel } from './quickrecord.js';
import { DAY, HOUR, MIN, startOfDay, hm, dayLabel, dShort, dLong, rel, wd, toLocalInput, daysBetween } from '../core/time.js';

const ago = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 60 ? `${m} min late` : m < 1440 ? `${Math.round(m / 60)} h late` : `${Math.round(m / 1440)} d late`; };
export const UI = { expanded: new Set(), sel: new Map(), refused: new Set(), why: null };

// ---------------------------------------------------------------- sections on the time axis
export function sections(items, nowTs, { showDone = true } = {}) {
  const sod = startOfDay(nowTs), tom = sod + DAY, after = tom + DAY;
  const S = [];
  const add = (key, label, arr, cls = '') => { if (arr.length) S.push({ key, label, items: arr, cls }); };
  const vis = items.filter((i) => showDone || isOpen(i) || i.kind === 'milestone' && i.status !== 'done');
  const overdue = vis.filter((i) => i.status === 'overdue');
  const rest = vis.filter((i) => i.status !== 'overdue');
  add('overdue', t('Overdue'), overdue, 'sec-overdue');
  const past = rest.filter((i) => i.t < sod);
  if (past.length) { const byDay = {}; for (const i of past) (byDay[startOfDay(i.t)] ||= []).push(i); for (const [d, arr] of Object.entries(byDay).sort((a, b) => a[0] - b[0])) add(`d${d}`, `${dayLabel(+d)} · ${dShort(+d)}`, arr, 'sec-past'); }
  const todayDone = rest.filter((i) => i.t >= sod && i.t < nowTs - 30 * MIN && i.status !== 'open');
  const nowWin = rest.filter((i) => i.t >= sod && i.t < nowTs + 90 * MIN && !todayDone.includes(i));
  const today = rest.filter((i) => i.t >= nowTs + 90 * MIN && i.t < tom);
  add('earlier', `${t('Today')} · earlier`, todayDone, 'sec-past');
  S.push({ key: 'now', label: t('NOW'), items: nowWin, cls: 'sec-now', now: true });
  add('today', `${t('Today')} · later`, today, 'sec-today');
  add('tomorrow', `${t('Tomorrow')} · ${wd(tom)} ${dShort(tom)}`, rest.filter((i) => i.t >= tom && i.t < after), 'sec-tomorrow');
  const up = rest.filter((i) => i.t >= after); const byDay = {};
  for (const i of up) (byDay[startOfDay(i.t)] ||= []).push(i);
  for (const [d, arr] of Object.entries(byDay).sort((a, b) => a[0] - b[0])) add(`d${d}`, `${wd(+d)} ${dShort(+d)} · in ${daysBetween(nowTs, +d)} d`, arr, 'sec-up');
  return S;
}

// ---------------------------------------------------------------- item rendering
const primaryLabel = (it) => {
  if (it.type === 'feeding') return 'FED'; if (it.type === 'incubation') return 'CHECK'; if (it.type === 'medication') return 'GIVEN'; if (it.type === 'repro') return 'CONFIRM'; if (it.type === 'inventory') return 'SEEN';
  return 'DONE';
};
function subjectHTML(it, compact) {
  const s = it.sub; if (!s) return '';
  if (s.kind === 'animal') { const a = s.obj; return `<a class="tl-subj" href="#/animals/a/${a.id}">${avatar(a, compact ? 26 : 32)}<span><b class="code">${esc(a.code)}</b>${a.kind === 'group' ? `<em>×${a.count}</em>` : a.name ? `<em>${esc(a.name)}</em>` : ''}<i class="latin">${esc(latin(s.species))}</i></span></a>`; }
  return `<a class="tl-subj" href="#/enclosures/${s.kind === 'assembly' ? 'assemblies' : `e/${s.id}`}"><span class="tl-eico">${icon(s.kind === 'assembly' ? 'layers3' : 'enclosure')}</span><span><b class="code">${esc(s.code)}</b><i>${esc(s.name)}</i></span></a>`;
}
function metaHTML(it) {
  const m = it.meta || {}, out = [];
  if (it.type === 'feeding') { if (m.feeder) out.push(`<span class="mt">${icon('feed')}${esc(m.feeder)}${m.qty ? ` · ${esc(m.qty)}` : ''}</span>`); if (m.supplement) out.push(`<span class="mt sup" style="--c:${SUPPLEMENTS[m.supplement]?.color || 'var(--amber)'}">${esc(m.supplement)}${m.rotation && it.status !== 'done' ? `<em>${m.rotation.index + 1}/${m.rotation.rot.length}</em>` : ''}</span>`); if (m.refused) out.push('<span class="mt bad">refused</span>'); }
  if (it.type === 'weight' && it.status !== 'done' && m.last != null) out.push(`<span class="mt">${icon('weight')}last ${m.last} g</span>`);
  if (it.type === 'weight' && m.g != null) out.push(`<span class="mt">${m.g} g</span>`);
  if (it.type === 'medication' && m.dose) out.push(`<span class="mt">${icon('pill')}${esc(m.dose)} · ${esc(m.amount)} · ${esc(m.route)}</span><span class="mt">dose ${m.n}/${m.of}</span>`);
  if (it.type === 'incubation' && m.day != null) out.push(`<span class="mt">${icon('egg')}${m.fertile}/${m.eggs} eggs</span><span class="mt">day ${m.day} · exp. ${m.expected[0]}–${m.expected[1]}</span>`);
  if (it.priority === 'high') out.push('<span class="mt hi">high priority</span>');
  if (it.postponed && it.status !== 'done') out.push(`<span class="mt">${icon('later')}postponed${it.due ? ` from ${hm(it.due)}` : ''}</span>`);
  if (it.note) out.push(`<span class="mt note">${icon('note')}${esc(it.note)}</span>`);
  if (it.type === 'inventory' && m.items) { const db = store.get(); out.push(`<span class="mt">${m.items.map((id) => esc(db.inventory.find((x) => x.id === id)?.name.split(' (')[0])).join(', ')}</span>`); }
  return out.join('');
}
function actionsHTML(it, mode) {
  const id = esc(it.id);
  if (it.kind === 'phase') return `<a class="btn sm" href="#/reproduction/${it.clutch ? `clutch/${it.clutch}` : `cycle/${it.cycle}`}">${icon('repro')}Open</a>`;
  if (it.status === 'done' || it.status === 'skipped' || it.status === 'cancelled') {
    return `<span class="tl-done-t">${it.status === 'done' ? icon('checkCircle') : icon('skip')}${it.status === 'done' ? (it.doneAt ? hm(it.doneAt) : 'done') : it.status}</span>${it.recordId ? `<button class="icon-btn sm" data-act="edit-record" data-id="${esc(it.recordId)}" title="Edit record">${icon('edit')}</button>` : ''}${it.kind !== 'record' ? `<button class="icon-btn sm" data-act="tl-reopen" data-id="${id}" title="Re-open (correction)">${icon('undo')}</button>` : ''}`;
  }
  if (it.type === 'weight' && it.src === 'occ') return `<span class="tl-wt"><input type="number" inputmode="decimal" step="0.1" placeholder="${it.meta?.last ?? 'g'}" aria-label="Weight in grams" data-enter="tl-weight" data-id="${id}" id="w-${id}"><em>g</em></span><button class="btn sm primary" data-act="tl-weight" data-id="${id}">${icon('check')}SAVE</button><button class="btn sm ghost" data-act="tl-later" data-id="${id}">${icon('later')}<span class="hide-s">${t('Later')}</span></button><button class="icon-btn sm" data-act="tl-more" data-id="${id}" aria-label="More">${icon('more')}</button>`;
  if (it.type === 'inventory') return `<button class="btn sm primary" data-act="tl-shop" data-id="${id}">${icon('cart')}Add to list</button><button class="btn sm ghost" data-act="tl-done" data-id="${id}">${icon('check')}Seen</button>`;
  const pl = primaryLabel(it);
  return `<button class="btn sm primary tl-go" data-act="tl-done" data-id="${id}">${icon('check')}${t(pl)}</button>${it.type === 'feeding' ? `<button class="btn sm ghost" data-act="tl-refused" data-id="${id}" title="Feeding refused">${icon('ban')}<span class="hide-s">Refused</span></button>` : ''}${it.cycle && mode !== 'repro' && it.type !== 'feeding' ? `<a class="btn sm ghost hide-s" href="#/reproduction/cycle/${esc(it.cycle)}">${icon('repro')}Cycle</a>` : ''}<button class="btn sm ghost" data-act="tl-later" data-id="${id}">${icon('later')}<span class="hide-s">${t('Later')}</span></button><button class="btn sm ghost hide-s" data-act="tl-skip" data-id="${id}">${icon('skip')}${t('Skip')}</button><button class="icon-btn sm" data-act="tl-more" data-id="${id}" aria-label="More actions">${icon('more')}</button>`;
}
export function itemHTML(it, mode = 'full') {
  const compact = mode === 'compact';
  const st = it.status, T = TYPE[it.type] || TYPE.task;
  if (it.kind === 'phase') {
    const n = Date.now(), total = Math.max(1, it.end - it.t), p = Math.max(0, Math.min(1, (n - it.t) / total));
    return `<div class="tl-it phase ${it.expected ? 'expected' : ''} ${it.planned ? 'planned' : ''}" data-id="${esc(it.id)}" style="--c:${T.color}">
      <div class="tl-time"><b>${dShort(it.t)}</b><em>→ ${dShort(it.end)}</em></div><span class="tl-node"></span>
      <div class="tl-card"><div class="tl-main">${typeDot(it.type)}<div class="tl-tx"><div class="tl-title"><b>${esc(it.title)}</b>${originTag(it.origin)}${it.expected ? '<span class="pill mute">expected range</span>' : ''}${it.planned ? '<span class="pill mute">planned</span>' : ''}</div>
      <div class="tl-sub">${esc(it.cycleName || '')}${it.basis ? ` · ${esc(it.basis)}` : ''}</div><div class="span-bar ${it.expected ? 'exp' : ''}"><i style="width:${p * 100}%"></i><span class="sb-l">${dShort(it.t)}</span><span class="sb-r">${dShort(it.end)}</span></div></div>
      ${subjectHTML(it, compact)}</div><div class="tl-acts">${actionsHTML(it, mode)}</div></div></div>`;
  }
  const whyOpen = UI.why === it.id;
  return `<div class="tl-it st-${st} ${it.kind === 'milestone' ? 'milestone' : ''} ${it.kind === 'record' ? 'rec' : ''}" data-id="${esc(it.id)}" data-type="${it.type}" style="--c:${T.color}">
    <div class="tl-time"><button class="tl-hm" ${isOpen(it) && it.kind !== 'milestone' ? `data-act="tl-time" data-id="${esc(it.id)}" title="Reschedule"` : 'tabindex="-1"'}>${hm(it.t)}</button><em>${st === 'overdue' ? ago(it.t) : it.t > Date.now() && it.t - Date.now() < 12 * HOUR && daysBetween(Date.now(), it.t) === 0 ? rel(it.t) : ''}</em></div><span class="tl-node"></span>
    <div class="tl-card">
      <div class="tl-main">${typeDot(it.type)}<div class="tl-tx"><div class="tl-title"><b>${esc(it.kind === 'milestone' ? it.title : (it.src === 'occ' ? T.label : it.title))}</b>${it.src === 'occ' && it.title !== T.label && it.type !== 'maintenance' ? `<span class="dim">${esc(it.title)}</span>` : it.type === 'maintenance' ? `<span class="dim">${esc(it.title)}</span>` : ''}${compact ? '' : originTag(it.origin)}${compact ? '' : `<button class="why ${whyOpen ? 'on' : ''}" data-act="tl-why" data-id="${esc(it.id)}" title="Why is this here?">${icon('help')}</button>`}</div>
        <div class="tl-meta">${metaHTML(it)}</div>${whyOpen ? `<div class="tl-why">${icon('info')}<span>${esc(it.why || '')}</span></div>` : ''}
        ${it.type === 'incubation' && it.meta?.day != null && !compact ? `<div class="tl-rb">${rangeBar(it.meta.day, it.meta.expected, { label: false })}</div>` : ''}</div>
        ${subjectHTML(it, compact)}</div>
      <div class="tl-acts">${actionsHTML(it, mode)}</div>
    </div></div>`;
}
export function groupHTML(g, mode = 'full') {
  const T = TYPE[g.type] || TYPE.task, open = UI.expanded.has(g.id), st = g.status;
  const sel = UI.sel.get(g.id) || new Set(g.items.filter(isOpen).map((i) => i.id));
  const avs = g.items.slice(0, 6).map((i) => (i.sub?.obj && i.sub.kind === 'animal' ? avatar(i.sub.obj, 26) : '')).join('');
  const openItems = g.items.filter(isOpen);
  const refusedN = openItems.filter((i) => UI.refused.has(i.id)).length;
  return `<div class="tl-it grp st-${st} ${open ? 'open' : ''}" data-id="${esc(g.id)}" style="--c:${T.color}">
    <div class="tl-time"><b>${hm(g.t)}</b><em>${st === 'overdue' ? ago(g.t) : ''}</em></div><span class="tl-node"></span>
    <div class="tl-card">
      <div class="tl-main">${typeDot(g.type)}<div class="tl-tx"><div class="tl-title"><b>${T.label.toUpperCase()} ×${g.items.length}</b><span class="dim">${g.count} animals</span>${mode === 'compact' ? '' : originTag(g.origin)}</div>
        <div class="tl-meta">${g.feeder ? `<span class="mt">${icon('feed')}${esc(g.feeder)}</span>` : ''}${g.supplement ? `<span class="mt sup" style="--c:${SUPPLEMENTS[g.supplement]?.color}">${esc(g.supplement)}</span>` : ''}${st !== 'done' ? `<span class="mt">${openItems.length} open${g.items.length - openItems.length ? ` · ${g.items.length - openItems.length} done` : ''}</span>` : ''}</div></div>
        <div class="stackav">${avs}</div></div>
      <div class="tl-acts">${openItems.length ? `<button class="btn sm primary tl-go" data-act="tl-group-done" data-id="${esc(g.id)}">${icon('check')}${t('Complete all')}${refusedN ? ` · ${refusedN} refused` : ''}</button><button class="btn sm" data-act="tl-expand" data-id="${esc(g.id)}" aria-expanded="${open}">${icon(open ? 'chevronUp' : 'chevronDown')}${t('Open')} ${g.items.length}</button><button class="btn sm ghost" data-act="tl-group-later" data-id="${esc(g.id)}">${icon('later')}<span class="hide-s">${t('Later')}</span></button>` : `<span class="tl-done-t">${icon('checkCircle')}all done</span><button class="btn sm ghost" data-act="tl-expand" data-id="${esc(g.id)}">${icon(open ? 'chevronUp' : 'chevronDown')}${g.items.length}</button>`}</div>
      ${open ? `<div class="grp-list">
        ${openItems.length ? `<div class="grp-bar"><label class="row"><input type="checkbox" class="cb" data-act="tl-sel-all" data-id="${esc(g.id)}" ${sel.size === openItems.length ? 'checked' : ''}><span>Select all</span></label><span class="muted">${sel.size} selected</span><span class="spacer"></span><button class="btn sm primary" data-act="tl-group-sel" data-id="${esc(g.id)}" ${sel.size ? '' : 'disabled'}>${icon('check')}Complete selected</button><button class="btn sm ghost" data-act="tl-group-skip" data-id="${esc(g.id)}" ${sel.size ? '' : 'disabled'}>${icon('skip')}Skip selected</button></div>` : ''}
        ${g.items.map((i) => { const a = i.sub?.obj; const on = sel.has(i.id), ref = UI.refused.has(i.id); return `<div class="grp-row st-${i.status}">${isOpen(i) ? `<input type="checkbox" class="cb" data-act="tl-sel" data-g="${esc(g.id)}" data-id="${esc(i.id)}" ${on ? 'checked' : ''} aria-label="Select ${esc(i.sub?.code)}">` : `<span class="gr-ok">${icon(i.status === 'done' ? 'check' : 'skip')}</span>`}
          ${a ? avatar(a, 30) : ''}<span class="gr-t"><b class="code">${esc(i.sub?.code || '')}</b><i class="latin">${esc(latin(i.sub?.species))}</i></span>${i.meta?.supplement ? `<span class="mt sup" style="--c:${SUPPLEMENTS[i.meta.supplement]?.color}">${esc(i.meta.supplement)}</span>` : ''}
          ${isOpen(i) ? (i.type === 'feeding' ? `<button class="chip ${ref ? 'on bad' : ''}" data-act="tl-ref" data-id="${esc(i.id)}">${icon('ban')}${ref ? 'Refused' : 'Refused?'}</button>` : '') + `<button class="btn sm" data-act="tl-done" data-id="${esc(i.id)}">${icon('check')}</button>` : `<span class="muted mono">${i.doneAt ? hm(i.doneAt) : ''}${i.meta?.refused ? ' · refused' : ''}</span><button class="icon-btn sm" data-act="tl-reopen" data-id="${esc(i.id)}" title="Re-open">${icon('undo')}</button>`}</div>`; }).join('')}</div>` : ''}
    </div></div>`;
}

/** Full stream HTML for a set of items (already filtered). */
export function streamHTML(items, { mode = 'full', nowTs = Date.now(), showDone = true, empty = 'Nothing scheduled' } = {}) {
  const grouped = groupItems(items);
  const secs = sections(grouped, nowTs, { showDone });
  if (!secs.some((s) => s.items.length)) return `<div class="tl-empty">${icon('checkCircle')}<b>${esc(empty)}</b></div>`;
  return `<div class="tl tl-${mode}">${secs.map((s) => s.now ? `<div class="tl-sec sec-now" id="tl-now"><div class="tl-sech now"><span class="now-pill">${icon('clock')}${t('NOW')} · ${hm(nowTs)}</span><i></i></div>${s.items.length ? s.items.map((x) => (x.kind === 'group' ? groupHTML(x, mode) : itemHTML(x, mode))).join('') : `<div class="tl-quiet">${icon('checkCircle')}Nothing due right now</div>`}</div>`
    : `<div class="tl-sec ${s.cls}" id="sec-${s.key}"><div class="tl-sech"><b>${esc(s.label)}</b><em>${s.items.length}</em><i></i></div>${s.items.map((x) => (x.kind === 'group' ? groupHTML(x, mode) : itemHTML(x, mode))).join('')}</div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- actions (shared by every context)
function groupOf(gid) {
  const db = store.get(), n = Date.now();
  const items = buildTimeline(db, { from: startOfDay(n) - 21 * DAY, to: startOfDay(n) + 30 * DAY, includeHistory: false });
  return groupItems(items).find((g) => g.id === gid);
}
function postponeMenu(el, ids) {
  const [it] = A.resolve([ids[0]]); const due = it?.due || it?.t || Date.now();
  const opt = (p, l) => ({ icon: 'later', label: l, hint: hm(A.postponeTarget(p, Date.now(), due)) + (A.postponeTarget(p, Date.now(), due) > startOfDay(Date.now()) + DAY ? ` ${dShort(A.postponeTarget(p, Date.now(), due))}` : ''), run: () => done(A.postpone(ids, p)) });
  menu(el, [opt('1h', '+1 hour'), opt('later', 'Later today'), opt('tomorrow', 'Tomorrow'), opt('2d', '+2 days'), { sep: true }, { icon: 'calendar', label: 'Choose date & time…', run: () => chooseTime(ids, due) }], { title: 'Postpone' });
}
function chooseTime(ids, due) {
  const h = panel({ title: 'Reschedule', icon: 'calendarClock', width: 380, body: `<label class="field"><span>New date & time</span><input type="datetime-local" data-rt value="${toLocalInput(Math.max(Date.now() + HOUR, due))}"></label>`, footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-rt-ok>${icon('check')}Reschedule</button>` });
  h.el.querySelector('[data-rt-ok]').onclick = () => { const v = new Date(h.el.querySelector('[data-rt]').value).getTime(); if (v) { done(A.postpone(ids, v)); closeOv(h); } };
}
export function editItemPanel(id) {
  const [it] = A.resolve([id]); if (!it) return;
  const db = store.get(), task = it.src === 'task' ? db.tasks.find((x) => x.id === id) : null;
  const plan = it.planId ? db.plans.find((p) => p.id === it.planId) : null;
  const body = `<div class="stack">
    <div class="row">${typeDot(it.type)}<div><b>${esc(it.title)}</b><div class="muted">${esc(it.why || '')}</div></div></div>
    ${task ? `<label class="field"><span>Title</span><input type="text" data-ed="title" value="${esc(task.title)}"></label>` : ''}
    <div class="grid2"><label class="field"><span>Date & time</span><input type="datetime-local" data-ed="t" value="${toLocalInput(it.t)}"></label>
    ${task ? `<label class="field"><span>Priority</span><select data-ed="priority">${['low', 'normal', 'high'].map((p) => `<option ${task.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>` : `<label class="field"><span>Status</span><select data-ed="status"><option value="open">open</option><option value="skip">skip</option><option value="cancel">cancel</option></select></label>`}</div>
    ${plan?.type === 'feeding' ? `<div class="grid2"><label class="field"><span>Quantity (this time)</span><input type="text" data-ed="qty" value="${esc(db.occ[id]?.qty || plan.qty)}"></label><label class="field"><span>Supplement (this time)</span><select data-ed="supplement"><option value="">Rotation (${esc(rotationState(db, plan).next || '—')})</option>${Object.keys(SUPPLEMENTS).map((s) => `<option ${db.occ[id]?.supplement === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>` : ''}
    <label class="field"><span>Note</span><textarea rows="3" data-ed="note">${esc(it.note || task?.note || '')}</textarea></label>
    ${plan ? `<p class="muted small">${icon('repeat')} Part of <b>${esc(plan.protocol)}</b>. Changes here apply to this occurrence only.</p>` : ''}</div>`;
  const h = panel({ title: 'Edit', sub: `${TYPE[it.type]?.label || 'Task'} · ${it.sub?.code || ''}`, icon: 'edit', body, footer: `${task ? `<button class="btn danger" data-ed-del>${icon('trash')}Delete</button>` : ''}<span class="spacer"></span><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-ed-save>${icon('check')}Save</button>` });
  const v = (k) => h.el.querySelector(`[data-ed=${k}]`)?.value;
  h.el.querySelector('[data-ed-save]').onclick = () => {
    const tNew = new Date(v('t')).getTime();
    if (task) A.updateTask(id, { title: v('title'), priority: v('priority'), note: v('note'), ...(tNew !== it.t ? { postponedTo: tNew } : {}) });
    else {
      if (v('status') === 'skip') A.skip([id]); else if (v('status') === 'cancel') A.cancel([id]);
      else { if (tNew && Math.abs(tNew - it.t) > 60e3) A.postpone([id], tNew); const patch = {}; if (v('qty') != null) patch.qty = v('qty'); if (v('supplement') != null) patch.supplement = v('supplement') || undefined; if (v('note') !== (it.note || '')) patch.note = v('note'); if (Object.keys(patch).length) A.setOccOverride(id, patch); }
    }
    closeOv(h); done({ label: 'Saved changes' });
  };
  h.el.querySelector('[data-ed-del]')?.addEventListener('click', () => { A.deleteTask(id); closeOv(h); done({ label: 'Task deleted' }); });
}
function moreMenu(el, id) {
  const [it] = A.resolve([id]); if (!it) return;
  const items = [{ icon: 'edit', label: 'Edit…', run: () => editItemPanel(id) }, { icon: 'note', label: 'Add note…', run: () => noteFor(id, it) }, { icon: 'skip', label: t('Skip'), run: () => done(A.skip([id])) }];
  if (it.subjectKind === 'animal' && it.subject) items.push({ sep: true }, { icon: 'animals', label: `Open ${it.sub?.code || 'animal'}`, run: () => (location.hash = `#/animals/a/${it.subject}`) });
  if (it.enclosure) items.push({ icon: 'enclosure', label: 'Open enclosure', run: () => (location.hash = `#/enclosures/e/${it.enclosure}`) });
  if (it.cycle) items.push({ icon: 'repro', label: 'Open reproduction cycle', run: () => (location.hash = `#/reproduction/cycle/${it.cycle}`) });
  if (it.src === 'task') items.push({ sep: true }, { icon: 'x', label: 'Cancel task', run: () => done(A.cancel([id])) }, { icon: 'trash', label: 'Delete task', danger: true, run: () => { A.deleteTask(id); done({ label: 'Task deleted' }); } });
  else items.push({ sep: true }, { icon: 'x', label: 'Cancel this occurrence', run: () => done(A.cancel([id])) });
  menu(el, items, { title: it.title });
}
function noteFor(id, it) {
  const h = panel({ title: 'Note', icon: 'note', width: 420, body: `<textarea rows="4" data-n autofocus style="width:100%">${esc(it.note || '')}</textarea>`, footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-n-ok>${icon('check')}Save</button>` });
  h.el.querySelector('[data-n-ok]').onclick = () => { A.setNote(id, h.el.querySelector('[data-n]').value); closeOv(h); done({ label: 'Note saved' }); };
}

actions({
  'tl-done': (el) => done(A.complete([el.dataset.id], { refused: UI.refused.has(el.dataset.id) ? new Set([el.dataset.id]) : null }), { edit: (r) => r.records?.[0] && editRecordPanel(r.records[0].id) }),
  'tl-refused': (el) => done(A.complete([el.dataset.id], { refused: new Set([el.dataset.id]) })),
  'tl-skip': (el) => done(A.skip([el.dataset.id])),
  'tl-later': (el) => postponeMenu(el, [el.dataset.id]),
  'tl-more': (el) => moreMenu(el, el.dataset.id),
  'tl-reopen': (el) => done(A.reopen(el.dataset.id)),
  'tl-why': (el) => { UI.why = UI.why === el.dataset.id ? null : el.dataset.id; store.emit('change'); },
  'tl-time': (el) => { const [it] = A.resolve([el.dataset.id]); if (it) chooseTime([it.id], it.due || it.t); },
  'tl-weight': (el) => { const inp = document.getElementById(`w-${el.dataset.id}`) || el.closest('.tl-it')?.querySelector('input[type=number]'); const g = parseFloat(inp?.value); if (!g) { inp?.focus(); toast('Enter the weight first', { kind: 'warn', ms: 2500 }); return; } done(A.complete([el.dataset.id], { g })); },
  'tl-shop': async (el) => { const m = await import('../widgets/registry.js'); const n = m.addLowStockToShopping(); A.complete([el.dataset.id]); toast(n ? `Added ${n} items to Shopping List` : 'Already on the Shopping List', { kind: n ? 'ok' : 'info', action: () => import('../widgets/tooldrawer.js').then((x) => x.openToolDrawer('shopping')), actionLabel: 'Open list' }); },
  'tl-expand': (el) => { const id = el.dataset.id; UI.expanded.has(id) ? UI.expanded.delete(id) : UI.expanded.add(id); store.emit('change'); },
  'tl-sel': (el) => { const g = groupOf(el.dataset.g); if (!g) return; const s = UI.sel.get(g.id) || new Set(g.items.filter(isOpen).map((i) => i.id)); s.has(el.dataset.id) ? s.delete(el.dataset.id) : s.add(el.dataset.id); UI.sel.set(g.id, s); store.emit('change'); },
  'tl-sel-all': (el) => { const g = groupOf(el.dataset.id); if (!g) return; const open = g.items.filter(isOpen).map((i) => i.id); const s = UI.sel.get(g.id); UI.sel.set(g.id, s && s.size === open.length ? new Set() : new Set(open)); store.emit('change'); },
  'tl-ref': (el) => { const id = el.dataset.id; UI.refused.has(id) ? UI.refused.delete(id) : UI.refused.add(id); store.emit('change'); },
  'tl-group-done': (el) => { const g = groupOf(el.dataset.id); if (!g) return; const ids = g.items.filter(isOpen).map((i) => i.id); const refused = new Set(ids.filter((i) => UI.refused.has(i))); const r = A.complete(ids, { refused }); for (const i of ids) UI.refused.delete(i); UI.sel.delete(g.id); done(r); },
  'tl-group-sel': (el) => { const g = groupOf(el.dataset.id); if (!g) return; const s = UI.sel.get(g.id) || new Set(g.items.filter(isOpen).map((i) => i.id)); const ids = [...s]; const r = A.complete(ids, { refused: new Set(ids.filter((i) => UI.refused.has(i))) }); UI.sel.delete(g.id); done(r); },
  'tl-group-skip': (el) => { const g = groupOf(el.dataset.id); if (!g) return; const s = UI.sel.get(g.id) || new Set(g.items.filter(isOpen).map((i) => i.id)); done(A.skip([...s])); UI.sel.delete(g.id); },
  'tl-group-later': (el) => { const g = groupOf(el.dataset.id); if (g) postponeMenu(el, g.items.filter(isOpen).map((i) => i.id)); },
});

/** Items for a context over a range. */
export function contextItems({ from, to, subject, cycle, enclosure, filter = 'all', q = '', includeHistory = true } = {}) {
  let items = buildTimeline(store.get(), { from, to, subject, cycle, enclosure, includeHistory });
  if (FILTERS[filter]) items = items.filter(FILTERS[filter]);
  if (q) { const Q = q.toLowerCase(); items = items.filter((i) => `${i.title} ${i.sub?.code || ''} ${i.sub?.name || ''} ${i.sub?.species?.latin || ''} ${i.sub?.species?.common || ''} ${TYPE[i.type]?.label || ''} ${i.cycleName || ''} ${i.meta?.feeder || ''}`.toLowerCase().includes(Q)); }
  return items;
}
