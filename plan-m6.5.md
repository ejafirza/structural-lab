# Milestone 6.5 Plan — Load-Drag Repair (UI interaction)

**Status:** IMPLEMENTED — owner-approved (plan review, 25 Sep 2026; scope confirmed to item 1 only). Implementation record in §7.
**Trigger:** The owner found the load arrow no longer draggable by mouse after M6. Diagnosis confirmed a real defect (§1). A broader UX-declutter discussion (info density, hover tooltips, folding the load editor) was raised in the same review and deliberately **deferred** — recorded in §6 as pending proposals, not built here.

---

## 0. TL;DR

- **One real bug**: the beam's load arrow cannot be moved by mouse — a handle-name mismatch introduced with the M5 consolidation and never caught, because no test or harness ever performed a real mouse drag (they only assert that a handle *exists*).
- **Fix**: one line in `ui/app.js` — normalize the accepted handle role to the drag id used by the move/keyboard handlers.
- **Prevention**: (a) a new static source guard proving every `data-role` accepted in the pointerdown handler has a matching branch in the pointermove and keyboard handlers; (b) a CDP harness check that synthesizes a real pointer drag on the load arrow (and on a region handle) and asserts the load actually moved.
- **Boundaries intact**: engine (`src/engine.js`) and M2 renderer (`ui/render.js`) byte-for-byte frozen; no renderer changes at all; zero dependencies; nothing written to C:.
- **Out of scope** (owner's explicit call): editor folding, equilibrium-badge relocation, hover tooltips — logged in `dashboard.md` under Decisions Waiting.

---

## 1. The bug (diagnosed)

In `ui/app.js`, the beam-drag wiring uses two different names for the same handle:

| handler | name expected | effect |
|---|---|---|
| `pointerdown` | `role === 'load-handle' \|\| 'region-start' \|\| 'region-end'` → `dragging = role` | starts a drag with `dragging = 'load-handle'` |
| `pointermove` | acts only when `dragging === 'load'` | **never matches** → drag does nothing |
| `keydown` (arrow keys) | checks `'load-handle'` | works (why the bug hid) |

History: M3–M4 named the drag id `'load'`; the M5 consolidation (`9c08be4`) renamed the SVG attribute to `'load-handle'` but the mouse path kept expecting `'load'`. Every M5/M6 test and harness asserts handle *presence* (`data-role` counts), never an actual pointer drag — so the regression survived two milestones of green verification. The M6 refactor that split handles into wrapper groups changed the group structure, not this mapping, so the bug carried through M6 unchanged.

Region handles are unaffected: `region-start` / `region-end` align between down and move.

**Design note (vocabulary):** the SVG attribute and the internal drag id serve different purposes — the attribute identifies a DOM element as a handle; the drag id selects the mutation to apply on move. The fix keeps both names but maps between them **once**, in the pointerdown handler: `dragging = role === 'load-handle' ? 'load' : role`. Renaming everything to one string was considered and rejected: it would churn renderer attributes, aria-labels, and four test files for zero behavioural gain.

## 2. Changes

| file | change |
|---|---|
| `ui/app.js` | pointerdown: `dragging = role === 'load-handle' ? 'load' : role` (+ comment explaining the two vocabularies) |
| `test/interaction-guard.test.js` | **new** static source guard: every `data-role` accepted in app.js's pointerdown handler has a matching branch in pointermove and keyboard handlers (and vice versa: the move/keyboard mutation branches reference only accepted roles) |
| `verify/multi-load-cdp-verify.mjs` | +2 checks: synthesized pointer drag moves the load arrow (asserts `#num-pos` value and beam label change by ≈1 m); same for a region handle (region start moves) |
| `plan-m6.5.md`, `readme.md`, `verify/readme.md` | this record; harness check counts; test counts |
| `dashboard.md`, `handoff.md`, `AGENTS.md` | local-only state: M6.5 row, verification counts, deferred-UX log, drag-vocabulary gotcha |
| `src/engine.js`, `ui/render.js`, `ui/renderm3.js`, `ui/index.html`, `ui/style.css`, `src/*` | **untouched** |

## 3. Verification (definition of done)

1. `npm test` → **100/100** (99 + the new interaction source guard).
2. `verify/multi-load-cdp-verify.mjs` → green, **19 → 21 checks** including both synthesized drags.
3. Regression anchors re-run green: `consolidation-cdp-verify.mjs` 32/32, `consolidation-layout-check.mjs` 6/6, `multi-layout-check.mjs` 6/6 (renderers untouched → layout must stay clean).
4. Zero console errors/exceptions in every headless-Edge run.
5. Frozen files byte-identical (`git diff` empty for `src/engine.js`, `ui/render.js`, and all `src/*`).
6. Docs updated (§2); commit on `main` of the standalone repo — **push only on the owner's explicit ask**.

## 4. Risks

| Risk | Mitigation |
|---|---|
| Synthesized drag in CDP is flaky (coordinates, pointer capture) | Dispatch `pointerdown` on the handle element itself, then `pointermove`/`pointerup` on `window` (the listeners live there); assert on observable state (`#num-pos` value, beam label), not pixel positions; generous sleeps already in harness style |
| Source guard too brittle (regex over source) | Guard reads app.js source and extracts the role lists with anchored patterns, asserting **set equality** between accepted roles (pointerdown) and mutation branches (pointermove + keydown); a comment ties the test to this plan |
| Harness check-count drift in docs | Final counts recorded in §7 after the actual run, per plan-m6 discipline |

## 5. Out of scope (owner decision, 25 Sep 2026)

UX decluttering proposals from the same review — (a) fold the load editor behind a disclosure, (b) relocate the equilibrium self-check badge out of the header, (c) hover tooltips explaining concepts beside the cursor, (d) deeper diagram-label trim — are **not built**. They are recorded in `dashboard.md` under Decisions Waiting and to be revisited after the owner views the live app.

## 6. Owner decisions (approved in plan mode, 25 Sep 2026)

1. **Sequencing:** a repair-first pass before M7 (arbitrary `w(x)`); UX declutter deferred.
2. **Scope:** item 1 (drag repair) only, of the four proposed items.
3. **Plan-first respected:** no code was written before plan approval.

## 7. Implementation record (2026-09-25)

**Implemented and verified in full.** Diff surface: `ui/app.js` (+8/−1), `verify/multi-load-cdp-verify.mjs` (+70), `test/interaction-guard.test.js` (new, 3 tests), `plan-m6.5.md` (new). `git diff HEAD -- src/ ui/render.js` **empty** — frozen boundary intact; renderer, HTML and CSS untouched.

### Verification results (final run)

- `node --test` → **102/102** (99 + 3 new guard tests)
- `verify/multi-load-cdp-verify.mjs` → **21/21** (19 + drag checks 6a/6b + restore check 6c)
- Anchors re-run green: consolidation-cdp **32/32**, consolidation-layout **6/6**, multi-layout **6/6** (renderers untouched → layout stayed clean, as predicted)
- Zero console errors/exceptions in every headless-Edge run

### Notes

1. **The synthesized drag works like a real one:** `pointerdown` dispatched on the handle element, `pointermove`/`pointerup` on `window` (where the listeners live), 5 interpolated steps of a 60 px drag, `pointerId` set (pointer capture in app.js is best-effort and tolerates it). Assertions are on observable state — `#num-pos` / `#num-region-start` values, list summary text, and the handle's on-screen centre via `getBoundingClientRect` (Δpx ≈ 61 for a 60 px drag) — never on internal state.
2. **State restore (check 6c)**: after the drags, the harness removes the added distributed load and resets `num-pos` to 3 so the downstream indeterminate/cap checks run against the exact state they were written for — the 19 original checks still assert their original values.
3. **The guard caught its own extraction bug during development** (a `matches` helper that kept only regex group 1 mis-read the rename table and failed the rename-map assertion) — a useful demonstration that the guard actually parses, not just passes.
4. Fix shape confirmed as planned: `dragging = role === 'load-handle' ? 'load' : role` — the single attribute→drag-id mapping, guarded by the new test so a second ad-hoc rename cannot reintroduce the bug class.

### Definition of done — status

§3 items 1–5: **met** (evidence above). Item 6: docs updated (§2 list); committed on the owner's approved plan (commit only, no push).
