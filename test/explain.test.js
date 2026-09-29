/**
 * explain.test.js — worked explanations over finished analysis results.
 * The presentation may format results, but it must never solve a second beam
 * or invent intermediate engineering values.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam } from '../src/analysis.js';
import { derivationGroups, groupForCard } from '../src/explain.js';

const pinRoller = { left: 'pin', right: 'roller' };

function allSteps(groups) {
  return groups.flatMap((item) => item.steps);
}

function knownResultValues(result) {
  const known = new Set([
    result.maxMoment.value,
    result.maxMoment.position,
    result.resultant.value,
    result.resultant.position,
    result.equilibrium.sumFx,
    result.equilibrium.sumFy,
    result.equilibrium.sumMz,
    result.diagrams.shear[0].V,
    result.diagrams.shear.at(-1).V,
  ]);
  for (const side of ['left', 'right']) {
    for (const [key, value] of Object.entries(result.reactions[side])) {
      if (key !== 'type' && typeof value === 'number') known.add(value);
    }
  }
  if (result.deflection) {
    known.add(result.deflection.max.value);
    known.add(result.deflection.max.position);
    known.add(result.deflection.EI);
    known.add(result.deflection.max.value * 1000); // display conversion: m → mm
  }
  return known;
}

test('default point beam: individual reaction cards and peak moment quote the hand values', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const groups = derivationGroups(result);
  assert.ok(groups.some((item) => item.title.includes('reaction')));
  assert.ok(groups.some((item) => item.title.includes('shear')));
  assert.ok(groups.some((item) => item.title.includes('moment')));
  assert.ok(groups.some((item) => item.title.includes('Equilibrium')));
  assert.ok(groups.some((item) => item.title.includes('deflection')));

  for (const [label, reaction] of [
    ['Reaction VA', result.reactions.left.Vy],
    ['Reaction VB', result.reactions.right.Vy],
    ['Reaction HA', result.reactions.left.Hx],
  ]) {
    const item = groupForCard(result, label);
    assert.ok(item.steps.some((step) => step.value === reaction), `${label} quotes its own engine reaction`);
  }
  const moment = groupForCard(result, 'Max bending moment');
  assert.equal(moment.steps[0].value, null, 'the method explanation does not repeat the answer');
  assert.ok(moment.steps.some((step) => step.value === 15), 'Mₘₐₓ is 15 kN·m');
  assert.ok(moment.steps.some((step) => step.title === 'Substitute the given values' && step.substitution === 'Mₘₐₓ = 10 × 3 × 3 / 6 kN·m'));
  assert.ok(moment.steps.some((step) => step.explanation.includes('directly under the point load')));
});

test('identity rule: every numeric answer is an engine result or the explicit m-to-mm display conversion', () => {
  const cases = [
    { span: 6, loads: [{ type: 'point', magnitude: 10, position: 2 }], supports: pinRoller },
    { span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller },
    { span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: pinRoller },
    { span: 6, loads: [{ type: 'linear', start: 1, end: 5, wStart: 1, wEnd: 6 }], supports: pinRoller },
    { span: 6, loads: [{ type: 'profile', points: [{ x: 0, w: 4 }, { x: 3, w: 4 }, { x: 3, w: 8 }, { x: 6, w: 8 }] }], supports: pinRoller },
    { span: 6, loads: [{ type: 'point', magnitude: 10, position: 2 }], supports: { left: 'fixed', right: 'free' } },
    { span: 6, loads: [{ type: 'point', magnitude: 10, position: 2 }], supports: { left: 'free', right: 'fixed' } },
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
    const known = knownResultValues(result);
    for (const step of allSteps(derivationGroups(result))) {
      if (step.value == null) continue;
      assert.equal(typeof step.value, 'number');
      assert.ok(Number.isFinite(step.value));
      assert.ok(known.has(step.value) || step.value === 3,
        `value ${step.value} (${step.equation}) is not traceable to the engine result`);
    }
  }
});

test('every displayed reaction card routes to that component and support side', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  for (const [label, key, side] of [
    ['Reaction HA', 'Hx', 'left'], ['Reaction VA', 'Vy', 'left'], ['Reaction VB', 'Vy', 'right'],
  ]) {
    const item = groupForCard(result, label);
    assert.ok(item.title.includes(`${key === 'Hx' ? 'H' : 'V'}₍${side === 'left' ? 'A' : 'B'}₎`), label);
    assert.ok(item.steps.some((step) => step.value === result.reactions[side][key]), label);
  }
  assert.equal(groupForCard(result, 'Unknown card'), null);
});

test('cantilever reaction explanations use the wall outputs and actual load arm on either side', () => {
  for (const supports of [{ left: 'fixed', right: 'free' }, { left: 'free', right: 'fixed' }]) {
    const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 2 }], supports });
    const side = supports.left === 'fixed' ? 'left' : 'right';
    const letter = side === 'left' ? 'A' : 'B';
    const reaction = groupForCard(result, `Reaction M${letter}`);
    assert.ok(reaction.steps.some((step) => step.equation.includes('ΣM₍wall₎ = 0')));
    assert.ok(reaction.steps.at(-1).value === result.reactions[side].Mz);
    assert.ok(reaction.steps.some((step) => step.substitution.includes(`M₍${letter}₎ = 10 × ${side === 'left' ? '2' : '4'} kN·m`)));

    const moment = groupForCard(result, 'Max bending moment');
    assert.equal(moment.steps.at(-1).value, result.maxMoment.value);
    assert.ok(moment.steps[0].explanation.includes('fixed end'));
    assert.ok(moment.steps.some((step) => step.explanation.includes('Hogging')));
  }
});

test('standard deflection equations are limited to the cases they describe', () => {
  const centered = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const centerStep = groupForCard(centered, 'Max deflection').steps[0];
  assert.equal(centerStep.equation, 'vₘₐₓ = P·L³ / (48·E·I)');
  const centerSubstitution = groupForCard(centered, 'Max deflection').steps[1];
  assert.equal(centerSubstitution.title, 'Substitute the given values');
  assert.equal(centerSubstitution.substitution, 'vₘₐₓ = 10 × 6³ / (48 × 20000) m');

  const cantileverLeft = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 2 }], supports: { left: 'fixed', right: 'free' } });
  assert.equal(groupForCard(cantileverLeft, 'Max deflection').steps[1].substitution, 'vₜᵢₚ = 10 × 2² × (3 × 6 − 2) / (6 × 20000) m');
  const cantileverRight = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 4 }], supports: { left: 'free', right: 'fixed' } });
  assert.equal(groupForCard(cantileverRight, 'Max deflection').steps[1].substitution, 'vₜᵢₚ = 10 × 2² × (3 × 6 − 2) / (6 × 20000) m');

  const offCenter = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 2 }], supports: pinRoller });
  const generalStep = groupForCard(offCenter, 'Max deflection').steps[0];
  assert.equal(generalStep.equation, 'E·I·v″(x) = −M(x)');
  assert.ok(generalStep.explanation.includes('integrates the exact moment'));
  assert.ok(!generalStep.equation.includes('48'), 'do not apply the centered-load shortcut off-center');

  const udl = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: pinRoller });
  assert.equal(groupForCard(udl, 'Max bending moment').steps[1].substitution, 'Mₘₐₓ = 2 × 6² / 8 kN·m');
  assert.equal(groupForCard(udl, 'Max deflection').steps[0].equation, 'vₘₐₓ = 5·w·L⁴ / (384·E·I)');
  assert.equal(groupForCard(udl, 'Max deflection').steps[1].substitution, 'vₘₐₓ = 5 × 2 × 6⁴ / (384 × 20000) m');

  // The UI's two-point editor emits a full-span uniform load as `linear`.
  const uniformLinear = analyzeBeam({
    span: 6,
    loads: [{ type: 'linear', start: 0, end: 6, wStart: 2, wEnd: 2 }],
    supports: pinRoller,
  });
  assert.equal(groupForCard(uniformLinear, 'Max bending moment').steps[0].equation, 'Mₘₐₓ = w·L² / 8');
  assert.equal(groupForCard(uniformLinear, 'Max bending moment').steps[0].value, null);
  assert.equal(groupForCard(uniformLinear, 'Max bending moment').steps[1].substitution, 'Mₘₐₓ = 2 × 6² / 8 kN·m');
  assert.equal(groupForCard(uniformLinear, 'Max deflection').steps[0].equation, 'vₘₐₓ = 5·w·L⁴ / (384·E·I)');
  assert.equal(groupForCard(uniformLinear, 'Max deflection').steps[1].substitution, 'vₘₐₓ = 5 × 2 × 6⁴ / (384 × 20000) m');
});

test('mixed and profile cases show actual inputs and the exact method without invented load-resultant values', () => {
  const result = analyzeBeam({
    span: 6,
    loads: [
      { type: 'point', magnitude: 5, position: 2 },
      { type: 'profile', points: [{ x: 0, w: 4 }, { x: 3, w: 4 }, { x: 3, w: 8 }, { x: 6, w: 8 }] },
    ],
    supports: pinRoller,
  });
  const reactions = groupForCard(result, 'Reaction VB');
  assert.ok(reactions.given.some((datum) => datum.includes('P = 5 kN at x = 2 m')));
  assert.ok(reactions.given.some((datum) => datum.includes('(3 m, 4 kN/m); (3 m, 8 kN/m)')));
  assert.equal(reactions.steps.at(-1).value, result.reactions.right.Vy);
  assert.ok(reactions.steps[0].equation.includes('R·x̄ / L'));
  assert.equal(reactions.steps[0].substitution, '', 'combined case does not synthesize a resultant substitution');
  assert.ok(!reactions.steps.some((step) => step.title === 'Substitute the given values'), 'no fabricated per-load resultant is added to the combined case');

  const moment = groupForCard(result, 'Max bending moment');
  assert.ok(moment.steps[0].equation.includes('V(x*) = 0'));
  assert.equal(moment.steps[0].value, null, 'the method step does not invent or repeat an intermediate answer');
  assert.equal(moment.steps[0].substitution, '', 'mixed-load method does not fabricate an intermediate peak value');
  assert.equal(groupForCard(result, 'Max deflection').steps[0].substitution, '', 'mixed-load method does not create a formula substitution');
  assert.equal(groupForCard(result, 'Max deflection').steps.length, 2, 'mixed-load path has the general method and engine result only');
  assert.ok(groupForCard(result, 'Max deflection').given.some((datum) => datum.includes('P = 5 kN at x = 2 m')));
  assert.ok(groupForCard(result, 'Max deflection').given.some((datum) => datum.includes('profile points')));
  assert.ok(groupForCard(result, 'Max deflection').given.includes('E·I = 20000 kN·m²'), 'mixed-load deflection lists stiffness as an input, not a fabricated calculation');
  assert.equal(moment.steps.at(-1).value, result.maxMoment.value, 'the separate result step quotes the engine peak');
  assert.ok(moment.steps.at(-1).substitution.includes(`x = ${String(Number(result.maxMoment.position.toPrecision(3)))} m`));
  const deflection = groupForCard(result, 'Max deflection');
  assert.equal(deflection.steps[0].equation, 'E·I·v″(x) = −M(x)');
  assert.equal(deflection.steps[1].value, result.deflection.max.value * 1000);
});

test('shear explanation avoids assuming the left end is a support', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 2 }], supports: { left: 'free', right: 'fixed' } });
  const shear = groupForCard(result, 'Max shear');
  assert.ok(shear.steps[0].explanation.includes('one-sided value is read from the solved diagram'));
  assert.equal(shear.steps[0].value, result.diagrams.shear[0].V);
  assert.equal(shear.steps[2].value, result.diagrams.shear.at(-1).V);
});

test('equilibrium values are quoted verbatim from the engine residual block', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const equilibrium = groupForCard(result, 'Equilibrium');
  assert.deepEqual(equilibrium.steps.map((step) => step.value), [
    result.equilibrium.sumFx, result.equilibrium.sumFy, result.equilibrium.sumMz,
  ]);
  assert.deepEqual(equilibrium.steps.map((step) => step.equation), ['ΣFₓ', 'ΣFᵧ', 'ΣMₐ']);

  const rightCantilever = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 4 }], supports: { left: 'free', right: 'fixed' } });
  const labels = derivationGroups(rightCantilever).flatMap((item) => item.steps.map((step) => `${step.equation} ${step.substitution}`)).join(' ');
  for (const symbol of ['ΣFᵧ', 'ΣM₍wall₎', 'V₍wall₎', 'M₍wall₎', 'M₍B₎']) assert.ok(labels.includes(symbol), symbol);

  const simplySupported = derivationGroups(analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 2 }], supports: pinRoller }))
    .flatMap((item) => item.steps.map((step) => `${step.equation} ${step.substitution}`)).join(' ');
  for (const symbol of ['ΣM₍A₎', 'R₍A₎', 'R₍B₎']) assert.ok(simplySupported.includes(symbol), symbol);
});

test('unsolved and missing results show classification honesty, never fake engineering answers', () => {
  const indeterminate = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: { left: 'pin', right: 'pin' } });
  const explanation = derivationGroups(indeterminate);
  assert.equal(explanation.length, 1);
  assert.ok(explanation[0].title.includes('not solved'));
  assert.ok(allSteps(explanation).some((step) => step.value === indeterminate.classification.unknowns));
  assert.ok(allSteps(explanation).some((step) => step.value === indeterminate.classification.degree));
  assert.ok(allSteps(explanation).every((step) => step.unit === 'unknowns' || step.unit === 'equations' || step.unit === 'degree' || step.value == null));

  const unstable = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: { left: 'roller', right: 'roller' } });
  assert.ok(derivationGroups(unstable)[0].steps.some((step) => step.explanation.includes('mechanism')));
  assert.equal(derivationGroups(null)[0].title, 'Explanation unavailable');
  assert.equal(groupForCard(null, 'Reaction VA').title, 'Explanation unavailable');
});

test('the formatter never mutates its engine result', () => {
  const result = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  const before = JSON.stringify(result);
  derivationGroups(result);
  groupForCard(result, 'Reaction VA');
  assert.equal(JSON.stringify(result), before);
});
