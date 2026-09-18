// M5 layout health check: detect text clipping (overflow beyond SVG viewBox)
// and label-on-label collisions across all five load presets, via CDP getBBox.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9338;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server, edge;
try {
  server = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(900);
  edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'm5lay-' + Date.now())}`,
    '--window-size=1200,1600', 'about:blank'], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(200);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

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

  // Returns { overflow: [...], overlaps: [...] } across the three SVGs.
  const audit = () => evalJs(`(() => {
    const svgs = ['beam-svg','sfd-svg','bmd-svg'];
    const overflow = [], overlaps = [];
    const boxes = [];
    for (const id of svgs) {
      const svg = document.getElementById(id);
      const vb = svg.viewBox.baseVal;
      const W = vb.width, H = vb.height;
      for (const t of svg.querySelectorAll('text')) {
        const b = t.getBBox();
        const o = { id, text: t.textContent, x: b.x, y: b.y, w: b.width, h: b.height };
        if (b.x < -0.5 || b.y < -0.5 || b.x + b.width > W + 0.5 || b.y + b.height > H + 0.5) {
          overflow.push({ id, text: t.textContent, bbox: [b.x.toFixed(1), b.y.toFixed(1), b.width.toFixed(1), b.height.toFixed(1)], vb: [W, H] });
        }
        boxes.push(o);
      }
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.id !== b.id) continue; // different panels can't collide visually
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) overlaps.push({ id: a.id, a: a.text, b: b.text, area: (ox*oy).toFixed(0) });
    }
    return { overflow, overlaps };
  })()`);

  const presets = [
    ['point', []],
    ['udl', []],
    ['partial', []],
    ['triangular', [['sel-peak-side', 'left']]],
    ['trapezoidal', [['num-w1', '2'], ['num-w2', '4']]],
  ];

  let bad = 0;
  for (const [type, tweaks] of presets) {
    await evalJs(`(() => { const e = document.getElementById('sel-load-type'); e.value='${type}'; e.dispatchEvent(new Event('change')); })()`);
    for (const [id, v] of tweaks) {
      await evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event(${id.startsWith('sel') ? "'change'" : "'input'"})); })()`);
    }
    await sleep(400);
    const r = await audit();
    const ok = r.overflow.length === 0 && r.overlaps.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${type}  overflow=${r.overflow.length} overlaps=${r.overlaps.length}`);
    for (const o of r.overflow) console.log(`      CLIP ${o.id}: "${o.text}" bbox=${o.bbox} vb=${o.vb}`);
    for (const o of r.overlaps) console.log(`      OVERLAP ${o.id}: "${o.a}" × "${o.b}" (${o.area}px²)`);
  }

  console.log(`\n${presets.length - bad}/${presets.length} presets layout-clean`);
  ws.close();
} catch (err) {
  console.error('HARNESS ERROR:', err);
} finally {
  try { edge?.kill(); } catch {}
  try { server?.kill(); } catch {}
  await sleep(300);
}
