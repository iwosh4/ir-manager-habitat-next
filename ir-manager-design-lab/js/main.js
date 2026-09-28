// IR Manager Enterprise — Concept B. Boot, router, render loop.
import * as store from './core/store.js';
import { $, installDelegation } from './core/dom.js';
import { setLang } from './core/i18n.js';
import { shellHTML, renderContext, markActive, refreshBadges, refreshSync } from './ui/shell.js';
import { installGlobal } from './ui/global.js';
import { closeAll, closeMenu } from './core/overlay.js';

const VIEWS = {
  dashboard: () => import('./views/dashboard.js'), planner: () => import('./views/planner.js'), tasks: () => import('./views/tasks.js'),
  animals: () => import('./views/animals.js'), reproduction: () => import('./views/reproduction.js'), health: () => import('./views/health.js'), enclosures: () => import('./views/enclosures.js'),
  inventory: () => import('./views/inventory.js'), finance: () => import('./views/finance.js'), sales: () => import('./views/sales.js'), directory: () => import('./views/directory.js'), genetics: () => import('./views/genetics.js'),
  tools: () => import('./views/tools.js'), settings: () => import('./views/settings.js'),
};

export const app = { route: null, view: null };
window.irm = app; // debugging / e2e access

export function parseRoute(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('?');
  const seg = parts[0].split('/').filter(Boolean).map(decodeURIComponent);
  const mod = VIEWS[seg[0]] ? seg[0] : 'dashboard';
  return { mod, sub: seg[1] || null, id: seg[2] || null, rest: seg.slice(3), q: new URLSearchParams(parts[1] || ''), hash };
}

let renderQueued = false, token = 0;
export function rerender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => setTimeout(() => { renderQueued = false; render(true); }, 0)); } // paint optimistic feedback first, then re-render

function render(keep = false) {
  const v = app.view, r = app.route; if (!v || !r) return;
  const host = $('#view');
  const st = keep ? host.scrollTop : 0;
  const ae = document.activeElement, focusId = keep && ae?.closest('#view') ? ae.id : null;
  let selS = null, selE = null; try { selS = ae?.selectionStart; selE = ae?.selectionEnd; } catch {}
  const html = v.render(r);
  host.innerHTML = `<div class="page page-${r.mod}">${html}</div>`;
  renderContext(r, v.context?.(r) || {});
  v.mount?.(host, r);
  host.scrollTop = st;
  if (focusId) { const f = document.getElementById(focusId); if (f) { f.focus({ preventScroll: true }); try { if (selS != null) f.setSelectionRange(selS, selE); } catch {} } }
  markActive(r);
}

async function navigate() {
  const r = parseRoute();
  const my = ++token;
  closeMenu();
  const mod = await VIEWS[r.mod]();
  if (my !== token) return;
  const same = app.route && app.route.mod === r.mod && app.route.sub === r.sub && app.route.id === r.id;
  app.route = r; app.view = mod;
  mod.onEnter?.(r);
  render(same);
  if (!same) { $('#view').scrollTop = 0; document.title = `${document.querySelector('.ctx-t h1')?.textContent || 'IR Manager'} · IR Manager Concept B`; }
}

function boot() {
  const db = store.load();
  document.documentElement.dataset.theme = db.prefs.theme || 'dark';
  setLang(db.prefs.lang);
  try { if (localStorage.getItem('irmB.rail') === 'c') document.body.classList.add('rail-c'); } catch {}
  $('#app').innerHTML = shellHTML();
  installDelegation(document);
  installGlobal({ rerender, navigate, app });
  store.on((reason) => {
    if (reason === 'saving' || reason === 'saved') { refreshSync(); return; }
    if (reason === 'reset') { $('#app').innerHTML = shellHTML(); navigate(); }
    rerender(); refreshBadges();
  });
  window.addEventListener('hashchange', navigate);
  if (!location.hash) history.replaceState(null, '', `#/${db.prefs.startView || 'dashboard'}`);
  navigate().then(() => { refreshBadges(); refreshSync(); document.body.classList.add('ready'); });
  // refresh "now" once a minute (timeline NOW line, overdue states) — no continuous rendering
  setInterval(() => { if (!document.hidden) { rerender(); refreshBadges(); } }, 60e3);
}
boot();
export { closeAll };
