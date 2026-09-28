import * as THREE from 'three';
import { TILE_REPEAT } from './PaintedMaterials.js';

/**
 * Geometry accumulator for the PLANNER renderer.
 *
 * Every part added to a builder is baked into object space together with its painted attributes:
 *   position · normal · uv · tile (atlas cell + wrap mode) · color (rgb = painted light / AO / tint, a = glow)
 * and sorted into one of five render buckets. `build()` merges each bucket into ONE mesh, so a complete
 * terrarium – frame, glass, doors, background, substrate, rocks, plants, lamp – is at most five meshes
 * sharing five materials. Those meshes are then folded across all objects by the StaticBatcher.
 *
 * Painted light: interior "lamps" registered with `lamp()` are baked into the vertex colours of every
 * part flagged `lit` (pool of warm light under the fixture, falling off towards the glass and floor).
 */
export const BUCKETS = ['opaque', 'cutout', 'glass', 'decal', 'glow'];

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class PaintBuilder {
  constructor(mats) {
    this.mats = mats;
    this.chunks = [];
    this.stack = [new THREE.Matrix4()];
    this.lamps = [];
    this.tris = 0;
  }

  get matrix() { return this.stack[this.stack.length - 1]; }

  /** Nested local frame (translation, Y rotation, optional uniform/xyz scale). */
  push(pos = [0, 0, 0], rotY = 0, rot = null) {
    _e.set(...(rot || [0, rotY, 0]));
    _m.compose(_v.set(...pos), _q.setFromEuler(_e), _s.set(1, 1, 1));
    this.stack.push(this.matrix.clone().multiply(_m));
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  within(pos, rotY, fn) { this.push(pos, rotY); try { fn(); } finally { this.pop(); } return this; }

  /** Painted interior light: bakes into `lit` parts at build time (object-space position). */
  lamp(pos, { radius = 0.6, color = 0xffe2bc, intensity = 1, down = 1 } = {}) {
    const p = new THREE.Vector3(...pos).applyMatrix4(this.matrix);
    this.lamps.push({ p, radius, color: new THREE.Color(color), intensity, down });
  }

  /**
   * Add a part.
   * o.bucket   opaque | cutout | glass | decal | glow
   * o.mode     atlas wrap mode (TILE_REPEAT / TILE_CLAMP / TILE_REPEAT_U)
   * o.uv       'box' (metre projection, default) | 'keep' (geometry uv) | 'xz' | 'xy' | 'zy'
   * o.uvScale  number | [u, v]  (tiles per metre for projections, multiplier for 'keep')
   * o.color    tint (hex / [r,g,b] linear / THREE.Color), o.alpha (glass/decal opacity), o.glow (0..1 self-illumination)
   * o.grad     [bottom, top] brightness along the part's local Y extent (painted gradient)
   * o.ao       fn(pObject, nObject) -> multiplier   (baked occlusion)
   * o.lit      receive painted lamps
   * o.room     room lighting (ceiling panels, daylight): dimmed by Evening / Night presets
   */
  add(geo, tile, o = {}) {
    const bucket = o.bucket || 'opaque';
    const pos = geo.attributes.position, nor = geo.attributes.normal, uvA = geo.attributes.uv;
    const count = pos.count;
    _e.set(...(o.rot || [0, 0, 0]));
    const scl = o.scale ? (Array.isArray(o.scale) ? o.scale : [o.scale, o.scale, o.scale]) : [1, 1, 1];
    const local = new THREE.Matrix4().compose(_v.set(...(o.pos || [0, 0, 0])), _q.setFromEuler(_e), _s.set(...scl));
    const M = this.matrix.clone().multiply(local);
    const N = _n.getNormalMatrix(M);
    const P = new Float32Array(count * 3), Nn = new Float32Array(count * 3), U = new Float32Array(count * 2), C = new Float32Array(count * 4), T = new Float32Array(count);
    const tileId = (typeof tile === 'number' ? tile : this.mats.tile(tile, o.mode ?? TILE_REPEAT)) + (o.room ? 10000 : 0);
    const base = toColor(o.color ?? 0xffffff);
    const alpha = o.alpha ?? (bucket === 'opaque' || bucket === 'cutout' ? (o.glow ?? 0) : 1);
    const us = Array.isArray(o.uvScale) ? o.uvScale : [o.uvScale ?? 1, o.uvScale ?? 1];
    const uo = o.uvOffset || [0, 0];
    const uvMode = o.uv || (uvA && (o.mode ?? 0) !== 0 ? 'keep' : 'box');
    let y0 = Infinity, y1 = -Infinity;
    if (o.grad) for (let i = 0; i < count; i++) { const y = pos.getY(i) * scl[1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (let i = 0; i < count; i++) {
      const lx = pos.getX(i) * scl[0], ly = pos.getY(i) * scl[1], lz = pos.getZ(i) * scl[2];
      _v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(M);
      P[i * 3] = _v.x; P[i * 3 + 1] = _v.y; P[i * 3 + 2] = _v.z;
      if (nor) _w.set(nor.getX(i), nor.getY(i), nor.getZ(i)); else _w.set(0, 1, 0);
      const lnx = _w.x, lny = _w.y, lnz = _w.z;
      _w.applyMatrix3(N).normalize();
      Nn[i * 3] = _w.x; Nn[i * 3 + 1] = _w.y; Nn[i * 3 + 2] = _w.z;
      let u, v;
      if (uvMode === 'keep') { u = uvA.getX(i); v = uvA.getY(i); }
      else if (uvMode === 'xz') { u = lx; v = -lz; }
      else if (uvMode === 'xy') { u = lx; v = ly; }
      else if (uvMode === 'zy') { u = lz; v = ly; }
      else { // box projection in part-local metres
        const ax = Math.abs(lnx), ay = Math.abs(lny), az = Math.abs(lnz);
        if (ay >= ax && ay >= az) { u = lx; v = lz; } else if (ax >= az) { u = lz * Math.sign(lnx || 1); v = ly; } else { u = lx * Math.sign(lnz || 1); v = ly; }
      }
      U[i * 2] = u * us[0] + uo[0]; U[i * 2 + 1] = v * us[1] + uo[1];
      let k = 1;
      if (o.grad) { const t = y1 > y0 ? (ly - y0) / (y1 - y0) : 1; k *= o.grad[0] + (o.grad[1] - o.grad[0]) * t; }
      if (o.ao) k *= o.ao(_v, _w);
      if (o.jitter) k *= 1 + (hash3(_v.x, _v.y, _v.z) - 0.5) * o.jitter;
      C[i * 4] = base.r * k; C[i * 4 + 1] = base.g * k; C[i * 4 + 2] = base.b * k; C[i * 4 + 3] = alpha;
      T[i] = tileId;
    }
    let index;
    if (geo.index) index = Array.from(geo.index.array);
    else { index = new Array(count); for (let i = 0; i < count; i++) index[i] = i; }
    if (M.determinant() < 0) for (let i = 0; i < index.length; i += 3) { const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t; }
    this.chunks.push({ bucket, P, N: Nn, U, C, T, index, lit: !!o.lit, count });
    this.tris += index.length / 3;
    return this;
  }

  /** Include another builder's parts (e.g. a terrarium cell inside a rack) at the current frame. */
  include(other, pos = [0, 0, 0], rotY = 0) {
    const M = this.matrix.clone().multiply(new THREE.Matrix4().compose(_v.set(...pos), _q.setFromEuler(_e.set(0, rotY, 0)), _s.set(1, 1, 1)));
    const N = new THREE.Matrix3().getNormalMatrix(M);
    other._applyLamps();
    for (const c of other.chunks) {
      for (let i = 0; i < c.count; i++) {
        _v.fromArray(c.P, i * 3).applyMatrix4(M).toArray(c.P, i * 3);
        _w.fromArray(c.N, i * 3).applyMatrix3(N).normalize().toArray(c.N, i * 3);
      }
      c.lit = false; // already lit by its own lamps
      this.chunks.push(c);
    }
    this.tris += other.tris;
    return this;
  }

  _applyLamps() {
    for (const c of this.chunks) {
      if (!c.lit) continue;
      if (!this.lamps.length) { // interior without light (switched off / empty): quiet, cool, dim
        for (let i = 0; i < c.count; i++) { c.C[i * 4] *= 0.5; c.C[i * 4 + 1] *= 0.52; c.C[i * 4 + 2] *= 0.56; }
        c.lit = false; continue;
      }
      for (let i = 0; i < c.count; i++) {
        const x = c.P[i * 3], y = c.P[i * 3 + 1], z = c.P[i * 3 + 2];
        const nx = c.N[i * 3], ny = c.N[i * 3 + 1], nz = c.N[i * 3 + 2];
        let r = 0, g = 0, bl = 0, glow = 0;
        for (const L of this.lamps) {
          const dx = L.p.x - x, dy = L.p.y - y, dz = L.p.z - z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-4;
          const t = Math.min(1, d / L.radius), f = 1 - t * t * (3 - 2 * t);
          const facing = Math.max(0.3, (nx * dx + ny * dy + nz * dz) / d * 0.7 + 0.3);
          const below = L.down ? Math.min(1, Math.max(0.35, dy / d + 0.35)) : 1;
          const k = f * facing * below * L.intensity;
          r += L.color.r * k; g += L.color.g * k; bl += L.color.b * k; glow += k;
        }
        // painted pool of light: shadowed baseline, warm/cool lamp colour where the fixture reaches
        c.C[i * 4] *= 0.5 + r * 1.15; c.C[i * 4 + 1] *= 0.5 + g * 1.15; c.C[i * 4 + 2] *= 0.5 + bl * 1.15;
        if (c.bucket === 'opaque' || c.bucket === 'cutout') c.C[i * 4 + 3] = Math.min(1, c.C[i * 4 + 3] + glow * 0.75);
      }
      c.lit = false;
    }
  }

  /** Merge every bucket into one BufferGeometry → Group of ≤5 meshes. */
  build(name = 'painted') {
    this._applyLamps();
    const group = new THREE.Group(); group.name = name;
    for (const bucket of BUCKETS) {
      const list = this.chunks.filter((c) => c.bucket === bucket);
      if (!list.length) continue;
      const geo = mergeChunks(list);
      const mesh = new THREE.Mesh(geo, this.mats.materials[bucket]);
      mesh.name = `${name}:${bucket}`;
      mesh.userData.bucket = bucket;
      mesh.userData.batchable = true;
      mesh.renderOrder = bucket === 'glass' ? 2 : bucket === 'glow' ? 3 : bucket === 'decal' ? 4 : 0;
      group.add(mesh);
    }
    group.userData.tris = this.tris;
    return group;
  }

  /** Merged geometries per bucket (used for the geometry cache). */
  geometries() {
    this._applyLamps();
    const out = {};
    for (const bucket of BUCKETS) {
      const list = this.chunks.filter((c) => c.bucket === bucket);
      if (list.length) out[bucket] = mergeChunks(list);
    }
    return out;
  }
}

function mergeChunks(list) {
  let nv = 0, ni = 0;
  for (const c of list) { nv += c.count; ni += c.index.length; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Float32Array(nv * 4), T = new Float32Array(nv);
  const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let ov = 0, oi = 0;
  for (const c of list) {
    P.set(c.P, ov * 3); N.set(c.N, ov * 3); U.set(c.U, ov * 2); C.set(c.C, ov * 4); T.set(c.T, ov);
    for (let i = 0; i < c.index.length; i++) I[oi + i] = c.index[i] + ov;
    ov += c.count; oi += c.index.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.BufferAttribute(C, 4));
  g.setAttribute('tile', new THREE.BufferAttribute(T, 1));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

export function toColor(c) {
  if (c instanceof THREE.Color) return c;
  if (Array.isArray(c)) return _c.clone().setRGB(c[0], c[1], c[2]);
  return new THREE.Color(c);
}

export function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
