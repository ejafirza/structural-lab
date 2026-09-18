/**
 * Analytical validation tests for the Milestone 1 engineering core.
 *
 * Every expected value below is a closed-form textbook result, not a value
 * produced by the engine itself. Run: npm test
 */
import { test } from 'node:test';
import { solveSimplySupportedPointLoad } from '../src/engine.js';
import assert from 'node:assert/strict';

const close = (actual, expected, tol = 1e-9, label = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label} expected ${expected}, got ${actual}`
  );

// ---------------------------------------------------------------------------
// 1. Brief reference case (symmetric central point load)
// ---------------------------------------------------------------------------
test('reference case: L=6, P=10, a=3 → RA=RB=5 kN, Mmax=15 kNm', () => {
  const r = solveSimplySupportedPointLoad({ span: 6, load: 10, position: 3 });
  close(r.reactions.RA, 5, 1e-9, 'RA');
  close(r.reactions.RB, 5, 1e-9, 'RB');
  close(r.maxMoment.value, 15, 1e-9, 'Mmax');
  close(r.maxMoment.position, 3, 1e-9, 'Mmax position');
  assert.equal(r.equilibrium.satisfied, true);
});

// ---------------------------------------------------------------------------
// 2. Load closer to the LEFT support
// ---------------------------------------------------------------------------
test('load near left: L=6, P=10, a=2 → RA=20/3, RB=10/3, Mmax=40/3', () => {
  const r = solveSimplySupportedPointLoad({ span: 6, load: 10, position: 2 });
  close(r.reactions.RA, (10 * 4) / 6, 1e-9, 'RA');
  close(r.reactions.RB, (10 * 2) / 6, 1e-9, 'RB');
  close(r.maxMoment.value, (10 * 2 * 4) / 6, 1e-9, 'Mmax');
  close(r.maxMoment.position, 2, 1e-9, 'Mmax position');
  assert.equal(r.equilibrium.satisfied, true);
});

// ---------------------------------------------------------------------------
// 3. Load closer to the RIGHT support (mirror of case 2)
// ---------------------------------------------------------------------------
test('load near right: L=6, P=10, a=4 mirrors a=2', () => {
  const r = solveSimplySupportedPointLoad({ span: 6, load: 10, position: 4 });
  close(r.reactions.RA, (10 * 2) / 6, 1e-9, 'RA');
  close(r.reactions.RB, (10 * 4) / 6, 1e-9, 'RB');
  close(r.maxMoment.value, (10 * 4 * 2) / 6, 1e-9, 'Mmax');
  close(r.maxMoment.position, 4, 1e-9, 'Mmax position');
  assert.equal(r.equilibrium.satisfied, true);
});

// ---------------------------------------------------------------------------
// 4. Different load magnitudes (linear scaling in P)
// ---------------------------------------------------------------------------
test('doubling P doubles reactions and Mmax (L=6, a=3)', () => {
  const r1 = solveSimplySupportedPointLoad({ span: 6, load: 5, position: 3 });
  const r2 = solveSimplySupportedPointLoad({ span: 6, load: 10, position: 3 });
  close(r2.reactions.RA, 2 * r1.reactions.RA, 1e-9, 'RA scaling');
  close(r2.reactions.RB, 2 * r1.reactions.RB, 1e-9, 'RB scaling');
  close(r2.maxMoment.value, 2 * r1.maxMoment.value, 1e-9, 'Mmax scaling');
});

// ---------------------------------------------------------------------------
// 5. Different spans (quadratic effect on Mmax at fixed a/L ratio)
// ---------------------------------------------------------------------------
test('doubling span doubles Mmax for mid-span load (Mmax = PL/4, linear in L)', () => {
  const r1 = solveSimplySupportedPointLoad({ span: 6, load: 10, position: 3 });
  const r2 = solveSimplySupportedPointLoad({ span: 12, load: 10, position: 6 });
  close(r2.maxMoment.value, 2 * r1.maxMoment.value, 1e-9, 'Mmax');
  // Reactions stay 5/5: load still at mid-span.
  close(r2.reactions.RA, 5, 1e-9, 'RA');
  close(r2.reactions.RB, 5, 1e-9, 'RB');
});

test('unequal-span geometry: L=10, P=20, a=4 → RA=12, RB=8, Mmax=48', () => {
  const r = solveSimplySupportedPointLoad({ span: 10, load: 20, position: 4 });
  close(r.reactions.RA, 12, 1e-9, 'RA');
  close(r.reactions.RB, 8, 1e-9, 'RB');
  close(r.maxMoment.value, 48, 1e-9, 'Mmax');
});

// ---------------------------------------------------------------------------
// 6. Boundary conditions: M = 0 at both supports, shear plateau values
// ---------------------------------------------------------------------------
test('M = 0 at both supports; shear is +RA then −RB across the load', () => {
  const L = 6, P = 10, a = 2;
  const r = solveSimplySupportedPointLoad({ span: L, load: P, position: a });

  const m0 = r.diagrams.moment.find((p) => p.x === 0);
  const mL = r.diagrams.moment.find((p) => Math.abs(p.x - L) < 1e-12);
  close(m0.M, 0, 1e-9, 'M(0)');
  close(mL.M, 0, 1e-9, 'M(L)');

  // Shear jump exposed explicitly: just left of load = +RA = +6.667,
  // just right = RA − P = −3.333, drop equals P.
  close(r.diagrams.shearJump.left, (P * 4) / 6, 1e-9, 'V just left of load');
  close(r.diagrams.shearJump.right, (P * 4) / 6 - P, 1e-9, 'V just right of load');
  close(r.diagrams.shearJump.drop, P, 1e-9, 'shear drop equals P');
  close(r.diagrams.shearJump.x, a, 1e-9, 'jump position');

  // Moment under the load equals RA·a and equals RB·b (two independent forms)
  const underLoad = r.diagrams.moment.find((p) => p.x === a);
  close(underLoad.M, r.reactions.RA * a, 1e-9, 'M(a) = RA·a');
  close(underLoad.M, r.reactions.RB * (L - a), 1e-9, 'M(a) = RB·b');
});

// ---------------------------------------------------------------------------
// 7. dM/dx = V relationship sampled across the span
// ---------------------------------------------------------------------------
test('dM/dx = V holds within both segments (numerical derivative)', () => {
  const L = 6, P = 10, a = 4;
  const r = solveSimplySupportedPointLoad({ span: L, load: P, position: a });
  const m = r.diagrams.moment.filter((p) => p.x > 0 && p.x < L);
  for (let i = 1; i < m.length; i++) {
    const dx = m[i].x - m[i - 1].x;
    if (dx < 1e-9) continue; // skip duplicate x (same x, same M)
    const dMdx = (m[i].M - m[i - 1].M) / dx;
    // Both points on the same side of the load?
    const sameSide = (m[i].x <= a && m[i - 1].x <= a) || (m[i].x >= a && m[i - 1].x >= a);
    if (!sameSide) continue;
    // V on the segment between the two points (segments never straddle a).
    const V = m[i].x <= a ? r.diagrams.shearJump.left : r.diagrams.shearJump.right;
    close(dMdx, V, 1e-6, `dM/dx at x=${m[i].x.toFixed(3)}`);
  }
});

// ---------------------------------------------------------------------------
// 8. Input validation
// ---------------------------------------------------------------------------
test('rejects invalid inputs', () => {
  assert.throws(() => solveSimplySupportedPointLoad({ span: 0, load: 10, position: 1 }), RangeError);
  assert.throws(() => solveSimplySupportedPointLoad({ span: -6, load: 10, position: 2 }), RangeError);
  assert.throws(() => solveSimplySupportedPointLoad({ span: 6, load: 0, position: 2 }), RangeError);
  assert.throws(() => solveSimplySupportedPointLoad({ span: 6, load: -10, position: 2 }), RangeError);
  assert.throws(() => solveSimplySupportedPointLoad({ span: 6, load: 10, position: 0 }), RangeError);
  assert.throws(() => solveSimplySupportedPointLoad({ span: 6, load: 10, position: 6 }), RangeError);
  assert.throws(() => solveSimplySupportedPointLoad({ span: 6, load: 10, position: 7 }), RangeError);
  assert.throws(() => solveSimplySupportedPointLoad({ span: 6, load: 'big', position: 2 }), TypeError);
  assert.throws(() => solveSimplySupportedPointLoad({ span: NaN, load: 10, position: 2 }), TypeError);
  assert.throws(() => solveSimplySupportedPointLoad({ span: 6, load: 10 }), TypeError);
  assert.throws(() => solveSimplySupportedPointLoad(), TypeError);
});
