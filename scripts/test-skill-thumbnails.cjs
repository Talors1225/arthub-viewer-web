'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const site = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(site, name), 'utf8'));
const urls = read('thumbs/index.json').items;
const files = new Set();

function checkSquare(file) {
  if (files.has(file)) return;
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', file);
  let width, height;
  switch (bytes.toString('ascii', 12, 16)) {
    case 'VP8 ':
      width = bytes.readUInt16LE(26) & 0x3fff;
      height = bytes.readUInt16LE(28) & 0x3fff;
      break;
    case 'VP8L': {
      const bits = bytes.readUInt32LE(21);
      width = 1 + (bits & 0x3fff);
      height = 1 + ((bits >>> 14) & 0x3fff);
      break;
    }
    case 'VP8X':
      width = 1 + bytes.readUIntLE(24, 3);
      height = 1 + bytes.readUIntLE(27, 3);
      break;
    default:
      assert.fail(file + ' has no WebP dimensions');
  }
  assert.ok(width > 1 && width === height, file + ' is ' + width + ' × ' + height);
  files.add(file);
}

for (const game of ['nikki', 'bd2']) {
  const rows = read(game + '/' + game + '_chars.json').characters;
  let variants = 0;
  for (const row of rows) {
    if (!(game === 'nikki' ? row.burst : row.resourceType === 'cutscene')) continue;
    for (const cut of row.cutscenes) {
      const key = [game, row.id, cut.variant ?? '0'].join(':');
      const src = urls[key];
      assert.ok(src, key + ' is missing its library cover');
      const file = path.resolve(site, 'thumbs', src.split('?')[0]);
      if (row.burst) {
        assert.equal(file, path.join(site, 'nikki', 'burst-covers', row.burst.key + '.webp'), key);
        assert.equal(path.basename(row.burst.cover.split('?')[0]), row.burst.key + '.webp', key);
      }
      checkSquare(file);
      variants++;
    }
  }
  assert.ok(variants > 0, game + ' has no skills to verify');
  console.log(game + ': ' + variants + ' skill entries');
}
console.log(files.size + ' square WebP covers');
