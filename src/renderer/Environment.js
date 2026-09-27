import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/**
 * Image-based lighting.
 *  - Reflections/ambient: a procedural "facility" light-probe scene (dark walls, LED ceiling panels,
 *    a daylight window and warm terrarium glow) prefiltered with PMREM. Matches the room, so glass and
 *    metal reflect believable light sources rather than an unrelated outdoor panorama.
 *  - Exterior: a CC0 HDRI (Poly Haven) mapped on a far dome, visible only through windows when the
 *    camera is inside the room; it also feeds the window area of the light-probe.
 */
export class EnvironmentSystem {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.hdr = null;
    this.exterior = null;
    this.envRT = null;
    this.current = null;
  }

  async loadHDR(url) {
    try {
      const tex = await new HDRLoader().loadAsync(url);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.hdr = tex;
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false });
      mat.color.setScalar(0.9);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), mat);
      dome.scale.x = -1; dome.rotation.y = Math.PI * 0.35; dome.renderOrder = -10;
      dome.name = 'exterior-dome'; dome.visible = false;
      this.exterior = dome;
      this.scene.add(dome);
      return true;
    } catch (e) {
      console.warn('[environment] HDRI unavailable, continuing with procedural environment only', e);
      return false;
    }
  }

  /** Build/refresh the PMREM probe for a lighting preset. */
  build(preset) {
    const key = JSON.stringify(preset);
    if (key === this.current) return;
    this.current = key;
    const env = new THREE.Scene();
    const basic = (hex, k = 1) => { const m = new THREE.MeshBasicMaterial({ color: hex, side: THREE.BackSide }); m.color.multiplyScalar(k); return m; };
    const room = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 6), [
      basic(0x8a8580, 0.06 + preset.probeFill * 0.22), basic(0x8a8580, 0.06 + preset.probeFill * 0.22), basic(0xe8e4dc, 0.3 * preset.probeFill + 0.02), basic(0x5a5550, 0.05 + 0.12 * preset.probeFill),
      basic(0x2e3033, 0.06 + preset.probeFill * 0.1), basic(0x8a8580, 0.06 + preset.probeFill * 0.22),
    ]);
    room.position.y = 1.35;
    env.add(room);
    const panel = (x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), basic(0xfff1e2, 14 * preset.ceiling + 0.05));
      m.material.side = THREE.DoubleSide; m.rotation.x = Math.PI / 2; m.position.set(x, 2.93, z); env.add(m);
    };
    for (const x of [-1.25, 1.25]) for (const z of [-1, 1]) panel(x, z);
    // window: HDRI-lit if available
    const winMat = this.hdr ? new THREE.MeshBasicMaterial({ map: this.hdr, side: THREE.DoubleSide }) : basic(0xcfe0ff, 3);
    winMat.color.multiplyScalar(this.hdr ? 1.4 * preset.window : 3 * preset.window);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), winMat);
    win.rotation.y = -Math.PI / 2; win.position.set(3.45, 1.6, 0.2); env.add(win);
    // terrarium glow band along the feature wall
    for (const [x, w, c] of [[-1.8, 1.0, 0xffd8a8], [-0.4, 0.6, 0xe8f0ff], [0.8, 1.2, 0xffe0bc], [2.1, 1.2, 0xe8f0ff]]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.5), basic(c, 1.6 * preset.enclosures));
      g.material.side = THREE.DoubleSide; g.position.set(x, 1.25, -2.95); env.add(g);
    }
    const rt = this.pmrem.fromScene(env, 0.035);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach((m) => m.dispose()); } });
  }

  /** Show the exterior dome only when the camera is inside the room (otherwise a dark stage). */
  update(cameraPos, room) {
    if (!this.exterior) return;
    const inside = Math.abs(cameraPos.x) < room.width / 2 && Math.abs(cameraPos.z) < room.depth / 2 && cameraPos.y < room.height && cameraPos.y > 0;
    this.exterior.visible = inside;
    this.exterior.position.set(cameraPos.x * 0.0, 0, 0);
  }

  setExteriorLevel(k) { if (this.exterior) this.exterior.material.color.setScalar(0.9 * k); }
}
