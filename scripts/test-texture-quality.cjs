'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const {TextureAtlas} = vm.runInNewContext(read('nikki/viewer/vendor/spine-webgl.js') + '\nspine;');
const model = ['base.png', 'size:192,128', 'filter:Linear,Linear', 'pma:true', 'face', 'bounds:4,5,20,24',
  '', 'fx.png', 'size:128,128', 'filter:MipMap,Linear', 'cloud', 'bounds:6,3,12,11'].join('\n');
const dimensions = {'base.png':[192,128], 'fx.png':[128,128], 'sprite.png':[96,48]};
let failOriginal = false;
const requests = [], uploads = [];
const base = 'https://arthub.test/assets/';
const gl = {
  TEXTURE_2D:1, TEXTURE_BINDING_2D:2, UNPACK_PREMULTIPLY_ALPHA_WEBGL:3, NO_ERROR:0,
  isContextLost:() => false, getError:() => 0, getParameter:() => false,
  bindTexture() {}, pixelStorei() {}, generateMipmap() {},
  texSubImage2D(...args) { uploads.push(args.at(-1).name); },
};
const K = {};
class Image {
  set src(name) {
    if (!name) return;
    this.name = name;
    [this.width,this.height] = dimensions[name];
    this.naturalWidth = this.width;
    this.naturalHeight = this.height;
    queueMicrotask(() => this.onload());
  }
}
class Texture {
  constructor(ctx,image) { this._image = image; this.texture = {}; }
  getImage() { return this._image; }
  setFilters() {}
  setWraps() {}
  dispose() { this.texture = null; }
}
class MockURL extends URL {
  static createObjectURL(blob) { return blob.name; }
  static revokeObjectURL() {}
}
const fast = name => name.endsWith('.webp');
const fetch = async url => {
  const name = new URL(url,base).pathname.split('/').at(-1);
  requests.push(name);
  const ok = !(failOriginal && name === 'fx.png');
  return {ok, status:ok ? 200 : 503, text:async()=>model, arrayBuffer:async()=>new ArrayBuffer(0),
    blob:async()=>({name: fast(name) ? name.slice(0,-5) : name})};
};
async function createImageBitmap(input, options) {
  const [width,height] = dimensions[input.name];
  return {width,height,name:input.name,alpha:options.premultiplyAlpha,closed:false,close(){this.closed=true;}};
}
vm.runInNewContext(read('common/asset-loader.js'), {
  window:{SpineKit:K}, location:{href:base}, navigator:{connection:{saveData:true}},
  fetch, URL:MockURL, Image, createImageBitmap, AbortController, DOMException, setTimeout, clearTimeout,
});
const SP = {TextureAtlas, GLTexture:Texture};
K.texturePreviewFor = async url => {
  const name = new URL(url,base).pathname.split('/').at(-1);
  const [width,height] = dimensions[name];
  return {width,height,pma:name==='base.png',url:url+'.webp'};
};
(async () => {
  const {atlas} = await K.loadSpineFiles(SP,{gl},{atlasURL:base+'test.atlas',skeletonURL:base+'test.skel',progressiveTexture:true});
  assert.deepEqual(requests.slice().sort(), ['base.png', 'fx.png', 'test.atlas', 'test.skel']);
  assert.deepEqual(Array.from(atlas.pages, page => page.texture.getImage().name), ['base.png','fx.png']);
  assert.equal(uploads.length, 0);
  K.disposeAtlas(atlas);
  console.log('Original Spine textures are requested once per page without any progressive transfer.');
})().catch(error => { console.error(error); process.exitCode=1; });
