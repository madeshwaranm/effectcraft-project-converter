// Reads an .ecproj through EffectCraft itself: a private background copy of the app
// opens the file and runs scene-export.jsx, so the scene uses EffectCraft's own
// mapping to After Effects match names and units. The user's EffectCraft
// windows are never touched.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { platform } from 'node:os';
import { Bridge } from './bridge.js';
import { findApp, runningInstances, waitForPort } from './launch.js';
import { effectCraftBuildScript, exportScript } from './scripts.js';

export class ConvertError extends Error {
  constructor(message, code = 'FAILED', details) {
    super(message);
    this.name = 'ConvertError';
    this.code = code;
    this.details = details;
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// The .app bundle around the executable findApp() returns, on macOS.
function bundleOf(exe) {
  const m = exe && exe.match(/^(.*?\.app)\/Contents\/MacOS\//);
  return m ? m[1] : null;
}

async function startPrivateCopy(port, log) {
  const exe = findApp();
  if (!exe) throw new ConvertError('EffectCraft isn\'t installed. Get it from https://github.com/storytold/effectcraft/releases', 'NO_EFFECTCRAFT');
  const bundle = platform() === 'darwin' ? bundleOf(exe) : null;
  if (bundle && existsSync(bundle)) {
    // -n: a new copy even if EffectCraft is open; -g: don't bring it forward. (Hidden copies stop
    // answering the control port, so it stays visible behind other windows.)
    spawn('open', ['-n', '-g', '-a', bundle, '--args', '--control', String(port)], { stdio: 'ignore', detached: true }).unref();
  } else {
    spawn(exe, ['--control', String(port)], { stdio: 'ignore', detached: true }).unref();
  }
  log?.(`Starting a background copy of EffectCraft (port ${port})`);
  if (!(await waitForPort(port, { timeoutMs: 45_000 }))) {
    throw new ConvertError('EffectCraft didn\'t start within 45 seconds', 'EFFECTCRAFT_TIMEOUT');
  }
}

async function stop(bridge, port) {
  try {
    await bridge.request('app.quit', { force: true }, { timeoutMs: 5_000 });
  } catch {
    // the app drops the connection as it quits
  }
  bridge.close();
  // Make sure our copy is gone even if it ignored the quit.
  await new Promise((r) => setTimeout(r, 800));
  for (const inst of await runningInstances()) {
    if (inst.controlPort === port) {
      try { process.kill(inst.pid); } catch { /* already gone */ }
    }
  }
}

// Runs `fn(bridge)` against a private EffectCraft copy and always shuts it down.
export async function withPrivateCopy(log, fn) {
  const port = await freePort();
  await startPrivateCopy(port, log);
  const bridge = new Bridge({ port, timeoutMs: 10 * 60_000 });
  try {
    return await fn(bridge);
  } finally {
    await stop(bridge, port);
  }
}

export function runScript(bridge, code, name) {
  return bridge.request('engine.execute', { command: 'script.run', params: { code, name } }, { timeoutMs: 10 * 60_000 });
}

// Builds `scene` in a fresh EffectCraft project and saves it at `outPath`. Returns the build report.
export async function writeProject(scene, outPath, { log } = {}) {
  return withPrivateCopy(log, async (bridge) => {
    await bridge.exec('file.newProject');
    log?.('Building it in EffectCraft');
    const r = await runScript(bridge, effectCraftBuildScript(scene), 'aeec-build.jsx');
    if (!r || !r.ok) {
      const e = r?.error;
      throw new ConvertError(`EffectCraft couldn't build the project: ${e?.message ?? 'no result'}${e?.line ? ` (line ${e.line})` : ''}`, 'BUILD_FAILED', r);
    }
    const report = JSON.parse(r.result);
    if (!report.ok) throw new ConvertError(report.error ?? 'EffectCraft couldn\'t build the project', report.code ?? 'BUILD_FAILED', report);
    log?.('Saving');
    await bridge.exec('file.saveAs', { path: outPath });
    return { ...report, output: outPath };
  });
}

// Returns the scene object for `ecprojPath`.
export async function readProject(ecprojPath, { log } = {}) {
  return withPrivateCopy(log, async (bridge) => {
    log?.('Opening the project in EffectCraft');
    try {
      await bridge.exec('file.open', { path: ecprojPath });
    } catch (err) {
      // EffectCraft's own message already names the file and the problem.
      throw new ConvertError(err.message, 'OPEN_FAILED');
    }
    log?.('Reading comps, layers and keyframes');
    const r = await runScript(bridge, exportScript(), 'aeec-export.jsx');
    if (!r || !r.ok) {
      const e = r?.error;
      const where = e?.line ? ` (line ${e.line})` : '';
      throw new ConvertError(`EffectCraft couldn't read the project: ${e?.message ?? 'no result'}${where}`, 'EXPORT_FAILED', r);
    }
    const scene = JSON.parse(r.result);
    if (scene.format !== 'aeec-scene') throw new ConvertError('EffectCraft returned something that isn\'t a scene', 'EXPORT_FAILED');
    return scene;
  }).catch((err) => {
    if (err instanceof ConvertError) throw err;
    throw new ConvertError(`EffectCraft couldn't read ${ecprojPath}: ${err.message}`, err.code ?? 'EXPORT_FAILED');
  });
}
