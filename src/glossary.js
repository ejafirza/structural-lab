/**
 * glossary.js — the M9 teaching dictionary (pure data, no rendering).
 * Page terms open entries from this data; related-topic links are generated
 * from each entry's subs and seeAlso relationships. This is hand-written
 * teaching content; no AI or runtime text generation is used in the teaching layer.
 *
 * Entry shape: term, body, and subs/seeAlso are the explanation and related
 * topics; `[[key|visible wording]]` inside body links a concept in context, with
 * the target key pointing back to this dictionary.
 * The current dialog can be traversed repeatedly; the UI owns its history.
 */

const D = {
  // --- supports -------------------------------------------------------------
  'supports': {
    term: 'Supports',
    body: `Supports connect the beam to the ground and stop it from moving or rotating.
Each support type resists a different set of motions, and each resisted motion
corresponds to one [[reaction|reaction force or moment]]. A pin gives 2 [[reaction|reactions]], a roller
gives 1, a fixed support gives 3, and a free end gives none. The mix of
supports at the two ends decides whether the beam can be solved by statics —
see [[determinacy|statically determinate]].`,
    subs: ['pin-support', 'roller-support', 'fixed-support', 'free-end', 'reaction'],
    seeAlso: ['determinacy'],
  },
  'pin-support': {
    term: 'Pin support',
    body: `A pin (hinge) bolts the beam to the ground about a single point: the beam can
rotate freely around the pin, but it cannot translate — not sideways, not
vertically. So a pin provides exactly 2 reaction unknowns: a
[[horizontal-reaction|horizontal reaction]] H and a
[[vertical-reaction|vertical reaction]] V.`,
    subs: ['horizontal-reaction', 'vertical-reaction'],
    seeAlso: ['roller-support', 'fixed-support', 'reaction'],
  },
  'roller-support': {
    term: 'Roller support',
    body: `A roller sits the beam on wheels (or a smooth surface): it resists movement
perpendicular to the rolling surface only, and lets the beam slide along it
and rotate. So a roller provides exactly 1 reaction unknown — a [[vertical-reaction|vertical reaction]]
(in this app all rollers sit on a horizontal surface).`,
    subs: ['vertical-reaction'],
    seeAlso: ['pin-support', 'fixed-support', 'reaction'],
  },
  'fixed-support': {
    term: 'Fixed support',
    body: `A fixed support (encastré, "built in") welds the beam to the ground: it
resists translation in both directions AND rotation. That is 3 reaction
unknowns — [[horizontal-reaction|horizontal reaction]] H, [[vertical-reaction|vertical reaction]] V, and a [[moment-reaction|reaction moment]] M. A beam with one
fixed end and one free end is a [[cantilever-note]].`,
    subs: ['horizontal-reaction', 'vertical-reaction', 'moment-reaction'],
    seeAlso: ['pin-support', 'roller-support', 'cantilever-note'],
  },
  'free-end': {
    term: 'Free end',
    body: `A free end has no support at all: it provides 0 reactions. A beam needs
enough restraint at its ends to stay put — a beam that is free at both ends
is not a structure, it is a mechanism ([[unstable]]).`,
    subs: [],
    seeAlso: ['unstable', 'supports'],
  },
  'reaction': {
    term: 'Reaction',
    body: `A reaction is the force or moment a support exerts ON the beam to balance
the loads. Reactions are not chosen — they are whatever statics requires so
that the beam stays in [[equilibrium-equations]]. In this app
reactions are computed by the engine from the [[resultant]] of the loads; you can
read exactly how on each reaction card.`,
    subs: ['vertical-reaction', 'horizontal-reaction', 'moment-reaction'],
    seeAlso: ['equilibrium-equations', 'resultant'],
  },
  'vertical-reaction': {
    term: 'Vertical reaction (V)',
    body: `The vertical reaction is the upward push a support gives the beam. It
balances the downward loads so that the total vertical force adds to zero
(ΣFᵧ = 0). In the drawings it is the green arrow at each support, labelled
V_A and V_B in [[units]] (kN).`,
    subs: [],
    seeAlso: ['reaction', 'equilibrium-equations'],
  },
  'horizontal-reaction': {
    term: 'Horizontal reaction (H)',
    body: `The horizontal reaction resists the beam sliding sideways. With only
downward, vertical loads — everything this app models — there is no horizontal
push to resist, so the pin's horizontal reaction is always H = 0 here. It
still counts as a [[reaction]] unknown when deciding [[determinacy]].`,
    subs: [],
    seeAlso: ['pin-support', 'determinacy'],
  },
  'moment-reaction': {
    term: 'Moment reaction (M)',
    body: `A moment reaction is the resisting twist a fixed support applies to stop the
beam's end from rotating. Only fixed supports provide one. The wall moment of
a [[cantilever-note]] balances the whole load trying to rotate the beam about the wall
([[hogging]]). In this 2D plane model the moment acts about the
out-of-plane axis; the 3D cousin of this idea (twist about the beam's own long
axis) is called torsion and is out of scope here.`,
    subs: ['hogging'],
    seeAlso: ['fixed-support', 'bending-moment'],
  },

  // --- determinacy ----------------------------------------------------------
  'determinacy': {
    term: 'Statically determinate',
    body: `A beam is statically determinate when its support reactions can be found
from the three equations of statics alone — no material properties needed.
The rule: count [[reaction|reaction]] unknowns R and compare with the 3
[[equilibrium-equations|equilibrium equations]] (ΣFₓ, ΣFᵧ, ΣM). R = 3 → determinate
(solvable); R > 3 → [[statically-indeterminate|indeterminate]]; R < 3 →
[[unstable|unstable]]. This app
solves only determinate beams and classifies the rest honestly.`,
    subs: ['equilibrium-equations', 'statically-indeterminate', 'unstable'],
    seeAlso: ['statically-determinate-note', 'supports'],
  },
  'statically-determinate-note': {
    term: 'Why R = 3 is solvable',
    body: `Three unknowns, three independent [[equilibrium-equations|equilibrium equations]] (ΣFₓ, ΣFᵧ, ΣMₐ about one point)
— exactly one solution, found by algebra. That is why pin + roller (2 + 1 = 3)
or a single fixed support (3 + 0) make a beam solvable by statics alone. The
engine writes these equations for you: click any [[reaction|reaction]] card to see the
working.`,
    subs: ['equilibrium-equations'],
    seeAlso: ['determinacy'],
  },
  'statically-indeterminate': {
    term: 'Statically indeterminate',
    body: `More [[reaction|reaction]] unknowns than equilibrium equations (R > 3): statics alone
cannot find the reactions — the answer depends on how much the beam bends,
i.e. on the material and the [[beam-stiffness]] E·I. A pin + pin beam (2 + 2 = 4
unknowns) is indeterminate to degree 1. This app does not solve these cases;
it classifies them and explains why, rather than inventing numbers.`,
    subs: ['determinacy', 'beam-stiffness'],
    seeAlso: ['equilibrium-equations', 'honesty'],
  },
  'unstable': {
    term: 'Unstable (mechanism)',
    body: `Fewer [[reaction|reaction]] unknowns than equilibrium equations (R < 3): the beam can
still move — it is a mechanism, not a structure. Example: roller + roller
resists no horizontal motion. The badge lists which motions are unrestrained
(horizontal translation, vertical translation, rotation).`,
    subs: ['determinacy'],
    seeAlso: ['free-end', 'supports'],
  },
  'equilibrium-equations': {
    term: 'Equilibrium equations',
    body: `A body at rest must satisfy three equations: ΣFₓ = 0 (no net horizontal
force), ΣFᵧ = 0 (no net vertical force), and ΣM = 0 (no net moment about any
point). These are the only tools statics has. With R [[reaction|reaction]] unknowns, R = 3
means exactly solvable; this is the "3 equations" rule.`,
    subs: ['reaction'],
    seeAlso: ['determinacy', 'equilibrium-check'],
  },
  'equilibrium-check': {
    term: 'Equilibrium self-check',
    body: `After solving, the engine adds up every force and moment — loads AND
[[reaction|reactions]] — and reports the residuals: ΣFₓ, ΣFᵧ and ΣM should each be zero.
The tiny numbers you see (like 1e−13) are floating-point dust, effectively
zero; ✓ means the solution balances. This badge is the engine auditing
itself — it is computed, never assumed.`,
    subs: ['equilibrium-equations'],
    seeAlso: ['reaction'],
  },

  // --- loads ----------------------------------------------------------------
  'loads': {
    term: 'Loads',
    body: `Loads are the forces the beam carries — everything trying to push, pull
or bend it. This app models downward loads only:
[[point-load]]s (one concentrated force) and
[[distributed-load]]s (force spread along a region). The
beam's [[supports]] push back with [[reaction]]s, and statics balances the two.`,
    subs: ['point-load', 'distributed-load', 'resultant'],
    seeAlso: ['reaction', 'supports'],
  },
  'point-load': {
    term: 'Point load',
    body: `A point load is one concentrated force P acting at a single position a
along the span, drawn as a downward orange arrow and measured in [[units]]
(kN). In the [[shear-force]] diagram a point load appears as a sudden vertical jump of
exactly P.`,
    subs: ['shear-force'],
    seeAlso: ['distributed-load', 'units'],
  },
  'distributed-load': {
    term: 'Distributed load',
    body: `A distributed load spreads force along a region of the beam instead of
concentrating it at one point — self-weight, flooring, snow. It is measured
as an [[intensity]] w in [[units]] (kN/m) and drawn as a band whose
height is the intensity. The total force of the band is its area, acting at
its [[centroid]] — the engine reduces every distributed load to exactly that
equivalent single force ([[resultant]]).`,
    subs: ['intensity', 'resultant', 'centroid'],
    seeAlso: ['point-load', 'profile'],
  },
  'intensity': {
    term: 'Intensity w',
    body: `The intensity w(x) is the load per metre of beam at position x, in [[units]]
(kN/m). A constant intensity is a uniform (UDL) patch; an intensity that changes
linearly from w₁ at the start to w₂ at the end makes a triangular or
trapezoidal band. On the drawing, band height is intensity.`,
    subs: [],
    seeAlso: ['distributed-load', 'units'],
  },
  'profile': {
    term: 'Profile load (shape points)',
    body: `A profile load describes one [[distributed-load]] by a list of 2–6 control
points (x, w): the [[intensity]] follows straight lines through
them. A repeated x on two rows is a vertical step — the load jumps from one
intensity to another at that position. A gap between points is a region with
no load. Stepped and snow-drift shapes are typical profiles.`,
    subs: ['intensity', 'distributed-load'],
    seeAlso: ['resultant'],
  },
  'load-presets': {
    term: 'Load presets',
    body: `The preset chips fill the [[distributed-load]] editor with a typical shape —
full UDL, partial UDL, triangle, trapezoid, stepped, snow drift. They are
starting points, not modes: after applying one you can edit every number
freely.`,
    subs: ['distributed-load', 'intensity'],
    seeAlso: ['stiffness-presets'],
  },
  'resultant': {
    term: 'Resultant R',
    body: `The resultant is the single equivalent force of the whole load group: R in
[[units]], acting at one position. For any distributed patch, R is the area
of the intensity band; for several loads, R is the sum of the individual
resultants. Its position is the load [[centroid]] x̄. The [[reaction]]s
depend only on (R, its position) — which is why the beam drawing shows the
combined R, x̄ once, with a dashed line.`,
    subs: ['centroid', 'superposition'],
    seeAlso: ['reaction'],
  },
  'centroid': {
    term: 'Centroid x̄',
    body: `The centroid x̄ is where the [[resultant]] R acts along the span — the
"centre of gravity" of the load shape. For a uniform patch it is the middle
of the region; for a triangle it sits two-thirds towards the heavy end. Move
more load towards B and x̄ moves towards B, and the [[reaction]]s follow.`,
    subs: ['resultant'],
    seeAlso: ['reaction'],
  },
  'superposition': {
    term: 'Superposition',
    body: `Because everything here is linear, the effect of several loads together is
the sum of their separate effects — reactions, shear, moment and deflection
all superpose. The engine uses this to solve mixed loads: reduce each load to
its resultant, add the resultants, solve once. (The maximum moment of the
combination is NOT the sum of the individual maxima — it happens where the
combined shear crosses zero.)`,
    subs: ['resultant'],
    seeAlso: ['maximum-moment'],
  },
  'units': {
    term: 'Units',
    body: `kN — kilonewton, a force (1000 newtons). kN/m — kilonewtons per metre,
a load intensity along the span. kN·m — kilonewton metre, a moment (force ×
lever arm). m — metres, positions and span. [[max-deflection]] is computed in metres
and shown in millimetres (mm) because real beams sag single-digit millimetres.`,
    subs: [],
    seeAlso: ['point-load', 'distributed-load', 'max-deflection'],
  },

  // --- internal forces ------------------------------------------------------
  'shear-force': {
    term: 'Shear force V(x)',
    body: `The shear force at a cut is the vertical force one side of the beam exerts
on the other — the beam "scissoring". Sign convention here: V is positive
when it tends to rotate the beam element clockwise, plotted UP on the [[sfd]].
Under a [[point-load]] V jumps vertically by exactly P; under a [[distributed-load]]
V changes gradually (its slope is −w). The area under shear gives the change
in [[bending-moment]]. Its equilibrium equations use [[equilibrium-equations]].`,
    subs: ['sfd', 'vmax'],
    seeAlso: ['bending-moment', 'point-load'],
  },
  'sfd': {
    term: 'SFD — shear force diagram',
    body: `The SFD plots V(x) along the span. Read it left to right: start at the
left [[vertical-reaction|vertical reaction]], step down at every [[point-load]], kink under
[[distributed-load]]s, and end at minus the right reaction — if the ends do
not meet, the solution does not balance. The shaded area between
the curve and the axis at a cut is the change in [[bending-moment]] up to that cut.`,
    subs: ['shear-force'],
    seeAlso: ['bmd', 'vmax'],
  },
  'vmax': {
    term: 'Vₘₐₓ — maximum shear',
    body: `Vₘₐₓ is the largest |V| anywhere on the beam. With only downward loads on
a single span, the extreme shear sits at a support (the beam ends), so Vₘₐₓ
is the larger of the two end shears. Shear governs things like web crushing
and stirrup (shear reinforcement) design.`,
    subs: ['shear-force', 'sfd'],
    seeAlso: ['reaction'],
  },
  'bending-moment': {
    term: 'Bending moment M(x)',
    body: `The bending moment at a cut is the internal couple — compression on one
face, tension on the other — that the beam develops to resist the loads on
one side of the cut. It equals the area under the [[shear-force]] curve up to that cut
(dM/dx = V). Positive ([[sagging]]) moment is drawn on the tension side,
below the axis; negative ([[hogging]]) moment is drawn above.`,
    subs: ['sagging', 'hogging', 'bmd'],
    seeAlso: ['shear-force', 'maximum-moment'],
  },
  'sagging': {
    term: 'Sagging (+)',
    body: `Sagging is positive [[bending-moment]]: the beam curves into a smile, compression on
top, tension on the bottom. Simply supported beams under downward loads
sag. On the [[bmd]], sagging is drawn below the axis — the tension side — so the
drawing always tells you which face is in tension.`,
    subs: ['bending-moment'],
    seeAlso: ['hogging', 'bmd'],
  },
  'hogging': {
    term: 'Hogging (−)',
    body: `Hogging is negative [[bending-moment]]: the beam curves into a frown, tension on top,
compression on the bottom. [[cantilever-note]] walls and continuous-beam interiors
hog. On the [[bmd]] hogging is drawn above the axis. In a cantilever the wall
[[moment-reaction]] is hogging — the whole load tries to rotate the beam into the wall.`,
    subs: ['bending-moment', 'moment-reaction'],
    seeAlso: ['sagging'],
  },
  'bmd': {
    term: 'BMD — bending moment diagram',
    body: `The BMD plots M(x) along the span, drawn on the tension side: [[sagging]]
below the axis, [[hogging]] above. The peak of the BMD is where the beam
would first crack or yield in bending, and it occurs where the [[shear-force]] crosses
zero (or at a shear jump).`,
    subs: ['bending-moment', 'maximum-moment'],
    seeAlso: ['sfd', 'sagging', 'hogging'],
  },
  'maximum-moment': {
    term: 'Mₘₐₓ — maximum moment',
    body: `Mₘₐₓ is the largest |M| on the beam, and where it happens. Between loads,
moment peaks exactly where [[shear-force]] V crosses zero (dM/dx = V). The engine checks
every candidate — load positions, region boundaries, and the V = 0 turning
points — in closed form. This peak [[bending-moment]] is often checked first in
design.`,
    subs: ['bending-moment', 'bmd'],
    seeAlso: ['superposition'],
  },

  // --- deflection -----------------------------------------------------------
  'elastic-curve': {
    term: 'Deflected shape v(x)',
    body: `The elastic curve is how the beam's centreline actually bends under the
loads — [[sagging]] bends it downward into a smile, a [[cantilever-note]] tip drops. This
panel integrates the [[bending-moment]] twice (E·I·v″ = −M in the down-positive
convention) and pins the curve to the [[supports]]. The drawing is exaggerated ([[exaggeration]]) so
you can see it; the true scale is printed on the panel.`,
    subs: ['beam-stiffness', 'exaggeration', 'max-deflection'],
    seeAlso: ['bending-moment'],
  },
  'beam-stiffness': {
    term: 'Beam stiffness E·I',
    body: `E·I is the beam's resistance to bending: E — how stiff the material is,
I — how cleverly the cross-section places its material away from the neutral
axis. [[youngs-modulus|Young's modulus]] E and [[second-moment|second moment of area]] I combine as E·I. [[max-deflection|deflection]] scales
as 1/(E·I): double the stiffness, halve the sag. E·I has [[units]] kN·m² here.
Change it and watch the curve sag more or less — the [[reaction|reactions]] and the [[sfd]]/[[bmd]]
do NOT change (statics does not know the material; deflection does).`,
    subs: ['youngs-modulus', 'second-moment'],
    seeAlso: ['statically-indeterminate', 'stiffness-presets'],
  },
  'youngs-modulus': {
    term: "E — Young's modulus",
    body: `Young's modulus measures how stiff the MATERIAL is: stress per strain.
Steel ≈ 200 GPa, concrete ≈ 30 GPa, timber ≈ 10 GPa. Same shape, stiffer
material, smaller deflection — E sits directly in the denominator of every
deflection formula.`,
    subs: [],
    seeAlso: ['beam-stiffness'],
  },
  'second-moment': {
    term: 'I — second moment of area',
    body: `The second moment of area measures how far the SECTION's material sits
from its neutral axis (units m⁴). Depth matters more than weight: I grows
with depth cubed, so a deeper beam is vastly stiffer at the same area. That
is why floor joists stand on edge, not flat.`,
    subs: [],
    seeAlso: ['beam-stiffness'],
  },
  'stiffness-presets': {
    term: 'Stiffness presets',
    body: `The E·I chips are round teaching values for typical members at this app's
scale: steel beam ≈ 1.8×10⁴, timber joist ≈ 5×10², concrete beam ≈ 1.6×10⁵
kN·m², and the default 2×10⁴. They are honest round numbers for learning,
not design catalogue sections.`,
    subs: ['beam-stiffness'],
    seeAlso: ['load-presets'],
  },
  'exaggeration': {
    term: 'Exaggeration factor',
    body: `Real beams sag millimetres over metre-long spans — drawn to true scale
the curve would be invisible. The panel auto-fits the largest deflection to a
fixed drawing height and PRINTS the factor (×N) and the true maximum in mm
next to it, so the drawing never lies about being exaggerated.`,
    subs: ['elastic-curve', 'max-deflection'],
    seeAlso: [],
  },
  'max-deflection': {
    term: 'Max deflection',
    body: `The largest sag (or rise) of the centreline, reported in [[units]] (mm) at
its position — the number a designer checks against a serviceability limit
(vibration, cracking, finishes). Downward sag counts as positive here. It
scales with load × span⁴/(E·I) for distributed loads — which is why [[beam-stiffness]]
and span matter so much.`,
    subs: ['beam-stiffness', 'elastic-curve'],
    seeAlso: ['exaggeration'],
  },

  // --- product honesty --------------------------------------------------------
  'honesty': {
    term: 'What this tool will not do',
    body: `Structural Lab is an educational tool, not a design-verification system.
It solves statically determinate single-span beams with downward loads, and
it refuses to invent answers elsewhere: indeterminate and unstable beams are
classified and explained, never given numbers. Every value comes from the
deterministic engine — there is no estimation, no fitting, no AI in the
calculation path.`,
    subs: ['statically-indeterminate', 'unstable'],
    seeAlso: ['determinacy'],
  },
  'cantilever-note': {
    term: 'Cantilever',
    body: `A cantilever is fixed at one end and free at the other — a diving board.
One fixed support provides all 3 reactions, so it is determinate. The wall
carries the whole load: vertical reaction = R, wall moment = R·x̄ (hogging),
shear and moment peak at the wall, and the deflection peaks at the free tip.`,
    subs: ['moment-reaction', 'max-deflection'],
    seeAlso: ['fixed-support', 'hogging'],
  },
};

/** A stable, ordered list of every key (tests iterate it). */
export const GLOSSARY_KEYS = Object.keys(D);

/** Look up an entry; returns null for unknown keys (no dead links in the UI). */
export function getTerm(key) {
  return Object.prototype.hasOwnProperty.call(D, key) ? D[key] : null;
}

export function hasTerm(key) {
  return Object.prototype.hasOwnProperty.call(D, key);
}
