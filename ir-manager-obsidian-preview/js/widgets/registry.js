// KNIHOVNA WIDGETŮ — kurátorovaný výběr. Klidné výchozí rozvržení; úpravy jsou volitelné.
// Úrovně: primary (dnes / naléhavé) · secondary (sbírka, reprodukce, inkubace) · detail (aktivity, statistiky, poznámky, nástroje).
import { esc } from '../core/dom.js';
import { gl, ico } from '../core/icons.js';
import * as store from '../core/store.js';
import { SPECIES, SUPPLEMENTS, latin, imgFor } from '../data/species.js';
import { TYPE, rotationState, lastWeight } from '../engine/ops.js';
import { groupItems, isOpen } from '../engine/timeline.js';
import { notifications } from '../engine/notify.js';
import { streamHTML, contextItems, typeTile } from '../ui/timeline.js';
import { avatar, spark, ring, rangeBar, money, empty } from '../ui/components.js';
import { TOOLS } from './tools.js';
import { DAY, HOUR, startOfDay, hm, dShort, rel, daysBetween, monthShort, plural } from '../core/time.js';
export { addLowStockToShopping, addItemToShopping } from './tools.js';

export const CATS = ['Přehled', 'Péče', 'Reprodukce', 'Zdraví', 'Sklad', 'Finance', 'Nástroje'];
export const ACCENTS = [['amber', 'Jantarová'], ['blue', 'Modrá'], ['violet', 'Fialová'], ['red', 'Červená'], ['green', 'Zelená'], ['neutral', 'Neutrální']];
export const FRAMES = [['line', 'Boční linka'], ['strip', 'Horní pruh'], ['tint', 'Jemný tón'], ['outline', 'Obrys'], ['none', 'Bez rámu']];
export const SIZES = [['s', 'S', 'Malý'], ['m', 'M', 'Střední'], ['l', 'L', 'Velký'], ['xl', 'XL', 'Široký'], ['w', 'W', 'Celá šířka']];
const sod = () => startOfDay(Date.now());
const act = (db) => db.animals.filter((a) => !['sold', 'deceased'].includes(a.status));
const more = (href, label = 'Otevřít') => `<a class="w-more" href="${href}">${label}${gl('arrow-right')}</a>`;
const ok = (t) => `<div class="w-ok">${ico('status-ok', 'md')}<b>${esc(t)}</b></div>`;

// paměť pro zvýraznění nových aktivit (jen nové záznamy od posledního vykreslení)
const seen = new Set(); let seenInit = false;

export const WIDGETS = {
  // ---------------------------------------------------------------- PŘEHLED
  today: { name: 'Dnes & následující', icon: 'tasks', cat: 'Přehled', level: 'primary', desc: 'Kompaktní provozní osa: po termínu, teď, dnes, zítra — potvrzení přímo odsud.', sizes: ['l', 'xl', 'w'], size: 'xl',
    render() {
      const items = contextItems({ from: sod() - 3 * DAY, to: sod() + 2 * DAY, includeHistory: false }).filter((i) => i.kind !== 'phase' && isOpen(i));
      const grouped = groupItems(items), shown = grouped.slice(0, 7), restN = grouped.length - shown.length;
      return `${streamHTML(shown.flatMap((g) => (g.kind === 'group' ? g.items : [g])), { mode: 'compact', showDone: false, empty: 'Na dnes je hotovo', limitNext: 1 })}<div class="w-foot">${restN > 0 ? `<span class="muted small">+${restN} dalších</span>` : ''}${more('#/ukoly/planovac', 'Otevřít plánovač')}</div>`;
    } },
  attention: { name: 'Vyžaduje pozornost', icon: 'status-warning', cat: 'Přehled', level: 'primary', desc: 'To podstatné na jednom místě — po termínu, zdraví, okna líhnutí, nízký stav.', sizes: ['m', 'l'], size: 'm',
    render() {
      const list = notifications(store.get()).filter((n) => n.prio !== 'low').slice(0, 6);
      return list.length ? `<div class="list att">${list.map((n) => `<a class="li p-${n.prio}" href="${n.link}">${ico(n.icon, 'sm')}<span class="li-main"><b>${esc(n.title)}</b><span>${esc(n.text)}</span></span><em class="muted small">${rel(n.t)}</em></a>`).join('')}</div>` : ok('Vše v pořádku');
    } },
  activity: { name: 'Poslední aktivity', icon: 'clock-action', cat: 'Přehled', level: 'detail', desc: 'Co se změnilo — seskupeno podle času, nové záznamy jsou krátce zvýrazněny.', sizes: ['m', 'l'], size: 'm',
    render() {
      const db = store.get(), n = Date.now();
      const rec = db.records.filter((r) => r.source !== 'history' || r.t > n - 2 * DAY).slice(-80).reverse().slice(0, 10);
      if (!seenInit) { for (const r of db.records) seen.add(r.id); seenInit = true; }
      const bucket = (t) => (n - t < HOUR ? 'Poslední hodina' : daysBetween(t, n) === 0 ? 'Dnes' : daysBetween(t, n) === 1 ? 'Včera' : 'Dříve');
      const groups = {}; for (const r of rec) (groups[bucket(r.t)] ||= []).push(r);
      const html = Object.entries(groups).map(([k, arr]) => `<div class="act-g"><span class="act-h">${k}</span>${arr.map((r) => {
        const a = db.animals.find((x) => x.id === r.subject), e = db.enclosures.find((x) => x.id === r.subject), isNew = !seen.has(r.id);
        return `<div class="li act ${isNew ? 'is-new' : ''}">${typeTile(r.type, 'sm')}<span class="li-main"><b>${esc(TYPE[r.type]?.label || r.type)}${r.data?.refused ? ' — odmítnuto' : ''} · <span class="code">${esc(a?.code || e?.code || '')}</span></b><span>${esc([r.data?.supplement, r.data?.g ? `${r.data.g} g` : '', r.data?.label, r.data?.title, r.source === 'automation' ? 'automaticky' : r.source === 'quick' ? 'rychlý záznam' : ''].filter(Boolean).join(' · ') || (a ? latin(SPECIES[a.species]) : ''))}</span></span><em class="muted small">${hm(r.t)}</em></div>`;
      }).join('')}</div>`).join('');
      for (const r of rec) seen.add(r.id);
      return `<div class="list">${html}</div>`;
    } },
  stats: { name: 'Statistiky chovu', icon: 'groups', cat: 'Přehled', level: 'detail', desc: 'Záznamy péče za 7 dní, splněnost plánu, krmení a odmítnutí.', sizes: ['s', 'm', 'l'], size: 'm',
    render() {
      const db = store.get(), n = Date.now(), days = [...Array(7)].map((_, i) => sod() - (6 - i) * DAY);
      const per = days.map((d) => db.records.filter((r) => r.t >= d && r.t < d + DAY).length);
      const feeds = db.records.filter((r) => r.type === 'feeding' && r.t > n - 30 * DAY), refused = feeds.filter((r) => r.data?.refused).length;
      const occ = Object.values(db.occ).filter((o) => o.at > n - 7 * DAY), doneP = occ.length ? occ.filter((o) => o.status === 'done').length / occ.length : 1;
      return `<div class="stat-w"><div class="stat-top">${ring(doneP, { size: 70, stroke: 7, label: `${Math.round(doneP * 100)} %` })}<div><span class="kicker mute">Splněnost plánu · 7 dní</span><b class="value">${per.reduce((a, b) => a + b, 0)}</b><span class="muted small"> záznamů péče</span></div></div>
        <div class="minibars">${per.map((v, i) => `<span style="--h:${(v / Math.max(...per, 1)) * 100}%" title="${v}"><i></i><em>${['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][new Date(days[i]).getDay()]}</em></span>`).join('')}</div>
        <div class="kv3"><div><span>Krmení / 30 d</span><b>${feeds.length}</b></div><div><span>Odmítnuto</span><b>${refused}</b></div><div><span>Příjem krmiva</span><b>${feeds.length ? Math.round((1 - refused / feeds.length) * 100) : 100} %</b></div></div></div>`;
    } },
  collection: { name: 'Sbírka podle druhů', icon: 'animals', cat: 'Přehled', level: 'secondary', desc: 'Druhy ve sbírce s počty a poměrem pohlaví.', sizes: ['m', 'l'], size: 'm',
    render() {
      const db = store.get(), by = {};
      for (const a of act(db)) { const s = (by[a.species] ||= { n: 0, m: 0, f: 0, u: 0 }); if (a.kind === 'group') { s.n += a.count; s.m += a.sexes.m; s.f += a.sexes.f; s.u += a.sexes.u; } else { s.n++; s[a.sex]++; } }
      const max = Math.max(...Object.values(by).map((x) => x.n));
      return `<div class="list">${Object.entries(by).sort((a, b) => b[1].n - a[1].n).map(([k, s]) => `<a class="li coll" href="#/zvirata/mrizka?sp=${k}"><img class="coll-img" src="assets/img/species/${SPECIES[k].img}-1.webp" alt="" loading="lazy"><span class="li-main"><b class="latin">${esc(latin(SPECIES[k]))}</b><span>${esc(SPECIES[k].cz)}</span></span><span class="coll-bar"><i style="transform:scaleX(${(s.n / max).toFixed(3)})"></i></span><span class="coll-n"><b>${s.n}</b><em class="mono">${s.m}.${s.f}.${s.u}</em></span></a>`).join('')}</div>`;
    } },
  favorites: { name: 'Oblíbená zvířata', icon: 'animals', cat: 'Přehled', level: 'secondary', desc: 'Označená zvířata s další plánovanou péčí.', sizes: ['m', 'l', 'xl'], size: 'l',
    render() { const db = store.get(); return animalTiles(db.favorites.map((id) => db.animals.find((a) => a.id === id)).filter(Boolean)); } },
  habitat: { name: 'Habitat Studio', icon: 'habitat', cat: 'Přehled', level: 'secondary', desc: '3D návrh chovné místnosti — vstup do samostatného studia.', sizes: ['m', 'l', 'xl'], size: 'l', noFrame: true,
    render() { const db = store.get(); return `<a class="hab-w" href="#/ubikace/studio"><img src="assets/img/enclosures/room-hero.webp" alt="Chovná místnost A — render Habitat Studio" loading="lazy"><span class="hab-o"><span class="kicker">Habitat Studio</span><b>3D návrh chovné místnosti</b><span class="muted small">Místnost A · ${db.enclosures.length} ubikací · ${db.assemblies.length} sestavy · 5,00 × 4,00 × 2,70 m</span><span class="btn sm primary">${gl('cube')}OTEVŘÍT STUDIO</span></span></a>`; } },
  // ---------------------------------------------------------------- PÉČE
  quickcare: { name: 'Rychlá péče', icon: 'care', cat: 'Péče', level: 'primary', desc: 'Rutinní péče na řadě po skupinách — celou skupinu potvrdíte jedním klepnutím.', sizes: ['s', 'm', 'l'], size: 'm',
    render() {
      const items = contextItems({ from: sod() - 3 * DAY, to: sod() + DAY, includeHistory: false }).filter((i) => i.kind === 'occ' && isOpen(i) && ['feeding', 'water', 'misting', 'cleaning'].includes(i.type));
      const by = {}; for (const i of items) (by[i.type] ||= []).push(i);
      return Object.keys(by).length ? `<div class="qcw">${Object.entries(by).map(([k, arr]) => `<div class="qcw-r">${typeTile(k)}<span class="li-main"><b>${TYPE[k].label} ×${arr.length}</b><span>${arr.slice(0, 4).map((x) => esc(x.sub?.code)).join(', ')}${arr.length > 4 ? ' …' : ''}</span></span><button class="btn sm done" data-act="w-bulk" data-ids="${arr.map((x) => x.id).join(',')}">${gl('check')}HOTOVO VŠE</button></div>`).join('')}</div>` : ok('Rutinní péče je hotová');
    } },
  rotation: { name: 'Vitaminová rotace', icon: 'supplement', cat: 'Péče', level: 'secondary', desc: 'Kde je každá rotace suplementů — další suplement se zapíše automaticky.', sizes: ['m', 'l'], size: 'm',
    render() {
      const db = store.get(), plans = db.plans.filter((p) => p.type === 'feeding' && p.rotation?.length > 1 && p.active).slice(0, 6);
      return `<div class="rot">${plans.map((p) => { const rs = rotationState(db, p), a = db.animals.find((x) => x.id === p.subject); return `<a class="rot-r" href="#/zvirata/karta/${a?.id}"><span class="code">${esc(a?.code)}</span><span class="rot-seq">${rs.rot.map((s, i) => `<i class="${i === rs.index ? 'next' : ''}" style="--c:${SUPPLEMENTS[s]?.color}" title="${esc(s)}"></i>`).join('')}</span><span class="rot-n"><em>další</em><b style="color:${SUPPLEMENTS[rs.next]?.color}">${esc(rs.next || '—')}</b></span></a>`; }).join('')}</div>`;
    } },
  weighin: { name: 'Vážení', icon: 'weight', cat: 'Péče', level: 'secondary', desc: 'Kdo je na řadě s vážením, poslední hmotnost a trend — zápis přímo v řádku.', sizes: ['m', 'l'], size: 'm',
    render() {
      const db = store.get(), items = contextItems({ from: sod() - 7 * DAY, to: sod() + 7 * DAY, includeHistory: false }).filter((i) => i.type === 'weight' && isOpen(i)).slice(0, 5);
      return items.length ? `<div class="list">${items.map((i) => { const a = i.sub.obj, hist = db.records.filter((r) => r.subject === a.id && r.type === 'weight').slice(-8).map((r) => r.data.g); return `<div class="li wq">${avatar(a, 34)}<span class="li-main"><b class="code">${esc(a.code)}</b><span>${i.status === 'overdue' ? '<em class="warn-t">po termínu</em> · ' : ''}${dShort(i.t)} · naposledy ${lastWeight(db, a.id) ?? '—'} g</span></span>${spark(hist, { w: 64, h: 24, color: 'var(--c-weight)' })}<span class="tl-wt"><input type="number" inputmode="decimal" id="w-${esc(i.id)}" placeholder="g" aria-label="Hmotnost ${esc(a.code)}" data-enter="tl-weight" data-id="${esc(i.id)}"></span><button class="btn sm done" data-act="tl-weight" data-id="${esc(i.id)}" aria-label="Uložit">${gl('check')}</button></div>`; }).join('')}</div>` : ok('Nikdo není na řadě');
    } },
  upcoming: { name: 'Nadcházející události', icon: 'calendar', cat: 'Péče', level: 'secondary', desc: 'Nerutinní události na 14 dní: úkoly, reprodukce, zdraví, údržba.', sizes: ['m', 'l'], size: 'm',
    render() {
      const items = contextItems({ from: Date.now(), to: sod() + 14 * DAY, includeHistory: false }).filter((i) => isOpen(i) && !['feeding', 'water', 'misting', 'cleaning', 'weight'].includes(i.type) && i.kind !== 'phase').slice(0, 7);
      return items.length ? `<div class="list">${items.map((i) => `<div class="li">${typeTile(i.type, 'sm')}<span class="li-main"><b>${esc(i.title)}</b><span>${esc(i.sub?.code || '')}${i.cycleName ? ` · ${esc(i.cycleName)}` : ''}</span></span><em class="muted small">${dShort(i.t)}</em></div>`).join('')}</div>` : ok('Nic dalšího v plánu');
    } },
  // ---------------------------------------------------------------- REPRODUKCE
  repro: { name: 'Aktivní reprodukce', icon: 'reproduction', cat: 'Reprodukce', level: 'secondary', desc: 'Každý aktivní cyklus: aktuální fáze, další krok, očekávané okno.', sizes: ['m', 'l', 'xl'], size: 'm',
    render() {
      const db = store.get(), n = Date.now();
      return `<div class="list">${db.cycles.filter((c) => c.status === 'active').slice(0, 5).map((c) => { const cur = [...c.phases].reverse().find((p) => p.start <= n) || c.phases[0]; const f = db.animals.find((a) => a.id === c.female); return `<a class="li rp" href="#/reprodukce/cyklus/${c.id}">${avatar(f, 36)}<span class="li-main"><b>${esc(c.name)}</b><span><em class="pill repro">${esc(cur.label.split(' (')[0])}</em>${c.next ? ` ${gl('arrow-right')} ${esc(c.next.label)} · ${rel(c.next.due)}` : ''}</span></span></a>`; }).join('')}</div>`;
    } },
  incubation: { name: 'Inkubace', icon: 'temperature', cat: 'Reprodukce', level: 'secondary', desc: 'Snůšky s dnem inkubace, očekávaným oknem a kontrolou jedním klepnutím.', sizes: ['m', 'l', 'xl'], size: 'm',
    render() {
      const db = store.get(), n = Date.now(), items = contextItems({ from: sod() - 7 * DAY, to: sod() + 14 * DAY, includeHistory: false }).filter((i) => i.src === 'clutch-check' && isOpen(i));
      return `<div class="incw">${db.clutches.filter((c) => c.status === 'incubating').map((c) => { const d = daysBetween(c.laid, n), chk = items.find((i) => i.clutch === c.id); return `<div class="iw"><a class="iw-img" href="#/reprodukce/snuska/${c.id}"><img src="assets/img/kpi/${c.img}.webp" alt="" loading="lazy"></a><div class="iw-b"><div class="row"><b class="code">${esc(c.code)}</b><span class="spacer"></span><span class="muted small">${c.fertile}/${c.eggs} vajec · ${String(c.temp).replace('.', ',')} °C</span></div><i class="latin">${esc(latin(SPECIES[c.species]))}</i>${rangeBar(d, c.expected, { compact: true })}<div class="row small"><span class="muted">den ${d} · okno ${c.expected[0]}–${c.expected[1]} dní</span><span class="spacer"></span>${chk ? `<button class="btn sm ${chk.status === 'overdue' ? 'primary' : 'done'}" data-act="tl-done" data-id="${esc(chk.id)}">${gl('check')}KONTROLA</button>` : `<span class="muted">kontrola ${rel(c.lastCheck + c.checkEvery * DAY)}</span>`}</div></div></div>`; }).join('')}</div>`;
    } },
  hatch: { name: 'Očekávaná líhnutí', icon: 'reproduction', cat: 'Reprodukce', level: 'secondary', desc: 'Okna líhnutí na společné ose — poctivá rozmezí, žádná přesná data.', sizes: ['m', 'l', 'xl'], size: 'l',
    render() {
      const db = store.get(), n = Date.now(), from = sod(), to = from + 180 * DAY, x = (tt) => `${Math.max(0, Math.min(100, ((tt - from) / (to - from)) * 100)).toFixed(1)}%`;
      return `<div class="hw">${db.clutches.filter((c) => c.status === 'incubating').sort((a, b) => a.laid + a.expected[0] * DAY - (b.laid + b.expected[0] * DAY)).map((c) => { const a = c.laid + c.expected[0] * DAY, b = c.laid + c.expected[1] * DAY; return `<a class="hw-r" href="#/reprodukce/snuska/${c.id}"><span class="hw-l"><b class="code">${esc(c.code)}</b><em>${dShort(a)} – ${dShort(b)}</em></span><span class="hw-t"><i style="left:${x(a)};width:calc(${x(b)} - ${x(a)})" class="${a <= n ? 'open' : ''}"></i></span></a>`; }).join('')}<div class="hw-ax">${[0, 1, 2, 3, 4, 5].map((k) => `<span style="left:${(k / 6) * 100}%">${monthShort(new Date(from + k * 30 * DAY).getMonth())}</span>`).join('')}</div></div>`;
    } },
  // ---------------------------------------------------------------- ZDRAVÍ
  healthalerts: { name: 'Zdravotní upozornění', icon: 'health', cat: 'Zdraví', level: 'primary', desc: 'Otevřená pozorování a diagnózy podle závažnosti.', sizes: ['s', 'm', 'l'], size: 'm',
    render() {
      const db = store.get(), R = { alert: 0, watch: 1, info: 2 }, open = db.health.filter((h) => !h.resolved).sort((a, b) => R[a.severity] - R[b.severity]);
      return open.length ? `<div class="list">${open.slice(0, 5).map((h) => { const a = db.animals.find((x) => x.id === h.animal); return `<a class="li" href="#/zvirata/karta/${a.id}?sekce=zdravi">${avatar(a, 34)}<span class="li-main"><b>${esc(h.title)}</b><span><span class="code">${esc(a.code)}</span> · ${rel(h.t)}${h.followUp ? ` · kontrola ${dShort(h.followUp)}` : ''}</span></span><span class="pill ${h.severity === 'alert' ? 'bad' : h.severity === 'watch' ? 'warn' : 'mute'}">${{ alert: 'vážné', watch: 'sledovat', info: 'info' }[h.severity]}</span></a>`; }).join('')}</div>` : ok('Žádná otevřená upozornění');
    } },
  meds: { name: 'Léčba', icon: 'first-aid', cat: 'Zdraví', level: 'secondary', desc: 'Aktivní kúry s průběhem dávek a další dávkou.', sizes: ['s', 'm'], size: 'm',
    render() {
      const db = store.get(), active = db.meds.filter((m) => m.done < m.count);
      return active.length ? `<div class="list">${active.map((m) => { const a = db.animals.find((x) => x.id === m.animal), next = m.from + m.done * m.everyH * HOUR; return `<div class="li">${ring(m.done / m.count, { size: 42, stroke: 4, color: 'var(--c-med)', label: `${m.done}/${m.count}` })}<span class="li-main"><b>${esc(m.drug)}</b><span><span class="code">${esc(a.code)}</span> · ${esc(m.dose)} ${esc(m.route)} · další ${rel(next)}</span></span></div>`; }).join('')}</div>` : ok('Žádná aktivní léčba');
    } },
  followups: { name: 'Zdravotní kontroly', icon: 'health', cat: 'Zdraví', level: 'secondary', desc: 'Naplánované kontroly — potvrzení jedním klepnutím.', sizes: ['s', 'm'], size: 'm',
    render() { const items = contextItems({ from: sod() - 7 * DAY, to: sod() + 14 * DAY, includeHistory: false }).filter((i) => i.src === 'followup' && isOpen(i)); return items.length ? streamHTML(items, { mode: 'compact', showDone: false }) : ok('Žádné kontroly'); } },
  // ---------------------------------------------------------------- SKLAD
  lowstock: { name: 'Nízký stav', icon: 'inventory', cat: 'Sklad', level: 'primary', desc: 'Položky pod minimem — do nákupního seznamu jedním klepnutím.', sizes: ['s', 'm', 'l'], size: 'm',
    render() {
      const db = store.get(), low = db.inventory.filter((x) => x.qty < x.min).sort((a, b) => a.qty / a.min - b.qty / b.min);
      return low.length ? `<div class="list">${low.slice(0, 6).map((x) => `<div class="li"><span class="inv-ico">${x.img ? `<img src="assets/img/${x.img}" alt="" loading="lazy">` : ico('inventory', 'sm')}</span><span class="li-main"><b>${esc(x.name)}</b><span><em class="${x.qty === 0 ? 'bad-t' : 'warn-t'}">${x.qty} ${esc(x.unit)}</em> · min. ${x.min}</span></span><button class="icon-btn sm" data-act="w-shop1" data-id="${x.id}" title="Do nákupního seznamu" aria-label="Do nákupního seznamu">${gl('cart')}</button></div>`).join('')}</div><div class="w-foot"><button class="btn sm" data-act="w-shopall">${gl('cart')}Vše do nákupu</button></div>` : ok('Zásoby v pořádku');
    } },
  moves: { name: 'Poslední pohyby', icon: 'repeat-action', cat: 'Sklad', level: 'detail', desc: 'Nákupy, krmení a inventury — včetně automatických odpisů z krmení.', sizes: ['m', 'l'], size: 'm',
    render() { const db = store.get(); return `<div class="list">${db.stock.slice(0, 7).map((s) => { const it = db.inventory.find((x) => x.id === s.item); return `<div class="li"><span class="mv ${s.delta > 0 ? 'in' : 'out'}">${s.delta > 0 ? '+' : ''}${String(s.delta).replace('.', ',')}</span><span class="li-main"><b>${esc(it?.name || s.item)}</b><span>${esc(s.reason)}</span></span><em class="muted small">${rel(s.t)}</em></div>`; }).join('')}</div>`; } },
  stockvalue: { name: 'Hodnota zásob', icon: 'finance', cat: 'Sklad', level: 'detail', desc: 'Hodnota zásob podle kategorie.', sizes: ['s', 'm'], size: 's',
    render() { const db = store.get(), by = {}; for (const i of db.inventory) by[i.cat] = (by[i.cat] || 0) + i.qty * i.price; const tot = Object.values(by).reduce((a, b) => a + b, 0); return `<div class="sv"><b class="value big">${money(tot)}</b><div class="sv-bars">${Object.entries(by).map(([k, v]) => `<div><span>${INV_CAT[k] || k}</span><i style="transform:scaleX(${(v / tot).toFixed(3)})"></i><em>${money(v)}</em></div>`).join('')}</div></div>`; } },
  // ---------------------------------------------------------------- FINANCE
  finsum: { name: 'Finance — tento měsíc', icon: 'finance', cat: 'Finance', level: 'secondary', desc: 'Příjmy, výdaje, zálohy a výsledek.', sizes: ['s', 'm', 'l'], size: 'm',
    render() { const f = monthAgg(0), p = monthAgg(1), r = f.inc - f.exp, rp = p.inc - p.exp; return `<div class="fs"><div class="fs-r"><span>Příjmy</span><b class="ok-t">${money(f.inc)}</b></div><div class="fs-r"><span>Výdaje</span><b>${money(f.exp)}</b></div><div class="fs-r"><span>Přijaté zálohy</span><b>${money(f.dep)}</b></div><div class="fs-r tot"><span>Výsledek</span><b class="${r >= 0 ? 'ok-t' : 'bad-t'}">${r >= 0 ? '+' : ''}${money(r)}</b><em class="muted small">${r >= rp ? '▲' : '▼'} vs. minulý měsíc</em></div></div>`; } },
  monthly: { name: 'Posledních 12 měsíců', icon: 'finance', cat: 'Finance', level: 'detail', desc: 'Příjmy vs. výdaje po měsících.', sizes: ['l', 'xl', 'w'], size: 'l',
    render() { const m = months12(), mx = Math.max(...m.map((x) => Math.max(x.inc, x.exp)), 1); return `<div class="bars2">${m.map((x) => `<span title="${x.label}: +${money(x.inc)} / −${money(x.exp)}"><i class="in" style="--h:${(x.inc / mx) * 100}%"></i><i class="out" style="--h:${(x.exp / mx) * 100}%"></i><em>${x.label}</em></span>`).join('')}</div><div class="legend"><span class="in"><i></i>Příjmy</span><span class="out"><i></i>Výdaje</span></div>`; } },
  sales: { name: 'Prodeje & rezervace', icon: 'finance', cat: 'Finance', level: 'detail', desc: 'Prodáno, rezervováno (zálohy) a na prodej.', sizes: ['m', 'l'], size: 'm',
    render() { const db = store.get(), O = { reserved: 0, 'for-sale': 1, sold: 2 }, L = { reserved: ['Rezervováno', 'info'], 'for-sale': ['Na prodej', 'am'], sold: ['Prodáno', 'mute'] }; return `<div class="list">${db.sales.slice().sort((a, b) => O[a.status] - O[b.status]).slice(0, 6).map((s) => { const a = db.animals.find((x) => x.id === s.animal); return a ? `<a class="li" href="#/zvirata/karta/${a.id}">${avatar(a, 32)}<span class="li-main"><b class="latin">${esc(latin(SPECIES[a.species]))}</b><span><span class="code">${esc(a.code)}</span> · ${money(s.price)}</span></span><span class="pill ${L[s.status][1]}">${L[s.status][0]}</span></a>` : ''; }).join('')}</div>`; } },
};
// ---------------------------------------------------------------- NÁSTROJE jako widgety (osobní widgety jsou vícenásobné)
for (const [tk, T] of Object.entries(TOOLS)) {
  const k = tk === 'feedplan' ? 'feeddemand' : WIDGETS[tk] ? `${tk}-tool` : tk;
  WIDGETS[k] = { name: T.name, icon: T.glossy, cat: tk === 'feedplan' ? 'Sklad' : 'Nástroje', level: 'detail', desc: T.desc, sizes: ['s', 'm', 'l', 'xl'], size: tk === 'calculator' ? 's' : tk === 'energy' || tk === 'pricelist' ? 'l' : 'm', tool: tk, multi: !!T.doc || tk === 'calculator', doc: T.doc, personal: !!T.doc || tk === 'calculator' };
}
export const INV_CAT = { live: 'Živé krmivo', frozen: 'Mražené krmivo', supplement: 'Suplementy', equipment: 'Technika', substrate: 'Substráty' };

function animalTiles(list) {
  const db = store.get();
  return list.length ? `<div class="at">${list.map((a) => { const e = db.enclosures.find((x) => x.id === a.enclosureId); return `<a class="at-i" href="#/zvirata/karta/${a.id}"><img src="${imgFor(a)}" alt="" loading="lazy"><span><b class="latin">${esc(latin(SPECIES[a.species]))}</b><em><span class="code">${esc(a.code)}</span>${a.name ? ` · ${esc(a.name)}` : ''}${e ? ` · ${esc(e.code)}` : ''}</em></span></a>`; }).join('')}</div>` : empty('Zatím žádná oblíbená zvířata', 'Hvězdičkou na kartě zvířete ho přidáte sem.', 'animals');
}
export function monthAgg(back = 0) {
  const db = store.get(), d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - back); const a = d.getTime(); d.setMonth(d.getMonth() + 1); const b = d.getTime();
  const rows = db.finance.filter((f) => f.t >= a && f.t < b); const byCat = {}; for (const f of rows.filter((x) => x.kind === 'expense')) byCat[f.cat] = (byCat[f.cat] || 0) + f.amount;
  return { inc: rows.filter((f) => f.kind === 'income').reduce((s, f) => s + f.amount, 0), exp: rows.filter((f) => f.kind === 'expense').reduce((s, f) => s + f.amount, 0), dep: rows.filter((f) => f.kind === 'deposit').reduce((s, f) => s + f.amount, 0), byCat, rows };
}
export function months12() { const out = []; for (let k = 11; k >= 0; k--) { const m = monthAgg(k), d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k); out.push({ ...m, label: monthShort(d.getMonth()) }); } return out; }

// ---------------------------------------------------------------- výchozí rozvržení (klidná, silná výchozí nastavení)
const I = (type, size, extra = {}) => ({ type, size: size || WIDGETS[type].size, ...extra });
export const DEFAULTS = {
  prehled: [I('today', 'xl'), I('attention', 'm'), I('incubation', 'm'), I('repro', 'm'), I('collection', 'm'), I('activity', 'm'), I('stats', 'm'), I('notes', 'm', { title: 'Chovná místnost — poznámky', accent: 'violet', seedKind: 'notes' }), I('habitat', 'l'), I('links', 'l', { seedKind: 'links' })],
  ukoly: [I('quickcare', 'm'), I('rotation', 'm'), I('weighin', 'm')],
  reprodukce: [I('hatch', 'xl'), I('notes', 'm', { title: 'Poznámky k odchovu', accent: 'violet', seed: { text: 'Projekt Pastel Clown — z roku 2026 si ponechat 2 samice.\nLEU-02: petri misku pod list, přesun ve 20:00.' } })],
  zdravi: [I('healthalerts', 'l'), I('meds', 'm'), I('followups', 'm')],
  sklad: [I('feeddemand', 'l'), I('stockvalue', 'm'), I('calculator', 's', { cfg: { ctx: 'sklad' } })],
  finance: [I('monthly', 'xl'), I('sales', 'm'), I('price', 'l'), I('calculator', 's', { cfg: { ctx: 'finance' } }), I('checklist', 'm', { title: 'Uzávěrka měsíce', accent: 'green', seed: { items: [{ text: 'Zapsat příjmy z burzy', done: true }, { text: 'Spárovat zálohy', done: false }, { text: 'Podíl elektřiny', done: false }] } })],
};
