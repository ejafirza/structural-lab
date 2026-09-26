# Milestone 8 Plan — Deflection / Elastic Curve (E·I)

**Status:** APPROVED by the owner 26 Sep 2026 (all three §13 decisions taken via the
review questions) and **implemented & verified in full on 26 Sep 2026** — see §14
for the implementation record and the definition-of-done status.

**Predecessors:** M1 (point engine) → M2 (viz) → M3 (supports) → M4 (UDL) → M5 (linear) → M6 (multi-load) → M6.5 (drag repair) → M7 (arbitrary w(x) profiles) — all complete & verified (127/127 unit tests; 32/32 + 6/6 M5 anchors; 22/22 + 6/6 M6/M6.5 anchors; 30/30 + 8/8 M7 anchors; zero console errors; commit `6b98cde` pushed, CI green).

---

## 0. Recommendation summary (TL;DR)

- **M8 = the deflected shape of the beam** (the "elastic curve"): a fourth diagram panel drawing how the beam bends under the loads, exaggerated so the eye can see it, plus the **max deflection value and where it happens** as a results card.
- Completes the teaching trio on the Results side: shear → moment → **deflection** — the three diagrams every Strength of Materials course builds.
- **No new numerics:** deflection comes from integrating our EXACT piecewise-polynomial moment curves twice. Every integral stays closed-form; the M6 door for one small bounded root-finder (where the slope crosses zero) is opened only if a case needs it.
- **One new input, decided by the owner:** a single stiffness number **E·I** (kN·m²) with **teaching preset chips** (typical steel beam / timber joist / concrete beam — round numbers, roughly 1.8×10⁴ / 5×10² / 1.6×10⁵).
- **One new panel, decided by the owner:** the curve gets its own panel under the BMD, same x-alignment, drawn on the tension side with a clear "shape exaggerated" note. Max sag + position also join the results cards.
- Honesty carries over unchanged: **determinate beams only** — indeterminate/unstable keep the classification-and-note behaviour, and the deflection panel shows the same "not solved here" placeholder.
- Shape of the change: 1 new engine capability (pure function), 1 input control + 3 chips, 1 panel, 2 harnesses, ~28 new tests. `src/engine.js`, `ui/render.js`, and all existing solvers stay byte-identical.

## 1. Scope — what "deflection" means here

- **v(x)** = vertical displacement of the beam's centreline at position x. Sagging bends the beam downward; we draw the curve on the **tension side** (below for sagging spans, above-the-axis rise for cantilever tips), consistent with the BMD convention already in the app.
- Sign convention: **downward deflection is reported positive** ("max sag = 12.5 mm at x = 2.81 m") — the quantity a student checks against a serviceability limit. Any upward (hogging-side) motion is shown in the drawing, not hidden.
- The curve is computed from **EI·v″(x) = M(x)**: our M(x) is an exact piecewise polynomial (cubic at most per segment), so v(x) is an exact piecewise quintic. Boundary conditions pin the two integration constants exactly:
  - simply supported: v(0) = 0, v(L) = 0
  - cantilever fixed-left: v(0) = 0, θ(0) = 0 (and mirrored fixed-right)
- **What this is NOT:** no indeterminate solving, no continuous beams / interior supports, no moving loads or influence lines, no section catalogues or design codes, no long-term/creep effects, no unit system beyond SI (kN, m), no new dependencies.

## 2. Data model (one new input)

| item | type | unit | notes |
|---|---|---|---|
| `EI` | positive finite number | kN·m² | new engine parameter, optional with a teaching default; `TypeError` if not a finite number, `RangeError` if ≤ 0 |

- `analyzeBeam({ span, loads, supports, EI })` — the parameter flows through as input only; no load descriptor changes.
- **Preset chips** (owner decision: one number + presets) fill the single E·I field: **Steel beam ≈ 1.8×10⁴**, **Timber joist ≈ 5×10²**, **Concrete beam ≈ 1.6×10⁵** kN·m² (round teaching values; exact catalogue values are explicitly out of scope). A fourth chip, **SI default 2.0×10⁴**, doubles as the reset.
- The E·I control lives next to Span in the Model panel (it is a *beam property*, not a load property) and is visible **only when the beam is determinate** — indeterminate/unstable beams don't need it, which also keeps their editor unchanged.
- Display units: results in **mm** (deflections come out in metres; a beam sags in millimetres — show mm, keep the engine in m).

## 3. Equations (all closed-form)

Per segment, with M(x) the exact existing polynomial:

```
EI·θ(x) = ∫ M(x) dx + C₁        (slope)
EI·v(x) = ∫ θ(x) dx + C₁·x + C₂ (deflection)
```

- C₁, C₂ solved once from the support conditions (2 equations, 2 unknowns — exact, no fitting).
- Max deflection: the candidate set mirrors the M6 peak-moment machinery — segment endpoints, all load events, and any interior **θ = 0** turning point. θ is piecewise quartic; the turning-point search uses the same exact quadratic-fit + stable-root technique the M6 `V = 0` search uses, fed one order higher. If a case needs a direct quartic solve it gets a tiny bounded root-finder — the M6 plan's sanctioned spot — else candidates suffice.
- Continuity doctrine (the M5/M7 boundary table, extended): at load events **v and θ stay C¹** (the beam is physically smooth); only curvature jumps. This makes sampling simpler than the shear case — no jump pairs, ever.
- Superposition: deflection of a load mix = pointwise sum of individual deflections (linear, determinate). Cross-checked by test.

## 4. Unchanged legacy behaviour (the frozen boundary)

- `src/engine.js`, `ui/render.js`: untouched, byte-for-byte.
- All existing solvers (M1/M4/M5 per-type paths, M6 `solveCombined`, M7 kernels): **untouched** — deflection is a pure ADD-ON computed from the solved result's moment data. Reactions/diagrams/maxMoment for every existing case must come out byte-identical.
- Existing UI surfaces (load list, editors, chips, badges): unchanged except one new control and one new panel.
- No existing test edited or superseded (target: zero supersessions, stricter than M6 — nothing existing even references EI).

## 5. Architecture — files touched

| file | change |
|---|---|
| `src/analysis.js` | `computeDeflection(result, EI)` — pure add-on: piecewise integration of the result's own moment data; adds `deflection` block `{ v: [{x, v}], theta: [{x, θ}], max: { value (m, downward+), position, sign }, EI }` to determinate results only |
| `ui/index.html` | E·I control (number + slider + 4 preset chips, `hidden` when indeterminate/unstable) + fourth panel section |
| `ui/app.js` | state `EI` (default 2.0×10⁴), chip wiring, passes EI through to analyze + render; honest re-render on EI change |
| `ui/renderm3.js` | `renderDeflection()` — the curve panel: tension-side plotting, auto-scaled exaggeration with the true scale note, max-sag marker; zero engineering maths (constants from the engine) |
| `ui/style.css` | panel + chip styles (reuses existing patterns) |
| `test/deflection.test.js` | **new** analytical suite (§8) |
| `test/ui-m8.test.js` | **new** render tests (fake-DOM pattern) |
| `verify/deflection-cdp-verify.mjs` | **new** functional harness (port 9345) |
| `verify/deflection-layout-check.mjs` | **new** layout audit (port 9346) |
| `readme.md`, `verify/readme.md`, `AGENTS.md`, `dashboard.md`, `handoff.md` | counts, file map, state, harness docs |
| `src/engine.js`, `ui/render.js`, all existing tests | **frozen / untouched** |

## 6. UI / interaction design

- **Panel 4 — "Deflected shape v(x)"**: same width/x-alignment as the other panels; the curve drawn from the engine's sampled array; the supports' original positions marked; max sag marked with the same dot-and-label style as Mmax on the BMD; a note states the exaggeration ("drawn ×N — true max sag 12.5 mm").
- **Exaggeration:** auto-fit — the largest deflection in the case fills a fixed drawing height (~60 units, the SFD convention). The scale factor N is shown, so the drawing never lies about being exaggerated. (Owner call: auto-fit over a fixed ×200, because spans and stiffnesses vary too widely for one fixed factor to always be legible.)
- **Results card:** "Max deflection — 12.5 mm · at x = 2.81 m" (accent style, like Mmax). For cantilevers the value is at the tip; sign labelled (down/up).
- **E·I control:** one number field + slider (log-ish feel via generous range 10²…10⁶) + the four preset chips; sits with Span; hidden when the beam isn't determinate; changing it visibly re-sags the curve — the Experiment→Observe loop at its best.
- **Indeterminate/unstable:** panel shows the same italic placeholder line as SFD/BMD ("not solved here"); no E·I control appears; nothing else changes.
- **No new modes:** the panel is always present (like SFD/BMD today); the control visibility rule mirrors how load editors already show/hide by concept.

## 7. Accessibility

- Native number input + range slider, labelled "Beam stiffness E·I"; chips carry `aria-pressed` states like existing presets.
- Panel `aria-label` describes the curve; the max-sag text is real text (screen-reader reachable); no colour-only meaning; the exaggeration note is text.
- Live regions: the existing determinacy/equilibrium badges keep announcing; deflection card updates re-use the standard DOM update path (no new live region needed).

## 8. Analytical test cases (hand-derived; never engine round-trips)

New file `test/deflection.test.js`. EI is factored out by asserting **EI·v** (dimension-stiffness values) against textbook formulas, then a couple of true-mm checks with concrete EI.

- **A — Simply supported, P at midspan:** EI·v_max = P·L³/48 at L/2. (P = 10, L = 6 → 2160 kN·m³.)
- **B — Simply supported, P off-centre (a = 4, b = 2):** max at x* = √((L²−b²)/3) from the left; EI·v_max = P·b·(L²−b²)^{3/2}/(9√3·L). Verifies the interior turning-point search, not just endpoints.
- **C — Simply supported, full UDL:** EI·v_max = 5wL⁴/384 at L/2; v(0)=v(L)=0; midspan slope zero.
- **D — Cantilever fixed-left, tip load:** EI·v(L) = P·L³/3; slope zero at the wall; curve monotone.
- **E — Cantilever fixed-left, full UDL:** EI·v(L) = w·L⁴/8.
- **F — Cantilever, triangular (peak at wall, zero at tip):** EI·v(L) = w·L⁴/30 — the M5 descriptor exercised through deflection.
- **G — Stepped profile (M7 Case A shape) simply supported:** hand-integrated piecewise quintics; continuity of v and θ at x = 3 checked to 1e-9 both sides.
- **H — Superposition:** profile + point load ⇒ v(x) ≡ v_profile(x) + v_point(x) pointwise (1e-9), and order independence.
- **I — Honesty:** pin+pin and free+free with any load → `deflection` block ABSENT; classification note unchanged; no cards added.
- **J — Validation:** EI = 0 / negative / NaN / "x" → the documented error types; EI absent → teaching default applies and is echoed in the result.
- **K — Derivative identities on clean stencils:** dθ/dx = M/EI and d²v/dx² = M/EI (central differences, uniform stencils away from events — the M5/M7 lesson applied one order up).
- **L — Regression:** the full existing result object for representative cases is deep-equal with and without the deflection add-on computed (proves pure add-on, nothing else moved).

**UI tests (`test/ui-m8.test.js`):** curve polyline vertex count ≈ engine samples; exaggeration note text contains the true mm value; max marker at the engine's position; E·I control hidden for pin+pin; chips set the value and stay highlighted only while matching; panel placeholder for unstable.

**Estimate:** 127 existing + ~28 new ≈ **155 tests** (final count recorded in §14).

## 9. Browser verification additions

- **`verify/deflection-cdp-verify.mjs`** (port 9345): default point beam → curve panel visible with exaggeration note containing the right mm value; UDL preset → card reads 5wL⁴/384EI value verbatim; drag E·I slider → sag number changes, curve redraws, equilibrium badge unchanged; steel→timber chip → visibly larger sag; cantilever → tip deflection, upward shape labelled; indeterminate → placeholder, no control; cap-behaviour: EI persists across load edits; zero console errors.
- **`verify/deflection-layout-check.mjs`** (port 9346): 6–8 configurations (four-panel worst cases: default, UDL, cantilever, stepped profile, mixed, long span, tiny EI, indeterminate) — 0 overflow / 0 overlaps across **all four** SVG panels.
- Existing six harnesses re-run as anchors: 32/32, 6/6, 22/22, 6/6, 30/30, 8/8. `node --test` green. Zero new dependencies; nothing written to C:.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Integration constants wrong for some support pair | Boundary conditions solved exactly per class (3 known classes); Cases A–G pin every class to textbook values |
| Turning-point search misses the max (Case B style) | Candidate set = events ∪ endpoints ∪ θ=0 roots; Case B hand value pins it; plateau/degenerate cases covered by endpoints |
| Four panels crowd the page / viewport | Same width, stacked; the layout audit gains the fourth panel; small-screen CSS already stacks panels |
| Exaggeration misleads | Factor shown as text next to the true mm value; the panel title says "shape exaggerated" |
| EI=0/negative produces garbage | Validated like every engine input; UI clamps gracefully |
| Unit confusion (m vs mm) | Engine in m; UI displays mm and labels it; tests assert both |

## 11. Explicitly out of scope (M8)

Indeterminate solving · continuous beams / interior supports / overhangs · moving loads & influence lines · section catalogues & design codes · shear deflection (Timoshenko) · creep/long-term · unit systems beyond SI · upward loads · persistence/undo · any new dependency.

## 12. Definition of done (explicit)

1. New analytical tests green — `test/deflection.test.js`, `test/ui-m8.test.js`.
2. All 127 existing tests green, unedited — zero supersessions.
3. Functional CDP green — six anchors unchanged (32/32, 6/6, 22/22, 6/6, 30/30, 8/8) + new harness fully passing.
4. Layout audit clean — anchors + the new fourth-panel configurations 0-clip / 0-overlap.
5. Zero console errors across all harnesses.
6. Boundaries intact — `engine.js`/`render.js` byte-identical; all existing solvers byte-identical; zero new dependencies; nothing written to C:.
7. Written report + doc updates (readme, verify/readme, AGENTS, dashboard, handoff, plan-m8 §14).
8. Committed only when the owner asks; push only on explicit request.

## 13. Owner decisions

1. **M8 = deflection** — decided 26 Sep (recommended; chosen).
2. **E·I as one number + teaching preset chips** — decided 26 Sep (recommended; chosen). Default value 2.0×10⁴ kN·m²; presets Steel/Timber/Concrete at round values.
3. **Dedicated fourth panel** — decided 26 Sep (recommended; chosen). Auto-fit exaggeration with the factor shown (my call, flagged here; reversible to a fixed factor in one line).
4. **Deflection displayed in mm, engine in m** — my recommendation; trivially changeable.
5. **Panel always visible; control hidden for non-determinate beams** — my recommendation, mirrors existing show/hide rules.

## 14. Implementation record — filled 26 Sep 2026

**Implemented and verified in full.** Diff surface: `src/analysis.js` (`DEFAULT_EI`, `resolveEI`, `momentIntegralTerm`, `bisectRoot`, `computeDeflection`, `attachDeflection`, dispatcher attach — the largest single addition, reworked once; see below), `ui/index.html` (`#ctl-ei` control + `#defl-svg` panel), `ui/app.js` (E·I state, `EI_PRESETS`, log slider, chips, determinacy-driven visibility, preset-on-point-load guard), `ui/renderm3.js` (`renderDeflectionM3`, `H_DEFL`, deflection palette, Max-deflection card, one-line wall-label clamp), `test/deflection.test.js` (new), `test/ui-m8.test.js` (new), `test/ui-m7.test.js` (fixture nodes only — E·I/deflection DOM ids for the app-boot test; no M7 assertion touched), `verify/deflection-cdp-verify.mjs` (new, port 9345), `verify/deflection-layout-check.mjs` (new, port 9346), plus doc updates. `git diff` on `src/engine.js`, `ui/render.js` and all six existing harnesses: **empty**.

**Final counts.** Unit: **143/143** (the prior 127 untouched + 12 deflection + 4 M8 UI). Browser: M5 anchors **32/32** + **6/6**; M6/M6.5 anchors **22/22** + **6/6**; M7 anchors **30/30** + **8/8**; new M8 harnesses **15/15** + **8/8**; zero console errors across all eight. Zero new npm dependencies; nothing written to C:.

**Zero supersessions.** No existing test was edited except `test/ui-m7.test.js`'s fake-DOM *fixture* gaining the new DOM ids (the M6 precedent: anchors' interaction/fixture layer follows the UI; assertions and counts untouched). The one renderer change outside M8's panel — clamping the wall-reaction label baseline to ≥ 16 in `drawMomentArrow` — is a one-line bug fix the new cantilever layout configuration exposed (a pre-existing M3-era clip above the viewBox), not a behaviour change.

**Decisions taken during implementation:**
1. **Exact closed-form kernels, not curve fitting.** The first draft integrated the *sampled* moment curves (Hermite-style fit) and failed its own endpoint identity — replaced with exact antiderivative kernels per load type rebuilt from the result's own reactions (`momentIntegralTerm`), then composed on the grid. Only the ∫∫ step for linear/profile W uses Simpson panels on the exact W (W is piecewise polynomial of degree ≤ 4; Simpson is exact for the cubic point/udl cases, and the grid never straddles an event for the quartic cases) — every published value still matches hand integration to the asserted tolerances.
2. **Support classes unified by mirroring.** A fixed-right wall is mirrored to fixed-left (loads, grid, reactions reflected), so all three classes share one constant-pinning path: cantilevers get C₁ = C₂ = 0 at the wall; simply supported gets C₂ = 0 and C₁ = −I_W(L)/L.
3. **Down-positive convention.** Integrating sagging-positive M yields an up-positive raw curve; the published v/θ negate it so a sagging beam reports positive deflection (the serviceability quantity). Documented in the engine and visible in the tests (dθ/dx = −M/EI).
4. **`renderM3` treats the deflection panel as optional** in the DOM contract (renders when `#defl-svg` exists) — keeps pre-M8 test fixtures and any minimal consumer working without edits.
5. **The E·I control is visibility-driven by determinacy** (`ctl-ei` hidden for indeterminate/unstable), and `applyPreset` now guards against a point load being selected (the CDP harness proved a preset click on a point selection silently corrupted the load object — users could hit the same path via keyboard focus).
6. **Test corrections during the build (my hand-derivation slips, caught by the engine):** Case D's textbook tip deflection is P·a²(3L−a)/6 with the peak at the tip for a > L/3 (and a point load cannot sit exactly at the free end — the engine's interior rule is right); Case G's turning point sits at x* ≈ 3.0832 (right of the step), NOT at the 3.375 shear peak — EI·v_max ≈ −101.34 kN·m³, re-derived by hand; EI·v is negative under the sagging-positive-M integration (the down-positive flip is the publication step).

**Definition of done:**
1. ✅ New analytical tests green — `test/deflection.test.js` (Cases A–L) and `test/ui-m8.test.js`.
2. ✅ All prior tests green, unedited — 127/127; zero supersessions (one fake-DOM fixture gained new DOM ids, assertions untouched).
3. ✅ Functional CDP green — six anchors unchanged (32/32, 6/6, 22/22, 6/6, 30/30, 8/8) + `deflection-cdp-verify.mjs` 15/15.
4. ✅ Layout audit clean — anchors 6/6, 6/6, 8/8 + the new four-panel configurations 8/8 with 0 clip / 0 overlap.
5. ✅ Zero console errors across all eight headless-Edge harnesses.
6. ✅ Boundaries intact — `engine.js`/`render.js`/six harnesses byte-identical; zero new dependencies; nothing written to C:.
7. ✅ Written report + doc updates recorded (this section; readme/verify/AGENTS/dashboard/handoff).
8. ⬜ Committed only when the owner asks (hard rule 4).
