/**
 * UI smoke tests (Milestone 3) — renderm3.js against a minimal fake DOM.
 *
 * What these tests protect:
 *  1. renderM3() consumes the analyzeBeam result and displays exactly the
 *     engine's numbers (reactions, max moment, sign).
 *  2. The determinacy badge + classification note reflect the engine's
 *     classification; indeterminate/unstable cases show NO diagrams.
 *  3. The BMD tension-side convention is honoured: sagging BELOW the axis,
 *     hogging ABOVE the axis, with the sign labeled.
 *  4. The M3 UI layer contains no engineering formulas (static source guard).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyzeBeam } from '../src/analysis.js';
import { makeDoc } from './helpers/fake-dom.js';

// --- minimal DOM shim (shared: test/helpers/fake-dom.js) --------------------

function makeFakeDoc() {
  return makeDoc().doc;
}

globalThis.document = makeFakeDoc();
const { renderM3 } = await import('../ui/renderm3.js');

// --- helpers ---------------------------------------------------------------

const cardValues = (doc) =>
  doc.getElementById('result-cards').findAll((n) => n.className === 'card-value').map((n) => n.textContent);
const cardSubs = (doc) =>
  doc.getElementById('result-cards').findAll((n) => n.className === 'card-sub').map((n) => n.textContent);

function bmdAxisY(doc) {
  const bmd = doc.getElementById('bmd-svg');
  const axis = bmd.findAll((n) => n.nodeName === 'line')
    .find((n) => n.attrs.y1 === n.attrs.y2 && Number(n.attrs.x2) - Number(n.attrs.x1) > 400);
  assert.ok(axis, 'BMD axis line found');
  return Number(axis.attrs.y1);
}

function bmdPeakY(doc) {
  const bmd = doc.getElementById('bmd-svg');
  const peak = bmd.findAll((n) => n.nodeName === 'circle')[0];
  assert.ok(peak, 'BMD peak circle found');
  return Number(peak.attrs.cy);
}

// ---------------------------------------------------------------------------

test('renderM3 shows determinate pin+roller: reactions + sagging Mmax below axis', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, load: 10, position: 3, supports: { left: 'pin', right: 'roller' } };
  const result = analyzeBeam(state);
  renderM3(doc, state, result);

  const badge = doc.getElementById('det-badge');
  assert.ok(badge.className.includes('determinate'), 'badge is determinate');
  assert.ok(badge.textContent.includes('determinate'));

  const values = cardValues(doc);
  assert.ok(values.includes('0 kN'), 'HA = 0 (pin horizontal reaction, no horizontal load)');
  assert.equal(values.filter((v) => v === '5 kN').length, 2, 'V_A and V_B both 5 kN');
  assert.ok(values.includes('15 kN·m'), 'Mₘₐₓ = 15 kN·m');
  const reactionTexts = doc.getElementById('beam-svg').findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
  assert.ok(reactionTexts.includes('VA = 5 kN'), 'V_A rendered (textContent = semantic form)');
  assert.ok(reactionTexts.includes('VB = 5 kN'), 'V_B rendered');
  assert.ok(cardSubs(doc).some((t) => t.includes('sagging')), 'Mmax labeled sagging');

  // Load handle present and focusable
  const beam = doc.getElementById('beam-svg');
  const handles = beam.findAll((n) => n.attrs['data-role'] === 'load-handle');
  assert.equal(handles.length, 1);
  assert.equal(handles[0].attrs.tabindex, '0');

  // SFD polyline mirrors engine shear samples
  const sfd = doc.getElementById('sfd-svg');
  const sfdPoly = sfd.findAll((n) => n.nodeName === 'polyline');
  assert.equal(sfdPoly.length, 1);
  assert.equal(sfdPoly[0].attrs.points.trim().split(/\s+/).length, result.diagrams.shear.length);

  // Sagging: peak BELOW the axis
  assert.ok(bmdPeakY(doc) > bmdAxisY(doc), 'sagging peak drawn below the axis');

  assert.ok(doc.getElementById('eq-badge').textContent.includes('✓'));
  assert.ok(doc.getElementById('eq-badge').className.includes('ok'));
});

test('renderM3 shows cantilever: hogging Mmax ABOVE the axis, sign labeled', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, load: 10, position: 2, supports: { left: 'fixed', right: 'free' } };
  const result = analyzeBeam(state);
  renderM3(doc, state, result);

  const values = cardValues(doc);
  assert.ok(values.includes('10 kN'), 'VA = P = 10 kN');
  assert.ok(values.includes('20 kN·m'), 'M_A = P·a = 20 kN·m');
  const reactionTexts = doc.getElementById('beam-svg').findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
  assert.ok(reactionTexts.includes('VA = 10 kN'));
  assert.ok(reactionTexts.includes('MA = 20 kN·m'));
  assert.ok(cardSubs(doc).some((t) => t.includes('hogging')), 'Mₘₐₓ labeled hogging');

  // Hogging: peak ABOVE the axis (tension side up)
  assert.ok(bmdPeakY(doc) < bmdAxisY(doc), 'hogging peak drawn above the axis');

  const bmdTexts = doc.getElementById('bmd-svg')
    .findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
  assert.ok(bmdTexts.some((t) => t.includes('hogging')), 'BMD text labels the hogging sign');
});

test('renderM3 classifies indeterminate without drawing diagrams', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, load: 10, position: 3, supports: { left: 'pin', right: 'pin' } };
  const result = analyzeBeam(state);
  renderM3(doc, state, result);

  assert.equal(result.classification.status, 'indeterminate');
  assert.ok(doc.getElementById('det-badge').className.includes('indeterminate'));

  const note = doc.getElementById('class-note');
  assert.equal(note.hidden, false, 'classification note is visible');
  assert.ok(note.textContent.length > 0);

  // No diagrams fabricated
  assert.equal(doc.getElementById('sfd-svg').findAll((n) => n.nodeName === 'polyline').length, 0);
  assert.equal(doc.getElementById('bmd-svg').findAll((n) => n.nodeName === 'polyline').length, 0);
  assert.ok(cardValues(doc).includes('–'), 'reactions/moment shown as not-solved');

  assert.ok(doc.getElementById('eq-badge').className.includes('neutral'));
});

test('renderM3 classifies unstable and names the mechanism', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, load: 10, position: 3, supports: { left: 'free', right: 'free' } };
  const result = analyzeBeam(state);
  renderM3(doc, state, result);

  assert.equal(result.classification.status, 'unstable');
  assert.ok(doc.getElementById('det-badge').className.includes('unstable'));

  const note = doc.getElementById('class-note');
  assert.equal(note.hidden, false);
  assert.ok(note.textContent.includes('Unrestrained motion'), 'names the free motion');
  assert.equal(doc.getElementById('bmd-svg').findAll((n) => n.nodeName === 'polyline').length, 0);
});

test('M3 UI layer contains no engineering formulas (static source guard)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const rel of ['../ui/renderm3.js', '../ui/app.js']) {
    const src = readFileSync(path.join(here, rel), 'utf8');
    const forbidden = [
      'P * b', 'P * a', 'RA * a', 'RB * b', 'RA + RB', 'RB * L',
      '* a * b', '(P *', 'P / L', '/ L;', 'a * b /', 'x - a',
      'x <= a', 'x >= a', 'RA * x', 'RB * (L',
    ];
    for (const pattern of forbidden) {
      assert.ok(!src.includes(pattern), `${rel} must not contain engineering fragment "${pattern}"`);
    }
  }
});
