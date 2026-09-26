// M10 responsive/layout checks — isolated headless Edge session, port 9350.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9350;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const errors = [];
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
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'shell-layout-' + Date.now())}`,
    '--window-size=1440,1800', 'about:blank'], { stdio: 'ignore' });
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
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:8000/' });
  let loaded = false;
  for (let i = 0; i < 45 && !loaded; i++) {
    await sleep(250);
    try { loaded = String(await evaluate('document.title')).includes('Structural Lab'); } catch {}
  }
  if (!loaded) throw new Error('app document failed to load');

  const setViewport = async (width, height = 1000) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(250);
  };
  const audit = () => evaluate(`(() => {
    const box = (selector) => { const r=document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
    const model=box('#model-panel'), results=box('.readouts'), beam=box('.beam-panel'), shear=box('.shear-panel'), moment=box('.moment-panel'), deflection=box('.deflection-panel'), footer=box('.foot');
    const vw=document.documentElement.clientWidth;
    const desktop=document.documentElement.clientWidth>980;
    const columnGap=desktop ? results.x-(model.x+model.width) : results.x-model.x;
    const svgs=['beam-svg','sfd-svg','bmd-svg','defl-svg'].map(id=>{ const svg=document.getElementById(id), r=svg.getBoundingClientRect(); return {id,width:r.width,right:r.right,view:svg.getAttribute('viewBox'),texts:svg.querySelectorAll('text').length}; });
    const text=svgs.every(s=>s.texts>0);
    const ordered=[results.y,beam.y,shear.y,moment.y,deflection.y].every((y,i,a)=>i===0||y>=a[i-1]);
    const rowAndOrder=desktop ? columnGap>=0 && Math.abs(results.x-beam.x)<1 && [results,beam,shear,moment,deflection].every(b=>Math.abs(b.width-results.width)<1) : ordered && model.y<results.y && Math.abs(model.x-results.x)<1;
    return {vw,scrollWidth:document.documentElement.scrollWidth,desktop,model,results,beam,shear,moment,deflection,footer,columnGap,rowAndOrder,svgVisible:svgs.every(s=>s.width>0&&s.right<=vw+1&&s.view),svgTexts:text,svgs,theme:document.documentElement.getAttribute('data-theme'),paper:getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()};
  })()`);

  for (const width of [1440, 1024, 980, 768, 560, 390]) {
    await setViewport(width, 1000);
    // Light, default state.
    await evaluate(`document.documentElement.setAttribute('data-theme','light')`);
    let a = await audit();
    const shouldBeDesktop = width > 980;
    check(`${width}px: ${shouldBeDesktop ? 'two-column' : 'stacked'} reading order`, a.desktop === shouldBeDesktop && a.rowAndOrder, JSON.stringify({ desktop:a.desktop, gap:a.columnGap, modelY:a.model.y, resultsY:a.results.y }));
    check(`${width}px: no horizontal overflow and all four diagrams visible`, a.scrollWidth <= width + 1 && a.svgVisible && a.svgTexts, `scroll=${a.scrollWidth}, svgs=${a.svgVisible}, labels=${a.svgTexts}`);

    // Explicit Dark palette: diagram attributes remain theme tokens, and no elements disappear.
    await evaluate(`document.documentElement.setAttribute('data-theme','dark')`);
    a = await audit();
    const themed = await evaluate(`(() => ({ paper:getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(), panel:getComputedStyle(document.querySelector('.panel')).backgroundColor, halo:getComputedStyle(document.querySelector('#sfd-svg text')).stroke, token:getComputedStyle(document.querySelector('#sfd-svg')).getPropertyValue('--diagram-halo').trim() }))()`);
    check(`${width}px: dark surfaces and diagram labels use dark theme`, a.theme === 'dark' && themed.paper === '#111827' && themed.panel === 'rgb(31, 41, 55)' && themed.halo === 'rgb(31, 41, 55)', JSON.stringify(themed));
  }

  // Crowded load configuration, profile and cantilever across desktop and phone sizes.
  for (const width of [1440, 390]) {
    await setViewport(width, 1100);
    await evaluate(`location.reload()`);
    await sleep(900);
    await evaluate(`document.getElementById('btn-add-distributed').click()`);
    await sleep(150);
    await evaluate(`document.querySelector('#preset-chips [data-preset="stepped"]').click()`);
    await sleep(150);
    await evaluate(`document.getElementById('btn-add-point').click()`);
    await sleep(200);
    const crowded = await audit();
    check(`${width}px: crowded profile/multi-load diagrams do not overflow`, crowded.scrollWidth <= width + 1 && crowded.svgVisible && crowded.svgTexts, JSON.stringify({scroll:crowded.scrollWidth,svgs:crowded.svgVisible}));
    await evaluate(`(() => { const l=document.getElementById('sel-support-left'),r=document.getElementById('sel-support-right'); l.value='fixed'; l.dispatchEvent(new Event('change')); r.value='free'; r.dispatchEvent(new Event('change')); })()`);
    await sleep(200);
    const cantilever = await audit();
    check(`${width}px: cantilever keeps all diagram panels visible`, cantilever.scrollWidth <= width + 1 && cantilever.svgVisible, `scroll=${cantilever.scrollWidth}`);
    await evaluate(`location.reload()`);
    await sleep(900);
  }

  // A trigger in Results and the relocated badge both open inside the viewport on desktop and phone.
  for (const width of [1440, 390]) {
    await setViewport(width, 900);
    for (const trigger of ['#eq-badge', '[data-term="determinacy"]']) {
      await evaluate(`document.querySelector(${JSON.stringify(trigger)}).scrollIntoView({block:'center'})`);
      await evaluate(`document.querySelector(${JSON.stringify(trigger)}).click()`);
      await sleep(120);
      const pop = await evaluate(`(() => { const p=document.querySelector('.popover'),t=document.querySelector(${JSON.stringify(trigger)}); const r=p.getBoundingClientRect(),q=t.getBoundingClientRect(); return {inside:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overlap:Math.min(r.right,q.right)-Math.max(r.left,q.left)>1&&Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top)>1}; })()`);
      check(`${width}px: ${trigger} explanation fits and avoids its trigger`, pop.inside && !pop.overlap, JSON.stringify(pop));
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    }
  }

  check('zero console errors or runtime exceptions', errors.length === 0, errors.join(' | ').slice(0, 200));
} catch (error) {
  check('layout harness completes without setup error', false, String(error).slice(0, 300));
} finally {
  try { ws?.close(); } catch {}
  try { edge?.kill(); } catch {}
  try { server?.kill(); } catch {}
}

const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
