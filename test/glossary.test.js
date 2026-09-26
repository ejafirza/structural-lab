/**
 * glossary.test.js — M9 teaching-dictionary integrity.
 * -------------------------------------------------------------
 * The glossary is hand-written teaching content; these tests enforce its
 * MECHANICS (never its wording): no dead links, no orphans, sane sizes,
 * and — the annotation rule — every data-term the UI references exists in
 * the dictionary, and the dictionary entry set is exactly what the UI uses.
 * The ≤ 8 SVG touchpoint budget from plan-m9.md is asserted exactly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GLOSSARY_KEYS, getTerm, hasTerm } from '../src/glossary.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, rel), 'utf8');

test('every sub and seeAlso link points at an existing entry (no dead links)', () => {
  for (const key of GLOSSARY_KEYS) {
    const e = getTerm(key);
    for (const sub of e.subs ?? []) {
      assert.ok(hasTerm(sub), `${key}: sub "${sub}" does not exist in the dictionary`);
    }
    for (const also of e.seeAlso ?? []) {
      assert.ok(hasTerm(also), `${key}: seeAlso "${also}" does not exist in the dictionary`);
    }
  }
});

test('every entry is reachable from some other entry (no orphans)', () => {
  const referenced = new Set();
  for (const key of GLOSSARY_KEYS) {
    const e = getTerm(key);
    for (const r of [...(e.subs ?? []), ...(e.seeAlso ?? [])]) referenced.add(r);
  }
  // The seed entries the page itself references are the roots of the graph.
  const pageRoots = ['supports', 'loads', 'determinacy', 'equilibrium-check',
    'beam-stiffness', 'stiffness-presets', 'load-presets', 'profile',
    'shear-force', 'bending-moment', 'elastic-curve', 'units', 'exaggeration',
    'vertical-reaction', 'moment-reaction', 'centroid', 'maximum-moment',
    'max-deflection', 'statically-indeterminate'];
  const reach = new Set(pageRoots.filter(hasTerm));
  let grew = true;
  while (grew) {
    grew = false;
    for (const k of [...reach]) {
      const e = getTerm(k);
      if (!e) continue;
      for (const r of [...(e.subs ?? []), ...(e.seeAlso ?? [])]) {
        if (!reach.has(r) && hasTerm(r)) { reach.add(r); grew = true; }
      }
    }
  }
  for (const key of GLOSSARY_KEYS) {
    assert.ok(reach.has(key) || referenced.has(key) || pageRoots.includes(key),
      `${key} is an orphan — nothing links to it and the page does not use it`);
  }
});

test('every entry has a term and a body within sane teaching sizes', () => {
  for (const key of GLOSSARY_KEYS) {
    const e = getTerm(key);
    assert.ok(typeof e.term === 'string' && e.term.length >= 2 && e.term.length <= 80, `${key}: bad term`);
    assert.ok(typeof e.body === 'string' && e.body.length >= 40, `${key}: body too short to teach anything`);
    assert.ok(e.body.length <= 1600, `${key}: body over the teaching cap (${e.body.length} chars) — split it`);
    assert.ok(Array.isArray(e.subs), `${key}: subs must be an array`);
    assert.ok(Array.isArray(e.seeAlso), `${key}: seeAlso must be an array`);
    assert.ok((e.subs.length + e.seeAlso.length) <= 8, `${key}: too many chips (${e.subs.length + e.seeAlso.length})`);
  }
  assert.ok(GLOSSARY_KEYS.length >= 30, 'the dictionary should carry the full planned inventory (~39)');
});

test('the UI references only dictionary entries (annotation rule, forward direction)', () => {
  const html = read('../ui/index.html');
  const appSrc = read('../ui/app.js');
  const renderSrc = read('../ui/renderm3.js');
  const popoverSrc = read('../ui/popover.js');
  const used = new Set();
  for (const src of [html, appSrc, renderSrc, popoverSrc]) {
    for (const m of src.matchAll(/data-term="([a-z0-9-]+)"/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 12, `expected a rich set of page-level terms, got ${used.size}`);
  for (const key of used) {
    assert.ok(hasTerm(key), `UI references "${key}" but the dictionary has no such entry`);
  }
});

test('SVG touchpoints: the planned topics remain resolvable (budget ≤ 8)', () => {
  const renderSrc = read('../ui/renderm3.js');
  const svgTerms = [...renderSrc.matchAll(/'data-term':\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.ok(svgTerms.length <= 8, `SVG touchpoint budget blown: ${svgTerms.length} > 8`);
  assert.deepEqual([...new Set(svgTerms)].sort(),
    ['centroid', 'exaggeration', 'max-deflection', 'maximum-moment', 'moment-reaction', 'supports', 'vertical-reaction'],
    'the SVG teaching topics remain within the planned budget');
  for (const t of svgTerms) assert.ok(hasTerm(t), `SVG term "${t}" missing from the dictionary`);
});

test('content honesty markers: no AI, and the torsion note is correct', () => {
  const src = read('../src/glossary.js');
  assert.ok(src.includes("from THIS file") || src.includes('hand-written'), 'glossary should be documented as hand-written');
  const pin = getTerm('pin-support');
  assert.ok(pin.body.includes('2 reaction unknowns'), 'pin teaches 2 reactions (not 3)');
  const fixed = getTerm('fixed-support');
  assert.ok(fixed.body.includes('3 reaction'), 'fixed teaches 3 reactions');
  const moment = getTerm('moment-reaction');
  assert.ok(moment.body.includes('torsion'), 'moment-reaction explains the torsion relationship');
  const roller = getTerm('roller-support');
  assert.ok(roller.body.includes('1 reaction'), 'roller teaches 1 reaction');
});
