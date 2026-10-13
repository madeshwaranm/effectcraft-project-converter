#!/usr/bin/env node
// Builds "EffectCraft Project Converter.app" (an AppleScript droplet around bin/convert.js) and
// installs it in ~/Applications. Usage: node app/build.js [destination folder]

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../bin/convert.js');
const destDir = resolve(process.argv[2] ?? join(homedir(), 'Applications'));
const app = join(destDir, 'EffectCraft Project Converter.app');
// Earlier names of this app, removed when it's installed.
const oldApps = ['EffectCraft to AE.app', 'AE ⇄ EffectCraft.app'].map((n) => join(destDir, n));

// Prefer Homebrew's or the installer's stable link over a versioned Cellar path,
// so the app keeps working after Node updates.
const node = ['/opt/homebrew/bin/node', '/usr/local/bin/node'].find((p) => existsSync(p)) ?? process.execPath;

const source = readFileSync(join(here, 'converter.applescript'), 'utf8')
  .replace('__NODE__', node)
  .replace('__CLI__', cli);

const tmp = mkdtempSync(join(tmpdir(), 'aeec-app-'));
try {
  const script = join(tmp, 'droplet.applescript');
  writeFileSync(script, source, 'utf8');
  mkdirSync(destDir, { recursive: true });
  rmSync(app, { recursive: true, force: true });
  for (const old of oldApps) rmSync(old, { recursive: true, force: true });
  execFileSync('osacompile', ['-o', app, script], { stdio: 'inherit' });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// The text macOS shows when the app first asks to control After Effects.
const plist = join(app, 'Contents/Info.plist');
execFileSync('plutil', ['-replace', 'NSAppleEventsUsageDescription', '-string',
  'EffectCraft Project Converter asks Adobe After Effects to read or rebuild your project so it can convert it.', plist]);
execFileSync('plutil', ['-replace', 'CFBundleIdentifier', '-string', 'local.effectcraft-project-converter', plist]);
// Editing Info.plist breaks osacompile's signature; sign it again (ad hoc, this Mac only).
execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });

console.log(`Installed ${app}`);
console.log(`  node: ${node}`);
console.log(`  cli:  ${cli}`);
