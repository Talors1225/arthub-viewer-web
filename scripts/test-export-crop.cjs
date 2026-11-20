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
const context = vm.createContext({ K: {} });
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
console.log('Export crop and delayed framing checks passed');
