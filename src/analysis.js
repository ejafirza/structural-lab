/**
 * analysis.js — General beam analysis (Milestones 3, 4 & 5)
 * -------------------------------------------------------------
 * The single deterministic entry point for a beam with ONE load on two end
 * supports:
 *
 *   analyzeBeam({ span, loads: [descriptor], supports })   // general form
 *   analyzeBeam({ span, load, position, supports })        // legacy point-load shorthand
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
 * frozen Milestone 1 solver; the M4 full-span UDL solvers are unchanged.
 * Sign convention: sagging bending moment is POSITIVE.
 *
 * ---------------------------------------------------------------------------
 * Continuity / differentiability at load-region boundaries (M5, precise):
 *
 * For a `linear` load over [start, end], let w(x) be the intensity:
 *   • w(x) may change ABRUPTLY at x = start and x = end (a jump in intensity,
 *     e.g. 0 → wStart at `start`). w is therefore only piecewise-continuous.
 *   • Shear V(x) is CONTINUOUS everywhere (no jump — concentrated loads alone
 *     produce jumps), but its SLOPE changes: dV/dx = −w(x), so V has a kink
 *     (a discontinuity in its derivative) wherever w jumps.
 *   • Moment M(x) is CONTINUOUS and once-differentiable (C¹) everywhere:
 *     dM/dx = V is continuous, so M has no kink; however its curvature
 *     d²M/dx² = −w(x) is discontinuous at `start`/`end`.
 * We do NOT describe M as "smooth": smoothness (C∞) is not what holds here.
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

// --- public API ------------------------------------------------------------

/**
 * Analyze a single-span beam with ONE load (point, full-span UDL, or linear).
 *
 * @param {object} input
 * @param {number} input.span         L — span in metres (> 0).
 * @param {Array}  [input.loads]      load descriptors; exactly one.
 * @param {number} [input.load]       legacy point-load magnitude (kN, > 0).
 * @param {number} [input.position]   legacy point-load position a (0 < a < L).
 * @param {{left:string, right:string}} input.supports — support types at A and B.
 * @param {number} [input.samples=201] diagram sample points.
 * @returns {object} result
 */
export function analyzeBeam(input) {
  const { span, supports, samples, left, right } = validateSpanSupports(input);
  const loads = normalizeLoads(input, span);
  const load = loads[0];
  const type = load.type;

  const classification = classifySupports(left, right);
  const base = {
    kind: type === 'udl' ? 'beam-udl' : type === 'linear' ? 'beam-linear' : 'beam-point-load',
    input: {
      span,
      supports: { left, right },
      loads, // canonical normalized descriptor(s)
      // Legacy echo (kept for M1–M4 point/UDL consumers & the frozen renderer):
      ...(type === 'point'
        ? { load: load.magnitude, position: load.position, b: span - load.position }
        : {}),
      ...(type === 'udl' ? { intensity: load.intensity } : {}),
    },
    resultant: computeResultant(load, span),
    ...(type === 'udl' ? { totalLoad: load.intensity * span } : {}), // M4 back-compat
    classification,
  };

  if (classification.status !== 'determinate') {
    // Indeterminate / unstable: classify only, never fabricate numbers.
    return base;
  }

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
