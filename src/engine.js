/**
 * Structural Lab — Engineering Core (Milestone 1)
 * ------------------------------------------------
 * Deterministic solver: simply supported beam (pin at A, roller at B)
 * with a single downward point load P at distance `a` from the left support.
 *
 * This module is PURE: numbers in → plain object out. No I/O, no DOM,
 * no network, no AI. The future AI/tutor layer must consume this module's
 * output; it must never replace it.
 *
 * Sign conventions (standard structural analysis convention):
 *   - Loads: downward positive magnitude P (input is a magnitude, not a vector).
 *   - Shear V(x): sum of upward forces to the LEFT of the section.
 *     Just left of the load: V = +RA. Just right of the load: V = RA − P (= −RB).
 *     The shear diagram represents the jump with TWO points at x = a
 *     (left-limit first, then right-limit), mirroring the vertical step a
 *     textbook SFD draws under a point load. `diagrams.shearJump` exposes
 *     both one-sided values explicitly.
 *   - Bending moment M(x): sagging (tension on the bottom fibre) is POSITIVE.
 *     For a point load the BMD is triangular: M(x) = RA·x for x ≤ a
 *     (linear), M(x) = RB·(L − x) for x ≥ a (linear), peak Mmax at x = a.
 */

/** Tolerance for floating-point comparisons and equilibrium checks. */
const EPS = 1e-9;

/**
 * Solve the simply supported beam with one downward point load.
 *
 * @param {object} input
 * @param {number} input.span   L — beam span, in metres. Must be > 0.
 * @param {number} input.load   P — downward point-load magnitude, in kN. Must be > 0.
 * @param {number} input.position a — distance from the LEFT support to the load, in metres.
 *                              Must satisfy 0 < a < L (strictly interior, Milestone 1).
 * @param {number} [input.samples=201] number of diagram sample points across the span
 *                              (x = 0 … L inclusive). Minimum 2.
 * @returns {object} result
 * @throws {TypeError|RangeError} on invalid input
 */
export function solveSimplySupportedPointLoad(input) {
  const { span, load, position } = input ?? {};
  const samples = input?.samples ?? 201;

  if (typeof span !== 'number' || !Number.isFinite(span)) {
    throw new TypeError('span must be a finite number');
  }
  if (typeof load !== 'number' || !Number.isFinite(load)) {
    throw new TypeError('load must be a finite number');
  }
  if (typeof position !== 'number' || !Number.isFinite(position)) {
    throw new TypeError('position must be a finite number');
  }
  if (span <= 0) {
    throw new RangeError('span must be > 0');
  }
  if (load <= 0) {
    throw new RangeError('load must be > 0 (downward magnitude)');
  }
  if (position <= 0 || position >= span) {
    throw new RangeError(
      `position must be strictly inside the span (0 < a < L); got a=${position}, L=${span}`
    );
  }
  if (!Number.isInteger(samples) || samples < 2) {
    throw new RangeError('samples must be an integer >= 2');
  }

  const L = span;
  const P = load;
  const a = position;
  const b = L - a;

  // --- Statics: support reactions from equilibrium -----------------------
  // ΣM about A = 0:  RB·L − P·a = 0        → RB = P·a / L
  // ΣFy     = 0:      RA + RB − P = 0      → RA = P − RB = P·b / L
  const RA = (P * b) / L;
  const RB = (P * a) / L;

  // --- Internal forces -----------------------------------------------------
  // Shear (upward-left convention): V = +RA for x < a; V = RA − P for x > a.
  // At x = a the shear is discontinuous; we emit two points there (V just
  // left = +RA, then V just right = −RB) so the plotted SFD shows the same
  // vertical step a textbook diagram draws under a concentrated load.
  // Moment: sagging positive, linear on both sides (triangular BMD).
  const shearLeft = RA;
  const shearRight = RA - P; // = −RB
  const momentAt = (x) => (x <= a ? RA * x : RB * (L - x));

  // --- Diagram sampling (uniform grid; discontinuity handled below) -------
  const samplePoints = [];
  const step = L / (samples - 1);
  for (let i = 0; i < samples; i++) {
    samplePoints.push(step * i);
  }

  // Shear series: +RA on [0, a), two points at x = a (the jump), −RB on (a, L].
  const shear = [];
  for (const x of samplePoints) {
    if (x < a) shear.push({ x, V: shearLeft });
    else if (x > a) shear.push({ x, V: shearRight });
    // x === a handled below (two-point jump)
  }
  shear.push({ x: a, V: shearLeft });  // left-limit: +RA
  shear.push({ x: a, V: shearRight }); // right-limit: −RB
  shear.sort((p, q) => p.x - q.x || p.V - q.V);

  const moment = samplePoints
    .map((x) => ({ x, M: momentAt(x) }))
    .concat([{ x: a, M: momentAt(a) }])
       .sort((p, q) => p.x - q.x || p.M - q.M);
  const shearJump = { x: a, left: shearLeft, right: shearRight, drop: P };

  // --- Maximum bending moment ----------------------------------------------
  // Analytically the sagging moment is maximal exactly under the load:
  // Mmax = RA·a = RB·b = P·a·b / L. Report both value and position.
  const Mmax = (P * a * b) / L;
  const maxMoment = { value: Mmax, position: a };

  // --- Global equilibrium verification (self-check, runs on every solve) ---
  // ΣFy = RA + RB − P must be 0; ΣM about A = RB·L − P·a must be 0.
  const sumFy = RA + RB - P;
  const sumMomentsAboutA = RB * L - P * a;
  const equilibrium = {
    sumFy,
    sumMomentsAboutA,
    satisfied: Math.abs(sumFy) <= EPS * Math.max(1, Math.abs(P)) &&
      Math.abs(sumMomentsAboutA) <= EPS * Math.max(1, Math.abs(P * L)),
  };

  return {
    kind: 'simply-supported-point-load',
    input: { span: L, load: P, position: a, b },
    reactions: { RA, RB },
    diagrams: { shear, moment, shearJump },
    maxMoment,
    equilibrium,
  };
}
