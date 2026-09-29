/**
 * state.js — the app's single UI state and pure state logic (M12 refactor).
 * ---------------------------------------------------------------------------
 * Extracted verbatim from app.js so the interaction layer has a DOM-free home
 * for its state: the load list, span, supports and stiffness live here, plus
 * the pure accessors and invariant repairs that operate on them, and the
 * last-solved engine result (the content provider for the M9 derivation
 * doors — the teaching layer reads THIS object, it never re-solves).
 *
 * Nothing in this module touches the DOM (the one exception is the shared `$`
 * lookup helper, which only reads `document` at call time). Solver imports
 * are limited to what the engine input builder and teaching defaults need;
 * app.js remains the ONLY caller of analyzeBeam.
 */
import { DEFAULT_EI } from '../src/analysis.js';
import { emitDescriptor } from '../src/loadmodel.js';

export const state = {
  span: 6,
  loads: [{ type: 'point', magnitude: 10, position: 3 }],
  selectedLoad: 0,             // index into state.loads
  supports: { left: 'pin', right: 'roller' },
  EI: DEFAULT_EI,              // beam stiffness, kN·m² (M8)
};

export const EDGE_EPS = 1e-3; // min gap so a region keeps a non-zero width
export const W_MAX = 50;      // kN/m editor cap (matches the w₁/w₂ inputs' max)
export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export const $ = (id) => document.getElementById(id);

// Presets: starting configurations for the distributed-load editor. The five
// M5 presets are expressed as `region` fractions + [wStart, wEnd] and emit
// `linear` (two points). The two M7 chips are expressed directly as a point
// LIST [x-fraction, w] and emit `profile`. Chips fill data; they never
// switch a mode (plan-m7.md §6).
export const PRESETS = [
  { id: 'full',      label: 'Full UDL',      hint: 'Uniform over the whole span',          region: [0, 1],      w: [2, 2] },
  { id: 'partial',   label: 'Partial UDL',   hint: 'Uniform over part of the span',        region: [1 / 6, 5 / 6], w: [2, 2] },
  { id: 'tri-left',  label: 'Triangular ▲',  hint: 'Peak at the start, zero at the end',   region: [0, 1],      w: [6, 0] },
  { id: 'tri-right', label: 'Triangular ▼',  hint: 'Zero at the start, peak at the end',   region: [0, 1],      w: [0, 6] },
  { id: 'trap',      label: 'Trapezoidal',   hint: 'Different intensity at each end',      region: [0, 1],      w: [2, 4] },
  { id: 'stepped',   label: 'Stepped',       hint: 'Two levels — 4 kN/m, then 8 kN/m at midspan', points: [[0, 4], [0.5, 4], [0.5, 8], [1, 8]] },
  { id: 'snowdrift', label: 'Snow drift ▲',  hint: 'Ramp up, plateau, taper down',                points: [[0, 0], [0.25, 6], [0.5, 6], [0.75, 3], [1, 3]] },
];

// Teaching presets (plan-m8 §2): round values, not catalogue sections.
export const EI_PRESETS = [
  { id: 'steel',    label: 'Steel beam ≈ 1.8×10⁴', value: 1.8e4, hint: 'Typical steel beam at educational scale' },
  { id: 'timber',   label: 'Timber joist ≈ 5×10²', value: 5e2,  hint: 'Typical timber joist — sags visibly more' },
  { id: 'concrete', label: 'Concrete ≈ 1.6×10⁵',  value: 1.6e5, hint: 'Typical concrete beam — sags less' },
  { id: 'default',  label: 'Default 2×10⁴',       value: DEFAULT_EI, hint: 'The teaching default (reset)' },
];

// --- selected load accessors (flat fields stay bound to the selection) ------

export function selected() {
  return state.loads[Math.min(state.selectedLoad, state.loads.length - 1)];
}

export function isSelectedDistributed() {
  return selected().type !== 'point';
}

export const getSel = () => selected();

// --- engine input (the emit rule lives in loadmodel.emitDescriptor) ---------

export function analyzeInput() {
  return {
    span: state.span,
    loads: state.loads.map(emitDescriptor),
    supports: state.supports,
    EI: state.EI,
  };
}

export function clampPosition() {
  const s = selected();
  if (s.type !== 'point') return;
  s.position = clamp(s.position, EDGE_EPS, state.span - EDGE_EPS);
}

/**
 * Invariant repair for a distributed load's control points (never an error,
 * the M6 "graceful clamping" doctrine): keep 0 ≤ x ≤ span and 0 ≤ w ≤ W_MAX,
 * keep x non-decreasing (Array.sort is stable, so a step pair keeps its
 * w-order — dragging one side of a step past the other degrades the pair
 * into an ordinary point rather than flipping the step), and keep the load
 * alive (an all-zero profile would be rejected by the engine).
 */
export function clampPoints() {
  const s = selected();
  if (s.type === 'point') return;
  clampPointsFor(s);
}

// `clampPoints` but for an arbitrary load (span changes touch every load).
export function clampPointsFor(s) {
  for (const p of s.points) {
    p.x = clamp(p.x, 0, state.span);
    p.w = clamp(p.w, 0, W_MAX);
  }
  s.points.sort((a, b) => a.x - b.x);
  if (s.points.every((p) => p.w === 0)) s.points[0].w = 2;
}

// --- last solved state -------------------------------------------------------

/** Determinacy of the CURRENT beam — cheap, from the last solved state. */
let lastDeterminate = true;

/** The last solved result — content provider for the M9 derivation doors. */
let lastResult = null;

/** Called by app.js after every analyzeBeam; nothing else writes these. */
export function setLastSolve(determinate, result) {
  lastDeterminate = determinate;
  lastResult = result;
}

export function isSelectedDeterminate() {
  return lastDeterminate;
}

export function getLastResult() {
  return lastResult;
}
