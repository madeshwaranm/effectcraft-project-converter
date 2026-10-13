# EffectCraft Project Converter

Converts projects between [EffectCraft](https://github.com/storytold/effectcraft) and Adobe After Effects, in either direction:

| Drop this | Get this |
|---|---|
| EffectCraft project (`.ecproj`) | After Effects project (`.aep`) |
| After Effects project (`.aep` or `.aepx`) | EffectCraft project (`.ecproj`) |

The new file is saved next to the original, with comps, layers, keyframes, effects and text you can keep editing.

Neither file format is written by hand. One app describes the project in After Effects' scripting terms, and the other app rebuilds it from that description and saves it itself.

```
.ecproj ──▶ EffectCraft describes it ──▶ After Effects rebuilds it ──▶ .aep
.aep    ──▶ After Effects describes it ──▶ EffectCraft rebuilds it ──▶ .ecproj
```

## Use it

**The app.** Run `npm run app` once to build it into `~/Applications`, then drag projects onto **EffectCraft Project Converter**. You can mix both kinds in one drop. Or double-click it and pick the files. When it's done, a dialog lists what was saved and anything to check by hand, with a button to show the file in Finder. The first time, macOS asks whether the app may control After Effects. Click OK.

**The command line.** It's one script for both directions; the file's extension decides which way it goes.

```sh
node bin/convert.js "Promo.ecproj"                   # saves Promo.aep next to it
node bin/convert.js "Sting.aep"                      # saves Sting.ecproj next to it
node bin/convert.js a.ecproj b.aep                   # several at once, either kind
node bin/convert.js Promo.ecproj -o ~/Desktop/x.aep  # somewhere else
```

If the output file already exists, it saves as `Promo 2.aep` (or `Sting 2.ecproj`) instead of replacing it. Pass `--force` to replace it.

## What happens in After Effects

- **Save your work in After Effects first.** If its open project has unsaved changes, the converter stops and tells you. Nothing is discarded.
- **To an `.aep`:** After Effects closes its open project, builds the converted one, saves it and leaves it open. On the command line, `--restore` reopens your previous project instead.
- **From an `.aep`:** After Effects opens the file to read it, then reopens the project you had open. If the file is already your open project, it's only read.
- A copy of EffectCraft opens behind your other windows for a few seconds, then closes. Your own EffectCraft windows aren't touched.
- After Effects needs **Settings > Scripting & Expressions > Allow Scripts to Write Files and Access Network** turned on. It's on here already.

## What comes across

The live tests build a project with every feature below, convert it, then ask the receiving app to describe what it built. The tests compare that description with the original, property by property. On After Effects 2026 (26.5) and EffectCraft 0.8.0, both directions match on all 349 properties. The After Effects → EffectCraft test also checks that nothing After Effects changed went missing.

- Comps, folders, and every layer type: solid, shape, text and paragraph text, null, adjustment, camera, light, precomp, footage, guide
- Switches and timing: 3D, blend modes, shy, locked, labels, comments, start, in, out and stretch
- Parenting and track mattes
- Keyframes with interpolation, ease (speed and influence), spatial tangents, hold keys and separated dimensions
- Expressions
- Effects both apps have, masks, shape layers (groups, paths, fills, strokes, gradients, trim paths, repeaters and other shape operators), text styling and text animators

## What doesn't

The app lists these in its report when it meets them.

- **Gradient colour stops**, and effect data like Curves: scripts in neither app can read or write them.
- **Effects only one app has.** They're skipped and named in the report.
- **Layer styles**, motion trackers and Essential Properties.
- **Fonts the other app can't find.** It substitutes a font and the report names it.
- **Footage that isn't at its original path.** It becomes a placeholder.

Some things convert exactly but render a little differently, because the two apps draw them differently:

- Trim Paths on a rectangle starts from a different corner.
- Stacks that mix blend modes, luma mattes and adjustment layers can come out lighter or darker in one app than the other.

## Needs

macOS, Adobe After Effects (tested with 2026), EffectCraft 0.8.0 or later, and Node 20 or later. Run `npm run app` again after moving this folder or updating Node, so the app finds them.

## Tests

```sh
npm test            # unit tests, no apps needed
npm run test:live   # both directions; needs both apps; closes and reopens your After Effects project
```

The live tests build their test project fresh each run: `test/fixtures/build-fixture.jsx` runs in a background EffectCraft copy, with `test/fixtures/test-image.png` as its footage.

## Files

| Path | What it does |
|---|---|
| `bin/convert.js` | The one script: picks the direction from the extension |
| `src/jsx/scene-export.jsx` | Describes the open project as a scene. Runs in both apps |
| `src/jsx/scene-build.jsx` | Rebuilds a scene in a new project. Runs in both apps |
| `src/matchnames.js` | Maps the property names EffectCraft keeps as its own ids, both ways |
| `src/effectcraft.js`, `src/aftereffects.js` | Run scripts in a background EffectCraft copy, and in After Effects through AppleScript |
| `src/convert.js` | The two directions |
| `src/compare.js` | Compares two scenes property by property (used by the tests) |
| `app/` | The app's AppleScript and its build script |
| `docs/scene-format.md` | The scene format passed between the apps |

## Credits

- The scene format's short field names (`mn`, `vt`, `ie`, `oe`, `sab`…) follow the format documented by [Aep-2-Ecproj](https://github.com/iEatFishFingers/Aep-2-Ecproj), an After Effects → EffectCraft exporter. No code from it is used here.
- The EffectCraft ids in `src/matchnames.js` were read from EffectCraft 0.8.0 through its scripting, and checked against EffectCraft's own match-name table (MIT OR Apache-2.0). The After Effects names were read from After Effects through its scripting.

## License

MIT. See [LICENSE](LICENSE).

## Trademarks

This is an independent project. It isn't made, endorsed or supported by Adobe or by the ArtCraft team behind EffectCraft. Adobe and After Effects are either registered trademarks or trademarks of Adobe in the United States and/or other countries. EffectCraft and ArtCraft belong to their owners.
