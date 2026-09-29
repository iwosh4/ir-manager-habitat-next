// NASTAVENÍ — Aplikace · Živý pás & pohyb · Aktivity · Oznámení · Data & obnova.
import { esc, actions } from '../core/dom.js';
import { gl } from '../core/icons.js';
import * as store from '../core/store.js';
import { pageHead, block } from '../ui/components.js';
import { confirmDialog } from '../core/overlay.js';
import { info } from '../ui/feedback.js';
import { refreshLive } from '../ui/live.js';
import { resetWs } from '../widgets/wsstore.js';
import { TYPE } from '../engine/ops.js';

const row = (label, sub, ctl) => `<div class="set-r"><span class="li-main"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</span>${ctl}</div>`;
const sw = (key, on) => `<input type="checkbox" class="switch" data-change="set-sw" data-k="${key}" ${on ? 'checked' : ''} aria-label="${esc(key)}">`;
export function render(r) {
  const db = store.get(), P = db.prefs, L = P.live || {}, N = P.notify || {};
  let body = '';
  if (r.sub === 'zive') body = `<div class="g2">${block('Živý pás informací', [row('Zobrazit živý pás', 'Jednořádkový provozní pás pod hlavičkou', sw('live.enabled', L.enabled !== false)), row('Automatické střídání', 'Pomalé krokování zpráv (6,5 s) · pauza při najetí myší a na neaktivní kartě', sw('live.auto', L.auto !== false)), row('Prioritní zprávy mají přednost', 'Po termínu a zdravotní upozornění se zobrazí první', sw('live.prio', L.prio !== false))].join(''), { icon: 'reminder', level: 'primary' })}
    ${block('Pohyb', [row('Pohyb v rozhraní', 'Přechody a potvrzovací animace (vždy krátké, jen stav / změna / postup)', sw('motion', P.motion !== 'off')), row('Systémové nastavení', matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Systém žádá omezený pohyb — respektováno' : 'Systém nepožaduje omezení pohybu', '<span class="pill mute">auto</span>')].join(''), { icon: 'settings', level: 'secondary' })}</div>`;
  else if (r.sub === 'oznameni') body = block('Oznámení', [['overdue', 'Po termínu', 'Péče a úkoly po termínu'], ['health', 'Zdraví', 'Kontroly, dávky léků'], ['incubation', 'Inkubace', 'Okna líhnutí, kontroly snůšek'], ['repro', 'Reprodukce', 'Další kroky cyklů, změny fází'], ['stock', 'Sklad', 'Položky pod minimem']].map(([k, l, s]) => row(l, s, sw(`notify.${k}`, N[k] !== false))).join('') + row('Tiché hodiny', `${P.quietHours?.[0] ?? 22}:00 – ${P.quietHours?.[1] ?? 7}:00`, '<span class="pill mute">aktivní</span>'), { icon: 'notification', level: 'primary' });
  else if (r.sub === 'aktivity') body = block('Typy aktivit', `<div class="list">${Object.entries(TYPE).map(([k, T]) => `<div class="li"><span class="tt sm" style="--c:${T.color}"><img class="ico" src="assets/ir/icons/${T.icon}.webp" alt=""></span><span class="li-main"><b>${esc(T.label)}</b><span>potvrzení: ${esc(T.done)}</span></span><i class="acc-dot" style="--acc:${T.color}"></i></div>`).join('')}</div>`, { icon: 'care', level: 'secondary', sub: 'Jedna rodina ikon · barvy tlumené, aby oranžová zůstala pro prioritu' });
  else if (r.sub === 'data') body = `<div class="g2">${block('Data náhledu', `<p class="muted">Náhled ukládá vše jen v tomto prohlížeči (localStorage <span class="code">irmO.db.v1</span>, rozvržení <span class="code">irmO.ws.v1</span>). Produkční databáze se nepoužívá.</p><div class="row wrap sec"><button class="btn" data-act="set-export">${gl('arrow-down')}Export JSON</button><button class="btn danger" data-act="set-reset">${gl('sync')}Obnovit ukázková data</button><button class="btn tertiary" data-act="set-resetws">${gl('layout')}Obnovit rozvržení widgetů</button></div>`, { icon: 'save', level: 'primary' })}</div>`;
  else body = `<div class="g2">${block('Profil', [row('Jméno', esc(db.user.name), ''), row('Role', esc(db.user.role), ''), row('Jazyk', 'Čeština', '<span class="pill mute">cs</span>')].join(''), { icon: 'profile', level: 'secondary' })}${block('Jednotky', [row('Hmotnost', 'gramy', '<span class="pill mute">g</span>'), row('Teplota', 'stupně Celsia', '<span class="pill mute">°C</span>'), row('Měna', 'koruna česká', '<span class="pill mute">Kč</span>')].join(''), { icon: 'weight', level: 'secondary' })}</div>`;
  return `${pageHead({ mod: 'nastaveni', cur: r.sub, title: 'Nastavení', icon: 'settings', tabs: [['aplikace', 'Aplikace'], ['zive', 'Živý pás & pohyb'], ['aktivity', 'Aktivity'], ['oznameni', 'Oznámení'], ['data', 'Data & obnova']] })}${body}`;
}
actions({
  'set-sw': (el) => {
    const k = el.dataset.k, on = el.checked;
    store.mutate(null, (d) => { if (k === 'motion') d.prefs.motion = on ? 'full' : 'off'; else { const [a, b] = k.split('.'); d.prefs[a] = { ...(d.prefs[a] || {}), [b]: on }; } });
    if (k === 'motion') document.documentElement.dataset.motion = on ? 'full' : 'off';
    if (k.startsWith('live')) refreshLive({ force: true });
    info('Nastavení uloženo');
  },
  'set-reset': async () => { if (await confirmDialog({ title: 'Obnovit ukázková data?', text: 'Všechny změny v náhledu budou nahrazeny čerstvou ukázkovou sbírkou.', ok: 'Obnovit' })) { store.reset(); info('Ukázková data obnovena'); } },
  'set-resetws': async () => { if (await confirmDialog({ title: 'Obnovit rozvržení?', text: 'Všechny plochy, poznámky a nákupní seznamy se vrátí do výchozího stavu.', ok: 'Obnovit' })) { resetWs(); store.emit('change'); info('Rozvržení obnoveno'); } },
  'set-export': () => { const b = new Blob([JSON.stringify(store.get(), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'ir-manager-nahled.json'; a.click(); },
});
