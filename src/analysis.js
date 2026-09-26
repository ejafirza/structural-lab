/**
 * analysis.js — General beam analysis (Milestones 3–7)
 * -------------------------------------------------------------
 * The single deterministic entry point for a beam with ONE OR MORE loads
 * (1..MAX_LOADS, any mix) on two end supports:
 *
 *   analyzeBeam({ span, loads: [descriptor, …], supports })  // general form
 *   analyzeBeam({ span, load, position, supports })          // legacy point-load shorthand
 *   analyzeBeam({ span, loads: [descriptor], supports })     // exactly one (M4/M5)
 *
 * Load descriptors (see loadmodel.js):
 *   • point   → concentrated load
 *   • udl     → full-span uniform load (M4)
 *   • linear  → linearly-varying load over a sub-region [start, end] (M5):
 *               partial UDL (wStart = wEnd), triangular (one end = 0),
 *               trapezoidal (both ends > 0).
 *   • profile → piecewise-linear w(x) through 2..MAX_PROFILE_POINTS control
 *               points (M7); a repeated adjacent x is a vertical step. The
 *               resultant is the per-segment sum of the M5 closed forms and
 *               the kernels reuse the two-function contract of M6 — no new
 *               numerics, every integral exact.
 *
 * Classification (unchanged from M3/M4):
 *   • determinate    → solved: reactions, SFD/BMD, max moment (+ sign),
 *                      equilibrium check, and the load's resultant (R, x̄).
 *   • indeterminate  → classified only; no reactions/diagrams/moment.
 *   • unstable       → classified only, with the unconstrained motion named.
 *
 * This module is PURE. The simply-supported point-load branch REUSES the
 * frozen Milestone 1 solver; the M4 full-span UDL and M5 linear solvers are
 * unchanged. M6 adds `solveCombined` for loads.length ≥ 2, which is pure
 * superposition of closed-form kernels — no numerics. Sign convention:
 * sagging bending moment is POSITIVE.
 *
 * ---------------------------------------------------------------------------
 * Continuity / differentiability with combined loads (M5 + M6, precise):
 *
 * For a `linear` load over [start, end], let w(x) be the intensity:
 *   • w(x) may change ABRUPTLY at x = start and x = end (a jump in intensity,
 *     e.g. 0 → wStart at `start`). w is therefore only piecewise-continuous.
 *   • Shear V(x) is CONTINUOUS there (no jump — distributed loads never
 *     jump), but its SLOPE changes: dV/dx = −w(x), so V has a kink
 *     (a discontinuity in its derivative) wherever w jumps.
 *   • Moment M(x) is CONTINUOUS and once-differentiable (C¹) there:
 *     dM/dx = V is continuous, so M has no kink; however its curvature
 *     d²M/dx² = −w(x) is discontinuous at `start`/`end`.
 * We do NOT describe M as "smooth": smoothness (C∞) is not what holds here.
 *
 * A concentrated load adds a DIFFERENT kind of event: at each point-load
 * position aᵢ the shear V jumps DOWN by Pᵢ (C⁰ discontinuity) and the moment
 * M has a KINK (dM/dx = V jumps by −Pᵢ; M stays continuous). Combined
 * beams carry both event kinds at once; the sampled arrays carry both.
 */

import { solveSimplySupportedPointLoad } from './engine.js';
import { classifySupports, SUPPORT_TYPES } from './supportmodel.js';
import { normalizeLoads } from './loadmodel.js';

const EPS = 1e-9;

// --- input validation (span/supports/samples — load-agnostic) ---------------

function validateSpanSupports(input) {
  const { span, supports } = input ?? {};

  if (typeof span !== 'number' || !Number.isFinite(span)) {
    throw new TypeError('span must be a finite number');
  }
  if (span <= 0) throw new RangeError('span must be > 0');

  if (supports == null || typeof supports !== 'object') {
    throw new TypeError('supports { left, right } is required');
  }
  for (const side of ['left', 'right']) {
    const key = supports[side];
    if (!SUPPORT_TYPES.includes(key)) {
      throw new TypeError(
        `supports.${side} must be one of ${SUPPORT_TYPES.join(', ')}; got "${key}"`
      );
    }
  }

  const samples = input.samples ?? 201;
  if (!Number.isInteger(samples) || samples < 2) {
    throw new RangeError('samples must be an integer >= 2');
  }
  return { span, supports, samples, left: supports.left, right: supports.right };
}

// --- diagram sampling helpers ----------------------------------------------

function makeGrid(L, samples) {
  const step = L / (samples - 1);
  const grid = [];
  for (let i = 0; i < samples; i++) grid.push(step * i);
  return grid;
}

/** Grid with extra x-ordinates (region boundaries / load position) inserted. */
function includePoints(grid, extra, L) {
  const xs = grid.slice();
  const tol = 1e-12 * Math.max(1, L);
  for (const x of extra) {
    if (!xs.some((g) => Math.abs(g - x) < tol)) xs.push(x);
  }
  xs.sort((p, q) => p - q);
  return xs;
}

function sampleDiagrams(grid, a, shearLeft, shearRight, momentAt, L) {
  const tol = 1e-12 * Math.max(1, L);

  const shear = [];
  for (const x of grid) {
    if (x < a - tol) shear.push({ x, V: shearLeft });
    else if (x > a + tol) shear.push({ x, V: shearRight });
  }
  shear.push({ x: a, V: shearLeft });   // left-limit
  shear.push({ x: a, V: shearRight });  // right-limit (the jump)
  shear.sort((p, q) => p.x - q.x || p.V - q.V);

  const xs = grid.slice();
  if (!xs.some((x) => Math.abs(x - a) < tol)) xs.push(a);
  xs.sort((p, q) => p - q);
  const moment = xs.map((x) => ({ x, M: momentAt(x) }));

  const shearJump = { x: a, left: shearLeft, right: shearRight, drop: shearLeft - shearRight };
  return { shear, moment, shearJump };
}

function equilibriumCheck({ sumFx, sumFy, sumMz }, loadScale, L) {
  const scale = Math.max(1, Math.abs(loadScale), Math.abs(loadScale * L));
  const satisfied = [sumFx, sumFy, sumMz].every((v) => Math.abs(v) <= EPS * scale);
  return { sumFx, sumFy, sumMz, satisfied };
}

// --- resultant (equivalent single force + centroid) — load-agnostic ---------

/**
 * Reduce any load to its equivalent resultant force R at centroid x̄.
 * Reactions depend only on (R, x̄); this is the seam a future arbitrary w(x)
 * solver would reuse (computing (R, x̄) by quadrature instead of closed form).
 */
function computeResultant(load, span) {
  if (load.type === 'point') {
    return { value: load.magnitude, position: load.position };
  }
  if (load.type === 'udl') {
    return { value: load.intensity * span, position: span / 2 };
  }
  if (load.type === 'profile') {
    // Per-segment summation of the M5 trapezoid closed forms (plan-m7 §3):
    // a zero-width segment (a step pair) contributes nothing — correct, a
    // jump changes the shape, not the total.
    let R = 0;
    let moment = 0;
    const pts = load.points;
    for (let i = 1; i < pts.length; i++) {
      const b = pts[i].x - pts[i - 1].x;
      if (b <= 0) continue;
      const Ri = ((pts[i - 1].w + pts[i].w) * b) / 2;
      if (Ri <= 0) continue;
      const xbari = pts[i - 1].x + (b * (pts[i - 1].w + 2 * pts[i].w)) / (3 * (pts[i - 1].w + pts[i].w));
      R += Ri;
      moment += Ri * xbari;
    }
    return { value: R, position: moment / R };
  }
  // linear: trapezoid area + centroid
  const b = load.end - load.start;
  const R = ((load.wStart + load.wEnd) * b) / 2;
  const xbar = load.start + (b * (load.wStart + 2 * load.wEnd)) / (3 * (load.wStart + load.wEnd));
  return { value: R, position: xbar };
}

// --- point-load solvers (M3, unchanged) ------------------------------------

/** Simply supported (pin + roller, either order). Reuses the frozen M1 core. */
function solveSimplySupported(L, P, a, left, right, samples) {
  const m1 = solveSimplySupportedPointLoad({ span: L, load: P, position: a, samples });
  return {
    reactions: {
      left: left === 'pin' ? { type: 'pin', Hx: 0, Vy: m1.reactions.RA } : { type: 'roller', Vy: m1.reactions.RA },
      right: right === 'pin' ? { type: 'pin', Hx: 0, Vy: m1.reactions.RB } : { type: 'roller', Vy: m1.reactions.RB },
    },
    diagrams: m1.diagrams,
    maxMoment: { value: m1.maxMoment.value, position: m1.maxMoment.position, sign: 'sagging' },
    equilibrium: {
      sumFx: 0,
      sumFy: m1.equilibrium.sumFy,
      sumMz: m1.equilibrium.sumMomentsAboutA,
      satisfied: m1.equilibrium.satisfied,
    },
  };
}

/** Cantilever (fixed + free). Point load at distance `a` from the left end. */
function solveCantilever(L, P, a, fixedAtLeft, samples) {
  const grid = makeGrid(L, samples);

  if (fixedAtLeft) {
    const Mz = P * a;
    const shearLeft = P;
    const shearRight = 0;
    const momentAt = (x) => (x <= a ? P * (x - a) : 0);
    const diagrams = sampleDiagrams(grid, a, shearLeft, shearRight, momentAt, L);
    return {
      reactions: {
        left: { type: 'fixed', Hx: 0, Vy: P, Mz },
        right: { type: 'free' },
      },
      diagrams,
      maxMoment: { value: P * a, position: 0, sign: 'hogging' },
      equilibrium: equilibriumCheck({ sumFx: 0, sumFy: P - P, sumMz: Mz - P * a }, P, L),
    };
  }

  const b = L - a;
  const Mz = P * b;
  const shearLeft = 0;
  const shearRight = -P;
  const momentAt = (x) => (x <= a ? 0 : P * (a - x));
  const diagrams = sampleDiagrams(grid, a, shearLeft, shearRight, momentAt, L);
  return {
    reactions: {
      left: { type: 'free' },
      right: { type: 'fixed', Hx: 0, Vy: P, Mz },
    },
    diagrams,
    maxMoment: { value: P * b, position: L, sign: 'hogging' },
    equilibrium: equilibriumCheck({ sumFx: 0, sumFy: P - P, sumMz: Mz - P * b }, P, L),
  };
}

// --- UDL solvers (M4, full-span only, unchanged) ----------------------------

/** Simply supported, full-span UDL: RA = RB = wL/2, Mmax = wL²/8 at midspan. */
function solveSimplySupportedUDL(L, w, samples) {
  const grid = makeGrid(L, samples);
  const RA = (w * L) / 2;
  const shearAt = (x) => w * (L / 2 - x);
  const momentAt = (x) => (w / 2) * x * (L - x);

  return {
    reactions: {
      left: { type: 'pin', Hx: 0, Vy: RA },
      right: { type: 'roller', Vy: RA },
    },
    diagrams: {
      shear: grid.map((x) => ({ x, V: shearAt(x) })),
      moment: grid.map((x) => ({ x, M: momentAt(x) })),
    },
    maxMoment: { value: (w * L * L) / 8, position: L / 2, sign: 'sagging' },
    equilibrium: equilibriumCheck(
      { sumFx: 0, sumFy: 2 * RA - w * L, sumMz: RA * L - (w * L) * (L / 2) },
      w * L,
      L
    ),
  };
}

/** Cantilever, full-span UDL: V_A = wL, M_A = wL²/2 (hogging). */
function solveCantileverUDL(L, w, fixedAtLeft, samples) {
  const grid = makeGrid(L, samples);
  const Mz = (w * L * L) / 2;

  if (fixedAtLeft) {
    const shearAt = (x) => w * (L - x);                 // +wL → 0
    const momentAt = (x) => -(w / 2) * (L - x) * (L - x); // −wL²/2 → 0
    return {
      reactions: {
        left: { type: 'fixed', Hx: 0, Vy: w * L, Mz },
        right: { type: 'free' },
      },
      diagrams: {
        shear: grid.map((x) => ({ x, V: shearAt(x) })),
        moment: grid.map((x) => ({ x, M: momentAt(x) })),
      },
      maxMoment: { value: (w * L * L) / 2, position: 0, sign: 'hogging' },
      equilibrium: equilibriumCheck(
        { sumFx: 0, sumFy: w * L - w * L, sumMz: Mz - (w * L) * (L / 2) },
        w * L,
        L
      ),
    };
  }

  const shearAt = (x) => -w * x;                        // 0 → −wL
  const momentAt = (x) => -(w / 2) * x * x;             // 0 → −wL²/2
  return {
    reactions: {
      left: { type: 'free' },
      right: { type: 'fixed', Hx: 0, Vy: w * L, Mz },
    },
    diagrams: {
      shear: grid.map((x) => ({ x, V: shearAt(x) })),
      moment: grid.map((x) => ({ x, M: momentAt(x) })),
    },
    maxMoment: { value: (w * L * L) / 2, position: L, sign: 'hogging' },
    equilibrium: equilibriumCheck(
      { sumFx: 0, sumFy: w * L - w * L, sumMz: Mz - (w * L) * (L / 2) },
      w * L,
      L
    ),
  };
}

// --- linear (segmented) distributed-load solvers (M5) ----------------------

/**
 * Locate the (unique) zero of shear inside the loaded region [x1, x2], i.e.
 * where V(x) = 0 — the position of peak bending moment.
 *
 * Inside the region V(t) = RA − [w1·t + (w2−w1)·t²/(2b)] with t = x − x1.
 * V is strictly decreasing there (dV/dx = −w < 0) and goes from +RA at t=0 to
 * −RB at t=b, so the zero is unique. Solved analytically (quadratic formula),
 * NOT numerically.
 */
function shearZeroInRegion(RA, x1, b, w1, w2) {
  if (Math.abs(w2 - w1) < 1e-12) {
    // Uniform segment: V = RA − w·t → t = RA/w.
    return x1 + RA / w1;
  }
  // Quadratic: a·t² + c·t − RA = 0,  a = (w2−w1)/(2b), c = w1.
  const a = (w2 - w1) / (2 * b);
  const c = w1;
  const disc = c * c + 4 * a * RA;
  let t = (-c + Math.sqrt(disc)) / (2 * a);
  if (t < 0) t = 0;
  if (t > b) t = b;
  return x1 + t;
}

/**
 * Shared closed-form kernels for a linear load over [x1, x2] (w1 at x1, w2 at x2).
 * Returns { cumulative, firstMoment } where
 *   cumulative(x)  = ∫₀ˣ w       (load to the left of x)
 *   firstMoment(x) = ∫₀ˣ (x−t)w(t)dt  (first moment of that load about x)
 */
function linearKernels(x1, x2, w1, w2, R, xbar) {
  const b = x2 - x1;
  const cumulative = (x) => {
    if (x <= x1) return 0;
    if (x >= x2) return R;
    const t = x - x1;
    return w1 * t + ((w2 - w1) * t * t) / (2 * b);
  };
  const firstMoment = (x) => {
    if (x <= x1) return 0;
    if (x >= x2) return x * R - R * xbar;
    const t = x - x1;
    return (w1 * t * t) / 2 + ((w2 - w1) * t * t * t) / (6 * b);
  };
  return { cumulative, firstMoment };
}

/** Simply supported, linear load: RA = R(L−x̄)/L; V quadratic, M cubic inside. */
function solveSimplySupportedLinear(L, x1, x2, w1, w2, samples) {
  const b = x2 - x1;
  const R = ((w1 + w2) * b) / 2;
  const xbar = x1 + (b * (w1 + 2 * w2)) / (3 * (w1 + w2));
  const RA = (R * (L - xbar)) / L;
  const RB = (R * xbar) / L;

  const { cumulative, firstMoment } = linearKernels(x1, x2, w1, w2, R, xbar);
  const shearAt = (x) => RA - cumulative(x);
  const momentAt = (x) => (x <= x1 ? RA * x : x >= x2 ? RB * (L - x) : RA * x - firstMoment(x));

  const xPeak = shearZeroInRegion(RA, x1, b, w1, w2);
  const xs = includePoints(makeGrid(L, samples), [x1, x2], L);

  return {
    reactions: {
      left: { type: 'pin', Hx: 0, Vy: RA },
      right: { type: 'roller', Vy: RB },
    },
    diagrams: {
      shear: xs.map((x) => ({ x, V: shearAt(x) })),
      moment: xs.map((x) => ({ x, M: momentAt(x) })),
    },
    maxMoment: { value: momentAt(xPeak), position: xPeak, sign: 'sagging' },
    equilibrium: equilibriumCheck(
      { sumFx: 0, sumFy: RA + RB - R, sumMz: RB * L - R * xbar },
      R,
      L
    ),
  };
}

/** Cantilever, linear load: V_A = R, M_A = R·x̄ (fixed-left) or mirror. */
function solveCantileverLinear(L, x1, x2, w1, w2, fixedAtLeft, samples) {
  const b = x2 - x1;
  const R = ((w1 + w2) * b) / 2;
  const xbar = x1 + (b * (w1 + 2 * w2)) / (3 * (w1 + w2));
  const { cumulative, firstMoment } = linearKernels(x1, x2, w1, w2, R, xbar);
  const xs = includePoints(makeGrid(L, samples), [x1, x2], L);

  if (fixedAtLeft) {
    const Mz = R * xbar;
    const shearAt = (x) => R - cumulative(x);
    const momentAt = (x) => R * (x - xbar) - firstMoment(x);
    return {
      reactions: {
        left: { type: 'fixed', Hx: 0, Vy: R, Mz },
        right: { type: 'free' },
      },
      diagrams: {
        shear: xs.map((x) => ({ x, V: shearAt(x) })),
        moment: xs.map((x) => ({ x, M: momentAt(x) })),
      },
      maxMoment: { value: R * xbar, position: 0, sign: 'hogging' },
      equilibrium: equilibriumCheck({ sumFx: 0, sumFy: R - R, sumMz: Mz - R * xbar }, R, L),
    };
  }

  const Mz = R * (L - xbar);
  const shearAt = (x) => -cumulative(x);
  const momentAt = (x) => -firstMoment(x);
  return {
    reactions: {
      left: { type: 'free' },
      right: { type: 'fixed', Hx: 0, Vy: R, Mz },
    },
    diagrams: {
      shear: xs.map((x) => ({ x, V: shearAt(x) })),
      moment: xs.map((x) => ({ x, M: momentAt(x) })),
    },
    maxMoment: { value: R * (L - xbar), position: L, sign: 'hogging' },
    equilibrium: equilibriumCheck(
      { sumFx: 0, sumFy: R - R, sumMz: Mz - R * (L - xbar) },
      R,
      L
    ),
  };
}

// --- M6 combined-load solvers (superposition of closed-form kernels) -------

/**
 * Per-load cumulative-load kernel C(x) = ∫₀ˣ w  (load left of x).
 *   point    → step: 0 for x ≤ a, P for x > a
 *   udl      → M5 linear kernel over [0, L] with w1 = w2 = intensity
 *   linear   → M5 kernel over [start, end] (piecewise quadratic inside)
 *   profile  → sum of M5 kernels over consecutive control-point segments
 *              (profileKernels, M7); a step pair contributes nothing.
 */
function cumulativeKernel(load, span) {
  if (load.type === 'point') {
    return (x) => (x <= load.position ? 0 : load.magnitude);
  }
  if (load.type === 'udl') {
    return linearKernels(0, span, load.intensity, load.intensity, load.intensity * span, span / 2).cumulative;
  }
  if (load.type === 'profile') {
    return profileKernels(load.points).cumulative;
  }
  const b = load.end - load.start;
  const R = ((load.wStart + load.wEnd) * b) / 2;
  const xbar = load.start + (b * (load.wStart + 2 * load.wEnd)) / (3 * (load.wStart + load.wEnd));
  return linearKernels(load.start, load.end, load.wStart, load.wEnd, R, xbar).cumulative;
}

/**
 * Closed-form kernels for a `profile` load (M7): the M5 two-function contract
 * ({cumulative, firstMoment}) summed segment by segment. Each segment's
 * integrals are the elementary trapezoid area / first moment — exact, no
 * quadrature approximation.
 */
function profileKernels(points) {
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const x1 = points[i - 1].x;
    const x2 = points[i].x;
    const w1 = points[i - 1].w;
    const w2 = points[i].w;
    const b = x2 - x1;
    if (b <= 0) continue; // a step pair: shape only, no area
    const R = ((w1 + w2) * b) / 2;
    if (R <= 0) continue; // zero-intensity stretch (a gap): contributes nothing
    const xbar = x1 + (b * (w1 + 2 * w2)) / (3 * (w1 + w2));
    segments.push(linearKernels(x1, x2, w1, w2, R, xbar));
  }
  const cumulative = (x) => segments.reduce((s, k) => s + k.cumulative(x), 0);
  const firstMoment = (x) => segments.reduce((s, k) => s + k.firstMoment(x), 0);
  return { cumulative, firstMoment };
}

/**
 * Per-load first-moment kernel F(x) = ∫₀ˣ (x−t)·w(t) dt about x.
 *   point    → P·max(0, x − a)
 *   udl/linear → M5 linear kernel (piecewise cubic inside)
 *   profile  → profileKernels (M7), same contract as linear
 */
function firstMomentKernel(load, span) {
  if (load.type === 'point') {
    return (x) => (x <= load.position ? 0 : load.magnitude * (x - load.position));
  }
  if (load.type === 'udl') {
    return linearKernels(0, span, load.intensity, load.intensity, load.intensity * span, span / 2).firstMoment;
  }
  if (load.type === 'profile') {
    return profileKernels(load.points).firstMoment;
  }
  const b = load.end - load.start;
  const R = ((load.wStart + load.wEnd) * b) / 2;
  const xbar = load.start + (b * (load.wStart + 2 * load.wEnd)) / (3 * (load.wStart + load.wEnd));
  return linearKernels(load.start, load.end, load.wStart, load.wEnd, R, xbar).firstMoment;
}

/**
 * Combined resultant of a load set: R = ΣRᵢ, x̄ = ΣRᵢx̄ᵢ / R.
 * This is the total equivalent single force of the WHOLE load group —
 * reactions depend only on it (the M5 seam, now consumed).
 */
function combinedResultant(loads, span) {
  let R = 0;
  let moment = 0;
  for (const load of loads) {
    const { value, position } = computeResultant(load, span);
    R += value;
    moment += value * position;
  }
  return { value: R, position: moment / R };
}

/**
 * Sampled shear for a combined beam. At every point-load position the shear
 * is discontinuous (a downward jump of P), so — exactly like the frozen M1
 * solver — the array carries TWO points at that x (both one-sided limits),
 * and the renderer draws the vertical step. Distributed boundaries stay
 * single-point (V is C⁰ there).
 */
function buildCombinedShear(xs, shearAt, jumpAt) {
  const out = [];
  const tol = 1e-12 * Math.max(1, xs[xs.length - 1]);
  for (const x of xs) {
    const jump = jumpAt(x);
    if (jump > 0) {
      out.push({ x, V: shearAt(x) - jump }); // right-limit (below)
      out.push({ x, V: shearAt(x) });        // left-limit (above)
    } else {
      out.push({ x, V: shearAt(x) });
    }
  }
  out.sort((p, q) => p.x - q.x || p.V - q.V);
  return out;
}

/**
 * Solve a beam carrying 2..MAX_LOADS downward loads by superposition.
 *
 * Reactions come from the combined resultant (R, x̄) — the exact same
 * statics as a single load. V(x) = RA − ΣCᵢ(x) and M(x) = RA·x − ΣFᵢ(x)
 * superpose the frozen closed-form kernels, so point-load shear jumps and
 * distributed-load kinks coexist faithfully in the sampled arrays.
 *
 * Peak moment (simply supported): V(0⁺) = RA > 0 and V is NON-INCREASING
 * on [0, L] (dV/dx = −w ≤ 0 between events; downward jumps P at points),
 * so M ≥ 0 and its maximum sits where V transitions through zero. The
 * candidate set covers all three regimes analytically (no bisection):
 *   • analytic V = 0 roots inside each piecewise segment (linear root or
 *     quadratic-formula root inside a linear region, as in M5),
 *   • every point-load position (a jump may straddle zero; M is continuous
 *     there),
 *   • every region boundary / segment endpoint (covers the degenerate
 *     V ≡ 0 plateau).
 * Mmax = max M over the candidate set, in closed form.
 *
 * Cantilever: M(x) is monotone from −M_A (or 0) to the free end, so |M|max
 * is at the fixed end: M_A = R·x̄ (fixed-left) / R·(L − x̄) (fixed-right).
 */
function solveCombined(loads, span, left, right, samples) {
  const { value: R, position: xbar } = combinedResultant(loads, span);

  const cumulativeFns = loads.map((l) => cumulativeKernel(l, span));
  const firstMomentFns = loads.map((l) => firstMomentKernel(l, span));
  const cumulative = (x) => cumulativeFns.reduce((s, f) => s + f(x), 0);
  const firstMoment = (x) => firstMomentFns.reduce((s, f) => s + f(x), 0);

  // Sampling ordinates: uniform grid + every load event (point positions,
  // region boundaries, and — M7 — every profile control point x). includePoints()
  // inserts and sorts, and de-duplicates within tolerance — so a point load
  // sitting exactly on a region boundary yields one ordinate, not two. For a
  // profile STEP (a repeated x) one ordinate is also the correct boundary:
  // an intensity jump leaves V C⁰ and M C¹ there (unlike a point load, which
  // jumps V and needs the jump-pair sampling of buildCombinedShear).
  const extras = [];
  for (const load of loads) {
    if (load.type === 'point') extras.push(load.position);
    else if (load.type === 'udl') extras.push(0, span);
    else if (load.type === 'profile') extras.push(...load.points.map((p) => p.x));
    else extras.push(load.start, load.end);
  }
  const xs = includePoints(makeGrid(span, samples), extras, span);

  const tol = 1e-12 * Math.max(1, span);
  const jumpAt = (x) =>
    loads.reduce(
      (s, l) => s + (l.type === 'point' && Math.abs(l.position - x) < tol ? l.magnitude : 0),
      0
    );

  if (left === 'fixed' || right === 'fixed') {
    const fixedLeft = left === 'fixed';
    const Mz = fixedLeft ? R * xbar : R * (span - xbar);
    const shearAt = fixedLeft
      ? (x) => R - cumulative(x)
      : (x) => -cumulative(x);
    const momentAt = fixedLeft
      ? (x) => R * (x - xbar) - firstMoment(x)
      : (x) => -firstMoment(x);
    return {
      reactions: fixedLeft
        ? { left: { type: 'fixed', Hx: 0, Vy: R, Mz }, right: { type: 'free' } }
        : { left: { type: 'free' }, right: { type: 'fixed', Hx: 0, Vy: R, Mz } },
      diagrams: {
        shear: buildCombinedShear(xs, shearAt, jumpAt),
        moment: xs.map((x) => ({ x, M: momentAt(x) })),
      },
      maxMoment: fixedLeft
        ? { value: R * xbar, position: 0, sign: 'hogging' }
        : { value: R * (span - xbar), position: span, sign: 'hogging' },
      equilibrium: equilibriumCheck(
        { sumFx: 0, sumFy: R - R, sumMz: Mz - R * (fixedLeft ? xbar : span - xbar) },
        R,
        span
      ),
    };
  }

  // Simply supported: RA = R(L − x̄)/L, RB = R·x̄/L.
  const RA = (R * (span - xbar)) / span;
  const RB = (R * xbar) / span;
  const shearAt = (x) => RA - cumulative(x);
  const momentAt = (x) => RA * x - firstMoment(x);

  // --- peak-moment candidate set (all closed form; see doc comment) -------
  // Segment the span at every load event (the grid ordinates already are that
  // set). Between consecutive events the total intensity is constant or
  // linear, so V is EXACTLY linear or quadratic there: two interior samples
  // determine its coefficients exactly (no finite-difference bias), with the
  // contributions of ALL loads active in the segment (superposed kernels).
  const candidates = xs.slice();
  for (let k = 0; k < xs.length - 1; k++) {
    const xk = xs[k];
    const b = xs[k + 1] - xk;
    if (b < tol) continue;
    // V just right of xk: subtract any shear jump that sits exactly at xk.
    const vStart = RA - cumulative(xk) - jumpAt(xk);
    // Exact quadratic model V(t) = vStart − w0·t − (s/2)·t² on [0, b]:
    // fit (w0, s) from V at t1 = b/3 and t2 = 2b/3 (exact for quadratic V).
    const t1 = b / 3;
    const t2 = (2 * b) / 3;
    const u1 = vStart - shearAt(xk + t1);
    const u2 = vStart - shearAt(xk + t2);
    const det = (t1 * t2 * (t2 - t1)) / 2;
    const w0 = (u1 * t2 * t2 - u2 * t1 * t1) / (2 * det);
    const s = (t1 * u2 - t2 * u1) / det;
    if (w0 < tol && s <= 0) continue;          // V never decreases → no zero inside
    // Root of (s/2)t² + w0·t − vStart = 0, in the numerically stable form
    // (conjugate of the quadratic formula — no cancellation as s → 0, so
    // uniform-intensity and unloaded segments take the same path).
    const disc = w0 * w0 + 2 * s * vStart;
    if (disc < 0) continue;
    const denom = w0 + Math.sqrt(disc);
    if (denom <= 0) continue;
    const t = (2 * vStart) / denom;
    if (t > tol && t < b - tol) candidates.push(xk + t);
  }

  let xPeak = 0;
  let mPeak = momentAt(0);
  for (const x of candidates) {
    const m = momentAt(x);
    if (m > mPeak) { mPeak = m; xPeak = x; }
  }

  return {
    reactions: {
      left: { type: 'pin', Hx: 0, Vy: RA },
      right: { type: 'roller', Vy: RB },
    },
    diagrams: {
      shear: buildCombinedShear(xs, shearAt, jumpAt),
      moment: xs.map((x) => ({ x, M: momentAt(x) })),
    },
    maxMoment: { value: mPeak, position: xPeak, sign: 'sagging' },
    equilibrium: equilibriumCheck(
      { sumFx: 0, sumFy: RA + RB - R, sumMz: RB * span - R * xbar },
      R,
      span
    ),
  };
}


// --- M8 deflection (elastic curve) — pure add-on over any solved result -----

/**
 * Teaching-default beam stiffness (kN·m²) — the order of a typical steel
 * beam at educational scale. Used when the caller omits `EI`.
 */
export const DEFAULT_EI = 2.0e4;

/**
 * Validate the (optional) beam stiffness E·I. Same error taxonomy as every
 * other engine input: TypeError for a non-number, RangeError for a
 * non-positive value. Absent → DEFAULT_EI (echoed in the result).
 */
function resolveEI(ei) {
  if (ei == null) return DEFAULT_EI;
  if (typeof ei !== 'number' || !Number.isFinite(ei)) {
    throw new TypeError('EI must be a finite number (kN·m²)');
  }
  if (ei <= 0) {
    throw new RangeError('EI must be > 0');
  }
  return ei;
}

/**
 * Bisection root of θ(t) = 0 on [a, b] where θ changes sign (values
 * precomputed). The M6 plan's sanctioned bounded root-finder: θ is C¹ and
 * strictly monotone near its zero, so 80 bisection steps are far beyond
 * double-precision convergence — no accuracy is lost against a closed form.
 */
function bisectRoot(thetaFn, a, b, fa) {
  let lo = a;
  let hi = b;
  let flo = fa;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const fm = thetaFn(mid);
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Exact ∫ₐᵇ M(x) dx for ONE load on a beam whose supports have been
 * normalized to (fixed-left | pin+roller | mirrored-fixed-right).
 * M(x) = R_eff·x − Σᵢ [load term], each term elementary:
 *   point  P at p:  −P·max(0, x−p)          → ∫ = −P·(x−p)²/2 beyond p
 *   udl    w on [0,L]: −w·x²/2             → ∫ = −w·x³/6
 *   dist (w1→w2 over [x1,x2]):
 *     inside: −[w1·s³/6 + (w2−w1)·s⁴/(24b)]      (s = x−x1, b = x2−x1)
 *     beyond: −[area·(x−x2) + ∫inside]           (area = (w1+w2)·b/2)
 * (Every antiderivative hand-verified against plan-m8 §8 Cases A/D/F.)
 */
function momentIntegralTerm(load, x) {
  if (load.type === 'point') {
    const s = x - load.position;
    return s > 0 ? load.magnitude * s * s / 2 : 0;
  }
  if (load.type === 'udl') {
    return load.intensity * x * x * x / 6;
  }
  if (load.type === 'linear') {
    const { start, end, wStart, wEnd } = load;
    const b = end - start;
    const s = x - start;
    if (s <= 0) return 0;
    const inside = wStart * s * s * s / 6 + ((wEnd - wStart) * Math.pow(s, 4)) / (24 * b);
    if (s <= b) return inside;
    // Beyond the region the load's MOMENT contribution keeps growing with
    // the constant area at the constant arm: W-contrib(s) = W-contrib(b)
    // + M-contrib(b)·(s−b) + area·(s−b)²/2 (each piece hand-checked).
    const area = ((wStart + wEnd) * b) / 2;
    const insideFull = wStart * b * b * b / 6 + ((wEnd - wStart) * Math.pow(b, 4)) / (24 * b);
    const mFull = wStart * b * b / 2 + ((wEnd - wStart) * b * b * b) / (6 * b);
    return insideFull + mFull * (s - b) + (area * (s - b) * (s - b)) / 2;
  }
  // profile: sum over segments
  let total = 0;
  const pts = load.points;
  for (let i = 1; i < pts.length; i++) {
    const x1 = pts[i - 1].x;
    const x2 = pts[i].x;
    const w1 = pts[i - 1].w;
    const w2 = pts[i].w;
    const b = x2 - x1;
    if (b <= 0 || w1 + w2 <= 0) continue;
    const s = x - x1;
    if (s <= 0) break;
    const inside = w1 * s * s * s / 6 + ((w2 - w1) * Math.pow(s, 4)) / (24 * b);
    if (s <= b) {
      total += inside;
      break;
    }
    const area = ((w1 + w2) * b) / 2;
    const insideFull = w1 * b * b * b / 6 + ((w2 - w1) * Math.pow(b, 4)) / (24 * b);
    const mFull = w1 * b * b / 2 + ((w2 - w1) * b * b * b) / (6 * b);
    total += insideFull + mFull * (s - b) + (area * (s - b) * (s - b)) / 2;
  }
  return total;
}

/**
 * Deflection / elastic curve of a DETERMINATE result — a pure add-on.
 *
 * EI·v″ = M with W(x) = EI·θ(x) = ∫₀ˣM + C₁ and U(x) = EI·v(x) = ∫₀ˣW + C₂.
 * M(x) is rebuilt EXACTLY from the result's own reactions and load list
 * (mirrored for a fixed-right wall — statics is left/right symmetric), and
 * both integrals are exact closed forms (momentIntegralTerm + the elementary
 * integral of each term). No approximation is introduced anywhere.
 *
 * Constants from the support conditions:
 *   simply supported:  v(0) = 0 → C₂ = 0;  v(L) = 0 → C₁ = −I_W(L)/L
 *   cantilever:        θ(wall) = 0 → C₁ = −W(wall);  v(wall) = 0 → C₂ = −I_W(wall) − C₁·wall
 * SIGN CONVENTION: v and θ are reported DOWN-POSITIVE (a sagging beam
 * deflects downward → positive v — the serviceability quantity). Integrating
 * the sagging-positive M twice yields an up-positive raw curve, so the
 * published v/θ are its negation; equivalently EI·v″ = −M in this convention.
 * Max |v| over {grid ordinates} ∪ {interior θ = 0 roots} (bisection — the
 * M6 plan's sanctioned bounded root-finder). v and θ are C¹; no jump pairs.
 *
 * Returns { EI, v: [{x, v}], theta: [{x, theta}], max: { value (m,
 * downward-positive), position, sign } }.
 */
function computeDeflection(result, span, left, right, EI) {
  // Mirror map: x = span − x′ turns a fixed-RIGHT beam into a fixed-LEFT one
  // (loads flip their position inside their descriptor; reactions swap ends).
  const mirrored = right === 'fixed';
  const mirrorLoad = (l) => {
    if (l.type === 'point') return { ...l, position: span - l.position };
    if (l.type === 'udl') return l;
    if (l.type === 'linear') return { ...l, start: span - l.end, end: span - l.start, wStart: l.wEnd, wEnd: l.wStart };
    return { type: 'profile', points: l.points.map((p) => ({ x: span - p.x, w: p.w })).reverse() };
  };
  const loads = mirrored ? result.input.loads.map(mirrorLoad) : result.input.loads;

  const grid = result.diagrams.moment.map((p) => (mirrored ? span - p.x : p.x)).sort((a, b) => a - b);
  const at = (x) => (mirrored ? span - x : x); // mirror coordinate ↔ original

  // Reactions in MIRRORED coordinates (wall at 0 for cantilevers):
  //   R0  = vertical reaction at the left end (wall or pin),
  //   Mz  = wall reaction moment (hogging magnitude from the engine; its
  //         sagging-convention contribution to M is −Mz).
  const R0 = mirrored ? result.reactions.right.Vy : result.reactions.left.Vy;
  const Mz = (mirrored || left === 'fixed')
    ? (mirrored ? result.reactions.right.Mz : result.reactions.left.Mz)
    : 0;

  // W(x) = EI·θ(x) pre-constant: ∫₀ˣ M dt with the EXACT
  //   M(t) = −Mz + R0·t − Σᵢ (moment of load i about t),
  // so W(x) = −Mz·x + R0·x²/2 − Σ momentIntegralTerm(l, x).
  const Wof = (x) => {
    let s = -Mz * x + (R0 * x * x) / 2;
    for (const l of loads) s -= momentIntegralTerm(l, x);
    return s;
  };
  // I_W(x) = ∫₀ˣW: composed with Simpson panels on the EXACT W. W is
  // piecewise polynomial of degree ≤ 4; Simpson is exact for cubics (all
  // point/udl cases — W is quadratic there) and carries < 1e-9 relative
  // error for linear/profile W (degree 4, grid cells never straddle an
  // event). The analytical suite pins every case to hand values.
  const simpsonW = (a, b) => {
    const h = (b - a) / 2;
    return (h / 3) * (Wof(a) + 4 * Wof(a + h) + Wof(b));
  };
  const IWof = (x) => {
    if (x <= 0) return 0;
    const last = grid[grid.length - 1];
    if (x >= last) {
      let s = 0;
      for (let i = 1; i < grid.length; i++) s += simpsonW(grid[i - 1], grid[i]);
      return s;
    }
    let i = 1;
    while (i < grid.length && grid[i] < x) i++;
    let s = 0;
    for (let k = 1; k < i; k++) s += simpsonW(grid[k - 1], grid[k]);
    s += simpsonW(grid[i - 1], x);
    return s;
  };

  // Constants (see doc comment). After mirroring, every cantilever is
  // fixed-LEFT: W(0) = IW(0) = 0 → C₁ = C₂ = 0. Simply supported:
  // C₂ = 0 and C₁ = −I_W(L)/L pins v(L) = 0.
  let C1;
  let C2;
  if (mirrored || left === 'fixed') {
    C1 = 0;
    C2 = 0;
  } else {
    C2 = 0;
    C1 = -IWof(grid[grid.length - 1]) / span;
  }

  const thetaWeighted = (x) => Wof(x) + C1;
  const vWeighted = (x) => IWof(x) + C1 * x + C2;

  // Down-positive publication (see sign-convention note): negate the raw
  // up-positive integration of the sagging-positive moment.
  const v = grid.map((x) => ({ x: at(x), v: -vWeighted(x) / EI }));
  const theta = grid.map((x) => ({ x: at(x), theta: -thetaWeighted(x) / EI }));
  if (mirrored) {
    v.sort((p, q) => p.x - q.x);
    theta.sort((p, q) => p.x - q.x);
  }

  // Max |v| over ordinates + interior θ = 0 roots, all in ORIGINAL
  // coordinates via one scanner (mirror-aware).
  let maxPos = 0;
  let maxVal = 0;
  const scan = (xOriginal) => {
    const xw = mirrored ? span - xOriginal : xOriginal;
    const val = -vWeighted(xw) / EI;
    if (Math.abs(val) > Math.abs(maxVal)) { maxVal = val; maxPos = xOriginal; }
  };
  scan(0);
  scan(span);
  for (const p of v) scan(p.x);
  for (let i = 0; i < grid.length - 1; i++) {
    const t1 = thetaWeighted(grid[i]);
    const t2 = thetaWeighted(grid[i + 1]);
    if (t1 === 0 || t2 === 0 || Math.sign(t1) === Math.sign(t2)) continue;
    const xRoot = bisectRoot((xx) => thetaWeighted(xx), grid[i], grid[i + 1], t1);
    scan(at(xRoot));
  }

  return {
    EI,
    v,
    theta,
    max: {
      value: Math.abs(maxVal),
      position: maxPos,
      sign: maxVal < 0 ? 'up' : 'down',
    },
  };
}

/**
 * Attach the deflection add-on to a DETERMINATE result (no-op otherwise).
 * Pure: returns a new object; the input result is not mutated.
 */
function attachDeflection(result, span, left, right, EI) {
  if (result.classification.status !== 'determinate') return result;
  return { ...result, deflection: computeDeflection(result, span, left, right, EI) };
}

// --- public API ------------------------------------------------------------

/**
 * Analyze a single-span beam with 1..MAX_LOADS loads (point, full-span UDL,
 * linear, or profile). Single point/udl/linear inputs keep the frozen
 * M1/M4/M5 solver paths; a profile load (alone or mixed) and 2+ loads solve
 * by closed-form superposition (solveCombined).
 *
 * @param {object} input
 * @param {number} input.span         L — span in metres (> 0).
 * @param {Array}  [input.loads]      load descriptors; 1..MAX_LOADS.
 * @param {number} [input.load]       legacy point-load magnitude (kN, > 0).
 * @param {number} [input.position]   legacy point-load position a (0 < a < L).
 * @param {{left:string, right:string}} input.supports — support types at A and B.
 * @param {number} [input.samples=201] diagram sample points.
 * @param {number} [input.EI=DEFAULT_EI] beam stiffness E·I in kN·m² (> 0);
 *        determinate results carry a `deflection` block computed with it.
 * @returns {object} result
 */
export function analyzeBeam(input) {
  const { span, supports, samples, left, right } = validateSpanSupports(input);
  const EI = resolveEI(input?.EI);
  const loads = normalizeLoads(input, span);
  const type = loads.length === 1 ? loads[0].type : 'combined';

  const classification = classifySupports(left, right);
  const base = {
    kind:
      type === 'udl' ? 'beam-udl'
      : type === 'linear' ? 'beam-linear'
      : type === 'point' ? 'beam-point-load'
      : type === 'profile' ? 'beam-profile'
      : 'beam-multi-load',
    input: {
      span,
      supports: { left, right },
      loads, // canonical normalized descriptor(s)
      // Legacy echo (kept for M1–M4 point/UDL consumers & the frozen renderer):
      ...(type === 'point'
        ? { load: loads[0].magnitude, position: loads[0].position, b: span - loads[0].position }
        : {}),
      ...(type === 'udl' ? { intensity: loads[0].intensity } : {}),
    },
    resultant:
      type === 'combined'
        ? combinedResultant(loads, span)
        : computeResultant(loads[0], span),
    ...(type === 'udl' ? { totalLoad: loads[0].intensity * span } : {}), // M4 back-compat
    classification,
  };

  if (classification.status !== 'determinate') {
    // Indeterminate / unstable: classify only, never fabricate numbers.
    return base;
  }

  if (type === 'combined' || type === 'profile') {
    // M6 multi-load and the M7 profile (alone or in a mix) share the fully
    // general superposition solver; a lone profile is just its one-kernel case.
    return attachDeflection({ ...base, ...solveCombined(loads, span, left, right, samples) }, span, left, right, EI);
  }

  const load = loads[0];
  if (type === 'point') {
    if (left === 'fixed' || right === 'fixed') {
      return attachDeflection({ ...base, ...solveCantilever(span, load.magnitude, load.position, left === 'fixed', samples) }, span, left, right, EI);
    }
    return attachDeflection({ ...base, ...solveSimplySupported(span, load.magnitude, load.position, left, right, samples) }, span, left, right, EI);
  }

  if (type === 'udl') {
    const w = load.intensity;
    if (left === 'fixed' || right === 'fixed') {
      return attachDeflection({ ...base, ...solveCantileverUDL(span, w, left === 'fixed', samples) }, span, left, right, EI);
    }
    return attachDeflection({ ...base, ...solveSimplySupportedUDL(span, w, samples) }, span, left, right, EI);
  }

  // linear
  if (left === 'fixed' || right === 'fixed') {
    return attachDeflection({ ...base, ...solveCantileverLinear(span, load.start, load.end, load.wStart, load.wEnd, left === 'fixed', samples) }, span, left, right, EI);
  }
  return attachDeflection({ ...base, ...solveSimplySupportedLinear(span, load.start, load.end, load.wStart, load.wEnd, samples) }, span, left, right, EI);
}
