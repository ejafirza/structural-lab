// Profile (M7) layout health check: text clipping (overflow beyond the SVG
// viewBox) and label collisions across profile configurations — the 6-point
// worst case, a stepped shape, a gap, a profile mixed with a point load,
// selected vs unselected handles, and the single-load regression.
// Same getBBox audit technique as the M5/M6 layout checks (hard DoD gate).
import { spawn } from 'node:child_process';
import { cleanupLegacyBrowserSession } from './legacy-browser-session.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9344;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server, edge, profileDir;
try {
  // Sanitize the inherited environment: a PORT exported by an outer tool
  // (e.g. a dev-server host setting PORT=0) must not rebind our app server
  // away from its default 8000, which these harnesses address directly.
  const childEnv = { ...process.env };
  delete childEnv.PORT;
  server = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore', env: childEnv });
  await sleep(900);
  edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-sync',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir = path.join(TMP, 'profile-lay-' + Date.now())}`,
    '--window-size=1200,1500', 'about:blank'], { stdio: 'ignore' });

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
    const svgs = ['beam-svg','sfd-svg','bmd-svg'];
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

  const clickAdd = (id) => evalJs(`document.getElementById('${id}').click()`);
  const clickPreset = (id) => evalJs(`document.querySelector('#preset-chips .preset-chip[data-preset="${id}"]').click()`);
  const selectRow = (i) => evalJs(`document.querySelectorAll('#load-list .load-row > button:first-child')[${i}].click()`);
  const removeRow = (i) => evalJs(`document.querySelectorAll('#load-list .load-row .load-remove')[${i}].click()`);
  const addPoint = () => evalJs(`document.getElementById('btn-add-cp').click()`);
  const setNum = (id, v) => evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event('input')); })()`);
  const setPointW = (i, v) => evalJs(`(() => {
    const w = document.querySelectorAll('#point-table .point-w')[${i}];
    w.value = '${v}';
    w.dispatchEvent(new Event('input'));
  })()`);
  const setPointX = (i, v) => evalJs(`(() => {
    const x = document.querySelectorAll('#point-table .point-x')[${i}];
    x.value = '${v}';
    x.dispatchEvent(new Event('input'));
  })()`);

  // Every config: reset to the default single point load first.
  const reset = async () => {
    await evalJs('location.reload()');
    await sleep(1600);
  };

  const configs = [
    ['stepped profile (Case A)', async () => {
      await clickAdd('btn-add-distributed');
      await clickPreset('stepped');
      await removeRow(0);
    }],
    ['snow drift profile', async () => {
      await clickAdd('btn-add-distributed');
      await clickPreset('snowdrift');
      await removeRow(0);
    }],
    ['gap profile (6 points)', async () => {
      await clickAdd('btn-add-distributed');
      await clickPreset('snowdrift'); // 5 points; reshape into a gap
      await setPointX(0, 0.5); await setPointW(0, 3);
      await setPointX(1, 1.5); await setPointW(1, 3);
      await setPointX(2, 2.5); await setPointW(2, 0);
      await setPointX(3, 3.5); await setPointW(3, 0);
      await setPointX(4, 4.5); await setPointW(4, 3);
      await addPoint();
      await setPointX(5, 5.5); await setPointW(5, 3);
      await removeRow(0);
    }],
    ['6-point staircase (cap worst case)', async () => {
      await clickAdd('btn-add-distributed');
      await clickPreset('snowdrift');
      await addPoint(); // 6 points
      await setPointX(0, 0); await setPointW(0, 1);
      await setPointX(1, 1.2); await setPointW(1, 2);
      await setPointX(2, 2.4); await setPointW(2, 3);
      await setPointX(3, 3.6); await setPointW(3, 4);
      await setPointX(4, 4.8); await setPointW(4, 5);
      await setPointX(5, 6); await setPointW(5, 6);
      await removeRow(0);
    }],
    ['profile + point load (selected profile)', async () => {
      await clickAdd('btn-add-distributed');
      await clickPreset('stepped');
      await clickAdd('btn-add-point');
      await setNum('num-pos', '4.5');
      await selectRow(0); // profile selected → handles drawn
    }],
    ['profile unselected (no handles) + point selected', async () => {
      await clickAdd('btn-add-distributed');
      await clickPreset('stepped');
      await clickAdd('btn-add-point');
      await setNum('num-pos', '2');
    }],
    ['two profiles (second selected)', async () => {
      await clickAdd('btn-add-distributed');
      await clickPreset('stepped');
      await clickAdd('btn-add-distributed');
      await clickPreset('snowdrift');
    }],
    ['single point (regression)', async () => {}],
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

  console.log(`\n${configs.length - bad}/${configs.length} profile configurations layout-clean`);
  ws.close();
} catch (err) {
  console.error('HARNESS ERROR:', err);
  process.exitCode = 1;
} finally {
  await cleanupLegacyBrowserSession({ edge, server, profileDir, tempRoot: TMP, cdpPort: PORT });
}
