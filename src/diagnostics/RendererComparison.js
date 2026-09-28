/**
 * SHOWCASE vs PLANNER comparison for the SAME camera.
 *
 * Renders the current view with both renderers on the shared WebGL context and measures, per renderer:
 * stationary (final) frame time and interactive frame time — each synchronised with the GPU through a
 * 1-pixel readPixels, so the numbers include GPU work — draw calls, triangles, materials, textures,
 * lights, programs, plus a JPEG of the frame. The document, selection and camera are not touched; the
 * previously active mode is restored afterwards.
 */
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export function sceneStats(scene) {
  const mats = new Set(), tex = new Set();
  let meshes = 0, lights = 0, shadowCasters = 0;
  const addTex = (v) => { if (v && v.isTexture) tex.add(v.uuid); };
  scene.traverse((o) => {
    if (o.isLight) { lights++; if (o.castShadow) shadowCasters++; }
    if (!o.isMesh && !o.isLine && !o.isPoints) return;
    meshes++;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || mats.has(m.uuid)) continue;
      mats.add(m.uuid);
      for (const k of Object.keys(m)) addTex(m[k]);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) addTex(u.value);
    }
  });
  addTex(scene.environment); addTex(scene.background);
  return { materials: mats.size, textures: tex.size, meshes, lights, shadowCasters };
}

export async function compareRenderers(app, { samples = 3, image = true, onProgress } = {}) {
  const planner = app.modes.planner;
  const showcase = await app._loadShowcase((p, msg) => onProgress?.(p * 0.7, msg));
  if (!showcase) throw new Error('Showcase renderer unavailable');
  const original = app.mode;
  const r = app.renderer, gl = r.getContext(), px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const size = r.getSize({ x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } });
  const out = { date: new Date().toISOString(), camera: app.rig.getState(), viewport: [size.x, size.y], devicePixelRatio: window.devicePixelRatio || 1, gpu: planner.engine.gpuName || '', modes: {} };
  try {
    for (const m of [showcase, planner]) {
      onProgress?.(m === showcase ? 0.75 : 0.9, `Measuring ${m.name}`);
      app._activate(m);
      if (m === showcase) await m.objects.whenLoaded();
      m.batcher.sync(m.objects.views.values(), app.detachedId);
      if (m._needsWarmup) { m._needsWarmup = false; m.engine.warmup(); }
      m.engine.render(); sync();                                   // warm (programs, shadow maps)
      const fin = [];
      for (let i = 0; i < samples; i++) { const t0 = performance.now(); m.engine.render(); sync(); fin.push(performance.now() - t0); }
      const d = m.engine.diagnostics();
      const img = image ? r.domElement.toDataURL('image/jpeg', 0.88) : null; // same task as the render: buffer still valid
      const inter = [];
      for (let i = 0; i < samples; i++) { const t0 = performance.now(); m.engine.renderInteractive(); sync(); inter.push(performance.now() - t0); }
      const di = m.engine.diagnostics();
      const st = sceneStats(m.scene);
      out.modes[m.name] = {
        finalMs: +median(fin).toFixed(2), interactiveMs: +median(inter).toFixed(2),
        drawCalls: d.drawCalls, triangles: d.triangles, drawCallsInteractive: di.drawCalls, trianglesInteractive: di.triangles,
        pixelRatio: d.pixelRatio, interactiveScale: m.engine.renderScale, profile: d.finalProfile,
        materials: st.materials, textures: st.textures, meshes: st.meshes, lights: st.lights, shadowCasters: st.shadowCasters,
        programs: r.info.programs?.length ?? 0, image: img,
      };
    }
  } finally {
    app._activate(original);
    app.engine.invalidate();
  }
  const s = out.modes.showcase, p = out.modes.planner;
  out.ratio = { final: +(s.finalMs / p.finalMs).toFixed(2), interactive: +(s.interactiveMs / p.interactiveMs).toFixed(2), drawCalls: +(s.drawCalls / p.drawCalls).toFixed(1), triangles: +(s.triangles / p.triangles).toFixed(1) };
  return out;
}
