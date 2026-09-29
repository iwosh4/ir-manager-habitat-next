// Builds the standalone deliverable ZIP (everything needed to run + sources, docs, tools, tests).
//   node tools/package.mjs [out.zip]
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'habitat-studio-next.zip'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });
const include = ['index.html', 'README.md', 'ARCHITECTURE.md', 'ASSET_LICENSES.md', 'PERFORMANCE.md', 'STYLIZED_RENDERER.md', 'ENCLOSURE_BUILDER.md', 'ASSEMBLY_BUILDER.md', 'DATA_MODEL.md', 'TEST_REPORT.md', 'PHASE_4_1_FINAL_REPORT.md', 'HABITAT_STUDIO_4_2_REPORT.md', '.htaccess', 'package.json', 'package-lock.json', '.gitignore', 'docs',
  'src', 'assets', 'data', 'schema', 'vendor', 'tools', 'tests/run-e2e.mjs', 'tests/benchmark.mjs', 'tests/stress.mjs', 'tests/assembly-perf.mjs'];
const prefix = 'habitat-studio-next';
const stage = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'pkg-'));
fs.mkdirSync(path.join(stage, prefix));
for (const p of include) fs.cpSync(path.join(ROOT, p), path.join(stage, prefix, p), { recursive: true });
execFileSync('zip', ['-rq9', out, prefix], { cwd: stage });
fs.rmSync(stage, { recursive: true, force: true });
console.log(`${out}  ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
