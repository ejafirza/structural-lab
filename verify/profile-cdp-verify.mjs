// Profile (M7) browser verification via CDP (headless Edge).
// Verifies the arbitrary w(x) shape work end-to-end in a real browser:
// preset chips (Stepped / Snow drift), the shape-point table (add / remove /
// cap), hand-derived numbers for a stepped profile, add-then-remove returning
// to the previous state, profile-point handles (keyboard nudge + REAL
// synthesized pointer drag), the emit rule (two-point load back on the frozen
// linear path), honesty for indeterminate beams with a profile, and zero
// console errors.
//
// Hand-derived anchor (plan-m7.md §8, Case A): L = 6, profile
// (0,4) (3,4) (3,8) (6,8) — 4 kN/m on [0,3] then 8 kN/m on [3,6]:
//   R = 36 kN, x̄ = 3.5 m, RA = 15 kN, RB = 21 kN,
//   x* = 27/8 = 3.375 m, Mmax = 441/16 ≈ 27.5625 → "27.6 kNm".
import { spawn } from 'node:child_process';
import { cleanupLegacyBrowserSession } from './legacy-browser-session.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9343;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

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
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir = path.join(TMP, 'profile-edge-' + Date.now())}`,
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
    beamTexts: [...document.querySelectorAll('#beam-svg text')].map(t => t.textContent),
    rowSummaries: [...document.querySelectorAll('#load-list .load-summary')].map(n => n.textContent),
    rows: document.querySelectorAll('#load-list .load-row').length,
    pointRows: document.querySelectorAll('#point-table .point-row').length,
    pointXs: [...document.querySelectorAll('#point-table .point-x')].map(n => n.value),
    pointWs: [...document.querySelectorAll('#point-table .point-w')].map(n => n.value),
    addCpDisabled: document.getElementById('btn-add-cp').disabled,
    addCpTitle: document.getElementById('btn-add-cp').title,
    removeCpDisabled: [...document.querySelectorAll('#point-table .point-remove')].map(b => b.disabled),
    profileHandles: document.querySelectorAll('#beam-svg [data-role="profile-point"]').length,
    ctlW1Hidden: document.getElementById('ctl-w1').hidden,
    ctlRegionHidden: document.getElementById('ctl-region-start').hidden,
    ctlPointsHidden: document.getElementById('ctl-points').hidden,
    activePreset: (document.querySelector('#preset-chips .preset-chip.active')||{}).dataset?.preset ?? null,
    detClass: document.getElementById('det-badge').className,
    statusText: document.getElementById('load-status').textContent,
    validationShown: !document.getElementById('validation-msg').hidden,
  })`);

  const clickAdd = (id) => evalJs(`document.getElementById('${id}').click()`);
  const clickPreset = (id) => evalJs(`document.querySelector('#preset-chips .preset-chip[data-preset="${id}"]').click()`);
  const selectRow = (i) => evalJs(`document.querySelectorAll('#load-list .load-row > button:first-child')[${i}].click()`);
  const removeRow = (i) => evalJs(`document.querySelectorAll('#load-list .load-row .load-remove')[${i}].click()`);
  const removePoint = (i) => evalJs(`document.querySelectorAll('#point-table .point-remove')[${i}].click()`);
  const addPoint = () => evalJs(`document.getElementById('btn-add-cp').click()`);
  const setPointX = (i, v) => evalJs(`(() => {
    const x = document.querySelectorAll('#point-table .point-x')[${i}];
    x.value = '${v}';
    x.dispatchEvent(new Event('input'));
  })()`);
  const setSel = (id, v) => evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event('change')); })()`);
  const setNum = (id, v) => evalJs(`(() => { const e = document.getElementById('${id}'); e.value='${v}'; e.dispatchEvent(new Event('input')); })()`);

  // REAL synthesized pointer drag on a profile-point handle (pointerdown on
  // the handle, pointermove/pointerup on window — the listeners live there).
  const dragProfileHandle = (idx, dxPx) => evalJs(`(() => {
    const svg = document.getElementById('beam-svg');
    const g = svg.querySelectorAll('[data-role="profile-point"]')[${idx}];
    if (!g) return JSON.stringify({ ok: false, why: 'no profile-point handle ${idx}' });
    const r = g.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, clientX: cx, clientY: cy };
    g.dispatchEvent(new PointerEvent('pointerdown', opts));
    for (let i = 1; i <= 5; i++) {
      window.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: cx + ${dxPx} * i / 5 }));
    }
    window.dispatchEvent(new PointerEvent('pointerup', opts));
    return JSON.stringify({ ok: true });
  })()`);

  check('page loaded', (await evalJs('document.title')).includes('Structural Lab'));

  // 0. default screen untouched: point editor, no table, no chips active
  let s = JSON.parse(await snapshot());
  check('default: point editor, table hidden, no profile handles',
    s.ctlPointsHidden === true && s.pointRows === 0 && s.profileHandles === 0 && s.rows === 1);

  // 1. add distributed → two points → flat editor + table; emit = linear
  await clickAdd('btn-add-distributed');
  await sleep(400);
  await removeRow(0); // drop the default point load — every number below is for ONE profile
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('two-point load: table + flat editor both visible (emit = linear)',
    s.pointRows === 2 && s.ctlW1Hidden === false && s.ctlRegionHidden === false, JSON.stringify({ rows: s.pointRows, w1: s.ctlW1Hidden }));
  check('two-point load: no profile handles (renderm3 keys off the emitted kind)', s.profileHandles === 0);

  // 2. "Stepped" chip → Case A profile: hand-derived numbers verbatim
  await clickPreset('stepped');
  await sleep(500);
  s = JSON.parse(await snapshot());
  check('Stepped chip: chip active', s.activePreset === 'stepped', String(s.activePreset));
  check('Stepped chip: 4 table rows, flat editor hidden (emit = profile)',
    s.pointRows === 4 && s.ctlW1Hidden === true && s.ctlRegionHidden === true);
  check('Stepped chip: table shows x = 0, 3, 3, 6 (step pair)',
    JSON.stringify(s.pointXs) === JSON.stringify(['0', '3', '3', '6']), JSON.stringify(s.pointXs));
  check('Stepped chip: RA = 15 kN, RB = 21 kN',
    s.cards.includes('15 kN') && s.cards.includes('21 kN'), s.cards.join('|'));
  check('Stepped chip: Mmax 27.6 kNm (441/16) at x = 3.38 m (27/8)',
    s.cards.includes('27.6 kN·m') && s.cards.some((v) => v === '27.6 kN·m'), s.cards.join('|'));
  check('Stepped chip: combined R = 36 kN, x̄ = 3.5 m on beam',
    s.beamTexts.some((t) => t.includes('R = 36 kN')) && s.beamTexts.some((t) => t.includes('x̄ = 3.5 m')), s.beamTexts.join('|'));
  check('Stepped chip: band label carries the distinct levels (4→8 kN/m)',
    s.beamTexts.some((t) => t.includes('w: 4→8 kN/m')), s.beamTexts.join('|'));
  check('Stepped chip: one handle per control point, on the selected load',
    s.profileHandles === 4, `handles=${s.profileHandles}`);

  // 3. add a 5th point → values change and still match a hand-computed case.
  // The insertion lands at the midpoint of the widest segment ([0,3] or
  // [3,6], both 3 m) with the left neighbour's intensity — a collinear point
  // that leaves Case A's totals unchanged; we then re-shape it below.
  await addPoint();
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('add 5th point: cap not hit, rows update, still determinate',
    s.pointRows === 5 && s.addCpDisabled === false && s.detClass.includes('determinate'));
  check('add 5th point: new row inserted collinear (no jump in the total)',
    s.cards.includes('15 kN') && s.cards.includes('21 kN'), s.cards.join('|'));
  // Now set the new point's intensity to 6 kN/m. Points (0,4),(1.5,6),(3,4),
  // (3,8),(6,8): R = ½(4+6)·1.5 + ½(6+4)·1.5 + ½(8+8)·3 = 7.5+7.5+24 = 39 kN;
  // x̄ = (7.5·0.8 + 7.5·2.2 + 24·4.5)/39 = 130.5/39 ≈ 3.35 m;
  // RA = 39·(6−3.346)/6 = 17.25 kN, RB = 21.75 kN (all hand-derived).
  await evalJs(`(() => {
    const w = document.querySelectorAll('#point-table .point-w')[1];
    w.value = '6';
    w.dispatchEvent(new Event('input'));
  })()`);
  await sleep(500);
  s = JSON.parse(await snapshot());
  check('5-point profile: R = 39 kN, x̄ = 3.35 m (hand-derived)',
    s.beamTexts.some((t) => t.includes('R = 39 kN')) && s.beamTexts.some((t) => t.includes('x̄ = 3.35 m')),
    s.beamTexts.filter((t) => t.includes('R =') || t.includes('x̄ =')).join(' / '));
  check('5-point profile: RA = 17.3 kN, RB = 21.8 kN (17.25/21.75, 3 s.f.)',
    s.cards.includes('17.3 kN') && s.cards.includes('21.8 kN'), s.cards.join('|'));

  // 4. remove that point → the Case A numbers return exactly
  await removePoint(1);
  await sleep(500);
  s = JSON.parse(await snapshot());
  check('remove point: back to 4 rows and Case A values',
    s.pointRows === 4 && s.cards.includes('15 kN') && s.cards.includes('21 kN')
    && s.beamTexts.some((t) => t.includes('R = 36 kN')), s.cards.join('|'));

  // 5. keyboard nudge: ArrowUp on handle 1 raises its intensity by 0.1
  {
    const before = JSON.parse(await snapshot());
    await evalJs(`(() => {
      const h = document.querySelectorAll('#beam-svg [data-role="profile-point"]')[1];
      h.focus();
      h.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    })()`);
    await sleep(400);
    const after = JSON.parse(await snapshot());
    check('keyboard nudge: ArrowUp raises the point intensity by 0.1 kN/m',
      Number(after.pointWs[1]) > Number(before.pointWs[1]),
      `${before.pointWs[1]} → ${after.pointWs[1]}`);
    // restore by nudging down
    await evalJs(`(() => {
      const h = document.querySelectorAll('#beam-svg [data-role="profile-point"]')[1];
      h.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    })()`);
    await sleep(300);
  }

  // 6. REAL pointer drag: dragging a control point horizontally moves it.
  // Drag the UPPER step point (index 2, x = 3, w = 8) rightward: x grows
  // past 3 and stays below 6, so the array does NOT re-sort and row 2 keeps
  // tracking the dragged point. (Dragging the LOWER one would re-sort the
  // step pair — the app pins the point object, so the shape is still right,
  // but the row index would follow a different point afterwards.)
  {
    const before = JSON.parse(await snapshot());
    const drag = JSON.parse(await dragProfileHandle(2, 60));
    await sleep(400);
    const after = JSON.parse(await snapshot());
    check('pointer drag: control point moves along the beam',
      drag.ok && Number(after.pointXs[2]) > Number(before.pointXs[2]) && Number(after.pointXs[2]) < 6,
      `x[2] ${before.pointXs[2]} → ${after.pointXs[2]}`);
    check('pointer drag: results update live and stay valid',
      after.detClass.includes('determinate') && !after.validationShown);
    // restore the Case A shape (pull the dragged point back to x = 3)
    await setPointX(2, 3);
    await sleep(400);
    const restored = JSON.parse(await snapshot());
    check('drag checks: Case A shape restored for downstream checks',
      restored.pointRows === 4 && restored.cards.includes('15 kN')
      && JSON.stringify(restored.pointXs) === JSON.stringify(['0', '3', '3', '6']),
      `xs=${JSON.stringify(restored.pointXs)}, cards=${restored.cards.join('|')}`);
  }

  // 7. emit-rule regression: strip back to two points → frozen linear path.
  // Remaining points (0,4),(3,4): R = 12, x̄ = 1.5 → RA = 9, RB = 3,
  // peak inside the region at x = 2.25, Mmax = 10.125 → "10.1 kNm".
  await removePoint(2);
  await sleep(300);
  await removePoint(2);
  await sleep(500);
  s = JSON.parse(await snapshot());
  check('two points again: flat editor returns (emit = linear)',
    s.pointRows === 2 && s.ctlW1Hidden === false, `rows=${s.pointRows}`);
  check('two points again: frozen linear numbers RA = 9, RB = 3, Mmax = 10.1',
    s.cards.includes('9 kN') && s.cards.includes('3 kN') && s.cards.includes('10.1 kN·m'),
    `cards=${s.cards.join('|')}`);

  // 8. honesty: indeterminate with a profile
  await clickPreset('stepped');
  await sleep(300);
  await setSel('sel-support-right', 'pin');
  await sleep(400);
  s = JSON.parse(await snapshot());
  check('indeterminate with a profile: badge + – cards',
    s.detClass.includes('indeterminate') && s.cards.includes('–'), s.cards.join('|'));
  check('indeterminate with a profile: combined R = 36 kN, x̄ = 3.5 m still on beam',
    s.beamTexts.some((t) => t.includes('R = 36 kN')) && s.beamTexts.some((t) => t.includes('x̄ = 3.5 m')));
  await setSel('sel-support-right', 'roller');
  await sleep(300);

  // 9. snow drift chip renders the ramp-plateau-taper shape
  await clickPreset('snowdrift');
  await sleep(500);
  s = JSON.parse(await snapshot());
  check('Snow drift chip: 5 rows, determinate, no step markers',
    s.pointRows === 5 && s.detClass.includes('determinate'));
  check('Snow drift chip: levels label w: 0→6→3 kN/m (three distinct levels)',
    s.beamTexts.some((t) => t.includes('w: 0→6→3 kN/m')), s.beamTexts.join('|'));

  // 10. cap: add points to 6 → + Add point disabled with a naming tooltip
  await addPoint();
  await sleep(300);
  s = JSON.parse(await snapshot());
  check('cap: 6 points, + Add point disabled, tooltip names the cap',
    s.pointRows === 6 && s.addCpDisabled === true && String(s.addCpTitle).includes('At most 6'),
    `title='${s.addCpTitle}'`);
  check('cap: remove buttons re-enable below the cap',
    s.removeCpDisabled.filter((d) => d === false).length === 6);

  check('no console errors / exceptions', errors.length === 0, errors.join(' | '));
  ws.close();
} catch (err) {
  console.error('HARNESS ERROR:', err);
  results.push({ name: 'harness', ok: false });
} finally {
  await cleanupLegacyBrowserSession({ edge, server, profileDir, tempRoot: TMP, cdpPort: PORT });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
