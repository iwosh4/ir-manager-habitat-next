import { WALLS } from '../model/RoomDocument.js';

/**
 * CAMERA-AWARE WALL SYSTEM (Habitat Studio 4.2).
 *
 * Every wall has a clip height (world metres; walls are cut above it and get a capped top edge):
 *   far / opposite walls        full height
 *   side walls                   lowered progressively with the viewing angle
 *   wall between camera & room   lowered to a WALL FOOTPRINT (18 cm plinth line) — you still see where
 *                                the wall runs, but it never hides the room
 * Heights ease towards their targets (≈ 220 ms), so walls never pop when orbiting.
 *
 * Modes: auto (default) · all · cutaway (classic: hide walls facing the camera) · footprint (all walls
 * as plinth lines — plan reading) · hide (footprint lines on the floor only).
 */
export const FOOTPRINT_H = 0.18;
const OUTWARD = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

export class WallVisibility {
  constructor() {
    this.mode = 'auto';
    this.current = {}; this.target = {};
    this.last = 0;
  }

  setMode(m) { this.mode = m; }

  /**
   * @param room  logical room
   * @param cam   camera world position (room centred on the origin)
   * @param target orbit target (world)
   * @returns { clips: {wall: height}, animating: bool, changed: bool }
   */
  update(room, cam, target, now = performance.now()) {
    const W = room.width, D = room.depth, H = room.height;
    const dx = cam.x - (target?.x ?? 0), dz = cam.z - (target?.z ?? 0), dy = cam.y - (target?.y ?? 0);
    const horiz = Math.hypot(dx, dz), vx = horiz > 1e-6 ? dx / horiz : 0, vz = horiz > 1e-6 ? dz / horiz : 0;
    const steep = Math.atan2(dy, horiz) > 1.22; // ~70° down: plan-like view
    const inside = cam.x > -W / 2 && cam.x < W / 2 && cam.z > -D / 2 && cam.z < D / 2;
    for (const w of WALLS) {
      const [nx, nz] = OUTWARD[w];
      const beyond = w === 'north' ? cam.z < -D / 2 : w === 'south' ? cam.z > D / 2 : w === 'west' ? cam.x < -W / 2 : cam.x > W / 2;
      const facing = nx * vx + nz * vz; // 1 = camera looks through this wall
      let t;
      switch (this.mode) {
        case 'all': t = H; break;
        case 'cutaway': t = beyond ? 0 : H; break;
        case 'footprint': t = FOOTPRINT_H; break;
        case 'hide': t = 0; break;
        default: {
          if (inside && cam.y < H) { t = H; break; }              // eye-level interior: the room around you
          if (steep && !beyond) { t = H; break; }                 // from above: walls do not block
          if (!beyond && facing < 0.2) { t = H; break; }          // far walls
          const k = Math.min(1, Math.max(0, (facing - 0.15) / 0.5));
          t = beyond ? H + (FOOTPRINT_H - H) * Math.max(k, steep ? 0 : 0.35) : H;
          if (steep && beyond) t = Math.max(t, H * 0.55);         // looking down past a wall: lower it partially
        }
      }
      this.target[w] = t;
      if (this.current[w] === undefined || this._roomKey !== `${W}|${D}|${H}`) this.current[w] = t;
    }
    this._roomKey = `${W}|${D}|${H}`;
    const dt = this.last ? Math.min(100, now - this.last) : 16; this.last = now;
    const k = 1 - Math.exp(-dt / 70); // ~220 ms to settle
    let animating = false, changed = false;
    for (const w of WALLS) {
      const c = this.current[w], t = this.target[w];
      let n = c + (t - c) * k;
      if (Math.abs(t - n) < 0.004) n = t; else animating = true;
      if (n !== c) changed = true;
      this.current[w] = n;
    }
    return { clips: { ...this.current }, animating, changed };
  }

  /** Walls currently lowered below their full height (hidden set for objects on them). */
  lowered(room, eps = 0.05) { return new Set(WALLS.filter((w) => (this.current[w] ?? room.height) < room.height - eps)); }
}
