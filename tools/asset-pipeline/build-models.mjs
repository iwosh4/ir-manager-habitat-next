// Offline GLB authoring. Run: npm run build:models
// Every model is exported as a binary glTF with named material slots and anchor nodes (lights, animals).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import './lib/node-env.mjs';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as enclosures from './models/enclosures.mjs';
import * as furniture from './models/furniture.mjs';
import * as architecture from './models/architecture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'assets/models');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

const all = { ...enclosures, ...furniture, ...architecture };
const manifest = {};
const exporter = new GLTFExporter();
for (const [name, fn] of Object.entries(all)) {
  if (typeof fn !== 'function' || name.startsWith('_')) continue;
  if (only.length && !only.includes(name)) continue;
  const t0 = Date.now();
  const { root, tris } = fn();
  const glb = await exporter.parseAsync(root, { binary: true, onlyVisible: true });
  const file = path.join(OUT, `${name}.glb`);
  fs.writeFileSync(file, Buffer.from(glb));
  const info = root.userData.habitat;
  manifest[name] = { file: `assets/models/${name}.glb`, triangles: tris, bytes: glb.byteLength, nativeSize: info.nativeSize.map((v) => +v.toFixed(4)), bounds: info.bounds, category: info.category };
  console.log(`  ${name.padEnd(20)} ${String(tris).padStart(7)} tris  ${(glb.byteLength / 1024).toFixed(0).padStart(6)} KB  ${Date.now() - t0} ms`);
}
const mfile = path.join(OUT, 'manifest.json');
const prev = fs.existsSync(mfile) && only.length ? JSON.parse(fs.readFileSync(mfile, 'utf8')) : {};
fs.writeFileSync(mfile, JSON.stringify({ ...prev, ...manifest }, null, 2));
