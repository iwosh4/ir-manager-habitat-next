// UBIKACE — Přehled · Seznam · Sestavy · Habitat Studio (jen prémiový vstup; studio samotné se nemění) · detail ubikace.
import { esc } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { SPECIES, latin } from '../data/species.js';
import { pageHead, block, avatar, empty } from '../ui/components.js';
import { streamHTML, contextItems } from '../ui/timeline.js';
import { DAY, startOfDay, dShort, rel } from '../core/time.js';

const TYPES = { glass: 'Sklo', rack: 'Box v regálu', tub: 'Box v regálu', incubator: 'Inkubátor', quarantine: 'Karanténa', paludarium: 'Paludárium', mesh: 'Síťové terárium', pvc: 'PVC terárium' };
const occ = (db, e) => db.animals.filter((a) => a.enclosureId === e.id && !['sold', 'deceased'].includes(a.status));
const techWarn = (e) => e.tech.filter((t) => Date.now() - t.installed > (t.lifeDays - 30) * DAY);
function envOk(db, e) { const a = occ(db, e)[0], env = a && SPECIES[a.species].env; if (!env || !e.readings) return { t: true, rh: true, env }; return { t: e.readings.t >= env.day[0] - 1.5 && e.readings.t <= (env.basking?.[1] || env.day[1]) + 1, rh: e.readings.rh >= env.rh[0] - 5 && e.readings.rh <= env.rh[1] + 5, env }; }

export function studioEntry(big = false) {
  const db = store.get();
  return `<section class="studio ${big ? 'big' : ''}"><img src="assets/img/enclosures/${big ? 'room-hero' : 'room-iso'}.webp" alt="Chovná místnost A — render Habitat Studio" loading="lazy">
    <div class="studio-o"><span class="kicker">Habitat Studio</span><h2>3D návrh chovné místnosti</h2><p class="muted">Místnost A · 5,00 × 4,00 × 2,70 m · ${db.enclosures.length} ubikací · ${db.assemblies.length} sestavy. Rozmístění regálů, technika, světlo a obsazenost v prostoru.</p>
    <div class="row wrap"><a class="btn primary lg" href="../index.html" target="_blank" rel="noopener">${gl('cube')}OTEVŘÍT STUDIO</a><span class="muted small">${gl('external')} budoucí adresa <span class="code">/app-manager/habitat-studio/</span></span></div></div></section>`;
}
function encCard(db, e) {
  const o = occ(db, e), w = techWarn(e), ok = envOk(db, e);
  return `<a class="enc ${e.status !== 'ok' || w.length ? 'attn' : ''}" href="#/ubikace/detail/${e.id}"><div class="enc-img"><img src="assets/img/enclosures/${e.img || 'glass-terrarium'}.webp" alt="" loading="lazy"><span class="code">${esc(e.code)}</span></div>
    <div class="enc-b"><b>${esc(e.name)}</b><span class="muted small">${esc(TYPES[e.type] || e.type)} · ${e.dims.w} × ${e.dims.d} × ${e.dims.h} cm</span>
    ${e.readings ? `<div class="enc-r"><span class="${ok.t ? '' : 'warn-t'}">${gl('thermometer')}${String(e.readings.t).replace('.', ',')} °C</span><span class="${ok.rh ? '' : 'warn-t'}">${gl('droplet')}${e.readings.rh} %</span><em>${rel(e.readings.at)}</em></div>` : ''}
    <div class="enc-f"><div class="stackav">${o.slice(0, 4).map((a) => avatar(a, 24)).join('')}</div><span class="muted small">${o.length ? o.map((a) => a.code).slice(0, 2).join(', ') + (o.length > 2 ? ` +${o.length - 2}` : '') : 'volné'}</span><span class="spacer"></span>${w.length ? `<span class="pill warn">${gl('alert')}${esc(w[0].label)}</span>` : ''}</div></div></a>`;
}
function overview() {
  const db = store.get(), E = db.enclosures, used = E.filter((e) => occ(db, e).length).length, attn = E.filter((e) => e.status !== 'ok' || techWarn(e).length);
  return `<div class="kpis k4">${[['Ubikace', E.length, `${db.assemblies.length} sestavy`, 'habitat'], ['Obsazeno', used, `${E.length - used} volné`, 'animals'], ['Vyžaduje pozornost', attn.length, attn.map((e) => e.code).slice(0, 3).join(', ') || 'vše v pořádku', 'status-warning'], ['Technika k výměně', E.reduce((s, e) => s + techWarn(e).length, 0), 'UVB · trysky · čidla', 'lighting']].map(([l, v, s, ic]) => `<div class="kpi plain"><span class="kpi-l">${l}</span><b class="kpi-v">${v}</b><span class="kpi-s">${esc(s)}</span>${ico(ic, 'md kpi-ico')}</div>`).join('')}</div>
  ${studioEntry()}
  ${db.assemblies.map((as) => `<div class="sec-h"><h2 class="t-module">${esc(as.name)}</h2><span class="muted small">${esc(as.habitat || '')} · ${as.members.length} ubikací · ${as.dims.w} × ${as.dims.d} × ${as.dims.h} cm</span></div><div class="g4">${as.members.map((id) => db.enclosures.find((e) => e.id === id)).filter(Boolean).map((e) => encCard(db, e)).join('')}</div>`).join('')}
  <div class="sec-h"><h2 class="t-module">Samostatné ubikace</h2></div><div class="g4">${E.filter((e) => !e.assemblyId).map((e) => encCard(db, e)).join('')}</div>`;
}
function listView() {
  const db = store.get();
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kód</th><th>Název</th><th>Typ</th><th>Rozměry</th><th class="num">Teplota</th><th class="num">Vlhkost</th><th>Obsazení</th><th>Technika</th></tr></thead><tbody>${db.enclosures.map((e) => { const o = occ(db, e), w = techWarn(e), ok = envOk(db, e); return `<tr class="clk" data-act="go" data-href="#/ubikace/detail/${e.id}"><td class="code">${esc(e.code)}</td><td>${esc(e.name)}</td><td class="muted">${esc(TYPES[e.type] || e.type)}</td><td class="mono small">${e.dims.w}×${e.dims.d}×${e.dims.h}</td><td class="num ${ok.t ? '' : 'warn-t'}">${e.readings ? `${String(e.readings.t).replace('.', ',')} °C` : '—'}</td><td class="num ${ok.rh ? '' : 'warn-t'}">${e.readings ? `${e.readings.rh} %` : '—'}</td><td>${o.map((a) => `<span class="code">${esc(a.code)}</span>`).join(', ') || '<span class="muted">volné</span>'}</td><td>${w.length ? `<span class="pill warn">${esc(w[0].label)}</span>` : '<span class="pill ok">OK</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function assemblies() {
  const db = store.get();
  return `<div class="g3">${db.assemblies.map((as) => block(as.name, `<div class="as-grid">${as.members.map((id) => { const e = db.enclosures.find((x) => x.id === id), o = e ? occ(db, e) : []; return e ? `<a class="as-cell ${techWarn(e).length || e.status !== 'ok' ? 'attn' : ''}" href="#/ubikace/detail/${e.id}"><b class="code">${esc(e.code)}</b><span>${o.map((a) => esc(a.code)).join(', ') || 'volné'}</span></a>` : ''; }).join('')}</div><dl class="kv sec"><dt>Typ</dt><dd>${esc(as.habitat || as.kind)}</dd><dt>Rozměry</dt><dd>${as.dims.w} × ${as.dims.d} × ${as.dims.h} cm</dd><dt>Rám</dt><dd>${esc(as.frame || '—')}</dd></dl>`, { icon: 'habitat', level: 'secondary' })).join('')}</div>`;
}
function detail(id) {
  const db = store.get(), e = db.enclosures.find((x) => x.id === id); if (!e) return empty('Ubikace nenalezena', '', 'habitat');
  const o = occ(db, e), ok = envOk(db, e), env = ok.env;
  const bar = (v, [a, b], lo, hi, unit) => { const p = (x) => `${Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100))}%`; return `<div class="envb"><i class="envb-r" style="left:${p(a)};width:calc(${p(b)} - ${p(a)})"></i><i class="envb-v" style="left:${p(v)}"></i><span style="left:${p(a)}">${a}</span><span style="left:${p(b)}">${b} ${unit}</span></div>`; };
  return `<a class="back" href="#/ubikace/prehled">${gl('arrow-left')}Ubikace</a>
  <header class="ph"><div class="ph-row"><img class="ph-img" src="assets/img/enclosures/${e.img || 'glass-terrarium'}.webp" alt=""><div class="ph-t"><span class="kicker">${esc(TYPES[e.type] || e.type)} · ${esc(db.assemblies.find((a) => a.id === e.assemblyId)?.name || 'samostatná')}</span><h1 class="t-page">${esc(e.name)}</h1><p class="muted"><span class="code">${esc(e.code)}</span> · ${e.dims.w} × ${e.dims.d} × ${e.dims.h} cm · ${Math.round((e.dims.w * e.dims.d * e.dims.h) / 1000)} l</p></div><div class="ph-a"><button class="btn" data-act="qr-type" data-type="cleaning" data-subject="${o[0]?.id || ''}">${gl('clean')}Údržba</button></div></div></header>
  <div class="g-main"><div class="stack">
    ${e.readings ? block('Prostředí', `<div class="g2"><div><div class="big-read"><b>${String(e.readings.t).replace('.', ',')}<em>°C</em></b><span class="muted small">min ${String(e.readings.tMin ?? '—').replace('.', ',')} · max ${String(e.readings.tMax ?? '—').replace('.', ',')}</span></div>${env ? bar(e.readings.t, env.day, 14, 38, '°C') : ''}</div><div><div class="big-read"><b>${e.readings.rh}<em>% RH</em></b><span class="muted small">měřeno ${rel(e.readings.at)}</span></div>${env ? bar(e.readings.rh, env.rh, 20, 100, '%') : ''}</div></div>${env ? `<p class="muted small">Rozmezí podle druhu <i class="latin">${esc(latin(SPECIES[o[0].species]))}</i>.</p>` : ''}`, { icon: 'temperature', level: 'primary' }) : ''}
    ${block('Plán údržby', streamHTML(contextItems({ from: startOfDay(Date.now()) - 7 * DAY, to: startOfDay(Date.now()) + 14 * DAY, enclosure: e.id, includeHistory: false }), { mode: 'animal', showDone: false, empty: 'Nic naplánováno' }), { icon: 'calendar', level: 'secondary' })}</div>
  <div class="stack">${block('Obyvatelé', o.length ? `<div class="list">${o.map((a) => `<a class="li" href="#/zvirata/karta/${a.id}">${avatar(a, 38)}<span class="li-main"><b class="latin">${esc(latin(SPECIES[a.species]))}</b><span><span class="code">${esc(a.code)}</span>${a.name ? ` · ${esc(a.name)}` : ''}${a.kind === 'group' ? ` · ×${a.count}` : ''}</span></span></a>`).join('')}</div>` : '<p class="muted small">Volná ubikace.</p>', { icon: 'animals', level: 'secondary' })}
    ${block('Technika', `<div class="list">${e.tech.map((t) => { const age = (Date.now() - t.installed) / DAY, p = Math.min(1, age / t.lifeDays); return `<div class="li"><span class="li-main"><b>${esc(t.label)}</b><span>instalováno ${dShort(t.installed)} · ${Math.round(age)} z ${t.lifeDays} dní</span><span class="life"><i class="${p > .92 ? 'bad' : p > .8 ? 'warn' : ''}" style="transform:scaleX(${p.toFixed(3)})"></i></span></span></div>`; }).join('')}</div>`, { icon: 'lighting', level: 'detail' })}</div></div>`;
}

export function render(r) {
  if (r.sub === 'detail') return detail(r.id);
  const db = store.get();
  const head = pageHead({ mod: 'ubikace', cur: r.sub, sub: `${db.enclosures.length} ubikací · ${db.assemblies.length} sestavy · Chovná místnost A`, tabs: [['prehled', 'Přehled'], ['seznam', 'Seznam', db.enclosures.length], ['sestavy', 'Sestavy'], ['studio', 'Habitat Studio']] });
  if (r.sub === 'studio') return `${head}${studioEntry(true)}<div class="g3 sec">${[['Rozmístění v prostoru', 'Regály, stěny a samostatná terária na půdorysu místnosti 1 : 1.', 'layout'], ['Technika a světlo', 'UVB zóny, topení a rosení vizuálně v každé ubikaci.', 'lighting'], ['Obsazenost', 'Která ubikace je volná, kde je karanténa, co potřebuje údržbu.', 'animals']].map(([t, d, ic]) => block(t, `<p class="muted small">${d}</p>`, { icon: ic, level: 'detail' })).join('')}</div>`;
  return `${head}${r.sub === 'seznam' ? listView() : r.sub === 'sestavy' ? assemblies() : overview()}`;
}
