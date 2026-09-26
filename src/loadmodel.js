/**
 * loadmodel.js — Load descriptor catalog & normalization (Milestones 4–7)
 * ---------------------------------------------------------------------------
 * Pure data + pure validation. No I/O, no DOM, no AI.
 *
 * A "load" is a typed descriptor:
 *   { type: 'point', magnitude, position }            — concentrated load (kN)
 *   { type: 'udl', intensity, start, end }            — full-span uniform (kN/m), M4
 *   { type: 'linear', start, end, wStart, wEnd }      — linear segment (kN/m), M5
 *   { type: 'profile', points: [{x, w}, …] }          — polyline w(x) (kN/m), M7
 *
 * The `linear` descriptor carries intensity at each end of a sub-region
 * [start, end]; the intensity varies linearly between wStart (at `start`) and
 * wEnd (at `end`), and is zero outside. It degenerates to:
 *   • partial UDL   → wStart = wEnd
 *   • triangular    → one of wStart / wEnd = 0
 *   • trapezoidal   → wStart, wEnd > 0 and different
 *
 * The `profile` descriptor (M7) carries a list of 2..MAX_PROFILE_POINTS
 * control points (x, w): the intensity follows the polyline through them,
 * is zero outside the first and last point, and a repeated adjacent x is a
 * vertical step (an intensity jump). `linear` is exactly the two-point,
 * strictly-increasing-x case — a profile never replaces it (§11 of plan-m7.md).
 *
 * Milestone 6/7 accept ONE to MAX_LOADS loads (any mix of point / udl /
 * linear / profile descriptors, superposed for ≥ 2). No expression strings,
 * no numerical integration — every solver is closed-form (per-segment).
 */

/** Load-type metadata (single source of truth for units/names). */
export const LOAD_TYPES = {
  point: { name: 'Point load', unit: 'kN' },
  udl: { name: 'Uniformly distributed load (UDL)', unit: 'kN/m' },
  linear: { name: 'Linear distributed load', unit: 'kN/m' },
  profile: { name: 'Profiled load (piecewise linear)', unit: 'kN/m' },
};

/**
 * Maximum number of loads on one beam (M6). A deliberate cap: it keeps the
 * diagrams and labels honest at educational scale, and the UI can disable
 * its add-controls against it. Raise it only with a layout audit re-run.
 */
export const MAX_LOADS = 6;

/**
 * Maximum number of control points of one `profile` load (M7). Mirrors the
 * 6-load cap: it keeps the shape drawing, the point table and the diagrams
 * honest at educational scale. Raise it only with a layout audit re-run.
 */
export const MAX_PROFILE_POINTS = 6;

export const LOAD_TYPE_KEYS = Object.keys(LOAD_TYPES);

function requireFinitePositive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  if (value <= 0) {
    throw new RangeError(`${label} must be > 0`);
  }
  return value;
}

function requireFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function requireNonNegative(value, label) {
  requireFinite(value, label);
  if (value < 0) {
    throw new RangeError(`${label} must be ≥ 0 (downward positive)`);
  }
  return value;
}

function requireInterior(value, span, label) {
  requireFinite(value, label);
  if (value <= 0 || value >= span) {
    throw new RangeError(`${label} must be strictly inside the span (0 < a < L)`);
  }
  return value;
}

function normalizeDescriptor(d, span) {
  if (d == null || typeof d !== 'object') {
    throw new TypeError('load descriptor must be an object');
  }
  if (d.type === 'point') {
    return {
      type: 'point',
      magnitude: requireFinitePositive(d.magnitude, 'load'),
      position: requireInterior(d.position, span, 'position'),
    };
  }
  if (d.type === 'udl') {
    const start = d.start ?? 0;
    const end = d.end ?? span;
    if (start !== 0 || end !== span) {
      throw new RangeError(
        'udl is full-span only (start = 0, end = span); use `linear` for a partial load'
      );
    }
    return {
      type: 'udl',
      intensity: requireFinitePositive(d.intensity, 'intensity'),
      start,
      end,
    };
  }
  if (d.type === 'linear') {
    const start = requireFinite(d.start, 'start');
    const end = requireFinite(d.end, 'end');
    if (start < 0 || end > span || start >= end) {
      throw new RangeError(
        `linear load region must satisfy 0 ≤ start < end ≤ span (got start=${start}, end=${end}, span=${span})`
      );
    }
    const wStart = requireNonNegative(d.wStart, 'wStart');
    const wEnd = requireNonNegative(d.wEnd, 'wEnd');
    if (wStart === 0 && wEnd === 0) {
      throw new RangeError('linear load intensity cannot be zero at both ends');
    }
    return { type: 'linear', start, end, wStart, wEnd };
  }
  if (d.type === 'profile') {
    if (!Array.isArray(d.points)) {
      throw new TypeError('profile load requires a points array');
    }
    if (d.points.length < 2 || d.points.length > MAX_PROFILE_POINTS) {
      throw new RangeError(
        `profile load requires 2..${MAX_PROFILE_POINTS} control points (got ${d.points.length})`
      );
    }
    const points = d.points.map((p, i) => {
      if (p == null || typeof p !== 'object' || Array.isArray(p)) {
        throw new TypeError(`profile point ${i + 1} must be an object {x, w}`);
      }
      const x = requireFinite(p.x, `profile point ${i + 1} x`);
      const w = requireNonNegative(p.w, `profile point ${i + 1} w`);
      if (x < 0 || x > span) {
        throw new RangeError(
          `profile point ${i + 1} x must satisfy 0 ≤ x ≤ span (got ${x}, span=${span})`
        );
      }
      if (i > 0 && x < d.points[i - 1].x) {
        throw new RangeError(
          `profile points must have non-decreasing x (point ${i + 1} goes backwards: ${x} < ${d.points[i - 1].x})`
        );
      }
      return { x, w };
    });
    const total = points.reduce(
      (acc, p, i) =>
        i === 0 ? acc : acc + ((points[i - 1].w + p.w) * (p.x - points[i - 1].x)) / 2,
      0
    );
    if (!(total > 0)) {
      throw new RangeError('profile load intensity cannot be zero everywhere');
    }
    return { type: 'profile', points };
  }
  throw new TypeError(`unknown load type "${d.type}" — expected one of ${LOAD_TYPE_KEYS.join(', ')}`);
}

/**
 * THE EMIT RULE (M7, plan-m7.md §4) — the single home. The UI's internal
 * model of a distributed load is its control-point list; this pure function
 * emits it as an engine descriptor:
 *   • exactly two points with distinct x → the FROZEN M5 `linear` descriptor
 *     (byte-for-byte what the M5 editor sent), so every M5/M6 screen, label
 *     and number stays identical;
 *   • otherwise (3+ points, or a repeated x = a step) → `profile`.
 * Point loads pass through untouched. Two points are always collinear, so no
 * tolerance is needed; the only non-linear two-point shape would be a step,
 * and a step is a profile by definition.
 */
export function emitDescriptor(load) {
  if (load.type === 'point') {
    return { type: 'point', magnitude: load.magnitude, position: load.position };
  }
  const pts = load.points;
  if (pts.length === 2 && pts[0].x !== pts[1].x) {
    return { type: 'linear', start: pts[0].x, end: pts[1].x, wStart: pts[0].w, wEnd: pts[1].w };
  }
  return { type: 'profile', points: pts.map((p) => ({ x: p.x, w: p.w })) };
}

/**
 * Normalize input → array of load descriptors (1..MAX_LOADS since M6;
 * the M4/M5 callers pass exactly one).
 * @param {object} input
 * @param {number} span  validated span (needed for end defaults + range checks)
 * @returns {Array<{type:string}>}
 */
export function normalizeLoads(input, span) {
  const src = input ?? {};
  let descriptors;
  if (src.loads != null) {
    if (!Array.isArray(src.loads)) {
      throw new TypeError('loads must be an array of load descriptors');
    }
    if (src.loads.length < 1) {
      throw new RangeError('at least one load is required (got an empty loads array)');
    }
    if (src.loads.length > MAX_LOADS) {
      throw new RangeError(
        `at most ${MAX_LOADS} loads are supported (got ${src.loads.length})`
      );
    }
    descriptors = src.loads;
  } else {
    // Legacy point-load shorthand (M1–M3).
    descriptors = [{ type: 'point', magnitude: src.load, position: src.position }];
  }
  return descriptors.map((d) => normalizeDescriptor(d, span));
}
