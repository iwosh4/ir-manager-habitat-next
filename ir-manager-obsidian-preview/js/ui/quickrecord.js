// RYCHLÝ ZÁZNAM — kontext se používá automaticky: z karty zvířete je zvíře předvyplněné, z ubikace její obyvatelé,
// z reprodukce cyklus. Běžný případ: akce → (cíl) → ✓ uloženo + ZPĚT. Detaily až na vyžádání.
import { esc } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import { modal, panel, close as closeOv } from '../core/overlay.js';
import * as store from '../core/store.js';
import { SPECIES, SUPPLEMENTS, latin } from '../data/species.js';
import { TYPE, rotationState, lastWeight, subjectOf } from '../engine/ops.js';
import { buildTimeline } from '../engine/timeline.js';
import * as A from '../engine/actions.js';
import { avatar, sexText } from './components.js';
import { done } from './feedback.js';
import { DAY, HOUR, startOfDay, rel, toLocalInput } from '../core/time.js';

export const QR_ACTIONS = [
  ['feeding', 'Krmení', 'feeding'], ['water', 'Voda', 'water'], ['misting', 'Rosení', 'mist'], ['cleaning', 'Údržba', 'cleaning'], ['weight', 'Vážení', 'weight'],
  ['shed', 'Svlek', 'shedding'], ['health', 'Zdraví', 'health'], ['repro', 'Reprodukce', 'reproduction'], ['task', 'Úkol', 'tasks'], ['animal', 'Přidat zvíře', 'add'],
];
const OBS = ['Nežere', 'Zadržený svlek', 'Apatie', 'Vyvrhování', 'Zranění', 'Úbytek hmotnosti', 'Dýchací potíže', 'Podezření na parazity', 'Jiné'];
const REPRO_EV = [['pairing', 'Párování'], ['mating', 'Pozorované páření'], ['ovulation', 'Ovulace'], ['prelay', 'Předsnůškový svlek'], ['clutch', 'Snůška / porod'], ['calling', 'Volání / námluvy'], ['note', 'Poznámka']];
let S = null;
const active = (db) => db.animals.filter((a) => !['sold', 'deceased'].includes(a.status));

export function openQuickRecord(ctx = {}) {
  const db = store.get();
  S = { type: ctx.type || null, subjects: new Set(ctx.subjects || []), cycle: ctx.cycle || null, preset: !!(ctx.subjects && ctx.subjects.length), filter: 'due', q: '', adv: false, data: {} };
  if (ctx.enclosure && !S.subjects.size) for (const a of active(db).filter((x) => x.enclosureId === ctx.enclosure)) S.subjects.add(a.id);
  if (S.subjects.size) S.preset = true;
  if (S.type === 'animal') { import('../views/zvirata.js').then((m) => m.openAddAnimal()); return; }
  const h = modal({ title: 'Rychlý záznam', sub: 'Zapište, co jste právě udělali — kontext se doplní sám', icon: 'plus', width: 660, cls: 'qr-modal', body: '<div class="qr" data-role="qr"></div>' });
  S.h = h; draw();
  h.el.addEventListener('click', onClick); h.el.addEventListener('input', onInput); h.el.addEventListener('keydown', onKey);
}
function draw() {
  const box = S.h.el.querySelector('[data-role=qr]'); if (!box) return;
  const step = !S.type ? 'action' : (!S.subjects.size && S.type !== 'task') || S.pickMore ? 'target' : 'detail';
  S.step = step;
  box.innerHTML = `<ol class="qr-steps"><li class="${step === 'action' ? 'on' : 'ok'}">Co</li><li class="${step === 'target' ? 'on' : step === 'detail' ? 'ok' : ''}">Pro koho</li><li class="${step === 'detail' ? 'on' : ''}">Uložit</li></ol>${step === 'action' ? actionStep() : step === 'target' ? targetStep() : detailStep()}`;
  const head = S.h.el.querySelector('.ov-head h2'); if (head) head.textContent = S.type ? `Rychlý záznam · ${QR_ACTIONS.find((a) => a[0] === S.type)?.[1] || ''}` : 'Rychlý záznam';
  box.querySelector('[autofocus]')?.focus({ preventScroll: true });
}
function actionStep() {
  const db = store.get(), last = A.lastOwnRecord();
  const ctxLine = S.subjects.size ? `<div class="qr-ctx">${gl('pin')}<span>Pro <b>${[...S.subjects].map((id) => esc(subjectOf(db, id)?.code || id)).join(', ')}</b></span><button class="link" data-q="clear-subj">změnit</button></div>` : '';
  return `${ctxLine}<div class="qr-actions">${QR_ACTIONS.map(([k, l, ic], i) => `<button class="qa" data-q="type" data-v="${k}" style="--c:${TYPE[k]?.color || 'var(--am)'}"><span class="qa-ico">${ico(ic)}</span><span class="qa-l">${l}</span><kbd>${(i + 1) % 10}</kbd></button>`).join('')}</div>
  ${last ? `<div class="qr-last">${gl('clock')}<span>Poslední záznam</span><b>${esc(TYPE[last.type]?.label || last.type)} · ${esc(subjectOf(db, last.subject)?.code || '')}</b><em>${rel(last.t)}</em><span class="spacer"></span><button class="btn sm tertiary" data-q="edit-last">${gl('edit')}Upravit</button><button class="btn sm" data-q="repeat-last" data-type="${last.type}" data-subject="${last.subject}">${gl('sync')}Zopakovat</button></div>` : ''}`;
}
function candidates() {
  const db = store.get(), n = Date.now();
  const due = buildTimeline(db, { from: startOfDay(n) - 3 * DAY, to: startOfDay(n) + DAY, includeHistory: false }).filter((i) => i.kind === 'occ' && (i.status === 'open' || i.status === 'overdue') && i.type === S.type && i.subjectKind === 'animal');
  const dueIds = [...new Set(due.map((i) => i.subject))];
  let list = active(db);
  if (S.filter === 'due') list = list.filter((a) => dueIds.includes(a.id));
  if (S.filter === 'recent') list = db.recent.animals.map((id) => list.find((a) => a.id === id)).filter(Boolean);
  if (S.filter === 'fav') list = list.filter((a) => db.favorites.includes(a.id));
  if (S.filter === 'groups') list = list.filter((a) => a.kind === 'group');
  if (S.q) { const q = S.q.toLowerCase(); list = active(db).filter((a) => `${a.code} ${a.name} ${SPECIES[a.species]?.latin} ${SPECIES[a.species]?.cz} ${db.enclosures.find((e) => e.id === a.enclosureId)?.code || ''}`.toLowerCase().includes(q)); }
  if (S.filter === 'due' && !S.q && !list.length) { S.filter = 'recent'; return candidates(); }
  return { list, dueIds };
}
function targetStep() {
  const db = store.get(), { list, dueIds } = candidates();
  const f = (k, l, n) => `<button class="chip ${S.filter === k && !S.q ? 'on' : ''}" data-q="filter" data-v="${k}">${l}${n != null ? ` <em>${n}</em>` : ''}</button>`;
  return `<div class="searchbox">${gl('search')}<input type="search" placeholder="Kód, jméno, druh, ubikace…" value="${esc(S.q)}" data-q-input="q" autofocus aria-label="Najít zvíře"></div>
  <div class="chips qr-filters">${f('due', 'Na řadě', dueIds.length)}${f('recent', 'Nedávné')}${f('fav', 'Oblíbené', db.favorites.length)}${f('groups', 'Skupiny')}${f('all', 'Vše')}</div>
  ${S.filter === 'due' && !S.q && list.length > 1 ? `<button class="qr-selall" data-q="select-all">${gl('check-circle')}Vybrat všech ${list.length} na řadě</button>` : ''}
  <div class="qr-targets">${list.map((a) => { const sp = SPECIES[a.species], on = S.subjects.has(a.id), e = db.enclosures.find((x) => x.id === a.enclosureId); return `<button class="qt ${on ? 'on' : ''}" data-q="toggle" data-id="${a.id}" aria-pressed="${on}">${avatar(a, 42)}<span class="qt-t"><b><span class="code">${esc(a.code)}</span> ${esc(a.name || '')}</b><span class="latin small">${esc(latin(sp))}</span></span><span class="qt-m">${sexText(a)}<span class="meta">${esc(e?.code || '')}</span>${dueIds.includes(a.id) ? '<span class="pill am">na řadě</span>' : ''}</span><span class="qt-cb" title="Vybrat více">${gl('check')}</span></button>`; }).join('') || '<p class="muted pad">Nic nenalezeno.</p>'}</div>
  <div class="qr-foot"><span class="muted small">${S.subjects.size ? `Vybráno ${S.subjects.size}` : 'Klepnutím na řádek zapíšete · zaškrtnutím vyberete více'}</span><button class="btn primary" data-q="targets-done" ${S.subjects.size ? '' : 'disabled'}>Pokračovat ${gl('arrow-right')}</button></div>`;
}
function subjLine() {
  const db = store.get(), ids = [...S.subjects], a0 = db.animals.find((a) => a.id === ids[0]);
  if (ids.length === 1 && a0) return `<div class="qr-subj">${avatar(a0, 48)}<div><b><span class="code">${esc(a0.code)}</span> ${esc(a0.name || '')}${a0.kind === 'group' ? ` · ${a0.count} zvířat` : ''}</b><span class="latin">${esc(latin(SPECIES[a0.species]))}</span></div>${S.preset ? '' : '<button class="link" data-q="back-target">změnit</button>'}</div>`;
  return `<div class="qr-subj multi"><div class="stackav">${ids.slice(0, 5).map((id) => { const a = db.animals.find((x) => x.id === id); return a ? avatar(a, 34) : ''; }).join('')}</div><div><b>${ids.length} ${ids.length < 5 ? 'zvířata' : 'zvířat'}</b><span class="muted small">${ids.map((id) => esc(subjectOf(db, id)?.code || id)).join(', ')}</span></div><button class="link" data-q="back-target">změnit</button></div>`;
}
const adv = (inner, label = 'Upravit podrobnosti') => `<details class="qr-adv" ${S.adv ? 'open' : ''}><summary data-q="adv">${gl('sliders')}${label}<span class="meta">volitelné</span></summary><div class="stack">${inner}</div></details>`;
const timeNote = () => `<div class="fields two"><label class="field"><span>Kdy</span><input class="input" type="datetime-local" data-q-input="t" value="${toLocalInput(S.data.t || Date.now())}"></label><label class="field"><span>Poznámka</span><input class="input" type="text" data-q-input="note" value="${esc(S.data.note || '')}" placeholder="Volitelné"></label></div>`;
function detailStep() {
  const db = store.get(), t = S.type, ids = [...S.subjects];
  const plan = ids.length === 1 ? db.plans.find((p) => p.subject === ids[0] && p.type === t) : null;
  const go = (label, extra = '') => `<div class="qr-go">${extra}<button class="btn primary xl grow" data-q="save" autofocus>${gl('check')}${label}${ids.length > 1 ? ` · ${ids.length}` : ''}</button></div>`;
  if (t === 'feeding') {
    const rs = plan ? rotationState(db, plan) : null, sup = S.data.supplement || rs?.next;
    return `${subjLine()}<div class="qr-sum">${plan ? `<div><span>Krmivo</span><b>${esc(S.data.feeder || plan.feeder)}</b></div><div><span>Množství</span><b>${esc(S.data.qty || plan.qty)}</b></div>` : '<div><span>Krmivo</span><b>Podle plánu péče každého zvířete</b></div>'}
      ${sup ? `<div class="sup" style="--c:${SUPPLEMENTS[sup]?.color || 'var(--am)'}"><span>Vitaminová rotace</span><b>${esc(sup)}</b>${rs ? `<em>${rs.index + 1}/${rs.rot.length}</em>` : ''}</div>` : ''}</div>
      ${adv(`<div class="fields two"><label class="field"><span>Krmivo</span><input class="input" data-q-input="feeder" value="${esc(S.data.feeder || plan?.feeder || '')}"></label><label class="field"><span>Množství</span><input class="input" data-q-input="qty" value="${esc(S.data.qty || plan?.qty || '')}"></label></div>
        <label class="field"><span>Suplement tentokrát</span><select class="select" data-q-input="supplement"><option value="">Podle rotace (${esc(rs?.next || '—')})</option>${Object.keys(SUPPLEMENTS).map((s) => `<option ${S.data.supplement === s ? 'selected' : ''}>${s}</option>`).join('')}<option value="none">Tentokrát bez suplementu</option></select></label>${timeNote()}`)}
      ${go('NAKRMENO', `<button class="btn lg" data-q="save" data-refused="1">${gl('x')}Odmítnuto</button>`)}`;
  }
  if (['water', 'misting', 'cleaning'].includes(t)) return `${subjLine()}${adv(timeNote())}${go('HOTOVO')}`;
  if (t === 'weight') {
    const last = ids.length === 1 ? lastWeight(db, ids[0]) : null, v = S.data.g ?? last ?? '';
    return `${subjLine()}<label class="field"><span>Hmotnost ${last != null ? `<em class="meta">posledně ${last} g</em>` : ''}</span><div class="stepper big"><button data-q="step" data-v="-${last > 500 ? 10 : 1}" aria-label="Méně">${gl('minus')}</button><input type="number" inputmode="decimal" step="0.1" data-q-input="g" value="${v}" autofocus aria-label="Hmotnost v gramech"><em>g</em><button data-q="step" data-v="${last > 500 ? 10 : 1}" aria-label="Více">${gl('plus')}</button></div></label>
      ${last != null && S.data.g != null ? `<p class="delta ${S.data.g >= last ? 'ok-t' : 'bad-t'}">${S.data.g >= last ? '+' : ''}${(S.data.g - last).toFixed(1)} g (${(((S.data.g - last) / last) * 100).toFixed(1)} %)</p>` : ''}${adv(timeNote())}${go('ULOŽIT HMOTNOST')}`;
  }
  if (t === 'shed') return `${subjLine()}${adv(timeNote())}${go('SVLEK KOMPLETNÍ', `<button class="btn lg" data-q="save" data-incomplete="1">${gl('alert')}Neúplný</button>`)}`;
  if (t === 'health') {
    const sev = S.data.severity || 'watch';
    return `${subjLine()}<div class="field"><span>Pozorování</span><div class="chips">${OBS.map((o) => `<button class="chip ${S.data.title === o ? 'on' : ''}" data-q="obs" data-v="${o}">${o}</button>`).join('')}</div></div>
      <div class="field"><span>Závažnost</span><div class="seg">${[['info', 'Informace'], ['watch', 'Sledovat'], ['alert', 'Akutní']].map(([k, l]) => `<button class="${sev === k ? 'on' : ''}" data-q="sev" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${adv(`<div class="fields two"><label class="field"><span>Diagnóza</span><input class="input" data-q-input="diagnosis" value="${esc(S.data.diagnosis || '')}"></label><label class="field"><span>Veterinář</span><select class="select" data-q-input="vet"><option value="">—</option>${db.contacts.filter((c) => c.kind === 'vet').map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label></div>
        <div class="fields two"><label class="field"><span>Kontrola za (dny)</span><input class="input" type="number" data-q-input="followUp" value="${S.data.followUp ?? 3}"></label><label class="field"><span>Příloha</span><input class="input" type="file" data-q-file accept="image/*,.pdf"></label></div>${timeNote()}`, 'Diagnóza, veterinář, kontrola, příloha')}
      ${go('ULOŽIT ZÁZNAM').replace('data-q="save"', `data-q="save" ${S.data.title ? '' : 'disabled'}`)}`;
  }
  if (t === 'repro') {
    const cys = db.cycles.filter((c) => c.status === 'active' && (!ids.length || ids.includes(c.female) || ids.includes(c.male)));
    if (!S.cycle && cys.length === 1) S.cycle = cys[0].id;
    return `${subjLine()}<div class="field"><span>Cyklus</span><div class="chips">${cys.map((c) => `<button class="chip ${S.cycle === c.id ? 'on' : ''}" data-q="cycle" data-v="${c.id}">${esc(c.name)}</button>`).join('') || '<span class="muted small">Bez aktivního cyklu — zapíše se ke zvířeti.</span>'}</div></div>
      <div class="field"><span>Událost</span><div class="chips">${REPRO_EV.map(([k, l]) => `<button class="chip ${S.data.kind === k ? 'on' : ''}" data-q="rkind" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${S.data.kind === 'clutch' ? `<label class="field"><span>Počet vajec / mláďat</span><div class="stepper"><button data-q="eggs" data-v="-1">${gl('minus')}</button><input type="number" data-q-input="eggs" value="${S.data.eggs ?? 2}"><button data-q="eggs" data-v="1">${gl('plus')}</button></div></label>` : ''}
      ${adv(timeNote())}${go('POTVRDIT UDÁLOST').replace('data-q="save"', `data-q="save" ${S.data.kind ? '' : 'disabled'}`)}`;
  }
  if (t === 'task') {
    const due = S.data.dueK || 'today';
    return `<label class="field"><span>Úkol</span><input class="input lg" type="text" data-q-input="title" value="${esc(S.data.title || '')}" placeholder="např. Vyměnit trysku FW-3" autofocus data-enter-q="save"></label>
      <div class="field"><span>Kdy</span><div class="chips">${[['now', 'Za hodinu'], ['today', 'Dnes 18:00'], ['tomorrow', 'Zítra'], ['2d', 'Za 2 dny'], ['week', 'Příští týden']].map(([k, l]) => `<button class="chip ${due === k ? 'on' : ''}" data-q="due" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${S.subjects.size ? subjLine() : `<button class="link" data-q="pick-subject">${gl('link')} Propojit se zvířetem (volitelné)</button>`}
      ${adv(`<div class="fields two"><label class="field"><span>Priorita</span><select class="select" data-q-input="priority"><option value="normal">Normální</option><option value="high">Vysoká</option><option value="low">Nízká</option></select></label><label class="field"><span>Přesný čas</span><input class="input" type="datetime-local" data-q-input="dueAt"></label></div><label class="field"><span>Poznámka</span><textarea class="textarea" rows="2" data-q-input="note"></textarea></label>`)}
      <div class="qr-go"><button class="btn primary xl grow" data-q="save" ${S.data.title ? '' : 'disabled'}>${gl('plus')}VYTVOŘIT ÚKOL</button></div>`;
  }
  return '';
}
function onInput(e) {
  const k = e.target.dataset.qInput; if (!k) return;
  let v = e.target.value;
  if (k === 'q') { S.q = v; const pos = e.target.selectionStart; draw(); const i = S.h.el.querySelector('[data-q-input=q]'); i.focus(); i.setSelectionRange(pos, pos); return; }
  if (k === 'g') { S.data.g = v === '' ? null : +v; const d = S.h.el.querySelector('.delta'); const last = lastWeight(store.get(), [...S.subjects][0]); if (d && last != null && S.data.g != null) { d.textContent = `${S.data.g >= last ? '+' : ''}${(S.data.g - last).toFixed(1)} g (${(((S.data.g - last) / last) * 100).toFixed(1)} %)`; d.className = `delta ${S.data.g >= last ? 'ok-t' : 'bad-t'}`; } return; }
  if (k === 't' || k === 'dueAt') v = v ? new Date(v).getTime() : null;
  if (k === 'eggs') v = +v;
  S.data[k] = v;
  if (k === 'title') { const b = S.h.el.querySelector('[data-q=save]'); if (b) b.disabled = !v.trim(); }
}
function onKey(e) {
  if (S.step === 'action' && /^[0-9]$/.test(e.key) && !e.target.matches('input,textarea')) { const a = QR_ACTIONS[(+e.key + 9) % 10]; if (a) { e.preventDefault(); pickType(a[0]); } }
  if (e.key === 'Enter' && S.step === 'target' && e.target.matches('[data-q-input=q]')) { const first = S.h.el.querySelector('[data-q=toggle]'); if (first) { S.subjects.add(first.dataset.id); S.pickMore = false; draw(); } }
  if (e.key === 'Enter' && e.target.matches('[data-enter-q=save]')) { e.preventDefault(); save(); }
}
function pickType(t) {
  if (t === 'animal') { closeOv(S.h); import('../views/zvirata.js').then((m) => m.openAddAnimal()); return; }
  S.type = t; S.data = {};
  if (S.subjects.size) S.pickMore = false; else S.filter = 'due';
  draw();
}
function onClick(e) {
  const b = e.target.closest('[data-q]'); if (!b) return;
  const q = b.dataset.q, v = b.dataset.v;
  if (q === 'adv') { S.adv = !S.adv; return; }
  e.preventDefault();
  if (q === 'type') return pickType(v);
  if (q === 'clear-subj') { S.subjects.clear(); S.preset = false; return draw(); }
  if (q === 'filter') { S.filter = v; S.q = ''; return draw(); }
  if (q === 'toggle' && !S.subjects.size && !e.target.closest('.qt-cb') && S.type !== 'task') { S.subjects.add(b.dataset.id); S.pickMore = false; return draw(); }
  if (q === 'toggle') { S.subjects.has(b.dataset.id) ? S.subjects.delete(b.dataset.id) : S.subjects.add(b.dataset.id); b.classList.toggle('on'); b.setAttribute('aria-pressed', S.subjects.has(b.dataset.id)); const f = S.h.el.querySelector('[data-q=targets-done]'); f.disabled = !S.subjects.size; S.h.el.querySelector('.qr-foot .muted').textContent = S.subjects.size ? `Vybráno ${S.subjects.size}` : 'Klepnutím na řádek zapíšete · zaškrtnutím vyberete více'; return; }
  if (q === 'select-all') { for (const id of candidates().list.map((a) => a.id)) S.subjects.add(id); S.pickMore = false; return draw(); }
  if (q === 'targets-done') { S.pickMore = false; return draw(); }
  if (q === 'back-target') { S.pickMore = true; S.preset = false; return draw(); }
  if (q === 'pick-subject') { S.pickMore = true; S.filter = 'recent'; return draw(); }
  if (q === 'step') { S.data.g = +(((S.data.g ?? lastWeight(store.get(), [...S.subjects][0]) ?? 0) + +v).toFixed(1)); return draw(); }
  if (q === 'eggs') { S.data.eggs = Math.max(0, (S.data.eggs ?? 2) + +v); return draw(); }
  if (q === 'obs') { S.data.title = v; return draw(); }
  if (q === 'sev') { S.data.severity = v; return draw(); }
  if (q === 'cycle') { S.cycle = v; return draw(); }
  if (q === 'rkind') { S.data.kind = v; return draw(); }
  if (q === 'due') { S.data.dueK = v; return draw(); }
  if (q === 'edit-last') { const r = A.lastOwnRecord(); closeOv(S.h); if (r) editRecordPanel(r.id); return; }
  if (q === 'repeat-last') { S.type = b.dataset.type; S.subjects = new Set([b.dataset.subject]); S.preset = true; return draw(); }
  if (q === 'save') return save({ refused: !!b.dataset.refused, incomplete: !!b.dataset.incomplete });
}
function save({ refused = false, incomplete = false } = {}) {
  const ids = [...S.subjects], t = S.type, d = { ...S.data };
  let res;
  if (t === 'task') {
    if (!d.title?.trim()) return;
    const n = Date.now(), sod = startOfDay(n);
    const due = d.dueAt || { now: n + HOUR, today: sod + 18 * HOUR, tomorrow: sod + DAY + 9 * HOUR, '2d': sod + 2 * DAY + 9 * HOUR, week: sod + 7 * DAY + 9 * HOUR }[d.dueK || 'today'];
    A.addTask({ title: d.title.trim(), due: Math.max(due, n + 60e3), priority: d.priority, note: d.note, subject: ids[0] || null });
    res = { label: `Úkol vytvořen · ${d.title.trim()}` };
  } else {
    if (t === 'feeding') { if (refused) d.refused = true; if (d.supplement === 'none') { d.supplement = undefined; d.noSupplement = true; } }
    if (t === 'shed') d.complete = !incomplete;
    if (t === 'health') { d.severity ||= 'watch'; if (d.followUp) d.followUp = startOfDay(Date.now()) + (+d.followUp) * DAY + 18 * HOUR; else delete d.followUp; const f = S.h.el.querySelector('[data-q-file]')?.files?.[0]; if (f) d.attachments = [{ name: f.name, kind: f.type.startsWith('image') ? 'image' : 'pdf', src: 'local' }]; d.kind = d.diagnosis ? 'diagnóza' : d.vet ? 'veterinář' : 'pozorování'; }
    if (t === 'repro') { d.cycle = S.cycle; d.label = `${REPRO_EV.find((x) => x[0] === d.kind)?.[1]}${d.kind === 'clutch' ? ` — ${d.eggs ?? 2} vajec` : ''}`; }
    if (t === 'weight' && (d.g == null || isNaN(d.g))) return;
    res = A.quickRecord(t, ids, d);
    const nice = { feeding: refused ? 'Odmítnutí krmení zapsáno' : 'Krmení zapsáno', weight: 'Hmotnost uložena', water: 'Voda zapsána', misting: 'Rosení zapsáno', cleaning: 'Údržba zapsána', shed: 'Svlek zapsán', health: 'Zdravotní záznam uložen', repro: 'Událost zapsána' }[t];
    if (res) res.label = `${nice}${ids.length > 1 ? ` · ${ids.length}×` : ''}`;
    store.mutate(null, (db) => { db.recent.animals = [...ids, ...db.recent.animals.filter((x) => !ids.includes(x))].slice(0, 12); }, { silent: true });
  }
  closeOv(S.h);
  done(res, { edit: res?.records?.length === 1 ? () => editRecordPanel(res.records[0].id) : null });
}
export function editRecordPanel(recordId) {
  const db = store.get(), r = db.records.find((x) => x.id === recordId); if (!r) return;
  const sub = subjectOf(db, r.subject, r.subjectKind);
  const body = `<div class="stack"><div class="qr-subj">${sub?.obj && sub.kind === 'animal' ? avatar(sub.obj, 44) : ''}<div><b>${esc(TYPE[r.type]?.label || r.type)} · <span class="code">${esc(sub?.code || '')}</span></b><span class="muted small">${new Date(r.t).toLocaleString('cs-CZ')}</span></div></div>
    <label class="field"><span>Čas</span><input class="input" type="datetime-local" data-e="t" value="${toLocalInput(r.t)}"></label>
    ${r.type === 'weight' ? `<label class="field"><span>Hmotnost (g)</span><input class="input" type="number" step="0.1" data-e="g" value="${r.data.g ?? ''}"></label>` : ''}
    ${r.type === 'feeding' ? `<div class="fields two"><label class="field"><span>Krmivo</span><input class="input" data-e="feeder" value="${esc(r.data.feeder || '')}"></label><label class="field"><span>Množství</span><input class="input" data-e="qty" value="${esc(r.data.qty || '')}"></label></div><div class="fields two"><label class="field"><span>Suplement</span><select class="select" data-e="supplement"><option value="">—</option>${Object.keys(SUPPLEMENTS).map((s) => `<option ${r.data.supplement === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="field row"><input type="checkbox" class="cb" data-e="refused" ${r.data.refused ? 'checked' : ''}><span>Odmítnuto</span></label></div>` : ''}
    <label class="field"><span>Poznámka</span><textarea class="textarea" rows="3" data-e="note">${esc(r.data.note || '')}</textarea></label></div>`;
  const h = panel({ title: 'Upravit záznam', sub: 'Oprava zachová stejný záznam v historii', icon: 'edit', body, footer: `<button class="btn danger" data-e-del>${gl('trash')}Smazat</button><span class="spacer"></span><button class="btn tertiary" data-close>Zrušit</button><button class="btn primary" data-e-save>${gl('check')}Uložit</button>` });
  h.el.querySelector('[data-e-save]').onclick = () => {
    const g = (k) => h.el.querySelector(`[data-e=${k}]`);
    const patch = { t: new Date(g('t').value).getTime(), data: { note: g('note').value } };
    if (g('g')) patch.data.g = +g('g').value;
    if (g('feeder')) Object.assign(patch.data, { feeder: g('feeder').value, qty: g('qty').value, supplement: g('supplement').value || undefined, refused: g('refused').checked });
    A.editRecord(recordId, patch); closeOv(h); done({ label: 'Záznam upraven' });
  };
  h.el.querySelector('[data-e-del]').onclick = () => { A.deleteRecord(recordId); closeOv(h); done({ label: 'Záznam smazán' }); };
}
