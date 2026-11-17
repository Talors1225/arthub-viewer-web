import assert from 'node:assert/strict';
import {authoredLive2DFrame,authoredLive2DExportFrame,defaultPortraitStageFrame} from '../azurlane-interaction/viewer/portrait-frame.mjs';
const expected={minX:0,minY:0,maxX:9449,maxY:5570};
for(const motion of ['idle','idle1','idle18','idle38','idle50','home','login','touch_special']) {
 assert.deepEqual(authoredLive2DFrame('feiteliekaer_4',motion),expected);
 assert.deepEqual(authoredLive2DExportFrame('feiteliekaer_4',motion),expected);
}
assert.deepEqual(defaultPortraitStageFrame('feiteliekaer_4'),expected);
assert.equal(authoredLive2DFrame('unknown','idle'),null);
console.log('Karl authored canvas: browsing, animation and export agree');

for (const [id,w,h] of [['shuixinghao_2',8000,5500],['jinjiang_2',8000,4712],['suweiaitongmeng_3',19310,13260]]) { const f={minX:0,minY:0,maxX:w,maxY:h};assert.deepEqual(defaultPortraitStageFrame(id),f);for(const name of ['idle','idle2','login','touch_body'])assert.deepEqual(authoredLive2DExportFrame(id,name),f); }
