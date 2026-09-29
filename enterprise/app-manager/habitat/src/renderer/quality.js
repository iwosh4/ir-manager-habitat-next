import * as THREE from 'three';

/**
 * Quality levels (shared by both renderers; kept free of post-processing imports so the Planner can
 * start without loading the realistic pipeline).
 *
 * Showcase: `final` = the stationary (approved) image; `interactive` = reduced internal resolution, no
 * MSAA / GTAO / bloom while orbiting or dragging. Planner: pixel ratio cap + MSAA of its single pass.
 * `auto` adapts both from measured frame times.
 */
export const QUALITY = {
  auto: { label: 'Auto (recommended)', short: 'Auto', auto: true },
  ultra: { label: 'Ultra', pixelRatio: 2, msaa: 4, ao: true, aoSamples: 16, bloom: true, shadowMap: 2048, smaa: false, interactiveScale: 0.75 },
  high: { label: 'High', pixelRatio: 1.5, msaa: 4, ao: true, aoSamples: 12, bloom: true, shadowMap: 2048, smaa: false, interactiveScale: 0.7 },
  balanced: { label: 'Balanced', pixelRatio: 1, msaa: 4, ao: true, aoSamples: 8, bloom: true, shadowMap: 1024, smaa: false, interactiveScale: 0.75 },
  fast: { label: 'Fast', pixelRatio: 1, msaa: 0, ao: false, aoSamples: 8, bloom: false, shadowMap: 1024, smaa: true, interactiveScale: 0.6 },
};

/** The single WebGL context / canvas shared by the Planner and the Showcase renderer. */
export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;           // shadow invalidation (Showcase: see markShadowsDirty)
  renderer.setClearColor(0x0b0c0d, 1);
  renderer.info.autoReset = false;
  renderer.domElement.className = 'viewport-canvas';
  container.appendChild(renderer.domElement);
  return renderer;
}

export function gpuName(renderer) {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
}
