/**
 * explain.js — readable worked explanations over a FINISHED engine result.
 * The interface formats these steps; it never solves the beam again. Values
 * shown as answers come directly from `analyzeBeam` (apart from the explicit
 * metres-to-millimetres display conversion for deflection).
 */

const n3 = (value) => String(Number(value.toPrecision(3)));
const resultStep = (title, explanation, equation, substitution, value, unit, final = false) => ({
  title, explanation, equation, substitution, value, unit, final,
});
const group = (title, intro, given, steps) => ({ title, intro, given, steps });

function inputSummary(result) {
  const { input } = result;
  const loads = input.loads.map((load, index) => {
    if (load.type === 'point') return `${index + 1}: P = ${n3(load.magnitude)} kN at x = ${n3(load.position)} m`;
    if (load.type === 'udl') return `${index + 1}: w = ${n3(load.intensity)} kN/m over 0–${n3(input.span)} m`;
    if (load.type === 'linear') return `${index + 1}: w = ${n3(load.wStart)} to ${n3(load.wEnd)} kN/m over x = ${n3(load.start)}–${n3(load.end)} m`;
    const points = load.points.map((point) => `(${n3(point.x)} m, ${n3(point.w)} kN/m)`);
    return `${index + 1}: profile points (x, w) = ${points.join('; ')}`;
  });
  return [`Span L = ${n3(input.span)} m`, `Support A: ${input.supports.left}`, `Support B: ${input.supports.right}`, ...loads];
}

function givenInputs(result) {
  const { loads, supports } = result.input;
  const cantilever = supports.left === 'fixed' || supports.right === 'fixed';
  const needsExplicitInputs = loads.length > 1
    || loads.some((load) => load.type === 'linear' || load.type === 'profile')
    || cantilever
    || (loads[0]?.type === 'point'
      && Math.abs(loads[0].position - result.input.span / 2) > 1e-9);
  return needsExplicitInputs ? inputSummary(result) : [];
}

function isFullSpanUniform(load, span) {
  return load?.type === 'udl'
    || (load?.type === 'linear'
      && load.start === 0
      && load.end === span
      && load.wStart === load.wEnd);
}

function uniformIntensity(load) {
  return load.type === 'udl' ? load.intensity : load.wStart;
}

function cantileverSupports(supports) {
  return supports.left === 'fixed' || supports.right === 'fixed';
}

function pointLoadDistanceFromFixedEnd(load, supports, span) {
  return supports.left === 'fixed' ? load.position : span - load.position;
}

function substitutionStep(substitution) {
  return resultStep(
    'Substitute the given values',
    'Insert the beam’s stated values into the case equation.',
    '', substitution, null, '', false,
  );
}

function momentSignStep(maxMoment) {
  return resultStep(
    'Read the moment sign',
    maxMoment.sign === 'hogging'
      ? 'Hogging is drawn above the axis; the beam’s top face is in tension.'
      : 'Sagging is drawn below the axis; the beam’s bottom face is in tension.',
    '', '', null, '', false,
  );
}

function engineMomentResult(result) {
  return resultStep(
    'Report the engine result',
    'This is the maximum moment reported by the analysis.',
    'Mmax', `Sign: ${result.maxMoment.sign}; position x = ${n3(result.maxMoment.position)} m`,
    result.maxMoment.value, 'kNm', true,
  );
}

function engineDeflectionStep(max) {
  return resultStep(
    'Report the engine result',
    'Deflection is down-positive in this lab; the drawing is enlarged and gives the true value in its note.',
    'Maximum deflection in millimetres',
    `Engine maximum = ${n3(max.value)} m × 1000 mm/m; position x = ${n3(max.position)} m`,
    max.value * 1000, 'mm', true,
  );
}

function deflectionMethod(load, input, EI) {
  const { span, supports } = input;
  const cantilever = cantileverSupports(supports);
  if (load?.type === 'point' && !cantilever && Math.abs(load.position - span / 2) < 1e-9) {
    return {
      formula: 'vmax = P·L³ / (48·E·I)',
      explanation: 'Simply supported beam with a point load at midspan.',
      substitution: `vmax = ${n3(load.magnitude)} × ${n3(span)}³ / (48 × ${n3(EI)}) m`,
    };
  }
  if (load?.type === 'point' && cantilever) {
    const distance = pointLoadDistanceFromFixedEnd(load, supports, span);
    return {
      formula: 'vtip = P·d²·(3L − d) / (6·E·I)',
      explanation: 'For a cantilever with a point load, the greatest deflection is at the free tip; d is measured from the fixed end.',
      substitution: `vtip = ${n3(load.magnitude)} × ${n3(distance)}² × (3 × ${n3(span)} − ${n3(distance)}) / (6 × ${n3(EI)}) m`,
    };
  }
  if (isFullSpanUniform(load, span)) {
    return {
      formula: cantilever ? 'vtip = w·L⁴ / (8·E·I)' : 'vmax = 5·w·L⁴ / (384·E·I)',
      explanation: cantilever
        ? 'Cantilever with a uniform load over the span.'
        : 'Simply supported beam with a uniform load over the full span.',
      substitution: cantilever
        ? `vtip = ${n3(uniformIntensity(load))} × ${n3(span)}⁴ / (8 × ${n3(EI)}) m`
        : `vmax = 5 × ${n3(uniformIntensity(load))} × ${n3(span)}⁴ / (384 × ${n3(EI)}) m`,
    };
  }
  return {
    formula: 'E·I·v″(x) = −M(x)',
    explanation: 'The engine integrates the exact moment function twice and applies the support conditions. The greatest deflection is where the slope θ(x*) = 0; the engine locates that point from the integrated curve.',
    substitution: '',
  };
}

function classificationGroups(result) {
  if (!result?.classification) {
    return [group('Explanation unavailable', 'A solved beam result is not available yet.', [], [])];
  }
  const cls = result.classification;
  const steps = [resultStep(
    'Count the support reactions',
    'Each restrained motion contributes one unknown reaction.',
    'R = reaction unknowns', `R = ${cls.unknowns}`, cls.unknowns, 'unknowns',
  ), resultStep(
    'Compare with the three statics equations',
    'A planar beam has horizontal-force, vertical-force, and moment equilibrium.',
    'ΣFx = 0,  ΣFy = 0,  ΣM = 0', '3 independent equations', 3, 'equations',
  )];
  if (cls.status === 'indeterminate') {
    steps.push(resultStep(
      'There are more unknowns than equations',
      'Statics alone cannot determine every reaction. Material and section stiffness would also be needed.',
      'Degree = R − 3', `${cls.unknowns} − 3`, cls.degree, 'degree', true,
    ));
    return [group('Why this beam is not solved here', 'The support arrangement is statically indeterminate.', inputSummary(result), steps)];
  }
  steps.push(resultStep(
    'The support arrangement leaves motion free',
    `Unrestrained motion: ${cls.unconstrained.join(', ') || 'rotation'}. This arrangement is a mechanism, not a stable beam model.`,
    '', '', null, '', true,
  ));
  return [group('Why this beam is not solved here', 'The support arrangement is unstable.', inputSummary(result), steps)];
}

function reactionsGroup(result, label = 'Reaction VA') {
  const side = label.endsWith('B') ? 'right' : 'left';
  const letter = side === 'left' ? 'A' : 'B';
  const component = label.slice('Reaction '.length, -1);
  const support = result.reactions[side];
  const value = support?.[{ H: 'Hx', V: 'Vy', M: 'Mz' }[component]];
  const unit = component === 'M' ? 'kNm' : 'kN';
  const { input } = result;
  const only = input.loads.length === 1 ? input.loads[0] : null;
  const simpleCase = only?.type === 'point' || isFullSpanUniform(only, input.span);
  const steps = [];

  if (component === 'H') {
    steps.push(resultStep(
      'Balance horizontal forces',
      'The model contains vertical loads only, so no horizontal reaction is required.',
      'ΣFx = 0  →  H' + letter + ' = 0', 'No horizontal applied load', value, unit, true,
    ));
  } else if (support.type === 'fixed' && component === 'V') {
    const point = only?.type === 'point';
    const uniform = isFullSpanUniform(only, input.span);
    const equation = point ? 'ΣFy = 0  →  Vwall = P' : uniform ? 'ΣFy = 0  →  Vwall = w·L' : 'ΣFy = 0  →  Vwall = R';
    steps.push(resultStep(
      'Balance vertical forces',
      'The fixed end carries the beam’s total downward load.',
      equation, '', null, '', false,
    ));
    if (simpleCase) {
      const substitution = point
        ? `Vwall = ${n3(only.magnitude)} kN`
        : `Vwall = ${n3(uniformIntensity(only))} × ${n3(input.span)} kN`;
      steps.push(substitutionStep(substitution));
    }
  } else if (support.type === 'fixed' && component === 'M') {
    const point = only?.type === 'point';
    const uniform = isFullSpanUniform(only, input.span);
    const equation = point ? 'ΣMwall = 0  →  Mwall = P·d'
      : uniform ? 'ΣMwall = 0  →  Mwall = w·L² / 2' : 'ΣMwall = 0';
    const substitution = point
      ? `M${letter} = ${n3(only.magnitude)} × ${n3(pointLoadDistanceFromFixedEnd(only, input.supports, input.span))} kNm`
      : uniform ? `M${letter} = ${n3(uniformIntensity(only))} × ${n3(input.span)}² / 2 kNm` : `Engine support moment M${letter} = ${n3(value)} kNm`;
    if (point || uniform) {
      steps.push(resultStep(
        'Balance moments at the fixed end',
        'The fixed-end reaction moment balances the total applied moment about the wall.',
        equation, '', null, '', false,
      ));
      steps.push(substitutionStep(substitution));
      steps.push(resultStep('Report the engine result', 'This support moment is reported by the analysis.', `M${letter}`, substitution, value, unit, true));
    } else {
      steps.push(resultStep(
        'Balance moments at the fixed end',
        'The fixed-end reaction moment balances the total applied moment about the wall.',
        equation, substitution, value, unit, true,
      ));
    }
  } else if (component === 'V' && side === 'right') {
    const point = only?.type === 'point';
    const uniform = isFullSpanUniform(only, input.span);
    const equation = point ? 'ΣMA = 0  →  RB = P·a / L'
      : uniform ? 'ΣMA = 0  →  RB = w·L / 2' : 'ΣMA = 0  →  RB = R·x̄ / L';
    steps.push(resultStep(
      'Take moments about A',
      'The support reaction at B balances the moment of the combined load resultant about A.',
      equation, '', null, '', false,
    ));
    if (point) {
      steps.push(substitutionStep(`RB = ${n3(only.magnitude)} × ${n3(only.position)} / ${n3(input.span)} kN`));
    } else if (uniform) {
      steps.push(substitutionStep(`RB = ${n3(uniformIntensity(only))} × ${n3(input.span)} / 2 kN`));
    }
  } else {
    const point = only?.type === 'point';
    const uniform = isFullSpanUniform(only, input.span);
    const b = input.b ?? input.span - (only?.position ?? 0);
    const equation = point ? 'ΣMA = 0  →  RA = P·b / L'
      : uniform ? 'ΣMA = 0  →  RA = w·L / 2' : 'ΣFy = 0  →  RA = R − RB';
    steps.push(resultStep(
      'Balance moments about A, then vertical forces',
      'The left reaction balances the total downward load and the right support reaction.',
      equation, '', null, '', false,
    ));
    if (point) {
      steps.push(substitutionStep(`RA = ${n3(only.magnitude)} × ${n3(b)} / ${n3(input.span)} kN`));
    } else if (uniform) {
      steps.push(substitutionStep(`RA = ${n3(uniformIntensity(only))} × ${n3(input.span)} / 2 kN`));
    }
  }

  if (component !== 'H') {
    steps.push(resultStep(
      'Report the engine result',
      'This reaction is reported by the analysis; the explanation does not solve the beam again.',
      `${component}${letter}`,
      `${component}${letter} = ${n3(value)} ${unit}`,
      value, unit, true,
    ));
  }
  return group(`How reaction ${component}${letter} was found`, `The answer is the ${component === 'M' ? 'support moment' : `${component === 'H' ? 'horizontal' : 'vertical'} reaction`} at ${letter}.`, givenInputs(result), steps);
}

function shearGroup(result) {
  const shear = result.diagrams.shear;
  const start = shear[0].V;
  const end = shear[shear.length - 1].V;
  const hasPoints = result.input.loads.some((load) => load.type === 'point');
  const leftSupport = result.reactions.left;
  const rightSupport = result.reactions.right;
  const behavior = hasPoints
    ? 'Each point load creates a downward jump in shear equal to its load.'
    : 'Distributed load changes shear continuously; its slope is −w.';
  const leftExplanation = leftSupport.type === 'free'
    ? 'The one-sided value is read from the solved diagram; the left end has no support reaction.'
    : 'Immediately to the right of the left support, shear equals its vertical reaction.';
  const rightExplanation = rightSupport.type === 'free'
    ? 'Read the one-sided shear value from the solved diagram; the right end has no support reaction.'
    : 'Immediately to the left of the right support, shear balances its vertical reaction.';
  return group('How to read the shear diagram', 'Shear tracks the internal vertical force along the beam.', givenInputs(result), [
    resultStep('Read the left end', leftExplanation, 'V(0⁺)', '', start, 'kN'),
    resultStep('Follow the applied loads', behavior, hasPoints ? 'ΔV = −P' : 'dV/dx = −w', '', null, ''),
    resultStep('Read the right end', rightExplanation, 'V(L⁻)', '', end, 'kN', true),
  ]);
}

function momentGroup(result) {
  const { input, maxMoment } = result;
  const loads = input.loads;
  const only = loads.length === 1 ? loads[0] : null;
  const fixedSide = input.supports.left === 'fixed' ? 'left' : input.supports.right === 'fixed' ? 'right' : null;
  const steps = [];
  let intro = 'The maximum is taken from the engine’s bending-moment solution.';
  if (fixedSide) {
    if (only?.type === 'point') {
      const distance = pointLoadDistanceFromFixedEnd(only, input.supports, input.span);
      steps.push(resultStep(
        'Use the cantilever point-load moment equation',
        'The largest bending-moment magnitude occurs at the fixed end; d is measured from that wall.',
        'Mmax = P·d', '', null, '', false,
      ));
      steps.push(substitutionStep(`Mmax = ${n3(only.magnitude)} × ${n3(distance)} kNm`));
    } else if (isFullSpanUniform(only, input.span)) {
      const intensity = uniformIntensity(only);
      steps.push(resultStep(
        'Use the cantilever full-span uniform-load equation',
        'The largest bending-moment magnitude occurs at the fixed end.',
        'Mmax = w·L² / 2', '', null, '', false,
      ));
      steps.push(substitutionStep(`Mmax = ${n3(intensity)} × ${n3(input.span)}² / 2 kNm`));
    } else {
      steps.push(resultStep(
        'For a cantilever, check the fixed wall',
        'The largest bending-moment magnitude occurs at the fixed end.',
        'Mmax = |Mwall|', '', null, '', false,
      ));
    }
    intro = 'A cantilever’s peak moment is at its fixed wall.';
  } else {
    if (only?.type === 'point') {
      const b = input.b ?? input.span - only.position;
      steps.push(resultStep(
        'Use the point-load bending-moment equation',
        'For a simply supported beam, the peak is directly under the point load.',
        'Mmax = P·a·b / L', '', null, '', false,
      ));
      steps.push(substitutionStep(`Mmax = ${n3(only.magnitude)} × ${n3(only.position)} × ${n3(b)} / ${n3(input.span)} kNm`));
      intro = 'This is the peak moment for the point load shown on the beam.';
    } else if (isFullSpanUniform(only, input.span)) {
      const intensity = uniformIntensity(only);
      steps.push(resultStep(
        'Use the full-span uniform-load equation',
        'The peak is at midspan for a simply supported beam with a full-span uniform load.',
        'Mmax = w·L² / 8', '', null, '', false,
      ));
      steps.push(substitutionStep(`Mmax = ${n3(intensity)} × ${n3(input.span)}² / 8 kNm`));
      intro = 'This is the peak moment for the uniform load shown on the beam.';
    } else {
      steps.push(resultStep(
        'Check peak candidates',
        'Because dM/dx = V, an interior peak can occur where V(x*) = 0. The engine checks exact roots within each load segment and also checks load-event boundaries.',
        'Candidates: V(x*) = 0 or a load-event boundary', '', null, '', false,
      ));
      intro = 'The peak for this load shape comes from the combined bending-moment diagram.';
    }
  }
  steps.push(momentSignStep(maxMoment));
  steps.push(engineMomentResult(result));
  return group('How the maximum bending moment was found', intro, givenInputs(result), steps);
}

function deflectionGroup(result) {
  const { input, deflection } = result;
  const { max, EI } = deflection;
  const only = input.loads.length === 1 ? input.loads[0] : null;
  const method = deflectionMethod(only, input, EI);
  const steps = [resultStep('Choose the beam case', method.explanation, method.formula, '', null, '')];
  if (method.substitution) steps.push(substitutionStep(method.substitution));
  steps.push(engineDeflectionStep(max));
  const given = method.substitution ? givenInputs(result) : inputSummary(result);
  if (!method.substitution) given.push(`E·I = ${n3(EI)} kN·m²`);
  return group('How the maximum deflection was found', 'This explanation uses the stiffness shown for the beam.', given, steps);
}

function equilibriumGroup(result) {
  const e = result.equilibrium;
  return group('Equilibrium check', 'The engine adds the applied forces and support reactions. Each residual should be zero; tiny rounding residuals are effectively zero.', givenInputs(result), [
    resultStep('Horizontal forces', 'Sum of horizontal loads and reactions.', 'ΣFx', '', e.sumFx, 'kN'),
    resultStep('Vertical forces', 'Sum of vertical loads and reactions.', 'ΣFy', '', e.sumFy, 'kN'),
    resultStep('Moments about A', 'Sum of moments about the left end.', 'ΣMA', '', e.sumMz, 'kNm', true),
  ]);
}

export function derivationGroups(result) {
  if (!result || result.classification.status !== 'determinate') return classificationGroups(result);
  const reactionLabels = [];
  for (const [side, letter] of [['left', 'A'], ['right', 'B']]) {
    const reaction = result.reactions[side];
    for (const key of ['Hx', 'Vy', 'Mz']) if (reaction?.[key] != null) reactionLabels.push(`Reaction ${{ Hx: 'H', Vy: 'V', Mz: 'M' }[key]}${letter}`);
  }
  return [
    ...reactionLabels.map((label) => reactionsGroup(result, label)),
    shearGroup(result),
    momentGroup(result),
    deflectionGroup(result),
    equilibriumGroup(result),
  ];
}

export function groupForCard(result, label) {
  if (!result || result.classification.status !== 'determinate') return classificationGroups(result)[0] ?? null;
  if (label === 'Equilibrium') return equilibriumGroup(result);
  if (label.startsWith('Reaction')) return reactionsGroup(result, label);
  if (label.startsWith('Max shear')) return shearGroup(result);
  if (label.startsWith('Max bending')) return momentGroup(result);
  if (label.startsWith('Max deflection')) return deflectionGroup(result);
  return null;
}
