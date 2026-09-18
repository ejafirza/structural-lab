/**
 * app.js — Interaction layer (Milestones 3–5, consolidated UI).
 * -------------------------------------------------------------
 * Owns the UI state and is the ONLY module that talks to the deterministic
 * engine. The renderer (renderm3.js) consumes the `analyzeBeam` result; it
 * never computes engineering values.
 *
 * Consolidated load model (post-M5): two fundamental concepts —
 *   • Point load        → magnitude P (kN) at position a (m).
 *   • Distributed load  → one region [x₁, x₂] with endpoint intensities
 *                         w₁ → w₂ (kN/m), varying linearly between them.
 *
 * Full-span UDL, partial UDL, triangular and trapezoidal are NOT separate
 * modes. They are presets — starting configurations that fill the single
 * distributed-load editor. Selecting a preset never locks the UI; the user
 * can drag the region handles or change w₁/w₂ freely afterwards.
 */
import { analyzeBeam } from '../src/analysis.js';
import { SUPPORTS } from '../src/supportmodel.js';
import { renderM3 } from './renderm3.js';
import { makeXMap, fmt } from './render.js';

const state = {
  span: 6,
  loadConcept: 'point',        // 'point' | 'distributed'
  load: 10,                    // P (kN)
  position: 3,                 // a (m)
  regionStart: 1, regionEnd: 5,        // distributed region [x₁, x₂] (m)
  wStart: 2, wEnd: 2,          // distributed endpoint intensities (kN/m)
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

// --- engine input -----------------------------------------------------------

function analyzeInput() {
  if (state.loadConcept === 'point') {
    return { span: state.span, load: state.load, position: state.position, supports: state.supports };
  }
  return {
    span: state.span,
    loads: [{ type: 'linear', start: state.regionStart, end: state.regionEnd, wStart: state.wStart, wEnd: state.wEnd }],
    supports: state.supports,
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
  renderM3(document, state, result);
}

function clampPosition() {
  state.position = clamp(state.position, EDGE_EPS, state.span - EDGE_EPS);
}

function clampRegion() {
  state.regionStart = clamp(state.regionStart, 0, state.span);
  state.regionEnd = clamp(state.regionEnd, 0, state.span);
  if (state.regionEnd - state.regionStart < EDGE_EPS) {
    state.regionEnd = Math.min(state.span, state.regionStart + EDGE_EPS);
  }
}

function syncInputs() {
  $('num-pos').value = fmt(state.position);
  $('slider-pos').value = state.position;
}

function syncRegionInputs() {
  $('num-region-start').value = fmt(state.regionStart);
  $('num-region-end').value = fmt(state.regionEnd);
  $('slider-region-start').value = state.regionStart;
  $('slider-region-end').value = state.regionEnd;
}

function syncWInputs() {
  $('num-w1').value = fmt(state.wStart);
  $('num-w2').value = fmt(state.wEnd);
  $('slider-w1').value = state.wStart;
  $('slider-w2').value = state.wEnd;
}

// --- load-concept toggle ----------------------------------------------------

function updateConceptUI() {
  const dist = state.loadConcept === 'distributed';
  $('ctl-load').hidden = dist;
  $('ctl-pos').hidden = dist;
  $('ctl-presets').hidden = !dist;
  $('ctl-region-start').hidden = !dist;
  $('ctl-region-end').hidden = !dist;
  $('ctl-w1').hidden = !dist;
  $('ctl-w2').hidden = !dist;
}

function bindConceptToggle() {
  for (const [id, concept] of [['concept-point', 'point'], ['concept-distributed', 'distributed']]) {
    $(id).addEventListener('change', () => {
      state.loadConcept = concept;
      updateConceptUI();
      updatePresetHighlight();
      solveAndRender();
    });
  }
}

// --- presets ----------------------------------------------------------------

function applyPreset(p) {
  state.regionStart = p.region[0] * state.span;
  state.regionEnd = p.region[1] * state.span;
  state.wStart = p.w[0];
  state.wEnd = p.w[1];
  clampRegion();
  syncRegionInputs();
  syncWInputs();
}

function matchingPreset() {
  const T = 0.02;
  const eq = (a, b) => Math.abs(a - b) <= T;
  const hit = PRESETS.find((p) =>
    eq(state.regionStart, p.region[0] * state.span) &&
    eq(state.regionEnd, p.region[1] * state.span) &&
    eq(state.wStart, p.w[0]) &&
    eq(state.wEnd, p.w[1])
  );
  return hit ? hit.id : null;
}

function updatePresetHighlight() {
  if (state.loadConcept !== 'distributed') return;
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

// --- numeric inputs + sliders ----------------------------------------------

function bindNumberSlider(numId, sliderId, key, { min, max, step = 0.1, sanitize, onChange }) {
  const num = $(numId);
  const slider = $(sliderId);
  num.value = state[key];
  slider.min = min;
  slider.max = max;
  slider.step = step;
  slider.value = state[key];

  const commit = (raw) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    state[key] = sanitize ? sanitize(v) : v;
    num.value = state[key];
    slider.value = state[key];
    onChange?.();
    solveAndRender();
  };

  num.addEventListener('input', () => commit(num.value));
  num.addEventListener('blur', () => {
    const v = Number(num.value);
    if (!Number.isFinite(v)) num.value = fmt(state[key]);
  });
  slider.addEventListener('input', () => commit(slider.value));
}

bindNumberSlider('num-span', 'slider-span', 'span', {
  min: 1, max: 20, step: 0.1,
  sanitize: (v) => clamp(v, 1, 20),
  onChange: () => {
    clampPosition();
    syncInputs();
    clampRegion();
    syncRegionInputs();
    updatePresetHighlight();
  },
});

bindNumberSlider('num-load', 'slider-load', 'load', {
  min: 0.1, max: 100, step: 0.1, sanitize: (v) => clamp(v, 0.1, 100),
});

bindNumberSlider('num-pos', 'slider-pos', 'position', {
  min: 0, max: state.span, step: 0.01, sanitize: (v) => clamp(v, EDGE_EPS, state.span - EDGE_EPS),
});

// Region boundaries. `0 ≤ x₁ < x₂ ≤ span` — the outer ends are valid, only the
// non-zero-width gap is enforced (gracefully, by clamping — never as an error).
bindNumberSlider('num-region-start', 'slider-region-start', 'regionStart', {
  min: 0, max: state.span, step: 0.1,
  sanitize: (v) => { state.regionStart = clamp(v, 0, state.regionEnd - EDGE_EPS); return state.regionStart; },
  onChange: updatePresetHighlight,
});
bindNumberSlider('num-region-end', 'slider-region-end', 'regionEnd', {
  min: 0, max: state.span, step: 0.1,
  sanitize: (v) => { state.regionEnd = clamp(v, state.regionStart + EDGE_EPS, state.span); return state.regionEnd; },
  onChange: updatePresetHighlight,
});

// Endpoint intensities. Zero is valid at one end (a triangular load).
bindNumberSlider('num-w1', 'slider-w1', 'wStart', {
  min: 0, max: 50, step: 0.1, sanitize: (v) => clamp(v, 0, 50), onChange: updatePresetHighlight,
});
bindNumberSlider('num-w2', 'slider-w2', 'wEnd', {
  min: 0, max: 50, step: 0.1, sanitize: (v) => clamp(v, 0, 50), onChange: updatePresetHighlight,
});

// --- drag interaction (point load + linear region handles) ------------------

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
      try { svg.setPointerCapture(evt.pointerId); } catch { /* best-effort */ }
      evt.preventDefault();
    }
  });

  window.addEventListener('pointermove', (evt) => {
    if (!dragging) return;
    const x = beamX(evt);
    if (!Number.isFinite(x)) return;
    if (dragging === 'load') {
      state.position = clamp(x, EDGE_EPS, state.span - EDGE_EPS);
      syncInputs();
    } else if (dragging === 'region-start') {
      state.regionStart = clamp(x, 0, state.regionEnd - EDGE_EPS);
      syncRegionInputs();
    } else if (dragging === 'region-end') {
      state.regionEnd = clamp(x, state.regionStart + EDGE_EPS, state.span);
      syncRegionInputs();
    }
    updatePresetHighlight();
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
    if (role === 'load-handle') {
      state.position = clamp(state.position + step, EDGE_EPS, state.span - EDGE_EPS);
      syncInputs();
    } else if (role === 'region-start') {
      state.regionStart = clamp(state.regionStart + step, 0, state.regionEnd - EDGE_EPS);
      syncRegionInputs();
    } else if (role === 'region-end') {
      state.regionEnd = clamp(state.regionEnd + step, state.regionStart + EDGE_EPS, state.span);
      syncRegionInputs();
    } else {
      return;
    }
    updatePresetHighlight();
    solveAndRender();
  });
}

// --- boot --------------------------------------------------------------------

bindConceptToggle();
bindPresets();
populateSupportSelects();
updateConceptUI();
syncRegionInputs();
makeBeamDraggable(document.getElementById('beam-svg'));
solveAndRender();
