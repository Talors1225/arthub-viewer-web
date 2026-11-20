'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const vendor = fs.readFileSync(path.join(root, 'nikki/viewer/vendor/spine-webgl.js'), 'utf8');
const runtime = vm.runInNewContext(vendor + '\nspine;', {});
const atlasText = [
  'scaled.png', 'size:2048,1536', 'filter:Linear,Linear',
  'rotated', 'bounds:200,300,90,120', 'offsets:12,30,120,180', 'rotate:90',
  'upright', 'bounds:560,600,90,120', 'offsets:12,30,120,180',
  '', 'native.png', 'size:512,512', 'filter:Linear,Linear',
  'native', 'bounds:20,40,90,120', 'offsets:12,30,120,180',
].join('\n');
const images = { 'scaled.png': [1024, 1024], 'native.png': [512, 512] };
const newURL = class extends URL {
  static createObjectURL(blob) { return blob.name; }
  static revokeObjectURL() {}
};
class Image {
  set src(name) {
    if (!name) return;
    [this.naturalWidth, this.naturalHeight] = images[name];
    this.width = this.naturalWidth;
    this.height = this.naturalHeight;
    queueMicrotask(() => this.onload());
  }
}
class Texture {
  constructor(_context, image) { this.image = image; }
  getImage() { return this.image; }
  setFilters() {}
  setWraps() {}
}

const K = {};
const base = 'https://arthub.test/';
const fetch = async url => ({
  ok: true,
  text: async () => atlasText,
  arrayBuffer: async () => new ArrayBuffer(0),
  blob: async () => ({ name: new URL(url).pathname.split('/').pop() }),
});
vm.runInNewContext(fs.readFileSync(path.join(root, 'common/asset-loader.js'), 'utf8'), {
  window: { SpineKit: K }, location: { href: base }, fetch, URL: newURL, Image,
  AbortController, DOMException, setTimeout, clearTimeout,
});

(async () => {
  const { atlas } = await K.loadSpineFiles({ TextureAtlas: runtime.TextureAtlas, GLTexture: Texture }, null, {
    atlasURL: base + 'model.atlas', skeletonURL: base + 'model.skel',
  });
  const original = new runtime.TextureAtlas(atlasText);
  for (const page of original.pages) page.texture = new Texture(null, { width: page.width, height: page.height });
  for (const name of ['rotated', 'upright', 'native']) {
    const before = original.findRegion(name);
    const after = atlas.findRegion(name);
    assert.equal(after.page.texture.getImage().height, after.page.height);
    const uv = region => {
      const mesh = new runtime.MeshAttachment(name, '');
      mesh.region = region;
      mesh.regionUVs = new Float32Array([0, 0, 1, 0, .25, .75, 1, 1]);
      mesh.updateRegion();
      return mesh.uvs;
    };
    const a = uv(after), b = uv(before);
    for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-7, name + ' UV ' + i);
    assert.ok(Math.abs(after.offsetX / after.originalWidth - before.offsetX / before.originalWidth) < 1e-7);
  }
  assert.equal(atlas.findRegion('native').width, original.findRegion('native').width);
  console.log('Spine atlas scale passed for native, resampled and rotated regions');
})().catch(error => { console.error(error); process.exitCode = 1; });
