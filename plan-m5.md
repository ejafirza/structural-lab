# Milestone 5 Plan — Non-Uniform / Partial Distributed Load Laboratory

**Status:** PLAN ONLY — no code written. Awaiting your go-ahead before implementation.
**Predecessors:** M1 (point engine) → M2 (viz) → M3 (supports) → M4 (full-span UDL) — all complete & verified.

---

## 0. Recommendation summary (TL;DR)

- Model all three shapes with **one canonical "linear segment" load descriptor**
  `{ type: 'linear', start, end, wStart, wEnd }`, where `w(x)` varies linearly from
  `wStart` (at `start`) to `wEnd` (at `end`). The three named shapes are **presets** of
  this single model, not separate types:
  - **partial UDL** → `wStart = wEnd`
  - **triangular** → one endpoint = 0
  - **trapezoidal** → both endpoints > 0 and different
- Still **exactly one load** (no combined/superposed loads in M5).
- Solve determinately as before (simply supported + cantilever); classify
  indeterminate/unstable. Preserve M1–M4 byte-for-byte; keep all 55 tests green.
- Peak moment now requires **locating where V(x) = 0** — done **analytically**
  (quadratic root), not numerically.

---

## 1. Load representation & data model

Extend the descriptor catalog in `src/loadModel.js`:

| descriptor | fields | unit | milestone |
|---|---|---|---|
| `point` | `magnitude`, `position` | kN | M1 |
| `udl` | `intensity`, `start`, `end` (full-span) | kN/m | M4 |
| **`linear`** | `start`, `end`, `wStart`, `wEnd` | kN/m | **M5** |

`normalizeLoads` gains a `linear` branch and drops nothing: `point` and `udl` keep
their exact M1–M4 behavior. The `linear` descriptor enforces:
- `0 ≤ start < end ≤ span` (a valid sub-region)
- `wStart ≥ 0`, `wEnd ≥ 0`, not both zero (downward positive)

Internal intensity: `w(x) = wStart + (wEnd − wStart)·(x − start)/(end − start)` on the
region, `0` outside.

---

## 2. Equivalent resultant force & centroid (the universal reduction)

Every distributed load reduces, for **reactions**, to a single resultant `R` at its
centroid `x̄`. For a linear segment of length `b = end − start`:

- `R = (wStart + wEnd) · b / 2`  (area of the trapezoid)
- `x̄ = start + b · (wStart + 2·wEnd) / (3·(wStart + wEnd))`

Sanity checks (validate the formula is right):
- rectangle (`wStart = wEnd`): `x̄ = start + b/2` ✓
- triangle peak-right (`wStart=0`): `x̄ = start + 2b/3` ✓
- triangle peak-left (`wEnd=0`): `x̄ = start + b/3` ✓

---

## 3. Reaction calculation

**Simply supported** (pin A, roller B): the resultant acts at `x̄`, so

- `RA = R·(L − x̄)/L`
- `RB = R·x̄/L`

**Cantilever fixed-left:** `V_A = R`, `H_A = 0`, `M_A = R·x̄` (hogging).
**Cantilever fixed-right:** `V_B = R`, `M_B = R·(L − x̄)`.

Reactions are therefore **shape-independent** — they only see `(R, x̄)`. This is the
seam that later lets an arbitrary `w(x)` solver drop in: it would compute `(R, x̄)` by
quadrature, and everything downstream stays identical.

---

## 4. SFD / BMD generation (piecewise closed form)

Three regions `[0, start)`, `[start, end]`, `(end, L]`, with closed-form integration:

| region | `w(x)` | shear `V(x)` | moment `M(x)` |
|---|---|---|---|
| `x < start` | 0 | `RA` (constant) | `RA·x` (linear) |
| `start ≤ x ≤ end` | linear | quadratic | cubic |
| `x > end` | 0 | `−RB` (constant) | `RB·(L−x)` (linear) |

- `V(x) = RA − C(x)` where `C(x) = ∫ w` (cumulative load).
- `M(x) = RA·x − D(x)` where `D(x) = ∫∫ w` (first moment of load left of `x`).
- `dV/dx = −w`, `dM/dx = V` hold piecewise (tested).

---

## 5. Piecewise functions & discontinuities (what changes, what doesn't)

- **Load intensity `w(x)`**: jumps at `start` and `end` (0 → `wStart`, `wEnd` → 0);
  for a triangle one end is continuous (a kink) instead of a jump.
- **Shear `V(x)`**: **continuous** (no jump — unlike a point load); its *slope*
  `dV/dx = −w` has discontinuities at `start`/`end`, i.e. `V` has **kinks** there.
- **Moment `M(x)`**: continuous **and** smooth (no kink, since `V` is continuous);
  its *curvature* changes at `start`/`end`.
- **No `shearJump`** for any distributed load (the field stays absent, as in M4).

**Peak moment** occurs where `V(x) = 0`. Because `V` is strictly decreasing through
the loaded region (`V(start) = RA > 0`, `V(end) = −RB < 0`), the zero is unique and
inside `[start, end]`:
- partial UDL → `V` linear → root `x = start + RA/w` directly;
- triangular/trapezoidal → `V` quadratic → root via the **quadratic formula**.

Then `Mmax = M(root)`. The sampling grid must include `start` and `end` (like M1/M4
include the point-load position) so the renderer draws the kinks faithfully.

---

## 6. UI — manipulating the load region & intensity

The load-type selector grows. Proposed control model (final layout decided in
implementation):

- **Shape** preset: Point · UDL (full-span) · **Partial UDL** · **Triangular** ·
  **Trapezoidal**.
- **Region `[start, end]`**: two sliders/inputs, plus two **draggable handles** on the
  beam marking the loaded region (same drag machinery as the point load, extended to two
  handles with `start < end` enforced).
- **Intensity**:
  - partial UDL → `w` (one value);
  - triangular → peak `w0` + a "peak at left/right" toggle;
  - trapezoidal → `w1`, `w2` (two endpoint values).

Because all three shapes are one `linear` model, the UI presets just pin the endpoint
values (`wStart = wEnd`, or one = 0) and expose the free ones. The engine stays the sole
source of every number (the UI emits the descriptor, never computes `R`/`x̄`/`M`).

---

## 7. Visualization of the load shapes

All drawn as SVG polygons/paths from the descriptor (geometry only, no engineering math):

- **Partial UDL**: shaded **rectangle** over `[start, end]` + down arrows + `w = … kN/m`.
- **Triangular**: filled **triangle** over `[start, end]`, peak at the marked end +
  down arrows + `w0 = … kN/m` at the peak.
- **Trapezoidal**: filled **trapezoid** over `[start, end]` + down arrows + `w1`/`w2`
  labels at each end.

SFD/BMD renderers already plot the engine's sampled piecewise arrays, so they
generalize with no change; only the beam-panel load shape and the SFD region labels
need updating.

---

## 8. Analytical test cases (closed-form, per shape)

**Partial-span UDL, simply supported** — `L=6`, `w=2` over `[1, 5]`:
`R=8`, `RA=RB=4`, `V: 4 → (4−2(x−1)) → −4`, `M: 4x / 4x−(x−1)² / 4(6−x)`,
`Mmax = 8` at `x = 3` (where `V=0`).

**Triangular, full-span, peak-left** — `L=6`, `w0=6` over `[0, 6]`:
`R=18`, `x̄=2`, `RA=12`, `RB=6`; `V(x)=12−6x+x²/2`, `Mmax` at `x=6−2√3≈2.536`.

**Trapezoidal, full-span** — `L=6`, `w: 2→4`:
`R=18`, `x̄=10/3`, `RA=8`, `RB=10`; peak at the quadratic root of `V=0`.

**Cantilever** (each shape): `V_A=R`, `M_A=R·x̄` (hogging); mirror for fixed-right.

**Cross-checks:**
- `linear` with `wStart=wEnd=w`, `start=0`, `end=L` **reproduces M4's full-span UDL**
  exactly (regression).
- point-load and full-span-UDL paths still match M1/M4.

**Relations & scaling:** `dM/dx=V`, `dV/dx=−w`; reactions linear in intensity,
`Mmax ∝ L²`.

**Honesty:** indeterminate/unstable + `linear` → classification only (no reactions /
diagrams); `totalLoad = R` still shown (load property).

**Validation:** `wStart/wEnd ≥ 0` (not both 0), `start<end` within `[0,L]`, exactly one
load, unknown type throws.

---

## 9. Architecture → future arbitrary `w(x)` numerical solver (seams only)

M5 lays the seams without building the numerical solver:

1. **Piecewise-linear segments** are the canonical form; a future arbitrary `w(x)` is
   just *many* small `linear` segments. The `loads` array already holds an array.
2. **`(R, x̄)` reduction** is load-shape-independent: a future solver computes `(R, x̄)`
   by quadrature and reuses the identical reaction logic.
3. **Diagram integrator boundary**: `sampleDiagrams(loads, grid)` is where closed-form
   integration lives; a future numerical integrator (trapezoidal/Simpson) swaps in
   behind the same interface.
4. **Peak via `V=0`**: M5 solves analytically; the future solver finds the same zero by
   bisection. The "find where `V` crosses zero, evaluate `M`" contract is shape-free.
5. **Descriptor polymorphism** (typed descriptors + dispatcher) already routes by
   `type`; a future `piecewise`/`curve` type slots in as one more descriptor + solver.

**None of this is implemented in M5** — the plan only ensures M5 doesn't paint us into
a corner.

---

## 10. Explicitly out of scope (M5)

- Arbitrary curves / analytic `w(x)` functions.
- Numerical integration (quadrature).
- Multiple / combined loads (superposition, >1 segment, point + distributed together).
- Deflection / E·I / compatibility method.
- AI.
- Moving loads, influence lines, overhanging beams, applied moments, non-prismatic
  beams (unchanged from prior milestones).
