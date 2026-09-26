# Milestone 10 Plan — Application Shell, Theme & Information Density

**Status: COMPLETE — approved and implemented 26 Sep 2026.** The owner approved the M10
shell pass and emphasized the product philosophy: **academic tool first** — a simple
visual lab with clear, correct explanations. M10 stays understandable, low-clutter, and
presentation-only. Actual changes and verification results are recorded in §11.

**Naming note:** The request called the next work “9.5”; the owner selected the documented
“M10 shell pass” scope. The repository already describes this candidate as M10, so this
draft uses `plan-m10.md` / M10 to keep the milestone ledger consistent. Renumbering is
not part of the proposed work.

**Predecessors:** M1–M9 are complete; M9 is committed and pushed as `4bd3ab3` on
`main`. Pre-M10 baseline: 167/167 unit tests and ten M5–M9 browser harnesses documented
in `verify/readme.md`. M10 adds no engineering capability.

---

## 0. Recommendation summary

M10 is a **presentation-only shell pass**. It makes the existing lab easier to scan and
use without changing the supported beam model, a result, or any calculation.

1. **Desktop layout:** place the Model editor in a compact left column and the Results
   plus all four diagrams in a fluid right column. Use the available width rather than
   the current narrow, single-column stack.
2. **Responsive fallback:** at tablet and phone widths, return to one column in a
   deliberate reading order; avoid horizontal scrolling and preserve usable diagrams
   and controls.
3. **Light/dark appearance:** follow the operating-system preference by default and
   offer a small, keyboard-accessible System / Light / Dark cycle in the header. Remember
   the user’s appearance choice only; do not persist beam-model state.
4. **Foldable Model editor:** use native disclosure semantics, initially open. When
   folded, retain a useful summary (Model and current load count) while leaving Results
   and diagrams visible and live.
5. **Equilibrium badge relocation:** move the existing equilibrium self-check badge
   from the global top bar into the Results area, near the determinacy badge. Keep its
   existing ID, content, live-region semantics and M9 explanation trigger.
6. **Careful label trim:** remove redundant copy and shorten secondary panel captions,
   while retaining all numerical values, units, sign conventions, load identities,
   warnings, and the educational disclaimer. Full definitions remain available in M9.

**Architecture boundaries:** no solver, load descriptor, support classification,
calculated result, sign convention, engine input or rendering geometry changes. Keep
`src/engine.js` and the legacy `ui/render.js` byte-identical. `ui/renderm3.js` may receive
only presentation-token changes needed to make the live SVG diagrams legible in both
themes; it must remain free of engineering mathematics.

**Expected footprint:** CSS/HTML shell work, a small theme controller, bounded M3 SVG
palette adaptation, focused tests, two browser harnesses and documentation. No new
runtime dependency, network service, account, or backend.

## 1. Goals and non-goals

### Goals

- Make the diagrams the dominant working surface on a normal desktop display, with the
  Model controls close at hand but not taking the entire page width.
- Retain the current immediate experiment → observe loop: no Calculate button, no mode
  switch, no change to the model’s one-source-of-truth state.
- Make dark appearance cover the whole visible product consistently: shell, inputs,
  badges, cards, popover, SVG labels, markers and fills.
- Preserve accessibility and M9 discoverability through keyboard, screen reader and
  touch interactions.
- Ensure the single-column experience remains complete at narrow widths.

### Explicitly out of scope

- Any engineering feature, new load/support kind, formula, solver, unit system, result
  format or change to the educational-tool disclaimer.
- AI tutor/chat, content search, standards references, accounts, remote services or
  persisted beam models.
- Reworking the M9 glossary/popover interaction or changing its authored content.
- Diagram geometry, sampling, label placement logic, drag/keyboard mechanics, or the
  four-panel results order.
- Redesigning the project brand or introducing a UI framework, component library or
  color-mode dependency.
- Rewriting the legacy `ui/render.js` M2 reference renderer.

## 2. Proposed shell and responsive behavior

### Desktop structure

Use an explicit two-column shell in `ui/index.html`:

- **Left / Model column:** a bounded-width Model editor, approximately 280–340 CSS px;
  it may grow to fit the longest control but must not squeeze the diagram column below
  a usable width.
- **Right / Results column:** determinacy and equilibrium status, result cards, then
  Beam → SFD → BMD → deflection panels in their current order. This column receives the
  remaining width and may grow to a generous desktop maximum without stretching text
  measure unnecessarily.
- **Footer:** full shell width below both columns; keep the educational disclaimer
  visible and unchanged in meaning.
- **Header:** brand at left and the appearance control at right. The equilibrium badge
  no longer competes with the brand in the sticky header.

Use CSS Grid with `minmax(0, 1fr)` for the fluid column so SVG panels cannot force page
overflow. Do not make the Model sidebar sticky in this pass: the editor can be tall, and
sticky behavior would add scroll/viewport edge cases without being necessary to the
layout goal.

### Tablet and phone

- At a tested breakpoint in the approximate 900–1000 px range, stack the columns.
  Choose the final breakpoint from real-browser measurements, not device-name guesses.
- Stacked order: Model editor, Results/status, Beam, SFD, BMD, deflection, footer.
- Keep existing small-screen control wrapping; tighten only where the new shell exposes
  an actual overflow or cramped control.
- Test at 1440, 1024, 768, 560, and 390 CSS px (or nearby representative widths), plus
  browser zoom/device scale as supported by the harness. The page must have no
  horizontal overflow at narrow widths.

### Foldable Model editor

Wrap the editor content in a native `<details>` / `<summary>` disclosure, styled as the
existing panel. Proposed behavior:

- Open by default on every fresh page load, keeping the current first-use experience.
- Summary stays concise and visible when closed: “Model” plus the current load count;
  no important validation/error state is hidden exclusively inside the collapsed body.
- Native Enter/Space and focus behavior; no custom disclosure state machine.
- Collapse hides controls visually and from normal keyboard navigation, but does not
  delete or reset state. Reopening shows the exact same selected load and values.
- Do not store open/closed state across reloads in M10.

The existing control IDs (`num-span`, load editor fields, support selects, E·I controls,
load list, shape-point table and buttons) remain unchanged so app wiring and verification
anchors keep targeting the same elements.

### Equilibrium badge relocation

Move `#eq-badge` into the Results panel, adjacent to the determinacy badge and before
the cards. Preserve:

- ID `eq-badge` and updates from `renderM3`;
- its explanatory `data-term="equilibrium-check"` entry and keyboard reachability;
- `role="status"`, `aria-live="polite"`, status text, and success/failure classes;
- the existing determinacy and equilibrium explanation content.

The existing delegated M9 popover must still open from the moved badge, position within
the viewport, and close by the existing mechanisms.

## 3. Appearance model

### Preference behavior

- Default to `prefers-color-scheme` when there is no saved explicit preference.
- Add one compact header button/control cycling **System → Light → Dark → System**.
  Its accessible name announces the current selection, and its visible state is
  understandable without color alone.
- Store only the chosen appearance (`system`, `light` or `dark`) under one namespaced
  localStorage key. System mode removes the explicit override and resumes following the
  OS preference. Do not store engineering inputs, results, or disclosure state.
- If localStorage is unavailable or throws (e.g. restricted browser context), apply the
  selection in memory and keep the app fully functional; preference persistence is an
  enhancement, not a runtime dependency.
- Respect OS preference changes while in System mode. Explicit Light/Dark stays explicit
  until the user cycles back to System.

### Theme tokens and diagrams

Centralize semantic CSS custom properties for at least:

- page/background, panel/surface, text, muted text, border and focus outline;
- input/chip backgrounds and borders, popover surface/shadow;
- success, warning, error and neutral status foreground/background/border;
- beam/support/axis/guide, point load, distributed load, reaction, shear, moment and
  deflection colors, translucent diagram fills, and SVG text halo/marker surfaces.

Keep the current light palette as the default so M10 does not gratuitously alter the
established light appearance. Add a tested dark palette with readable foreground,
border, status and chart contrast. Use theme variables rather than hard-coded white
where M3 SVG halos and marker fills currently assume a light background; otherwise dark
mode can leave white patches around labels/markers or make them disappear. Do not
silently recolor the legacy frozen renderer.

Retain explicit text/sign annotations and shape distinctions: meaning must not depend
on color alone. Use browser-computed styles to verify representative text, controls,
status badges, popover and SVG tokens in light, dark, and system-following modes.

## 4. Label and copy trim (bounded)

This is an information-density pass, not removal of engineering context.

Proposed edits, subject to owner review:

- Remove the Beam panel’s generic “supports · load · reactions” subtitle because those
  items are already drawn and labelled in that panel.
- Condense the long SFD/BMD/deflection secondary headings for scan speed, while retaining
  units and all essential sign/scale cues (e.g. positive shear direction, sagging vs
  hogging sign/drawing convention, and the fact that deflection is exaggerated with the
  true value printed).
- Shorten the M9 instruction sentence to one compact instruction, or remove the extra
  sentence only if a first-use check shows the dotted underline and ℹ affordance remain
  discoverable. Do not remove the actual triggers.
- Preserve every load number/identity, support label, reaction, resultant, centroid,
  peak value/position, axis annotation, validation message, classification note and
  educational disclaimer.
- Keep all exact result-card labels and values stable unless a verified accessibility
  issue requires a proposed, separately documented exception. M9 derivation routing
  currently keys on labels.

Before implementation, review the exact heading/hint copy against screenshots and the
M9 glossary. If trimming would discard a convention rather than merely shorten its
presentation, keep the convention and leave that text unchanged.

## 5. Files and intended changes

| File | Proposed change |
|---|---|
| `ui/index.html` | Restructure the Model / results columns; convert the Model editor shell to native disclosure while preserving all input IDs; relocate `#eq-badge`; add accessible appearance control; apply only approved concise headings. |
| `ui/style.css` | Two-column and responsive grid; disclosure/header styles; System/Light/Dark semantic token sets; recolor input, panel, card, status, popover and responsive surfaces through tokens; preserve current light palette. |
| `ui/theme.js` (new, if kept as the smallest clean seam) | Initialize OS/saved preference, accessible control, system-change listener and guarded localStorage. Keep it presentation-only and independent of engineering state. |
| `ui/app.js` | Minimal theme-module boot wiring only if required by the chosen module boundary; no model-state or solver changes. |
| `ui/renderm3.js` | Presentation-only palette and SVG halo/marker surfaces switched to CSS variables; preserve geometry, labels, result reads and all engineering behavior. `ui/render.js` stays frozen. |
| `test/theme.test.js` (new) | Theme preference, cycling, OS-following behavior and storage-failure tests using Node’s built-in test runner. |
| `test/ui-m10.test.js` (new) | Shell hooks/IDs, disclosure semantics, result/status placement and no-engineering-math/source-boundary checks as appropriate to existing test conventions. |
| `verify/shell-cdp-verify.mjs` (new) | Browser-level shell behavior, theme interaction/persistence, disclosure, relocated badge/popover, and console-error assertions; proposed port 9349. |
| `verify/shell-layout-check.mjs` (new) | Viewport/layout, overflow, SVG and popover geometry audit across widths/themes; proposed port 9350. |
| `readme.md`, `verify/readme.md`, `plan-m10.md` | Update architecture/file map, verification instructions and implementation record only after approved implementation and actual results. |
| `src/engine.js`, `ui/render.js`, solvers, descriptors, glossary content | Frozen / untouched. |

No package installation or dependency change is planned.

## 6. Implementation sequence

1. **Establish exact baseline:** inspect current tracked files and branch; confirm the
   pushed M9 baseline and run the agreed pre-change unit and browser anchors. Do not
   overwrite unrelated workspace edits. Respect this repo’s local approval rules before
   running commands; never install packages or write outside the project workspace.
2. **Add semantic theme tokens:** preserve current light tokens, define dark tokens and
   map hard-coded interface surface colors to semantic variables. Convert only live M3
   SVG palette/halo/marker constants needed for background-aware rendering.
3. **Add appearance control:** implement System/Light/Dark selection with accessible
   text/state, OS-following default, explicit override, guarded localStorage and an
   OS-change listener limited to System mode.
4. **Restructure the page shell:** put Model editor and Results/diagrams in named grid
   columns. Preserve existing IDs and panel order; move the equilibrium badge into
   Results without changing its live-region or M9 trigger contract.
5. **Fold the editor natively:** use `<details>` / `<summary>`, open by default, with a
   dynamic Model/load-count summary; verify values and selected-load state survive a
   close/reopen.
6. **Apply the approved copy trim:** shorten only the specific redundant/secondary copy
   in §4; keep essential engineering conventions and all result labels/value text.
7. **Add focused automated tests:** theme logic, storage failure, native disclosure
   contract, shell semantics and preserved M9 hooks. Extend fixtures only where required;
   do not silently weaken or delete existing assertions.
8. **Build two real-browser harnesses:** functional shell/theme checks and a layout audit.
   Exercise representative beam states (default point, distributed/profile, multi-load,
   cantilever, indeterminate) at desktop, tablet and phone widths, in light and dark.
9. **Run all regression anchors:** complete unit suite and all ten existing M5–M9
   harnesses unchanged, followed by both M10 harnesses. Confirm zero browser console
   errors, no horizontal overflow and clean geometry. Compare frozen files byte-for-byte.
10. **Document actual outcome:** record actual test/check counts and any deviations in
    this plan’s implementation record and the README / verification guide. Report what
    was changed and any remaining owner content decisions. Commit/push only if separately
    requested; this plan itself grants no commit or push authorization.

## 7. Test and verification plan

### Unit tests

- `node --test`: the 167-test M1–M9 regression baseline remains green; M10 adds focused
  tests for preference choice/cycle, System mode, explicit override, persisted preference,
  storage exceptions and shell behavior. One M8 renderer assertion now expects the
  theme-aware SVG marker halo instead of a fixed white fill; no calculation assertion
  was changed.
- UI contract tests verify one `#eq-badge` in Results, preserved IDs and data-term,
  native disclosure defaults open and does not replace/reset controls, theme control
  presence/labels, and exact result-card labels required by `groupForCard`.
- Source guards continue to prove the UI/renderer contains no engineering calculations.
  No test may be removed or relaxed merely to accommodate the shell change.

### Functional browser harness (`verify/shell-cdp-verify.mjs`)

Verified assertions (22 functional checks):

1. Page boots without errors in default/System mode; current OS appearance is reflected.
2. Theme control is keyboard reachable and announces System / Light / Dark accurately.
3. Cycling through modes updates document theme tokens; returning to System follows an
   emulated OS preference change.
4. Explicit preference survives reload; blocked/unavailable storage does not break
   startup or theme switching.
5. Light palette remains the current default when the host reports light mode.
6. Dark mode has non-empty readable computed colors for body, panels, form controls,
   focus, badges, cards and popover; M3 SVG line/fill/label/halo tokens resolve.
7. Native Model disclosure begins open; click/keyboard fold and reopen it without
   changing load count, selected load, input values or calculated results.
8. Model summary reflects the current load count when loads are added/removed.
9. `#eq-badge` is inside Results, still updates its status, remains keyboard accessible,
   and opens the equilibrium M9 explanation.
10. Result labels/cards still open the right M9 derivation after shell movement.
11. Copy changes do not remove units, sign descriptions, status meanings or the
    educational disclaimer.
12. Representative editing interactions still recompute live; no exception/console
    errors in either theme.

### Layout/theme browser harness (`verify/shell-layout-check.mjs`)

- Audit at desktop, tablet and phone widths (at least 1440, 1024, 768, 560 and 390 CSS
  px); assert two columns only above the measured breakpoint, one column below, and no
  document-level horizontal overflow.
- Verify the Model column and right result column are visible, correctly ordered and do
  not overlap; all four diagram SVGs remain inside their cards and retain viewBox/sample
  geometry.
- Run shell geometry on default and crowded model configurations, including multiple
  loads/profile, cantilever and indeterminate states.
- Open M9 popovers from both a regular term and the relocated equilibrium badge; assert
  in-viewport positioning and no trigger overlap at desktop and narrow widths, in both
  themes.
- Check color tokens and representative foreground/background contrast in System,
  Light and Dark modes. Record objective contrast checks for primary text, muted text,
  controls and status badges; use a minimum 4.5:1 target for normal text where
  applicable, and document any non-text/chart exceptions with a visible label or shape
  cue rather than relying on color alone.
- Existing diagram-specific layout harnesses remain the geometry anchors and must pass
  without assertion changes.

### Regression anchors and boundaries

- Re-run all ten current verification harnesses in `verify/readme.md` unchanged (M5
  consolidation pair, M6/M6.5 pair, M7 profile pair, M8 deflection pair, M9 teaching
  pair), then both M10 harnesses.
- Require zero new console errors and zero SVG clipping/label-overlap regressions in
  existing configurations.
- `src/engine.js` and `ui/render.js` byte-identical; no solver, descriptor, support
  catalog, computed result, sign convention or glossary content change.
- Zero dependencies added. No model persistence or network access. No files written
  outside the project workspace.
- CI’s existing Node 20/22 unit-test workflow remains unchanged; browser verification
  is run locally using the existing project harness approach.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Wider layout makes plots look too stretched or controls too narrow | Use bounded Model width and `minmax(0, 1fr)` plot column; test actual viewports and both typical/crowded models. |
| Responsive grid order differs from document/read order | Keep DOM order aligned with the mobile reading order; use visual grid placement without CSS order tricks that confuse keyboard users. |
| Dark mode leaves white SVG halos/marker disks or low-contrast labels | Make M3 SVG surfaces/halos use semantic theme tokens; verify computed SVG styles in a real browser for light and dark. |
| Hard-coded CSS colors remain in inputs, error states, or preset controls | Audit all visible CSS colors and map them to semantic tokens; browser-test every major state, not just the page background. |
| User preference storage is unavailable | Guard storage reads/writes; use in-memory selection and OS default, with no startup failure. |
| OS theme changes overwrite an explicit user choice | Subscribe to media-query changes only while preference is System; explicit Light/Dark wins. |
| Folding hides a critical warning or users think values reset | Keep validation/errors visible outside the collapsible body when active; default open; test state invariance across fold/unfold. |
| Moving `#eq-badge` breaks existing selectors or the M9 popover trigger | Preserve its ID/attributes and delegated event model; all CDP harnesses assert its new parent and interaction. |
| Label shortening removes an important convention or breaks derivation lookup | Preserve value/card labels and all units/sign rules; constrain copy edits to §4 and exercise glossary/derivation doors. |
| Theme work expands into frozen M2 renderer | Restrict palette changes to the live M3 renderer; keep `ui/render.js` byte-identical and its legacy tests green. |

## 9. Definition of done (verified)

1. Approved scope only; no calculations, engineering assumptions, result values or load
   behavior changed.
2. Desktop two-column shell and narrow single-column shell both verified; no overlap or
   horizontal overflow at tested widths.
3. System/Light/Dark modes work, the System mode tracks OS changes, explicit selection
   persists safely, and color/contrast checks pass.
4. Model editor folds and reopens natively without losing state; it is open by default.
5. Equilibrium badge sits in Results and keeps status/live-region/M9 behavior intact.
6. Approved copy trim preserves all essential engineering data and the product
   disclaimer; all existing result-card labels remain compatible with M9 derivations.
7. All 180 unit tests pass; all ten existing browser harnesses and both M10 harnesses
   pass (211 browser checks total); no browser console errors.
8. Frozen boundary verified (`src/engine.js`, `ui/render.js`, solver outputs); no new
   dependency, backend, network service or model persistence.
9. README and verification guide record verified behavior and actual counts; this plan's
   implementation record is complete in §11. No commit or push was made.

## 10. Owner decisions confirmed

The owner approved the following recommended choices before implementation:

1. **Milestone naming:** M10 shell pass, as recorded in the repository (the request
   called it “9.5”). Confirmed by the owner.
2. **Theme control:** System / Light / Dark cycle; follow OS by default; persist only
   appearance preference locally (recommended).
3. **Model disclosure:** native disclosure, open on first load, no persisted fold state;
   show current load count while closed (recommended).
4. **Equilibrium badge:** move into Results beside determinacy, retaining the existing
   explanation trigger and live status (recommended).
5. **Copy trim:** approve the conservative §4 list; keep units, all sign conventions,
   numerical annotations, result-card labels and disclaimer (recommended).
6. **Desktop/mobile behavior:** Model sidebar + fluid results on desktop; stacked layout
   at a measured responsive breakpoint (recommended).

The owner approved the plan and authorized implementation; the completion evidence is recorded above.

## 11. Implementation record — 26 Sep 2026

**Outcome:** M10 is complete. It improves the lab's working space and appearance while
keeping the academic purpose central: a simple visual experiment with clear, correct
explanations. No beam calculations, result values, sign conventions, solver behavior,
engineering assumptions, or glossary content changed.

**Implemented:**

- Responsive two-column desktop shell; at 980 px and below it becomes one column in
  reading order. The Model editor is a native, initially open foldable section, and its
  heading shows the live load count. Folding preserves the model and results.
- System / Light / Dark appearance button; System follows the device setting, explicit
  Light/Dark preference is remembered when browser storage permits, and storage failure
  does not break the lab.
- Equilibrium self-check now sits with Results and keeps its status/accessibility and M9
  explanation behavior. Copy was shortened conservatively; units, sign explanations,
  true deflection scale, result-card labels and educational disclaimer remain.
- M3 diagram colors follow the theme; M9 explanation windows reposition to fit the
  available screen space. No new dependencies.

**Files changed:** `ui/index.html`, `ui/style.css`, `ui/theme.js` (new), `ui/app.js`,
`ui/renderm3.js`, `ui/popover.js`, `test/theme.test.js` (new), `test/ui-m10.test.js`
(new), `test/ui-m8.test.js` (theme-aware halo expectation),
`verify/shell-cdp-verify.mjs` (new), `verify/shell-layout-check.mjs` (new),
`readme.md`, `verify/readme.md`, and this plan. No package/dependency changes.

**Verification:**

- `node --test`: **180/180 passed** (the previous 167 plus 13 M10 tests).
- All ten M5–M9 browser harnesses passed unchanged: 32/32 + 6/6, 22/22 + 6/6,
  30/30 + 8/8, 15/15 + 8/8, and 22/22 + 13/13.
- M10 functional harness: **22/22**. M10 layout harness: **27/27**. Combined, all
  browser checks total **211/211** with no console errors.
- Responsive checks passed at 1440, 1024, 980, 768, 560 and 390 px, with no page-wide
  horizontal overflow. Both light and dark text-contrast checks met the 4.5:1 target.
- `src/engine.js` and frozen `ui/render.js` were not changed; diagram tests continue to
  verify results come from the existing engine output.
- `git diff --check` passed. Work remains uncommitted and unpushed, as requested.

No remaining M10 content decisions are needed.
