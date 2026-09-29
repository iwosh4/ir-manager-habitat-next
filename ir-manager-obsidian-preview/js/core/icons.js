// IR icon system — one family, two tiers, both from IR Manager's own asset library:
//  ico(name)  → glossy IR illustration icon (assets/ir/icons/*.webp, cleaned + re-centred from the current app)
//  gl(name)   → IR line glyph (assets/ir/sprite.svg, extended in the same style by sprite-ext.svg)
//  tile(name) → glossy icon on the obsidian tile used for module headings, KPIs and quick actions
const GLOSSY = new Set(['add', 'admin', 'animals', 'automation', 'calendar-31', 'calendar', 'care', 'checklist', 'cleaning', 'clock-action', 'dashboard', 'delete', 'edit', 'feces', 'feeding', 'feeding-tongs', 'finance', 'first-aid', 'groups', 'habitat', 'health', 'heating', 'help', 'humidity', 'inventory', 'lighting', 'logout', 'mist', 'notification', 'ok-action', 'other', 'parasite', 'photo', 'profile', 'qr-info', 'quarantine', 'quick-add', 'reminder', 'repeat-action', 'reproduction', 'save', 'scan', 'search', 'settings', 'shedding', 'status-ok', 'status-warning', 'supplement', 'tasks', 'temperature', 'view', 'water', 'weight']);
const BASE = new Set(['dashboard', 'snake', 'animals', 'care', 'reproduction', 'health', 'habitat', 'inventory', 'finance', 'calendar', 'documents', 'stats', 'community', 'settings', 'user', 'module', 'palette', 'help', 'backup', 'logout', 'mic', 'scan', 'nfc', 'bolt', 'bell', 'camera', 'feeding', 'water', 'humidity', 'clean', 'weight', 'vitamin', 'temperature', 'task', 'egg', 'activity', 'clock', 'search', 'plus', 'check', 'arrow-right', 'chevron-down', 'menu', 'more', 'grid', 'list', 'filter', 'edit', 'thermometer', 'droplet', 'box', 'wallet', 'heart-pulse', 'tag', 'dna', 'file', 'chevron-left', 'chevron-right', 'lighting', 'medication', 'misting', 'quarantine', 'shed', 'veterinary', 'water-change']);
const ALIAS = { mist: 'misting', cleaning: 'clean', shedding: 'shed', 'first-aid': 'medication', tasks: 'task', quick: 'plus', notification: 'bell', repro: 'reproduction' };

export function gl(name, cls = '') {
  const n = BASE.has(name) ? name : ALIAS[name] && BASE.has(ALIAS[name]) ? ALIAS[name] : name;
  const file = BASE.has(n) ? 'sprite.svg' : 'sprite-ext.svg';
  return `<svg class="gl ${cls}" aria-hidden="true"><use href="assets/ir/${file}#${n}"></use></svg>`;
}
export function ico(name, cls = '') {
  if (!GLOSSY.has(name)) return gl(name, cls);
  return `<img class="ico ${cls}" src="assets/ir/icons/${name}.webp" alt="" aria-hidden="true" decoding="async">`;
}
export const tile = (name, cls = '') => `<span class="tile ${cls}">${ico(name)}</span>`;
export const hasGlossy = (n) => GLOSSY.has(n);
