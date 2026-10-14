import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { STEPS, initSteps, isVisibleInStep } from '../ui/steps.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, '../ui/index.html'), 'utf8');

function element(attributes = {}) {
  const attrs = { ...attributes };
  const listeners = {};
  return {
    hidden: false,
    disabled: false,
    textContent: '',
    getAttribute: (name) => attrs[name] ?? null,
    setAttribute: (name, value) => { attrs[name] = String(value); },
    removeAttribute: (name) => { delete attrs[name]; },
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    click: () => (listeners.click ?? []).forEach((fn) => fn()),
  };
}

function fakeDocument() {
  const sections = {
    beam: element({ 'data-steps': 'beam loads' }),
    model: element({ 'data-steps': 'loads' }),
    results: element({ 'data-steps': 'results' }),
  };
  const buttons = {
    beam: element({ 'data-step-target': 'beam' }),
    loads: element({ 'data-step-target': 'loads' }),
    results: element({ 'data-step-target': 'results' }),
  };
  const byId = {
    'step-prev': element(),
    'step-next': element(),
    'step-position': element(),
  };
  return {
    sections,
    buttons,
    byId,
    doc: {
      querySelectorAll(selector) {
        if (selector === '[data-steps]') return Object.values(sections);
        if (selector === '[data-step-target]') return Object.values(buttons);
        return [];
      },
      getElementById: (id) => byId[id] ?? null,
    },
  };
}

test('membership reads space-separated data-steps lists', () => {
  assert.equal(isVisibleInStep('beam loads', 'loads'), true);
  assert.equal(isVisibleInStep('beam loads', 'results'), false);
  assert.equal(isVisibleInStep('results', 'results'), true);
  assert.equal(isVisibleInStep(null, 'beam'), false, 'a missing attribute shows nowhere');
});

test('the step order is Beam, Loads, Results', () => {
  assert.deepEqual(STEPS, ['beam', 'loads', 'results']);
});

test('the controller starts on Beam and shows only the sections for that step', () => {
  const { sections, buttons, byId, doc } = fakeDocument();
  const controller = initSteps(doc, {});
  assert.equal(controller.current, 'beam');
  assert.equal(sections.beam.hidden, false);
  assert.equal(sections.model.hidden, true);
  assert.equal(sections.results.hidden, true);
  assert.equal(buttons.beam.getAttribute('aria-current'), 'step');
  assert.equal(buttons.loads.getAttribute('aria-current'), null);
  assert.equal(byId['step-prev'].disabled, true, 'no Back on the first step');
  assert.equal(byId['step-position'].textContent, 'Step 1 of 3: Beam');
});

test('Next and Back move one step and clamp at the ends', () => {
  const { sections, byId, doc } = fakeDocument();
  const controller = initSteps(doc, {});
  byId['step-next'].click();
  assert.equal(controller.current, 'loads');
  assert.equal(sections.beam.hidden, false, 'the beam diagram stays visible while loads are edited');
  assert.equal(sections.model.hidden, false);
  assert.equal(sections.results.hidden, true);
  byId['step-next'].click();
  assert.equal(controller.current, 'results');
  assert.equal(sections.results.hidden, false);
  assert.equal(sections.beam.hidden, true);
  assert.equal(byId['step-next'].disabled, true, 'no Next on the last step');
  byId['step-next'].click();
  assert.equal(controller.current, 'results', 'Next does nothing past the end');
  byId['step-prev'].click();
  assert.equal(controller.current, 'loads');
  assert.equal(byId['step-position'].textContent, 'Step 2 of 3: Loads');
});

test('step buttons jump directly and ignore unknown steps', () => {
  const { sections, buttons, doc } = fakeDocument();
  const controller = initSteps(doc, {});
  buttons.results.click();
  assert.equal(controller.current, 'results');
  assert.equal(buttons.results.getAttribute('aria-current'), 'step');
  assert.equal(buttons.beam.getAttribute('aria-current'), null);
  assert.equal(sections.results.hidden, false);
  assert.equal(controller.show('unknown'), 'results', 'an unknown step is ignored');
});

test('the controller scrolls the page back to the top on each step change', () => {
  const { doc, buttons } = fakeDocument();
  const scrolls = [];
  initSteps(doc, { scrollTo: (...args) => scrolls.push(args) });
  buttons.loads.click();
  assert.deepEqual(scrolls.at(-1), [0, 0]);
});

test('no step markup means no controller', () => {
  assert.equal(initSteps({ querySelectorAll: () => [], getElementById: () => null }, {}), null);
});

test('markup declares a step for every section and each step has a button', () => {
  const declared = [...html.matchAll(/data-steps="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(declared.length >= 5, 'beam, model, results and the three diagrams are declared');
  for (const membership of declared) {
    for (const step of membership.split(/\s+/)) {
      assert.ok(STEPS.includes(step), `"${step}" is a known step`);
    }
  }
  for (const step of STEPS) {
    assert.ok(html.includes(`data-step-target="${step}"`), `a button targets ${step}`);
  }
  for (const id of ['step-prev', 'step-next', 'step-position']) {
    assert.ok(html.includes(`id="${id}"`), `${id} exists`);
  }
});

test('every diagram and result section belongs to a step, so nothing is stranded', () => {
  for (const id of ['beam-panel', 'model-panel', 'results-panel']) {
    const tag = html.match(new RegExp(`<(section|details)[^>]*id="${id}"[^>]*>`))?.[0] ?? '';
    assert.match(tag, /data-steps="/, `${id} declares its steps`);
  }
  for (const cls of ['shear-panel', 'moment-panel', 'deflection-panel']) {
    const tag = html.match(new RegExp(`<section[^>]*${cls}[^>]*>`))?.[0] ?? '';
    assert.match(tag, /data-steps="results"/, `${cls} shows with the results`);
  }
});
