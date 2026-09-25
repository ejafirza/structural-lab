# verify/ — browser-level verification harnesses

These Node scripts verify the **live app in a real (headless Edge) browser** over the
Chrome DevTools Protocol — unit tests alone don't prove the UI works.

Relocated on 2026-09-04 from the authoring harness's scratch space (`.openclaw/tmp/`)
into the project so they survive harness migrations. Only the `ROOT`/`TMP` path
constants were changed; check logic is untouched.

## Run

```bash
node verify/consolidation-cdp-verify.mjs     # 32 functional checks (M5 regression anchors)
node verify/consolidation-layout-check.mjs   # 6 layout checks — point + 5 presets
node verify/multi-load-cdp-verify.mjs        # 21 functional checks — M6 load list + M6.5 drag regression
node verify/multi-layout-check.mjs           # 6 layout checks — multi-load configurations
```

Each script starts `server.js` itself (no need to run `npm start` first), launches
headless Edge with a remote-debugging port (9336–9342, one per script) and a throwaway
user-data dir under `verify/tmp/`, drives the UI, asserts DOM state, and fails on any
console error. Since M6, the harnesses also strip a `PORT` inherited from the outer
environment (so an outer tool exporting e.g. `PORT=0` cannot rebind the spawned app
server) and skip internal `edge://` targets when attaching.

## Requirements

- Node ≥ 18 (WebSocket global).
- Edge at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` — edit the
  `EDGE` constant if your Edge lives elsewhere (any Chromium browser works with the
  same flags).

## What they assert (consolidation pair — M5 regression anchors)

- Load-concept toggle (point ↔ distributed) and the preset chips (Full UDL / Partial /
  Triangular ▲▼ / Trapezoidal) quick-fill the single distributed editor.
- Resultant `R` and centroid `x̄` appear **on the beam**, update live with region/intensity
  edits, and chip highlights clear on manual edits.
- Clean Controls-vs-Results split (Results panel = reactions + Mmax only).
- Determinacy honesty: indeterminate/unstable cases show classification, no numbers.
- Layout: no text clipping beyond the SVG viewBox, no label collisions (getBBox audit).
- Zero console errors throughout.

Since M6 the consolidation pair's *interaction layer* drives the load list (add
distributed + remove the default point load, instead of the retired concept radio);
the asserted values and counts are unchanged.

## What they assert (multi-load pair — M6 + M6.5 drag regression)

- Load list: add (+ Point / + Distributed), select (row highlight follows),
  remove (never below one load), summaries, add buttons disabled at the 6-load cap.
- Combined superposition values on cards and beam (hand-derived: e.g. two point
  loads → RA = 6.67, RB = 8.33, Mmax = 20 kNm; combined `R = 15 kN`, `x̄ = 3.33 m`).
- Numbered badges ①… on the beam tie each drawing to its list row.
- **Synthesized pointer drags (M6.5)**: a real pointerdown → pointermove →
  pointerup sequence on the load arrow moves the load (position value, list
  summary, and the arrow's on-screen drawing all track it) — the regression
  for the repaired un-draggable-arrow bug (plan-m6.5.md §1) — and the same
  drag pattern on a region handle moves the region start. Harness state is
  restored afterwards so the downstream checks are unaffected.
- Determinacy honesty with several loads: classification only, combined R still shown.
- Multi-load layout: no clipping / collisions across crowded point loads,
  point + UDL, a point inside a region, three loads, and the 6-load cap case.
