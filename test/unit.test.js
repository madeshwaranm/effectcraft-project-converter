// Unit tests: no EffectCraft or After Effects needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { normalizeScene } from '../src/matchnames.js';
import { compareScenes } from '../src/compare.js';
import { buildScript, exportScript, toJsxLiteral } from '../src/scripts.js';
import { defaultOutput, targetExtension } from '../src/convert.js';

const prop = (mn, v, extra = {}) => ({ mn, n: mn, t: 'P', vt: 'OneD', v, ...extra });
const group = (mn, ch, t = 'N') => ({ mn, n: mn, t, ch });
const scene = (props, attrs = {}) => ({
  format: 'aeec-scene',
  version: 1,
  items: [{ id: 1, type: 'comp', name: 'Main', width: 100, height: 100, frameRate: 30, duration: 2, layers: [{ index: 1, name: 'L', kind: 'text', parent: null, attrs, props }] }],
});

test('EffectCraft ids get After Effects match names by context', () => {
  const s = scene([
    group('ADBE Text Properties', [
      prop('perChar3d', false),
      group('ADBE Text Animators', [
        group('ADBE Text Animator', [
          group('ADBE Text Selectors', [group('rangeSelector', [prop('start', 0), group('advanced', [prop('units', 1)])])], 'I'),
          group('ADBE Text Animator Properties', [prop('opacity', 0)]),
        ]),
      ], 'I'),
    ]),
  ]);
  const r = normalizeScene(s);
  assert.deepEqual(r.unknown, []);
  const text = s.items[0].layers[0].props[0];
  assert.equal(text.ch.length, 1, 'perChar3d is dropped');
  const anim = text.ch[0].ch[0];
  const sel = anim.ch[0].ch[0];
  assert.equal(sel.mn, 'ADBE Text Selector');
  assert.equal(sel.ch[0].mn, 'ADBE Text Percent Start');
  assert.equal(sel.ch[1].mn, 'ADBE Text Range Advanced');
  assert.equal(sel.ch[1].ch[0].mn, 'ADBE Text Range Units');
  assert.equal(anim.ch[1].ch[0].mn, 'ADBE Text Opacity');
});

test('range selectors set to Index units use the Index properties', () => {
  const s = scene([group('rangeSelectorHost', [])]);
  s.items[0].layers[0].props = [group('ADBE Text Selectors', [group('rangeSelector', [prop('start', 2), group('advanced', [prop('units', 2)])])], 'I')];
  normalizeScene(s);
  assert.equal(s.items[0].layers[0].props[0].ch[0].ch[0].mn, 'ADBE Text Index Start');
});

test('all-zero dashes are dropped, real dashes stay', () => {
  const dashes = (d) => group('ADBE Vector Stroke Dashes', [prop('dash', d), prop('gap', d), prop('offset', 0)], 'I');
  const s = scene([dashes(0), dashes(12)]);
  normalizeScene(s);
  const [a, b] = s.items[0].layers[0].props;
  assert.equal(a.ch.length, 0);
  assert.deepEqual(b.ch.map((c) => c.mn), ['ADBE Vector Stroke Dash 1', 'ADBE Vector Stroke Gap 1', 'ADBE Vector Stroke Offset']);
});

test('unknown EffectCraft ids are reported', () => {
  const s = scene([group('ADBE Effect Parade', [group('ec.blur.bilateral', [prop('radius', 3)])], 'I')]);
  assert.deepEqual(normalizeScene(s).unknown, ['radius', 'ec.blur.bilateral']);
});

test('compare finds a changed value and a missing keyframe', () => {
  const ec = scene([group('ADBE Transform Group', [prop('ADBE Opacity', 50), prop('ADBE Rotate Z', 0, { k: [{ t: 0, v: 0 }, { t: 1, v: 90 }] })])]);
  const ae = scene([group('ADBE Transform Group', [prop('ADBE Opacity', 40), prop('ADBE Rotate Z', 0, { k: [{ t: 0, v: 0 }] })])]);
  const { diffs } = compareScenes(ec, ae);
  assert.deepEqual(diffs.map((d) => d.what).sort(), ['keyframe count', 'value']);
});

test('compare accepts After Effects 0..1 scales and 0-based mask indexes', () => {
  const ec = scene([prop('ADBE Fill-0007', 100), prop('ADBE Iris Highlight Threshold', 255), prop('ADBE Text Path', 1)]);
  const ae = scene([prop('ADBE Fill-0007', 1, { max: 1 }), prop('ADBE Iris Highlight Threshold', 1, { max: 1 }), prop('ADBE Text Path', 0, { vt: 'MASK_INDEX' })]);
  assert.deepEqual(compareScenes(ec, ae).diffs, []);
});

test('compare matches effect parameters by name', () => {
  const ecFx = group('ADBE Glo2', [prop('ADBE Glo2-0008', 1, { n: 'Arbitrary Map' }), prop('ADBE Glo2-0011', 0.5, { n: 'Color Phase' })]);
  const aeFx = group('ADBE Glo2', [prop('ADBE Glo2-0010', 0.5, { n: 'Color Phase' }), prop('ADBE Glo2-0011', 50, { n: 'A & B Midpoint' })]);
  const ec = scene([group('ADBE Effect Parade', [ecFx], 'I')]);
  const ae = scene([group('ADBE Effect Parade', [aeFx], 'I')]);
  assert.deepEqual(compareScenes(ec, ae).diffs, []);
});

test('scene literals are plain ASCII that ExtendScript can read', () => {
  const lit = toJsxLiteral({ name: 'Café — “quotes”   😀' });
  assert.match(lit, /^[\x20-\x7e]*$/);
  assert.equal(vm.runInNewContext(`(${lit})`).name, 'Café — “quotes”   😀');
});

test('the generated scripts parse as JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(exportScript()));
  const code = buildScript(scene([]), { outPath: '/tmp/x.aep', resultPath: '/tmp/r.json' });
  assert.doesNotThrow(() => new vm.Script(code));
});

test('the exporter and the JSON writer run against a fake host', () => {
  // A tiny stand-in for the After Effects object model: one empty comp.
  const comp = { id: 1, name: 'Main', width: 10, height: 10, pixelAspect: 1, frameRate: 30, duration: 1, numLayers: 0, typeName: 'Composition', parentFolder: { id: 0 } };
  const ctx = vm.createContext({ app: { version: 'fake', project: { numItems: 1, item: () => comp, rootFolder: { id: 0 }, file: null } } });
  const json = vm.runInContext(exportScript(), ctx);
  const s = JSON.parse(json);
  assert.equal(s.format, 'aeec-scene');
  assert.equal(s.items[0].type, 'comp');
  assert.equal(s.items[0].name, 'Main');
});

test('default output numbers the file instead of replacing one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aeec-test-'));
  try {
    const input = join(dir, 'Promo.ecproj');
    assert.equal(defaultOutput(input), join(dir, 'Promo.aep'));
    writeFileSync(join(dir, 'Promo.aep'), '');
    assert.equal(defaultOutput(input), join(dir, 'Promo 2.aep'));
    assert.equal(defaultOutput(input, { overwrite: true }), join(dir, 'Promo.aep'));
    assert.equal(defaultOutput(join(dir, 'Promo.aep')), join(dir, 'Promo.ecproj'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the direction comes from the extension', () => {
  assert.equal(targetExtension('a/Promo.ecproj'), '.aep');
  assert.equal(targetExtension('a/Promo.AEP'), '.ecproj');
  assert.equal(targetExtension('a/Promo.aepx'), '.ecproj');
  assert.equal(targetExtension('a/Promo.mov'), null);
});

test('After Effects names go back to the ids EffectCraft 0.8.0 knows', async () => {
  const { toEffectCraftNames } = await import('../src/matchnames.js');
  const s = scene([
    group('ADBE Text Animator Properties', [prop('ADBE Text Opacity', 0)]),
    group('ADBE Light Options Group', [prop('ADBE Casts Shadows', 1)]),
    group('ADBE Transform Group', [prop('ADBE Opacity', 50)]),
  ]);
  toEffectCraftNames(s);
  const [anim, light, tr] = s.items[0].layers[0].props;
  assert.equal(anim.ch[0].mn, 'opacity');
  assert.equal(light.ch[0].mn, 'ADBE Light Casts Shadows');
  assert.equal(tr.ch[0].mn, 'ADBE Opacity', 'names EffectCraft already knows stay');
});
