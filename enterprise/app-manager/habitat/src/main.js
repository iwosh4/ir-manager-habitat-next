import { App } from './App.js';
import { installCzech } from './integration/i18n-cs.js';

// inside IR Manager the studio speaks Czech (the standalone build stays English)
if (window.IR_HABITAT?.lang === 'cs') installCzech(document.body);

const fill = document.getElementById('loading-fill');
const text = document.getElementById('loading-text');
const progress = (p, msg) => { fill.style.width = `${Math.round(p * 100)}%`; if (msg) text.textContent = msg; };

function webgl2() { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } }

(async () => {
  if (!webgl2()) { text.textContent = 'WebGL 2 is not available in this browser. Please use a current Chrome, Edge, Firefox or Safari.'; return; }
  try {
    const app = await new App(document.getElementById('app')).init(progress);
    window.habitat = app; // exposed for integration tests & debugging
    document.getElementById('loading').classList.add('done');
    setTimeout(() => document.getElementById('loading')?.remove(), 600);
  } catch (e) {
    console.error(e);
    text.textContent = `Failed to start: ${e.message}`;
    document.getElementById('loading').classList.add('failed');
  }
})();
