/**
 * UI render tests (Milestone 6) — multi-load rendering against the fake DOM.
 *
 * What these tests protect:
 *  1. Every load is drawn from its own descriptor with a circled number that
 *     ties it to its load-list row; drag handles exist ONLY on the selected
 *     load.
 *  2. The combined resultant R, x̄ is drawn once (the whole load group's
 *     equivalent single force) — contextual on the beam, never as cards.
 *  3. The Results panel still shows only what the structure produces.
 *  4. The combined SFD labels the end shears; the BMD peak comes from the
 *     engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam } from '../src/analysis.js';
import { makeDoc } from './helpers/fake-dom.js';

// --- minimal DOM shim (shared: test/helpers/fake-dom.js) --------------------

function makeFakeDoc() {
  return makeDoc().doc;
}

globalThis.document = makeFakeDoc();
const { renderM3 } = await import('../ui/renderm3.js');

const cardValues = (doc) =>
  doc.getElementById('result-cards').findAll((n) => n.className === 'card-value').map((n) => n.textContent);
const cardLabels = (doc) =>
  doc.getElementById('result-cards').findAll((n) => n.className === 'card-label').map((n) => n.textContent);
const beamTexts = (doc) =>
  doc.getElementById('beam-svg').findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
const roles = (doc, role) =>
  doc.getElementById('beam-svg').findAll((n) => n.attrs['data-role'] === role);
const loadGroups = (doc) =>
  // Wrapper groups carry data-load-index WITHOUT a data-role (handle groups
  // carry both and are counted via roles()).
  doc.getElementById('beam-svg').findAll((n) => n.attrs['data-load-index'] != null && n.attrs['data-role'] == null);
const sfdTexts = (doc) =>
  doc.getElementById('sfd-svg').findAll((n) => n.nodeName === 'text').map((n) => n.textContent);

const pinRoller = { left: 'pin', right: 'roller' };

// Case A of plan-m6.md §8: point 10 kN at 2 + full UDL 2 kN/m, L = 6.
const caseA = {
  span: 6,
  loads: [
    { type: 'point', magnitude: 10, position: 2 },
    { type: 'udl', intensity: 2 },
  ],
  supports: pinRoller,
};

// ---------------------------------------------------------------------------

test('multi-load beam: per-load labels with circled numbers, combined R/x̄ once', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, selectedLoad: 0, supports: pinRoller };
  const result = analyzeBeam(caseA);
  renderM3(doc, state, result);

  const bt = beamTexts(doc);
  assert.ok(bt.some((t) => t.includes('① P = 10 kN')), 'load 1 label: ① P = 10 kN');
  assert.ok(bt.some((t) => t.includes('② w = 2 kN/m')), 'load 2 label: ② w = 2 kN/m (uniform → =-style label)');
  const rTexts = bt.filter((t) => t.includes('R ='));
  assert.equal(rTexts.length, 1, 'exactly one combined R label');
  assert.ok(rTexts[0].includes('R = 22 kN'), 'combined R = 22 kN');
  assert.ok(bt.some((t) => t.includes('x̄ = 2.55 m')), 'combined x̄ = 28/11 ≈ 2.55 m');

  assert.equal(loadGroups(doc).length, 2, 'two load groups (one per descriptor)');

  // Results panel: structure output only — no per-load description cards.
  const values = cardValues(doc);
  assert.ok(values.includes('12.7 kN'), 'RA = 38/3 ≈ 12.7 kN');
  assert.ok(values.includes('9.33 kN'), 'RB = 28/3 ≈ 9.33 kN');
  assert.ok(values.includes('21.3 kN·m'), 'Mmax = 64/3 ≈ 21.3 kN·m');
  const labels = cardLabels(doc);
  assert.ok(!labels.some((l) => l.includes('Resultant') || l.includes('Centroid') || l.includes('intensity')));
});

test('handles follow the selection: point selected → point handle; distributed selected → region handles', () => {
  const result = analyzeBeam(caseA);

  const docPoint = makeFakeDoc();
  renderM3(docPoint, { span: 6, selectedLoad: 0, supports: pinRoller }, result);
  assert.equal(roles(docPoint, 'load-handle').length, 1, 'point handle on load 0');
  assert.equal(roles(docPoint, 'region-start').length, 0, 'no region handles');
  // Attribution by containment: the handle lives INSIDE load 0's wrapper.
  const wrapper0 = loadGroups(docPoint).find((n) => n.attrs['data-load-index'] === '0');
  assert.equal(wrapper0.findAll((n) => n.attrs['data-role'] === 'load-handle').length, 1,
    'point handle nested in the load-0 wrapper');

  const docDist = makeFakeDoc();
  renderM3(docDist, { span: 6, selectedLoad: 1, supports: pinRoller }, result);
  assert.equal(roles(docDist, 'load-handle').length, 0, 'no point handle');
  // Case A's second load is a full-span `udl` — uniform loads have no region
  // handles (only `linear` descriptors do). Handles-exist is proven by the
  // three-load test with a `linear` selected.
  assert.equal(roles(docDist, 'region-start').length, 0, 'udl has no region handles');
});

test('selected load is drawn last (handles on top for hit-testing)', () => {
  const result = analyzeBeam(caseA);
  const doc = makeFakeDoc();
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, result);
  const order = loadGroups(doc).map((n) => n.attrs['data-load-index']);
  assert.equal(order[order.length - 1], '0', 'selected load 0 appended last');
});

test('three loads: numbering follows list order; only load 2 (index 1) has handles', () => {
  const loads = [
    { type: 'point', magnitude: 6, position: 2 },
    { type: 'linear', start: 3, end: 6, wStart: 1, wEnd: 1 },
    { type: 'point', magnitude: 2, position: 5 },
  ];
  const result = analyzeBeam({ span: 6, loads, supports: pinRoller });
  const doc = makeFakeDoc();
  renderM3(doc, { span: 6, selectedLoad: 1, supports: pinRoller }, result);

  const bt = beamTexts(doc);
  assert.ok(bt.some((t) => t.includes('① P = 6 kN')));
  assert.ok(bt.some((t) => t.includes('② w = 1 kN/m')), 'uniform linear → =-style label');
  assert.ok(bt.some((t) => t.includes('③ P = 2 kN')));

  assert.equal(roles(doc, 'region-start').length, 1);
  // Attribution by containment: the region handles live INSIDE load 1's wrapper.
  const wrapper1 = loadGroups(doc).find((n) => n.attrs['data-load-index'] === '1');
  assert.equal(wrapper1.findAll((n) => n.attrs['data-role'] === 'region-start').length, 1,
    'region-start nested in the load-1 wrapper');
  assert.equal(wrapper1.findAll((n) => n.attrs['data-role'] === 'region-end').length, 1,
    'region-end nested in the load-1 wrapper');
  assert.equal(roles(doc, 'load-handle').length, 0);
  assert.equal(loadGroups(doc).length, 3);
});

test('combined SFD labels the end shears; combined BMD labels the engine peak', () => {
  const result = analyzeBeam(caseA);
  const doc = makeFakeDoc();
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, result);

  const st = sfdTexts(doc);
  assert.ok(st.some((t) => t.includes('+12.7 kN')), 'V(0⁺) = +38/3 ≈ +12.7 kN labeled');
  assert.ok(st.some((t) => t.includes('-9.33 kN')), 'V(L⁻) = −28/3 ≈ −9.33 kN labeled');

  const bmd = doc.getElementById('bmd-svg').findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
  assert.ok(bmd.some((t) => t.includes('Mₘₐₓ = 21.3 kN·m') && t.includes('at x = 2 m')), 'engine peak labeled');
});

test('multi-load x-axis stays uncluttered: 0, peak x*, L', () => {
  const result = analyzeBeam(caseA);
  const doc = makeFakeDoc();
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, result);
  const axis = doc.getElementById('sfd-svg').findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
  assert.ok(axis.some((t) => t === 'x* = 2 m'), 'peak marker x* on the axis');
  assert.ok(!axis.some((t) => t.startsWith('x₁')), 'no per-load region labels on the SFD axis');
});

test('indeterminate multi-load: cards "–", combined R/x̄ still on the beam', () => {
  const result = analyzeBeam({ ...caseA, supports: { left: 'pin', right: 'pin' } });
  const doc = makeFakeDoc();
  renderM3(doc, { span: 6, selectedLoad: 0, supports: { left: 'pin', right: 'pin' } }, result);

  assert.ok(doc.getElementById('det-badge').className.includes('indeterminate'));
  assert.ok(cardValues(doc).includes('–'));
  const bt = beamTexts(doc);
  assert.ok(bt.some((t) => t.includes('R = 22 kN')), 'combined resultant is a load property');
  assert.ok(bt.some((t) => t.includes('x̄ = 2.55 m')));
});

test('single-load regression: default point beam is byte-identical in label content', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const doc = makeFakeDoc();
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, result);

  const bt = beamTexts(doc);
  assert.ok(bt.some((t) => t.includes('P = 10 kN') && t.includes('①')), 'numbered point label');
  assert.ok(bt.some((t) => t.includes('a = 3 m')), 'a/b dimensions preserved');
  assert.ok(bt.some((t) => t.includes('b = 3 m')));
  assert.equal(roles(doc, 'load-handle').length, 1);
  assert.equal(loadGroups(doc).length, 1);
});
