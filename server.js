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
const PORT = Number(process.env.PORT || 8000);

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

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Structural Lab running at ${url}`);
  // Best-effort browser open (Windows/macOS/Linux; ignore failures).
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"` :
    process.platform === 'darwin' ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, () => {});
});
