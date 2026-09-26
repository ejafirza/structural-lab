/**
 * ui-m9.test.js — UI tests for the M9 teaching layer (fake-DOM pattern).
 * -------------------------------------------------------------
 *   1. renderm3.js: solved cards carry data-steps doors; unsolved cards carry
 *      data-term doors; card LABEL text stays byte-identical to pre-M9
 *      (the annotation rule); SVG labels carry the planned data-terms.
 *   2. popover.js against a fake DOM: open on click, drill + breadcrumb,
 *      Escape close, one window only, aria-expanded tracking, content built
 *      without innerHTML.
 *   3. The deflection-panel lesson: popover init is optional in fake DOMs —
 *      app.js boots cleanly without document.addEventListener.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam } from '../src/analysis.js';
import { fmt } from '../ui/render.js';
import { getTerm } from '../src/glossary.js';

// --- minimal DOM shim (same pattern as ui-m7/ui-m8) --------------------------

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
    this.style = {};
    this.listeners = {};
    this.parentElement = null;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  append(...nodes) { for (const n of nodes) { this.children.push(n); n.parentElement = this; } }
  replaceChildren(...nodes) { for (const n of this.children) n.parentElement = null; this.children = [...nodes]; for (const n of nodes) n.parentElement = this; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({ target: this, preventDefault() {}, stopPropagation() {} }); }
  dispatchEvent(evt) { for (const fn of this.listeners[evt.type] ?? []) fn(evt); return true; }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() {}
  getBoundingClientRect() { return { left: 200, top: 200, right: 300, bottom: 240, width: 100, height: 40 }; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  get classList() {
    const self = this;
    return {
      toggle(cls, on) {
        const set = new Set(String(self.className).split(' ').filter(Boolean));
        if (on === undefined) { set.has(cls) ? set.delete(cls) : set.add(cls); }
        else if (on) set.add(cls); else set.delete(cls);
        self.className = [...set].join(' ');
      },
      add(cls) { this.toggle(cls, true); },
      remove(cls) { this.toggle(cls, false); },
      contains(cls) { return String(self.className).split(' ').includes(cls); },
    };
  }
  findAll(pred, out = []) {
    if (pred(this)) out.push(this);
    for (const c of this.children) c.findAll(pred, out);
    return out;
  }
}

function makeFakeDoc() {
  const ids = ['beam-svg', 'sfd-svg', 'bmd-svg', 'defl-svg', 'det-badge', 'class-note', 'result-cards', 'eq-badge'];
  const byId = Object.fromEntries(ids.map((id) => [id, new FakeNode('div')]));
  const doc = {
    getElementById: (id) => byId[id],
    createElementNS: (_ns, name) => new FakeNode(name),
    createElement: (name) => new FakeNode(name),
    body: new FakeNode('body'),
    documentElement: new FakeNode('html'),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  doc._byId = byId;
  return doc;
}

globalThis.document = makeFakeDoc();
const { renderM3 } = await import('../ui/renderm3.js');
const { initTeachingPopover } = await import('../ui/popover.js');

const pinRoller = { left: 'pin', right: 'roller' };

function boot(input, stateExtras = {}) {
  const result = analyzeBeam(input);
  const doc = makeFakeDoc();
  renderM3(doc, { span: input.span, selectedLoad: 0, supports: input.supports, ...stateExtras }, result);
  return { doc, result };
}

// --- 1. the card doors --------------------------------------------------------

test('solved cards carry data-steps doors; label text is byte-identical to pre-M9', () => {
  const { doc } = boot({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const cards = [...doc.getElementById('result-cards').children];
  assert.equal(cards.length, 5, '2 reactions + Mmax + deflection + second reaction');
  const labels = cards.map((c) => c.children.find((n) => n.className === 'card-label').textContent);
  assert.deepEqual(labels, ['Reaction HA', 'Reaction VA', 'Reaction VB', 'Max bending moment', 'Max deflection'],
    'card labels unchanged by M9 (the annotation rule; HA-first is the pre-M9 order)');
  for (const c of cards) {
    assert.ok(c.getAttribute('data-steps'), 'every solved card is a derivation door');
    assert.equal(c.getAttribute('tabindex'), '0');
    assert.equal(c.getAttribute('role'), 'button');
  }
});

test('unsolved cards carry a data-term door explaining why, with unchanged labels', () => {
  const { doc } = boot({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: { left: 'pin', right: 'pin' } });
  const cards = [...doc.getElementById('result-cards').children];
  assert.equal(cards.length, 2);
  for (const c of cards) {
    assert.equal(c.getAttribute('data-term'), 'statically-indeterminate');
    const label = c.children.find((n) => n.className === 'card-label').textContent;
    assert.ok(['Reactions', 'Max bending moment'].includes(label), 'label unchanged');
    const sub = c.children.find((n) => n.className === 'card-sub');
    assert.ok(sub && sub.textContent.includes('not solved by statics'), 'honesty sub preserved');
  }
});

test('SVG labels carry exactly the planned data-terms', () => {
  const { doc } = boot({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const terms = doc.getElementById('beam-svg').findAll((n) => n.attrs['data-term']).map((n) => n.attrs['data-term']);
  assert.deepEqual([...new Set(terms)], ['vertical-reaction'],
    'lone point load: reaction label only (the combined R/x̄ is deliberately suppressed for a lone point load — pre-M6 rule)');
  // A distributed load draws the combined resultant → the centroid term appears.
  const { doc: docU } = boot({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: pinRoller });
  const udlTerms = docU.getElementById('beam-svg').findAll((n) => n.attrs['data-term']).map((n) => n.attrs['data-term']);
  assert.deepEqual([...new Set(udlTerms)].sort(), ['centroid', 'vertical-reaction'], 'UDL beam: resultant centroid + reaction terms');
  const bmdTerms = doc.getElementById('bmd-svg').findAll((n) => n.attrs['data-term']).map((n) => n.attrs['data-term']);
  assert.deepEqual([...new Set(bmdTerms)], ['maximum-moment']);
  const deflTerms = doc.getElementById('defl-svg').findAll((n) => n.attrs['data-term']).map((n) => n.attrs['data-term']);
  assert.deepEqual([...new Set(deflTerms)].sort(), ['exaggeration', 'max-deflection']);
  // Cantilever adds the wall-moment arrow term.
  const { doc: doc2 } = boot({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: { left: 'fixed', right: 'free' } });
  const beamTerms = doc2.getElementById('beam-svg').findAll((n) => n.attrs['data-term']).map((n) => n.attrs['data-term']);
  assert.ok(beamTerms.includes('moment-reaction'), 'cantilever wall moment teaches the moment reaction');
});

// --- 2. the popover against a fake DOM ----------------------------------------

function makePopoverDoc() {
  const doc = makeFakeDoc();
  doc.addEventListener = (type, fn) => { (doc.listeners[type] ??= []).push(fn); };
  doc.listeners = {};
  return doc;
}

const providers = {
  getGlossary: (key) => getTerm(key),
  getSteps: () => null,
};

test('popover: click opens the glossary entry, chips drill, back walks the breadcrumb', () => {
  const doc = makePopoverDoc();
  const api = initTeachingPopover(doc, providers);
  assert.equal(api.isOpen(), false, 'starts closed');

  const trigger = new FakeNode('span');
  trigger.setAttribute('data-term', 'pin-support');
  doc.body.append(trigger);
  const click = doc.listeners.click[0];
  click({ target: trigger, preventDefault() {} });

  assert.equal(api.isOpen(), true, 'open after click');
  const isWin = (n) => n.classList.contains('popover');
  const win = doc.body.children.find(isWin);
  assert.ok(win, 'window exists');
  assert.equal(win.getAttribute('role'), 'dialog');
  assert.equal(win._els.title.textContent, getTerm('pin-support').term);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.ok(win._els.path.textContent.includes('Pin support'), 'breadcrumb shows the entry');

  // Drill into a sub chip.
  const chip = win._els.chips.children.find((c) => c.textContent === getTerm('vertical-reaction').term);
  assert.ok(chip, 'vertical-reaction chip offered');
  chip.click();
  assert.equal(win._els.title.textContent, getTerm('vertical-reaction').term);
  assert.equal(win._els.back.hidden, false, 'back button visible after drilling');
  assert.ok(win._els.path.textContent.includes('›'), 'breadcrumb shows the trail');
  win._els.back.click();
  assert.equal(win._els.title.textContent, getTerm('pin-support').term, 'back returns to the parent');
});

test('popover: Escape closes, click-outside closes, only one window ever exists', () => {
  const doc = makePopoverDoc();
  const api = initTeachingPopover(doc, providers);
  const trigger = new FakeNode('span');
  trigger.setAttribute('data-term', 'loads');
  doc.body.append(trigger);
  const click = doc.listeners.click[0];
  const key = doc.listeners.keydown[0];

  click({ target: trigger, preventDefault() {} });
  const win = doc.body.children.find((n) => n.classList.contains('popover'));
  key({ key: 'Escape', target: trigger, preventDefault() {} });
  assert.equal(api.isOpen(), false, 'Escape closes');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');

  click({ target: trigger, preventDefault() {} });
  assert.equal(doc.body.findAll((n) => n.classList.contains('popover')).length, 1, 'still exactly one window');
  // Click outside (not on a trigger, not in the window).
  const elsewhere = new FakeNode('div');
  click({ target: elsewhere, preventDefault() {} });
  assert.equal(api.isOpen(), false, 'click outside closes');

  // Reopening reuses the same node.
  click({ target: trigger, preventDefault() {} });
  assert.equal(doc.body.children.filter((n) => n.classList.contains('popover')).length, 1, 'no window accumulation');
  void win;
});

test('popover: keyboard Enter opens, content is built without innerHTML', () => {
  const doc = makePopoverDoc();
  const api = initTeachingPopover(doc, providers);
  const trigger = new FakeNode('span');
  trigger.setAttribute('data-term', 'bending-moment');
  doc.body.append(trigger);
  const key = doc.listeners.keydown[0];
  key({ key: 'Enter', target: trigger, preventDefault() {} });
  assert.equal(api.isOpen(), true, 'Enter opens');
  const win = doc.body.children.find((n) => n.classList.contains('popover'));
  assert.ok(win._els.body.textContent.length > 40, 'body text present');
  for (const n of win.findAll(() => true)) {
    assert.equal(typeof n.innerHTML, 'undefined', 'no innerHTML anywhere in the window');
  }
});

test('popover: unknown terms and missing providers fail soft (window never opens)', () => {
  const doc = makePopoverDoc();
  const api = initTeachingPopover(doc, providers);
  const trigger = new FakeNode('span');
  trigger.setAttribute('data-term', 'no-such-entry');
  doc.body.append(trigger);
  doc.listeners.click[0]({ target: trigger, preventDefault() {} });
  assert.equal(api.isOpen(), false, 'unknown term does not open a window');
});

// --- 3. app.js boots with the teaching layer bound only where events exist ----

test('app.js source: teaching init is guarded for event-less fake DOMs', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, '../ui/app.js'), 'utf8');
  assert.ok(src.includes('initTeaching'), 'teaching init exists');
  assert.ok(src.includes("typeof document.addEventListener !== 'function'"),
    'guarded — the ui-m7/m8 fake-DOM fixtures have no document.addEventListener');
});
