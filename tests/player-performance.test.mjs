import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Vector3, PerspectiveCamera, Scene, Group, Color } from 'three';

// Bundle the browser modules for Node; exercise their real methods without WebGL.
const directory = await mkdtemp(join(tmpdir(), 'dialomic-tests-'));
let Panel, ThreeScene, SpeechBubbleLayout, PlayerPerformanceHud;
try {
    const outfile = join(directory, 'runtime.mjs');
    await build({
        stdin: {
            contents: "export { Panel, ThreeScene } from './src/panel.js'; export { SpeechBubbleLayout } from './src/speechBubbles.js'; export { PlayerPerformanceHud } from './src/playerPerformance.js';",
            resolveDir: fileURLToPath(new URL('..', import.meta.url)),
        },
        bundle: true, format: 'esm', platform: 'node', outfile,
    });
    ({ Panel, ThreeScene, SpeechBubbleLayout, PlayerPerformanceHud } = await import(pathToFileURL(outfile)));
} finally {
    await rm(directory, { recursive: true, force: true });
}

globalThis.window = { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1.5 };
globalThis.document = { hidden: false };

test('phone diagnostics count frames and report completion separately from frame work', () => {
    const hud = Object.create(PlayerPerformanceHud.prototype);
    Object.assign(hud, { panels: new WeakMap(), peakWorkMs: 0, lastPaint: -Infinity, el: {} });
    const panel = { isUpdating: true };
    const transition = { startTime: performance.now() - 350 };
    hud.recordPanel(panel, transition, 350);
    panel.isUpdating = false;
    hud.recordPanel(panel, transition, 350);
    hud.recordFrame(performance.now());
    assert.match(hud.el.textContent, /elapsed-v2/);
    assert.match(hud.el.textContent, /350ms target · 2 frames/);
    assert.match(hud.el.textContent, /player work/);
});

function makePanel() {
    const panel = Object.create(Panel.prototype);
    const from = { left: 100, top: 200, width: 360, height: 150 };
    Object.assign(panel, {
        data: { ...from }, target: { left: 200, top: 300, width: 900, height: 400 },
        transition: { from, startTime: 0 },
        movingToTarget: { left: true, top: true, width: true, height: true },
        isUpdating: true, onScreen: true, isAnimatingOut: false,
        textType: 'dialogue', baseSize: { width: 360, height: 150 },
        baseFontSize: 16.8, baseLineHeight: 20.16, speechEls: [], linked: -1,
        canvas: { style: {} }, textEl: { style: {} }, narrationEl: { style: {} },
        three: { resize() {} },
    });
    return panel;
}

test('panel position and completion depend on elapsed time at 10–144 fps', () => {
    for (const fps of [10, 15, 30, 60, 144]) {
        const panel = makePanel();
        for (let time = 0; time < 175; time += 1000 / fps) panel.moveToTarget(time);
        panel.moveToTarget(175);
        assert.equal(panel.data.left, 187.5);
        assert.equal(panel.data.width, 832.5);
        assert.equal(panel.isUpdating, true);
        panel.moveToTarget(350);
        assert.deepEqual(panel.data, panel.target);
        assert.equal(panel.isUpdating, false);
    }
});

test('exit timing and a stalled frame still reach the exact target', () => {
    const panel = makePanel();
    panel.isAnimatingOut = true;
    panel.moveToTarget(350);
    assert.equal(panel.isUpdating, true);
    panel.moveToTarget(500);
    assert.deepEqual(panel.data, panel.target);
    const stalled = makePanel();
    stalled.moveToTarget(2000);
    assert.deepEqual(stalled.data, stalled.target);
    assert.equal(stalled.isUpdating, false);
});

test('retargeting starts from the current position without a jump', () => {
    const panel = makePanel();
    panel.moveToTarget(175);
    const from = { ...panel.data };
    panel.topInset = 0;
    panel.updateNarrationTarget = () => {};
    panel.startUpdates = () => {};
    panel.setTarget({ left: 500, top: 500, width: 400, height: 200 });
    panel.moveToTarget(panel.transition.startTime);
    assert.deepEqual(panel.data, from);
    panel.moveToTarget(panel.transition.startTime + 350);
    assert.deepEqual(panel.data, panel.target);
});

test('mouse tilt smoothing is consistent at 15 and 60 fps', () => {
    const positions = [];
    for (const fps of [15, 60]) {
        const scene = Object.create(ThreeScene.prototype);
        Object.assign(scene, {
            mouseTilt: { x: 0, y: 0, maxYaw: 0.1, maxPitch: 0.08 },
            mouseTiltTarget: { x: 1, y: -1 }, mouseTiltLerp: 0.12,
            cameraBasePos: new Vector3(0, 0, 9), cameraBaseLookTarget: new Vector3(0, 0, 0),
            camera: { lookAt() {} },
        });
        for (let frame = 0; frame < fps; frame++) scene.applyMouseTilt(1000 / fps);
        positions.push(scene.mouseTilt.x);
    }
    assert.ok(Math.abs(positions[0] - positions[1]) < 1e-12);
});

test('a panel returning from above the viewport stays active during entry', () => {
    const panel = makePanel();
    panel.data.top = -400;
    panel.transition.from.top = -400;
    panel.moveToTarget(1);
    assert.equal(panel.onScreen, true);
    assert.equal(panel.isUpdating, true);
});

function makeScene() {
    const calls = [];
    const scene = Object.create(ThreeScene.prototype);
    Object.assign(scene, {
        disposed: false, renderingEnabled: true, externallyDriven: false, lastTime: 0,
        renderWidth: 360, renderHeight: 150, repulsion: { enabled: false },
        logicalRenderSize: { width: 360, height: 150 },
        mouseTiltReady: false, editorEnabled: false, scene: new Scene(),
        camera: new PerspectiveCamera(25, 2.4, 0.03, 500),
        updateSpeakerHop() {},
        renderer: {
            getPixelRatio() { return this.pixelRatio ?? 1.5; },
            setPixelRatio(value) { this.pixelRatio = value; calls.push(['pixelRatio', value]); },
            setAnimationLoop(callback) { calls.push(['loop', callback]); },
            setSize(...args) { calls.push(['resize', ...args]); },
            render() { calls.push(['render']); },
        },
    });
    return { scene, calls };
}

test('multiple layout sizes produce just one final buffer resize per frame', () => {
    const { scene, calls } = makeScene();
    scene.resize(500.2, 200.2);
    scene.resize(600.2, 250.2);
    assert.equal(calls.length, 0);
    scene.animate(16);
    assert.deepEqual(calls, [['resize', 600, 250, false], ['render']]);
    calls.length = 0;
    scene.resize(600.3, 250.3);
    scene.animate(32);
    assert.deepEqual(calls, [['render']]);
});

test('transition drawing buffers stay fixed while camera aspect follows CSS size', () => {
    const { scene, calls } = makeScene();
    scene.setTransitionRenderSize({ width: 900, height: 400 });
    scene.resize(400, 200);
    scene.animate(16);
    assert.equal(scene.camera.aspect, 2);
    scene.resize(600, 300);
    scene.animate(32);
    scene.resize(800, 350);
    scene.animate(48);
    assert.deepEqual(calls.filter(([name]) => name === 'resize'), [['resize', 900, 400, false]]);
    scene.setTransitionRenderSize(null);
    scene.animate(64);
    assert.deepEqual(calls.filter(([name]) => name === 'resize').at(-1), ['resize', 800, 350, false]);
});

test('player releases the transition buffer at completion', () => {
    const panel = makePanel();
    const { scene, calls } = makeScene();
    scene.setExternallyDriven();
    panel.three = scene;
    panel.positionSpeechBubbles = () => {};
    panel.update(100);
    assert.deepEqual(scene.transitionRenderSize, { width: 900, height: 400 });
    panel.update(200);
    panel.update(350);
    assert.equal(scene.transitionRenderSize, null);
    assert.equal(panel.isUpdating, false);
    assert.equal(calls.filter(([name]) => name === 'resize').length, 1);
});

test('player-owned scenes never start independent renderer loops', () => {
    const { scene, calls } = makeScene();
    scene.setExternallyDriven();
    scene.setRenderingEnabled(false);
    scene.animate(16);
    scene.setRenderingEnabled(true);
    assert.deepEqual(calls, [['loop', null], ['loop', null], ['loop', null]]);
    scene.animate(32);
    assert.deepEqual(calls.at(-1), ['render']);
    scene.setExternallyDriven(false);
    assert.equal(calls.at(-1)[1], scene.animate);
});

test('an idle player skips GPU draws and redraws when scene/camera/loading changes', () => {
    const { scene, calls } = makeScene();
    scene.setExternallyDriven();
    calls.length = 0;
    assert.equal(scene.animate(0), true);
    assert.equal(scene.animate(16), false);
    const model = new Group();
    scene.scene.add(model); // asynchronous model arrival
    assert.equal(scene.animate(32), true);
    assert.equal(scene.animate(48), false);
    model.position.y = 0.5; // speaker hop
    assert.equal(scene.animate(64), true);
    scene.camera.position.x = 1;
    assert.equal(scene.animate(80), true);
    scene.scene.background = new Color('red');
    assert.equal(scene.animate(96), true);
    scene.scene.remove(model);
    assert.equal(scene.animate(112), true);
    scene.resize(720, 300); // same aspect, different buffer size
    assert.equal(scene.animate(128), true);
    assert.equal(scene.animate(144), false);
    assert.equal(calls.filter(([name]) => name === 'render').length, 7);
});

test('player/editor mode switches preserve native resolution on touch-first displays', () => {
    const { scene } = makeScene();
    const previousRatio = window.devicePixelRatio;
    window.devicePixelRatio = 3;
    scene.renderer.pixelRatio = 3;
    window.matchMedia = () => ({ matches: true });
    try {
        scene.setExternallyDriven();
        assert.equal(scene.renderer.getPixelRatio(), 3);
        scene.setExternallyDriven(false);
        assert.equal(scene.renderer.getPixelRatio(), 3);
    } finally {
        window.devicePixelRatio = previousRatio;
        delete window.matchMedia;
    }
});

test('static speech is bounded at 30Hz while moving scenes update every frame', () => {
    const panel = makePanel();
    let layouts = 0;
    panel.isUpdating = false;
    panel.three = { externallyDriven: true, animate: () => false };
    panel.positionSpeechBubbles = () => layouts++;
    panel.update(0);
    panel.update(16);
    assert.equal(layouts, 1);
    panel.update(34);
    assert.equal(layouts, 2);
    panel.three.animate = () => true;
    panel.update(40);
    panel.update(48);
    assert.equal(layouts, 4);
});

test('player rendering runs before bubble projection and skips hidden panels', () => {
    const panel = makePanel();
    const calls = [];
    panel.isUpdating = false;
    panel.three = { externallyDriven: true, animate: () => calls.push('render') };
    panel.positionSpeechBubbles = () => calls.push('bubbles');
    panel.update(16);
    assert.deepEqual(calls, ['render', 'bubbles']);
    panel.onScreen = false;
    calls.length = 0;
    panel.update(32);
    assert.deepEqual(calls, []);
});

test('shared geometry, materials and textures are disposed once', () => {
    const counts = { geometry: 0, material: 0, texture: 0 };
    const texture = { isTexture: true, dispose: () => counts.texture++ };
    const material = { map: texture, emissiveMap: texture, dispose: () => counts.material++ };
    const geometry = { dispose: () => counts.geometry++ };
    const root = { traverse(callback) {
        callback({ geometry, material });
        callback({ geometry, material: [material] });
    } };
    ThreeScene.prototype.disposeModelResources(root);
    assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 });
});

test('unchanged speech keeps cached layout state and avoids debug DOM work', () => {
    const layout = new SpeechBubbleLayout({});
    const el = {};
    layout.sync([el], [{ speaker: 'cat' }]);
    const item = layout.items[0];
    item.widthDirty = true;
    layout.sync([el], [{ speaker: 'cat' }]);
    assert.equal(layout.items[0], item);
    assert.equal(item.widthDirty, true);
    layout.ensureDebugTargetEl = () => { throw new Error('debug DOM should be skipped'); };
    layout.updateDebugTarget(item, 0, 0, 10);
});

test('speaker bounds are shared within a layout pass and refreshed next pass', () => {
    let traversals = 0;
    const layout = new SpeechBubbleLayout({ three: {
        getModelBoundsByKey() { return { version: ++traversals }; },
    } });
    layout.items = [{}];
    layout.layoutBubbles = () => {
        assert.equal(layout.getSpeakerBounds('cat'), layout.getSpeakerBounds('cat'));
    };
    layout.layout();
    assert.equal(traversals, 1);
    layout.layout();
    assert.equal(traversals, 2);
    assert.equal(layout.frameBounds, null);
});
