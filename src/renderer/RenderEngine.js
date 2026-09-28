import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { createFinishPass } from './FinishPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { LAYER_SPECIAL } from './layers.js';

import { QUALITY, createRenderer, gpuName } from './quality.js';

export { QUALITY };
const AUTO_FINAL_LADDER = ['high', 'balanced', 'fast'];

const AUTO = {
  targetMs: 33,            // interactive frame budget (≈30 fps)
  minScale: 0.35, maxScale: 1.0,
  evalEveryMs: 350,
  finalSlowMs: 450,        // a stationary frame slower than this (twice) steps the final profile down
  finalFastMs: 90,
};
const SETTLE_MS = 220;     // idle time after the last interaction before the final frame is rendered

/**
 * Progressive viewport renderer.
 *
 *   interactive  → fastComposer: RenderPass → Outline → Output(ACES) → Finish   @ renderScale × pixelRatio
 *   stationary   → finalComposer: RenderPass(MSAA, HDR) → GTAO → Bloom → Outline → Output → Finish → (SMAA)
 *
 * Rendering is on-demand. Shadow maps are only re-rendered when marked dirty (geometry, placement,
 * room, lighting) — never because the camera moved — and are deferred while the user is interacting.
 */
export class RenderEngine {
  constructor(container, { quality = 'auto', renderer = null } = {}) {
    this.container = container;
    RectAreaLightUniformsLib.init();
    renderer = renderer || createRenderer(container);   // shared with the Planner renderer
    this.renderer = renderer;
    this.scene = null;
    this.camera = null;
    this.dirty = true;
    this.shadowsDirty = true;
    this.interactiveUntil = 0;
    this.interacting = false;       // held by the app while a gesture / camera animation is in progress
    this.pendingFinal = false;
    this.mode = 'final';
    this.renderScale = 1;
    this.stats = { frames: 0, lastMs: 0, fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, shadowUpdates: 0, finalMs: 0, finalProfile: '' };
    this.qualityKey = quality in QUALITY ? quality : 'auto';
    this._ema = 0; this._lastTick = 0; this._lastEval = 0; this._lastShadowAt = 0;
    this._finalProbe = null; this._interProbe = null; this._slowFinals = 0;
    this.active = true;             // only the active renderer owns the shared canvas size
  }

  /** Mode switching: the inactive engine never touches the shared renderer. */
  activate() {
    this.active = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.needsUpdate = false;
    this.shadowsDirty = true;
    this._applyFinal(this.finalKey || this.autoFinal || 'high');
    this._applyScale(true);
    this._finalProbe = null; this._interProbe = null;
    this.resize();
  }
  deactivate() { this.active = false; this._finalProbe = null; this._interProbe = null; }

  attach(scene, camera) {
    this.scene = scene; this.camera = camera;
    camera.layers.enable(LAYER_SPECIAL);
    this._buildComposers();
    this.setQuality(this.qualityKey);
    new ResizeObserver(() => { if (this.active) this.resize(); }).observe(this.container);
    this.resize();
  }

  _buildComposers() {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    // ---- final (stationary) chain — unchanged visual pipeline
    this.target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(r, this.target);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.9;
    this.gtao.updateGtaoMaterial({ radius: 0.28, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1.0 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    // Exclude glass / foliage cards / meshes from the AO G-buffer (they would occlude as solid quads).
    const gtaoRender = this.gtao.render.bind(this.gtao);
    this.gtao.render = (...args) => {
      const cam = this.camera; cam.layers.disable(LAYER_SPECIAL);
      try { gtaoRender(...args); } finally { cam.layers.enable(LAYER_SPECIAL); }
    };
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.6, 2.4);
    this.outline = this._makeOutline(size);
    this.output = new OutputPass();
    this.finish = createFinishPass();
    this.smaa = new SMAAPass();
    for (const p of [this.renderPass, this.gtao, this.bloom, this.outline, this.output, this.finish, this.smaa]) composer.addPass(p);
    this.composer = composer;

    // ---- interactive chain — no MSAA, no AO, no bloom; resolution follows renderScale
    this.fastTarget = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 0 });
    const fast = new EffectComposer(r, this.fastTarget);
    this.fastOutline = this._makeOutline(size);
    this.fastFinish = createFinishPass();
    this.fastFinish.uniforms.grain.value = 0; // grain would shimmer at reduced resolution
    for (const p of [new RenderPass(this.scene, this.camera), this.fastOutline, new OutputPass(), this.fastFinish]) fast.addPass(p);
    this.fastComposer = fast;
  }

  _makeOutline(size) {
    const o = new OutlinePass(new THREE.Vector2(size.x, size.y), this.scene, this.camera);
    Object.assign(o, { edgeStrength: 4, edgeGlow: 0.0, edgeThickness: 1.0, pulsePeriod: 0 });
    o.visibleEdgeColor.set(0xf0a04b);
    o.hiddenEdgeColor.set(0x6b4520);
    const render = o.render.bind(o);
    o.render = (...args) => {
      if (!o.selectedObjects.length) return; // needsSwap=false: the read buffer simply passes on
      const cam = this.camera; cam.layers.disable(LAYER_SPECIAL);
      try { render(...args); } finally { cam.layers.enable(LAYER_SPECIAL); }
    };
    return o;
  }

  // ------------------------------------------------------------------ quality
  get isAuto() { return !!QUALITY[this.qualityKey]?.auto; }

  setQuality(key) {
    this.qualityKey = key in QUALITY ? key : 'auto';
    if (this.isAuto) {
      this.autoFinal = this.autoFinal || this._initialAutoFinal();
      this.renderScale = this.renderScale && this.renderScale < 1 ? this.renderScale : 0.75;
      this._applyFinal(this.autoFinal);
    } else {
      this._applyFinal(this.qualityKey);
      this.renderScale = QUALITY[this.qualityKey].interactiveScale;
    }
    this._applyScale(true);
  }

  _initialAutoFinal() {
    // start from High on large/high-DPI screens, Balanced where the GPU is clearly weak (software, small caps)
    const name = gpuName(this.renderer);
    this.gpuName = name;
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return 'balanced';
    return 'high';
  }

  _applyFinal(key) {
    const q = QUALITY[key];
    this.final = q; this.finalKey = key;
    this.stats.finalProfile = q.label;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.composer.setPixelRatio(this.basePixelRatio);
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (rt.samples !== q.msaa) { rt.samples = q.msaa; rt.dispose(); }
    this.gtao.enabled = q.ao;
    this.gtao.updateGtaoMaterial({ samples: q.aoSamples });
    this.bloom.enabled = q.bloom;
    this.smaa.enabled = q.smaa;
    this.shadowMapSize = q.shadowMap;
    this.scene?.traverse((o) => {
      if (o.isLight && o.castShadow && o.shadow.mapSize.x !== q.shadowMap) {
        o.shadow.mapSize.set(q.shadowMap, q.shadowMap); o.shadow.map?.dispose(); o.shadow.map = null; this.shadowsDirty = true;
      }
    });
    this.resize();
  }

  _applyScale(force = false) {
    const pr = this.basePixelRatio * this.renderScale;
    if (!force && Math.abs(pr - (this._fastPR || 0)) < 1e-3) return;
    this._fastPR = pr;
    this.fastComposer.setPixelRatio(pr);
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.fastComposer.setSize(w, h);
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    if (!this.active) { this.composer.setSize(w, h); this.fastComposer?.setSize(w, h); return; }
    this.renderer.setPixelRatio(this.basePixelRatio || 1);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.composer.setSize(w, h);
    this.fastComposer?.setSize(w, h);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this.onResize && this.onResize(w, h);
    this.invalidate();
  }

  // ------------------------------------------------------------------ invalidation
  /** Something changed that needs a new (final-quality) frame. */
  invalidate() { this.dirty = true; }
  /** Continuous manipulation: draw with the interactive profile until it settles. */
  interact(ms = SETTLE_MS) { this.interactiveUntil = Math.max(this.interactiveUntil, performance.now() + this._settleMs(ms)); this.dirty = true; }

  /**
   * Settle window: at least `ms`, but never shorter than ~2.5 interactive frames. On slow hardware a
   * single frame can exceed 220 ms; without this the expensive final frame would start between two
   * input events (e.g. consecutive wheel ticks) and stall the interaction.
   */
  _settleMs(ms = SETTLE_MS) { return Math.min(4000, Math.max(ms, (this._interFrameMs || 0) * 2.5)); }
  /** Geometry, placement, room or lighting changed: shadow maps must be re-rendered. */
  markShadowsDirty() { this.shadowsDirty = true; this.dirty = true; }

  get isInteractive() { return this.interacting || performance.now() < this.interactiveUntil; }
  get needsFrame() { return this.dirty || this.pendingFinal || this.isInteractive; }

  /** Called once per animation frame by the app loop. Returns true if something was drawn. */
  frame(now = performance.now()) {
    // Frame costs are measured from the start of a render to the next animation-frame callback: this
    // includes the asynchronous GPU work, whether or not the next tick renders anything.
    if (this._finalProbe !== null) { this._onFinalCost(now - this._finalProbe); this._finalProbe = null; }
    if (this._interProbe !== null) { this._onInteractiveCost(now - this._interProbe, now); this._interProbe = null; }
    const interactive = this.isInteractive;
    if (!this.needsFrame) { this._ema = 0; return false; }
    if (interactive) {
      this.mode = 'interactive';
      this._renderWith(this.fastComposer, now, true);
      this.pendingFinal = true;
      this._interProbe = now;
      // count the settle window from the *end* of this frame (inputs that arrived meanwhile are queued)
      const end = performance.now();
      if (this.interactiveUntil > now - 1) this.interactiveUntil = Math.max(this.interactiveUntil, end + this._settleMs());
    } else {
      this.mode = 'final';
      this._renderWith(this.composer, now, false);
      this.pendingFinal = false;
      this._finalProbe = now;
    }
    this.dirty = false;
    return true;
  }

  _renderWith(composer, now, interactive) {
    const r = this.renderer;
    // shadows: static unless dirty; during interaction refresh at most every 300 ms
    if (this.shadowsDirty && (!interactive || now - this._lastShadowAt > 300)) {
      r.shadowMap.needsUpdate = true; this.shadowsDirty = false; this._lastShadowAt = now; this.stats.shadowUpdates++;
    }
    r.transmissionResolutionScale = interactive ? 0.5 : 1.0;
    const t0 = performance.now();
    r.info.reset();
    composer.render();
    const info = r.info.render;
    this.stats.drawCalls = info.calls; this.stats.triangles = info.triangles;
    this.stats.frames++;
    this.stats.lastMs = performance.now() - t0;
    if (!interactive) this.stats.finalCpuMs = this.stats.lastMs;
  }

  /** Render both chains once (behind the loading screen) so no program compiles during interaction. */
  warmup() {
    const now = performance.now();
    this._renderWith(this.fastComposer, now, true);
    this._renderWith(this.composer, now, false);
    this.renderer.shadowMap.needsUpdate = false;
    this.stats.frames = 0; this.dirty = true;
  }

  /** Diagnostics / comparison hook: one interactive-profile frame now. */
  renderInteractive() { this._renderWith(this.fastComposer, performance.now(), true); this.dirty = true; }

  /** Legacy/testing hook: force a full-quality frame now. */
  render() { this._renderWith(this.composer, performance.now(), false); this.dirty = false; this.pendingFinal = false; this.mode = 'final'; }
  renderFinal() { this.render(); }

  // ------------------------------------------------------------------ adaptation
  _onInteractiveCost(dt, now) {
    if (dt > 5000) return; // tab was hidden / debugger pause
    this._ema = this._ema ? this._ema * 0.8 + dt * 0.2 : dt;
    // real cost of an interactive frame; kept across idle periods (used for the settle window)
    this._interFrameMs = this._interFrameMs ? this._interFrameMs * 0.7 + dt * 0.3 : dt;
    this.stats.frameMs = this._ema;
    if (!this.isAuto || now - this._lastEval < AUTO.evalEveryMs) return;
    this._lastEval = now;
    let s = this.renderScale;
    if (this._ema > AUTO.targetMs * 1.2) s *= Math.max(0.6, AUTO.targetMs / this._ema);
    else if (this._ema < AUTO.targetMs * 0.7) s *= 1.12;
    s = Math.min(AUTO.maxScale, Math.max(AUTO.minScale, Math.round(s * 20) / 20));
    if (s !== this.renderScale) { this.renderScale = s; this._applyScale(); }
  }

  _onFinalCost(ms) {
    this.stats.finalMs = ms;
    if (!this.isAuto) return;
    const i = AUTO_FINAL_LADDER.indexOf(this.autoFinal);
    if (ms > AUTO.finalSlowMs) {
      if (++this._slowFinals >= 2 && i < AUTO_FINAL_LADDER.length - 2) { this.autoFinal = AUTO_FINAL_LADDER[i + 1]; this._slowFinals = 0; this._applyFinal(this.autoFinal); this._applyScale(true); this.dirty = true; }
    } else {
      this._slowFinals = 0;
    }
  }

  setSelection(objects) { this.outline.selectedObjects = objects; this.fastOutline.selectedObjects = objects; this.invalidate(); }

  diagnostics() {
    const s = this.stats;
    return {
      mode: this.isInteractive ? 'interactive' : 'final', quality: QUALITY[this.qualityKey].short || QUALITY[this.qualityKey].label, finalProfile: this.final?.label,
      fps: s.fps, frameMs: s.frameMs, cpuMs: s.lastMs, finalMs: s.finalMs, drawCalls: s.drawCalls, triangles: s.triangles,
      renderScale: this.renderScale, pixelRatio: this.basePixelRatio, shadowUpdates: s.shadowUpdates,
      programs: this.renderer.info.programs?.length ?? 0, gpu: this.gpuName || '',
    };
  }
}
