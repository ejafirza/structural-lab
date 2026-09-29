/**
 * server.js — zero-dependency static server for the Structural Lab UI.
 * Node's http module only; serves ./ui and ./src so the browser can import
 * the engine module directly (ESM over file:// is blocked by browsers).
 *
 * Usage: npm start   →   http://localhost:8000
 */
import http from 'node:http';
import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 8000;

/**
 * parsePort(raw) — resolve the PORT environment variable defensively.
 *
 * A shell may export PORT=0 (or leave garbage in it); Node treats port 0 as
 * "bind an ephemeral port", which silently strands the app (and the browser
 * that just opened) on a random URL. Anything that is not an integer in
 * 1..65535 falls back to the documented default with a console warning.
 *
 * @param {unknown} raw value of process.env.PORT (string | undefined)
 * @param {number} [fallback] documented default (8000)
 * @returns {number} a safe port number
 */
export function parsePort(raw, fallback = DEFAULT_PORT) {
  const port = Number(String(raw ?? '').trim());
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.warn(`server.js: ignoring invalid PORT="${raw}" — using ${fallback}`);
    return fallback;
  }
  return port;
}

const PORT = parsePort(process.env.PORT);

/**
 * shouldOpenBrowser(raw) — resolve the NO_OPEN environment variable.
 *
 * Set NO_OPEN (any of: "1", "true", "yes", "on", case-insensitive — or any
 * non-empty value at all, so NO_OPEN=even-this works) to suppress the
 * automatic browser tab on startup. Useful for scripts, CI and harnesses
 * that open the page themselves.
 *
 * @param {unknown} raw value of process.env.NO_OPEN (string | undefined)
 * @returns {boolean} true when the browser should be opened
 */
export function shouldOpenBrowser(raw) {
  if (raw === undefined || raw === null) return true;
  return String(raw).trim() === '';
}

const OPEN_BROWSER = shouldOpenBrowser(process.env.NO_OPEN);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Serve from the project root so that ../src/engine.js resolves for the UI.
const ROOT = __dirname;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') {
      // Redirect to /ui/ so that relative module/style paths (./app.js,
      // ./style.css) resolve inside /ui/ instead of against the root.
      res.writeHead(301, { Location: '/ui/' });
      return res.end();
    }
    if (pathname === '/ui' || pathname === '/ui/') pathname = '/ui/index.html';

    // Normalise and jail the path inside the project root.
    const filePath = path.normalize(path.join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Forbidden');
    }

    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch (err) {
    const code = err.code === 'ENOENT' ? 404 : 500;
    res.writeHead(code, { 'Content-Type': 'text/plain' });
    res.end(code === 404 ? 'Not found' : `Server error: ${err.message}`);
  }
});

// Only start listening (and open the browser) when run directly — importing
// server.js (e.g. from a test) must stay side-effect-free.
const modulePath = fileURLToPath(import.meta.url);
const isMain = Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(modulePath);

if (isMain) {
  server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Structural Lab running at ${url}`);
  if (!OPEN_BROWSER) {
    console.log('(NO_OPEN is set — not opening a browser tab)');
    return;
  }
  // Best-effort browser open (Windows/macOS/Linux; ignore failures).
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"` :
    process.platform === 'darwin' ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, () => {});
});
}
