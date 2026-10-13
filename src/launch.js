// Finding, starting and stopping the EffectCraft desktop app.

import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import net from 'node:net';

const execFileAsync = promisify(execFile);

export function appCandidates() {
  const list = [];
  if (process.env.EFFECTCRAFT_APP) list.push(process.env.EFFECTCRAFT_APP);
  switch (platform()) {
    case 'darwin':
      list.push('/Applications/EffectCraft.app/Contents/MacOS/EffectCraft');
      list.push(join(homedir(), 'Applications/EffectCraft.app/Contents/MacOS/EffectCraft'));
      break;
    case 'win32':
      list.push('C:\\Program Files\\EffectCraft\\effectcraft.exe');
      list.push(join(process.env.LOCALAPPDATA ?? '', 'Programs\\EffectCraft\\effectcraft.exe'));
      break;
    default:
      list.push('/usr/bin/effectcraft', '/usr/local/bin/effectcraft', '/opt/EffectCraft/effectcraft');
  }
  return list;
}

export function findApp() {
  return appCandidates().find((p) => p && existsSync(p)) ?? null;
}

export function portOpen(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

// Running EffectCraft processes and the control port each was started with
// (null when it was started without one).
export async function runningInstances() {
  if (platform() === 'win32') return [];
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,command=']);
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /effectcraft(\.app)?(\s|$)|\/EffectCraft(\s|$)/i.test(line) && !/effectcraft-mcp|node /i.test(line))
      .map((line) => {
        const [pid, ...rest] = line.split(/\s+/);
        const command = rest.join(' ');
        const m = command.match(/--control[ =](\d+)/);
        return { pid: Number(pid), command, controlPort: m ? Number(m[1]) : null };
      });
  } catch {
    return [];
  }
}

export async function waitForPort(port, { timeoutMs = 30_000, intervalMs = 400 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// Start EffectCraft with its control server on `port`. The app is detached so
// it keeps running when this MCP server exits.
export async function launchApp({ port, appPath = findApp(), timeoutMs = 30_000 } = {}) {
  if (!appPath) {
    throw new Error(`EffectCraft not found. Looked in: ${appCandidates().join(', ')}. Set EFFECTCRAFT_APP to the app's executable.`);
  }
  if (await portOpen(port)) return { launched: false, port, appPath, reason: 'already listening' };
  const child = spawn(appPath, ['--control', String(port)], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, EFFECTCRAFT_CONTROL_PORT: String(port) },
  });
  child.unref();
  const up = await waitForPort(port, { timeoutMs });
  if (!up) throw new Error(`EffectCraft started (pid ${child.pid}) but its control port ${port} did not open within ${timeoutMs / 1000}s`);
  return { launched: true, port, appPath, pid: child.pid };
}
