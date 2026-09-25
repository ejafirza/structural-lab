# Milestone 6 Plan — Combined / Multiple Downward Loads (Superposition)

**Status:** IMPLEMENTED — owner-approved (plan review, 25 Sep 2026); implementation record in §14.
**Predecessors:** M1 (point engine) → M2 (viz) → M3 (supports) → M4 (full-span UDL) → M5 (linear descriptor + UI consolidation) — all complete & verified (77/77 unit tests, 32/32 functional + 6/6 layout CDP checks).

---

## 0. Recommendation summary (TL;DR)

- **M6 = multiple downward loads on one beam**: any mix of the two existing load concepts (point, distributed), solved by **superposition** over the `loads` array that has existed since M4/M5.
- Reactions depend only on the summed resultant: `R = ΣRᵢ`, `x̄ = ΣRᵢx̄ᵢ / R`. Shear/moment are built from per-load closed-form kernels: `V(x) = RA − ΣCᵢ(x)`, `M(x) = RA·x − ΣFᵢ(x)`. All closed-form — **no numerics, no new dependencies**.
- **Single-load inputs keep the exact frozen M1/M4/M5 solver paths.** Dispatcher rule: `loads.length === 1` → existing per-type solvers, byte-for-byte; `loads.length ≥ 2` → new combined solver. `src/engine.js` and `ui/render.js` remain untouched.
- UI grows a **load list** (one row per load; add / select / remove). The single-load UI becomes the one-row case — no new modes, no parallel editors. The **combined resultant `R, x̄`** is drawn once on the beam: N loads → one equivalent force (the M6 lesson).
- Deterministic-engine boundary unchanged: the engine computes every number; renderers only draw (source-guard tests keep enforcing). Zero-dependency constraint unchanged (Node stdlib, `node --test`, vanilla SVG).
- Two proposed boundary rules, flagged for owner review (§13): **1–6 loads** (cap keeps the layout honest), and the list can never be empty (min 1). One existing test assertion (`exactly one load is enforced`) is deliberately superseded and rewritten — documented here, not done silently.

---

## 1. Scope and why superposition is valid here

A beam carries **any number (1–6) of downward loads** — point loads `Pᵢ` at `aᵢ`, and/or distributed loads (full-span UDL, partial UDL, triangular, trapezoidal — all the existing `linear`/`udl` descriptors) on regions `[x₁, x₂]`.

Superposition applies because all three solved structure classes (simply supported, cantilever fixed-left, cantilever fixed-right) are **statically determinate and linear**: reactions are linear in the loads, and internal forces from several loads are the sum of the internal forces from each load alone. Superposition is used **only on determinate structures**; indeterminate/unstable cases remain classify-only (honesty rule unchanged). Only **downward** loads are in scope (magnitudes ≥ 0, as today) — upward loads, applied moments and moving loads stay out (§11).

---

## 2. Data model

The descriptor catalog is unchanged; what changes is the **count rule** on the array.

| descriptor | fields | unit | since |
|---|---|---|---|
| `point` | `magnitude`, `position` | kN | M1 |
| `udl` | `intensity`, `start=0`, `end=span` | kN/m | M4 |
| `linear` | `start`, `end`, `wStart`, `wEnd` | kN/m | M5 |

- `normalizeLoads` (src/loadmodel.js) accepts an array of **1..MAX_LOADS** (proposed `MAX_LOADS = 6`, exported as a constant). `< 1` or `> MAX_LOADS` → `RangeError`; non-array → `TypeError`. Per-descriptor validation is untouched (same functions, same error types).
- **No cross-load constraints**: overlapping or adjoining distributed regions are valid (superposition sums them); a point load may sit exactly on a region boundary or inside a region. Loads keep their **input order** (results are order-independent; a test proves it — no hidden reordering).
- The legacy `{load, position}` point shorthand stays accepted exactly as today (M1–M3 back-compat).
- Engine result for a multi-load solve: `kind: 'beam-multi-load'`; `input.loads` = canonical descriptor array; **no legacy echoes** (`load/position/b`, `intensity`, `totalLoad` are emitted only by the unchanged single-load paths).
- `resultant` keeps one definition for every case: **the beam's total equivalent single force** — `{ value: R, position: x̄ }` with `R = ΣRᵢ`, `x̄ = ΣRᵢx̄ᵢ/R`. For one load this is byte-identical to today's per-load resultant.

---

## 3. Superposition equations

**Per-load kernels** (closed form; the M5 seam pays off — only two kernel families are needed):

- *Point load* `Pᵢ` at `aᵢ`:
  `Cᵢ(x) = Pᵢ·H(x − aᵢ)` (0 for `x ≤ aᵢ`, else `Pᵢ`) — cumulative load;
  `Fᵢ(x) = Pᵢ·max(0, x − aᵢ)` — first moment of that load about `x`.
- *Distributed load* (`udl` or `linear`): reuse the frozen M5 `linearKernels(start, end, wStart, wEnd)` **verbatim** — `udl` is the special case `wStart = wEnd` over `[0, L]`. (`Cᵢ = ∫₀ˣ w`, `Fᵢ = ∫₀ˣ (x−t)w(t)dt`, piecewise linear/quadratic/cubic as in M5.)

**Combined quantities** (the entire multi-load solver is sums of these):

```
R  = ΣRᵢ            x̄ = ΣRᵢx̄ᵢ / R
RA = R·(L − x̄)/L    RB = R·x̄/L                       (simply supported)
V(x) = RA − ΣCᵢ(x)                                     (jumps of −Pᵢ at each aᵢ emerge from the step kernels)
M(x) = RA·x − ΣFᵢ(x)
equilibrium:  ΣFy = RA + RB − R;   ΣMz(A) = RB·L − R·x̄  (scale = R·max(1, L))
cantilever fixed-left:  V_A = R,  M_A = R·x̄ (hogging);  fixed-right mirror:  M_B = R·(L − x̄)
```

**Peak moment (simply supported, all-downward loads — analytic, no bisection).** `V(0⁺) = RA > 0` and `V` is **non-increasing** on `[0, L]` (`dV/dx = −w ≤ 0` between events; downward jumps `P` at points), so `M` is non-negative with its maximum where `V` transitions through zero. Candidate set, evaluated in closed form and maximized:

1. analytic `V = 0` roots **inside** each piecewise segment (linear root where `w` is constant or zero — reuses M5's `shearZeroInRegion` logic; quadratic formula under `linear` segments);
2. **every point-load position `aᵢ`** (the jump may straddle zero — `M` is continuous there);
3. segment endpoints (covers the degenerate `V ≡ 0` plateau without special-casing).

`Mmax = max M(candidates)`, sign `sagging`. For cantilevers the maximum `|M|` is at the fixed end (`M(x)` is monotone from `−M_A` to 0), closed form, exactly the existing cantilever pattern.

**Continuity table for combined loads** (extends the M5 boundary doctrine):

| quantity | at distributed boundary x₁/x₂ | at point load aᵢ |
|---|---|---|
| intensity w | jump (or kink) | — |
| shear V | C⁰, slope jumps (kink) | **jump of −Pᵢ** |
| moment M | C¹ (`dM/dx = V` continuous) | C⁰, **kink** (`dM/dx` jumps by −Pᵢ) |

**Sampling grid** includes **all** point positions and region boundaries (`includePoints` already takes an arbitrary list) plus the usual uniform grid, so every jump and kink is drawn faithfully.

---

## 4. Unchanged legacy behaviour (the frozen boundary)

- `src/engine.js` (M1) and `ui/render.js` (M2): **untouched, byte-for-byte**.
- Dispatcher rule in `analyzeBeam`: classification first (unchanged), then —
  - `loads.length === 1` → the **existing** per-type branches (`point` reusing the frozen M1 core; M4 `solveSimplySupportedUDL`/`solveCantileverUDL`; M5 linear solvers). Not one character of solver code changes.
  - `loads.length ≥ 2` → new `solveCombined(loads, …)` (proposed home: `src/analysis.js`, matching today's structure — flagged as an implementer's choice in §13).
- Legacy echoes (`load/position/b`, `intensity`, `totalLoad`) and `kind` values for single loads are unchanged; M1–M4 consumers and the frozen renderer are unaffected.
- Indeterminate/unstable with any load count: classification + note only; **no reactions/diagrams/maxMoment**; `resultant` (a load property) is still emitted — consistent with the honesty rule.
- **Test-anchor policy:** all 77 existing tests keep passing unchanged **except one deliberate supersession**: `loadmodel.test.js` "exactly one load is enforced" asserted `loads.length !== 1` throws. M6 rewrites that single test to assert the new **1..MAX_LOADS** rule (empty array and >6 still throw; non-array still throws). This is a documented spec change, not a silent regression; nothing else is edited.

---

## 5. Architecture — files touched

| file | change |
|---|---|
| `src/analysis.js` | add `solveCombined` + dispatcher branch (`loads.length ≥ 2`); doc-comment updates |
| `src/loadmodel.js` | accept 1..`MAX_LOADS`; export `MAX_LOADS`; message updates |
| `test/loadmodel.test.js` | rewrite the one-load guard test (documented supersession, §4) |
| `test/multi.test.js` | **new** analytical suite (§8 cases + cross-checks + derivatives + honesty + validation + order-independence) |
| `ui/app.js` | load-list state (add/select/remove); `analyzeInput` always sends the `loads` array; selection wiring; flat fields remain bound to the **selected** load |
| `ui/index.html` | list markup replaces the concept radio (§6); a11y hooks |
| `ui/renderm3.js` | iterate loads (draw each from its descriptor); numbered badges; drag handles on the selected load only; combined `R, x̄` arrow; multi-load x-axis labels — still **zero engineering math** |
| `ui/style.css` | list-row and badge styles |
| `test/ui-m6.test.js` | **new** render tests (fake DOM, ui-m5 pattern) |
| `verify/multi-load-cdp-verify.mjs` | **new** functional harness (§9) |
| `verify/multi-layout-check.mjs` | **new** multi-load layout configs (§9) |
| `verify/readme.md`, `readme.md` | harness/port docs, file map, test counts |
| `src/engine.js`, `ui/render.js` | **frozen — untouched** |

The plan initially proposed **new harness files only**, leaving the three existing harnesses untouched. During implementation that was corrected: the existing harnesses' *interaction layer* targets the M5 UI (`#concept-distributed` radio, concept-toggle assertions), which M6 replaces — extending their interaction layer (not their assertions/counts) was required to keep the M5 regression anchors meaningful. Documented in §14.

---

## 6. UI / load-list interaction design

Guided by the standing preference (general internal models, minimal controls): the beam stays the primary workspace; the single-load UI **is** the one-row list, so today's experience is the degenerate case, not a separate mode.

- **Load list** in the Model panel: one row per load — type glyph + summary ("P = 10 kN @ 2 m" / "w: 2→2 kN/m over [1, 5]") + a remove button. Rows are selectable; the **selected** load's editor is exactly today's editor (point fields, or distributed fields + preset chips — presets keep filling the single distributed editor).
- **Adding:** two small buttons, **+ Point load** and **+ Distributed load**, append a sensibly-defaulted load and select it (disabled with a tooltip at the 6-load cap). The current two-radio "Load concept" toggle becomes redundant (rows already carry the concept) and is **replaced** by these buttons — flagged for owner's call in §13, with a keep-the-radio fallback if preferred.
- **Removing:** the last remaining row's remove button is disabled (the list never empties — avoids a meaningless zero-load beam and keeps engine/UI edge cases out).
- **Beam ↔ list link:** clicking/dragging a load on the beam selects its row; the selected load shows its drag handles (point arrow, or the two dashed region handles); other loads draw plain. Focus follows selection in both directions.
- **Combined resultant:** the dashed teal `R, x̄` arrow is drawn **once**, from the engine's combined `resultant` — the "replace everything with one force" payoff. For a single distributed load this is identical to today's M5 drawing. Per-load `R/x̄` labels are deliberately **not** added for N > 1 (label crowding; §13 notes it as a possible follow-up).
- **Labels:** each load drawing gets a small numbered badge ("1", "2", …) matching its list row — ties rows to shapes without colour-coding. X-axis on SFD/BMD for multi-load shows `0`, `L`, and the peak `x` only; per-load positions live on the beam panel.
- SFD labels for multi-load use the end-shear style (`V` at 0⁺ and L⁻) — correct for any mix; the peak marker on the BMD already comes from the engine and is unchanged.
- Default state = one point load (P = 10 kN at 3 m) — byte-for-byte today's default screen.

---

## 7. Accessibility

- **List semantics:** rows are `<button>`s with `aria-pressed` (selection) — keyboard-operable natively (Tab / Enter / Space); the list container carries `aria-label="Load list"`. Remove buttons carry explicit `aria-label`s ("Remove load 2 — point load 3 kN at 3 m").
- **Focus management:** after add → focus the new row; after remove → focus the neighbouring row. No focus traps.
- **SVG handles:** each keeps `tabindex="0"` with an extended `aria-label` naming the load ("Load 2 of 3 — point load, 3 kilonewtons at 3 metres — drag, or focus and use arrow keys, to move"). Handles exist only on the selected load, keeping the Tab path short. Arrow-key nudging (0.1 m) unchanged.
- **Live announcements:** a visually-hidden `aria-live="polite"` status region announces list changes ("Load added — 3 loads total"); the existing live badges (determinacy, equilibrium) continue to announce solution changes.
- **Not colour-only:** numbered badges + list summaries identify loads; palette unchanged (existing contrast behaviour); no new animations (drag behaviour as today; nothing depends on motion).
- The layout audit (§9) doubles as the a11y guard for label clipping/overlap in multi-load states.

---

## 8. Analytical test cases (independently derived textbook values)

Every expected value below is hand-derived statics — not an engine round-trip. New file `test/multi.test.js`.

**Case A — point + full UDL, simply supported.** L = 6, P = 10 kN at a = 2, w = 2 kN/m.
R = 22 kN, x̄ = (10·2 + 12·3)/22 = **28/11 ≈ 2.545 m**. RA = 20/3 + 6 = **38/3 ≈ 12.667**, RB = 10/3 + 6 = **28/3 ≈ 9.333** (ΣFy: 22 ✓; ΣM: RB·6 = 56 = 10·2 + 12·3 ✓).
V(0⁺) = 38/3; V(2⁻) = 26/3; **jump at x = 2 straddles zero** → V(2⁺) = −4/3; V(6⁻) = −28/3 = −RB.
**Mmax = 64/3 ≈ 21.333 kNm at x = 2 (sagging)** — at the jump, *not* under either load's individual peak. Superposition holds **pointwise** (M(2) = point-alone M(2) + UDL-alone M(2) = 40/3 + 8 = 64/3 ✓), **not between maxima** — the UDL's own peak is wL²/8 = 9 at midspan, and 40/3 + 9 ≠ 64/3. *(The review draft's "superposition check" wording implied Mmax values sum; corrected during implementation.)*

**Case B — two point loads, simply supported.** L = 6, P₁ = 6 kN at 2, P₂ = 3 kN at 4.
RA = (6·4 + 3·2)/6 = **5**, RB = (6·2 + 3·4)/6 = **4** (ΣFy: 9 ✓).
V: +5 → jump −6 at 2 → **−1 plateau** on (2, 4) → jump −3 at 4 → −4 = −RB.
M(2) = **10 kNm** (peak), M(4) = 8 kNm. R = 9, x̄ = 8/3 ≈ 2.667.

**Case C — point load inside a distributed region, simply supported.** L = 6, w = 2 on [1, 5], P = 3 kN at x = 3.
RA = RB = 4 + 1.5 = **5.5** (total 11 ✓). V(3⁻) = 1.5, jump → V(3⁺) = −1.5 → peak at the jump: **Mmax = 12.5 kNm at x = 3**. Superposition check: 8 (partial UDL alone, M5 case) + 4.5 (point alone) ✓.

**Case D — peak between the loads (not at either).** L = 6, P = 4 kN at x = 1, w = 3 full span.
RA = 10/3 + 9 = **37/3**, RB = 2/3 + 9 = **29/3** (ΣM: RB·6 = 58 = 4·1 + 18·3 ✓).
V(1⁺) = 16/3; V = 0 at x = 1 + 16/9 = **25/9 ≈ 2.778** (inside the UDL).
**Mmax = 841/54 ≈ 15.574 kNm at x = 25/9** — verified from both sides ((37/3)(25/9) − 4(16/9) − (3/2)(25/9)² = (29/3)(29/9) − (3/2)(29/9)² = 841/54). M at the point load = 37/3 ≈ 12.33 < 15.57, proving the peak is not at the load.

**Case E — cantilever, multiple loads.** Fixed-left, L = 6, P = 10 at x = 4, w = 2 full span.
**V_A = 22 kN, M_A = 10·4 + 12·3 = 76 kNm (hogging)** at x = 0; M(4) = −4 kNm; M(6) = 0 (free end ✓). Fixed-right mirror: M_B = 10·2 + 12·3 = 56 kNm at x = 6. *(The plan review draft said 76 for the mirror — an arithmetic slip caught by the tests: the mirror arm is L − a = 2, and M_B = R·(L − x̄) = 22·33/11 = 56. Corrected during implementation.)*

**Case F — overlapping distributed regions, simply supported.** L = 6; w = 2 on [1, 5] (R = 8, x̄ = 3) + w = 1 on [3, 6] (R = 3, x̄ = 4.5).
RA = 4 + 0.75 = **4.75**, RB = 4 + 2.25 = **6.25** (ΣFy: 11 ✓; ΣM: 6.25·6 = 37.5 = 8·3 + 3·4.5 ✓).
V = 0 where 9.75 − 3x = 0 → **x = 3.25** (inside the overlap, both loads active). **Mmax = 10.34375 kNm** (4.75·3.25 − (2.25)² − (0.25)²/2), cross-checked against the two single-load solutions summed at x = 3.25: 7.9375 + 2.40625 ✓.

**Case G — honesty with multiple loads.** pin+pin (2 loads) and free+free (2 loads) → classification only; `reactions`/`diagrams`/`maxMoment` absent; combined `resultant` still present (load property).

**Case H — cross-checks, order-independence, derivatives.**
- Single-load **array** input ≡ legacy paths at 1e-12 (point ≡ M1, full-span `linear` w₁=w₂ ≡ M4 UDL, `linear` ≡ M5) — proves the dispatcher routing.
- Same 2–3 loads in permuted order → identical reactions/diagrams (tolerance deep-equal).
- `dM/dx = V` and `dV/dx = −w` on uniform stencils (M5's central-difference discipline; skip stencils broken by inserted boundary/jump nodes).
- Scaling: doubling every intensity doubles reactions and Mmax (linearity).
- Validation: empty array, 7 loads, unknown type, per-descriptor errors — correct error types.

---

## 9. Browser verification additions

Pattern-faithful, freeze-friendly: **new harness files**, existing ones untouched (so 32/32 and 6/6 remain pure M5 regression anchors — the default single-load screen is unchanged and they must keep passing).

- **`verify/multi-load-cdp-verify.mjs`** (functional, headless Edge over CDP, own server spawn, debug port 9341, litter in git-ignored `verify/tmp/` on E:). Draft checklist (~12–14 checks): add second point load → cards read **5 kN / 4 kN / 10 kNm** with combined **R = 9 kN**, **x̄ = 2.67 m** on the beam; add full UDL to a point load → **12.7 kN / 9.33 kN / 21.3 kNm**, **R = 22 kN**, **x̄ = 2.55 m** (fmt 3-sig-fig strings asserted verbatim); select a row → handles move to that load; remove a load → previous numbers return; list summary text matches; indeterminate with 2 loads → "–" cards + combined R still on beam; zero console errors/exceptions. Final count recorded in the report.
- **`verify/multi-layout-check.mjs`** (getBBox audit, same technique): multi-load configs — two point loads (crowded labels), point + full UDL, point inside a distributed region, 3-load worst case, selected vs unselected handle rendering — assert **0 overflow, 0 overlaps** in all three SVG panels.
- Existing harnesses re-run as anchors: `consolidation-cdp-verify` (32/32), `consolidation-layout-check` (6/6), `node --test` (77 + new).
- `verify/readme.md` updated (new harness, port 9341). No new dependencies; nothing ever written to C:; Edge path unchanged.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Beam/SFD label collisions grow with N loads | Numbered badges, handles on selected load only, combined-R-only arrow; extended getBBox layout audit is a **hard DoD gate** |
| Renderer assumes a single `shearJump` object | Multi-load results emit **no** `shearJump`; jump pairs already emerge as two sample points per `aᵢ` (sorted by x); renderer multi-branch uses end-shear labels; single-load paths untouched |
| Peak-moment edge cases (jump exactly at zero, V ≡ 0 plateau) | Candidate set includes all `aᵢ` **and** segment endpoints; monotonicity of V (all-downward) proved in §3; Cases A/D/F exercise the three regimes |
| app.js state migration bugs (flat fields ↔ list) | Flat fields stay bound to the *selected* load; the list holds canonical descriptors; ui-m6 render tests + CDP list/selection checks |
| Float accumulation in sums | Equilibrium self-check scaled by `R·max(1, L)` (existing `equilibriumCheck` pattern); 1e-9/1e-12 tolerances; superposition cross-checks in every case |
| Scope creep (per-load styling, undo, templates) | Explicit out-of-scope list (§11); no new controls beyond list/add/remove |
| Test-anchor drift | The single superseded assertion is rewritten, documented here; the other 76 tests must pass unchanged |

---

## 11. Explicitly out of scope (M6)

Upward/negative loads · applied external moments/couples · moving loads & influence lines · load combinations/factors · overhanging beams & interior supports · deflection/E·I · arbitrary `w(x)` (the M5 seams stay ready; nothing numerical is built) · *solving* indeterminate structures · per-load resultant labels for N > 1 (possible follow-up) · AI tutor · persistence/undo-redo · any new dependency.

---

## 12. Definition of done (explicit)

1. **New analytical tests green** — `test/multi.test.js` (Cases A–H) + rewritten loadmodel guard + `test/ui-m6.test.js`.
2. **All prior regression anchors green** — the 77 existing tests pass unchanged except the one documented supersession (§4).
3. **Functional CDP green** — existing consolidation harness still 32/32 **and** new `multi-load-cdp-verify.mjs` fully passing (final count in the report).
4. **Layout audit clean** — existing 6/6 + 5-preset audits unchanged-green **and** new multi-load configs 0-clip/0-overlap.
5. **Zero console errors** across all headless-Edge harnesses.
6. **Boundaries intact** — `src/engine.js` and `ui/render.js` byte-identical; source-guard tests prove the UI still contains no engineering formulas; zero new npm dependencies; nothing written to C:.
7. **Written report** of what changed, plus doc updates (readme file map/test counts, verify/readme, AGENTS quick-reference counts, dashboard.md frontmatter + milestone ledger + `last_updated` bump — recorded only as work actually lands).
8. **Committed only when the owner asks** (hard rule 4).

---

## 13. Owner decisions (approved at plan review, 25 Sep 2026)

1. **Load cap = 6, minimum = 1** — approved.
2. **Replace the concept radio with "+ Point / + Distributed" buttons + list** — approved (per the consolidation preference).
3. **Combined-only resultant on the beam for N > 1** — approved; per-load R/x̄ labels remain a possible follow-up.
4. **New harness files for M6 verification** — approved, with the interaction-layer caveat corrected in §5/§14.
5. **Combined solver lives in `src/analysis.js`** — approved (matches current structure).

---

## 14. Implementation record (2026-09-25)

**Implemented and verified in full.** Working tree at `9c08be4` + M6 changes; commit made only on the owner's request.

### What changed

| file | change |
|---|---|
| `src/loadmodel.js` | count rule 1..`MAX_LOADS` (= 6, exported); error messages updated |
| `src/analysis.js` | `solveCombined` + `buildCombinedShear` + dispatcher branch (`loads.length ≥ 2` → `kind: 'beam-multi-load'`); legacy echo now also emitted for single-load **array** inputs (so the renderer's `b` dimension needs no arithmetic for array-form point loads) |
| `test/multi.test.js` | **new** — 14 analytical tests (Cases A–H incl. E2 mirror and H1–H6) |
| `test/loadmodel.test.js` | the documented supersession: one-load guard → 1..MAX_LOADS guard |
| `test/udl.test.js` | second documented supersession (found during the run, §14.3): the M5 assertion that *two* udl loads throw no longer holds |
| `ui/index.html` | load list (rows + add buttons + live region) replaces the concept radio |
| `ui/style.css` | load-list / badge / remove-button styles; `.visually-hidden` |
| `ui/renderm3.js` | per-load drawing with circled numbers ①–⑥; one role-less wrapper group per load (`data-load-index`), nested handles on the selected load only; combined R/x̄ drawn for every case except a lone point load; collision-aware label placement (`findFreeSpot`, pure geometry); multi-load SFD end-shear labels; uncluttered multi-load axis (0, x*, L) |
| `ui/app.js` | load-list state model (`state.loads`, `selectedLoad`, add/select/remove, list summaries, announcements); flat editor fields bound to the selected load; beam↔list selection linking |
| `test/ui-m6.test.js` | **new** — 8 render tests (fake-DOM pattern) |
| `verify/multi-load-cdp-verify.mjs` | **new** — 19 functional checks (add/select/remove, combined values, cap, honesty, zero console errors) |
| `verify/multi-layout-check.mjs` | **new** — 6 multi-load getBBox configs (0 clip / 0 overlap) |
| `verify/consolidation-*.mjs` | interaction layer only (concept radio → list equivalents); assertions & counts untouched — both still 32/32 and 6/6 |
| `readme.md`, `verify/readme.md`, `AGENTS.md`, `dashboard.md` | counts, file map, harness docs, state |

`src/engine.js` and `ui/render.js` **byte-identical** (verified via `git diff`).

### Verification results (final run)

- `node --test` → **99/99** (77 regression anchors − 1 rewritten guard + 1 superseded assertion retired + 14 multi + 8 ui-m6)
- `verify/consolidation-cdp-verify.mjs` → **32/32** · `verify/consolidation-layout-check.mjs` → **6/6** (M5 anchors intact)
- `verify/multi-load-cdp-verify.mjs` → **19/19** · `verify/multi-layout-check.mjs` → **6/6** (new)
- Zero console errors/exceptions in every headless-Edge run.

### Engineering notes (decisions taken during implementation)

1. **Jump-pair shear samples (engine fix found by tests).** The first combined implementation sampled one point per grid ordinate; M1's convention (two points at each `aᵢ`, left-limit then right-limit) is required for the renderer to draw the step and for the end-shear labels. `buildCombinedShear` restores it for combined beams.
2. **Segment-exact peak search (engine fix found by tests).** A per-load `shearZeroInRegion` call ignores other loads' intensity inside the region (Cases D/F). The final algorithm segments the span at every load event and fits the **exact** quadratic V on each segment from two interior samples (V is exactly quadratic there), solving the zero in the numerically stable conjugate form `t = 2·vStart/(w0 + √disc)` — no cancellation as the segment's curvature s → 0. All peaks are exact closed forms (e.g. Case D: x* = 25/9 to machine precision).
3. **Two test supersessions, both documented.** §4 planned the loadmodel guard rewrite; `udl.test.js`'s final assertion (two udl loads → RangeError) surfaced only when multi-load arrays became valid. Both are spec changes, marked in-file with plan-m6.md references.
4. **Combined resultant drawing rule (from the layout audit).** The combined R, x̄ arrow is drawn for every load group of 2+ and for every distributed load (the M5 behaviour); it is suppressed only for a lone point load, where R = P at a is the already-drawn load — the audit caught the redundant arrow colliding with the load's labels.
5. **Collision-aware labels.** Multi-load label stacking (predicted in §10) is solved with geometry-only occupancy tracking in the renderer: each label claims its preferred spot or falls back to side/laned alternatives, never outside the panel. Single-load layouts are unchanged (first candidate always free) — confirmed by the 6/6 M5 anchor.
6. **Harness robustness (environment, not product).** This workspace's shell exports `PORT=0`, which `server.js` honored — harness-spawned servers bound an ephemeral port and the checks hit nothing. All four harnesses now strip `PORT` from the child environment, skip internal `edge://` targets when attaching, wait for the app document to be live before evaluating, and always exit explicitly. No product code was changed for this.
7. **Derivative-test discipline extended.** The M5 "uniform stencils only" rule gains its multi-load sibling: central differences are also skipped when the node **or either neighbour** is a point-load position (M kinks there; the stencil would average across the kink), and shear is looked up by x (arrays no longer share indices once jump pairs exist).

### Definition of done — status

§12 items 1–6: **met** (evidence above). Item 7: this record + doc updates. Item 8: met — committed to the standalone repo on the owner's explicit request (25 Sep 2026); see the repo log for the commit.
