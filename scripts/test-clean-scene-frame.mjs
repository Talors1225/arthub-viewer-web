import assert from 'node:assert/strict';
import {
 authoredLive2DFrame as stage, authoredLive2DExportFrame as output,
 authoredLive2DInterfaceCovers, authoredLive2DExportHidden, authoredLive2DExportWindow, authoredSceneExportCrop, defaultPortraitStageFrame,
 authoredSpineFrame, authoredSpineExportFrame,
} from '../azurlane-interaction/viewer/portrait-frame.mjs';
for(const [id,names] of [['zhangwu_2',['idle','idle13','idle14','main_1']],['xinnong_6',['idle','idle2','touch_body']],['baifeng_3',['idle','idle11','touch_body']]])for(const name of names){assert(stage(id,name));assert.deepEqual(stage(id,name),output(id,name),`${id}/${name}: preview and export agree`)}
assert.notDeepEqual(stage('zhangwu_2','idle28'),stage('zhangwu_2','idle13'),'retain reviewed tilted camera');
assert.notDeepEqual(stage('baifeng_3','idle4'),stage('baifeng_3','idle11'),'retain reviewed close-up');
assert.equal(stage('unknown','idle2'),null);
for (const [id, motion] of [['guandao_3', 'idle'], ['mojiaduoer_5', 'touch_special_normal'], ['sebao_2', 'touch_idle7']]) {
 const crop = authoredSceneExportCrop(id, motion, 'video');
 assert(crop && crop.minX < crop.maxX && crop.minY < crop.maxY);
 for (const format of ['png', 'gif']) assert.deepEqual(authoredSceneExportCrop(id, motion, format), crop);
}
assert(authoredSceneExportCrop('yingrui_4', 'normal', 'video'));
assert.equal(authoredSceneExportCrop('yingrui_4', 'normal', 'png'), null);
assert.deepEqual(authoredLive2DInterfaceCovers('mojiaduoer_4'), ['ArtMesh1385', 'ArtMesh1410']);
assert.deepEqual(authoredLive2DInterfaceCovers('mojiaduoer_4'), authoredLive2DExportHidden('mojiaduoer_4', 'idle7'));
assert.deepEqual(authoredLive2DInterfaceCovers('mojiaduoer_5'), []);
assert.deepEqual(defaultPortraitStageFrame('mojiaduoer_4'), stage('mojiaduoer_4', 'idle'));
for (const motion of ['touch_drag9', 'touch_drag10']) {
 assert.deepEqual(stage('mojiaduoer_4', motion), stage('mojiaduoer_4', 'idle34'));
 assert.deepEqual(output('mojiaduoer_4', motion), stage('mojiaduoer_4', motion));
}
for (const motion of ['normal', 'touch_body', 'touch_head', 'login', 'change_out']) {
 for (const format of ['png', 'gif', 'video']) {
  assert.deepEqual(authoredSceneExportCrop('mojiaduoer_5', motion, format), defaultPortraitStageFrame('mojiaduoer_5'));
 }
}
assert.equal(authoredLive2DExportWindow('sailimiye_2', 'touch_special')?.drawable, 'ArtMesh779');
assert.equal(authoredLive2DExportWindow('tiancheng_cv_3', 'touch_idle20')?.drawable, 'MB_blackbgjuxing');
assert.equal(authoredLive2DExportWindow('tiancheng_cv_3', 'idle'), null);
assert.deepEqual(stage('daofeng_4', 'home'), output('daofeng_4', 'home'));
assert.equal(output('hailunna_4', 'wedding')?.anchor?.drawable, 'MB_blackbgjuxing');
for (const [id, motion] of [['weiyan_6', 'home'], ['edu_3', 'home'], ['pinghai_6', 'login'], ['bulaimodun_4', 'home']]) {
 const crop = output(id, motion);
 assert.deepEqual(stage(id, motion), crop);
 assert.equal(crop?.anchor?.fadeToFrame, true);
}
assert.deepEqual(authoredSpineFrame('tianjinfeng_2', 'normal'), authoredSpineExportFrame('tianjinfeng_2', 'normal'));
assert.deepEqual(authoredSpineFrame('weikesibao_2', 'ex'), authoredSceneExportCrop('weikesibao_2', 'ex', 'video'));
console.log('Scene framing inheritance and per-motion overrides passed');
