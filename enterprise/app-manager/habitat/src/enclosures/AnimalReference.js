import { PaintBuilder } from '../planner/PaintBuilder.js';
import { rbox, taperTube, ellipsoid, dome } from '../planner/geometry.js';

/**
 * ANIMAL REFERENCE (Habitat Studio 4.2) — a scale figure for the Enclosure Designer.
 *
 * Purely a visual aid: it is NOT stored in the enclosure template, has no collision volume and never
 * reaches the room, the assembly builder or the exported document. `size` is the characteristic length
 * in metres (total length; leg span for spiders; carapace length for turtles). A thin amber ruler under
 * the figure shows that length.
 */
export const ANIMAL_REFS = {
  snake: { label: 'Snake', size: 1.2, min: 0.3, max: 3.5, measure: 'total length' },
  lizard: { label: 'Lizard', size: 0.5, min: 0.12, max: 1.5, measure: 'total length' },
  gecko: { label: 'Gecko', size: 0.2, min: 0.08, max: 0.35, measure: 'total length' },
  chameleon: { label: 'Chameleon', size: 0.4, min: 0.15, max: 0.7, measure: 'total length' },
  turtle: { label: 'Turtle', size: 0.2, min: 0.06, max: 0.6, measure: 'carapace length' },
  frog: { label: 'Frog', size: 0.05, min: 0.015, max: 0.2, measure: 'body length' },
  spider: { label: 'Spider / tarantula', size: 0.14, min: 0.03, max: 0.3, measure: 'leg span' },
  scorpion: { label: 'Scorpion', size: 0.12, min: 0.03, max: 0.22, measure: 'total length' },
  insect: { label: 'Insect', size: 0.06, min: 0.01, max: 0.3, measure: 'body length' },
};

// one warm reference colour for every figure: clearly a measuring aid, not a decoration
const SKIN = { chameleon: [1.25, 0.8, 0.38], frog: [1.25, 0.8, 0.38] };
const REF = [1.3, 0.72, 0.32];
const T = 'skin_gecko';

/** Build the reference figure centred on the origin (standing on y = 0, head towards +x). */
export function buildAnimalRef(mats, category, size) {
  const b = new PaintBuilder(mats);
  const L = Math.max(0.005, size), c = SKIN[category] || REF;
  const tube = (pts, r0, r1, o = {}) => b.add(taperTube(pts, r0, r1, { radial: 7, segs: Math.max(8, pts.length * 4), ...o }), o.tile || T, { uv: 'keep', color: o.color || c });
  const ell = (rx, ry, rz, pos, o = {}) => b.add(ellipsoid(rx, ry, rz, 10), o.tile || T, { pos, color: o.color || c, rot: o.rot });
  const legs = (n, span, h, body, { y = 0.5, k = 1 } = {}) => {
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
      const x = (n === 1 ? 0 : (i / (n - 1) - 0.5)) * body;
      tube([[x, h * y, 0], [x + (i / (n - 1 || 1) - 0.5) * span * 0.25, h * 1.05, s * span * 0.28], [x + (i / (n - 1 || 1) - 0.5) * span * 0.5 * k, 0.002, s * span * 0.5]], span * 0.012 + 0.0008, span * 0.006 + 0.0005, { radial: 4 });
    }
  };
  switch (category) {
    case 'snake': { // relaxed S-curve so the full length reads
      const pts = [], n = 28, amp = L * 0.07, r = Math.max(0.004, L * 0.022);
      for (let i = 0; i <= n; i++) { const t = i / n; pts.push([(t - 0.5) * L * 0.86, r, Math.sin(t * Math.PI * 3) * amp]); }
      tube(pts, r * 0.3, r, { segs: 60 });
      ell(r * 1.6, r * 0.9, r * 1.2, [L * 0.44, r * 0.95, pts[n][2]]);
      break;
    }
    case 'lizard': case 'gecko': {
      const bl = L * 0.42, h = L * (category === 'gecko' ? 0.06 : 0.08);
      ell(bl / 2, h * 0.55, L * 0.07, [L * 0.05, h, 0]);
      ell(L * 0.07, h * 0.45, L * 0.055, [L * 0.3, h * 1.05, 0]);
      tube([[-L * 0.15, h, 0], [-L * 0.3, h * 0.6, L * 0.04], [-L * 0.5, h * 0.25, 0]], L * 0.04, L * 0.006);
      legs(2, L * 0.36, h, bl * 0.7);
      break;
    }
    case 'chameleon': {
      const h = L * 0.14;
      ell(L * 0.2, h * 0.9, L * 0.06, [L * 0.05, h * 1.4, 0]);
      ell(L * 0.08, h * 0.6, L * 0.05, [L * 0.26, h * 1.6, 0]);
      b.add(rbox(L * 0.06, h * 0.5, L * 0.01, 0.002).rotateZ(-0.6), T, { pos: [L * 0.24, h * 2.05, 0], color: c }); // casque
      const tail = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 1.8; const rr = L * 0.12 * (1 - i / 22); tail.push([-L * 0.14 - Math.sin(a) * rr, h * 0.9 - (1 - Math.cos(a)) * rr * 0.9 + L * 0.02, 0]); }
      tube(tail, L * 0.03, L * 0.008);
      legs(2, L * 0.34, h * 1.2, L * 0.2);
      break;
    }
    case 'turtle': {
      b.add(dome(L / 2, 0.55, 14).scale(1, 1, 0.8), T, { pos: [0, L * 0.06, 0], color: [1.05, 0.6, 0.28] });
      b.add(rbox(L * 0.95, L * 0.04, L * 0.76, L * 0.02), T, { pos: [0, L * 0.06, 0], color: [0.85, 0.75, 0.5] });
      ell(L * 0.12, L * 0.08, L * 0.09, [L * 0.56, L * 0.1, 0]);
      for (const [x, z] of [[0.32, 0.34], [0.32, -0.34], [-0.32, 0.32], [-0.32, -0.32]]) ell(L * 0.08, L * 0.05, L * 0.07, [x * L, L * 0.04, z * L]);
      break;
    }
    case 'frog': {
      ell(L * 0.45, L * 0.3, L * 0.38, [0, L * 0.32, 0], { rot: [0, 0, 0.35] });
      for (const s of [-1, 1]) {
        ell(L * 0.1, L * 0.1, L * 0.1, [L * 0.3, L * 0.55, s * L * 0.2], { color: [0.1, 0.1, 0.1], tile: 'plastic_black' });
        ell(L * 0.35, L * 0.12, L * 0.14, [-L * 0.2, L * 0.12, s * L * 0.38]);
        ell(L * 0.12, L * 0.18, L * 0.1, [L * 0.3, L * 0.12, s * L * 0.3]);
      }
      break;
    }
    case 'spider': { // L = leg span
      const bs = L * 0.28, h = L * 0.1;
      ell(bs * 0.5, h * 0.55, bs * 0.45, [-bs * 0.55, h, 0]);
      ell(bs * 0.38, h * 0.4, bs * 0.34, [bs * 0.25, h * 0.9, 0]);
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
        const a = (-0.9 + i * 0.6) * (s > 0 ? 1 : 1), dx = Math.cos(a) * L * 0.5, dz = Math.sin(a) * L * 0.5;
        tube([[bs * 0.25, h * 0.9, 0], [bs * 0.25 + dx * 0.45, h * 2.2, s * Math.abs(dz) * 0.45 + s * L * 0.1], [bs * 0.25 + dx, 0.002, s * (Math.abs(dz) + L * 0.12)]], L * 0.018, L * 0.01, { radial: 5 });
      }
      break;
    }
    case 'scorpion': {
      const h = L * 0.08;
      for (let i = 0; i < 5; i++) ell(L * 0.06, h * 0.5, L * 0.07 - i * L * 0.004, [L * 0.12 - i * L * 0.08, h, 0]);
      const tail = []; for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 0.95; tail.push([-L * 0.22 - Math.sin(a) * L * 0.18, h + (1 - Math.cos(a)) * L * 0.2, 0]); }
      tube(tail, L * 0.028, L * 0.015);
      for (const s of [-1, 1]) {
        tube([[L * 0.16, h, s * L * 0.04], [L * 0.3, h, s * L * 0.14], [L * 0.42, h, s * L * 0.12]], L * 0.015, L * 0.012);
        ell(L * 0.07, L * 0.03, L * 0.04, [L * 0.47, h, s * L * 0.11]);
      }
      legs(4, L * 0.55, h, L * 0.3);
      break;
    }
    default: { // insect: 3 segments, 6 legs, antennae
      const h = L * 0.12;
      ell(L * 0.12, h * 0.5, L * 0.1, [L * 0.33, h, 0]);
      ell(L * 0.14, h * 0.6, L * 0.12, [L * 0.1, h, 0]);
      ell(L * 0.25, h * 0.7, L * 0.15, [-L * 0.22, h, 0]);
      legs(3, L * 0.7, h, L * 0.3);
      for (const s of [-1, 1]) tube([[L * 0.42, h * 1.2, s * L * 0.03], [L * 0.6, h * 2, s * L * 0.12], [L * 0.75, h * 2.1, s * L * 0.2]], L * 0.006, L * 0.003, { radial: 3 });
    }
  }
  // ruler: the characteristic length, painted on the floor under the figure
  b.add(rbox(L, 0.0015, Math.max(0.002, L * 0.012), 0.0005), 'amber', { pos: [0, 0.001, -Math.max(0.03, L * 0.25)], glow: 0.7, color: [1, 0.6, 0.25] });
  for (const s of [-1, 1]) b.add(rbox(0.0015, 0.0015, Math.max(0.01, L * 0.06), 0.0005), 'amber', { pos: [s * L / 2, 0.001, -Math.max(0.03, L * 0.25)], glow: 0.7, color: [1, 0.6, 0.25] });
  return b;
}

/** Preview-stage part for the designer (cached geometry key; never pickable, never collides). */
export function animalRefPart(mats, t, ref, interiorBounds) {
  const def = ANIMAL_REFS[ref.category] || ANIMAL_REFS.snake;
  const size = Math.min(def.max, Math.max(def.min, ref.size || def.size));
  const I = interiorBounds(t);
  const floorY = (t.bottom.base || 0) + I.floor + Math.min(t.interior?.substrate?.depth || 0, (I.top - I.floor) * 0.4) * (t.interior?.substrate?.type === 'none' ? 0 : 1);
  return { key: `animalref|${ref.category}|${size.toFixed(3)}`, name: 'animal-reference', position: [(I.x0 + I.x1) / 2, floorY + 0.018, (I.z0 + I.z1) / 2 + (I.z1 - I.z0) * 0.12], userData: { animalReference: true }, make: () => buildAnimalRef(mats, ref.category, size) };
}

