/**
 * Dimension convention — the ONE place that decides how sizes are shown to the user.
 *
 * USER-FACING ORDER IS LOCKED: WIDTH × DEPTH × HEIGHT  (W × D × H · cs: Š × H × V)
 *   "60 × 45 × 90 cm" = 60 wide, 45 deep, 90 high.
 *
 * Internally sizes keep their semantic property names (templates: {width, height, depth};
 * room objects / modules / reserved spaces: {w, h, d}) — only the presentation order is fixed here.
 * Never build "a × b × c" dimension strings by hand elsewhere; use formatDims / dimsLabel.
 */

/** Presentation order and labels (Czech prepared for localisation). */
export const DIM_ORDER = ['width', 'depth', 'height'];
export const DIM_LABELS = {
  en: { width: 'Width', depth: 'Depth', height: 'Height', short: { width: 'W', depth: 'D', height: 'H' }, order: 'W × D × H' },
  cs: { width: 'Šířka', depth: 'Hloubka', height: 'Výška', short: { width: 'Š', depth: 'H', height: 'V' }, order: 'Š × H × V' },
};
let LANG = 'en';
export const setDimLanguage = (l) => { if (DIM_LABELS[l]) LANG = l; };
export const dimLabel = (axis) => DIM_LABELS[LANG][axis];
export const dimShort = (axis) => DIM_LABELS[LANG].short[axis];
/** "W × D × H" (or "Š × H × V"). */
export const dimsOrderLabel = () => DIM_LABELS[LANG].order;

/** Accepts {width, height, depth} or {w, h, d}; returns {width, depth, height} in metres (semantics preserved). */
export function dimsOf(s) {
  if (!s) return { width: 0, depth: 0, height: 0 };
  if ('width' in s || 'height' in s || 'depth' in s) return { width: +s.width || 0, depth: +s.depth || 0, height: +s.height || 0 };
  return { width: +s.w || 0, depth: +s.d || 0, height: +s.h || 0 };
}

/** metres → cm value for display (0.1 cm precision, no trailing zeros). */
export const toCm = (m) => Math.round(m * 1000) / 10;
/** cm value typed by the user → metres. */
export const fromCm = (cm) => Math.round(+cm * 10) / 1000;

/**
 * "60 × 45 × 90 cm" — ALWAYS width × depth × height.
 * opts.unit: 'cm' (default) | 'm' | '' (no unit) · opts.sep: ' × ' (default) or '×' for compact cards.
 */
export function formatDims(s, { unit = 'cm', sep = ' × ' } = {}) {
  const d = dimsOf(s);
  const f = unit === 'm' ? (v) => (+v.toFixed(2)).toString() : (v) => String(toCm(v));
  return DIM_ORDER.map((k) => f(d[k])).join(sep) + (unit ? ` ${unit}` : '');
}

/**
 * Parse "60 × 45 × 90", "60x45x90 cm", "60*45*90" — interpreted as W × D × H (cm unless 'm' given).
 * Returns {width, depth, height} in metres or null.
 */
export function parseDims(str) {
  if (typeof str !== 'string') return null;
  const m = str.trim().match(/^(\d+(?:[.,]\d+)?)\s*[×x*]\s*(\d+(?:[.,]\d+)?)\s*[×x*]\s*(\d+(?:[.,]\d+)?)\s*(cm|m)?$/i);
  if (!m) return null;
  const k = (m[4] || 'cm').toLowerCase() === 'm' ? 1 : 0.01, n = (v) => Math.round(parseFloat(v.replace(',', '.')) * k * 10000) / 10000;
  return { width: n(m[1]), depth: n(m[2]), height: n(m[3]) };
}
