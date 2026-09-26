/**
 * ui-m10.test.js — M10 shell contracts without changing the engineering model.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyzeBeam } from '../src/analysis.js';
import { fmt } from '../ui/render.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, rel), 'utf8');
const pinRoller = { left: 'pin', right: 'roller' };

class Node {
  constructor(name) { this.nodeName = name; this.children = []; this.attrs = {}; this._text = ''; this.className = ''; this.hidden = false; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  findAll(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.findAll(pred, out); return out; }
}

function makeDoc() {
  const ids = ['beam-svg', 'sfd-svg', 'bmd-svg', 'defl-svg', 'det-badge', 'class-note', 'result-cards', 'eq-badge'];
  const byId = Object.fromEntries(ids.map((id) => [id, new Node(id.endsWith('svg') ? 'svg' : 'div')]));
  return {
    getElementById: (id) => byId[id],
    createElement: (name) => new Node(name),
    createElementNS: (_ns, name) => new Node(name),
  };
}

globalThis.document = makeDoc();
const { renderM3 } = await import('../ui/renderm3.js');

test('desktop shell uses named two-column areas and stacks in a mobile reading order', () => {
  const html = read('../ui/index.html');
  const css = read('../ui/style.css');
  assert.match(css, /grid-template-columns:\s*minmax\(280px,\s*340px\)\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /"model results"[\s\S]*"model beam"[\s\S]*"model shear"[\s\S]*"model moment"[\s\S]*"model deflection"/);
  assert.match(css, /@media\s*\(max-width:\s*980px\)/);
  assert.match(css, /"model"[\s\S]*"results"[\s\S]*"beam"[\s\S]*"shear"[\s\S]*"moment"[\s\S]*"deflection"/);
  assert.match(html, /id="theme-toggle"/);
  for (const id of ['beam-svg', 'sfd-svg', 'bmd-svg', 'defl-svg']) assert.ok(html.includes(`id="${id}"`));
});

test('Model is an open native disclosure and existing controls are still inside it', () => {
  const html = read('../ui/index.html');
  assert.match(html, /<details id="model-panel"[^>]*open/);
  assert.match(html, /<summary class="model-summary">[\s\S]*id="load-count"/);
  const start = html.indexOf('<details id="model-panel"');
  const end = html.indexOf('</details>', start);
  const disclosure = html.slice(start, end);
  for (const id of ['load-list', 'num-span', 'num-load', 'num-pos', 'num-ei', 'sel-support-left', 'sel-support-right', 'point-table', 'btn-add-point', 'btn-add-distributed']) {
    assert.ok(disclosure.includes(`id="${id}"`), `${id} remains in the Model disclosure`);
  }
});

test('equilibrium explanation stays in Results with its live status and M9 trigger', () => {
  const html = read('../ui/index.html');
  const resultsStart = html.indexOf('<section class="panel readouts"');
  const resultsEnd = html.indexOf('</section>', resultsStart);
  const results = html.slice(resultsStart, resultsEnd);
  assert.ok(results.includes('id="eq-badge"'));
  assert.match(results, /id="eq-badge"[^>]*role="status"[^>]*aria-live="polite"[^>]*data-term="equilibrium-check"[^>]*tabindex="0"/);
  assert.equal((html.match(/id="eq-badge"/g) ?? []).length, 1);
});

test('theme logic is isolated from beam state and storage contains only the appearance setting', () => {
  const theme = read('../ui/theme.js');
  const app = read('../ui/app.js');
  assert.match(theme, /structural-lab\.theme/);
  assert.match(theme, /prefers-color-scheme:\s*dark/);
  assert.ok(!theme.includes('analyzeBeam'));
  assert.ok(!theme.includes('localStorage.setItem(') || theme.includes('setItem(THEME_STORAGE_KEY, mode)'));
  assert.ok(app.includes("import { initTheme } from './theme.js'"));
  assert.ok(app.includes('initTheme(document)'));
});

test('M10 label trim keeps units, sign conventions, true deflection scale and disclaimer', () => {
  const html = read('../ui/index.html');
  for (const text of ['positive plots up', 'sagging (+) below, hogging (−) above', 'Shape exaggerated; true value shown', 'Educational tool — not a professional design-verification system', 'ΣFx = 0', 'ΣFy = 0', 'ΣM = 0']) {
    assert.ok(html.includes(text), `key academic explanation retained: ${text}`);
  }
  const { doc } = renderReferencePointBeam();
  const renderedLabels = doc.getElementById('result-cards').children
    .map((card) => card.children.find((child) => child.className === 'card-label').textContent);
  assert.deepEqual(renderedLabels, ['Reaction HA', 'Reaction VA', 'Reaction VB', 'Max bending moment', 'Max deflection'],
    'M9 derivation card labels remain unchanged');
});

test('live SVG palette references CSS theme tokens; frozen M1 renderer remains untouched', () => {
  const renderer = read('../ui/renderm3.js');
  const css = read('../ui/style.css');
  const reference = read('../ui/render.js');
  assert.ok(renderer.includes('var(--diagram-ink'));
  assert.ok(renderer.includes('var(--diagram-halo'));
  assert.ok(css.includes('--diagram-halo: #1f2937'));
  assert.ok(css.includes('--diagram-shear: #60a5fa'));
  assert.match(reference, /const C = \{[\s\S]*ink: '#1e293b'/, 'legacy renderer retains its original fixed palette');
});

function renderReferencePointBeam() {
  const input = { span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller };
  const result = analyzeBeam(input);
  const doc = makeDoc();
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, result);
  return { doc, result };
}

test('M3 still displays the same engine results and result-card labels after shell changes', () => {
  const { doc, result } = renderReferencePointBeam();
  const cards = doc.getElementById('result-cards').children;
  const labels = cards.map((card) => card.children.find((child) => child.className === 'card-label').textContent);
  const values = cards.map((card) => card.children.find((child) => child.className === 'card-value').textContent);
  assert.deepEqual(labels, ['Reaction HA', 'Reaction VA', 'Reaction VB', 'Max bending moment', 'Max deflection']);
  assert.deepEqual(values, ['0 kN', '5 kN', '5 kN', '15 kNm', `${fmt(result.deflection.max.value * 1000)} mm`]);
  assert.ok(doc.getElementById('eq-badge').textContent.includes('Engine equilibrium self-check'));
  const texts = doc.getElementById('beam-svg').findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
  assert.ok(texts.some((text) => text.includes('P = 10 kN')));
});
