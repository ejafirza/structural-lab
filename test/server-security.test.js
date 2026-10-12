import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdtemp, mkdir, open, rm, writeFile } from 'node:fs/promises';
import { createStaticServer, MAX_FILE_BYTES, resolveFilePath, SECURITY_HEADERS } from '../server.js';
import { GLOSSARY_KEYS, getTerm } from '../src/glossary.js';
import { readFileSync } from 'node:fs';

async function withServer(root, run) {
  const server = createStaticServer({ root });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

async function request(url, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function fixture() {
  const root = await mkdtemp(path.join(path.resolve('verify/tmp'), 'structural-lab-security-'));
  await mkdir(path.join(root, 'ui'));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'ui', 'index.html'), '<!doctype html><script type="module" src="./app.js"></script>');
  await writeFile(path.join(root, 'ui', 'app.js'), 'export const ready = true;');
  await writeFile(path.join(root, 'src', 'engine.js'), 'export const solve = () => 42;');
  await writeFile(path.join(root, 'dashboard.md'), 'PRIVATE NOTE');
  await writeFile(path.join(root, '.env'), 'PRIVATE CREDENTIAL');
  return root;
}

test('path resolver allows only app/source paths and rejects traversal and malformed URLs', () => {
  const root = path.resolve('test/fixture-root');
  assert.equal(resolveFilePath('/ui/', root).filePath, path.join(root, 'ui', 'index.html'));
  assert.equal(resolveFilePath('/src/engine.js', root).status, 200);
  for (const value of ['/dashboard.md', '/.env', '/.git/config', '/test/server-security.test.js', '/ui/../../dashboard.md', '/src/%2e%2e/%2e%2e/.env', '/ui/.private']) {
    assert.equal(resolveFilePath(value, root).status, 403, `blocked ${value}`);
  }
  assert.equal(resolveFilePath('/ui/%zz', root).status, 400);
  assert.equal(resolveFilePath('/ui/%00x', root).status, 400);
  assert.equal(resolveFilePath('/ui/.hidden', root).status, 403);
  assert.equal(resolveFilePath('/ui/%2F%2e%2e/dashboard.md', root).status, 403);
  assert.equal(resolveFilePath('/ui/%255c..%255c..%255c.env', root).status, 400);
});

test('static app works but repository notes and credentials are not served', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  await withServer(root, async (base) => {
    const redirect = await request(`${base}/`);
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.location, '/ui/');
    assert.equal(redirect.headers['x-content-type-options'], 'nosniff');

    const page = await request(`${base}/ui/`);
    assert.equal(page.status, 200);
    assert.match(page.body.toString(), /Structural Lab|app\.js/);
    assert.equal(page.headers['content-security-policy'], SECURITY_HEADERS['Content-Security-Policy']);
    assert.match(page.headers['content-security-policy'], /default-src 'none'/);
    assert.equal(page.headers['x-frame-options'], 'DENY');
    assert.match(page.headers['content-type'], /^text\/html/);

    const js = await request(`${base}/src/engine.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /^text\/javascript/);
    assert.match(js.body.toString(), /solve/);

    for (const url of ['/dashboard.md', '/.env', '/.git/config', '/AGENTS.md', '/ui/../../dashboard.md']) {
      const blocked = await request(`${base}${url}`);
      assert.ok([403, 404].includes(blocked.status), `${url} unexpectedly returned ${blocked.status}`);
      assert.doesNotMatch(blocked.body.toString(), /PRIVATE|OUTSIDE/);
    }

    const head = await request(`${base}/ui/app.js`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);

    const post = await request(`${base}/ui/`, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
    assert.equal(post.headers['x-content-type-options'], 'nosniff');
  });
});

test('static page CSP keeps styles, scripts, connections, and embeddings restricted', () => {
  const html = readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
  const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1];
  assert.ok(policy, 'the static page declares a CSP');
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "object-src 'none'"]) {
    assert.ok(policy.includes(directive), `CSP includes ${directive}`);
  }
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>/i, 'no inline scripts bypass script-src');
  assert.doesNotMatch(html, /\son(?:click|load|error|input|change|keydown)\s*=/i, 'no inline event handlers bypass script-src');
});

test('authored glossary content is treated as text, not executable HTML', () => {
  for (const key of GLOSSARY_KEYS) {
    const entry = getTerm(key);
    assert.ok(entry, `${key} must resolve to an authored entry`);
    assert.doesNotMatch(entry.body, /<\/?(?:script|img|svg|iframe|object|style)\b/i, `${key} contains markup-like HTML`);
    assert.doesNotMatch(entry.body, /javascript:/i, `${key} contains a javascript URL`);
  }
});

test('files above the response cap are refused before contents are read', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const oversized = path.join(root, 'ui', 'large.bin');
  const handle = await open(oversized, 'w');
  try {
    await handle.truncate(MAX_FILE_BYTES + 1);
  } finally {
    await handle.close();
  }
  await withServer(root, async (base) => {
    const response = await request(`${base}/ui/large.bin`);
    assert.equal(response.status, 413);
    assert.equal(response.body.toString(), 'Payload too large');
  });
});
