/**
 * app.js — Interaction layer (Milestones 3–7, load-list UI).
 * -------------------------------------------------------------
 * Owns the UI state and is the ONLY module that talks to the deterministic
 * engine. The renderer (renderm3.js) consumes the `analyzeBeam` result; it
 * never computes engineering values.
 *
 * M6/M7 load model: the beam carries a LIST of 1..MAX_LOADS loads (any mix
 * of point, distributed and — M7 — profile loads; superposed by the engine
 * for ≥ 2 loads or for any profile). The list is the single internal model:
 *   • one row per load; the SELECTED row's editor mirrors the EMITTED
 *     descriptor kind: point fields, or the flat distributed editor (region,
 *     w₁/w₂, presets) for a two-point load, or the M7 shape-point table for
 *     a 3+-point load (which adds the shared "+ Add point" button);
 *   • "+ Point load" / "+ Distributed load" append and select;
 *   • the last remaining load cannot be removed (the list never empties);
 *   • the beam links back: clicking/dragging a load selects its row.
 *
 * THE EMIT RULE (plan-m7.md §4) — a distributed load's internal model is its
 * control-point list; `emitDescriptor` (loadmodel.js, the single home) emits
 * it as `linear` when it has exactly two points with distinct x (the frozen
 * M5 descriptor, byte-for-byte) and as `profile` otherwise. Every M5/M6
 * screen, label and number therefore stays identical, and no legacy test is
 * edited for M7.
 */
import { analyzeBeam, DEFAULT_EI } from '../src/analysis.js';
import { MAX_LOADS, MAX_PROFILE_POINTS, emitDescriptor } from '../src/loadmodel.js';
import { SUPPORTS } from '../src/supportmodel.js';
import { getTerm } from '../src/glossary.js';
import { groupForCard } from '../src/explain.js';
import { renderM3, BAND_Y_BASE, BAND_MAX_H } from './renderm3.js';
import { makeXMap, fmt } from './render.js';
import { initTeachingPopover } from './popover.js';

const state = {
  span: 6,
  loads: [{ type: 'point', magnitude: 10, position: 3 }],
  selectedLoad: 0,             // index into state.loads
  supports: { left: 'pin', right: 'roller' },
  EI: DEFAULT_EI,              // beam stiffness, kN·m² (M8)
};

const EDGE_EPS = 1e-3; // min gap so a region keeps a non-zero width
const W_MAX = 50;      // kN/m editor cap (matches the w₁/w₂ inputs' max)
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const $ = (id) => document.getElementById(id);

// Presets: starting configurations for the distributed-load editor. The five
// M5 presets are expressed as `region` fractions + [wStart, wEnd] and emit
// `linear` (two points). The two M7 chips are expressed directly as a point
// LIST [x-fraction, w] and emit `profile`. Chips fill data; they never
// switch a mode (plan-m7.md §6).
const PRESETS = [
  { id: 'full',      label: 'Full UDL',      hint: 'Uniform over the whole span',          region: [0, 1],      w: [2, 2] },
  { id: 'partial',   label: 'Partial UDL',   hint: 'Uniform over part of the span',        region: [1 / 6, 5 / 6], w: [2, 2] },
  { id: 'tri-left',  label: 'Triangular ▲',  hint: 'Peak at the start, zero at the end',   region: [0, 1],      w: [6, 0] },
  { id: 'tri-right', label: 'Triangular ▼',  hint: 'Zero at the start, peak at the end',   region: [0, 1],      w: [0, 6] },
  { id: 'trap',      label: 'Trapezoidal',   hint: 'Different intensity at each end',      region: [0, 1],      w: [2, 4] },
  { id: 'stepped',   label: 'Stepped',       hint: 'Two levels — 4 kN/m, then 8 kN/m at midspan', points: [[0, 4], [0.5, 4], [0.5, 8], [1, 8]] },
  { id: 'snowdrift', label: 'Snow drift ▲',  hint: 'Ramp up, plateau, taper down',                points: [[0, 0], [0.25, 6], [0.5, 6], [0.75, 3], [1, 3]] },
];

// --- selected load accessors (flat fields stay bound to the selection) ------

function selected() {
  return state.loads[Math.min(state.selectedLoad, state.loads.length - 1)];
}

function isSelectedDistributed() {
  return selected().type !== 'point';
}

// --- engine input (the emit rule lives in loadmodel.emitDescriptor) ---------

function analyzeInput() {
  return {
    span: state.span,
    loads: state.loads.map(emitDescriptor),
    supports: state.supports,
    EI: state.EI,
  };
}

function refreshPosSliderBounds() {
  const s = $('slider-pos');
  s.min = 0;
  s.max = state.span;
}

function solveAndRender() {
  refreshPosSliderBounds();
  let result;
  try {
    result = analyzeBeam(analyzeInput());
  } catch (err) {
    const msg = $('validation-msg');
    msg.textContent = `⚠ ${err.message}`;
    msg.hidden = false;
    return;
  }
  $('validation-msg').hidden = true;
  lastDeterminate = result.classification.status === 'determinate';
  lastResult = result; // M9: the derivation popovers read THIS object, never re-solve
  renderM3(document, state, result);
  syncSelectedControls(); // determinacy may have flipped → E·I control follows
}

function clampPosition() {
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
function clampPoints() {
  const s = selected();
  if (s.type === 'point') return;
  clampPointsFor(s);
}

function syncInputs() {
  const s = selected();
  $('num-pos').value = fmt(s.position);
  $('slider-pos').value = s.position;
}

// --- flat-editor sync (two-point loads; the frozen M5 controls) --------------

function syncRegionInputs() {
  const s = selected();
  $('num-region-start').value = fmt(s.points[0].x);
  $('num-region-end').value = fmt(s.points[s.points.length - 1].x);
  $('slider-region-start').value = s.points[0].x;
  $('slider-region-end').value = s.points[s.points.length - 1].x;
}

function syncWInputs() {
  const s = selected();
  $('num-w1').value = fmt(s.points[0].w);
  $('num-w2').value = fmt(s.points[s.points.length - 1].w);
  $('slider-w1').value = s.points[0].w;
  $('slider-w2').value = s.points[s.points.length - 1].w;
}

// --- M7 shape-point table (the only editor of a 3+-point load) ---------------

function syncPointsEditor() {
  const s = selected();
  if (s.type === 'point') return;
  const n = s.points.length;
  $('point-count').textContent =
    n >= MAX_PROFILE_POINTS ? `(${n} points — cap)` : `(${n} points)`;

  // One row per point: [tag] [x input] [w input] [remove]. Rows are rebuilt
  // on STRUCTURE changes (add/remove/preset); field edits update in place —
  // rebuilding mid-edit would steal focus from the input being typed in.
  const wrap = $('point-table');
  wrap.replaceChildren(...s.points.map((p, i) => {
    const row = document.createElement('div');
    row.className = 'point-row';
    row.dataset.pointIndex = String(i);

    const tag = document.createElement('span');
    tag.className = 'point-tag';
    tag.textContent = String(i + 1);

    const xNum = document.createElement('input');
    xNum.type = 'number';
    xNum.className = 'point-x';
    xNum.min = 0;
    xNum.max = state.span;
    xNum.step = 0.1;
    xNum.value = fmt(p.x);
    xNum.setAttribute('aria-label', `Load point ${i + 1} of ${n} — position from support A, in metres`);
    xNum.addEventListener('input', () => {
      const v = Number(xNum.value);
      if (!Number.isFinite(v)) return;
      p.x = clamp(v, 0, state.span);
      clampPoints();
      rebuildLoadList();
      solveAndRender();
    });

    const wNum = document.createElement('input');
    wNum.type = 'number';
    wNum.className = 'point-w';
    wNum.min = 0;
    wNum.max = W_MAX;
    wNum.step = 0.1;
    wNum.value = fmt(p.w);
    wNum.setAttribute('aria-label', `Load point ${i + 1} of ${n} — intensity in kilonewtons per metre, downward`);
    wNum.addEventListener('input', () => {
      const v = Number(wNum.value);
      if (!Number.isFinite(v)) return;
      p.w = clamp(v, 0, W_MAX);
      clampPoints();
      rebuildLoadList();
      solveAndRender();
    });

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'point-remove';
    rm.textContent = '✕';
    rm.disabled = n <= 2; // a distributed load is never fewer than two points
    rm.title = n <= 2 ? 'A distributed load needs at least two points' : `Remove point ${i + 1}`;
    rm.setAttribute('aria-label', `Remove point ${i + 1} — ${fmt(p.w)} kilonewtons per metre at ${fmt(p.x)} metres`);
    rm.addEventListener('click', () => {
      if (s.points.length <= 2) return;
      s.points.splice(i, 1);
      clampPoints();
      syncSelectedControls();
      rebuildLoadList();
      solveAndRender();
      announce(`${s.points.length} points total`);
    });

    row.append(tag, xNum, wNum, rm);
    return row;
  }));

  const add = $('btn-add-cp');
  add.disabled = n >= MAX_PROFILE_POINTS;
  add.title = n >= MAX_PROFILE_POINTS
    ? `At most ${MAX_PROFILE_POINTS} points per load`
    : 'Append a point at the right end of the load';
}

/** Live unit labels on the remove buttons (per-row, no rebuild). */
function syncPointUnitLabels() {
  const s = selected();
  if (s.type === 'point') return;
  const rows = document.querySelectorAll('#point-table .point-row');
  rows.forEach((row) => {
    const i = Number(row.dataset.pointIndex);
    const p = s.points[i];
    const rm = row.querySelector('.point-remove');
    if (p && rm) {
      rm.setAttribute('aria-label', `Remove point ${i + 1} — ${fmt(p.w)} kilonewtons per metre at ${fmt(p.x)} metres`);
    }
  });
}

function syncLoadMagnitude() {
  const s = selected();
  $('num-load').value = fmt(s.magnitude);
  $('slider-load').value = s.magnitude;
}

// --- load-list UI ------------------------------------------------------------

function loadSummary(load) {
  if (load.type === 'point') {
    return `P = ${fmt(load.magnitude)} kN @ ${fmt(load.position)} m`;
  }
  if (load.points.length > 2 || load.points[0].x === load.points[1].x) {
    // Distinct consecutive intensity levels, capped at three values, then
    // min→max — a 6-point staircase must not bloat the row (M6 layout lesson).
    const lv = [];
    for (const p of load.points) {
      const v = fmt(p.w);
      if (lv[lv.length - 1] !== v) lv.push(v);
    }
    const wTxt = lv.length === 1
      ? lv[0]
      : lv.length <= 3 ? lv.join('→') : `${fmt(Math.min(...load.points.map((p) => p.w)))}→${fmt(Math.max(...load.points.map((p) => p.w)))}`;
    return `w: ${wTxt} kN/m over [${fmt(load.points[0].x)}, ${fmt(load.points[load.points.length - 1].x)}] m`;
  }
  return `w: ${fmt(load.points[0].w)}→${fmt(load.points[1].w)} kN/m over [${fmt(load.points[0].x)}, ${fmt(load.points[1].x)}] m`;
}

function loadAriaLabel(load, i, n) {
  const kind = load.type === 'point'
    ? `point load ${fmt(load.magnitude)} kilonewtons at ${fmt(load.position)} metres`
    : load.points.length > 2 || load.points[0].x === load.points[1].x
      ? `distributed load with ${load.points.length} shape points from ${fmt(load.points[0].x)} to ${fmt(load.points[load.points.length - 1].x)} metres`
      : `distributed load ${fmt(load.points[0].w)} to ${fmt(load.points[1].w)} kilonewtons per metre from ${fmt(load.points[0].x)} to ${fmt(load.points[1].x)} metres`;
  return `Select load ${i + 1} of ${n} — ${kind}`;
}

function updateAddButtons() {
  const full = state.loads.length >= MAX_LOADS;
  $('btn-add-point').disabled = full;
  $('btn-add-distributed').disabled = full;
  $('btn-add-point').title = full ? `At most ${MAX_LOADS} loads` : 'Add a point load';
  $('btn-add-distributed').title = full ? `At most ${MAX_LOADS} loads` : 'Add a distributed load';
}

function updateLoadCount() {
  const n = state.loads.length;
  $('load-count').textContent = n === 1 ? '(1 load)' : `(${n} loads)`;
}

/** Selection highlight only — rows keep their DOM identity (and focus). */
function updateLoadListRowStates() {
  const rows = document.querySelectorAll('#load-list .load-row > button:first-child');
  rows.forEach((b, i) => {
    const active = i === state.selectedLoad;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

/** Rebuild the rows (structure changed: add / remove / field edit). */
function rebuildLoadList() {
  const wrap = $('load-list');
  const n = state.loads.length;
  wrap.replaceChildren(...state.loads.map((load, i) => {
    const row = document.createElement('div');
    row.className = 'load-row';

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = i === state.selectedLoad ? 'active' : '';
    pick.setAttribute('aria-pressed', i === state.selectedLoad ? 'true' : 'false');
    pick.innerHTML = `<span class="load-badge" aria-hidden="true">${i + 1}</span><span class="load-summary">${loadSummary(load)}</span>`;
    pick.setAttribute('aria-label', loadAriaLabel(load, i, n));
    pick.addEventListener('click', () => selectLoad(i));

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'load-remove';
    rm.textContent = '✕';
    rm.disabled = n <= 1;
    rm.title = n <= 1 ? 'A beam needs at least one load' : `Remove load ${i + 1}`;
    rm.setAttribute('aria-label', `Remove load ${i + 1} — ${loadSummary(load)}`);
    rm.addEventListener('click', () => removeLoad(i));

    row.append(pick, rm);
    return row;
  }));
  updateLoadCount();
  updateAddButtons();
}

function announce(msg) {
  $('load-status').textContent = msg;
}

function selectLoad(i) {
  if (i === state.selectedLoad) return;
  state.selectedLoad = i;
  updateLoadListRowStates();
  syncSelectedControls();
  solveAndRender();
  const rows = document.querySelectorAll('#load-list .load-row > button:first-child');
  rows[i]?.focus();
}

function addLoad(type) {
  if (state.loads.length >= MAX_LOADS) return;
  const span = state.span;
  const third = span / 3;
  const load = type === 'point'
    ? { type: 'point', magnitude: 5, position: clamp(2 * third, EDGE_EPS, span - EDGE_EPS) }
    : { type: 'profile', points: [{ x: third / 2, w: 2 }, { x: 2 * third, w: 2 }] };
  state.loads.push(load);
  state.selectedLoad = state.loads.length - 1;
  syncSelectedControls();
  rebuildLoadList();
  solveAndRender();
  announce(`Load added — ${state.loads.length} ${state.loads.length === 1 ? 'load' : 'loads'} total`);
  const rows = document.querySelectorAll('#load-list .load-row > button:first-child');
  rows[state.selectedLoad]?.focus();
}

function removeLoad(i) {
  if (state.loads.length <= 1) return;
  state.loads.splice(i, 1);
  state.selectedLoad = Math.min(state.selectedLoad, state.loads.length - 1);
  syncSelectedControls();
  rebuildLoadList();
  solveAndRender();
  announce(`Load removed — ${state.loads.length} ${state.loads.length === 1 ? 'load' : 'loads'} total`);
  const rows = document.querySelectorAll('#load-list .load-row > button:first-child');
  rows[Math.min(i, state.loads.length - 1)]?.focus();
}

// --- E·I (beam stiffness) — M8 ----------------------------------------------

// Teaching presets (plan-m8 §2): round values, not catalogue sections.
const EI_PRESETS = [
  { id: 'steel',    label: 'Steel beam ≈ 1.8×10⁴', value: 1.8e4, hint: 'Typical steel beam at educational scale' },
  { id: 'timber',   label: 'Timber joist ≈ 5×10²', value: 5e2,  hint: 'Typical timber joist — sags visibly more' },
  { id: 'concrete', label: 'Concrete ≈ 1.6×10⁵',  value: 1.6e5, hint: 'Typical concrete beam — sags less' },
  { id: 'default',  label: 'Default 2×10⁴',       value: DEFAULT_EI, hint: 'The teaching default (reset)' },
];

function syncEIInputs() {
  $('num-ei').value = fmt(state.EI);
  // Log slider: value = log10(EI); range 2 (10²) … 6.3 (≈ 2×10⁶).
  $('slider-ei').value = String(Math.log10(state.EI));
  const tol = state.EI * 0.011; // within ~1% counts as the preset hit
  for (const b of document.querySelectorAll('#ei-chips .preset-chip')) {
    const preset = EI_PRESETS.find((p) => p.id === b.dataset.preset);
    const active = preset != null && Math.abs(preset.value - state.EI) <= tol;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function setEI(v) {
  const next = Number(v);
  if (!Number.isFinite(next)) return;
  state.EI = clamp(next, 1, 1e6);
  syncEIInputs();
  solveAndRender();
}

function bindEI() {
  const num = $('num-ei');
  num.addEventListener('input', () => {
    const v = Number(num.value);
    if (Number.isFinite(v) && v > 0) setEI(v);
  });
  num.addEventListener('blur', () => {
    syncEIInputs(); // restore the formatted value after a partial edit
  });
  $('slider-ei').addEventListener('input', (evt) => {
    setEI(Math.pow(10, Number(evt.target.value)));
  });
  const wrap = $('ei-chips');
  wrap.replaceChildren(...EI_PRESETS.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-chip';
    b.textContent = p.label;
    b.title = p.hint;
    b.dataset.preset = p.id;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => setEI(p.value));
    return b;
  }));
}

// Show the editor controls for the SELECTED load's concept, and sync all
// bound inputs to its (possibly newly selected) values. The editor mirrors
// the EMITTED kind — no parallel modes:
//   • point load     → point fields;
//   • two-point load → flat distributed editor (region, w₁/w₂, presets) plus
//                      the shared + Add point affordance;
//   • 3+-point load  → the shape-point table only (M7; the flat fields step
//                      aside, exactly as the owner decided).
function syncSelectedControls() {
  const s = selected();
  const dist = s.type !== 'point';
  const isProfileShape = dist && s.points.length > 2;
  $('ctl-load').hidden = dist;
  $('ctl-pos').hidden = dist;
  $('ctl-presets').hidden = !dist;
  $('ctl-region-start').hidden = !dist || isProfileShape;
  $('ctl-region-end').hidden = !dist || isProfileShape;
  $('ctl-w1').hidden = !dist || isProfileShape;
  $('ctl-w2').hidden = !dist || isProfileShape;
  $('ctl-points').hidden = !dist;
  // The stiffness control is a BEAM property: visible only when the beam is
  // determinate (the deflection panel shows a placeholder otherwise).
  $('ctl-ei').hidden = !isSelectedDeterminate();
  if (dist) {
    syncPointsEditor();
    if (!isProfileShape) {
      syncRegionInputs();
      syncWInputs();
    }
  } else {
    syncLoadMagnitude();
    syncInputs();
  }
  updatePresetHighlight();
  syncEIInputs();
}

function bindLoadListButtons() {
  $('btn-add-point').addEventListener('click', () => addLoad('point'));
  $('btn-add-distributed').addEventListener('click', () => addLoad('distributed'));
}

// --- presets ----------------------------------------------------------------

function presetPoints(p) {
  if (p.points) {
    return p.points.map(([fx, w]) => ({ x: fx * state.span, w }));
  }
  return [
    { x: p.region[0] * state.span, w: p.w[0] },
    { x: p.region[1] * state.span, w: p.w[1] },
  ];
}

function applyPreset(p) {
  const s = selected();
  if (s.type === 'point') return; // chips only apply to distributed loads
  s.points = presetPoints(p);
  clampPoints();
  syncSelectedControls();
  rebuildLoadList();
}

function matchingPreset() {
  const s = selected();
  if (!s || s.type === 'point') return null;
  const T = 0.02;
  const eq = (a, b) => Math.abs(a - b) <= T;
  const hit = PRESETS.find((p) => {
    const pts = presetPoints(p);
    if (pts.length !== s.points.length) return false;
    return pts.every((q, i) => eq(q.x, s.points[i].x) && eq(q.w, s.points[i].w));
  });
  return hit ? hit.id : null;
}

function updatePresetHighlight() {
  if (!isSelectedDistributed()) return;
  const match = matchingPreset();
  for (const b of document.querySelectorAll('#preset-chips .preset-chip')) {
    const active = b.dataset.preset === match;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function bindPresets() {
  const wrap = $('preset-chips');
  wrap.replaceChildren(...PRESETS.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-chip';
    b.textContent = p.label;
    b.title = p.hint;
    b.dataset.preset = p.id;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      applyPreset(p);
      updatePresetHighlight();
      solveAndRender();
    });
    return b;
  }));
}

// --- support selectors ------------------------------------------------------

function populateSupportSelects() {
  for (const [id, side] of [['sel-support-left', 'left'], ['sel-support-right', 'right']]) {
    const sel = $(id);
    sel.replaceChildren(
      ...Object.entries(SUPPORTS).map(([key, s]) => {
        const o = document.createElement('option');
        o.value = key;
        o.textContent = `${s.name} (${key})`;
        return o;
      })
    );
    sel.value = state.supports[side];
    sel.addEventListener('change', (evt) => {
      state.supports[side] = evt.target.value;
      solveAndRender();
    });
  }
}

// --- numeric inputs + sliders (bound to the SELECTED load) -------------------

function bindNumberSlider(numId, sliderId, apply, { min, max, step = 0.1, sanitize, onChange }) {
  const num = $(numId);
  const slider = $(sliderId);
  slider.min = min;
  slider.max = max;
  slider.step = step;

  const commit = (raw) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    apply(sanitize ? sanitize(v) : v);
    onChange?.();
    solveAndRender();
  };

  num.addEventListener('input', () => commit(num.value));
  num.addEventListener('blur', () => {
    const v = Number(num.value);
    if (!Number.isFinite(v)) num.value = fmt(apply(null));
  });
  slider.addEventListener('input', () => commit(slider.value));
}

const getSel = () => selected();

/** Determinacy of the CURRENT beam — cheap, from the last solved state. */
let lastDeterminate = true;

/** The last solved result — content provider for the M9 derivation doors. */
let lastResult = null;

function isSelectedDeterminate() {
  return lastDeterminate;
}

bindNumberSlider('num-span', 'slider-span',
  (v) => { state.span = clamp(v, 1, 20); return state.span; },
  {
    min: 1, max: 20, step: 0.1,
    sanitize: (v) => clamp(v, 1, 20),
    onChange: () => {
      state.loads.forEach((s) => {
        if (s.type === 'point') s.position = clamp(s.position, EDGE_EPS, state.span - EDGE_EPS);
        else {
          for (const p of s.points) p.x = clamp(p.x, 0, state.span);
          clampPointsFor(s);
        }
      });
      syncInputs(); syncSelectedControls(); updatePresetHighlight(); rebuildLoadList();
    },
  });

// `clampPoints` but for an arbitrary load (span changes touch every load).
function clampPointsFor(s) {
  for (const p of s.points) {
    p.x = clamp(p.x, 0, state.span);
    p.w = clamp(p.w, 0, W_MAX);
  }
  s.points.sort((a, b) => a.x - b.x);
  if (s.points.every((p) => p.w === 0)) s.points[0].w = 2;
}

bindNumberSlider('num-load', 'slider-load',
  (v) => { if (v !== null && getSel().type === 'point') getSel().magnitude = v; return getSel().magnitude; },
  { min: 0.1, max: 100, step: 0.1, sanitize: (v) => clamp(v, 0.1, 100), onChange: rebuildLoadList });

bindNumberSlider('num-pos', 'slider-pos',
  (v) => {
    const s = getSel();
    if (v !== null && s.type === 'point') s.position = v;
    return s.type === 'point' ? s.position : 0;
  },
  { min: 0, max: state.span, step: 0.01, sanitize: (v) => clamp(v, EDGE_EPS, state.span - EDGE_EPS), onChange: rebuildLoadList });

// Region boundaries (two-point loads): 0 ≤ x₁ < x₂ ≤ span — the outer ends
// are valid, only the non-zero-width gap is enforced (gracefully, by
// clamping — never as an error).
bindNumberSlider('num-region-start', 'slider-region-start',
  (v) => {
    const s = getSel();
    if (s.type === 'point') return 0;
    if (v !== null) { s.points[0].x = clamp(v, 0, s.points[1].x - EDGE_EPS); }
    return s.points[0].x;
  },
  { min: 0, max: state.span, step: 0.1, onChange: () => { updatePresetHighlight(); rebuildLoadList(); } });

bindNumberSlider('num-region-end', 'slider-region-end',
  (v) => {
    const s = getSel();
    if (s.type === 'point') return 0;
    if (v !== null) { s.points[1].x = clamp(v, s.points[0].x + EDGE_EPS, state.span); }
    return s.points[1].x;
  },
  { min: 0, max: state.span, step: 0.1, onChange: () => { updatePresetHighlight(); rebuildLoadList(); } });

// Endpoint intensities (two-point loads). Zero is valid at one end (a
// triangular load); the engine rejects only all-zero, so clampPointsFor's
// revival rule never fires here.
bindNumberSlider('num-w1', 'slider-w1',
  (v) => {
    const s = getSel();
    if (s.type === 'point') return 0;
    if (v !== null) s.points[0].w = v;
    return s.points[0].w;
  },
  { min: 0, max: 50, step: 0.1, sanitize: (v) => clamp(v, 0, 50), onChange: () => { updatePresetHighlight(); rebuildLoadList(); } });

bindNumberSlider('num-w2', 'slider-w2',
  (v) => {
    const s = getSel();
    if (s.type === 'point') return 0;
    if (v !== null) s.points[1].w = v;
    return s.points[1].w;
  },
  { min: 0, max: 50, step: 0.1, sanitize: (v) => clamp(v, 0, 50), onChange: () => { updatePresetHighlight(); rebuildLoadList(); } });

// --- M7 point-table buttons --------------------------------------------------

function bindPointsEditor() {
  $('btn-add-cp').addEventListener('click', () => {
    const s = getSel();
    if (s.type === 'point') return;
    if (s.points.length >= MAX_PROFILE_POINTS) return;
    // Insert at the midpoint of the WIDEST segment, inheriting the left
    // neighbour's intensity — a right-end append would be a no-op whenever
    // the load already reaches the span end, and a collinear insertion never
    // jumps the shape (the student then shapes the new point freely).
    let wIdx = 1;
    let wBest = -1;
    for (let i = 1; i < s.points.length; i++) {
      const gap = s.points[i].x - s.points[i - 1].x;
      if (gap > wBest) { wBest = gap; wIdx = i; }
    }
    s.points.splice(wIdx, 0, {
      x: (s.points[wIdx - 1].x + s.points[wIdx].x) / 2,
      w: s.points[wIdx - 1].w,
    });
    clampPoints();
    syncSelectedControls();
    rebuildLoadList();
    solveAndRender();
    announce(`${s.points.length} points total${s.points.length >= MAX_PROFILE_POINTS ? ', cap reached' : ''}`);
    const rows = document.querySelectorAll('#point-table .point-row .point-x');
    rows[wIdx]?.focus();
  });

  // Beam ↔ table link: focusing a table row highlights its handle (and vice
  // versa via the handle focus style). Highlight only — never rebuild mid-edit.
  $('point-table').addEventListener('focusin', (evt) => {
    const row = evt.target.closest?.('.point-row');
    if (!row) return;
    const i = row.dataset.pointIndex;
    for (const n of document.querySelectorAll('#beam-svg [data-role="profile-point"]')) {
      n.classList.toggle('row-highlight', n.getAttribute('data-point-index') === i);
    }
  });
  $('point-table').addEventListener('focusout', () => {
    for (const n of document.querySelectorAll('#beam-svg [data-role="profile-point"]')) {
      n.classList.remove('row-highlight');
    }
  });
}

// --- drag interaction (selected load's handles on the beam) ------------------

function makeBeamDraggable(svg) {
  let dragging = null; // 'load' | 'region-start' | 'region-end' | 'profile-point'
  let draggedPoint = null; // the pinned point OBJECT (identity survives re-sorting)

  const beamX = (evt) => {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    return makeXMap(state).toBeam(loc.x);
  };

  // Inverse of the renderer's band scaling (renderm3.js exports the two
  // constants — the single home of the conversion in both directions).
  const beamW = (evt, maxW) => {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    const w = ((BAND_Y_BASE - loc.y) / BAND_MAX_H) * maxW;
    return clamp(w, 0, W_MAX);
  };

  const profileMaxW = () => Math.max(...selected().points.map((p) => p.w), 1e-9);

  svg.addEventListener('pointerdown', (evt) => {
    const t = evt.target.closest?.('[data-role]');
    if (!t) return;
    const role = t.getAttribute('data-role');
    if (role === 'load-handle' || role === 'region-start' || role === 'region-end' || role === 'profile-point') {
      // Two vocabularies, mapped exactly once here: the data-role attribute
      // identifies a handle in the DOM; the drag id selects the mutation the
      // pointermove/keyboard handlers apply. The SVG handle role is
      // 'load-handle'; its drag id is 'load' (M5 consolidation renamed the
      // attribute but not the mutation — the mismatch left the arrow
      // un-draggable by mouse until the M6.5 repair; see plan-m6.5.md §1,
      // and the vocabulary guard in test/interaction-guard.test.js).
      dragging = role === 'load-handle' ? 'load' : role;
      // Pin the CONTROL-POINT OBJECT, not its index: clampPoints() may
      // re-sort the array mid-drag (a step dragged past its partner), and an
      // index would silently follow a different point. Object identity is
      // immune to sorting.
      draggedPoint = role === 'profile-point'
        ? selected().points[Number(t.getAttribute('data-point-index') ?? 0)] ?? null
        : null;
      const group = t.closest('[data-load-index]');
      if (group) {
        const idx = Number(group.getAttribute('data-load-index'));
        if (idx !== state.selectedLoad) selectLoad(idx); // beam → list selection
      }
      try { svg.setPointerCapture(evt.pointerId); } catch { /* best-effort */ }
      evt.preventDefault();
    }
  });

  svg.addEventListener('click', (evt) => {
    // Clicking any load on the beam selects it (drag already handled above).
    const group = evt.target.closest?.('[data-load-index]');
    if (!group) return;
    const idx = Number(group.getAttribute('data-load-index'));
    if (idx !== state.selectedLoad) selectLoad(idx);
  });

  window.addEventListener('pointermove', (evt) => {
    if (!dragging) return;
    const s = selected();
    if (dragging === 'profile-point') {
      const x = beamX(evt);
      if (!Number.isFinite(x) || !draggedPoint) return;
      draggedPoint.x = x;
      draggedPoint.w = beamW(evt, profileMaxW());
      clampPoints();
      // The dragged point may have changed row → resync labels only (never
      // rebuild the table mid-drag; rows are rebuilt on drag end).
      syncPointUnitLabels();
      updatePresetHighlight();
      rebuildLoadList();
      solveAndRender();
      return;
    }
    const x = beamX(evt);
    if (!Number.isFinite(x)) return;
    if (dragging === 'load') {
      s.position = clamp(x, EDGE_EPS, state.span - EDGE_EPS);
      syncInputs();
    } else if (dragging === 'region-start') {
      s.points[0].x = clamp(x, 0, s.points[1].x - EDGE_EPS);
      syncRegionInputs();
    } else if (dragging === 'region-end') {
      s.points[1].x = clamp(x, s.points[0].x + EDGE_EPS, state.span);
      syncRegionInputs();
    }
    updatePresetHighlight();
    rebuildLoadList();
    solveAndRender();
  });

  const end = (evt) => {
    if (!dragging) return;
    if (dragging === 'profile-point') {
      // Drag finished: safe to resync the whole editor now (structure may
      // have changed through step merging / re-sorting).
      syncSelectedControls();
    }
    dragging = null;
    draggedPoint = null;
    try { svg.releasePointerCapture?.(evt.pointerId); } catch { /* ignore */ }
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  svg.addEventListener('keydown', (evt) => {
    const t = evt.target.closest?.('[data-role]');
    if (!t) return;
    const role = t.getAttribute('data-role');
    const stepX = evt.key === 'ArrowLeft' ? -0.1 : evt.key === 'ArrowRight' ? 0.1 : null;
    const stepW = evt.key === 'ArrowUp' ? 0.1 : evt.key === 'ArrowDown' ? -0.1 : null;
    if (stepX === null && stepW === null) return;
    evt.preventDefault();
    // The keyboard path must read the point index from the EVENT TARGET —
    // module-level drag state belongs to the pointer path only.
    const keyPointIndex = Number(t.getAttribute('data-point-index') ?? 0);
    const s = selected();
    if (role === 'load-handle') {
      if (stepX === null) return;
      s.position = clamp(s.position + stepX, EDGE_EPS, state.span - EDGE_EPS);
      syncInputs();
    } else if (role === 'region-start') {
      if (stepX === null) return;
      s.points[0].x = clamp(s.points[0].x + stepX, 0, s.points[1].x - EDGE_EPS);
      syncRegionInputs();
    } else if (role === 'region-end') {
      if (stepX === null) return;
      s.points[1].x = clamp(s.points[1].x + stepX, s.points[0].x + EDGE_EPS, state.span);
      syncRegionInputs();
    } else if (role === 'profile-point') {
      // Pin the point OBJECT per keypress (a held arrow key repeats, and a
      // nudge that crosses a neighbour re-sorts the array — the index would
      // then follow the wrong point). After mutating, write the point's NEW
      // index back onto the handle so the next repeat tracks it.
      const p = s.points[keyPointIndex];
      if (!p) return;
      if (stepX !== null) p.x = clamp(p.x + stepX, 0, state.span);
      if (stepW !== null) p.w = clamp(p.w + stepW, 0, W_MAX);
      clampPoints();
      t.setAttribute('data-point-index', String(s.points.indexOf(p)));
      // Keyboard nudges are never mid-typing, so the table can be fully
      // resynced (its number inputs must show the nudged value).
      syncPointsEditor();
      updatePresetHighlight();
      rebuildLoadList();
      solveAndRender();
      return;
    } else {
      return;
    }
    updatePresetHighlight();
    rebuildLoadList();
    solveAndRender();
  });
}

// --- M9 teaching layer (glossary popovers + worked derivations) -------------

/**
 * One delegated popover for the whole page (ui/popover.js), fed by the two
 * pure content modules: the hand-written glossary and the derivation
 * formatter over the FINISHED result. Bound only when the host environment
 * provides document-level events — the fake-DOM test shims (the ui-m7/m8
 * pattern) have no addEventListener, and the teaching layer must stay as
 * invisible to them as the deflection panel is to pre-M8 fixtures (the
 * optional-DOM contract renderM3 already applies).
 */
function initTeaching() {
  if (typeof document.addEventListener !== 'function') return;
  initTeachingPopover(document, {
    getGlossary: (key) => getTerm(key),
    getSteps: (label) => {
      if (!lastResult || lastResult.classification.status !== 'determinate') return [];
      const g = groupForCard(lastResult, label);
      return g ? [g] : [];
    },
  });
}

// --- boot --------------------------------------------------------------------

bindPresets();
populateSupportSelects();
bindLoadListButtons();
bindPointsEditor();
bindEI();
initTeaching();
syncSelectedControls();
rebuildLoadList();
makeBeamDraggable(document.getElementById('beam-svg'));
solveAndRender();
