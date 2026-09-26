/**
 * ui-m8.test.js — UI tests for the deflection panel (Milestone 8).
 * ---------------------------------------------------------------------------
 * Two layers, following the ui-m5..m7 patterns:
 *   1. render tests against the fake DOM (renderm3.js): the elastic-curve
 *      polyline mirrors the engine's sampled v array; the exaggeration note
 *      carries the true mm value; the max marker sits at the engine's
 *      position; indeterminate/unstable get the placeholder.
 *   2. the E·I control wiring in app.js: chips set the value (and highlight
 *      only while matching), the number field and log-slider drive it, and
 *      the control hides for non-determinate beams.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam, DEFAULT_EI } from '../src/analysis.js';
import { fmt } from '../ui/render.js';

// --- minimal DOM shim (same pattern as ui-m7) -------------------------------

class FakeNode {
  constructor(name) {
    this.nodeName = name;
    this.children = [];
    this.attrs = {};
    this._text = '';
    this.className = '';
    this.hidden = false;
    this.dataset = {};
    this.value = '';
    this.disabled = false;
    this.title = '';
    this.listeners = {};
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatchEvent(evt) { for (const fn of this.listeners[evt.type] ?? []) fn(evt); return true; }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  get classList() {
    const self = this;
    return {
      toggle(cls, on) {
        const set = new Set(String(self.className).split(' ').filter(Boolean));
        if (on) set.add(cls); else set.delete(cls);
        self.className = [...set].join(' ');
      },
      add(cls) { this.toggle(cls, true); },
      remove(cls) { this.toggle(cls, false); },
    };
  }
  focus() {}
  findAll(pred, out = []) {
    if (pred(this)) out.push(this);
    for (const c of this.children) c.findAll(pred, out);
    return out;
  }
}

function makeFakeDoc(extraIds = []) {
  const ids = ['beam-svg', 'sfd-svg', 'bmd-svg', 'defl-svg', 'det-badge', 'class-note', 'result-cards', 'eq-badge', ...extraIds];
  const byId = Object.fromEntries(ids.map((id) => [id, new FakeNode('div')]));
  const doc = {
    getElementById: (id) => byId[id],
    createElementNS: (_ns, name) => new FakeNode(name),
    createElement: (name) => new FakeNode(name),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  doc._byId = byId;
  return doc;
}

globalThis.document = makeFakeDoc();
const { renderM3 } = await import('../ui/renderm3.js');

const pinRoller = { left: 'pin', right: 'roller' };

test('deflection panel: curve mirrors the engine samples, note carries the true mm value, marker at the engine max', () => {
  const result = analyzeBeam({
    span: 6,
    loads: [{ type: 'point', magnitude: 10, position: 3 }],
    supports: pinRoller,
  });
  const doc = makeFakeDoc();
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, result);

  const svg = doc.getElementById('defl-svg');
  const polylines = svg.findAll((n) => n.nodeName === 'polyline');
  assert.equal(polylines.length, 1, 'one elastic-curve polyline');
  const points = String(polylines[0].attrs.points).split(' ');
  assert.equal(points.length, result.deflection.v.length, 'one vertex per engine sample');

  const texts = svg.findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
  const mm = fmt(result.deflection.max.value * 1000);
  assert.ok(
    texts.some((t) => t.includes(`${mm} mm`) && t.includes('exaggerated')),
    `note carries true mm value and the exaggeration wording (looking for ${mm} mm)`
  );
  assert.ok(texts.some((t) => t.includes(`vmax = ${mm} mm`)), 'max-sag label present');

  const circles = svg.findAll((n) => n.nodeName === 'circle' && n.attrs.stroke === '#ffffff');
  assert.equal(circles.length, 1, 'one max-sag marker dot');
});

test('deflection card joins the results panel with mm value, position and EI', () => {
  const result = analyzeBeam({
    span: 6,
    loads: [{ type: 'udl', intensity: 2 }],
    supports: pinRoller,
  });
  const doc = makeFakeDoc();
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, result);
  const cards = doc.getElementById('result-cards').findAll((n) => n.className === 'card');
  const defl = cards.find((c) => c.children.some((k) => k.className === 'card-label' && k.textContent === 'Max deflection'));
  assert.ok(defl, 'Max deflection card exists');
  const value = defl.children.find((k) => k.className === 'card-value').textContent;
  const sub = defl.children.find((k) => k.className === 'card-sub').textContent;
  assert.ok(value.endsWith('mm'), `card value in mm (got ${value})`);
  assert.ok(value.includes(fmt(result.deflection.max.value * 1000)), 'card value matches the engine');
  assert.ok(sub.includes(fmt(result.deflection.EI)), 'card sub carries E·I');
});

test('indeterminate and unstable: placeholder in the deflection panel, no deflection card', () => {
  for (const supports of [{ left: 'pin', right: 'pin' }, { left: 'free', right: 'free' }]) {
    const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports });
    const doc = makeFakeDoc();
    renderM3(doc, { span: 6, selectedLoad: 0, supports }, result);
    const texts = doc.getElementById('defl-svg').findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
    assert.ok(texts.some((t) => t.toLowerCase().includes('not solved')), `placeholder shown for ${supports.right}`);
    const labels = doc.getElementById('result-cards').findAll((n) => n.className === 'card-label').map((n) => n.textContent);
    assert.ok(!labels.includes('Max deflection'), 'no deflection card');
  }
});

// --- app.js E·I wiring against the fake DOM ---------------------------------

test('app.js: E·I chips set the value, highlight while matching, log-slider drives EI, control hides when indeterminate', async () => {
  const ids = [
    'slider-pos', 'validation-msg', 'ctl-load', 'ctl-pos', 'ctl-presets',
    'ctl-region-start', 'ctl-region-end', 'ctl-w1', 'ctl-w2', 'ctl-points',
    'point-count', 'point-table', 'btn-add-cp', 'num-load', 'slider-load',
    'num-pos', 'num-region-start', 'slider-region-start', 'num-region-end',
    'slider-region-end', 'num-w1', 'slider-w1', 'num-w2', 'slider-w2',
    'num-span', 'slider-span', 'load-status', 'preset-chips', 'load-list',
    'load-count', 'btn-add-point', 'btn-add-distributed',
    'sel-support-left', 'sel-support-right',
    'ctl-ei', 'num-ei', 'slider-ei', 'ei-chips', 'defl-svg',
  ];
  const doc = makeFakeDoc(ids);
  doc.querySelectorAll = (sel) => {
    if (sel === '#load-list .load-row > button:first-child') {
      const wrap = doc.getElementById('load-list');
      return wrap.children.flatMap((row) =>
        row.children.filter((c) => c.nodeName === 'button' && !String(c.className).includes('load-remove')));
    }
    if (sel === '#preset-chips .preset-chip') return doc.getElementById('preset-chips').children;
    if (sel === '#point-table .point-row') return doc.getElementById('point-table').children;
    if (sel === '#ei-chips .preset-chip') return doc.getElementById('ei-chips').children;
    return [];
  };
  globalThis.window = {
    listeners: {},
    addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); },
    dispatchEvent(evt) { for (const fn of this.listeners[evt.type] ?? []) fn(evt); return true; },
  };
  globalThis.document = doc;
  await import('../ui/app.js');

  // Default: control visible (default beam is determinate), EI = DEFAULT_EI.
  assert.equal(doc.getElementById('ctl-ei').hidden, false);
  assert.equal(doc.getElementById('num-ei').value, fmt(DEFAULT_EI));

  // Steel chip → EI = 1.8e4; chip becomes active.
  const steel = doc.getElementById('ei-chips').children.find((b) => b.dataset.preset === 'steel');
  steel.dispatchEvent({ type: 'click' });
  assert.equal(doc.getElementById('num-ei').value, fmt(1.8e4));
  assert.ok(String(steel.className).includes('active'), 'chip highlights while matching');

  // Custom value via the number field → the chip clears.
  const num = doc.getElementById('num-ei');
  num.value = '12345';
  num.dispatchEvent({ type: 'input' });
  assert.ok(!String(steel.className).includes('active'), 'chip clears on custom value');
  assert.equal(doc.getElementById('num-ei').value, fmt(12345));

  // Log slider: mid-range (log10 = 4) → 10⁴.
  const slider = doc.getElementById('slider-ei');
  slider.value = '4';
  slider.dispatchEvent({ type: 'input', target: slider });
  assert.equal(doc.getElementById('num-ei').value, fmt(1e4));

  // Half the stiffness → double the sag, live (engine re-solve through app).
  const sagBefore = doc.getElementById('result-cards')
    .findAll((n) => n.className === 'card-value').map((n) => n.textContent)
    .find((t) => t.endsWith('mm'));
  slider.value = String(Math.log10(5000));
  slider.dispatchEvent({ type: 'input', target: slider });
  const sagAfter = doc.getElementById('result-cards')
    .findAll((n) => n.className === 'card-value').map((n) => n.textContent)
    .find((t) => t.endsWith('mm'));
  assert.ok(Number(sagAfter.replace(' mm', '')) > Number(sagBefore.replace(' mm', '')),
    `smaller E·I sags more (${sagBefore} → ${sagAfter})`);

  // Indeterminate beam → control hides; determinate again → it returns.
  doc.getElementById('sel-support-right').value = 'pin';
  doc.getElementById('sel-support-right').dispatchEvent({ type: 'change', target: doc.getElementById('sel-support-right') });
  assert.equal(doc.getElementById('ctl-ei').hidden, true, 'control hidden for pin+pin');
  doc.getElementById('sel-support-right').value = 'roller';
  doc.getElementById('sel-support-right').dispatchEvent({ type: 'change', target: doc.getElementById('sel-support-right') });
  assert.equal(doc.getElementById('ctl-ei').hidden, false, 'control returns for pin+roller');
});
