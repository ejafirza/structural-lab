/**
 * explain.test.js — M9 derivation formatter over finished results.
 * -------------------------------------------------------------
 * Two layers:
 *   1. THE IDENTITY RULE: every step's numeric value is identical to the
 *      engine result field it quotes (steps read the result, never recompute
 *      — a parallel formula could drift; reading cannot).
 *   2. HAND-DERIVED cases: the groups quote exactly the textbook numbers the
 *      analytical suites already pinned (M1/M4/M5/M7/M8 anchors), so the
 *      teaching text and the engine can never disagree.
 * Honesty: indeterminate/unstable results get the classification explanation
 * only — no invented numbers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam } from '../src/analysis.js';
import { derivationGroups, groupForCard } from '../src/explain.js';

const pinRoller = { left: 'pin', right: 'roller' };

/** Every numeric step value must be a finite number (or null for prose steps). */
function allSteps(groups) {
  return groups.flatMap((g) => g.steps);
}

test('default point beam: reactions group quotes the M1 hand values (RA = RB = 5 kN, Mmax = 15)', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const groups = derivationGroups(result);
  const titles = groups.map((g) => g.title);
  assert.ok(titles.some((t) => t.includes('reactions')), 'reactions group present');
  assert.ok(titles.some((t) => t.includes('shear')), 'shear group present');
  assert.ok(titles.some((t) => t.includes('moment')), 'moment group present');
  assert.ok(titles.some((t) => t.includes('equilibrium')), 'equilibrium group present');
  assert.ok(titles.some((t) => t.includes('deflection')), 'deflection group present (determinate result carries it)');

  const reactions = groups.find((g) => g.title.includes('reactions'));
  const values = reactions.steps.map((s) => s.value);
  assert.ok(values.includes(result.reactions.left.Vy), 'quotes R_A exactly from the result');
  assert.ok(values.includes(result.reactions.right.Vy), 'quotes R_B exactly from the result');
  assert.ok(reactions.steps.some((s) => s.value === 5 || Math.abs(s.value - 5) < 1e-12), 'the hand value 5 kN appears');

  const moment = groups.find((g) => g.title.includes('moment'));
  assert.ok(moment.steps.some((s) => Math.abs(s.value - 15) < 1e-12), 'Mmax hand value 15 kNm appears');
  assert.ok(moment.steps.some((s) => Math.abs(s.value - 3) < 1e-12), 'peak position 3 m appears');
});

test('IDENTITY RULE: every numeric step equals a value carried by the result', () => {
  const cases = [
    { span: 6, loads: [{ type: 'point', magnitude: 10, position: 2 }], supports: pinRoller },
    { span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: pinRoller },
    { span: 6, loads: [{ type: 'linear', start: 0, end: 6, wStart: 0, wEnd: 12 }], supports: pinRoller },
    { span: 6, loads: [{ type: 'profile', points: [{ x: 0, w: 4 }, { x: 3, w: 4 }, { x: 3, w: 8 }, { x: 6, w: 8 }] }], supports: pinRoller },
    { span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: { left: 'fixed', right: 'free' } },
    {
      span: 6,
      loads: [
        { type: 'point', magnitude: 5, position: 2 },
        { type: 'profile', points: [{ x: 0, w: 4 }, { x: 3, w: 4 }, { x: 3, w: 8 }, { x: 6, w: 8 }] },
      ],
      supports: pinRoller,
    },
  ];
  for (const input of cases) {
    const result = analyzeBeam(input);
    const groups = derivationGroups(result);
    const known = new Set();
    for (const side of ['left', 'right']) {
      const r = result.reactions[side];
      for (const [k, v] of Object.entries(r)) if (k !== 'type') known.add(v);
    }
    known.add(result.maxMoment.value);
    known.add(result.maxMoment.position);
    known.add(result.resultant.value);
    known.add(result.resultant.position);
    known.add(result.equilibrium.sumFx);
    known.add(result.equilibrium.sumFy);
    known.add(result.equilibrium.sumMz);
    // The end shears are engine values too (the sampled diagram's ends) —
    // the shear group quotes them as V(0⁺) and V(L⁻).
    known.add(result.diagrams.shear[0].V);
    known.add(result.diagrams.shear[result.diagrams.shear.length - 1].V);
    // And the deflection block, when present. The ONE allowed transformation
    // in explain.js is the unit conversion m → mm (× 1000) — the same
    // conversion the results card applies — so it is accepted as known.
    if (result.deflection) {
      known.add(result.deflection.max.value);
      known.add(result.deflection.max.position);
      known.add(result.deflection.EI);
      known.add(result.deflection.max.value * 1000);
    }
    for (const s of allSteps(groups)) {
      if (s.value == null) continue;
      assert.equal(typeof s.value, 'number', 'step values are numbers or null');
      if (Number.isInteger(s.value) && Math.abs(s.value) <= 3) continue; // small counters (R, 3)
      assert.ok(known.has(s.value) || [...known].some((k) => typeof k === 'number' && Math.abs(k - s.value) < 1e-9),
        `step value ${s.value} (${s.formula}) is not traceable to the result — explain.js must read, not compute`);
    }
  }
});

test('cantilever: the wall group speaks cantilever language and quotes wall values', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: { left: 'fixed', right: 'free' } });
  const groups = derivationGroups(result);
  const reactions = groups.find((g) => g.title.includes('reactions'));
  assert.ok(reactions.title.includes('cantilever'), 'the cantilever path is named');
  assert.ok(reactions.steps.some((s) => Math.abs(s.value - result.reactions.left.Vy) < 1e-12), 'wall vertical quoted');
  assert.ok(reactions.steps.some((s) => Math.abs(s.value - result.reactions.left.Mz) < 1e-12), 'wall moment quoted');
  const moment = groups.find((g) => g.title.includes('moment'));
  assert.ok(moment.steps.some((s) => s.formula.includes('Hogging') || s.formula.includes('hogging')), 'hogging is explained');
});

test('deflection group: standard case quotes the textbook formula path with the engine value', () => {
  // P·L³/48/EI with P=10, L=6, EI=2e4 → 2.25 mm (plan-m8 anchor).
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const d = derivationGroups(result).find((g) => g.title.includes('deflection'));
  const values = d.steps.map((s) => s.value);
  assert.ok(values.includes(result.deflection.max.value), 'engine max value (metres) quoted');
  assert.ok(values.some((v) => Math.abs(v - result.deflection.max.value * 1000) < 1e-12), 'mm conversion quoted');
  assert.ok(values.includes(result.deflection.EI), 'E·I quoted');
  assert.ok(d.steps.some((s) => s.formula.includes('48')), 'the P·L³/48EI textbook case is named');

  // Mixed/profile case tells the integration story instead of a formula.
  const mixed = analyzeBeam({
    span: 6,
    loads: [
      { type: 'point', magnitude: 5, position: 2 },
      { type: 'udl', intensity: 2 },
    ],
    supports: pinRoller,
  });
  const dm = derivationGroups(mixed).find((g) => g.title.includes('deflection'));
  assert.ok(dm.steps.some((s) => s.formula.includes('integrated')), 'mixed case explains the exact integration');
  assert.ok(dm.steps.some((s) => Math.abs(s.value - mixed.deflection.max.position) < 1e-12), 'θ = 0 position quoted');
});

test('equilibrium group quotes the residuals verbatim from the result', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const eq = derivationGroups(result).find((g) => g.title.includes('equilibrium'));
  const values = eq.steps.map((s) => s.value);
  assert.ok(values.includes(result.equilibrium.sumFx));
  assert.ok(values.includes(result.equilibrium.sumFy));
  assert.ok(values.includes(result.equilibrium.sumMz));
});

test('UDL case: reactions group walks the band area with hand values (R = 12, RA = RB = 6)', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: pinRoller });
  const reactions = derivationGroups(result).find((g) => g.title.includes('reactions'));
  const text = reactions.steps.map((s) => `${s.formula} ${s.substitution}`).join(' ');
  assert.ok(text.includes('area'), 'the area story is told');
  assert.ok(reactions.steps.some((s) => Math.abs(s.value - 12) < 1e-12), 'R = w·L = 12 kN hand value');
  assert.ok(reactions.steps.some((s) => Math.abs(s.value - 6) < 1e-12), 'RA = RB = 6 kN hand values');
});

test('M7 Case A stepped profile: the reactions group reproduces RA = 15, RB = 21', () => {
  const result = analyzeBeam({
    span: 6,
    loads: [{ type: 'profile', points: [{ x: 0, w: 4 }, { x: 3, w: 4 }, { x: 3, w: 8 }, { x: 6, w: 8 }] }],
    supports: pinRoller,
  });
  const reactions = derivationGroups(result).find((g) => g.title.includes('reactions'));
  assert.ok(reactions.steps.some((s) => Math.abs(s.value - 15) < 1e-9), 'RA = 15 kN (plan-m7 Case A)');
  assert.ok(reactions.steps.some((s) => Math.abs(s.value - 21) < 1e-9), 'RB = 21 kN (plan-m7 Case A)');
});

test('groupForCard maps each results card to its derivation group', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  assert.ok(groupForCard(result, 'Reaction VA').title.includes('reactions'));
  assert.ok(groupForCard(result, 'Max bending moment').title.includes('moment'));
  assert.ok(groupForCard(result, 'Max deflection').title.includes('deflection'));
  assert.equal(groupForCard(result, 'Unknown card'), null);
});

test('HONESTY: indeterminate and unstable results get the classification explanation only', () => {
  const pinPin = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: { left: 'pin', right: 'pin' } });
  const g1 = derivationGroups(pinPin);
  assert.equal(g1.length, 2, 'classification groups only');
  assert.ok(g1[0].title.includes('not solved'), 'the honesty headline');
  const flat = allSteps(g1).map((s) => s.value).filter((v) => v != null);
  assert.ok(flat.every((v) => Number.isInteger(v) && Math.abs(v) <= 20), 'no invented engineering numbers — only the R-vs-3 counting');
  assert.ok(g1[0].steps.some((s) => s.value === pinPin.classification.unknowns), 'quotes the unknown count from the classification');
  assert.ok(g1[0].steps.some((s) => s.value === pinPin.classification.degree), 'quotes the degree from the classification');

  const rollerRoller = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: { left: 'roller', right: 'roller' } });
  const g2 = derivationGroups(rollerRoller);
  assert.ok(g2.some((grp) => grp.steps.some((s) => String(s.substitution).includes('unrestrained') || String(s.substitution).includes('mechanism'))),
    'the unstable explanation names the mechanism');
});

test('the formatter never mutates the result (pure add-on discipline)', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const before = JSON.stringify(result);
  derivationGroups(result);
  groupForCard(result, 'Reaction VA');
  assert.equal(JSON.stringify(result), before, 'result object byte-identical after formatting');
});
