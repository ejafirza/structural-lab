/**
 * Load-model normalization & validation tests (Milestones 4 & 5).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLoads, LOAD_TYPES, LOAD_TYPE_KEYS } from '../src/loadmodel.js';

const SPAN = 6;

test('catalog has point + udl + linear with correct units', () => {
  assert.deepEqual(LOAD_TYPE_KEYS, ['point', 'udl', 'linear']);
  assert.equal(LOAD_TYPES.point.unit, 'kN');
  assert.equal(LOAD_TYPES.udl.unit, 'kN/m');
  assert.equal(LOAD_TYPES.linear.unit, 'kN/m');
});

test('legacy shorthand normalizes to a single point load', () => {
  const loads = normalizeLoads({ load: 10, position: 2 }, SPAN);
  assert.deepEqual(loads, [{ type: 'point', magnitude: 10, position: 2 }]);
});

test('explicit point descriptor normalizes', () => {
  const loads = normalizeLoads({ loads: [{ type: 'point', magnitude: 5, position: 3 }] }, SPAN);
  assert.deepEqual(loads, [{ type: 'point', magnitude: 5, position: 3 }]);
});

test('UDL defaults start=0, end=span', () => {
  const loads = normalizeLoads({ loads: [{ type: 'udl', intensity: 2 }] }, SPAN);
  assert.deepEqual(loads, [{ type: 'udl', intensity: 2, start: 0, end: 6 }]);
});

test('UDL accepts explicit full-span start/end', () => {
  const loads = normalizeLoads({ loads: [{ type: 'udl', intensity: 2, start: 0, end: 6 }] }, SPAN);
  assert.deepEqual(loads, [{ type: 'udl', intensity: 2, start: 0, end: 6 }]);
});

test('partial-span UDL is rejected (M4 = full-span only)', () => {
  assert.throws(
    () => normalizeLoads({ loads: [{ type: 'udl', intensity: 2, start: 1, end: 5 }] }, SPAN),
    RangeError
  );
  assert.throws(
    () => normalizeLoads({ loads: [{ type: 'udl', intensity: 2, start: 0, end: 4 }] }, SPAN),
    RangeError
  );
});

test('exactly one load is enforced', () => {
  assert.throws(
    () => normalizeLoads({ loads: [{ type: 'point', magnitude: 1, position: 1 }, { type: 'point', magnitude: 1, position: 2 }] }, SPAN),
    RangeError
  );
  assert.throws(() => normalizeLoads({ loads: [] }, SPAN), RangeError);
  assert.throws(() => normalizeLoads({ loads: 'x' }, SPAN), TypeError);
});

test('invalid load fields throw the right error types', () => {
  assert.throws(() => normalizeLoads({ load: 0, position: 2 }, SPAN), RangeError);
  assert.throws(() => normalizeLoads({ load: -1, position: 2 }, SPAN), RangeError);
  assert.throws(() => normalizeLoads({ load: 'big', position: 2 }, SPAN), TypeError);
  assert.throws(() => normalizeLoads({ load: 10, position: 0 }, SPAN), RangeError);
  assert.throws(() => normalizeLoads({ load: 10, position: 6 }, SPAN), RangeError);
  assert.throws(() => normalizeLoads({ loads: [{ type: 'udl', intensity: 0 }] }, SPAN), RangeError);
  assert.throws(() => normalizeLoads({ loads: [{ type: 'udl', intensity: -2 }] }, SPAN), RangeError);
  assert.throws(() => normalizeLoads({ loads: [{ type: 'udl', intensity: 'w' }] }, SPAN), TypeError);
});

test('unknown load type throws', () => {
  assert.throws(() => normalizeLoads({ loads: [{ type: 'moment', magnitude: 5 }] }, SPAN), TypeError);
});

// ---------------------------------------------------------------------------
// M5: `linear` descriptor
// ---------------------------------------------------------------------------

test('linear descriptor normalizes (partial UDL via wStart = wEnd)', () => {
  const loads = normalizeLoads({ loads: [{ type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 2 }] }, SPAN);
  assert.deepEqual(loads, [{ type: 'linear', start: 1, end: 5, wStart: 2, wEnd: 2 }]);
});

test('linear triangular (one end zero) normalizes', () => {
  const loads = normalizeLoads({ loads: [{ type: 'linear', start: 0, end: 6, wStart: 6, wEnd: 0 }] }, SPAN);
  assert.deepEqual(loads, [{ type: 'linear', start: 0, end: 6, wStart: 6, wEnd: 0 }]);
});

test('linear region must satisfy 0 ≤ start < end ≤ span', () => {
  assert.throws(() => normalizeLoads({ loads: [{ type: 'linear', start: -1, end: 3, wStart: 2, wEnd: 2 }] }, SPAN), RangeError);
  assert.throws(() => normalizeLoads({ loads: [{ type: 'linear', start: 1, end: 7, wStart: 2, wEnd: 2 }] }, SPAN), RangeError);
  assert.throws(() => normalizeLoads({ loads: [{ type: 'linear', start: 3, end: 3, wStart: 2, wEnd: 2 }] }, SPAN), RangeError);
  assert.throws(() => normalizeLoads({ loads: [{ type: 'linear', start: 4, end: 2, wStart: 2, wEnd: 2 }] }, SPAN), RangeError);
});

test('linear intensity must be non-negative and not both zero', () => {
  assert.throws(() => normalizeLoads({ loads: [{ type: 'linear', start: 1, end: 5, wStart: -2, wEnd: 2 }] }, SPAN), RangeError);
  assert.throws(() => normalizeLoads({ loads: [{ type: 'linear', start: 1, end: 5, wStart: 0, wEnd: 0 }] }, SPAN), RangeError);
  assert.throws(() => normalizeLoads({ loads: [{ type: 'linear', start: 1, end: 5, wStart: 'w', wEnd: 2 }] }, SPAN), TypeError);
  assert.throws(() => normalizeLoads({ loads: [{ type: 'linear', start: 1, end: 5, wStart: 2 }] }, SPAN), TypeError);
});
