/**
 * Beam analysis tests (Milestone 3).
 * Closed-form textbook values for the cantilever, cross-checks against the
 * frozen Milestone 1 solver, and "honesty" checks that indeterminate /
 * unstable cases are classified WITHOUT fabricating reactions or diagrams.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam } from '../src/analysis.js';
import { solveSimplySupportedPointLoad } from '../src/engine.js';

const close = (actual, expected, tol = 1e-9, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label} expected ${expected}, got ${actual}`);

// ---------------------------------------------------------------------------
// 1. Cantilever, fixed at LEFT (the primary cantilever case)
//    L=6, P=10, a=2  →  H_A=0, V_A=P=10, M_A=P·a=20 (hogging)
// ---------------------------------------------------------------------------
test('cantilever fixed-left: H=0, V=P, M=P·a, shear +P→0, M=P(x−a)', () => {
  const r = analyzeBeam({ span: 6, load: 10, position: 2, supports: { left: 'fixed', right: 'free' } });

  assert.equal(r.classification.status, 'determinate');
  assert.deepEqual(r.reactions.left, { type: 'fixed', Hx: 0, Vy: 10, Mz: 20 });
  assert.deepEqual(r.reactions.right, { type: 'free' });

  // Shear: +P on [0,a), 0 on (a,L]; jump drop = P
  close(r.diagrams.shearJump.left, 10, 1e-9, 'V just left of load');
  close(r.diagrams.shearJump.right, 0, 1e-9, 'V just right of load');
  close(r.diagrams.shearJump.drop, 10, 1e-9, 'shear drop = P');
  close(r.diagrams.shearJump.x, 2, 1e-9, 'jump position');

  // Moment: hogging (negative) from fixed end to load, zero beyond.
  const m0 = r.diagrams.moment.find((p) => p.x === 0);
  const ma = r.diagrams.moment.find((p) => p.x === 2);
  const mL = r.diagrams.moment.find((p) => Math.abs(p.x - 6) < 1e-12);
  close(m0.M, -20, 1e-9, 'M(0) = −P·a');
  close(ma.M, 0, 1e-9, 'M(a) = 0 under the load');
  close(mL.M, 0, 1e-9, 'M(L) = 0 at the free end');

  close(r.maxMoment.value, 20, 1e-9, '|M|max = P·a');
  close(r.maxMoment.position, 0, 1e-9, 'peak at the fixed support');
  assert.equal(r.maxMoment.sign, 'hogging');

  assert.equal(r.equilibrium.satisfied, true);
  close(r.equilibrium.sumFy, 0, 1e-9, 'ΣFy');
  close(r.equilibrium.sumMz, 0, 1e-9, 'ΣM');
});

// ---------------------------------------------------------------------------
// 2. Cantilever, fixed at RIGHT (mirror). Load at a=2 from the left end,
//    i.e. b = L − a = 4 from the fixed end → M_B = P·b = 40.
// ---------------------------------------------------------------------------
test('cantilever fixed-right: M=P·b at the right support, shear 0→−P', () => {
  const r = analyzeBeam({ span: 6, load: 10, position: 2, supports: { left: 'free', right: 'fixed' } });

  assert.deepEqual(r.reactions.left, { type: 'free' });
  assert.deepEqual(r.reactions.right, { type: 'fixed', Hx: 0, Vy: 10, Mz: 40 });

  close(r.diagrams.shearJump.left, 0, 1e-9, 'V left of load (free side)');
  close(r.diagrams.shearJump.right, -10, 1e-9, 'V right of load (loaded side)');

  const mL = r.diagrams.moment.find((p) => Math.abs(p.x - 6) < 1e-12);
  close(mL.M, -40, 1e-9, 'M(L) = −P·b at the fixed end');

  close(r.maxMoment.value, 40, 1e-9, '|M|max = P·b');
  close(r.maxMoment.position, 6, 1e-9, 'peak at the fixed support');
  assert.equal(r.maxMoment.sign, 'hogging');
  assert.equal(r.equilibrium.satisfied, true);
});

// ---------------------------------------------------------------------------
// 3. dM/dx = V on both cantilever segments (numerical derivative)
// ---------------------------------------------------------------------------
test('cantilever: dM/dx = V holds on each segment', () => {
  const L = 6, P = 10, a = 2;
  const r = analyzeBeam({ span: L, load: P, position: a, supports: { left: 'fixed', right: 'free' } });
  const m = r.diagrams.moment.filter((p) => p.x > 0 && p.x < L);
  for (let i = 1; i < m.length; i++) {
    const dx = m[i].x - m[i - 1].x;
    if (dx < 1e-9) continue;
    const dMdx = (m[i].M - m[i - 1].M) / dx;
    const sameSide = (m[i].x <= a && m[i - 1].x <= a) || (m[i].x >= a && m[i - 1].x >= a);
    if (!sameSide) continue;
    const V = m[i].x <= a ? r.diagrams.shearJump.left : r.diagrams.shearJump.right;
    close(dMdx, V, 1e-6, `dM/dx at x=${m[i].x.toFixed(3)}`);
  }
});

// ---------------------------------------------------------------------------
// 4. Simply supported via analyzeBeam reproduces the frozen M1 solver exactly
// ---------------------------------------------------------------------------
test('analyzeBeam(pin,roller) matches solveSimplySupportedPointLoad (reference)', () => {
  const input = { span: 6, load: 10, position: 3 };
  const viaM3 = analyzeBeam({ ...input, supports: { left: 'pin', right: 'roller' } });
  const viaM1 = solveSimplySupportedPointLoad(input);

  assert.equal(viaM3.classification.status, 'determinate');
  close(viaM3.reactions.left.Vy, viaM1.reactions.RA, 1e-12, 'left Vy = RA');
  close(viaM3.reactions.right.Vy, viaM1.reactions.RB, 1e-12, 'right Vy = RB');
  close(viaM3.maxMoment.value, viaM1.maxMoment.value, 1e-12, 'Mmax');
  assert.equal(viaM3.maxMoment.sign, 'sagging');
  assert.equal(viaM3.reactions.left.Hx, 0, 'pin develops H but it is zero (no horizontal load)');
  assert.deepEqual(viaM3.diagrams.shearJump, viaM1.diagrams.shearJump);
  assert.equal(viaM3.equilibrium.satisfied, true);
});

test('analyzeBeam(roller,pin) gives mirrored reactions for an off-center load', () => {
  const r = analyzeBeam({ span: 6, load: 10, position: 2, supports: { left: 'roller', right: 'pin' } });
  close(r.reactions.left.Vy, (10 * 4) / 6, 1e-9, 'left (roller) Vy');
  close(r.reactions.right.Vy, (10 * 2) / 6, 1e-9, 'right (pin) Vy');
  assert.equal(r.reactions.right.Hx, 0);
});

// ---------------------------------------------------------------------------
// 5. Honesty: indeterminate & unstable are classified, never "solved"
// ---------------------------------------------------------------------------
test('indeterminate cases return classification only (no fabricated numbers)', () => {
  const r = analyzeBeam({ span: 6, load: 10, position: 3, supports: { left: 'pin', right: 'pin' } });
  assert.equal(r.classification.status, 'indeterminate');
  assert.equal(r.classification.degree, 1);
  assert.ok(!('reactions' in r), 'no reactions fabricated');
  assert.ok(!('diagrams' in r), 'no diagrams fabricated');
  assert.ok(!('maxMoment' in r), 'no moment fabricated');
  assert.ok(!('equilibrium' in r), 'no equilibrium check');
});

test('unstable cases return classification only, naming the mechanism', () => {
  const r = analyzeBeam({ span: 6, load: 10, position: 3, supports: { left: 'free', right: 'free' } });
  assert.equal(r.classification.status, 'unstable');
  assert.ok(r.classification.unconstrained.length > 0);
  assert.ok(!('reactions' in r));
  assert.ok(!('diagrams' in r));
  assert.ok(!('maxMoment' in r));
});

// ---------------------------------------------------------------------------
// 6. Input validation (consistent with M1, plus supports)
// ---------------------------------------------------------------------------
test('analyzeBeam rejects invalid inputs', () => {
  const base = { span: 6, load: 10, position: 3, supports: { left: 'pin', right: 'roller' } };
  assert.throws(() => analyzeBeam({ ...base, span: 0 }), RangeError);
  assert.throws(() => analyzeBeam({ ...base, load: -10 }), RangeError);
  assert.throws(() => analyzeBeam({ ...base, position: 6 }), RangeError);
  assert.throws(() => analyzeBeam({ ...base, position: 0 }), RangeError);
  assert.throws(() => analyzeBeam({ ...base, span: 'six' }), TypeError);
  assert.throws(() => analyzeBeam({ ...base, supports: { left: 'pin', right: 'spring' } }), TypeError);
  assert.throws(() => analyzeBeam({ ...base, supports: { left: 'pin' } }), TypeError);
  assert.throws(() => analyzeBeam({ ...base, samples: 1 }), RangeError);
  assert.throws(() => analyzeBeam(), TypeError);
});
