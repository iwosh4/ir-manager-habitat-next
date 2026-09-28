// SETTINGS — every change applies immediately (no Save button), with undo via the toast.
import { esc, actions } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { confirmDialog, toast } from '../core/overlay.js';
import { setLang } from '../core/i18n.js';
import { TYPE } from '../engine/ops.js';
import { QR_ACTIONS } from '../ui/quickrecord.js';
import { ws, saveWs, resetWs } from '../widgets/wsstore.js';
import { DEFAULTS, PRESETS } from '../widgets/registry.js';
import { SPECIES, latin } from '../data/species.js';

const NAMES = { app: 'Application', activities: 'Activities', care: 'Care defaults', notifications: 'Notifications', language: 'Language & units', profile: 'Profile', workspace: 'Workspaces & data' };
export function context(r) { return { sub: 'Changes apply instantly · undo with Ctrl+Z', actions: [] }; }
const sw = (act, on, label, hint = '', data = '') => `<label class="set-row"><span><b>${label}</b>${hint ? `<em>${hint}</em>` : ''}</span><input type="checkbox" class="switch" data-change="${act}" ${data} ${on ? 'checked' : ''}></label>`;
const segRow = (label, hint, act, cur, opts) => `<div class="set-row"><span><b>${label}</b>${hint ? `<em>${hint}</em>` : ''}</span><div class="seg">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div></div>`;

export function render(r) {
  const sub = r.sub || 'app', db = store.get(), P = db.prefs;
  let body = '';
  if (sub === 'app') body = `${segRow('Theme', 'Graphite lab (dark) or paper (light)', 'st-theme', P.theme, [['dark', 'Dark'], ['light', 'Light']])}${segRow('Start page', 'What opens when you launch the app', 'st-start', P.startView, [['dashboard', 'Dashboard'], ['tasks', 'Tasks'], ['planner', 'Planner'], ['animals', 'Animals']])}${sw('st-rail', document.body.classList.contains('rail-c'), 'Collapsed navigation rail', 'Icons only on desktop')}
    <div class="set-row"><span><b>Keyboard shortcuts</b><em>Q record · / search · N new · T tools · G then D/P/T/A/R/H/E/I/F go to · Ctrl+Z undo · ? help</em></span><button class="btn sm" data-act="st-keys">${icon('keyboard')}Show</button></div>`;
  if (sub === 'activities') { const c = db.activityCfg || {}; const ord = QR_ACTIONS.slice().sort((a, b) => ((c.order || []).indexOf(a[0]) + 1 || 99) - ((c.order || []).indexOf(b[0]) + 1 || 99));
    body = `<p class="muted">Order and visibility of the Quick Record tiles (keys 1–0 follow this order).</p><ol class="act-list">${ord.map(([k, l, ic], i) => `<li class="${(c.hidden || []).includes(k) ? 'off' : ''}"><span class="tdot" style="--c:${TYPE[k]?.color || 'var(--amber)'}">${icon(ic)}</span><b>${l}</b><kbd>${(i + 1) % 10}</kbd><span class="spacer"></span><button class="icon-btn sm" data-act="st-act-up" data-k="${k}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('arrowUp')}</button><button class="icon-btn sm" data-act="st-act-down" data-k="${k}" ${i === ord.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('arrowDown')}</button><input type="checkbox" class="switch" data-change="st-act-vis" data-k="${k}" ${(c.hidden || []).includes(k) ? '' : 'checked'} aria-label="Show ${l}"></li>`).join('')}</ol>`; }
  if (sub === 'care') body = `${segRow('Overdue after', 'Grace period before an item turns red', 'st-grace', P.grace ?? 30, [[15, '15 min'], [30, '30 min'], [60, '1 h'], [120, '2 h']])}${sw('st-flag', P.autoStock !== false, 'Deduct feeders from stock automatically', 'Feeding plans with a linked stock item', 'data-k="autoStock"')}${sw('st-flag', P.autoRotation !== false, 'Apply supplement rotation automatically', 'Next supplement is written into each feeding record', 'data-k="autoRotation"')}${sw('st-flag', P.groupSame !== false, 'Group identical work in the Planner', 'e.g. “Feeding ×8” as one card', 'data-k="groupSame"')}
    <h4>Species care templates</h4><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Species</th><th>Feeder</th><th>Every</th><th>Day °C</th><th>RH %</th></tr></thead><tbody>${Object.values(SPECIES).map((s) => `<tr><td><i class="latin">${esc(latin(s))}</i></td><td class="dim">${esc(s.feeding.feeder)}</td><td>${s.feeding.every} d</td><td>${s.env.day.join('–')}</td><td>${s.env.rh.join('–')}</td></tr>`).join('')}</tbody></table></div>`;
  if (sub === 'notifications') body = `${[['overdue', 'Overdue care', 'Feeding, water, misting, weighing past due'], ['incubation', 'Incubation windows', 'Hatch windows opening, checks due'], ['health', 'Health follow-ups & doses', ''], ['stock', 'Low stock', 'Below minimum, runs out soon'], ['repro', 'Reproduction steps', 'Phase changes and next steps']].map(([k, l, h]) => sw('st-notify', P.notify?.[k] !== false, l, h, `data-k="${k}"`)).join('')}${segRow('Quiet hours', 'No push reminders at night', 'st-quiet', (P.quietHours || []).join('-'), [['22-7', '22–7'], ['23-6', '23–6'], ['', 'Off']])}`;
  if (sub === 'language') body = `${segRow('Language', 'Navigation & core actions', 'st-lang', P.lang, [['en', 'English'], ['cs', 'Čeština']])}${segRow('Weight', '', 'st-unit', P.weightUnit, [['g', 'grams'], ['oz', 'ounces']])}${segRow('Temperature', '', 'st-temp', P.tempUnit, [['C', '°C'], ['F', '°F']])}<p class="muted small">Latin names are always primary; common names follow the language.</p>`;
  if (sub === 'profile') body = `<div class="field"><label>Name</label><input value="${esc(db.user.name)}" data-change="st-user" data-k="name"></div><div class="field"><label>Role / room</label><input value="${esc(db.user.role)}" data-change="st-user" data-k="role"></div>`;
  if (sub === 'workspace') { const S = ws(); body = `<h4>Workspaces</h4>${Object.keys(DEFAULTS).map((k) => `<div class="set-row"><span><b>${k[0].toUpperCase() + k.slice(1)}</b><em>${(S.layouts[k] || []).length || DEFAULTS[k].length} widgets${S.layouts[k] ? ' · customised' : ' · default'}</em></span><button class="btn sm ghost" data-act="st-ws-reset" data-k="${k}" ${S.layouts[k] ? '' : 'disabled'}>${icon('undo')}Reset</button></div>`).join('')}
    <div class="set-row"><span><b>Dashboard preset</b><em>Replace the dashboard layout</em></span><div class="seg">${Object.entries(PRESETS).map(([k, p]) => `<button data-act="st-preset" data-v="${k}">${esc(p.name.split(' (')[0])}</button>`).join('')}</div></div>
    <h4>Data</h4><div class="set-row"><span><b>Export</b><em>Download all demo data as JSON</em></span><button class="btn sm" data-act="st-export">${icon('download')}Export</button></div>
    <div class="set-row"><span><b>Reset demo data</b><em>Regenerates the collection relative to today</em></span><button class="btn sm danger" data-act="st-reset">${icon('refresh')}Reset demo</button></div>
    <div class="set-row"><span><b>Reset workspaces & notes</b><em>All widgets, shopping lists, notes, checklists</em></span><button class="btn sm danger" data-act="st-wsall">${icon('trash')}Reset</button></div>
    <p class="muted small">${icon('shield')} Concept B stores everything in this browser (localStorage). It never talks to the production IR Manager database.</p>`; }
  return `<div class="set"><h2 class="set-h">${NAMES[sub] || 'Settings'}</h2><div class="card"><div class="card-b set-b">${body}</div></div></div>`;
}
const pref = (label, fn) => { store.mutate(label, (d) => fn(d.prefs)); toast(`${label}`, { undo: () => store.undo(), ms: 3000 }); };
const moveAct = (k, dir) => store.mutate('Activity order', (d) => { const c = d.activityCfg ||= { order: QR_ACTIONS.map((a) => a[0]), hidden: [] }; if (!c.order?.length) c.order = QR_ACTIONS.map((a) => a[0]); const i = c.order.indexOf(k), j = i + dir; if (j < 0 || j >= c.order.length) return; [c.order[i], c.order[j]] = [c.order[j], c.order[i]]; });
actions({
  'st-theme': (el) => { pref('Theme changed', (p) => { p.theme = el.dataset.v; }); document.documentElement.dataset.theme = el.dataset.v; },
  'st-start': (el) => pref('Start page changed', (p) => { p.startView = el.dataset.v; }),
  'st-rail': (el) => { document.body.classList.toggle('rail-c', el.checked); try { localStorage.setItem('irmB.rail', el.checked ? 'c' : ''); } catch {} },
  'st-keys': () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })),
  'st-act-up': (el) => moveAct(el.dataset.k, -1),
  'st-act-down': (el) => moveAct(el.dataset.k, 1),
  'st-act-vis': (el) => store.mutate('Activity visibility', (d) => { const c = d.activityCfg ||= { order: QR_ACTIONS.map((a) => a[0]), hidden: [] }; c.hidden = (c.hidden || []).filter((x) => x !== el.dataset.k); if (!el.checked) c.hidden.push(el.dataset.k); }),
  'st-grace': (el) => pref('Grace period changed', (p) => { p.grace = +el.dataset.v; }),
  'st-flag': (el) => pref('Care setting changed', (p) => { p[el.dataset.k] = el.checked; }),
  'st-notify': (el) => pref('Notification setting changed', (p) => { p.notify = { ...p.notify, [el.dataset.k]: el.checked }; }),
  'st-quiet': (el) => pref('Quiet hours changed', (p) => { p.quietHours = el.dataset.v ? el.dataset.v.split('-').map(Number) : []; }),
  'st-lang': (el) => { pref('Language changed', (p) => { p.lang = el.dataset.v; }); setLang(el.dataset.v); location.reload(); },
  'st-unit': (el) => pref('Unit changed', (p) => { p.weightUnit = el.dataset.v; }),
  'st-temp': (el) => pref('Unit changed', (p) => { p.tempUnit = el.dataset.v; }),
  'st-user': (el) => store.mutate('Profile changed', (d) => { d.user[el.dataset.k] = el.value; if (el.dataset.k === 'name') d.user.initials = el.value.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }),
  'st-ws-reset': (el) => { const S = ws(); delete S.layouts[el.dataset.k]; saveWs(true); toast('Workspace reset to default', { kind: 'info' }); store.emit('change'); },
  'st-preset': (el) => import('../widgets/workspace.js').then((m) => { const S = ws(), prev = S.layouts.dashboard, p = PRESETS[el.dataset.v]; S.layouts.dashboard = p.layout().map(m.materialize); saveWs(true); toast(`Dashboard preset “${p.name}” applied`, { undo: () => { S.layouts.dashboard = prev; saveWs(true); store.emit('change'); }, action: () => { location.hash = '#/dashboard'; }, actionLabel: 'View' }); store.emit('change'); }),
  'st-export': () => { const blob = new Blob([JSON.stringify(store.get(), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ir-manager-concept-b-demo.json'; a.click(); URL.revokeObjectURL(a.href); },
  'st-reset': async () => { if (await confirmDialog({ title: 'Reset demo data?', text: 'All records you added in this demo are replaced by a fresh collection relative to today.', ok: 'Reset' })) { store.reset(); toast('Demo data reset', { kind: 'info' }); } },
  'st-wsall': async () => { if (await confirmDialog({ title: 'Reset all workspaces?', text: 'Widgets, notes, shopping lists and checklists return to defaults.', ok: 'Reset' })) { resetWs(); store.emit('change'); toast('Workspaces reset', { kind: 'info' }); } },
});
