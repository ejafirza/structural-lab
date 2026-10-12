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
import { makeDoc } from './helpers/fake-dom.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, rel), 'utf8');
const pinRoller = { left: 'pin', right: 'roller' };

globalThis.document = makeDoc().doc;
const { renderM3 } = await import('../ui/renderm3.js');

test('desktop shell uses named two-column areas and stacks in a mobile reading order', () => {
  const html = read('../ui/index.html');
  const css = read('../ui/style.css');
  assert.match(css, /grid-template-columns:\s*minmax\(320px,\s*390px\)\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /"model results"[\s\S]*"model beam"[\s\S]*"model shear"[\s\S]*"model moment"[\s\S]*"model deflection"/);
  assert.match(css, /@media\s*\(max-width:\s*980px\)/);
  assert.match(css, /"model"[\s\S]*"results"[\s\S]*"beam"[\s\S]*"shear"[\s\S]*"moment"[\s\S]*"deflection"/);
  assert.match(html, /Click or tap a support symbol to cycle it/);
  assert.match(html, /desktop-beam-cue[^>]*>Right-click the beam to add a load/);
  assert.match(css, /\.support-control:focus-visible/);
  assert.match(css, /\.beam-context-menu\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /\.teaching-copy\s*\{[^}]*white-space:\s*normal;/);
  assert.match(css, /Cambria Math[\s\S]*STIX Two Math/);
  assert.match(read('../src/explain.js'), /Mₘₐₓ = P·a·b \/ L/);
  assert.match(read('../src/glossary.js'), /ΣFₓ/);
  assert.ok(html.indexOf('Mₘₐₓ') < 0, 'equation labels are rendered from the analysis renderer rather than duplicated in markup');
  assert.match(html, /id="theme-toggle"/);
  for (const id of ['beam-svg', 'sfd-svg', 'bmd-svg', 'defl-svg']) assert.ok(html.includes(`id="${id}"`));
});

test('Model is an open native disclosure and existing controls are still inside it', () => {
  const html = read('../ui/index.html');
  assert.match(html, /<details id="model-panel"[^>]*open/);
  assert.match(html, /<summary class="model-summary">[\s\S]*id="load-count"/);
  const start = html.indexOf('<details id="model-panel"');
  let depth = 0, end = -1;
  for (const match of html.slice(start).matchAll(/<\/?details\b[^>]*>/g)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) { end = start + match.index + match[0].length; break; }
  }
  assert.ok(start >= 0 && end > start, 'the Model disclosure and nested details have matching boundaries');
  const disclosure = html.slice(start, end);
  for (const id of ['load-list', 'num-span', 'num-load', 'num-pos', 'num-ei', 'sel-support-left', 'sel-support-right', 'point-table', 'btn-add-point', 'btn-add-distributed']) {
    assert.ok(disclosure.includes(`id="${id}"`), `${id} remains in the Model disclosure`);
  }
  assert.match(disclosure, /<input id="num-ei" type="number"[^>]*step="any"/,
    'beam stiffness accepts arbitrary positive values, not only multiples of an arbitrary step');
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

test('M11 reduces repeated copy but keeps essential units, sign conventions and the concise disclaimer', () => {
  const html = read('../ui/index.html');
  for (const text of ['kN · positive plots up', 'kN·m · sagging (+) below, hogging (−) above', 'Shape exaggerated; true value shown', 'For learning only—not for structural design verification.']) {
    assert.ok(html.includes(text), `essential academic cue retained: ${text}`);
  }
  assert.ok(!html.includes('A simple visual lab for learning structural analysis.'), 'remove the redundant tagline');
  assert.ok(!html.includes('Hover or click any dotted term for a hand-written explanation.'), 'remove repeated teaching instructions');
  assert.ok(!html.includes('Educational tool — not a professional design-verification system'), 'keep only the approved concise disclaimer');
  assert.ok(!html.includes('Engine equilibrium self-check'), 'the badge is concise; the topic explanation is available on demand');
  const { doc } = renderReferencePointBeam();
  const renderedLabels = doc.getElementById('result-cards').children
    .map((card) => card.children.find((child) => child.className === 'card-label').textContent);
  assert.deepEqual(renderedLabels, ['Reaction VA', 'Reaction VB', 'Max bending moment', 'Max deflection', 'Reaction HA'],
    'M12 Fix 6+7: meaningful reactions lead, zero H last, semantic _X labels');
});

test('live SVG palette references CSS theme tokens; frozen M1 renderer remains untouched', () => {
  const renderer = read('../ui/renderm3.js');
  const css = read('../ui/style.css');
  const reference = read('../ui/render.js');
  assert.ok(renderer.includes('var(--diagram-ink'));
  assert.ok(renderer.includes('var(--diagram-halo'));
  assert.ok(renderer.includes("attrs['paint-order'] = 'stroke'"), 'text halos use SVG presentation attributes compatible with strict CSP');
  assert.ok(!renderer.includes('attrs.style ='), 'SVG labels do not use CSP-blocked inline style attributes');
  assert.ok(css.includes('--diagram-halo: #1f2937'));
  assert.ok(css.includes('--diagram-shear: #60a5fa'));
  assert.match(reference, /const C = \{[\s\S]*ink: '#1e293b'/, 'legacy renderer retains its original fixed palette');
});

function renderReferencePointBeam() {
  const input = { span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller };
  const result = analyzeBeam(input);
  const doc = makeDoc().doc;
  renderM3(doc, { span: 6, selectedLoad: 0, supports: pinRoller }, result);
  return { doc, result };
}

test('M3 still displays the same engine results and result-card labels after shell changes', () => {
  const { doc, result } = renderReferencePointBeam();
  const cards = doc.getElementById('result-cards').children;
  const labels = cards.map((card) => card.children.find((child) => child.className === 'card-label').textContent);
  const values = cards.map((card) => card.children.find((child) => child.className === 'card-value').textContent);
  assert.deepEqual(labels, ['Reaction VA', 'Reaction VB', 'Max bending moment', 'Max deflection', 'Reaction HA']);
  assert.deepEqual(values, ['5 kN', '5 kN', '15 kN·m', `${fmt(result.deflection.max.value * 1000)} mm`, '0 kN']);
  assert.equal(doc.getElementById('eq-badge').textContent, 'Balanced ✓');
  assert.equal(doc.getElementById('eq-badge').getAttribute('aria-label'), 'Balanced. Activate to inspect the equilibrium residuals.');
  const texts = doc.getElementById('beam-svg').findAll((n) => n.nodeName === 'text').map((n) => n.textContent);
  assert.ok(texts.some((text) => text.includes('P = 10 kN')));
});
