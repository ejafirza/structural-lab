# Structural Lab

[![Live demo](https://img.shields.io/badge/demo-live-brightgreen)](https://ejafirza.github.io/structural-lab/)
[![CI](https://github.com/ejafirza/structural-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/ejafirza/structural-lab/actions/workflows/ci.yml)

**▶ [Try the live demo](https://ejafirza.github.io/structural-lab/) — no install, runs in your browser.**

Interactive Structural Analysis Learning Laboratory — educational software for
civil/structural engineering students, built around the loop
**Experiment → Observe → Question → Understand**.

## What is this?

Drag a load along a beam and watch three drawings react instantly: the
**shear force** inside it, the **bending moment**, and the actual
**deflected shape**. Every result has a **How?** button that shows the full
worked calculation — equation, substitution, answer — written by hand, not
generated. Change the supports, the load shape, or the material and everything
updates live. It's the statics chapter you wish existed: the one that responds
when you poke it.

## The three drawings every beam course uses

| A point load | A spread-out load | A triangular load |
|---|---|---|
| ![Point load with draggable arrow, live SFD/BMD](docs/screenshot-point.png) | ![Distributed load with resultant R and centroid x̄ on the beam](docs/screenshot-udl.png) | ![Triangular load, analytic peak moment](docs/screenshot-triangular.png) |

Every view shows the same four drawings, calculated from the beam on top:

**The beam** — *your structure.* Loads push down (arrows you can drag) and
supports hold it up at the ends. Every other drawing is calculated from this
one. That's the whole input: no dialogs, no forms — just place loads and
supports, then watch.

**Shear force diagram** — *how hard the beam is being "scissored" at each
point along its length.* Where the drawing jumps, a point load sits. Where it
slopes, the beam carries a spread-out load. Large shear means the beam needs
more material there — one reason real beams are deeper over their supports.

**Bending moment diagram** — *how much the beam is being bent at each point,*
drawn on the tension side the way engineers draw it. The moment peaks exactly
where the shear drawing crosses zero — that's the spot that tries to snap
first. For the default beam above, mid-span carries the maximum: 15 kN·m.

**Deflected shape** — *what the beam actually does: sag.* The app draws a
fourth diagram showing the deflected curve, exaggerated so you can see it,
with the true maximum printed beside it (2.25 mm downward for this beam). Make
the beam stiffer with the **E·I** slider and watch the sag shrink.

In the app, every number on these drawings has a **How?** button with its full
worked derivation.

## Your first 60 seconds

1. Open the demo — a 6 m beam with one 10 kN load at mid-span is already set up.
2. **Drag the load arrow** along the beam; all three drawings respond instantly.
3. **Click a support symbol** on the beam — it cycles through pin, roller,
   fixed and free. Try fixed on the left and free on the right: a diving board.
4. Open **Model**, add a **Distributed load**, and pick the **Snow drift**
   preset — a triangular pile of load, like snow drifted against a wall.
5. Click **How?** on the "Reaction V" card — the whole derivation, worked by
   hand: equation, substitution, answer.

## Questions this lab answers

- **Why is the bending moment biggest in the middle?** Drag the load there and
  watch the peak. Then drag it near the end and watch the peak move and shrink.
- **What's the difference between a pin, a roller, and a fixed end?** Click
  through them on the beam itself; the reactions and the deflected shape
  change as you go.
- **Why won't it solve my beam with two fixed ends?** It's being honest: that
  beam is *indeterminate* — it needs methods beyond statics, and the badge
  tells you by how much. The lab explains instead of guessing.
- **How much does a beam actually bend?** Pick a material (steel, timber,
  concrete) with the stiffness presets and read the true deflection in
  millimetres.
- **Is the math exact?** Yes. Every curve comes from an exact formula, the
  same ones from your textbook — and the test suite checks the app's answers
  against those textbook values automatically. No approximations.

## Running it yourself

```bash
npm start      # start the app → http://localhost:8000 (browser opens)
npm test       # run the full automated suite
```

> Open the app via `npm start`, not by double-clicking `ui/index.html` —
> browsers block ES-module imports over `file://`. Requires Node.js ≥ 18.

## License

[MIT](LICENSE)

For how the app works inside, and how to modify or extend it, see the
**[developer guide](docs/developer.md)**.

## Educational disclaimer

This is an **educational tool** — not a professional design-verification
system. All results come from the deterministic engine; engineering-standards
clauses (e.g., Eurocode) are intentionally not cited.
