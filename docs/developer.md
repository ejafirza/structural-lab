# Developer & contributor guide

Everything technical that the [readme](../readme.md) deliberately leaves out:
architecture, data flow, the engineering contracts, how the tests work, and
where to make changes. For the app itself, see the live demo or run it locally
(`npm start`).

## Architecture

```
src/engine.js        deterministic point-load solver (PURE) — Milestone 1, FROZEN
src/supportmodel.js  support catalog + determinacy/stability classification — M3
src/loadmodel.js     load-type catalog + descriptor normalization (1..6 loads) — M4–M7
                     (M7: `profile` descriptor, `MAX_PROFILE_POINTS`, `emitDescriptor`)
src/analysis.js      analyzeBeam() dispatcher: point/UDL/linear solvers + combined (M6)
                     + profile kernels & routing (M7) + elastic curve (M8)
src/glossary.js      teaching dictionary — hand-written explanations (pure data)
src/explain.js       derivation formatter over finished results (reads, never recomputes)
src/demo.js          ASCII demo of the engine
ui/index.html        responsive shell, model controls (load list, shape-point table,
                     E·I), teaching triggers
ui/app.js            interaction orchestration + engine adapter (ONLY caller of
                     analyzeBeam): solve→render loop, load list, flat distributed
                     editor, shape-point table, E·I, presets, supports, sliders, boot
ui/state.js          the single UI state object + pure state logic (accessors,
                     invariant repairs, last-solved result store) — DOM-free
ui/drag.js           beam pointer/keyboard drag wiring + desktop context menu
                     (guarded by test/interaction-guard.test.js; actions injected by app.js)
ui/teaching.js       teaching-layer bootstrap (reads the last result from state.js)
ui/theme.js          System / Light / Dark preference (presentation only)
ui/popover.js        centered one-topic dialog (a11y, inert background, focus lifecycle)
ui/render.js         reference renderers (simply supported point load) — FROZEN
ui/renderm3.js       support/load renderers (multi-load, profile, deflection,
                     theme tokens, concise status + accessible diagram triggers)
ui/style.css         responsive layout + light/dark colors, centered teaching dialog
server.js            zero-dependency static server (Node http module)
test/                unit suite (`npm test`) — see the per-file map below
test/helpers/        shared fake-DOM test harness (FakeNode, makeDoc, bootApp)
docs/                original owner briefs (v1 product brief + M2 UI brief)
verify/              browser-level verification harnesses via the Chrome DevTools
                     Protocol (see verify/readme.md)
plan-m4.md … plan-m12.md  milestone plans (the plan-before-code record)
```

> **Filename-casing note:** on-disk filenames and ES-module import specifiers
> are all lowercase, so the project runs unchanged on
> case-sensitive filesystems (Linux, GitHub Pages, CI containers).

### Test map

```
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
test/interaction-guard.test.js  drag-wiring source guard (3; extended for M7 handles)
test/profile.test.js       M7 profile solver — Cases A–G (20)
test/ui-m7.test.js         M7 render + emit rule + point-table interaction (5)
test/deflection.test.js    M8 elastic curve — Cases A–L (12)
test/ui-m8.test.js         M8 deflection/E·I wiring + reset & editor identity (9)
test/glossary.test.js      teaching-dictionary integrity (6)
test/explain.test.js       derivation identity + honesty (9)
test/ui-m9.test.js         card routing + one-topic modal behavior (11)
test/theme.test.js         appearance preference behavior (6)
test/ui-m10.test.js        shell, content and frozen-boundary contracts (7)
test/server-port.test.js   server PORT/NO_OPEN handling (10)
```

## Data flow (strictly one-way)

```
input event → state {span, loads: [descriptor, …], selectedLoad, supports}
            → engine.analyzeBeam() → result → renderM3()
```

- `ui/app.js` is the **only** module that calls `analyzeBeam` (its engine input
  builder lives in `ui/state.js`; the teaching layer reads the finished result
  from there and never re-solves).
- The renderers receive the engine `result` and map it to SVG geometry; they
  contain **no engineering mathematics** (enforced by static source-guard tests).
- **Controls vs Results**: the Model panel describes what you change (the
  load list + selected load's editor, supports, span); the Results panel
  shows only what the structure produces (reactions, Mmax). Load description
  — intensity, resultant `R`, centroid `x̄` — lives on the beam diagram.

## Engineering contracts

- `analyzeBeam` accepts a general `loads` array (1..6 loads) or the
  legacy `{load, position}` point-load shorthand, normalized by `loadmodel.js`.
- Single point/udl/linear inputs use the frozen M1/M4/M5 solver paths
  byte-for-byte; a `profile` load (alone or mixed) and `loads.length ≥ 2`
  route to the fully general combined solver (`kind: 'beam-profile'` for a
  lone profile, `'beam-multi-load'` otherwise), which superposes the
  closed-form kernels:
  `R = ΣRᵢ, x̄ = ΣRᵢx̄ᵢ/R`, `RA = R(L − x̄)/L`, `RB = R·x̄/L`,
  `V(x) = RA − ΣCᵢ(x)`, `M(x) = RA·x − ΣFᵢ(x)` — reactions still depend
  only on the combined `(R, x̄)`. For a profile each kernel is the
  per-segment sum of the M5 closed forms (`profileKernels`).
- **Deflection** is a pure add-on on determinate results: the exact
  moment curve is integrated twice in closed form per load kernel, constants
  pinned by the support conditions, and the result gains a `deflection`
  block `{ EI, v, theta, max }` (v down-positive, metres). `EI` is an
  optional input (teaching default 2.0×10⁴ kN·m², echoed in the result).
- **The emit rule:** the UI's internal model of a distributed load is
  its control-point list; `emitDescriptor` (loadmodel.js) emits `linear` for
  exactly two points (the frozen M5 descriptor) and `profile` otherwise —
  the single home of the rule that keeps every earlier anchor byte-identical.
- The point-load branch reuses the frozen Milestone 1 solver; the M4 UDL
  solvers are unchanged, so earlier numbers are preserved byte-for-byte.
- Every result carries a `resultant` `{ value, position }` (the load's equivalent
  single force R and centroid x̄); reactions depend only on `(R, x̄)`.

### Load model

| load | descriptor | unit | resultant `R` |
|---|---|---|---|
| point | `{ type:'point', magnitude, position }` | kN | `P` at `a` |
| udl (full-span) | `{ type:'udl', intensity, start:0, end:span }` | kN/m | `w·L` at `L/2` |
| linear | `{ type:'linear', start, end, wStart, wEnd }` | kN/m | `(w1+w2)·b/2` at `x̄` |
| profile | `{ type:'profile', points: [{x, w}, …] }` (2..6) | kN/m | `ΣRᵢ` at `ΣRᵢx̄ᵢ/R` |

For `linear`, the centroid is `x̄ = start + b·(w1 + 2·w2)/(3·(w1 + w2))` with
`b = end − start`. The three non-uniform presets are the same descriptor:
partial UDL (`wStart = wEnd`), triangular (one endpoint = 0), trapezoidal (both
endpoints > 0). Full-span `linear` with `wStart = wEnd` reproduces the M4 UDL
solver exactly.

For `profile`, the intensity follows the polyline through the control
points — non-decreasing `x` in `[0, span]`, `w ≥ 0`, total load > 0 — and a
repeated adjacent `x` is a vertical **step**. Each segment contributes the
M5 trapezoid closed forms; a step pair (zero width) contributes nothing.
Validation mirrors the existing taxonomy (`TypeError` for structure,
`RangeError` for values).

### Boundary behaviour (precise)

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
| Colors / visual style | `ui/style.css` (light/dark theme variables) and `ui/renderm3.js` (diagram palette tokens) |
| Support types / names | `src/supportmodel.js` (`SUPPORTS` catalog) |
| Load types / units | `src/loadmodel.js` (`LOAD_TYPES` catalog) |
| Input ranges (span/load/w₁/w₂/region) | `ui/app.js` (`bindNumberSlider` min/max) |
| Labels / units text | `ui/index.html` and `ui/renderm3.js` string literals |
| Diagram sizes / margins | `ui/renderm3.js` (`VB_W`, `ML`, `MR`, `H_*` constants) |
| Server port | `server.js` (`PORT`, default 8000) or `PORT=… npm start`; invalid values fall back to 8000 |
| Auto-open browser | `NO_OPEN=… npm start` (any non-empty value) skips the browser tab |
| **The engine** | `src/engine.js`, `src/analysis.js` — do not touch unless a genuine defect is found |

## Testing & verification

- `npm test` runs the analytical, rendering, theme, shell and
  explanation/accessibility coverage. See the current test run before treating the suite
  as green; engineering regression tests remain included.
- **M7 solver coverage**: stepped profile with an interior peak, collinear
  profile ≡ frozen linear solver to 1e-9, gap profile with the `V ≡ 0`
  plateau, both cantilevers, honesty (indeterminate/unstable), validation
  taxonomy, mixed loads with order independence and linearity, and
  `dM/dx = V` / `dV/dx = −w` stencil identities away from every event.
- **M5 solver coverage**: partial UDL, triangular (both peaks), trapezoidal,
  both cantilever orientations, `dM/dx = V` and `dV/dx = −w` boundary behaviour,
  `linear` full-span ≡ M4 UDL cross-check, resultant/centroid honesty checks,
  input validation, and a point-load regression cross-check.
- **M8 solver coverage**: textbook sags (PL³/48, 5wL⁴/384, PL³/3, wL⁴/8,
  wL⁴/30, P·a²(3L−a)/6), the off-centre interior turning point, the stepped
  profile hand-integration with C¹ continuity, superposition pointwise +
  order independence, 1/EI linearity, honesty (no block when not solved),
  EI validation + default, derivative identities (dθ/dx = −M/EI,
  d²v/dx² = −M/EI on clean stencils), and pure-add-on determinism.
- **Teaching coverage**: glossary integrity (no dead links, no orphans, size caps,
  SVG touchpoints and support reaction counts); derivation identity (answers trace to
  engine results except the m → mm conversion; no invented intermediate numbers,
  honest unsolved states and no result mutation); one-topic modal behavior (activation
  only, keyboard operation, focus/inert restoration, no innerHTML, fail-soft unknowns).
- **Browser-level verification** (headless Edge): prior milestone totals are listed
  in `verify/readme.md`. The full M5–M12 regression matrix passed serially on
  2026-09-29: teaching 51/51 (including the M12 checks), shell 22/22, M5 32/32,
  M6 22/22, M7 30/30, M8 15/15, and all five layout audits clean — with no browser
  console or runtime errors.

## Roadmap

The lab is complete and useful on its own. Parked ideas (not scheduled):
an optional LLM tutor layered on top of the engine-grounded explanations;
influence lines; 1°-indeterminate beams via moment distribution.
