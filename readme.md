# Structural Lab

Interactive Structural Analysis Learning Laboratory — educational software for
civil/structural engineering students, built around the loop
**Experiment → Observe → Question → Understand**.

> **The engineering engine calculates. AI explains.** Deterministic mathematics
> produces every structural result; the AI tutor layer (a future milestone) will
> only ever interpret and explain those results — never compute them.

| Point load | Full-span UDL | Triangular load |
|---|---|---|
| ![Point load with draggable arrow, live SFD/BMD](docs/screenshot-point.png) | ![Distributed load with resultant R and centroid x̄ on the beam](docs/screenshot-udl.png) | ![Triangular load, analytic peak moment](docs/screenshot-triangular.png) |

## Status

- **Milestone 1 — complete**: deterministic engine (simply supported beam, one
  downward point load) + analytical test suite.
- **Milestone 2 — complete**: interactive visualization layer (beam, supports,
  draggable load, live SFD/BMD, reactions, equilibrium check).
- **Milestone 3 — complete**: support & boundary-condition laboratory
  (pin / roller / fixed / free; solves determinate, classifies indeterminate &
  unstable).
- **Milestone 4 — complete**: distributed load laboratory — **full-span UDL**.
  - Point load (`P`, kN) and UDL (`w`, kN/m) selectable; total load `W = w·L` (kN).
  - Linear shear, parabolic moment; sagging `wL²/8` (simply supported) and
    hogging `wL²/2` (cantilever) solved exactly.
- **Milestone 5 — complete**: non-uniform distributed loads (one `linear`
  descriptor) + UI consolidation.
  - **Two load concepts** in the UI: **point load** (`P` at `a`) and
    **distributed load** (one region `[x₁, x₂]` with endpoint intensities
    `w₁ → w₂`). Full UDL / partial UDL / triangular / trapezoidal are
    **presets** that fill the single distributed editor — not separate modes
    or control groups.
  - Every distributed load shows its **resultant `R`** (kN) and **centroid `x̄`**
    (m) **on the beam** (contextual), keeping the Results panel to reactions +
    Mmax.
  - Reactions from `(R, x̄)`; piecewise shear (quadratic inside) and moment
    (cubic inside) solved in closed form; peak moment at the analytic `V = 0`
    root. Full-span uniform `linear` ≡ M4 UDL.
- **Milestone 6 — complete**: combined / multiple downward loads (superposition).
  - Any mix of 1–6 loads (point + distributed together, several point loads,
    overlapping distributed regions) on the existing `loads` array.
  - Reactions from the **combined resultant** `R = ΣRᵢ`, `x̄ = ΣRᵢx̄ᵢ/R` —
    "N loads → one equivalent force" is drawn on the beam.
  - Shear `V(x) = RA − ΣCᵢ(x)` and moment `M(x) = RA·x − ΣFᵢ(x)` superpose
    closed-form kernels; point-load shear **jumps** and distributed-load
    kinks coexist in the sampled arrays. Peak moment found analytically on
    every segment (no numerics).
  - Load-list UI: one row per load (select / add / remove); the classic
    single-load editor is the one-row case. Numbered badges ①–⑥ tie the
    beam drawing to the list.
- Roadmap after M6: arbitrary `w(x)` (chained linear segments) → deflection /
  E·I (elastic curve) → UI consolidation pass → AI tutor layer.

## Quick start

Requires Node.js ≥ 18. Zero dependencies, no install step.

```bash
npm start      # start the app → http://localhost:8000 (browser opens)
npm test       # run the full automated suite (102 tests)
npm run demo   # ASCII text demo of the engine (Milestone 1)
```

> ⚠️ Open the app via `npm start`, not by double-clicking `ui/index.html` —
> browsers block ES-module imports over `file://`.

**Testing & quality:** 102 automated tests (`npm test`, Node's built-in runner —
analytical cases with independently known textbook values, render smoke tests
against a fake DOM, and static source guards proving the UI contains no
engineering formulas), plus headless-browser verification harnesses in
[`verify/`](verify/readme.md) (functional + layout audits, zero-console-error
checks). CI runs the suite on Node 20 and 22 against a case-sensitive
filesystem. Educational tool — **not** a professional design-verification
system.

## License

[MIT](LICENSE)

## What you can do

- **Pick a load concept**: **point load** (`P` at `a`, draggable arrow) or
  **distributed load** (one region `[x₁, x₂]` with endpoint intensities
  `w₁ → w₂`, two **draggable region handles**). **Preset chips** (Full UDL,
  Partial UDL, Triangular ▲/▼, Trapezoidal) fill the distributed editor — the
  beam stays the primary workspace.
- **Choose the two end supports** (A left, B right) from pin / roller / fixed /
  free — symbols, reactions and determinacy verdict update instantly.
- Adjust **span L**, **load magnitude**, and (for a point load) **position a**
  via sliders or number fields. Everything updates **immediately**.
- See the **determinacy badge**, the **reaction components** (H / V / M),
  **Mmax** (with sagging/hogging sign), and the engine's **equilibrium
  self-check** (ΣFx = ΣFy = ΣM = 0).
- For any distributed load, the **beam** shows **intensity `w₁ → w₂`**, the
  **resultant `R`** (equivalent single force) and its **centroid `x̄`** — the
  educational “replace the load with one force at its centroid” concept, drawn
  on the diagram rather than as separate result cards.
- Indeterminate / unstable cases explain *why* instead of fabricating numbers.

## Architecture

```
src/engine.js        deterministic point-load solver (PURE) — Milestone 1, FROZEN
src/supportmodel.js  support catalog + determinacy/stability classification — M3
src/loadmodel.js     load-type catalog + descriptor normalization (1..6 loads) — M4/M5/M6
src/analysis.js      analyzeBeam() dispatcher: point/UDL/linear solvers + combined (M6)
src/demo.js          ASCII demo of the engine (M1)
ui/index.html        shell + layout (load list since M6)
ui/app.js            state + input wiring + engine adapter (ONLY importer of the engine)
ui/render.js         M2 reference renderers (simply supported point load) — FROZEN
ui/renderm3.js       support- & load-aware renderers (multi-load drawing since M6)
ui/style.css         styling
server.js            zero-dependency static server (Node http module)
test/engine.test.js        M1 analytical (9)
test/ui-smoke.test.js      M2 render (5)
test/supportmodel.test.js  M3 classification (6)
test/analysis.test.js      M3 solver (8)
test/ui-m3.test.js         M3 render (5)
test/loadmodel.test.js     M4/M5/M6 load normalization (13)
test/udl.test.js           M4 UDL solver (9)
test/ui-m4.test.js         M4 UDL render (4)
test/linear.test.js        M5 linear solver (11)
test/ui-m5.test.js         M5 linear render (7)
test/multi.test.js         M6 multi-load solver (14)
test/ui-m6.test.js         M6 multi-load render (8)
test/interaction-guard.test.js  M6.5 drag-wiring source guard (3)
docs/                original owner briefs (v1 product brief + M2 UI brief)
verify/              browser-level CDP verification harnesses (see verify/readme.md)
plan-m4.md … plan-m6.md   milestone plans (the plan-before-code record)
```

> **Filename-casing note:** on-disk filenames and ES-module import specifiers
> are all lowercase (normalized 18 Sep 2026), so the project runs unchanged on
> case-sensitive filesystems (Linux, GitHub Pages, CI containers).

### Data flow (strictly one-way)

```
input event → state {span, loads: [descriptor, …], selectedLoad, supports}
            → engine.analyzeBeam() → result → renderM3()

- **Controls vs Results**: the Model panel describes what you change (the
  load list + selected load's editor, supports, span); the Results panel
  shows only what the structure produces (reactions, Mmax). Load description
  — intensity, resultant `R`, centroid `x̄` — lives on the beam diagram.
```

- `ui/app.js` is the **only** module that imports the engine.
- The renderers receive the engine `result` and map it to SVG geometry; they
  contain **no engineering mathematics** (enforced by static source-guard tests).
- `analyzeBeam` accepts a general `loads` array (1..6 loads) or the
  legacy `{load, position}` point-load shorthand, normalized by `loadmodel.js`.
- Single-load inputs use the frozen M1/M4/M5 solver paths byte-for-byte;
  `loads.length ≥ 2` routes to the M6 combined solver (`kind: 'beam-multi-load'`),
  which superposes the closed-form kernels:
  `R = ΣRᵢ, x̄ = ΣRᵢx̄ᵢ/R`, `RA = R(L − x̄)/L`, `RB = R·x̄/L`,
  `V(x) = RA − ΣCᵢ(x)`, `M(x) = RA·x − ΣFᵢ(x)` — reactions still depend
  only on the combined `(R, x̄)`.
- The point-load branch reuses the frozen Milestone 1 solver; the M4 UDL
  solvers are unchanged, so M1–M4 numbers are preserved byte-for-byte.
- Every result carries a `resultant` `{ value, position }` (the load's equivalent
  single force R and centroid x̄); reactions depend only on `(R, x̄)`.

### Load model (M4/M5)

| load | descriptor | unit | resultant `R` |
|---|---|---|---|
| point | `{ type:'point', magnitude, position }` | kN | `P` at `a` |
| udl (full-span) | `{ type:'udl', intensity, start:0, end:span }` | kN/m | `w·L` at `L/2` |
| linear | `{ type:'linear', start, end, wStart, wEnd }` | kN/m | `(w1+w2)·b/2` at `x̄` |

For `linear`, the centroid is `x̄ = start + b·(w1 + 2·w2)/(3·(w1 + w2))` with
`b = end − start`. The three non-uniform presets are the same descriptor:
partial UDL (`wStart = wEnd`), triangular (one endpoint = 0), trapezoidal (both
endpoints > 0). Full-span `linear` with `wStart = wEnd` reproduces the M4 UDL
solver exactly.

### Boundary behaviour (M5, precise)

At the load-region boundaries `x₁`/`x₂`: the intensity `w(x)` may change
**abruptly**; shear `V(x)` stays **continuous** but its **slope** changes
(`dV/dx = −w(x)`); bending moment `M(x)` stays **continuous** with `dM/dx = V`.
The renderer/engine documentation avoids the loose word “smooth” where
continuity/differentiability (C⁰ shear, C¹ moment) actually applies.

### Classification rule (in `src/supportmodel.js`)

For 2D statics (3 equilibrium equations), with reaction unknowns `R`:

| R | verdict | example |
|---|---|---|
| `R < 3` | **unstable** (mechanism) | free-free, roller-roller |
| `R = 3` | **determinate** | pin+roller, fixed+free |
| `R > 3` | **indeterminate**, degree `R − 3` | pin+pin (d1), fixed+fixed (d3) |

### Visualization conventions

- **Shear V(x)**: positive plotted **up**. Point load → jump of `P`; UDL →
  linear ramp (no jump).
- **Bending moment M(x)**: sagging (+) **below** the axis (tension side),
  hogging (−) **above** the axis. Engine sign convention unchanged
  (sagging positive); the sagging/hogging sign is labeled explicitly.

## Modification guide

| You want to change… | Edit |
|---|---|
| Colors / visual style | `ui/renderm3.js` (palette const `C`) and `ui/style.css` (`:root` vars) |
| Support types / names | `src/supportmodel.js` (`SUPPORTS` catalog) |
| Load types / units | `src/loadmodel.js` (`LOAD_TYPES` catalog) |
| Input ranges (span/load/w₁/w₂/region) | `ui/app.js` (`bindNumberSlider` min/max) |
| Labels / units text | `ui/index.html` and `ui/renderm3.js` string literals |
| Diagram sizes / margins | `ui/renderm3.js` (`VB_W`, `ML`, `MR`, `H_*` constants) |
| Server port | `server.js` (`PORT`, default 8000) or `PORT=… npm start` |
| **The engine** | `src/engine.js`, `src/analysis.js` — do not touch unless a genuine defect is found |

## Testing & verification

- `npm test` runs **102 tests**: 9 M1 engine + 5 M2 render + 6 classification +
  8 M3 solver + 5 M3 render + 13 load-model + 9 UDL solver + 4 UDL render +
  11 linear solver + 7 linear render + 14 multi-load solver + 8 multi-load render +
  3 interaction source guard (the M6.5 drag-repair guard).
- **M5 solver coverage**: partial UDL, triangular (both peaks), trapezoidal,
  both cantilever orientations, `dM/dx = V` and `dV/dx = −w` boundary behaviour,
  `linear` full-span ≡ M4 UDL cross-check, resultant/centroid honesty checks,
  input validation, and a point-load regression cross-check.
- **Browser-level verification** (headless Edge via CDP): consolidation
  harnesses (32 functional checks, 6 layout checks — the M5 regression
  anchors) + multi-load harnesses (21 functional checks: add/select/remove,
  combined resultant, cap enforcement, honesty, plus the M6.5 synthesized
  pointer-drag regression on the load arrow and a region handle; 6 multi-load layout
  configurations). Harnesses live in [`verify/`](verify/readme.md):
  `node verify/consolidation-cdp-verify.mjs`,
  `node verify/consolidation-layout-check.mjs`,
  `node verify/multi-load-cdp-verify.mjs`,
  `node verify/multi-layout-check.mjs` (each starts the server itself).

## Educational disclaimer

This is an **educational tool** — not a professional design-verification
system. All results come from the deterministic engine; engineering-standards
clauses (e.g., Eurocode) are intentionally not cited.
