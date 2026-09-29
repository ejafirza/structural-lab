# Milestone 11 Plan — Minimalist Interface & Accessible Teaching Dialog

**Status: IMPLEMENTED — final verification pending.** The owner approved a minimalist
redesign of the academic visual lab: remove repeated copy and UI clutter, strengthen
visual hierarchy and spacing, and replace the nested teaching popover with a centered,
accessible one-topic dialog. The result cards become readable worked explanations
without changing engineering outputs or inventing intermediate values.

**Predecessor:** M10 was separately committed and pushed as `6af1f76`. This redesign is
kept as its own follow-up change. No solver, case, result, sign convention, or dependency
change is in scope.

---

## 1. Recommendation and owner decisions

The owner approved proceeding with the recommendations in this plan without another
review round. Confirmed choices:

1. Treat the interface as an academic visual tool first: **less is more**, with generous
   spacing, concise copy, and a clear hierarchy from Beam → Loads → Stiffness.
2. Retain exactly the concise safety note: “For learning only—not for structural design
   verification.”
3. Open teaching explanations only after explicit click or keyboard activation; never
   open a tutorial unsolicited.
4. Keep one centered modal dialog; relevant blue inline cross-reference links can replace
   the current definition, with a Back control for the exploration trail.
5. Keep number fields and sliders. Graph-first magnitude/span editing is future scope.
6. Preserve standard worked cases with substitutions. For mixed/profile cases, show
   actual inputs, the exact method and engine outputs only—do not fabricate resultants or
   intermediate numeric answers.
7. Keep the solver, cases, results and sign conventions unchanged.

## 2. Goals and non-goals

### Goals

- Reduce repeated instructions, redundant captions and unnecessary always-visible
  preset UI; keep detailed presets available on demand.
- Give beam setup, loads and beam stiffness distinct, legible hierarchy and comfortable
  control spacing.
- Keep E·I visible for every determinate beam regardless of selected load kind, because
  stiffness belongs to the beam rather than a particular load.
- Give each glossary term and result card one focused teaching dialog, with accessible
  keyboard activation, modal semantics, background inertness, focus management and
  Escape/backdrop close behavior.
- Present calculation method, substitutions and engine outputs as readable steps while
  separating method from answer when the engine does not provide a valid closed-form
  substitution.

### Non-goals

- No engineering calculations, result-card names/values, support/load behavior, solver
  path, case classification, diagram geometry, or sign convention changes.
- No formula-derived intermediate value unless it is itself an engine output or a
  permitted display conversion (metres to millimetres).
- No automatic tutorial, hover-to-open behavior, nested modal windows, AI tutor,
  graph-first controls, new dependency, or backend. Inline links stay in the existing
  dialog and require deliberate activation.
- Keep `src/engine.js`, `src/analysis.js`, and `ui/render.js` frozen for this presentation
  pass. `ui/renderm3.js` receives only interaction/accessibility attributes needed for
  topic activation and handle labels; it remains free of engineering math.

## 3. Interface and teaching behavior

### Minimalist shell

- Keep the established responsive M10 grid and light/dark/System theme behavior.
- Remove the tagline, repeated teaching instructions and redundant descriptions.
- Use concise Beam, Loads and Stiffness section headings. Keep presets in optional native
  disclosures, without removing access to the existing choices.
- Preserve number inputs, sliders, visible units, a short cue for each diagram's sign or
  scale, the one approved safety disclaimer, model disclosure and theme control.
- Stiffness is available for every determinate model and hidden only when analysis cannot
  solve deflection.

### One-topic teaching dialog

- A click or Enter/Space activation on a marked glossary term, support info button,
  result card, or eligible badge opens the same reusable centered dialog.
- Use `role="dialog"`, `aria-modal="true"`, a labelled title, a visible close control,
  initial close-button focus, and a Tab focus loop. Mark all preexisting page background
  siblings inert and restore their original inert state on close.
- Escape or backdrop click closes; restore `aria-expanded` and focus to the original
  trigger when it remains connected. Events within the dialog do not reactivate page
  triggers.
- Render glossary prose as text plus dictionary-validated inline links; keep worked-result
  material as text nodes. Do not auto-open explanations; learners choose each link.

### Worked explanations

- Keep a content-only model in `src/explain.js`; it formats a completed engine result and
  does not run the solver.
- Standard simply supported centered point-load and full-span uniform-load moment/
  deflection cases may show their valid equations and actual input substitutions.
  Off-center point-load deflection uses the integration method rather than the centered
  formula. Cantilever point-load distance is measured from the fixed end on either side.
- Mixed loads, profiles, partial/nonuniform distributions and other general shapes list
  their actual given load data. Explain the exact engine method without claiming an
  unavailable analytical intermediate number; report the engine's peak/result in a
  separate final step.
- Reaction cards route to their own component and support. Equilibrium and diagram
  explanations retain truthful units, one-sided shear meaning, and existing sagging /
  hogging and down-positive deflection conventions.
- All numeric displayed answers remain traceable to engine result fields, except the
  explicitly allowed metres-to-millimetres conversion.

## 4. Files and boundaries

| Area | Change |
|---|---|
| `ui/index.html`, `ui/style.css` | Minimalist hierarchy, concise copy, spacing, optional presets, readable centered modal and worked-step styles. |
| `ui/app.js` | Keep beam E·I available on every determinate load selection; provide one derivation group per activated result card. |
| `ui/popover.js` | Replace nested popover navigation with one accessible, centered one-topic modal and complete background inert/focus lifecycle. |
| `ui/renderm3.js` | Preserve result display and geometry; provide concise equilibrium state, card-specific routing and accessible names for diagram interactions. |
| `src/explain.js` | Format exact given inputs, valid standard equations, general methods and engine outputs; no duplicate solving or fabricated intermediates. |
| `test/*.test.js` | Assert provenance/honesty, card routing, modal semantics, keyboard/focus lifecycle, retained controls/cues, and frozen behavior. |
| `verify/teaching-cdp-verify.mjs`, `verify/shell-layout-check.mjs` | One serial M11 real-browser pass for accessibility, worked explanations, modal viewport and SVG regression coverage; shell regressions remain in their existing harness. |
| `readme.md`, `verify/readme.md`, this plan | Record current behavior and actual verification totals. |

No packages are added. `src/engine.js`, `src/analysis.js`, `ui/render.js`, and engineering
solver/result behavior are unchanged.

## 5. Implementation and verification sequence

1. Preserve M10 as its own pushed checkpoint; inspect branch and shared working tree.
2. Apply the minimal shell/copy/hierarchy pass without removing number fields, sliders,
   units, sign cues, optional presets or disclaimer.
3. Implement the single-topic dialog lifecycle and keyboard behavior.
4. Refactor worked explanations to use explicit inputs, valid standard equations and
   final engine outputs; extend provenance and honesty tests.
5. Run all unit tests and the complete browser regression set, including M5–M10
   regressions. M11's teaching and layout checks run serially in one Edge process/profile;
   confirm their combined result before release. Correct test assumptions where they
   contradict the approved modal design; do not weaken product behavior.
6. Compare protected files and confirm no calculations/results/dependencies changed.
7. Record the actual outcomes below. Keep this redesign separate from the M10 checkpoint.

## 6. Definition of done

- The page is visually quieter and easier to scan, with the concise safety note and all
  essential units/sign cues retained.
- E·I remains available for determinate point and distributed-load cases.
- One focused, accessible modal opens only on activation, supports repeated inline
  definition exploration with Back, and restores background state, focus, and trigger
  state after close.
- Standard explanations show valid substitutions; general explanations show actual
  inputs and exact method without invented numeric intermediates; displayed answers
  trace to engine outputs.
- The full Node unit suite passes, and the required browser harnesses pass with zero
  console errors. Current results and layout coverage must be recorded below before
  declaring this milestone complete.
- Frozen/engineering boundaries remain unchanged and no dependency is added.

## 7. Implementation record — 26 Sep 2026

**Implemented:**

- Simplified the page copy and input hierarchy, moved preset controls into optional
  disclosures, preserved numeric controls and all required units/sign cues, and kept the
  approved single-line disclaimer.
- Replaced nested teaching popovers with a centered one-topic modal. It is activated
  explicitly, exposes accessible dialog semantics, makes all page-background siblings
  inert, traps keyboard focus, and restores original inert state and trigger focus on
  close.
- Kept E·I accessible on determinate beams across point and distributed loads.
- Added explicit given-input summaries for complex cases and separated explanation
  methods from final engine outputs. Centered point and full-span uniform equations remain
  limited to their valid cases; cantilever point distances reflect either wall. No
  fabricated intermediate results.
- Updated unit/browser assertions to check modal semantics rather than non-modal popover
  behavior. The responsive modal is allowed to cover the underlying trigger; it must
  remain centered, fully in the viewport, and make the background inert.

**Verification record at implementation completion:**

- Focused Node checks: **27/27 passed**; full `npm test`: **180/180 passed**.
- Browser/CDP checks were not run in the implementation pass; historical totals at that
  point were not release evidence for its current state.
- At that point, SVG layout, accessibility-tree behavior, responsive dialog geometry, and
  browser console/runtime checks were still unverified. The later authorized attempt and
  its cleanup limitation are recorded below.
- M10 was not amended; no dependency was added.

**M11 verification architecture — 26 Sep 2026:** `verify/teaching-cdp-verify.mjs` is
now the sole M11 browser entry point, with infrastructure isolated in
`verify/teaching-browser-session.mjs`. That session owns the ephemeral loopback server,
one Edge/profile, CDP transport/error capture, and shutdown-gated cleanup; the entry
point owns only a serial sequence of live UI assertions. It runs teaching checks first,
then eight SVG layout configurations and desktop/360px dialog checks in the same Edge
process/profile.
Default point + stepped-profile explanation content and actual browser Tab/Shift+Tab
loop behavior are included.
Cleanup closes Edge, waits for process exit and the CDP endpoint to disappear, and only
then removes the profile whose exact `teach-m11-run-*` path was created by that run. If
shutdown cannot be confirmed, the profile is deliberately retained. Existing timestamped
profiles from the former M11 harnesses were removed separately; other temp entries are
not touched.

**Authorized browser attempt — 26 Sep 2026:** the one permitted invocation failed before
CDP attachment with `Edge exited before CDP became available`; the harness reported
`0/2` checks, and its owned `teach-m11-run-lqQYfI` profile was retained because Edge/CDP
shutdown was not confirmed. No second browser launch was made. Inspection showed the
runner exited its discovery loop as soon as the Edge wrapper reported exit, before trying
the profile's `DevToolsActivePort`; the failed run left that endpoint file in its own
profile, so this was a concrete startup-order race. The session now tries endpoint
discovery before interpreting the wrapper exit and attempts CDP close when connected,
then separately confirms process and endpoint shutdown. This in-scope fix is syntax- and
Node-suite-checked only, not browser-verified. The retained profile remained in `verify/tmp/` immediately after that failed invocation;
its profile-specific Edge process tree was later stopped and confirmed absent before the
owned directory was removed.

Node verification: `npm test` passed **180/180**, focused teaching/profile/deflection
checks passed **27/27**, and the session syntax check and diff check passed after the
startup-race adjustment. The subsequent single authorized browser invocation reached the
app and passed all **46 product checks**, including accessibility, focus loop, worked
explanations, eight SVG configurations and responsive dialog geometry. The harness's 47th check failed while deleting its profile with `EBUSY` on
`first_party_sets.db`, even though its cleanup path had confirmed the Edge process and
CDP endpoint were closed. A process query found no Edge process command line containing
that exact run profile path; that exact owned profile was then removed, and `verify/tmp/`
was empty. No second browser run was made. After the observed `EBUSY`, cleanup now retries
only transient busy/locked removal errors for the exact owned directory after confirmed
Edge and CDP shutdown. The retry change passed `node --check`, `npm test` (**180/180**),
and `git diff --check`, but has not been browser-verified; the single-run requirement was
respected.

**Release record:** the full authorized browser verification pass completed 29 Sep 2026 on the
final working tree (notation-normalized labels, focused interaction tests, and the teaching
dialog with in-context glossary links). All harnesses green, zero console errors:

| Harness | Result |
|---|---|
| `verify/teaching-cdp-verify.mjs` (M11 teaching + 8 SVG configs + dialog geometry) | **47/47** |
| `verify/shell-cdp-verify.mjs` (M10 shell/theme) | **22/22** |
| `verify/consolidation-cdp-verify.mjs` (M5 anchor) | **32/32** |
| `verify/multi-load-cdp-verify.mjs` (M6/M6.5) | **22/22** |
| `verify/profile-cdp-verify.mjs` (M7) | **30/30** |
| `verify/deflection-cdp-verify.mjs` (M8) | **15/15** |
| `verify/shell-layout-check.mjs` (6 widths × light/dark + crowded/cantilever) | **27 PASS** |
| `verify/consolidation-layout-check.mjs` | **6/6** |
| `verify/multi-layout-check.mjs` | **6/6** |
| `verify/profile-layout-check.mjs` | **8/8** |
| `verify/deflection-layout-check.mjs` | **8/8** |

Unit suite: **188/188** (`npm test`). Harnesses were updated where they asserted pre-notation
strings (`15 kNm` → `15 kN·m`, `RB =` → `R₍B₎ =`, ASCII card labels → `data-steps` ASCII keys)
and where the dialog header gained a Back button (focus order: Close → body links; Back stays
hidden without a trail). Viewport-centering checks now measure against the visible viewport
(`documentElement.clientWidth/Height`), excluding the page scrollbar.

Two M10 layout contracts had regressed in an uncommitted working-tree pass — the Model
disclosure lost its default-open state and the two-column `model results` grid had been
rewritten to stacked beam-first rows. Both were restored to the committed M10 shell contract
(`open` attribute, `"model results" / "model beam" / …` areas, stacked order model → results →
beam), and `test/ui-m10.test.js` was realigned accordingly while keeping its notation and
interaction assertions. The interaction features of that pass (support cycling, beam context
menu, in-context glossary links with Back) are retained and verified by the harnesses above.

`verify/tmp/` was emptied after the pass; transient harness Edge processes were confirmed
stopped. M11 is release-complete pending owner review; M5–M10 browser regressions all pass.
