// Feedback after actions: SAVED → UNDO (instead of confirmations), plus "Edit" for the record just written.
import { toast } from '../core/overlay.js';
import * as store from '../core/store.js';
export function done(res, { edit } = {}) {
  if (!res) return;
  toast(res.label, {
    undo: () => { const l = store.undo(); if (l) toast(`Undone: ${l}`, { kind: 'info', ms: 2500 }); },
    action: edit ? () => edit(res) : null, actionLabel: 'Edit',
  });
}
export function info(msg) { toast(msg, { kind: 'info', ms: 3000 }); }
