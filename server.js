/**
 * server.js — zero-dependency static server for the Structural Lab UI.
 * Serves only ./ui and ./src so browser modules work without exposing notes,
 * plans, Git metadata, workflows, or local configuration over HTTP.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 8000;
export const DEFAULT_HOST = '127.0.0.1';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
});

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
});

export function parsePort(raw, fallback = DEFAULT_PORT) {
  const port = Number(String(raw ?? '').trim());
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.warn(`server.js: ignoring invalid PORT="${raw}" — using ${fallback}`);
    return fallback;
  }
  return port;
}

export function shouldOpenBrowser(raw) {
  if (raw === undefined || raw === null) return true;
  return String(raw).trim() === '';
}

function isWithin(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== '' && relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isPublicPath(root, filePath) {
  return isWithin(path.join(root, 'ui'), filePath) ||
    isWithin(path.join(root, 'src'), filePath);
}

/** Resolve URL pathname; reject malformed encodings and anything not in ui/ or src/. */
export function resolveFilePath(rawPathname, root = ROOT) {
  let pathname;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes('\0') || pathname.includes('\\') || /%[0-9a-f]{2}/i.test(pathname)) {
    return { status: 400 };
  }
  if (pathname === '/ui' || pathname === '/ui/') pathname = '/ui/index.html';
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some((segment) => segment.startsWith('.'))) return { status: 403 };
  const canonicalRoot = path.resolve(root);
  const filePath = path.resolve(canonicalRoot, `.${pathname}`);
  return isPublicPath(canonicalRoot, filePath)
    ? { status: 200, filePath }
    : { status: 403 };
}

function openBrowserTab(url) {
  const [command, args] = process.platform === 'win32'
    ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Browser opening is optional; it must not affect the server.
  }
}

/** Make an unstarted server instance; importing this module has no side effects. */
export function createStaticServer({ root = ROOT } = {}) {
  const canonicalRoot = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    const fail = (code, message, extra = {}) => {
      res.writeHead(code, {
        'Content-Type': 'text/plain; charset=utf-8',
        ...SECURITY_HEADERS,
        ...extra,
      });
      res.end(message);
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return fail(405, 'Method not allowed', { Allow: 'GET, HEAD' });
    }

    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return fail(400, 'Bad request');
    }
    if (url.pathname === '/') {
      res.writeHead(301, { Location: '/ui/', ...SECURITY_HEADERS });
      return res.end();
    }

    const resolved = resolveFilePath(url.pathname, canonicalRoot);
    if (resolved.status !== 200) {
      return fail(resolved.status, resolved.status === 403 ? 'Forbidden' : 'Bad request');
    }

    let realPath;
    let stat;
    try {
      realPath = await fs.realpath(resolved.filePath);
      if (!isPublicPath(canonicalRoot, realPath)) return fail(403, 'Forbidden');
      stat = await fs.stat(realPath);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return fail(404, 'Not found');
      console.error(`server.js: file check failed: ${err.message}`);
      return fail(500, 'Internal server error');
    }
    if (!stat.isFile()) return fail(404, 'Not found');
    if (stat.size > MAX_FILE_BYTES) return fail(413, 'Payload too large');

    try {
      const data = await fs.readFile(realPath);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(realPath).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        ...SECURITY_HEADERS,
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (err) {
      if (err.code === 'ENOENT') return fail(404, 'Not found');
      console.error(`server.js: read failed: ${err.message}`);
      return fail(500, 'Internal server error');
    }
  });

  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

const modulePath = fileURLToPath(import.meta.url);
const isMain = Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(modulePath);
if (isMain) {
  const port = parsePort(process.env.PORT);
  const requestedHost = String(process.env.HOST ?? '').trim() || DEFAULT_HOST;
  const host = requestedHost === 'localhost' ? DEFAULT_HOST : requestedHost;
  const server = createStaticServer();
  server.listen(port, host, () => {
    const displayHost = host.includes(':') ? `[${host}]` : host;
    const url = `http://${displayHost}:${port}`;
    console.log(`Structural Lab running at ${url} (bound to ${host})`);
    if (shouldOpenBrowser(process.env.NO_OPEN)) openBrowserTab(url);
    else console.log('(NO_OPEN is set — not opening a browser tab)');
  });
}
