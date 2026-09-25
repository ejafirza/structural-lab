/**
 * app.js — Interaction layer (Milestones 3–6, load-list UI).
 * -------------------------------------------------------------
 * Owns the UI state and is the ONLY module that talks to the deterministic
 * engine. The renderer (renderm3.js) consumes the `analyzeBeam` result; it
 * never computes engineering values.
 *
 * M6 load model: the beam carries a LIST of 1..MAX_LOADS loads (any mix of
 * point and distributed descriptors — superposed by the engine for ≥ 2).
 * The list is the single internal model:
 *   • one row per load; the SELECTED row's editor is the classic editor
 *     (point fields, or distributed fields + preset chips);
 *   • "+ Point load" / "+ Distributed load" append and select;
 *   • the last remaining load cannot be removed (the list never empties);
 *   • the beam links back: clicking/dragging a load selects its row.
 * A single load is the one-row case — same editor, same engine call shape.
 */
import { analyzeBeam } from '../src/analysis.js';
import { MAX_LOADS } from '../src/loadmodel.js';
import { SUPPORTS } from '../src/supportmodel.js';
import { renderM3 } from './renderm3.js';
import { makeXMap, fmt } from './render.js';

const state = {
  span: 6,
  loads: [{ type: 'point', magnitude: 10, position: 3 }],
  selectedLoad: 0,             // index into state.loads
  supports: { left: 'pin', right: 'roller' },
};

const EDGE_EPS = 1e-3; // min gap so a region keeps a non-zero width
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const $ = (id) => document.getElementById(id);

// Presets: starting configurations for the single distributed-load editor.
// `region` is expressed as fractions of the span [from, to]; `w` is [wStart, wEnd].
const PRESETS = [
  { id: 'full',      label: 'Full UDL',      hint: 'Uniform over the whole span',          region: [0, 1],      w: [2, 2] },
  { id: 'partial',   label: 'Partial UDL',   hint: 'Uniform over part of the span',        region: [1 / 6, 5 / 6], w: [2, 2] },
  { id: 'tri-left',  label: 'Triangular ▲',  hint: 'Peak at the start, zero at the end',   region: [0, 1],      w: [6, 0] },
  { id: 'tri-right', label: 'Triangular ▼',  hint: 'Zero at the start, peak at the end',   region: [0, 1],      w: [0, 6] },
  { id: 'trap',      label: 'Trapezoidal',   hint: 'Different intensity at each end',      region: [0, 1],      w: [2, 4] },
];

// --- selected load accessors (flat fields stay bound to the selection) ------

function selected() {
  return state.loads[Math.min(state.selectedLoad, state.loads.length - 1)];
}

function isSelectedDistributed() {
  return selected().type !== 'point';
}

// --- engine input -----------------------------------------------------------

function analyzeInput() {
  return { span: state.span, loads: state.loads, supports: state.supports };
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
  renderM3(document, state, result);
}

function clampPosition() {
  const s = selected();
  if (s.type !== 'point') return;
  s.position = clamp(s.position, EDGE_EPS, state.span - EDGE_EPS);
}

function clampRegion() {
  const s = selected();
  if (s.type === 'point') return;
  s.start = clamp(s.start, 0, state.span);
  s.end = clamp(s.end, 0, state.span);
  if (s.end - s.start < EDGE_EPS) {
    s.end = Math.min(state.span, s.start + EDGE_EPS);
  }
}

function syncInputs() {
  const s = selected();
  $('num-pos').value = fmt(s.position);
  $('slider-pos').value = s.position;
}

function syncRegionInputs() {
  const s = selected();
  $('num-region-start').value = fmt(s.start);
  $('num-region-end').value = fmt(s.end);
  $('slider-region-start').value = s.start;
  $('slider-region-end').value = s.end;
}

function syncWInputs() {
  const s = selected();
  $('num-w1').value = fmt(s.wStart);
  $('num-w2').value = fmt(s.wEnd);
  $('slider-w1').value = s.wStart;
  $('slider-w2').value = s.wEnd;
}

function syncLoadMagnitude() {
  const s = selected();
  $('num-load').value = fmt(s.magnitude);
  $('slider-load').value = s.magnitude;
}

// --- load-list UI ------------------------------------------------------------

function loadSummary(load) {
  return load.type === 'point'
    ? `P = ${fmt(load.magnitude)} kN @ ${fmt(load.position)} m`
    : `w: ${fmt(load.wStart)}→${fmt(load.wEnd)} kN/m over [${fmt(load.start)}, ${fmt(load.end)}] m`;
}

function loadAriaLabel(load, i, n) {
  const kind = load.type === 'point'
    ? `point load ${fmt(load.magnitude)} kilonewtons at ${fmt(load.position)} metres`
    : `distributed load ${fmt(load.wStart)} to ${fmt(load.wEnd)} kilonewtons per metre from ${fmt(load.start)} to ${fmt(load.end)} metres`;
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
    : { type: 'linear', start: third / 2, end: 2 * third, wStart: 2, wEnd: 2 };
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

// Show the editor controls for the SELECTED load's concept, and sync all
// bound inputs to its (possibly newly selected) values.
function syncSelectedControls() {
  const dist = isSelectedDistributed();
  // Point-editor controls are visible when a POINT load is selected;
  // distributed-editor controls (presets, region, intensities) when a
  // distributed load is selected — the same mapping as the M5 concept UI.
  $('ctl-load').hidden = dist;
  $('ctl-pos').hidden = dist;
  $('ctl-presets').hidden = !dist;
  $('ctl-region-start').hidden = !dist;
  $('ctl-region-end').hidden = !dist;
  $('ctl-w1').hidden = !dist;
  $('ctl-w2').hidden = !dist;
  if (dist) {
    syncRegionInputs();
    syncWInputs();
  } else {
    syncLoadMagnitude();
    syncInputs();
  }
  updatePresetHighlight();
}

function bindLoadListButtons() {
  $('btn-add-point').addEventListener('click', () => addLoad('point'));
  $('btn-add-distributed').addEventListener('click', () => addLoad('distributed'));
}

// --- presets ----------------------------------------------------------------

function applyPreset(p) {
  const s = selected();
  s.start = p.region[0] * state.span;
  s.end = p.region[1] * state.span;
  s.wStart = p.w[0];
  s.wEnd = p.w[1];
  clampRegion();
  syncRegionInputs();
  syncWInputs();
  rebuildLoadList();
}

function matchingPreset() {
  const s = selected();
  if (!s || s.type === 'point') return null;
  const T = 0.02;
  const eq = (a, b) => Math.abs(a - b) <= T;
  const hit = PRESETS.find((p) =>
    eq(s.start, p.region[0] * state.span) &&
    eq(s.end, p.region[1] * state.span) &&
    eq(s.wStart, p.w[0]) &&
    eq(s.wEnd, p.w[1])
  );
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

bindNumberSlider('num-span', 'slider-span',
  (v) => { state.span = clamp(v, 1, 20); return state.span; },
  {
    min: 1, max: 20, step: 0.1,
    sanitize: (v) => clamp(v, 1, 20),
    onChange: () => {
      state.loads.forEach((s) => {
        if (s.type === 'point') s.position = clamp(s.position, EDGE_EPS, state.span - EDGE_EPS);
        else {
          s.start = clamp(s.start, 0, state.span);
          s.end = clamp(s.end, 0, state.span);
          if (s.end - s.start < EDGE_EPS) s.end = Math.min(state.span, s.start + EDGE_EPS);
        }
      });
      syncInputs(); syncRegionInputs(); updatePresetHighlight(); rebuildLoadList();
    },
  });

bindNumberSlider('num-load', 'slider-load',
  (v) => { if (v !== null) getSel().magnitude = v; return getSel().magnitude; },
  { min: 0.1, max: 100, step: 0.1, sanitize: (v) => clamp(v, 0.1, 100), onChange: rebuildLoadList });

bindNumberSlider('num-pos', 'slider-pos',
  (v) => {
    const s = getSel();
    if (v !== null) s.position = v;
    return s.position;
  },
  { min: 0, max: state.span, step: 0.01, sanitize: (v) => clamp(v, EDGE_EPS, state.span - EDGE_EPS), onChange: rebuildLoadList });

// Region boundaries. `0 ≤ x₁ < x₂ ≤ span` — the outer ends are valid, only the
// non-zero-width gap is enforced (gracefully, by clamping — never as an error).
bindNumberSlider('num-region-start', 'slider-region-start',
  (v) => {
    const s = getSel();
    if (v !== null) { s.start = clamp(v, 0, s.end - EDGE_EPS); }
    return s.start;
  },
  { min: 0, max: state.span, step: 0.1, onChange: () => { updatePresetHighlight(); rebuildLoadList(); } });

bindNumberSlider('num-region-end', 'slider-region-end',
  (v) => {
    const s = getSel();
    if (v !== null) { s.end = clamp(v, s.start + EDGE_EPS, state.span); }
    return s.end;
  },
  { min: 0, max: state.span, step: 0.1, onChange: () => { updatePresetHighlight(); rebuildLoadList(); } });

// Endpoint intensities. Zero is valid at one end (a triangular load).
bindNumberSlider('num-w1', 'slider-w1',
  (v) => { if (v !== null) getSel().wStart = v; return getSel().wStart; },
  { min: 0, max: 50, step: 0.1, sanitize: (v) => clamp(v, 0, 50), onChange: () => { updatePresetHighlight(); rebuildLoadList(); } });

bindNumberSlider('num-w2', 'slider-w2',
  (v) => { if (v !== null) getSel().wEnd = v; return getSel().wEnd; },
  { min: 0, max: 50, step: 0.1, sanitize: (v) => clamp(v, 0, 50), onChange: () => { updatePresetHighlight(); rebuildLoadList(); } });

// --- drag interaction (selected load's handles on the beam) ------------------

function makeBeamDraggable(svg) {
  let dragging = null; // 'load' | 'region-start' | 'region-end'

  const beamX = (evt) => {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    return makeXMap(state).toBeam(loc.x);
  };

  svg.addEventListener('pointerdown', (evt) => {
    const t = evt.target.closest?.('[data-role]');
    if (!t) return;
    const role = t.getAttribute('data-role');
    if (role === 'load-handle' || role === 'region-start' || role === 'region-end') {
      dragging = role;
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
    const x = beamX(evt);
    if (!Number.isFinite(x)) return;
    const s = selected();
    if (dragging === 'load') {
      s.position = clamp(x, EDGE_EPS, state.span - EDGE_EPS);
      syncInputs();
    } else if (dragging === 'region-start') {
      s.start = clamp(x, 0, s.end - EDGE_EPS);
      syncRegionInputs();
    } else if (dragging === 'region-end') {
      s.end = clamp(x, s.start + EDGE_EPS, state.span);
      syncRegionInputs();
    }
    updatePresetHighlight();
    rebuildLoadList();
    solveAndRender();
  });

  const end = (evt) => {
    if (!dragging) return;
    dragging = null;
    try { svg.releasePointerCapture?.(evt.pointerId); } catch { /* ignore */ }
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  svg.addEventListener('keydown', (evt) => {
    const t = evt.target.closest?.('[data-role]');
    if (!t) return;
    const role = t.getAttribute('data-role');
    const step = evt.key === 'ArrowLeft' ? -0.1 : evt.key === 'ArrowRight' ? 0.1 : null;
    if (step === null) return;
    evt.preventDefault();
    const s = selected();
    if (role === 'load-handle') {
      s.position = clamp(s.position + step, EDGE_EPS, state.span - EDGE_EPS);
      syncInputs();
    } else if (role === 'region-start') {
      s.start = clamp(s.start + step, 0, s.end - EDGE_EPS);
      syncRegionInputs();
    } else if (role === 'region-end') {
      s.end = clamp(s.end + step, s.start + EDGE_EPS, state.span);
      syncRegionInputs();
    } else {
      return;
    }
    updatePresetHighlight();
    rebuildLoadList();
    solveAndRender();
  });
}

// --- boot --------------------------------------------------------------------

bindPresets();
populateSupportSelects();
bindLoadListButtons();
syncSelectedControls();
rebuildLoadList();
makeBeamDraggable(document.getElementById('beam-svg'));
solveAndRender();
