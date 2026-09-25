/**
 * Multi-load (combined) analysis tests — Milestone 6.
 *
 * Every expected value is an independently hand-derived statics result (see
 * plan-m6.md §8) — not an engine round-trip. Superposition of closed-form
 * kernels:
 *
 *   R  = ΣRᵢ,  x̄ = ΣRᵢx̄ᵢ / R
 *   RA = R(L − x̄)/L,  RB = R·x̄/L          (simply supported)
 *   V(x) = RA − ΣCᵢ(x),  M(x) = RA·x − ΣFᵢ(x)
 *
 * Case map:
 *   A  point + full UDL, simply supported — peak AT the shear jump
 *   B  two point loads — plateau between, peaks at both jumps
 *   C  point inside a distributed region — peak at the jump
 *   D  point + UDL — peak BETWEEN the loads (not at either)
 *   E  cantilever with multiple loads (both orientations)
 *   F  overlapping distributed regions — peak inside the overlap
 *   G  honesty: indeterminate/unstable stay classified-only
 *   H  cross-checks: dispatcher routing, order-independence, derivative
 *      relations (dM/dx = V, dV/dx = −w), scaling linearity, validation
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam } from '../src/analysis.js';
import { normalizeLoads, MAX_LOADS } from '../src/loadmodel.js';

const close = (actual, expected, tol = 1e-9, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label} expected ${expected}, got ${actual}`);

const pinRoller = { left: 'pin', right: 'roller' };

// ---------------------------------------------------------------------------
// Case A — point + full UDL, simply supported. L=6, P=10 at a=2, w=2.
// R=22, x̄=28/11, RA=38/3, RB=28/3. V(2⁻)=26/3, V(2⁺)=−4/3 → peak AT the jump:
// Mmax = 64/3 at x=2. Superposition: 40/3 (point alone) + 8 (UDL alone) = 64/3.
// ---------------------------------------------------------------------------
test('A: point + full UDL — reactions, jump-straddled peak, superposition', () => {
  const r = analyzeBeam({
    span: 6,
    loads: [
      { type: 'point', magnitude: 10, position: 2 },
      { type: 'udl', intensity: 2 },
    ],
    supports: pinRoller,
  });

  assert.equal(r.kind, 'beam-multi-load');
  close(r.resultant.value, 22, 1e-9, 'R = 10 + 12 = 22');
  close(r.resultant.position, 28 / 11, 1e-9, 'x̄ = 56/22 = 28/11');
  close(r.reactions.left.Vy, 38 / 3, 1e-9, 'RA = 38/3');
  close(r.reactions.right.Vy, 28 / 3, 1e-9, 'RB = 28/3');
  assert.equal(r.reactions.left.Hx, 0);
  assert.equal(r.equilibrium.satisfied, true);

  // Shear: V(0⁺)=38/3, V(2⁻)=26/3, jump → V(2⁺)=−4/3, V(6⁻)=−28/3.
  const v0 = r.diagrams.shear.find((p) => Math.abs(p.x) < 1e-12);
  close(v0.V, 38 / 3, 1e-9, 'V(0⁺)');
  const atJump = r.diagrams.shear.filter((p) => Math.abs(p.x - 2) < 1e-12);
  assert.equal(atJump.length, 2, 'two sample points at x=2 (the jump)');
  const vAbove = Math.max(...atJump.map((p) => p.V)); // left-limit (shear drops at a point load)
  const vBelow = Math.min(...atJump.map((p) => p.V)); // right-limit
  close(vAbove, 26 / 3, 1e-9, 'V(2⁻) = 26/3');
  close(vBelow, -4 / 3, 1e-9, 'V(2⁺) = −4/3');
  const vEnd = r.diagrams.shear[r.diagrams.shear.length - 1];
  close(vEnd.V, -28 / 3, 1e-9, 'V(6⁻) = −RB');

  // Peak exactly at the jump.
  close(r.maxMoment.value, 64 / 3, 1e-9, 'Mmax = 64/3');
  close(r.maxMoment.position, 2, 1e-9, 'peak at x = 2');
  assert.equal(r.maxMoment.sign, 'sagging');

  // Superposition holds POINTWISE, not between maxima: M(2) = point-alone
  // M(2) + UDL-alone M(2) = 40/3 + 8 = 64/3. (The UDL's own maximum is
  // wL²/8 = 9 at midspan — Mmax values themselves do NOT sum; the combined
  // peak sits at the jump, not at either single-load peak.)
  //   hand values: point-alone M(2) = RA_pt·a = (10·4/6)·2 = 40/3;
  //                UDL-alone  M(2) = x(L−x) = 2·4 = 8.
  const m2Combined = r.diagrams.moment.find((p) => Math.abs(p.x - 2) < 1e-12).M;
  close(m2Combined, 40 / 3 + 8, 1e-9, 'M(2) = 40/3 + 8 = 64/3 (hand-derived parts)');

  // Engine-side pointwise superposition at a grid-safe x (3 = midspan, on
  // every default grid): combined M(3) = point-alone M(3) + UDL-alone M(3).
  const pt = analyzeBeam({ span: 6, load: 10, position: 2, supports: pinRoller });
  const udl = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: pinRoller });
  const m3 = (res) => res.diagrams.moment.find((p) => Math.abs(p.x - 3) < 1e-12).M;
  close(m3(r), m3(pt) + m3(udl), 1e-9, 'M(3) superposes across independent solves');
  assert.ok(Math.abs(r.maxMoment.value - (pt.maxMoment.value + udl.maxMoment.value)) > 0.5,
    'combined Mmax is NOT the sum of single-load Mmax values (64/3 vs 40/3 + 9)');
});

// ---------------------------------------------------------------------------
// Case B — two point loads, simply supported. L=6, P₁=6 at 2, P₂=3 at 4.
// RA=5, RB=4. V: +5 → −1 (after jump at 2) → −4 (after jump at 4).
// M(2)=10 (peak), M(4)=8.
// ---------------------------------------------------------------------------
test('B: two point loads — plateau shear, peaks at both jumps', () => {
  const r = analyzeBeam({
    span: 6,
    loads: [
      { type: 'point', magnitude: 6, position: 2 },
      { type: 'point', magnitude: 3, position: 4 },
    ],
    supports: pinRoller,
  });

  close(r.resultant.value, 9, 1e-9, 'R = 9');
  close(r.resultant.position, 8 / 3, 1e-9, 'x̄ = 18/9? no — (6·2+3·4)/9 = 8/3');
  close(r.reactions.left.Vy, 5, 1e-9, 'RA = 5');
  close(r.reactions.right.Vy, 4, 1e-9, 'RB = 4');

  // Plateau on (2,4): V = −1 (RA − P₁). Sample at x = 3.
  const v3 = r.diagrams.shear.find((p) => Math.abs(p.x - 3) < 1e-12);
  close(v3.V, -1, 1e-9, 'V(3) = −1 (plateau)');

  // Peaks at both jumps; the larger is at x=2.
  const m2 = r.diagrams.moment.find((p) => Math.abs(p.x - 2) < 1e-12).M;
  const m4 = r.diagrams.moment.find((p) => Math.abs(p.x - 4) < 1e-12).M;
  close(m2, 10, 1e-9, 'M(2) = 10');
  close(m4, 8, 1e-9, 'M(4) = 8');
  close(r.maxMoment.value, 10, 1e-9, 'Mmax = 10');
  close(r.maxMoment.position, 2, 1e-9, 'peak at first jump');
  assert.equal(r.maxMoment.sign, 'sagging');
  assert.equal(r.equilibrium.satisfied, true);
});

// ---------------------------------------------------------------------------
// Case C — point load INSIDE a distributed region. L=6, w=2 on [1,5], P=3 at 3.
// RA=RB=5.5. V(3⁻)=1.5, V(3⁺)=−1.5 → Mmax = 12.5 at x=3.
// Superposition: 8 (partial UDL alone) + 4.5 (point alone) = 12.5.
// ---------------------------------------------------------------------------
test('C: point inside a distributed region — peak at the jump', () => {
  const r = analyzeBeam({
    span: 6,
    loads: [
      { type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 2 },
      { type: 'point', magnitude: 3, position: 3 },
    ],
    supports: pinRoller,
  });

  close(r.resultant.value, 11, 1e-9, 'R = 8 + 3 = 11');
  close(r.resultant.position, (8 * 3 + 3 * 3) / 11, 1e-9, 'x̄ = (8·3 + 3·3)/11 = 3');
  close(r.reactions.left.Vy, 5.5, 1e-9, 'RA = 5.5');
  close(r.reactions.right.Vy, 5.5, 1e-9, 'RB = 5.5');

  const at3 = r.diagrams.shear.filter((p) => Math.abs(p.x - 3) < 1e-12);
  assert.equal(at3.length, 2, 'jump sampled at the point inside the region');
  close(Math.max(...at3.map((p) => p.V)), 1.5, 1e-9, 'V(3⁻) = +1.5 (left limit is the larger)');
  close(Math.min(...at3.map((p) => p.V)), -1.5, 1e-9, 'V(3⁺) = −1.5');

  close(r.maxMoment.value, 12.5, 1e-9, 'Mmax = 12.5');
  close(r.maxMoment.position, 3, 1e-9, 'peak at the jump inside the region');

  const lin = analyzeBeam({ span: 6, loads: [{ type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 2 }], supports: pinRoller });
  const pt = analyzeBeam({ span: 6, load: 3, position: 3, supports: pinRoller });
  const m3Combined = r.diagrams.moment.find((p) => Math.abs(p.x - 3) < 1e-12).M;
  const m3Lin = lin.diagrams.moment.find((p) => Math.abs(p.x - 3) < 1e-12).M;
  const m3Pt = pt.diagrams.moment.find((p) => Math.abs(p.x - 3) < 1e-12).M;
  close(m3Combined, m3Lin + m3Pt, 1e-9, 'M(3): 8 + 4.5 = 12.5 superposes');
});

// ---------------------------------------------------------------------------
// Case D — peak BETWEEN the loads (not at either). L=6, P=4 at x=1, w=3 full span.
// RA=37/3, RB=29/3. V(1⁺)=16/3 → zero at x=1+16/9=25/9.
// Mmax = 841/54 at x=25/9 (verified from both sides in plan-m6.md §8).
// ---------------------------------------------------------------------------
test('D: peak between the loads — analytic V=0 root inside the UDL', () => {
  const r = analyzeBeam({
    span: 6,
    loads: [
      { type: 'point', magnitude: 4, position: 1 },
      { type: 'udl', intensity: 3 },
    ],
    supports: pinRoller,
  });

  close(r.reactions.left.Vy, 37 / 3, 1e-9, 'RA = 37/3');
  close(r.reactions.right.Vy, 29 / 3, 1e-9, 'RB = 29/3');

  const xPeak = 25 / 9;
  close(r.maxMoment.position, xPeak, 1e-9, 'peak at x = 25/9');
  close(r.maxMoment.value, 841 / 54, 1e-9, 'Mmax = 841/54');
  assert.equal(r.maxMoment.sign, 'sagging');

  // The peak must NOT be at the point load. M(1) = RA·1 − (w/2)·1² (the UDL
  // also loads x < 1's moment): 37/3 − 3/2 = 65/6 ≈ 10.83 < 841/54 ≈ 15.57.
  const m1 = r.diagrams.moment.find((p) => Math.abs(p.x - 1) < 1e-12).M;
  close(m1, 65 / 6, 1e-9, 'M(1) = 65/6 (at the point load)');
  assert.ok(r.maxMoment.value > m1, 'peak lies between the loads, not at the point load');

  // Cross-check from the right: M(xPeak) = RB·(L − xPeak) − UDL right part.
  close(r.maxMoment.value, (29 / 3) * (6 - xPeak) - 1.5 * (6 - xPeak) * (6 - xPeak), 1e-9,
    'Mmax verified from the right segment');
});

// ---------------------------------------------------------------------------
// Case E — cantilever, multiple loads (both orientations).
// Fixed-left: V_A = 22, M_A = 76 (hogging); M(4) = −4; M(6) = 0.
// Fixed-right mirror: M_B = 76 at x = 6.
// ---------------------------------------------------------------------------
test('E: cantilever fixed-left with two loads — V_A = R, M_A = R·x̄', () => {
  const r = analyzeBeam({
    span: 6,
    loads: [
      { type: 'point', magnitude: 10, position: 4 },
      { type: 'udl', intensity: 2 },
    ],
    supports: { left: 'fixed', right: 'free' },
  });

  assert.deepEqual(r.reactions.left, { type: 'fixed', Hx: 0, Vy: 22, Mz: 76 });
  assert.deepEqual(r.reactions.right, { type: 'free' });
  close(r.maxMoment.value, 76, 1e-9, '|M|max = 76 at the fixed end');
  close(r.maxMoment.position, 0, 1e-9, 'peak at the fixed end');
  assert.equal(r.maxMoment.sign, 'hogging');

  const m4 = r.diagrams.moment.find((p) => Math.abs(p.x - 4) < 1e-12).M;
  close(m4, -4, 1e-9, 'M(4) = −4 (beyond the point load)');
  const mEnd = r.diagrams.moment[r.diagrams.moment.length - 1];
  close(mEnd.M, 0, 1e-9, 'M(L) = 0 at the free end');
});

test('E2: cantilever fixed-right mirror — M_B = R·(L − x̄)', () => {
  // Corrected hand-derivation (plan §8 said 76; the mirror arm is L − a = 2,
  // not a = 4): M_B = 10·(6−4) + 12·3 = 20 + 36 = 56 kNm. R and x̄ are
  // unchanged (R = 22, x̄ = 28/11 ≈ 2.545, nearer A), and M_B = R·(L − x̄)
  // = 22·(33/11) = 56 ✓ — the two derivations now agree.
  const r = analyzeBeam({
    span: 6,
    loads: [
      { type: 'point', magnitude: 10, position: 4 },
      { type: 'udl', intensity: 2 },
    ],
    supports: { left: 'free', right: 'fixed' },
  });

  assert.deepEqual(r.reactions.right, { type: 'fixed', Hx: 0, Vy: 22, Mz: 56 });
  close(r.maxMoment.value, 56, 1e-9, '|M|max = 56');
  close(r.maxMoment.position, 6, 1e-9, 'peak at the right fixed end');
  assert.equal(r.maxMoment.sign, 'hogging');
});

// ---------------------------------------------------------------------------
// Case F — overlapping distributed regions, simply supported.
// w=2 on [1,5] (R=8, x̄=3) + w=1 on [3,6] (R=3, x̄=4.5).
// RA=4.75, RB=6.25; V=0 at x=3.25 (inside the overlap); Mmax = 10.34375.
// ---------------------------------------------------------------------------
test('F: overlapping distributed regions — peak inside the overlap', () => {
  const r = analyzeBeam({
    span: 6,
    loads: [
      { type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 2 },
      { type: 'linear', start: 3, end: 6, wStart: 1, wEnd: 1 },
    ],
    supports: pinRoller,
    samples: 25, // step 0.25 so x=3.25 is on the grid for the cross-check below
  });

  close(r.resultant.value, 11, 1e-9, 'R = 8 + 3 = 11');
  close(r.resultant.position, (8 * 3 + 3 * 4.5) / 11, 1e-9, 'x̄ = 37.5/11');
  close(r.reactions.left.Vy, 4.75, 1e-9, 'RA = 4.75');
  close(r.reactions.right.Vy, 6.25, 1e-9, 'RB = 6.25');

  // Both loads active on [3,5]: V = 9.75 − 2(x−1) − 1(x−3) = 6.75 − 3x… on
  // [3,5]; zero at x = 3.25. (Outside, V = RA − 2(x−1) = 6.75 − 2x.)
  const xPeak = 3.25;
  close(r.maxMoment.position, xPeak, 1e-9, 'V=0 at x=3.25 inside the overlap');
  close(r.maxMoment.value, 10.34375, 1e-9, 'Mmax = 10.34375');
  assert.equal(r.maxMoment.sign, 'sagging');

  // Superposition cross-check at x=3.25 against the two single-load solves.
  // samples=25 → uniform step 0.25, so 3.25 (and 1, 3, 5, 6) are on every
  // grid; otherwise the single-load solves don't sample 3.25 at all.
  const l1 = analyzeBeam({ span: 6, loads: [{ type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 2 }], supports: pinRoller, samples: 25 });
  const l2 = analyzeBeam({ span: 6, loads: [{ type: 'linear', start: 3, end: 6, wStart: 1, wEnd: 1 }], supports: pinRoller, samples: 25 });
  const m = (res, x) => res.diagrams.moment.find((p) => Math.abs(p.x - x) < 1e-12).M;
  close(m(r, 3.25), m(l1, 3.25) + m(l2, 3.25), 1e-9, 'M(3.25) = 7.9375 + 2.40625 superposes');
});

// ---------------------------------------------------------------------------
// Case G — honesty: classification only for indeterminate/unstable, any count.
// ---------------------------------------------------------------------------
test('G: indeterminate / unstable with multiple loads — classified only', () => {
  const loads = [
    { type: 'point', magnitude: 6, position: 2 },
    { type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 3 },
  ];
  const ind = analyzeBeam({ span: 6, loads, supports: { left: 'pin', right: 'pin' } });
  assert.equal(ind.classification.status, 'indeterminate');
  assert.ok(!('reactions' in ind));
  assert.ok(!('diagrams' in ind));
  assert.ok(!('maxMoment' in ind));
  // linear (2→3 over [1,5]): R = (2+3)·4/2 = 10, x̄ = 1 + 4(2+2·3)/(3·5) = 47/15.
  close(ind.resultant.value, 16, 1e-9, 'combined R = 6 + 10 = 16');
  close(ind.resultant.position, (6 * 2 + 10 * (47 / 15)) / 16, 1e-9, 'combined x̄ = (12 + 94/3)/16 = 65/24');

  const unst = analyzeBeam({ span: 6, loads, supports: { left: 'free', right: 'free' } });
  assert.equal(unst.classification.status, 'unstable');
  assert.ok(!('reactions' in unst));
  close(unst.resultant.value, 16, 1e-9, 'R still shown when unstable');
});

// ---------------------------------------------------------------------------
// Case H — cross-checks: routing, order-independence, derivatives, scaling,
// validation.
// ---------------------------------------------------------------------------
test('H1: single-load array input routes to the frozen legacy paths', () => {
  // Point array ≡ legacy shorthand ≡ M1.
  const viaArray = analyzeBeam({ span: 6, loads: [{ type: 'point', magnitude: 10, position: 2 }], supports: pinRoller });
  const viaLegacy = analyzeBeam({ span: 6, load: 10, position: 2, supports: pinRoller });
  assert.equal(viaArray.kind, 'beam-point-load');
  assert.deepEqual(viaArray.reactions.left.Vy, viaLegacy.reactions.left.Vy);
  assert.deepEqual(viaArray.maxMoment.value, viaLegacy.maxMoment.value);
  assert.ok('load' in viaArray.input && 'b' in viaArray.input, 'legacy echo preserved for single point');

  // Full-span linear w1=w2 ≡ M4 UDL.
  const lin = analyzeBeam({ span: 6, loads: [{ type: 'linear', start: 0, end: 6, wStart: 2, wEnd: 2 }], supports: pinRoller });
  const udl = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: pinRoller });
  assert.equal(lin.kind, 'beam-linear');
  close(lin.reactions.left.Vy, udl.reactions.left.Vy, 1e-12, 'RA');
  close(lin.maxMoment.value, udl.maxMoment.value, 1e-12, 'Mmax');
  assert.ok('intensity' in udl.input && 'totalLoad' in udl, 'M4 echoes preserved');
});

test('H2: order-independence — permuted loads give identical solutions', () => {
  const L = [
    { type: 'point', magnitude: 6, position: 2 },
    { type: 'linear', start: 3, end: 6, wStart: 1, wEnd: 1 },
    { type: 'udl', intensity: 0.5 },
  ];
  const a = analyzeBeam({ span: 6, loads: L, supports: pinRoller });
  const b = analyzeBeam({ span: 6, loads: [...L].reverse(), supports: pinRoller });

  close(a.reactions.left.Vy, b.reactions.left.Vy, 1e-12, 'RA order-free');
  close(a.reactions.right.Vy, b.reactions.right.Vy, 1e-12, 'RB order-free');
  close(a.maxMoment.value, b.maxMoment.value, 1e-12, 'Mmax order-free');
  close(a.maxMoment.position, b.maxMoment.position, 1e-12, 'peak position order-free');
  close(a.resultant.value, b.resultant.value, 1e-12, 'R order-free');

  // Sampled diagrams agree at every x (deep-equal with tolerance).
  assert.equal(a.diagrams.shear.length, b.diagrams.shear.length);
  assert.equal(a.diagrams.moment.length, b.diagrams.moment.length);
  for (let i = 0; i < a.diagrams.shear.length; i++) {
    close(a.diagrams.shear[i].V, b.diagrams.shear[i].V, 1e-12, `V at ${a.diagrams.shear[i].x}`);
  }
  for (let i = 0; i < a.diagrams.moment.length; i++) {
    close(a.diagrams.moment[i].M, b.diagrams.moment[i].M, 1e-12, `M at ${a.diagrams.moment[i].x}`);
  }
});

test('H3: derivative relations hold on uniform stencils (dM/dx=V, dV/dx=−w)', () => {
  const L = 6, wUdl = 2, x1 = 1, x2 = 5, wSeg = 2, P = 3, aP = 3;
  const r = analyzeBeam({
    span: L,
    loads: [
      { type: 'udl', intensity: wUdl },
      { type: 'linear', start: x1, end: x2, wStart: wSeg, wEnd: wSeg },
      { type: 'point', magnitude: P, position: aP },
    ],
    supports: pinRoller,
  });

  const wAt = (x) => {
    let w = wUdl;
    if (x > x1 && x < x2) w += wSeg;
    return w;
  };

  const s = r.diagrams.shear;
  const m = r.diagrams.moment;
  const pointAt = (x) =>
    r.input.loads.some((l) => l.type === 'point' && Math.abs(l.position - x) < 1e-9);
  // Shear and moment arrays no longer share indices (the shear array carries
  // two points at each point load), so shear is looked up BY x — at a jump
  // node the larger entry is the left-limit.
  const shearAtX = (x) =>
    Math.max(...s.filter((p) => Math.abs(p.x - x) < 1e-9).map((p) => p.V));
  for (let i = 1; i < m.length - 1; i++) {
    const dxL = m[i].x - m[i - 1].x;
    const dxR = m[i + 1].x - m[i].x;
    if (Math.abs(dxL - dxR) > 1e-12) continue; // uneven stencil (inserted events)
    if (dxL < 1e-9) continue;
    // A kink inside the stencil (node itself, OR either neighbour — the
    // central difference then averages across the kink) is not differentiable.
    if (pointAt(m[i].x) || pointAt(m[i - 1].x) || pointAt(m[i + 1].x)) continue;
    const dMdx = (m[i + 1].M - m[i - 1].M) / (2 * dxL);
    close(dMdx, shearAtX(m[i].x), 1e-7, `dM/dx at x=${m[i].x.toFixed(3)}`);
  }
  for (let i = 1; i < s.length - 1; i++) {
    const dxL = s[i].x - s[i - 1].x;
    const dxR = s[i + 1].x - s[i].x;
    if (Math.abs(dxL - dxR) > 1e-12) continue;
    if (dxL < 1e-9) continue;
    const x = s[i].x;
    // V jumps at point loads: skip stencils touching a jump node or its
    // neighbours (same discipline as the M5 uneven-stencil rule).
    if (pointAt(x) || pointAt(s[i - 1].x) || pointAt(s[i + 1].x)) continue;
    const dVdx = (s[i + 1].V - s[i - 1].V) / (2 * dxL);
    close(dVdx, -wAt(x), 1e-7, `dV/dx at x=${x.toFixed(3)}`);
  }
});

test('H4: linearity — doubling every load doubles reactions and Mmax', () => {
  const loads = [
    { type: 'point', magnitude: 6, position: 2 },
    { type: 'linear', start: 3, end: 6, wStart: 1, wEnd: 1 },
  ];
  const r1 = analyzeBeam({ span: 6, loads, supports: pinRoller });
  const r2 = analyzeBeam({
    span: 6,
    loads: [{ type: 'point', magnitude: 12, position: 2 }, { type: 'linear', start: 3, end: 6, wStart: 2, wEnd: 2 }],
    supports: pinRoller,
  });
  close(r2.reactions.left.Vy, 2 * r1.reactions.left.Vy, 1e-12, 'RA doubles');
  close(r2.reactions.right.Vy, 2 * r1.reactions.right.Vy, 1e-12, 'RB doubles');
  close(r2.maxMoment.value, 2 * r1.maxMoment.value, 1e-12, 'Mmax doubles');
});

test('H5: validation — count rule 1..MAX_LOADS and descriptor errors', () => {
  assert.equal(MAX_LOADS, 6);

  // Empty array rejected.
  assert.throws(() => normalizeLoads({ loads: [] }, 6), RangeError);
  // Cap enforced.
  const seven = Array.from({ length: 7 }, (_, i) => ({ type: 'point', magnitude: 1, position: (i % 5) + 0.5 }));
  assert.throws(() => normalizeLoads({ loads: seven }, 6), RangeError);
  // Six accepted.
  const six = seven.slice(0, 6);
  assert.equal(normalizeLoads({ loads: six }, 6).length, 6);
  // Non-array still a TypeError; unknown type still a TypeError.
  assert.throws(() => normalizeLoads({ loads: 'x' }, 6), TypeError);
  assert.throws(() => normalizeLoads({ loads: [{ type: 'moment', magnitude: 5 }] }, 6), TypeError);

  // Through the public API too.
  assert.throws(() => analyzeBeam({ span: 6, loads: [], supports: pinRoller }), RangeError);
  assert.throws(() => analyzeBeam({ span: 6, loads: seven, supports: pinRoller }), RangeError);
});

test('H6: combined grid inserts every load event exactly once, sorted', () => {
  const r = analyzeBeam({
    span: 6,
    loads: [
      { type: 'point', magnitude: 3, position: 2.5 },
      { type: 'linear', start: 1, end: 4, wStart: 2, wEnd: 2 },
    ],
    supports: pinRoller,
    samples: 11,
  });
  const xs = r.diagrams.moment.map((p) => p.x);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], 'strictly increasing');
  for (const ev of [1, 2.5, 4]) {
    assert.ok(xs.some((x) => Math.abs(x - ev) < 1e-12), `event x=${ev} on the grid`);
  }
});
