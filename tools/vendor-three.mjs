// Copies the exact three.js runtime files the app imports into vendor/three (no CDN, no bundler).
// Follows relative imports recursively from the addon entry points below.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'node_modules/three');
const DST = path.join(ROOT, 'vendor/three');
const entries = [
  'build/three.module.js', 'build/three.core.js',
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/loaders/HDRLoader.js',
  'examples/jsm/postprocessing/EffectComposer.js', 'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/GTAOPass.js', 'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/OutlinePass.js', 'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/postprocessing/SMAAPass.js', 'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/lights/RectAreaLightUniformsLib.js', 'examples/jsm/geometries/RoundedBoxGeometry.js',
  'examples/jsm/renderers/CSS2DRenderer.js', 'examples/jsm/utils/BufferGeometryUtils.js',
  'examples/jsm/environments/RoomEnvironment.js',
];
const seen = new Set();
function copy(rel) {
  if (seen.has(rel)) return; seen.add(rel);
  const src = path.join(SRC, rel);
  const code = fs.readFileSync(src, 'utf8');
  fs.mkdirSync(path.dirname(path.join(DST, rel)), { recursive: true });
  fs.writeFileSync(path.join(DST, rel), code);
  for (const m of code.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]/g)) copy(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
}
fs.rmSync(DST, { recursive: true, force: true });
entries.forEach(copy);
fs.copyFileSync(path.join(SRC, 'LICENSE'), path.join(DST, 'LICENSE'));
const ver = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(DST, 'VERSION'), ver + '\n');
console.log(`vendored three@${ver}: ${seen.size} files`);
