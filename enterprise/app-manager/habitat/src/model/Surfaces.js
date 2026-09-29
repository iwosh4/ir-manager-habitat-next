/**
 * Room surfaces (Habitat Studio 4.2) — the logical catalogue of wall and floor finishes.
 *
 * A surface is pure data: label, family, and how each renderer draws it:
 *   tile / tint / uvScale  → PLANNER painted atlas (tint multiplies the painted tile)
 *   color / roughness      → SHOWCASE physical material (+ optional texture set of the MaterialLibrary)
 *   relief                 → extra geometry in front of the wall (wooden slats, panel seams)
 * Per-wall data lives in room.walls[wall] = { surface, color, finish, coverHeight, profile } (see
 * RoomDocument.normalizeWalls); the floor in room.floor = { surface, color }.
 */

const lin = (hex) => { // sRGB hex → linear rgb triplet
  const c = parseInt(String(hex).replace('#', ''), 16);
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
};
// the painted tiles are mid-value; a tint maps "tile average" → target colour
const tintFor = (hex, base = 0.215, gain = 1) => lin(hex).map((v) => Math.min(4, (v / base) * gain + 0.02));

export const WALL_SURFACES = {
  // ---------------------------------------------------------------------- paint
  paint_white: { label: 'White paint', family: 'paint', color: '#eeece6' },
  paint_light_grey: { label: 'Light grey', family: 'paint', color: '#c9c8c4' },
  paint_warm_grey: { label: 'Warm grey (classic)', family: 'paint', color: '#b3aca2' },
  paint_dark_grey: { label: 'Dark grey', family: 'paint', color: '#6c6d70' },
  paint_anthracite: { label: 'Anthracite', family: 'paint', color: '#3a3c41' },
  paint_beige: { label: 'Beige', family: 'paint', color: '#d6c6a8' },
  paint_custom: { label: 'Custom colour', family: 'paint', color: '#8fa39a', custom: true },
  // ---------------------------------------------------------------------- claddings & decors
  laminate_black: { label: 'Black laminate', family: 'cladding', color: '#1c1d20', tile: 'laminate', tileTint: [1.0, 1.0, 1.05], roughness: 0.55, seams: 1.2 },
  oak: { label: 'Oak boards', family: 'cladding', color: '#a8804f', tile: 'planks', wood: true },
  light_oak: { label: 'Light oak', family: 'cladding', color: '#cdb088', tile: 'planks', wood: true },
  dark_wood: { label: 'Dark wood', family: 'cladding', color: '#4e3522', tile: 'planks', wood: true },
  walnut: { label: 'Walnut', family: 'cladding', color: '#6a4a33', tile: 'planks', wood: true },
  wood_slats: { label: 'Wood slats (lamellas)', family: 'cladding', color: '#9a7249', tile: 'slats', wood: true, relief: 'slats', backing: '#1a1b1d' },
  deco_panel: { label: 'Decorative panel', family: 'cladding', color: '#6f6a62', tile: 'panel_deco' },
  tech_panel: { label: 'Black technical panel', family: 'cladding', color: '#202226', tile: 'metal_dark', tileTint: [1.05, 1.05, 1.1], roughness: 0.45, seams: 0.6 },
};
export const PAINT_FINISHES = { smooth: 'Smooth paint', plaster: 'Fine plaster' };

export const FLOOR_SURFACES = {
  concrete: { label: 'Polished concrete', color: '#5b5751', tile: 'floor', tileTint: [1.0, 0.98, 0.96], uvScale: 0.9, showcase: 'floor_concrete' },
  tile_grey: { label: 'Grey tiles 60×60', color: '#8c8b88', tile: 'floor_tile', uvScale: 1 / 1.2 },
  tile_dark: { label: 'Dark tiles 60×60', color: '#3f4043', tile: 'floor_tile', uvScale: 1 / 1.2 },
  wood_light: { label: 'Light wood', color: '#c9a77b', tile: 'planks', uvScale: 0.7, wood: true },
  oak: { label: 'Oak planks', color: '#9c7447', tile: 'planks', uvScale: 0.7, wood: true },
  vinyl: { label: 'Grey vinyl', color: '#8a8580', tile: 'planks', uvScale: 0.55 },
  anthracite: { label: 'Anthracite', color: '#2f3033', tile: 'floor', tileTint: [0.62, 0.62, 0.66], uvScale: 0.9 },
  technical: { label: 'Technical floor', color: '#4a4c50', tile: 'floor_tile', uvScale: 1 / 0.6 },
};

export const SKIRTINGS = { none: 'None', black: 'Black', white: 'White', wood: 'Wood', steel: 'Steel' };
export const WALL_MODES = { auto: 'Auto', all: 'All walls', cutaway: 'Cutaway', footprint: 'Wall footprint', hide: 'Hide walls' };
export const WALL_PROFILES = { full: 'Full height', low: 'Low side (knee wall)', sloped: 'Sloped top' };

/** Resolved colour of a wall (custom paint uses wall.color). */
export function wallColor(w) {
  const s = WALL_SURFACES[w?.surface] || WALL_SURFACES.paint_light_grey;
  return s.custom && /^#[0-9a-f]{6}$/i.test(w?.color || '') ? w.color : s.color;
}

/** PLANNER painted parameters of a wall surface. */
export function plannerWall(w) {
  const s = WALL_SURFACES[w?.surface] || WALL_SURFACES.paint_light_grey;
  const col = wallColor(w);
  if (s.family === 'paint') {
    const plaster = w?.finish === 'plaster';
    return { tile: plaster ? 'plaster' : 'plastic_white', tint: tintFor(col, plaster ? 0.24 : 0.7, 1), uvScale: plaster ? 0.9 : 0.6, jitter: plaster ? 0.06 : 0.02, s };
  }
  if (s.tileTint) return { tile: s.tile, tint: s.tileTint, uvScale: 1, s, seams: s.seams };
  return { tile: s.tile, tint: tintFor(col, s.wood ? 0.3 : 0.2, 1), uvScale: s.tile === 'slats' ? 1.4 : 1, s, seams: s.seams };
}

export function plannerFloor(f) {
  const s = FLOOR_SURFACES[f?.surface] || FLOOR_SURFACES.concrete;
  return { tile: s.tile, tint: s.tileTint || tintFor(f?.color && /^#/.test(f.color) ? f.color : s.color, s.tile === 'floor_tile' ? 0.3 : s.wood ? 0.3 : 0.25, 1), uvScale: s.uvScale || 1, s };
}

export const SKIRTING_TINT = { black: [0.35, 0.35, 0.37], white: [2.6, 2.55, 2.45], wood: [1.4, 1.0, 0.7], steel: [2.2, 2.25, 2.35] };
export const SKIRTING_COLOR = { black: '#232427', white: '#ecebe6', wood: '#9a7249', steel: '#b8bbbf' };

/** Height of a wall's top edge at distance `t` along it (0…length) — wall profile support. */
export function wallTopAt(room, wall, t, length) {
  const p = room.walls?.[wall]?.profile;
  const H = room.height;
  if (!p || p.mode === 'full') return H;
  if (p.mode === 'low') return Math.min(H, p.hStart);
  const a = Math.min(H, p.hStart), b = Math.min(H, p.hEnd);
  const k = length > 0 ? Math.min(1, Math.max(0, t / length)) : 0;
  return a + (b - a) * k;
}

export { lin as linearFromHex };
