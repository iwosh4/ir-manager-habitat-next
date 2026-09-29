// ZVÍŘATA — Mřížka / Tabulka / Skupiny / Karanténa / Archiv + KARTA ZVÍŘETE.
// Karta: PŘEHLED / PÉČE / CHOV & REPRODUKCE / ZDRAVÍ / HISTORIE / DETAILY · pás akcí NAKRMIT · VODA/ROSENÍ · VÁHA · ZDRAVÍ · REPRODUKCE · VÍCE.
import { esc, actions } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { panel, menu, close as closeOv, toast } from '../core/overlay.js';
import { SPECIES, SUPPLEMENTS, latin, imgFor, macroFor } from '../data/species.js';
import { TYPE, rotationState, lastWeight, nextOcc, lastRecord } from '../engine/ops.js';
import * as A from '../engine/actions.js';
import { pageHead, block, avatar, sexMark, sexText, statusPill, breedPill, spark, empty, money, rangeBar } from '../ui/components.js';
import { streamHTML, contextItems, typeTile, finish } from '../ui/timeline.js';
import { done } from '../ui/feedback.js';
import { openQuickRecord } from '../ui/quickrecord.js';
import { editRotation } from './ukoly.js';
import { DAY, startOfDay, hm, dShort, dNum, rel, ageText, toDateInput } from '../core/time.js';

const F = { q: '', sp: '', st: '', sort: 'code', dir: 1, sec: 'prehled' };
const ORIGIN = { 'captive-bred': 'Odchov v zajetí (CB)', 'own-breeding': 'Vlastní odchov', 'wild-caught': 'Import (WC)', 'captive-hatched': 'Vylíhnuto v zajetí (CH)' };
const alive = (a) => !['sold', 'deceased'].includes(a.status);
const encOf = (db, a) => db.enclosures.find((e) => e.id === a.enclosureId);

function list(r) {
  const db = store.get(), q = F.q.toLowerCase();
  let L = db.animals.filter((a) => (r.sub === 'archiv' ? !alive(a) : alive(a)));
  if (r.sub === 'skupiny') L = L.filter((a) => a.kind === 'group');
  if (r.sub === 'karantena') L = L.filter((a) => a.status === 'quarantine' || db.health.some((h) => h.animal === a.id && !h.resolved) || db.meds.some((m) => m.animal === a.id && m.done < m.count));
  const sp = F.sp || r.q.get('sp') || '';
  if (sp) L = L.filter((a) => a.species === sp);
  if (F.st) L = L.filter((a) => a.status === F.st);
  if (q) L = L.filter((a) => `${a.code} ${a.name} ${latin(SPECIES[a.species])} ${SPECIES[a.species].cz} ${a.morph || ''} ${encOf(db, a)?.code || ''}`.toLowerCase().includes(q));
  const key = { code: (a) => a.code, sp: (a) => latin(SPECIES[a.species]), age: (a) => -a.born, w: (a) => lastWeight(db, a.id) || 0, enc: (a) => encOf(db, a)?.code || '', st: (a) => a.status };
  L.sort((a, b) => { const x = key[F.sort](a), y = key[F.sort](b); return (x > y ? 1 : x < y ? -1 : 0) * F.dir; });
  return { L, sp };
}
function toolbar(r, sp) {
  const db = store.get(), species = [...new Set(db.animals.filter(alive).map((a) => a.species))];
  const view = r.sub === 'tabulka' ? 'tabulka' : 'mrizka';
  return `<div class="pl-bar">
    <label class="searchbox">${gl('search')}<input type="search" id="an-q" placeholder="Kód, jméno, druh, morfa, ubikace…" value="${esc(F.q)}" data-input="an-q" aria-label="Hledat zvíře"></label>
    <select class="select" style="width:auto" data-change="an-sp" aria-label="Druh"><option value="">Všechny druhy</option>${species.map((k) => `<option value="${k}" ${sp === k ? 'selected' : ''}>${esc(latin(SPECIES[k]))}</option>`).join('')}</select>
    <select class="select" style="width:auto" data-change="an-st" aria-label="Stav"><option value="">Všechny stavy</option>${[['active', 'Aktivní'], ['for-sale', 'Na prodej'], ['reserved', 'Rezervováno'], ['quarantine', 'Karanténa']].map(([k, l]) => `<option value="${k}" ${F.st === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <span class="spacer"></span>
    ${['mrizka', 'tabulka'].includes(r.sub) ? `<div class="seg" aria-label="Zobrazení"><a class="${view === 'mrizka' ? 'on' : ''}" href="#/zvirata/mrizka">${gl('grid')}Mřížka</a><a class="${view === 'tabulka' ? 'on' : ''}" href="#/zvirata/tabulka">${gl('list')}Tabulka</a></div>` : ''}
  </div>`;
}
function nextCare(db, a) { const o = nextOcc(db, a.id); return o ? { o, T: TYPE[o.plan.type] } : null; }
function card(db, a) {
  const e = encOf(db, a), sp = SPECIES[a.species], nc = nextCare(db, a), w = lastWeight(db, a.id);
  const alert = db.health.some((h) => h.animal === a.id && !h.resolved);
  return `<article class="an-card ${a.status === 'quarantine' ? 'q' : ''}">
    <a class="an-img" href="#/zvirata/karta/${a.id}" tabindex="-1"><img src="${imgFor(a)}" alt="${esc(latin(sp))}" loading="lazy">${a.kind === 'group' ? `<span class="an-cnt">${gl('animals')}×${a.count}</span>` : ''}${alert ? `<span class="an-alert" title="Otevřený zdravotní záznam">${ico('health', 'xs')}</span>` : ''}${db.favorites.includes(a.id) ? `<span class="an-fav">${gl('star-fill')}</span>` : ''}</a>
    <div class="an-b">
      <a class="an-t" href="#/zvirata/karta/${a.id}"><b class="latin">${esc(latin(sp))}</b><span class="cz">${esc(sp.cz)}</span></a>
      <div class="an-id"><span class="code">${esc(a.code)}</span>${a.name ? `<b>${esc(a.name)}</b>` : ''}<span class="spacer"></span>${sexText(a)}</div>
      <div class="an-m"><span>${gl('clock')}${ageText(a.born)}</span>${w && a.kind !== 'group' ? `<span>${gl('weight')}${w} g</span>` : ''}${e ? `<span>${gl('habitat')}${esc(e.code)}</span>` : ''}</div>
      <div class="an-f">${a.status !== 'active' ? statusPill(a.status) : breedPill(a.breeding) || '<span class="pill mute">v klidu</span>'}${nc ? `<span class="an-next ${nc.o.t < Date.now() ? 'od' : ''}">${ico(nc.T.icon, 'xs')}${esc(nc.T.label)} ${rel(nc.o.t)}</span>` : ''}</div>
    </div>
    <div class="an-hov"><a class="btn sm" href="#/zvirata/karta/${a.id}">${gl('eye')}OTEVŘÍT</a><button class="btn sm primary" data-act="quick-record" data-subject="${a.id}">${gl('plus')}RYCHLÝ ZÁZNAM</button></div>
  </article>`;
}
function grid(L) { const db = store.get(); return L.length ? `<div class="an-grid">${L.map((a) => card(db, a)).join('')}</div>` : empty('Žádné zvíře neodpovídá', 'Zkuste upravit filtr.', 'animals'); }
function table(L) {
  const db = store.get(), th = (k, l, c = '') => `<th class="${c}"><button class="th-s ${F.sort === k ? 'on' : ''}" data-act="an-sort" data-v="${k}">${l}${F.sort === k ? gl(F.dir > 0 ? 'chevron-down' : 'chevron-up') : ''}</button></th>`;
  return `<div class="tbl-wrap"><table class="tbl an-tbl"><thead><tr>${th('code', 'Kód')}${th('sp', 'Druh')}<th>Pohlaví</th>${th('age', 'Věk')}${th('w', 'Hmotnost', 'num')}${th('enc', 'Ubikace')}${th('st', 'Stav')}<th>Další péče</th><th></th></tr></thead>
  <tbody>${L.map((a) => { const e = encOf(db, a), nc = nextCare(db, a), w = lastWeight(db, a.id); return `<tr class="clk" data-act="go" data-href="#/zvirata/karta/${a.id}"><td><div class="row">${avatar(a, 34)}<span class="spl"><span class="code">${esc(a.code)}</span><span class="small">${esc(a.name || (a.kind === 'group' ? `skupina ×${a.count}` : ''))}</span></span></div></td><td><span class="spl"><b class="latin">${esc(latin(SPECIES[a.species]))}</b><span class="cz">${esc(a.morph || SPECIES[a.species].cz)}</span></span></td><td>${sexText(a)}</td><td>${ageText(a.born)}</td><td class="num">${w && a.kind !== 'group' ? `${w} g` : '—'}</td><td><span class="code">${esc(e?.code || '—')}</span></td><td>${a.status !== 'active' ? statusPill(a.status) : breedPill(a.breeding) || '<span class="pill mute">aktivní</span>'}</td><td>${nc ? `<span class="an-next ${nc.o.t < Date.now() ? 'od' : ''}">${ico(nc.T.icon, 'xs')}${esc(nc.T.label)} · ${rel(nc.o.t)}</span>` : '—'}</td><td class="num"><button class="icon-btn sm" data-act="quick-record" data-subject="${a.id}" title="Rychlý záznam" aria-label="Rychlý záznam ${esc(a.code)}">${gl('plus')}</button></td></tr>`; }).join('')}</tbody></table></div>`;
}

// ================================================================ KARTA ZVÍŘETE
const SECS = [['prehled', 'Přehled'], ['pece', 'Péče'], ['chov', 'Chov & reprodukce'], ['zdravi', 'Zdraví'], ['historie', 'Historie'], ['detaily', 'Detaily']];
function profile(id, r) {
  const db = store.get(), a = db.animals.find((x) => x.id === id);
  if (!a) return empty('Zvíře nenalezeno', '', 'animals', '<a class="btn" href="#/zvirata/mrizka">Zpět na zvířata</a>');
  const sp = SPECIES[a.species], e = encOf(db, a), sec = r.q.get('sekce') || F.sec;
  const feed = db.plans.find((p) => p.subject === a.id && p.type === 'feeding' && p.active);
  const fo = nextOcc(db, a.id, 'feeding'), wet = db.plans.find((p) => p.subject === a.id && (p.type === 'misting' || p.type === 'water'));
  const w = lastWeight(db, a.id), hist = db.records.filter((x) => x.subject === a.id && x.type === 'weight').slice(-12).map((x) => x.data.g);
  const cy = db.cycles.find((c) => c.status === 'active' && (c.female === a.id || c.male === a.id));
  const openH = db.health.filter((h) => h.animal === a.id && !h.resolved);
  const feedLbl = fo && fo.t < Date.now() + 36 * 3600e3 ? `NAKRMIT${fo.t < Date.now() ? ' · po termínu' : ` · ${hm(fo.t)}`}` : 'NAKRMIT';
  const head = `<a class="back" href="#/zvirata/mrizka">${gl('arrow-left')}Zvířata</a>
  <section class="pf-hero">
    <div class="pf-img"><img src="${imgFor(a)}" alt="${esc(latin(sp))}"><button class="pf-fav ${db.favorites.includes(a.id) ? 'on' : ''}" data-act="an-fav" data-id="${a.id}" aria-label="Oblíbené" aria-pressed="${db.favorites.includes(a.id)}">${gl(db.favorites.includes(a.id) ? 'star-fill' : 'star')}</button></div>
    <div class="pf-main">
      <div class="pf-tags">${a.status !== 'active' ? statusPill(a.status) : ''}${breedPill(a.breeding)}${sp.venomous ? '<span class="pill bad">jedovatý</span>' : ''}${openH.length ? `<span class="pill warn">${gl('health')}zdraví: ${openH.length}</span>` : ''}</div>
      <h1 class="pf-latin"><i>${esc(sp.latin)}</i>${sp.ssp ? ` <span>${esc(sp.ssp)}</span>` : ''}</h1>
      <p class="pf-sub"><span class="code">${esc(a.code)}</span>${a.name ? ` · <b>${esc(a.name)}</b>` : ''} · ${esc(sp.cz)}${a.morph ? ` · ${esc(a.morph)}` : ''}</p>
      <div class="pf-facts">
        <div><span>Pohlaví</span><b>${a.kind === 'group' ? sexText(a) : `${sexMark(a.sex)} ${a.sex === 'm' ? 'samec' : a.sex === 'f' ? 'samice' : 'neurčeno'}`}</b></div>
        <div><span>Věk</span><b>${ageText(a.born)}</b></div>
        <div><span>${a.kind === 'group' ? 'Počet' : 'Hmotnost'}</span><b>${a.kind === 'group' ? `${a.count} zvířat` : w ? `${w} g` : '—'}</b></div>
        <div><span>Ubikace</span><b>${e ? `<a href="#/ubikace/detail/${e.id}" class="code">${esc(e.code)}</a>` : '—'}</b></div>
        <div><span>Krmení</span><b>${fo ? rel(fo.t) : '—'}</b></div>
      </div>
    </div>
  </section>
  <nav class="pf-actions" aria-label="Akce se zvířetem">
    <button class="pa primary" data-act="pf-feed" data-id="${a.id}">${ico('feeding')}<span><b>${feedLbl}</b><em>${feed ? `${esc(feed.feeder)} · ${esc(feed.qty)}` : 'mimo plán'}</em></span></button>
    <button class="pa" data-act="qr-type" data-type="${wet?.type === 'misting' ? 'misting' : 'water'}" data-subject="${a.id}">${ico(wet?.type === 'misting' ? 'mist' : 'water')}<span><b>VODA / ROSENÍ</b></span></button>
    <button class="pa" data-act="qr-type" data-type="weight" data-subject="${a.id}">${ico('weight')}<span><b>VÁHA</b></span></button>
    <button class="pa" data-act="qr-type" data-type="health" data-subject="${a.id}">${ico('health')}<span><b>ZDRAVÍ</b></span></button>
    <button class="pa" data-act="qr-type" data-type="repro" data-subject="${a.id}">${ico('reproduction')}<span><b>REPRODUKCE</b></span></button>
    <button class="pa" data-act="pf-more" data-id="${a.id}">${gl('more')}<span><b>VÍCE</b></span></button>
  </nav>
  <nav class="tabs pf-tabs">${SECS.map(([k, l]) => `<a class="tab ${sec === k ? 'on' : ''}" href="#/zvirata/karta/${a.id}?sekce=${k}" data-act="pf-sec" data-v="${k}" data-keep-href="1">${l}</a>`).join('')}</nav>`;
  const rot = feed && feed.rotation?.length > 1 ? rotationState(db, feed) : null;
  const rotBlk = rot ? block('Vitaminová rotace', `<div class="rot-card"><div class="rc-seq">${rot.rot.map((s, i) => `<span class="${i === rot.index ? 'next' : i === (rot.index - 1 + rot.rot.length) % rot.rot.length ? 'last' : ''}" style="--c:${SUPPLEMENTS[s]?.color}">${esc(s)}</span>`).join('')}</div>
      <div class="kv3"><div><span>POSLEDNĚ</span><b>${esc(rot.last || '—')}</b></div><div class="hl"><span>DALŠÍ</span><b>${esc(rot.next)}</b></div><div><span>Potom</span><b>${esc(rot.after)}</b></div></div></div>`, { icon: 'supplement', level: 'secondary', actions: `<button class="btn sm tertiary" data-act="rot-edit" data-id="${feed.id}">${gl('edit')}UPRAVIT</button>` }) : '';
  const timeline = (days, mode = 'animal') => streamHTML(contextItems({ from: startOfDay(Date.now()) - 2 * DAY, to: startOfDay(Date.now()) + days * DAY, subject: a.id, includeHistory: false }), { mode, showDone: false, empty: 'Nic naplánováno' });
  const weightBlk = a.kind === 'group' ? '' : block('Hmotnost', hist.length > 1 ? `<div class="wt"><b class="value">${w} g</b><span class="${hist[hist.length - 1] >= hist[hist.length - 2] ? 'ok-t' : 'bad-t'} small">${hist[hist.length - 1] >= hist[hist.length - 2] ? '▲' : '▼'} ${Math.abs(hist[hist.length - 1] - hist[hist.length - 2])} g</span></div>${spark(hist, { w: 320, h: 70, color: 'var(--am)' })}` : '<p class="muted small">Zatím málo vážení.</p>', { icon: 'weight', level: 'detail', actions: `<button class="btn sm tertiary" data-act="qr-type" data-type="weight" data-subject="${a.id}">${gl('plus')}Vážit</button>` });
  const habitat = sp.env ? block('Prostředí', `<dl class="kv"><dt>Den</dt><dd>${sp.env.day[0]}–${sp.env.day[1]} °C</dd>${sp.env.basking ? `<dt>Vyhřívací místo</dt><dd>${sp.env.basking[0]}–${sp.env.basking[1]} °C</dd>` : ''}<dt>Noc</dt><dd>${sp.env.night[0]}–${sp.env.night[1]} °C</dd><dt>Vlhkost</dt><dd>${sp.env.rh[0]}–${sp.env.rh[1]} %</dd>${sp.env.uvb ? `<dt>UVB</dt><dd>${esc(sp.env.uvb)}</dd>` : ''}${e ? `<dt>Aktuálně ${esc(e.code)}</dt><dd>${String(e.readings.t).replace('.', ',')} °C · ${e.readings.rh} %</dd>` : ''}</dl>`, { icon: 'temperature', level: 'detail' }) : '';
  let body = '';
  if (sec === 'prehled') body = `<div class="g-main"><div class="stack">${block('Další péče', timeline(7), { icon: 'tasks', level: 'primary', actions: `<a class="btn sm tertiary" href="#/ukoly/planovac">Plánovač</a>` })}${a.description ? block('Poznámka', `<p class="muted">${esc(a.description)}</p>`, { icon: 'edit', level: 'detail' }) : ''}</div><div class="stack">${rotBlk}${weightBlk}${cy ? cycleMini(db, cy) : ''}${habitat}</div></div>`;
  if (sec === 'pece') body = `<div class="g-main"><div class="stack">${block('Plán péče', `<div class="list">${db.plans.filter((p) => p.subject === a.id && p.active).map((p) => `<div class="li">${typeTile(p.type, 'sm')}<span class="li-main"><b>${esc(TYPE[p.type].label)}${p.feeder ? ` · ${esc(p.feeder)}` : ''}</b><span>${esc(p.protocol || '')} · ${p.times.map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`).join(', ')}${p.auto ? ` · automaticky (${esc(p.auto)})` : ''}</span></span><em class="muted small">každé ${p.every === 1 ? 'den' : `${p.every} dny`}</em></div>`).join('') || '<p class="muted">Bez plánu péče.</p>'}</div>`, { icon: 'care', level: 'primary' })}${block('Naplánováno · 14 dní', timeline(14), { icon: 'calendar', level: 'secondary' })}</div><div class="stack">${rotBlk}${weightBlk}${habitat}</div></div>`;
  if (sec === 'chov') body = `<div class="g2">${cy ? cycleMini(db, cy, true) : block('Reprodukce', `<p class="muted">${a.kind === 'group' ? 'Skupina' : 'Zvíře'} nemá aktivní cyklus.</p><button class="btn sm" data-act="qr-type" data-type="repro" data-subject="${a.id}">${gl('plus')}Zapsat událost</button>`, { icon: 'reproduction', level: 'secondary' })}
    ${block('Genetika & původ', `<dl class="kv"><dt>Morfa</dt><dd>${esc(a.morph || '—')}</dd><dt>Geny</dt><dd>${a.genetics?.length ? a.genetics.map((g) => `<span class="pill repro">${esc(g.zyg === 'het' ? `het ${g.gene}` : g.gene)}</span>`).join(' ') : '—'}</dd><dt>Původ</dt><dd>${esc(ORIGIN[a.origin?.type] || a.origin?.type || '—')}${a.origin?.gen ? ` · ${esc(a.origin.gen)}` : ''}</dd><dt>Chovatel</dt><dd>${esc(db.contacts.find((c) => c.id === a.origin?.from)?.name || '—')}</dd></dl>`, { icon: 'groups', level: 'secondary' })}
    ${block('Snůšky', `<div class="list">${db.clutches.filter((c) => c.female === a.id || c.male === a.id).map((c) => `<a class="li" href="#/reprodukce/snuska/${c.id}"><img class="coll-img" src="assets/img/kpi/${c.img}.webp" alt=""><span class="li-main"><b class="code">${esc(c.code)}</b><span>${c.fertile}/${c.eggs} vajec · ${dShort(c.laid)} · ${c.status === 'hatched' ? 'vylíhnuto' : 'inkubace'}</span></span></a>`).join('') || '<p class="muted small">Žádné snůšky.</p>'}</div>`, { icon: 'reproduction', level: 'detail' })}</div>`;
  if (sec === 'zdravi') body = healthSec(db, a);
  if (sec === 'historie') { const recs = db.records.filter((x) => x.subject === a.id).slice(-40).reverse(); body = block('Historie záznamů', `<div class="list">${recs.map((x) => `<div class="li">${typeTile(x.type, 'sm')}<span class="li-main"><b>${esc(TYPE[x.type]?.label || x.type)}${x.data?.refused ? ' — odmítnuto' : ''}</b><span>${esc([x.data?.feeder, x.data?.supplement, x.data?.g ? `${x.data.g} g` : '', x.data?.label, x.data?.title, x.data?.note].filter(Boolean).join(' · ') || (x.source === 'automation' ? 'automaticky' : '—'))}</span></span><em class="muted small">${dShort(x.t)} ${hm(x.t)}</em><button class="icon-btn sm" data-act="edit-record" data-id="${x.id}" aria-label="Upravit záznam">${gl('edit')}</button></div>`).join('')}</div>`, { icon: 'clock-action', level: 'secondary', sub: `${db.records.filter((x) => x.subject === a.id).length} záznamů` }); }
  if (sec === 'detaily') body = `<div class="g2">${block('Identifikace', `<dl class="kv"><dt>Kód</dt><dd class="code">${esc(a.code)}</dd><dt>Jméno</dt><dd>${esc(a.name || '—')}</dd><dt>Druh</dt><dd><i class="latin">${esc(latin(sp))}</i></dd><dt>Česky</dt><dd>${esc(sp.cz)}</dd><dt>Čeleď</dt><dd>${esc(sp.family)}</dd><dt>Datum líhnutí</dt><dd>${dNum(a.born)}</dd><dt>Ubikace</dt><dd>${esc(e ? `${e.code} · ${e.name}` : '—')}</dd></dl>`, { icon: 'qr-info', level: 'secondary', actions: `<button class="btn sm tertiary" data-act="an-edit" data-id="${a.id}">${gl('edit')}Upravit</button>` })}
    ${block('Dokumenty', `<div class="list">${db.documents.filter((d) => d.animal === a.id).map((d) => `<div class="li">${gl('file')}<span class="li-main"><b>${esc(d.name)}</b><span>${esc(d.kind)} · ${dShort(d.date)} · ${esc(d.size)}</span></span></div>`).join('') || '<p class="muted small">Bez dokumentů.</p>'}</div>`, { icon: 'view', level: 'detail' })}
    ${a.kind === 'group' ? block('Členové skupiny', `<div class="list">${a.members.map((m) => `<div class="li"><span class="code">${esc(m.code)}</span><span class="li-main"><span>${esc(m.note || '—')}</span></span>${sexMark(m.sex)}</div>`).join('')}</div>`, { icon: 'groups', level: 'detail' }) : ''}</div>`;
  return head + `<div class="pf-body">${body}</div>`;
}
function cycleMini(db, cy, big = false) {
  const n = Date.now(), cur = [...cy.phases].reverse().find((p) => p.start <= n) || cy.phases[0], nxt = cy.phases.find((p) => p.start > n);
  return block(cy.name, `<div class="cyc3"><div><span>AKTUÁLNÍ FÁZE</span><b>${esc(cur.label)}</b></div><div class="hl"><span>DALŠÍ AKCE</span><b>${esc(cy.next?.label || '—')}</b>${cy.next ? `<em>${rel(cy.next.due)}</em>` : ''}</div><div><span>OČEKÁVANÉ OKNO</span><b>${nxt ? `${dShort(nxt.start)} – ${dShort(nxt.end ?? nxt.start)}` : '—'}</b>${nxt ? `<em>${esc(nxt.label)}${nxt.basis ? ` · ${esc(nxt.basis)}` : ''}</em>` : ''}</div></div>${big ? `<div class="list sec">${cy.events.slice().reverse().slice(0, 5).map((e) => `<div class="li"><span class="pill repro">${dShort(e.t)}</span><span class="li-main"><span>${esc(e.label)}</span></span></div>`).join('')}</div>` : ''}`, { icon: 'reproduction', level: 'secondary', actions: `<a class="btn sm tertiary" href="#/reprodukce/cyklus/${cy.id}">Cyklus ${gl('arrow-right')}</a>` });
}
function healthSec(db, a) {
  const hs = db.health.filter((h) => h.animal === a.id), meds = db.meds.filter((m) => m.animal === a.id);
  return `<div class="g-main"><div class="stack">${block('Zdravotní záznamy', hs.length ? `<div class="list">${hs.map((h) => `<div class="li"><span class="sev s-${h.severity}"></span><span class="li-main"><b>${esc(h.title)}</b><span>${dShort(h.t)} · ${esc(h.notes || '')}</span></span>${h.resolved ? '<span class="pill ok">vyřešeno</span>' : `<button class="btn sm tertiary" data-act="h-resolve" data-id="${h.id}">${gl('check')}Vyřešeno</button>`}</div>`).join('')}</div>` : empty('Bez zdravotních záznamů', '', 'status-ok'), { icon: 'health', level: 'primary', actions: `<button class="btn sm" data-act="qr-type" data-type="health" data-subject="${a.id}">${gl('plus')}Záznam</button>` })}</div>
    <div class="stack">${block('Léčba', meds.length ? `<div class="list">${meds.map((m) => `<div class="li"><span class="li-main"><b>${esc(m.drug)}</b><span>${esc(m.dose)} · ${esc(m.route)} · ${m.done}/${m.count} dávek</span></span></div>`).join('')}</div>` : '<p class="muted small">Žádná léčba.</p>', { icon: 'first-aid', level: 'secondary' })}</div></div>`;
}

// ================================================================ PŘIDAT ZVÍŘE
export function openAddAnimal() {
  const db = store.get();
  const body = `<div class="stack"><div class="fields two"><label class="field"><span>Druh</span><select class="select" data-f="species">${Object.entries(SPECIES).map(([k, s]) => `<option value="${k}">${esc(latin(s))} · ${esc(s.cz)}</option>`).join('')}</select></label><label class="field"><span>Kód</span><input class="input" data-f="code" placeholder="např. PR-06"></label></div>
    <div class="fields three"><label class="field"><span>Jméno</span><input class="input" data-f="name" placeholder="volitelné"></label><label class="field"><span>Pohlaví</span><select class="select" data-f="sex"><option value="u">neurčeno</option><option value="m">samec</option><option value="f">samice</option></select></label><label class="field"><span>Datum líhnutí</span><input class="input" type="date" data-f="born" value="${toDateInput(Date.now() - 120 * DAY)}"></label></div>
    <label class="field"><span>Ubikace</span><select class="select" data-f="enc"><option value="">— bez ubikace —</option>${db.enclosures.map((e) => `<option value="${e.id}">${esc(e.code)} · ${esc(e.name)}</option>`).join('')}</select></label>
    <p class="muted small">Plán péče se vytvoří podle druhu (krmení, rotace suplementů) — upravíte ho později na kartě.</p></div>`;
  const h = panel({ title: 'Přidat zvíře', icon: 'plus', width: 520, body, footer: `<span class="spacer"></span><button class="btn tertiary" data-close>Zrušit</button><button class="btn primary" data-save>${gl('check')}Přidat zvíře</button>` });
  const v = (k) => h.el.querySelector(`[data-f=${k}]`).value;
  h.el.querySelector('[data-save]').onclick = () => {
    const code = v('code').trim() || `NEW-${Math.floor(Math.random() * 90 + 10)}`, id = `a_${Date.now().toString(36)}`, sp = SPECIES[v('species')];
    store.mutate(`Přidáno zvíře ${code}`, (d) => {
      d.animals.push({ id, code, name: v('name'), species: v('species'), sex: v('sex'), born: new Date(v('born')).getTime() || Date.now(), enclosureId: v('enc') || null, status: 'active', kind: 'individual', breeding: 'resting', tags: [], genetics: [], favorite: false, notes: '' });
      d.plans.push({ id: `p_feed_${id}`, type: 'feeding', subject: id, active: true, origin: 'care-plan', every: sp.feeding.every, times: [sp.feeding.time], anchor: startOfDay(Date.now()), feeder: sp.feeding.feeder, qty: sp.feeding.qty, rotation: sp.feeding.rotation, protocol: 'Výchozí plán podle druhu' });
      d.recent.animals.unshift(id);
    });
    closeOv(h); location.hash = `#/zvirata/karta/${id}`; done({ label: `Přidáno: ${code}` });
  };
}

export function render(r) {
  if (r.sub === 'karta') return profile(r.id, r);
  const { L, sp } = list(r);
  const db = store.get(), heads = L.reduce((s, a) => s + (a.kind === 'group' ? a.count : 1), 0);
  const view = r.sub === 'tabulka' ? table(L) : grid(L);
  return `${pageHead({ mod: 'zvirata', cur: r.sub, sub: `${L.length} záznamů · ${heads} zvířat · ${new Set(L.map((a) => a.species)).size} druhů`, tabs: [['mrizka', 'Mřížka'], ['tabulka', 'Tabulka'], ['skupiny', 'Skupiny', db.animals.filter((a) => a.kind === 'group' && alive(a)).length], ['karantena', 'Karanténa / léčba'], ['archiv', 'Archiv']], actions: `<button class="btn primary" data-act="an-add">${gl('plus')}Přidat zvíře</button>` })}${toolbar(r, sp)}${view}`;
}
export function onEnter(r) { if (r.sub === 'karta' && r.id) { F.sec = 'prehled'; store.mutate(null, (d) => { d.recent.animals = [r.id, ...d.recent.animals.filter((x) => x !== r.id)].slice(0, 12); }, { silent: true }); } }
export function onNew(r) { if (r.sub === 'karta') openQuickRecord({ subjects: [r.id] }); else openAddAnimal(); }

actions({
  'an-q': (el) => { F.q = el.value; store.emit('change'); },
  'an-sp': (el) => { F.sp = el.value; if (location.hash.includes('?sp=')) history.replaceState(null, '', location.hash.split('?')[0]); store.emit('change'); },
  'an-st': (el) => { F.st = el.value; store.emit('change'); },
  'an-sort': (el) => { const k = el.dataset.v; F.dir = F.sort === k ? -F.dir : 1; F.sort = k; store.emit('change'); },
  'an-add': () => openAddAnimal(),
  'an-edit': () => toast('Úprava identifikace je v náhledu jen ukázková.', { kind: 'info', ms: 2600 }),
  'an-fav': (el) => store.mutate(null, (d) => { const i = d.favorites.indexOf(el.dataset.id); if (i >= 0) d.favorites.splice(i, 1); else d.favorites.push(el.dataset.id); }),
  'pf-sec': (el) => { F.sec = el.dataset.v; history.replaceState(null, '', el.getAttribute('href')); store.emit('change'); },
  // NAKRMIT = jedno klepnutí pro naplánované krmení (včetně rotace suplementu a odpisu ze skladu)
  'pf-feed': (el) => {
    const db = store.get(), o = nextOcc(db, el.dataset.id, 'feeding');
    if (o && o.t < Date.now() + 36 * 3600e3) { el.classList.add('is-done'); setTimeout(() => done(A.complete([o.id], { source: 'profile' }), { edit: (res) => res.records?.[0] && import('../ui/quickrecord.js').then((m) => m.editRecordPanel(res.records[0].id)) }), 240); }
    else openQuickRecord({ type: 'feeding', subjects: [el.dataset.id] });
  },
  'pf-more': (el) => { const id = el.dataset.id; menu(el, [['cleaning', 'Údržba'], ['shed', 'Svlek'], ['task', 'Úkol k tomuto zvířeti']].map(([t, l]) => ({ icon: TYPE[t].icon === 'shedding' ? 'shed' : TYPE[t].icon, label: l, run: () => openQuickRecord({ type: t, subjects: [id] }) })).concat([{ sep: true }, { icon: 'star', label: 'Oblíbené', run: () => store.mutate(null, (d) => { const i = d.favorites.indexOf(id); if (i >= 0) d.favorites.splice(i, 1); else d.favorites.push(id); }) }, { icon: 'printer', label: 'Tisk štítku', run: () => toast('Tisk štítku — v náhledu jen ukázka.', { kind: 'info' }) }]), { title: 'Další akce' }); },
  'h-resolve': (el) => store.mutate('Zdravotní záznam uzavřen', (d) => { const h = d.health.find((x) => x.id === el.dataset.id); if (h) h.resolved = true; }),
});
