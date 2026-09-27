import * as THREE from 'three';

/**
 * Shared physically based materials, keyed by *slot name*.
 *
 * GLB models only carry slot names (plus fallback PBR values); this library binds each slot to
 * a single shared, fully textured material so that every object in the room reuses the same GPU
 * programs and textures. Texture repeat is expressed in metres: model/room UVs are authored so
 * that 1 UV unit = 1 m, therefore repeat = 1 / tileSizeInMetres.
 */
const TEX_ROOT = 'assets/textures/';

export class MaterialLibrary {
  constructor(renderer, { onError } = {}) {
    this.renderer = renderer;
    this.loader = new THREE.TextureLoader();
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.sources = new Map();   // url -> Texture (base, shared source)
    this.materials = new Map(); // slot -> Material
    this.pending = [];
    this.onError = onError || (() => {});
    this.animated = [];         // materials with time-dependent uniforms (water)
    this._define();
  }

  /** Load (once) a texture file and return a clone with its own repeat. Shares the GPU upload. */
  tex(set, map, { repeat = [1, 1], srgb = false } = {}) {
    const url = `${TEX_ROOT}${set}/${map}`;
    let base = this.sources.get(url);
    if (!base) {
      let done;
      this.pending.push(new Promise((res) => { done = res; }));
      base = this.loader.load(url, () => done(), undefined, () => { this.onError(url); done(); });
      base.wrapS = base.wrapT = THREE.RepeatWrapping;
      base.anisotropy = this.anisotropy;
      base.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      this.sources.set(url, base);
    }
    const t = base.clone();
    t.repeat.set(repeat[0], repeat[1] ?? repeat[0]);
    t.needsUpdate = false;
    return t;
  }

  /** albedo + normal + packed ORM for a texture set. */
  set(name, tile, { albedo = true, normal = true, orm = true, normalScale = 1, aoIntensity = 1 } = {}) {
    const rep = Array.isArray(tile) ? [1 / tile[0], 1 / tile[1]] : [1 / tile, 1 / tile];
    const p = {};
    if (albedo) p.map = this.tex(name, 'albedo.jpg', { repeat: rep, srgb: true });
    if (normal) { p.normalMap = this.tex(name, 'normal.jpg', { repeat: rep }); p.normalScale = new THREE.Vector2(normalScale, normalScale); }
    if (orm) {
      const o = this.tex(name, 'orm.jpg', { repeat: rep });
      p.roughnessMap = o; p.aoMap = o; p.aoMapIntensity = aoIntensity;
    }
    return p;
  }

  add(slot, material) { material.name = slot; this.materials.set(slot, material); return material; }

  _define() {
    const S = (slot, params) => this.add(slot, new THREE.MeshStandardMaterial(params));
    const P = (slot, params) => this.add(slot, new THREE.MeshPhysicalMaterial(params));
    const C = (hex) => new THREE.Color(hex);

    // --- metals & coatings ---
    const brushed = (tile) => ({ normalMap: this.tex('brushed_metal', 'normal.jpg', { repeat: [1 / tile, 1 / tile] }), roughnessMap: this.tex('brushed_metal', 'orm.jpg', { repeat: [1 / tile, 1 / tile] }) });
    const peel = (tile = 0.25, s = 0.35) => ({ normalMap: this.tex('powder_coat', 'normal.jpg', { repeat: [1 / tile, 1 / tile] }), normalScale: new THREE.Vector2(s, s) });
    S('frame_black', { color: C(0x121315), metalness: 0.75, roughness: 1.0, ...brushed(0.3), normalScale: new THREE.Vector2(0.25, 0.25) }).roughnessMap = null;
    this.materials.get('frame_black').roughness = 0.36;
    S('aluminium', { color: C(0xc9ccd0), metalness: 1, roughness: 1.1, ...brushed(0.4), normalScale: new THREE.Vector2(0.35, 0.35) });
    S('stainless', { color: C(0xd6d8da), metalness: 0.92, roughness: 1.25, ...brushed(0.5), normalScale: new THREE.Vector2(0.3, 0.3) });
    S('chrome', { color: C(0xf4f4f4), metalness: 1, roughness: 0.06 });
    S('copper', { color: C(0xc98a5a), metalness: 1, roughness: 0.32 });
    P('steel_graphite', { color: C(0x2b2d31), metalness: 0.35, roughness: 0.46, ...peel(0.25, 0.3), clearcoat: 0.12, clearcoatRoughness: 0.35 });
    P('steel_white', { color: C(0xe2e2de), metalness: 0.1, roughness: 0.42, ...peel(0.25, 0.12), clearcoat: 0.1, clearcoatRoughness: 0.3 });
    P('steel_amber', { color: C(0xd9862c), metalness: 0.2, roughness: 0.42, clearcoat: 0.2 });
    P('door_leaf', { color: C(0x3a3c40), metalness: 0.2, roughness: 0.42, ...peel(0.4, 0.2), clearcoat: 0.15 });

    // --- glass & transparent ---
    P('glass', {
      color: C(0xffffff), metalness: 0, roughness: 0.015, transmission: 1, thickness: 0.006, ior: 1.52,
      attenuationColor: C(0xdff2ea), attenuationDistance: 0.35, specularIntensity: 1, envMapIntensity: 1.25,
      depthWrite: false, // lets blended media behind the pane (water, meshes) stay visible
    });
    P('glass_frosted', { color: C(0xf6f7f7), metalness: 0, roughness: 0.55, transmission: 0.35, thickness: 0.02, ior: 1.5, envMapIntensity: 1, emissive: C(0xe9eef2), emissiveIntensity: 1.6 });
    P('acrylic_smoke', { color: C(0x55595c), metalness: 0, roughness: 0.05, transmission: 0.85, thickness: 0.004, ior: 1.49 });
    // frosted polypropylene: blended so it remains visible behind glass (incubator door) and inside racks
    P('pp_translucent', { color: C(0xe9ecea), metalness: 0, roughness: 0.5, transparent: true, opacity: 0.62, clearcoat: 0.3, clearcoatRoughness: 0.4 });
    // Water is a blended (not transmissive) medium so it stays visible behind glass panes.
    const water = P('water', {
      color: C(0x2f6a5c), metalness: 0, roughness: 0.04, transparent: true, opacity: 0.42, depthWrite: false,
      specularIntensity: 1, envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.03,
      normalMap: this.tex('water', 'normal.jpg', { repeat: [4, 4] }), normalScale: new THREE.Vector2(0.5, 0.5),
    });
    this.animated.push((t) => { water.normalMap.offset.set(t * 0.01, t * 0.013); });

    // --- plastics & rubber ---
    const rub = (s = 0.4) => ({ normalMap: this.tex('rubber', 'normal.jpg', { repeat: [8, 8] }), normalScale: new THREE.Vector2(s, s) });
    S('silicone_black', { color: C(0x0c0c0d), roughness: 0.5 });
    S('rubber_black', { color: C(0x151516), roughness: 0.82, ...rub(0.6) });
    S('plastic_black', { color: C(0x18191a), roughness: 0.42, ...rub(0.2) });
    S('plastic_grey', { color: C(0x5e6166), roughness: 0.5, ...rub(0.2) });
    S('plastic_white', { color: C(0xeceae5), roughness: 0.4, ...rub(0.15) });
    P('pvc_white', { color: C(0xf2f1ec), roughness: 0.32, clearcoat: 0.25, clearcoatRoughness: 0.3 });
    P('pvc_black', { color: C(0x1c1d1f), roughness: 0.38, clearcoat: 0.2, clearcoatRoughness: 0.35 });
    S('cable_black', { color: C(0x101011), roughness: 0.5 });
    S('cable_grey', { color: C(0x8a8d90), roughness: 0.5 });

    // --- emitters (per-object clones are made for anything that switches on/off) ---
    const E = (slot, hex, intensity) => S(slot, { color: C(0x000000), emissive: C(hex), emissiveIntensity: intensity, roughness: 0.4 });
    E('led_warm', 0xffd9ac, 7);
    E('led_cool', 0xe9f1ff, 7);
    E('uvb_tube', 0xf1f3ff, 5);
    E('bulb_hot', 0xffa152, 10);
    E('display', 0xff9a36, 2.2);
    E('display_green', 0x78ffae, 1.6);
    E('panel_led', 0xfff4e8, 3.2);

    // --- wood, boards ---
    S('oak', { ...this.set('oak', [1.2, 0.6]), color: C(0xffffff), roughness: 1 });
    S('mdf_black', { color: C(0x1d1d1e), roughness: 0.55 });
    P('laminate_grey', { color: C(0x3b3d41), roughness: 0.48, ...peel(0.5, 0.15), clearcoat: 0.08 });
    P('laminate_white', { color: C(0xe8e6e1), roughness: 0.4, ...peel(0.5, 0.1), clearcoat: 0.1 });

    // --- naturals ---
    S('sand', { ...this.set('sand', 0.6, { normalScale: 1.2 }), roughness: 1, envMapIntensity: 0.7 });
    S('soil', { ...this.set('soil', 0.45, { normalScale: 1.2 }), roughness: 1, envMapIntensity: 0.6 });
    S('rock', { ...this.set('rock', 0.45, { normalScale: 1.4 }), roughness: 1, envMapIntensity: 0.8 });
    S('rock_dark', { ...this.set('rock', 0.4, { normalScale: 1.4 }), color: C(0x6f6a66), roughness: 1, envMapIntensity: 0.8 });
    S('cork', { ...this.set('cork', 0.3, { normalScale: 1.5 }), roughness: 1, envMapIntensity: 0.6 });
    S('bark', { ...this.set('bark', 0.25, { normalScale: 1.3 }), roughness: 1, envMapIntensity: 0.6 });
    S('driftwood', { ...this.set('bark', 0.35, { normalScale: 1.2 }), color: C(0xd9cfc0), roughness: 1, envMapIntensity: 0.7 });
    S('moss', { ...this.set('moss', 0.18, { normalScale: 1.5 }), roughness: 1, envMapIntensity: 0.5 });
    S('vermiculite', { ...this.set('vermiculite', 0.15), roughness: 1 });
    P('gravel_wet', { ...this.set('sand', 0.25, { normalScale: 1.6 }), color: C(0x8c7a64), roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 0.9 });
    P('water_fall', { color: C(0xf2f7f6), roughness: 0.15, transmission: 0.55, thickness: 0.01, normalMap: this.tex('water', 'normal.jpg', { repeat: [2, 6] }), normalScale: new THREE.Vector2(1.2, 1.2), side: THREE.DoubleSide });
    S('sack', { ...this.set('plaster', 0.3, { orm: false, normalScale: 2 }), color: C(0x3d4a3b), roughness: 0.8 });
    S('sack_label', { color: C(0xe6dcc4), roughness: 0.7 });
    S('leaf', {
      map: this.tex('foliage', 'albedo.png', { srgb: true }), normalMap: this.tex('foliage', 'normal.jpg'), normalScale: new THREE.Vector2(0.8, 0.8),
      alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.52, envMapIntensity: 0.7,
    });
    P('succulent', { color: C(0x8aab99), roughness: 0.42, sheen: 0.6, sheenColor: C(0xcfe3da), sheenRoughness: 0.5, envMapIntensity: 0.8 });
    S('grass_dry', { color: C(0xb39a65), roughness: 0.75, side: THREE.DoubleSide });
    S('plant_stem', { color: C(0x4d6b2f), roughness: 0.6 });
    S('clay_pebble', { color: C(0x8a5236), roughness: 0.92, ...peel(0.05, 1.2) });
    P('egg', { color: C(0xf1eadb), roughness: 0.55, sheen: 0.3, sheenColor: C(0xffffff) });
    const skin = this.set('python_skin', 1, { normalScale: 0.8 });
    P('snake', { ...skin, roughness: 1, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    P('gecko', { map: skin.map, color: C(0xffd98a), roughness: 0.6, normalMap: skin.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) });
    S('eye', { color: C(0x050505), roughness: 0.05, metalness: 0.1 });

    // --- ceramics / paper / fabric ---
    P('ceramic_white', { color: C(0xf1f0ec), roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.08 });
    P('ceramic_dark', { color: C(0x2b2a29), roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.12 });
    S('terracotta', { color: C(0xa9603f), roughness: 0.88, ...peel(0.1, 0.8) });
    S('tiles', { ...this.set('tiles', [1.2, 0.6], { normalScale: 1 }), roughness: 1 });
    S('paper', { ...this.set('plaster', 0.3, { orm: false }), color: C(0xfbf9f3), roughness: 0.92 });
    S('cardboard', { ...this.set('plaster', 0.4, { orm: false }), color: C(0xb08d64), roughness: 0.9 });
    S('fabric_dark', { color: C(0x2a2a2c), roughness: 0.95, ...rub(0.8) });
    S('label', { color: C(0xf4f1ea), roughness: 0.6 });
    S('label_amber', { color: C(0xe08a2c), roughness: 0.5 });
    S('accent_red', { color: C(0xa3261e), roughness: 0.45 });

    // --- perforated / mesh (alpha averaged by mipmaps -> no moire at distance) ---
    const A = (slot, set, rep, hex, extra = {}) => S(slot, {
      color: C(hex), metalness: 0.5, roughness: 0.5, alphaMap: this.tex(set, 'alpha.png', { repeat: [rep, rep] }),
      transparent: true, depthWrite: false, side: THREE.DoubleSide, ...extra,
    });
    A('mesh_screen', 'mesh', 10, 0x141414, { opacity: 1 });
    A('perforated', 'perforated', 1.2, 0x1b1c1d);
    A('pegboard', 'perforated', 0.5, 0x9da1a6, { metalness: 0.35, roughness: 0.45 });

    // --- room shell ---
    P('floor_concrete', { ...this.set('concrete_floor', 2.5, { normalScale: 0.6 }), roughness: 1, clearcoat: 0.35, clearcoatRoughness: 0.22, envMapIntensity: 0.9 });
    S('wall_paint', { ...this.set('plaster', 3.0, { normalScale: 0.12 }), color: C(0xcfccc6), roughness: 1 });
    S('wall_accent', { ...this.set('plaster', 3.0, { normalScale: 0.18 }), color: C(0x3a3c40), roughness: 1 });
    S('wall_cap', { color: C(0x1b1c1e), roughness: 0.9 });
    S('ceiling', { ...this.set('ceiling_tile', 1.2, { normalScale: 0.8 }), roughness: 1 });
    S('skirting', { color: C(0x1c1d1f), roughness: 0.6, ...rub(0.3) });
    S('drain', { color: C(0xaeb1b4), metalness: 1, roughness: 0.3 });
    S('ghost', { color: C(0xe8913a), transparent: true, opacity: 0.25, depthWrite: false });
  }

  get(slot) { return this.materials.get(slot) || null; }

  /** Replace every mesh material in `root` by the shared library material of its slot. */
  bind(root) {
    const missing = new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const slot = o.userData.slot || o.material?.name;
      const m = this.get(slot);
      if (m) o.material = m; else missing.add(slot);
      o.userData.slot = slot;
    });
    return [...missing];
  }

  update(t) { for (const fn of this.animated) fn(t); }

  whenReady() { return Promise.all(this.pending); }
}
