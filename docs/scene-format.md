# The scene format

A scene is the JSON that `scene-export.jsx` writes and `scene-build.jsx` reads. Both scripts run in both apps: the source app describes the project, and the target app rebuilds it. The short field names follow the format documented by [Aep-2-Ecproj](https://github.com/iEatFishFingers/Aep-2-Ecproj). It describes a project in After Effects' scripting terms. Properties are keyed by match name, times are comp seconds, and enums are written as names (`"SCREEN"`, `"BEZIER"`), so neither side depends on the other's numeric ids.

```jsonc
{
  "format": "aeec-scene", "version": 1,
  "host": "26.0 (EffectCraft 0.8.0)",
  "project": { "file": "…", "bitsPerChannel": 8, "linearBlending": false, "activeItemId": 28 },
  "items": [ … ],                       // Project panel order
  "stats": { "comps": 2, "layers": 15, "props": 358, "keys": 17, "expressions": 1, "footage": 6 },
  "warnings": [ { "where": "Main > Logo", "message": "…" } ]
}
```

## Items

Every item has `id`, `type` (`folder`, `comp` or `footage`), `name` and `parentId` (a folder id, or null for the root). It can also have `label` and `comment`.

- **Comp:** `width`, `height`, `pixelAspect`, `frameRate`, `duration`, `displayStartTime`, `bgColor`, `workAreaStart`, `workAreaDuration`, the motion-blur and shy switches, `markers` (keyframes with marker values), and `layers` (index 1, the top layer, first).
- **Footage:** `kind` is `file` (with `file`, `isStill` and `interp`), `solid` (with `color`) or `placeholder`.

## Layers

```jsonc
{ "index": 3, "name": "Card", "kind": "shape",   // text shape solid null camera light precomp footage placeholder
  "sourceId": 40,                                 // precomp, footage and solid sources
  "solid": { "name", "width", "height", "pixelAspect", "color" },   // solids and nulls
  "parent": 1,                                    // parent layer index or null
  "matte": { "type": "LUMA", "layer": 2 },        // only with a track matte
  "attrs": { "startTime", "inPoint", "outPoint", "stretch", "threeDLayer", "blendingMode", … },
  "props": [ node, … ] }
```

## Property nodes

- **Group:** `{ "mn", "n", "t": "I" | "N", "en"?, "mask"?, "ch": [ … ] }`. `t: "I"` means an indexed group whose children are added (effects, masks, shape items, text animators). `"N"` means a named group whose children already exist. `en` is the on/off switch. `mask` holds a mask's mode, inverted, feather falloff and colour.
- **Property:** `{ "mn", "n", "t": "P", "vt", "v"?, "k"?, "x"?, "xe"?, "sep"?, "custom"?, "max"? }`.
  - `vt` is the value type (`OneD`, `ThreeD_SPATIAL`, `COLOR`, `SHAPE`, `TEXT_DOCUMENT`, `MARKER`…).
  - `v` is the static value. It's left out when the property has keyframes, and when it has an expression it's the value under the expression.
  - `x` and `xe` are the expression and whether it's on.
  - `sep` marks a Position with separated dimensions.
  - `custom` marks values scripts can't read.
  - `max` is After Effects' maximum for one-dimensional values.
- **Keyframe:** `{ "t", "v", "ii", "oi", "ie": [[speed, influence]…], "oe", "tc", "tab", "si", "so", "sc", "sab", "rov", "lbl" }`, with interpolation in and out, temporal ease, the continuous and auto-bezier flags, spatial tangents, roving and the label.

Shapes are `{ closed, vertices, inTangents, outTangents }` (plus mask feather arrays). Text documents carry the style fields scripts can read (`text`, `font`, `fontFamily`, `fontStyle`, `fontSize`, `fillColor`, `tracking`, `justification`, `boxText`, `boxTextSize`…).

## What changes on the way

EffectCraft 0.8.0 gives some properties its own ids instead of After Effects match names. Examples are `rangeSelector`, an animator's `opacity`, and a gradient fill's `colors`. `src/matchnames.js` renames them by parent group before the build: `normalizeScene()` for EffectCraft → After Effects, and `toEffectCraftNames()` for the other way.

After Effects lists every possible text animator property, range selector value and stroke dash, whether it's switched on or not. Its exporter keeps only the switched-on ones, which are the ones that can take an expression.

`scene-build.jsx` then handles what's left:

- After Effects keeps some values on 0..1 where EffectCraft shows 0..100 or 0..255 (Fill's Opacity, a camera's Highlight Threshold). Scaling goes both ways, using `max` from the scene.
- After Effects counts a text path's mask from 0 = None; EffectCraft's popup starts at 1 = None.
- EffectCraft names fonts by family, and switches a text stroke on when its width is set, so stroke settings are left alone when the stroke is off.
- Effect parameters are matched by name, because EffectCraft's Glow has an extra parameter that shifts the numbering.
- A text animator's properties have to be added before they take values.
