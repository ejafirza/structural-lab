import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeOwnedLegacyProfile } from '../verify/legacy-browser-session.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMP_ROOT = path.resolve(TEST_DIR, '../verify/tmp');

test('legacy profile cleanup guards ownership and retries transient EBUSY', async () => {
  await mkdir(TEMP_ROOT, { recursive: true });
  const root = await mkdtemp(path.join(TEMP_ROOT, 'legacy-cleanup-test-'));
  const owned = await mkdtemp(path.join(root, 'consol-edge-'));
  const unrelated = await mkdtemp(path.join(root, 'unrelated-'));
  const calls = [];
  try {
    await assert.rejects(
      removeOwnedLegacyProfile(unrelated, root, async (target) => { calls.push(target); }),
      /ownership guard/,
    );
    assert.deepEqual(calls, []);

    let attempts = 0;
    const removed = await removeOwnedLegacyProfile(owned, root, async (target, options) => {
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
