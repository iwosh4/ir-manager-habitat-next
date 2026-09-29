// IR Manager · Obsidian Evolution — boot & router. Hash routes in Czech: #/modul/sekce/id?param
import { $, installDelegation, actions } from './core/dom.js';
import * as store from './core/store.js';
import { closeAll, closeMenu } from './core/overlay.js';
import { shellHTML, markActive, refreshBadges, setSync } from './ui/shell.js';
import { startLive, refreshLive } from './ui/live.js';
import { installGlobal } from './ui/global.js';
import { MODULES } from './nav.js';

const VIEWS = {
  prehled: () => import('./views/prehled.js'), zvirata: () => import('./views/zvirata.js'), ukoly: () => import('./views/ukoly.js'),
  zdravi: () => import('./views/zdravi.js'), ubikace: () => import('./views/ubikace.js'), reprodukce: () => import('./views/reprodukce.js'),
  sklad: () => import('./views/sklad.js'), finance: () => import('./views/finance.js'), adresar: () => import('./views/adresar.js'),
  nastroje: () => import('./views/nastroje.js'), nastaveni: () => import('./views/nastaveni.js'),
};
export const app = { route: null, view: null };
window.irm = app;

export function parseRoute(hash = location.hash) {
  const [path, qs] = hash.replace(/^#\/?/, '').split('?');
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  const mod = VIEWS[seg[0]] ? seg[0] : 'prehled';
  const subs = MODULES[mod]?.subs || [];
  return { mod, sub: seg[1] || subs[0]?.[0] || null, id: seg[2] || null, q: new URLSearchParams(qs || ''), hash };
}

let queued = false, token = 0;
export function rerender() { if (queued) return; queued = true; requestAnimationFrame(() => setTimeout(() => { queued = false; render(true); }, 0)); }

async function render(soft = false) {
  const r = parseRoute(), my = ++token;
  closeMenu();
  const mod = await VIEWS[r.mod]();
  if (my !== token) return;
  const host = $('#view');
  const moduleChanged = !app.route || app.route.mod !== r.mod || app.route.sub !== r.sub || app.route.id !== r.id;
  if (moduleChanged && !soft) { mod.onEnter?.(r); }
  const scroll = moduleChanged && !soft ? 0 : host.scrollTop;
  const focusId = document.activeElement?.id, sel = document.activeElement?.selectionStart;
  app.route = r; app.view = mod;
  host.innerHTML = mod.render(r);
  if (moduleChanged && !soft) { host.classList.remove('enter'); void host.offsetWidth; host.classList.add('enter'); }
  host.scrollTop = scroll;
  if (focusId) { const f = document.getElementById(focusId); if (f) { f.focus({ preventScroll: true }); try { if (sel != null) f.setSelectionRange(sel, sel); } catch {} } }
  mod.mount?.(host, r);
  markActive(r);
  document.title = `${MODULES[r.mod]?.label || 'Přehled'} · IR Manager`;
  refreshBadges();
}

function boot() {
  store.load();
  const db = store.get();
  db.prefs.live ||= { enabled: true };
  document.documentElement.dataset.motion = db.prefs.motion === 'off' ? 'off' : 'full';
  try { if (localStorage.getItem('irmO.sb') === 'c') document.body.classList.add('sb-c'); } catch {}
  const root = $('#app'); root.innerHTML = shellHTML(); root.removeAttribute('aria-busy');
  installDelegation(document);
  installGlobal({ app, rerender, parseRoute });
  store.on((reason) => {
    if (reason === 'saving') setSync('saving');
    else if (reason === 'saved') setSync(navigator.onLine ? 'saved' : 'offline');
    else if (reason === 'change' || reason === 'reset') { rerender(); refreshLive(); }
  });
  addEventListener('offline', () => setSync('offline')); addEventListener('online', () => setSync('saved'));
  addEventListener('hashchange', () => { closeAll(); render(); });
  if (!location.hash) history.replaceState(null, '', '#/prehled');
  render();
  startLive();
  setInterval(() => { rerender(); refreshLive(); }, 60e3); // time moves: NOW marker, overdue states
}
actions({ 'sb-toggle': () => { document.body.classList.toggle('sb-c'); try { localStorage.setItem('irmO.sb', document.body.classList.contains('sb-c') ? 'c' : ''); } catch {} markActive(app.route); } });
boot();
