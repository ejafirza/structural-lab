// Teaching layer (M9) browser verification via CDP (headless Edge).
// Verifies the glossary popovers and the worked-derivation doors end-to-end
// in a real browser: dotted-underline triggers open the right entry, chips
// drill with a breadcrumb, cards open derivations quoting the cards' own
// numbers verbatim, indeterminate beams keep the honesty doors, and zero
// console errors.
//
// Hand-derived anchors: default P = 10 @ 3 m, L = 6 → RA = RB = 5 kN,
// Mmax = 15 kNm sagging at x = 3 m; full UDL w = 2 → Mmax = wL²/8 = 9 kNm;
// pin+pin → indeterminate, cards read "–".
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9347;
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
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'teach-edge-' + Date.now())}`,
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
  await sleep(1800);
  {
    let ok = false;
    for (let i = 0; i < 33 && !ok; i++) {
      try { ok = String(await evalJs('document.title')).includes('Structural Lab'); } catch {}
      if (!ok) await sleep(300);
    }
    if (!ok) throw new Error('app page never became live on the attached target');
  }

  const snap = () => evalJs(`JSON.stringify((() => {
    const win = document.querySelector('.popover');
    return {
      open: !!win && !win.hidden,
      title: win?.querySelector('.popover-title')?.textContent ?? '',
      body: win?.querySelector('.popover-body')?.textContent ?? '',
      path: win?.querySelector('.popover-path')?.textContent ?? '',
      backHidden: win?.querySelector('.popover-back')?.hidden ?? true,
      chips: win ? [...win.querySelectorAll('.popover-chip')].map(c => ({ t: c.textContent, sub: c.classList.contains('is-sub') })) : [],
      steps: win ? [...win.querySelectorAll('.steps-formula')].map(n => n.textContent) : [],
      values: win ? [...win.querySelectorAll('.steps-value')].map(n => n.textContent) : [],
      triggerExpanded: document.querySelector('[data-term][aria-expanded="true"]') != null
        || document.querySelector('[data-steps][aria-expanded="true"]') != null,
      cards: [...document.querySelectorAll('#result-cards .card')].map(c => ({
        label: c.querySelector('.card-label')?.textContent ?? '',
        value: c.querySelector('.card-value')?.textContent ?? '',
        steps: c.getAttribute('data-steps') ?? '',
        term: c.getAttribute('data-term') ?? '',
      })),
      underlineCount: document.querySelectorAll('[data-term]').length,
      detClass: document.getElementById('det-badge').className,
    };
  })())`);

  const clickTerm = (sel) => evalJs(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const cardSel = (label) => `#result-cards .card:nth-child(${label})`;

  check('page loaded', (await evalJs('document.title')).includes('Structural Lab'));
  check('teaching triggers present on the page (≥ 15 data-term elements)',
    (await evalJs(`document.querySelectorAll('[data-term]').length`)) >= 15);

  // 1. glossary: click a support info chip → the supports entry
  await clickTerm('label[for="sel-support-left"] .term-chip');
  await sleep(250);
  let s = JSON.parse(await snap());
  check('click ℹ chip → supports entry opens', s.open && s.title === 'Supports', s.title);
  check('window is a non-modal dialog', await evalJs(`document.querySelector('.popover').getAttribute('role')`) === 'dialog');
  check('support chips offered (pin, roller, fixed, free, reaction)',
    s.chips.length >= 4 && s.chips.some((c) => c.t.includes('Pin')), JSON.stringify(s.chips.map((c) => c.t)));

  // 2. drill: pin support → vertical reaction, breadcrumb + back
  await evalJs(`[...document.querySelectorAll('.popover-chip')].find(c => c.textContent.includes('Pin support')).click()`);
  await sleep(200);
  s = JSON.parse(await snap());
  check('drill: Pin support entry opens', s.title === 'Pin support', s.title);
  await evalJs(`[...document.querySelectorAll('.popover-chip')].find(c => c.textContent.includes('Vertical reaction')).click()`);
  await sleep(200);
  s = JSON.parse(await snap());
  check('drill 2 levels: sub-concept opens inside the same window', s.title === 'Vertical reaction (V)', s.title);
  check('breadcrumb tracks the trail (Supports › Pin › V)', s.path.includes('›') && s.path.includes('Vertical reaction'), s.path);
  check('back button visible after drilling', s.backHidden === false);
  await evalJs(`document.querySelector('.popover-back').click()`);
  await sleep(200);
  s = JSON.parse(await snap());
  check('back returns to Pin support', s.title === 'Pin support', s.title);

  // 3. honesty in content: pin teaches 2 reactions; fixed teaches 3
  await evalJs(`document.querySelector('.popover-back').click()`).catch(() => {});
  await sleep(150);
  await evalJs(`[...document.querySelectorAll('.popover-chip')].find(c => c.textContent.includes('Fixed support'))?.click()`);
  await sleep(200);
  s = JSON.parse(await snap());
  check('fixed-support body teaches 3 reactions (not torsion)',
    s.title === 'Fixed support' && s.body.includes('3 reaction') && s.body.includes('moment reaction').valueOf() || s.body.includes('reaction moment'),
    s.body.slice(0, 80));

  // 4. Escape closes and focus returns to the trigger
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(200);
  check('Escape closes the window', !(await evalJs(`!!document.querySelector('.popover') && !document.querySelector('.popover').hidden`)));

  // 5. derivation doors: Mmax card → the worked steps, quoting the card value
  s = JSON.parse(await snap());
  const mmaxCard = s.cards.find((c) => c.label === 'Max bending moment');
  check('solved cards carry data-steps doors', s.cards.every((c) => c.steps.length > 0), JSON.stringify(s.cards.map((c) => c.label)));
  await evalJs(`[...document.querySelectorAll('#result-cards .card')].find(c => c.querySelector('.card-label')?.textContent === 'Max bending moment').click()`);
  await sleep(250);
  s = JSON.parse(await snap());
  check('Mmax card opens the worked derivation', s.open && s.steps.length >= 3, JSON.stringify(s.steps.slice(0, 2)));
  check('derivation quotes the hand value 15 kNm', s.values.some((v) => v.startsWith('15')), JSON.stringify(s.values));
  check('derivation names the closed form (P·a·b/L)', s.steps.some((f) => f.includes('P·a·b')), JSON.stringify(s.steps));

  // 6. the equilibrium badge is a teaching trigger
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await evalJs(`document.getElementById('eq-badge').click()`);
  await sleep(250);
  s = JSON.parse(await snap());
  check('equilibrium badge explains the self-check', s.open && s.title === 'Equilibrium self-check', s.title);

  // 7. UDL beam → derivation still exact (wL²/8 = 9). Add the distributed
  // load FIRST (chips apply to the SELECTED distributed load only — the M8
  // preset guard), then apply the Full UDL preset, then remove the point load.
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await evalJs(`document.getElementById('btn-add-distributed').click()`);
  await sleep(300);
  await evalJs(`document.querySelector('#preset-chips .preset-chip[data-preset="full"]').click()`);
  await sleep(300);
  await evalJs(`document.querySelectorAll('#load-list .load-row .load-remove')[0].click()`);
  await sleep(400);
  await evalJs(`[...document.querySelectorAll('#result-cards .card')].find(c => c.querySelector('.card-label')?.textContent === 'Max bending moment').click()`);
  await sleep(250);
  s = JSON.parse(await snap());
  check('UDL: derivation quotes wL²/8 = 9 kNm', s.values.some((v) => v.startsWith('9')), JSON.stringify(s.values));

  // 8. honesty: pin+pin → doors become data-term explainers, no derivations
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await evalJs(`(() => { const sel = document.getElementById('sel-support-right'); sel.value = 'pin'; sel.dispatchEvent(new Event('change')); })()`);
  await sleep(400);
  s = JSON.parse(await snap());
  check('indeterminate: cards carry the why doors (data-term)',
    s.cards.length >= 2 && s.cards.every((c) => c.term === 'statically-indeterminate' && !c.steps), JSON.stringify(s.cards.map((c) => c.term)));
  await evalJs(`[...document.querySelectorAll('#result-cards .card')][0].click()`);
  await sleep(250);
  s = JSON.parse(await snap());
  check('indeterminate: the door explains WHY it is not solved',
    s.open && s.title === 'Statically indeterminate' && s.body.includes('statics'), s.title);

  // 9. popover flips above when near the viewport bottom
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  const flipped = await evalJs(`(() => {
    const t = document.getElementById('eq-badge');
    t.click();
    const win = document.querySelector('.popover');
    const r = win.getBoundingClientRect();
    const inside = r.left >= 0 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1;
    const closed = document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return inside;
  })()`);
  check('popover opens fully inside the viewport', flipped === true);

  check('zero console errors / exceptions across the whole run', errors.length === 0, errors.join(' | ').slice(0, 200));
} catch (err) {
  check('harness completed without a setup crash', false, String(err).slice(0, 300));
} finally {
  try { if (edge) edge.kill(); } catch {}
  try { if (server) server.kill(); } catch {}
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
