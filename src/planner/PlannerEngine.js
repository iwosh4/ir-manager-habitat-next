import * as THREE from 'three';
import { QUALITY, gpuName } from '../renderer/quality.js';
import { LAYER_SPECIAL } from '../renderer/layers.js';

/**
 * PLANNER renderer — designed cheap from the start, not the Showcase pipeline with effects disabled.
 *
 *   one scene pass  → HalfFloat render target (4× MSAA, no depth-prepass, no shadow maps, no lights)
 *   one blit pass   → painterly grade (soft shoulder, warm/cool split, vignette) + linear→sRGB
 *
 * Two draws of fixed cost around a scene that is a handful of batched meshes. Stationary frames
 * render at the full pixel ratio; while the user interacts the same pass renders at an adaptive
 * scale that only drops if the measured frame time exceeds the 60 fps budget (≥ 30 fps floor).
 * Same public contract as RenderEngine (interact / invalidate / frame / diagnostics …).
 */
const AUTO = { targetMs: 16.7, minScale: 0.5, maxScale: 1, evalEveryMs: 300 };
const SETTLE_MS = 160;

const BLIT_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BLIT_FRAG = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uRes; uniform float uVignette, uExposure, uInk, uNear, uFar;
varying vec2 vUv;
float linDepth(vec2 uv) { float z = texture2D(tDepth, uv).r * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture2D(tColor, vUv).rgb * uExposure;
  // illustrated edge: a fine ink line on the near side of silhouettes (relative depth discontinuity)
  if (uInk > 0.0) {
    vec2 px = 1.0 / uRes;
    float d0 = linDepth(vUv);
    float e = max(max(linDepth(vUv + vec2(px.x, 0.0)), linDepth(vUv - vec2(px.x, 0.0))), max(linDepth(vUv + vec2(0.0, px.y)), linDepth(vUv - vec2(0.0, px.y)))) - d0;
    float edge = smoothstep(0.02, 0.08, e / d0) * (1.0 - smoothstep(9.0, 16.0, d0));
    c = mix(c, c * vec3(0.3, 0.25, 0.22) + vec3(0.004, 0.003, 0.002), edge * uInk);
  }
  // soft shoulder: emissive interiors roll off like paint, never clip to white
  c = c / (1.0 + max(vec3(0.0), c - 0.72) * 0.9);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // split toning: cool graphite shadows, warm highlights (IR Manager house look)
  c *= mix(vec3(0.94, 0.97, 1.04), vec3(1.04, 1.0, 0.95), smoothstep(0.05, 0.6, l));
  c = mix(vec3(l), c, 1.06);
  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
  c *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(q));
  gl_FragColor = vec4(toSRGB(max(c, 0.0)), 1.0);
}`;

export class PlannerEngine {
  constructor(renderer, container, { quality = 'auto' } = {}) {
    this.renderer = renderer; this.container = container;
    this.scene = null; this.camera = null;
    this.dirty = true; this.interactiveUntil = 0; this.interacting = false; this.pendingFinal = false;
    this.mode = 'final'; this.renderScale = 1; this.active = false;
    this.stats = { frames: 0, lastMs: 0, fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, finalMs: 0, finalProfile: '' };
    this.qualityKey = quality in QUALITY ? quality : 'auto';
    this._ema = 0; this._lastEval = 0; this._probe = null; this._probeInteractive = false;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    this.target.depthTexture = new THREE.DepthTexture(1, 1); // resolved from MSAA; drives the ink edge
    this.blitMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture }, tDepth: { value: this.target.depthTexture }, uRes: { value: new THREE.Vector2(1, 1) },
        uVignette: { value: 0.32 }, uExposure: { value: 1.0 }, uInk: { value: 0.85 }, uNear: { value: 0.03 }, uFar: { value: 200 },
      },
      vertexShader: BLIT_VERT, fragmentShader: BLIT_FRAG, depthTest: false, depthWrite: false,
    });
    this.blitScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMat); quad.frustumCulled = false;
    this.blitScene.add(quad);
    this.blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.gpuName = gpuName(renderer);
    this.background = new THREE.Color(0x0e0f11);
  }

  attach(scene, camera) {
    this.scene = scene; this.camera = camera;
    camera.layers.enable(LAYER_SPECIAL);
    this.setQuality(this.qualityKey);
    new ResizeObserver(() => { if (this.active) this.resize(); }).observe(this.container);
  }

  activate() { this.active = true; this._probe = null; this.resize(); this.dirty = true; }
  deactivate() { this.active = false; this._probe = null; }

  // ------------------------------------------------------------------ quality
  get isAuto() { return !!QUALITY[this.qualityKey]?.auto; }
  setQuality(key) {
    this.qualityKey = key in QUALITY ? key : 'auto';
    const q = QUALITY[this.qualityKey];
    const soft = /swiftshader|llvmpipe|software/i.test(this.gpuName);
    this.maxPixelRatio = this.isAuto ? (soft ? 1 : 1.5) : q.pixelRatio;
    this.msaa = this.isAuto ? 4 : q.msaa || 0;
    this.stats.finalProfile = this.isAuto ? `Painted ×${this.maxPixelRatio}` : `Painted ${q.label}`;
    if (!this.isAuto) this.renderScale = Math.max(q.interactiveScale, 0.75);
    if (this.target.samples !== this.msaa) { this.target.samples = this.msaa; this.target.dispose(); }
    this.resize();
  }

  resize() {
    if (!this.active) return;
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio || 1);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.cssW = w; this.cssH = h;
    this._sizeTarget(1);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this.onResize && this.onResize(w, h);
    this.invalidate();
  }

  _sizeTarget(scale) {
    const pr = this.basePixelRatio * scale;
    const w = Math.max(1, Math.round(this.cssW * pr)), h = Math.max(1, Math.round(this.cssH * pr));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    this.blitMat.uniforms.uRes.value.set(w, h);
  }

  // ------------------------------------------------------------------ invalidation (same contract as RenderEngine)
  invalidate() { this.dirty = true; }
  interact(ms = SETTLE_MS) { this.interactiveUntil = Math.max(this.interactiveUntil, performance.now() + ms); this.dirty = true; }
  markShadowsDirty() { this.dirty = true; } // no shadow maps: painted light only
  get isInteractive() { return this.interacting || performance.now() < this.interactiveUntil; }
  get needsFrame() { return this.dirty || this.pendingFinal || this.isInteractive; }

  frame(now = performance.now()) {
    if (this._probe !== null) { this._onCost(now - this._probe, now, this._probeInteractive); this._probe = null; }
    if (!this.needsFrame) { this._ema = 0; return false; }
    const interactive = this.isInteractive;
    // stationary frames are the same pass at full scale (nothing expensive is switched on)
    this._render(interactive ? this.renderScale : 1);
    this.mode = interactive ? 'interactive' : 'final';
    this.pendingFinal = interactive && this.renderScale < 1;
    this._probe = now; this._probeInteractive = interactive;
    this.dirty = false;
    return true;
  }

  _render(scale) {
    const r = this.renderer;
    const t0 = performance.now();
    this._sizeTarget(scale);
    r.info.reset();
    const prevTM = r.toneMapping; r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this.target);
    r.setClearColor(this.background, 1); r.clear();
    r.render(this.scene, this.camera);
    const calls = r.info.render.calls, tris = r.info.render.triangles;
    r.setRenderTarget(null);
    this.blitMat.uniforms.uNear.value = this.camera.near; this.blitMat.uniforms.uFar.value = this.camera.far;
    r.render(this.blitScene, this.blitCam);
    r.toneMapping = prevTM;
    this.stats.drawCalls = calls + 1; this.stats.triangles = tris;
    this.stats.frames++;
    this.stats.lastMs = performance.now() - t0;
    this.stats.renderScale = scale;
  }

  _onCost(dt, now, interactive) {
    if (dt > 5000) return;
    this._ema = this._ema ? this._ema * 0.8 + dt * 0.2 : dt;
    this.stats.frameMs = this._ema;
    if (!interactive) this.stats.finalMs = dt;
    if (!interactive || !this.isAuto || now - this._lastEval < AUTO.evalEveryMs) return;
    this._lastEval = now;
    let s = this.renderScale;
    if (this._ema > AUTO.targetMs * 1.25) s *= Math.max(0.7, AUTO.targetMs / this._ema);
    else if (this._ema < AUTO.targetMs * 0.8) s *= 1.1;
    this.renderScale = Math.min(AUTO.maxScale, Math.max(AUTO.minScale, Math.round(s * 20) / 20));
  }

  warmup() { this._render(1); this._render(this.renderScale); this.stats.frames = 0; this.dirty = true; }
  render() { this._render(1); this.dirty = false; this.pendingFinal = false; this.mode = 'final'; }
  renderFinal() { this.render(); }
  renderInteractive() { this._render(this.renderScale); this.dirty = true; }
  setSelection() { this.invalidate(); } // selection is drawn by the view (amber rim) + overlay

  diagnostics() {
    const s = this.stats;
    return {
      renderer: 'planner', mode: this.isInteractive ? 'interactive' : 'final', quality: QUALITY[this.qualityKey].short || QUALITY[this.qualityKey].label, finalProfile: s.finalProfile,
      fps: s.fps, frameMs: s.frameMs, cpuMs: s.lastMs, finalMs: s.finalMs, drawCalls: s.drawCalls, triangles: s.triangles,
      renderScale: this.isInteractive ? this.renderScale : 1, pixelRatio: this.basePixelRatio, shadowUpdates: 0,
      programs: this.renderer.info.programs?.length ?? 0, gpu: this.gpuName || '',
    };
  }
}
