/**
 * analysis.js — General beam analysis (Milestones 3, 4, 5 & 6)
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
 */
function cumulativeKernel(load, span) {
  if (load.type === 'point') {
    return (x) => (x <= load.position ? 0 : load.magnitude);
  }
  if (load.type === 'udl') {
    return linearKernels(0, span, load.intensity, load.intensity, load.intensity * span, span / 2).cumulative;
  }
  const b = load.end - load.start;
  const R = ((load.wStart + load.wEnd) * b) / 2;
  const xbar = load.start + (b * (load.wStart + 2 * load.wEnd)) / (3 * (load.wStart + load.wEnd));
  return linearKernels(load.start, load.end, load.wStart, load.wEnd, R, xbar).cumulative;
}

/**
 * Per-load first-moment kernel F(x) = ∫₀ˣ (x−t)·w(t) dt about x.
 *   point    → P·max(0, x − a)
 *   udl/linear → M5 linear kernel (piecewise cubic inside)
 */
function firstMomentKernel(load, span) {
  if (load.type === 'point') {
    return (x) => (x <= load.position ? 0 : load.magnitude * (x - load.position));
  }
  if (load.type === 'udl') {
    return linearKernels(0, span, load.intensity, load.intensity, load.intensity * span, span / 2).firstMoment;
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
  // region boundaries). includePoints() inserts and sorts, and de-duplicates
  // within tolerance — so a point load sitting exactly on a region boundary
  // yields one ordinate, not two.
  const extras = [];
  for (const load of loads) {
    if (load.type === 'point') extras.push(load.position);
    else if (load.type === 'udl') extras.push(0, span);
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

// --- public API ------------------------------------------------------------

/**
 * Analyze a single-span beam with 1..MAX_LOADS loads (point, full-span UDL,
 * or linear). Single-load inputs keep the frozen M1/M4/M5 solver paths;
 * 2+ loads solve by closed-form superposition (solveCombined).
 *
 * @param {object} input
 * @param {number} input.span         L — span in metres (> 0).
 * @param {Array}  [input.loads]      load descriptors; 1..MAX_LOADS.
 * @param {number} [input.load]       legacy point-load magnitude (kN, > 0).
 * @param {number} [input.position]   legacy point-load position a (0 < a < L).
 * @param {{left:string, right:string}} input.supports — support types at A and B.
 * @param {number} [input.samples=201] diagram sample points.
 * @returns {object} result
 */
export function analyzeBeam(input) {
  const { span, supports, samples, left, right } = validateSpanSupports(input);
  const loads = normalizeLoads(input, span);
  const type = loads.length === 1 ? loads[0].type : 'combined';

  const classification = classifySupports(left, right);
  const base = {
    kind:
      type === 'udl' ? 'beam-udl'
      : type === 'linear' ? 'beam-linear'
      : type === 'point' ? 'beam-point-load'
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

  if (type === 'combined') {
    return { ...base, ...solveCombined(loads, span, left, right, samples) };
  }

  const load = loads[0];
  if (type === 'point') {
    if (left === 'fixed' || right === 'fixed') {
      return { ...base, ...solveCantilever(span, load.magnitude, load.position, left === 'fixed', samples) };
    }
    return { ...base, ...solveSimplySupported(span, load.magnitude, load.position, left, right, samples) };
  }

  if (type === 'udl') {
    const w = load.intensity;
    if (left === 'fixed' || right === 'fixed') {
      return { ...base, ...solveCantileverUDL(span, w, left === 'fixed', samples) };
    }
    return { ...base, ...solveSimplySupportedUDL(span, w, samples) };
  }

  // linear
  if (left === 'fixed' || right === 'fixed') {
    return { ...base, ...solveCantileverLinear(span, load.start, load.end, load.wStart, load.wEnd, left === 'fixed', samples) };
  }
  return { ...base, ...solveSimplySupportedLinear(span, load.start, load.end, load.wStart, load.wEnd, samples) };
}
