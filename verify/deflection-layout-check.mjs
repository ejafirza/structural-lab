// Deflection (M8) layout health check: text clipping (overflow beyond the SVG
// viewBox) and label collisions across FOUR-panel configurations — the new
// deflection panel included: default, UDL, cantilever, stepped profile,
// mixed loads, long span, tiny E·I (huge sag), and indeterminate.
// Same getBBox audit technique as the M5/M6/M7 layout checks (hard DoD gate).
import { spawn } from 'node:child_process';
import { cleanupLegacyBrowserSession } from './legacy-browser-session.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9346;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server, edge, profileDir;
try {
  const childEnv = { ...process.env };
  delete childEnv.PORT;
  server = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore', env: childEnv });
  await sleep(900);
  edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-sync',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir = path.join(TMP, 'defl-lay-' + Date.now())}`,
    '--window-size=1200,1800', 'about:blank'], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = (await (await fetch(`http://localhost:${PORT}/json`)).json()).filter((t) => t.type === 'page' && !/^(edge|chrome):\/\//.test(String(t.url || '')));
      wsUrl = list[0]?.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(200);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error('ws open timeout')), 15000); });

  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (x) => {
    const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:8000/' });
  await sleep(1600);
  {
    let ok = false;
    for (let i = 0; i < 33 && !ok; i++) {
      try { ok = String(await evalJs('document.title')).includes('Structural Lab'); } catch {}
      if (!ok) await sleep(300);
    }
    if (!ok) throw new Error('app page never became live on the attached target');
  }

  const audit = () => evalJs(`(() => {
    const svgs = ['beam-svg','sfd-svg','bmd-svg','defl-svg'];
    const overflow = [], overlaps = [], boxes = [];
    for (const id of svgs) {
      const svg = document.getElementById(id);
      const vb = svg.viewBox.baseVal;
      const W = vb.width, H = vb.height;
      for (const t of svg.querySelectorAll('text')) {
        const b = t.getBBox();
        if (b.x < -0.5 || b.y < -0.5 || b.x + b.width > W + 0.5 || b.y + b.height > H + 0.5) {
          overflow.push({ id, text: t.textContent, bbox: [b.x.toFixed(1), b.y.toFixed(1), b.width.toFixed(1), b.height.toFixed(1)], vb: [W, H] });
        }
        boxes.push({ id, text: t.textContent, x: b.x, y: b.y, w: b.width, h: b.height });
      }
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.id !== b.id) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) overlaps.push({ id: a.id, a: a.text, b: b.text, area: (ox*oy).toFixed(0) });
    }
    return { overflow, overlaps };
  })()`);

  const clickPreset = (id) => evalJs(`document.querySelector('#preset-chips .preset-chip[data-preset="${id}"]').click()`);
  const clickEIChip = (id) => evalJs(`document.querySelector('#ei-chips .preset-chip[data-preset="${id}"]').click()`);
  const setNum = (id, v) => evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event('input')); })()`);
  const setSel = (id, v) => evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event('change')); })()`);

  const reset = async () => {
    await evalJs('location.reload()');
    await sleep(1600);
  };

  const configs = [
    ['default point beam', async () => {}],
    ['full UDL', async () => {
      await clickPreset('full');
      await evalJs(`document.querySelectorAll('#load-list .load-row .load-remove')[0].click()`);
    }],
    ['cantilever tip load', async () => {
      await setSel('sel-support-left', 'fixed');
      await setSel('sel-support-right', 'free');
    }],
    ['stepped profile', async () => {
      await clickPreset('stepped');
      await evalJs(`document.querySelectorAll('#load-list .load-row .load-remove')[0].click()`);
    }],
    ['profile + point load (mixed)', async () => {
      await clickPreset('stepped');
      await evalJs(`document.getElementById('btn-add-point').click()`);
    }],
    ['long span L = 20', async () => {
      await setNum('num-span', '20');
    }],
    ['tiny E·I (huge sag, timber chip)', async () => {
      await clickEIChip('timber');
    }],
    ['indeterminate (pin+pin placeholder)', async () => {
      await setSel('sel-support-right', 'pin');
    }],
  ];

  let bad = 0;
  for (const [name, setup] of configs) {
    await reset();
    await setup();
    await sleep(500);
    const r = await audit();
    const ok = r.overflow.length === 0 && r.overlaps.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  overflow=${r.overflow.length} overlaps=${r.overlaps.length}`);
    for (const o of r.overflow) console.log(`      CLIP ${o.id}: "${o.text}" bbox=${o.bbox} vb=${o.vb}`);
    for (const o of r.overlaps) console.log(`      OVERLAP ${o.id}: "${o.a}" × "${o.b}" (${o.area}px²)`);
  }

  console.log(`\n${configs.length - bad}/${configs.length} deflection configurations layout-clean`);
  ws.close();
} catch (err) {
  console.error('HARNESS ERROR:', err);
  process.exitCode = 1;
} finally {
  await cleanupLegacyBrowserSession({ edge, server, profileDir, tempRoot: TMP, cdpPort: PORT });
}
