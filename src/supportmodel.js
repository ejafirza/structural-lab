/**
 * supportmodel.js — Support catalog & determinacy classification (Milestone 3)
 * ---------------------------------------------------------------------------
 * Pure data + pure classification. No I/O, no DOM, no AI.
 *
 * The catalog records, for each of the four 2D support types used in this
 * milestone, the set of reaction components it can develop and which
 * rigid-body motions it restrains. `classifySupports` then reduces the
 * pair of end supports to a single structural verdict:
 *
 *     unknowns (R)  vs  3 plane-statics equations (ΣFx, ΣFy, ΣM)
 *       R < 3  →  unstable (mechanism: a rigid-body motion is unconstrained)
 *       R = 3  →  determinate (solvable by statics alone)
 *       R > 3  →  indeterminate (R − 3 redundant reactions)
 *
 * For the four support types this rule is exhaustive: the only R = 3
 * combinations (pin+roller, fixed+free) are genuinely stable, and every
 * R < 3 combination is genuinely a mechanism. `unconstrainedMotions` names
 * the free motion(s) so the UI can explain *why* a case is unstable.
 */

/** @typedef {'pin'|'roller'|'fixed'|'free'} SupportType */

/**
 * Catalog of support types.
 *   unknowns           — number of independent reaction components.
 *   components         — reaction-component keys emitted by the solvers.
 *   resistsX/Y/Rotation — which rigid-body motions the support restrains.
 */
export const SUPPORTS = {
  pin: {
    name: 'Pinned (hinge)',
    unknowns: 2,
    components: ['Hx', 'Vy'],
    resistsX: true,
    resistsY: true,
    resistsRotation: false,
  },
  roller: {
    name: 'Roller',
    unknowns: 1,
    components: ['Vy'],
    resistsX: false,
    resistsY: true,
    resistsRotation: false,
  },
  fixed: {
    name: 'Fixed (encastré)',
    unknowns: 3,
    components: ['Hx', 'Vy', 'Mz'],
    resistsX: true,
    resistsY: true,
    resistsRotation: true,
  },
  free: {
    name: 'Free',
    unknowns: 0,
    components: [],
    resistsX: false,
    resistsY: false,
    resistsRotation: false,
  },
};

/** Valid support-type keys, in catalog order (used to populate UI selectors). */
export const SUPPORT_TYPES = Object.keys(SUPPORTS);

const EQUILIBRIUM_EQUATIONS = 3;

/** Assert a support key is known. Throws TypeError otherwise. */
function requireSupport(key) {
  if (!SUPPORTS[key]) {
    throw new TypeError(
      `unknown support type "${key}" — expected one of ${SUPPORT_TYPES.join(', ')}`
    );
  }
  return SUPPORTS[key];
}

/**
 * Name the rigid-body motions left unconstrained by a support pair.
 * @returns {string[]} e.g. ['horizontal translation'], ['rotation'], …
 */
export function unconstrainedMotions(left, right) {
  const supports = [left, right].filter((k) => k !== 'free');
  const motions = [];

  if (!supports.some((k) => SUPPORTS[k].resistsX)) motions.push('horizontal translation');
  if (!supports.some((k) => SUPPORTS[k].resistsY)) motions.push('vertical translation');

  // Rotation is restrained by a fixed support, or by two separate supports that
  // each restrain a translation (the couple they can form resists rotation).
  const restrainTranslation = supports.filter(
    (k) => SUPPORTS[k].resistsX || SUPPORTS[k].resistsY
  );
  const rotationRestrained =
    supports.some((k) => SUPPORTS[k].resistsRotation) || restrainTranslation.length >= 2;
  if (!rotationRestrained) motions.push('rotation');

  return motions;
}

/**
 * Classify a beam supported at its two ends.
 *
 * @param {SupportType} left  support at A (x = 0)
 * @param {SupportType} right support at B (x = L)
 * @returns {{
 *   status: 'determinate'|'indeterminate'|'unstable',
 *   degree: number,          // 0 unless indeterminate (then R − 3)
 *   unknowns: number,        // total reaction components
 *   note: string,            // human-readable explanation
 *   unconstrained: string[]  // free motions when unstable
 * }}
 */
export function classifySupports(left, right) {
  const L = requireSupport(left);
  const R = requireSupport(right);
  const unknowns = L.unknowns + R.unknowns;

  if (unknowns < EQUILIBRIUM_EQUATIONS) {
    const unconstrained = unconstrainedMotions(left, right);
    return {
      status: 'unstable',
      degree: 0,
      unknowns,
      note:
        `Only ${unknowns} reaction unknown(s) against ${EQUILIBRIUM_EQUATIONS} ` +
        `equilibrium equations — the beam is a mechanism (not fully restrained).`,
      unconstrained,
    };
  }

  if (unknowns === EQUILIBRIUM_EQUATIONS) {
    return {
      status: 'determinate',
      degree: 0,
      unknowns,
      note:
        `${unknowns} reaction unknowns equal ${EQUILIBRIUM_EQUATIONS} equilibrium ` +
        `equations — solvable by statics alone.`,
      unconstrained: [],
    };
  }

  const degree = unknowns - EQUILIBRIUM_EQUATIONS;
  return {
    status: 'indeterminate',
    degree,
    unknowns,
    note:
      `${unknowns} reaction unknowns against ${EQUILIBRIUM_EQUATIONS} equations — ` +
      `${degree} redundant (statically indeterminate). Solving needs the ` +
      `compatibility / force method (deflection), which is beyond this tool.`,
    unconstrained: [],
  };
}
