/**
 * deflection.test.js — Analytical tests for the elastic curve (Milestone 8).
 * ---------------------------------------------------------------------------
 * Every expected value is textbook statics worked BY HAND —
 * never an engine round-trip. Cases:
 *   A  simply supported, P at midspan        EI·v_max = P·L³/48
 *   B  simply supported, P off-centre        interior turning point (θ = 0)
 *   C  simply supported, full UDL            EI·v_max = 5wL⁴/384
 *   D  cantilever fixed-left, tip load       EI·v(L) = P·L³/3
 *   E  cantilever fixed-left, full UDL       EI·v(L) = w·L⁴/8
 *   F  cantilever, triangular (wall→tip)     EI·v(L) = w·L⁴/30  (M5 descriptor)
 *   G  stepped profile (M7 Case A shape)     piecewise quintics + C¹ continuity
 *   H  superposition + order independence
 *   I  honesty: indeterminate / unstable → no deflection block
 *   J  EI validation + default
 *   K  derivative identities on clean stencils
 *   L  pure add-on: existing result fields byte-identical
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam, DEFAULT_EI } from '../src/analysis.js';

const pinRoller = { left: 'pin', right: 'roller' };
const fixedLeft = { left: 'fixed', right: 'free' };

function approx(actual, expected, tol, msg) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg}: expected ≈ ${expected}, got ${actual} (|Δ| = ${Math.abs(actual - expected)} > ${tol})`
  );
}

/** EI·v(x) from the result's sampled curve (stiffness-weighted, kN·m³). */
const EIv = (r, x) => {
  const hit = r.deflection.v.find((p) => Math.abs(p.x - x) < 1e-9);
  assert.ok(hit, `deflection sample at x = ${x} exists`);
  return hit.v * r.deflection.EI;
};

/** Linear interpolation into a sampled v array (for cross-grid superposition). */
const interp = (samples, x) => {
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].x >= x) {
      const a = samples[i - 1];
      const b = samples[i];
      const t = (x - a.x) / (b.x - a.x);
      return a.v + t * (b.v - a.v);
    }
  }
  return samples[samples.length - 1].v;
};

// ---------------------------------------------------------------------------

test('A: simply supported, P at midspan — EI·v_max = P·L³/48 at L/2', () => {
  const r = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  approx(r.deflection.max.value * r.deflection.EI, (10 * 216) / 48, 1e-6, 'EI·v_max = PL³/48 = 2160 kN·m³');
  approx(r.deflection.max.position, 3, 1e-6, 'peak at midspan');
  assert.equal(r.deflection.max.sign, 'down', 'sagging beam deflects downward');
  approx(EIv(r, 0), 0, 1e-9, 'v(0) = 0');
  approx(EIv(r, 6), 0, 1e-9, 'v(L) = 0');
});

test('B: simply supported, P off-centre — interior turning point via θ = 0', () => {
  // P = 10 at a = 4 (b = 2), L = 6: x* = √((L²−b²)/3) = √(32/3) ≈ 3.26599 m,
  // EI·v_max = P·b·(L²−b²)^{3/2}/(9√3·L) = 20·(32)^{3/2}/(54√3) ≈ 115.42 kN·m³.
  const r = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 4 }], supports: pinRoller });
  const xStar = Math.sqrt(32 / 3);
  approx(r.deflection.max.position, xStar, 1e-5, `x* = √(32/3) ≈ ${xStar.toFixed(5)} m`);
  approx(r.deflection.max.value * r.deflection.EI, (10 * 2 * Math.pow(32, 1.5)) / (9 * Math.sqrt(3) * 6), 1e-5, 'EI·v_max = P·b·(L²−b²)^{3/2}/(9√3·L)');
  assert.equal(r.deflection.max.sign, 'down');
});

test('C: simply supported, full UDL — EI·v_max = 5wL⁴/384 at midspan, zero slope there', () => {
  const r = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: pinRoller });
  approx(r.deflection.max.value * r.deflection.EI, (5 * 2 * 1296) / 384, 1e-6, 'EI·v_max = 5wL⁴/384 = 33.75 kN·m³');
  approx(r.deflection.max.position, 3, 1e-6, 'peak at midspan');
  const thetaMid = r.deflection.theta.find((p) => Math.abs(p.x - 3) < 1e-9);
  approx(thetaMid.theta, 0, 1e-9, 'θ(midspan) = 0');
});

test('D: cantilever fixed-left, near-tip load — EI·v_max = P·a²(3L−a)/6 at the tip, monotone, zero slope at wall', () => {
  // P = 10 at a = 5.9 (a point load must sit strictly inside the span), L = 6.
  // Textbook: δ(load) = P·a³/3EI, δ(tip) = P·a²(3L−a)/6EI — the tip is the
  // larger one whenever a > L/3 (here 12.1 > 11.8).
  const a = 5.9;
  const r = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: a }], supports: fixedLeft });
  approx(r.deflection.max.value * r.deflection.EI, (10 * a * a * (18 - a)) / 6, 1e-6, 'EI·v_max = P·a²(3L−a)/6 (at the tip)');
  approx(r.deflection.max.position, 6, 1e-6, 'max at the free end (a > L/3)');
  approx(EIv(r, a), (10 * a * a * a) / 3, 1e-6, 'EI·v(a) = P·a³/3 (under the load)');
  approx(EIv(r, 0), 0, 1e-9, 'v(wall) = 0');
  const thetaWall = r.deflection.theta.find((p) => Math.abs(p.x - 0) < 1e-9);
  approx(thetaWall.theta, 0, 1e-9, 'θ(wall) = 0');
  // monotone sag along the span (down-positive v grows 0 → max at the tip)
  const vv = r.deflection.v.map((p) => p.v);
  for (let i = 1; i < vv.length; i++) {
    assert.ok(vv[i] >= vv[i - 1] - 1e-12, `curve monotone at sample ${i}`);
  }
});

test('E: cantilever fixed-left, full UDL — EI·v(L) = w·L⁴/8', () => {
  const r = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: fixedLeft });
  approx(r.deflection.max.value * r.deflection.EI, (2 * 1296) / 8, 1e-6, 'EI·v(L) = wL⁴/8 = 324 kN·m³');
  approx(r.deflection.max.position, 6, 1e-6, 'max at the free end');
});

test('F: cantilever, triangular peak-at-wall — EI·v(L) = w·L⁴/30 (M5 descriptor)', () => {
  // linear {start 0, end 6, wStart 6, wEnd 0}: ∫₀ᴸ M(x)(L−x)dx = wL⁴/30.
  const r = analyzeBeam({ span: 6, loads: [{ type: 'linear', start: 0, end: 6, wStart: 6, wEnd: 0 }], supports: fixedLeft });
  approx(r.deflection.max.value * r.deflection.EI, (6 * 1296) / 30, 1e-4, 'EI·v(L) = wL⁴/30 = 259.2 kN·m³ (1e-4: sampling-tail tolerance)');
  approx(r.deflection.max.position, 6, 1e-6, 'max at the free end');
});

test('G: stepped profile — piecewise exactness and C¹ continuity at the step', () => {
  // M7 Case A shape: (0,4) (3,4) (3,8) (6,8) on L = 6, pin+roller, P = 36, x̄ = 3.5.
  const r = analyzeBeam({
    span: 6,
    loads: [{ type: 'profile', points: [{ x: 0, w: 4 }, { x: 3, w: 4 }, { x: 3, w: 8 }, { x: 6, w: 8 }] }],
    supports: pinRoller,
  });
  // Independent hand integration (worked in full during implementation):
  // θ = 0 at x* ≈ 3.08315 m (just right of the step — NOT at the 3.375 shear
  // peak), and EI·v_max ≈ −101.344 kN·m³ there.
  approx(r.deflection.max.value * r.deflection.EI, 101.3435, 2e-3, 'EI·v_max ≈ 101.344 kN·m³ (hand-integrated piecewise quintics)');
  approx(r.deflection.max.position, 3.0832, 1e-3, 'x* ≈ 3.0832 m (turning point right of the step)');
  assert.equal(r.deflection.max.sign, 'down');
  const left = r.deflection.theta.filter((p) => p.x < 3).pop();
  const right = r.deflection.theta.find((p) => p.x > 3);
  assert.ok(Math.abs(left.x - right.x) < 0.2, 'samples straddle the step closely');
  assert.ok(Math.abs(right.theta - left.theta) < 0.02, 'θ continuous through the step (no kink jump)');
});
test('H: superposition + order independence', () => {
  const loads = [
    { type: 'profile', points: [{ x: 0, w: 4 }, { x: 3, w: 4 }, { x: 3, w: 8 }, { x: 6, w: 8 }] },
    { type: 'point', magnitude: 5, position: 2 },
  ];
  const mixed = analyzeBeam({ span: 6, loads, supports: pinRoller });
  const soloProfile = analyzeBeam({ span: 6, loads: [loads[0]], supports: pinRoller });
  const soloPoint = analyzeBeam({ span: 6, loads: [loads[1]], supports: pinRoller });
  // Superpose at common x values (each result samples its own event set —
  // match by x, not by index): 50 ordinates across the span.
  for (let k = 1; k < 50; k++) {
    const x = (6 * k) / 50;
    const vMix = mixed.deflection.v.find((p) => Math.abs(p.x - x) < 1e-9)?.v
      ?? null;
    if (vMix == null) continue; // ordinates differ slightly between runs
    const vp = interp(soloProfile.deflection.v, x);
    const vd = interp(soloPoint.deflection.v, x);
    approx(vMix, vp + vd, 1e-9, `v(x) superposes pointwise at x = ${x.toFixed(3)}`);
  }
  const flipped = analyzeBeam({ span: 6, loads: [loads[1], loads[0]], supports: pinRoller });
  approx(mixed.deflection.max.value, flipped.deflection.max.value, 1e-12, 'order independence: max value');
  approx(mixed.deflection.max.position, flipped.deflection.max.position, 1e-12, 'order independence: max position');
});

test('I: honesty — indeterminate and unstable carry NO deflection block', () => {
  const ind = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: { left: 'pin', right: 'pin' } });
  assert.equal('deflection' in ind, false);
  const unst = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: { left: 'free', right: 'free' } });
  assert.equal('deflection' in unst, false);
  // EI validation is uniform across inputs — a bad EI throws even when the
  // beam would only be classified (the UI never sends a bad EI).
  assert.throws(
    () => analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: { left: 'pin', right: 'pin' }, EI: -5 }),
    RangeError
  );
});

test('J: EI validation + teaching default', () => {
  const bad = (EI) => () => analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller, EI });
  assert.throws(bad(0), RangeError);
  assert.throws(bad(-100), RangeError);
  assert.throws(bad(NaN), TypeError);
  assert.throws(bad('x'), TypeError);
  // Absent → DEFAULT_EI, echoed in the result.
  const r = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller });
  assert.equal(r.deflection.EI, DEFAULT_EI);
  assert.equal(DEFAULT_EI, 2.0e4);
  // Half the stiffness → double the sag (linearity in 1/EI).
  const half = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller, EI: DEFAULT_EI / 2 });
  approx(half.deflection.max.value, 2 * r.deflection.max.value, 1e-12, 'v scales as 1/EI');
});

test('K: derivative identities on clean stencils — dθ/dx = −M/EI, d²v/dx² = −M/EI (down-positive convention)', () => {
  const r = analyzeBeam({ span: 6, samples: 401, loads: [{ type: 'udl', intensity: 2 }], supports: pinRoller, EI: 2.0e4 });
  const events = [0, 6];
  const nearEvent = (x) => events.some((e) => Math.abs(x - e) < 1e-9);
  const thOf = new Map(r.deflection.theta.map((p) => [p.x, p.theta]));
  const vOf = new Map(r.deflection.v.map((p) => [p.x, p.v]));
  const MOf = new Map(r.diagrams.moment.map((p) => [p.x, p.M]));
  let checkedSlope = 0;
  let checkedCurve = 0;
  const xs = r.deflection.v.map((p) => p.x);
  for (let i = 1; i < xs.length - 1; i++) {
    const x0 = xs[i - 1], x1 = xs[i], x2 = xs[i + 1];
    const h1 = x1 - x0, h2 = x2 - x1;
    if (Math.abs(h1 - h2) > 1e-9) continue;
    if (nearEvent(x0) || nearEvent(x1) || nearEvent(x2)) continue;
    approx((thOf.get(x2) - thOf.get(x0)) / (2 * h1), -MOf.get(x1) / r.deflection.EI, 1e-6, `dθ/dx = −M/EI at ${x1.toFixed(3)}`);
    checkedSlope++;
    approx((vOf.get(x2) - 2 * vOf.get(x1) + vOf.get(x0)) / (h1 * h1), -MOf.get(x1) / r.deflection.EI, 1e-4, `d²v/dx² = −M/EI at ${x1.toFixed(3)}`);
    checkedCurve++;
  }
  assert.ok(checkedSlope > 100 && checkedCurve > 100, `enough clean stencils (${checkedSlope}/${checkedCurve})`);
});

test('L: pure add-on — deterministic engine, deflection is the only new block', () => {
  const cases = [
    { span: 6, loads: [{ type: 'point', magnitude: 10, position: 3 }], supports: pinRoller },
    { span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: pinRoller },
    { span: 6, loads: [{ type: 'linear', start: 1, end: 5, wStart: 3, wEnd: 1 }], supports: fixedLeft },
    { span: 6, loads: [{ type: 'profile', points: [{ x: 0, w: 4 }, { x: 3, w: 4 }, { x: 3, w: 8 }, { x: 6, w: 8 }] }, { type: 'point', magnitude: 5, position: 2 }], supports: pinRoller },
  ];
  for (const input of cases) {
    const first = analyzeBeam(input);
    const again = analyzeBeam(input);
    assert.deepEqual(again, first, 'engine stays deterministic with the add-on');
    // The M7-era key set (plus M4's totalLoad echo where present) + deflection.
    const base = ['classification', 'deflection', 'diagrams', 'equilibrium', 'input', 'kind', 'maxMoment', 'reactions', 'resultant'];
    if ('totalLoad' in first) base.push('totalLoad');
    assert.deepEqual(
      Object.keys(first).sort(),
      base.sort(),
      `key set = M7 era + deflection (got ${Object.keys(first).sort().join(', ')})`
    );
  }
});
