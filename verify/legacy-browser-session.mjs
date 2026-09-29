// Shared teardown for the pre-M11 CDP harnesses. Edge's Windows executable is a
// launcher: killing the Node child alone does not guarantee the browser tree is gone.
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const OWNED_PREFIXES = [
  'consol-edge-', 'consol-lay-', 'multi-edge-', 'multi-lay-',
  'profile-edge-', 'profile-lay-', 'defl-edge-', 'defl-lay-',
  'shell-cdp-', 'shell-layout-',
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer;
    const done = (exited) => {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      resolve(exited);
    };
    const onExit = () => done(true);
    const onError = () => done(false);
    timer = setTimeout(() => done(child.exitCode !== null || child.signalCode !== null), timeoutMs);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function killOwnedEdgeTree(child, profileDir) {
  if (!child?.pid) return false;
  if (process.platform === 'win32') {
    const escapedProfile = path.resolve(profileDir).replaceAll("'", "''");
    const fallbackPid = child.exitCode === null && child.signalCode === null ? child.pid : '';
    const script = [
      `$profile = '${escapedProfile}'`,
      `$fallbackPid = '${fallbackPid}'`,
      "$owned = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -and $_.CommandLine.Contains($profile) })",
      "if ($owned.Count -eq 0 -and $fallbackPid) { $owned = @(Get-CimInstance Win32_Process -Filter ('ProcessId=' + $fallbackPid)) }",
      'foreach ($ownedProcess in $owned) {',
      "  $killer = [Diagnostics.Process]::Start('taskkill.exe', ('/PID ' + $ownedProcess.ProcessId + ' /T /F'))",
      '  $killer.WaitForExit()',
      '}',
    ].join('; ');
    const killer = spawn('powershell.exe', ['-NoProfile', '-Command', script], { stdio: 'ignore', windowsHide: true });
    const exited = await waitForExit(killer, 15000);
    return exited && killer.exitCode === 0;
  }
  try {
    process.kill(child.pid, 'SIGTERM');
    return true;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}

async function waitForPortClosed(port, timeoutMs) {
  if (!port) return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 500);
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`, { signal: controller.signal });
    } catch (error) {
      const code = error.cause?.code ?? error.cause?.cause?.code;
      if (['ECONNREFUSED', 'ECONNRESET'].includes(code)) return true;
      if (error.name !== 'AbortError') return false;
    } finally {
      clearTimeout(timer);
    }
    await sleep(200);
  }
  return false;
}

export async function removeOwnedLegacyProfile(profilePath, tempRoot, remove = fs.rm) {
  const ownedPath = path.resolve(profilePath);
  if (path.dirname(ownedPath) !== path.resolve(tempRoot)
    || !OWNED_PREFIXES.some((prefix) => path.basename(ownedPath).startsWith(prefix))) {
    throw new Error('legacy profile path failed the ownership guard');
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

export async function cleanupLegacyBrowserSession({ edge, server, ws, profileDir, tempRoot, cdpPort }) {
  try { ws?.close(); } catch {}
  let shutdownConfirmed = !profileDir;
  let profileRemoved = !profileDir;
  let cleanupError;

  if (profileDir) {
    try {
      const profilePath = path.resolve(profileDir);
      if (path.dirname(profilePath) !== path.resolve(tempRoot)
        || !OWNED_PREFIXES.some((prefix) => path.basename(profilePath).startsWith(prefix))) {
        throw new Error('legacy profile path failed the ownership guard');
      }

      await killOwnedEdgeTree(edge, profilePath);
      await waitForExit(edge, 5000);
      shutdownConfirmed = await waitForPortClosed(cdpPort, 30_000);
      if (shutdownConfirmed) profileRemoved = await removeOwnedLegacyProfile(profilePath, tempRoot);
      else cleanupError = 'owned Edge process tree or CDP endpoint did not stop';
    } catch (error) {
      cleanupError = error.message;
    }
  } else {
    shutdownConfirmed = !edge || await waitForExit(edge, 5000);
  }

  if (server) {
    server.kill();
    await waitForExit(server, 5000);
  }
  if (!shutdownConfirmed || !profileRemoved) {
    const reason = cleanupError ?? (!shutdownConfirmed ? 'Edge/CDP shutdown was not confirmed' : 'owned profile was not removed');
    console.error(`FAIL  browser resource cleanup — ${reason}; profile retained at ${profileDir}`);
    throw new Error(reason);
  }
  console.log('PASS  browser resources cleaned — Edge/CDP stopped and owned profile removed');
  return { shutdownConfirmed, profileRemoved };
}
