/**
 * Support model + determinacy classification tests (Milestone 3).
 * Verifies the reaction-unknown counting rule and stability classification
 * for every one of the 10 distinct end-support combinations.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTS, SUPPORT_TYPES, classifySupports, unconstrainedMotions } from '../src/supportmodel.js';

test('catalog has the four support types with correct reaction unknowns', () => {
  assert.deepEqual(SUPPORT_TYPES, ['pin', 'roller', 'fixed', 'free']);
  assert.equal(SUPPORTS.pin.unknowns, 2);
  assert.equal(SUPPORTS.roller.unknowns, 1);
  assert.equal(SUPPORTS.fixed.unknowns, 3);
  assert.equal(SUPPORTS.free.unknowns, 0);
});

test('determinate: pin + roller and fixed + free (both orientations)', () => {
  for (const [l, r] of [['pin', 'roller'], ['roller', 'pin'], ['fixed', 'free'], ['free', 'fixed']]) {
    const c = classifySupports(l, r);
    assert.equal(c.status, 'determinate', `${l}+${r}`);
    assert.equal(c.unknowns, 3, `${l}+${r} unknowns`);
    assert.equal(c.degree, 0);
    assert.deepEqual(c.unconstrained, []);
  }
});

test('indeterminate: degrees 1, 2 and 3', () => {
  assert.equal(classifySupports('pin', 'pin').status, 'indeterminate');
  assert.equal(classifySupports('pin', 'pin').degree, 1);

  assert.equal(classifySupports('fixed', 'roller').status, 'indeterminate');
  assert.equal(classifySupports('fixed', 'roller').degree, 1);

  assert.equal(classifySupports('fixed', 'pin').status, 'indeterminate');
  assert.equal(classifySupports('fixed', 'pin').degree, 2);

  assert.equal(classifySupports('fixed', 'fixed').status, 'indeterminate');
  assert.equal(classifySupports('fixed', 'fixed').degree, 3);
});

test('unstable: every R < 3 combination is a mechanism', () => {
  assert.equal(classifySupports('free', 'free').status, 'unstable');
  assert.equal(classifySupports('pin', 'free').status, 'unstable');
  assert.equal(classifySupports('roller', 'free').status, 'unstable');
  assert.equal(classifySupports('roller', 'roller').status, 'unstable');
});

test('unstable cases name the free motion(s)', () => {
  assert.deepEqual(
    unconstrainedMotions('pin', 'free'),
    ['rotation'],
    'pin+free can rotate about the pin'
  );
  assert.deepEqual(
    unconstrainedMotions('roller', 'roller'),
    ['horizontal translation'],
    'two rollers can slide horizontally'
  );
  assert.deepEqual(
    unconstrainedMotions('free', 'free').sort(),
    ['horizontal translation', 'rotation', 'vertical translation'].sort(),
    'free+free has all three rigid-body motions'
  );
});

test('unknown support type throws', () => {
  assert.throws(() => classifySupports('pin', 'spring'), TypeError);
  assert.throws(() => classifySupports('spring', 'pin'), TypeError);
});
