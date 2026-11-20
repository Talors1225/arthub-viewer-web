import assert from 'node:assert/strict';
import {
 authoredLive2DFrame as stage, authoredLive2DExportFrame as output,
 authoredLive2DInterfaceCovers, authoredLive2DScreenEdges, authoredLive2DExportHidden, authoredLive2DExportWindow, authoredSceneExportCrop, defaultPortraitStageFrame,
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
assert.deepEqual(authoredLive2DScreenEdges('guangrong_3', 'login'), ['heikuang']);
assert(!authoredLive2DExportHidden('guangrong_3', 'login').includes('heikuang'), 'keep the crop anchor available during export');
assert.deepEqual(authoredLive2DScreenEdges('bulaimodun_4', 'login'), ['mask_black_16b11']);
assert.deepEqual(authoredLive2DScreenEdges('bulaimodun_4', 'home'), [], 'preserve the animated shutter in home');
assert.deepEqual(defaultPortraitStageFrame('mojiaduoer_4'), stage('mojiaduoer_4', 'idle'));
assert.equal(stage('mojiaduoer_4', 'idle').anchor.aperture, undefined);
for (const motion of ['change_out', 'idle36', 'idle37', 'idle38', 'idle39', 'idle40', 'idle50', 'touch_idle25', 'touch_idle36', 'touch_special']) {
 const crop = stage('mojiaduoer_4', motion);
 assert.deepEqual(output('mojiaduoer_4', motion), crop);
 assert.deepEqual(crop.anchor.aperture.map(edge => edge[0]), ['ArtMesh669', 'ArtMesh672', 'ArtMesh1153', 'ArtMesh671']);
}
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
for (const [id, motion, drawable] of [
 ['masaina_2', 'touch_idle17', 'ArtMesh602'],
 ['shi_3', 'touch_idle40', 'ArtMesh3'],
 ['aersasi_2', 'touch_drag3', 'ArtMesh4'],
 ['pulimaosi_3', 'touch_drag20', 'ArtMesh349'],
 ['ougen_8', 'touch_idle25', 'ArtMesh3'],
]) {
 const crop = stage(id, motion);
 assert.equal(crop?.anchor?.drawable, drawable);
 assert.deepEqual(output(id, motion), crop);
}
assert.equal(stage('pulimaosi_3', 'touch_drag20').anchor.aperture.length, 4);
for (const motion of ['main_2', 'touch_idle29']) {
 assert.deepEqual(stage('pulimaosi_3', motion), stage('pulimaosi_3', 'touch_drag20'));
 assert.deepEqual(stage('pulimaosi_3', motion), output('pulimaosi_3', motion));
}
for (const motion of ['idle14', 'idle16']) {
 assert(stage('pulimaosi_3', motion));
 assert.deepEqual(stage('pulimaosi_3', motion), output('pulimaosi_3', motion));
}
assert.deepEqual(stage('shi_2', 'touch_drag15'), output('shi_2', 'touch_drag15'));
assert.deepEqual(stage('shi_2', 'touch_drag15').anchor.edges, stage('shi_2', 'touch_drag11').anchor.edges);
assert(stage('shi_2', 'touch_drag15').anchor.minWidth > 0);
assert.deepEqual(stage('kewei_4', 'touch_drag12'), output('kewei_4', 'idle3'));
assert.deepEqual(authoredSpineFrame('tianjinfeng_2', 'normal'), authoredSpineExportFrame('tianjinfeng_2', 'normal'));
assert.deepEqual(authoredSpineFrame('weikesibao_2', 'ex'), authoredSceneExportCrop('weikesibao_2', 'ex', 'video'));
console.log('Scene framing inheritance and per-motion overrides passed');
