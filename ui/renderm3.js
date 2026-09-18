/**
 * renderm3.js — Support- & load-aware visualization layer (M3–M5)
 * -------------------------------------------------------------
 * PURE RENDERERS. Contains NO engineering mathematics: every plotted point,
 * labeled value, reaction arrow, sign note, resultant and centroid come from
 * the `analyzeBeam` result object. The only computations here are geometric
 * (engineering coordinates → SVG pixels) and presentational (formatting).
 *
 * Load shapes drawn from the descriptor (geometry only):
 *   point → red arrow · udl (full-span) → shaded band · linear → rectangle /
 *   triangle / trapezoid over the sub-region [start, end].
 *
 * Visualization convention (owner-approved): BMD drawn on the tension side —
 * sagging (+) BELOW the axis, hogging (−) ABOVE the axis. Engine sign
 * convention unchanged (sagging positive).
 */
import { makeXMap, fmt } from './render.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const VB_W = 900;
const ML = 60;
const MR = 40;
const PLOT_W = VB_W - ML - MR;

const H_BEAM = 268;
const H_SFD = 234;
const H_BMD = 270;

const C = {
  ink: '#1e293b',
  muted: '#64748b',
  beam: '#334155',
  support: '#334155',
  load: '#dc2626',
  udl: '#059669',
  udlFill: 'rgba(5, 150, 105, 0.12)',
  reaction: '#16a34a',
  shear: '#2563eb',
  shearFill: 'rgba(37, 99, 235, 0.14)',
  moment: '#ea580c',
  momentFill: 'rgba(234, 88, 12, 0.15)',
  guide: '#94a3b8',
  axis: '#64748b',
  dim: '#475569',
  note: '#64748b',
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
    attrs.style = 'paint-order:stroke;stroke:#ffffff;stroke-width:3.5px;stroke-linejoin:round';
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
  svg.append(txt(x, 192, label, { fill: C.reaction, weight: 700, size: 12.5, halo: true }));
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
  svg.append(txt(x, cy - r - 10, label, { fill: C.reaction, weight: 700, size: 12.5, halo: true }));
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

function drawPointLoad(svg, result, xm) {
  const xP = xm.toPx(result.input.position);
  const yBeam = 70;
  const flip = xP > VB_W - MR - 160;
  const lx = flip ? xP - 14 : xP + 14;
  const anchor = flip ? 'end' : 'start';
  const g = el('g', {
    'data-role': 'load-handle',
    tabindex: 0,
    role: 'img',
    'aria-label': `Point load ${fmt(result.input.load)} kilonewtons at ${fmt(result.input.position)} metres from support A — drag, or focus and use arrow keys, to move`,
  });
  g.append(el('rect', { x: xP - 90, y: 0, width: 180, height: yBeam - 4, fill: 'transparent', 'pointer-events': 'all' }));
  g.append(el('line', { x1: xP, y1: 10, x2: xP, y2: 54, stroke: C.load, 'stroke-width': 3 }));
  g.append(el('polygon', { points: `${xP - 7},52 ${xP + 7},52 ${xP},64`, fill: C.load }));
  g.append(txt(lx, 22, `P = ${fmt(result.input.load)} kN`, { anchor, fill: C.load, weight: 700, size: 13, halo: true }));
  g.append(txt(lx, 40, '↔ drag', { anchor, fill: C.guide, size: 11 }));
  svg.append(g);
}

/** Extract the [x1, x2, w1, w2] geometry of any distributed load (udl or linear). */
function distributedGeometry(result) {
  const d = result.input.loads[0];
  if (d.type === 'udl') return { x1: 0, x2: result.input.span, w1: d.intensity, w2: d.intensity };
  return { x1: d.start, x2: d.end, w1: d.wStart, w2: d.wEnd };
}

function drawDistributedLoad(svg, result, xm) {
  const { x1, x2, w1, w2 } = distributedGeometry(result);
  const px1 = xm.toPx(x1);
  const px2 = xm.toPx(x2);
  const maxW = Math.max(w1, w2, 1e-9);
  const yBase = 60;
  const maxH = 34;
  const yTopOf = (w) => yBase - (w / maxW) * maxH;

  // Filled shape from the descriptor. Uniform loads render as a `rect`
  // (rectangle); linearly-varying loads render as a `polygon` (triangle or
  // trapezoid).
  const yTop1 = yTopOf(w1);
  const yTop2 = yTopOf(w2);
  if (Math.abs(w1 - w2) < 1e-12) {
    svg.append(el('rect', {
      x: px1, y: yTop1, width: px2 - px1, height: yBase - yTop1,
      fill: C.udlFill, stroke: C.udl, 'stroke-width': 1.5,
    }));
  } else {
    svg.append(el('polygon', {
      points: `${px1},${yBase} ${px1},${yTop1} ${px2},${yTop2} ${px2},${yBase}`,
      fill: C.udlFill, stroke: C.udl, 'stroke-width': 1.5, 'stroke-linejoin': 'round',
    }));
  }

  // Downward arrows distributed along the loaded region.
  const n = Math.max(2, Math.min(6, Math.round((px2 - px1) / 90)));
  for (let i = 1; i < n; i++) {
    const x = px1 + ((px2 - px1) * i) / n;
    svg.append(el('line', { x1: x, y1: yBase, x2: x, y2: 66, stroke: C.udl, 'stroke-width': 2 }));
    svg.append(el('polygon', { points: `${x - 4},64 ${x + 4},64 ${x},71`, fill: C.udl }));
  }

  // Intensity label (peak value for triangular, range for trapezoidal).
  const uniform = Math.abs(w1 - w2) < 1e-12;
  const label = uniform ? `w = ${fmt(w1)} kN/m ↓` : `w: ${fmt(w1)} → ${fmt(w2)} kN/m ↓`;
  const lx = (px1 + px2) / 2;
  svg.append(txt(lx, Math.min(yTop1, yTop2) - 8, label, { fill: C.udl, weight: 700, size: 13, halo: true }));

  // Region drag handles (linear only) — dashed boundaries + grab dots.
  if (result.input.loads[0].type === 'linear') {
    for (const [x, role] of [[x1, 'region-start'], [x2, 'region-end']]) {
      const p = xm.toPx(x);
      const g = el('g', { 'data-role': role, tabindex: 0, role: 'img', 'aria-label': `${role === 'region-start' ? 'Load region start' : 'Load region end'} — drag to move` });
      g.append(el('rect', { x: p - 16, y: 6, width: 32, height: 64, fill: 'transparent', 'pointer-events': 'all' }));
      g.append(el('line', { x1: p, y1: 12, x2: p, y2: 64, stroke: C.udl, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
      g.append(el('circle', { cx: p, cy: 24, r: 5, fill: '#ffffff', stroke: C.udl, 'stroke-width': 2.5 }));
      svg.append(g);
    }
  }

  // Resultant R (equivalent single force) + centroid x̄ — contextual, on the
  // beam, so the Results panel stays solution-only. R and x̄ come straight
  // from the engine (`result.resultant`).
  const xR = xm.toPx(result.resultant.position);
  const rFlip = xR > VB_W - MR - 150;
  const rLx = rFlip ? xR - 10 : xR + 10;
  const rAnchor = rFlip ? 'end' : 'start';
  svg.append(el('line', { x1: xR, y1: 16, x2: xR, y2: 56, stroke: C.udl, 'stroke-width': 2.5, 'stroke-dasharray': '5 3' }));
  svg.append(el('polygon', { points: `${xR - 6},54 ${xR + 6},54 ${xR},66`, fill: C.udl, opacity: 0.9 }));
  svg.append(txt(rLx, 34, `R = ${fmt(result.resultant.value)} kN`, { anchor: rAnchor, fill: C.udl, weight: 700, size: 12.5, halo: true }));
  svg.append(txt(xR, 252, `x̄ = ${fmt(result.resultant.position)} m`, { fill: C.muted, size: 11, halo: true }));
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

/** x-axis tick marks + labels, load-type aware (0 / a / L, or 0 / L/2 / L, or 0 / x₁ / x₂ / L). */
function xAxisLabels(svg, xm, result, labelY) {
  const type = result.input.loads[0].type;
  const L = result.input.span;
  const tick = (x) => svg.append(el('line', { x1: x, y1: labelY - 18, x2: x, y2: labelY - 10, stroke: C.axis, 'stroke-width': 1.2 }));
  const label = (x, s, anchor = 'middle') => svg.append(txt(x, labelY, s, { fill: C.muted, size: 11.5, halo: true, anchor }));

  const markers = [{ x: 0, text: '0', anchor: 'start' }];
  if (type === 'point') {
    markers.push({ x: result.input.position, text: `a = ${fmt(result.input.position)} m` });
  } else if (type === 'udl') {
    markers.push({ x: L / 2, text: 'L/2' });
  } else {
    const d = result.input.loads[0];
    if (d.start > 0) markers.push({ x: d.start, text: `x₁ = ${fmt(d.start)} m` });
    if (d.end < L) markers.push({ x: d.end, text: `x₂ = ${fmt(d.end)} m` });
  }
  markers.push({ x: L, text: `L = ${fmt(L)} m`, anchor: 'end' });

  for (const m of markers) tick(xm.toPx(m.x));
  for (const m of markers) label(xm.toPx(m.x), m.text, m.anchor ?? 'middle');
}

// --- panel renderers -------------------------------------------------------

function renderBeamM3(svg, state, result, xm) {
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${H_BEAM}`);
  svg.replaceChildren();

  const xA = xm.toPx(0);
  const xB = xm.toPx(result.input.span);
  const yBeam = 70;
  const supports = result.input.supports;
  const type = result.input.loads[0].type;
  const isDistributed = type === 'udl' || type === 'linear';
  const determinate = result.classification.status === 'determinate';

  // Guide line through the load's resultant location.
  svg.append(el('line', {
    x1: xm.toPx(result.resultant.position), y1: 6,
    x2: xm.toPx(result.resultant.position), y2: H_BEAM - 8,
    stroke: C.guide, 'stroke-dasharray': '5 4', 'stroke-width': 1,
  }));

  // Beam
  svg.append(el('line', { x1: xA, y1: yBeam, x2: xB, y2: yBeam, stroke: C.beam, 'stroke-width': 6, 'stroke-linecap': 'round' }));

  // Supports
  svg.append(txt(xA, yBeam - 14, `A (${supports.left})`, { size: 11.5, fill: C.muted, halo: true }));
  svg.append(txt(xB, yBeam - 14, `B (${supports.right})`, { size: 11.5, fill: C.muted, halo: true }));
  drawSupport(svg, supports.left, xA, yBeam + 3);
  drawSupport(svg, supports.right, xB, yBeam + 3);

  if (determinate) drawReactionsM3(svg, result, xm);

  // Dimensions (L always; a/b only for a point load)
  dim(svg, xA, xB, 214, `L = ${fmt(result.input.span)} m`);
  if (!isDistributed) {
    const xP = xm.toPx(result.input.position);
    dim(svg, xA, xP, 242, `a = ${fmt(result.input.position)} m`);
    dim(svg, xP, xB, 242, `b = ${fmt(result.input.b)} m`);
  }

  // Load
  if (isDistributed) drawDistributedLoad(svg, result, xm);
  else drawPointLoad(svg, result, xm);
}

function renderSFDM3(svg, state, result, xm, determinate) {
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${H_SFD}`);
  svg.replaceChildren();
  if (!determinate) { placeholder(svg, result); return; }

  const { shear, shearJump } = result.diagrams;
  const isDistributed = !shearJump;
  const V0 = shear[0].V;
  const VL = shear[shear.length - 1].V;
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
    // Distributed load: no jump — label the end shears.
    svg.append(txt(xA + 8, yOf(V0) - 10, `V = ${signOf(V0)}${fmt(V0)} kN`, { anchor: 'start', fill: C.shear, weight: 700, halo: true }));
    svg.append(txt(xB - 8, yOf(VL) + 20, `V = ${signOf(VL)}${fmt(VL)} kN`, { anchor: 'end', fill: C.shear, weight: 700, halo: true }));
  } else {
    const xP = xm.toPx(result.input.position);
    const midL = Math.min(Math.max((xA + xP) / 2, ML + 65), VB_W / 2);
    const midR = Math.max(Math.min((xP + xB) / 2, VB_W - MR - 65), VB_W / 2);
    svg.append(txt(midL, yOf(V0) - 10, `V = ${signOf(V0)}${fmt(V0)} kN`, { fill: C.shear, weight: 700, halo: true }));
    svg.append(txt(midR, yOf(VL) + 20, `V = ${signOf(VL)}${fmt(VL)} kN`, { fill: C.shear, weight: 700, halo: true }));
  }

  xAxisLabels(svg, xm, result, 224);
}

function renderBDMM3(svg, state, result, xm, determinate) {
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${H_BMD}`);
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
  svg.append(el('circle', { cx: peakX, cy: peakY, r: 4.5, fill: C.moment, stroke: '#ffffff', 'stroke-width': 1.5 }));

  const label = `Mmax = ${fmt(Mmax)} kNm (${sign})  at x = ${fmt(result.maxMoment.position)} m`;
  const labelY = sign === 'hogging' ? peakY - 18 : peakY + 34;
  let anchor = 'middle';
  let lx = peakX;
  if (peakX < ML + 130) { anchor = 'start'; lx = peakX + 12; }
  else if (peakX > VB_W - MR - 130) { anchor = 'end'; lx = peakX - 12; }
  svg.append(txt(lx, labelY, label, { fill: C.moment, weight: 700, halo: true, anchor }));

  xAxisLabels(svg, xm, result, 264);
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
      out.push({ label: `Reaction ${NAME[comp]}${letter}`, value: `${fmt(val)} ${UNIT[comp]}` });
    }
  }
  return out;
}

function cardNode(c) {
  const node = h('div', c.accent ? 'card accent' : 'card');
  node.append(h('span', 'card-label', c.label));
  node.append(h('span', 'card-value', c.value));
  if (c.sub) node.append(h('span', 'card-sub', c.sub));
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
    });
  } else {
    cards.push({ label: 'Reactions', value: '–', sub: 'not solved by statics' });
    cards.push({ label: 'Max bending moment', value: '–', sub: 'not solved by statics' });
  }

  // Load description (intensity, resultant, centroid, arms) lives on the beam
  // diagram, not here — the Results panel shows only what the structure
  // produces.
  container.replaceChildren(...cards.map(cardNode));
}

function renderEqBadge(doc, result) {
  const eq = doc.getElementById('eq-badge');
  if (result.classification.status !== 'determinate') {
    eq.textContent = 'Not solved — see determinacy note';
    eq.className = 'eq-badge neutral';
    return;
  }
  const e = result.equilibrium;
  eq.textContent =
    `Engine equilibrium self-check: ΣFx = ${e.sumFx.toExponential(1)} · ΣFy = ${e.sumFy.toExponential(1)} · ΣM = ${e.sumMz.toExponential(1)} ✓`;
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
}
