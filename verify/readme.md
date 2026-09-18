# verify/ — browser-level verification harnesses

These Node scripts verify the **live app in a real (headless Edge) browser** over the
Chrome DevTools Protocol — unit tests alone don't prove the UI works.

Relocated on 2026-09-04 from the authoring harness's scratch space (`.openclaw/tmp/`)
into the project so they survive harness migrations. Only the `ROOT`/`TMP` path
constants were changed; check logic is untouched.

## Run

```bash
node verify/consolidation-cdp-verify.mjs     # 32 functional checks (current UI)
node verify/consolidation-layout-check.mjs   # 6 layout checks — point + 5 presets
node verify/m5-layout-check.mjs              # 5-preset layout audit
```

Each script starts `server.js` itself (no need to run `npm start` first), launches
headless Edge with a remote-debugging port (9336–9340, one per script) and a throwaway
user-data dir under `verify/tmp/`, drives the UI, asserts DOM state, and fails on any
console error.

## Requirements

- Node ≥ 18 (WebSocket global).
- Edge at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` — edit the
  `EDGE` constant if your Edge lives elsewhere (any Chromium browser works with the
  same flags).

## What they assert (consolidation pair — the current authoritative checks)

- Load-concept toggle (point ↔ distributed) and the preset chips (Full UDL / Partial /
  Triangular ▲▼ / Trapezoidal) quick-fill the single distributed editor.
- Resultant `R` and centroid `x̄` appear **on the beam**, update live with region/intensity
  edits, and chip highlights clear on manual edits.
- Clean Controls-vs-Results split (Results panel = reactions + Mmax only).
- Determinacy honesty: indeterminate/unstable cases show classification, no numbers.
- Layout: no text clipping beyond the SVG viewBox, no label collisions (getBBox audit).
- Zero console errors throughout.
