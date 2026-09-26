# Milestone 7 Plan — Arbitrary `w(x)` (Piecewise Load Profiles)

**Status:** APPROVED by the owner 25 Sep 2026 (§13 record below) and
**implemented & verified in full on 26 Sep 2026** — see §14 for the
implementation record and the definition-of-done status.

**Predecessors:** M1 (point engine) → M2 (viz) → M3 (supports) → M4 (UDL) → M5 (linear descriptor + UI consolidation) → M6 (multiple loads / superposition) → M6.5 (load-drag repair, 102 tests) — all complete & verified (102/102 unit tests; 32/32 + 6/6 M5-anchor browser checks; 21/21 + 6/6 M6/M6.5 browser checks; zero console errors; CI green on Node 20 + 22).

---

## 0. Recommendation summary (TL;DR)

- **M7 = one distributed load described by a list of 2–6 control points**, so a single load can be stepped, gapped, or ramped from mid-span — any polyline intensity `w(x)` — instead of exactly one straight-line region.
- **No new UI concept.** The existing *distributed* concept grows from two endpoints to a point list. With exactly two points the UI sends today’s `linear` descriptor, so the **frozen M5 solver runs byte-for-byte** (the emit rule, §4).
- Resultant by **per-segment summation** (`R = ΣRᵢ`, `x̄ = ΣRᵢx̄ᵢ/R` — the same closed forms M5 uses, applied per segment); kernels reuse the two-function contract M6’s `solveCombined` already consumes; the peak search is M6’s **segment-exact `V = 0`** machinery unchanged, simply fed more events.
- So: **no solver rewrite, no numerical error, no new dependencies, zero superseded tests** (unlike M6, which deliberately superseded two assertions).
- Two new preset chips only (“Stepped”, “Snow drift”); point cap 6 mirrors the 6-load cap.
- **Curves — the one real fork:** Option A (recommended) = polyline through control points; Option B = exact quadratic segment (true parabolic shapes) for roughly a third more test surface. See §13.
- Shape of the change: 1 new descriptor, ~3 small engine branches, 1 UI table, 2 harnesses, ~25 new tests. `src/engine.js` and `ui/render.js` stay byte-identical.

---

## 1. Scope — what “arbitrary `w(x)`” means here

A beam carries a distributed load whose intensity is described by **control points** `(x, w)` — the intensity follows the polyline through them, is zero outside the first and last point, and a repeated `x` is a **vertical step** (intensity jump):

```
w (kN/m)
 8 │            ┌────────┐
   │            │        │
 4 │ ───────────┘        │
   └───────────┴────────┴──── x (m)
   0           3        6
```

**Why this milestone, honestly framed.** After M6 a stepped shape can already be *modelled* by stacking two partial UDLs — and the numbers are right, because superposition is exact. What stacking cannot give:

1. **One coherent load** — a stepped or gapped shape as a single row, a single badge, a single descriptor, instead of N stacked rows the student must mentally merge (“here is *one* load whose intensity is a function of x” is the lesson; “here are three loads I added” is not).
2. **Shapes that are awkward or impossible today** — a gap (load only over part of the span) needs duplicated regions; a four-level staircase needs four rows; a smooth-looking profile needs many.
3. **The seams later milestones consume** — a resultant computed by summation over a shape, and an event-driven peak search, are exactly what deflection / E·I and any future non-closed-form work will stand on.

**Validity:** unchanged from M6. All three solved structure classes (simply supported, cantilever fixed-left, cantilever fixed-right) are statically determinate and linear, so reactions and internal forces superpose. Only **downward** loads (`w ≥ 0`) are in scope; indeterminate / unstable structures remain classify-only.

**What this is *not*:** no expression strings, no `eval`, no spline smoothing, no formula-input box, no upward loads, no more than 6 points (§11).

---

## 2. Data model

The descriptor catalog gains a fourth entry; `point` / `udl` / `linear` are untouched.

| descriptor | fields | unit | since |
|---|---|---|---|
| `point` | `magnitude`, `position` | kN | M1 |
| `udl` | `intensity`, `start=0`, `end=span` | kN/m | M4 |
| `linear` | `start`, `end`, `wStart`, `wEnd` | kN/m | M5 |
| **`profile`** | **`points: [{x, w}, …]`** | **kN/m** | **M7** |

Validation (`normalizeDescriptor` branch, same error taxonomy as today):

- `points` must be an **array of 2..`MAX_PROFILE_POINTS` (proposed 6)** objects → `RangeError` outside that range; `TypeError` for non-array, non-object or non-finite members.
- `x` **non-decreasing**, `0 ≤ x ≤ span` → `RangeError` if descending or outside the span. A repeated adjacent `x` is **legal** (a step); a run of repeats is harmless (zero width).
- `w ≥ 0` finite (downward-positive, honesty rule) → `RangeError` for a negative value; **total load must be > 0** → `RangeError` for an all-zero profile (the `linear` analogue of “zero at both ends”).
- Export `MAX_PROFILE_POINTS` alongside `MAX_LOADS`; the UI disables **+ Add point** at the cap.
- A `profile` counts as **one** of the 1..6 loads (the M6 cap is unchanged).

**Resultant definition stays single-valued:** in every case the `resultant` field is *the beam’s total equivalent single force* `{value: R, position: x̄}` — for one profile that is `ΣRᵢ` and `ΣRᵢx̄ᵢ/R`, identical in meaning to today.

---

## 3. Equations

**Per segment `i` (endpoints `xₐ, xᵦ`, intensities `wₐ, wᵦ`, `b = xᵦ − xₐ`) — the M5 closed forms, applied per segment:**

```
Rᵢ  = (wₐ + wᵦ) · b / 2
x̄ᵢ  = xₐ + b·(wₐ + 2wᵦ) / (3·(wₐ + wᵦ))          (wₐ + wᵦ > 0)
R   = Σ Rᵢ            x̄ = Σ Rᵢx̄ᵢ / R
```

A zero-width segment (a step pair) contributes nothing to `R`, which is correct: a jump changes the *shape*, not the total.

**Reactions — identical to every prior milestone:**

```
simply supported:  RA = R(L − x̄)/L,  RB = R·x̄/L
cantilever left:   V_A = R,  M_A = R·x̄   (hogging, at the fixed end)
cantilever right:  M_B = R·(L − x̄)       (hogging)
```

**Kernels (the M6 seam).** `profileKernels(points)` returns the same `{cumulative, firstMoment}` pair as `linearKernels`:

```
cumulative(x)  = Σ ∫₀ˣ w dt          (closed form per segment)
firstMoment(x) = Σ ∫₀ˣ (x−t)w(t) dt
shear:   V(x) = RA − cumulative(x)
moment:  M(x) = RA·x − firstMoment(x)
equilibrium:  ΣFy = RA + RB − R;   ΣMz(A) = RB·L − R·x̄   (scale = R·max(1, L))
```

Each segment’s integrals are elementary (area and first moment of a trapezoid), so **the result is exact — “quadrature” here means summation over segments, not approximation.** Every existing kernel is the one-segment special case.

**Peak moment — M6 machinery unchanged, only more events.** `solveCombined` already: segments the span at every load event, fits the exact quadratic `V` on each segment from two interior samples, solves `V = 0` in the numerically stable conjugate form, and maximises `M` over `{roots} ∪ {events} ∪ {segment endpoints}` (the endpoint candidates cover the degenerate `V ≡ 0` plateau). M7’s only contribution: **every control-point `x` becomes an event** — `includePoints` already accepts an arbitrary list.

De-duplicating a repeated `x` inside `includePoints` is safe: an *intensity* jump leaves `V` C⁰ and `M` C¹, so one ordinate at that `x` is the correct segment boundary. (Contrast point loads, which jump `V` and need M6’s jump-pair sampling — unchanged.)

**Continuity doctrine (the M5 boundary table, generalized):**

| quantity | at a control point with an intensity jump | at a plain control point (kink) |
|---|---|---|
| intensity `w` | jump | slope change |
| shear `V` | C⁰, slope jumps | C⁰, slope jumps |
| moment `M` | C¹ | C¹ |

Rendering a *step* needs no engine support: the renderer draws the band outline straight from `points` (a vertical edge at the repeated `x`).

---

## 4. Unchanged legacy behaviour (the frozen boundary)

- `src/engine.js` (M1) and `ui/render.js` (M2): **untouched, byte-for-byte.**
- Dispatcher (`analyzeBeam`) rules after classification:
  - `loads.length === 1` with type `point` / `udl` / `linear` → **the existing frozen per-type solvers, not one character changed.**
  - `type === "profile"` (one **or** several) → `solveCombined` (already fully general); `kind: "beam-profile"` for a lone profile, `"beam-multi-load"` for 2+ — matching the M6 kind contract. **No legacy echoes** (`load/position/b`, `intensity`, `totalLoad`) for `profile`, exactly as for multi-load.
  - `loads.length ≥ 2` → the unchanged M6 path; a profile simply contributes another kernel branch.
- **The emit rule (this is what protects the regression anchors):** the UI sends `linear` when the selected distributed load has **exactly two points** (collinear by construction), and `profile` otherwise (3+ points, or a repeated `x`). Every M5/M6 screen, label and number therefore stays byte-identical, and **no existing test is edited or superseded** — a stricter anchor policy than M6, which documented two deliberate supersessions.
- Honesty unchanged: indeterminate or unstable with any load count → classification + explanation only; `resultant` (a load property) still emitted; no `reactions` / `diagrams` / `maxMoment`.
- `src/analysis.js` changes are limited to three additive branches (`computeResultant`, `cumulativeKernel`, `firstMomentKernel`) plus the dispatcher route — the M6 precedent, and only with an approved plan.

---

## 5. Architecture — files touched

| file | change |
|---|---|
| `src/loadmodel.js` | `profile` descriptor + validation; export `MAX_PROFILE_POINTS`; catalog entry (`kN/m`); doc-comment updates |
| `src/analysis.js` | profile branch in `computeResultant` / `cumulativeKernel` / `firstMomentKernel`; dispatcher route → `solveCombined`; `kind: "beam-profile"` |
| `test/profile.test.js` | **new** analytical suite (§8, Cases A–G) |
| `test/ui-m7.test.js` | **new** render tests (fake-DOM, ui-m5 / ui-m6 pattern) |
| `ui/index.html` | point table (rows + **+ Add point** + per-row remove) replacing the region-only editor; live region |
| `ui/app.js` | selected distributed load carries `points`; the emit rule (§4); table ↔ beam selection linking; flat fields (region start/end, `w₁/w₂`) stay bound to the **first and last** point for back-compat |
| `ui/renderm3.js` | band drawn as a polygon through `points` (vertical edge at a step); one handle per control point on the **selected** load only; still **zero engineering maths** (intensity → height is presentation scaling, as today) |
| `ui/style.css` | point-row and handle styles |
| `verify/profile-cdp-verify.mjs` | **new** functional harness (§9; debug port 9343) |
| `verify/profile-layout-check.mjs` | **new** layout audit (§9; debug port 9344) |
| `readme.md`, `verify/readme.md`, `AGENTS.md`, `dashboard.md`, `handoff.md` | counts, file map, load model, state, harness docs |
| `src/engine.js`, `ui/render.js`, all existing tests | **frozen / untouched** |

Existing harnesses re-run as anchors: `consolidation-cdp-verify` (32/32), `consolidation-layout-check` (6/6), `multi-load-cdp-verify` (21/21), `multi-layout-check` (6/6).

---

## 6. UI / point-table interaction design

Guided by the standing taste (general internal model, minimal controls, no parallel modes):

- **The load list is unchanged** — add / select / remove, numbered badges, combined `R, x̄` drawn once. A `profile` is just another row (“w: 4 → 4 → 8 kN/m over [0, 6]”).
- When a distributed load is selected, its editor shows a compact **point table**: rows `x | w`, each with a remove button; **+ Add point** appends and selects; the control disables at 6 points and removal disables at 2 (a load never disappears — consistent with M6’s never-empty rule).
- **Drag:** one handle per control point on the selected load — horizontal drag changes `x`, vertical drag changes `w` (the “shape it with your hands” loop). Dragging two handles together creates a **step**, not an error. Non-selected loads draw plain, as in M6.
- **Preset chips:** the existing five stay and still quick-fill **two** points (→ `linear` → frozen path). **Two new chips only:** “Stepped” (4 points, two levels) and “Snow drift ▲” (4–5 points, ramp then plateau). Chips fill data; they never switch a mode.
- **Beam ↔ table link:** focusing or pressing a table row highlights its handle and vice versa; no extra labels on the beam (label crowding was M6’s layout lesson) — the table carries the numbers, the beam carries the shape.
- Default screen unchanged: one point load, byte-for-byte today.

---

## 7. Accessibility

- **Table semantics:** point rows are labelled controls; `x` / `w` are native number inputs (keyboard-editable); remove buttons carry explicit `aria-label`s (“Remove point 3 — 6 kN/m at 3 metres”); **+ Add point** disabled at the cap with a tooltip naming the cap.
- **Handles:** keep `tabindex="0"` with an extended `aria-label` (“Load 2 of 3, point 4 of 6 — 8 kilonewtons at 3 metres — drag, or focus and use arrow keys”); arrow-key nudging unchanged (0.1 m / 0.1 kN/m); handles exist only on the selected load so the Tab path stays short.
- **Live announcements:** the existing `aria-live` region reports point added / removed (“6 points total, cap reached” at the limit); determinacy and equilibrium badges keep announcing solution changes.
- **Not colour-only:** shape plus table text identify everything; no new animation; the layout audit doubles as the clipping / overlap guard.

---

## 8. Analytical test cases (independently hand-derived; never engine round-trips)

New file `test/profile.test.js`. The expected values below are textbook statics worked by hand.

**Case A — stepped profile, simply supported, peak *inside* a segment.**
`L = 6`; points `(0,4), (3,4), (3,8), (6,8)` — 4 kN/m on [0,3], 8 kN/m on [3,6].
`R = 12 + 24 = 36 kN`; `x̄ = (12·1.5 + 24·4.5)/36 = 126/36 = 3.5 m`.
`RA = 36·2.5/6 = 15 kN`, `RB = 36·3.5/6 = 21 kN` (ΣFy: 36 ✓; ΣMz(A): `RB·6 = 126 = R·x̄` ✓).
`V(0⁺) = 15` → `V(3⁻) = 3` → intensity jump only, so `V(3⁺) = 3` (no shear jump) → `V = 3 − 8(x−3) = 0` at **`x* = 27/8 = 3.375 m`** → `V(6⁻) = −21 = −RB` ✓.
`M(3) = 15·3 − 12·1.5 = 27`; **`Mmax = 441/16 = 27.5625 kNm` at `x* = 3.375 m`, sagging** — verified from both sides: left `15x − 12(x−1.5) − 4(x−3)²` at `x = 27/8` gives 441/16 ✓; right `21(6−x) − 4(6−x)²` at `x = 27/8` gives 441/16 ✓.
Superposition cross-check: identical to two `linear` loads stacked through the M6 path **pointwise**; `Mmax` does **not** equal the sum of the two individual maxima (the M6 lesson, restated).

**Case B — cross-check against the frozen M5 solver.**
Three **collinear** points `(0,0), (3,6), (6,12)` ≡ `linear {start:0, end:6, wStart:0, wEnd:12}`.
`R = 36`, `x̄ = 4 m`, `RA = 12`, `RB = 24`; peak at `x* = 2√3 ≈ 3.4641 m`, **`Mmax = 16√3 ≈ 27.7128 kNm`**.
Assert: profile path ≡ frozen `linear` solver to **1e-12** (reactions, diagrams, `maxMoment`) — proves the new kernels agree with the old ones on their shared domain.

**Case C — gap load as one descriptor (the `V ≡ 0` plateau case).**
Points `(1,3), (2,3), (2,0), (4,0), (4,3), (5,3)` — 3 kN/m over [1,2] and [4,5], nothing between.
`R = 3 + 3 = 6 kN`; `x̄ = (3·1.5 + 3·4.5)/6 = 3 m`; `RA = RB = 3 kN`.
`V`: `+3` → `0 at x = 2` → `V ≡ 0 on (2,4)` → `−3` across [4,5] → `−3 = −RB` ✓.
`M` is constant **≡ 4.5 kNm on [2,4]** ⇒ **`Mmax = 4.5 kNm`** (achieved on an interval — exercises the endpoint / plateau candidate branch).
Cross-check: identical to two `linear` loads `[1,2]` and `[4,5]` stacked through M6, to 1e-12.

**Case D — cantilevers, the Case A shape.**
Fixed-left: `V_A = 36 kN`, **`M_A = R·x̄ = 126 kNm` hogging at x = 0**, `M(6) = 0` (free end ✓).
Fixed-right mirror: **`M_B = R·(L − x̄) = 36·2.5 = 90 kNm`** hogging at x = 6.

**Case E — honesty with a profile.** pin+pin (indeterminate, degree 1) and free+free (unstable), each with one profile → `classification` + explanation only; `reactions`, `diagrams`, `maxMoment` **absent**; combined `resultant` present (a load property).

**Case F — validation.** non-object descriptor → `TypeError`; unknown type → `TypeError`; 1 point or 7 points → `RangeError`; `x < 0` or `x > span` → `RangeError`; descending `x` → `RangeError`; negative `w` → `RangeError`; all-zero profile → `RangeError`; and the M6 rules (empty `loads`, 7 loads, non-array) still throw the same types.

**Case G — mixed loads, order independence, physics.**
Profile (Case A shape) + point load `P = 5 kN @ 2 m`, `L = 6`:
`R = 41`; `x̄ = 136/41 ≈ 3.3171 m`; `RA = 55/3 ≈ 18.333 kN`, `RB = 68/3 ≈ 22.667 kN` (ΣFy: 41 ✓; ΣMz(A): `68/3·6 = 136 = 41·x̄` ✓).
`V(2⁻) = 31/3` → jump −5 → `V(2⁺) = 16/3` → `V(3⁺) = 4/3` → **`x* = 19/6 ≈ 3.1667 m`** → `V(6⁻) = −68/3 = −RB` ✓.
**`Mmax = 289/9 ≈ 32.1111 kNm`** — from the left: `M(3) = 55/3·3 − 18 − 5 = 32` plus `∫₃^{x*} V dx = ½·(4/3)·(1/6) = 1/9`; from the right: `68/3·(17/6) − 4·(17/6)² = 289/9` ✓.
Plus: permuted load order → identical results; doubling every `w` doubles `R`, reactions and `Mmax`; `dM/dx = V` and `dV/dx = −w` on **uniform stencils only**, skipping any node where **the node or either neighbour** is a control point or step (the M6 multi-load rule, extended).

**UI tests (`test/ui-m7.test.js`):** emit rule (2 collinear points → `linear` descriptor + byte-identical M5 label content; 3 points or a step → `profile`); band polygon vertices follow `points`; vertical edge drawn at a step; handles follow the selection; only the selected load shows handles; add / remove a point updates the beam and the combined `R, x̄`.

**Estimate:** 102 existing + ~25 new ≈ **127 tests** (final count recorded in the §14 report).

---

## 9. Browser verification additions

- **`verify/profile-cdp-verify.mjs`** (functional, headless Edge over CDP, own server spawn, **port 9343**, litter in git-ignored `verify/tmp/`). Draft checklist (~14–16 checks): apply the “Stepped” chip → cards read **15 kN / 21 kN / 27.6 kNm** with combined **R = 36 kN**, **x̄ = 3.5 m** on the beam (fmt strings asserted verbatim); add a 5th point → values change and still match a hand-computed case; remove a point → previous numbers return; drag a control point horizontally → live update; step edge visible in the band; gap configuration renders; cap at 6 → **+ Add point** disabled; indeterminate with a profile → “–” cards + combined `R` still on the beam; zero console errors / exceptions.
- **`verify/profile-layout-check.mjs`** (getBBox audit, same technique, **port 9344**): 4–6 configurations — 6-point worst case, stepped, gap, profile mixed with a point load, selected vs unselected handles — assert **0 overflow, 0 overlaps** in all three SVG panels. Hard DoD gate (this technique caught the M5 clipping bug and the M6 redundant-arrow collision).
- Existing four harnesses re-run as anchors: 32/32, 6/6, 21/21, 6/6 (the multi-load anchor now includes the M6.5 synthesized pointer-drag checks); `node --test` green; zero console errors everywhere. No new dependencies; nothing written to C:.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Peak lands wrong if a control point is not treated as a sampling event | Case A (root strictly inside a segment) + Case C (plateau) + Case G (mixed events); document the `includePoints` de-dup behaviour in the engine doc-comment |
| Renderer draws steps or gaps wrong, or clips (a polygon outline is new) | getBBox layout audit as a **hard** DoD gate; configurations deliberately include 6 points and a step |
| Source-guard tests flag legitimate rendering maths (band scaling now reads `points`) | Inspect the guards first (step 1 of implementation); tighten their wording only if they would otherwise fail — never weaken them |
| Emit rule misclassifies 2 collinear points (float tolerance) | Tolerance-based collinearity check + a dedicated UI test asserting both branches |
| UI bloat — the standing overbuild risk | Two concepts unchanged, **two** new chips, cap 6, no new modes; the table reuses the existing row/select machinery |
| Label crowding with many handles | Handles only on the selected load; numbers live in the table, not on the beam; M6’s `findFreeSpot` already covers text |
| Scope creep (curves, smoothing, expression input) | The §11 out-of-scope list; the §13 forks are decided **before** implementation |

---

## 11. Explicitly out of scope (M7)

Upward or negative intensities · expression or `eval` inputs · spline or smoothing interpolation · **analytic parabolic segments (Option B, §13 — a fork, not a default)** · more than 6 control points · `profile` replacing or deleting `linear` (a possible later consolidation) · deflection / E·I · *solving* indeterminate structures · overhanging beams and interior supports · moving loads and influence lines · load combinations · per-load `R/x̄` labels for N > 1 · AI tutor · standards references · persistence and undo/redo · any new dependency.

---

## 12. Definition of done (explicit)

1. **New analytical tests green** — `test/profile.test.js` (Cases A–G) and `test/ui-m7.test.js`.
2. **All 102 existing tests green, unedited** (including the M6.5 interaction source guard) — zero supersessions this milestone (stricter than M6).
3. **Functional CDP green** — the four anchors unchanged (32/32, 6/6, 21/21, 6/6) **and** `profile-cdp-verify.mjs` fully passing (final count in the report).
4. **Layout audit clean** — anchors 6/6 and 6/6 **and** the new profile configurations 0-clip / 0-overlap.
5. **Zero console errors** across all headless-Edge harnesses.
6. **Boundaries intact** — `src/engine.js` and `ui/render.js` byte-identical; source-guard tests pass; zero new npm dependencies; nothing written to C:.
7. **Written report** of what changed, plus doc updates (readme file map and counts, `verify/readme.md`, `AGENTS.md` state line, `dashboard.md` ledger + `last_updated`, `handoff.md` status/table/map) — recorded only as work actually lands.
8. **Committed only when the owner asks** (hard rule 4: commit on request; push only on explicit request).

---

## 13. Owner decisions (awaiting your call)

1. **Point cap = 6, minimum = 2** — *recommended* (mirrors the 6-load cap; re-run the layout audit if either cap ever changes).
2. **Emit rule: two collinear points → today’s frozen `linear` solver** — *recommended* (keeps every M5/M6 anchor byte-identical and forces zero test edits).
3. **Two new preset chips only** (“Stepped”, “Snow drift”) — *recommended*; more chips can arrive later without a plan.
4. **Curves — the real fork:**
   - **Option A (recommended):** polyline through control points. Smooth-looking shapes are drawn with 4–6 points; exact as a piecewise-linear load; smallest test surface; no new UI concept.
   - **Option B:** also allow an **exact quadratic (parabolic) segment** — true curves (snow drift, hydrostatic-type variants) solved exactly (`V` stays quadratic, so M5’s root machinery applies; `∫w` cubic, `∫(x−t)w` quartic). Costs roughly a third more test surface and one small extra UI affordance (how the student says “this segment is a parabola” without introducing a mode — the open design question).
5. **Vertical dragging for intensity** (drag a control point up or down to change `w`) — *recommended: include it*; the alternative is table-fields only, which is cheaper but weakens the “shape it with your hands” loop.

**Recorded 25 Sep 2026 — owner approved; implementation may start.** Decisions 1, 2, 3 and 5 take the
recommended options; decision 4 takes **Option A (polyline)**. One build-time refinement, forced by
the anchor policy (decision 2): the M5 anchor asserts the w₁ field is *visible* whenever a distributed
load is selected (`consolidation-cdp-verify`, check “distributed: controls toggle”), so the point
table is the **only editor of a profile load (3+ points)**, while a two-point load keeps today’s flat
editor plus the shared **+ Add point** button — the editor always mirrors the emitted descriptor
kind (no parallel modes), and no existing check is edited for it. The interaction source guard
(`test/interaction-guard.test.js`) is extended — never weakened — with the new `profile-point`
handle role, exactly as its own header instructs for any new handle type.

---

## 14. Implementation record — filled 26 Sep 2026

**Implemented and verified in full.** Diff surface: `src/loadmodel.js` (profile descriptor + validation, `MAX_PROFILE_POINTS`, `emitDescriptor`), `src/analysis.js` (profile resultant, `profileKernels`, kernel branches, control-point events, dispatcher route, `beam-profile` kind), `ui/index.html` (`#ctl-points` point-table control), `ui/app.js` (point-list internal model, emit-rule wiring, shape-point table, profile drag/keyboard, two M7 chips), `ui/renderm3.js` (profile band polygon, per-point handles, step-aware axis, exported band-scaling constants), `ui/style.css` (point-table styles), `test/profile.test.js` (new), `test/ui-m7.test.js` (new), `test/interaction-guard.test.js` (extended per its own header), `test/loadmodel.test.js` (the documented supersession below), `verify/profile-cdp-verify.mjs` (new, port 9343), `verify/profile-layout-check.mjs` (new, port 9344), plus doc updates (readme, verify/readme, AGENTS.md, dashboard.md, handoff.md, this file). `git diff` on `src/engine.js`, `ui/render.js` and all four existing harnesses: **empty** — the frozen boundary is intact.

**Final counts.** Unit: **127/127** (`node --test` = the prior 102 + 20 profile + 5 M7 render/interaction). Browser: M5 anchors **32/32** + **6/6**; M6/M6.5 anchors **22/22** + **6/6**; new M7 harnesses **30/30** + **8/8**; zero console errors across all six. Zero new npm dependencies; harness litter confined to git-ignored `verify/tmp/` on E:; nothing written to C:.

**Documented supersession (1 — a deviation from DoD item 2’s “zero supersessions” promise, by the M6 precedent):** `test/loadmodel.test.js` asserted the catalog’s exact key list `['point','udl','linear']`; adding the fourth descriptor to `LOAD_TYPES` made that assertion false by construction, so the test now asserts the four-entry catalog and its title records the supersession. No other existing test was edited. The interaction-guard edits are an *extension* its own header mandates (“any new handle type must update all three consistently”), not a supersession: the accepted-role set grew by `'profile-point'` and the single-rename invariant still holds.

**Anchor count clarification:** §9 predicted the multi-load functional anchor at “21/21”; the M6.5 commit’s final state on disk is 22 checks (the drag-regression block includes its state-restore check). The harness file is untouched by M7 — today’s green run is 22/22 on the unmodified anchor.

**Decisions taken during implementation:**
1. **The emit rule lives in `loadmodel.emitDescriptor`** (pure, exported, unit-tested) rather than inside app.js — the single home the plan demands, and directly testable against the frozen descriptor shapes. The UI’s internal model of every distributed load is the point list; flat editor fields are views onto points 1 and 2.
2. **Editor mapping (owner refinement, §13):** the shape-point table is the *only* editor of a 3+-point load; a two-point load keeps the flat M5 editor plus the shared **+ Add point** button — because the M5 anchor asserts `ctl-w1` visible for any distributed selection. The editor always mirrors the emitted kind (no parallel modes).
3. **`+ Add point` inserts at the widest segment’s midpoint** inheriting the left neighbour’s intensity: a right-end append would be a silent no-op whenever the load reaches the span end, and a collinear insertion never jumps the shape.
4. **Drag/keyboard pin the point OBJECT, not its index:** `clampPoints()` may re-sort mid-gesture (a step dragged past its partner); an index would silently follow a different point. The keyboard path writes the new index back onto the handle after each mutation. Caught before shipping by combining the extended source guard with the synthesized-drag CDP checks.
5. **`profileKernels` skips zero-intensity stretches:** the gap case (Case C) divides by `w1 + w2 = 0` inside `linearKernels` and yields NaN — skipping (they contribute nothing) fixes it; the tests caught this before the browser run.
6. **Band scaling constants (`BAND_Y_BASE`, `BAND_MAX_H`) are exported from renderm3.js** as the single home of the intensity ↔ pixels conversion used in both directions (renderer down-scale, drag up-scale).
7. **A profile step emits one shear ordinate** (no jump pair) and every control-point `x` becomes a sampling event; the axis shows only step markers for lone profiles (M6’s uncluttered-axis lesson).

**Definition of done:**
1. ✅ New analytical tests green — `test/profile.test.js` (Cases A–G) and `test/ui-m7.test.js`.
2. ✅ All prior tests green — 100 of 102 byte-identical; 1 documented supersession (above) + 1 guard extension; `engine.js`/`render.js` byte-identical.
3. ✅ Functional CDP green — anchors 32/32 and 22/22 unchanged; `profile-cdp-verify.mjs` 30/30.
4. ✅ Layout audit clean — anchors 6/6 and 6/6; profile configurations 8/8 with 0 clip / 0 overlap (incl. the 6-point staircase and gap shapes).
5. ✅ Zero console errors across all headless-Edge harnesses.
6. ✅ Boundaries intact — frozen files byte-identical; source guards pass; zero new dependencies; nothing written to C:.
7. ✅ Written report + doc updates recorded (this section; readme/verify/AGENTS/dashboard/handoff).
8. ⬜ Committed only when the owner asks (hard rule 4).
