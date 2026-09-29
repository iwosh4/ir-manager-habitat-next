import * as THREE from 'three';

/**
 * PLANNER materials: one hand-painted atlas + a family of tiny custom shaders.
 *
 * No real-time lights, no PBR. Each fragment does: atlas lookup (per-vertex tile index, seamless
 * wrapping inside the tile) × baked vertex colour (painted light / AO) × a two-tone "painted" key/fill
 * ramp + a soft illustrated edge darkening, plus emissive glow from the vertex alpha. All materials
 * share one uniform block so lighting presets cost nothing.
 *
 * Tile attribute encoding: tile = index + mode * 1000 (+ 10000 for room lighting: ceiling panels, window
 * daylight, floor light pools — dimmed by the lighting preset while enclosure lamps keep glowing)
 *   mode 0 = repeat both axes, 1 = clamp both (faces, leaves), 2 = repeat U / clamp V (cross sections)
 */
export const TILE_REPEAT = 0, TILE_CLAMP = 1, TILE_REPEAT_U = 2;

const VERT = /* glsl */`
#include <common>
#include <batching_pars_vertex>
#include <color_pars_vertex>
attribute float tile;
varying vec2 vUv; varying float vTile; varying vec3 vN; varying vec3 vWP;
void main() {
  #include <color_vertex>
  #include <batching_vertex>
  vec4 p = vec4(position, 1.0);
  vec3 objectNormal = normal;
  #ifdef USE_BATCHING
    p = batchingMatrix * p;
    objectNormal = mat3(batchingMatrix) * objectNormal;
  #endif
  vec4 wp = modelMatrix * p;
  vWP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * objectNormal);
  vUv = uv; vTile = tile;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const COMMON_FRAG = /* glsl */`
uniform sampler2D uAtlas; uniform float uGrid, uPad, uAtlasSize;
uniform vec3 uKeyDir, uKey, uShade, uSky, uGround;
uniform float uEmissive, uRim, uGlow, uGlass, uRoomLight, uTech;
varying vec2 vUv; varying float vTile; varying vec3 vN; varying vec3 vWP;
#ifdef CLIP_Y
uniform float uClipY;
#define CLIP_TEST if (vWP.y > uClipY) discard;
#else
#define CLIP_TEST
#endif
// TECH PLAN: the room is quietly desaturated & darkened so the infrastructure reads on top
vec3 techGrade(vec3 c) { float l = dot(c, vec3(0.299, 0.587, 0.114)); return mix(c, vec3(l) * 0.42 + vec3(0.02, 0.025, 0.035), uTech); }
vec4 atlas(vec2 uv, float t) {
  float mode = floor(t / 1000.0 + 0.001);
  float idx = t - mode * 1000.0;
  vec2 f = mode > 1.5 ? vec2(fract(uv.x), clamp(uv.y, 0.0, 1.0)) : (mode > 0.5 ? clamp(uv, 0.0, 1.0) : fract(uv));
  vec2 cell = vec2(mod(idx, uGrid), floor(idx / uGrid));
  float inner = 1.0 - 2.0 * uPad;
  vec2 auv = vec2((cell.x + uPad + f.x * inner) / uGrid, 1.0 - (cell.y + 1.0) / uGrid + (uPad + f.y * inner) / uGrid);
  vec2 dx = dFdx(uv) * inner / uGrid, dy = dFdy(uv) * inner / uGrid;
  float m = max(length(dx), length(dy)) * uAtlasSize;           // keep filtering inside the 8 px gutter
  if (m > 8.0) { float k = 8.0 / m; dx *= k; dy *= k; }
  return textureGrad(uAtlas, auv, dx, dy);
}
float roomFlag(inout float t) { float r = step(9999.5, t); t -= r * 10000.0; return r; }
vec3 paintedLight(vec3 n) {
  float wrap = clamp(dot(n, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);
  float band = smoothstep(0.3, 0.74, wrap);                     // soft two-tone painted shading
  vec3 L = mix(uShade, uKey, band);
  L += uSky * max(n.y, 0.0) * 0.4 + uGround * max(-n.y, 0.0) * 0.25 + (uSky + uGround) * 0.12;
  return L;
}`;

const FRAG_SOLID = /* glsl */`
#include <common>
#include <color_pars_fragment>
${COMMON_FRAG}
void main() {
  CLIP_TEST
  float t = floor(vTile + 0.5); float room = roomFlag(t);
  vec4 tex = atlas(vUv, t);
  #ifdef CUTOUT
    if (tex.a < 0.5) discard;
  #endif
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(cameraPosition - vWP);
  float ndv = clamp(abs(dot(n, v)), 0.0, 1.0);
  vec3 base = tex.rgb * vColor.rgb;
  vec3 col = base * paintedLight(n);
  col *= 1.0 - pow(1.0 - ndv, 3.0) * uRim;                        // illustrated edge definition
  col *= mix(0.78, 1.0, smoothstep(0.0, 0.45, vWP.y) * (1.0 - abs(n.y)) + abs(n.y)); // grounding
  col += base * vColor.a * uEmissive * mix(1.0, uRoomLight, room); // painted self-illumination
  col = techGrade(col);
  #ifdef SELECTED
    col += vec3(1.0, 0.56, 0.16) * (pow(1.0 - ndv, 3.0) * 0.6 + 0.025);  // thin amber rim + faint lift
  #endif
  gl_FragColor = vec4(col, 1.0);
}`;

const FRAG_GLASS = /* glsl */`
#include <common>
#include <color_pars_fragment>
${COMMON_FRAG}
void main() {
  CLIP_TEST
  float t = floor(vTile + 0.5); roomFlag(t);
  vec4 tex = atlas(vUv, t);
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(cameraPosition - vWP);
  float fres = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 3.0);
  vec3 col = tex.rgb * vColor.rgb * mix(0.85, 1.12, smoothstep(0.3, 0.8, dot(n, uKeyDir) * 0.5 + 0.5));
  float a = clamp(tex.a * vColor.a * 0.5 + fres * uGlass * vColor.a, 0.0, 0.55);
  col = mix(col, vec3(0.62, 0.66, 0.66), fres * 0.6);            // neutral sheen at grazing angles
  gl_FragColor = vec4(techGrade(col * (0.7 + 0.3 * uEmissive)), a * (1.0 - uTech * 0.5));
}`;

const FRAG_DECAL = /* glsl */`
#include <common>
#include <color_pars_fragment>
${COMMON_FRAG}
void main() {
  CLIP_TEST
  float t = floor(vTile + 0.5); roomFlag(t);
  vec4 tex = atlas(vUv, t);
  gl_FragColor = vec4(techGrade(tex.rgb * vColor.rgb), tex.a * vColor.a);
}`;

const FRAG_GLOW = /* glsl */`
#include <common>
#include <color_pars_fragment>
${COMMON_FRAG}
void main() {
  float t = floor(vTile + 0.5); float room = roomFlag(t);
  vec4 tex = atlas(vUv, t);
  gl_FragColor = vec4(tex.rgb * vColor.rgb * tex.a * vColor.a * uGlow * mix(1.0, uRoomLight, room) * (1.0 - uTech * 0.7), 1.0);
}`;

export class PaintedMaterials {
  constructor() {
    this.uniforms = {
      uAtlas: { value: null }, uGrid: { value: 9 }, uPad: { value: 8 / 256 }, uAtlasSize: { value: 2304 },
      uKeyDir: { value: new THREE.Vector3(-0.42, 0.82, 0.38).normalize() },
      uKey: { value: new THREE.Color(1.08, 0.98, 0.86) }, uShade: { value: new THREE.Color(0.42, 0.44, 0.55) },
      uSky: { value: new THREE.Color(0.32, 0.34, 0.4) }, uGround: { value: new THREE.Color(0.2, 0.16, 0.13) },
      uEmissive: { value: 1.0 }, uRim: { value: 0.24 }, uGlow: { value: 1.0 }, uGlass: { value: 0.3 }, uRoomLight: { value: 1.0 }, uTech: { value: 0 },
    };
    this.clipSets = new Map();
    this.tiles = {};
    this.materials = {};
    this.selected = {};
  }

  async load(base = 'assets/planner/') {
    const [meta, tex] = await Promise.all([
      fetch(base + 'atlas.json').then((r) => { if (!r.ok) throw new Error('atlas.json ' + r.status); return r.json(); }),
      new THREE.TextureLoader().loadAsync(base + 'atlas.webp'),
    ]);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.meta = meta;
    this.tiles = meta.tiles;
    this.uniforms.uAtlas.value = tex;
    this.uniforms.uGrid.value = meta.grid;
    this.uniforms.uPad.value = meta.pad / meta.cell;
    this.uniforms.uAtlasSize.value = meta.size;
    this._create();
    return this;
  }

  tile(name, mode = TILE_REPEAT) {
    const i = this.tiles[name];
    if (i === undefined) { console.warn('[planner] unknown tile', name); return 0; }
    return i + mode * 1000;
  }

  _make(name, frag, extra = {}, defines = {}) {
    const m = new THREE.ShaderMaterial({
      name: `painted_${name}`, uniforms: this.uniforms, vertexShader: VERT, fragmentShader: frag,
      vertexColors: true, defines, ...extra,
    });
    return m;
  }

  _create() {
    const M = this.materials;
    M.opaque = this._make('opaque', FRAG_SOLID);
    M.cutout = this._make('cutout', FRAG_SOLID, { side: THREE.DoubleSide }, { CUTOUT: 1 });
    M.glass = this._make('glass', FRAG_GLASS, { transparent: true, depthWrite: false, side: THREE.DoubleSide });
    M.decal = this._make('decal', FRAG_DECAL, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    M.glow = this._make('glow', FRAG_GLOW, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    // selection variants (only the selected object uses them; it is drawn outside the batches)
    this.selected.opaque = this._make('opaque_sel', FRAG_SOLID, {}, { SELECTED: 1 });
    this.selected.cutout = this._make('cutout_sel', FRAG_SOLID, { side: THREE.DoubleSide }, { CUTOUT: 1, SELECTED: 1 });
  }

  /** Lighting preset → uniforms. */
  setPreset(key) {
    const U = this.uniforms;
    const P = {
      day: { key: [1.1, 1.0, 0.88], shade: [0.44, 0.46, 0.57], sky: [0.34, 0.35, 0.4], ground: [0.2, 0.16, 0.13], emissive: 1.0, glow: 0.9, room: 1 },
      evening: { key: [0.62, 0.5, 0.4], shade: [0.2, 0.2, 0.28], sky: [0.16, 0.14, 0.17], ground: [0.1, 0.08, 0.06], emissive: 1.6, glow: 1.2, room: 0.45 },
      night: { key: [0.17, 0.18, 0.26], shade: [0.055, 0.06, 0.095], sky: [0.05, 0.055, 0.08], ground: [0.03, 0.025, 0.025], emissive: 2.6, glow: 1.6, room: 0.04 },
    }[key] || null;
    if (!P) return;
    U.uKey.value.setRGB(...P.key); U.uShade.value.setRGB(...P.shade);
    U.uSky.value.setRGB(...P.sky); U.uGround.value.setRGB(...P.ground);
    U.uEmissive.value = P.emissive; U.uGlow.value = P.glow; U.uRoomLight.value = P.room;
    this.presetKey = key;
  }

  /**
   * Material set clipped above a height (camera-aware walls: footprint / lowered walls). One set per
   * wall; all uniforms except uClipY are SHARED with the base materials (presets, atlas, tech grade).
   */
  clipped(key) {
    let set = this.clipSets.get(key);
    if (set) return set;
    const clip = { value: 1e6 };
    const make = (name, frag, extra, defines) => {
      const m = new THREE.ShaderMaterial({ name: `painted_${name}_clip_${key}`, uniforms: { ...this.uniforms, uClipY: clip }, vertexShader: VERT, fragmentShader: frag, vertexColors: true, defines: { ...defines, CLIP_Y: 1 }, ...extra });
      return m;
    };
    set = {
      clip,
      opaque: make('opaque', FRAG_SOLID, { side: THREE.DoubleSide }, {}),
      cutout: make('cutout', FRAG_SOLID, { side: THREE.DoubleSide }, { CUTOUT: 1 }),
      glass: make('glass', FRAG_GLASS, { transparent: true, depthWrite: false, side: THREE.DoubleSide }, {}),
      decal: make('decal', FRAG_DECAL, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, {}),
      glow: make('glow', FRAG_GLOW, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }, {}),
    };
    this.clipSets.set(key, set);
    return set;
  }

  setTech(v) { this.uniforms.uTech.value = v; }

  count() { return Object.keys(this.materials).length + Object.keys(this.selected).length + this.clipSets.size * 5; }
}
