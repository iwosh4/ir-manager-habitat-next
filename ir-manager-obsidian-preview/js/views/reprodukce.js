// REPRODUKCE — Přehled · Cykly · Inkubace · detail cyklu · detail snůšky.
// Každý cyklus odpovídá na tři otázky: AKTUÁLNÍ FÁZE · DALŠÍ AKCE · OČEKÁVANÉ OKNO (vždy jako rozmezí).
import { esc, actions } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { SPECIES, latin } from '../data/species.js';
import { isOpen } from '../engine/timeline.js';
import * as A from '../engine/actions.js';
import { pageHead, block, avatar, empty, rangeBar, sexMark } from '../ui/components.js';
import { streamHTML, contextItems } from '../ui/timeline.js';
import { done } from '../ui/feedback.js';
import { openQuickRecord } from '../ui/quickrecord.js';
import { workspaceHTML, mountWorkspace } from '../widgets/workspace.js';
import { DAY, startOfDay, dShort, dNum, rel, daysBetween, monthShort } from '../core/time.js';

const PHC = { cycling: 'var(--c-water)', brumation: 'var(--c-water)', fasting: '#5b6b76', pairing: 'var(--c-repro)', ovulation: 'var(--female)', prelay: 'var(--c-shed)', lay: 'var(--am-2)', clutch: 'var(--am-2)', gravid: 'var(--female)', incubation: 'var(--c-incub)', hatch: 'var(--ok)', calling: 'var(--c-repro)', develop: 'var(--c-incub)', tadpole: 'var(--c-mist)' };
const sod = () => startOfDay(Date.now());
function state(cy) {
  const n = Date.now(), cur = [...cy.phases].reverse().find((p) => p.start <= n && !(p.milestone && p.start < n - 2 * DAY)) || [...cy.phases].reverse().find((p) => p.start <= n) || cy.phases[0];
  const nxt = cy.phases.find((p) => p.start > n) || cy.phases.find((p) => p.expected && (p.end ?? p.start) > n);
  return { cur, nxt };
}
function three(cy) {
  const { cur, nxt } = state(cy), nextId = cy.next ? `next:${cy.id}:${cy.next.due}` : null, od = cy.next && cy.next.due < Date.now();
  return `<div class="cyc3">
    <div><span>AKTUÁLNÍ FÁZE</span><b>${esc(cur.label)}</b><em>${cur.end && cur.end !== cur.start ? `${dShort(cur.start)} – ${dShort(cur.end)}` : dShort(cur.start)}</em></div>
    <div class="hl ${od ? 'od' : ''}"><span>DALŠÍ AKCE</span><b>${esc(cy.next?.label || '—')}</b>${cy.next ? `<em>${od ? 'po termínu · ' : ''}${rel(cy.next.due)}</em>` : ''}${nextId ? `<button class="btn sm ${od ? 'primary' : 'done'}" data-act="tl-done" data-id="${esc(nextId)}">${gl('check')}POTVRDIT</button>` : ''}</div>
    <div><span>OČEKÁVANÉ OKNO</span><b>${nxt ? `${dShort(nxt.start)} – ${dShort(nxt.end ?? nxt.start)}` : '—'}</b>${nxt ? `<em>${esc(nxt.label)}${nxt.basis ? ` · ${esc(nxt.basis)}` : ''}</em>` : ''}</div>
  </div>`;
}
function phaseBar(cy) {
  const a = cy.phases[0].start, b = Math.max(...cy.phases.map((p) => p.end ?? p.start)), W = Math.max(DAY, b - a), n = Date.now();
  const x = (t) => `${(((t - a) / W) * 100).toFixed(2)}%`;
  return `<div class="phb">${cy.phases.map((p) => { const e = p.end ?? p.start, ms = p.milestone || e === p.start; return `<i class="${ms ? 'ms' : ''} ${p.expected ? 'exp' : ''}" style="--c:${PHC[p.key] || 'var(--c-repro)'};left:${x(p.start)};${ms ? '' : `width:calc(${x(e)} - ${x(p.start)})`}" title="${esc(p.label)}"></i>`; }).join('')}${n >= a && n <= b ? `<b class="phb-now" style="left:${x(n)}"></b>` : ''}</div><div class="phb-l"><span>${dShort(a)}</span><span>${dShort(b)}</span></div>`;
}
function cycleCard(db, cy) {
  const f = db.animals.find((x) => x.id === cy.female), m = db.animals.find((x) => x.id === cy.male);
  return `<article class="cyc blk lvl-secondary"><header class="cyc-h"><div class="stackav">${avatar(f, 40)}${m ? avatar(m, 40) : ''}</div><a class="cyc-t" href="#/reprodukce/cyklus/${cy.id}"><b>${esc(cy.name)}</b><span class="latin small">${esc(latin(SPECIES[cy.species]))}</span></a><a class="icon-btn sm" href="#/reprodukce/cyklus/${cy.id}" aria-label="Detail cyklu">${gl('arrow-right')}</a></header>${three(cy)}${phaseBar(cy)}</article>`;
}
function clutchCard(db, c, big = false) {
  const d = daysBetween(c.laid, Date.now()), f = db.animals.find((x) => x.id === c.female), inc = db.enclosures.find((e) => e.id === c.incubator);
  const chk = contextItems({ from: sod() - 7 * DAY, to: sod() + 14 * DAY, includeHistory: false }).find((i) => i.src === 'clutch-check' && i.clutch === c.id && isOpen(i));
  const w0 = c.laid + c.expected[0] * DAY, w1 = c.laid + c.expected[1] * DAY, inWin = Date.now() >= w0;
  return `<article class="clc ${big ? 'big' : ''} ${inWin ? 'win' : ''}"><a class="clc-img" href="#/reprodukce/snuska/${c.id}"><img src="assets/img/kpi/${c.img}.webp" alt="" loading="lazy"><span class="clc-day"><b>${d}</b><em>den</em></span></a>
    <div class="clc-b"><div class="row"><a href="#/reprodukce/snuska/${c.id}" class="code clc-code">${esc(c.code)}</a>${inWin ? '<span class="pill ok">okno líhnutí otevřeno</span>' : ''}<span class="spacer"></span><span class="muted small">${f ? `${esc(f.code)}${f.name ? ` ${esc(f.name)}` : ''}` : ''}</span></div>
    <b class="latin">${esc(latin(SPECIES[c.species]))}</b>
    ${rangeBar(d, c.expected)}
    <div class="clc-f"><span>${gl('egg')}<b>${c.fertile}</b>/${c.eggs} oplozených</span><span>${gl('thermometer')}${String(c.temp).replace('.', ',')} °C · ${c.rh} %</span>${inc?.readings ? `<span class="${Math.abs(inc.readings.t - c.temp) > .6 ? 'warn-t' : ''}">${gl('activity')}nyní ${String(inc.readings.t).replace('.', ',')} °C</span>` : ''}<span>${gl('calendar')}${dShort(w0)} – ${dShort(w1)}</span></div>
    <div class="row clc-a">${chk ? `<button class="btn sm ${chk.status === 'overdue' ? 'primary' : 'done'}" data-act="tl-done" data-id="${esc(chk.id)}">${gl('check')}KONTROLA${chk.status === 'overdue' ? ' · po termínu' : ` · ${rel(chk.t)}`}</button>` : `<span class="muted small">Další kontrola ${rel(c.lastCheck + c.checkEvery * DAY)}</span>`}<span class="spacer"></span>${inWin ? `<button class="btn sm" data-act="cl-hatch" data-id="${c.id}">${gl('plus')}Zapsat líhnutí</button>` : ''}<a class="btn sm tertiary" href="#/reprodukce/snuska/${c.id}">Detail</a></div></div></article>`;
}

function overview() {
  const db = store.get(), act = db.cycles.filter((c) => c.status === 'active'), inc = db.clutches.filter((c) => c.status === 'incubating'), n = Date.now();
  const soon = inc.filter((c) => c.laid + c.expected[0] * DAY < n + 30 * DAY).length;
  return `<div class="kpis k4">${[['Aktivní cykly', act.length, '', `${act.filter((c) => c.next && c.next.due < n + 2 * DAY).length} kroky do 48 h`, 'reproduction'], ['V inkubaci', inc.reduce((s, c) => s + c.fertile, 0), 'vajec', `${inc.length} snůšky`, 'temperature'], ['Okna líhnutí', soon, 'do 30 dní', inc.filter((c) => n >= c.laid + c.expected[0] * DAY).length ? '1 okno právě otevřené' : 'žádné otevřené okno', 'calendar'], ['Odchov 2026', db.animals.filter((a) => a.origin?.type === 'own-breeding').reduce((s, a) => s + (a.kind === 'group' ? a.count : 1), 0), 'mláďat', 'vlastní odchov', 'groups']].map(([l, v, u, s, ic]) => `<div class="kpi plain"><span class="kpi-l">${l}</span><b class="kpi-v">${v}${u ? `<em>${u}</em>` : ''}</b><span class="kpi-s">${s}</span>${ico(ic, 'md kpi-ico')}</div>`).join('')}</div>
  <div class="sec-h"><h2 class="t-module">Aktivní cykly</h2><span class="muted small">Aktuální fáze · další akce · očekávané okno</span></div>
  <div class="g3">${act.map((c) => cycleCard(db, c)).join('')}</div>
  <div class="sec-h"><h2 class="t-module">Inkubace</h2><a class="w-more" href="#/reprodukce/inkubace">Vše ${gl('arrow-right')}</a></div>
  <div class="g3">${inc.map((c) => clutchCard(db, c)).join('')}</div>
  <div class="sec">${workspaceHTML('reprodukce', { editLabel: 'UPRAVIT' })}</div>`;
}
function cycles() {
  const db = store.get();
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cyklus</th><th>Pár</th><th>Aktuální fáze</th><th>Další akce</th><th>Cíl</th><th>Stav</th></tr></thead><tbody>${db.cycles.map((cy) => { const { cur } = state(cy), f = db.animals.find((a) => a.id === cy.female), m = db.animals.find((a) => a.id === cy.male); return `<tr class="clk" data-act="go" data-href="#/reprodukce/cyklus/${cy.id}"><td><span class="spl"><b>${esc(cy.name)}</b><i class="latin small">${esc(latin(SPECIES[cy.species]))}</i></span></td><td><span class="row">${f ? `${sexMark('f')}<span class="code">${esc(f.code)}</span>` : ''}${m ? `${sexMark('m')}<span class="code">${esc(m.code)}</span>` : ''}</span></td><td><span class="pill repro">${esc(cur.label.split(' (')[0])}</span></td><td>${cy.next ? `${esc(cy.next.label)} <span class="muted small">· ${rel(cy.next.due)}</span>` : '—'}</td><td class="muted small">${esc(cy.goal || '')}</td><td>${cy.status === 'active' ? '<span class="pill ok">aktivní</span>' : '<span class="pill mute">ukončeno</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function incubation() {
  const db = store.get(), inc = db.clutches.filter((c) => c.status === 'incubating'), done2 = db.clutches.filter((c) => c.status !== 'incubating');
  const incub = db.enclosures.find((e) => e.type === 'incubator');
  return `<div class="g-main"><div class="stack">${inc.map((c) => clutchCard(db, c, true)).join('')}${done2.length ? block('Ukončené snůšky', `<div class="list">${done2.map((c) => `<a class="li" href="#/reprodukce/snuska/${c.id}"><img class="coll-img" src="assets/img/kpi/${c.img}.webp" alt=""><span class="li-main"><b class="code">${esc(c.code)}</b><span>${esc(latin(SPECIES[c.species]))} · ${dShort(c.laid)}</span></span><span class="pill ok">vylíhnuto</span></a>`).join('')}</div>`, { icon: 'status-ok', level: 'detail' }) : ''}</div>
  <div class="stack">${incub ? block(incub.name, `<div class="incub"><div class="big-read"><b>${String(incub.readings.t).replace('.', ',')}<em>°C</em></b><span>${incub.readings.rh}<em>% RH</em></span></div><dl class="kv"><dt>Min / max 24 h</dt><dd>${String(incub.readings.tMin).replace('.', ',')} – ${String(incub.readings.tMax).replace('.', ',')} °C</dd><dt>Měřeno</dt><dd>${rel(incub.readings.at)}</dd><dt>Snůšky</dt><dd>${inc.filter((c) => c.incubator === incub.id).length}</dd></dl></div>`, { icon: 'temperature', level: 'secondary', kicker: incub.code }) : ''}
  ${block('Kontroly · 14 dní', streamHTML(contextItems({ from: sod() - 3 * DAY, to: sod() + 14 * DAY, includeHistory: false }).filter((i) => i.type === 'incubation' && i.kind !== 'phase'), { mode: 'compact', showDone: false, empty: 'Žádné kontroly' }), { icon: 'calendar', level: 'secondary' })}</div></div>`;
}
function cycleDetail(id) {
  const db = store.get(), cy = db.cycles.find((c) => c.id === id); if (!cy) return empty('Cyklus nenalezen', '', 'reproduction');
  const f = db.animals.find((x) => x.id === cy.female), m = db.animals.find((x) => x.id === cy.male), sp = SPECIES[cy.species];
  return `<a class="back" href="#/reprodukce/prehled">${gl('arrow-left')}Reprodukce</a>
  <header class="ph"><div class="ph-row">${avatar(f, 56)}<div class="ph-t"><span class="kicker">Reprodukční cyklus · ${cy.season || ''}</span><h1 class="t-page">${esc(cy.name)}</h1><p class="muted"><i class="latin">${esc(latin(sp))}</i> · ${f ? `${sexMark('f')} <a class="code" href="#/zvirata/karta/${f.id}">${esc(f.code)}</a>` : ''} ${m ? `× ${sexMark('m')} <a class="code" href="#/zvirata/karta/${m.id}">${esc(m.code)}</a>` : ''}</p></div><div class="ph-a"><button class="btn" data-act="qr-type" data-type="repro" data-subject="${cy.female}">${gl('plus')}Zapsat událost</button></div></div></header>
  ${block('Stav cyklu', `${three(cy)}${phaseBar(cy)}${cy.goal ? `<p class="muted small sec">${gl('info')} Cíl: ${esc(cy.goal)}</p>` : ''}`, { icon: 'reproduction', level: 'primary' })}
  <div class="g2 sec">${block('Fáze', `<div class="list">${cy.phases.map((p) => `<div class="li"><i class="ph-dot" style="--c:${PHC[p.key] || 'var(--c-repro)'}"></i><span class="li-main"><b>${esc(p.label)}</b><span>${dShort(p.start)}${p.end && p.end !== p.start ? ` – ${dShort(p.end)}` : ''}${p.basis ? ` · ${esc(p.basis)}` : ''}</span></span>${p.observed ? '<span class="pill ok">pozorováno</span>' : p.expected ? '<span class="pill mute">očekávané rozmezí</span>' : (p.end ?? p.start) < Date.now() ? '<span class="pill mute">proběhlo</span>' : ''}</div>`).join('')}</div>`, { icon: 'calendar', level: 'secondary', sub: esc(sp.repro.note) })}
  ${block('Události', `<div class="list">${cy.events.slice().reverse().map((e) => `<div class="li"><span class="pill repro">${dShort(e.t)}</span><span class="li-main"><span>${esc(e.label)}</span></span></div>`).join('')}</div>`, { icon: 'edit', level: 'secondary' })}</div>
  <div class="sec">${block('Úkoly cyklu', streamHTML(contextItems({ from: sod() - 14 * DAY, to: sod() + 60 * DAY, cycle: cy.id, includeHistory: false }), { mode: 'repro', showDone: false, empty: 'Žádné naplánované úkoly' }), { icon: 'tasks', level: 'secondary' })}</div>`;
}
function clutchDetail(id) {
  const db = store.get(), c = db.clutches.find((x) => x.id === id); if (!c) return empty('Snůška nenalezena', '', 'reproduction');
  const checks = db.records.filter((r) => r.type === 'incubation' && r.data?.clutch === c.id).slice(-8).reverse();
  return `<a class="back" href="#/reprodukce/inkubace">${gl('arrow-left')}Inkubace</a>
  <header class="ph"><div class="ph-row"><span class="tile lg">${ico('reproduction')}</span><div class="ph-t"><span class="kicker">Snůška · snesena ${dNum(c.laid)}</span><h1 class="t-page code" style="color:var(--tx)">${esc(c.code)}</h1><p class="muted"><i class="latin">${esc(latin(SPECIES[c.species]))}</i> · ${esc(SPECIES[c.species].repro.note)}</p></div></div></header>
  <div class="g-main"><div class="stack">${clutchCard(db, c, true)}
    ${block('Vejce', `<div class="eggs">${[...Array(c.eggs)].map((_, i) => `<span class="egg ${i < c.fertile ? 'ok' : 'bad'}" title="${i < c.fertile ? 'oplozené' : 'neoplozené / odstraněno'}">${i + 1}</span>`).join('')}</div><p class="muted small">${c.fertile} oplozených · ${c.eggs - c.fertile} neoplozených${c.notes ? ` · ${esc(c.notes)}` : ''}</p>`, { icon: 'reproduction', level: 'secondary' })}</div>
  <div class="stack">${block('Kontroly', `<div class="list">${checks.map((r) => `<div class="li"><span class="pill mute">den ${r.data.day}</span><span class="li-main"><span>${esc(r.data.note || 'Zkontrolováno')}</span></span><em class="muted small">${dShort(r.t)}</em></div>`).join('') || '<p class="muted small">Zatím bez kontrol.</p>'}</div>`, { icon: 'status-ok', level: 'secondary' })}</div></div>`;
}

export function render(r) {
  if (r.sub === 'cyklus') return cycleDetail(r.id);
  if (r.sub === 'snuska') return clutchDetail(r.id);
  const db = store.get();
  return `${pageHead({ mod: 'reprodukce', cur: r.sub, sub: `${db.cycles.filter((c) => c.status === 'active').length} aktivní cykly · ${db.clutches.filter((c) => c.status === 'incubating').length} snůšky v inkubaci`, tabs: [['prehled', 'Přehled'], ['cykly', 'Cykly', db.cycles.length], ['inkubace', 'Inkubace', db.clutches.filter((c) => c.status === 'incubating').length]], actions: `<button class="btn primary" data-act="qr-type" data-type="repro">${gl('plus')}Reprodukční událost</button>` })}${r.sub === 'cykly' ? cycles() : r.sub === 'inkubace' ? incubation() : overview()}`;
}
export function mount(host) { mountWorkspace(host); }
export function onNew() { openQuickRecord({ type: 'repro' }); }

actions({
  'cl-hatch': (el) => { const c = store.get().clutches.find((x) => x.id === el.dataset.id); store.mutate(`Líhnutí zapsáno · ${c.code}`, (d) => { const cl = d.clutches.find((x) => x.id === c.id); d.records.push({ id: `r_h_${Date.now().toString(36)}`, t: Date.now(), type: 'repro', subject: cl.female, data: { label: `Líhnutí — ${cl.code}`, kind: 'hatch' }, source: 'quick', by: 'you' }); cl.hatchedN = (cl.hatchedN || 0) + 1; }); done({ label: `Líhnutí zapsáno · ${c.code}` }); },
});
