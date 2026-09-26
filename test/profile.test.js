/**
 * profile.test.js — Analytical tests for arbitrary w(x) profiles (Milestone 7).
 * ---------------------------------------------------------------------------
 * Every expected value below is textbook statics worked BY HAND (plan-m7.md
 * §8) — never an engine round-trip. The engine result is compared against
 * these independent numbers.
 *
 * Cases:
 *   A  stepped profile, simply supported — peak INSIDE a segment
 *   B  cross-check against the frozen M5 linear solver (collinear points)
 *   C  gap load as one descriptor — the V ≡ 0 plateau case
 *   D  cantilevers (fixed left / fixed right) with the Case A shape
 *   E  honesty: indeterminate / unstable with a profile → classify only
 *   F  validation (error taxonomy)
 *   G  mixed loads, order independence, physics identities
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam } from '../src/analysis.js';
import { MAX_PROFILE_POINTS } from '../src/loadmodel.js';

const pinRoller = { left: 'pin', right: 'roller' };

function approx(actual, expected, tol, msg) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg}: expected ≈ ${expected}, got ${actual} (|Δ| = ${Math.abs(actual - expected)} > ${tol})`
  );
}

// Case A shape: 4 kN/m on [0,3], 8 kN/m on [3,6] (a step at x = 3).
const stepped = [
  { x: 0, w: 4 },
  { x: 3, w: 4 },
  { x: 3, w: 8 },
  { x: 6, w: 8 },
];
const steppedProfile = { type: 'profile', points: stepped };

// ---------------------------------------------------------------------------
// Case A — stepped profile, simply supported, peak inside a segment.
// R = 12 + 24 = 36 kN; x̄ = (12·1.5 + 24·4.5)/36 = 3.5 m;
// RA = 15, RB = 21; V(3⁺) = 3 → x* = 27/8 = 3.375 m; Mmax = 441/16 = 27.5625.
// ---------------------------------------------------------------------------

test('A: stepped profile — resultant, reactions, equilibrium by hand', () => {
  const r = analyzeBeam({ span: 6, loads: [steppedProfile], supports: pinRoller });
  assert.equal(r.kind, 'beam-profile');
  approx(r.resultant.value, 36, 1e-9, 'R = ΣRᵢ = 12 + 24');
  approx(r.resultant.position, 3.5, 1e-9, 'x̄ = 126/36 = 3.5 m');
  approx(r.reactions.left.Vy, 15, 1e-9, 'RA = 36·2.5/6 = 15 kN');
  approx(r.reactions.right.Vy, 21, 1e-9, 'RB = 36·3.5/6 = 21 kN');
  assert.equal(r.equilibrium.satisfied, true, 'ΣFy and ΣMz self-check');
  // No legacy echoes for a profile (same contract as multi-load).
  assert.equal('intensity' in r.input, false);
  assert.equal('totalLoad' in r, false);
  assert.equal('load' in r.input, false);
});

test('A: shear — jump-free at the step, zero inside the second segment', () => {
  const r = analyzeBeam({ span: 6, samples: 601, loads: [steppedProfile], supports: pinRoller });
  const Vat = (x) => r.diagrams.shear.find((p) => Math.abs(p.x - x) < 1e-9).V;
  approx(Vat(0.5), 13, 1e-9, 'V(0.5) = 15 − 4·0.5');
  approx(Vat(2.5), 5, 1e-9, 'V(2.5) = 15 − 4·2.5');
  approx(Vat(3.5), 3 - 4, 1e-9, 'V(3.5) = 3 − 8·0.5 = −1');
  // Intensity jump only: V is C⁰ at x = 3 — exactly ONE ordinate there.
  const at3 = r.diagrams.shear.filter((p) => Math.abs(p.x - 3) < 1e-9);
  assert.equal(at3.length, 1, 'no shear jump pair at an intensity step');
  approx(at3[0].V, 3, 1e-9, 'V(3) = 3 (continuous through the step)');
  approx(Vat(5), 3 - 8 * 2, 1e-9, 'V(5) = 3 − 8·2 = −13');
  approx(Vat(5.99), 15 - 12 - 8 * 2.99, 1e-9, 'V(5.99) = 3 − 8·2.99 = −20.92 (→ −RB = −21)');
});

test('A: peak moment 441/16 = 27.5625 kNm at x* = 3.375 m (inside a segment)', () => {
  const r = analyzeBeam({ span: 6, loads: [steppedProfile], supports: pinRoller });
  approx(r.maxMoment.value, 441 / 16, 1e-9, 'Mmax = 441/16 kNm');
  approx(r.maxMoment.position, 27 / 8, 1e-9, 'x* = 27/8 = 3.375 m');
  assert.equal(r.maxMoment.sign, 'sagging');
  // Verified from BOTH sides of x* (plan §8): M(3) = 15·3 − 12·1.5 = 27;
  // right branch M(x) = 21(6−x) − 4(6−x)² at x = 27/8 also gives 441/16.
  const Mat = (x) => r.diagrams.moment.find((p) => Math.abs(p.x - x) < 1e-9).M;
  approx(Mat(3), 27, 1e-9, 'M(3) = 27 kNm');
  approx(Mat(1.5), 15 * 1.5 - 2 * 1.5 * 1.5, 1e-9, 'M(1.5) = 15·1.5 − 4·1.5²/2 = 18 kNm');
});

test('A: superposition cross-check — two stacked linear loads agree pointwise', () => {
  // The SAME shape built as two `linear` descriptors through the M6 path.
  const stacked = analyzeBeam({
    span: 6,
    loads: [
      { type: 'linear', start: 0, end: 3, wStart: 4, wEnd: 4 },
      { type: 'linear', start: 3, end: 6, wStart: 8, wEnd: 8 },
    ],
    supports: pinRoller,
  });
  const single = analyzeBeam({ span: 6, loads: [steppedProfile], supports: pinRoller });
  assert.equal(stacked.kind, 'beam-multi-load');
  approx(single.reactions.left.Vy, stacked.reactions.left.Vy, 1e-9, 'RA agrees');
  approx(single.reactions.right.Vy, stacked.reactions.right.Vy, 1e-9, 'RB agrees');
  approx(single.maxMoment.value, stacked.maxMoment.value, 1e-9, 'Mmax agrees pointwise');
  // The M6 lesson, restated: the single peak is NOT the sum of the pieces' peaks.
  const piece1 = analyzeBeam({ span: 6, loads: [{ type: 'linear', start: 0, end: 3, wStart: 4, wEnd: 4 }], supports: pinRoller });
  const piece2 = analyzeBeam({ span: 6, loads: [{ type: 'linear', start: 3, end: 6, wStart: 8, wEnd: 8 }], supports: pinRoller });
  assert.ok(
    Math.abs(single.maxMoment.value - (piece1.maxMoment.value + piece2.maxMoment.value)) > 1,
    'Mmax ≠ ΣMmax,i (superposition is pointwise, not of maxima)'
  );
});

// ---------------------------------------------------------------------------
// Case B — three collinear points must agree with the FROZEN M5 linear solver.
// ---------------------------------------------------------------------------

test('B: collinear profile ≡ frozen linear solver to 1e-9 (reactions, diagrams, peak)', () => {
  const prof = analyzeBeam({
    span: 6,
    loads: [{ type: 'profile', points: [{ x: 0, w: 0 }, { x: 3, w: 6 }, { x: 6, w: 12 }] }],
    supports: pinRoller,
  });
  const lin = analyzeBeam({
    span: 6,
    loads: [{ type: 'linear', start: 0, end: 6, wStart: 0, wEnd: 12 }],
    supports: pinRoller,
  });
  // Hand values (plan §8): R = 36, x̄ = 4, RA = 12, RB = 24,
  // peak at 2√3 ≈ 3.4641 with Mmax = 16√3 ≈ 27.7128.
  approx(prof.resultant.value, 36, 1e-9, 'R = 36');
  approx(prof.resultant.position, 4, 1e-9, 'x̄ = 4 m');
  approx(prof.reactions.left.Vy, 12, 1e-9, 'RA = 12');
  approx(prof.reactions.right.Vy, 24, 1e-9, 'RB = 24');
  approx(prof.maxMoment.value, 16 * Math.sqrt(3), 1e-9, 'Mmax = 16√3');
  approx(prof.maxMoment.position, 2 * Math.sqrt(3), 1e-9, 'x* = 2√3');
  // Path equivalence, field by field:
  approx(prof.maxMoment.value, lin.maxMoment.value, 1e-9, 'Mmax matches frozen solver');
  approx(prof.maxMoment.position, lin.maxMoment.position, 1e-9, 'x* matches frozen solver');
  assert.equal(prof.diagrams.shear.length, lin.diagrams.shear.length, 'same shear ordinates');
  prof.diagrams.shear.forEach((p, i) => {
    approx(p.x, lin.diagrams.shear[i].x, 1e-9, `shear[${i}].x`);
    approx(p.V, lin.diagrams.shear[i].V, 1e-9, `shear[${i}].V`);
  });
  assert.equal(prof.diagrams.moment.length, lin.diagrams.moment.length, 'same moment ordinates');
  prof.diagrams.moment.forEach((p, i) => {
    approx(p.M, lin.diagrams.moment[i].M, 1e-9, `moment[${i}].M`);
  });
});

// ---------------------------------------------------------------------------
// Case C — gap load as ONE descriptor (the V ≡ 0 plateau case).
// 3 kN/m over [1,2] and [4,5]: R = 6, x̄ = 3, RA = RB = 3; M ≡ 4.5 on [2,4].
// ---------------------------------------------------------------------------

const gapProfile = {
  type: 'profile',
  points: [
    { x: 1, w: 3 }, { x: 2, w: 3 }, { x: 2, w: 0 },
    { x: 4, w: 0 }, { x: 4, w: 3 }, { x: 5, w: 3 },
  ],
};

test('C: gap profile — resultant and reactions by hand', () => {
  const r = analyzeBeam({ span: 6, loads: [gapProfile], supports: pinRoller });
  approx(r.resultant.value, 6, 1e-9, 'R = 3 + 3 = 6 kN');
  approx(r.resultant.position, 3, 1e-9, 'x̄ = 3 m (symmetric)');
  approx(r.reactions.left.Vy, 3, 1e-9, 'RA = 3 kN');
  approx(r.reactions.right.Vy, 3, 1e-9, 'RB = 3 kN');
});

test('C: V ≡ 0 plateau and constant moment on [2,4]; Mmax = 4.5 kNm', () => {
  const r = analyzeBeam({ span: 6, loads: [gapProfile], supports: pinRoller });
  const Vat = (x) => r.diagrams.shear.find((p) => Math.abs(p.x - x) < 1e-9).V;
  approx(Vat(1.5), 1.5, 1e-9, 'V(1.5) = RA − 3·0.5 = 1.5');
  const Mat = (x) => r.diagrams.moment.find((p) => Math.abs(p.x - x) < 1e-9).M;
  approx(Mat(2), 4.5, 1e-9, 'M(2) = 3·1.5 = 4.5 kNm');
  approx(Mat(3), 4.5, 1e-9, 'M constant on the gap');
  approx(Mat(4), 4.5, 1e-9, 'M still 4.5 at x = 4');
  approx(r.maxMoment.value, 4.5, 1e-9, 'Mmax = 4.5 kNm (achieved on an interval)');
  assert.ok(r.maxMoment.position >= 2 - 1e-9 && r.maxMoment.position <= 4 + 1e-9,
    `peak position on the plateau (got ${r.maxMoment.position})`);
});

test('C: gap profile ≡ two stacked linear loads pointwise', () => {
  const stacked = analyzeBeam({
    span: 6,
    loads: [
      { type: 'linear', start: 1, end: 2, wStart: 3, wEnd: 3 },
      { type: 'linear', start: 4, end: 5, wStart: 3, wEnd: 3 },
    ],
    supports: pinRoller,
  });
  const single = analyzeBeam({ span: 6, loads: [gapProfile], supports: pinRoller });
  approx(single.maxMoment.value, stacked.maxMoment.value, 1e-9, 'Mmax agrees');
  approx(single.maxMoment.position, stacked.maxMoment.position, 1e-9, 'peak x agrees');
  assert.equal(single.diagrams.shear.length, stacked.diagrams.shear.length, 'same ordinates');
  single.diagrams.shear.forEach((p, i) => {
    approx(p.V, stacked.diagrams.shear[i].V, 1e-9, `shear[${i}].V`);
  });
});

// ---------------------------------------------------------------------------
// Case D — cantilevers with the Case A shape.
// Fixed-left: V_A = 36 kN, M_A = R·x̄ = 126 kNm hogging at x = 0.
// Fixed-right mirror: M_B = R·(L − x̄) = 90 kNm hogging at x = 6.
// ---------------------------------------------------------------------------

test('D: fixed-left cantilever — V_A = 36, M_A = 126 kNm hogging at the wall', () => {
  const r = analyzeBeam({ span: 6, loads: [steppedProfile], supports: { left: 'fixed', right: 'free' } });
  approx(r.reactions.left.Vy, 36, 1e-9, 'V_A = R = 36 kN');
  approx(r.reactions.left.Mz, 126, 1e-9, 'M_A = R·x̄ = 126 kNm');
  assert.equal(r.maxMoment.sign, 'hogging');
  approx(r.maxMoment.value, 126, 1e-9, '|M|max at the wall');
  approx(r.maxMoment.position, 0, 1e-9, 'at x = 0');
  const Mfree = r.diagrams.moment[r.diagrams.moment.length - 1].M;
  approx(Mfree, 0, 1e-9, 'free end carries no moment');
});

test('D: fixed-right cantilever — M_B = 90 kNm hogging at x = L', () => {
  const r = analyzeBeam({ span: 6, loads: [steppedProfile], supports: { left: 'free', right: 'fixed' } });
  approx(r.reactions.right.Vy, 36, 1e-9, 'V_B = R = 36 kN');
  approx(r.reactions.right.Mz, 90, 1e-9, 'M_B = R·(L − x̄) = 36·2.5 = 90 kNm');
  approx(r.maxMoment.value, 90, 1e-9, '|M|max at the right wall');
  approx(r.maxMoment.position, 6, 1e-9, 'at x = L');
});

// ---------------------------------------------------------------------------
// Case E — honesty with a profile: indeterminate / unstable → classify only.
// ---------------------------------------------------------------------------

test('E: pin+pin with a profile — classified only, resultant still a load property', () => {
  const r = analyzeBeam({ span: 6, loads: [steppedProfile], supports: { left: 'pin', right: 'pin' } });
  assert.equal(r.classification.status, 'indeterminate');
  assert.equal(r.classification.degree, 1);
  assert.equal('reactions' in r, false, 'no reactions');
  assert.equal('diagrams' in r, false, 'no diagrams');
  assert.equal('maxMoment' in r, false, 'no max moment');
  approx(r.resultant.value, 36, 1e-9, 'resultant is a load property — still emitted');
  approx(r.resultant.position, 3.5, 1e-9, 'x̄ still emitted');
});

test('E: free+free with a profile — unstable, classified only', () => {
  const r = analyzeBeam({ span: 6, loads: [steppedProfile], supports: { left: 'free', right: 'free' } });
  assert.equal(r.classification.status, 'unstable');
  assert.equal('reactions' in r, false);
  assert.equal('diagrams' in r, false);
  assert.equal('maxMoment' in r, false);
  approx(r.resultant.value, 36, 1e-9, 'resultant still emitted');
});

// ---------------------------------------------------------------------------
// Case F — validation (same error taxonomy as the existing descriptors).
// ---------------------------------------------------------------------------

test('F: profile validation — structure errors', () => {
  const bad = (loads) => () => analyzeBeam({ span: 6, loads, supports: pinRoller });
  assert.throws(bad(['not an object']), TypeError, 'non-object descriptor → TypeError');
  assert.throws(bad([{ type: 'wobble' }]), TypeError, 'unknown type → TypeError');
  assert.throws(bad([{ type: 'profile', points: 'nope' }]), TypeError, 'points not an array → TypeError');
  assert.throws(bad([{ type: 'profile', points: [5, 6] }]), TypeError, 'point member not an object → TypeError');
  assert.throws(
    bad([{ type: 'profile', points: [{ x: 0, w: 4 }] }]),
    RangeError,
    '1 point → RangeError'
  );
  assert.throws(
    bad([{ type: 'profile', points: [{ x: 0, w: 4 }, { x: 1, w: 4 }, { x: 2, w: 4 }, { x: 3, w: 4 }, { x: 4, w: 4 }, { x: 5, w: 4 }, { x: 6, w: 4 }] }]),
    RangeError,
    '7 points → RangeError'
  );
});

test('F: profile validation — value errors', () => {
  const bad = (points) => () =>
    analyzeBeam({ span: 6, loads: [{ type: 'profile', points }], supports: pinRoller });
  assert.throws(bad([{ x: -0.5, w: 4 }, { x: 3, w: 4 }]), RangeError, 'x < 0 → RangeError');
  assert.throws(bad([{ x: 0, w: 4 }, { x: 6.5, w: 4 }]), RangeError, 'x > span → RangeError');
  assert.throws(bad([{ x: 3, w: 4 }, { x: 2, w: 4 }]), RangeError, 'descending x → RangeError');
  assert.throws(bad([{ x: 0, w: 4 }, { x: 3, w: -1 }]), RangeError, 'negative w → RangeError');
  assert.throws(bad([{ x: 0, w: 0 }, { x: 6, w: 0 }]), RangeError, 'all-zero profile → RangeError');
  assert.throws(bad([{ x: 0, w: NaN }, { x: 3, w: 4 }]), TypeError, 'NaN w → TypeError');
  assert.throws(bad([{ x: 'a', w: 4 }, { x: 3, w: 4 }]), TypeError, 'non-numeric x → TypeError');
});

test('F: M6 rules unchanged alongside the new descriptor', () => {
  assert.throws(() => analyzeBeam({ span: 6, loads: [], supports: pinRoller }), RangeError, 'empty loads');
  assert.throws(
    () => analyzeBeam({
      span: 6,
      loads: [1, 2, 3, 4, 5, 6, 7].map((i) => ({ type: 'point', magnitude: 1, position: 0.5 * i })),
      supports: pinRoller,
    }),
    RangeError,
    '7 loads → RangeError'
  );
  assert.throws(() => analyzeBeam({ span: 6, loads: 'nope', supports: pinRoller }), TypeError, 'loads not an array');
  // The cap is exported for the UI's + Add point control.
  assert.equal(MAX_PROFILE_POINTS, 6);
});

// ---------------------------------------------------------------------------
// Case G — mixed loads, order independence, physics identities.
// Profile (Case A shape) + point P = 5 kN @ 2 m, L = 6:
// R = 41, x̄ = 136/41 ≈ 3.3171; RA = 55/3, RB = 68/3; x* = 19/6; Mmax = 289/9.
// ---------------------------------------------------------------------------

test('G: profile + point load — reactions and resultant by hand', () => {
  const r = analyzeBeam({
    span: 6,
    loads: [steppedProfile, { type: 'point', magnitude: 5, position: 2 }],
    supports: pinRoller,
  });
  assert.equal(r.kind, 'beam-multi-load', 'a profile mixed with others takes the multi-load kind');
  approx(r.resultant.value, 41, 1e-9, 'R = 36 + 5 = 41 kN');
  approx(r.resultant.position, 136 / 41, 1e-9, 'x̄ = 136/41 ≈ 3.3171 m');
  approx(r.reactions.left.Vy, 55 / 3, 1e-9, 'RA = 55/3 ≈ 18.333 kN');
  approx(r.reactions.right.Vy, 68 / 3, 1e-9, 'RB = 68/3 ≈ 22.667 kN');
  assert.equal(r.equilibrium.satisfied, true);
});

test('G: shear jump at the point load, continuous through the step, peak at 19/6', () => {
  const r = analyzeBeam({
    span: 6,
    loads: [steppedProfile, { type: 'point', magnitude: 5, position: 2 }],
    supports: pinRoller,
  });
  const pairsAt = (x) => r.diagrams.shear.filter((p) => Math.abs(p.x - x) < 1e-9);
  approx(pairsAt(2).length, 2, 0, 'two one-sided shear ordinates at the point load');
  approx(Math.max(...pairsAt(2).map((p) => p.V)), 31 / 3, 1e-9, 'V(2⁻) = 31/3');
  approx(Math.min(...pairsAt(2).map((p) => p.V)), 16 / 3, 1e-9, 'V(2⁺) = 16/3 (jump −5)');
  assert.equal(pairsAt(3).length, 1, 'one ordinate at the intensity step x = 3');
  approx(pairsAt(3)[0].V, 4 / 3, 1e-9, 'V(3) = 4/3 (no jump at a profile step)');
  approx(r.maxMoment.value, 289 / 9, 1e-9, 'Mmax = 289/9 ≈ 32.1111 kNm');
  approx(r.maxMoment.position, 19 / 6, 1e-9, 'x* = 19/6 ≈ 3.1667 m');
});

test('G: order independence — permuting the load list changes nothing', () => {
  const a = analyzeBeam({
    span: 6,
    loads: [steppedProfile, { type: 'point', magnitude: 5, position: 2 }],
    supports: pinRoller,
  });
  const b = analyzeBeam({
    span: 6,
    loads: [{ type: 'point', magnitude: 5, position: 2 }, steppedProfile],
    supports: pinRoller,
  });
  approx(a.reactions.left.Vy, b.reactions.left.Vy, 1e-9, 'RA');
  approx(a.reactions.right.Vy, b.reactions.right.Vy, 1e-9, 'RB');
  approx(a.maxMoment.value, b.maxMoment.value, 1e-9, 'Mmax');
  approx(a.maxMoment.position, b.maxMoment.position, 1e-9, 'x*');
  assert.equal(a.diagrams.shear.length, b.diagrams.shear.length, 'same sampled ordinates');
  a.diagrams.shear.forEach((p, i) => approx(p.V, b.diagrams.shear[i].V, 1e-9, `shear[${i}].V`));
});

test('G: doubling every load doubles R, reactions and Mmax (linearity)', () => {
  const base = analyzeBeam({
    span: 6,
    loads: [steppedProfile, { type: 'point', magnitude: 5, position: 2 }],
    supports: pinRoller,
  });
  const dbl = analyzeBeam({
    span: 6,
    loads: [
      { type: 'profile', points: stepped.map((p) => ({ x: p.x, w: 2 * p.w })) },
      { type: 'point', magnitude: 10, position: 2 },
    ],
    supports: pinRoller,
  });
  approx(dbl.resultant.value, 2 * base.resultant.value, 1e-9, 'R doubles');
  approx(dbl.reactions.left.Vy, 2 * base.reactions.left.Vy, 1e-9, 'RA doubles');
  approx(dbl.reactions.right.Vy, 2 * base.reactions.right.Vy, 1e-9, 'RB doubles');
  approx(dbl.maxMoment.value, 2 * base.maxMoment.value, 1e-9, 'Mmax doubles');
});

test('G: dM/dx = V and dV/dx = −w on uniform stencils away from every event', () => {
  const r = analyzeBeam({
    span: 6,
    samples: 401,
    loads: [steppedProfile, { type: 'point', magnitude: 5, position: 2 }],
    supports: pinRoller,
  });
  const events = [0, 2, 3, 6];
  const nearEvent = (x) => events.some((e) => Math.abs(x - e) < 1e-9);
  const wOf = (x) => (x < 3 ? 4 : 8); // profile intensity (downward)
  const Vof = (x) => {
    const cands = r.diagrams.shear.filter((p) => Math.abs(p.x - x) < 1e-9);
    return cands.length === 1 ? cands[0].V : NaN; // only stencils off the jump
  };
  const M = r.diagrams.moment;
  let checkedM = 0;
  let checkedV = 0;
  for (let i = 1; i < M.length - 1; i++) {
    const x0 = M[i - 1].x, x1 = M[i].x, x2 = M[i + 1].x;
    const h1 = x1 - x0, h2 = x2 - x1;
    if (Math.abs(h1 - h2) > 1e-9) continue;            // stencil must be uniform
    if (nearEvent(x0) || nearEvent(x1) || nearEvent(x2)) continue;
    const V1 = Vof(x1);
    if (!Number.isFinite(V1)) continue;
    approx((M[i + 1].M - M[i - 1].M) / (2 * h1), V1, 1e-5, `dM/dx = V at x=${x1.toFixed(3)}`);
    checkedM++;
    if (x1 > 0 && x1 < 6) {
      approx((Vof(x2) - Vof(x0)) / (2 * h1), -wOf(x1), 1e-5, `dV/dx = −w at x=${x1.toFixed(3)}`);
      checkedV++;
    }
  }
  assert.ok(checkedM > 50 && checkedV > 50, `enough clean stencils exercised (M:${checkedM}, V:${checkedV})`);
});
