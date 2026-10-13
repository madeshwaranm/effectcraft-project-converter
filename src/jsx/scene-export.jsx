/*
 * scene-export.jsx: describe the open project as a scene (see docs/scene-format.md).
 *
 * Uses only the After Effects scripting model, so it runs in EffectCraft (to read an
 * .ecproj) and in After Effects (to check a converted project against the original).
 * Needs lib.jsx loaded first.
 */

(function (X) {
    var tryGet = X.tryGet;

    function E(enumName, value) {
        return X.enumName(enumName, value);
    }

    // Layer groups that can't come across, or that nothing reads.
    var SKIP_GROUPS = {
        "ADBE MTrackers": "motion trackers",
        "ADBE Layer Overrides": "essential properties",
        "ADBE Data Group": "data-driven animation",
        "ADBE Layer Sets": "sets",
        "ADBE Source Options Group": "replace source"
    };

    function isComp(item) {
        return tryGet(function () { return item instanceof CompItem; }, false) ||
            tryGet(function () { return item.typeName === "Composition"; }, false);
    }

    function isFolder(item) {
        return tryGet(function () { return item instanceof FolderItem; }, false) ||
            tryGet(function () { return item.typeName === "Folder"; }, false);
    }

    function isSolidSource(src) {
        return tryGet(function () { return src instanceof SolidSource; }, false) ||
            (tryGet(function () { return src.color; }, undefined) !== undefined && !tryGet(function () { return src.file; }, null));
    }

    function isPlaceholderSource(src) {
        return tryGet(function () { return src instanceof PlaceholderSource; }, false);
    }

    function plainArray(v) {
        var out = [];
        for (var i = 0; i < v.length; i++) out.push(X.isArray(v[i]) ? plainArray(v[i]) : v[i]);
        return out;
    }

    // ------------------------------------------------------------------ values

    function shapeToObj(s) {
        var o = {
            closed: !!s.closed,
            vertices: plainArray(s.vertices),
            inTangents: plainArray(s.inTangents),
            outTangents: plainArray(s.outTangents)
        };
        var feather = ["featherSegLocs", "featherRelSegLocs", "featherRadii", "featherInterps",
            "featherTensions", "featherTypes", "featherRelCornerAngles"];
        var segs = tryGet(function () { return s.featherSegLocs; }, null);
        if (segs && segs.length) {
            for (var i = 0; i < feather.length; i++) {
                var v = tryGet((function (k) { return function () { return s[k]; }; })(feather[i]), null);
                if (v) o[feather[i]] = plainArray(v);
            }
        }
        return o;
    }

    var TEXT_FIELDS = ["text", "font", "fontFamily", "fontStyle", "fontSize", "applyFill", "fillColor",
        "applyStroke", "strokeColor", "strokeWidth", "strokeOverFill", "tracking", "leading", "autoLeading",
        "baselineShift", "horizontalScale", "verticalScale", "fauxBold", "fauxItalic", "allCaps", "smallCaps",
        "superscript", "subscript", "tsume", "boxText", "pointText", "boxTextSize", "boxTextPos",
        "firstLineIndent", "startIndent", "endIndent", "spaceBefore", "spaceAfter"];

    function textDocToObj(td) {
        var o = {};
        for (var i = 0; i < TEXT_FIELDS.length; i++) {
            var k = TEXT_FIELDS[i];
            var v = tryGet(function () { return td[k]; }, undefined);
            if (v === undefined || v === null) continue;
            o[k] = X.isArray(v) ? plainArray(v) : v;
        }
        var j = tryGet(function () { return td.justification; }, undefined);
        if (j !== undefined) o.justification = E("ParagraphJustification", j);
        return o;
    }

    var MARKER_FIELDS = ["comment", "duration", "chapter", "url", "frameTarget", "cuePointName",
        "eventCuePoint", "label", "protectedRegion"];

    function markerToObj(m) {
        var o = {};
        for (var i = 0; i < MARKER_FIELDS.length; i++) {
            var k = MARKER_FIELDS[i];
            var v = tryGet(function () { return m[k]; }, undefined);
            if (v !== undefined && v !== null && v !== "") o[k] = v;
        }
        var params = tryGet(function () { return m.getParameters(); }, null);
        if (params) {
            var p = {}, any = false;
            for (var key in params) {
                if (params.hasOwnProperty(key)) { p[key] = String(params[key]); any = true; }
            }
            if (any) o.params = p;
        }
        return o;
    }

    function readValue(v, vt) {
        if (v === undefined || v === null) return null;
        if (vt === "SHAPE") return shapeToObj(v);
        if (vt === "TEXT_DOCUMENT") return textDocToObj(v);
        if (vt === "MARKER") return markerToObj(v);
        if (X.isArray(v)) return plainArray(v);
        if (typeof v === "object") return null;
        return v;
    }

    function easeList(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) out.push([list[i].speed, list[i].influence]);
        return out;
    }

    // ------------------------------------------------------------ property tree

    function exportKeys(p, vt, ctx) {
        var keys = [], n = p.numKeys;
        var spatial = tryGet(function () { return p.isSpatial; }, false);
        for (var i = 1; i <= n; i++) {
            var k = { t: p.keyTime(i), v: readValue(p.keyValue(i), vt) };
            if (vt !== "MARKER") {
                k.ii = E("KeyframeInterpolationType", tryGet(function () { return p.keyInInterpolationType(i); }, undefined));
                k.oi = E("KeyframeInterpolationType", tryGet(function () { return p.keyOutInterpolationType(i); }, undefined));
                var ie = tryGet(function () { return p.keyInTemporalEase(i); }, null);
                var oe = tryGet(function () { return p.keyOutTemporalEase(i); }, null);
                if (ie && oe) { k.ie = easeList(ie); k.oe = easeList(oe); }
                k.tc = tryGet(function () { return p.keyTemporalContinuous(i); }, false);
                k.tab = tryGet(function () { return p.keyTemporalAutoBezier(i); }, false);
                if (spatial) {
                    var si = tryGet(function () { return p.keyInSpatialTangent(i); }, null);
                    var so = tryGet(function () { return p.keyOutSpatialTangent(i); }, null);
                    if (si && so) { k.si = plainArray(si); k.so = plainArray(so); }
                    k.sc = tryGet(function () { return p.keySpatialContinuous(i); }, false);
                    k.sab = tryGet(function () { return p.keySpatialAutoBezier(i); }, false);
                    k.rov = tryGet(function () { return p.keyRoving(i); }, false);
                }
            }
            var lbl = tryGet(function () { return p.keyLabel(i); }, 0);
            if (lbl) k.lbl = lbl;
            keys.push(k);
            ctx.stats.keys++;
        }
        return keys;
    }

    function exportProperty(p, ctx) {
        var vt = E("PropertyValueType", p.propertyValueType);
        if (vt === "NO_VALUE") return null;
        var node = { mn: p.matchName, n: p.name, t: "P", vt: vt };
        node.mod = tryGet(function () { return p.isModified; }, true);
        if (vt === "CUSTOM_VALUE") {
            node.custom = true;
            return node;
        }
        if (p.matchName === "ADBE Position" && tryGet(function () { return p.dimensionsSeparated; }, false)) node.sep = true;
        if (vt === "OneD" && tryGet(function () { return p.hasMax; }, false)) node.max = tryGet(function () { return p.maxValue; }, undefined);

        var nk = tryGet(function () { return p.numKeys; }, 0);
        if (vt === "MARKER" && nk === 0) return null;

        var x = "";
        if (tryGet(function () { return p.canSetExpression; }, false)) {
            x = tryGet(function () { return p.expression; }, "");
            if (x) {
                node.x = x;
                node.xe = tryGet(function () { return p.expressionEnabled; }, true);
                ctx.stats.expressions++;
            }
        }

        if (nk > 0) node.k = exportKeys(p, vt, ctx);
        else if (vt !== "MARKER") {
            // With an expression, .value is the expression's result; keep what's under it.
            var raw = x ? tryGet(function () { return p.valueAtTime(0, true); }, undefined) : undefined;
            if (raw === undefined) raw = tryGet(function () { return p.value; }, null);
            node.v = readValue(raw, vt);
        }
        ctx.stats.props++;
        return node;
    }

    function maskInfo(g) {
        return {
            mode: E("MaskMode", tryGet(function () { return g.maskMode; }, undefined)),
            inverted: tryGet(function () { return g.inverted; }, false),
            rotoBezier: tryGet(function () { return g.rotoBezier; }, false),
            motionBlur: E("MaskMotionBlur", tryGet(function () { return g.maskMotionBlur; }, undefined)),
            featherFalloff: E("MaskFeatherFalloff", tryGet(function () { return g.maskFeatherFalloff; }, undefined)),
            color: tryGet(function () { return plainArray(g.color); }, undefined),
            locked: tryGet(function () { return g.locked; }, false)
        };
    }

    // After Effects lists every possible property in these groups, switched on or not. The
    // switched-on ones are the ones that can take an expression. (EffectCraft lists only those.)
    var ONLY_ACTIVE = {
        "ADBE Text Animator Properties": true,
        "ADBE Vector Stroke Dashes": true,
        "ADBE Text Selector": true
    };

    function isInactive(p, parentMn, ctx) {
        if (!ctx.isAE || !ONLY_ACTIVE[parentMn]) return false;
        return !tryGet(function () { return p.canSetExpression; }, true);
    }

    function exportGroup(g, depth, ctx) {
        var pt = E("PropertyType", g.propertyType);
        var node = { mn: g.matchName, n: g.name, t: pt === "INDEXED_GROUP" ? "I" : "N", ch: [] };
        if (tryGet(function () { return g.canSetEnabled; }, false)) node.en = tryGet(function () { return g.enabled; }, true);
        if (g.matchName === "ADBE Mask Atom") node.mask = maskInfo(g);
        if (depth > 40) return node;
        var n = tryGet(function () { return g.numProperties; }, 0);
        for (var i = 1; i <= n; i++) {
            var c = tryGet(function () { return g.property(i); }, null);
            if (!c) continue;
            if (isInactive(c, g.matchName, ctx)) continue;
            var cn = exportNode(c, depth + 1, ctx);
            if (cn) node.ch.push(cn);
        }
        return node;
    }

    function exportNode(p, depth, ctx) {
        var pt = E("PropertyType", tryGet(function () { return p.propertyType; }, undefined));
        if (pt === "PROPERTY") return exportProperty(p, ctx);
        return exportGroup(p, depth, ctx);
    }

    function layerStylesInUse(g) {
        var n = tryGet(function () { return g.numProperties; }, 0);
        for (var i = 1; i <= n; i++) {
            var s = tryGet(function () { return g.property(i); }, null);
            if (!s || s.matchName === "ADBE Blend Options Group") continue;
            if (tryGet(function () { return s.canSetEnabled && s.enabled; }, false)) return true;
        }
        return false;
    }

    function exportLayerProps(L, kind, ctx, where) {
        var out = [];
        var threeD = tryGet(function () { return L.threeDLayer; }, false);
        var hasAudio = tryGet(function () { return L.hasAudio; }, false);
        var remap = tryGet(function () { return L.timeRemapEnabled; }, false);
        var n = tryGet(function () { return L.numProperties; }, 0);
        var sawMarker = false;
        for (var i = 1; i <= n; i++) {
            var p = tryGet(function () { return L.property(i); }, null);
            if (!p) continue;
            var mn = p.matchName;
            if (mn === "ADBE Marker") sawMarker = true;
            if (SKIP_GROUPS[mn]) continue;
            if (mn === "ADBE Layer Styles") {
                if (layerStylesInUse(p)) ctx.warn(where, "Layer styles aren't converted");
                continue;
            }
            if ((mn === "ADBE Material Options Group" || mn === "ADBE Extrsn Options Group" || mn === "ADBE Plane Options Group") && !threeD) continue;
            if (mn === "ADBE Audio Group" && !hasAudio) continue;
            if (mn === "ADBE Time Remapping" && !remap) continue;
            var node = exportNode(p, 0, ctx);
            if (node) out.push(node);
        }
        // Some hosts don't list the marker property among a layer's properties.
        if (!sawMarker) {
            var mk = tryGet(function () { return L.property("ADBE Marker"); }, null);
            if (mk && tryGet(function () { return mk.numKeys; }, 0) > 0) {
                out.unshift({ mn: "ADBE Marker", n: "Marker", t: "P", vt: "MARKER", k: exportKeys(mk, "MARKER", ctx) });
            }
        }
        return out;
    }

    // ------------------------------------------------------------------ layers

    function layerKind(L) {
        var mn = L.matchName;
        if (mn === "ADBE Text Layer") return "text";
        if (mn === "ADBE Vector Layer") return "shape";
        if (mn === "ADBE Camera Layer") return "camera";
        if (mn === "ADBE Light Layer") return "light";
        if (tryGet(function () { return L.nullLayer; }, false)) return "null";
        var src = tryGet(function () { return L.source; }, null);
        if (!src) return "unknown";
        if (isComp(src)) return "precomp";
        var ms = tryGet(function () { return src.mainSource; }, null);
        if (ms && isSolidSource(ms)) return "solid";
        if (ms && isPlaceholderSource(ms)) return "placeholder";
        return "footage";
    }

    function layerAttrs(L, kind) {
        var a = {};
        function put(k, fn, enumName) {
            var v = tryGet(fn, undefined);
            if (v === undefined || v === null) return;
            a[k] = enumName ? E(enumName, v) : (X.isArray(v) ? plainArray(v) : v);
        }
        put("enabled", function () { return L.enabled; });
        put("audioEnabled", function () { return L.audioEnabled; });
        put("solo", function () { return L.solo; });
        put("shy", function () { return L.shy; });
        put("locked", function () { return L.locked; });
        put("label", function () { return L.label; });
        put("comment", function () { return L.comment; });
        put("inPoint", function () { return L.inPoint; });
        put("outPoint", function () { return L.outPoint; });
        put("startTime", function () { return L.startTime; });
        put("stretch", function () { return L.stretch; });
        put("isNameSet", function () { return L.isNameSet; });
        put("autoOrient", function () { return L.autoOrient; }, "AutoOrientType");
        if (kind === "light") put("lightType", function () { return L.lightType; }, "LightType");
        if (kind !== "camera" && kind !== "light") {
            put("threeDLayer", function () { return L.threeDLayer; });
            put("adjustmentLayer", function () { return L.adjustmentLayer; });
            put("guideLayer", function () { return L.guideLayer; });
            put("collapseTransformation", function () { return L.collapseTransformation; });
            put("motionBlur", function () { return L.motionBlur; });
            put("effectsActive", function () { return L.effectsActive; });
            put("timeRemapEnabled", function () { return L.timeRemapEnabled; });
            put("preserveTransparency", function () { return L.preserveTransparency; });
            put("blendingMode", function () { return L.blendingMode; }, "BlendingMode");
            put("quality", function () { return L.quality; }, "LayerQuality");
            put("samplingQuality", function () { return L.samplingQuality; }, "LayerSamplingQuality");
            put("frameBlendingType", function () { return L.frameBlendingType; }, "FrameBlendingType");
        }
        if (kind === "text") put("threeDPerChar", function () { return L.threeDPerChar; });
        return a;
    }

    function exportLayer(L, comp, ctx) {
        var kind = layerKind(L);
        var where = comp.name + " > " + L.name;
        var o = { index: L.index, name: L.name, kind: kind, mn: L.matchName };
        var src = tryGet(function () { return L.source; }, null);
        if (src && kind !== "text" && kind !== "shape") o.sourceId = src.id;
        if (kind === "solid" || kind === "null") {
            o.solid = {
                name: tryGet(function () { return src.name; }, L.name),
                width: tryGet(function () { return src.width; }, comp.width),
                height: tryGet(function () { return src.height; }, comp.height),
                pixelAspect: tryGet(function () { return src.pixelAspect; }, 1),
                color: tryGet(function () { return plainArray(src.mainSource.color); }, [1, 1, 1])
            };
        }
        var par = tryGet(function () { return L.parent; }, null);
        o.parent = par ? par.index : null;
        var mt = E("TrackMatteType", tryGet(function () { return L.trackMatteType; }, undefined));
        if (mt !== undefined && mt !== "NO_TRACK_MATTE") {
            var ml = tryGet(function () { return L.trackMatteLayer; }, null);
            o.matte = { type: mt, layer: ml ? ml.index : L.index - 1 };
        }
        o.isTrackMatte = tryGet(function () { return L.isTrackMatte; }, false);
        o.attrs = layerAttrs(L, kind);
        if (kind === "unknown") ctx.warn(where, "Unknown layer type " + L.matchName);
        o.props = exportLayerProps(L, kind, ctx, where);
        ctx.stats.layers++;
        return o;
    }

    // ------------------------------------------------------------------- items

    function exportComp(c, ctx) {
        var o = {
            width: c.width, height: c.height, pixelAspect: c.pixelAspect, frameRate: c.frameRate,
            duration: c.duration,
            displayStartTime: tryGet(function () { return c.displayStartTime; }, 0),
            bgColor: tryGet(function () { return plainArray(c.bgColor); }, [0, 0, 0]),
            workAreaStart: tryGet(function () { return c.workAreaStart; }, 0),
            workAreaDuration: tryGet(function () { return c.workAreaDuration; }, c.duration),
            motionBlur: tryGet(function () { return c.motionBlur; }, false),
            shutterAngle: tryGet(function () { return c.shutterAngle; }, undefined),
            shutterPhase: tryGet(function () { return c.shutterPhase; }, undefined),
            frameBlending: tryGet(function () { return c.frameBlending; }, false),
            hideShyLayers: tryGet(function () { return c.hideShyLayers; }, false),
            preserveNestedFrameRate: tryGet(function () { return c.preserveNestedFrameRate; }, false),
            preserveNestedResolution: tryGet(function () { return c.preserveNestedResolution; }, false),
            dropFrame: tryGet(function () { return c.dropFrame; }, undefined),
            layers: []
        };
        var mp = tryGet(function () { return c.markerProperty; }, null);
        if (mp && tryGet(function () { return mp.numKeys; }, 0) > 0) o.markers = exportKeys(mp, "MARKER", ctx);
        for (var i = 1; i <= c.numLayers; i++) o.layers.push(exportLayer(c.layer(i), c, ctx));
        ctx.stats.comps++;
        return o;
    }

    function exportFootage(f, ctx) {
        var o = {
            width: tryGet(function () { return f.width; }, 0),
            height: tryGet(function () { return f.height; }, 0),
            pixelAspect: tryGet(function () { return f.pixelAspect; }, 1),
            duration: tryGet(function () { return f.duration; }, 0),
            frameRate: tryGet(function () { return f.frameRate; }, 0),
            hasVideo: tryGet(function () { return f.hasVideo; }, true),
            hasAudio: tryGet(function () { return f.hasAudio; }, false),
            footageMissing: tryGet(function () { return f.footageMissing; }, false)
        };
        var ms = tryGet(function () { return f.mainSource; }, null);
        if (ms && isSolidSource(ms)) {
            o.kind = "solid";
            o.color = tryGet(function () { return plainArray(ms.color); }, [1, 1, 1]);
        } else if (ms && isPlaceholderSource(ms)) {
            o.kind = "placeholder";
        } else {
            o.kind = "file";
            var file = tryGet(function () { return f.file || ms.file; }, null);
            o.file = file ? tryGet(function () { return file.fsName; }, String(file)) : null;
            o.isStill = tryGet(function () { return ms.isStill; }, false);
            o.interp = {
                alphaMode: E("AlphaMode", tryGet(function () { return ms.alphaMode; }, undefined)),
                invertAlpha: tryGet(function () { return ms.invertAlpha; }, undefined),
                premulColor: tryGet(function () { return plainArray(ms.premulColor); }, undefined),
                fieldSeparationType: E("FieldSeparationType", tryGet(function () { return ms.fieldSeparationType; }, undefined)),
                conformFrameRate: tryGet(function () { return ms.conformFrameRate; }, undefined),
                loop: tryGet(function () { return ms.loop; }, undefined)
            };
            if (o.footageMissing) ctx.warn(f.name, "Footage is missing: " + o.file);
        }
        ctx.stats.footage++;
        return o;
    }

    X.exportScene = function () {
        var proj = app.project;
        var warnings = [];
        var ctx = {
            isAE: X.hostName() === "After Effects",
            stats: { comps: 0, layers: 0, footage: 0, props: 0, keys: 0, expressions: 0 },
            warn: function (where, msg) { warnings.push({ where: where, message: msg }); }
        };
        var scene = {
            format: X.SCENE_FORMAT,
            version: X.SCENE_VERSION,
            host: tryGet(function () { return app.version; }, ""),
            project: {
                file: tryGet(function () { return proj.file ? proj.file.fsName : null; }, null),
                bitsPerChannel: tryGet(function () { return proj.bitsPerChannel; }, 8),
                linearBlending: tryGet(function () { return proj.linearBlending; }, false),
                workingSpace: tryGet(function () { return proj.workingSpace; }, ""),
                activeItemId: tryGet(function () { return proj.activeItem ? proj.activeItem.id : null; }, null)
            },
            items: [],
            stats: ctx.stats,
            warnings: warnings
        };
        for (var i = 1; i <= proj.numItems; i++) {
            var it = proj.item(i);
            var base = {
                id: it.id,
                name: it.name,
                parentId: tryGet(function () { return it.parentFolder && it.parentFolder.id !== proj.rootFolder.id ? it.parentFolder.id : null; }, null),
                label: tryGet(function () { return it.label; }, undefined),
                comment: tryGet(function () { return it.comment; }, undefined)
            };
            var o;
            if (isFolder(it)) { o = {}; base.type = "folder"; }
            else if (isComp(it)) { o = exportComp(it, ctx); base.type = "comp"; }
            else { o = exportFootage(it, ctx); base.type = "footage"; }
            for (var k in o) if (o.hasOwnProperty(k)) base[k] = o[k];
            scene.items.push(base);
        }
        return scene;
    };
})(AEEC);
