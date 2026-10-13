// EffectCraft gives most properties After Effects' match names, but some keep
// EffectCraft's own ids (`rangeSelector`, `opacity` inside a text animator).
// This table maps those, keyed by the parent group's After Effects match name:
// normalizeScene() renames EffectCraft ids to After Effects names, and
// toEffectCraftNames() goes the other way. The After Effects names were read
// from After Effects 2026 itself; the EffectCraft ids from EffectCraft 0.8.0.

const TEXT_ANIMATOR_PROPS = {
  anchor: 'ADBE Text Anchor Point 3D',
  position: 'ADBE Text Position 3D',
  scale: 'ADBE Text Scale 3D',
  skew: 'ADBE Text Skew',
  skewAxis: 'ADBE Text Skew Axis',
  rotationX: 'ADBE Text Rotation X',
  rotationY: 'ADBE Text Rotation Y',
  rotation: 'ADBE Text Rotation',
  opacity: 'ADBE Text Opacity',
  fillColor: 'ADBE Text Fill Color',
  fillHue: 'ADBE Text Fill Hue',
  fillSaturation: 'ADBE Text Fill Saturation',
  fillBrightness: 'ADBE Text Fill Brightness',
  fillOpacity: 'ADBE Text Fill Opacity',
  strokeColor: 'ADBE Text Stroke Color',
  strokeHue: 'ADBE Text Stroke Hue',
  strokeSaturation: 'ADBE Text Stroke Saturation',
  strokeBrightness: 'ADBE Text Stroke Brightness',
  strokeOpacity: 'ADBE Text Stroke Opacity',
  strokeWidth: 'ADBE Text Stroke Width',
  lineAnchor: 'ADBE Text Line Anchor',
  lineSpacing: 'ADBE Text Line Spacing',
  trackingType: 'ADBE Text Track Type',
  tracking: 'ADBE Text Tracking Amount',
  characterAlignment: 'ADBE Text Character Change Type',
  characterRange: 'ADBE Text Character Range',
  characterValue: 'ADBE Text Character Replace',
  characterOffset: 'ADBE Text Character Offset',
  blur: 'ADBE Text Blur',
  frontColor: 'ADBE 3DText Front RGB',
  bevelColor: 'ADBE 3DText Bevel RGB',
  sideColor: 'ADBE 3DText Side RGB',
  backColor: 'ADBE 3DText Back RGB',
};

export const RENAMES = {
  'ADBE Text Animator Properties': TEXT_ANIMATOR_PROPS,
  'ADBE Text Selectors': {
    rangeSelector: 'ADBE Text Selector',
    wigglySelector: 'ADBE Text Wiggly Selector',
    expressionSelector: 'ADBE Text Expressible Selector',
  },
  'ADBE Text Selector': {
    start: 'ADBE Text Percent Start',
    end: 'ADBE Text Percent End',
    offset: 'ADBE Text Percent Offset',
    advanced: 'ADBE Text Range Advanced',
  },
  'ADBE Text Range Advanced': {
    units: 'ADBE Text Range Units',
    basedOn: 'ADBE Text Range Type2',
    mode: 'ADBE Text Selector Mode',
    amount: 'ADBE Text Selector Max Amount',
    shape: 'ADBE Text Range Shape',
    smoothness: 'ADBE Text Selector Smoothness',
    easeHigh: 'ADBE Text Levels Max Ease',
    easeLow: 'ADBE Text Levels Min Ease',
    randomize: 'ADBE Text Randomize Order',
    randomSeed: 'ADBE Text Random Seed',
  },
  'ADBE Text Wiggly Selector': {
    mode: 'ADBE Text Selector Mode',
    maxAmount: 'ADBE Text Wiggly Max Amount',
    minAmount: 'ADBE Text Wiggly Min Amount',
    basedOn: 'ADBE Text Range Type2',
    wigglesPerSecond: 'ADBE Text Temporal Freq',
    correlation: 'ADBE Text Character Correlation',
    temporalPhase: 'ADBE Text Temporal Phase',
    spatialPhase: 'ADBE Text Spatial Phase',
    lockDimensions: 'ADBE Text Wiggly Lock Dim',
    randomSeed: 'ADBE Text Wiggly Random Seed',
  },
  'ADBE Text Expressible Selector': {
    basedOn: 'ADBE Text Range Type2',
    amount: 'ADBE Text Expressible Amount',
  },
  'ADBE Text More Options': {
    anchorGrouping: 'ADBE Text Anchor Point Option',
    groupingAlignment: 'ADBE Text Anchor Point Align',
    fillStroke: 'ADBE Text Render Order',
    interCharBlend: 'ADBE Text Character Blend Mode',
  },
  'ADBE Text Path Options': {
    path: 'ADBE Text Path',
    reversePath: 'ADBE Text Reverse Path',
    perpendicular: 'ADBE Text Perpendicular To Path',
    forceAlignment: 'ADBE Text Force Align Path',
    firstMargin: 'ADBE Text First Margin',
    lastMargin: 'ADBE Text Last Margin',
  },
  'ADBE Camera Options Group': {
    irisShape: 'ADBE Iris Shape',
    irisRotation: 'ADBE Iris Rotation',
    irisRoundness: 'ADBE Iris Roundness',
    irisAspectRatio: 'ADBE Iris Aspect Ratio',
    irisDiffractionFringe: 'ADBE Iris Diffraction Fringe',
    highlightGain: 'ADBE Iris Highlight Gain',
    highlightThreshold: 'ADBE Iris Highlight Threshold',
    // (sic) After Effects spells this one "Hightlight".
    highlightSaturation: 'ADBE Iris Hightlight Saturation',
  },
  'ADBE Vector Graphic - G-Fill': {
    blend: 'ADBE Vector Blend Mode',
    composite: 'ADBE Vector Composite Order',
    rule: 'ADBE Vector Fill Rule',
    type: 'ADBE Vector Grad Type',
    start: 'ADBE Vector Grad Start Pt',
    end: 'ADBE Vector Grad End Pt',
    highlightLength: 'ADBE Vector Grad HiLite Length',
    highlightAngle: 'ADBE Vector Grad HiLite Angle',
    colors: 'ADBE Vector Grad Colors',
    opacity: 'ADBE Vector Fill Opacity',
  },
  'ADBE Vector Graphic - G-Stroke': {
    blend: 'ADBE Vector Blend Mode',
    composite: 'ADBE Vector Composite Order',
    type: 'ADBE Vector Grad Type',
    start: 'ADBE Vector Grad Start Pt',
    end: 'ADBE Vector Grad End Pt',
    highlightLength: 'ADBE Vector Grad HiLite Length',
    highlightAngle: 'ADBE Vector Grad HiLite Angle',
    colors: 'ADBE Vector Grad Colors',
    opacity: 'ADBE Vector Stroke Opacity',
    width: 'ADBE Vector Stroke Width',
    cap: 'ADBE Vector Stroke Line Cap',
    join: 'ADBE Vector Stroke Line Join',
    miter: 'ADBE Vector Stroke Miter Limit',
    dashes: 'ADBE Vector Stroke Dashes',
    taper: 'ADBE Vector Stroke Taper',
    wave: 'ADBE Vector Stroke Wave',
  },
  'ADBE Vector Filter - Offset': {
    amount: 'ADBE Vector Offset Amount',
    join: 'ADBE Vector Offset Line Join',
    miter: 'ADBE Vector Offset Miter Limit',
    copies: 'ADBE Vector Offset Copies',
    copyOffset: 'ADBE Vector Offset Copy Offset',
  },
  // EffectCraft reuses the shape group's transform names inside a repeater.
  'ADBE Vector Repeater Transform': {
    'ADBE Vector Anchor': 'ADBE Vector Repeater Anchor',
    'ADBE Vector Position': 'ADBE Vector Repeater Position',
    'ADBE Vector Scale': 'ADBE Vector Repeater Scale',
    'ADBE Vector Rotation': 'ADBE Vector Repeater Rotation',
    startOpacity: 'ADBE Vector Repeater Opacity 1',
    endOpacity: 'ADBE Vector Repeater Opacity 2',
  },
  'ADBE Vector Filter - Roughen': {
    size: 'ADBE Vector Roughen Size',
    detail: 'ADBE Vector Roughen Detail',
    points: 'ADBE Vector Roughen Points',
    speed: 'ADBE Vector Temporal Freq',
    correlation: 'ADBE Vector Correlation',
    phase: 'ADBE Vector Temporal Phase',
    seed: 'ADBE Vector Random Seed',
  },
  'ADBE Vector Filter - Zigzag': {
    size: 'ADBE Vector Zigzag Size',
    ridges: 'ADBE Vector Zigzag Detail',
    points: 'ADBE Vector Zigzag Points',
  },
  'ADBE Light Options Group': {
    'ADBE Light Casts Shadows': 'ADBE Casts Shadows',
  },
  'ADBE Vector Stroke Dashes': {
    dash: 'ADBE Vector Stroke Dash 1',
    gap: 'ADBE Vector Stroke Gap 1',
    dash2: 'ADBE Vector Stroke Dash 2',
    gap2: 'ADBE Vector Stroke Gap 2',
    dash3: 'ADBE Vector Stroke Dash 3',
    gap3: 'ADBE Vector Stroke Gap 3',
    offset: 'ADBE Vector Stroke Offset',
  },
  'ADBE Vector Stroke Taper': {
    units: 'ADBE Vector Taper Length Units',
    startLength: 'ADBE Vector Taper Start Length',
    endLength: 'ADBE Vector Taper End Length',
    startWidth: 'ADBE Vector Taper Start Width',
    endWidth: 'ADBE Vector Taper End Width',
    startEase: 'ADBE Vector Taper Start Ease',
    endEase: 'ADBE Vector Taper End Ease',
  },
  'ADBE Vector Stroke Wave': {
    amount: 'ADBE Vector Taper Wave Amount',
    units: 'ADBE Vector Taper Wave Units',
    wavelength: 'ADBE Vector Taper Wavelength',
    cycles: 'ADBE Vector Taper Wave Cycles',
    phase: 'ADBE Vector Taper Wave Phase',
  },
};

// EffectCraft properties with no After Effects property; they're carried some other way.
const DROP = {
  'ADBE Text Properties': new Set(['perChar3d']), // the layer's threeDPerChar switch
};

// Range selector values live on the Index properties when Units is set to Index (2).
const INDEX_UNITS = {
  'ADBE Text Percent Start': 'ADBE Text Index Start',
  'ADBE Text Percent End': 'ADBE Text Index End',
  'ADBE Text Percent Offset': 'ADBE Text Index Offset',
};

function rangeUnits(selector) {
  const adv = selector.ch?.find((c) => c.mn === 'ADBE Text Range Advanced');
  const units = adv?.ch?.find((c) => c.mn === 'ADBE Text Range Units');
  return units?.v ?? units?.k?.[0]?.v;
}

// EffectCraft lists Dash and Gap on every stroke; zero means no dashes. In After
// Effects adding them makes the stroke dashed, so all-zero dashes are left out.
function emptyDashes(group) {
  return (group.ch ?? []).every((c) => !c.k && !c.x && (c.v === 0 || /Offset$/.test(c.mn)));
}

function walk(nodes, parentMn, out) {
  const table = RENAMES[parentMn];
  const drop = DROP[parentMn];
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (drop?.has(n.mn)) {
      nodes.splice(i, 1);
      continue;
    }
    if (table && Object.hasOwn(table, n.mn)) {
      n.ecMn = n.mn;
      n.mn = table[n.mn];
      out.renamed++;
    }
  }
  for (const n of nodes) {
    if (n.ch) walk(n.ch, n.mn, out);
    if (n.mn === 'ADBE Vector Stroke Dashes' && emptyDashes(n)) n.ch = [];
    if (n.mn === 'ADBE Text Selector' && rangeUnits(n) === 2) {
      for (const c of n.ch) if (INDEX_UNITS[c.mn]) c.mn = INDEX_UNITS[c.mn];
    }
    if (!n.mn.startsWith('ADBE') && !out.unknown.includes(n.mn)) out.unknown.push(n.mn);
  }
}

// Renames EffectCraft ids in place. Returns { renamed, unknown: [ids with no known AE name] }.
export function normalizeScene(scene) {
  const out = { renamed: 0, unknown: [] };
  for (const item of scene.items ?? []) {
    for (const layer of item.layers ?? []) walk(layer.props ?? [], null, out);
  }
  return out;
}

// ------------------------------------------------------------- the other way

// { parent AE name: { AE name: EffectCraft id } }
const INVERSE = Object.fromEntries(
  Object.entries(RENAMES).map(([parent, table]) => [parent, Object.fromEntries(Object.entries(table).map(([ec, ae]) => [ae, ec]))]),
);
for (const [pct, idx] of Object.entries(INDEX_UNITS)) INVERSE['ADBE Text Selector'][idx] = INVERSE['ADBE Text Selector'][pct];

function walkBack(nodes, parentMn, out) {
  const table = INVERSE[parentMn];
  for (const n of nodes) {
    const aeMn = n.mn;
    if (table && Object.hasOwn(table, aeMn)) {
      n.aeMn = aeMn;
      n.mn = table[aeMn];
      out.renamed++;
    }
    if (n.ch) walkBack(n.ch, aeMn, out);
  }
}

// Renames After Effects match names in place to the ids EffectCraft 0.8.0 knows them by.
export function toEffectCraftNames(scene) {
  const out = { renamed: 0 };
  for (const item of scene.items ?? []) {
    for (const layer of item.layers ?? []) walkBack(layer.props ?? [], null, out);
  }
  return out;
}
