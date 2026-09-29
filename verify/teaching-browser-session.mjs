// Owns only the M11 browser-run infrastructure: local static server, Edge profile/process,
// CDP transport, and safe teardown. The verification entry point owns assertions only.
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const PROFILE_PREFIX = 'teach-m11-run-';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startAppServer(root) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end('Method not allowed');
        return;
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') {
        res.writeHead(301, { Location: '/ui/' }).end();
        return;
      }
      if (pathname === '/ui' || pathname === '/ui/') pathname = '/ui/index.html';
      const file = path.resolve(root, `.${pathname}`);
      const relative = path.relative(root, file);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const data = await fs.readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      const notFound = error.code === 'ENOENT';
      res.writeHead(notFound ? 404 : 500, { 'Content-Type': 'text/plain' });
      res.end(notFound ? 'Not found' : `Server error: ${error.message}`);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer;
    const done = (stopped) => {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      resolve(stopped);
    };
    const onExit = () => done(true);
    const onError = () => done(false);
    child.once('exit', onExit);
    child.once('error', onError);
    timer = setTimeout(() => done(child.exitCode !== null || child.signalCode !== null), timeoutMs);
  });
}

async function terminateOwnedEdgeTree(child) {
  if (!child?.pid) return false;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 10000);
      killer.once('exit', () => { clearTimeout(timer); resolve(); });
      killer.once('error', () => { clearTimeout(timer); resolve(); });
    });
    return killer.exitCode === 0;
  }
  try {
    process.kill(-child.pid, 'SIGKILL'); // Detached Edge owns this process group.
    return true;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}

async function waitForCdpShutdown(port) {
  if (!port) return false;
  // During graceful shutdown probes keep SUCCEEDING while Edge is still listening, and
  // fast successful fetches would exhaust a fixed iteration count in seconds. Wait on a
  // time deadline instead; Edge's DevTools listener closing is the confirmation.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`, { signal: controller.signal });
    } catch (error) {
      const code = error.cause?.code ?? error.cause?.cause?.code;
      if (['ECONNREFUSED', 'ECONNRESET'].includes(code)) return true;
      if (error.name !== 'AbortError') return false;
    } finally {
      clearTimeout(timeout);
    }
    await sleep(250);
  }
  return false;
}

async function closeBrowserThroughEndpoint(port) {
  // The harness can fail before it ever attached its own CDP WebSocket. If the DevTools
  // browser endpoint is still serving, ask it to close the browser (best effort).
  if (!port) return false;
  try {
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    if (!version?.webSocketDebuggerUrl) return false;
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('browser endpoint open timeout')), 5000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('browser endpoint failed to open')); }, { once: true });
    });
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      ws.addEventListener('message', (event) => {
        if (JSON.parse(event.data).id === 1) { clearTimeout(timer); resolve(); }
      });
      ws.addEventListener('close', () => { clearTimeout(timer); resolve(); });
      ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    });
    try { ws.close(); } catch {}
    return true;
  } catch {
    return false;
  }
}

export async function removeOwnedProfile(profilePath, tempRoot, remove = fs.rm) {
  const ownedPath = path.resolve(profilePath);
  if (path.dirname(ownedPath) !== path.resolve(tempRoot)
    || !path.basename(ownedPath).startsWith(PROFILE_PREFIX)) {
    throw new Error('profile path failed the session ownership guard');
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      await remove(ownedPath, { recursive: true, force: false });
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return true;
      if (error.code !== 'EBUSY' || attempt === 11) throw error;
      await sleep(250 * (attempt + 1));
    }
  }
}

export function createTeachingBrowserSession({ root, tmp, edgePath }) {
  let server;
  let edge;
  let edgeSpawned = false;
  let edgeSpawnError;
  let ws;
  let profileDir;
  let cdpPort;
  const pending = new Map();
  let requestId = 0;
  let closePromise;
  let started = false;
  let send;
  let evaluate;
  const browserErrors = [];

  async function start() {
    if (started) throw new Error('M11 browser session may only be started once');
    started = true;
    await fs.mkdir(tmp, { recursive: true });
    const app = await startAppServer(root);
    server = app.server;
    const appUrl = app.url;

    profileDir = await fs.mkdtemp(path.join(tmp, PROFILE_PREFIX));
    edge = spawn(edgePath, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--disable-sync',
      '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
      `--crash-dumps-dir=${path.join(profileDir, 'CrashDumps')}`,
      '--window-size=1280,1800', 'about:blank',
    ], { stdio: 'ignore', windowsHide: true, detached: process.platform !== 'win32' });
    edge.once('spawn', () => { edgeSpawned = true; });
    edge.on('error', (error) => { edgeSpawnError = error; });

    let wsUrl = null;
    let wrapperExitAt = null;
    for (let i = 0; i < 75 && !wsUrl; i++) {
      if (edgeSpawnError) throw edgeSpawnError;
      // On Windows the executable wrapper can exit while the attached browser is still
      // starting: the browser children outlive the wrapper and finish bringing the CDP
      // endpoint up on their own. Always try discovery before treating a wrapper exit as
      // fatal, and keep polling through a bounded grace window after one is observed.
      try {
        const activePort = (await fs.readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
        cdpPort = Number(activePort);
        if (Number.isInteger(cdpPort) && cdpPort > 0) {
          const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
          wsUrl = targets.find((target) => target.type === 'page' && !/^(edge|chrome):\/\//.test(String(target.url || '')))?.webSocketDebuggerUrl;
        }
      } catch {}
      if (!wsUrl) {
        const wrapperExited = edge.exitCode !== null || edge.signalCode !== null;
        if (wrapperExited) {
          wrapperExitAt ??= i;
          if (i - wrapperExitAt >= 25) throw new Error('Edge exited before CDP became available');
        }
        await sleep(200);
      }
    }
    if (!wsUrl) throw new Error('Edge remote debugging did not start');

    ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 15000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP WebSocket failed to open')); }, { once: true });
    });
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result ?? {});
      } else if (message.method === 'Runtime.exceptionThrown') {
        browserErrors.push(message.params.exceptionDetails?.text ?? 'runtime exception');
      } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        browserErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
      }
    });
    const failPending = () => {
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error('CDP connection closed'));
      }
      pending.clear();
    };
    ws.addEventListener('close', failPending, { once: true });
    ws.addEventListener('error', failPending);

    send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++requestId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
    evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result?.value;
    };
    return {
      appUrl,
      send,
      evaluate,
      axTree: async () => (await send('Accessibility.getFullAXTree')).nodes,
      browserErrors,
    };
  }

  async function close() {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      let shutdownConfirmed;
      if (edge && edgeSpawned) {
        // The spawned executable may be only a wrapper; the attached browser can outlive it.
        // Close through CDP whenever connected, then separately confirm the endpoint is down.
        // Do not await the reply: Edge tears the connection down instead of answering.
        if (send && ws?.readyState === WebSocket.OPEN) {
          try { send('Browser.close').catch(() => {}); } catch {}
        }
        const wrapperExited = await waitForChildExit(edge, 10000);
        if (!wrapperExited) {
          await terminateOwnedEdgeTree(edge);
          await waitForChildExit(edge, 10000);
        }
        if (!cdpPort && profileDir) {
          try {
            const activePort = (await fs.readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
            cdpPort = Number(activePort);
          } catch {}
        }
        let endpointDown = await waitForCdpShutdown(cdpPort);
        if (!endpointDown) {
          // A wrapper exit alone does not prove the attached browser died. When the DevTools
          // endpoint is still serving, close the browser through it and re-confirm shutdown.
          if (await closeBrowserThroughEndpoint(cdpPort)) endpointDown = await waitForCdpShutdown(cdpPort);
        }
        shutdownConfirmed = endpointDown;
      } else {
        // A failed spawn never owned an Edge process; if spawn succeeded and exited before
        // the CDP port was read, shutdown is unverified and its profile must be retained.
        shutdownConfirmed = !edge || !!edgeSpawnError || (!edgeSpawned && edge.exitCode !== null);
        if (shutdownConfirmed && cdpPort) shutdownConfirmed = await waitForCdpShutdown(cdpPort);
      }

      try { ws?.close(); } catch {}
      if (server?.listening) {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
      }

      let profileRemoved = !profileDir;
      let cleanupError;
      if (profileDir) {
        if (shutdownConfirmed) {
          try {
            profileRemoved = await removeOwnedProfile(profileDir, tmp);
          } catch (error) {
            cleanupError = `profile deletion failed: ${error.message}`;
          }
        } else {
          cleanupError = 'Edge shutdown could not be confirmed; profile intentionally retained';
        }
      }
      return { shutdownConfirmed, profileRemoved, cleanupError };
    })();
    return closePromise;
  }

  return { start, close };
}
