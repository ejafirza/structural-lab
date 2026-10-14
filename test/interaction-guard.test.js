/**
 * interaction-guard.test.js — static source guard for the beam-drag wiring (M6.5).
 * ---------------------------------------------------------------------------
 * The M6.5 bug: the pointerdown handler accepted the SVG
 * attribute role `'load-handle'` while pointermove only acted on the drag id
 * `'load'` — the load arrow started a drag that did nothing, and NO presence
 * check could see it (handle-existence tests stayed green for two milestones).
 *
 * This guard parses ui/drag.js (the beam-drag wiring extracted from app.js)
 * and enforces that the three drag handlers share one consistent vocabulary:
 *   1. pointerdown's accepted data-roles are exactly the documented set;
 *   2. the keyboard handler branches on the SAME attribute roles;
 *   3. every accepted role reaches a pointermove branch, through the single
 *      documented rename table (`role === 'X' ? 'Y' : role` in pointerdown —
 *      the attribute identifies a DOM handle, the drag id selects the
 *      mutation; the mapping must exist and live in exactly one place).
 * Any new handle type must update all three consistently or this test fails.
 * (M7 added the fourth role, 'profile-point' — one handle per control point
 * of a profile load, draggable both along the beam and vertically.)
 *
 * Pure source inspection — no DOM, no imports of the module under test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../ui/drag.js', import.meta.url)), 'utf8');

/** Slice the source between two anchor markers (handler bodies are short). */
function segment(fromMarker, toMarker) {
  const from = src.indexOf(fromMarker);
  assert.notEqual(from, -1, `drag.js is missing the ${fromMarker} handler — drag wiring changed shape; update this guard`);
  const to = toMarker ? src.indexOf(toMarker, from) : src.length;
  assert.notEqual(to, -1, `drag.js is missing the ${toMarker} anchor — drag wiring changed shape; update this guard`);
  return src.slice(from, to);
}

const downSeg = segment("svg.addEventListener('pointerdown'", "svg.addEventListener('click'");
const moveSeg = segment("window.addEventListener('pointermove'", "window.addEventListener('pointerup'");
const keySeg = segment("svg.addEventListener('keydown'", null);

const matches = (seg, re) => [...seg.matchAll(re)].map((m) => m[1]);
const setOf = (arr) => new Set(arr);

// Attribute roles accepted by pointerdown (`role === '…'`), drag ids handled
// by pointermove (`dragging === '…'`), attribute roles branched by keydown.
const acceptedRoles = setOf(matches(downSeg, /role === '([\w-]+)'/g));
const moveDragIds = setOf(matches(moveSeg, /dragging === '([\w-]+)'/g));
const keyRoles = setOf(matches(keySeg, /role === '([\w-]+)'/g));

// The single rename table: `dragging = role === 'A' ? 'B' : role`.
// Built from raw match groups (the `matches` helper keeps only group 1).
const renames = new Map(
  [...downSeg.matchAll(/dragging = role === '([\w-]+)' \? '([\w-]+)' : role/g)].map((m) => [m[1], m[2]])
);

test('pointerdown accepts exactly the documented handle roles', () => {
  assert.deepEqual(
    [...acceptedRoles].sort(),
    ['load-handle', 'profile-point', 'region-end', 'region-start'],
    'the accepted data-role set changed — update this guard together with renderm3.js and the drag handlers'
  );
});

test('keyboard handler branches on the same attribute roles as pointerdown', () => {
  assert.ok(keyRoles.size > 0, 'keydown role extraction found nothing — guard anchor drift');
  assert.deepEqual([...keyRoles].sort(), [...acceptedRoles].sort(),
    'a data-role is accepted by pointerdown but missing (or extra) in the keyboard handler');
});

test('every accepted role reaches a pointermove branch via the single rename table', () => {
  assert.ok(moveDragIds.size > 0, 'pointermove drag-id extraction found nothing — guard anchor drift');
  // Map accepted attribute roles through the documented renames (identity if
  // none) and require exact equality with the handled drag ids. The M6.5 bug
  // was exactly a mismatch here: 'load-handle' accepted, only 'load' handled,
  // no rename in between.
  const mapped = setOf([...acceptedRoles].map((r) => renames.get(r) ?? r));
  assert.deepEqual([...mapped].sort(), [...moveDragIds].sort(),
    'a handle can start a drag that pointermove never acts on (or a move branch is dead)');
  // The attribute→drag-id rename must live in exactly one place: the guarded
  // ternary in pointerdown. A second ad-hoc rename is exactly how the M6.5
  // bug class resurfaces.
  assert.ok(
    renames.size === 1 && renames.get('load-handle') === 'load',
    `expected exactly one rename load-handle → load, found ${JSON.stringify([...renames])} — keep the mapping in the single pointerdown ternary`
  );
});
