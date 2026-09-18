/**
 * UI smoke tests (Milestone 2) — run the renderers against a minimal fake DOM.
 *
 * What these tests protect:
 *  1. renderAll() consumes the ENGINE result and displays exactly the
 *     engine's numbers (no independent UI-side calculation).
 *  2. The diagrams are built from the engine's sampled arrays (point counts
 *     match), and the load handle / key markers exist.
 *  3. The UI layer contains no engineering formulas (static source guard).
 *
 * They do NOT test real pointer events / browser layout — those are covered
 * by the manual acceptance checklist (see README).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { solveSimplySupportedPointLoad } from '../src/engine.js';

// --- minimal DOM shim (only what render.js actually uses) -------------------

class FakeClassList {
  constructor() { this.set = new Set(); }
  toggle(cls, force) {
    if (force === undefined) { this.set.has(cls) ? this.set.delete(cls) : this.set.add(cls); }
    else if (force) { this.set.add(cls); } else { this.set.delete(cls); }
  }
  contains(cls) { return this.set.has(cls); }
}

class FakeNode {
  constructor(name) {
    this.nodeName = name;
    this.children = [];
    this.attrs = {};
    this._text = '';
    this.classList = new FakeClassList();
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  /** Depth-first search for nodes matching pred(node). */
  findAll(pred, out = []) {
    if (pred(this)) out.push(this);
    for (const c of this.children) c.findAll(pred, out);
    return out;
  }
}

function makeFakeDoc() {
  const ids = ['beam-svg', 'sfd-svg', 'bmd-svg', 'ro-ra', 'ro-rb', 'ro-mmax',
    'ro-xmmax', 'ro-a', 'ro-b', 'eq-badge'];
  const byId = Object.fromEntries(ids.map((id) => [id, new FakeNode('div')]));
  return {
    getElementById: (id) => byId[id],
    createElementNS: (_ns, name) => new FakeNode(name),
  };
}

// render.js uses the global `document` inside its helpers.
globalThis.document = makeFakeDoc();

// Import AFTER the global exists (defensive; helpers only run at call time).
const { renderAll } = await import('../ui/render.js');

// ----------------------------------------------------------------------------

test('renderAll displays exactly the engine numbers (reference case)', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, load: 10, position: 3 };
  const result = solveSimplySupportedPointLoad(state);
  renderAll(doc, state, result);

  assert.equal(doc.getElementById('ro-ra').textContent, '5 kN');
  assert.equal(doc.getElementById('ro-rb').textContent, '5 kN');
  assert.equal(doc.getElementById('ro-mmax').textContent, '15 kNm');
  assert.equal(doc.getElementById('ro-xmmax').textContent, 'at x = 3 m');
  assert.equal(doc.getElementById('ro-a').textContent, '3 m');
  assert.equal(doc.getElementById('ro-b').textContent, '3 m');
  assert.ok(doc.getElementById('eq-badge').textContent.includes('✓'));
  assert.ok(doc.getElementById('eq-badge').classList.contains('ok'));
});

test('renderAll tracks the engine when the load moves (drag simulation)', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, load: 10, position: 2 };   // as if dragged to x = 2
  const result = solveSimplySupportedPointLoad(state);
  renderAll(doc, state, result);

  assert.equal(doc.getElementById('ro-ra').textContent, '6.67 kN');
  assert.equal(doc.getElementById('ro-rb').textContent, '3.33 kN');
  assert.equal(doc.getElementById('ro-mmax').textContent, '13.3 kNm');
  assert.equal(doc.getElementById('ro-a').textContent, '2 m');
  assert.equal(doc.getElementById('ro-b').textContent, '4 m');
});

test('diagrams are plotted from the engine sample arrays', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, load: 10, position: 3, samples: 51 };
  const result = solveSimplySupportedPointLoad(state);
  renderAll(doc, state, result);

  const beam = doc.getElementById('beam-svg');
  const sfd = doc.getElementById('sfd-svg');
  const bmd = doc.getElementById('bmd-svg');

  // Load handle exists and is keyboard-focusable
  const handles = beam.findAll((n) => n.attrs['data-role'] === 'load-handle');
  assert.equal(handles.length, 1);
  assert.equal(handles[0].attrs.tabindex, '0');

  // SFD polyline has one point per engine shear sample (incl. the two-sided jump)
  const sfdLines = sfd.findAll((n) => n.nodeName === 'polyline');
  assert.equal(sfdLines.length, 1);
  const nPts = sfdLines[0].attrs.points.trim().split(/\s+/).length;
  assert.equal(nPts, result.diagrams.shear.length);

  // BMD polyline mirrors the engine moment samples
  const bmdLines = bmd.findAll((n) => n.nodeName === 'polyline');
  assert.equal(bmdLines.length, 1);
  const nPtsM = bmdLines[0].attrs.points.trim().split(/\s+/).length;
  assert.equal(nPtsM, result.diagrams.moment.length);

  // BMD peak marker exists (circle) and BMD carries the convention label
  assert.ok(bmd.findAll((n) => n.nodeName === 'circle').length >= 1);
  const labels = bmd.findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
  assert.ok(labels.some((t) => t.includes('tension side')), 'convention label present');
});

test('BMD is drawn tension-side-down: peak y is BELOW the axis y', () => {
  const doc = makeFakeDoc();
  const state = { span: 6, load: 10, position: 3 };
  const result = solveSimplySupportedPointLoad(state);
  renderAll(doc, state, result);

  const bmd = doc.getElementById('bmd-svg');
  // Axis line (M = 0): the first 'line' with stroke C.axis... simpler: the
  // axis is the line whose y1 === y2 and which spans the full beam width.
  const lines = bmd.findAll((n) => n.nodeName === 'line');
  const axis = lines.find((n) => {
    const a = n.attrs;
    return a.y1 === a.y2 && Number(a.x2) - Number(a.x1) > 400; // full-width horizontal
  });
  assert.ok(axis, 'axis line found');
  const axisY = Number(axis.attrs.y1);

  // Peak marker circle: the only circle in the BMD
  const peak = bmd.findAll((n) => n.nodeName === 'circle')[0];
  const peakY = Number(peak.attrs.cy);
  // Tension-side-down means larger SVG y (down) for positive moment.
  assert.ok(peakY > axisY, `peak y ${peakY} should be below axis y ${axisY}`);
});

test('UI layer contains no engineering formulas (static source guard)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const rel of ['../ui/render.js', '../ui/app.js']) {
    const src = readFileSync(path.join(here, rel), 'utf8');
    // Arithmetic fragments would indicate UI-side engineering math.
    // (Label templates like `Mmax = ${...}` are fine — they DISPLAY engine
    // values; they don't compute them.)
    const forbidden = ['P * b', 'P * a', 'RA * a', 'RB * b', 'RA + RB', 'RB * L',
      '* a * b', '(P *', 'P / L', '/ L;', 'a * b /'];
    for (const pattern of forbidden) {
      assert.ok(
        !src.includes(pattern),
        `${rel} must not contain engineering formula fragment "${pattern}"`
      );
    }
  }
});
