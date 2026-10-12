import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SECRET_PATTERNS = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Stripe secret', /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b/],
];

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

test('tracked files do not contain common high-confidence credential formats', () => {
  const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const findings = [];
  for (const file of files) {
    let contents;
    try {
      contents = readFileSync(file, 'utf8');
    } catch {
      continue; // binary files are outside these text-token pattern checks
    }
    for (const [kind, pattern] of SECRET_PATTERNS) {
      if (pattern.test(contents)) findings.push(`${kind} pattern in ${file}`);
    }
  }
  assert.deepEqual(findings, [], findings.join('\n'));
});

test('repository ignores local environment secrets and verification fixture files', () => {
  const ignore = readFileSync(path.resolve('.gitignore'), 'utf8');
  assert.match(ignore, /^\.env\n\.env\.\*$/m);
  assert.match(ignore, /^verify\/tmp\/$/m);
  assert.match(ignore, /^!\.env\.example$/m);
});

test('the project root page is present for static hosting and links to the app', () => {
  const html = readFileSync(path.resolve('index.html'), 'utf8');
  assert.match(html, /<meta http-equiv="refresh" content="0; url=\.\/ui\/">/);
  assert.match(html, /<a href="\.\/ui\/">open Structural Lab<\/a>/);
});

test('public documentation does not include architect-only plans or module inventories', () => {
  const readme = readFileSync(path.resolve('readme.md'), 'utf8');
  assert.match(readme, /Hosted demo setup is pending/);
  assert.doesNotMatch(readme, /https:\/\/ejafirza\.github\.io\/structural-lab\//);
  assert.match(readme, /educational/i);
  assert.doesNotMatch(readme, /src\/engine\.js|Architecture|plan-m\d+/i);
});
