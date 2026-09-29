/**
 * IR Manager integration — the MySQL database (via app-manager/api.php) is the source of truth.
 *
 *  load():  GET  api.php?a=habitat.load&room=<key>  → { doc, revision }   (Manager enclosures are merged in
 *           server-side as MY ENCLOSURES; assemblies ↔ Manager "Sestavy"; never a demo room)
 *  save():  POST api.php?a=habitat.save  { room, revision, doc }  → { revision, created, assemblies }
 *           optimistic concurrency: a stale revision returns 409 → the user chooses reload or overwrite.
 *  cache:   every change is also written to localStorage as an EMERGENCY copy (never authoritative);
 *           a copy newer than the server (unsynced after a crash / offline) is offered for restore.
 *
 * The standalone Habitat Studio (no window.IR_HABITAT) keeps its original localStorage behaviour.
 */
const CACHE_PREFIX = 'irm.habitat.server-cache.v1.';

export class ManagerBridge {
  constructor(cfg) {
    this.cfg = cfg;
    this.room = cfg.room || 'main';
    this.revision = 0;
    this.state = 'idle';          // idle | saving | saved | dirty | offline | conflict | error
    this.listeners = new Set();
    this._t = null; this._inflight = null; this._pending = false; this._lastJSON = '';
  }
  /** Content key of a document — ignores the volatile meta.modified stamp added by Editor.toJSON(). */
  static key(doc) { const m = doc?.meta ? { ...doc.meta, modified: undefined } : undefined; return JSON.stringify({ ...doc, meta: m }); }
  markClean(doc) { this._lastJSON = ManagerBridge.key(doc); }
  static fromPage() { return window.IR_HABITAT && window.IR_HABITAT.api ? new ManagerBridge(window.IR_HABITAT) : null; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _set(state, detail = '') { this.state = state; this.detail = detail; for (const fn of this.listeners) try { fn(state, detail); } catch { /* ignore */ } }

  _url(action, extra = '') { return `${this.cfg.api}?a=${encodeURIComponent(action)}&room=${encodeURIComponent(this.room)}${extra}`; }
  async _json(res) { let j = null; try { j = await res.json(); } catch { /* not JSON */ } return j || { ok: false, message: `HTTP ${res.status}` }; }

  async load() {
    const res = await fetch(this._url('habitat.load'), { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const j = await this._json(res);
    if (res.status === 401) { this._set('error', 'Relace vypršela — přihlaste se znovu v IR Manageru.'); throw new Error('Nepřihlášeno'); }
    if (!j.ok) throw new Error(j.message || 'Místnost se nepodařilo načíst.');
    this.revision = j.revision | 0;
    this.rooms = j.rooms || [];
    this._lastJSON = ManagerBridge.key(j.doc);
    this._set('saved');
    return j.doc;
  }

  // ---------------------------------------------------------------- emergency cache (per account + room)
  get _cacheKey() { return CACHE_PREFIX + (this.cfg.account || 0) + '.' + this.room; }
  cache(doc, unsynced) { try { localStorage.setItem(this._cacheKey, JSON.stringify({ at: Date.now(), baseRevision: this.revision, unsynced: !!unsynced, doc })); } catch { /* quota / private mode */ } }
  readCache() { try { const s = localStorage.getItem(this._cacheKey); return s ? JSON.parse(s) : null; } catch { return null; } }
  clearCache() { try { localStorage.removeItem(this._cacheKey); } catch { /* ignore */ } }

  /** Debounced save of the current document (called on every editor change). */
  schedule(doc, delay = 1200) {
    if (this.cfg.readonly) return;
    const json = ManagerBridge.key(doc);
    if (json === this._lastJSON) { if (this.state === 'dirty') this._set('saved'); return; }
    this.cache(doc, true);
    this._set('dirty');
    this._doc = doc;
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), delay);
  }

  async flush({ force = false } = {}) {
    clearTimeout(this._t);
    if (!this._doc || this.cfg.readonly) return;
    if (this._inflight) { this._pending = true; return this._inflight; }
    const doc = this._doc, json = ManagerBridge.key(doc);
    if (json === this._lastJSON && !force) { this._set('saved'); return; }
    this._set('saving');
    this._inflight = (async () => {
      try {
        const res = await fetch(this._url('habitat.save'), {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': this.cfg.csrf },
          body: JSON.stringify({ room: this.room, revision: force ? this.serverRevision ?? this.revision : this.revision, doc }),
        });
        const j = await this._json(res);
        if (res.status === 409) { this.serverRevision = j.revision; this._set('conflict', j.message || 'Místnost mezitím změnil někdo jiný.'); return; }
        if (res.status === 401) { this._set('error', 'Relace vypršela — přihlaste se znovu. Změny jsou v nouzové kopii.'); return; }
        if (!j.ok) { this._set('error', j.message || 'Uložení selhalo.'); return; }
        this.revision = j.revision; this._lastJSON = json; this.cache(doc, false);
        this.lastResult = j;
        this._set('saved');
      } catch (e) {
        this._set('offline', 'Bez připojení — změny se uloží, jakmile bude server dostupný.');
        setTimeout(() => this.flush(), 8000);
      } finally {
        this._inflight = null;
        if (this._pending) { this._pending = false; setTimeout(() => this.flush(), 50); }
      }
    })();
    return this._inflight;
  }

  /** Keep-alive save while leaving the page (best effort; the emergency cache covers failures). */
  beacon() {
    if (!this._doc || ManagerBridge.key(this._doc) === this._lastJSON || this.cfg.readonly) return;
    this.cache(this._doc, true);
    try {
      fetch(this._url('habitat.save'), { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.cfg.csrf }, body: JSON.stringify({ room: this.room, revision: this.revision, doc: this._doc }) });
    } catch { /* ignore */ }
  }

  backUrl() { return this.cfg.returnUrl || 'habitats.php'; }
}
