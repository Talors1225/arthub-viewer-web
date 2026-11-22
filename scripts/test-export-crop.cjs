'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the production pixel detector without requiring a GPU or a game asset.
const source = fs.readFileSync(path.join(__dirname, '../common/kit.js'), 'utf8');
const start = source.indexOf('  K.illustrationPixelBounds =');
const end = source.indexOf('  K.canvasIllustrationBounds =', start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({ K: { framing: { original: false } } });
vm.runInContext(source.slice(start, end), context);
const width = 640, height = 320;
const image = () => new Uint8ClampedArray(width * height * 4);
function fill(rgba, x, y, w, h, color) {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) rgba.set(color, (py * width + px) * 4);
  return rgba;
}
const detect = rgba => JSON.parse(JSON.stringify(context.K.illustrationPixelBounds(rgba, width, height)));
const full = { x: 0, y: 0, width, height };

// A local Live2D source places the illustration high and left inside a huge
// opaque curtain. Equal margins are not a property of the artwork.
const offCenter = fill(image(), 0, 0, width, height, [0, 0, 0, 255]);
fill(offCenter, 185, 35, 135, 80, [100, 140, 180, 255]);
assert.deepEqual(detect(offCenter), { x: 184, y: 34, width: 137, height: 82 });

const centered = fill(image(), 0, 0, width, height, [12, 11, 10, 255]);
fill(centered, 160, 80, 320, 160, [90, 110, 130, 255]);
assert.deepEqual(detect(centered), { x: 159, y: 79, width: 322, height: 162 });

// Preserve legitimate dark art, full-frame scenes and nonuniform backgrounds.
assert.deepEqual(detect(fill(image(), 0, 0, width, height, [0, 0, 0, 255])), full);
const gradient = image();
for (let x = 0; x < width; x++) fill(gradient, x, 0, 1, height, [Math.round(x * 60 / width), 0, 0, 255]);
fill(gradient, 185, 35, 135, 80, [100, 140, 180, 255]);
assert.deepEqual(detect(gradient), full);
const edgeArt = fill(image(), 0, 0, width, height, [0, 0, 0, 255]);
fill(edgeArt, 185, 0, 135, 115, [100, 140, 180, 255]);
assert.deepEqual(detect(edgeArt), full);

// Transparent margins and isolated particles still use the character bounds.
const transparent = fill(image(), 200, 40, 200, 240, [100, 140, 180, 255]);
fill(transparent, 10, 10, 2, 2, [255, 255, 255, 255]);
assert.deepEqual(detect(transparent), { x: 199, y: 39, width: 202, height: 242 });
assert.throws(() => detect(image()), /没有可导出的可见立绘/);
const framingStart = source.indexOf('  function illustrationBoundsInReference(');
const framingEnd = source.indexOf('  K.illustrationExportSize =', framingStart);
assert.ok(framingStart > end && framingEnd > framingStart);
vm.runInContext(source.slice(framingStart, framingEnd), context);
context.K.canvasIllustrationBounds = detect;
context.K.exportDimensions = bounds => JSON.parse(JSON.stringify(bounds));
const reference = { width, height, scale: 1, centerX: 0, centerY: 0 };
const sparkle = fill(image(), 25, 30, 12, 16, [100, 140, 180, 255]);
const delayed = time => {
  if (time < 1) return image();
  if (time < 5) return sparkle;
  return fill(image(), time < 8 ? 200 : 240, 65, 220, 150, [110, 120, 130, 255]);
};
assert.deepEqual(context.K.animationFramingSize(reference, 12, 'medium', 'video', delayed),
  { minX: -121, minY: -56, maxX: 141, maxY: 96 });
assert.equal(context.K.animationFramingSize(reference, 12, 'medium', 'video', image), null);
const brief = time => time === 3.125 ? centered : image();
assert.deepEqual(context.K.animationFramingSize(reference, 12, 'medium', 'video', brief, 3.125),
  { minX: -161, minY: -81, maxX: 161, maxY: 81 });
assert.deepEqual(context.K.animationFramingSize(reference, 12, 'medium', 'video', () => centered),
  { minX: -161, minY: -81, maxX: 161, maxY: 81 });
context.K.framing.original = true;
const uncropped = { minX: -320, minY: -160, maxX: 320, maxY: 160, fullFrame: true };
assert.deepEqual(JSON.parse(JSON.stringify(context.K.animationFramingSize(reference, 12, 'medium', 'video', delayed))),
  { ...uncropped, tiled: false });
assert.deepEqual(JSON.parse(JSON.stringify(context.K.refineIllustrationSize(reference, centered, 'medium'))),
  { ...uncropped, tiled: true });
for (const entry of ['crosscore/viewer/cutscene.html', 'crosscore-interaction/viewer/index.html']) {
  const page = fs.readFileSync(path.join(__dirname, '..', entry), 'utf8');
  const mode = page.match(/<html\b[^>]*\bdata-framing="([^"]+)"/)?.[1];
  assert.equal(mode, undefined, entry);
  const listeners = {};
  const location = new URL('https://arthub.test/' + entry);
  const window = {
    document: { documentElement: { dataset: { framing: mode } } },
    location,
    history: { replaceState: (_state, _title, url) => { location.href = String(url); } },
    addEventListener: (name, fn) => { listeners[name] = fn; },
  };
  const api = { K: {}, window, URL, URLSearchParams };
  const framing = source.slice(source.indexOf('  const originalOnly'), source.indexOf('  const uiIconPaths'));
  vm.runInNewContext(framing, api);
  assert.equal(api.K.framing.original, false, entry);
  const toggle = api.K.framing.menuItem();
  assert.equal(toggle.checked, false, entry);
  toggle.fn();
  assert.equal(api.K.framing.original, true, entry);
  assert.equal(location.searchParams.get('framing'), 'original', entry);
  api.K.framing.menuItem().fn();
  assert.equal(api.K.framing.original, false, entry);
  assert.equal(location.search, '', entry);
  location.search = '?framing=original';
  listeners.popstate();
  assert.equal(api.K.framing.original, true, entry);
}
// Justia's winter backdrop is a 480,000-unit plane around a 3,840-unit scene.
const bd2Page = fs.readFileSync(path.join(__dirname, '../bd2/viewer/cutscene.html'), 'utf8');
const nativeScenes = JSON.parse(fs.readFileSync(path.join(__dirname, '../bd2/background-scenes.json'), 'utf8'));
const native = nativeScenes['000201'].frames.loop_2;
const crop = { minX: -1500, minY: -1600, maxX: 1500, maxY: 1500 };
const originalWorld = { minX: -240000, minY: -240000, maxX: 240000, maxY: 240000 };
const shot = { K: { framing: { original: true } }, cut: { bounds: originalWorld,
  originalScene: { nativeFrames: { loop_2: native }, frames: { loop_2: crop } },
  sourceVariant: { cameraFrames: { loop_2: crop } } } };
const functions = bd2Page.slice(bd2Page.indexOf('  function nativeBackdropFrame('), bd2Page.indexOf('  function pngPose('));
vm.runInNewContext(functions, shot);
assert.equal(shot.artworkExportFrame('loop_2'), native);
assert.equal(shot.artworkExportFrame('absent'), undefined);
shot.cut.bounds = native;
assert.equal(shot.artworkExportFrame('loop_2'), undefined);
shot.K.framing.original = false;
assert.equal(shot.artworkExportFrame('loop_2'), crop);
console.log('Export crop and delayed framing checks passed');
