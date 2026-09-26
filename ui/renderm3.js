/**
 * renderm3.js — Support- & load-aware visualization layer (M3–M6)
 * -------------------------------------------------------------
 * PURE RENDERERS. Contains NO engineering mathematics: every plotted point,
 * labeled value, reaction arrow, sign note, resultant and centroid come from
 * the `analyzeBeam` result object. The only computations here are geometric
 * (engineering coordinates → SVG pixels) and presentational (formatting).
 *
 * Load shapes drawn from the descriptors (geometry only):
 *   point → red arrow · udl (full-span) → shaded band · linear → rectangle /
 *   triangle / trapezoid over the sub-region [start, end] · profile (M7) →
 *   polygon through the control points, with a vertical edge at a step. A
 *   beam may carry several loads (M6): each is drawn from its own descriptor
 *   with a circled number tying it to its row in the load list; drag handles
 *   exist only on the SELECTED load; the combined resultant R, x̄ is drawn once.
 *
 * Visualization convention (owner-approved): BMD drawn on the tension side —
 * sagging (+) BELOW the axis, hogging (−) ABOVE the axis. Engine sign
 * convention unchanged (sagging positive).
 */
import { makeXMap, fmt } from './render.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Circled digits ①–⑥ tying each drawn load to its load-list row (M6). */
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'];

// --- label placement (pure geometry — no engineering mathematics) ----------

const LABEL_H = 14;

/** Rough text width in SVG units (no DOM measurement available pre-paint). */
function estimateW(str, size = 13) {
  return String(str).length * size * 0.58;
}

function overlaps2D(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 2 && oy > 2; // same tolerance as the layout audit harness
}

/**
 * Pick the first candidate label spot whose estimated box does not overlap
 * any already-placed label (and record it). With few loads the first
 * candidate is always free, so single-load output is unchanged; with several
 * close loads, later labels cascade down the fallback lanes instead of
 * stacking on each other.
 */
function findFreeSpot(placed, candidates) {
  for (const c of candidates) {
    const box = {
      x: c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - c.w : c.x - c.w / 2,
      y: c.y - LABEL_H,
      w: c.w,
      h: LABEL_H + 2,
    };
    // Never choose a spot outside the beam panel (the M5 layout audit's
    // clipping gotcha: labels above the viewBox top edge).
    if (box.y < 2 || box.x < 4 || box.x + box.w > VB_W - 4) continue;
    if (!placed.some((p) => overlaps2D(p, box))) {
      placed.push(box);
      return c;
    }
  }
  return candidates[0]; // everything collides — draw at the preferred spot
}

const VB_W = 900;
const ML = 60;
const MR = 40;
const PLOT_W = VB_W - ML - MR;

const H_BEAM = 268;
const H_SFD = 234;
const H_BMD = 270;
const H_DEFL = 210;

const C = {
  ink: 'var(--diagram-ink, #1e293b)',
  muted: 'var(--diagram-muted, #64748b)',
  beam: 'var(--diagram-beam, #334155)',
  support: 'var(--diagram-support, #334155)',
  load: 'var(--diagram-load, #dc2626)',
  udl: 'var(--diagram-udl, #059669)',
  udlFill: 'var(--diagram-udl-fill, rgba(5, 150, 105, 0.12))',
  reaction: 'var(--diagram-reaction, #16a34a)',
  shear: 'var(--diagram-shear, #2563eb)',
  shearFill: 'var(--diagram-shear-fill, rgba(37, 99, 235, 0.14))',
  moment: 'var(--diagram-moment, #ea580c)',
  momentFill: 'var(--diagram-moment-fill, rgba(234, 88, 12, 0.15))',
  defl: 'var(--diagram-deflection, #7c3aed)',
  deflFill: 'var(--diagram-deflection-fill, rgba(124, 58, 237, 0.10))',
  guide: 'var(--diagram-guide, #94a3b8)',
  axis: 'var(--diagram-axis, #64748b)',
  dim: 'var(--diagram-dim, #475569)',
  note: 'var(--diagram-muted, #64748b)',
  halo: 'var(--diagram-halo, #ffffff)',
  handleFill: 'var(--diagram-handle-fill, #ffffff)',
};

// --- tiny SVG helpers ------------------------------------------------------

function el(name, attrs = {}, text = null) {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  return n;
}

function txt(x, y, str, o = {}) {
  const attrs = {
    x,
    y,
    'text-anchor': o.anchor ?? 'middle',
    'font-size': o.size ?? 12,
    fill: o.fill ?? C.ink,
  };
  if (o.weight) attrs['font-weight'] = o.weight;
  if (o.italic) attrs['font-style'] = 'italic';
  if (o.halo) {
    attrs.style = `paint-order:stroke;stroke:${C.halo};stroke-width:3.5px;stroke-linejoin:round`;
  }
  // M9: any other option (e.g. 'data-term') passes through onto the text
  // node — the teaching layer annotates existing labels without touching
  // their text or position.
  const KNOWN = ['anchor', 'size', 'fill', 'weight', 'italic', 'halo'];
  for (const [k, v] of Object.entries(o)) {
    if (!KNOWN.includes(k) && !(k in attrs)) attrs[k] = String(v);
  }
  return el('text', attrs, str);
}

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls != null) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// --- support symbols -------------------------------------------------------

function drawPin(svg, x, yTop) {
  const base = yTop + 40;
  svg.append(el('polygon', {
    points: `${x},${yTop} ${x - 18},${base} ${x + 18},${base}`,
    fill: 'none', stroke: C.support, 'stroke-width': 2.5, 'stroke-linejoin': 'round',
  }));
  svg.append(el('line', { x1: x - 26, y1: base, x2: x + 26, y2: base, stroke: C.support, 'stroke-width': 2 }));
  for (let i = 0; i < 5; i++) {
    const hx = x - 24 + i * 12;
    svg.append(el('line', { x1: hx, y1: base, x2: hx - 8, y2: base + 10, stroke: C.support, 'stroke-width': 1.5 }));
  }
}

function drawRoller(svg, x, yTop) {
  const base = yTop + 32;
  svg.append(el('polygon', {
    points: `${x},${yTop} ${x - 18},${base} ${x + 18},${base}`,
    fill: 'none', stroke: C.support, 'stroke-width': 2.5, 'stroke-linejoin': 'round',
  }));
  svg.append(el('circle', { cx: x - 9, cy: base + 5.5, r: 4.5, fill: 'none', stroke: C.support, 'stroke-width': 2 }));
  svg.append(el('circle', { cx: x + 9, cy: base + 5.5, r: 4.5, fill: 'none', stroke: C.support, 'stroke-width': 2 }));
  const ground = base + 11;
  svg.append(el('line', { x1: x - 26, y1: ground, x2: x + 26, y2: ground, stroke: C.support, 'stroke-width': 2 }));
  for (let i = 0; i < 5; i++) {
    const hx = x - 24 + i * 12;
    svg.append(el('line', { x1: hx, y1: ground, x2: hx - 8, y2: ground + 10, stroke: C.support, 'stroke-width': 1.5 }));
  }
}

function drawFixed(svg, x, yTop) {
  const w = 44;
  const hh = 30;
  const x0 = x - w / 2;
  svg.append(el('rect', { x: x0, y: yTop, width: w, height: hh, fill: 'none', stroke: C.support, 'stroke-width': 2.5 }));
  for (let i = 0; i < 6; i++) {
    const hx = x0 + 4 + i * 7;
    svg.append(el('line', { x1: hx, y1: yTop + 2, x2: hx - 7, y2: yTop + hh - 2, stroke: C.support, 'stroke-width': 1.2 }));
  }
  const ground = yTop + hh;
  svg.append(el('line', { x1: x - 26, y1: ground, x2: x + 26, y2: ground, stroke: C.support, 'stroke-width': 2 }));
  for (let i = 0; i < 5; i++) {
    const hx = x - 24 + i * 12;
    svg.append(el('line', { x1: hx, y1: ground, x2: hx - 8, y2: ground + 10, stroke: C.support, 'stroke-width': 1.5 }));
  }
}

function drawSupport(svg, type, x, yTop) {
  if (type === 'pin') drawPin(svg, x, yTop);
  else if (type === 'roller') drawRoller(svg, x, yTop);
  else if (type === 'fixed') drawFixed(svg, x, yTop);
  // 'free': no symbol
}

// --- reaction arrows -------------------------------------------------------

function drawVyArrow(svg, x, label) {
  svg.append(el('line', { x1: x, y1: 172, x2: x, y2: 134, stroke: C.reaction, 'stroke-width': 3 }));
  svg.append(el('polygon', { points: `${x - 6},136 ${x + 6},136 ${x},126`, fill: C.reaction }));
  svg.append(txt(x, 192, label, { fill: C.reaction, weight: 700, size: 12.5, halo: true, 'data-term': 'vertical-reaction', tabindex: 0, role: 'button', 'aria-label': 'Explain vertical support reaction' }));
}

function drawMomentArrow(svg, x, label) {
  const r = 22;
  const cy = 42;
  svg.append(el('path', {
    d: `M ${x - r} ${cy} A ${r} ${r} 0 0 1 ${x + r} ${cy}`,
    fill: 'none', stroke: C.reaction, 'stroke-width': 3,
  }));
  svg.append(el('polygon', {
    points: `${x + r + 1},${cy} ${x + r - 6},${cy - 6} ${x + r - 4},${cy + 2}`,
    fill: C.reaction,
  }));
  // Clamp above the viewBox — the M8 layout audit's cantilever configuration
  // exposed this pre-existing clip (label baseline 10 put the halo at y < 0).
  svg.append(txt(x, Math.max(cy - r - 10, 16), label, { fill: C.reaction, weight: 700, size: 12.5, halo: true, 'data-term': 'moment-reaction', tabindex: 0, role: 'button', 'aria-label': 'Explain fixed-support moment reaction' }));
}

function drawReactionsM3(svg, result, xm) {
  const { reactions, input } = result;
  for (const [side, letter] of [['left', 'A'], ['right', 'B']]) {
    const r = reactions[side];
    if (!r || r.type === 'free') continue;
    const bx = side === 'left' ? 0 : input.span;
    const x = xm.toPx(bx);
    drawVyArrow(svg, x, `V${letter} = ${fmt(r.Vy)} kN`);
    if (r.type === 'fixed') drawMomentArrow(svg, x, `M${letter} = ${fmt(r.Mz)} kNm`);
  }
}

// --- load drawings ---------------------------------------------------------

function drawPointLoad(svg, result, xm, load, index, count, selected, placed) {
  const isTeachingTrigger = (label) => ({
    tabindex: 0, role: 'button', 'data-term': label, 'aria-label': `Explain ${label.replaceAll('-', ' ')}`,
  });
  const xP = xm.toPx(load.position);
  const yBeam = 70;
  const flip = xP > VB_W - MR - 160;
  const anchor0 = flip ? 'end' : 'start';
  const num = CIRCLED[index] ?? `${index + 1}.`;
  const label = `${num} P = ${fmt(load.magnitude)} kN`;
  const spot = findFreeSpot(placed, [
    // Preferred side first, then the opposite side, then lower lanes.
    ...[22, 40, 58].flatMap((y) => [
      { x: flip ? xP - 14 : xP + 14, y, anchor: anchor0, w: estimateW(label) },
      { x: flip ? xP + 14 : xP - 14, y, anchor: flip ? 'start' : 'end', w: estimateW(label) },
    ]),
  ]);
  // Uniform group structure: every load gets ONE role-less wrapper group
  // (data-load-index → the load-list row); its draggable handle (if selected)
  // is a nested group carrying data-role + tabindex.
  const wrapper = el('g', {
    'data-load-index': String(index),
    role: 'group',
    'aria-label': `Point load ${index + 1} of ${count}, ${fmt(load.magnitude)} kilonewtons downward at ${fmt(load.position)} metres from support A`,
  });
  const g = el('g', {
    ...(selected ? { 'data-role': 'load-handle', tabindex: 0, role: 'slider' } : {}),
    ...(selected ? {
      'aria-label': `Point load ${index + 1} position`,
      'aria-valuemin': 0,
      'aria-valuemax': result.input.span,
      'aria-valuenow': load.position,
      'aria-valuetext': `${fmt(load.position)} metres from support A`,
      'aria-keyshortcuts': 'ArrowLeft ArrowRight',
    } : { role: 'img' }),
    'aria-description': `Point load ${index + 1} of ${count}, ${fmt(load.magnitude)} kilonewtons downward${selected ? '; drag or use left and right arrow keys to move' : ''}`,
  });
  wrapper.append(g);
  g.append(el('rect', { x: xP - 90, y: 0, width: 180, height: yBeam - 4, fill: 'transparent', 'pointer-events': 'all' }));
  g.setAttribute('aria-description', `Load ${index + 1} of ${count} — ${fmt(load.magnitude)} kilonewtons downward${selected ? '; drag or use left and right arrow keys to move' : ''}`);
  g.append(el('line', { x1: xP, y1: 10, x2: xP, y2: 54, stroke: C.load, 'stroke-width': 3 }));
  g.append(el('polygon', { points: `${xP - 7},52 ${xP + 7},52 ${xP},64`, fill: C.load }));
  wrapper.append(txt(spot.x, spot.y, label, {
    anchor: spot.anchor, fill: C.load, weight: 700, size: 13, halo: true,
    ...isTeachingTrigger('point-load'),
  }));
  svg.append(wrapper);
}

/** Extract the [x1, x2, w1, w2] geometry of any distributed load (udl or linear). */
function distributedGeometry(load, span) {
  if (load.type === 'udl') return { x1: 0, x2: span, w1: load.intensity, w2: load.intensity };
  return { x1: load.start, x2: load.end, w1: load.wStart, w2: load.wEnd };
}

/**
 * Band scaling (presentation, shared with the drag layer in app.js): a
 * distributed band is drawn from y = BAND_Y_BASE up to at most BAND_MAX_H
 * pixels at the load's peak intensity. app.js inverts exactly this mapping
 * when a vertical drag converts pointer motion into an intensity change —
 * these constants are the single home of the conversion in both directions.
 */
export const BAND_Y_BASE = 60;
export const BAND_MAX_H = 34;

/** Distinct consecutive intensity levels of a profile, formatted ('4,4,8,8' → '4→8'). */
function profileLevels(points) {
  const levels = [];
  for (const p of points) {
    const v = fmt(p.w);
    if (levels[levels.length - 1] !== v) levels.push(v);
  }
  return levels;
}

function drawDistributedLoad(svg, result, xm, load, index, count, selected, placed) {
  const isProfile = load.type === 'profile';
  const pts = isProfile ? load.points : null;
  const { x1, x2, w1, w2 } = isProfile
    ? { x1: pts[0].x, x2: pts[pts.length - 1].x, w1: pts[0].w, w2: pts[pts.length - 1].w }
    : distributedGeometry(load, result.input.span);
  const px1 = xm.toPx(x1);
  const px2 = xm.toPx(x2);
  const maxW = isProfile ? Math.max(...pts.map((p) => p.w), 1e-9) : Math.max(w1, w2, 1e-9);
  const yBase = BAND_Y_BASE;
  const maxH = BAND_MAX_H;
  const yTopOf = (w) => yBase - (w / maxW) * maxH;
  const num = CIRCLED[index] ?? `${index + 1}.`;

  // Group wrapper: every load drawing carries data-load-index so the beam
  // can link back to its load-list row (mirrors the point-load group).
  const g = el('g', { 'data-load-index': String(index) });
  svg.append(g);

  // Filled shape from the descriptor. A profile (M7) renders as one polygon
  // through every control point — a repeated x draws the vertical step edge.
  // Uniform loads render as a `rect` (rectangle); linearly-varying loads as a
  // `polygon` (triangle or trapezoid).
  const yTop1 = yTopOf(w1);
  const yTop2 = yTopOf(w2);
  if (isProfile) {
    const outline = [`${px1},${yBase}`];
    for (const p of pts) outline.push(`${xm.toPx(p.x)},${yTopOf(p.w)}`);
    outline.push(`${px2},${yBase}`);
    g.append(el('polygon', {
      points: outline.join(' '),
      fill: C.udlFill, stroke: C.udl, 'stroke-width': 1.5, 'stroke-linejoin': 'round',
    }));
  } else if (Math.abs(w1 - w2) < 1e-12) {
    g.append(el('rect', {
      x: px1, y: yTop1, width: px2 - px1, height: yBase - yTop1,
      fill: C.udlFill, stroke: C.udl, 'stroke-width': 1.5,
    }));
  } else {
    g.append(el('polygon', {
      points: `${px1},${yBase} ${px1},${yTop1} ${px2},${yTop2} ${px2},${yBase}`,
      fill: C.udlFill, stroke: C.udl, 'stroke-width': 1.5, 'stroke-linejoin': 'round',
    }));
  }

  // Downward arrows distributed along the loaded region.
  const n = Math.max(2, Math.min(6, Math.round((px2 - px1) / 90)));
  for (let i = 1; i < n; i++) {
    const x = px1 + ((px2 - px1) * i) / n;
    g.append(el('line', { x1: x, y1: yBase, x2: x, y2: 66, stroke: C.udl, 'stroke-width': 2 }));
    g.append(el('polygon', { points: `${x - 4},64 ${x + 4},64 ${x},71`, fill: C.udl }));
  }

  // Intensity label (peak value for triangular, range for trapezoidal,
  // distinct levels for a profile — capped at three, then min→max), prefixed
  // with the load's circled number. Falls back to higher lanes when another
  // load's label already occupies the spot above the band.
  const uniform = !isProfile && Math.abs(w1 - w2) < 1e-12;
  const label = isProfile
    ? (() => {
        const levels = profileLevels(pts);
        const wl = levels.length === 1
          ? `w = ${levels[0]}`
          : levels.length <= 3
            ? `w: ${levels.join('→')}`
            : `w: ${fmt(Math.min(...pts.map((p) => p.w)))}→${fmt(Math.max(...pts.map((p) => p.w)))}`;
        return `${num} ${wl} kN/m ↓`;
      })()
    : uniform ? `${num} w = ${fmt(w1)} kN/m ↓` : `${num} w: ${fmt(w1)} → ${fmt(w2)} kN/m ↓`;
  const lx = (px1 + px2) / 2;
  const topY = Math.min(yTop1, yTop2) - 8;
  const labelSpot = findFreeSpot(placed, [
    // Preferred: centred above the band (the M5 position). Fallbacks shift
    // along the band's top edge (corners, anchored inward) before going any
    // higher — and findFreeSpot rejects anything outside the panel.
    { x: lx, y: topY, anchor: 'middle', w: estimateW(label) },
    { x: px2 - 6, y: topY, anchor: 'end', w: estimateW(label) },
    { x: px1 + 6, y: topY, anchor: 'start', w: estimateW(label) },
    { x: lx, y: topY - 18, anchor: 'middle', w: estimateW(label) },
    { x: lx, y: topY - 36, anchor: 'middle', w: estimateW(label) },
  ]);
  g.append(txt(labelSpot.x, labelSpot.y, label, { fill: C.udl, weight: 700, size: 13, halo: true }));

  // Region drag handles (selected linear loads only) — dashed boundaries +
  // grab dots, nested INSIDE the load's wrapper: the selected load's wrapper
  // is appended last, so its handles stay visually on top for hit-testing,
  // and closest('[data-load-index]') resolves through the wrapper.
  if (selected && load.type === 'linear') {
    for (const [x, role] of [[x1, 'region-start'], [x2, 'region-end']]) {
      const p = xm.toPx(x);
      const hg = el('g', {
        'data-role': role,
        tabindex: 0,
        role: 'slider',
        'aria-label': `Load ${index + 1} of ${count} — ${role === 'region-start' ? 'region start' : 'region end'} position`,
        'aria-valuemin': 0,
        'aria-valuemax': result.input.span,
        'aria-valuenow': x,
        'aria-valuetext': `${fmt(x)} metres from support A`,
        'aria-keyshortcuts': 'ArrowLeft ArrowRight',
      });
      hg.append(el('rect', { x: p - 16, y: 6, width: 32, height: 64, fill: 'transparent', 'pointer-events': 'all' }));
      hg.append(el('line', { x1: p, y1: 12, x2: p, y2: 64, stroke: C.udl, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
      hg.append(el('circle', { cx: p, cy: 24, r: 5, fill: C.handleFill, stroke: C.udl, 'stroke-width': 2.5 }));
      g.append(hg);
    }
  }

  // Shape-point handles (selected profiles only — the Tab path stays short).
  // One handle per control point: horizontal drag changes x, vertical drag
  // changes w (app.js owns the mutation; this is geometry only). The
  // data-point-index attribute ties each handle to its table row.
  if (selected && isProfile) {
    pts.forEach((p, pi) => {
      const hx = xm.toPx(p.x);
      const hy = yTopOf(p.w);
      const hg = el('g', {
        'data-role': 'profile-point',
        'data-point-index': String(pi),
        tabindex: 0,
        role: 'slider',
        'aria-label': `Load ${index + 1} of ${count}, shape point ${pi + 1} of ${pts.length} — position; use left and right arrows to adjust, up and down to change intensity`,
        'aria-valuemin': 0,
        'aria-valuemax': result.input.span,
        'aria-valuenow': p.x,
        'aria-valuetext': `${fmt(p.x)} metres from support A; ${fmt(p.w)} kilonewtons per metre downward`,
        'aria-keyshortcuts': 'ArrowLeft ArrowRight ArrowUp ArrowDown',
      });
      hg.append(el('circle', { cx: hx, cy: hy, r: 14, fill: 'transparent', 'pointer-events': 'all' }));
      hg.append(el('circle', { cx: hx, cy: hy, r: 5.5, fill: C.handleFill, stroke: C.udl, 'stroke-width': 2.5 }));
      g.append(hg);
    });
  }
}

/**
 * Combined resultant R, x̄ of the WHOLE load group (single dashed arrow).
 * Values come straight from the engine (`result.resultant`) — for one
 * distributed load this is identical to the M5 drawing; for several loads
 * it is the educational payoff: N loads → ONE equivalent force.
 */
function drawCombinedResultant(svg, result, xm, placed) {
  const xR = xm.toPx(result.resultant.position);
  const rFlip = xR > VB_W - MR - 150;
  const rLabel = `R = ${fmt(result.resultant.value)} kN`;
  const rSpot = findFreeSpot(placed, [
    ...[34, 16, 52].flatMap((y) => [
      { x: rFlip ? xR - 10 : xR + 10, y, anchor: rFlip ? 'end' : 'start', w: estimateW(rLabel, 12.5) },
      { x: rFlip ? xR + 10 : xR - 10, y, anchor: rFlip ? 'start' : 'end', w: estimateW(rLabel, 12.5) },
    ]),
  ]);
  svg.append(el('line', { x1: xR, y1: 16, x2: xR, y2: 56, stroke: C.udl, 'stroke-width': 2.5, 'stroke-dasharray': '5 3' }));
  svg.append(el('polygon', { points: `${xR - 6},54 ${xR + 6},54 ${xR},66`, fill: C.udl, opacity: 0.9 }));
  svg.append(txt(rSpot.x, rSpot.y, rLabel, { anchor: rSpot.anchor, fill: C.udl, weight: 700, size: 12.5, halo: true }));
  svg.append(txt(xR, 252, `x̄ = ${fmt(result.resultant.position)} m`, { fill: C.muted, size: 11, halo: true, 'data-term': 'centroid', tabindex: 0, role: 'button', 'aria-label': 'Explain load centroid' }));
}

/**
 * Draw every load from its descriptor, then the combined resultant.
 * The selected load is drawn LAST so its drag handles sit on top for
 * hit-testing; every group carries data-load-index for list↔beam linking.
 */
function drawLoads(svg, state, result, xm) {
  const loads = result.input.loads;
  const sel = typeof state.selectedLoad === 'number' && state.selectedLoad < loads.length ? state.selectedLoad : 0;
  const placed = []; // occupied label boxes (geometry bookkeeping only)
  const order = loads.map((_, i) => i).sort((a, b) => (a === sel ? 1 : 0) - (b === sel ? 1 : 0));
  for (const i of order) {
    const load = loads[i];
    if (load.type === 'point') drawPointLoad(svg, result, xm, load, i, loads.length, i === sel, placed);
    else drawDistributedLoad(svg, result, xm, load, i, loads.length, i === sel, placed);
  }
  // The combined resultant R, x̄ is the educational payoff of ANY load group
  // of two or more loads ("replace them with ONE equivalent force") and of
  // every distributed load (M5, "one force at its centroid"). It is drawn
  // for every case EXCEPT the lone point load, where it is redundant (R = P
  // at a — exactly the load already drawn) and would collide with its labels.
  const redundant = loads.length === 1 && loads[0].type === 'point';
  if (!redundant) drawCombinedResultant(svg, result, xm, placed);
}

// --- dimension + axis helpers ---------------------------------------------

function dim(svg, x1, x2, y, label) {
  svg.append(el('line', { x1, y1: y, x2, y2: y, stroke: C.dim, 'stroke-width': 1.2 }));
  for (const tx of [x1, x2]) {
    svg.append(el('line', { x1: tx, y1: y - 5, x2: tx, y2: y + 5, stroke: C.dim, 'stroke-width': 1.2 }));
  }
  const mid = (x1 + x2) / 2;
  const width = Math.abs(x2 - x1);
  let lx = mid;
  let anchor = 'middle';
  if (width < 90) {
    if (mid > VB_W / 2) { anchor = 'end'; lx = Math.max(x1, x2) - 3; }
    else { anchor = 'start'; lx = Math.min(x1, x2) + 3; }
  }
  svg.append(txt(lx, y - 8, label, { fill: C.dim, size: 11.5, halo: true, anchor }));
}

/** x-axis tick marks + labels — load-type aware, uncluttered for multi-load. */
function xAxisLabels(svg, xm, result, labelY) {
  const loads = result.input.loads;
  const L = result.input.span;
  const type = loads.length === 1 ? loads[0].type : 'combined';
  const tick = (x) => svg.append(el('line', { x1: x, y1: labelY - 18, x2: x, y2: labelY - 10, stroke: C.axis, 'stroke-width': 1.2 }));
  const label = (x, s, anchor = 'middle') => svg.append(txt(x, labelY, s, { fill: C.muted, size: 11.5, halo: true, anchor }));

  const markers = [{ x: 0, text: '0', anchor: 'start' }];
  if (type === 'point') {
    markers.push({ x: loads[0].position, text: `a = ${fmt(loads[0].position)} m` });
  } else if (type === 'udl') {
    markers.push({ x: L / 2, text: 'L/2' });
  } else if (type === 'linear') {
    const d = loads[0];
    if (d.start > 0) markers.push({ x: d.start, text: `x₁ = ${fmt(d.start)} m` });
    if (d.end < L) markers.push({ x: d.end, text: `x₂ = ${fmt(d.end)} m` });
  } else if (type === 'profile') {
    // Only the STEP positions get axis markers (a repeated x = an intensity
    // jump); plain kinks stay table-only, keeping the axis uncluttered (the
    // M6 lesson). The numbers live in the shape-point table.
    const pts = loads[0].points;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].x === pts[i - 1].x && pts[i].w !== pts[i - 1].w) {
        markers.push({ x: pts[i].x, text: `step @ ${fmt(pts[i].x)} m` });
      }
    }
  } else if (result.classification.status === 'determinate' && result.maxMoment) {
    // Multi-load: per-load positions live on the beam panel; the axis keeps
    // 0, L and the peak position only.
    if (result.maxMoment.position > 0 && result.maxMoment.position < L) {
      markers.push({ x: result.maxMoment.position, text: `x* = ${fmt(result.maxMoment.position)} m` });
    }
  }
  markers.push({ x: L, text: `L = ${fmt(L)} m`, anchor: 'end' });

  for (const m of markers) tick(xm.toPx(m.x));
  for (const m of markers) label(xm.toPx(m.x), m.text, m.anchor ?? 'middle');
}

// --- panel renderers -------------------------------------------------------

function renderBeamM3(svg, state, result, xm) {
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${H_BEAM}`);
  svg.setAttribute('role', 'group');
  svg.replaceChildren();

  const xA = xm.toPx(0);
  const xB = xm.toPx(result.input.span);
  const yBeam = 70;
  const supports = result.input.supports;
  const loads = result.input.loads;
  const singlePoint = loads.length === 1 && loads[0].type === 'point';
  const determinate = result.classification.status === 'determinate';

  // Guide line through the load group's combined resultant.
  svg.append(el('line', {
    x1: xm.toPx(result.resultant.position), y1: 6,
    x2: xm.toPx(result.resultant.position), y2: H_BEAM - 8,
    stroke: C.guide, 'stroke-dasharray': '5 4', 'stroke-width': 1,
  }));

  // Beam
  svg.append(el('line', { x1: xA, y1: yBeam, x2: xB, y2: yBeam, stroke: C.beam, 'stroke-width': 6, 'stroke-linecap': 'round' }));

  // Supports
  svg.append(txt(xA, yBeam - 14, `A (${supports.left})`, { size: 11.5, fill: C.muted, halo: true, tabindex: 0, role: 'button', 'data-term': 'supports', 'aria-label': `Explain support A, ${supports.left}` }));
  svg.append(txt(xB, yBeam - 14, `B (${supports.right})`, { size: 11.5, fill: C.muted, halo: true, tabindex: 0, role: 'button', 'data-term': 'supports', 'aria-label': `Explain support B, ${supports.right}` }));
  drawSupport(svg, supports.left, xA, yBeam + 3);
  drawSupport(svg, supports.right, xB, yBeam + 3);

  if (determinate) drawReactionsM3(svg, result, xm);

  // Dimensions (L always; a/b only for the single point load, whose legacy
  // echo carries `b` so no arithmetic happens here).
  dim(svg, xA, xB, 214, `L = ${fmt(result.input.span)} m`);
  if (singlePoint) {
    const xP = xm.toPx(loads[0].position);
    dim(svg, xA, xP, 242, `a = ${fmt(loads[0].position)} m`);
    dim(svg, xP, xB, 242, `b = ${fmt(result.input.b)} m`);
  }

  // Loads (each from its own descriptor) + the combined resultant.
  drawLoads(svg, state, result, xm);
}

function renderSFDM3(svg, state, result, xm, determinate) {
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${H_SFD}`);
  svg.setAttribute('role', 'group');
  svg.replaceChildren();
  if (!determinate) { placeholder(svg, result); return; }

  const { shear, shearJump } = result.diagrams;
  const isDistributed = !shearJump;
  // End shears: at a single point load the last sample is the right-limit
  // (−RB) and the second sample (the jump pair) is the left-limit (+RA) —
  // the same pair the M2 reference renderer labels. Combined (M6) beams use
  // the same end-shear values (RA at 0⁺, −RB at L⁻).
  const V0 = shear[0].V;
  const VL = isDistributed ? shear[shear.length - 1].V : shear[1].V;
  const Vmax = Math.max(Math.abs(V0), Math.abs(VL), 1e-9);
  const y0 = 118;
  const scale = 62 / Vmax;
  const yOf = (V) => y0 - V * scale;

  const xA = xm.toPx(0);
  const xB = xm.toPx(result.input.span);
  const xR = xm.toPx(result.resultant.position);

  svg.append(el('line', { x1: xR, y1: 28, x2: xR, y2: 202, stroke: C.guide, 'stroke-dasharray': '5 4', 'stroke-width': 1 }));
  svg.append(el('line', { x1: xA, y1: y0, x2: xB, y2: y0, stroke: C.axis, 'stroke-width': 1.5 }));

  const pts = shear.map((p) => `${xm.toPx(p.x)},${yOf(p.V)}`).join(' ');
  svg.append(el('polygon', { points: `${xA},${y0} ${pts} ${xB},${y0}`, fill: C.shearFill, stroke: 'none' }));
  svg.append(el('polyline', { points: pts, fill: 'none', stroke: C.shear, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));

  const signOf = (v) => (v > 0 ? '+' : '');
  if (isDistributed) {
    // Distributed load (or multi-load): no single jump — label the end shears.
    svg.append(txt(xA + 8, yOf(V0) - 10, `V = ${signOf(V0)}${fmt(V0)} kN`, { anchor: 'start', fill: C.shear, weight: 700, halo: true }));
    svg.append(txt(xB - 8, yOf(VL) + 20, `V = ${signOf(VL)}${fmt(VL)} kN`, { anchor: 'end', fill: C.shear, weight: 700, halo: true }));
  } else {
    const xP = xm.toPx(result.input.loads[0].position);
    const midL = Math.min(Math.max((xA + xP) / 2, ML + 65), VB_W / 2);
    const midR = Math.max(Math.min((xP + xB) / 2, VB_W - MR - 65), VB_W / 2);
    svg.append(txt(midL, yOf(V0) - 10, `V = ${signOf(V0)}${fmt(V0)} kN`, { fill: C.shear, weight: 700, halo: true }));
    svg.append(txt(midR, yOf(VL) + 20, `V = ${signOf(VL)}${fmt(VL)} kN`, { fill: C.shear, weight: 700, halo: true }));
  }

  xAxisLabels(svg, xm, result, 224);
}

function renderBDMM3(svg, state, result, xm, determinate) {
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${H_BMD}`);
  svg.setAttribute('role', 'group');
  svg.replaceChildren();
  if (!determinate) { placeholder(svg, result); return; }

  const Mmax = result.maxMoment.value;
  const sign = result.maxMoment.sign;
  const yAxis = 130;
  const scale = Mmax > 1e-12 ? 80 / Mmax : 1;
  const yOf = (M) => yAxis + M * scale; // +M (sagging) BELOW, −M (hogging) ABOVE

  const xA = xm.toPx(0);
  const xB = xm.toPx(result.input.span);
  const xR = xm.toPx(result.resultant.position);

  svg.append(el('line', { x1: xR, y1: 20, x2: xR, y2: 250, stroke: C.guide, 'stroke-dasharray': '5 4', 'stroke-width': 1 }));
  svg.append(el('line', { x1: xA, y1: yAxis, x2: xB, y2: yAxis, stroke: C.axis, 'stroke-width': 1.5 }));

  const pts = result.diagrams.moment.map((p) => `${xm.toPx(p.x)},${yOf(p.M)}`).join(' ');
  svg.append(el('polygon', { points: `${xA},${yAxis} ${pts} ${xB},${yAxis}`, fill: C.momentFill, stroke: 'none' }));
  svg.append(el('polyline', { points: pts, fill: 'none', stroke: C.moment, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));

  const peakSigned = sign === 'hogging' ? -Mmax : Mmax;
  const peakY = yOf(peakSigned);
  const peakX = xm.toPx(result.maxMoment.position);
  svg.append(el('circle', { cx: peakX, cy: peakY, r: 4.5, fill: C.moment, stroke: C.halo, 'stroke-width': 1.5 }));

  const label = `Mmax = ${fmt(Mmax)} kNm (${sign})  at x = ${fmt(result.maxMoment.position)} m`;
  const labelY = sign === 'hogging' ? peakY - 18 : peakY + 34;
  let anchor = 'middle';
  let lx = peakX;
  if (peakX < ML + 130) { anchor = 'start'; lx = peakX + 12; }
  else if (peakX > VB_W - MR - 130) { anchor = 'end'; lx = peakX - 12; }
  svg.append(txt(lx, labelY, label, { fill: C.moment, weight: 700, halo: true, anchor, 'data-term': 'maximum-moment', tabindex: 0, role: 'button', 'aria-label': 'Explain maximum bending moment' }));

  xAxisLabels(svg, xm, result, 264);
}

function renderDeflectionM3(svg, state, result, xm, determinate) {
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${H_DEFL}`);
  svg.setAttribute('role', 'group');
  svg.replaceChildren();
  if (!determinate) { placeholder(svg, result); return; }

  const { v, max, EI } = result.deflection;
  const xA = xm.toPx(0);
  const xB = xm.toPx(result.input.span);

  // The undeformed centreline (reference) sits mid-panel; the curve is
  // auto-fit into a fixed drawing band below/around it, with the factor
  // printed so the exaggeration is never mistaken for true scale.
  const y0 = 96;                  // undeformed centreline
  const band = 62;                // drawing band the peak is fitted into
  const vMaxDraw = Math.max(...v.map((p) => Math.abs(p.v)), 1e-12);
  const scale = band / vMaxDraw;  // px per metre (the exaggeration)
  const factor = scale / 1000;    // vs a true-scale mm drawing (mm = m·1000)
  const yOf = (vv) => y0 + vv * scale; // down-positive v draws BELOW the line

  // Supports: undeformed line + small triangles at the original positions.
  svg.append(el('line', { x1: xA, y1: y0, x2: xB, y2: y0, stroke: C.guide, 'stroke-width': 1.2, 'stroke-dasharray': '2 3' }));
  svg.append(el('polygon', { points: `${xA},${y0} ${xA - 9},${y0 + 12} ${xA + 9},${y0 + 12}`, fill: 'none', stroke: C.support, 'stroke-width': 1.5 }));
  svg.append(el('polygon', { points: `${xB},${y0} ${xB - 9},${y0 + 12} ${xB + 9},${y0 + 12}`, fill: 'none', stroke: C.support, 'stroke-width': 1.5 }));

  // Exaggeration note + true max sag (real text, screen-reader reachable).
  const mm = max.value * 1000;
  svg.append(txt(ML, 22, `shape exaggerated ×${fmt(factor)} — true max deflection ${fmt(mm)} mm (${max.sign}) at x = ${fmt(max.position)} m · E·I = ${fmt(EI)} kN·m²`, {
    anchor: 'start', fill: C.muted, italic: true, size: 11, halo: true, 'data-term': 'exaggeration', tabindex: 0, role: 'button', 'aria-label': 'Explain deflection drawing scale',
  }));

  // The curve (down-positive v plots below the undeformed line).
  const pts = v.map((p) => `${xm.toPx(p.x)},${yOf(p.v)}`).join(' ');
  svg.append(el('polygon', { points: `${xA},${y0} ${pts} ${xB},${y0}`, fill: C.deflFill, stroke: 'none' }));
  svg.append(el('polyline', { points: pts, fill: 'none', stroke: C.defl, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));

  // Max-sag marker (same dot style as the BMD peak).
  const maxX = xm.toPx(max.position);
  const maxY = yOf(max.sign === 'down' ? max.value : -max.value);
  svg.append(el('circle', { cx: maxX, cy: maxY, r: 4.5, fill: C.defl, stroke: C.halo, 'stroke-width': 1.5 }));
  svg.append(el('line', { x1: maxX, y1: y0, x2: maxX, y2: maxY, stroke: C.defl, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
  svg.append(txt(maxX + (maxX < VB_W - MR - 120 ? 10 : -10), maxY + (max.sign === 'down' ? -8 : 16),
    `vmax = ${fmt(mm)} mm`, { anchor: maxX < VB_W - MR - 120 ? 'start' : 'end', fill: C.defl, weight: 700, size: 12, halo: true, 'data-term': 'max-deflection', tabindex: 0, role: 'button', 'aria-label': 'Explain maximum deflection' }));

  // x-axis ticks: 0 and L only (the curve is qualitative; numbers above).
  const tick = (x) => svg.append(el('line', { x1: x, y1: y0 + 16, x2: x, y2: y0 + 24, stroke: C.axis, 'stroke-width': 1.2 }));
  tick(xA);
  tick(xB);
  svg.append(txt(xA, y0 + 38, '0', { anchor: 'start', fill: C.muted, size: 11.5, halo: true }));
  svg.append(txt(xB, y0 + 38, `L = ${fmt(result.input.span)} m`, { anchor: 'end', fill: C.muted, size: 11.5, halo: true }));
}

function placeholder(svg, result) {
  const msg = result.classification.status === 'indeterminate'
    ? 'Statically indeterminate — not solved here (see note above)'
    : 'Unstable (mechanism) — not solved here (see note above)';
  svg.append(txt(VB_W / 2, 60, msg, { fill: C.muted, italic: true, size: 13.5, halo: true }));
}

// --- top-level readouts ----------------------------------------------------

function renderDeterminacyBadge(doc, cls) {
  const conf = {
    determinate: { cls: 'determinate', text: '✓ Statically determinate' },
    indeterminate: { cls: 'indeterminate', text: `⚠ Statically indeterminate — degree ${cls.degree}` },
    unstable: { cls: 'unstable', text: '✕ Unstable (mechanism) — not fully restrained' },
  }[cls.status];
  const badge = doc.getElementById('det-badge');
  badge.className = `det-badge ${conf.cls}`;
  badge.textContent = conf.text;
}

function renderClassNote(doc, result) {
  const note = doc.getElementById('class-note');
  const cls = result.classification;
  if (cls.status === 'determinate') {
    note.hidden = true;
    note.textContent = '';
    return;
  }
  note.hidden = false;
  let text = cls.note;
  if (cls.unconstrained.length) text += ` Unrestrained motion: ${cls.unconstrained.join(', ')}.`;
  note.textContent = text;
}

function reactionCards(result) {
  const NAME = { Hx: 'H', Vy: 'V', Mz: 'M' };
  const UNIT = { Hx: 'kN', Vy: 'kN', Mz: 'kNm' };
  const out = [];
  for (const [side, letter] of [['left', 'A'], ['right', 'B']]) {
    const r = result.reactions[side];
    for (const [comp, val] of Object.entries(r)) {
      if (comp === 'type') continue;
      out.push({
        label: `Reaction ${NAME[comp]}${letter}`,
        value: `${fmt(val)} ${UNIT[comp]}`,
        steps: `Reaction ${NAME[comp]}${letter}`,
      });
    }
  }
  return out;
}

function cardNode(c) {
  const node = h('div', c.accent ? 'card accent' : 'card');
  node.append(h('span', 'card-label', c.label));
  node.append(h('span', 'card-value', c.value));
  if (c.sub) node.append(h('span', 'card-sub', c.sub));
  // M9 teaching door: solved cards carry data-steps (their worked derivation,
  // from explain.js over the FINISHED result); unsolved cards carry a glossary
  // term explaining WHY they show '–'. Label text is untouched (the annotation
  // rule), and tabindex/role/aria make the door keyboard-reachable.
  if (c.steps) {
    node.setAttribute('data-steps', c.steps);
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `How was this calculated? — ${c.label}`);
  } else if (c.term) {
    node.setAttribute('data-term', c.term);
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `Why? — ${c.label}`);
  }
  return node;
}

function renderResultCards(doc, state, result) {
  const container = doc.getElementById('result-cards');
  const cards = [];

  if (result.classification.status === 'determinate') {
    cards.push(...reactionCards(result));
    cards.push({
      label: 'Max bending moment',
      value: `${fmt(result.maxMoment.value)} kNm`,
      sub: `${result.maxMoment.sign} · at x = ${fmt(result.maxMoment.position)} m`,
      accent: true,
      steps: 'Max bending moment',
    });
    cards.push({
      label: 'Max deflection',
      value: `${fmt(result.deflection.max.value * 1000)} mm`,
      sub: `${result.deflection.max.sign} · at x = ${fmt(result.deflection.max.position)} m · E·I = ${fmt(result.deflection.EI)} kN·m²`,
      steps: 'Max deflection',
    });
  } else {
    cards.push({ label: 'Reactions', value: '–', sub: 'not solved by statics', term: 'statically-indeterminate' });
    cards.push({ label: 'Max bending moment', value: '–', sub: 'not solved by statics', term: 'statically-indeterminate' });
  }

  // Load description (intensity, resultant, centroid, arms) lives on the beam
  // diagram, not here — the Results panel shows only what the structure
  // produces.
  container.replaceChildren(...cards.map(cardNode));
}

function renderEqBadge(doc, result) {
  const eq = doc.getElementById('eq-badge');
  if (result.classification.status !== 'determinate') {
    eq.textContent = 'Not solved';
    eq.setAttribute('aria-label', 'Not solved. This support arrangement has no equilibrium residuals to inspect.');
    eq.setAttribute('tabindex', '-1');
    eq.className = 'eq-badge neutral';
    return;
  }
  const e = result.equilibrium;
  eq.textContent = e.satisfied ? 'Balanced ✓' : 'Check balance';
  eq.setAttribute('aria-label', e.satisfied
    ? 'Balanced. Activate to inspect the equilibrium residuals.'
    : 'Equilibrium check failed. Activate to inspect the residuals.');
  eq.setAttribute('tabindex', '0');
  eq.className = `eq-badge ${e.satisfied ? 'ok' : 'bad'}`;
}

// --- top-level render ------------------------------------------------------

export function renderM3(doc, state, result) {
  const xm = makeXMap(state);
  const determinate = result.classification.status === 'determinate';

  renderDeterminacyBadge(doc, result.classification);
  renderClassNote(doc, result);
  renderResultCards(doc, state, result);
  renderEqBadge(doc, result);

  renderBeamM3(doc.getElementById('beam-svg'), state, result, xm);
  renderSFDM3(doc.getElementById('sfd-svg'), state, result, xm, determinate);
  renderBDMM3(doc.getElementById('bmd-svg'), state, result, xm, determinate);
  // The deflection panel (M8) is optional in the DOM contract: present in
  // index.html and in every M8-era fixture; renderM3 stays usable with
  // minimal/older fixtures (pre-M8 test shims) that omit it.
  const deflSvg = doc.getElementById('defl-svg');
  if (deflSvg) renderDeflectionM3(deflSvg, state, result, xm, determinate);
}
