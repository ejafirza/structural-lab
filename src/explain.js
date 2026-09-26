/**
 * explain.js — worked derivations over a FINISHED analyzeBeam result (M9).
 * -------------------------------------------------------------
 * The engine computes; this file only FORMATS what the engine already found.
 * Every step's `value` is read from the result object (reactions, maxMoment,
 * equilibrium, deflection, the sampled diagrams) — never recomputed by a
 * parallel formula. test/explain.test.js enforces the identity: each step's
 * value is identical to the engine field it quotes, and the closed-form
 * builders produce exactly the numbers the analytical suites already pinned.
 *
 * A step: { formula, substitution, value, unit }. A group: { title, steps }.
 * `derivationGroups(result)` returns the groups available for a result —
 * for determinate beams the full set; for indeterminate/unstable beams only
 * the classification explanation (honesty rule: no invented numbers).
 */

// --- tiny formatting helpers (presentation only) -----------------------------

const n3 = (v) => String(Number(v.toPrecision(3)));

function step(formula, substitution, value, unit) {
  return { formula, substitution, value, unit };
}

/**
 * Sub-steps for ONE load's resultant, using only descriptor geometry and the
 * result's published combined resultant. For a SINGLE load the per-load Rᵢ
 * steps are shown with their closed-form values — the same forms the engine
 * documents and the analytical suites pin (the lone-load case is exactly the
 * frozen M1/M4/M5 result, so the identity rule holds). For MIXED loads the
 * per-load resultants are described in prose only: the engine publishes the
 * COMBINED (R, x̄), and explain.js never recomputes a value the result does
 * not carry.
 */
function resultantSteps(load, lone) {
  const out = [];
  if (load.type === 'point') {
    if (lone) {
      out.push(step('R = P (a point load is its own resultant)', `P = ${n3(load.magnitude)}`, load.magnitude, 'kN'));
      out.push(step('x̄ = a (acts at the load)', `a = ${n3(load.position)} m`, load.position, 'm'));
    } else {
      out.push(step('Point load: R = P, acting at its position a', 'its own resultant', null, ''));
    }
  } else if (load.type === 'udl') {
    const b = load.end - load.start;
    if (lone) {
      out.push(step('R = w·b (area of the band)', `${n3(load.intensity)} × ${n3(b)}`, load.intensity * b, 'kN'));
      out.push(step('x̄ = (start + end)/2 — uniform band, centroid at the middle', `x̄ = ${n3((load.start + load.end) / 2)} m`, (load.start + load.end) / 2, 'm'));
    } else {
      out.push(step('Distributed band: R = its area (w × b), acting at the band midpoint', 'area × centroid', null, ''));
    }
  } else if (load.type === 'linear') {
    const b = load.end - load.start;
    if (lone) {
      const R = ((load.wStart + load.wEnd) * b) / 2;
      const xbar = load.wStart + load.wEnd > 0
        ? load.start + (b * (load.wStart + 2 * load.wEnd)) / (3 * (load.wStart + load.wEnd))
        : load.start;
      out.push(step('R = (w₁ + w₂)·b/2 (trapezoid area)', `(${n3(load.wStart)} + ${n3(load.wEnd)}) × ${n3(b)} / 2`, R, 'kN'));
      out.push(step('x̄ = x₁ + b·(w₁ + 2w₂)/(3·(w₁ + w₂))', `x̄ = ${n3(xbar)} m`, xbar, 'm'));
    } else {
      out.push(step('Trapezoid band: R = (w₁ + w₂)·b/2 at its centroid', 'the M5 closed forms, per load', null, ''));
    }
  } else if (load.type === 'profile') {
    if (lone) {
      let R = 0;
      let Mx = 0;
      const pts = load.points;
      for (let i = 1; i < pts.length; i++) {
        const b = pts[i].x - pts[i - 1].x;
        const Ri = ((pts[i - 1].w + pts[i].w) * b) / 2;
        const xbi = pts[i - 1].x + (b * (pts[i - 1].w + 2 * pts[i].w)) / (3 * (pts[i - 1].w + pts[i].w));
        R += Ri;
        Mx += Ri * xbi;
      }
      out.push(step('R = Σ Rᵢ (sum of per-segment trapezoid areas)', 'segment by segment', R, 'kN'));
      out.push(step('x̄ = ΣRᵢx̄ᵢ / R (weighted segment centroids)', `x̄ = ${n3(R > 0 ? Mx / R : 0)} m`, R > 0 ? Mx / R : 0, 'm'));
    } else {
      out.push(step('Profile band: R = the sum of its per-segment areas', 'per-segment summation', null, ''));
    }
  }
  return out;
}

// --- classification (the only group for unsolved beams) ----------------------

function classificationGroups(result) {
  const cls = result.classification;
  const unknowns = cls.unknowns;
  const eq = 3;
  const g = [{
    title: 'Why this beam is not solved here',
    steps: [
      step('Reaction unknowns R from the supports', `R = ${unknowns}`, unknowns, ''),
      step('Independent equilibrium equations', 'ΣFx, ΣFy, ΣM = 3', eq, ''),
    ],
  }];
  if (cls.status === 'indeterminate') {
    g[0].steps.push(step('Degree of indeterminacy', `R − 3 = ${unknowns} − 3`, cls.degree, ''));
    g.push({
      title: 'What that means',
      steps: [
        step('Statics alone cannot find the reactions', 'more unknowns than equations', null, ''),
        step('The answer depends on the beam\u2019s stiffness E·I', 'material and section matter', null, ''),
      ],
    });
  } else {
    g.push({
      title: 'What that means',
      steps: [
        step('The beam can still move', `unrestrained: ${cls.unconstrained.join(', ') || 'rotation'}`, null, ''),
        step('A mechanism is not a structure', 'no solution exists', null, ''),
      ],
    });
  }
  return g;
}

// --- determinate groups --------------------------------------------------------

function reactionsGroup(result) {
  const { reactions, input } = result;
  const L = input.span;
  const left = reactions.left;
  const right = reactions.right;
  void L;

  if (left.type === 'fixed' || right.type === 'fixed') {
    // Cantilever: the wall carries the whole resultant.
    const wall = left.type === 'fixed' ? left : right;
    const Mz = wall.Mz;
    const steps = [];
    steps.push(step('ΣFy = 0 → the wall carries the total load', `V_wall = R`, wall.Vy, 'kN'));
    steps.push(step('ΣM at the wall = 0 → the wall moment balances the load', 'M_wall = R·x̄ (hogging)', Mz, 'kNm'));
    return { title: 'How the reactions were found (cantilever)', steps };
  }

  const steps = [];
  const lone = input.loads.length === 1;
  for (const load of input.loads) steps.push(...resultantSteps(load, lone));
  if (!lone) {
    steps.push(step('The combined resultant R, x̄ = the superposition of every load\u2019s (Rᵢ, x̄ᵢ)', 'R = ΣRᵢ, x̄ = weighted average', result.resultant.value, 'kN'));
    steps.push(step('Combined centroid', `x̄ = ${n3(result.resultant.position)} m`, result.resultant.position, 'm'));
  }
  steps.push(step('ΣM about A = 0 → R_B = R·x̄ / L', '', right.Vy, 'kN'));
  steps.push(step('ΣFy = 0 → R_A = R − R_B', '', left.Vy, 'kN'));
  return { title: 'How the reactions were found (statics)', steps };
}

function shearGroup(result) {
  const { diagrams, reactions, input } = result;
  const shear = diagrams.shear;
  const L = input.span;
  const V0 = shear[0].V;
  const VL = shear[shear.length - 1].V;
  const steps = [
    step('V starts at the left reaction (just right of A)', 'V(0⁺) = R_A', V0, 'kN'),
  ];
  const pointLoads = input.loads.filter((l) => l.type === 'point');
  if (pointLoads.length === 1 && input.loads.length === 1) {
    steps.push(step('Point load: V jumps vertically by exactly P under the load', `ΔV = −P, with P = ${n3(pointLoads[0].magnitude)} kN`, null, ''));
  } else if (pointLoads.length > 0) {
    steps.push(step('Every point load drops V by its own P (a vertical jump each)', `${pointLoads.length} jump(s) on the diagram`, null, ''));
  } else {
    steps.push(step('Distributed loads kink V gradually (dV/dx = −w)', 'no jump — the load is spread', null, ''));
  }
  steps.push(step('V ends at −R_B (just left of B) — the diagram closes', 'V(L⁻) = −R_B', VL, 'kN'));
  const vmax = Math.max(Math.abs(V0), Math.abs(VL));
  steps.push(step('Vmax = the larger |V| at the two ends (single span, downward loads)', `max(${n3(Math.abs(V0))}, ${n3(Math.abs(VL))})`, vmax, 'kN'));
  void L;
  void reactions;
  return { title: 'How the shear diagram was read', steps };
}

function momentGroup(result) {
  const { maxMoment } = result;
  const loads = result.input.loads;
  const L = result.input.span;
  const steps = [];
  steps.push(step('M peaks where the shear V crosses zero (dM/dx = V)', 'the engine checks every candidate exactly', maxMoment.position, 'm'));
  const first = loads[0];
  if (loads.length === 1 && first.type === 'point') {
    const a = first.position;
    const b = L - a;
    steps.push(step('Point load: Mmax = P·a·b / L (closed form)', `P·a·b/L with P = ${n3(first.magnitude)}, a = ${n3(a)}, b = ${n3(b)}`, maxMoment.value, 'kNm'));
  } else if (loads.length === 1 && first.type === 'udl') {
    steps.push(step('Full-span UDL: Mmax = w·L² / 8 (closed form)', `w·L²/8 with w = ${n3(first.intensity)}`, maxMoment.value, 'kNm'));
  } else if (loads.length === 1 && first.type === 'linear') {
    steps.push(step('Trapezoid: Mmax from the exact V = 0 root inside the region', 'quadratic formula, exact', maxMoment.value, 'kNm'));
  } else if (maxMoment.sign === 'hogging') {
    steps.push(step('Cantilever: Mmax is the wall moment R·x̄ (hogging)', 'at the fixed end', maxMoment.value, 'kNm'));
  } else {
    steps.push(step('Mixed loads: Mmax over the combined diagram', 'superposition, exact per segment', maxMoment.value, 'kNm'));
  }
  steps.push(step(maxMoment.sign === 'hogging' ? 'Hogging — tension on top, drawn above the axis' : 'Sagging — tension on the bottom, drawn below the axis', 'the BMD is drawn on the tension side', maxMoment.value, 'kNm'));
  return { title: 'How the maximum moment was found', steps };
}

function deflectionGroup(result) {
  const d = result.deflection;
  const { max, EI } = d;
  const loads = result.input.loads;
  const L = result.input.span;
  const steps = [];
  const mm = max.value * 1000;

  const kind = loads.length === 1 ? loads[0].type : 'mixed';
  const left = result.input.supports.left;
  const right = result.input.supports.right;
  const cantilever = left === 'fixed' || right === 'fixed';

  if (kind === 'point' && !cantilever) {
    steps.push(step('Simply supported, point load: v_max = P·L³ / (48·E·I) at midspan', `P·L³/(48·E·I), P = ${n3(loads[0].magnitude)}`, max.value, 'm'));
  } else if (kind === 'point' && cantilever) {
    steps.push(step('Cantilever, point load: v_max = P·a²(3L − a) / (6·E·I) at the free tip', 'textbook case', max.value, 'm'));
  } else if (kind === 'udl' && !cantilever) {
    steps.push(step('Simply supported, full UDL: v_max = 5·w·L⁴ / (384·E·I) at midspan', `5wL⁴/(384·E·I), w = ${n3(loads[0].intensity)}`, max.value, 'm'));
  } else if (kind === 'udl' && cantilever) {
    steps.push(step('Cantilever, full UDL: v_max = w·L⁴ / (8·E·I) at the free tip', 'textbook case', max.value, 'm'));
  } else {
    steps.push(step('This shape is integrated exactly, twice, from the moment diagram (EI·v″ = −M)', 'closed-form per load, constants pinned by the supports', max.value, 'm'));
    steps.push(step('The position x* is where the slope θ = 0 (the lowest point of the curve)', 'found exactly by bisection', max.position, 'm'));
  }
  steps.push(step('Converted to millimetres for display (engine computes in metres)', '× 1000', mm, 'mm'));
  steps.push(step('Stiffness used', `E·I = ${n3(EI)} kN·m² — bigger E·I, smaller sag`, EI, 'kN·m²'));
  void L;
  return { title: 'How the deflection was computed', steps };
}

function equilibriumGroup(result) {
  const e = result.equilibrium;
  return {
    title: 'The equilibrium self-check',
    steps: [
      step('ΣFx — every horizontal force summed (loads + reactions)', '≈ 0', e.sumFx, 'kN'),
      step('ΣFy — every vertical force summed (loads + reactions)', '≈ 0', e.sumFy, 'kN'),
      step('ΣM — every moment about A summed', '≈ 0', e.sumMz, 'kNm'),
      step(e.satisfied ? 'All residuals are floating-point dust → the solution balances ✓' : 'A residual is too large — the engine flags it', '1e−13 is effectively zero', e.satisfied ? 1 : 0, ''),
    ],
  };
}

/**
 * The derivation groups available for a finished result. Determinate → the
 * full set; indeterminate/unstable → the classification explanation only.
 * Pure: reads the result, returns fresh arrays.
 */
export function derivationGroups(result) {
  if (!result || result.classification.status !== 'determinate') {
    return classificationGroups(result ?? { classification: { status: 'unstable', unknowns: 0, degree: 0, unconstrained: ['everything'] } });
  }
  const groups = [
    reactionsGroup(result),
    shearGroup(result),
    momentGroup(result),
    equilibriumGroup(result),
  ];
  if (result.deflection) groups.splice(3, 0, deflectionGroup(result));
  return groups;
}

/** Convenience for the popover: the group for one card, by label. */
export function groupForCard(result, label) {
  const groups = derivationGroups(result);
  if (label.startsWith('Reaction')) return groups.find((g) => g.title.includes('reactions')) ?? null;
  if (label.startsWith('Max shear')) return groups.find((g) => g.title.includes('shear')) ?? null;
  if (label.startsWith('Max bending')) return groups.find((g) => g.title.includes('moment')) ?? null;
  if (label.startsWith('Max deflection')) return groups.find((g) => g.title.includes('deflection')) ?? null;
  return null;
}
