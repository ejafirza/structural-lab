/**
 * UI smoke tests (Milestone 4) — UDL rendering against a minimal fake DOM.
 *
 * What these tests protect:
 *  1. renderM3() renders a UDL result with reactions + Mmax in the Results
 *     panel, and the load description (intensity w, resultant R, centroid x̄)
 *     ON THE BEAM — not as result cards.
 *  2. The beam shows a distributed band (not a draggable point handle) for UDL.
 *  3. The BMD tension-side convention holds for UDL too (sagging below /
 *     hogging above).
 *  4. The M4 UI layer contains no engineering formulas (static source guard).
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
const cardSubs = (doc) =>
  doc.getElementById('result-cards').findAll((n) => n.className === 'card-sub').map((n) => n.textContent);
const beamTexts = (doc) =>
  doc.getElementById('beam-svg').findAll((n) => n.nodeName === 'text').map((n) => n.textContent);

function bmdAxisY(doc) {
  const axis = doc.getElementById('bmd-svg').findAll((n) => n.nodeName === 'line')
    .find((n) => n.attrs.y1 === n.attrs.y2 && Number(n.attrs.x2) - Number(n.attrs.x1) > 400);
  assert.ok(axis, 'BMD axis line found');
  return Number(axis.attrs.y1);
}
function bmdPeakY(doc) {
  const peak = doc.getElementById('bmd-svg').findAll((n) => n.nodeName === 'circle')[0];
  assert.ok(peak, 'BMD peak circle found');
  return Number(peak.attrs.cy);
}

// ---------------------------------------------------------------------------

test('UDL simply supported: reactions+Mmax in Results, w/R/x̄ on the beam', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, loadConcept: 'distributed', supports: { left: 'pin', right: 'roller' } };
  const result = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: { left: 'pin', right: 'roller' } });
  renderM3(doc, state, result);

  assert.ok(doc.getElementById('det-badge').className.includes('determinate'));

  // Results panel: reactions + Mmax only.
  const values = cardValues(doc);
  assert.equal(values.filter((v) => v === '6 kN').length, 2, 'VA = VB = 6 kN');
  assert.ok(values.includes('9 kNm'), 'Mmax = wL²/8 = 9 kNm');
  assert.ok(cardSubs(doc).some((t) => t.includes('sagging')), 'Mmax labeled sagging');
  assert.ok(!values.includes('2 kN/m'), 'intensity is not a result card');
  assert.ok(!values.includes('12 kN'), 'resultant is not a result card');

  // Beam carries the load description (intensity, resultant, centroid).
  const bt = beamTexts(doc);
  assert.ok(bt.some((t) => t.includes('w = 2 kN/m')), 'intensity w on the beam');
  assert.ok(bt.some((t) => t.includes('R = 12 kN')), 'resultant R = w·L = 12 kN on the beam');
  assert.ok(bt.some((t) => t.includes('x̄ = 3 m')), 'centroid x̄ = L/2 = 3 m on the beam');

  // Distributed band (rect) present, draggable point handle absent
  const beam = doc.getElementById('beam-svg');
  assert.ok(beam.findAll((n) => n.nodeName === 'rect' && n.attrs.fill).length >= 1, 'UDL band drawn');
  assert.equal(beam.findAll((n) => n.attrs['data-role'] === 'load-handle').length, 0, 'no point handle for UDL');

  // SFD polyline mirrors engine shear samples
  const sfd = doc.getElementById('sfd-svg');
  const sfdPoly = sfd.findAll((n) => n.nodeName === 'polyline');
  assert.equal(sfdPoly.length, 1);
  assert.equal(sfdPoly[0].attrs.points.trim().split(/\s+/).length, result.diagrams.shear.length);

  // Sagging: peak below axis
  assert.ok(bmdPeakY(doc) > bmdAxisY(doc), 'UDL sagging peak below the axis');
});

test('UDL cantilever: hogging Mmax above the axis, sign labeled', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, loadConcept: 'distributed', supports: { left: 'fixed', right: 'free' } };
  const result = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: { left: 'fixed', right: 'free' } });
  renderM3(doc, state, result);

  const values = cardValues(doc);
  assert.ok(values.includes('12 kN'), 'VA = wL = 12 kN');
  assert.equal(values.filter((v) => v === '36 kNm').length, 2, 'MA and Mmax both 36 kNm');
  assert.ok(cardSubs(doc).some((t) => t.includes('hogging')), 'Mmax labeled hogging');

  assert.ok(bmdPeakY(doc) < bmdAxisY(doc), 'UDL hogging peak above the axis');
  const bmdTexts = doc.getElementById('bmd-svg').findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
  assert.ok(bmdTexts.some((t) => t.includes('hogging')), 'BMD labels hogging');
});

test('UDL indeterminate: classified, resultant/centroid still on the beam', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, loadConcept: 'distributed', supports: { left: 'pin', right: 'pin' } };
  const result = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: { left: 'pin', right: 'pin' } });
  renderM3(doc, state, result);

  assert.ok(doc.getElementById('det-badge').className.includes('indeterminate'));
  assert.equal(doc.getElementById('sfd-svg').findAll((n) => n.nodeName === 'polyline').length, 0);
  assert.equal(doc.getElementById('bmd-svg').findAll((n) => n.nodeName === 'polyline').length, 0);

  const values = cardValues(doc);
  assert.ok(values.includes('–'), 'reactions/moment shown as not-solved');

  // Load properties are still shown on the beam even when indeterminate.
  const bt = beamTexts(doc);
  assert.ok(bt.some((t) => t.includes('R = 12 kN')), 'resultant still shown for indeterminate UDL');
  assert.ok(bt.some((t) => t.includes('x̄ = 3 m')), 'centroid still shown for indeterminate UDL');
});

test('M4 UI layer contains no engineering formulas (static source guard)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const rel of ['../ui/renderm3.js', '../ui/app.js']) {
    const src = readFileSync(path.join(here, rel), 'utf8');
    const forbidden = [
      'w * L', 'w * x', 'w * (L', '(w *', 'w * L *',
      'x * (L', '(L - x)', 'L - x',
    ];
    for (const pattern of forbidden) {
      assert.ok(!src.includes(pattern), `${rel} must not contain engineering fragment "${pattern}"`);
    }
  }
});
