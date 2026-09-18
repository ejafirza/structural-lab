/**
 * UI smoke tests (Milestone 5, consolidated) — distributed-load rendering
 * against a minimal fake DOM.
 *
 * What these tests protect:
 *  1. The Results panel shows ONLY what the structure produces (reactions +
 *     Mmax). Load description — intensity w, resultant R, centroid x̄ — is
 *     rendered contextually ON the beam, not as result cards.
 *  2. Linear (partial / triangular / trapezoidal) loads draw region handles
 *     and no point handle.
 *  3. The engine documents boundary behaviour precisely (dV/dx = −w(x),
 *     dM/dx = V, C⁰ shear, C¹ moment).
 *  4. The UI layer contains no engineering formulas (static source guard).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyzeBeam } from '../src/analysis.js';

// --- minimal DOM shim ------------------------------------------------------

class FakeNode {
  constructor(name) {
    this.nodeName = name;
    this.children = [];
    this.attrs = {};
    this._text = '';
    this.className = '';
    this.hidden = false;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  findAll(pred, out = []) {
    if (pred(this)) out.push(this);
    for (const c of this.children) c.findAll(pred, out);
    return out;
  }
}

function makeFakeDoc() {
  const ids = ['beam-svg', 'sfd-svg', 'bmd-svg', 'det-badge', 'class-note', 'result-cards', 'eq-badge'];
  const byId = Object.fromEntries(ids.map((id) => [id, new FakeNode('div')]));
  return {
    getElementById: (id) => byId[id],
    createElementNS: (_ns, name) => new FakeNode(name),
    createElement: (name) => new FakeNode(name),
  };
}

globalThis.document = makeFakeDoc();
const { renderM3 } = await import('../ui/renderm3.js');

const cardValues = (doc) =>
  doc.getElementById('result-cards').findAll((n) => n.className === 'card-value').map((n) => n.textContent);
const cardLabels = (doc) =>
  doc.getElementById('result-cards').findAll((n) => n.className === 'card-label').map((n) => n.textContent);
const cardSubs = (doc) =>
  doc.getElementById('result-cards').findAll((n) => n.className === 'card-sub').map((n) => n.textContent);
const beamTexts = (doc) =>
  doc.getElementById('beam-svg').findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
const roles = (doc, role) =>
  doc.getElementById('beam-svg').findAll((n) => n.attrs['data-role'] === role);

// ---------------------------------------------------------------------------

test('partial UDL: R and x̄ contextual on the beam, not in Results', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, loadConcept: 'distributed', supports: { left: 'pin', right: 'roller' } };
  const result = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 2 }],
    supports: { left: 'pin', right: 'roller' },
  });
  renderM3(doc, state, result);

  assert.ok(doc.getElementById('det-badge').className.includes('determinate'));

  // Results panel: reactions + Mmax only.
  const values = cardValues(doc);
  assert.equal(values.filter((v) => v === '4 kN').length, 2, 'VA = VB = 4 kN');
  assert.ok(values.includes('8 kNm'), 'Mmax = 8 kNm');
  const labels = cardLabels(doc);
  assert.ok(!labels.some((l) => l.includes('Resultant')), 'no Resultant card');
  assert.ok(!labels.some((l) => l.includes('Centroid')), 'no Centroid card');
  assert.ok(!labels.some((l) => l.includes('intensity')), 'no intensity card');

  // Beam carries the load description.
  const bt = beamTexts(doc);
  assert.ok(bt.some((t) => t.includes('w = 2 kN/m')), 'intensity on the beam');
  assert.ok(bt.some((t) => t.includes('R = 8 kN')), 'resultant R = 8 kN on the beam');
  assert.ok(bt.some((t) => t.includes('x̄ = 3 m')), 'centroid x̄ = 3 m on the beam');

  // Region handles present, no point handle.
  assert.equal(roles(doc, 'region-start').length, 1, 'region start handle');
  assert.equal(roles(doc, 'region-end').length, 1, 'region end handle');
  assert.equal(roles(doc, 'load-handle').length, 0, 'no point handle');
});

test('triangular load: resultant/centroid and peak-side geometry on the beam', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, loadConcept: 'distributed', supports: { left: 'pin', right: 'roller' } };
  const result = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 0, end: 6, wStart: 6, wEnd: 0 }],
    supports: { left: 'pin', right: 'roller' },
  });
  renderM3(doc, state, result);

  const values = cardValues(doc);
  assert.ok(values.includes('12 kN'), 'RA = 12 kN');
  assert.ok(values.includes('6 kN'), 'RB = 6 kN');
  assert.ok(values.includes('13.9 kNm'), 'Mmax = 8√3 ≈ 13.9 kNm');

  const bt = beamTexts(doc);
  assert.ok(bt.some((t) => t.includes('w: 6 → 0 kN/m')), 'intensity range 6 → 0');
  assert.ok(bt.some((t) => t.includes('R = 18 kN')), 'resultant R = 18 kN');
  assert.ok(bt.some((t) => t.includes('x̄ = 2 m')), 'centroid x̄ = 2 m (peak on the left)');

  // Triangular shape = polygon (not rect)
  const polys = doc.getElementById('beam-svg').findAll((n) => n.nodeName === 'polygon');
  assert.ok(polys.length >= 1, 'triangular polygon drawn');
});

test('trapezoidal load: distinct endpoint intensities + R/x̄ on the beam', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, loadConcept: 'distributed', supports: { left: 'pin', right: 'roller' } };
  const result = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 0, end: 6, wStart: 2, wEnd: 4 }],
    supports: { left: 'pin', right: 'roller' },
  });
  renderM3(doc, state, result);

  const values = cardValues(doc);
  assert.ok(values.includes('8 kN'), 'RA = 8 kN');
  assert.ok(values.includes('10 kN'), 'RB = 10 kN');
  assert.ok(values.includes('13.5 kNm'), 'Mmax ≈ 13.5 kNm');

  const bt = beamTexts(doc);
  assert.ok(bt.some((t) => t.includes('w: 2 → 4 kN/m')), 'intensity range 2 → 4');
  assert.ok(bt.some((t) => t.includes('R = 18 kN')), 'resultant R = 18 kN');
  assert.ok(bt.some((t) => t.includes('x̄ = 3.33 m')), 'centroid x̄ = 10/3 ≈ 3.33 m');
  assert.ok(cardSubs(doc).some((t) => t.includes('sagging')));
});

test('linear indeterminate: classified, R/x̄ still on the beam, cards "–"', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, loadConcept: 'distributed', supports: { left: 'pin', right: 'pin' } };
  const result = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 2 }],
    supports: { left: 'pin', right: 'pin' },
  });
  renderM3(doc, state, result);

  assert.ok(doc.getElementById('det-badge').className.includes('indeterminate'));
  assert.equal(doc.getElementById('sfd-svg').findAll((n) => n.nodeName === 'polyline').length, 0);
  assert.ok(cardValues(doc).includes('–'));

  const bt = beamTexts(doc);
  assert.ok(bt.some((t) => t.includes('R = 8 kN')), 'resultant shown even when indeterminate');
  assert.ok(bt.some((t) => t.includes('x̄ = 3 m')), 'centroid shown even when indeterminate');
});

// ---------------------------------------------------------------------------

test('M4 UDL band preserved as a filled rect (regression)', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, loadConcept: 'distributed', supports: { left: 'pin', right: 'roller' } };
  const result = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: { left: 'pin', right: 'roller' } });
  renderM3(doc, state, result);
  const rects = doc.getElementById('beam-svg').findAll((n) => n.nodeName === 'rect' && n.attrs.fill);
  assert.ok(rects.length >= 1, 'UDL band drawn as a rect');
  assert.equal(roles(doc, 'load-handle').length, 0, 'no point handle for UDL');
});

// ---------------------------------------------------------------------------

test('engine documents boundary behaviour precisely (dV/dx = −w, dM/dx = V, C⁰/C¹)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, '../src/analysis.js'), 'utf8');
  assert.ok(src.includes('dM/dx = V'), 'documents dM/dx = V');
  assert.ok(src.includes('dV/dx'), 'documents dV/dx = −w(x)');
  assert.ok(src.includes('CONTINUOUS'), 'explicitly states continuity');
  assert.ok(src.includes('once-differentiable'), 'explicitly states C¹ moment');
  assert.ok(src.includes('smoothness'), 'names smoothness to distinguish it from C¹');
});

test('M5 UI layer contains no engineering formulas (static source guard)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const rel of ['../ui/renderm3.js', '../ui/app.js']) {
    const src = readFileSync(path.join(here, rel), 'utf8');
    const forbidden = [
      'w * L', 'w * x', 'w * (L', '(w *', 'w * L *',
      'x * (L', '(L - x)', 'L - x',
      '(wStart + wEnd)', 'wStart + 2', '2 * wEnd',
    ];
    for (const pattern of forbidden) {
      assert.ok(!src.includes(pattern), `${rel} must not contain engineering fragment "${pattern}"`);
    }
  }
});
