import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Loads GLB models once, binds their material slots to the shared MaterialLibrary and hands out
 * lightweight clones (geometry and materials are shared between instances).
 *
 * Missing or broken assets never break the editor: `instantiate()` resolves to `null`, the error is
 * recorded in `failures`, and the caller shows a placeholder while the logical object stays intact.
 */
export class AssetManager {
  constructor(materials, { onProgress, onError } = {}) {
    this.materials = materials;
    this.manager = new THREE.LoadingManager();
    this.loader = new GLTFLoader(this.manager);
    this.cache = new Map();     // url -> Promise<{scene, info}|null>
    this.failures = new Map();  // url -> message
    this.onError = onError || (() => {});
    this.manager.onProgress = (url, loaded, total) => onProgress && onProgress(loaded, total, url);
  }

  load(url) {
    if (!this.cache.has(url)) {
      const p = this.loader.loadAsync(url).then((gltf) => {
        const scene = gltf.scene;
        const missing = this.materials.bind(scene);
        if (missing.length) console.warn(`[assets] ${url}: unbound material slots`, missing);
        scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = o.userData.castShadow !== false;
          o.receiveShadow = true;
          if (layerForSlot(o.userData.slot) === LAYER_SPECIAL) o.layers.set(LAYER_SPECIAL);
        });
        const info = scene.userData.habitat || {};
        return { scene, info };
      }).catch((err) => {
        const msg = err?.message || String(err);
        this.failures.set(url, msg);
        console.warn(`[assets] failed to load ${url}: ${msg}`);
        this.onError(url, msg);
        return null;
      });
      this.cache.set(url, p);
    }
    return this.cache.get(url);
  }

  /** Returns a clone of the model root (shared geometry & materials) or null if unavailable. */
  async instantiate(url) {
    const res = await this.load(url);
    if (!res) return null;
    const clone = res.scene.clone(true);
    clone.userData = { ...res.scene.userData };
    return { root: clone, info: res.info };
  }

  preload(urls) { return Promise.all(urls.map((u) => this.load(u))); }
}

/** Slots rendered on the "special" layer: excluded from AO / outline depth passes. */
const SPECIAL = new Set(['water_fall', 'glass', 'glass_frosted', 'acrylic_smoke', 'pp_translucent', 'water', 'leaf', 'mesh_screen', 'perforated', 'pegboard', 'grass_dry']);
export const LAYER_SPECIAL = 1;
/** Seen only by shadow cameras: cut-away walls keep casting shadows, so cut-away never invalidates them. */
export const LAYER_SHADOW_ONLY = 2;
export function layerForSlot(slot) { return SPECIAL.has(slot) ? LAYER_SPECIAL : 0; }
