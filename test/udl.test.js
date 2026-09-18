/**
 * UDL analysis tests (Milestone 4) — full-span uniformly distributed load.
 * Every expected value is a closed-form textbook result.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam } from '../src/analysis.js';
import { solveSimplySupportedPointLoad } from '../src/engine.js';

const close = (actual, expected, tol = 1e-9, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label} expected ${expected}, got ${actual}`);

// ---------------------------------------------------------------------------
// 1. Simply supported, full-span UDL: L=6, w=2
//    RA = RB = wL/2 = 6; W = 12; Mmax = wL²/8 = 9 (sagging, midspan)
// ---------------------------------------------------------------------------
test('simply supported UDL: RA=RB=wL/2, Mmax=wL²/8, linear V + parabolic M', () => {
  const r = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: { left: 'pin', right: 'roller' } });

  assert.equal(r.classification.status, 'determinate');
  assert.equal(r.kind, 'beam-udl');
  close(r.totalLoad, 12, 1e-9, 'W = wL');
  close(r.reactions.left.Vy, 6, 1e-9, 'RA');
  close(r.reactions.right.Vy, 6, 1e-9, 'RB');
  assert.equal(r.reactions.left.Hx, 0, 'no horizontal reaction');

  // Shear: linear ramp +6 → 0 → −6
  close(r.diagrams.shear[0].V, 6, 1e-9, 'V(0)');
  const vMid = r.diagrams.shear.find((p) => Math.abs(p.x - 3) < 1e-12);
  close(vMid.V, 0, 1e-9, 'V(3) = 0');
  const vEnd = r.diagrams.shear[r.diagrams.shear.length - 1];
  close(vEnd.V, -6, 1e-9, 'V(6)');

  // Moment: parabola 0 → 9 → 0
  close(r.diagrams.moment[0].M, 0, 1e-9, 'M(0)');
  const mMid = r.diagrams.moment.find((p) => Math.abs(p.x - 3) < 1e-12);
  close(mMid.M, 9, 1e-9, 'M(3) = wL²/8');
  const mEnd = r.diagrams.moment[r.diagrams.moment.length - 1];
  close(mEnd.M, 0, 1e-9, 'M(6)');

  close(r.maxMoment.value, 9, 1e-9, 'Mmax');
  close(r.maxMoment.position, 3, 1e-9, 'Mmax at midspan');
  assert.equal(r.maxMoment.sign, 'sagging');
  assert.equal(r.equilibrium.satisfied, true);

  // No shear jump under a distributed load
  assert.ok(!('shearJump' in r.diagrams), 'UDL has continuous shear (no jump)');
});

// ---------------------------------------------------------------------------
// 2. Cantilever fixed-left, full-span UDL: V_A=wL, M_A=wL²/2 (hogging)
// ---------------------------------------------------------------------------
test('cantilever fixed-left UDL: V_A=wL, M_A=wL²/2, all hogging', () => {
  const r = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: { left: 'fixed', right: 'free' } });

  assert.deepEqual(r.reactions.left, { type: 'fixed', Hx: 0, Vy: 12, Mz: 36 });
  assert.deepEqual(r.reactions.right, { type: 'free' });

  close(r.diagrams.shear[0].V, 12, 1e-9, 'V(0) = wL');
  const vEnd = r.diagrams.shear[r.diagrams.shear.length - 1];
  close(vEnd.V, 0, 1e-9, 'V(6) = 0');

  close(r.diagrams.moment[0].M, -36, 1e-9, 'M(0) = −wL²/2');
  const mEnd = r.diagrams.moment[r.diagrams.moment.length - 1];
  close(mEnd.M, 0, 1e-9, 'M(6) = 0');

  close(r.maxMoment.value, 36, 1e-9, '|M|max = wL²/2');
  close(r.maxMoment.position, 0, 1e-9, 'peak at the fixed support');
  assert.equal(r.maxMoment.sign, 'hogging');
  assert.equal(r.equilibrium.satisfied, true);
});

// ---------------------------------------------------------------------------
// 3. Cantilever fixed-right (mirror)
// ---------------------------------------------------------------------------
test('cantilever fixed-right UDL: M_B=wL²/2 at the right support', () => {
  const r = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: { left: 'free', right: 'fixed' } });

  assert.deepEqual(r.reactions.left, { type: 'free' });
  assert.deepEqual(r.reactions.right, { type: 'fixed', Hx: 0, Vy: 12, Mz: 36 });

  close(r.diagrams.shear[0].V, 0, 1e-9, 'V(0) = 0');
  const vEnd = r.diagrams.shear[r.diagrams.shear.length - 1];
  close(vEnd.V, -12, 1e-9, 'V(6) = −wL');

  const mEnd = r.diagrams.moment[r.diagrams.moment.length - 1];
  close(mEnd.M, -36, 1e-9, 'M(6) = −wL²/2');
  close(r.maxMoment.value, 36, 1e-9, '|M|max');
  close(r.maxMoment.position, 6, 1e-9, 'peak at the fixed support');
  assert.equal(r.maxMoment.sign, 'hogging');
});

// ---------------------------------------------------------------------------
// 4. Differential relations: dM/dx = V and dV/dx = −w
// ---------------------------------------------------------------------------
test('UDL: dM/dx = V and dV/dx = −w hold numerically', () => {
  const L = 6, w = 2;
  const r = analyzeBeam({ span: L, loads: [{ type: 'udl', intensity: w }], supports: { left: 'pin', right: 'roller' } });

  const m = r.diagrams.moment;
  for (let i = 1; i < m.length - 1; i++) {
    const dx = m[i].x - m[i - 1].x;
    if (dx < 1e-9) continue;
    // Central difference: exact for a parabola (forward difference is only
    // first-order and compares against the midpoint, not the node).
    const dMdx = (m[i + 1].M - m[i - 1].M) / (2 * dx);
    const V = r.diagrams.shear[i].V;
    close(dMdx, V, 1e-7, `dM/dx at x=${m[i].x.toFixed(3)}`);
  }

  const s = r.diagrams.shear;
  for (let i = 1; i < s.length; i++) {
    const dx = s[i].x - s[i - 1].x;
    if (dx < 1e-9) continue;
    close((s[i].V - s[i - 1].V) / dx, -w, 1e-5, `dV/dx at x=${s[i].x.toFixed(3)}`);
  }
});

// ---------------------------------------------------------------------------
// 5. Scaling: linear in w, quadratic in L
// ---------------------------------------------------------------------------
test('UDL scaling: reactions & Mmax linear in w; Mmax quadratic in L', () => {
  const base = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: { left: 'pin', right: 'roller' } });
  const dblW = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 4 }], supports: { left: 'pin', right: 'roller' } });
  const dblL = analyzeBeam({ span: 12, loads: [{ type: 'udl', intensity: 2 }], supports: { left: 'pin', right: 'roller' } });

  close(dblW.reactions.left.Vy, 2 * base.reactions.left.Vy, 1e-9, 'RA scales with w');
  close(dblW.maxMoment.value, 2 * base.maxMoment.value, 1e-9, 'Mmax scales with w');
  close(dblL.maxMoment.value, 4 * base.maxMoment.value, 1e-9, 'Mmax ∝ L²');
});

// ---------------------------------------------------------------------------
// 6. Regression: point-load path still matches the frozen M1 solver
// ---------------------------------------------------------------------------
test('point-load path unchanged after UDL generalization (M1 cross-check)', () => {
  const viaM3 = analyzeBeam({ span: 6, load: 10, position: 3, supports: { left: 'pin', right: 'roller' } });
  const viaM1 = solveSimplySupportedPointLoad({ span: 6, load: 10, position: 3 });
  close(viaM3.reactions.left.Vy, viaM1.reactions.RA, 1e-12, 'RA');
  close(viaM3.reactions.right.Vy, viaM1.reactions.RB, 1e-12, 'RB');
  close(viaM3.maxMoment.value, viaM1.maxMoment.value, 1e-12, 'Mmax');
  assert.deepEqual(viaM3.diagrams.shearJump, viaM1.diagrams.shearJump);
});

// ---------------------------------------------------------------------------
// 7. Honesty: indeterminate/unstable UDL → classification only
// ---------------------------------------------------------------------------
test('indeterminate + UDL returns classification only', () => {
  const r = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: { left: 'pin', right: 'pin' } });
  assert.equal(r.classification.status, 'indeterminate');
  assert.ok(!('reactions' in r));
  assert.ok(!('diagrams' in r));
  assert.ok(!('maxMoment' in r));
  // totalLoad is a load property, always available:
  close(r.totalLoad, 12, 1e-9, 'W = wL is known even when indeterminate');
});

test('unstable + UDL returns classification only', () => {
  const r = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: { left: 'free', right: 'free' } });
  assert.equal(r.classification.status, 'unstable');
  assert.ok(!('reactions' in r));
  assert.ok(!('diagrams' in r));
});

// ---------------------------------------------------------------------------
// 8. Validation
// ---------------------------------------------------------------------------
test('UDL input validation', () => {
  assert.throws(() => analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 0 }], supports: { left: 'pin', right: 'roller' } }), RangeError);
  assert.throws(() => analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: -2 }], supports: { left: 'pin', right: 'roller' } }), RangeError);
  assert.throws(() => analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2, start: 1, end: 5 }], supports: { left: 'pin', right: 'roller' } }), RangeError);
  assert.throws(() => analyzeBeam({ span: 6, loads: [{ type: 'moment', magnitude: 5 }], supports: { left: 'pin', right: 'roller' } }), TypeError);
  assert.throws(() => analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }, { type: 'udl', intensity: 2 }], supports: { left: 'pin', right: 'roller' } }), RangeError);
});
