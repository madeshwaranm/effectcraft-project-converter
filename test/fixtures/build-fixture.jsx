/*
 * build-fixture.jsx: builds a test project that touches every feature the converter handles.
 * Written against the After Effects scripting model; the live tests run it in EffectCraft and save
 * the result as an .ecproj. Set FIXTURE_IMAGE to an image path (test-image.png) before running.
 * Last expression: "ok".
 */

(function () {
    var proj = app.project;

    var folder = proj.items.addFolder("Precomps");

    // ---------------------------------------------------------------- inner precomp
    var inner = proj.items.addComp("Inner", 800, 600, 1, 4, 25);
    inner.parentFolder = folder;
    inner.bgColor = [0.2, 0.1, 0.3];
    var innerBg = inner.layers.addSolid([0.1, 0.6, 0.9], "Inner BG", 800, 600, 1);
    innerBg.property("ADBE Transform Group").property("ADBE Opacity").setValue(80);
    var spin = innerBg.property("ADBE Transform Group").property("ADBE Rotate Z");
    spin.setValueAtTime(0, 0);
    spin.setValueAtTime(4, 90);

    // ---------------------------------------------------------------- main comp
    var c = proj.items.addComp("Main", 1920, 1080, 1, 6, 60);
    c.bgColor = [1, 1, 1];
    c.workAreaStart = 0.5;
    c.workAreaDuration = 4;
    c.markerProperty.setValueAtTime(2, new MarkerValue("Drop"));

    // Layers are added bottom first; each add goes on top.

    // Footage
    var img = proj.importFile(new ImportOptions(new File(FIXTURE_IMAGE)));
    var imgLayer = c.layers.add(img);
    imgLayer.name = "Image";
    imgLayer.property("ADBE Transform Group").property("ADBE Position").setValue([300, 800]);

    // Solid with keyframes, eases, an expression, effects and a mask
    var solid = c.layers.addSolid([1, 0.2, 0.2], "Red Solid", 600, 400, 1);
    var tr = solid.property("ADBE Transform Group");
    var pos = tr.property("ADBE Position");
    pos.setValueAtTime(0, [300, 300]);
    pos.setValueAtTime(1.5, [1500, 700]);
    pos.setValueAtTime(3, [960, 540]);
    pos.setInterpolationTypeAtKey(1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    pos.setInterpolationTypeAtKey(2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    pos.setTemporalEaseAtKey(1, [new KeyframeEase(0, 33.333)], [new KeyframeEase(0, 75)]);
    pos.setTemporalEaseAtKey(2, [new KeyframeEase(0, 80)], [new KeyframeEase(0, 40)]);
    pos.setSpatialTangentsAtKey(2, [-200, 0], [200, 0]);
    pos.setInterpolationTypeAtKey(3, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
    var sc = tr.property("ADBE Scale");
    sc.setValueAtTime(0, [50, 50, 100]);
    sc.setValueAtTime(2, [120, 100, 100]);
    sc.setInterpolationTypeAtKey(1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    sc.setInterpolationTypeAtKey(2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    sc.setTemporalEaseAtKey(1, [new KeyframeEase(0, 33), new KeyframeEase(0, 33), new KeyframeEase(0, 33)],
        [new KeyframeEase(0, 66), new KeyframeEase(0, 50), new KeyframeEase(0, 50)]);
    tr.property("ADBE Rotate Z").expression = "wiggle(2, 15)";
    solid.blendingMode = BlendingMode.SCREEN;
    solid.label = 3;
    solid.comment = "keyed solid";
    var fxs = solid.property("ADBE Effect Parade");
    var blur = fxs.addProperty("ADBE Gaussian Blur 2");
    blur.property(1).setValue(14);
    var glow = fxs.addProperty("ADBE Glo2");
    glow.name = "My Glow";
    glow.enabled = false;
    var mk = solid.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    var ms = new Shape();
    ms.vertices = [[0, 0], [600, 0], [600, 400], [0, 400]];
    ms.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
    ms.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
    ms.closed = true;
    mk.property("ADBE Mask Shape").setValue(ms);
    mk.property("ADBE Mask Feather").setValue([20, 20]);
    mk.property("ADBE Mask Offset").setValue(-10);
    mk.maskMode = MaskMode.SUBTRACT;
    mk.inverted = true;
    mk.name = "Cutout";

    // Shape layer used as the solid's luma matte (sits directly above it)
    var matte = c.layers.addShape();
    matte.name = "Solid matte";
    var mg = matte.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    mg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([500, 500]);
    mg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    solid.trackMatteType = TrackMatteType.LUMA;

    // Precomp layer, 3D, offset in time
    var pre = c.layers.add(inner);
    pre.name = "Inner precomp";
    pre.startTime = 0.5;
    pre.threeDLayer = true;
    pre.property("ADBE Transform Group").property("ADBE Rotate Y").setValue(25);
    var preOp = pre.property("ADBE Transform Group").property("ADBE Opacity");
    preOp.setValueAtTime(1, 0);
    preOp.setValueAtTime(2, 100);

    // Shape layer: rounded rectangle, fill, stroke, trim paths, keyed path
    var shape = c.layers.addShape();
    shape.name = "Card";
    var grp = shape.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    grp.name = "Card group";
    var contents = grp.property("ADBE Vectors Group");
    var rect = contents.addProperty("ADBE Vector Shape - Rect");
    rect.property("ADBE Vector Rect Size").setValue([400, 240]);
    rect.property("ADBE Vector Rect Roundness").setValue(36);
    var fill = contents.addProperty("ADBE Vector Graphic - Fill");
    fill.property("ADBE Vector Fill Color").setValue([0.2, 0.4, 1, 1]);
    var stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
    stroke.property("ADBE Vector Stroke Width").setValue(6);
    stroke.property("ADBE Vector Stroke Color").setValue([0, 0, 0, 1]);
    var trim = shape.property("ADBE Root Vectors Group").addProperty("ADBE Vector Filter - Trim");
    trim.property("ADBE Vector Trim End").setValueAtTime(0, 0);
    trim.property("ADBE Vector Trim End").setValueAtTime(1, 100);
    var pathGroup = shape.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    pathGroup.name = "Wave";
    var pathProp = pathGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape");
    var s1 = new Shape();
    s1.vertices = [[-100, 0], [0, -50], [100, 0]];
    s1.inTangents = [[0, 0], [-40, 0], [0, 0]];
    s1.outTangents = [[0, 0], [40, 0], [0, 0]];
    s1.closed = false;
    var s2 = new Shape();
    s2.vertices = [[-100, 0], [0, 50], [100, 0]];
    s2.inTangents = [[0, 0], [-40, 0], [0, 0]];
    s2.outTangents = [[0, 0], [40, 0], [0, 0]];
    s2.closed = false;
    pathProp.setValueAtTime(0, s1);
    pathProp.setValueAtTime(2, s2);
    pathGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
    shape.property("ADBE Transform Group").property("ADBE Position").setValue([960, 300]);

    // Text layer with an animator
    var text = c.layers.addText("Hello EffectCraft");
    var st = text.property("ADBE Text Properties").property("ADBE Text Document");
    var td = st.value;
    td.fontSize = 72;
    td.fillColor = [0.1, 0.1, 0.1];
    td.tracking = 25;
    td.justification = ParagraphJustification.CENTER_JUSTIFY;
    st.setValue(td);
    var anim = text.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
    anim.name = "Fade up";
    anim.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity").setValue(0);
    anim.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
    text.property("ADBE Transform Group").property("ADBE Position").setValue([960, 900]);

    // Null parent with a child that uses separated dimensions
    var ctrl = c.layers.addNull();
    ctrl.name = "Controller";
    ctrl.property("ADBE Transform Group").property("ADBE Position").setValue([960, 540]);
    var child = c.layers.addSolid([0.2, 0.8, 0.3], "Child", 100, 100, 1);
    child.parent = ctrl;
    var cpos = child.property("ADBE Transform Group").property("ADBE Position");
    cpos.dimensionsSeparated = true;
    var px = child.property("ADBE Transform Group").property("ADBE Position_0");
    px.setValueAtTime(0, -200);
    px.setValueAtTime(2, 200);
    child.property("ADBE Transform Group").property("ADBE Position_1").setValue(100);
    child.shy = true;
    child.property("ADBE Marker").setValueAtTime(1, new MarkerValue("Hit"));

    // Adjustment layer with an effect
    var adj = c.layers.addSolid([1, 1, 1], "Grade", 1920, 1080, 1);
    adj.adjustmentLayer = true;
    adj.property("ADBE Effect Parade").addProperty("ADBE Fill");

    // Camera and light
    var cam = c.layers.addCamera("Camera 1", [960, 540]);
    cam.property("ADBE Camera Options Group").property("ADBE Camera Zoom").setValue(1500);
    var light = c.layers.addLight("Key light", [960, 540]);
    light.lightType = LightType.SPOT;
    light.property("ADBE Light Options Group").property("ADBE Light Intensity").setValue(150);

    // Drop shadow on the card, a gradient-filled shape, and paragraph text
    var ds = shape.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
    ds.property("ADBE Drop Shadow-0002").setValue(60);
    ds.property("ADBE Drop Shadow-0004").setValue(12);
    ds.property("ADBE Drop Shadow-0005").setValue(30);
    var blob = c.layers.addShape();
    blob.property("ADBE Root Vectors Group").addProperty("ADBE Vector Filter - Repeater");
    blob.name = "Gradient blob";
    var bg2 = blob.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    bg2.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([300, 300]);
    var gf = bg2.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - G-Fill");
    gf.property("Type").setValue(2); // EffectCraft 0.8.0 only knows this one by name
    blob.property("ADBE Transform Group").property("ADBE Position").setValue([1500, 300]);
    var para = c.layers.addBoxText([600, 200], "A longer paragraph of text that wraps inside its box.");
    para.name = "Paragraph";
    para.property("ADBE Transform Group").property("ADBE Position").setValue([1400, 800]);

    // A guide layer that's switched off and locked
    var guide = c.layers.addSolid([0, 0, 0], "Guide", 200, 200, 1);
    guide.guideLayer = true;
    guide.enabled = false;
    guide.locked = true;

    return "ok";
})();
