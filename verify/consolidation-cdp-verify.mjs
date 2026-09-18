// Consolidated-UI browser verification via CDP (headless Edge).
// Verifies: concept toggle, preset chips (single distributed editor), contextual
// resultant/centroid on the beam, clean Results panel, and no console errors.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9339;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

let server, edge;
try {
  server = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(900);
  edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'consol-edge-' + Date.now())}`,
    '--window-size=1200,1500', 'about:blank'], { stdio: 'ignore' });

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

  const snapshot = () => evalJs(`JSON.stringify({
    detClass: document.getElementById('det-badge').className,
    cards: [...document.querySelectorAll('#result-cards .card-value')].map(n => n.textContent),
    labels: [...document.querySelectorAll('#result-cards .card-label')].map(n => n.textContent),
    beamTexts: [...document.querySelectorAll('#beam-svg text')].map(t => t.textContent),
    pointHandle: document.querySelectorAll('#beam-svg [data-role="load-handle"]').length,
    regionStart: document.querySelectorAll('#beam-svg [data-role="region-start"]').length,
    regionEnd: document.querySelectorAll('#beam-svg [data-role="region-end"]').length,
    bandRect: [...document.querySelectorAll('#beam-svg rect')].filter(r => r.getAttribute('fill') && r.getAttribute('fill') !== 'transparent').length,
    bandPoly: document.querySelectorAll('#beam-svg polygon[fill]').length,
    activePreset: (document.querySelector('#preset-chips .preset-chip.active')||{}).dataset?.preset ?? null,
    ctlLoadHidden: document.getElementById('ctl-load').hidden,
    ctlW1Hidden: document.getElementById('ctl-w1').hidden,
    ctlPresetsHidden: document.getElementById('ctl-presets').hidden,
  })`);

  const setRadio = (id) => evalJs(`(() => { const r = document.getElementById('${id}'); r.checked = true; r.dispatchEvent(new Event('change')); })()`);
  const clickPreset = (id) => evalJs(`document.querySelector('#preset-chips .preset-chip[data-preset="${id}"]').click()`);
  const setSel = (id, v) => evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event('change')); })()`);
  const setNum = (id, v) => evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event('input')); })()`);

  check('page loaded', (await evalJs('document.title')).includes('Structural Lab'));

  // 1. default point load (regression)
  let s = JSON.parse(await snapshot());
  check('point default: VA=VB=5 kN', s.cards.filter((v) => v === '5 kN').length === 2, s.cards.join('|'));
  check('point default: Mmax 15 kNm', s.cards.includes('15 kNm'));
  check('point default: draggable handle, no region handles', s.pointHandle === 1 && s.regionStart === 0);
  check('point default: no load-description cards', !s.labels.some((l) => l.includes('Resultant') || l.includes('Centroid') || l.includes('intensity')), s.labels.join('|'));
  check('point default: point controls visible, distributed hidden', s.ctlLoadHidden === false && s.ctlW1Hidden === true);

  // 2. switch to distributed → Full UDL preset
  await setRadio('concept-distributed');
  await sleep(300);
  s = JSON.parse(await snapshot());
  check('distributed: controls toggle', s.ctlLoadHidden === true && s.ctlW1Hidden === false && s.ctlPresetsHidden === false);

  await clickPreset('full');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('Full UDL: chip active', s.activePreset === 'full', String(s.activePreset));
  check('Full UDL: VA=VB=6 kN, Mmax 9 kNm', s.cards.filter((v) => v === '6 kN').length === 2 && s.cards.includes('9 kNm'), s.cards.join('|'));
  check('Full UDL: R=12 kN on beam', s.beamTexts.some((t) => t.includes('R = 12 kN')), s.beamTexts.join('|'));
  check('Full UDL: x̄=3 m on beam', s.beamTexts.some((t) => t.includes('x̄ = 3 m')));
  check('Full UDL: w=2 kN/m on beam', s.beamTexts.some((t) => t.includes('w = 2 kN/m')));
  check('Full UDL: no R/x̄/w cards', !s.labels.some((l) => l.includes('Resultant') || l.includes('Centroid') || l.includes('intensity')));
  check('Full UDL: region handles, no point handle', s.regionStart === 1 && s.regionEnd === 1 && s.pointHandle === 0);
  check('Full UDL: uniform band rect', s.bandRect >= 1, `rect=${s.bandRect}`);

  // 3. Partial UDL
  await clickPreset('partial');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('Partial UDL: chip active', s.activePreset === 'partial', String(s.activePreset));
  check('Partial UDL: VA=VB=4 kN, Mmax 8 kNm', s.cards.filter((v) => v === '4 kN').length === 2 && s.cards.includes('8 kNm'), s.cards.join('|'));
  check('Partial UDL: R=8 kN, x̄=3 m', s.beamTexts.some((t) => t.includes('R = 8 kN')) && s.beamTexts.some((t) => t.includes('x̄ = 3 m')));

  // 4. Triangular (peak left)
  await clickPreset('tri-left');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('Triangular ▲: chip active', s.activePreset === 'tri-left', String(s.activePreset));
  check('Triangular ▲: RA=12, RB=6, Mmax 13.9', s.cards.includes('12 kN') && s.cards.includes('6 kN') && s.cards.includes('13.9 kNm'), s.cards.join('|'));
  check('Triangular ▲: R=18 kN, x̄=2 m', s.beamTexts.some((t) => t.includes('R = 18 kN')) && s.beamTexts.some((t) => t.includes('x̄ = 2 m')));
  check('Triangular ▲: intensity 6 → 0', s.beamTexts.some((t) => t.includes('w: 6 → 0 kN/m')));
  check('Triangular ▲: polygon drawn', s.bandPoly >= 1, `poly=${s.bandPoly}`);

  // 5. Trapezoidal
  await clickPreset('trap');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('Trapezoidal: RA=8, RB=10, Mmax 13.5', s.cards.includes('8 kN') && s.cards.includes('10 kN') && s.cards.includes('13.5 kNm'), s.cards.join('|'));
  check('Trapezoidal: R=18 kN, x̄=3.33 m', s.beamTexts.some((t) => t.includes('R = 18 kN')) && s.beamTexts.some((t) => t.includes('x̄ = 3.33 m')));
  check('Trapezoidal: intensity 2 → 4', s.beamTexts.some((t) => t.includes('w: 2 → 4 kN/m')));

  // 6. region edit updates R/x̄ live, chip clears
  await clickPreset('partial');
  await setNum('num-region-end', '4');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('region edit: R=6 kN, x̄=2.5 m', s.beamTexts.some((t) => t.includes('R = 6 kN')) && s.beamTexts.some((t) => t.includes('x̄ = 2.5 m')), s.beamTexts.join('|'));
  check('region edit: no chip active (custom)', s.activePreset === null, String(s.activePreset));

  // 7. indeterminate: R/x̄ still on beam
  await clickPreset('full');
  await setSel('sel-support-right', 'pin');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('indeterminate: badge', s.detClass.includes('indeterminate'), s.detClass);
  check('indeterminate: cards show –', s.cards.includes('–'), s.cards.join('|'));
  check('indeterminate: R/x̄ still on beam', s.beamTexts.some((t) => t.includes('R = 12 kN')) && s.beamTexts.some((t) => t.includes('x̄ = 3 m')));

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
process.exitCode = failed.length ? 1 : 0;
