import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam, DEFAULT_EI } from '../src/analysis.js';
import { fmt, makeXMap } from '../ui/render.js';

class FakeNode {
  constructor(name, doc = null) {
    this.nodeName = name;
    this.ownerDocument = doc;
    this.parentNode = null;
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.title = '';
    this._text = '';
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      node.ownerDocument = this.ownerDocument;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const node of this.children) node.parentNode = null;
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
    return !event.defaultPrevented;
  }

  closest(selector) {
    if (!selector.startsWith('[') || !selector.endsWith(']')) return null;
    const [name, rawValue] = selector.slice(1, -1).split('=');
    const value = rawValue?.replaceAll('"', '');
    for (let node = this; node; node = node.parentNode) {
      if (node.attrs[name] != null && (value == null || node.attrs[name] === value)) return node;
    }
    return null;
  }
  contains(target) { return target === this || this.children.some((child) => child.contains(target)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    if (selector === 'button') return this.findAll((node) => node !== this && node.nodeName === 'button');
    if (!selector.startsWith('[') || !selector.endsWith(']')) return [];
    const [name, rawValue] = selector.slice(1, -1).split('=');
    const value = rawValue?.replaceAll('"', '');
    return this.findAll((node) => node !== this && node.attrs[name] != null
      && (value == null || node.attrs[name] === value));
  }
  getBoundingClientRect() { return { width: 206, height: 116 }; }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  setPointerCapture() {}
  releasePointerCapture() {}
  get classList() {
    const node = this;
    const classes = () => new Set(node.className.split(/\s+/).filter(Boolean));
    return {
      toggle(name, force) {
        const set = classes();
        if (force === undefined ? !set.has(name) : force) set.add(name);
        else set.delete(name);
        node.className = [...set].join(' ');
      },
      add(name) { this.toggle(name, true); },
      remove(name) { this.toggle(name, false); },
      contains(name) { return classes().has(name); },
    };
  }
  set textContent(value) { this.children = []; this._text = String(value); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  findAll(predicate, out = []) {
    if (predicate(this)) out.push(this);
    for (const child of this.children) child.findAll(predicate, out);
    return out;
  }
}

function makeDoc(extraIds = []) {
  const ids = [
    'beam-svg', 'sfd-svg', 'bmd-svg', 'defl-svg', 'det-badge', 'class-note', 'result-cards', 'eq-badge',
    'slider-pos', 'validation-msg', 'ctl-load', 'ctl-pos', 'ctl-presets', 'ctl-region-start', 'ctl-region-end',
    'ctl-w1', 'ctl-w2', 'ctl-points', 'point-count', 'point-table', 'btn-add-cp', 'num-load', 'slider-load',
    'num-pos', 'num-region-start', 'slider-region-start', 'num-region-end', 'slider-region-end', 'num-w1',
    'slider-w1', 'num-w2', 'slider-w2', 'num-span', 'slider-span', 'load-status', 'preset-chips',
    'load-list', 'load-count', 'btn-add-point', 'btn-add-distributed', 'sel-support-left', 'sel-support-right',
    'ctl-ei', 'num-ei', 'slider-ei', 'ei-chips', 'model-panel', 'beam-context-menu', 'beam-context-title',
    'beam-context-point', 'beam-context-distributed', ...extraIds,
  ];
  const doc = {
    listeners: {}, activeElement: null,
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); },
    dispatchEvent(event) {
      event.preventDefault ??= () => { event.defaultPrevented = true; };
      for (const listener of this.listeners[event.type] ?? []) listener(event);
      return !event.defaultPrevented;
    },
    createElement: (name) => new FakeNode(name, doc),
    createElementNS: (_namespace, name) => new FakeNode(name, doc),
  };
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeNode(id === 'beam-svg' ? 'svg' : 'div', doc)]));
  doc.getElementById = (id) => elements[id] ?? null;
  doc.querySelector = () => null;
  doc.querySelectorAll = (selector) => {
    if (selector === '#load-list .load-row > button:first-child') {
      return elements['load-list'].children.flatMap((row) => row.children.filter((child) => child.nodeName === 'button' && child.className !== 'load-remove'));
    }
    const [root, suffix] = selector.split(' ');
    if (suffix === '.preset-chip') return elements[root.slice(1)].children;
    if (suffix === '.point-row') return elements[root.slice(1)].children;
    if (!suffix?.startsWith('[')) return [];
    const [name, rawValue] = suffix.slice(1, -1).split('=');
    const value = rawValue?.replaceAll('"', '');
    return elements[root.slice(1)].findAll((node) => node.attrs[name] != null
      && (value == null || node.attrs[name] === value));
  };
  elements['beam-context-menu'].hidden = true;
  const beam = elements['beam-svg'];
  beam.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return this; } });
  beam.getScreenCTM = () => ({ inverse: () => ({}) });
  elements['beam-context-menu'].append(elements['beam-context-title'], elements['beam-context-point'], elements['beam-context-distributed']);
  return { doc, elements };
}

globalThis.document = makeDoc().doc;
const { renderM3 } = await import('../ui/renderm3.js');
const pinRoller = { left: 'pin', right: 'roller' };
let appBoot = 0;

async function bootApp({ desktop = true } = {}) {
  const { doc, elements } = makeDoc();
  let isDesktop = desktop;
  globalThis.document = doc;
  globalThis.window = {
    innerWidth: 1280, innerHeight: 900, listeners: {},
    matchMedia: () => ({ matches: isDesktop }),
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); },
    dispatchEvent(event) { for (const listener of this.listeners[event.type] ?? []) listener(event); return true; },
  };
  await import(`../ui/app.js?ui-m8-${++appBoot}`);
  return { doc, elements, setDesktop: (value) => { isDesktop = value; } };
}

const supportControl = (beam, side) => beam.querySelectorAll('[data-role="support-toggle"]')
  .find((node) => node.getAttribute('data-support-side') === side);
const resultDeflection = (elements) => Number(elements['result-cards'].findAll((node) =>
  node.className === 'card-value' && node.textContent.endsWith('mm'))[0].textContent.replace(' mm', ''));
const openContextMenu = (beam, x, y = 880) => {
  const event = { type: 'contextmenu', clientX: x, clientY: y, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; } };
  beam.dispatchEvent(event);
  return event;
};

const stiffness = (elements) => elements['num-ei'].value;

test('deflection drawing is based on engine samples and reports the true deflection', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const { doc } = makeDoc();
  globalThis.document = doc;
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, result);
  const curve = doc.getElementById('defl-svg').findAll((node) => node.nodeName === 'polyline');
  assert.equal(curve.length, 1);
  assert.equal(curve[0].attrs.points.split(' ').length, result.deflection.v.length);
  const labels = doc.getElementById('defl-svg').findAll((node) => node.nodeName === 'text').map((node) => node.textContent);
  assert.ok(labels.some((text) => text.includes(`${fmt(result.deflection.max.value * 1000)} mm`) && text.includes('exaggerated')));
  assert.ok(labels.some((text) => text.startsWith('vₘₐₓ = ')));
  const moment = doc.getElementById('bmd-svg').findAll((node) => node.nodeName === 'text');
  assert.ok(moment.some((node) => node.textContent.startsWith('Mₘₐₓ = ') && node.textContent.includes('kN·m')));
});

test('E·I presets, logarithmic slider, deflection response, and visibility remain linked', async () => {
  const { elements } = await bootApp();
  const chip = (id) => elements['ei-chips'].children.find((button) => button.dataset.preset === id);
  assert.equal(elements['ctl-ei'].hidden, false);
  assert.equal(stiffness(elements), fmt(DEFAULT_EI));
  chip('steel').dispatchEvent({ type: 'click' });
  assert.equal(stiffness(elements), fmt(1.8e4));
  assert.equal(chip('steel').classList.contains('active'), true);
  elements['num-ei'].value = '12345';
  elements['num-ei'].dispatchEvent({ type: 'input' });
  assert.equal(chip('steel').classList.contains('active'), false);

  const slider = elements['slider-ei'];
  slider.value = '4';
  slider.dispatchEvent({ type: 'input', target: slider });
  assert.equal(stiffness(elements), fmt(1e4));
  const before = resultDeflection(elements);
  slider.value = String(Math.log10(5000));
  slider.dispatchEvent({ type: 'input', target: slider });
  assert.ok(resultDeflection(elements) > before, 'lower stiffness produces greater deflection');

  for (const [support, hidden] of [['pin', true], ['roller', false]]) {
    elements['sel-support-right'].value = support;
    elements['sel-support-right'].dispatchEvent({ type: 'change', target: elements['sel-support-right'] });
    assert.equal(elements['ctl-ei'].hidden, hidden);
  }
});

test('support controls cycle by click/keyboard and reflect selector changes', async () => {
  const { doc, elements } = await bootApp();
  const beam = elements['beam-svg'];
  for (const [side, key, expected] of [
    ['left', 'click', 'roller'], ['right', 'Enter', 'fixed'], ['right', ' ', 'free'], ['right', 'click', 'pin'],
  ]) {
    const control = supportControl(beam, side);
    assert.equal(control.getAttribute('role'), 'button');
    assert.equal(control.getAttribute('tabindex'), '0');
    control.dispatchEvent(key === 'click' ? { type: 'click' } : { type: 'keydown', key });
    const updated = supportControl(beam, side);
    assert.equal(elements[`sel-support-${side}`].value, expected);
    assert.ok(updated.getAttribute('aria-label').includes(`currently ${expected}`));
    if (key !== 'click') assert.equal(doc.activeElement, updated);
  }
  for (const [side, value] of [['left', 'fixed'], ['left', 'pin'], ['right', 'roller']]) {
    elements[`sel-support-${side}`].value = value;
    elements[`sel-support-${side}`].dispatchEvent({ type: 'change', target: elements[`sel-support-${side}`] });
    assert.ok(supportControl(beam, side).getAttribute('aria-label').includes(`currently ${value}`));
  }
});

test('dragging a beam load handle updates its position', async () => {
  const { elements } = await bootApp();
  const beam = elements['beam-svg'];
  const map = makeXMap({ span: 6 });
  const handle = beam.findAll((node) => node.getAttribute('data-role') === 'load-handle')[0];
  handle.dispatchEvent({ type: 'pointerdown', pointerId: 7, clientX: map.toPx(3), clientY: 40 });
  window.dispatchEvent({ type: 'pointermove', pointerId: 7, clientX: map.toPx(4.2), clientY: 40 });
  window.dispatchEvent({ type: 'pointerup', pointerId: 7 });
  assert.ok(Math.abs(Number(elements['num-pos'].value) - 4.2) < 0.02);
});

test('desktop context chooser stays in bounds and dismisses on Escape or outside click', async () => {
  const { doc, elements, setDesktop } = await bootApp({ desktop: false });
  const beam = elements['beam-svg'];
  const menu = elements['beam-context-menu'];
  const x = makeXMap({ span: 6 }).toPx(2.4);
  assert.equal(openContextMenu(beam, x).defaultPrevented, false, 'mobile keeps the browser menu');
  assert.equal(menu.hidden, true);

  setDesktop(true);
  openContextMenu(beam, x);
  assert.equal(menu.hidden, false);
  assert.equal(elements['beam-context-title'].textContent, `Add a load at x = ${fmt(2.4)} m`);
  openContextMenu(beam, 1279, 899);
  const { width, height } = menu.getBoundingClientRect();
  assert.ok(Number.parseFloat(menu.style.left) + width <= 1272);
  assert.ok(Number.parseFloat(menu.style.top) + height <= 892);
  const escape = { type: 'keydown', key: 'Escape', target: elements['beam-context-point'] };
  doc.dispatchEvent(escape);
  assert.equal(menu.hidden, true);
  assert.equal(doc.activeElement, beam);

  openContextMenu(beam, x);
  doc.dispatchEvent({ type: 'click', target: elements['num-span'] });
  assert.equal(menu.hidden, true);
});

test('context chooser adds point and distributed loads through the existing editor', async () => {
  const { elements } = await bootApp();
  const beam = elements['beam-svg'];
  const menu = elements['beam-context-menu'];
  const map = makeXMap({ span: 6 });
  openContextMenu(beam, map.toPx(2.4));
  elements['beam-context-point'].dispatchEvent({ type: 'click' });
  assert.equal(elements['load-count'].textContent, '2 loads');
  assert.equal(elements['model-panel'].open, true);
  assert.equal(Number(elements['num-pos'].value), Number(fmt(2.4)));
  assert.equal(menu.hidden, true);

  openContextMenu(beam, map.toPx(3));
  elements['beam-context-distributed'].dispatchEvent({ type: 'click' });
  assert.equal(elements['load-count'].textContent, '3 loads');
  assert.equal(elements['ctl-load'].hidden, true);
  assert.equal(menu.hidden, true);
});

test('span controls normalize, clamp, and recover blank input', async () => {
  const { elements } = await bootApp();
  const number = elements['num-span'];
  const slider = elements['slider-span'];
  assert.equal(number.value, '6');
  assert.equal(slider.value, '6');
  number.value = '8.05';
  number.dispatchEvent({ type: 'input' });
  assert.equal(number.value, '8.1');
  assert.equal(slider.value, '8.1');
  number.value = '';
  number.dispatchEvent({ type: 'blur' });
  assert.equal(number.value, '8.1');
  slider.value = '9.2';
  slider.dispatchEvent({ type: 'input' });
  assert.equal(number.value, '9.2');

  for (const [raw, expected] of [['0', '1'], ['20.05', '20']]) {
    number.value = raw;
    number.dispatchEvent({ type: 'input' });
    assert.equal(number.value, expected);
    assert.equal(slider.value, expected);
  }
});
