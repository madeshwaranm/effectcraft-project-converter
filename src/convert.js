// One entry point, both directions, picked by the file's extension:
//   .ecproj        -> .aep     EffectCraft describes the project, After Effects rebuilds and saves it
//   .aep / .aepx   -> .ecproj  After Effects describes the project, EffectCraft rebuilds and saves it

import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { readProject, writeProject, ConvertError } from './effectcraft.js';
import { runInAfterEffects } from './aftereffects.js';
import { buildScript, readAepScript } from './scripts.js';
import { normalizeScene, toEffectCraftNames } from './matchnames.js';

export { ConvertError };

const TARGET = { '.ecproj': '.aep', '.aep': '.ecproj', '.aepx': '.ecproj' };

// The extension `input` converts to, or null when it isn't a project this converts.
export function targetExtension(input) {
  return TARGET[extname(input).toLowerCase()] ?? null;
}

// `<dir>/<name><ext>`, or `<name> 2<ext>`, `<name> 3<ext>`... when that's taken.
export function defaultOutput(input, { overwrite = false } = {}) {
  const ext = targetExtension(input) ?? '.aep';
  const dir = dirname(input);
  const name = basename(input, extname(input));
  let candidate = join(dir, `${name}${ext}`);
  if (overwrite) return candidate;
  for (let n = 2; existsSync(candidate); n++) candidate = join(dir, `${name} ${n}${ext}`);
  return candidate;
}

export async function convert(input, { output, overwrite = false, restorePrevious = false, log } = {}) {
  const src = resolve(input);
  if (!existsSync(src)) throw new ConvertError(`No such file: ${src}`, 'NO_INPUT');
  const ext = targetExtension(src);
  if (!ext) throw new ConvertError(`Not an EffectCraft (.ecproj) or After Effects (.aep, .aepx) project: ${src}`, 'UNSUPPORTED');

  let out = output ? resolve(output) : defaultOutput(src, { overwrite });
  if (extname(out).toLowerCase() !== ext) out += ext;
  if (existsSync(out) && !overwrite) throw new ConvertError(`${out} already exists. Pass --force to replace it.`, 'OUTPUT_EXISTS');

  return ext === '.aep' ? toAfterEffects(src, out, { restorePrevious, log }) : toEffectCraft(src, out, { log });
}

async function toAfterEffects(src, out, { restorePrevious, log }) {
  const scene = await readProject(src, { log });
  normalizeScene(scene);
  log?.(`Read ${scene.stats.comps} comps and ${scene.stats.layers} layers`);

  log?.('Building it in After Effects');
  const report = await runInAfterEffects((resultPath) => buildScript(scene, { outPath: out, restorePrevious, resultPath }));
  if (!report.ok) {
    throw new ConvertError(report.error ?? 'After Effects couldn\'t build the project', report.code ?? 'BUILD_FAILED', report);
  }
  return {
    input: src,
    output: report.output ?? out,
    direction: 'EffectCraft -> After Effects',
    source: scene.stats,
    built: report.stats,
    warnings: [...(scene.warnings ?? []), ...(report.warnings ?? [])],
    previousProject: report.previousProject ?? null,
    restored: report.restored ?? null,
  };
}

async function toEffectCraft(src, out, { log }) {
  log?.('Reading it in After Effects');
  const read = await runInAfterEffects((resultPath) => readAepScript(src, { resultPath }));
  if (!read.ok) throw new ConvertError(read.error ?? 'After Effects couldn\'t read the project', read.code ?? 'READ_FAILED', read);
  const scene = read.scene;
  log?.(`Read ${scene.stats.comps} comps and ${scene.stats.layers} layers`);
  toEffectCraftNames(scene);

  const report = await writeProject(scene, out, { log });
  const warnings = [...(scene.warnings ?? []), ...(report.warnings ?? [])];
  if (read.previousProject && !read.untouched && read.restored !== read.previousProject) {
    warnings.push({ where: 'After Effects', message: `Couldn't reopen ${read.previousProject}` });
  }
  return {
    input: src,
    output: out,
    direction: 'After Effects -> EffectCraft',
    source: scene.stats,
    built: report.stats,
    warnings,
    previousProject: null,
    restored: null,
  };
}
