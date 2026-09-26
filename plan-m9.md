# Milestone 9 Plan — Teaching Layer (Glossary Popovers + Worked Derivations)

**Status:** APPROVED by the owner 26 Sep 2026 (via the plan review — two milestones
split, two-column layout, click-card derivations, two-level nesting with unlimited
traversal) and **implemented & verified in full on 26 Sep 2026** — see §14 for the
implementation record and the definition-of-done status.

**Predecessors:** M1 (point engine) → M2 (viz) → M3 (supports) → M4 (UDL) → M5 (linear)
→ M6 (multi-load) → M6.5 (drag repair) → M7 (profiles) → M8 (deflection) — all complete
& verified (143/143 unit tests; all eight browser harnesses green; commit `b02023e`
pushed, CI green on Node 20 + 22).

**Companion milestone:** the remaining declutter items — two-column full-width layout,
light/dark mode, folding the load editor, equilibrium-badge relocation — become **M10**
with its own plan after M9. (The parked 25 Sep proposals map: (c) tooltips → this M9,
greatly expanded; (a) fold + (b) badge + (d) label trim → M10.)

---

## 0. Recommendation summary (TL;DR)

- **Every engineering term on the page becomes clickable** — supports, reactions
  (V_A, V_B), determinacy, shear, sagging/hogging, Mmax, E·I, stiffness presets,
  deflection, the equilibrium badge, the units — opening a small **popover window**
  with a plain-language explanation, hand-written and owner-reviewed. No AI.
- **Inside a popover, sub-terms are clickable too** (Pin support → *vertical reaction*).
  Traversal uses one window with a **breadcrumb** (Supports › Pin support › Vertical
  reaction, click back) — the whole dictionary is reachable while the screen never
  grows a stack of windows. Two visual levels, unlimited traversal via see-also chips.
- **Every result card becomes a "how?" door:** clicking a card (reactions, Mmax, max
  deflection) opens a popover with the **step-by-step derivation with the engine's own
  numbers** — `R_B = R·x̄ / L → 21 kN`. The steps are *read out of the finished result*,
  never recomputed; a test enforces the identity.
- Three new files: `src/glossary.js` (~40 entries, pure data), `src/explain.js`
  (derivation formatter), `ui/popover.js` (~120-line one-window component, zero deps).
  `src/engine.js`, `ui/render.js` and every solver stay byte-identical.
- **The annotation rule (keeps all 143 prior tests green unedited):** terms attach by
  adding `data-term` attributes and ℹ chip siblings to *existing* elements — no existing
  label text is rewritten (the M7 emit-rule lesson applied to markup).
- **Interaction is click/tap/Enter, not hover-to-open** — hover only shows the
  dotted-underline affordance. Owner's words: "just click on it they may get an answer."
- Honest by construction: derivations only for **determinate** beams; indeterminate/
  unstable beams get the *classification* explanation instead. No invented numbers.
- Engineering-accuracy flag honoured: the plan corrected the owner's "3 reactions for
  pinned / torsion" aside — pin = 2, roller = 1, fixed = 3; the third planar reaction is
  the **moment reaction** (torsion is its 3D cousin). The glossary teaches it correctly.
- Shape of the change: ~40 glossary entries + 5 derivation groups, 3 new files, small
  wiring in `ui/app.js` + `ui/index.html` + six bounded SVG touchpoints in
  `ui/renderm3.js`, ~25 new tests, 2 new harnesses (ports 9347/9348).

## 1. Scope — what "teaching layer" means here

- The engine already computes everything correctly; M9 adds the **theory around the
  numbers**: definitions, conventions, and the "how did we get this" walk-through.
  It is a reference layer, hidden until asked for.
- **Deliberately no AI**: content is static, hand-written data. When a student exhausts
  the popovers, that is the AI tutor's job — the last milestone (owner's framing).
- **What this is NOT:** no new app modes, no new Model-panel controls, no persistence,
  no content search, no images/animation in popovers, no changes to any computed
  value, no new dependencies, no cursor-following tooltips, no hover-to-open.

## 2. Content model — the glossary

`src/glossary.js` — pure data, no rendering. Entry shape:

```js
'pin-support': {
  term: 'Pin support',
  body: 'A pin resists movement in both directions but lets the beam rotate freely…',
  subs: ['vertical-reaction', 'horizontal-reaction'],   // chips inside the window
  seeAlso: ['roller-support', 'fixed-support'],          // breadcrumb-style jumps
}
```

- **Level-1 inventory (~34 page-referenced + 5 sub-only entries ≈ 39):**
  - *Supports:* supports (umbrella), pin, roller, fixed, free end; reaction, vertical,
    horizontal, moment reaction (with the torsion note).
  - *Determinacy:* determinate, why R = 3 is solvable, indeterminate, unstable,
    equilibrium equations, equilibrium self-check.
  - *Loads:* loads (umbrella), point load, distributed load, intensity, profile,
    load presets, resultant, centroid, superposition, units.
  - *Internal forces:* shear force, SFD, Vmax, bending moment, sagging, hogging, BMD,
    Mmax.
  - *Deflection:* elastic curve, E·I (subs: E — Young's modulus, I — second moment of
    area), stiffness presets, exaggeration factor, max deflection.
  - *Product:* honesty ("what this tool will not do"), cantilever note.
- **Two visual levels, unlimited traversal:** a window never opens a third window —
  deeper detail is inline; see-also chips replace the content with a breadcrumb trail.
- **SVG touchpoint budget ≤ 8, planned as exactly 6:** reaction V-labels
  (`vertical-reaction`), wall-moment labels (`moment-reaction`), centroid `x̄`
  (`centroid`), Mmax marker (`maximum-moment`), max-deflection marker
  (`max-deflection`), exaggeration note (`exaggeration`).
- **Content accuracy gate:** the owner reviews the glossary wording (DoD 7).

## 3. The popover component (`ui/popover.js`)

One window per page. Opens on click / tap / Enter / Space of any element carrying
`data-term` (glossary) or `data-steps` (derivation). Fixed positioning near the
trigger, clamped to the viewport; Escape or click-outside closes; focus returns to
the trigger; `aria-expanded` tracks the trigger; window is `role="dialog"`
`aria-modal="false"` labelled by its title. Breadcrumb header for traversal. All
content built with `createElement`/`textContent` — never innerHTML. Chip/back/close
clicks **stopPropagation** (see §14, the real-browser bug). Init is guarded:
`initTeaching()` skips binding when the host DOM has no `addEventListener`
(fake-DOM fixtures — the optional-DOM contract).

## 4. Worked derivations (`src/explain.js`)

A pure formatter over the **finished** `analyzeBeam` result — called at click time,
never attached to results, never recomputing engineering values. Steps:
`{ formula, substitution, value, unit }`:

- **Reactions:** per-load resultants (lone-load closed forms only — the frozen M1/M4/M5
  values), combined `(R, x̄)` for mixes (quoted from the result), then ΣM about A → R_B,
  ΣFy = 0 → R_A. **Cantilever:** wall vertical = R, wall moment (hogging).
- **Shear:** V(0⁺) = R_A, the jump/kink story (prose), V(L⁻) = −R_B, Vmax = the larger
  end shear (both quoted from the sampled diagram).
- **Mmax:** "M peaks where V crosses zero", then the load-type closed form
  (`P·a·b/L`, `wL²/8`) with the engine's value, and the tension-side lesson.
- **Deflection:** recognized standard cases name the textbook formula
  (`P·L³/48EI`, `5wL⁴/384EI`, `P·a²(3L−a)/6EI`, `wL⁴/8EI`); mixed/profile cases tell
  the exact-integration story; the m → mm conversion and the E·I used.
- **Equilibrium:** residuals quoted verbatim from the result's equilibrium block.
- **Classification (indeterminate/unstable):** the R-vs-3 counting — the only group
  shown for unsolved beams.
- **The identity test:** for representative cases, every step's `value` must trace to
  the engine result — the only allowed transformation is ×1000 (m → mm). explain.js
  never imports or recomputes a solver.

## 5. Unchanged legacy behaviour (the frozen boundary)

- `src/engine.js`, `ui/render.js`: untouched, byte-for-byte. All solvers untouched.
- **The annotation rule:** `data-term` attributes / ℹ siblings on existing DOM; SVG
  labels gain the attribute through `txt()`'s new extra-option pass-through (position,
  size, colour, text untouched); card labels untouched (`data-steps` doors added).
- `ui/app.js` gains only the two imports, `lastResult`, and the guarded
  `initTeaching()` boot call. No new state, no new controls, no new listeners beyond
  the popover's own.

## 6. Architecture — files touched

| file | change |
|---|---|
| `src/glossary.js` | **new** — hand-written teaching dictionary (~39 entries), pure data |
| `src/explain.js` | **new** — derivation formatter over finished results (§4) |
| `ui/popover.js` | **new** — the one-window popover component (§3) |
| `ui/index.html` | `data-term` attributes, ℹ chips, one hint line; all ids/controls unchanged |
| `ui/app.js` | imports, `lastResult`, guarded `initTeaching()` |
| `ui/renderm3.js` | `txt()` attribute pass-through; 6 SVG `data-term` touchpoints; card doors (`data-steps`/`data-term`) |
| `ui/style.css` | dotted-underline affordance, ℹ chips, popover + steps styles (theme variables only) |
| `test/glossary.test.js` | **new** — dictionary integrity (6 tests) |
| `test/explain.test.js` | **new** — identity rule + honesty (9 tests) |
| `test/ui-m9.test.js` | **new** — card doors + popover behaviour (8 tests) |
| `verify/teaching-cdp-verify.mjs` | **new** — functional harness (port 9347) |
| `verify/teaching-layout-check.mjs` | **new** — SVG + popover layout audit (port 9348) |
| `readme.md`, `verify/readme.md`, `AGENTS.md`, `dashboard.md`, `handoff.md` | counts, file map, state, harness docs |
| `src/engine.js`, `ui/render.js`, all existing tests & harnesses | **frozen / untouched** |

## 7. UI / interaction design

- Clickable terms get a **dotted underline** (CSS only); hover deepens it; click opens.
- Result cards gain the door (whole card clickable, keyboard-reachable
  `tabindex`/`role="button"`); unsolved cards explain why (honesty door).
- The equilibrium badge becomes a trigger (also softens the "out of place in the
  header" feel pending M10's relocation).
- Static ℹ chips beside labels that cannot carry the underline (support selects,
  E·I, presets headings).
- Default screen unchanged otherwise: same controls, panels, values — zero clutter.

## 8. Accessibility

- Triggers are real interactive elements; SVG labels are NOT made focusable (the
  bounded six teach via hover only; keyboard users have the same content through the
  badges, chips and cards). Enter/Space open, Escape closes, focus returns.
- Popover: labelled non-modal dialog, breadcrumb is real text, plain-text bodies,
  no colour-only meaning, no hover-only information, body scrollable (max-height).

## 9. Test cases

**`test/glossary.test.js` (6):** no dead sub/seeAlso links · no orphans · term/body
size caps · every `data-term` used by the UI exists · the SVG touchpoint set is
exactly the planned six (budget ≤ 8) · content honesty markers (pin 2 / roller 1 /
fixed 3; the torsion note present).

**`test/explain.test.js` (9):** the default beam quotes the M1 hand values
(RA = RB = 5 kN, Mmax = 15 kNm at 3 m) · **THE IDENTITY RULE** across six
representative cases (point/UDL/linear/profile/cantilever/mixed — every numeric step
traces to the result; the only transform is ×1000) · cantilever language + wall
values · deflection group (textbook path named; mm conversion; E·I quoted; mixed
case tells the integration story) · equilibrium residuals verbatim · UDL area walk
(R = 12, RA = RB = 6) · M7 Case A stepped profile (RA = 15, RB = 21) ·
`groupForCard` routing · HONESTY (pin+pin and roller+roller → classification only,
integer counts only) · the formatter never mutates the result.

**`test/ui-m9.test.js` (8):** solved cards carry `data-steps` with byte-identical
labels (HA-first order preserved) · unsolved cards carry the honesty `data-term` ·
SVG terms exactly as planned (lone point load: only the reaction label — the
combined R/x̄ is suppressed for lone point loads, the pre-M6 rule; UDL adds the
centroid; cantilever adds the wall moment) · popover open/drill/breadcrumb/back ·
Escape + click-outside + single window · keyboard Enter + no innerHTML anywhere ·
fail-soft unknown terms · the app.js teaching init is guarded for event-less DOMs.

**Estimate:** 143 existing + ~24 new ≈ **167 tests** (final count in §14).

## 10. Browser verification additions

- **`verify/teaching-cdp-verify.mjs`** (port 9347, 22 checks): ℹ chip → Supports
  entry; dialog role; chip inventory; two-level drill (Pin → Vertical reaction) with
  breadcrumb + back; fixed-support body teaches 3 reactions; Escape closes; solved
  cards all carry doors; Mmax card → `P·a·b/L` steps quoting **15 kNm** verbatim;
  equilibrium badge explains the self-check; UDL beam → **9 kNm** (wL²/8) steps;
  pin+pin → honesty doors with the why-popover; popover fully inside the viewport;
  zero console errors.
- **`verify/teaching-layout-check.mjs`** (port 9348, 13 checks): the full four-panel
  getBBox audit over the 8 standard configurations (M9 touched the renderer attribute
  path, so the audit MUST re-run) + popover geometry: inside-viewport, no trigger
  overlap, 360 px device-metrics flip, scrollable body; zero console errors.
- All eight existing harnesses re-run as anchors; `node --test` green. Nothing
  written to C:.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Rewriting labels breaks 143 green tests | The annotation rule (attributes + siblings only) + tests asserting label text byte-identical |
| Derivation steps drift from engine numbers | Steps read results only + the identity test + explain.js never imports solvers |
| Popover positioning bugs (edges, small screens) | Viewport-clamped fixed positioning + dedicated layout-audit configs incl. 360 px |
| Glossary content grows stale or wrong | Size caps, integrity tests, owner content review as a DoD gate |
| SVG touchpoints multiply the audit surface | Hard cap ≤ 8 (exactly 6 implemented), test-enforced, audit re-run mandatory |
| Scope creep toward the AI tutor | §1 out-of-scope list; content is static data, no runtime generation |

## 12. Explicitly out of scope (M9)

The AI tutor (last milestone, deliberate) · cursor-following styled tooltips ·
hover-to-open · M10 items (two-column layout, dark mode, editor fold, badge
relocation, label trim) · content search or index · images/animations in popovers ·
multi-language · persistence · any new dependency · any change to computed values.

## 13. Owner decisions (approved 26 Sep 2026)

1. **Two milestones** — M9 teaching layer now; M10 shell pass (layout/dark/fold/badge) next, its own plan. *(Recommended; chosen.)*
2. **Two-column layout** for M10 (Model sidebar left, diagrams full width) — recorded in the M10 plan. *(Recommended; chosen.)*
3. **Click card → derivation popover** — one mechanism with the glossary. *(Recommended; chosen.)*
4. **Two visual levels with unlimited traversal** — the owner emphasized: "I would like
   as many terminologies, even as simple as Va and Vb, clickable… I want the user,
   whoever, across any stage of their learning, not be bottlenecked." Implemented as
   level-1 terms on the page + level-2 sub-concepts + see-also chips with a breadcrumb.
5. **Content accuracy flag accepted:** pin = 2 reactions (not 3); the third planar
   reaction is the moment reaction; torsion noted as the 3D cousin.

## 14. Implementation record — filled 26 Sep 2026

**Implemented and verified in full.** Diff surface: `src/glossary.js` (new, 39 entries),
`src/explain.js` (new, 5 derivation groups + classification), `ui/popover.js` (new,
~240 lines), `ui/index.html` (21 `data-term` triggers, 3 static ℹ chips, one hint
line — all ids/controls byte-preserved), `ui/app.js` (+3 imports, `lastResult`,
guarded `initTeaching()`), `ui/renderm3.js` (`txt()` attribute pass-through, exactly
6 SVG touchpoints, card doors in `cardNode`/`renderResultCards`), `ui/style.css`
(append-only M9 block, theme variables only), `test/glossary.test.js` (new),
`test/explain.test.js` (new), `test/ui-m9.test.js` (new),
`verify/teaching-cdp-verify.mjs` (new, port 9347),
`verify/teaching-layout-check.mjs` (new, port 9348), plus doc updates (readme,
verify/readme, AGENTS.md, dashboard.md, handoff.md, this file). `git diff` on
`src/engine.js`, `ui/render.js` and all 19 frozen files (every pre-M9 test and
harness): **empty** — the frozen boundary is intact.

**Final counts.** Unit: **167/167** (`node --test` = the prior 143 untouched + 6
glossary + 9 explain + 8 ui-m9 — zero supersessions, zero edits to existing tests).
Browser: M5 anchors **32/32** + **6/6**; M6/M6.5 anchors **22/22** + **6/6**; M7
anchors **30/30** + **8/8**; M8 anchors **15/15** + **8/8**; new M9 harnesses
**22/22** + **13/13**; zero console errors across all ten. Zero new npm dependencies;
nothing written to C:; harness litter confined to git-ignored `verify/tmp/` (purged,
stray headless-Edge processes killed via the CommandLine filter, per the M7/M8
cleanup runbook).

**Decisions taken during implementation:**

1. **An umbrella "Loads" entry** was added beyond the planned inventory so the
   load-list heading could carry a term without overloading the point/distributed
   entries (final count 39 entries, not 36).
2. **Static ℹ chips carry `data-term` directly** (no app.js wiring needed) — the
   delegated listener sees them like any trigger; simpler than the planned
   app-generated chips.
3. **`txt()` gained an extra-attribute pass-through** instead of a new SVG helper —
   the six touchpoints ride the existing label factory (position/size/colour
   untouched, so the layout audit re-ran clean unchanged).
4. **Card doors at GROUP granularity:** every solved card opens its group's
   derivation (the two reaction cards open the reactions group) — one derivation per
   quantity, no duplicate content, and every card is still a door.
5. **Mixed-load derivations are prose, not parallel formulas** — the identity test
   rejected computed per-load resultants (e.g. R = 5 for a point load inside a mix:
   that value is not published by the engine). Lone-load closed forms remain (they
   ARE the frozen solvers' own outputs, pinned by the analytical suites); mixes quote
   only the combined `(R, x̄)` from the result. The test caught exactly the drift the
   plan predicted.
6. **The real-browser bug the unit suite could not see:** clicking a chip re-renders
   the window and detaches the chip, so the bubbled document-level click handler no
   longer recognised the click as "inside the window" and closed it, wiping the
   breadcrumb. Fake-DOM tests pass because the shim keeps `parentElement` alive
   after `replaceChildren`; a real DOM nulls it. Fix: chip/back/close clicks
   `stopPropagation()`, with a comment tying it to this plan. (Found by
   `teaching-cdp-verify` on its first run — the CDP layer earning its keep again.)
7. **SVG labels are NOT focusable** — the bounded six teach on hover only; keyboard
   users reach the same content through the badges, ℹ chips and card doors (deviation
   from §8's earlier draft, flagged here: making SVG text focusable would have added
   six tab stops per panel and three aria-labels for no new content).

**Definition of done:**

1. ✅ New tests green — `glossary.test.js` (6), `explain.test.js` (9), `ui-m9.test.js` (8).
2. ✅ All 143 prior tests green, unedited — zero supersessions; frozen files byte-identical.
3. ✅ Functional CDP green — eight anchors unchanged + `teaching-cdp-verify.mjs` 22/22.
4. ✅ Layout audit clean — eight anchors + the 8 SVG configurations + 4 popover
   geometry checks = 13/13, 0 clip / 0 overlap.
5. ✅ Zero console errors across all ten headless-Edge harnesses.
6. ✅ Boundaries intact — `engine.js`/`render.js` byte-identical; no label text
   rewritten; zero new dependencies; nothing written to C:.
7. ⬜ **Owner review of the glossary wording** (DoD 7) — the ~39 entries are in
   `src/glossary.js`; wording fixes are content-only and cheap. The mechanics are
   test-enforced; the prose awaits your read.
8. ⬜ Committed only when the owner asks; push only on explicit request (hard rule 4).
