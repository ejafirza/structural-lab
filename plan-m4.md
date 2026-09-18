# Milestone 4 Plan — Distributed Load Laboratory (UDL)

**Status:** PLAN ONLY — no code written. Awaiting your go-ahead before implementation.
**Predecessor:** M1 (point-load engine) → M2 (interactive viz) → M3 (support & boundary-condition lab) — all complete & verified.

---

## 0. Recommendation summary (TL;DR)

- **M4 = full-span UDL only** — a uniform load `w` (kN/m) over the *entire* span `[0, L]`.
- **Partial-span UDL → deferred to M5** (reasoning in §2).
- Solve the two **determinate** cases (simply supported, cantilever); **classify** indeterminate/unstable — exactly the M3 discipline.
- Generalize via a **load descriptor + dispatcher**, keeping M1–M3 solvers and all 33 tests **byte-for-byte frozen**.
- Sign conventions unchanged: sagging positive; BMD drawn tension-side (sagging below, hogging above).

---

## 1. Full-span UDL — the M4 scope

A uniformly distributed load of intensity `w` (kN/m, downward positive) applied across the
whole span. Its statically-equivalent total is `W = w·L` acting at the span midpoint.

Because the load is everywhere, the beam has a **single continuous domain**: shear is a
straight line, bending moment a single parabola. This is the cleanest possible teaching
case for "distributed load → linear shear → parabolic moment", which is the whole point
of this milestone.

---

## 2. Partial-span UDL — same milestone? **No. Defer to M5.**

| | Full-span UDL (M4) | Partial-span UDL (M5) |
|---|---|---|
| Domains | 1 (whole span) | 2–3 (inside vs outside the load) |
| Shear | one straight line | piecewise linear (3 segments) |
| Moment | one parabola | parabolic *under* the load, linear *outside* |
| Peak moment location | always midspan | **solves from V(x) = 0**, may fall inside *or* outside the loaded length — must be found, not assumed |
| Reaction by | symmetry | moment of the load's *centroid* |

Partial-span UDL is a materially harder lesson (piecewise statics + locating the peak by
solving where shear crosses zero). Folding it into M4 would blur the single concept M4
exists to teach and roughly double the test surface. **Keep M4 = full-span; make
partial-span M5.**

---

## 3. Mathematical representation of distributed loading

- **Intensity** `w` in **kN/m**, **downward positive** (consistent with the point load `P`
  being a downward magnitude).
- **Total load** `W = w · L` (kN), acting at the centroid of the loaded length.
- **Governing differential relations** (standard beam theory):
  - `dV/dx = −w`  (slope of shear = minus load intensity)
  - `dM/dx = V`   (slope of moment = shear)
  These are exactly what makes shear *linear* and moment *parabolic* under a UDL.
- **Load descriptor** (the data object the engine consumes):
  ```js
  { type: 'udl', intensity: w, start: 0, end: L }   // M4: start=0, end=L always
  ```
  Mirroring the point-load descriptor `{ type: 'point', magnitude: P, position: a }`.

---

## 4. Reaction calculation (closed form)

**Simply supported (pin A · roller B):** by symmetry, or from statics —

- `RA = RB = w·L / 2`

**Cantilever (fixed A · free B):**

- `V_A = w·L`, `H_A = 0`, `M_A = w·L² / 2`  (reaction moment, **hogging**)

**Cantilever (free A · fixed B)** — the mirror:

- `V_B = w·L`, `M_B = w·L² / 2` at the right end

Equilibrium self-check: `ΣFy = RA + RB − wL = 0`, `ΣM = RB·L − (wL)(L/2) = 0`.

---

## 5. SFD / BMD generation (closed form, then sample)

**Simply supported:**

- Shear (linear): `V(x) = w(L/2 − x)` — from `+wL/2` at A, crossing zero at `L/2`, to `−wL/2` at B.
- Moment (parabolic): `M(x) = (w/2)·x·(L − x)` — `M(0)=M(L)=0`, peak `Mmax = wL²/8` at `x = L/2` (**sagging**).

**Cantilever, fixed left:**

- Shear (linear): `V(x) = w(L − x)` — from `+wL` at the fixed end to `0` at the free end.
- Moment (parabolic): `M(x) = −(w/2)(L − x)²` — from `−wL²/2` at the fixed end to `0` at the free end (**all hogging**).

The engine computes these **closed forms** (same philosophy as M1's `RA = P·b/L`), then
samples them onto the same uniform `x` grid it already uses. **No shear jump** exists under
a UDL (shear is continuous), so the `shearJump` field is simply absent/null for UDL — the
result shape is otherwise identical to a point-load solve.

---

## 6. UI representation & manipulation

- **Load-type selector** (new): `Point load` ↔ `UDL`. When UDL is selected:
  - the `P (kN)` and `position a` inputs are **hidden**;
  - a new **`w (kN/m)`** number+slider appears (full-span ⇒ no position/start/end controls).
- **Beam diagram**: replace the red point arrow with a **shaded band** above the beam
  spanning `[0, L]`, a few evenly-spaced downward arrows, and a label `w = 2 kN/m`
  (green/teal to distinguish it from the red point load). The draggable-handle logic is
  simply not shown for UDL.
- **SFD/BMD panels**: unchanged plotting (they already consume the engine's sampled
  arrays). Only the SFD's two "plateau" labels are point-load-specific — for UDL these
  become **end-shear + zero-crossing** labels (`V_A`, `V_B`, `V=0 at x=L/2`).
- **Readout cards**: reaction cards and the Mmax card (with `sagging`/`hogging` sign) are
  already generic. The `load arm a/b` cards are replaced by `Intensity w` and
  `Total load W = w·L` (W computed by the engine, not the UI).
- **Determinacy badge / classification note**: unchanged (support classification is
  independent of the load type).

---

## 7. Generalizing the point-load architecture without breaking M1–M3

The guiding rule stays: **the engine is the single source of truth; the UI never computes
engineering values.**

1. **Load descriptor + normalization.** Introduce a small `loads` array of descriptors
   (`{type:'point',…}` or `{type:'udl',…}`). `analyzeBeam` normalizes every accepted input
   into it; the existing M3 call `analyzeBeam({span, load, position, supports})` is kept as
   a **backward-compatible shorthand** that normalizes to a single point descriptor — so
   M3's UI and tests are untouched.
2. **Dispatcher, keyed on load type.** After the (unchanged) support classification, route:
   `point →` reuse the frozen M1 solver; `udl →` new `solveUDL` module. This mirrors the
   M3 support-classifier pattern.
3. **Frozen modules stay frozen.** `src/engine.js` (M1) and the M3 solver path are not
   modified; the 33 existing tests remain regression anchors and must keep passing.
4. **Uniform result shape.** `{kind, input, classification, reactions, diagrams, maxMoment,
   equilibrium}` is unchanged, so the renderer's core (SFD/BMD/reactions/badge) stays
   load-agnostic — only the *beam-panel load drawing* and *SFD labels* become
   load-type-aware.
5. **New files:** `src/loadModel.js` (catalog + normalization + validation) and
   `src/solvers/udl.js` (or a `solveUDL` in `src/analysis.js`). Renderer gains a
   load-type branch; it remains **formula-free** (it reads the engine's sampled arrays and
   the echoed load descriptor — never re-derives `w`, `L`, `W`).
6. **Sign conventions untouched:** sagging positive in the engine; BMD tension-side
   (sagging below, hogging above) in the renderer — both already handled for the negative
   (hogging) cantilever moment, so no BMD renderer math changes.

---

## 8. Analytical test cases (closed-form, textbook values)

All expected values below are independent textbook results, not engine round-trips.

**Simply supported, L = 6 m, w = 2 kN/m:**
- `W = 12 kN`, `RA = RB = 6 kN`
- Shear `V(x) = 2(3 − x)`: `V(0)=+6`, `V(3)=0`, `V(6)=−6`
- Moment `M(x) = x(6 − x)`: `M(0)=M(6)=0`, `M(3)=9` → `Mmax = wL²/8 = 9 kNm`, sagging, at `x = 3`
- `dM/dx = V` and `dV/dx = −w` hold numerically
- Equilibrium `ΣFy = 0`, `ΣM = 0` (satisfied)

**Cantilever fixed-left, L = 6 m, w = 2 kN/m:**
- `V_A = 12 kN`, `H_A = 0`, `M_A = wL²/2 = 36 kNm`
- Shear `V(x) = 12 − 2x`: `V(0)=+12`, `V(6)=0`
- Moment `M(x) = −(6−x)²`: `M(0)=−36`, `M(6)=0` → `Mmax = 36 kNm`, **hogging**, at `x = 0`

**Cantilever fixed-right (mirror):** `M_B = 36 kNm` at `x = 6`, shear `0 → −12`, moment `0 → −36`.

**Scaling:** doubling `w` doubles reactions & `Mmax` (linear in `w`); doubling `L`
quadruples `Mmax` (`∝ L²`).

**Cross-check:** `analyzeBeam` UDL reactions sum to `W`; a `point`-load result still
reproduces the frozen M1 numbers exactly.

**Honesty:** indeterminate (`pin+pin`) and unstable (`free+free`) with a UDL still return
`classification` only — no fabricated reactions/diagrams.

**Input validation:** `w > 0`, `span > 0`, valid `supports`, `samples ≥ 2`, unknown load
type throws.

---

## 9. Explicitly out of scope (M4)

- **Partial-span UDL** (→ M5) — piecewise domains + peak-location search.
- **Arbitrary distributed loads**: triangular, trapezoidal, non-uniform `w(x)`.
- **Multiple / combined loads**: point + UDL superposition, multiple point loads.
- **Moving loads**, influence lines, load envelopes.
- **Deflection / E·I / compatibility method** (needed to actually *solve* indeterminate cases).
- **Overhanging beams**, applied external moments, non-prismatic / curved / tapered beams.
- **Self-weight / unit-weight inputs**, unit conversion, materials or section properties.
- **AI** — the tutor layer stays postponed; the engine remains deterministic.
