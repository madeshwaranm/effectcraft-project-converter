#!/usr/bin/env node
// Converts between EffectCraft and After Effects projects, in either direction:
// .ecproj -> .aep, and .aep / .aepx -> .ecproj.

import { parseArgs } from 'node:util';
import { convert } from '../src/convert.js';

const USAGE = `usage: convert.js <project>... [options]

  Promo.ecproj  ->  Promo.aep      (EffectCraft to After Effects)
  Promo.aep     ->  Promo.ecproj   (After Effects to EffectCraft; .aepx works too)

Saves next to the original, or at --output. A background copy of EffectCraft does
the EffectCraft side; your own EffectCraft windows aren't touched.

To an .aep, After Effects closes its open project and leaves the converted one open.
From an .aep, After Effects opens it to read it, then reopens what you had open.
Either way, save your work in After Effects first: it stops if there are unsaved changes.

options:
  -o, --output <file>  where to save (one input only)
  -f, --force          replace an existing file instead of numbering a new one
  -r, --restore        to an .aep: reopen After Effects' previous project afterwards
      --json           print the result as JSON
  -q, --quiet          print only the saved path
  -h, --help           show this help`;

function fail(msg, code = 1) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' },
      force: { type: 'boolean', short: 'f' },
      restore: { type: 'boolean', short: 'r' },
      json: { type: 'boolean' },
      quiet: { type: 'boolean', short: 'q' },
      help: { type: 'boolean', short: 'h' },
    },
  });
} catch (err) {
  fail(`${err.message}\n\n${USAGE}`, 2);
}
const { values: opts, positionals: inputs } = parsed;
if (opts.help) {
  process.stdout.write(USAGE + '\n');
  process.exit(0);
}
if (!inputs.length) fail(USAGE, 2);
if (opts.output && inputs.length > 1) fail('--output works with one input only', 2);

// Progress lines only in a terminal, so the app (and other callers) get just the result.
const log = opts.json || opts.quiet || !process.stderr.isTTY ? undefined : (m) => process.stderr.write(`  ${m}\n`);
const results = [];
let failed = 0;

for (const input of inputs) {
  if (log) process.stderr.write(`${input}\n`);
  try {
    const r = await convert(input, { output: opts.output, overwrite: opts.force, restorePrevious: opts.restore, log });
    results.push({ ok: true, ...r });
    if (opts.quiet) {
      process.stdout.write(r.output + '\n');
    } else if (!opts.json) {
      const b = r.built;
      process.stdout.write(`Saved ${r.output}\n`);
      process.stdout.write(`  ${r.direction}: ${b.comps} comps, ${b.layers} layers, ${b.keys} keyframes, ${b.effects} effects, ${b.expressions} expressions\n`);
      if (r.warnings.length) {
        process.stdout.write(`  ${r.warnings.length} thing${r.warnings.length === 1 ? '' : 's'} to check by hand:\n`);
        for (const w of r.warnings) process.stdout.write(`  - ${w.where}: ${w.message}\n`);
      }
      if (r.previousProject && !r.restored) process.stdout.write(`  After Effects closed ${r.previousProject} (it had no unsaved changes).\n`);
    }
  } catch (err) {
    failed++;
    results.push({ ok: false, input, code: err.code ?? 'FAILED', error: err.message });
    if (!opts.json) process.stderr.write(`Couldn't convert ${input}: ${err.message}\n`);
  }
}

if (opts.json) process.stdout.write(JSON.stringify(inputs.length === 1 ? results[0] : results, null, 2) + '\n');
process.exit(failed ? 1 : 0);
