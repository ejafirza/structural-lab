/**
 * ui-m9.test.js — result routing and accessible one-topic teaching dialog.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeBeam } from '../src/analysis.js';
import { GLOSSARY_KEYS, getTerm } from '../src/glossary.js';
import { FakeNode, makeDoc } from './helpers/fake-dom.js';

// --- minimal DOM shim (shared: test/helpers/fake-dom.js) --------------------

function makeFakeDoc() {
  return makeDoc().doc;
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
const findByClass = (root, name) => root.findAll((node) => node.classList?.contains(name))[0] ?? null;
const copyKeys = (root) => root.findAll((node) => node.getAttribute?.('data-topic-key')).map((node) => node.getAttribute('data-topic-key'));

test('solved result cards retain labels and expose their own teaching routes', () => {
  const { doc, result } = boot({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const cards = doc.getElementById('result-cards').children;
  const labels = cards.map((card) => card.children.find((node) => node.className === 'card-label').textContent);
  // M12 Fix 7: labels carry semantic `_X` runs; the renderer turns them into
  // true subscripts, and textContent reads the plain semantic form.
  assert.deepEqual(labels, ['Reaction VA', 'Reaction VB', 'Max bending moment', 'Max deflection', 'Reaction HA']);
  assert.deepEqual(cards.map((card) => card.getAttribute('data-steps')), ['Reaction VA', 'Reaction VB', 'Max bending moment', 'Max deflection', 'Reaction HA']);
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
  assert.equal(doc.getElementById('lab-content').inert, true);
  assert.equal(doc._topbar.inert, true);
  assert.equal(trigger.inert, true);
  assert.equal(doc.activeElement.getAttribute('aria-label'), 'Close explanation');
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');

  doc.dispatch('keydown', { key: 'Escape', target: doc.activeElement });
  assert.equal(api.isOpen(), false);
  assert.equal(doc.activeElement, trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(doc.getElementById('lab-content').inert, false);
  assert.equal(doc._topbar.inert, false);
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
  trigger.setAttribute('data-term', 'equilibrium-check');
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
  assert.equal(doc.activeElement, close);
});

test('glossary references appear inline where mentioned, then navigate and preserve Back history', () => {
  const doc = makeFakeDoc();
  const api = initTeachingPopover(doc, providers);
  const trigger = new FakeNode('button', doc);
  trigger.setAttribute('data-term', 'supports');
  doc.body.append(trigger);
  trigger.click();
  const dialog = findByClass(doc.body, 'teaching-dialog');
  const copy = findByClass(dialog, 'teaching-copy');
  const trail = findByClass(dialog, 'teaching-back');
  const reaction = copy.children.find((node) => node.getAttribute?.('data-topic-key') === 'reaction');
  const determinacy = copy.children.find((node) => node.getAttribute?.('data-topic-key') === 'determinacy');
  assert.ok(reaction, 'reaction is linked in the sentence that mentions it');
  assert.equal(reaction.textContent, 'reaction force or moment');
  assert.ok(determinacy, 'determinacy is linked in the closing sentence that mentions it');
  const related = [...dialog.findAll((node) => node.nodeName === 'nav' && node.className === 'teaching-related')][0];
  assert.deepEqual(related.children.map((node) => node.getAttribute('data-topic-key')), ['pin-support', 'roller-support', 'fixed-support', 'free-end'],
    'only concepts not already linked inline remain in the related-links tray');
  assert.ok(copy.textContent.includes('Each support type resists a different set of motions'));
  assert.ok(copy.textContent.includes('corresponds to one reaction force or moment.'));
  const offset = copy.children.indexOf(reaction);
  assert.ok(copy.children.slice(0, offset).some((node) => node.textContent.includes('corresponds to one ')));
  assert.ok(copy.children.slice(offset + 1).some((node) => node.textContent.startsWith('. A pin')));
  doc.dispatch('keydown', { key: 'Enter', target: reaction });
  assert.equal(findByClass(dialog, 'teaching-title').textContent, 'Reaction');
  assert.equal(api.isOpen(), true);
  trail.click();
  assert.equal(findByClass(dialog, 'teaching-title').textContent, 'Supports');
  api.close();
});

test('every declared glossary relationship renders and navigates in the same dialog', () => {
  for (const sourceKey of GLOSSARY_KEYS) {
    const source = getTerm(sourceKey);
    const expected = [...new Set([...source.subs, ...source.seeAlso])];
    const doc = makeFakeDoc();
    const api = initTeachingPopover(doc, providers);
    const trigger = new FakeNode('button', doc);
    trigger.setAttribute('data-term', sourceKey);
    doc.body.append(trigger);
    trigger.click();

    const dialog = findByClass(doc.body, 'teaching-dialog');
    const title = () => findByClass(dialog, 'teaching-title').textContent;
    const related = () => findByClass(dialog, 'teaching-related');
    const inlineKeys = [...copyKeys(findByClass(dialog, 'teaching-copy'))];
    assert.ok(expected.every((key) => inlineKeys.includes(key) || related()?.children.some((link) => link.getAttribute('data-topic-key') === key)), sourceKey);
    assert.ok(!related()?.children.some((link) => inlineKeys.includes(link.getAttribute('data-topic-key'))), `${sourceKey}: inline topics are not duplicated in related concepts`);
    assert.equal(title(), source.term);
    for (const targetKey of expected) {
      const link = [...dialog.findAll((node) => node.nodeName === 'button' && node.getAttribute?.('data-topic-key') === targetKey)][0];
      assert.equal(link.nodeName, 'button');
      assert.equal(link.type, 'button');
      assert.equal(link.getAttribute('aria-label'), `Open definition: ${getTerm(targetKey).term}`);
      assert.ok(dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])').includes(link));
      link.click();
      assert.equal(title(), getTerm(targetKey).term, `${sourceKey} → ${targetKey}`);
      assert.equal(api.isOpen(), true);
      findByClass(dialog, 'teaching-back').click();
      assert.equal(title(), source.term, `Back: ${targetKey} → ${sourceKey}`);
    }
    api.close();
    assert.equal(api.isOpen(), false);
    assert.equal(doc.activeElement, trigger);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(doc.getElementById('lab-content').inert, false);
  }
});


test('glossary prose remains text and is never interpreted as markup', () => {
  const doc = makeFakeDoc();
  const api = initTeachingPopover(doc, {
    getGlossary: () => ({ term: 'Safe text', body: '<img src=x onerror=alert(1)>' }),
    getSteps: () => null,
  });
  const trigger = new FakeNode('button', doc);
  trigger.setAttribute('data-term', 'custom');
  doc.body.append(trigger);
  trigger.click();
  const dialog = findByClass(doc.body, 'teaching-dialog');
  assert.equal(findByClass(dialog, 'teaching-copy').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(dialog.findAll((node) => node.nodeName === 'img').length, 0);
  assert.equal(api.isOpen(), true);
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
  const src = readFileSync(path.join(here, '../ui/teaching.js'), 'utf8');
  assert.ok(src.includes("typeof document.addEventListener !== 'function'"));
});
