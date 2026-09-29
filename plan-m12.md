# Milestone 12 Plan — Student Empathy Pass (UI clarity, no new concepts)

**Status: APPROVED (owner, 29 Sep 2026). Fix 7 (typographic reaction subscripts) added
at approval. IMPLEMENTED 29 Sep 2026 — see §7.**

## 1. Motivation (from the 29 Sep 2026 user-perspective walkthrough)

The product was driven end-to-end as a student: dragging loads, forcing the beam
indeterminate, adding profile loads, opening every derivation door, switching supports.
Verdict: the concept and the deterministic teaching layer are the strongest parts of the
product; the friction is concentrated in eight specific UI spots, seven of which are
scoped below as small, testable fixes. The AI tutor remains parked indefinitely (owner
decision, 29 Sep 2026): the hand-written teaching layer already fulfils "the engine
calculates, AI explains", and a BYO-key chatbot would be invisible to most visitors and
dilute the curated pedagogical voice.

The fixes share one theme: **the app does the right things but does not always tell the
student what it is doing.** No solver, result, sign-convention, or dependency change is
in scope.

## 2. The seven fixes

### Fix 1 — Editor identity header ("what am I editing?")

**Problem.** The Model editor's contents swap depending on which load row is selected
(point fields ↔ distributed editor ↔ shape-point table). This is the correct general
model, but nothing states the causal link selection → editor, so controls appear to
vanish for no reason.

**Fix.** A quiet one-line header at the top of the editor area inside the Model panel:
`Editing: Load 2 — distributed (4 shape points)` or `Editing: Load 1 — point load`.
Updated by `syncSelectedControls()` on every selection change; visually subordinate
(small, muted). Pure UI state readout — no new mode, no new concept.

### Fix 2 — Intentional empty states on unsolved diagrams

**Problem.** Pin+pin (the most tempting student experiment) yields two "–" cards and
three empty diagram panels that look broken rather than intentional. The explanation
exists only as a note near Results.

**Fix.** The existing `placeholder()` text in each empty diagram panel gains a teaching
pointer: e.g. "Not solved — this support setup needs methods beyond statics. Why?
Activate the Reactions card." The unsolved cards already carry the
`statically-indeterminate` glossary door; the panels now visibly route to it.
Implementation: extend the `placeholder()` message in `ui/renderm3.js`; no new
interaction machinery — the door is the existing card.

### Fix 3 — Remove developer vocabulary from student copy

**Problem.** The indeterminate note says "…which is outside this **milestone**" —
internal roadmap language a civil engineering student cannot parse.

**Fix.** In `src/supportmodel.js` (the classification note): "…compatibility / force
method (deflection), which is beyond this tool." All tests asserting the note are
updated in the same commit.

### Fix 4 — Make the invisible affordances visible

Three sub-fixes, no behaviour change:

- **4a. Derivation cue on result cards.** Solved cards get a persistent quiet affordance
  (a small "How?" cue) so the best teaching feature is discoverable without a paragraph
  of instructions. Keyboard/aria semantics unchanged; the derivation-door contract
  (`data-steps` ASCII keys) is untouched.
- **4b. Instructions out of the Beam heading.** The h2 currently carries three sentences
  of instruction. The heading becomes just "Beam"; the instructions move to a separate
  muted cue line beneath it (same copy, reorganised: desktop-only parts stay
  desktop-only via the existing `desktop-beam-cue` mechanism).
- **4c. Presets discoverable.** The "Load presets" disclosure opens by default when a
  distributed load is selected (and may close when a point load is selected — presets do
  not apply to point loads). Presets remain fill-data chips, never modes.

### Fix 5 — Reset

**Problem.** After building a six-load monster there is no way back to the clean
teaching default except removing loads one by one — a real classroom friction.

**Fix.** A "Reset" button in the Model panel beside the load-add row. One click
restores the factory state exactly: span 6 m, one 10 kN point load at 3 m, pin + roller,
default E·I — extracted as a frozen `DEFAULT_STATE` constant in `ui/state.js` (the
single source for both boot state and reset, so they cannot drift). Confirm not required
(everything is re-derivable); an `announce()` message reports what happened.

### Fix 6 — First card should not be a zero

**Problem.** Card order is H₍A₎ (0 kN), V₍A₎, V₍B₎, Mₘₐₓ, deflection — the first thing
every student reads is the trivial zero horizontal reaction.

**Fix.** Reorder solved cards to: V₍A₎, V₍B₎, Mₘₐₓ (accent), max deflection, H₍A₎ last.
The H card gains a one-word sub ("no horizontal loads") so the zero reads as an insight,
not a defect. Ordering change is render-order only; `explain.js` `groupForCard` parses
labels, not order, so derivations are unaffected. Unit tests asserting card order
(ui-m9, ui-m10) are updated deliberately. (Subscript rendering of the labels is Fix 7.)

### Fix 7 — True typographic reaction subscripts (added at approval)

**Problem.** Reaction labels use `V₍A₎` — the Unicode fallback of parenthesised
subscript letters — because Unicode has no subscript capital A/B/w at all. The owner
wants textbook-quality subscripts everywhere (`V_A`, `V_B`, `M_A`, `ΣM_A`, `V_wall`
rendered with true subscripts), like `Mₘₐₓ` already is in substance.

**Fix.** The visible-label pipeline moves from plain strings to **rich text segments**:
a label/step/equation becomes `{ text, sub? }` parts; DOM renderers emit
`<sub>` (HTML) / `<tspan baseline-shift="sub">` (SVG) for subscript parts; the pure
modules (`src/explain.js`, `src/glossary.js`) stop carrying presentation glyphs and
carry semantic notation (`V_A`, `ΣM_A`, `M_max`) with a small formatter shared by the
renderers. The `data-steps` ASCII keys (`Reaction HA`) are untouched — they are
derivation-door keys, not display. Internal engine identifiers stay ASCII (out of
scope, unchanged). Test assertions move from glyph strings (`R₍B₎ =`) to the semantic
source (`R_B =`) plus structural checks on the rendered subscript segments.
`verify/*.mjs` browser assertions check `textContent` (subscripts concatenate naturally)
so most browser checks need only glyph→plain swaps.

## 3. Goals and non-goals

**Goals.** State communication (1, 2), honest copy (3), affordance visibility (4),
classroom ergonomics (5), first-impression ordering (6), textbook-quality notation (7).
All verifiable with the existing unit + browser harnesses.

**Non-goals.** No solver/engine changes; no new loads, supports, or modes; no theme or
layout-grid changes (the M10 two-column contract stays byte-for-byte); no AI tutor (parked
indefinitely); no GitHub Pages/deploy work (separate concern); no dependency added;
internal engine identifiers untouched.

## 4. Files and boundaries

| Area | Change |
|---|---|
| `ui/index.html` | Reset button; editor identity header element; Beam heading split into h2 + cue line |
| `ui/style.css` | Muted styles for the new header/cue/affordance + subscript styling; no grid or theme-token changes |
| `ui/state.js` | Extract frozen `DEFAULT_STATE` (single source for boot + reset) |
| `ui/app.js` | Identity-header update in `syncSelectedControls`; reset wiring; presets-disclosure default-open for distributed selection |
| `ui/renderm3.js` | Rich-text label/step renderer (`<tspan>` subscripts); `placeholder()` teaching pointer; card order + H-card sub + "How?" cue |
| `src/explain.js` | Labels/steps/equations as semantic notation + rich segments (no presentation glyphs) |
| `src/glossary.js` | Same notation semantics in entry text/links (no glyphs) |
| `src/supportmodel.js` | "outside this milestone" → "beyond this tool" (note text only; classification logic untouched) |
| `ui/popover.js` | Render rich segments in dialog steps (HTML `<sub>` path) |
| `test/*.test.js` | Deliberate updates: card order (ui-m9/ui-m10), note copy, semantic notation assertions, new assertions for header/reset/affordance/subscripts; frozen-boundary and notation guards updated to the new scheme |
| `verify/*.mjs` | Teaching/shell harnesses: reset, identity header, unsolved-panel pointer checks; glyph→plain textContent swaps |

Frozen files (`src/engine.js`, `src/analysis.js`, `ui/render.js`) are not touched.

## 5. Implementation and verification sequence

1. ~~Owner approves this plan~~ — approved 29 Sep 2026, Fix 7 added.
2. `DEFAULT_STATE` extraction + reset (Fix 5) — smallest standalone piece, unit-tested.
3. Copy fixes (Fix 3) + Beam heading reorganisation (4b) — text-only.
4. Card order + H-card sub + "How?" cue (Fix 6, 4a).
5. Editor identity header (Fix 1) + presets default-open (4c).
6. Unsolved-panel pointers (Fix 2).
7. Subscript label pipeline (Fix 7): formatter + explain/glossary semantics →
   renderm3/popover renderers → test/verify assertions.
8. Full verification: `npm test` (all prior anchors green), `node --check` per touched
   file, `git diff --check`, then the browser matrix — M11 teaching and M10 shell
   harnesses at minimum, zero console errors.
9. Record outcomes in this plan §7 and update readme/handoff; single commit; push.

## 6. Definition of done

- A student can always answer "what am I editing?" and "why is this panel empty?" from
  the screen alone; no student-facing string says "milestone".
- Reset returns the exact boot state; defaults live in exactly one place.
- Derivation doors, drag, and context menu are discoverable without reading a paragraph.
- First result card is a meaningful number; the zero-H card explains itself.
- Every visible reaction/equation symbol renders with true typographic subscripts
  (HTML `<sub>` / SVG `<tspan>`), in cards, derivations, glossary, and SVG diagrams;
  no `₍…₎` fallback glyphs remain anywhere student-facing.
- All unit tests pass (existing count + new assertions), browser harnesses green with
  zero console errors, no dependency added, M10 grid and all engineering behaviour
  unchanged.

## 7. Implementation record — 29 Sep 2026

All seven fixes implemented and verified:

- **Fix 5 (Reset):** frozen `DEFAULT_STATE` in `ui/state.js` (deep-copied on boot and on
  reset — one source, no drift); `Reset` button beside the load-add row; reset also
  re-syncs the span inputs and support selects (both were boot-bound only — a real gap
  the new test caught). Test: 'reset restores the exact factory beam'.
- **Fix 3 + 4b (copy/heading):** supportmodel note now says "beyond this tool"; the Beam
  h2 is just "Beam" with the interaction instructions in a separate `.beam-cue` line.
- **Fix 6 + 4a (cards):** order VA, VB, Mmax (accent), deflection, HA last with the sub
  "no horizontal loads"; solved cards carry a persistent quiet "How?" cue.
- **Fix 1 + 4c (editor):** `editing-note` role=status reads "Editing: Load N — kind"
  and updates on every selection change; the Load-presets disclosure opens automatically
  while a distributed load is selected and closes for point loads.
- **Fix 2 (empty states):** unsolved diagram placeholders now read "Not solved — …
  Why? Activate the Reactions card." and route to the existing glossary door.
- **Fix 7 (subscripts):** content modules now carry semantic notation (`V_A`, `ΣM_A`,
  `R_B`, `M_wall`) with zero `₍…₎` glyph fallbacks left in any user-facing string; the
  renderers split `_X` runs into true typographic subscripts — SVG `<tspan
  baseline-shift="sub">` on the beam, HTML `<sub>` in result-card labels and every
  derivation-dialog title/equation/substitution/glossary link. `Mₘₐₓ`, `vₘₐₓ`, `ΣFₓ`,
  `ΣFᵧ`, `ΣMₐ` keep their native Unicode subscripts (those letters exist). Rendered
  textContent reads the plain semantic form ("VB = 5 kN"), which the tests assert.
- Harness hardening found during the work: `bootApp` now resets the state-module
  singleton (state leaked across tests because state.js has a stable import specifier);
  `bindLoadListButtons` binds the reset button only when present (optional-DOM
  contract); popover titles are cleared before rich-append (repeat opens no longer
  accumulate).

**Verification:** unit suite **191/191**; M11 teaching browser harness **51/51**
(including three new checks: unsolved-panel pointer, identity header + selection
follow, reset-to-factory-beam); M10 shell harness **22/22**; `node --check` clean on all
touched files; `git diff --check` clean.
