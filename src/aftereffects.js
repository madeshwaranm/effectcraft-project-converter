// Runs ExtendScript in After Effects through AppleScript (DoScriptFile). After
// Effects starts if it isn't running. DoScriptFile returns nothing useful, so
// each script writes its result to a JSON file, which needs After Effects'
// "Allow Scripts to Write Files and Access Network" preference.

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConvertError } from './effectcraft.js';

// The newest "Adobe After Effects 20xx" in /Applications, or AEEC_AE_APP.
export function findAfterEffects() {
  if (process.env.AEEC_AE_APP) return process.env.AEEC_AE_APP;
  let names = [];
  try {
    names = readdirSync('/Applications').filter((n) => /^Adobe After Effects (\d{4}|CC \d{4})$/.test(n));
  } catch {
    return null;
  }
  names.sort();
  const dir = names.at(-1);
  if (!dir) return null;
  return existsSync(join('/Applications', dir, `${dir}.app`)) ? dir : null;
}

function appleString(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function osascript(lines, timeoutMs) {
  return new Promise((resolve, reject) => {
    const args = lines.flatMap((l) => ['-e', l]);
    execFile('osascript', args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr) }));
      else resolve(String(stdout).trim());
    });
  });
}

// `makeScript(resultPath)` returns the script text. Resolves with the parsed result.
export async function runInAfterEffects(makeScript, { timeoutSec = 3600, app = findAfterEffects() } = {}) {
  if (!app) throw new ConvertError('After Effects isn\'t installed in /Applications', 'NO_AFTER_EFFECTS');
  const dir = mkdtempSync(join(tmpdir(), 'aeec-'));
  const scriptPath = join(dir, 'job.jsx');
  const resultPath = join(dir, 'result.json');
  try {
    writeFileSync(scriptPath, makeScript(resultPath), 'utf8');
    try {
      await osascript(
        [
          `with timeout of ${timeoutSec} seconds`,
          `tell application ${appleString(app)} to DoScriptFile ${appleString(scriptPath)}`,
          'end timeout',
        ],
        (timeoutSec + 30) * 1000,
      );
    } catch (err) {
      const msg = err.stderr || err.message;
      if (/-1743|not allowed|Not authorized/i.test(msg)) {
        throw new ConvertError(
          'macOS blocked control of After Effects. Allow it in System Settings > Privacy & Security > Automation, then try again.',
          'AE_NOT_ALLOWED',
        );
      }
      if (/-1712|timed out/i.test(msg)) {
        throw new ConvertError('After Effects didn\'t finish in time. Check whether it is showing a dialog.', 'AE_TIMEOUT');
      }
      throw new ConvertError(`Couldn't run the script in ${app}: ${msg.trim()}`, 'AE_FAILED');
    }
    if (!existsSync(resultPath)) {
      throw new ConvertError(
        'After Effects ran the script but wrote no result. Turn on Settings > Scripting & Expressions > "Allow Scripts to Write Files and Access Network" in After Effects, and close any open dialogs there.',
        'AE_NO_RESULT',
      );
    }
    return JSON.parse(readFileSync(resultPath, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
