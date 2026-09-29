/**
 * app.js — interaction layer: engine adapter + editor orchestration.
 * -------------------------------------------------------------
 * Wires the DOM controls to the UI state and is the ONLY module that calls
 * the deterministic engine. The renderer (renderm3.js) consumes the
 * `analyzeBeam` result; it never computes engineering values.
 *
 * Where things live after the M12 module split:
 *   • ui/state.js    — the single UI state object, shared constants, pure
 *                      state accessors/invariant repairs, and the last
 *                      solved result (read by the teaching layer);
 *   • ui/drag.js     — beam pointer/keyboard drag wiring + the desktop
 *                      context menu (guarded by interaction-guard.test.js);
 *                      editor actions are injected below;
 *   • ui/teaching.js — the M9 glossary/derivation popover bootstrap;
 *   • app.js         — everything else: engine input → solve → render, the
 *                      load-list UI, the flat distributed editor, the M7
 *                      shape-point table, E·I, presets, supports, sliders,
 *                      and the boot sequence.
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
import { analyzeBeam } from '../src/analysis.js';
import { MAX_LOADS, MAX_PROFILE_POINTS } from '../src/loadmodel.js';
import { SUPPORTS, SUPPORT_TYPES } from '../src/supportmodel.js';
import { renderM3 } from './renderm3.js';
import { fmt } from './render.js';
import { initTheme } from './theme.js';
import {
  state, EDGE_EPS, W_MAX, clamp, $, PRESETS, EI_PRESETS,
  selected, isSelectedDistributed, getSel, analyzeInput,
  clampPoints, clampPointsFor, setLastSolve, isSelectedDeterminate, resetState,
} from './state.js';
import { makeBeamDraggable } from './drag.js';
import { initTeaching } from './teaching.js';

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
  // M9: the derivation popovers read THIS object, never re-solve.
  setLastSolve(result.classification.status === 'determinate', result);
  renderM3(document, state, result);
  syncSelectedControls(); // determinacy may have flipped → E·I control follows
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
  for (const id of ['beam-context-point', 'beam-context-distributed']) {
    const button = $(id);
    if (button) button.disabled = full;
  }
}

function updateLoadCount() {
  const n = state.loads.length;
  const count = $('load-count');
  count.textContent = n === 1 ? '1 load' : `${n} loads`;
  count.setAttribute('aria-label', `${n} ${n === 1 ? 'load' : 'loads'} in the beam`);
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

function addLoad(type, pointPosition = null) {
  if (state.loads.length >= MAX_LOADS) return;
  const span = state.span;
  const third = span / 3;
  const load = type === 'point'
    ? { type: 'point', magnitude: 5, position: clamp(pointPosition ?? 2 * third, EDGE_EPS, span - EDGE_EPS) }
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
  // M12 Fix 1: state the selection → editor causal link explicitly, so the
  // swapping controls read as "this editor follows the selected row" rather
  // than "controls vanish". Pure readout — no new mode.
  const note = $('editing-note');
  if (note) {
    const row = state.selectedLoad + 1;
    note.textContent = dist
      ? `Editing: Load ${row} — distributed (${s.points.length} shape points)`
      : `Editing: Load ${row} — point load`;
  }
  // M12 Fix 4c: presets are the fastest path to a distributed shape, so the
  // disclosure opens by default while a distributed load is selected.
  const presets = $('ctl-presets');
  const details = presets?.querySelector?.('details');
  if (details) details.open = dist;
  presets.hidden = !dist;
  $('ctl-load').hidden = dist;
  $('ctl-pos').hidden = dist;
  $('ctl-region-start').hidden = !dist || isProfileShape;
  $('ctl-region-end').hidden = !dist || isProfileShape;
  $('ctl-w1').hidden = !dist || isProfileShape;
  $('ctl-w2').hidden = !dist || isProfileShape;
  $('ctl-points').hidden = !dist;
  // Stiffness belongs to the beam, not the selected load. Hide it only when
  // statics cannot determine the deflection (the panel then shows a placeholder).
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
  // M12 Fix 5: one click back to the factory teaching default. No confirm —
  // everything is re-derivable; the load list and editor re-sync from state.
  const reset = $('btn-reset');
  if (reset) reset.addEventListener('click', () => {
    resetState();
    syncSpanControls(); // span inputs are boot-bound; reset must refresh them
    syncSupportSelects(); // same for the support selects
    syncSelectedControls();
    rebuildLoadList();
    solveAndRender();
    announce('Beam reset — 6 m span, one 10 kN point load at midspan, pin + roller');
  });
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
    sel.addEventListener('change', (evt) => setSupport(side, evt.target.value));
  }
}

/** Mirror state.supports into the selects (boot + reset; change events set one side). */
function syncSupportSelects() {
  for (const [id, side] of [['sel-support-left', 'left'], ['sel-support-right', 'right']]) {
    $(id).value = state.supports[side];
  }
}

function setSupport(side, type, restoreFocus = false) {
  state.supports[side] = type;
  $(`sel-support-${side}`).value = type;
  solveAndRender();
  if (restoreFocus) {
    const control = [...$('beam-svg').querySelectorAll('[data-role="support-toggle"]')]
      .find((node) => node.getAttribute('data-support-side') === side);
    control?.focus();
  }
}

function cycleSupport(side, restoreFocus = false) {
  const index = SUPPORT_TYPES.indexOf(state.supports[side]);
  setSupport(side, SUPPORT_TYPES[(index + 1) % SUPPORT_TYPES.length], restoreFocus);
}

// --- numeric inputs + sliders (bound to the SELECTED load) -------------------

function bindNumberSlider(numId, sliderId, apply, { min, max, step = 0.1, sanitize, onChange, getValue }) {
  const num = $(numId);
  const slider = $(sliderId);
  slider.min = min;
  slider.max = max;
  slider.step = step;

  const commit = (raw, source) => {
    if (raw == null || String(raw).trim() === '') return;
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const value = apply(sanitize ? sanitize(v) : v);
    slider.value = String(value);
    if (source === 'slider' || value !== v) num.value = fmt(value);
    onChange?.();
    solveAndRender();
  };

  num.addEventListener('input', () => commit(num.value, 'number'));
  num.addEventListener('blur', () => {
    const raw = num.value.trim();
    const v = Number(raw);
    if (raw === '' || !Number.isFinite(v)) {
      const value = getValue ? getValue() : apply(null);
      num.value = fmt(value);
      slider.value = String(value);
      return;
    }
    const value = sanitize ? sanitize(v) : v;
    num.value = fmt(value);
    slider.value = String(value);
  });
  slider.addEventListener('input', () => commit(slider.value, 'slider'));
}

function syncSpanControls() {
  $('num-span').value = fmt(state.span);
  $('slider-span').value = String(state.span);
}

bindNumberSlider('num-span', 'slider-span',
  (v) => { state.span = clamp(v, 1, 20); return state.span; },
  {
    min: 1, max: 20, step: 0.1,
    sanitize: (v) => clamp(Number((Math.round(v * 10) / 10).toFixed(1)), 1, 20),
    getValue: () => state.span,
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

// --- boot --------------------------------------------------------------------

bindPresets();
populateSupportSelects();
bindLoadListButtons();
bindPointsEditor();
bindEI();
syncSpanControls();
initTheme(document);
initTeaching();
syncSelectedControls();
rebuildLoadList();
makeBeamDraggable(document.getElementById('beam-svg'), {
  selectLoad, cycleSupport, addLoad,
  syncInputs, syncRegionInputs, syncPointsEditor, syncPointUnitLabels,
  syncSelectedControls, updatePresetHighlight, rebuildLoadList, solveAndRender,
  clampPoints,
});
solveAndRender();
