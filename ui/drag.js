/**
 * drag.js — beam drag/keyboard interaction (M6/M7) + desktop context menu.
 * ---------------------------------------------------------------------------
 * Extracted from app.js so the interaction wiring has its own home. All
 * editor actions (sync/rebuild/solve/select) are INJECTED by app.js — this
 * module owns only the pointer/keyboard/context-menu wiring, so the guarded
 * handler vocabulary (test/interaction-guard.test.js) stays in one file:
 *   • pointerdown's accepted data-roles are exactly the documented set;
 *   • the keyboard handler branches on the SAME attribute roles;
 *   • every accepted role reaches a pointermove branch through the single
 *     documented rename table (`role === 'X' ? 'Y' : role`).
 * Any new handle type must update all three consistently or the guard fails.
 */
import { state, EDGE_EPS, W_MAX, clamp, $, selected } from './state.js';
import { makeXMap, fmt } from './render.js';
import { BAND_Y_BASE, BAND_MAX_H } from './renderm3.js';

export function makeBeamDraggable(svg, {
  selectLoad, cycleSupport, addLoad,
  syncInputs, syncRegionInputs, syncPointsEditor, syncPointUnitLabels,
  syncSelectedControls, updatePresetHighlight, rebuildLoadList, solveAndRender,
  clampPoints,
}) {
  let dragging = null; // 'load' | 'region-start' | 'region-end' | 'profile-point'
  let draggedPoint = null; // the pinned point OBJECT (identity survives re-sorting)

  const beamLocal = (evt) => {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    return pt.matrixTransform(ctm.inverse());
  };
  const beamX = (evt) => makeXMap(state).toBeam(beamLocal(evt).x);

  const beamW = (evt, maxW) => {
    const loc = beamLocal(evt);
    const w = ((BAND_Y_BASE - loc.y) / BAND_MAX_H) * maxW;
    return clamp(w, 0, W_MAX);
  };

  const profileMaxW = () => Math.max(...selected().points.map((p) => p.w), 1e-9);
  const menu = $('beam-context-menu');
  const menuPoint = $('beam-context-point');
  const menuDistributed = $('beam-context-distributed');
  let contextPosition = null;

  if (menu && menuPoint && menuDistributed) {
    const closeMenu = (restoreFocus = false) => {
      menu.hidden = true;
      contextPosition = null;
      if (restoreFocus) svg.focus();
    };
    const isMenuTarget = (target) => menu.contains(target);
    const dismissOutside = (evt) => {
      if (!menu.hidden && !isMenuTarget(evt.target)) closeMenu();
    };

    svg.addEventListener('contextmenu', (evt) => {
      const desktop = typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 981px) and (hover: hover)').matches
      : window.innerWidth > 980;
    if (!desktop) return;
      evt.preventDefault();
      contextPosition = clamp(beamX(evt), EDGE_EPS, state.span - EDGE_EPS);
      $('beam-context-title').textContent = `Add a load at x = ${fmt(contextPosition)} m`;
      menu.hidden = false;
      const rect = menu.getBoundingClientRect();
      const width = rect.width || 206;
      const height = rect.height || 116;
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      const maxTop = Math.max(8, window.innerHeight - height - 8);
      menu.style.left = `${clamp(evt.clientX, 8, maxLeft)}px`;
      menu.style.top = `${clamp(evt.clientY, 8, maxTop)}px`;
      menuPoint.focus();
    });
    const addFromContext = (type, position) => {
      $('model-panel').open = true;
      addLoad(type, position);
    };
    menuPoint.addEventListener('click', () => {
      const position = contextPosition;
      closeMenu();
      if (position != null) addFromContext('point', position);
    });
    menuDistributed.addEventListener('click', () => {
      closeMenu();
      addFromContext('distributed');
    });
    document.addEventListener('click', dismissOutside);
    document.addEventListener('keydown', (evt) => {
      if (evt.key === 'Escape' && !menu.hidden) {
        evt.preventDefault();
        closeMenu(true);
      }
    });
  }

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
    const support = evt.target.closest?.('[data-role="support-toggle"]');
    if (support) {
      cycleSupport(support.getAttribute('data-support-side'));
      return;
    }
    // Clicking any load on the beam selects it (drag already handled above).
    const group = evt.target.closest?.('[data-load-index]');
    if (!group) return;
    const idx = Number(group.getAttribute('data-load-index'));
    if (idx !== state.selectedLoad) selectLoad(idx);
  });

  svg.addEventListener('keydown', (evt) => {
    const support = evt.target.closest?.('[data-role="support-toggle"]');
    if (!support || (evt.key !== 'Enter' && evt.key !== ' ')) return;
    evt.preventDefault();
    cycleSupport(support.getAttribute('data-support-side'), true);
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
