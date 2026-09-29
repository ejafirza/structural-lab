/**
 * ui-m7.test.js — UI tests for arbitrary w(x) profiles (Milestone 7).
 * ---------------------------------------------------------------------------
 * Three layers, following the ui-m5/ui-m6 patterns:
 *   1. render tests against the fake DOM (renderm3.js): the profile band is
 *      ONE polygon through the control points with a vertical edge at a
 *      step; handles exist only on the SELECTED load, one per control point;
 *      a two-point load renders exactly as M5 rendered it.
 *   2. the emit rule through BOTH ends: emitDescriptor (unit) and the result
 *      the engine returns when the emitted descriptor is a `linear`.
 *   3. the app.js interaction layer against a minimal fake DOM: point table
 *      wiring, add/remove points, the cap, clamping, drag and keyboard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam } from '../src/analysis.js';
import { emitDescriptor, MAX_PROFILE_POINTS } from '../src/loadmodel.js';
import { fmt } from '../ui/render.js';

// --- minimal DOM shim (shared: test/helpers/fake-dom.js) --------------------

import { makeDoc } from './helpers/fake-dom.js';

function makeFakeDoc(extraIds = []) {
  return makeDoc({ extraIds }).doc;
}

globalThis.document = makeFakeDoc();
const { renderM3 } = await import('../ui/renderm3.js');

// --- helpers ----------------------------------------------------------------

const stepped = [
  { x: 0, w: 4 }, { x: 3, w: 4 }, { x: 3, w: 8 }, { x: 6, w: 8 },
];
const pinRoller = { left: 'pin', right: 'roller' };

const polygonsOf = (doc) => doc.getElementById('beam-svg').findAll((n) => n.nodeName === 'polygon');
const roles = (doc, role) =>
  doc.getElementById('beam-svg').findAll((n) => n.attrs['data-role'] === role);
const loadGroups = (doc) =>
  doc.getElementById('beam-svg').findAll((n) => n.attrs['data-load-index'] != null && n.attrs['data-role'] == null);

// ---------------------------------------------------------------------------
// 1. render tests
// ---------------------------------------------------------------------------

test('profile band renders as one polygon through the control points, with a vertical step edge', () => {
  const result = analyzeBeam({
    span: 6,
    loads: [{ type: 'profile', points: stepped }],
    supports: pinRoller,
  });
  const doc = makeFakeDoc();
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, result);

  // Band shape: base-left → each control-point top → base-right (6 vertices).
  const polys = polygonsOf(doc);
  const band = polys.find((p) => String(p.attrs.points).split(' ').length === 6);
  assert.ok(band, `band polygon with 6 vertices (got ${polys.map((p) => p.attrs.points).join(' / ')})`);
  const coords = String(band.attrs.points).split(' ').map((pair) => pair.split(',').map(Number));
  assert.equal(coords[0][1], coords[5][1], 'both base corners on the baseline');
  const topXs = coords.slice(1, 5).map((c) => c[0]);
  assert.equal(topXs[1], topXs[2], 'vertical step edge: repeated x at the step');
  assert.notEqual(coords[2][1], coords[3][1], 'step edge is vertical (same x, different y)');
});

test('emit rule: exactly two points → linear descriptor + byte-identical result to the frozen path', () => {
  // Unit: the single home of the rule.
  assert.deepEqual(
    emitDescriptor({ type: 'profile', points: [{ x: 1, w: 2 }, { x: 5, w: 4 }] }),
    { type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 4 }
  );
  assert.equal(
    emitDescriptor({ type: 'profile', points: [{ x: 0, w: 2 }, { x: 0, w: 2 }, { x: 5, w: 4 }] }).type,
    'profile',
    'a step (repeated x) is a profile even with few points'
  );
  assert.equal(emitDescriptor({ type: 'point', magnitude: 3, position: 2 }).type, 'point');

  // Through the engine: the emitted linear must reach the FROZEN M5 solver.
  const viaEmit = analyzeBeam({
    span: 6,
    loads: [emitDescriptor({ type: 'profile', points: [{ x: 0, w: 0 }, { x: 6, w: 12 }] })],
    supports: pinRoller,
  });
  const direct = analyzeBeam({
    span: 6,
    loads: [{ type: 'linear', start: 0, end: 6, wStart: 0, wEnd: 12 }],
    supports: pinRoller,
  });
  assert.equal(viaEmit.kind, 'beam-linear', 'two-point loads take the frozen linear path');
  assert.deepEqual(viaEmit, direct, 'byte-identical result object to the direct linear input');

  // Rendering: a UNIFORM two-point band is the M5 rect — no profile polygon.
  // (A triangular two-point load is the M5 triangle polygon, so it proves
  // nothing new here; uniformity is what isolates the rect branch.)
  const uniform = analyzeBeam({
    span: 6,
    loads: [emitDescriptor({ type: 'profile', points: [{ x: 1, w: 2 }, { x: 5, w: 2 }] })],
    supports: pinRoller,
  });
  const doc = makeFakeDoc();
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, uniform);
  const rects = doc.getElementById('beam-svg').findAll((n) => n.nodeName === 'rect' && n.attrs.fill !== 'transparent');
  assert.equal(rects.length, 1, 'uniform two-point load renders as the M5 rect');
});

test('handles: one per control point on the SELECTED profile only, with aria labels', () => {
  const result = analyzeBeam({
    span: 6,
    loads: [
      { type: 'profile', points: stepped },
      { type: 'point', magnitude: 5, position: 2 },
    ],
    supports: pinRoller,
  });
  const docSel = makeFakeDoc();
  renderM3(docSel, { span: 6, selectedLoad: 0, supports: pinRoller }, result);
  const handles = roles(docSel, 'profile-point');
  assert.equal(handles.length, 4, 'one handle per control point');
  assert.ok(handles.every((h) => h.attrs['data-point-index'] != null), 'each handle carries its point index');
  assert.ok(
    handles.some((h) => String(h.attrs['aria-valuetext']).includes('3 metres from support A; 8 kilonewtons per metre downward')),
    'aria names the point, intensity and position'
  );
  // Attribution: the handles live inside load 0's wrapper.
  const wrapper0 = loadGroups(docSel).find((n) => n.attrs['data-load-index'] === '0');
  assert.equal(wrapper0.findAll((n) => n.attrs['data-role'] === 'profile-point').length, 4);

  const docOther = makeFakeDoc();
  renderM3(docOther, { span: 6, selectedLoad: 1, supports: pinRoller }, result);
  assert.equal(roles(docOther, 'profile-point').length, 0, 'no handles when the profile is not selected');
  assert.equal(roles(docOther, 'load-handle').length, 1, 'the selected point load keeps its arrow handle');
});

test('two-point selected load keeps the M5 region handles (no profile handles)', () => {
  const result = analyzeBeam({
    span: 6,
    loads: [emitDescriptor({ type: 'profile', points: [{ x: 1, w: 2 }, { x: 5, w: 4 }] })],
    supports: pinRoller,
  });
  assert.equal(result.kind, 'beam-linear');
  const doc = makeFakeDoc();
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, result);
  assert.equal(roles(doc, 'region-start').length, 1);
  assert.equal(roles(doc, 'region-end').length, 1);
  assert.equal(roles(doc, 'profile-point').length, 0, 'renderm3 keys handles off the EMITTED kind');
});

// ---------------------------------------------------------------------------
// 3. app.js interaction layer against a fake DOM
// ---------------------------------------------------------------------------

test('app.js: point table wiring, add/remove/cap, emit rule, profile drag and keyboard', async () => {
  const ids = [
    'slider-pos', 'validation-msg', 'ctl-load', 'ctl-pos', 'ctl-presets',
    'ctl-region-start', 'ctl-region-end', 'ctl-w1', 'ctl-w2', 'ctl-points',
    'point-count', 'point-table', 'btn-add-cp', 'num-load', 'slider-load',
    'num-pos', 'num-region-start', 'slider-region-start', 'num-region-end',
    'slider-region-end', 'num-w1', 'slider-w1', 'num-w2', 'slider-w2',
    'num-span', 'slider-span', 'load-status', 'preset-chips', 'load-list',
    'load-count', 'btn-add-point', 'btn-add-distributed',
    'sel-support-left', 'sel-support-right',
    // M8 fixture nodes (E·I control + deflection panel svg) — fixture only;
    // no M7-era assertion in this file is touched.
    'ctl-ei', 'num-ei', 'slider-ei', 'ei-chips', 'defl-svg',
  ];
  const doc = makeFakeDoc(ids);

  const svg = doc.getElementById('beam-svg');
  svg.querySelector = (selector) => {
    const match = selector.match(/\[data-role="([^"]+)"\]\[data-point-index="(\d+)"\]/);
    return match ? svg.findAll((node) => node.attrs['data-role'] === match[1] && node.attrs['data-point-index'] === match[2])[0] ?? null : null;
  };
  svg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 300, y: 45 }) });
  svg.getScreenCTM = () => ({ inverse: () => ({}) });
  svg.setPointerCapture = () => {};
  svg.releasePointerCapture = () => {};
  doc.querySelectorAll = (sel) => {
    if (sel === '#load-list .load-row > button:first-child') {
      const wrap = doc.getElementById('load-list');
      return wrap.children.flatMap((row) =>
        row.children.filter((c) => c.nodeName === 'button' && !String(c.className).includes('load-remove')));
    }
    if (sel === '#preset-chips .preset-chip') return doc.getElementById('preset-chips').children;
    if (sel === '#point-table .point-row') return doc.getElementById('point-table').children;
    return [];
  };

  // app.js binds window-level pointer listeners.
  globalThis.window = {
    listeners: {},
    addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); },
    dispatchEvent(evt) { for (const fn of this.listeners[evt.type] ?? []) fn(evt); return true; },
  };

  globalThis.document = doc;
  await import('../ui/app.js'); // module boot wires everything against the fake doc

  const rowInputs = () => doc.getElementById('point-table').children.map((row) => ({
    x: Number(row.children[1].value),
    w: Number(row.children[2].value),
    rm: row.children[3],
  }));

  // The default state: one point load → point editor visible, table hidden.
  assert.equal(doc.getElementById('ctl-load').hidden, false);
  assert.equal(doc.getElementById('ctl-points').hidden, true);

  // Add a distributed load → two points → flat editor AND table visible;
  // the emitted descriptor is `linear` (frozen path — two equal intensities
  // over [1, 4] kN/m on L = 6 with P = 10 @ 3 m).
  doc.getElementById('btn-add-distributed').dispatchEvent({ type: 'click' });
  assert.equal(doc.getElementById('ctl-points').hidden, false);
  assert.equal(doc.getElementById('ctl-w1').hidden, false, 'two-point load keeps the flat editor');
  assert.equal(rowInputs().length, 2, 'two rows for two points');
  assert.ok(doc.getElementById('det-badge').textContent.includes('determinate'));

  // + Add point → 3 points → profile path: flat editor hides, cards update.
  doc.getElementById('btn-add-cp').dispatchEvent({ type: 'click' });
  assert.equal(rowInputs().length, 3);
  assert.equal(doc.getElementById('ctl-w1').hidden, true, 'flat editor steps aside for a profile');
  assert.equal(doc.getElementById('ctl-region-start').hidden, true);
  assert.equal(doc.getElementById('ctl-region-end').hidden, true);
  assert.equal(doc.getElementById('ctl-w2').hidden, true);
  assert.ok(doc.getElementById('validation-msg').hidden, 'engine accepts the emitted profile');

  // Cap: add to MAX_PROFILE_POINTS → button disables with a naming tooltip.
  while (rowInputs().length < MAX_PROFILE_POINTS) {
    doc.getElementById('btn-add-cp').dispatchEvent({ type: 'click' });
  }
  assert.equal(doc.getElementById('btn-add-cp').disabled, true, '+ Add point disabled at the cap');
  assert.ok(String(doc.getElementById('btn-add-cp').title).includes(`At most ${MAX_PROFILE_POINTS}`));

  // Remove a point → button re-enables.
  rowInputs()[5].rm.dispatchEvent({ type: 'click' });
  assert.equal(rowInputs().length, 5);
  assert.equal(doc.getElementById('btn-add-cp').disabled, false);

  // Remove down to two → remove buttons disable (never below two points).
  while (rowInputs().length > 2) {
    rowInputs()[rowInputs().length - 1].rm.dispatchEvent({ type: 'click' });
  }
  assert.equal(rowInputs()[0].rm.disabled, true, 'removal disabled at two points');

  // Stepped preset → profile path with a step; the band has a vertical edge.
  const steppedChip = doc.getElementById('preset-chips').children.find((b) => b.dataset.preset === 'stepped');
  steppedChip.dispatchEvent({ type: 'click' });
  assert.equal(rowInputs().length, 4);
  const polys = polygonsOf(doc);
  const stepPoly = polys.find((p) => {
    const xs = String(p.attrs.points).split(' ').map((s) => Number(s.split(',')[0]));
    for (let i = 1; i < xs.length - 1; i++) if (xs[i] === xs[i + 1]) return true;
    return false;
  });
  assert.ok(stepPoly, 'stepped preset draws a vertical step edge in the band');

  // Keyboard nudge: ArrowUp on a handle raises that point's intensity.
  const handle = svg.findAll((n) => n.attrs['data-role'] === 'profile-point')[1];
  assert.ok(handle, 'selected profile has handles');
  const wBefore = rowInputs()[1].w;
  svg.dispatchEvent({ type: 'keydown', key: 'ArrowUp', target: handle, preventDefault: () => {} });
  assert.equal(rowInputs()[1].w, Number(fmt(wBefore + 0.1)), 'ArrowUp raises the point intensity by 0.1 kN/m');

  // Pointer drag (the M6.5 lesson, extended): a synthesized pointerdown on
  // the handle + pointermove on window must move the dragged point.
  const dragHandle = svg.findAll((n) => n.attrs['data-role'] === 'profile-point')[0];
  const xBefore = rowInputs()[0].x;
  svg.dispatchEvent({
    type: 'pointerdown', target: dragHandle, pointerId: 3,
    clientX: 300, clientY: 45, preventDefault: () => {},
  });
  window.dispatchEvent({ type: 'pointermove', pointerId: 3, clientX: 340, clientY: 45 });
  window.dispatchEvent({ type: 'pointerup', pointerId: 3 });
  const xAfter = rowInputs()[0].x;
  assert.ok(xAfter > xBefore, `pointer drag moves the point (${xBefore} → ${xAfter})`);
  assert.ok(doc.getElementById('validation-msg').hidden, 'drag keeps the load valid');

  // Two-point regression: strip back to two points → emitted `linear` again
  // (the frozen solver's numbers, via app's own solveAndRender).
  while (rowInputs().length > 2) {
    rowInputs()[rowInputs().length - 1].rm.dispatchEvent({ type: 'click' });
  }
  const cards = doc.getElementById('result-cards').findAll((n) => n.className === 'card-value').map((n) => n.textContent);
  assert.ok(cards.length > 0, 'determinate two-point load produces result cards');
  assert.ok(doc.getElementById('det-badge').textContent.includes('determinate'));
});
