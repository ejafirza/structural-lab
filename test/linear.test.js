/**
 * Linear (segmented) distributed-load analysis tests (Milestone 5).
 *
 * The `linear` descriptor { start, end, wStart, wEnd } covers partial UDL
 * (wStart = wEnd), triangular (one end = 0) and trapezoidal (both ends > 0).
 * Every expected value is a closed-form textbook result:
 *
 *   resultant  R   = (w1 + w2)·b / 2
 *   centroid   x̄   = start + b·(w1 + 2·w2) / (3·(w1 + w2))
 *   reactions  RA  = R·(L − x̄)/L ,  RB = R·x̄/L
 *
 * and the peak moment occurs where V(x) = 0 (solved analytically, not by
 * quadrature). Boundary behavior is asserted precisely: w may jump, V is C⁰
 * with a slope change (dV/dx = −w), M is C¹ (dM/dx = V).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeam } from '../src/analysis.js';

const close = (actual, expected, tol = 1e-9, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label} expected ${expected}, got ${actual}`);

// ---------------------------------------------------------------------------
// 1. Partial UDL, simply supported: L=6, w=2 over [1,5]
//    b=4 → R=8, x̄=3, RA=RB=4, Mmax=8 at x=3
// ---------------------------------------------------------------------------
test('partial UDL: resultant R=w·b, centroid at region centre, RA=RB=R/2', () => {
  const r = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 2 }],
    supports: { left: 'pin', right: 'roller' },
  });

  assert.equal(r.classification.status, 'determinate');
  assert.equal(r.kind, 'beam-linear');
  close(r.resultant.value, 8, 1e-9, 'R = w·b = 8');
  close(r.resultant.position, 3, 1e-9, 'x̄ = region centre = 3');
  close(r.reactions.left.Vy, 4, 1e-9, 'RA');
  close(r.reactions.right.Vy, 4, 1e-9, 'RB');
  assert.equal(r.reactions.left.Hx, 0);

  close(r.maxMoment.value, 8, 1e-9, 'Mmax');
  close(r.maxMoment.position, 3, 1e-9, 'peak at V=0 → x=3');
  assert.equal(r.maxMoment.sign, 'sagging');
  assert.equal(r.equilibrium.satisfied, true);
  assert.ok(!('shearJump' in r.diagrams), 'distributed load → continuous shear, no jump');
});

// ---------------------------------------------------------------------------
// 2. Triangular, peak at the LEFT, full span [0,6], w0=6
//    R=18, x̄=2, RA=12, RB=6, V=12−6x+x²/2, Mmax=8√3 at x=6−2√3
// ---------------------------------------------------------------------------
test('triangular peak-left: V quadratic, Mmax=8√3 at x=6−2√3', () => {
  const r = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 0, end: 6, wStart: 6, wEnd: 0 }],
    supports: { left: 'pin', right: 'roller' },
  });

  close(r.resultant.value, 18, 1e-9, 'R = w0·L/2 = 18');
  close(r.resultant.position, 2, 1e-9, 'x̄ = L/3 = 2 (peak on the left)');
  close(r.reactions.left.Vy, 12, 1e-9, 'RA = 12');
  close(r.reactions.right.Vy, 6, 1e-9, 'RB = 6');

  // V(x) = 12 − 6x + x²/2
  const vMid = r.diagrams.shear.find((p) => Math.abs(p.x - 3) < 1e-12);
  close(vMid.V, 12 - 18 + 4.5, 1e-9, 'V(3) = −1.5');

  const xPeak = 6 - 2 * Math.sqrt(3);
  close(r.maxMoment.position, xPeak, 1e-9, 'peak at 6−2√3');
  close(r.maxMoment.value, 8 * Math.sqrt(3), 1e-9, 'Mmax = 8√3');
  assert.equal(r.maxMoment.sign, 'sagging');
});

// ---------------------------------------------------------------------------
// 3. Triangular, peak at the RIGHT (mirror): RA=6, RB=12, Mmax=8√3 at x=2√3
// ---------------------------------------------------------------------------
test('triangular peak-right: reactions mirror, Mmax=8√3 at x=2√3', () => {
  const r = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 0, end: 6, wStart: 0, wEnd: 6 }],
    supports: { left: 'pin', right: 'roller' },
  });

  close(r.resultant.value, 18, 1e-9, 'R = 18');
  close(r.resultant.position, 4, 1e-9, 'x̄ = 2L/3 = 4 (peak on the right)');
  close(r.reactions.left.Vy, 6, 1e-9, 'RA = 6');
  close(r.reactions.right.Vy, 12, 1e-9, 'RB = 12');
  close(r.maxMoment.position, 2 * Math.sqrt(3), 1e-9, 'peak at 2√3');
  close(r.maxMoment.value, 8 * Math.sqrt(3), 1e-9, 'Mmax = 8√3');
});

// ---------------------------------------------------------------------------
// 4. Trapezoidal, full span [0,6], w: 2 → 4
//    R=18, x̄=10/3, RA=8, RB=10, peak where 8−2x−x²/6=0
// ---------------------------------------------------------------------------
test('trapezoidal: resultant/centroid and analytic V=0 peak', () => {
  const r = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 0, end: 6, wStart: 2, wEnd: 4 }],
    supports: { left: 'pin', right: 'roller' },
  });

  close(r.resultant.value, 18, 1e-9, 'R = (2+4)·6/2 = 18');
  close(r.resultant.position, 10 / 3, 1e-9, 'x̄ = 10/3');
  close(r.reactions.left.Vy, 8, 1e-9, 'RA = 8');
  close(r.reactions.right.Vy, 10, 1e-9, 'RB = 10');

  const xp = (-12 + Math.sqrt(336)) / 2;            // root of 8−2x−x²/6=0
  const Mmax = 8 * xp - xp * xp - (xp * xp * xp) / 18;
  close(r.maxMoment.position, xp, 1e-9, 'peak at analytic V=0 root');
  close(r.maxMoment.value, Mmax, 1e-9, 'Mmax');
  assert.equal(r.maxMoment.sign, 'sagging');
});

// ---------------------------------------------------------------------------
// 5. Cantilever versions
// ---------------------------------------------------------------------------
test('cantilever fixed-left partial UDL: V_A=R, M_A=R·x̄', () => {
  const r = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 2 }],
    supports: { left: 'fixed', right: 'free' },
  });
  assert.deepEqual(r.reactions.left, { type: 'fixed', Hx: 0, Vy: 8, Mz: 24 });
  assert.deepEqual(r.reactions.right, { type: 'free' });
  close(r.maxMoment.value, 24, 1e-9, '|M|max = R·x̄ = 24');
  close(r.maxMoment.position, 0, 1e-9, 'peak at the fixed support');
  assert.equal(r.maxMoment.sign, 'hogging');

  // free-end moment vanishes
  const mEnd = r.diagrams.moment[r.diagrams.moment.length - 1];
  close(mEnd.M, 0, 1e-9, 'M(L) = 0');
});

test('cantilever fixed-right partial UDL: M_B = R·(L−x̄)', () => {
  const r = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 2 }],
    supports: { left: 'free', right: 'fixed' },
  });
  assert.deepEqual(r.reactions.right, { type: 'fixed', Hx: 0, Vy: 8, Mz: 24 });
  close(r.maxMoment.value, 24, 1e-9, 'R·(L−x̄) = 8·3 = 24');
  close(r.maxMoment.position, 6, 1e-9, 'peak at the right fixed support');
  assert.equal(r.maxMoment.sign, 'hogging');
});

// ---------------------------------------------------------------------------
// 6. Cross-check: a full-span `linear` with wStart = wEnd reproduces the M4 UDL
// ---------------------------------------------------------------------------
test('full-span linear (wStart=wEnd) ≡ M4 full-span UDL solver', () => {
  const lin = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 0, end: 6, wStart: 2, wEnd: 2 }],
    supports: { left: 'pin', right: 'roller' },
  });
  const udl = analyzeBeam({ span: 6, loads: [{ type: 'udl', intensity: 2 }], supports: { left: 'pin', right: 'roller' } });

  close(lin.reactions.left.Vy, udl.reactions.left.Vy, 1e-12, 'RA');
  close(lin.reactions.right.Vy, udl.reactions.right.Vy, 1e-12, 'RB');
  close(lin.maxMoment.value, udl.maxMoment.value, 1e-12, 'Mmax');
  close(lin.maxMoment.position, udl.maxMoment.position, 1e-12, 'peak position');
  close(lin.resultant.value, udl.resultant.value, 1e-12, 'R ≡ W');
  close(lin.resultant.position, udl.resultant.position, 1e-12, 'x̄ ≡ L/2');
});

// ---------------------------------------------------------------------------
// 7. Boundary continuity/differentiability, asserted precisely (M5 requirement)
// ---------------------------------------------------------------------------
test('boundary behaviour: w jumps, V continuous (C⁰), M C¹ with dM/dx = V', () => {
  const L = 6, x1 = 1, x2 = 5, w = 2;
  const r = analyzeBeam({
    span: L, loads: [{ type: 'linear', start: x1, end: x2, wStart: w, wEnd: w }],
    supports: { left: 'pin', right: 'roller' },
  });

  // V is continuous: no shearJump, and the sampled V is finite everywhere.
  assert.ok(!('shearJump' in r.diagrams));
  const s = r.diagrams.shear;
  assert.ok(s.every((p) => Number.isFinite(p.V)));

  // dM/dx = V holds at every interior node where the sample grid is uniform.
  // (M is C¹, so dM/dx = V exists even at the region boundaries; but the
  // central-difference stencil becomes uneven exactly where the engine inserts
  // the x₁/x₂ nodes, and M is not C² there — its curvature d²M/dx² = −w(x)
  // jumps. We therefore only assert on uniform stencils.)
  const m = r.diagrams.moment;
  for (let i = 1; i < m.length - 1; i++) {
    const dxL = m[i].x - m[i - 1].x;
    const dxR = m[i + 1].x - m[i].x;
    if (Math.abs(dxL - dxR) > 1e-12) continue; // skip uneven grid (inserted x₁/x₂)
    if (dxL < 1e-9) continue;
    const dMdx = (m[i + 1].M - m[i - 1].M) / (2 * dxL);
    close(dMdx, s[i].V, 1e-7, `dM/dx at x=${m[i].x.toFixed(3)}`);
  }

  // dV/dx = −w(x): −w inside the region, 0 outside. V is C⁰ but NOT C¹ at the
  // boundaries (its slope jumps by −w there), so we skip the uneven stencils
  // adjacent to x₁/x₂ just as above.
  const wAt = (x) => (x > x1 && x < x2 ? w : 0);
  for (let i = 1; i < s.length - 1; i++) {
    const dxL = s[i].x - s[i - 1].x;
    const dxR = s[i + 1].x - s[i].x;
    if (Math.abs(dxL - dxR) > 1e-12) continue;
    if (dxL < 1e-9) continue;
    const x = s[i].x;
    const dVdx = (s[i + 1].V - s[i - 1].V) / (2 * dxL);
    close(dVdx, -wAt(x), 1e-7, `dV/dx at x=${x.toFixed(3)}`);
  }
});

// ---------------------------------------------------------------------------
// 8. Honesty & validation
// ---------------------------------------------------------------------------
test('indeterminate / unstable linear loads are classified only', () => {
  const ind = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 3 }],
    supports: { left: 'pin', right: 'pin' },
  });
  assert.equal(ind.classification.status, 'indeterminate');
  assert.ok(!('reactions' in ind));
  assert.ok(!('diagrams' in ind));
  assert.ok(!('maxMoment' in ind));
  // Resultant/centroid are load properties, available regardless:
  close(ind.resultant.value, 10, 1e-9, 'R = (2+3)·4/2 = 10');
  close(ind.resultant.position, 1 + (4 * (2 + 6)) / (3 * 5), 1e-9, 'x̄');

  const unst = analyzeBeam({
    span: 6, loads: [{ type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 3 }],
    supports: { left: 'free', right: 'free' },
  });
  assert.equal(unst.classification.status, 'unstable');
  assert.ok(!('reactions' in unst));
});

test('linear input validation', () => {
  assert.throws(() => analyzeBeam({ span: 6, loads: [{ type: 'linear', start: 1, end: 5, wStart: 0, wEnd: 0 }], supports: { left: 'pin', right: 'roller' } }), RangeError);
  assert.throws(() => analyzeBeam({ span: 6, loads: [{ type: 'linear', start: 5, end: 1, wStart: 2, wEnd: 2 }], supports: { left: 'pin', right: 'roller' } }), RangeError);
  assert.throws(() => analyzeBeam({ span: 6, loads: [{ type: 'linear', start: 1, end: 7, wStart: 2, wEnd: 2 }], supports: { left: 'pin', right: 'roller' } }), RangeError);
});

// ---------------------------------------------------------------------------
// 9. Regression: point-load path still matches the frozen M1 solver
// ---------------------------------------------------------------------------
test('point-load path unchanged after linear generalization (M1 cross-check)', () => {
  const via = analyzeBeam({ span: 6, load: 10, position: 3, supports: { left: 'pin', right: 'roller' } });
  close(via.reactions.left.Vy, 5, 1e-12, 'RA');
  close(via.reactions.right.Vy, 5, 1e-12, 'RB');
  close(via.maxMoment.value, 15, 1e-12, 'Mmax = P·L/4');
  close(via.resultant.value, 10, 1e-12, 'point resultant = P');
  close(via.resultant.position, 3, 1e-12, 'point centroid = a');
});
