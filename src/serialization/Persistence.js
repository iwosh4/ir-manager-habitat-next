import { SCHEMA, VERSION } from '../model/RoomDocument.js';

const AUTOSAVE_KEY = 'irm.habitat-studio.autosave.v1';
const PREFS_KEY = 'irm.habitat-studio.prefs.v1';

/** Browser storage wrappers: never throw (private mode, quota, disabled storage). */
function readLS(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; } }
function writeLS(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } }

/**
 * JSON import/export and autosave. The exported file is exactly the logical document
 * (schema `ir-manager/habitat-room`, version 1) — see ARCHITECTURE.md for the format.
 */
export class Persistence {
  constructor(editor, { onError } = {}) {
    this.editor = editor;
    this.onError = onError || (() => {});
    this._t = null;
    editor.on('change', () => this.scheduleAutosave());
  }

  exportJSON() {
    const doc = this.editor.toJSON();
    const text = JSON.stringify(doc, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    const safe = (doc.room.name || 'room').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.href = URL.createObjectURL(blob);
    a.download = `habitat-${safe || 'room'}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return text;
  }

  async importFile(file) {
    const text = await file.text();
    return this.importText(text);
  }

  importText(text) {
    let json;
    try { json = JSON.parse(text); } catch (e) { throw new Error('The file is not valid JSON.'); }
    this.editor.load(json, { reason: 'import' });
    return this.editor.doc;
  }

  scheduleAutosave() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.autosave(), 400);
  }

  autosave() { return writeLS(AUTOSAVE_KEY, { savedAt: Date.now(), doc: this.editor.doc }); }

  restore() {
    const data = readLS(AUTOSAVE_KEY);
    if (!data?.doc || data.doc.schema !== SCHEMA || (data.doc.version || 1) > VERSION) return false;
    try { this.editor.load(data.doc, { reason: 'restore' }); return true; } catch (e) { console.warn('[autosave] discarded', e); return false; }
  }

  clearAutosave() { try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ } }

  static prefs() { return readLS(PREFS_KEY) || {}; }
  static savePrefs(p) { writeLS(PREFS_KEY, { ...Persistence.prefs(), ...p }); }
}
