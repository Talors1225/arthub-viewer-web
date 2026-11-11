// Reviewed scene anchors. The original models and render order are unchanged.
// These two scenes contain oversized opaque surrounds outside their artwork.
const rules = {
 yunlong_3: { anchors:['yc2_bj'], surrounds:['kkkkk','kkkkk2','kkkkk3','kkkkk4'] },
 guanghui_9: { anchors:['ArtMesh292'], surrounds:['ArtMesh545','ArtMesh546','ArtMesh416','ArtMesh518','ArtMesh519','ArtMesh977','ArtMesh978','ArtMesh979','ArtMesh980'] },
};
export const portraitSurroundNames=id=>new Set(rules[id]?.surrounds||[]);
const frame = (minX, minY, maxX, maxY) => Object.freeze({ minX, minY, maxX, maxY });
// Match the scene inside the outer matte. Live2D uses a top-left origin.
const live2dFrames = new Map([
 ['anninvwang_2', frame(-100, 220, 8160, 5060)],
 ['guanghui_9', frame(-5050, -3100, 15070, 10385)],
 ['wuqi_3', frame(370, 185, 9240, 5300)],
]);
const live2dIdleFrames = new Map([
 ['aogusite_4', frame(39, 34, 9972, 5719)],
 ['baerdimo_6', frame(-818, -595, 8801, 8571)],
 ['dafeng_6', frame(-1900, 925, 9280, 7070)], // Inside the beach scene's picture frame.
 ['dafeng_7', frame(-600, -2710, 15600, 12710)], // Matches the library cover's framing.
 ['gaoxiong_7', frame(931, 143, 9157, 5868)],
 ['gezi_2', frame(430, 866, 10721, 6385)],
 ['kebensi_2', frame(38, 33, 11651, 6586)],
 ['liekexingdunii_2', frame(203, 69, 13872, 7970)],
 ['lisailiu_2', frame(-505, 159, 9283, 9081)],
 ['mingji_2', frame(36, 95, 8963, 5313)],
 ['ougen_8', frame(-13, 6, 8676, 5391)],
 ['pulimaosi_3', frame(27, 31, 7965, 4736)],
 ['qiershazhi_2', frame(-3798, -907, 11880, 9978)],
 ['sebao_2', frame(208, 56, 13932, 7841)],
 ['shi_2', frame(-264, 266, 12467, 6675)],
 ['shi_3', frame(1, 25, 10514, 8659)],
 ['u2501_2', frame(602, 336, 9571, 5366)],
 ['wuzang_4', frame(46, 19, 9943, 5662)],
 ['xingdengbao_3', frame(-1, 10, 8002, 4544)],
 ['yuanchou_3', frame(445, 416, 7964, 5064)],
 ['z13_2', frame(-211, 121, 10268, 6584)],
]);
const live2dIdleExportFrames = new Map([
 ['jinshi_2', frame(66, 72, 7925, 5480)], // The scene inside the surrounding fog.
]);
const spineFrames = new Map([
 ['aimudeng_5', frame(-2341, -1400, 2384, 1398)],
 ['aluomangshi_2', frame(-3267, -47, 3267, 3659)],
 ['antu_3', frame(-2983, -2536, 3157, 1320)],
 ['haichou_2', frame(-937, 11, 941, 1106)],
 ['hu_2', frame(-1195, -643, 1055, 725)],
 ['maoxianhao_2', frame(-3026, -42, 3048, 3489)],
 ['suweiaitongmeng_4', frame(-2560, -55, 2570, 2920)],
 ['weikesibao_3', frame(-1104, -889, 1427, 542)],
 ['yunlong_3', frame(-2126, -356, 2133, 2312)],
]);
// These three ASMR versions use the same scene coordinates as the base skins.
for (const id of ['aimudeng_5', 'haichou_2', 'hu_2']) spineFrames.set(id + '_asmr', spineFrames.get(id));
export const authoredLive2DFrame = (id, motion) =>
 live2dFrames.get(id) || (motion === 'idle' && live2dIdleFrames.get(id)) || null;
export const authoredLive2DExportFrame = (id, motion) =>
 (motion === 'idle' && live2dIdleExportFrames.get(id)) || authoredLive2DFrame(id, motion);
export const authoredSpineFrame = id => spineFrames.get(id) || null;
export function portraitFrameBounds(id, rectangles) {
 const rule=rules[id];if(!rule)return null;
 const valid=rectangles.filter(r=>r.visible!==false&&r.bounds?.length===4&&r.bounds.every(Number.isFinite)&&r.bounds[2]>r.bounds[0]&&r.bounds[3]>r.bounds[1]);
 const anchors=valid.filter(r=>rule.anchors.includes(r.name));
 const selected=anchors.length?anchors:valid.filter(r=>!rule.surrounds.includes(r.name));
 if(!selected.length)return null;
 return {minX:Math.min(...selected.map(r=>r.bounds[0])),minY:Math.min(...selected.map(r=>r.bounds[1])),maxX:Math.max(...selected.map(r=>r.bounds[2])),maxY:Math.max(...selected.map(r=>r.bounds[3]))};
}
export function spinePortraitFrameBounds(id,layers,ns,hidden=new Set()) {
 if(!rules[id])return null;
 const rectangles=[];
 layers.forEach((layer,index)=>{for(const slot of layer.skeleton.drawOrder){
  const a=slot.attachment;if(!a||!slot.bone.active||slot.color.a<=.001||a.color?.a<=.001||layer.skeleton.color?.a<=.001||hidden.has(index+':'+slot.data.name))continue;
  let vertices;if(a instanceof ns.RegionAttachment){vertices=new Float32Array(8);a.computeWorldVertices('sequence' in a?slot:slot.bone,vertices,0,2);}else if(a instanceof ns.MeshAttachment){vertices=new Float32Array(a.worldVerticesLength);a.computeWorldVertices(slot,0,vertices.length,vertices,0,2);}else continue;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(let i=0;i<vertices.length;i+=2){minX=Math.min(minX,vertices[i]);maxX=Math.max(maxX,vertices[i]);minY=Math.min(minY,vertices[i+1]);maxY=Math.max(maxY,vertices[i+1]);}
  rectangles.push({name:slot.data.name,bounds:[minX,minY,maxX,maxY]});
 }});return portraitFrameBounds(id,rectangles);
}
