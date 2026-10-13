// Live round trips, both directions, compared property by property:
//   EffectCraft -> After Effects: test/fixtures/build-fixture.jsx builds a project in
//     EffectCraft, that's built in After Effects, and After Effects describes what it built.
//   After Effects -> EffectCraft: that .aep is built in EffectCraft, which then describes it.
// Needs EffectCraft and After Effects installed.
//
// After Effects closes its open project for these and reopens it at the end.
// The tests refuse to run when that project has unsaved changes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProject, runScript, withPrivateCopy, writeProject } from '../../src/effectcraft.js';
import { normalizeScene, toEffectCraftNames } from '../../src/matchnames.js';
import { runInAfterEffects } from '../../src/aftereffects.js';
import { buildScript, describeScript, openScript, readAepScript, statusScript } from '../../src/scripts.js';
import { compareScenes } from '../../src/compare.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const before = await runInAfterEffects((resultPath) => statusScript({ resultPath }));
const work = realpathSync(mkdtempSync(join(tmpdir(), 'aeec-live-')));
const fixture = join(work, 'fixture.ecproj');
const fixtureAep = join(work, 'fixture.aep');
process.on('exit', () => rmSync(work, { recursive: true, force: true }));

// Build the test project in a background EffectCraft copy and save it as an .ecproj.
async function buildFixture() {
  const image = join(root, 'test/fixtures/test-image.png');
  const code = `var FIXTURE_IMAGE = ${JSON.stringify(image)};\n` + readFileSync(join(root, 'test/fixtures/build-fixture.jsx'), 'utf8');
  await withPrivateCopy(undefined, async (bridge) => {
    await bridge.exec('file.newProject');
    const r = await runScript(bridge, code, 'build-fixture.jsx');
    if (!r?.ok) throw new Error(`build-fixture.jsx failed: ${r?.error?.message}`);
    await bridge.exec('file.saveAs', { path: fixture });
  });
}
const skip = before.dirty ? 'After Effects has unsaved changes; save them and run again' : false;
if (!skip) await buildFixture();

async function reopenPrevious() {
  if (!before.file) return;
  const now = await runInAfterEffects((resultPath) => statusScript({ resultPath }));
  if (now.file !== before.file) await runInAfterEffects((resultPath) => openScript(before.file, { resultPath }));
}

test('EffectCraft -> After Effects: After Effects matches EffectCraft property by property', { skip, timeout: 10 * 60_000 }, async () => {
  try {
    const ec = await readProject(fixture);
    normalizeScene(ec);
    assert.ok(ec.stats.layers >= 15, `fixture has ${ec.stats.layers} layers`);

    const out = fixtureAep;
    const built = await runInAfterEffects((resultPath) => buildScript(ec, { outPath: out, resultPath }));
    assert.ok(built.ok, built.error);
    assert.ok(existsSync(out), 'the .aep was saved');

    const ae = await runInAfterEffects((resultPath) => describeScript({ resultPath }));
    assert.ok(ae.ok, ae.error);
    const { diffs, checked } = compareScenes(ec, ae.scene);
    assert.deepEqual(diffs, [], `${diffs.length} differences`);
    assert.ok(checked.props > 300, `checked ${checked.props} properties`);

    // Gradient colour stops can't be read by scripts, so the build points them out.
    assert.ok(built.warnings.some((w) => /can't be copied by a script/.test(w.message)));
  } finally {
    await reopenPrevious();
  }
});

test('After Effects -> EffectCraft: EffectCraft matches After Effects, and nothing changed went missing', { skip, timeout: 10 * 60_000 }, async () => {
  assert.ok(existsSync(fixtureAep), 'needs the .aep from the previous test');
  const read = await runInAfterEffects((resultPath) => readAepScript(fixtureAep, { resultPath }));
  assert.ok(read.ok, read.error);
  if (before.file) assert.equal(read.restored, before.file, 'After Effects reopened the project it had open');

  const ae = read.scene;
  const forEc = structuredClone(ae);
  toEffectCraftNames(forEc);
  const out = join(work, 'back.ecproj');
  const built = await writeProject(forEc, out);
  assert.ok(built.ok);
  assert.ok(existsSync(out), 'the .ecproj was saved');

  const ec = await readProject(out);
  normalizeScene(ec);
  const { diffs, checked } = compareScenes(ec, ae, { direction: 'ae2ec' });
  assert.deepEqual(diffs, [], `${diffs.length} differences`);
  assert.ok(checked.props > 300, `checked ${checked.props} properties`);
});

test('one CLI converts both ways, saving next to each input', { skip, timeout: 10 * 60_000 }, async () => {
  const dir = join(work, 'cli');
  execFileSync('mkdir', ['-p', dir]);
  try {
    const ecproj = join(dir, 'Promo.ecproj');
    execFileSync('cp', [fixture, ecproj]);
    const cli = (...args) => JSON.parse(execFileSync(process.execPath, [join(root, 'bin/convert.js'), ...args, '--json'], { encoding: 'utf8' }));

    const toAe = cli(ecproj, '--restore');
    assert.equal(toAe.ok, true);
    assert.equal(toAe.output, join(dir, 'Promo.aep'));
    if (before.file) assert.equal(toAe.restored, before.file);

    const toEc = cli(toAe.output);
    assert.equal(toEc.ok, true);
    assert.equal(toEc.output, join(dir, 'Promo 2.ecproj'), 'numbered, so the original .ecproj is kept');
    assert.ok(existsSync(toEc.output));
  } finally {
    await reopenPrevious();
  }
});
