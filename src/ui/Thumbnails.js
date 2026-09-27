import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Renders library thumbnails from the real GLB assets (same materials as the viewport) with a small
 * offscreen renderer. Runs lazily after the room is interactive.
 */
export class Thumbnails {
  constructor(assets, size = [176, 132]) {
    this.assets = assets; this.size = size; this.cache = new Map();
  }

  _init() {
    if (this.renderer) return;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setSize(this.size[0], this.size[1], false);
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    this.renderer = r;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;
    const key = new THREE.DirectionalLight(0xfff2e0, 1.6); key.position.set(2, 3, 2.5);
    this.scene.add(key, new THREE.HemisphereLight(0xffffff, 0x303030, 0.4));
    this.camera = new THREE.PerspectiveCamera(30, this.size[0] / this.size[1], 0.01, 50);
  }

  async get(type, url) {
    if (this.cache.has(type)) return this.cache.get(type);
    const p = this._render(url);
    this.cache.set(type, p);
    return p;
  }

  async _render(url) {
    const res = await this.assets.instantiate(url);
    if (!res) return null;
    this._init();
    const root = res.root;
    root.traverse((o) => { if (o.isMesh) o.layers.enableAll(); });
    this.scene.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const s = box.getBoundingSphere(new THREE.Sphere());
    const dir = new THREE.Vector3(0.62, 0.42, 1).normalize();
    const dist = s.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.92;
    this.camera.position.copy(s.center).addScaledVector(dir, dist);
    this.camera.lookAt(s.center);
    this.camera.layers.enableAll();
    this.renderer.render(this.scene, this.camera);
    const url2 = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(root);
    return url2;
  }
}
