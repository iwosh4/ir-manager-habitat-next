import * as THREE from 'three';
import { LAYER_SPECIAL, LAYER_SHADOW_ONLY } from '../assets/AssetManager.js';

/**
 * Lighting rig and presets. Lights are "believable fixtures": every emissive panel in the room has a
 * matching light, enclosure LEDs illuminate their own interiors (RectAreaLights registered by objects).
 * Only two ceiling spots cast shadows (soft PCF); contact shadows come from GTAO.
 */
export const PRESETS = {
  day: { label: 'Day', exposure: 1.0, env: 0.6, ceiling: 1.0, window: 1.0, hemi: 0.12, sun: 1.0, enclosures: 1.0, task: 1.0, probeFill: 0.8, exterior: 1.0, background: 0x0c0d0e },
  evening: { label: 'Evening', exposure: 1.05, env: 0.3, ceiling: 0.3, window: 0.15, hemi: 0.04, sun: 0.3, enclosures: 1.0, task: 1.0, probeFill: 0.35, exterior: 0.25, background: 0x0a0a0b },
  night: { label: 'Night', exposure: 1.45, env: 0.22, ceiling: 0.07, window: 0.03, hemi: 0.05, sun: 0.0, enclosures: 1.0, task: 0.35, probeFill: 0.14, exterior: 0.05, background: 0x070708 },
};

export class Lighting {
  constructor(scene, engine) {
    this.scene = scene; this.engine = engine;
    this.group = new THREE.Group(); this.group.name = 'lighting';
    scene.add(this.group);
    this.presetKey = 'day';
    this.preset = PRESETS.day;
    this.dynamic = new Set(); // {light, kind, base, material?, baseEmissive?}
    this.hemi = new THREE.HemisphereLight(0xf5f1ea, 0x3a332c, 0.3);
    this.group.add(this.hemi);
    this.rig = [];
    this._buildPool();
  }

  /**
   * Fixed-size pools of enclosure / task lights. The number of lights in the scene never changes after
   * start-up, so switching presets, toggling occupancy, placing or hiding objects never triggers a
   * recompilation of every shader program (the main cause of multi-second freezes). Unused lights sit
   * at intensity 0. Lights are never made invisible (that would change the light count as well).
   */
  _buildPool(spots = 18, points = 2, rects = 1) {
    this.pool = { spot: [], point: [], rect: [] };
    this.poolGroup = new THREE.Group(); this.poolGroup.name = 'light-pool';
    this.group.add(this.poolGroup);
    this._grow('spot', spots); this._grow('point', points); this._grow('rect', rects);
    this.poolGrowths = 0;
  }

  _grow(kind, n) {
    for (let i = 0; i < n; i++) {
      const l = kind === 'spot' ? new THREE.SpotLight(0xffffff, 0, 1, 1, 0.9, 1)
        : kind === 'point' ? new THREE.PointLight(0xffffff, 0, 1, 2) : new THREE.RectAreaLight(0xe4ecff, 0, 1, 1);
      l.userData.free = true; l.position.set(0, -50, 0);
      this.poolGroup.add(l); if (l.target) this.poolGroup.add(l.target);
      this.pool[kind].push(l);
    }
  }

  /**
   * Borrow a light. When the pool is exhausted (e.g. the user adds more enclosures than the room was
   * started with) it grows by a small chunk: one shader recompilation on that explicit edit, instead
   * of one on every preset switch / occupancy toggle / cut-away change.
   */
  acquire(kind = 'spot') {
    let l = this.pool[kind].find((x) => x.userData.free);
    if (!l) { this._grow(kind, kind === 'spot' ? 4 : 1); this.poolGrowths++; l = this.pool[kind].find((x) => x.userData.free); }
    l.userData.free = false;
    return l;
  }

  release(l) { if (!l) return; l.intensity = 0; l.userData.free = true; l.position.set(0, -50, 0); }

  poolUsage() { const u = (k) => `${this.pool[k].filter((l) => !l.userData.free).length}/${this.pool[k].length}`; return { spot: u('spot'), point: u('point'), rect: u('rect') }; }

  /** (Re)build the ceiling rig for the room & panel layout. */
  build(room, panels) {
    for (const l of this.rig) { this.group.remove(l); if (l.target) this.group.remove(l.target); l.dispose?.(); }
    this.rig = [];
    const H = room.height;
    for (const p of panels) {
      const r = new THREE.RectAreaLight(0xfff1e0, 5, p.w, p.d);
      r.position.set(p.x, H - 0.012, p.z); r.lookAt(p.x, 0, p.z);
      r.userData.base = 5; r.userData.kind = 'ceiling';
      this.group.add(r); this.rig.push(r);
    }
    // one soft overhead shadow caster (orthographic => uniform shadow resolution over the whole room)
    const sun = new THREE.DirectionalLight(0xfff0dc, 1.1);
    sun.position.set(room.width * 0.12, H + 3, room.depth * 0.18);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    const ext = Math.max(room.width, room.depth) * 0.62;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.5, far: H + 8 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.mapSize.set(this.engine.shadowMapSize || 2048, this.engine.shadowMapSize || 2048);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 5; sun.shadow.blurSamples = 16;
    sun.shadow.camera.layers.enable(LAYER_SPECIAL);
    sun.shadow.camera.layers.enable(LAYER_SHADOW_ONLY);
    sun.userData.base = 1.1; sun.userData.kind = 'ceiling';
    this.group.add(sun, sun.target); this.rig.push(sun);
    this.apply();
  }

  /** Objects register their own lights & emissive materials so presets and toggles can scale them. */
  register(entry) { this.dynamic.add(entry); this._applyEntry(entry); return () => this.dynamic.delete(entry); }

  setPreset(key) {
    this.presetKey = PRESETS[key] ? key : 'day';
    this.preset = PRESETS[this.presetKey];
    this.apply();
  }

  factor(kind) {
    const p = this.preset;
    return { ceiling: p.ceiling, window: p.window, enclosure: p.enclosures, task: p.task }[kind] ?? 1;
  }

  _applyEntry(e) {
    const k = this.factor(e.kind) * (e.enabled === false ? 0 : 1);
    if (e.light) e.light.intensity = e.base * k; // never toggle .visible (would recompile all programs)
    if (e.material) e.material.emissiveIntensity = e.baseEmissive * (e.kind === 'enclosure' ? (e.enabled === false ? 0.0 : 1) : Math.max(k, 0.02));
  }

  apply() {
    const p = this.preset;
    for (const l of this.rig) { const k = l.isDirectionalLight ? p.sun : p.ceiling; l.intensity = l.userData.base * k; }
    this.hemi.intensity = p.hemi;
    for (const e of this.dynamic) this._applyEntry(e);
    this.engine.renderer.toneMappingExposure = p.exposure;
    this.scene.environmentIntensity = p.env;
    this.scene.background = new THREE.Color(p.background);
    this.onApply && this.onApply(p);
    this.engine.markShadowsDirty();
  }
}
