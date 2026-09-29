// ZDRAVÍ — klidný modul: rychlý záznam nahoře, pokročilé možnosti až na vyžádání (progresivní odkrývání).
import { esc, actions } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { SPECIES, latin } from '../data/species.js';
import * as A from '../engine/actions.js';
import { pageHead, block, avatar, empty, ring } from '../ui/components.js';
import { streamHTML, contextItems } from '../ui/timeline.js';
import { done } from '../ui/feedback.js';
import { openQuickRecord } from '../ui/quickrecord.js';
import { DAY, HOUR, startOfDay, dShort, hm, rel } from '../core/time.js';

const OBS = ['Odmítá potravu', 'Problém se svlekem', 'Zadržená oční čepička', 'Letargie', 'Průjem', 'Regurgitace', 'Dýchací potíže', 'Poranění', 'Parazité', 'Úbytek hmotnosti'];
const SEV = { alert: ['Akutní', 'bad'], watch: ['Sledovat', 'warn'], info: ['Informace', 'mute'] };
const H = { animal: '', obs: '', sev: 'watch', adv: false, q: '', f: 'open' };
const sod = () => startOfDay(Date.now());

function fastRecord() {
  const db = store.get(), recent = [...new Set([...db.recent.animals, ...db.health.filter((h) => !h.resolved).map((h) => h.animal)])].map((id) => db.animals.find((a) => a.id === id)).filter(Boolean).slice(0, 6);
  return block('Rychlý zdravotní záznam', `<div class="hf">
    <div class="field"><span>Zvíře</span><div class="chips">${recent.map((a) => `<button class="chip ${H.animal === a.id ? 'on' : ''}" data-act="hf-an" data-v="${a.id}">${avatar(a, 20)}<span class="code">${esc(a.code)}</span></button>`).join('')}<select class="select sm-sel" data-change="hf-an-sel" aria-label="Jiné zvíře"><option value="">Jiné…</option>${db.animals.filter((a) => !['sold', 'deceased'].includes(a.status)).map((a) => `<option value="${a.id}" ${H.animal === a.id ? 'selected' : ''}>${esc(a.code)} · ${esc(latin(SPECIES[a.species]))}</option>`).join('')}</select></div></div>
    <div class="field"><span>Pozorování</span><div class="chips">${OBS.map((o) => `<button class="chip ${H.obs === o ? 'on' : ''}" data-act="hf-obs" data-v="${o}">${o}</button>`).join('')}</div></div>
    <div class="row wrap"><div class="seg">${Object.entries(SEV).map(([k, [l]]) => `<button class="${H.sev === k ? 'on' : ''}" data-act="hf-sev" data-v="${k}">${l}</button>`).join('')}</div><span class="spacer"></span><button class="btn tertiary" data-act="hf-adv" aria-expanded="${H.adv}">${gl('sliders')}${H.adv ? 'Méně možností' : 'Více možností'}</button><button class="btn primary" data-act="hf-save" ${H.animal && H.obs ? '' : 'disabled'}>${gl('check')}ULOŽIT ZÁZNAM</button></div>
    ${H.adv ? `<div class="hf-adv"><div class="fields three"><label class="field"><span>Diagnóza</span><input class="input" id="hf-diag" placeholder="volitelné"></label><label class="field"><span>Veterinář</span><select class="select" id="hf-vet"><option value="">—</option>${db.contacts.filter((c) => c.kind === 'veterinář').map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label><label class="field"><span>Kontrola za (dny)</span><input class="input" type="number" id="hf-fu" value="3"></label></div><label class="field"><span>Poznámka</span><textarea class="textarea" id="hf-note" rows="2" placeholder="Co jste viděli, co jste změnili…"></textarea></label><label class="field"><span>Příloha (foto, laboratoř)</span><input class="input" type="file" accept="image/*,.pdf"></label></div>` : ''}
  </div>`, { icon: 'health', level: 'primary', sub: 'Tři klepnutí: zvíře · pozorování · uložit' });
}
function overview() {
  const db = store.get(), open = db.health.filter((h) => !h.resolved).sort((a, b) => ['alert', 'watch', 'info'].indexOf(a.severity) - ['alert', 'watch', 'info'].indexOf(b.severity));
  const meds = db.meds.filter((m) => m.done < m.count), q = db.animals.filter((a) => a.status === 'quarantine');
  return `<div class="kpis k4">${[['Otevřené záznamy', open.length, `${open.filter((h) => h.severity === 'alert').length} akutní`, 'health'], ['Kontroly', open.filter((h) => h.followUp).length, open.filter((h) => h.followUp && h.followUp < Date.now()).length ? '<span class="warn-t">1 po termínu</span>' : 'v plánu', 'calendar'], ['Léčba', meds.length, meds.length ? `${meds[0].drug.split(' ')[0]} · ${meds[0].done}/${meds[0].count}` : 'žádná aktivní', 'first-aid'], ['Karanténa', q.length, q.map((a) => a.code).join(', ') || '—', 'quarantine']].map(([l, v, s, ic]) => `<div class="kpi plain"><span class="kpi-l">${l}</span><b class="kpi-v">${v}</b><span class="kpi-s">${s}</span>${ico(ic, 'md kpi-ico')}</div>`).join('')}</div>
  <div class="g-main"><div class="stack">${fastRecord()}
    ${block('Otevřené záznamy', open.length ? `<div class="list">${open.map((h) => { const a = db.animals.find((x) => x.id === h.animal); return `<div class="li"><span class="sev s-${h.severity}"></span>${avatar(a, 36)}<span class="li-main"><b>${esc(h.title)}</b><span><a class="code" href="#/zvirata/karta/${a.id}?sekce=zdravi">${esc(a.code)}</a> · ${esc(latin(SPECIES[a.species]))} · ${rel(h.t)}${h.followUp ? ` · kontrola ${dShort(h.followUp)}` : ''}</span></span><span class="pill ${SEV[h.severity][1]}">${SEV[h.severity][0]}</span><button class="btn sm tertiary" data-act="h-resolve" data-id="${h.id}">${gl('check')}Vyřešeno</button></div>`; }).join('')}</div>` : empty('Vše v pořádku', 'Žádné otevřené zdravotní záznamy.', 'status-ok'), { icon: 'status-warning', level: 'secondary' })}</div>
  <div class="stack">${block('Léčba', medsHTML(db, meds), { icon: 'first-aid', level: 'secondary' })}${block('Kontroly & dávky', streamHTML(contextItems({ from: sod() - 7 * DAY, to: sod() + 14 * DAY, filter: 'health', includeHistory: false }), { mode: 'compact', showDone: false, empty: 'Nic v plánu' }), { icon: 'calendar', level: 'detail' })}</div></div>`;
}
function medsHTML(db, meds) {
  return meds.length ? `<div class="list">${meds.map((m) => { const a = db.animals.find((x) => x.id === m.animal), next = m.from + m.done * m.everyH * HOUR, id = `dose:${m.id}:${m.done}`; return `<div class="li med">${ring(m.done / m.count, { size: 46, stroke: 4, color: 'var(--c-med)', label: `${m.done}/${m.count}` })}<span class="li-main"><b>${esc(m.drug)}</b><span><span class="code">${esc(a.code)}</span> · ${esc(m.dose)} · ${esc(m.amount)} ${esc(m.route)} · další ${rel(next)}</span></span><button class="btn sm ${next < Date.now() ? 'primary' : 'done'}" data-act="tl-done" data-id="${id}">${gl('check')}PODÁNO</button></div>`; }).join('')}</div>` : '<p class="muted small">Žádná aktivní léčba.</p>';
}
function records() {
  const db = store.get(), q = H.q.toLowerCase();
  const L = db.health.filter((h) => (H.f === 'open' ? !h.resolved : H.f === 'done' ? h.resolved : true)).filter((h) => { const a = db.animals.find((x) => x.id === h.animal); return !q || `${h.title} ${a?.code} ${h.notes}`.toLowerCase().includes(q); });
  return `<div class="pl-bar"><label class="searchbox">${gl('search')}<input type="search" id="h-q" value="${esc(H.q)}" data-input="h-q" placeholder="Hledat v záznamech…" aria-label="Hledat"></label><div class="seg">${[['open', 'Otevřené'], ['done', 'Vyřešené'], ['all', 'Vše']].map(([k, l]) => `<button class="${H.f === k ? 'on' : ''}" data-act="h-f" data-v="${k}">${l}</button>`).join('')}</div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Datum</th><th>Zvíře</th><th>Záznam</th><th>Závažnost</th><th>Kontrola</th><th>Stav</th></tr></thead><tbody>${L.map((h) => { const a = db.animals.find((x) => x.id === h.animal); return `<tr class="clk" data-act="go" data-href="#/zvirata/karta/${a.id}?sekce=zdravi"><td class="mono">${dShort(h.t)}</td><td><div class="row">${avatar(a, 28)}<span class="code">${esc(a.code)}</span></div></td><td><b>${esc(h.title)}</b><div class="muted small">${esc(h.notes || '')}</div></td><td><span class="pill ${SEV[h.severity][1]}">${SEV[h.severity][0]}</span></td><td>${h.followUp ? dShort(h.followUp) : '—'}</td><td>${h.resolved ? '<span class="pill ok">vyřešeno</span>' : '<span class="pill am">otevřeno</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function treatment() {
  const db = store.get();
  return `<div class="g2">${db.meds.map((m) => { const a = db.animals.find((x) => x.id === m.animal), vet = db.contacts.find((c) => c.id === m.vet); return block(m.drug, `<div class="row">${ring(m.done / m.count, { size: 64, stroke: 6, color: 'var(--c-med)', label: `${m.done}/${m.count}` })}<dl class="kv grow"><dt>Zvíře</dt><dd><a class="code" href="#/zvirata/karta/${a.id}">${esc(a.code)}</a> · <i class="latin">${esc(latin(SPECIES[a.species]))}</i></dd><dt>Dávka</dt><dd>${esc(m.dose)} · ${esc(m.amount)} · ${esc(m.route)}</dd><dt>Interval</dt><dd>každých ${m.everyH} h</dd><dt>Veterinář</dt><dd>${esc(vet?.name || '—')}</dd></dl></div>
    <div class="doses">${[...Array(m.count)].map((_, i) => `<span class="${i < m.done ? 'ok' : i === m.done ? 'next' : ''}" title="dávka ${i + 1} · ${dShort(m.from + i * m.everyH * HOUR)} ${hm(m.from + i * m.everyH * HOUR)}">${i + 1}</span>`).join('')}</div>${m.note ? `<p class="muted small">${esc(m.note)}</p>` : ''}`, { icon: 'first-aid', level: m.done < m.count ? 'primary' : 'detail', kicker: m.done < m.count ? 'Probíhá' : 'Dokončeno' }); }).join('')}</div>`;
}

export function render(r) {
  const db = store.get();
  return `${pageHead({ mod: 'zdravi', cur: r.sub, sub: `${db.health.filter((h) => !h.resolved).length} otevřené záznamy · ${db.meds.filter((m) => m.done < m.count).length} aktivní léčba`, tabs: [['prehled', 'Přehled'], ['zaznamy', 'Záznamy', db.health.length], ['lecba', 'Léčba']], actions: `<button class="btn primary" data-act="qr-type" data-type="health">${gl('plus')}Zdravotní záznam</button>` })}${r.sub === 'zaznamy' ? records() : r.sub === 'lecba' ? treatment() : overview()}`;
}
export function onNew() { openQuickRecord({ type: 'health' }); }

actions({
  'hf-an': (el) => { H.animal = el.dataset.v; store.emit('change'); },
  'hf-an-sel': (el) => { H.animal = el.value; store.emit('change'); },
  'hf-obs': (el) => { H.obs = H.obs === el.dataset.v ? '' : el.dataset.v; store.emit('change'); },
  'hf-sev': (el) => { H.sev = el.dataset.v; store.emit('change'); },
  'hf-adv': () => { H.adv = !H.adv; store.emit('change'); },
  'hf-save': () => {
    const v = (id) => document.getElementById(id)?.value;
    const fu = +(v('hf-fu') || 0);
    const res = A.quickRecord('health', [H.animal], { title: H.obs, severity: H.sev, note: v('hf-note') || '', diagnosis: v('hf-diag') || '', vet: v('hf-vet') || null, followUp: H.adv && fu ? startOfDay(Date.now()) + fu * DAY + 10 * HOUR : null });
    H.obs = ''; H.adv = false; done(res);
  },
  'h-resolve': (el) => store.mutate('Zdravotní záznam uzavřen', (d) => { const h = d.health.find((x) => x.id === el.dataset.id); if (h) h.resolved = true; }),
  'h-q': (el) => { H.q = el.value; store.emit('change'); },
  'h-f': (el) => { H.f = el.dataset.v; store.emit('change'); },
});
