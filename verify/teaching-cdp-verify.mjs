// M11 assertions only: the imported session owns the loopback server, one Edge/profile,
// CDP transport, and shutdown-gated cleanup. Teaching and layout checks run serially in it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTeachingBrowserSession } from './teaching-browser-session.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.resolve(HERE, 'tmp');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const session = createTeachingBrowserSession({ root: ROOT, tmp: TMP, edgePath: EDGE });
let browser;
try {
  browser = await session.start();
  const { send, evaluate, axTree } = browser;
  const snapshot = () => evaluate(`JSON.stringify((() => {
    const backdrop = document.querySelector('.teaching-backdrop');
    const dialog = backdrop?.querySelector('.teaching-dialog');
    return {
      open: !!dialog && !backdrop.hidden,
      title: dialog?.querySelector('.teaching-title')?.textContent ?? '',
      body: dialog?.querySelector('.teaching-body')?.textContent ?? '',
      equations: dialog ? [...dialog.querySelectorAll('.worked-equation')].map(node => node.textContent) : [],
      headings: dialog ? [...dialog.querySelectorAll('.worked-step-title')].map(node => node.textContent) : [],
      substitutions: dialog ? [...dialog.querySelectorAll('.worked-substitution')].map(node => node.textContent) : [],
      values: dialog ? [...dialog.querySelectorAll('.worked-value,.worked-answer')].map(node => node.textContent) : [],
      given: dialog ? [...dialog.querySelectorAll('.worked-given li')].map(node => node.textContent) : [],
      focusableCount: dialog ? dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])').length : 0,
      topics: dialog ? [...dialog.querySelectorAll('.popover-chip,.topic-link,.breadcrumb')].length : 0,
      role: dialog?.getAttribute('role'),
      modal: dialog?.getAttribute('aria-modal'),
      labelledTitle: dialog?.getAttribute('aria-labelledby') === 'teaching-title' && !!dialog?.querySelector('.teaching-title')?.textContent,
      inertMain: document.getElementById('lab-content').inert,
      inertHeader: document.querySelector('.topbar').inert,
      active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.className || '',
      expanded: document.querySelector('[aria-expanded="true"]') !== null,
      cards: [...document.querySelectorAll('#result-cards .card')].map(card => ({ label: card.querySelector('.card-label')?.textContent, value: card.querySelector('.card-value')?.textContent, steps: card.getAttribute('data-steps'), term: card.getAttribute('data-term') })),
      stiffnessVisible: !document.getElementById('ctl-ei').hidden
    };
  })())`);
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const escape = () => evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  const wait = async () => { await sleep(250); return JSON.parse(await snapshot()); };
  const pressKey = async (key, code, virtualKey, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey, modifiers });
  };
  const waitForPage = async () => {
    for (let i = 0; i < 60; i++) {
      await sleep(200);
      try {
        if (await evaluate(`document.title.includes('Structural Lab') && document.readyState === 'complete' && document.querySelectorAll('#result-cards .card').length > 0`)) return;
      } catch {}
    }
    throw new Error('app document failed to load');
  };
  const reload = async () => { await send('Page.reload', { ignoreCache: true }); await waitForPage(); };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Accessibility.enable');
  await send('Page.navigate', { url: browser.appUrl });
  await waitForPage();

  // Real-browser accessibility and default case.
  const tree = await axTree();
  const loadPositionSlider = tree.find((node) => node.role?.value === 'slider' && node.name?.value === 'Point load 1 position');
  const loadLabelButton = tree.find((node) => node.role?.value === 'button' && node.name?.value === 'Explain point load');
  check('accessibility tree separates the load label from its position slider', !!loadLabelButton && !!loadPositionSlider);
  let state = JSON.parse(await snapshot());
  check('page loads with unchanged standard result cards', state.cards.some((card) => card.value === '15 kNm'));
  check('concise safety note and diagram sign/unit cues remain', await evaluate(`document.querySelectorAll('.foot').length === 1 && document.querySelector('.foot').textContent === 'For learning only—not for structural design verification.' && document.querySelector('.shear-panel .diagram-cue')?.textContent.includes('positive plots up') && document.querySelector('.moment-panel .diagram-cue')?.textContent.includes('sagging (+) below')`));
  check('stiffness remains available with the default point load', state.stiffnessVisible);

  // Modal semantics, focus loop, keyboard activation, and close lifecycle.
  await click('label[for="sel-support-left"] .term-chip');
  state = await wait();
  check('support info click opens one Supports topic', state.open && state.title === 'Supports');
  check('dialog has labelled modal semantics and inerts page content', state.role === 'dialog' && state.labelledTitle && state.modal === 'true' && state.inertMain && state.inertHeader);
  check('dialog contains one topic without nested navigation', state.topics === 0);
  check('close receives focus and trigger tracks expanded state', state.active === 'Close explanation' && state.expanded);
  const centered = await evaluate(`(() => { const r=document.querySelector('.teaching-dialog').getBoundingClientRect(); return Math.abs((r.left+r.right)/2-innerWidth/2)<2 && Math.abs((r.top+r.bottom)/2-innerHeight/2)<2; })()`);
  check('desktop dialog is centered in the viewport', centered);

  await evaluate(`(() => { const probe=document.createElement('button'); probe.type='button'; probe.className='m11-focus-probe'; probe.textContent='Focus-loop probe'; probe.setAttribute('aria-label','M11 focus probe'); document.querySelector('.teaching-dialog').append(probe); document.querySelector('.teaching-close').focus(); })()`);
  await pressKey('Tab', 'Tab', 9);
  state = JSON.parse(await snapshot());
  check('real browser Tab advances between dialog controls', state.active === 'M11 focus probe');
  await pressKey('Tab', 'Tab', 9);
  state = JSON.parse(await snapshot());
  check('real browser Tab wraps from last control to first', state.active === 'Close explanation');
  await pressKey('Tab', 'Tab', 9, 8);
  state = JSON.parse(await snapshot());
  check('real browser Shift+Tab wraps from first control to last', state.active === 'M11 focus probe');
  await pressKey('Tab', 'Tab', 9, 8);
  state = JSON.parse(await snapshot());
  check('real browser Shift+Tab advances back to first control', state.active === 'Close explanation');
  await evaluate(`document.querySelector('.m11-focus-probe').remove()`);
  await escape();
  state = JSON.parse(await snapshot());
  check('Escape restores focus, aria state and background interaction', !state.open && state.active === 'About beam supports' && !state.expanded && !state.inertMain && !state.inertHeader);

  await evaluate(`document.querySelector('[data-term="point-load"]').focus()`);
  await pressKey(' ', 'Space', 32);
  state = await wait();
  check('Space activates a glossary topic by keyboard', state.open && state.title === 'Point load');
  await escape();

  // Standard result derivations stay card-specific and trace to the engine.
  await evaluate(`document.querySelectorAll('#result-cards .card').forEach(card => { if (card.querySelector('.card-label')?.textContent === 'Reaction VB') card.focus(); })`);
  await pressKey('Enter', 'Enter', 13);
  state = await wait();
  check('Enter opens the specific Reaction VB explanation', state.open && state.title.includes('reaction VB'));
  check('reaction shows equation, substitution and 5 kN engine answer', state.equations.some((equation) => equation.includes('RB = P·a / L')) && state.substitutions.includes('RB = 10 × 3 / 6 kN') && state.values.some((value) => value.includes('5 kN')));
  check('reaction separates equation, substitution and result steps', state.headings.includes('Take moments about A') && state.headings.includes('Substitute the given values') && state.headings.includes('Report the engine result'));
  await escape();

  await click('#result-cards .card:nth-child(4)');
  state = await wait();
  check('point-load Mmax uses valid formula/substitution and 15 kNm engine answer', state.open && state.equations.some((equation) => equation.includes('Mmax = P·a·b / L')) && state.substitutions.includes('Mmax = 10 × 3 × 3 / 6 kNm') && state.values.some((value) => value.includes('15 kNm')));
  await escape();
  await click('#result-cards .card:last-child');
  state = await wait();
  check('centered point deflection uses its valid formula and substitution', state.equations.some((equation) => equation.includes('P·L³ / (48·E·I)')) && state.substitutions.includes('vmax = 10 × 6³ / (48 × 20000) m'));
  await escape();
  await evaluate(`(() => { const input=document.getElementById('num-pos'); input.value='2'; input.dispatchEvent(new Event('input')); })()`);
  await click('#result-cards .card:last-child');
  state = await wait();
  check('off-center point deflection avoids the centered-load shortcut', state.equations.includes('E·I·v″(x) = −M(x)') && state.equations.every((equation) => !equation.includes('/ (48·E·I)')));
  await escape();

  await click('#btn-add-distributed');
  await evaluate(`document.querySelector('#preset-chips [data-preset="full"]').click()`);
  await evaluate(`document.querySelectorAll('#load-list .load-remove')[0].click()`);
  await click('#result-cards .card.accent');
  state = await wait();
  check('full-span UDL Mmax uses valid substitution and 9 kNm engine answer', state.equations.some((equation) => equation.includes('w·L² / 8')) && state.substitutions.includes('Mmax = 2 × 6² / 8 kNm') && state.values.some((value) => value.includes('9 kNm')));
  await escape();
  await click('#btn-add-point');
  state = JSON.parse(await snapshot());
  check('beam stiffness remains visible after switching load selection', state.stiffnessVisible);

  // General mixed profile path: actual given data, method, and engine output only.
  await reload();
  await click('#btn-add-distributed');
  await evaluate(`document.querySelector('#preset-chips [data-preset="stepped"]').click()`);
  await click('#result-cards .card.accent');
  state = await wait();
  check('point + stepped-profile Mmax lists actual point and profile inputs', state.given.some((datum) => datum.includes('P = 10 kN')) && state.given.some((datum) => datum.includes('profile points (x, w)')));
  check('mixed-profile Mmax reports engine peak method and result without numeric shortcut', state.equations.some((equation) => equation.includes('Candidates: V(x*) = 0')) && state.headings.includes('Check peak candidates') && state.headings.includes('Report the engine result') && state.values.length === 1 && !state.substitutions.some((text) => /Mmax\s*=/.test(text)));
  await escape();
  await click('#result-cards .card:last-child');
  state = await wait();
  check('mixed-profile deflection lists inputs/E·I and exact integration method', state.given.some((datum) => datum.includes('P = 10 kN')) && state.given.some((datum) => datum.includes('profile points (x, w)')) && state.given.some((datum) => datum.includes('E·I =')) && state.equations.includes('E·I·v″(x) = −M(x)') && !state.equations.some((equation) => equation.includes('P·L³ / (48·E·I)')));
  check('mixed-profile deflection reports only its engine answer', state.headings.includes('Report the engine result') && state.values.length === 1 && state.values[0].startsWith('Result:'));
  await escape();

  // Honest unsolved state, backdrop close, cap/reload regressions.
  await evaluate(`(() => { const select=document.getElementById('sel-support-right'); select.value='pin'; select.dispatchEvent(new Event('change')); })()`);
  state = JSON.parse(await snapshot());
  const equilibrium = await evaluate(`(() => {const e=document.getElementById('eq-badge');return {text:e.textContent,aria:e.getAttribute('aria-label'),tabindex:e.getAttribute('tabindex')};})()`);
  check('indeterminate cards explain the unsolved state without derivation routes', state.cards.length >= 2 && state.cards.every((card) => card.term === 'statically-indeterminate' && !card.steps));
  check('unsolved equilibrium state is truthful and not tabbable', equilibrium.text === 'Not solved' && equilibrium.aria.includes('no equilibrium residuals') && equilibrium.tabindex === '-1');
  await click('#result-cards .card');
  state = await wait();
  check('honesty door explains why the beam is not solved', state.open && state.title === 'Statically indeterminate' && /statics/i.test(state.body));
  await escape();
  await click('label[for="sel-support-left"] .term-chip');
  const fits = await evaluate(`(() => {const r=document.querySelector('.teaching-dialog').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})()`);
  check('dialog stays within the desktop viewport', fits);
  await evaluate(`document.querySelector('.teaching-backdrop').click()`);
  state = JSON.parse(await snapshot());
  check('backdrop click closes modal and restores background', !state.open && !state.inertMain);
  check('rapid additions stop at the supported six-load cap', await evaluate(`(() => {const add=document.getElementById('btn-add-point');for(let i=0;i<8;i++)add.click();return document.querySelectorAll('#load-list .load-row').length===6&&add.disabled;})()`));
  await reload();
  state = JSON.parse(await snapshot());
  check('reload restores default solved beam without stale modal', !state.open && !state.inertMain && state.cards.some((card) => card.value === '15 kNm'));

  // Eight SVG layout fixtures and desktop/phone dialog geometry, reusing same Edge/profile.
  const svgAudit = () => evaluate(`(() => {
    const overflow = [], overlaps = [], boxes = [];
    for (const id of ['beam-svg','sfd-svg','bmd-svg','defl-svg']) {
      const svg = document.getElementById(id), vb = svg.viewBox.baseVal;
      for (const text of svg.querySelectorAll('text')) {
        const b = text.getBBox();
        if (b.x < -.5 || b.y < -.5 || b.x + b.width > vb.width + .5 || b.y + b.height > vb.height + .5) overflow.push({ id, text: text.textContent });
        boxes.push({ id, text: text.textContent, x: b.x, y: b.y, w: b.width, h: b.height });
      }
    }
    for (let i=0;i<boxes.length;i++) for (let j=i+1;j<boxes.length;j++) {
      const a=boxes[i],b=boxes[j]; if(a.id!==b.id) continue;
      const ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x), oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
      if(ox>2&&oy>2) overlaps.push({id:a.id,a:a.text,b:b.text});
    }
    return {overflow,overlaps};
  })()`);
  const fullUdl = async () => {
    await click('#btn-add-distributed');
    await sleep(200);
    await click('#preset-chips [data-preset="full"]');
    await evaluate(`document.querySelectorAll('#load-list .load-remove')[0].click()`);
  };
  const configs = [
    ['default point beam', async () => {}],
    ['full UDL', fullUdl],
    ['cantilever tip load', async () => { await evaluate(`(() => {const a=document.getElementById('sel-support-left'),b=document.getElementById('sel-support-right');a.value='fixed';a.dispatchEvent(new Event('change'));b.value='free';b.dispatchEvent(new Event('change'));})()`); }],
    ['stepped profile', async () => { await click('#btn-add-distributed'); await sleep(200); await click('#preset-chips [data-preset="stepped"]'); await evaluate(`document.querySelectorAll('#load-list .load-remove')[0].click()`); }],
    ['profile + point load', async () => { await click('#btn-add-distributed'); await sleep(200); await click('#preset-chips [data-preset="stepped"]'); await click('#btn-add-point'); }],
    ['long span', async () => { await evaluate(`(() => {const e=document.getElementById('num-span');e.value='20';e.dispatchEvent(new Event('input'));})()`); }],
    ['low stiffness', async () => { await evaluate(`document.querySelector('#ei-chips [data-preset="timber"]').click()`); }],
    ['indeterminate', async () => { await evaluate(`(() => {const e=document.getElementById('sel-support-right');e.value='pin';e.dispatchEvent(new Event('change'));})()`); }],
  ];
  for (const [name, setup] of configs) {
    await reload();
    await setup();
    await sleep(400);
    const result = await svgAudit();
    check(`SVG audit: ${name}`, result.overflow.length === 0 && result.overlaps.length === 0, `overflow=${result.overflow.length}, overlaps=${result.overlaps.length}`);
  }

  await reload();
  await click('label[for="sel-support-left"] .term-chip');
  await sleep(200);
  const desktop = await evaluate(`(() => {const r=document.querySelector('.teaching-dialog').getBoundingClientRect();return {inside:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,cx:Math.abs((r.left+r.right)/2-innerWidth/2)<2,cy:Math.abs((r.top+r.bottom)/2-innerHeight/2)<2};})()`);
  check('dialog is centered and fits desktop viewport', desktop.inside && desktop.cx && desktop.cy);
  await evaluate(`document.querySelector('.teaching-close').click()`);
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(250);
  await click('label[for="sel-support-left"] .term-chip');
  await sleep(200);
  const phone = await evaluate(`(() => {const d=document.querySelector('.teaching-dialog'),b=document.querySelector('.teaching-body'),r=d.getBoundingClientRect();return {inside:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,width:r.width,viewport:innerWidth,overflow:getComputedStyle(b).overflowY};})()`);
  check('dialog fits 360px viewport and content region scrolls', phone.inside && phone.width <= phone.viewport + 1 && phone.overflow === 'auto');
  check('modal inerts all preexisting body siblings', await evaluate(`[...document.body.children].filter(node=>node!==document.querySelector('.teaching-backdrop')).every(node=>node.inert)`));
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await send('Emulation.clearDeviceMetricsOverride');
  check('browser emitted no console errors or runtime exceptions', browser.browserErrors.length === 0, browser.browserErrors.join(' | ').slice(0, 220));
} catch (error) {
  check('combined M11 browser assertions complete without setup error', false, String(error).slice(0, 300));
} finally {
  const cleanup = await session.close();
  check('owned Edge process stopped, CDP endpoint closed, and only its profile removed', cleanup.shutdownConfirmed && cleanup.profileRemoved, cleanup.cleanupError ?? 'cleanup confirmed');
}

const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exitCode = passed === results.length ? 0 : 1;
