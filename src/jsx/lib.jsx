/*
 * lib.jsx: helpers shared by the EffectCraft exporter and the After Effects builder.
 *
 * Runs in both hosts, so it's ES3: no JSON object (ExtendScript may not have one),
 * no Array.forEach, no let/const. The Node side joins this file with the others
 * into one script before running it.
 */

var AEEC = (typeof AEEC !== "undefined" && AEEC) ? AEEC : {};
AEEC.GLOBAL = this;

(function (X) {
    X.SCENE_FORMAT = "aeec-scene";
    X.SCENE_VERSION = 1;

    // Enum values travel as names, so the file never depends on a host's numeric ids.
    X.ENUMS = {
        PropertyType: ["PROPERTY", "INDEXED_GROUP", "NAMED_GROUP"],
        PropertyValueType: ["NO_VALUE", "ThreeD_SPATIAL", "ThreeD", "TwoD_SPATIAL", "TwoD", "OneD",
            "COLOR", "CUSTOM_VALUE", "MARKER", "LAYER_INDEX", "MASK_INDEX", "SHAPE", "TEXT_DOCUMENT"],
        KeyframeInterpolationType: ["LINEAR", "BEZIER", "HOLD"],
        BlendingMode: ["NORMAL", "DISSOLVE", "DANCING_DISSOLVE", "DARKEN", "MULTIPLY", "COLOR_BURN",
            "CLASSIC_COLOR_BURN", "LINEAR_BURN", "DARKER_COLOR", "ADD", "LIGHTEN", "SCREEN", "COLOR_DODGE",
            "CLASSIC_COLOR_DODGE", "LINEAR_DODGE", "LIGHTER_COLOR", "OVERLAY", "SOFT_LIGHT", "HARD_LIGHT",
            "LINEAR_LIGHT", "VIVID_LIGHT", "PIN_LIGHT", "HARD_MIX", "DIFFERENCE", "CLASSIC_DIFFERENCE",
            "EXCLUSION", "SUBTRACT", "DIVIDE", "HUE", "SATURATION", "COLOR", "LUMINOSITY", "STENCIL_ALPHA",
            "STENCIL_LUMA", "SILHOUETE_ALPHA", "SILHOUETTE_LUMA", "ALPHA_ADD", "LUMINESCENT_PREMUL"],
        TrackMatteType: ["NO_TRACK_MATTE", "ALPHA", "ALPHA_INVERTED", "LUMA", "LUMA_INVERTED"],
        LayerQuality: ["BEST", "DRAFT", "WIREFRAME"],
        LayerSamplingQuality: ["BILINEAR", "BICUBIC"],
        AutoOrientType: ["NO_AUTO_ORIENT", "ALONG_PATH", "CAMERA_OR_POINT_OF_INTEREST", "CHARACTERS_TOWARD_CAMERA"],
        FrameBlendingType: ["NO_FRAME_BLEND", "FRAME_MIX", "PIXEL_MOTION"],
        LightType: ["PARALLEL", "SPOT", "POINT", "AMBIENT", "ENVIRONMENT"],
        MaskMode: ["NONE", "ADD", "SUBTRACT", "INTERSECT", "LIGHTEN", "DARKEN", "DIFFERENCE"],
        MaskMotionBlur: ["SAME_AS_LAYER", "ON", "OFF"],
        MaskFeatherFalloff: ["FFO_LINEAR", "FFO_SMOOTH"],
        ParagraphJustification: ["LEFT_JUSTIFY", "RIGHT_JUSTIFY", "CENTER_JUSTIFY",
            "FULL_JUSTIFY_LASTLINE_LEFT", "FULL_JUSTIFY_LASTLINE_RIGHT", "FULL_JUSTIFY_LASTLINE_CENTER",
            "FULL_JUSTIFY_LASTLINE_FULL", "MULTIPLE_JUSTIFICATIONS"],
        AlphaMode: ["IGNORE", "STRAIGHT", "PREMULTIPLIED"],
        FieldSeparationType: ["OFF", "UPPER_FIELD_FIRST", "LOWER_FIELD_FIRST"]
    };

    // The host's enum object for a name in X.ENUMS, or null when the host has none.
    function hostEnum(enumName) {
        try {
            return X.GLOBAL[enumName] || null;
        } catch (err) {
            return null;
        }
    }

    // Numeric enum value -> name. Unknown values come back as the number.
    X.enumName = function (enumName, value) {
        var E = hostEnum(enumName), names = X.ENUMS[enumName];
        if (!E || !names) return value;
        for (var i = 0; i < names.length; i++) {
            if (E[names[i]] !== undefined && E[names[i]] === value) return names[i];
        }
        return value;
    };

    // Name -> this host's numeric enum value. Numbers pass through; unknown names give undefined.
    X.enumValue = function (enumName, name) {
        if (typeof name === "number") return name;
        var E = hostEnum(enumName);
        if (!E || name === undefined || name === null) return undefined;
        return E[name];
    };

    // Read a value without letting a host quirk stop the walk.
    X.tryGet = function (fn, fallback) {
        try {
            var v = fn();
            return v === undefined ? fallback : v;
        } catch (err) {
            return fallback;
        }
    };

    // "EffectCraft" or "After Effects": EffectCraft's app.version reads "26.0 (EffectCraft 0.8.0)".
    X.hostName = function () {
        var v = X.tryGet(function () { return String(app.version); }, "");
        return /EffectCraft/.test(v) ? "EffectCraft" : "After Effects";
    };

    X.isArray = function (v) {
        return v instanceof Array || Object.prototype.toString.call(v) === "[object Array]";
    };

    // ------------------------------------------------------------- JSON writer
    // ExtendScript may have no JSON object, so both hosts use this one.

    function quote(s) {
        var out = "\"";
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i), code = s.charCodeAt(i);
            if (c === "\"") out += "\\\"";
            else if (c === "\\") out += "\\\\";
            else if (c === "\n") out += "\\n";
            else if (c === "\r") out += "\\r";
            else if (c === "\t") out += "\\t";
            else if (code < 0x20 || code > 0x7e) {
                var hex = code.toString(16);
                while (hex.length < 4) hex = "0" + hex;
                out += "\\u" + hex;
            } else out += c;
        }
        return out + "\"";
    }

    function num(n) {
        if (!isFinite(n)) return "null";
        // Round away float noise (0.30000000000000004) without losing real precision.
        var r = Math.round(n * 1e9) / 1e9;
        return String(r);
    }

    X.stringify = function (v) {
        if (v === null || v === undefined) return "null";
        var t = typeof v;
        if (t === "number") return num(v);
        if (t === "boolean") return v ? "true" : "false";
        if (t === "string") return quote(v);
        if (t === "function") return "null";
        if (X.isArray(v)) {
            var parts = [];
            for (var i = 0; i < v.length; i++) parts.push(X.stringify(v[i]));
            return "[" + parts.join(",") + "]";
        }
        var items = [];
        for (var k in v) {
            if (!v.hasOwnProperty(k)) continue;
            var val = v[k];
            if (val === undefined || typeof val === "function") continue;
            items.push(quote(k) + ":" + X.stringify(val));
        }
        return "{" + items.join(",") + "}";
    };

    // Write text to a file as UTF-8 (After Effects needs "Allow Scripts to Write Files").
    X.writeFile = function (path, text) {
        var f = new File(path);
        f.encoding = "UTF-8";
        if (!f.open("w")) throw new Error("Can't write " + path + ": " + f.error);
        f.write(text);
        f.close();
    };
})(AEEC);
