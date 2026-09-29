// Potvrzení práce: „✓ Zapsáno · [Zpět]“ — nízká stopa, žádný modální dialog.
import { toast } from '../core/overlay.js';
import * as store from '../core/store.js';

export function done(res, { edit, msg } = {}) {
  if (!res) return;
  const label = msg || res.label || 'Zapsáno';
  toast(label, { undo: () => store.undo(), action: edit ? () => edit(res) : null, actionLabel: 'Upravit' });
}
export const info = (m) => toast(m, { kind: 'info', ms: 3200 });
export const warn = (m) => toast(m, { kind: 'warn', ms: 4200 });
