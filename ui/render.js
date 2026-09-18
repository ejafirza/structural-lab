/**
 * render.js — Visualization layer (Milestone 2)
 * -------------------------------------------------------------
 * PURE RENDERERS. This file contains NO engineering mathematics: every
 * plotted point, labeled value and key marker comes from the engine result
 * object produced by src/engine.js. The only computations here are
 * geometric (engineering coordinates → SVG pixels) and presentational
 * (number formatting).
 *
 * Visualization convention (owner-approved): the BMD is drawn with sagging
 * (+) moment BELOW the axis, i.e. on the tension side of the beam. The
 * engine's sign convention is unchanged — this is a plotting choice only,
 * and it is labeled explicitly in the UI.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// All three panels share the same viewBox width and horizontal margins so
// they stack as one x-aligned system: beam → SFD → BMD.
const VB_W = 900;
const ML = 60;                    // left margin, px
const MR = 40;                    // right margin, px
const PLOT_W = VB_W - ML - MR;

// Panel heights (viewBox units)
const H_BEAM = 268;
const H_SFD = 234;
const H_BMD = 244;

// Palette — edit these to restyle the diagrams.
const C = {
  ink: '#1e293b',
  muted: '#64748b',
  beam: '#334155',
  support: '#334155',
  load: '#dc2626',
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

/** Map beam x-coordinates (m) ↔ SVG x (px) for the current state. */
export function makeXMap(state) {
  const pad = state.span * 0.05;        // breathing room outside the supports
  const x0 = -pad;
  const x1 = state.span + pad;
  return {
    toPx: (x) => ML + ((x - x0) / (x1 - x0)) * PLOT_W,
    toBeam: (px) => x0 + ((px - ML) / PLOT_W) * (x1 - x0),
  };
}

/** Format a number for display: 3 significant figures, no trailing noise. */
export function fmt(v) {
  if (v == null || !Number.isFinite(v)) return '–';
  return String(Number(v.toPrecision(3)));
}

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
    attrs.style =
      'paint-order:stroke;stroke:#ffffff;stroke-width:3.5px;stroke-linejoin:round';
  }
  return el('text', attrs, str);
}

function drawPin(svg, x, yTop) {
  const base = yTop + 40;
  svg.append(
    el('polygon', {
      points: `${x},${yTop} ${x - 18},${base} ${x + 18},${base}`,
      fill: 'none',
      stroke: C.support,
      'stroke-width': 2.5,
      'stroke-linejoin': 'round',
    })
  );
  svg.append(el('line', { x1: x - 26, y1: base, x2: x + 26, y2: base, stroke: C.support, 'stroke-width': 2 }));
  for (let i = 0; i < 5; i++) {
    const hx = x - 24 + i * 12;
    svg.append(el('line', { x1: hx, y1: base, x2: hx - 8, y2: base + 10, stroke: C.support, 'stroke-width': 1.5 }));
  }
}

function drawRoller(svg, x, yTop) {
  const base = yTop + 32;
  svg.append(
    el('polygon', {
      points: `${x},${yTop} ${x - 18},${base} ${x + 18},${base}`,
      fill: 'none',
      stroke: C.support,
      'stroke-width': 2.5,
      'stroke-linejoin': 'round',
    })
  );
  svg.append(el('circle', { cx: x - 9, cy: base + 5.5, r: 4.5, fill: 'none', stroke: C.support, 'stroke-width': 2 }));
  svg.append(el('circle', { cx: x + 9, cy: base + 5.5, r: 4.5, fill: 'none', stroke: C.support, 'stroke-width': 2 }));
  const ground = base + 11;
  svg.append(el('line', { x1: x - 26, y1: ground, x2: x + 26, y2: ground, stroke: C.support, 'stroke-width': 2 }));
  for (let i = 0; i < 5; i++) {
    const hx = x - 24 + i * 12;
    svg.append(el('line', { x1: hx, y1: ground, x2: hx - 8, y2: ground + 10, stroke: C.support, 'stroke-width': 1.5 }));
  }
}

function drawReaction(svg, x, label) {
  // Upward green arrow just below the support symbol — value from engine.
  svg.append(el('line', { x1: x, y1: 172, x2: x, y2: 134, stroke: C.reaction, 'stroke-width': 3 }));
  svg.append(el('polygon', { points: `${x - 6},136 ${x + 6},136 ${x},126`, fill: C.reaction }));
  svg.append(txt(x, 192, label, { fill: C.reaction, weight: 700, size: 12.5, halo: true }));
}

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
    if (mid > VB_W / 2) {
      anchor = 'end';
      lx = Math.max(x1, x2) - 3;
    } else {
      anchor = 'start';
      lx = Math.min(x1, x2) + 3;
    }
  }
  svg.append(txt(lx, y - 8, label, { fill: C.dim, size: 11.5, halo: true, anchor }));
}

function xAxis(svg, xA, xP, xB, result, labelY) {
  const tick = (x) =>
    svg.append(el('line', { x1: x, y1: labelY - 18, x2: x, y2: labelY - 10, stroke: C.axis, 'stroke-width': 1.2 }));
  const label = (x, s, anchor = 'middle') =>
    svg.append(txt(x, labelY, s, { fill: C.muted, size: 11.5, halo: true, anchor }));
  tick(xA);
  tick(xP);
  tick(xB);
  const crowdedLeft = xP - xA < 48;
  const crowdedRight = xB - xP < 48;
  if (!crowdedLeft) label(xA, '0');
  const aAnchor = crowdedRight ? 'end' : crowdedLeft ? 'start' : 'middle';
  const ax = crowdedRight ? xP - 6 : xP;
  label(ax, `a = ${fmt(result.input.position)} m`, aAnchor);
  label(xB, `L = ${fmt(result.input.span)} m`, crowdedRight ? 'end' : 'middle');
}

// --- panel renderers --------------------------------------------------------

export function renderBeam(svg, state, result, xm) {
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${H_BEAM}`);
  svg.replaceChildren();

  const xA = xm.toPx(0);
  const xB = xm.toPx(result.input.span);
  const xP = xm.toPx(result.input.position);
  const yBeam = 70;

  // Guide line through the load — visually continues through SFD/BMD panels.
  svg.append(
    el('line', { x1: xP, y1: 6, x2: xP, y2: H_BEAM - 8, stroke: C.guide, 'stroke-dasharray': '5 4', 'stroke-width': 1 })
  );

  // Beam
  svg.append(
    el('line', { x1: xA, y1: yBeam, x2: xB, y2: yBeam, stroke: C.beam, 'stroke-width': 6, 'stroke-linecap': 'round' })
  );

  // Support identification
  svg.append(txt(xA, yBeam - 14, 'A (pin)', { size: 11.5, fill: C.muted, halo: true }));
  svg.append(txt(xB, yBeam - 14, 'B (roller)', { size: 11.5, fill: C.muted, halo: true }));

  drawPin(svg, xA, yBeam + 3);
  drawRoller(svg, xB, yBeam + 3);

  // Reactions — values straight from the engine
  drawReaction(svg, xA, `RA = ${fmt(result.reactions.RA)} kN`);
  drawReaction(svg, xB, `RB = ${fmt(result.reactions.RB)} kN`);

  // Dimension lines (L, a, b — echoed from the engine's recorded input)
  dim(svg, xA, xB, 214, `L = ${fmt(result.input.span)} m`);
  dim(svg, xA, xP, 242, `a = ${fmt(result.input.position)} m`);
  dim(svg, xP, xB, 242, `b = ${fmt(result.input.b)} m`);

  // Draggable point load
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

export function renderSFD(svg, state, result, xm) {
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${H_SFD}`);
  svg.replaceChildren();

  const RA = result.reactions.RA;
  const RB = result.reactions.RB;
  const Vmax = Math.max(RA, RB, 1e-9);
  const y0 = 118;                        // V = 0
  const scale = 62 / Vmax;               // px per kN
  const yOf = (V) => y0 - V * scale;     // positive shear plots UP

  const xA = xm.toPx(0);
  const xB = xm.toPx(result.input.span);
  const xP = xm.toPx(result.input.position);

  svg.append(
    el('line', { x1: xP, y1: 28, x2: xP, y2: 202, stroke: C.guide, 'stroke-dasharray': '5 4', 'stroke-width': 1 })
  );
  svg.append(el('line', { x1: xA, y1: y0, x2: xB, y2: y0, stroke: C.axis, 'stroke-width': 1.5 }));

  // Area + outline plotted from the ENGINE sample arrays. The two engine
  // points at x = a (left-limit +RA, right-limit −RB) draw the shear jump.
  const pts = result.diagrams.shear.map((p) => `${xm.toPx(p.x)},${yOf(p.V)}`).join(' ');
  svg.append(el('polygon', { points: `${xA},${y0} ${pts} ${xB},${y0}`, fill: C.shearFill, stroke: 'none' }));
  svg.append(el('polyline', { points: pts, fill: 'none', stroke: C.shear, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));

  // Plateau labels — engine values
  const midL = Math.min(Math.max((xA + xP) / 2, ML + 65), VB_W / 2);
  const midR = Math.max(Math.min((xP + xB) / 2, VB_W - MR - 65), VB_W / 2);
  svg.append(txt(midL, yOf(RA) - 10, `+RA = ${fmt(RA)} kN`, { fill: C.shear, weight: 700, halo: true }));
  svg.append(txt(midR, yOf(-RB) + 20, `−RB = ${fmt(RB)} kN`, { fill: C.shear, weight: 700, halo: true }));

  xAxis(svg, xA, xP, xB, result, 224);
}

export function renderBMD(svg, state, result, xm) {
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${H_BMD}`);
  svg.replaceChildren();

  const Mmax = result.maxMoment.value;
  const yTop = 46;                          // M = 0 (the beam axis)
  const scale = Mmax > 1e-12 ? 128 / Mmax : 1;
  const yOf = (M) => yTop + M * scale;      // TENSION-SIDE-DOWN: +M plots BELOW

  const xA = xm.toPx(0);
  const xB = xm.toPx(result.input.span);
  const xP = xm.toPx(result.input.position);

  // Explicit convention label (plotting choice only; engine signs unchanged)
  svg.append(
    txt(ML, 22, 'Sagging (+) drawn below the axis — tension side (plotting convention; engine sagging M is positive)', {
      anchor: 'start',
      fill: C.note,
      italic: true,
      size: 11,
      halo: true,
    })
  );

  svg.append(
    el('line', { x1: xP, y1: 30, x2: xP, y2: 218, stroke: C.guide, 'stroke-dasharray': '5 4', 'stroke-width': 1 })
  );
  svg.append(el('line', { x1: xA, y1: yTop, x2: xB, y2: yTop, stroke: C.axis, 'stroke-width': 1.5 }));

  const pts = result.diagrams.moment.map((p) => `${xm.toPx(p.x)},${yOf(p.M)}`).join(' ');
  svg.append(el('polygon', { points: `${xA},${yTop} ${pts} ${xB},${yTop}`, fill: C.momentFill, stroke: 'none' }));
  svg.append(el('polyline', { points: pts, fill: 'none', stroke: C.moment, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));

  // Peak marker — engine key point
  const peakY = yOf(Mmax);
  svg.append(el('circle', { cx: xP, cy: peakY, r: 4.5, fill: C.moment, stroke: '#ffffff', 'stroke-width': 1.5 }));

  const label = `Mmax = ${fmt(Mmax)} kNm  at x = ${fmt(result.maxMoment.position)} m`;
  const ax = Math.min(Math.max(xP, ML + 95), VB_W - MR - 95);
  if (Math.abs(ax - xP) > 6) {
    svg.append(
      el('line', { x1: xP, y1: peakY + 7, x2: ax, y2: peakY + 19, stroke: C.moment, 'stroke-dasharray': '3 3', 'stroke-width': 1 })
    );
  }
  svg.append(txt(ax, peakY + 34, label, { fill: C.moment, weight: 700, halo: true }));

  xAxis(svg, xA, xP, xB, result, 236);
}

// --- top-level render -------------------------------------------------------

export function renderAll(doc, state, result) {
  const xm = makeXMap(state);
  renderBeam(doc.getElementById('beam-svg'), state, result, xm);
  renderSFD(doc.getElementById('sfd-svg'), state, result, xm);
  renderBMD(doc.getElementById('bmd-svg'), state, result, xm);

  const set = (id, value) => {
    doc.getElementById(id).textContent = value;
  };
  set('ro-ra', `${fmt(result.reactions.RA)} kN`);
  set('ro-rb', `${fmt(result.reactions.RB)} kN`);
  set('ro-mmax', `${fmt(result.maxMoment.value)} kNm`);
  set('ro-xmmax', `at x = ${fmt(result.maxMoment.position)} m`);
  set('ro-a', `${fmt(result.input.position)} m`);
  set('ro-b', `${fmt(result.input.b)} m`);

  const eq = doc.getElementById('eq-badge');
  eq.textContent =
    `Engine equilibrium self-check: ΣFy = ${result.equilibrium.sumFy.toExponential(1)} · ΣM_A = ${result.equilibrium.sumMomentsAboutA.toExponential(1)} ✓`;
  eq.classList.toggle('ok', result.equilibrium.satisfied);
  eq.classList.toggle('bad', !result.equilibrium.satisfied);
}
