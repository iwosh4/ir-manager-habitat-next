// PŘEHLED — evoluce současného dashboardu: hero s kajmanem → 6 KPI karet s fotografií → pracovní plocha.
// Úrovně: PRIMÁRNÍ (Dnes & následující, Vyžaduje pozornost) · SEKUNDÁRNÍ (inkubace, reprodukce, sbírka) · DETAIL.
import { esc } from '../core/dom.js';
import { gl } from '../core/icons.js';
import * as store from '../core/store.js';
import { buildTimeline, groupItems, isOpen } from '../engine/timeline.js';
import { TYPE } from '../engine/ops.js';
import { money } from '../ui/components.js';
import { workspaceHTML, mountWorkspace } from '../widgets/workspace.js';
import { monthAgg } from '../widgets/registry.js';
import { DAY, startOfDay, dLong, greeting, hm, plural, dShort } from '../core/time.js';

const prev = new Map(); // KPI: pohyb jen při skutečné změně hodnoty

function todayStats(db) {
  const n = Date.now(), sod = startOfDay(n);
  const items = buildTimeline(db, { from: sod - 7 * DAY, to: sod + DAY, includeHistory: false }).filter((i) => i.kind === 'occ' || i.kind === 'task');
  // počítáme pracovní karty (skupina „Krmení ×8“ = jedna karta), ne jednotlivé výskyty
  const today = groupItems(items.filter((i) => i.t >= sod || i.status === 'overdue'));
  const doneN = today.filter((i) => i.status === 'done').length, od = today.filter((i) => i.status === 'overdue').length;
  const next = today.filter((i) => isOpen(i) && i.t >= n - 30 * 60e3).sort((a, b) => a.t - b.t)[0];
  return { total: today.length, done: doneN, overdue: od, open: today.filter(isOpen).length, next };
}
function kpi({ key, label, value, unit = '', sub, img, href, tone = '' }) {
  const p = prev.get(key), chg = p != null && p !== String(value); prev.set(key, String(value));
  return `<a class="kpi ${tone}" href="${href}" style="--img:url('../assets/ir/kpi/${img}.webp')"><span class="kpi-l">${esc(label)}</span><b class="kpi-v ${chg ? 'chg' : ''}">${value}${unit ? `<em>${unit}</em>` : ''}</b><span class="kpi-s">${sub}</span><i class="kpi-go">${gl('arrow-right')}</i></a>`;
}

export function render() {
  const db = store.get(), n = Date.now();
  const a = db.animals.filter((x) => !['sold', 'deceased'].includes(x.status));
  const heads = a.reduce((s, x) => s + (x.kind === 'group' ? x.count : 1), 0);
  const sx = a.reduce((m, x) => { if (x.kind === 'group') { m.m += x.sexes.m; m.f += x.sexes.f; m.u += x.sexes.u; } else m[x.sex]++; return m; }, { m: 0, f: 0, u: 0 });
  const inc = db.clutches.filter((c) => c.status === 'incubating'), eggs = inc.reduce((s, c) => s + c.fertile, 0);
  const nextW = Math.min(...inc.map((c) => c.laid + c.expected[0] * DAY));
  const alerts = db.health.filter((h) => !h.resolved).length, attn = db.enclosures.filter((e) => e.status !== 'ok').length;
  const f = monthAgg(0), res = f.inc - f.exp;
  const T = todayStats(db), pct = T.total ? T.done / T.total : 1;
  const nextTxt = T.next ? `${T.next.kind === 'group' ? `${TYPE[T.next.type].label} ×${T.next.items.length}` : `${TYPE[T.next.type]?.label || T.next.title}${T.next.sub ? ` · ${T.next.sub.code}` : ''}`} v ${hm(T.next.t)}` : 'nic dalšího na dnes';
  return `
  <section class="hero">
    <div class="hero-t"><span class="kicker">Přehled · ${dLong(n)}</span><h1 class="t-page">${greeting(n)}, ${esc(db.user.name)}</h1>
      <p class="hero-sum"><b>${T.open}</b> ${plural(T.open, 'úkol čeká', 'úkoly čekají', 'úkolů čeká')} · <b>${T.done}</b> hotovo${T.overdue ? ` · <a class="od" href="#/ukoly/dnes">${T.overdue} po termínu</a>` : ''} · další: ${esc(nextTxt)}</p>
      <div class="hero-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${T.total}" aria-valuenow="${T.done}" aria-label="Dnešní práce"><i style="transform:scaleX(${pct.toFixed(3)})"></i></div>
    </div>
    <div class="hero-a"><a class="btn" href="#/ukoly/planovac">${gl('calendar')}Plánovač</a><a class="btn primary" href="#/ukoly/dnes">${gl('check')}Dnešní práce</a></div>
  </section>
  <section class="kpis" aria-label="Klíčové ukazatele">
    ${kpi({ key: 'zv', label: 'Zvířata', value: heads, sub: `${a.length} záznamů · ${db.animals.filter((x) => x.status === 'for-sale').length} na prodej`, img: 'animals', href: '#/zvirata/mrizka' })}
    ${kpi({ key: 'sx', label: 'Samci / samice', value: `${sx.m}<i>/</i>${sx.f}`, sub: `${sx.u} neurčeno · ${db.cycles.filter((c) => c.status === 'active').length} aktivní páry`, img: 'sex', href: '#/zvirata/tabulka' })}
    ${kpi({ key: 'ub', label: 'Ubikace', value: db.enclosures.length, sub: attn ? `<span class="warn-t">${attn} vyžaduje pozornost</span>` : 'vše v pořádku', img: 'habitat', href: '#/ubikace/prehled', tone: attn ? 'warn' : '' })}
    ${kpi({ key: 'sn', label: 'Inkubace', value: eggs, unit: 'vajec', sub: `${inc.length} snůšky · okno od ${dShort(nextW)}`, img: 'clutch', href: '#/reprodukce/inkubace' })}
    ${kpi({ key: 'zd', label: 'Zdraví', value: alerts, unit: 'otevřeno', sub: `${db.health.filter((h) => h.followUp && !h.resolved).length} kontroly · ${db.animals.filter((x) => x.status === 'quarantine').length} v karanténě`, img: 'health', href: '#/zdravi/prehled', tone: alerts ? 'warn' : '' })}
    ${kpi({ key: 'fi', label: 'Finance · měsíc', value: `${res >= 0 ? '+' : '−'}${Math.abs(Math.round(res / 100) / 10).toLocaleString('cs-CZ')}`, unit: 'tis. Kč', sub: `příjmy ${money(f.inc)} · výdaje ${money(f.exp)}`, img: 'finance', href: '#/finance/prehled' })}
  </section>
  ${workspaceHTML('prehled', { title: 'Pracovní plocha', kicker: 'Dnes & sbírka' })}`;
}
export function mount(host) { mountWorkspace(host); }
