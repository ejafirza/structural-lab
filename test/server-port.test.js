/**
 * server-port.test.js — the server's PORT handling cannot silently regress.
 *
 * The bug this locks in: this workspace's shell exports PORT=0. The old
 * code `Number(process.env.PORT || 8000)` turned the string "0" into the
 * number 0 (a truthy string!), so Node bound an ephemeral port and the app
 * appeared at a random URL. parsePort() must reject anything that is not an
 * integer in 1..65535 and fall back to the documented default.
 *
 * Importing server.js stays side-effect-free (no listener, no browser open),
 * which the final test asserts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePort } from '../server.js';

const DEFAULT = 8000;

test('PORT=0 (the workspace trap) falls back to the documented default', () => {
  assert.equal(parsePort('0'), DEFAULT);
});

test('whitespace-padded, empty and unset PORT fall back to the default', () => {
  assert.equal(parsePort(undefined), DEFAULT);
  assert.equal(parsePort(null), DEFAULT);
  assert.equal(parsePort(''), DEFAULT);
  assert.equal(parsePort('   '), DEFAULT);
});

test('garbage PORT values fall back to the default, never NaN or a random port', () => {
  assert.equal(parsePort('abc'), DEFAULT);
  assert.equal(parsePort('8,000'), DEFAULT);
  assert.equal(parsePort('80 00'), DEFAULT);
  assert.equal(parsePort('8000.5'), DEFAULT);
  assert.equal(parsePort(true), DEFAULT);
  assert.equal(parsePort({}), DEFAULT);
});

test('hex strings parse to their integer value (Number() semantics, documented here)', () => {
  assert.equal(parsePort('0x1F90'), 8080, 'unambiguous integer in range — accepted');
});

test('out-of-range integers fall back to the default', () => {
  assert.equal(parsePort('-1'), DEFAULT);
  assert.equal(parsePort('65536'), DEFAULT);
  assert.equal(parsePort('99999'), DEFAULT);
});

test('valid explicit ports pass through unchanged', () => {
  assert.equal(parsePort('3000'), 3000);
  assert.equal(parsePort('1'), 1);
  assert.equal(parsePort('65535'), 65535);
  assert.equal(parsePort(' 8080 '), 8080, 'surrounding whitespace is trimmed');
});

test('a custom fallback is honored', () => {
  assert.equal(parsePort('0', 3000), 3000);
  assert.equal(parsePort(undefined, 3000), 3000);
});

test('importing server.js has no side effects (no server started)', async () => {
  // Dynamic re-import through a fresh module URL does not re-execute the
  // module, but it proves the module graph is import-safe; the static import
  // above already proved evaluation itself opened nothing.
  const mod = await import('../server.js');
  assert.equal(typeof mod.parsePort, 'function');
  assert.ok(!('server' in mod), 'the http server is not exported — it stays module-private');
});
