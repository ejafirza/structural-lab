// Teaching layer (M9) layout health check, port 9348.
// Two layers, same getBBox audit discipline as the M5–M8 layout checks:
//   1. the full four-panel SVG audit across the 8 standard configurations
//      (M9 touched the txt() attribute path, so the audit MUST re-run);
//   2. POPOVER geometry: the open window stays inside the viewport, never
//      overlaps its trigger, survives a 360px small-viewport flip, and the
//      longest entries stay reachable while scrollable.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9348;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

let server, edge;
try {
  const childEnv = { ...process.env };
  delete childEnv.PORT;
  server = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore', env: childEnv });
  await sleep(900);
  edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-sync',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'teach-lay-' + Date.now())}`,
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

  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails?.text ?? ''));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  };
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

  const svgAudit = () => evalJs(`(() => {
    const svgs = ['beam-svg','sfd-svg','bmd-svg','defl-svg'];
    const overflow = [], overlaps = [], boxes = [];
    for (const id of svgs) {
      const svg = document.getElementById(id);
      const vb = svg.viewBox.baseVal;
      const W = vb.width, H = vb.height;
      for (const t of svg.querySelectorAll('text')) {
        const b = t.getBBox();
        if (b.x < -0.5 || b.y < -0.5 || b.x + b.width > W + 0.5 || b.y + b.height > H + 0.5) {
          overflow.push({ id, text: t.textContent });
        }
        boxes.push({ id, text: t.textContent, x: b.x, y: b.y, w: b.width, h: b.height });
      }
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.id !== b.id) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) overlaps.push({ id: a.id, a: a.text, b: b.text });
    }
    return { overflow, overlaps };
  })()`);

  const clickPreset = (id) => evalJs(`document.querySelector('#preset-chips .preset-chip[data-preset="${id}"]').click()`);
  const setSel = (id, v) => evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event('change')); })()`);
  const reset = async () => { await evalJs('location.reload()'); await sleep(1600); };

  // ---- part 1: the standard four-panel audit over the 8 configurations ----
  const configs = [
    ['default point beam', async () => {}],
    ['full UDL', async () => {
      await evalJs(`document.getElementById('btn-add-distributed').click()`);
      await sleep(250);
      await clickPreset('full');
      await evalJs(`document.querySelectorAll('#load-list .load-row .load-remove')[0].click()`);
    }],
    ['cantilever tip load', async () => {
      await setSel('sel-support-left', 'fixed');
      await setSel('sel-support-right', 'free');
    }],
    ['stepped profile', async () => {
      await evalJs(`document.getElementById('btn-add-distributed').click()`);
      await sleep(250);
      await clickPreset('stepped');
      await evalJs(`document.querySelectorAll('#load-list .load-row .load-remove')[0].click()`);
    }],
    ['profile + point load (mixed)', async () => {
      await evalJs(`document.getElementById('btn-add-distributed').click()`);
      await sleep(250);
      await clickPreset('stepped');
      await evalJs(`document.getElementById('btn-add-point').click()`);
    }],
    ['long span L = 20', async () => {
      await evalJs(`(() => { const e = document.getElementById('num-span'); e.value='20'; e.dispatchEvent(new Event('input')); })()`);
    }],
    ['tiny E·I (huge sag, timber chip)', async () => {
      await evalJs(`document.querySelector('#ei-chips .preset-chip[data-preset="timber"]').click()`);
    }],
    ['indeterminate (pin+pin placeholder)', async () => {
      await setSel('sel-support-right', 'pin');
    }],
  ];

  for (const [name, setup] of configs) {
    await reset();
    await setup();
    await sleep(500);
    const r = await svgAudit();
    check(`SVG audit: ${name}`, r.overflow.length === 0 && r.overlaps.length === 0,
      `overflow=${r.overflow.length} overlaps=${r.overlaps.length}${r.overflow.length ? ' ' + JSON.stringify(r.overflow).slice(0, 120) : ''}`);
  }

  // ---- part 2: popover geometry -------------------------------------------
  // a. trigger near the bottom of a full-height page → window stays inside
  await reset();
  await evalJs(`document.querySelector('label[for="sel-support-left"] .term-chip').click()`);
  await sleep(250);
  {
    const g = await evalJs(`(() => {
      const win = document.querySelector('.popover');
      const r = win.getBoundingClientRect();
      return { inside: r.left >= 0 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1,
               w: r.width, h: r.height };
    })()`);
    check('popover inside the viewport (default open)', g.inside, JSON.stringify(g));
  }
  // b. the window never sits on top of its trigger
  {
    const overlap = await evalJs(`(() => {
      const chip = document.querySelector('label[for="sel-support-left"] .term-chip');
      const win = document.querySelector('.popover');
      const a = chip.getBoundingClientRect(), b = win.getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return ox > 1 && oy > 1;
    })()`);
    check('popover does not overlap its trigger', overlap === false);
  }
  // c. 360 px small viewport: still inside, still reachable
  await evalJs(`(() => { document.querySelector('.popover-close').click(); })()`);
  await evalJs(`window.resizeTo(360, 800)`).catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await evalJs(`document.querySelector('label[for="sel-support-left"] .term-chip').click()`);
  await sleep(250);
  {
    const g = await evalJs(`(() => {
      const win = document.querySelector('.popover');
      const r = win.getBoundingClientRect();
      return { inside: r.left >= 0 && r.right <= window.innerWidth + 1,
               width: r.width, vw: window.innerWidth };
    })()`);
    check('popover fits a 360 px viewport (max-width respected)', g.inside && g.width <= g.vw + 1, JSON.stringify(g));
  }
  // d. the longest entries stay scrollable (body max-height)
  {
    const scrollable = await evalJs(`(() => {
      const body = document.querySelector('.popover-body');
      return body.scrollHeight > 0 && getComputedStyle(body).overflowY === 'auto';
    })()`);
    check('popover body is scrollable (long entries reachable)', scrollable === true);
  }
  await send('Emulation.clearDeviceMetricsOverride', {});
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);

  check('zero console errors / exceptions across the whole audit', errors.length === 0, errors.join(' | ').slice(0, 200));
} catch (err) {
  check('harness completed without a setup crash', false, String(err).slice(0, 300));
} finally {
  try { if (edge) edge.kill(); } catch {}
  try { if (server) server.kill(); } catch {}
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
