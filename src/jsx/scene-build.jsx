/*
 * scene-build.jsx: rebuild a scene in a new project. Runs in After Effects (which then saves the
 * .aep) and in EffectCraft (where the converter saves the .ecproj over the control port).
 *
 * Needs lib.jsx loaded first. Entry point: AEEC.buildScene(scene, opts) with
 *   opts.outPath          where to save the project (After Effects only)
 *   opts.restorePrevious  reopen the project that was open before, once it's saved
 * It returns a report: { ok, output, stats, warnings, error?, code? }.
 *
 * After Effects invalidates references to properties when a sibling is added to a
 * group, so property groups are looked up again from the layer through a path of
 * match names (named groups) and positions (indexed groups) every time they're used.
 */

(function (X) {
    var tryGet = X.tryGet;

    function V(enumName, name) {
        return X.enumValue(enumName, name);
    }

    // --------------------------------------------------------------- helpers

    function sameValue(a, b) {
        if (a === b) return true;
        if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-3 * Math.max(1, Math.abs(a));
        if (X.isArray(a) && X.isArray(b)) {
            var n = Math.min(a.length, b.length);
            for (var i = 0; i < n; i++) if (!sameValue(a[i], b[i])) return false;
            return true;
        }
        return false;
    }

    function clampInt(v, lo, hi, fallback) {
        var n = Math.round(Number(v));
        if (!isFinite(n)) n = fallback;
        return Math.max(lo, Math.min(hi, n));
    }

    function color4(c) {
        if (!X.isArray(c)) return c;
        if (c.length === 3) return [c[0], c[1], c[2], 1];
        return c;
    }

    function color3(c) {
        if (!X.isArray(c)) return [1, 1, 1];
        return [c[0], c[1], c[2]];
    }

    function makeShape(o) {
        var s = new Shape();
        s.vertices = o.vertices || [];
        s.inTangents = o.inTangents || [];
        s.outTangents = o.outTangents || [];
        s.closed = !!o.closed;
        var feather = ["featherSegLocs", "featherRelSegLocs", "featherRadii", "featherInterps",
            "featherTensions", "featherTypes", "featherRelCornerAngles"];
        for (var i = 0; i < feather.length; i++) {
            if (o[feather[i]]) {
                try { s[feather[i]] = o[feather[i]]; } catch (e) {}
            }
        }
        return s;
    }

    function makeMarker(o) {
        var m = new MarkerValue(o.comment || "");
        var fields = ["duration", "chapter", "url", "frameTarget", "cuePointName", "eventCuePoint", "label", "protectedRegion"];
        for (var i = 0; i < fields.length; i++) {
            if (o[fields[i]] !== undefined) {
                try { m[fields[i]] = o[fields[i]]; } catch (e) {}
            }
        }
        if (o.params) {
            try { m.setParameters(o.params); } catch (e) {}
        }
        return m;
    }

    // A PostScript font name After Effects knows for this text style, or null.
    function resolveFont(v) {
        var fonts = tryGet(function () { return app.fonts; }, null);
        if (fonts && v.fontFamily) {
            var list = tryGet(function () { return fonts.getFontsByFamilyNameAndStyleName(v.fontFamily, v.fontStyle || "Regular"); }, null);
            if (list && list.length) return list[0].postScriptName;
        }
        return v.font || null;
    }

    // applyFill / applyStroke are set last: EffectCraft switches the stroke on when its width is set.
    var TEXT_SETTERS = ["fontSize", "strokeWidth", "strokeOverFill", "tracking",
        "autoLeading", "baselineShift", "horizontalScale", "verticalScale", "fauxBold", "fauxItalic", "allCaps",
        "smallCaps", "superscript", "subscript", "tsume", "firstLineIndent", "startIndent", "endIndent",
        "spaceBefore", "spaceAfter"];

    function makeTextDoc(base, v, ctx, where) {
        var td = base || new TextDocument(v.text || "");
        if (v.text !== undefined) td.text = v.text;
        if (X.hostName() === "EffectCraft") {
            // EffectCraft names fonts by family, with the style alongside.
            if (v.fontFamily || v.font) { try { td.font = v.fontFamily || v.font; } catch (e) {} }
            if (v.fontStyle) { try { td.fontStyle = v.fontStyle; } catch (e) {} }
        } else {
            var font = resolveFont(v);
            if (font) {
                try { td.font = font; } catch (e) {}
            }
        }
        for (var i = 0; i < TEXT_SETTERS.length; i++) {
            var k = TEXT_SETTERS[i];
            if (v[k] === undefined) continue;
            // With the stroke off, leave its settings alone: After Effects reports a 0.01 width
            // there, and setting any width switches EffectCraft's stroke on.
            if (v.applyStroke === false && (k === "strokeWidth" || k === "strokeOverFill")) continue;
            try { td[k] = v[k]; } catch (e) {}
        }
        if (v.applyFill !== false && v.fillColor) { try { td.fillColor = color3(v.fillColor); } catch (e) {} }
        if (v.applyStroke && v.strokeColor) { try { td.strokeColor = color3(v.strokeColor); } catch (e) {} }
        if (v.autoLeading === false && v.leading !== undefined) { try { td.leading = v.leading; } catch (e) {} }
        if (v.justification !== undefined) {
            var j = V("ParagraphJustification", v.justification);
            if (j !== undefined) { try { td.justification = j; } catch (e) {} }
        }
        if (v.boxText && v.boxTextSize) { try { td.boxTextSize = v.boxTextSize; } catch (e) {} }
        if (v.applyFill !== undefined) { try { td.applyFill = v.applyFill; } catch (e) {} }
        if (v.applyStroke !== undefined) { try { td.applyStroke = v.applyStroke; } catch (e) {} }
        return td;
    }

    function checkFont(p, v, ctx, where) {
        if (!v.font && !v.fontFamily) return;
        var got = tryGet(function () { return p.value.font; }, null);
        var fam = tryGet(function () { return p.value.fontFamily; }, null);
        if (got && v.fontFamily && fam && fam !== v.fontFamily) {
            ctx.warn(where, "Font \"" + v.fontFamily + " " + (v.fontStyle || "") + "\" isn't available in " + X.hostName() + "; it used " + fam);
        }
    }

    function easeArray(list, count) {
        var out = [];
        for (var i = 0; i < count; i++) {
            var e = list[Math.min(i, list.length - 1)];
            var infl = Math.max(0.1, Math.min(100, e[1]));
            out.push(new KeyframeEase(e[0], infl));
        }
        return out;
    }

    function easeCount(vt, spatial) {
        if (spatial) return 1;
        if (vt === "TwoD") return 2;
        if (vt === "ThreeD") return 3;
        return 1;
    }

    // ------------------------------------------------------------- the build

    X.buildScene = function (scene, opts) {
        opts = opts || {};
        var warnings = [];
        var report = {
            ok: false,
            output: null,
            previousProject: null,
            stats: { comps: 0, layers: 0, props: 0, keys: 0, expressions: 0, effects: 0 },
            warnings: warnings
        };
        var ctx = {
            stats: report.stats,
            warn: function (where, msg) {
                for (var i = 0; i < warnings.length; i++) {
                    if (warnings[i].where === where && warnings[i].message === msg) return;
                }
                warnings.push({ where: where, message: msg });
            },
            expressions: []
        };

        if (!scene || scene.format !== X.SCENE_FORMAT) {
            report.code = "BAD_SCENE";
            report.error = "This isn't a scene from this converter";
            return report;
        }
        if (app.project && app.project.dirty) {
            report.code = "AE_UNSAVED";
            report.error = "After Effects has unsaved changes in the open project. Save or close it, then convert again.";
            return report;
        }
        var previous = tryGet(function () { return app.project.file ? app.project.file.fsName : null; }, null);
        report.previousProject = previous;

        try { app.beginSuppressDialogs(); } catch (e) {}
        try {
            app.newProject();
            var proj = app.project;
            try { proj.expressionEngine = "javascript-1.0"; } catch (e) {}
            if (scene.project) {
                try { if (scene.project.bitsPerChannel) proj.bitsPerChannel = scene.project.bitsPerChannel; } catch (e) {}
                try { if (scene.project.linearBlending !== undefined) proj.linearBlending = scene.project.linearBlending; } catch (e) {}
            }

            var byId = {}, made = {}, createdFolders = {};
            var i, it;
            for (i = 0; i < scene.items.length; i++) byId[scene.items[i].id] = scene.items[i];

            // Folders, then comps (empty, so precomps can point at any of them), then footage.
            for (i = 0; i < scene.items.length; i++) {
                it = scene.items[i];
                if (it.type !== "folder") continue;
                made[it.id] = proj.items.addFolder(it.name);
                createdFolders[made[it.id].id] = true;
            }
            for (i = 0; i < scene.items.length; i++) {
                it = scene.items[i];
                if (it.type === "comp") made[it.id] = createComp(proj, it, ctx);
                else if (it.type === "footage" && it.kind !== "solid") made[it.id] = importFootage(proj, it, ctx);
            }
            for (i = 0; i < scene.items.length; i++) {
                it = scene.items[i];
                if (!made[it.id]) continue;
                if (it.parentId !== null && it.parentId !== undefined && made[it.parentId]) {
                    try { made[it.id].parentFolder = made[it.parentId]; } catch (e) {}
                }
                if (it.label !== undefined) { try { made[it.id].label = it.label; } catch (e) {} }
                if (it.comment) { try { made[it.id].comment = it.comment; } catch (e) {} }
            }

            var solids = {};
            for (i = 0; i < scene.items.length; i++) {
                it = scene.items[i];
                if (it.type === "comp") buildLayers(made[it.id], it, made, byId, solids, ctx);
            }

            // Expressions last: they can point at any layer or comp.
            for (i = 0; i < ctx.expressions.length; i++) {
                var ex = ctx.expressions[i];
                var p = tryGet(ex.get, null);
                if (!p) continue;
                try {
                    p.expression = ex.x;
                    if (ex.xe === false) p.expressionEnabled = false;
                    ctx.stats.expressions++;
                    var err = tryGet(function () { return p.expressionError; }, "");
                    if (err && ex.xe !== false) ctx.warn(ex.where, "Expression on " + p.name + " has an error in " + X.hostName() + ": " + err);
                } catch (e) {
                    ctx.warn(ex.where, "Couldn't set the expression on " + ex.name + ": " + e);
                }
            }

            tidyFolders(proj, createdFolders, scene);

            if (scene.project && scene.project.activeItemId && made[scene.project.activeItemId]) {
                try { made[scene.project.activeItemId].openInViewer(); } catch (e) {}
            }

            if (opts.outPath) {
                var out = new File(opts.outPath);
                if (!proj.save(out)) throw new Error("After Effects didn't save " + opts.outPath);
                report.output = tryGet(function () { return proj.file.fsName; }, opts.outPath);
            }
            report.ok = true;

            if (opts.restorePrevious && previous) {
                try {
                    app.open(new File(previous));
                    var now = tryGet(function () { return app.project.file.fsName; }, null);
                    if (now === previous) report.restored = previous;
                    else ctx.warn("After Effects", "Couldn't reopen " + previous);
                } catch (e) {
                    ctx.warn("After Effects", "Couldn't reopen " + previous + ": " + e);
                }
            }
        } catch (e) {
            report.error = String(e) + (e.line ? " (scene-build line " + e.line + ")" : "");
        } finally {
            try { app.endSuppressDialogs(false); } catch (e) {}
        }
        return report;
    };

    // ----------------------------------------------------------------- items

    function createComp(proj, it, ctx) {
        var c = proj.items.addComp(it.name,
            clampInt(it.width, 4, 30000, 1920), clampInt(it.height, 4, 30000, 1080),
            it.pixelAspect || 1, Math.max(it.duration || 1, 1 / (it.frameRate || 30)), it.frameRate || 30);
        var set = function (k, v) { if (v !== undefined && v !== null) { try { c[k] = v; } catch (e) {} } };
        set("bgColor", it.bgColor ? color3(it.bgColor) : undefined);
        set("displayStartTime", it.displayStartTime);
        set("workAreaStart", it.workAreaStart);
        set("workAreaDuration", it.workAreaDuration);
        set("motionBlur", it.motionBlur);
        set("shutterAngle", it.shutterAngle);
        set("shutterPhase", it.shutterPhase);
        set("frameBlending", it.frameBlending);
        set("hideShyLayers", it.hideShyLayers);
        set("preserveNestedFrameRate", it.preserveNestedFrameRate);
        set("preserveNestedResolution", it.preserveNestedResolution);
        set("dropFrame", it.dropFrame);
        if (it.markers) {
            for (var i = 0; i < it.markers.length; i++) {
                try { c.markerProperty.setValueAtTime(it.markers[i].t, makeMarker(it.markers[i].v || {})); ctx.stats.keys++; } catch (e) {}
            }
        }
        ctx.stats.comps++;
        return c;
    }

    function importFootage(proj, it, ctx) {
        if (it.kind === "file" && it.file) {
            // Try the import even when File.exists says no: EffectCraft's script sandbox reports
            // files outside its own folders as missing but still imports them.
            try {
                var item = proj.importFile(new ImportOptions(new File(it.file)));
                item.name = it.name;
                applyInterpretation(item, it.interp);
                return item;
            } catch (e) {
                ctx.warn(it.name, "Footage file not found, used a placeholder: " + it.file);
            }
        }
        return proj.importPlaceholder(it.name, clampInt(it.width, 1, 30000, 1920), clampInt(it.height, 1, 30000, 1080),
            it.frameRate || 30, Math.max(it.duration || 1, 0.1));
    }

    function applyInterpretation(item, interp) {
        if (!interp) return;
        var ms = item.mainSource;
        var a = V("AlphaMode", interp.alphaMode);
        if (a !== undefined) { try { ms.alphaMode = a; } catch (e) {} }
        if (interp.invertAlpha !== undefined) { try { ms.invertAlpha = interp.invertAlpha; } catch (e) {} }
        if (interp.premulColor) { try { ms.premulColor = color3(interp.premulColor); } catch (e) {} }
        if (interp.conformFrameRate) { try { ms.conformFrameRate = interp.conformFrameRate; } catch (e) {} }
        if (interp.loop && interp.loop > 1) { try { ms.loop = interp.loop; } catch (e) {} }
    }

    // Fold After Effects' own "Solids" folder into the scene's, and drop folders left empty.
    function tidyFolders(proj, createdFolders, scene) {
        var sceneSolids = null, autos = [], i;
        for (i = 1; i <= proj.numItems; i++) {
            var it = proj.item(i);
            if (!(it instanceof FolderItem)) continue;
            if (createdFolders[it.id]) {
                if (it.name === "Solids" && it.parentFolder.id === proj.rootFolder.id) sceneSolids = it;
            } else {
                autos.push(it);
            }
        }
        for (i = 0; i < autos.length; i++) {
            var f = autos[i];
            if (sceneSolids) {
                while (f.numItems > 0) f.item(1).parentFolder = sceneSolids;
            }
            if (f.numItems === 0) f.remove();
        }
    }

    // ---------------------------------------------------------------- layers

    function buildLayers(comp, it, made, byId, solids, ctx) {
        var layers = it.layers || [];
        var byIndex = {}, i, L, layer;

        // Bottom of the stack first: every add goes on top.
        for (i = layers.length - 1; i >= 0; i--) {
            L = layers[i];
            layer = createLayer(comp, L, made, byId, solids, ctx);
            byIndex[L.index] = layer;
            ctx.stats.layers++;
        }

        for (i = 0; i < layers.length; i++) {
            L = layers[i];
            layer = byIndex[L.index];
            if (!layer) continue;
            var where = it.name + " > " + L.name;
            setupLayer(layer, L, ctx, where);
        }
        // Parents before properties: values in the scene are already in the parent's space.
        for (i = 0; i < layers.length; i++) {
            L = layers[i];
            if (L.parent === null || L.parent === undefined || !byIndex[L.index] || !byIndex[L.parent]) continue;
            try {
                if (typeof byIndex[L.index].setParentWithJump === "function") byIndex[L.index].setParentWithJump(byIndex[L.parent]);
                else byIndex[L.index].parent = byIndex[L.parent];
            } catch (e) {
                ctx.warn(it.name + " > " + L.name, "Couldn't parent to layer " + L.parent + ": " + e);
            }
        }
        for (i = 0; i < layers.length; i++) {
            L = layers[i];
            layer = byIndex[L.index];
            if (!layer) continue;
            var w = it.name + " > " + L.name;
            applyLayerProps(layer, L, ctx, w);
        }
        for (i = 0; i < layers.length; i++) {
            L = layers[i];
            if (!L.matte || !byIndex[L.index]) continue;
            setMatte(byIndex[L.index], byIndex[L.matte.layer], L.matte.type, ctx, it.name + " > " + L.name);
        }
        for (i = 0; i < layers.length; i++) {
            L = layers[i];
            if (byIndex[L.index]) finishLayer(byIndex[L.index], L, ctx, it.name + " > " + L.name);
        }
    }

    function createLayer(comp, L, made, byId, solids, ctx) {
        var where = comp.name + " > " + L.name;
        var center = [comp.width / 2, comp.height / 2];
        var layer = null;
        switch (L.kind) {
            case "text":
                var td = findTextDoc(L.props);
                if (td && td.boxText && td.boxTextSize) layer = comp.layers.addBoxText(td.boxTextSize);
                else layer = comp.layers.addText(td && td.text !== undefined ? td.text : "");
                break;
            case "shape":
                layer = comp.layers.addShape();
                break;
            case "null":
                layer = comp.layers.addNull(comp.duration);
                break;
            case "camera":
                layer = comp.layers.addCamera(L.name, center);
                break;
            case "light":
                layer = comp.layers.addLight(L.name, center);
                break;
            case "solid":
                layer = addSolidLayer(comp, L, byId, solids, made);
                break;
            case "precomp":
            case "footage":
            case "placeholder":
                var src = made[L.sourceId];
                if (src) {
                    layer = comp.layers.add(src);
                } else {
                    ctx.warn(where, "Its source is missing, so it's a placeholder solid");
                    layer = comp.layers.addSolid([0.5, 0.5, 0.5], L.name, comp.width, comp.height, 1, comp.duration);
                }
                break;
            default:
                ctx.warn(where, "Unknown layer type, made a null instead");
                layer = comp.layers.addNull(comp.duration);
        }
        if (L.attrs && L.attrs.isNameSet === false && L.kind === "text") return layer;
        try { layer.name = L.name; } catch (e) {}
        return layer;
    }

    function addSolidLayer(comp, L, byId, solids, made) {
        var s = L.solid || {};
        var srcItem = byId[L.sourceId];
        var layer = comp.layers.addSolid(color3(s.color), s.name || L.name,
            clampInt(s.width, 1, 30000, comp.width), clampInt(s.height, 1, 30000, comp.height),
            s.pixelAspect || 1, comp.duration);
        if (L.sourceId === undefined) return layer;
        var existing = solids[L.sourceId];
        if (existing) {
            // Share one solid between layers, as the original did.
            var extra = layer.source;
            try {
                layer.replaceSource(existing, false);
                extra.remove();
            } catch (e) {}
        } else {
            solids[L.sourceId] = layer.source;
            if (srcItem) {
                try { layer.source.name = srcItem.name; } catch (e) {}
                if (srcItem.parentId !== null && srcItem.parentId !== undefined && made[srcItem.parentId]) {
                    try { layer.source.parentFolder = made[srcItem.parentId]; } catch (e) {}
                }
            }
        }
        return layer;
    }

    function findTextDoc(nodes) {
        if (!nodes) return null;
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].mn === "ADBE Text Document") {
                if (nodes[i].v) return nodes[i].v;
                if (nodes[i].k && nodes[i].k.length) return nodes[i].k[0].v;
            }
            var r = findTextDoc(nodes[i].ch);
            if (r) return r;
        }
        return null;
    }

    // What has to be in place before properties are set: timing, 3D, light type, time remap.
    function setupLayer(layer, L, ctx, where) {
        var a = L.attrs || {};
        var set = function (k, v) {
            if (v === undefined || v === null) return;
            try { layer[k] = v; } catch (e) { ctx.warn(where, "Couldn't set " + k + ": " + e); }
        };
        set("startTime", a.startTime);
        if (a.stretch !== undefined && a.stretch !== 100 && a.stretch !== 0) set("stretch", a.stretch);
        if (L.kind !== "camera" && L.kind !== "light") {
            if (a.threeDLayer) set("threeDLayer", true);
            if (a.adjustmentLayer) set("adjustmentLayer", true);
            if (a.collapseTransformation && (L.kind === "precomp" || L.kind === "shape" || L.kind === "text")) set("collapseTransformation", true);
            if (a.timeRemapEnabled) set("timeRemapEnabled", true);
        }
        if (L.kind === "light" && a.lightType !== undefined) set("lightType", V("LightType", a.lightType));
        if (L.kind === "text" && a.threeDPerChar) set("threeDPerChar", true);
    }

    function setMatte(layer, matteLayer, type, ctx, where) {
        var t = V("TrackMatteType", type);
        if (t === undefined) return;
        try {
            if (matteLayer && typeof layer.setTrackMatte === "function") layer.setTrackMatte(matteLayer, t);
            else layer.trackMatteType = t;
        } catch (e) {
            ctx.warn(where, "Couldn't set the track matte: " + e);
        }
    }

    // Switches and modes, then the lock last.
    function finishLayer(layer, L, ctx, where) {
        var a = L.attrs || {};
        var set = function (k, v) {
            if (v === undefined || v === null) return;
            try { if (layer[k] !== v) layer[k] = v; } catch (e) { ctx.warn(where, "Couldn't set " + k + ": " + e); }
        };
        if (L.kind !== "camera" && L.kind !== "light") {
            set("blendingMode", V("BlendingMode", a.blendingMode));
            set("preserveTransparency", a.preserveTransparency);
            set("quality", V("LayerQuality", a.quality));
            set("samplingQuality", V("LayerSamplingQuality", a.samplingQuality));
            set("frameBlendingType", V("FrameBlendingType", a.frameBlendingType));
            set("motionBlur", a.motionBlur);
            set("effectsActive", a.effectsActive);
            set("guideLayer", a.guideLayer);
        }
        if (a.autoOrient !== undefined && a.autoOrient !== "NO_AUTO_ORIENT") set("autoOrient", V("AutoOrientType", a.autoOrient));
        set("label", a.label);
        if (a.comment) set("comment", a.comment);
        if (a.inPoint !== undefined) set("inPoint", a.inPoint);
        if (a.outPoint !== undefined) set("outPoint", a.outPoint);
        set("enabled", a.enabled);
        if (a.audioEnabled === false) set("audioEnabled", false);
        set("solo", a.solo);
        set("shy", a.shy);
        set("locked", a.locked);
    }

    // ------------------------------------------------------------ properties

    function applyLayerProps(layer, L, ctx, where) {
        var getRoot = function () { return layer; };
        // Masks first: text on a path and some effects point at them.
        var props = L.props || [], masks = [], rest = [];
        for (var i = 0; i < props.length; i++) (props[i].mn === "ADBE Mask Parade" ? masks : rest).push(props[i]);
        applyChildren(getRoot, masks.concat(rest), false, ctx, where);
    }

    // `getGroup` looks the group up again each time; `indexed` says children are added.
    function applyChildren(getGroup, nodes, indexed, ctx, where) {
        var sep = false, i;
        for (i = 0; i < nodes.length; i++) {
            if (nodes[i].mn === "ADBE Position" && nodes[i].sep) sep = true;
        }
        if (sep) {
            var pos = tryGet(function () { return getGroup().property("ADBE Position"); }, null);
            if (pos) { try { pos.dimensionsSeparated = true; } catch (e) { ctx.warn(where, "Couldn't separate Position: " + e); } }
        }

        var parentMn = getGroupMatchName(getGroup);
        var addByName = !!ADD_BY_NAME[parentMn];
        var inEffect = tryGet(function () { return getGroup().isEffect === true; }, false);
        var added = 0;
        for (i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var mn = node.mn;
            if (!sep && /^ADBE Position_\d$/.test(mn)) continue;
            if (sep && mn === "ADBE Position") continue;

            var getChild;
            if (addByName) {
                // Switched on by adding, kept in After Effects' own order: add, then find by match name.
                var ug = getGroup();
                if (tryGet(function () { return ug.canAddProperty(mn); }, false)) {
                    try { ug.addProperty(mn); } catch (e) {}
                }
                if (!tryGet(function () { return ug.property(mn); }, null)) {
                    ctx.warn(where, describeMissing(node, ug));
                    continue;
                }
                getChild = (function (gg, m) { return function () { return gg().property(m); }; })(getGroup, mn);
            } else if (indexed) {
                var g = getGroup();
                var pos1 = added + 1;
                var existing = tryGet(function () { return g.numProperties >= pos1 ? g.property(pos1) : null; }, null);
                if (!existing || existing.matchName !== mn) {
                    var canAdd = tryGet(function () { return g.canAddProperty(mn); }, false);
                    if (!canAdd) {
                        ctx.warn(where, describeMissing(node, g));
                        continue;
                    }
                    try {
                        g.addProperty(mn);
                    } catch (e) {
                        ctx.warn(where, describeMissing(node, g) + ": " + e);
                        continue;
                    }
                    if (isEffectParade(g)) ctx.stats.effects++;
                }
                added = pos1;
                getChild = (function (gg, idx) { return function () { return gg().property(idx); }; })(getGroup, pos1);
                var ch = tryGet(getChild, null);
                if (ch && node.n && ch.name !== node.n) { try { ch.name = node.n; } catch (e) {} }
            } else {
                getChild = (function (gg, m, nm, byName) {
                    return function () {
                        var grp = gg();
                        var c = grp.property(m);
                        // Effect parameters can sit at different positions in the two apps
                        // (EffectCraft's Glow has an extra one), so trust the name there.
                        if (byName && nm && (!c || c.name !== nm)) {
                            var named = grp.property(nm);
                            if (named && named.name === nm) return named;
                            if (c) return null;
                        }
                        return c || (nm ? grp.property(nm) : null);
                    };
                })(getGroup, mn, node.n, inEffect);
                if (!tryGet(getChild, null)) {
                    if (isSignificant(node)) ctx.warn(where, X.hostName() + " has no \"" + (node.n || mn) + "\" (" + mn + ") here, so it was skipped");
                    continue;
                }
            }

            if (node.t === "P") {
                applyProperty(getChild, node, ctx, where);
            } else {
                var childWhere = where + " > " + (node.n || mn);
                if (node.mask) applyMask(getChild, node.mask);
                applyChildren(getChild, node.ch || [], node.t === "I", ctx, childWhere);
                if (node.en !== undefined) {
                    var grp = tryGet(getChild, null);
                    if (grp && tryGet(function () { return grp.canSetEnabled; }, false) && grp.enabled !== node.en) {
                        try { grp.enabled = node.en; } catch (e) {}
                    }
                }
                if (node.mask && node.mask.locked) {
                    var mg = tryGet(getChild, null);
                    if (mg) { try { mg.locked = true; } catch (e) {} }
                }
            }
        }
    }

    // Groups whose properties are switched on by adding them, and which After Effects keeps
    // in its own order (a text animator's properties exist but stay hidden until added).
    var ADD_BY_NAME = {
        "ADBE Text Animator Properties": true,
        "ADBE Vector Stroke Dashes": true
    };

    function getGroupMatchName(getGroup) {
        return tryGet(function () { return getGroup().matchName; }, "");
    }

    function isEffectParade(g) {
        return tryGet(function () { return g.matchName === "ADBE Effect Parade"; }, false);
    }

    function describeMissing(node, group) {
        if (isEffectParade(group)) return "Effect \"" + (node.n || node.mn) + "\" (" + node.mn + ") isn't available in " + X.hostName();
        return "Couldn't add \"" + (node.n || node.mn) + "\" (" + node.mn + ")";
    }

    // Worth a warning when it's missing: it was changed, keyed or driven by an expression.
    function isSignificant(node) {
        if (node.t === "P") return !!(node.k || node.x || node.mod);
        if (node.ch) {
            for (var i = 0; i < node.ch.length; i++) if (isSignificant(node.ch[i])) return true;
        }
        return false;
    }

    function applyMask(getMask, m) {
        var mask = tryGet(getMask, null);
        if (!mask) return;
        var mode = V("MaskMode", m.mode);
        if (mode !== undefined) { try { mask.maskMode = mode; } catch (e) {} }
        if (m.inverted !== undefined) { try { mask.inverted = m.inverted; } catch (e) {} }
        if (m.rotoBezier) { try { mask.rotoBezier = true; } catch (e) {} }
        var mb = V("MaskMotionBlur", m.motionBlur);
        if (mb !== undefined) { try { mask.maskMotionBlur = mb; } catch (e) {} }
        var ff = V("MaskFeatherFalloff", m.featherFalloff);
        if (ff !== undefined) { try { mask.maskFeatherFalloff = ff; } catch (e) {} }
        if (m.color) { try { mask.color = color3(m.color); } catch (e) {} }
    }

    function toHostValue(p, vt, v) {
        if (v === null || v === undefined) return v;
        if (vt === "SHAPE") return makeShape(v);
        if (vt === "COLOR") return color4(v);
        return v;
    }

    // Arrays sometimes come with a different length than this property takes (z on a 2D value).
    function fitLength(p, v) {
        if (!X.isArray(v)) return v;
        var cur = tryGet(function () { return p.value; }, null);
        if (!X.isArray(cur) || cur.length === v.length) return v;
        var out = [];
        for (var i = 0; i < cur.length; i++) out.push(i < v.length ? v[i] : cur[i]);
        return out;
    }

    // After Effects keeps some properties on 0..1 (Fill's Opacity, a camera's Highlight
    // Threshold) where EffectCraft shows 0..100 or 0..255. Returns the factor to apply.
    var SCALE_255 = { "ADBE Iris Highlight Threshold": true, "highlightThreshold": true };

    function numbersOf(node) {
        var out = [];
        if (typeof node.v === "number") out.push(node.v);
        if (node.k) for (var i = 0; i < node.k.length; i++) if (typeof node.k[i].v === "number") out.push(node.k[i].v);
        return out;
    }

    function valueScale(p, node) {
        if (node.vt !== "OneD") return 1;
        var mx = tryGet(function () { return p.hasMax ? p.maxValue : 1e9; }, 1e9);
        // After Effects -> EffectCraft: the scene says the source kept it on 0..1.
        if (node.max !== undefined && node.max <= 1 && mx > 1) return SCALE_255[node.mn] ? 255 : 100;
        if (mx > 1) return 1;
        var nums = numbersOf(node), big = 0;
        for (var i = 0; i < nums.length; i++) big = Math.max(big, Math.abs(nums[i]));
        if (big <= 1) return 1;
        if (SCALE_255[node.mn]) return 1 / 255;
        return big <= 100 ? 0.01 : 1 / 255;
    }

    // Copy of `node` with values in this property's units.
    function adaptNode(p, node) {
        var factor = valueScale(p, node);
        var aeVt = X.enumName("PropertyValueType", tryGet(function () { return p.propertyValueType; }, undefined));
        // EffectCraft lists a mask choice as a 1-based popup (1 = None); After Effects counts masks from 1 with 0 = None.
        var shift = node.vt === "OneD" && aeVt === "MASK_INDEX" ? -1 : node.vt === "MASK_INDEX" && aeVt === "OneD" ? 1 : 0;
        if (factor === 1 && shift === 0) return node;
        var conv = function (v) { return typeof v === "number" ? Math.max(shift < 0 ? 0 : -1e12, v * factor + shift) : v; };
        var out = {}, k;
        for (k in node) if (node.hasOwnProperty(k)) out[k] = node[k];
        if (node.v !== undefined) out.v = conv(node.v);
        if (node.k) {
            out.k = [];
            for (var i = 0; i < node.k.length; i++) {
                var key = {}, src = node.k[i];
                for (k in src) if (src.hasOwnProperty(k)) key[k] = src[k];
                key.v = conv(src.v);
                if (factor !== 1 && src.ie) key.ie = scaleEase(src.ie, factor);
                if (factor !== 1 && src.oe) key.oe = scaleEase(src.oe, factor);
                out.k.push(key);
            }
        }
        return out;
    }

    function scaleEase(list, factor) {
        var out = [];
        for (var i = 0; i < list.length; i++) out.push([list[i][0] * factor, list[i][1]]);
        return out;
    }

    function applyProperty(getProp, node, ctx, where) {
        var p = tryGet(getProp, null);
        if (!p) return;
        node = adaptNode(p, node);
        var vt = node.vt;
        var label = where + " > " + (node.n || node.mn);
        if (vt === "NO_VALUE") return;
        if (node.custom) {
            // Scripts can't read or write these (gradient colour stops, Curves, Levels). EffectCraft
            // doesn't reliably say whether they were changed, so always point them out.
            ctx.warn(where, "\"" + (node.n || node.mn) + "\" can't be copied by a script; check it by hand");
            return;
        }
        if (node.k && node.k.length) {
            applyKeys(getProp, node, ctx, label);
        } else if (node.v !== undefined && node.v !== null && vt !== "MARKER") {
            setStatic(p, node, ctx, where, label);
        }
        if (node.x) ctx.expressions.push({ get: getProp, x: node.x, xe: node.xe, where: where, name: node.n || node.mn });
        ctx.stats.props++;
    }

    function setStatic(p, node, ctx, where, label) {
        var vt = node.vt;
        try {
            if (vt === "TEXT_DOCUMENT") {
                p.setValue(makeTextDoc(p.value, node.v, ctx, where));
                checkFont(p, node.v, ctx, where);
                return;
            }
            var v = toHostValue(p, vt, node.v);
            if (vt !== "SHAPE" && sameValue(tryGet(function () { return p.value; }, null), v)) return;
            p.setValue(fitLength(p, v));
        } catch (e) {
            // Hidden or read-only properties throw; only report it when the value really differs.
            if (vt === "SHAPE" || vt === "TEXT_DOCUMENT" || !sameValue(tryGet(function () { return p.value; }, null), node.v)) {
                if (node.mod !== false || node.x) ctx.warn(where, "Couldn't set \"" + (node.n || node.mn) + "\": " + e);
            }
        }
    }

    function applyKeys(getProp, node, ctx, label) {
        var p = getProp();
        var vt = node.vt, keys = node.k, i;
        try {
            while (p.numKeys > 0) p.removeKey(p.numKeys);
        } catch (e) {}

        if (vt === "MARKER") {
            for (i = 0; i < keys.length; i++) {
                try { p.setValueAtTime(keys[i].t, makeMarker(keys[i].v || {})); ctx.stats.keys++; } catch (e) {}
            }
            return;
        }

        for (i = 0; i < keys.length; i++) {
            var k = keys[i];
            try {
                var v = vt === "TEXT_DOCUMENT" ? makeTextDoc(p.value, k.v, ctx, label) : fitLength(p, toHostValue(p, vt, k.v));
                p.setValueAtTime(k.t, v);
                ctx.stats.keys++;
            } catch (e) {
                ctx.warn(label, "Couldn't add the keyframe at " + k.t + "s: " + e);
            }
        }

        var spatial = tryGet(function () { return p.isSpatial; }, false);
        var BEZ = KeyframeInterpolationType.BEZIER;
        var rov = [];
        for (i = 0; i < keys.length; i++) {
            k = keys[i];
            var idx = tryGet(function () { return p.nearestKeyIndex(k.t); }, i + 1);
            var inT = V("KeyframeInterpolationType", k.ii), outT = V("KeyframeInterpolationType", k.oi);
            var canBez = tryGet(function () { return p.isInterpolationTypeValid(BEZ); }, false);

            if (spatial && k.si && k.so) {
                try { p.setSpatialAutoBezierAtKey(idx, !!k.sab); } catch (e) {}
                try { p.setSpatialContinuousAtKey(idx, !!k.sc); } catch (e) {}
                if (!k.sab) {
                    try { p.setSpatialTangentsAtKey(idx, fitLength(p, k.si), fitLength(p, k.so)); } catch (e) {}
                }
                if (k.rov) rov.push(idx);
            }

            if (canBez && k.ie && k.oe && (k.ii === "BEZIER" || k.oi === "BEZIER")) {
                try { p.setInterpolationTypeAtKey(idx, BEZ, BEZ); } catch (e) {}
                try { p.setTemporalContinuousAtKey(idx, !!k.tc); } catch (e) {}
                try { p.setTemporalAutoBezierAtKey(idx, !!k.tab); } catch (e) {}
                if (!k.tab) {
                    var n = easeCount(vt, spatial);
                    try {
                        p.setTemporalEaseAtKey(idx, easeArray(k.ie, n), easeArray(k.oe, n));
                    } catch (e) {
                        try {
                            p.setTemporalEaseAtKey(idx, easeArray(k.ie, 1), easeArray(k.oe, 1));
                        } catch (e2) {
                            ctx.warn(label, "Couldn't set the ease on the keyframe at " + k.t + "s: " + e2);
                        }
                    }
                }
            }
            if (inT !== undefined && outT !== undefined) {
                try { p.setInterpolationTypeAtKey(idx, inT, outT); } catch (e) {}
            }
            if (k.lbl) { try { p.setLabelAtKey(idx, k.lbl); } catch (e) {} }
        }
        for (i = 0; i < rov.length; i++) {
            try { p.setRovingAtKey(rov[i], true); } catch (e) {}
        }
    }
})(AEEC);
