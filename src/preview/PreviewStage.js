import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PlannerEngine } from '../planner/PlannerEngine.js';
import { PaintBuilder } from '../planner/PaintBuilder.js';
import { flat } from '../planner/geometry.js';
import { TILE_CLAMP } from '../planner/PaintedMaterials.js';
import { acquireGeometry, releaseGeometry, meshesFor } from '../planner/PlannerView.js';
import { LAYER_SPECIAL } from '../renderer/layers.js';

/**
 * Small, separate Planner render stage for the Enclosure Designer, the Assembly Builder's live 3D
 * preview and library thumbnails. It reuses PlannerEngine (same painted pipeline, same cost profile),
 * the painted materials and the shared geometry cache — a template shown here and in the room is
 * generated once. One stage instance is shared by all editors (only one is visible at a time).
 */
export class PreviewStage {
  constructor(mats) {
    this.mats = mats;
    this.host = document.createElement('div');
    this.host.className = 'preview-stage';
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.className = 'preview-canvas';
    this.host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.02, 60);
    this.camera.layers.enable(LAYER_SPECIAL);
    this.engine = new PlannerEngine(this.renderer, this.host, { quality: 'auto' });
    this.engine.background = new THREE.Color(0x121315);
    this.engine.attach(this.scene, this.camera);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.12, rotateSpeed: 0.7, zoomSpeed: 1.1, screenSpacePanning: true, maxPolarAngle: Math.PI * 0.49 });
    this.controls.addEventListener('change', () => this.engine.interact());
    this.content = new THREE.Group(); this.scene.add(this.content);
    this.overlay = new THREE.Group(); this.scene.add(this.overlay); // editor helpers (selection, items)
    this.keys = [];
    this._ground(4);
    this.running = false;
  }

  _ground(size) {
    if (this.ground) { this.ground.removeFromParent(); }
    const b = new PaintBuilder(this.mats);
    b.add(flat(size, size), 'floor', { uvScale: 0.9, color: [0.8, 0.78, 0.76], ao: (p) => Math.max(0.35, 1 - Math.hypot(p.x, p.z) / (size * 0.5)) });
    b.add(flat(size * 0.35, size * 0.35), 'glow', { bucket: 'glow', mode: TILE_CLAMP, uv: 'keep', pos: [0, 0.002, 0], color: [0.12, 0.11, 0.1], alpha: 1 });
    this.ground = b.build('stage-ground');
    this.ground.position.y = -0.001;
    this.scene.add(this.ground);
  }

  mount(container) {
    container.appendChild(this.host);
    this.engine.activate();
    if (!this.running) { this.running = true; this._loop(); }
    requestAnimationFrame(() => this.engine.resize());
  }

  unmount() { this.running = false; this.engine.deactivate(); this.host.remove(); }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame((now) => {
      this.controls.update();
      if (this.engine.needsFrame) this.engine.frame(now);
      this._loop();
    });
  }

  /** Replace the shown content with cached geometry sets: [{ key, make, position, name }]. */
  setParts(parts) {
    const old = this.keys; this.keys = [];
    this.content.clear();
    for (const p of parts) {
      const entry = acquireGeometry(p.key, p.make);
      this.keys.push(p.key);
      const g = meshesFor(entry, this.mats, p.name || '');
      if (p.position) g.position.set(...p.position);
      g.userData = { ...(p.userData || {}) };
      this.content.add(g);
    }
    for (const k of old) releaseGeometry(k);
    this.engine.invalidate();
  }

  /** Frame a box (size in metres, centre) from a three-quarter front view. */
  frame(size, { center = [0, size.h / 2, 0], dir = [0.55, 0.42, 1], margin = 1.18, keep = false } = {}) {
    const r = Math.max(0.2, Math.hypot(size.w, size.h, size.d) / 2);
    const d = new THREE.Vector3(...dir).normalize();
    const dist = (r * margin) / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const c = new THREE.Vector3(...center);
    if (!keep) this.camera.position.copy(c).addScaledVector(d, dist);
    this.controls.target.copy(c);
    this.controls.minDistance = r * 0.4; this.controls.maxDistance = dist * 4;
    this.controls.update();
    const g = Math.max(3, r * 6);
    if (Math.abs((this._groundSize || 0) - g) > 0.5) { this._groundSize = g; this._ground(g); }
    this.engine.invalidate();
  }

  invalidate() { this.engine.invalidate(); }

  /**
   * Exact FRONT ELEVATION image of `parts` (orthographic, the image rectangle is the physical
   * w × h box) — drawn inside the pieces of the Assembly Builder's Tetris canvas.
   */
  frontImage(parts, size, { ppm = 220, max = 640 } = {}) {
    const k = Math.min(ppm, max / Math.max(size.w, size.h));
    const w = Math.max(8, Math.round(size.w * k)), h = Math.max(8, Math.round(size.h * k));
    const cam = new THREE.OrthographicCamera(-size.w / 2, size.w / 2, size.h, 0, 0.01, 10);
    cam.position.set(0, 0, size.d / 2 + 1); cam.layers.enable(LAYER_SPECIAL);
    return this._offscreen(parts, w, h, cam, { ground: false, ink: 0 });
  }

  _offscreen(parts, w, h, cam, { ground = true, ink = null } = {}) {
    const keys = this.keys, children = [...this.content.children], overlay = this.overlay.visible;
    this.keys = []; this.content.clear(); this.overlay.visible = false;
    this.setParts(parts);
    const canvas = this.renderer.domElement, oldPR = this.renderer.getPixelRatio(), oldW = canvas.width, oldH = canvas.height;
    const eng = this.engine, oldCam = eng.camera, oldInk = eng.blitMat.uniforms.uInk.value, oldVig = eng.blitMat.uniforms.uVignette.value;
    if (this.ground) this.ground.visible = ground;
    this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false);
    eng.cssW = w; eng.cssH = h; eng.basePixelRatio = 1; eng.camera = cam;
    if (ink !== null) eng.blitMat.uniforms.uInk.value = ink;
    eng.blitMat.uniforms.uVignette.value = 0;
    eng.render();
    const url = canvas.toDataURL('image/png');
    eng.camera = oldCam; eng.blitMat.uniforms.uInk.value = oldInk; eng.blitMat.uniforms.uVignette.value = oldVig;
    if (this.ground) this.ground.visible = true;
    const tmp = this.keys; this.keys = keys; this.content.clear(); for (const c of children) this.content.add(c);
    for (const k2 of tmp) releaseGeometry(k2);
    this.overlay.visible = overlay;
    this.renderer.setPixelRatio(oldPR);
    if (this.host.parentNode && eng.active) eng.resize(); else this.renderer.setSize(oldW, oldH, false);
    eng.invalidate();
    return url;
  }

  /**
   * Render `parts` once into a w×h image (library thumbnails). Uses the same stage off-screen: the
   * canvas is resized temporarily and restored; the frame is read in the same task as it is drawn.
   */
  thumbnail(parts, size, { w = 176, h = 132, dir = [0.62, 0.38, 1] } = {}) {
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.02, 60); cam.layers.enable(LAYER_SPECIAL);
    const r = Math.max(0.15, Math.hypot(size.w, size.h, size.d) / 2), c = new THREE.Vector3(0, size.h / 2, 0);
    cam.position.copy(c).addScaledVector(new THREE.Vector3(...dir).normalize(), (r * 1.08) / Math.sin(THREE.MathUtils.degToRad(15)));
    cam.lookAt(c);
    return this._offscreen(parts, w, h, cam);
  }
}
