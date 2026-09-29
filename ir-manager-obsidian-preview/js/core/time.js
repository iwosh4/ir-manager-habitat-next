// Časové pomocníky (čeština). Demo sbírka je ukotvená k „teď“, takže Plánovač je vždy živý.
export const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;
export const now = () => Date.now();
export function startOfDay(t = now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const atTime = (day, hh, mm = 0) => startOfDay(day) + hh * HOUR + mm * MIN;
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
const WD = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const WDL = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const MO = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
const MOL = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const MOG = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
export const hm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** 29. 9. */
export const dShort = (t) => { const d = new Date(t); return `${d.getDate()}. ${d.getMonth() + 1}.`; };
/** 29. 9. 2026 */
export const dNum = (t) => { const d = new Date(t); return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`; };
/** úterý 29. září 2026 */
export const dLong = (t) => { const d = new Date(t); return `${WDL[d.getDay()]} ${d.getDate()}. ${MOG[d.getMonth()]} ${d.getFullYear()}`; };
export const dMonth = (t) => { const d = new Date(t); return `${MOL[d.getMonth()]} ${d.getFullYear()}`; };
export const wd = (t) => WD[new Date(t).getDay()];
export const wdLong = (t) => WDL[new Date(t).getDay()];
export const monthName = (m) => MOL[m];
export const monthShort = (m) => MO[m];
/** „Dnes“, „Zítra“, „Včera“, „čt 2. 10.“ */
export function dayLabel(t) {
  const d = daysBetween(now(), t);
  if (d === 0) return 'Dnes'; if (d === 1) return 'Zítra'; if (d === -1) return 'Včera';
  return `${wd(t)} ${dShort(t)}`;
}
/** relativně: „za 2 h“, „před 3 dny“, „teď“ */
export function rel(t, base = now()) {
  const dt = t - base, a = Math.abs(dt), f = dt >= 0;
  if (a < 2 * MIN) return 'teď';
  if (a < HOUR) return f ? `za ${Math.round(a / MIN)} min` : `před ${Math.round(a / MIN)} min`;
  if (a < DAY && daysBetween(base, t) === 0) return f ? `za ${Math.round(a / HOUR)} h` : `před ${Math.round(a / HOUR)} h`;
  const d = daysBetween(base, t);
  if (d === 1) return `zítra ${hm(t)}`; if (d === -1) return `včera ${hm(t)}`;
  return f ? `za ${d} ${plural(d, 'den', 'dny', 'dní')}` : `před ${-d} ${plural(-d, 'dnem', 'dny', 'dny')}`;
}
export function plural(n, one, few, many) { n = Math.abs(n); return n === 1 ? one : n >= 2 && n <= 4 ? few : many; }
export const ageText = (born) => {
  if (!born) return '—'; const d = daysBetween(born, now());
  if (d < 60) return `${d} ${plural(d, 'den', 'dny', 'dní')}`;
  const m = Math.floor(d / 30.44); if (m < 24) return `${m} měs.`;
  const y = Math.floor(m / 12), r = m % 12; return r ? `${y} ${plural(y, 'rok', 'roky', 'let')} ${r} měs.` : `${y} ${plural(y, 'rok', 'roky', 'let')}`;
};
export function toLocalInput(t) { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
export function toDateInput(t) { return toLocalInput(t).slice(0, 10); }
export const greeting = (t = now()) => { const h = new Date(t).getHours(); return h < 5 ? 'Dobrou noc' : h < 10 ? 'Dobré ráno' : h < 18 ? 'Dobrý den' : 'Dobrý večer'; };
