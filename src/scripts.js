// Assembles the ExtendScript files into one script per job. Neither host can be
// relied on to include files, so each job gets a single self-contained script.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const JSX_DIR = join(dirname(fileURLToPath(import.meta.url)), 'jsx');
const read = (name) => readFileSync(join(JSX_DIR, name), 'utf8');

// JSON that ExtendScript reads as a plain object literal: everything outside
// printable ASCII is \u-escaped, so the file's encoding never matters.
export function toJsxLiteral(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

// EffectCraft: the last expression's value comes back over the control port.
export function exportScript() {
  return [read('lib.jsx'), read('scene-export.jsx'), 'AEEC.stringify(AEEC.exportScene());'].join('\n');
}

// EffectCraft: rebuild a scene in the open (new) project; the caller saves it.
export function effectCraftBuildScript(scene) {
  return [read('lib.jsx'), read('scene-build.jsx'), `AEEC.stringify(AEEC.buildScene(${toJsxLiteral(scene)}, {}));`].join('\n');
}

// After Effects: DoScriptFile returns nothing, so results go to `resultPath`.
function aeJob(resultPath, body) {
  return [
    read('lib.jsx'),
    body,
    '(function () {',
    '  var result;',
    '  try { result = AEEC.run(); }',
    '  catch (e) { result = { ok: false, error: String(e) + (e.line ? " (line " + e.line + ")" : "") }; }',
    `  AEEC.writeFile(${toJsxLiteral(resultPath)}, AEEC.stringify(result));`,
    '})();',
  ].join('\n');
}

export function buildScript(scene, { outPath, restorePrevious = false, resultPath }) {
  const opts = { outPath, restorePrevious };
  return aeJob(resultPath, [
    read('scene-build.jsx'),
    `AEEC.run = function () { return AEEC.buildScene(${toJsxLiteral(scene)}, ${toJsxLiteral(opts)}); };`,
  ].join('\n'));
}

// Describe an .aep. If it's the open project it's only read; otherwise After Effects
// opens it, and then reopens the project that was open before.
export function readAepScript(path, { resultPath }) {
  return aeJob(resultPath, [
    read('scene-export.jsx'),
    'AEEC.run = function () {',
    `  var target = new File(${toJsxLiteral(path)});`,
    '  if (!target.exists) return { ok: false, code: "NO_INPUT", error: "No such file: " + target.fsName };',
    '  var prev = app.project.file ? app.project.file.fsName : null;',
    '  if (prev && prev === target.fsName) return { ok: true, scene: AEEC.exportScene(), previousProject: prev, untouched: true };',
    '  if (app.project.dirty) return { ok: false, code: "AE_UNSAVED", error: "After Effects has unsaved changes in the open project. Save or close it, then convert again." };',
    '  var res = { ok: false, previousProject: prev };',
    '  try { app.beginSuppressDialogs(); } catch (e) {}',
    '  try {',
    '    app.open(target);',
    '    res.scene = AEEC.exportScene();',
    '    res.ok = true;',
    '  } catch (e) {',
    '    res.error = "After Effects couldn\'t open " + target.fsName + ": " + e;',
    '  }',
    '  if (prev) {',
    '    try { app.open(new File(prev)); res.restored = app.project.file ? app.project.file.fsName : null; } catch (e) { res.restoreError = String(e); }',
    '  }',
    '  try { app.endSuppressDialogs(false); } catch (e) {}',
    '  return res;',
    '};',
  ].join('\n'));
}

// Describe whatever project is open in After Effects (used by the round-trip test).
export function describeScript({ resultPath }) {
  return aeJob(resultPath, [
    read('scene-export.jsx'),
    'AEEC.run = function () { return { ok: true, scene: AEEC.exportScene() }; };',
  ].join('\n'));
}

// The state of After Effects' open project, without changing anything.
export function statusScript({ resultPath }) {
  return aeJob(resultPath, [
    'AEEC.run = function () {',
    '  var f = app.project.file;',
    '  return { ok: true, version: app.version, file: f ? f.fsName : null, dirty: app.project.dirty, items: app.project.numItems };',
    '};',
  ].join('\n'));
}

// Open a saved project (used to put the user's project back after tests).
export function openScript(path, { resultPath }) {
  return aeJob(resultPath, [
    'AEEC.run = function () {',
    `  app.open(new File(${toJsxLiteral(path)}));`,
    '  return { ok: true, file: app.project.file ? app.project.file.fsName : null };',
    '};',
  ].join('\n'));
}
