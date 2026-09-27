/** Tiny synchronous event emitter. */
export class Emitter {
  constructor() { this._h = new Map(); }
  on(evt, fn) { if (!this._h.has(evt)) this._h.set(evt, new Set()); this._h.get(evt).add(fn); return () => this.off(evt, fn); }
  off(evt, fn) { this._h.get(evt)?.delete(fn); }
  emit(evt, ...args) { for (const fn of [...(this._h.get(evt) || [])]) { try { fn(...args); } catch (e) { console.error(`[event ${evt}]`, e); } } }
}
