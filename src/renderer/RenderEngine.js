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
import { LAYER_SPECIAL } from '../assets/AssetManager.js';

export const QUALITY = {
  ultra: { label: 'Ultra', pixelRatio: 2, msaa: 4, ao: true, aoSamples: 16, bloom: true, shadowMap: 2048, smaa: false },
  high: { label: 'High', pixelRatio: 1.5, msaa: 4, ao: true, aoSamples: 12, bloom: true, shadowMap: 2048, smaa: false },
  balanced: { label: 'Balanced', pixelRatio: 1, msaa: 4, ao: true, aoSamples: 8, bloom: true, shadowMap: 1024, smaa: false },
  fast: { label: 'Fast', pixelRatio: 1, msaa: 0, ao: false, aoSamples: 8, bloom: false, shadowMap: 1024, smaa: true },
};

/**
 * WebGL renderer + post-processing chain:
 *   RenderPass (MSAA, HDR half-float) -> GTAO contact shadows -> bloom (emissives only) ->
 *   selection outline -> OutputPass (ACES filmic tone mapping + sRGB) -> finishing grade -> optional SMAA.
 * Rendering is on-demand: call invalidate() after anything changes.
 */
export class RenderEngine {
  constructor(container, { quality = 'high' } = {}) {
    this.container = container;
    RectAreaLightUniformsLib.init();
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x0b0c0d, 1);
    renderer.info.autoReset = false;
    renderer.domElement.className = 'viewport-canvas';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.scene = null;
    this.camera = null;
    this.dirty = true;
    this.continuousUntil = 0;
    this.stats = { frames: 0, lastMs: 0, fps: 0, drawCalls: 0, triangles: 0 };
    this.qualityKey = quality;
  }

  attach(scene, camera) {
    this.scene = scene; this.camera = camera;
    camera.layers.enable(LAYER_SPECIAL);
    this._buildComposer();
    this.setQuality(this.qualityKey);
    new ResizeObserver(() => this.resize()).observe(this.container);
    this.resize();
  }

  _buildComposer() {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
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
    this.outline = new OutlinePass(new THREE.Vector2(size.x, size.y), this.scene, this.camera);
    Object.assign(this.outline, { edgeStrength: 4, edgeGlow: 0.0, edgeThickness: 1.0, pulsePeriod: 0 });
    this.outline.visibleEdgeColor.set(0xf0a04b);
    this.outline.hiddenEdgeColor.set(0x6b4520);
    const outlineRender = this.outline.render.bind(this.outline);
    this.outline.render = (...args) => {
      if (!this.outline.selectedObjects.length) { return this._copyThrough(...args); }
      const cam = this.camera; cam.layers.disable(LAYER_SPECIAL);
      try { outlineRender(...args); } finally { cam.layers.enable(LAYER_SPECIAL); }
    };
    this.output = new OutputPass();
    this.finish = createFinishPass();
    this.smaa = new SMAAPass();
    composer.addPass(this.renderPass);
    composer.addPass(this.gtao);
    composer.addPass(this.bloom);
    composer.addPass(this.outline);
    composer.addPass(this.output);
    composer.addPass(this.finish);
    composer.addPass(this.smaa);
    this.composer = composer;
  }

  _copyThrough(renderer, writeBuffer, readBuffer) {
    // OutlinePass with nothing selected: it is flagged needsSwap=false, so the read buffer simply passes on.
    void renderer; void writeBuffer; void readBuffer;
  }

  setQuality(key) {
    const q = QUALITY[key] || QUALITY.high;
    this.qualityKey = key in QUALITY ? key : 'high';
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (rt.samples !== q.msaa) { rt.samples = q.msaa; rt.dispose(); }
    this.gtao.enabled = q.ao;
    this.gtao.updateGtaoMaterial({ samples: q.aoSamples });
    this.bloom.enabled = q.bloom;
    this.smaa.enabled = q.smaa;
    this.shadowMapSize = q.shadowMap;
    this.scene?.traverse((o) => {
      if (o.isLight && o.castShadow && o.shadow.mapSize.x !== q.shadowMap) {
        o.shadow.mapSize.set(q.shadowMap, q.shadowMap); o.shadow.map?.dispose(); o.shadow.map = null;
      }
    });
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.composer.setSize(w, h);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this.onResize && this.onResize(w, h);
    this.invalidate();
  }

  invalidate(ms = 0) {
    this.dirty = true;
    if (ms) this.continuousUntil = Math.max(this.continuousUntil, performance.now() + ms);
  }

  get needsFrame() { return this.dirty || performance.now() < this.continuousUntil; }

  render() {
    const t0 = performance.now();
    this.renderer.info.reset();
    this.composer.render();
    this.dirty = false;
    const info = this.renderer.info.render;
    this.stats.drawCalls = info.calls; this.stats.triangles = info.triangles;
    this.stats.frames++;
    this.stats.lastMs = performance.now() - t0;
  }

  setSelection(objects) { this.outline.selectedObjects = objects; this.invalidate(); }
}
