// ÚKOLY & PÉČE — Dnes · Plánovač (klidná provozní osa + volitelný ROZŠÍŘENÝ HARMONOGRAM) · Rychlá péče · Suplementace.
import { esc, actions } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { panel, menu, close as closeOv } from '../core/overlay.js';
import { SPECIES, SUPPLEMENTS, latin } from '../data/species.js';
import { TYPE, rotationState } from '../engine/ops.js';
import { groupItems, isOpen } from '../engine/timeline.js';
import * as A from '../engine/actions.js';
import { pageHead, block, avatar, empty } from '../ui/components.js';
import { streamHTML, contextItems, typeTile, finish } from '../ui/timeline.js';
import { done } from '../ui/feedback.js';
import { openQuickRecord } from '../ui/quickrecord.js';
import { workspaceHTML, mountWorkspace } from '../widgets/workspace.js';
import { DAY, HOUR, startOfDay, hm, dShort, rel, monthShort, plural } from '../core/time.js';

const P = { range: 7, filter: 'all', q: '', showDone: false, xs: false };
const sod = () => startOfDay(Date.now());
const RANGES = [[1, 'Dnes'], [3, '3 dny'], [7, 'Týden'], [14, '14 dní']];
const FILT = [['all', 'Vše'], ['care', 'Péče'], ['feeding', 'Krmení'], ['health', 'Zdraví'], ['repro', 'Reprodukce'], ['enclosures', 'Ubikace'], ['manual', 'Ruční'], ['auto', 'Plány & automatika']];

function counts() {
  const items = contextItems({ from: sod() - 7 * DAY, to: sod() + DAY, includeHistory: false }).filter((i) => i.kind !== 'phase');
  const g = groupItems(items.filter((i) => i.t >= sod() || i.status === 'overdue'));
  return { od: g.filter((i) => i.status === 'overdue').length, open: g.filter(isOpen).length, done: g.filter((i) => i.status === 'done').length, all: g.length };
}
function head(r) {
  const c = counts();
  return pageHead({ mod: 'ukoly', cur: r.sub, title: 'Úkoly & péče', sub: `${c.open} ${plural(c.open, 'karta čeká', 'karty čekají', 'karet čeká')} · ${c.done} hotovo dnes${c.od ? ` · <span class="warn-t">${c.od} po termínu</span>` : ''}`,
    tabs: [['dnes', 'Dnes', c.open || ''], ['planovac', 'Plánovač'], ['rychla-pece', 'Rychlá péče'], ['suplementace', 'Suplementace']],
    actions: `<button class="btn" data-act="qr-type" data-type="task">${gl('plus')}Nový úkol</button><button class="btn primary" data-act="quick-record">${gl('check')}Rychlý záznam</button>` });
}

// ---------------------------------------------------------------- DNES
function today() {
  const c = counts(), items = contextItems({ from: sod() - 7 * DAY, to: sod() + DAY, includeHistory: false }).filter((i) => i.kind !== 'phase' && (i.t >= sod() || i.status === 'overdue'));
  const tasks = store.get().tasks.filter((k) => k.status === 'open').sort((a, b) => (a.postponedTo || a.due) - (b.postponedTo || b.due));
  return `<div class="pl-sum"><span class="pill ${c.od ? 'am' : 'mute'}">${gl('alert')}Po termínu ${c.od}</span><span class="pill">${gl('clock')}Čeká ${c.open}</span><span class="pill ok">${gl('check')}Hotovo ${c.done}</span></div>
  <div class="g-main">
    ${block('Dnešní práce', streamHTML(items, { mode: 'full', showDone: true, empty: 'Na dnes je hotovo' }), { icon: 'tasks', level: 'primary', sub: 'Po termínu · teď · dnes', actions: `<a class="btn sm tertiary" href="#/ukoly/planovac">${gl('calendar')}Celý plánovač</a>` })}
    <div class="stack">
      ${block('Ruční úkoly', `<div class="add-task"><input class="input" placeholder="Nový úkol… Enter" data-enter="task-add" aria-label="Nový úkol"><button class="btn sm" data-act="task-add">${gl('plus')}</button></div>
        <div class="list">${tasks.map((k) => { const s = k.subject && (store.get().animals.find((a) => a.id === k.subject) || store.get().enclosures.find((e) => e.id === k.subject)); const t = k.postponedTo || k.due; return `<div class="li dn-row"><input type="checkbox" class="cb" data-act="task-done" data-id="${k.id}" aria-label="Hotovo"><span class="li-main"><b>${esc(k.title)}</b><span>${k.priority === 'high' ? '<em class="warn-t">vysoká · </em>' : ''}${t < Date.now() ? '<em class="warn-t">po termínu · </em>' : ''}${dShort(t)} ${hm(t)}${s ? ` · <span class="code">${esc(s.code)}</span>` : ''}</span></span><button class="icon-btn sm" data-act="tl-detail" data-id="${k.id}" aria-label="Detail">${gl('more')}</button></div>`; }).join('') || '<p class="muted small">Žádné ruční úkoly.</p>'}</div>`, { icon: 'checklist', level: 'secondary' })}
      ${workspaceHTML('ukoly', { editLabel: 'UPRAVIT' })}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- PLÁNOVAČ
function planner() {
  const items = contextItems({ from: sod() - 7 * DAY, to: sod() + P.range * DAY, filter: P.filter, q: P.q, includeHistory: P.showDone });
  return `<div class="pl-planner"><div class="m-plbar"><button class="btn ${P.range === 1 ? 'primary' : ''}" data-act="pl-range" data-v="${P.range === 1 ? 7 : 1}">${gl('calendar')}${P.range === 1 ? 'TÝDEN' : 'DNES'}</button><button class="btn ${P.filter !== 'all' ? 'primary' : ''}" data-act="pl-mfilter">${gl('filter')}FILTR</button><button class="btn plus primary" data-act="quick-record" aria-label="Rychlý záznam">${gl('plus')}</button><button class="btn" data-act="pl-now">${gl('clock')}TEĎ</button></div>
    <div class="pl-bar">
      <div class="seg" role="tablist" aria-label="Rozsah">${RANGES.map(([d, l]) => `<button class="${P.range === d ? 'on' : ''}" data-act="pl-range" data-v="${d}">${l}</button>`).join('')}</div>
      <label class="searchbox">${gl('search')}<input type="search" placeholder="Filtrovat: kód, druh, krmivo…" value="${esc(P.q)}" data-input="pl-q" id="pl-q" aria-label="Filtrovat plánovač"></label>
      <span class="spacer"></span>
      <label class="row small"><input type="checkbox" class="switch" data-change="pl-done" ${P.showDone ? 'checked' : ''}><span>Hotové</span></label>
      <button class="btn ${P.xs ? 'primary' : ''}" data-act="pl-xs" aria-pressed="${P.xs}">${gl('reproduction')}ROZŠÍŘENÝ HARMONOGRAM</button>
    </div>
    <div class="chips pl-chips" style="margin-bottom:14px">${FILT.map(([k, l]) => `<button class="chip ${P.filter === k ? 'on' : ''}" data-act="pl-filter" data-v="${k}">${l}</button>`).join('')}</div>
    ${P.xs ? block('Rozšířený harmonogram', extended(), { icon: 'reproduction', level: 'secondary', kicker: 'Biologické fáze · poctivá rozmezí', sub: 'Plné fáze = potvrzeno · šrafované = očekávané rozmezí · kosočtverec = pozorovaná událost', cls: 'sec', actions: `<button class="icon-btn sm" data-act="pl-xs" aria-label="Zavřít harmonogram">${gl('x')}</button>` }) + '<div class="sec"></div>' : ''}
    ${block('Provozní osa', streamHTML(items, { mode: 'full', showDone: true, empty: 'Nic neodpovídá filtru' }), { icon: 'calendar', level: 'primary', sub: `${RANGES.find((x) => x[0] === P.range)[1]} · ${FILT.find((x) => x[0] === P.filter)[1]}`, cls: 'planner' })}</div>`;
}
const PH = { cycling: ['Cyklování', 'var(--c-water)'], brumation: ['Brumace', 'var(--c-water)'], fasting: ['Půst', 'var(--tx-4)'], pairing: ['Párování', 'var(--c-repro)'], mating: ['Pozorované páření', 'var(--c-repro)'], ovulation: ['Ovulace', 'var(--female)'], prelay: ['Předsnůškový svlek', 'var(--c-shed)'], lay: ['Snůška', 'var(--am-2)'], clutch: ['Snůška', 'var(--am-2)'], gravid: ['Březost', 'var(--female)'], incubation: ['Inkubace', 'var(--c-incub)'], hatch: ['Líhnutí', 'var(--ok)'], calling: ['Námluvy', 'var(--c-repro)'], develop: ['Vývoj vajec', 'var(--c-incub)'], tadpole: ['Pulci', 'var(--c-mist)'] };
function extended() {
  const db = store.get(), n = Date.now(), from = sod() - 100 * DAY, to = sod() + 140 * DAY, W = to - from;
  const x = (t) => `${Math.max(0, Math.min(100, ((t - from) / W) * 100)).toFixed(2)}%`, w = (a, b) => `calc(${x(Math.max(b, a + DAY / 2))} - ${x(a)})`;
  const rows = db.cycles.filter((c) => c.status === 'active').map((cy) => {
    const f = db.animals.find((a) => a.id === cy.female);
    const bars = cy.phases.map((p) => { const [l, c] = PH[p.key] || [p.label, 'var(--c-repro)']; const end = p.end ?? p.start; const ms = p.milestone || p.start === end; if (end < from || p.start > to) return ''; return `<i class="xs-ph ${ms ? 'ms' : ''} ${p.expected ? 'exp' : ''} ${!p.expected && end < n ? 'done' : ''}" style="--c:${c};left:${x(p.start)};${ms ? '' : `width:${w(p.start, end)}`}" title="${esc(p.label)} · ${dShort(p.start)}${ms ? '' : ` – ${dShort(end)}`}${p.basis ? ` · ${esc(p.basis)}` : ''}">${ms ? '' : esc(l)}</i>`; }).join('');
    const ev = cy.events.filter((e) => e.type === 'mating' && e.t >= from).map((e) => `<i class="xs-ph ms" style="--c:var(--c-repro);left:${x(e.t)}" title="${esc(e.label)} · ${dShort(e.t)}"></i>`).join('');
    return `<a class="xs-row" href="#/reprodukce/cyklus/${cy.id}"><span class="xs-l">${avatar(f, 32)}<span><b>${esc(cy.name)}</b><em class="latin">${esc(latin(SPECIES[cy.species]))}</em></span></span><span class="xs-track">${bars}${ev}<i class="xs-now" style="left:${x(n)}"></i></span></a>`;
  }).join('');
  const ax = [...Array(9)].map((_, k) => { const t = from + (k / 8) * W; return `<span style="left:${(k / 8) * 100}%">${new Date(t).getDate()}. ${monthShort(new Date(t).getMonth())}</span>`; }).join('');
  const lg = ['cycling', 'brumation', 'pairing', 'mating', 'ovulation', 'prelay', 'clutch', 'incubation', 'hatch'].map((k) => `<span><i style="--c:${PH[k][1]}"></i>${PH[k][0]}</span>`).join('');
  return `<div class="xs">${rows}<div class="xs-ax">${ax}</div><div class="xs-legend">${lg}<span><i class="exp"></i>očekávané rozmezí</span></div></div>`;
}

// ---------------------------------------------------------------- RYCHLÁ PÉČE
function quickCare() {
  const items = contextItems({ from: sod() - 3 * DAY, to: sod() + DAY, includeHistory: false }).filter((i) => i.kind === 'occ' && isOpen(i) && ['feeding', 'water', 'misting', 'cleaning', 'weight'].includes(i.type));
  const by = {}; for (const i of items) (by[i.type] ||= []).push(i);
  if (!Object.keys(by).length) return empty('Rutinní péče je hotová', 'Nic dalšího na dnes.', 'status-ok');
  return `<div class="g3">${Object.entries(by).map(([k, arr]) => block(`${TYPE[k].label} ×${arr.length}`, `<div class="list">${arr.map((i) => `<div class="li dn-row ${i.status === 'overdue' ? 'od' : ''}">${i.sub?.kind === 'animal' ? avatar(i.sub.obj, 32) : `<span class="tl-eico">${gl('habitat')}</span>`}<span class="li-main"><b>${i.sub?.species ? `<span class="latin">${esc(latin(i.sub.species))}</span>` : esc(i.sub?.name || i.title)}</b><span><span class="code">${esc(i.sub?.code || '')}</span> · ${hm(i.t)}${i.status === 'overdue' ? ' · <em class="warn-t">po termínu</em>' : ''}${i.meta?.supplement ? ` · ${esc(i.meta.supplement)}` : ''}</span></span>${k === 'weight' ? `<span class="tl-wt"><input type="number" id="w-${esc(i.id)}" placeholder="${i.meta?.last ?? 'g'}" data-enter="tl-weight" data-id="${esc(i.id)}" aria-label="Hmotnost"><em>g</em></span><button class="btn sm done" data-act="tl-weight" data-id="${esc(i.id)}" aria-label="Uložit">${gl('check')}</button>` : `<button class="btn sm done" data-act="tl-done" data-id="${esc(i.id)}" aria-label="Hotovo ${esc(i.sub?.code || '')}">${gl('check')}</button>`}</div>`).join('')}</div>`, { icon: TYPE[k].icon, level: arr.some((i) => i.status === 'overdue') ? 'primary' : 'secondary', actions: k === 'weight' ? '' : `<button class="btn sm done" data-act="w-bulk" data-ids="${arr.map((x) => x.id).join(',')}">${gl('check')}HOTOVO VŠE</button>` })).join('')}</div>`;
}

// ---------------------------------------------------------------- SUPLEMENTACE (vitaminová rotace)
function supplements() {
  const db = store.get(), plans = db.plans.filter((p) => p.type === 'feeding' && p.active && p.rotation?.length > 1);
  return `${block('Vitaminová rotace', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Zvíře</th><th>Krmivo</th><th>Rotace</th><th>Posledně</th><th>Další</th><th></th></tr></thead><tbody>${plans.map((p) => { const rs = rotationState(db, p), a = db.animals.find((x) => x.id === p.subject); return `<tr><td><a class="row" href="#/zvirata/karta/${a.id}">${avatar(a, 30)}<span class="spl"><b class="latin">${esc(latin(SPECIES[a.species]))}</b><span class="code">${esc(a.code)}</span></span></a></td><td class="muted">${esc(p.feeder)} · každé ${p.every === 1 ? 'dny' : `${p.every} dny`}</td><td><span class="rot-seq">${rs.rot.map((s, i) => `<i class="${i === rs.index ? 'next' : ''}" style="--c:${SUPPLEMENTS[s]?.color}" title="${esc(s)}"></i>`).join('')}</span></td><td>${esc(rs.last || '—')}</td><td><b style="color:${SUPPLEMENTS[rs.next]?.color}">${esc(rs.next || '—')}</b></td><td class="num"><button class="btn sm tertiary" data-act="rot-edit" data-id="${p.id}">${gl('edit')}UPRAVIT</button></td></tr>`; }).join('')}</tbody></table></div>`, { icon: 'supplement', level: 'primary', sub: 'Suplement se při zápisu krmení doplní sám a rotace se posune' })}
  <div class="g4 sec">${Object.entries(SUPPLEMENTS).map(([k, s]) => { const inv = db.inventory.find((i) => i.name.startsWith(k.split(' ')[0])); return `<div class="blk lvl-detail sup-card" style="--c:${s.color}"><div class="blk-b" style="padding-top:14px"><img src="assets/img/feeders/${s.img}.webp" alt="" loading="lazy"><b>${esc(k)}</b><span class="muted small">${esc(s.kind)}</span>${inv ? `<span class="pill ${inv.qty < inv.min ? 'warn' : 'mute'}">skladem ${String(inv.qty).replace('.', ',')} ${esc(inv.unit)}</span>` : ''}</div></div>`; }).join('')}</div>`;
}
export function editRotation(planId) {
  const db = store.get(), p = db.plans.find((x) => x.id === planId), a = db.animals.find((x) => x.id === p.subject);
  let rot = [...p.rotation];
  const body = () => `<div class="stack"><p class="muted small">Pořadí suplementů pro <b>${esc(a.code)}</b> (${esc(latin(SPECIES[a.species]))}). Při každém krmení se použije další v řadě.</p>
    <div class="rot-ed">${rot.map((s, i) => `<div class="row"><span class="mono muted">${i + 1}.</span><select class="select" data-ri="${i}">${Object.keys(SUPPLEMENTS).map((k) => `<option ${k === s ? 'selected' : ''}>${k}</option>`).join('')}</select><button class="icon-btn sm" data-rdel="${i}" aria-label="Odebrat">${gl('x')}</button></div>`).join('')}</div>
    <button class="btn sm" data-radd>${gl('plus')}Přidat krok</button></div>`;
  const h = panel({ title: 'Upravit vitaminovou rotaci', sub: `${esc(a.code)} · ${esc(p.feeder)}`, icon: 'supplement', width: 420, body: body(), footer: `<span class="spacer"></span><button class="btn tertiary" data-close>Zrušit</button><button class="btn primary" data-rsave>${gl('check')}Uložit</button>` });
  const redraw = () => { h.el.querySelector('.ov-body').innerHTML = body(); };
  h.el.addEventListener('change', (e) => { const s = e.target.closest('[data-ri]'); if (s) rot[+s.dataset.ri] = s.value; });
  h.el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-rdel]'); if (d && rot.length > 1) { rot.splice(+d.dataset.rdel, 1); redraw(); }
    if (e.target.closest('[data-radd]')) { rot.push(Object.keys(SUPPLEMENTS)[0]); redraw(); }
    if (e.target.closest('[data-rsave]')) { store.mutate('Rotace upravena', (d2) => { d2.plans.find((x) => x.id === planId).rotation = rot; }); closeOv(h); done({ label: 'Rotace uložena' }); }
  });
}

export function render(r) {
  const body = r.sub === 'planovac' ? planner() : r.sub === 'rychla-pece' ? quickCare() : r.sub === 'suplementace' ? supplements() : today();
  return `${head(r)}${body}`;
}
export function mount(host, r) {
  mountWorkspace(host);
  if (r.sub === 'planovac' && !P.scrolled) { P.scrolled = true; requestAnimationFrame(() => { const now = host.querySelector('#tl-now'); if (now) host.scrollTop = Math.max(0, now.offsetTop - 180); }); }
}
export function onEnter() { P.scrolled = false; }
export function onNew() { openQuickRecord({ type: 'task' }); }

actions({
  'pl-range': (el) => { P.range = +el.dataset.v; store.emit('change'); },
  'pl-filter': (el) => { P.filter = el.dataset.v; store.emit('change'); },
  'pl-q': (el) => { P.q = el.value; store.emit('change'); },
  'pl-done': (el) => { P.showDone = el.checked; store.emit('change'); },
  'pl-xs': () => { P.xs = !P.xs; store.emit('change'); },
  'pl-mfilter': (el) => menu(el, FILT.map(([k, l]) => ({ icon: P.filter === k ? 'check' : 'filter', label: l, run: () => { P.filter = k; store.emit('change'); } })).concat([{ sep: true }, { icon: 'eye', label: P.showDone ? 'Skrýt hotové' : 'Zobrazit hotové', run: () => { P.showDone = !P.showDone; store.emit('change'); } }, { icon: 'reproduction', label: 'Rozšířený harmonogram', run: () => { P.xs = !P.xs; store.emit('change'); } }]), { title: 'Filtr plánovače' }),
  'pl-now': () => { const v = document.getElementById('view'), n = document.getElementById('tl-now'); if (n) v.scrollTo({ top: Math.max(0, n.offsetTop - 120), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); },
  'rot-edit': (el) => editRotation(el.dataset.id),
  'task-add': (el) => { const inp = el.closest('.add-task')?.querySelector('input') || el; const v = inp.value.trim(); if (!v) { inp.focus(); return; } A.addTask({ title: v, due: startOfDay(Date.now()) + 18 * HOUR }); done({ label: `Úkol vytvořen: ${v}` }); },
  'task-done': (el) => finish(el, () => done(A.complete([el.dataset.id]))),
});
