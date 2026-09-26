/**
 * ui-m9.test.js — result routing and accessible one-topic teaching dialog.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam } from '../src/analysis.js';
import { getTerm } from '../src/glossary.js';

class FakeNode {
  constructor(name, doc) {
    this.nodeName = name;
    this.ownerDocument = doc;
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.className = '';
    this.hidden = false;
    this.inert = false;
    this.disabled = false;
    this._text = '';
    this.parentNode = null;
    this.parentElement = null;
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = node.parentElement = this;
      node.ownerDocument = this.ownerDocument;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const node of this.children) node.parentNode = node.parentElement = null;
    this.children = [];
    this._text = '';
    this.append(...nodes);
  }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  dispatchEvent(event) {
    event.target ??= this;
    event.preventDefault ??= () => { event.defaultPrevented = true; };
    event.stopPropagation ??= () => { event.cancelBubble = true; };
    for (let node = this; node; node = node.parentNode) {
      for (const listener of node.listeners?.[event.type] ?? []) listener(event);
      if (event.cancelBubble) break;
    }
    if (!event.cancelBubble) {
      for (const listener of this.ownerDocument?.listeners?.[event.type] ?? []) listener(event);
    }
    return true;
  }
  click() { this.dispatchEvent({ type: 'click' }); }
  contains(target) { return target === this || this.children.some((child) => child.contains(target)); }
  querySelectorAll(selector) {
    const matches = (node) => selector.split(',').some((part) => {
      const s = part.trim();
      if (s.startsWith('button')) return node.nodeName === 'button' && !node.disabled;
      if (s.startsWith('a[href]')) return node.nodeName === 'a' && node.attrs.href;
      if (s.startsWith('input')) return node.nodeName === 'input' && !node.disabled;
      return s.startsWith('[tabindex]') && node.attrs.tabindex != null && node.attrs.tabindex !== '-1';
    });
    return this.findAll(matches).filter((node) => node !== this);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  set textContent(value) {
    this.replaceChildren();
    this._text = String(value);
  }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  get classList() {
    const node = this;
    const values = () => new Set(node.className.split(/\s+/).filter(Boolean));
    return {
      contains(name) { return values().has(name); },
      toggle(name, force) {
        const set = values();
        if (force === undefined ? !set.has(name) : force) set.add(name);
        else set.delete(name);
        node.className = [...set].join(' ');
      },
      add(name) { this.toggle(name, true); },
      remove(name) { this.toggle(name, false); },
    };
  }
  findAll(predicate, found = []) {
    if (predicate(this)) found.push(this);
    for (const child of this.children) child.findAll(predicate, found);
    return found;
  }
}

function makeFakeDoc() {
  const doc = {
    listeners: {},
    activeElement: null,
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); },
    createElement(name) { return new FakeNode(name, this); },
    createElementNS(_namespace, name) { return new FakeNode(name, this); },
    dispatch(type, event) {
      event.type = type;
      event.target ??= this;
      event.preventDefault ??= () => { event.defaultPrevented = true; };
      for (const listener of this.listeners[type] ?? []) listener(event);
    },
  };
  doc.body = new FakeNode('body', doc);
  doc.documentElement = new FakeNode('html', doc);
  const ids = ['beam-svg', 'sfd-svg', 'bmd-svg', 'defl-svg', 'det-badge', 'class-note', 'result-cards', 'eq-badge', 'lab-content'];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeNode('div', doc)]));
  const topbar = new FakeNode('header', doc);
  doc.body.append(topbar, elements['lab-content']);
  elements['lab-content'].inert = false;
  doc.getElementById = (id) => elements[id] ?? null;
  doc.querySelector = (selector) => selector === '.topbar' ? topbar : null;
  doc._elements = elements;
  doc._topbar = topbar;
  return doc;
}

const { renderM3 } = await import('../ui/renderm3.js');
const { initTeachingPopover } = await import('../ui/popover.js');
const pinRoller = { left: 'pin', right: 'roller' };

function boot(input) {
  const result = analyzeBeam(input);
  const doc = makeFakeDoc();
  globalThis.document = doc;
  renderM3(doc, { span: input.span, selectedLoad: 0, supports: input.supports }, result);
  return { doc, result };
}

const providers = { getGlossary: getTerm, getSteps: () => null };
const findByClass = (root, name) => root.findAll((node) => node.classList.contains(name))[0] ?? null;

test('solved result cards retain labels and expose their own teaching routes', () => {
  const { doc, result } = boot({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const cards = doc.getElementById('result-cards').children;
  const labels = cards.map((card) => card.children.find((node) => node.className === 'card-label').textContent);
  assert.deepEqual(labels, ['Reaction HA', 'Reaction VA', 'Reaction VB', 'Max bending moment', 'Max deflection']);
  assert.deepEqual(cards.map((card) => card.getAttribute('data-steps')), labels);
  assert.ok(cards.every((card) => card.getAttribute('tabindex') === '0' && card.getAttribute('role') === 'button'));
  assert.equal(result.reactions.left.Hx, 0);
});

test('unsolved cards and equilibrium status remain honest and accessible', () => {

  const { doc } = boot({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: { left: 'pin', right: 'pin' } });
  const cards = doc.getElementById('result-cards').children;
  assert.equal(cards.length, 2);
  assert.ok(cards.every((card) => card.getAttribute('data-term') === 'statically-indeterminate'));
  assert.equal(doc.getElementById('eq-badge').textContent, 'Not solved');
  assert.equal(doc.getElementById('eq-badge').getAttribute('tabindex'), '-1');  assert.match(doc.getElementById('eq-badge').getAttribute('aria-label'), /no equilibrium residuals/);
});

test('visible SVG terms and equilibrium control retain teaching cues', () => {

  const { doc } = boot({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const terms = (id) => doc.getElementById(id).findAll((node) => node.attrs['data-term']).map((node) => node.attrs['data-term']);
  assert.ok(terms('beam-svg').includes('point-load'));
  assert.ok(terms('beam-svg').includes('supports'));
  assert.ok(terms('beam-svg').includes('vertical-reaction'));
  assert.deepEqual([...new Set(terms('bmd-svg'))], ['maximum-moment']);
  assert.deepEqual([...new Set(terms('defl-svg'))].sort(), ['exaggeration', 'max-deflection']);
  assert.equal(doc.getElementById('eq-badge').getAttribute('aria-label'), 'Balanced. Activate to inspect the equilibrium residuals.');  assert.equal(doc.getElementById('eq-badge').getAttribute('tabindex'), '0');
});

test('activation opens one modal topic, inerts the background, and restores state on close', () => {

  const doc = makeFakeDoc();
  const api = initTeachingPopover(doc, providers);
  const trigger = new FakeNode('button', doc);
  trigger.setAttribute('data-term', 'pin-support');
  doc.body.append(trigger);
  trigger.focus();
  trigger.click();

  const backdrop = findByClass(doc.body, 'teaching-backdrop');
  const dialog = findByClass(backdrop, 'teaching-dialog');
  assert.equal(api.isOpen(), true);
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.getAttribute('aria-labelledby'), 'teaching-title');
  assert.equal(findByClass(dialog, 'teaching-title').textContent, getTerm('pin-support').term);
  assert.ok(findByClass(dialog, 'teaching-copy').textContent.includes('2 reaction unknowns'));
  assert.equal(dialog.findAll((node) => /chip|breadcrumb|topic-link/i.test(node.className)).length, 0);
  assert.equal(doc.getElementById('lab-content').inert, true);
  assert.equal(doc._topbar.inert, true);
  assert.equal(trigger.inert, true);
  assert.equal(doc.activeElement.getAttribute('aria-label'), 'Close explanation');
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');

  doc.dispatch('keydown', { key: 'Escape', target: doc.activeElement });
  assert.equal(api.isOpen(), false);
  assert.equal(doc.activeElement, trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(doc.getElementById('lab-content').inert, false);  assert.equal(doc._topbar.inert, false);
});

test('backdrop closes the same reusable dialog and restores preexisting inert state', () => {

  const doc = makeFakeDoc();
  const api = initTeachingPopover(doc, providers);
  const trigger = new FakeNode('button', doc);
  trigger.setAttribute('data-term', 'loads');
  doc.body.append(trigger);
  trigger.click();
  const backdrop = findByClass(doc.body, 'teaching-backdrop');
  doc._topbar.inert = true;
  backdrop.click();
  assert.equal(api.isOpen(), false);
  assert.equal(doc._topbar.inert, false);
  trigger.click();  assert.equal(doc.body.findAll((node) => node.classList.contains('teaching-dialog')).length, 1);
});

test('Enter opens a topic, Tab is trapped, and authored content is inserted as text', () => {

  const doc = makeFakeDoc();
  const api = initTeachingPopover(doc, providers);
  const trigger = new FakeNode('span', doc);
  trigger.setAttribute('data-term', 'bending-moment');
  doc.body.append(trigger);
  doc.dispatch('keydown', { key: 'Enter', target: trigger });
  assert.equal(api.isOpen(), true);
  const dialog = findByClass(doc.body, 'teaching-dialog');
  const close = findByClass(dialog, 'teaching-close');
  assert.ok(findByClass(dialog, 'teaching-copy').textContent.length > 40);
  doc.activeElement = trigger;
  const tab = { key: 'Tab', target: trigger, shiftKey: false, preventDefault() { this.defaultPrevented = true; } };
  doc.dispatch('keydown', tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(doc.activeElement, close);  assert.ok(dialog.findAll((node) => node.innerHTML !== undefined).length === 0);
});

test('unknown topics fail softly and non-activation keys do not open the dialog', () => {

  const doc = makeFakeDoc();
  const api = initTeachingPopover(doc, providers);
  const trigger = new FakeNode('span', doc);
  trigger.setAttribute('data-term', 'no-such-entry');
  doc.body.append(trigger);
  doc.dispatch('keydown', { key: 'h', target: trigger });
  trigger.click();  assert.equal(api.isOpen(), false);
});

test('app teaching provider is guarded for event-less fixture documents', async () => {

  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, '../ui/app.js'), 'utf8');
  assert.ok(src.includes("typeof document.addEventListener !== 'function'"));
});
