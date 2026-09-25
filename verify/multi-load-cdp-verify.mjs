// Multi-load (M6) browser verification via CDP (headless Edge).
// Verifies the load-list interaction: add / select / remove, combined
// resultant R/x̄ on the beam, list summaries, the MAX_LOADS cap, honesty for
// indeterminate multi-load beams, and zero console errors.
//
// Expected values are hand-derived (plan-m6.md §8 discipline), e.g. the
// default point (10 kN @ 3 m) + added point (5 kN @ 4 m) on L = 6:
//   RA = (10·3 + 5·2)/6 = 20/3 ≈ 6.67, RB = 25/3 ≈ 8.33,
//   Mmax = RA·3 = 20 kNm at the x = 3 jump;  R = 15 kN, x̄ = (10·3 + 5·4)/15.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

let server, edge;
try {
    // Sanitize the inherited environment: a PORT exported by an outer tool
  // (e.g. a dev-server host setting PORT=0) must not rebind our app server
  // away from its default 8000, which these harnesses address directly.
  const childEnv = { ...process.env };
  delete childEnv.PORT;
  server = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore', env: childEnv });
  await sleep(900);
  edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-sync',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'multi-edge-' + Date.now())}`,
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
  // Wait until the app document is actually live on the attached target
  // (guards against attaching to a non-app page target).
  {
    let ok = false;
    for (let i = 0; i < 33 && !ok; i++) {
      try { ok = String(await evalJs('document.title')).includes('Structural Lab'); } catch {}
      if (!ok) await sleep(300);
    }
    if (!ok) throw new Error('app page never became live on the attached target');
  }

  const snapshot = () => evalJs(`JSON.stringify({
    cards: [...document.querySelectorAll('#result-cards .card-value')].map(n => n.textContent),
    labels: [...document.querySelectorAll('#result-cards .card-label')].map(n => n.textContent),
    beamTexts: [...document.querySelectorAll('#beam-svg text')].map(t => t.textContent),
    rowSummaries: [...document.querySelectorAll('#load-list .load-summary')].map(n => n.textContent),
    rowActive: [...document.querySelectorAll('#load-list .load-row > button:first-child')].map(b => b.classList.contains('active')),
    addPointDisabled: document.getElementById('btn-add-point').disabled,
    addDistDisabled: document.getElementById('btn-add-distributed').disabled,
    loadCount: document.querySelectorAll('#load-list .load-row').length,
    removeDisabled: [...document.querySelectorAll('#load-list .load-remove')].map(b => b.disabled),
    detClass: document.getElementById('det-badge').className,
    statusText: document.getElementById('load-status').textContent,
  })`);

  const clickAdd = (id) => evalJs(`document.getElementById('${id}').click()`);
  const selectRow = (i) => evalJs(`document.querySelectorAll('#load-list .load-row > button:first-child')[${i}].click()`);
  const removeRow = (i) => evalJs(`document.querySelectorAll('#load-list .load-row .load-remove')[${i}].click()`);
  const setSel = (id, v) => evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event('change')); })()`);

  check('page loaded', (await evalJs('document.title')).includes('Structural Lab'));

  // 1. default single point load — one row, add buttons enabled
  let s = JSON.parse(await snapshot());
  check('default: one load row, none removable', s.loadCount === 1 && s.removeDisabled[0] === true);
  check('default: add buttons enabled', s.addPointDisabled === false && s.addDistDisabled === false);
  check('default: summary text', s.rowSummaries[0].includes('P = 10 kN'), s.rowSummaries[0]);

  // 2. add a second point load → combined superposition (hand-derived values)
  await clickAdd('btn-add-point');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('two point loads: two rows, summary added', s.loadCount === 2 && s.rowSummaries[1].includes('P = 5 kN'), s.rowSummaries.join('|'));
  check('two point loads: new row auto-selected', s.rowActive[1] === true, JSON.stringify(s.rowActive));
  check('two point loads: RA=6.67, RB=8.33', s.cards.includes('6.67 kN') && s.cards.includes('8.33 kN'), s.cards.join('|'));
  check('two point loads: Mmax 20 kNm at x=3', s.cards.includes('20 kNm'), s.cards.join('|'));
  check('two point loads: combined R=15 kN, x̄=3.33 m on beam',
    s.beamTexts.some((t) => t.includes('R = 15 kN')) && s.beamTexts.some((t) => t.includes('x̄ = 3.33 m')), s.beamTexts.join('|'));
  check('two point loads: both load labels numbered on beam',
    s.beamTexts.some((t) => t.includes('①')) && s.beamTexts.some((t) => t.includes('②')), s.beamTexts.join('|'));

  // 3. select row 0 → editor follows selection (point fields visible again)
  await selectRow(0);
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('select row 0: selection moves', s.rowActive[0] === true && s.rowActive[1] === false);

  // 4. add distributed → three loads. The distributed default is w = 2 kN/m
  // over [1, 4] → R_dist = 6 kN at x̄ = 2.5; combined R = 15 + 6 = 21 kN,
  // x̄ = (10·3 + 5·4 + 6·2.5)/21 = 65/21 ≈ 3.1 m.
  await clickAdd('btn-add-distributed');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('three loads: rows and combined R = 21 kN, x̄ = 3.1 m',
    s.loadCount === 3 && s.beamTexts.some((t) => t.includes('R = 21 kN')) && s.beamTexts.some((t) => t.includes('x̄ = 3.1 m')), s.beamTexts.join('|'));

  // 5. remove a load → numbers return to the two-load case
  await removeRow(2);
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('remove: back to two rows, R = 15 kN', s.loadCount === 2 && s.beamTexts.some((t) => t.includes('R = 15 kN')), s.beamTexts.join('|'));

  // 6. remove down to one → remove disabled again
  await removeRow(1);
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('single load again: remove disabled', s.loadCount === 1 && s.removeDisabled[0] === true);

  // 7. honesty: indeterminate with multiple loads
  await clickAdd('btn-add-point');
  await sleep(300);
  await setSel('sel-support-right', 'pin');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('indeterminate multi-load: badge', s.detClass.includes('indeterminate'), s.detClass);
  check('indeterminate multi-load: cards –', s.cards.includes('–'), s.cards.join('|'));
  check('indeterminate multi-load: combined R still on beam', s.beamTexts.some((t) => t.includes('R = 15 kN')), s.beamTexts.join('|'));

  // 8. cap: five more adds hit MAX_LOADS = 6 and disable the add buttons
  await setSel('sel-support-right', 'roller');
  await sleep(300);
  for (let i = 0; i < 4; i++) { await clickAdd('btn-add-point'); await sleep(120); }
  await clickAdd('btn-add-point');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('cap: 6 loads, add buttons disabled', s.loadCount === 6 && s.addPointDisabled === true && s.addDistDisabled === true, `rows=${s.loadCount}`);

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
