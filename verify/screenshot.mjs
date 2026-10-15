// README screenshot capture via CDP (headless Edge).
// Captures the live app in three states into docs/*.png for the public README.
// Run: node verify/screenshot.mjs   (spawns its own server; litter → verify/tmp/)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const DOCS = path.join(ROOT, 'docs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server, edge;
try {
  mkdirSync(DOCS, { recursive: true });
  // Sanitize the inherited environment (see multi-load-cdp-verify.mjs):
  // an outer tool exporting PORT would rebind the app server away from 8000.
  const childEnv = { ...process.env };
  delete childEnv.PORT;
  server = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore', env: childEnv });
  await sleep(900);
  edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-sync',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'shot-edge-' + Date.now())}`,
    '--window-size=1200,1500', 'about:blank'], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error('Edge did not expose a CDP endpoint');

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error('ws open timeout')), 15000); });

  let id = 0; const pend = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (x) => {
    const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const shot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(path.join(DOCS, file), Buffer.from(r.data, 'base64'));
    console.log('saved', file);
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1500, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:8000/' });
  await sleep(2000);
  // Wait until the app document is actually live (a screenshot of an error
  // page would silently overwrite the real ones).
  {
    let ok = false;
    for (let i = 0; i < 33 && !ok; i++) {
      try { ok = String(await evalJs('document.title')).includes('Structural Lab'); } catch {}
      if (!ok) await sleep(300);
    }
    if (!ok) throw new Error('app page never became live');
  }

  // Each state is captured on the guided step where it appears in the app:
  // Loads (beam + Model) for the load editing states, Results for the diagrams.
  await evalJs(`document.querySelector('[data-step-target=loads]').click()`);
  await sleep(300);

  // 1. default point load (P=10 kN at a=3 m, pin+roller)
  await shot('screenshot-point.png');

  // 2. distributed → Full UDL preset (M6 load-list UI: add a distributed
  // load, remove the default point load — one distributed load remains).
  await evalJs(`document.getElementById('btn-add-distributed').click()`);
  await sleep(300);
  await evalJs(`document.querySelectorAll('#load-list .load-row .load-remove')[0].click()`);
  await sleep(300);
  // JS click on the chip (the presets panel is display:none while a point
  // load is selected — a real click would have no geometry in headless mode).
  await evalJs(`document.querySelector('#preset-chips .preset-chip[data-preset="full"]').click()`);
  await sleep(500);
  await shot('screenshot-udl.png');

  // 3. Triangular (peak left)
  await evalJs(`document.querySelector('#preset-chips .preset-chip[data-preset="tri-left"]').click()`);
  await sleep(500);
  // Switch to Results to show the diagrams for the triangular load.
  await evalJs(`document.querySelector('[data-step-target=results]').click()`);
  await sleep(300);
  await shot('screenshot-triangular.png');

  ws.close();
  console.log('done: 3 screenshots in docs/');
} catch (err) {
  console.error('HARNESS ERROR:', err);
  process.exitCode = 1;
} finally {
  try { edge?.kill(); } catch {}
  try { server?.kill(); } catch {}
  await sleep(300);
}
