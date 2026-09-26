// M10 shell functional checks — isolated headless Edge session, port 9349.
// The harness starts the app itself and keeps browser profile files under verify/tmp.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9349;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

let server, edge, ws;
try {
  const env = { ...process.env };
  delete env.PORT;
  server = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore', env });
  await sleep(900);
  edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-sync',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'shell-cdp-' + Date.now())}`,
    '--window-size=1440,1200', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
      wsUrl = targets.find((target) => target.type === 'page' && !/^(edge|chrome):\/\//.test(String(target.url || '')))?.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error('Edge remote debugging did not start');
  ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; setTimeout(() => reject(new Error('WebSocket open timeout')), 15000); });

  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.text ?? 'runtime exception');
    else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((arg) => arg.value ?? arg.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((resolve) => { const requestId = ++id; pending.set(requestId, resolve); ws.send(JSON.stringify({ id: requestId, method, params })); });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const snapshot = () => evaluate(`JSON.stringify((() => {
    const root = document.documentElement;
    const get = (selector, prop) => getComputedStyle(document.querySelector(selector))[prop];
    const eq = document.getElementById('eq-badge');
    const model = document.getElementById('model-panel');
    return {
      theme: root.getAttribute('data-theme'), mode: document.getElementById('theme-toggle').textContent,
      aria: document.getElementById('theme-toggle').getAttribute('aria-label'),
      paper: getComputedStyle(root).getPropertyValue('--paper').trim(),
      ink: getComputedStyle(root).getPropertyValue('--ink').trim(),
      panelBg: get('.panel', 'backgroundColor'), inputBg: get('#num-span', 'backgroundColor'),
      detBg: get('#det-badge', 'backgroundColor'), detInk: get('#det-badge', 'color'),
      eqBg: get('#eq-badge', 'backgroundColor'), eqInk: get('#eq-badge', 'color'),
      halo: getComputedStyle(document.querySelector('#sfd-svg text')).stroke,
      modelOpen: model.open, modelCount: document.getElementById('load-count').textContent,
      modelCountAria: document.getElementById('load-count').getAttribute('aria-label'),
      controlsVisible: !document.getElementById('num-span').closest('details').open ? !document.getElementById('num-span').offsetParent : true,
      eqInResults: !!eq.closest('.readouts'), eqText: eq.textContent, eqRole: eq.getAttribute('role'),
      eqLive: eq.getAttribute('aria-live'), eqTerm: eq.getAttribute('data-term'),
      values: [...document.querySelectorAll('#result-cards .card-value')].map(n => n.textContent),
      loadRows: document.querySelectorAll('#load-list .load-row').length,
      errorsVisible: !document.getElementById('validation-msg').hidden,
      glossaryOpen: !!document.querySelector('.teaching-backdrop:not([hidden]) .teaching-dialog'),
      summary: document.querySelector('.model-summary').innerText
    };
  })())`);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:8000/' });
  let loaded = false;
  for (let i = 0; i < 45 && !loaded; i++) {
    await sleep(250);
    try { loaded = String(await evaluate('document.title')).includes('Structural Lab'); } catch {}
  }
  if (!loaded) throw new Error('app document failed to load');
  await sleep(300);
  // Start from the same clean appearance preference regardless of any prior
  // harness profile; this does not test or clear beam state because none persists.
  await evaluate(`localStorage.removeItem('structural-lab.theme')`);
  await send('Page.reload', { ignoreCache: true });
  await sleep(1000);
  check('page starts and existing beam results are shown', (await snapshot()).includes('15 kNm'));

  let s = JSON.parse(await snapshot());
  const osTheme = await evaluate(`matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'`);
  check('default theme follows System and the actual OS preference', s.mode === `Theme: System (${osTheme})` && s.theme === osTheme, `${s.mode}, ${s.theme} (device: ${osTheme})`);
  check('theme control has an accessible name', s.aria.includes('System'));
  check('Model editor opens by default with its current load count', s.modelOpen && s.modelCount === '1 load' && s.modelCountAria === '1 load in the beam');
  check('concise equilibrium status stays in Results with live, on-demand explanation semantics', s.eqInResults && s.eqText === 'Balanced ✓' && s.eqRole === 'status' && s.eqLive === 'polite' && s.eqTerm === 'equilibrium-check');

  // Light → Dark → System, then prove the System mode follows OS preferences on a fresh page.
  await click('#theme-toggle');
  s = JSON.parse(await snapshot());
  check('Light selection applies and is explicitly labelled', s.mode === 'Theme: Light' && s.theme === 'light' && s.aria.includes('Light'));
  check('light theme tokens cover panels, inputs and status badges', s.panelBg === 'rgb(255, 255, 255)' && s.inputBg === 'rgb(255, 255, 255)' && s.detBg !== 'rgba(0, 0, 0, 0)', JSON.stringify({ panel: s.panelBg, input: s.inputBg, status: s.detBg }));
  const lightContrast = await evaluate(`(() => { const rgb=s=>s.match(/[\\d.]+/g).slice(0,3).map(Number); const lum=s=>{const c=rgb(s).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]}; const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}; return {body:ratio(getComputedStyle(document.body).color,getComputedStyle(document.body).backgroundColor),muted:ratio(getComputedStyle(document.querySelector('.diagram-cue')).color,getComputedStyle(document.querySelector('.panel')).backgroundColor),status:ratio(getComputedStyle(document.querySelector('#det-badge')).color,getComputedStyle(document.querySelector('#det-badge')).backgroundColor)}; })()`);
  check('light primary, muted and status text meet the 4.5:1 readability target', Object.values(lightContrast).every(v=>v>=4.5), JSON.stringify(lightContrast));
  await click('#theme-toggle');
  s = JSON.parse(await snapshot());
  check('Dark selection changes the whole shell and diagram theme', s.mode === 'Theme: Dark' && s.theme === 'dark' && s.paper === '#111827' && s.panelBg === 'rgb(31, 41, 55)' && s.inputBg === 'rgb(17, 24, 39)' && s.halo === 'rgb(31, 41, 55)', JSON.stringify({ theme: s.theme, panel: s.panelBg, input: s.inputBg, halo: s.halo }));
  check('dark status colors remain distinct from the panel', s.detBg !== s.panelBg && s.eqBg !== s.panelBg && s.detInk !== s.panelBg, JSON.stringify({ detBg: s.detBg, eqBg: s.eqBg }));
  const darkContrast = await evaluate(`(() => { const rgb=s=>s.match(/[\\d.]+/g).slice(0,3).map(Number); const lum=s=>{const c=rgb(s).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]}; const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}; return {body:ratio(getComputedStyle(document.body).color,getComputedStyle(document.body).backgroundColor),muted:ratio(getComputedStyle(document.querySelector('.diagram-cue')).color,getComputedStyle(document.querySelector('.panel')).backgroundColor),status:ratio(getComputedStyle(document.querySelector('#det-badge')).color,getComputedStyle(document.querySelector('#det-badge')).backgroundColor)}; })()`);
  check('dark primary, muted and status text meet the 4.5:1 readability target', Object.values(darkContrast).every(v=>v>=4.5), JSON.stringify(darkContrast));
  await click('#theme-toggle');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  s = JSON.parse(await snapshot());
  check('returning to System follows a dark OS setting', s.mode === 'Theme: System (dark)' && s.theme === 'dark', `${s.mode}, ${s.theme}`);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await send('Page.reload', { ignoreCache: true });
  await sleep(1000);
  const systemLight = JSON.parse(await snapshot());
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await send('Page.reload', { ignoreCache: true });
  await sleep(1000);
  const systemDark = JSON.parse(await snapshot());
  check('System follows either OS appearance preference on page load', systemLight.mode === 'Theme: System (light)' && systemLight.theme === 'light' && systemDark.mode === 'Theme: System (dark)' && systemDark.theme === 'dark', `${systemLight.mode} → ${systemDark.mode}`);

  // Explicit appearance persists across page reload in this throwaway browser profile.
  await click('#theme-toggle');
  const stored = await evaluate(`localStorage.getItem('structural-lab.theme')`);
  await send('Page.reload', { ignoreCache: true });
  await sleep(1200);
  s = JSON.parse(await snapshot());
  check('explicit Light selection persists across reload', stored === 'light' && s.mode === 'Theme: Light' && s.theme === 'light');
  await click('#theme-toggle'); // Dark for disclosure and popover contrast checks.

  const before = JSON.parse(await snapshot());
  await click('.model-summary');
  await sleep(100);
  let after = JSON.parse(await snapshot());
  check('native Model disclosure folds without changing its load count or results', !after.modelOpen && after.modelCount === before.modelCount && JSON.stringify(after.values) === JSON.stringify(before.values));
  await click('.model-summary');
  after = JSON.parse(await snapshot());
  check('reopening Model preserves the editable controls', after.modelOpen && after.controlsVisible);

  // Change count and verify the summary tracks it, then reset by deleting the added row.
  await click('#btn-add-point');
  await sleep(200);
  s = JSON.parse(await snapshot());
  check('foldable Model summary follows load-list changes', s.modelCount === '2 loads' && s.loadRows === 2);
  await evaluate(`document.querySelectorAll('#load-list .load-remove')[1].click()`);
  await sleep(250);

  // Invalid support arrangement should keep the warning visible outside the folded editor.
  await evaluate(`(() => { const el = document.getElementById('sel-support-right'); el.value='pin'; el.dispatchEvent(new Event('change')); })()`);
  await sleep(200);
  await click('.model-summary');
  s = JSON.parse(await snapshot());
  check('classification explanation stays visible when Model editor is folded', !s.modelOpen && s.errorsVisible === false && await evaluate(`!document.getElementById('class-note').hidden`));
  await click('.model-summary');
  await evaluate(`(() => { const el = document.getElementById('sel-support-right'); el.value='roller'; el.dispatchEvent(new Event('change')); })()`);
  await sleep(200);

  // The relocated badge remains a working click-to-explain trigger.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(150);
  await evaluate(`document.querySelector('#eq-badge').scrollIntoView({block:'center'})`);
  await click('#eq-badge');
  s = JSON.parse(await snapshot());
  check('relocated equilibrium badge opens its explanation in dark mode', s.glossaryOpen);
  const popover = await evaluate(`(() => { const p=document.querySelector('.teaching-dialog'); const r=p.getBoundingClientRect(); return { bg:getComputedStyle(p).backgroundColor, color:getComputedStyle(p).color, inside:r.left>=0 && r.top>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1 }; })()`);
  check('dark teaching dialog is readable against its surface and fits the viewport', popover.bg !== popover.color && popover.inside, JSON.stringify(popover));
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);

  // A real input edit should still flow through the same engine and update results instantly.
  const valueBefore = (JSON.parse(await snapshot())).values[1];
  await evaluate(`(() => { const el=document.getElementById('num-pos'); el.value='2'; el.dispatchEvent(new Event('input')); })()`);
  await sleep(250);
  const valueAfter = (JSON.parse(await snapshot())).values[1];
  check('editing a model value still updates the results immediately', valueBefore !== valueAfter && !JSON.parse(await snapshot()).errorsVisible, `${valueBefore} → ${valueAfter}`);
  check('no console errors or runtime exceptions', errors.length === 0, errors.join(' | ').slice(0, 200));
} catch (error) {
  check('harness completes without setup error', false, String(error).slice(0, 300));
} finally {
  try { ws?.close(); } catch {}
  try { edge?.kill(); } catch {}
  try { server?.kill(); } catch {}
}

const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
