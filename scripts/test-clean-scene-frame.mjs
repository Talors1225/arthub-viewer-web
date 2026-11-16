import assert from 'node:assert/strict';
import {authoredLive2DFrame as stage, authoredLive2DExportFrame as output} from '../azurlane-interaction/viewer/portrait-frame.mjs';
for(const [id,names] of [['zhangwu_2',['idle','idle13','idle14','main_1']],['xinnong_6',['idle','idle2','touch_body']],['baifeng_3',['idle','idle11','touch_body']]])for(const name of names){assert(stage(id,name));assert.deepEqual(stage(id,name),output(id,name),`${id}/${name}: preview and export agree`)}
assert.notDeepEqual(stage('zhangwu_2','idle28'),stage('zhangwu_2','idle13'),'retain reviewed tilted camera');
assert.notDeepEqual(stage('baifeng_3','idle4'),stage('baifeng_3','idle11'),'retain reviewed close-up');
assert.equal(stage('unknown','idle2'),null);
console.log('Scene framing inheritance and per-motion overrides passed');
