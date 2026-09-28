// Technical line illustrations (inline SVG) — the "instrument" family of Concept B imagery, used for abstract
// modules (health, finance, inventory, tasks, genetics, directory) and empty states. Amber strokes on a faint
// measurement grid; they recolour with the theme via currentColor / CSS variables.
const grid = (w, h, s = 16) => `<defs><pattern id="g${w}${h}" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><path d="M${s} 0H0V${s}" fill="none" stroke="currentColor" stroke-opacity=".07"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#g${w}${h})"/>`;
const svg = (w, h, body, cls = '') => `<svg class="art ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${grid(w, h)}<g fill="none" stroke="var(--art, var(--amber))" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;

export const ART = {
  health: () => svg(320, 160, `
    <path d="M10 96h60l10-22 14 46 16-70 14 58 10-12h186" stroke-opacity=".9"/>
    <circle cx="232" cy="62" r="26" stroke-opacity=".5"/><path d="M218 62h28M232 48v28" stroke-width="3"/>
    <path d="M276 30c10 8 14 22 8 36-5 12-16 18-28 17" stroke-opacity=".6"/><circle cx="254" cy="84" r="5"/>
    <path d="M40 132h240" stroke-opacity=".25" stroke-dasharray="3 5"/>`),
  finance: () => svg(320, 160, `
    <path d="M24 128 76 96l42 12 46-44 44 18 52-50 34 10" stroke-opacity=".95"/>
    <path d="M24 128 76 96l42 12 46-44 44 18 52-50 34 10V140H24Z" fill="var(--art, var(--amber))" fill-opacity=".06" stroke="none"/>
    ${[0, 1, 2, 3].map((i) => `<ellipse cx="262" cy="${118 - i * 9}" rx="26" ry="7" stroke-opacity="${0.35 + i * 0.15}"/>`).join('')}
    <path d="M236 118v-27M288 118v-27" stroke-opacity=".5"/>`),
  inventory: () => svg(320, 160, `
    <path d="M40 60h80v70H40zM40 60l14-16h80l-14 16M120 130l14-16V44" stroke-opacity=".85"/>
    <path d="M150 74h64v56h-64zM150 74l12-14h64l-12 14M214 130l12-14V60" stroke-opacity=".6"/>
    <rect x="242" y="52" width="40" height="78" rx="6" stroke-opacity=".9"/><path d="M242 70h40M248 44h28v8h-28z" stroke-opacity=".7"/><path d="M252 92h20M252 102h14" stroke-opacity=".5"/>
    <path d="M24 136h276" stroke-opacity=".25"/>`),
  tasks: () => svg(320, 160, `
    <path d="M36 118 120 40M44 124 126 48" stroke-width="2.4" stroke-opacity=".85"/><path d="M120 40l10-8M126 48l10-6" stroke-opacity=".85"/>
    <rect x="190" y="58" width="44" height="72" rx="10" stroke-opacity=".85"/><path d="M200 58V44h24v14M224 44h26l-6 8h-20" stroke-opacity=".7"/>
    ${[0, 1, 2, 3, 4].map((i) => `<circle cx="${262 + (i % 3) * 10}" cy="${40 + i * 7}" r="1.4" fill="var(--art, var(--amber))" stroke="none" opacity="${0.8 - i * 0.12}"/>`).join('')}
    <path d="M24 138h272" stroke-opacity=".25"/>`),
  genetics: () => svg(320, 160, `
    ${Array.from({ length: 12 }, (_, i) => { const x = 40 + i * 21, a = Math.sin(i * 0.7) * 40, b = -a; return `<path d="M${x} ${80 + a}L${x} ${80 + b}" stroke-opacity="${0.25 + Math.abs(Math.sin(i * 0.7)) * 0.5}"/>`; }).join('')}
    <path d="${Array.from({ length: 60 }, (_, i) => `${i ? 'L' : 'M'}${40 + i * 3.9} ${80 + Math.sin(i * 0.26 * 0.7 * 3.9 / 3.9 * 1.37) * 40}`).join('')}" stroke-opacity=".9"/>
    <path d="${Array.from({ length: 60 }, (_, i) => `${i ? 'L' : 'M'}${40 + i * 3.9} ${80 - Math.sin(i * 0.26 * 0.7 * 3.9 / 3.9 * 1.37) * 40}`).join('')}" stroke-opacity=".6"/>`),
  directory: () => svg(320, 160, `
    <rect x="46" y="36" width="96" height="92" rx="10" stroke-opacity=".85"/><circle cx="94" cy="70" r="16" stroke-opacity=".8"/><path d="M68 112c6-14 16-20 26-20s20 6 26 20" stroke-opacity=".8"/>
    <path d="M170 52h110M170 72h84M170 96h110M170 116h64" stroke-opacity=".45"/><circle cx="160" cy="52" r="2.5"/><circle cx="160" cy="96" r="2.5"/>`),
  repro: () => svg(320, 160, `
    <ellipse cx="96" cy="84" rx="30" ry="40" stroke-opacity=".9"/><ellipse cx="148" cy="96" rx="24" ry="32" stroke-opacity=".6"/>
    <path d="M190 120c30-60 70-80 110-70" stroke-opacity=".5" stroke-dasharray="4 6"/><circle cx="300" cy="50" r="5"/><circle cx="244" cy="68" r="3.5" stroke-opacity=".7"/>
    <path d="M24 136h272" stroke-opacity=".25"/>`),
  enclosure: () => svg(320, 160, `
    <path d="M70 40h180v96H70z" stroke-opacity=".9"/><path d="M70 40l20-14h180l-20 14M250 136l20-14V26" stroke-opacity=".6"/>
    <path d="M70 116c30-10 60 6 90-4s60 8 90 0" stroke-opacity=".6"/><path d="M110 116c2-24 10-38 22-46M124 90c10-4 18-2 24 4" stroke-opacity=".55"/><path d="M160 40v96" stroke-opacity=".3"/>`),
  empty: () => svg(320, 140, `
    <circle cx="160" cy="66" r="34" stroke-opacity=".5"/><path d="M136 66h48M160 42v48" stroke-opacity=".25"/><path d="M190 92l26 22" stroke-width="3" stroke-opacity=".6"/>`),
};
export const art = (k) => (ART[k] || ART.empty)();
