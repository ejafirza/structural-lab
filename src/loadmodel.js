/**
 * loadmodel.js — Load descriptor catalog & normalization (Milestones 4 & 5)
 * ---------------------------------------------------------------------------
 * Pure data + pure validation. No I/O, no DOM, no AI.
 *
 * A "load" is a typed descriptor:
 *   { type: 'point', magnitude, position }            — concentrated load (kN)
 *   { type: 'udl', intensity, start, end }            — full-span uniform (kN/m), M4
 *   { type: 'linear', start, end, wStart, wEnd }      — linear segment (kN/m), M5
 *
 * The `linear` descriptor carries intensity at each end of a sub-region
 * [start, end]; the intensity varies linearly between wStart (at `start`) and
 * wEnd (at `end`), and is zero outside. It degenerates to:
 *   • partial UDL   → wStart = wEnd
 *   • triangular    → one of wStart / wEnd = 0
 *   • trapezoidal   → wStart, wEnd > 0 and different
 *
 * Milestone 5 still supports EXACTLY ONE load, and no arbitrary w(x), no
 * numerical integration, no combined loads.
 */

/** Load-type metadata (single source of truth for units/names). */
export const LOAD_TYPES = {
  point: { name: 'Point load', unit: 'kN' },
  udl: { name: 'Uniformly distributed load (UDL)', unit: 'kN/m' },
  linear: { name: 'Linear distributed load', unit: 'kN/m' },
};

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
  throw new TypeError(`unknown load type "${d.type}" — expected one of ${LOAD_TYPE_KEYS.join(', ')}`);
}

/**
 * Normalize input → array of load descriptors (length 1 in M4/M5).
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
    if (src.loads.length !== 1) {
      throw new RangeError(`Milestone 5 supports exactly one load (got ${src.loads.length})`);
    }
    descriptors = src.loads;
  } else {
    // Legacy point-load shorthand (M1–M3).
    descriptors = [{ type: 'point', magnitude: src.load, position: src.position }];
  }
  return descriptors.map((d) => normalizeDescriptor(d, span));
}
