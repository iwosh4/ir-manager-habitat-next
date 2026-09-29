// Store: one local database (fixtures on first run → localStorage), change events, snapshot undo.
// Planner, Tasks, Animal Profile, Quick Record and Reproduction all write into THE SAME records[] history.
import { generateDemo } from '../data/fixtures.js';
import { DAY, startOfDay } from './time.js';

const KEY = 'irmO.db.v1';
const listeners = new Set();
let db = null;
const undoStack = [], redoStack = [];
let saveTimer = null, saving = false;
export const status = { saved: true, savedAt: 0, storage: 'localStorage' };

export function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { db = JSON.parse(raw); if (db?.version === 1) { status.storage = 'localStorage'; return db; } } } catch (e) { console.warn('storage unavailable', e); status.storage = 'memory'; }
  db = generateDemo();
  seedHistory(db);
  persist(true);
  return db;
}
export const get = () => db;
export function reset() { try { localStorage.removeItem(KEY); } catch {} db = generateDemo(); seedHistory(db); undoStack.length = 0; redoStack.length = 0; persist(true); emit('reset'); }

export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(reason = 'change', detail) { for (const fn of listeners) fn(reason, detail); }

function persist(now = false) {
  status.saved = false; emit('saving');
  clearTimeout(saveTimer);
  const doSave = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); status.saved = true; status.savedAt = Date.now(); } catch (e) { status.storage = 'memory'; status.saved = true; } emit('saved'); };
  if (now) doSave(); else saveTimer = setTimeout(doSave, 350);
}

/**
 * Mutate the database. `label` → undoable step (snapshot); fn(db) performs the change.
 * Returns fn's result. opts.silent: persist without re-render (typing in notes etc.).
 */
export function mutate(label, fn, opts = {}) {
  if (label) { undoStack.push({ label, snap: JSON.stringify(db), at: Date.now() }); if (undoStack.length > 40) undoStack.shift(); redoStack.length = 0; }
  const r = fn(db);
  persist();
  if (!opts.silent) emit('change', { label });
  return r;
}
export function canUndo() { return undoStack.length > 0; }
export function lastUndoLabel() { return undoStack[undoStack.length - 1]?.label; }
export function undo() {
  const s = undoStack.pop(); if (!s) return null;
  redoStack.push({ label: s.label, snap: JSON.stringify(db) });
  db = JSON.parse(s.snap); persist(); emit('change', { undo: s.label }); return s.label;
}
export function redo() {
  const s = redoStack.pop(); if (!s) return null;
  undoStack.push({ label: s.label, snap: JSON.stringify(db) });
  db = JSON.parse(s.snap); persist(); emit('change', { redo: s.label }); return s.label;
}

// ------------------------------------------------------------------ first-run history: past occurrences completed
import { occurrences, recordFromOcc } from '../engine/ops.js';
function seedHistory(d) {
  const T0 = startOfDay(d.createdAt), from = T0 - 14 * DAY, nowTs = d.createdAt;
  // intentionally left open → visible as OVERDUE on first run
  const keepOpen = new Set();
  const occ = occurrences(d, from, nowTs + 1).sort((a, b) => a.due - b.due);
  for (const o of occ) {
    const isToday = o.due >= T0;
    if (isToday && o.due > nowTs - 60 * 60e3) continue; // poslední hodina zůstává otevřená („teď“)
    if (o.plan.id === 'p_weight_a_msp04' && o.due > T0 - 3 * DAY) { keepOpen.add(o.id); continue; }
    if (o.plan.id === 'p_clean_e_q1' && o.due > T0 - 3 * DAY) { keepOpen.add(o.id); continue; }
    if (o.plan.id === 'p_water_a_pl02' && o.due > T0 - 2 * DAY) { keepOpen.add(o.id); continue; }
    const skip = o.plan.type === 'feeding' && o.plan.subject === 'a_cc03' && o.due > T0 - 5 * DAY;
    if (skip) { d.occ[o.id] = { status: 'done', at: o.due + 20 * 60e3, by: 'history' }; const r = recordFromOcc(d, o, { refused: true, t: o.due + 20 * 60e3 }); r.source = 'history'; d.records.push(r); d.occ[o.id].recordId = r.id; continue; }
    const t = o.due + Math.round(((o.id.length * 7) % 40) * 60e3);
    const r = recordFromOcc(d, o, { t }); r.source = o.plan.auto ? 'automation' : 'history';
    d.records.push(r); d.occ[o.id] = { status: 'done', at: t, recordId: r.id, by: o.plan.auto ? 'automation' : 'history' };
  }
  d.records.sort((a, b) => a.t - b.t);
}
