import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeOwnedProfile } from '../verify/teaching-browser-session.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMP_ROOT = path.resolve(TEST_DIR, '../verify/tmp');

test('profile cleanup retries EBUSY and removes only the owned M11 profile', async () => {
  await mkdir(TEMP_ROOT, { recursive: true });
  const root = await mkdtemp(path.join(TEMP_ROOT, 'cleanup-test-'));
  const owned = await mkdtemp(path.join(root, 'teach-m11-run-'));
  const unrelated = path.join(root, 'unrelated');
  await mkdir(unrelated);
  const calls = [];
  try {
    await assert.rejects(
      removeOwnedProfile(unrelated, root, async (target) => { calls.push(target); }),
      /ownership guard/,
    );
    assert.deepEqual(calls, []);

    let attempts = 0;
    const removed = await removeOwnedProfile(owned, root, async (target, options) => {
      calls.push(target);
      assert.deepEqual(options, { recursive: true, force: false });
      if (attempts++ === 0) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      await rm(target, options);
    });

    assert.equal(removed, true);
    assert.equal(attempts, 2);
    assert.deepEqual(calls, [owned, owned]);
    await assert.rejects(stat(owned), { code: 'ENOENT' });
    assert.equal((await stat(unrelated)).isDirectory(), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});