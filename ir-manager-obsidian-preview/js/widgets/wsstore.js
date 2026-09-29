// Úložiště pracovních ploch (oddělené od provozních dat: Zpět / reset dema nikdy nesmaže rozvržení ani poznámky).
//   layouts[klíč] = [instance]  instance = { id, type, size, title, accent, frame, icon, density, collapsed, cfg, docId }
//   docs[docId]   = { kind: 'shopping' | 'notes' | 'checklist' | 'links', title, accent, items | text, pinned, archived, updated }
const KEY = 'irmO.ws.v1';
let S = null;
const subs = new Set();
export const wsStatus = { saved: true, savedAt: 0 };
const blank = () => ({ v: 1, layouts: {}, docs: {} });
export function ws() {
  if (S) return S;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { S = null; }
  if (!S || S.v !== 1) S = blank();
  return S;
}
let t = null;
export function saveWs(immediate = false) {
  wsStatus.saved = false; for (const f of subs) f('saving');
  clearTimeout(t);
  const go = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} wsStatus.saved = true; wsStatus.savedAt = Date.now(); for (const f of subs) f('saved'); };
  if (immediate) go(); else t = setTimeout(go, 400);
}
export const onWs = (f) => { subs.add(f); return () => subs.delete(f); };
export const wid = (p = 'w') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const doc = (id) => ws().docs[id];
const TITLES = { shopping: 'Nákupní seznam', notes: 'Poznámky', checklist: 'Checklist', links: 'Rychlé odkazy' };
export function newDoc(kind, init = {}) {
  const id = wid(kind[0]);
  const base = { kind, title: init.title || TITLES[kind], accent: init.accent || 'neutral', updated: Date.now(), pinned: false, archived: false };
  ws().docs[id] = { ...base, ...(kind === 'notes' ? { text: init.text || '' } : { items: init.items || [] }), ...init, kind };
  saveWs(); return id;
}
export function docsOf(kind, { archived = false } = {}) {
  return Object.entries(ws().docs).filter(([, d]) => d.kind === kind && !!d.archived === archived).map(([id, d]) => ({ id, ...d })).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated - a.updated);
}
export function resetWs() { S = blank(); saveWs(true); }
