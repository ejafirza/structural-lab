// Deflection (M8) browser verification via CDP (headless Edge).
// Verifies the elastic-curve work end-to-end in a real browser: the fourth
// panel draws the exaggerated curve with the true scale printed, the results
// card carries the hand-derived sag in mm, the E·I control (number + log
// slider + preset chips) re-sags the beam live, cantilevers deflect at the
// tip, honesty for indeterminate beams, and zero console errors.
//
// Hand-derived anchors (plan-m8.md §8): L = 6, EI = 2.0e4 kN·m².
//   default P = 10 @ 3 m:      EI·v = P·L³/48  = 45    → v = 2.25 mm
//   full UDL w = 2:            EI·v = 5wL⁴/384 = 33.75 → v = 1.69 mm
//   P = 10 @ 3 m, fixed+free:  EI·v = P·a²(3L−a)/6 = 225 → v = 11.3 mm
//   timber chip (EI = 500):    v = 45/500 = 90 mm
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9345;
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
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'defl-edge-' + Date.now())}`,
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

  const snapshot = () => evalJs(`JSON.stringify({
    cards: [...document.querySelectorAll('#result-cards .card')].map(c => ({
      label: c.querySelector('.card-label')?.textContent ?? '',
      value: c.querySelector('.card-value')?.textContent ?? '',
      sub: c.querySelector('.card-sub')?.textContent ?? '',
    })),
    deflTexts: [...document.querySelectorAll('#defl-svg text')].map(t => t.textContent),
    deflCurves: document.querySelectorAll('#defl-svg polyline').length,
    deflNote: (document.querySelector('#defl-svg text') || {}).textContent ?? '',
    eiVisible: !document.getElementById('ctl-ei').hidden,
    eiValue: document.getElementById('num-ei').value,
    eiChips: [...document.querySelectorAll('#ei-chips .preset-chip')].map(b => ({ id: b.dataset.preset, active: b.classList.contains('active') })),
    detClass: document.getElementById('det-badge').className,
  })`);

  const clickPreset = (id) => evalJs(`document.querySelector('#preset-chips .preset-chip[data-preset="${id}"]').click()`);
  const clickEIChip = (id) => evalJs(`document.querySelector('#ei-chips .preset-chip[data-preset="${id}"]').click()`);
  const setNum = (id, v) => evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event('input')); })()`);
  const setSlider = (id, v) => evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event('input')); })()`);
  const setSel = (id, v) => evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event('change')); })()`);
  const deflCard = (s) => s.cards.find((c) => c.label === 'Max deflection') ?? null;

  check('page loaded', (await evalJs('document.title')).includes('Structural Lab'));

  // 1. default beam: curve panel + hand-derived sag
  let s = JSON.parse(await snapshot());
  check('default: deflection panel draws the curve', s.deflCurves === 1, `curves=${s.deflCurves}`);
  check('default: note states the exaggeration and the true sag (2.25 mm)',
    s.deflNote.includes('exaggerated') && s.deflNote.includes('2.25 mm'), s.deflNote);
  check('default: Max deflection card = 2.25 mm at midspan',
    deflCard(s)?.value === '2.25 mm' && deflCard(s)?.sub.includes('at x = 3 m'), JSON.stringify(deflCard(s)));
  check('default: E·I control visible with the teaching default',
    s.eiVisible === true && s.eiValue === '20000', `value=${s.eiValue}`);

  // 2. full UDL (add distributed, remove default point) → 1.69 mm
  await evalJs(`document.getElementById('btn-add-distributed').click()`);
  await sleep(300);
  await clickPreset('full');
  await sleep(300);
  await evalJs(`document.querySelectorAll('#load-list .load-row .load-remove')[0].click()`);
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('full UDL: card = 1.69 mm (5wL⁴/384EI hand value)',
    deflCard(s)?.value === '1.69 mm', JSON.stringify(deflCard(s)));

  // 3. timber chip → EI = 500 → 33.75/500 = 67.5 mm; chip highlights
  await clickEIChip('timber');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('timber chip: EI = 500 applied, sag = 67.5 mm, chip active',
    s.eiValue === '500' && deflCard(s)?.value === '67.5 mm'
    && s.eiChips.find((c) => c.id === 'timber')?.active === true,
    `ei=${s.eiValue}, card=${JSON.stringify(deflCard(s))}`);

  // 4. log slider → EI = 10⁴ → back to 3.38 mm
  await setSlider('slider-ei', '4');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('log slider: EI = 10⁴ → card = 3.38 mm, chip cleared',
    s.eiValue === '10000' && deflCard(s)?.value === '3.38 mm'
    && s.eiChips.every((c) => !c.active), `ei=${s.eiValue}, card=${JSON.stringify(deflCard(s))}`);

  // 5. number field → EI = 5000 → 6.75 mm
  await setNum('num-ei', '5000');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('number field: EI = 5000 → card = 6.75 mm', deflCard(s)?.value === '6.75 mm', JSON.stringify(deflCard(s)));

  // 6. cantilever (UDL on the beam, EI = 5000): tip sag wL⁴/8EI = 64.8 mm
  //    (2·6⁴/8 = 324 kN·m³ → 324/5000 = 64.8 mm)
  await setSel('sel-support-left', 'fixed');
  await setSel('sel-support-right', 'free');
  await sleep(500);
  s = JSON.parse(await snapshot());
  check('cantilever: tip deflection 64.8 mm (wL⁴/8EI), downward',
    deflCard(s)?.value === '64.8 mm' && deflCard(s)?.sub.includes('down'), JSON.stringify(deflCard(s)));
  check('cantilever: note carries the true value',
    s.deflNote.includes('64.8 mm'), s.deflNote);

  // 7. back to pin+roller; EI persists across load edits
  await setSel('sel-support-left', 'pin');
  await setSel('sel-support-right', 'roller');
  await sleep(400);
  await evalJs(`document.getElementById('btn-add-point').click()`);
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('EI persists across load edits (still 5000, card updates)',
    s.eiValue === '5000' && deflCard(s) != null, `ei=${s.eiValue}, card=${JSON.stringify(deflCard(s))}`);

  // 8. honesty: pin+pin → placeholder, no card, E·I control hidden
  await setSel('sel-support-right', 'pin');
  await sleep(500);
  s = JSON.parse(await snapshot());
  check('indeterminate: deflection panel shows the placeholder',
    s.deflTexts.some((t) => t.toLowerCase().includes('not solved')), s.deflTexts.join(' | '));
  check('indeterminate: no Max deflection card, E·I control hidden',
    deflCard(s) === null && s.eiVisible === false);

  check('no console errors / exceptions', errors.length === 0, errors.join(' | '));
  ws.close();
} catch (err) {
  console.error('HARNESS ERROR:', err);
  results.push({ name: 'harness', ok: false });
} finally {
  try { edge?.kill(); } catch {}
  try { server?.kill(); } catch {}
  await sleep(300);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
