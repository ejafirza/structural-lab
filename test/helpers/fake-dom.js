// Shared fake-DOM test harness — one implementation instead of six copies.
//
// `FakeNode` supports everything the render/app/teaching tests need: attribute
// access, classList, dataset, event bubbling to the owner document, focus
// tracking, closest/querySelectorAll for the selectors the UI actually uses,
// and findAll for structural assertions. `makeDoc` builds a document whose
// getElementById map covers every id the app touches, preassembles the beam
// context menu, and (unlike the per-file copies) exposes body/documentElement/
// topbar plus createTextNode so popover code paths run against the same
// fixture. `bootApp` imports ui/app.js with a unique query string per boot —
// app.js is a module singleton per URL, so unique queries give fresh state.
export class FakeNode {
  constructor(name, doc = null) {
    this.nodeName = name;
    this.ownerDocument = doc;
    this.parentNode = null;
    this.parentElement = null;
    this.isConnected = true;
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
    this.inert = false;
    this._text = '';
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
  removeEventListener(type, listener) {
    const list = this.listeners[type];
    if (list) this.listeners[type] = list.filter((entry) => entry !== listener);
  }
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
  click() { return this.dispatchEvent({ type: 'click' }); }
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
    // Comma-separated simple selector (the dialog focusable list is the main
    // consumer): `button:not([disabled]), a[href], input:not([disabled]),
    // [tabindex]:not([tabindex="-1"])` plus the attribute selectors the UI uses.
    if (selector.includes(',')) {
      const matches = (node) => selector.split(',').some((part) => {
        const s = part.trim();
        if (s.startsWith('button')) return node.nodeName === 'button' && !node.disabled;
        if (s.startsWith('a[href]')) return node.nodeName === 'a' && node.attrs.href != null;
        if (s.startsWith('input')) return node.nodeName === 'input' && !node.disabled;
        if (s.startsWith('[tabindex]')) {
          const value = node.attrs.tabindex;
          return value != null && value !== '-1';
        }
        return false;
      });
      return this.findAll(matches).filter((node) => node !== this);
    }
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

// Text-only node (CharacterData stand-in) for createTextNode callers.
export class FakeText extends FakeNode {
  constructor(text, doc = null) {
    super('#text', doc);
    this._text = String(text);
  }
  set textContent(value) { this._text = String(value); }
  get textContent() { return this._text; }
}

const BASE_IDS = [
  'beam-svg', 'sfd-svg', 'bmd-svg', 'defl-svg', 'det-badge', 'class-note', 'result-cards', 'eq-badge',
  'slider-pos', 'validation-msg', 'ctl-load', 'ctl-pos', 'ctl-presets', 'ctl-region-start', 'ctl-region-end',
  'ctl-w1', 'ctl-w2', 'ctl-points', 'point-count', 'point-table', 'btn-add-cp', 'num-load', 'slider-load',
  'num-pos', 'num-region-start', 'slider-region-start', 'num-region-end', 'slider-region-end', 'num-w1',
  'slider-w1', 'num-w2', 'slider-w2', 'num-span', 'slider-span', 'load-status', 'preset-chips',
  'load-list', 'load-count', 'btn-add-point', 'btn-add-distributed', 'sel-support-left', 'sel-support-right',
  'ctl-ei', 'num-ei', 'slider-ei', 'ei-chips', 'model-panel', 'beam-context-menu', 'beam-context-title',
  'beam-context-point', 'beam-context-distributed', 'lab-content',
];

export function makeDoc({ extraIds = [] } = {}) {
  const doc = {
    listeners: {}, activeElement: null,
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); },
    removeEventListener(type, listener) {
      const list = this.listeners[type];
      if (list) this.listeners[type] = list.filter((entry) => entry !== listener);
    },
    dispatchEvent(event) {
      event.preventDefault ??= () => { event.defaultPrevented = true; };
      for (const listener of this.listeners[event.type] ?? []) listener(event);
      return !event.defaultPrevented;
    },
    createElement: (name) => new FakeNode(name, doc),
    createElementNS: (_namespace, name) => new FakeNode(name, doc),
    createTextNode: (text) => new FakeText(text, doc),
    // Convenience used by teaching-dialog tests: set the type then run the
    // document-level listeners directly.
    dispatch(type, event) {
      event.type = type;
      event.target ??= doc;
      event.preventDefault ??= () => { event.defaultPrevented = true; };
      for (const listener of doc.listeners[event.type] ?? []) listener(event);
    },
  };
  doc.body = new FakeNode('body', doc);
  doc.documentElement = new FakeNode('html', doc);
  const elements = Object.fromEntries([...BASE_IDS, ...extraIds].map((id) => [id, new FakeNode(id === 'beam-svg' ? 'svg' : 'div', doc)]));
  const topbar = new FakeNode('header', doc);
  doc.body.append(topbar, elements['lab-content']);
  elements['lab-content'].inert = false;
  doc.getElementById = (id) => elements[id] ?? null;
  doc.querySelector = (selector) => selector === '.topbar' ? topbar : null;
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
  doc._elements = elements;
  doc._topbar = topbar;
  elements['beam-context-menu'].hidden = true;
  const beam = elements['beam-svg'];
  beam.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return this; } });
  beam.getScreenCTM = () => ({ inverse: () => ({}) });
  elements['beam-context-menu'].append(elements['beam-context-title'], elements['beam-context-point'], elements['beam-context-distributed']);
  return { doc, elements };
}

let appBoot = 0;

export async function bootApp({ desktop = true, extraIds = [] } = {}) {
  const { doc, elements } = makeDoc({ extraIds });
  let isDesktop = desktop;
  globalThis.document = doc;
  globalThis.window = {
    innerWidth: 1280, innerHeight: 900, listeners: {},
    matchMedia: () => ({ matches: isDesktop }),
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); },
    dispatchEvent(event) { for (const listener of this.listeners[event.type] ?? []) listener(event); return true; },
  };
  await import(`../../ui/app.js?fake-dom-${++appBoot}`);
  return { doc, elements, setDesktop: (value) => { isDesktop = value; } };
}
