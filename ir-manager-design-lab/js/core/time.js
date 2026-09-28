// Time helpers. The demo collection is anchored to "now" so the Planner always looks alive.
export const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;
export const now = () => Date.now();
export function startOfDay(t = now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const atTime = (day, hh, mm = 0) => startOfDay(day) + hh * HOUR + mm * MIN;
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const hm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const dShort = (t) => { const d = new Date(t); return `${d.getDate()} ${MO[d.getMonth()]}`; };
export const dLong = (t) => { const d = new Date(t); return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]} ${d.getFullYear()}`; };
export const dMonth = (t) => { const d = new Date(t); return `${MO[d.getMonth()]} ${d.getFullYear()}`; };
export const wd = (t) => WD[new Date(t).getDay()];
export const monthName = (m) => MO[m];
/** "Today", "Tomorrow", "Yesterday", "Thu 2 Oct" */
export function dayLabel(t) {
  const d = daysBetween(now(), t);
  if (d === 0) return 'Today'; if (d === 1) return 'Tomorrow'; if (d === -1) return 'Yesterday';
  return `${wd(t)} ${dShort(t)}`;
}
/** relative: "in 2 h", "3 d ago", "now" */
export function rel(t, base = now()) {
  const dt = t - base, a = Math.abs(dt), f = dt >= 0;
  if (a < 2 * MIN) return 'now';
  if (a < HOUR) return f ? `in ${Math.round(a / MIN)} min` : `${Math.round(a / MIN)} min ago`;
  if (a < DAY && daysBetween(base, t) === 0) return f ? `in ${Math.round(a / HOUR)} h` : `${Math.round(a / HOUR)} h ago`;
  const d = daysBetween(base, t);
  if (d === 1) return `tomorrow ${hm(t)}`; if (d === -1) return `yesterday ${hm(t)}`;
  return f ? `in ${d} d` : `${-d} d ago`;
}
export const ageText = (born) => { if (!born) return '—'; const d = daysBetween(born, now()); if (d < 60) return `${d} d`; const m = Math.floor(d / 30.44); if (m < 24) return `${m} mo`; const y = Math.floor(m / 12), r = m % 12; return r ? `${y} y ${r} mo` : `${y} y`; };
export function toLocalInput(t) { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
export function toDateInput(t) { return toLocalInput(t).slice(0, 10); }
