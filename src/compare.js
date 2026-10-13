// Compares the scene EffectCraft described with the scene After Effects
// describes after the build. Only what the EffectCraft scene contains is
// checked; After Effects has many more properties, which are left alone.

const TOL = 1e-3;

function close(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b));
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    // Colours may come as RGB or RGBA, positions as 2 or 3 values; compare what both have.
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (!close(a[i], b[i])) return false;
    const extra = (a.length > n ? a.slice(n) : b.slice(n));
    return extra.every((x) => x === 0 || x === 1);
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of Object.keys(a)) {
      if (k in b && !close(a[k], b[k])) return false;
    }
    return true;
  }
  return a == null && b == null;
}

// Text styling fields worth checking; the font is checked by family because
// After Effects substitutes fonts that aren't installed.
const TEXT_KEYS = ['text', 'fontSize', 'applyFill', 'fillColor', 'applyStroke', 'strokeColor', 'strokeWidth', 'tracking', 'justification', 'fauxBold', 'fauxItalic', 'allCaps', 'smallCaps'];

function sameText(a, b) {
  for (const k of TEXT_KEYS) {
    if (a[k] === undefined || b[k] === undefined) continue;
    if (k === 'strokeColor' && !a.applyStroke) continue;
    if (k === 'strokeWidth' && !a.applyStroke) continue;
    if (k === 'text') {
      if (String(a.text).replace(/\r\n?/g, '\n') !== String(b.text).replace(/\r\n?/g, '\n')) return k;
      continue;
    }
    if (!close(a[k], b[k])) return k;
  }
  return null;
}

function sameValue(vt, a, b) {
  if (vt === 'TEXT_DOCUMENT') return sameText(a ?? {}, b ?? {}) === null;
  if (vt === 'SHAPE') {
    return a && b && Boolean(a.closed) === Boolean(b.closed) && close(a.vertices, b.vertices) && close(a.inTangents, b.inTangents) && close(a.outTangents, b.outTangents);
  }
  if (vt === 'MARKER') return close({ comment: a?.comment ?? '', duration: a?.duration ?? 0 }, { comment: b?.comment ?? '', duration: b?.duration ?? 0 });
  return close(a, b);
}

function compareKeys(path, a, b, vt, diffs) {
  if (a.length !== b.length) {
    diffs.push({ path, what: 'keyframe count', ec: a.length, ae: b.length });
    return;
  }
  for (let i = 0; i < a.length; i++) {
    const ka = a[i], kb = b[i], at = `${path} @${ka.t}s`;
    if (!close(ka.t, kb.t)) diffs.push({ path, what: `key ${i + 1} time`, ec: ka.t, ae: kb.t });
    if (!sameValue(vt, ka.v, kb.v)) diffs.push({ path: at, what: 'key value', ec: ka.v, ae: kb.v });
    if (vt === 'MARKER') continue;
    if (ka.ii && kb.ii && (ka.ii !== kb.ii || ka.oi !== kb.oi)) diffs.push({ path: at, what: 'interpolation', ec: [ka.ii, ka.oi], ae: [kb.ii, kb.oi] });
    if (ka.ie && kb.ie && !ka.tab) {
      if (ka.ii === 'BEZIER' && !close(ka.ie.map((e) => e[1]), kb.ie.map((e) => e[1]))) diffs.push({ path: at, what: 'ease in influence', ec: ka.ie, ae: kb.ie });
      if (ka.oi === 'BEZIER' && !close(ka.oe.map((e) => e[1]), kb.oe.map((e) => e[1]))) diffs.push({ path: at, what: 'ease out influence', ec: ka.oe, ae: kb.oe });
      if (ka.ii === 'BEZIER' && !close(ka.ie.map((e) => e[0]), kb.ie.map((e) => e[0]))) diffs.push({ path: at, what: 'ease in speed', ec: ka.ie, ae: kb.ie });
      if (ka.oi === 'BEZIER' && !close(ka.oe.map((e) => e[0]), kb.oe.map((e) => e[0]))) diffs.push({ path: at, what: 'ease out speed', ec: ka.oe, ae: kb.oe });
    }
    if (ka.si && kb.si && !ka.sab && (!close(ka.si, kb.si) || !close(ka.so, kb.so))) {
      diffs.push({ path: at, what: 'spatial tangents', ec: [ka.si, ka.so], ae: [kb.si, kb.so] });
    }
  }
}

// Groups that legitimately exist on one side only (a precomp without audio layers has no
// Audio group in After Effects).
const OPTIONAL_GROUPS = new Set(['ADBE Audio Group']);
const SCALE_255 = new Set(['ADBE Iris Highlight Threshold']);

// EffectCraft's values in After Effects' units, the same way scene-build.jsx converts them.
function inAeUnits(n, m) {
  const nums = [n.v, ...(n.k ?? []).map((k) => k.v)].filter((v) => typeof v === 'number');
  let factor = 1;
  if (n.vt === 'OneD' && typeof m.max === 'number' && m.max <= 1) {
    const big = Math.max(0, ...nums.map(Math.abs));
    if (big > 1) factor = SCALE_255.has(n.mn) ? 1 / 255 : big <= 100 ? 0.01 : 1 / 255;
  }
  const shift = n.vt === 'OneD' && m.vt === 'MASK_INDEX' ? -1 : 0;
  if (factor === 1 && shift === 0) return n;
  const conv = (v) => (typeof v === 'number' ? Math.max(shift ? 0 : -Infinity, v * factor + shift) : v);
  return {
    ...n,
    vt: m.vt,
    v: n.v === undefined ? undefined : conv(n.v),
    k: n.k?.map((k) => ({ ...k, v: conv(k.v), ie: k.ie?.map(([sp, inf]) => [sp * factor, inf]), oe: k.oe?.map(([sp, inf]) => [sp * factor, inf]) })),
  };
}

function compareProps(path, ecNodes, aeNodes, diffs, stats, { inEffect = false, sep = false, parentMn = null } = {}) {
  const used = new Set();
  const take = (pred) => {
    const i = aeNodes.findIndex((x, j) => !used.has(j) && pred(x));
    if (i < 0) return undefined;
    used.add(i);
    return aeNodes[i];
  };
  for (const raw of ecNodes) {
    let n = raw;
    if (sep && n.mn === 'ADBE Position') continue;
    if (!sep && /^ADBE Position_\d$/.test(n.mn)) continue;
    // Effect parameters pair up by name (their order can differ); everything else by match name,
    // which also pairs indexed children (effects, masks, shape items) in order.
    let m = inEffect && n.n ? take((x) => x.n === n.n) : undefined;
    if (!m && !(inEffect && n.n && aeNodes.some((x) => x.mn === n.mn && x.n !== n.n))) m = take((x) => x.mn === n.mn);
    const p = `${path} > ${n.n || n.mn}`;
    if (!m) {
      if (OPTIONAL_GROUPS.has(n.mn)) continue;
      if (n.t === 'P' && !n.custom && (n.k || n.x || n.mod)) diffs.push({ path: p, what: 'missing in After Effects', ec: n.mn });
      else if (n.t !== 'P' && hasChanges(n)) diffs.push({ path: p, what: 'group missing in After Effects', ec: n.mn });
      continue;
    }
    if (n.t !== 'P') {
      if (n.en !== undefined && m.en !== undefined && n.en !== m.en) diffs.push({ path: p, what: 'enabled', ec: n.en, ae: m.en });
      const childSep = (n.ch ?? []).some((c) => c.mn === 'ADBE Position' && c.sep);
      // Children of an effect (a child of the Effects group) are its parameters.
      compareProps(p, n.ch ?? [], m.ch ?? [], diffs, stats, { inEffect: parentMn === 'ADBE Effect Parade', sep: childSep, parentMn: n.mn });
      continue;
    }
    if (n.custom) continue;
    n = inAeUnits(n, m);
    stats.props++;
    if (n.x) {
      stats.expressions++;
      if (n.x !== m.x) diffs.push({ path: p, what: 'expression', ec: n.x, ae: m.x ?? null });
    }
    if (n.k) {
      stats.keys += n.k.length;
      if (!m.k) diffs.push({ path: p, what: 'keyframes missing', ec: n.k.length, ae: 0 });
      else compareKeys(p, n.k, m.k, n.vt, diffs);
    } else if (n.v !== undefined && !n.x) {
      if (m.k) diffs.push({ path: p, what: 'has keyframes in After Effects', ec: n.v, ae: m.k.length });
      else if (!sameValue(n.vt, n.v, m.v)) diffs.push({ path: p, what: 'value', ec: n.v, ae: m.v });
    }
  }
}

function hasChanges(n) {
  if (n.t === 'P') return Boolean(n.k || n.x || n.mod);
  return (n.ch ?? []).some(hasChanges);
}

const LAYER_ATTRS = ['enabled', 'solo', 'shy', 'locked', 'label', 'inPoint', 'outPoint', 'startTime', 'stretch', 'threeDLayer', 'adjustmentLayer', 'guideLayer', 'collapseTransformation', 'motionBlur', 'blendingMode', 'quality', 'lightType', 'timeRemapEnabled'];
const COMP_ATTRS = ['width', 'height', 'pixelAspect', 'frameRate', 'duration', 'bgColor', 'workAreaStart', 'workAreaDuration', 'displayStartTime'];

// The other way: everything the source changed (a modified value, keyframes, an expression,
// an added effect or mask) has a counterpart in the target. Used for After Effects -> EffectCraft,
// where After Effects' isModified can be trusted.
function missingFrom(path, srcNodes, dstNodes, diffs, target, parentMn = null) {
  const used = new Set();
  const inEffect = parentMn === 'ADBE Effect Parade';
  const sep = srcNodes.some((c) => c.mn === 'ADBE Position' && c.sep);
  for (const n of srcNodes) {
    if (!hasChanges(n)) continue;
    // X/Y/Z Position only count when dimensions are separated, and Position only when they aren't.
    if (!sep && /^ADBE Position_\d$/.test(n.mn)) continue;
    if (sep && n.mn === 'ADBE Position') continue;
    let i = inEffect && n.n ? dstNodes.findIndex((x, j) => !used.has(j) && x.n === n.n) : -1;
    if (i < 0) i = dstNodes.findIndex((x, j) => !used.has(j) && x.mn === n.mn);
    const p = `${path} > ${n.n || n.mn}`;
    if (i < 0) {
      diffs.push({ path: p, what: `missing in ${target}`, ae: n.mn });
      continue;
    }
    used.add(i);
    if (n.ch) missingFrom(p, n.ch, dstNodes[i].ch ?? [], diffs, target, n.mn);
  }
}

// Returns { diffs: [{path, what, ec, ae}], checked: {comps, layers, props, keys, expressions} }.
// `direction` 'ae2ec' also checks that nothing After Effects changed went missing in EffectCraft.
export function compareScenes(ec, ae, { direction = 'ec2ae' } = {}) {
  const diffs = [];
  const stats = { comps: 0, layers: 0, props: 0, keys: 0, expressions: 0 };
  const aeComps = ae.items.filter((i) => i.type === 'comp');
  for (const c of ec.items.filter((i) => i.type === 'comp')) {
    const m = aeComps.find((x) => x.name === c.name);
    if (!m) {
      diffs.push({ path: c.name, what: 'comp missing in After Effects' });
      continue;
    }
    stats.comps++;
    for (const k of COMP_ATTRS) {
      if (c[k] === undefined) continue;
      // After Effects stores the background colour with 8 bits per channel.
      const same = k === 'bgColor' ? c[k].every((v, i) => Math.abs(v - m[k][i]) <= 1 / 255) : close(c[k], m[k]);
      if (!same) diffs.push({ path: c.name, what: k, ec: c[k], ae: m[k] });
    }
    if (c.markers) compareKeys(`${c.name} > markers`, c.markers, m.markers ?? [], 'MARKER', diffs);
    if (c.layers.length !== m.layers.length) diffs.push({ path: c.name, what: 'layer count', ec: c.layers.length, ae: m.layers.length });
    for (const L of c.layers) {
      const M = m.layers.find((x) => x.index === L.index);
      const lp = `${c.name} > ${L.name}`;
      if (!M) {
        diffs.push({ path: lp, what: 'layer missing in After Effects' });
        continue;
      }
      stats.layers++;
      if (M.name !== L.name) diffs.push({ path: lp, what: 'name', ec: L.name, ae: M.name });
      if (M.kind !== L.kind) diffs.push({ path: lp, what: 'layer type', ec: L.kind, ae: M.kind });
      if ((L.parent ?? null) !== (M.parent ?? null)) diffs.push({ path: lp, what: 'parent', ec: L.parent, ae: M.parent });
      if (JSON.stringify(L.matte ?? null) !== JSON.stringify(M.matte ?? null)) diffs.push({ path: lp, what: 'track matte', ec: L.matte, ae: M.matte });
      for (const k of LAYER_ATTRS) {
        // After Effects always reports the collapse switch on for text and shape layers.
        if (k === 'collapseTransformation' && (L.kind === 'text' || L.kind === 'shape')) continue;
        const a = L.attrs?.[k], b = M.attrs?.[k];
        if (a !== undefined && b !== undefined && !close(a, b)) diffs.push({ path: lp, what: k, ec: a, ae: b });
      }
      compareProps(lp, L.props ?? [], M.props ?? [], diffs, stats);
      if (direction === 'ae2ec') missingFrom(lp, M.props ?? [], L.props ?? [], diffs, 'EffectCraft');
    }
  }
  return { diffs, checked: stats };
}
