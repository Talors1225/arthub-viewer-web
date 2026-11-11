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
// Bounds are in the rotated Live2D canvas for scenes with a tilted picture frame.
const rotatedFrame = (minX, minY, maxX, maxY, degrees) =>
 Object.freeze({ ...frame(minX, minY, maxX, maxY), rotation: degrees * Math.PI / 180 });
const trackDrawable = (crop, drawable, options = {}) =>
 Object.freeze({ ...crop, anchor: Object.freeze({ drawable, ...options }) });
const groupedIdleFrames = groups => new Map(groups.flatMap(([crop, numbers]) =>
 numbers.map(number => [`idle${number}`, crop])));
const poolTableFront = frame(2770, 405, 12810, 8080);
// The tiled floor moves with the overhead camera. Use it to keep that shot in frame.
const poolTableOverhead = trackDrawable(live2dIdleFrames.get('dafeng_7'), 'jiezhihuan13');
const live2dIdleVariants = new Map([
 ['anninvwang_2', groupedIdleFrames([
  [frame(-22, 255, 8000, 4820), [1, 2, 4, 7]],
  [frame(-22, 255, 8000, 4860), [3]],
  [frame(-22, 302, 7950, 4820), [6]],
  [frame(-650, -400, 8260, 6010), [8]],
 ])],
 ['dafeng_6', new Map([
  ['idle1', rotatedFrame(-7460, -3100, 21510, 12565, -13.93)],
 ])],
 ['dafeng_7', new Map([
  ['idle1', live2dIdleFrames.get('dafeng_7')],
  ['idle2', poolTableOverhead],
  ['idle3', poolTableOverhead],
  ['idle4', poolTableOverhead],
  ['idle5', poolTableOverhead],
  ['idle6', poolTableOverhead],
  ['idle7', frame(-12500, -4900, 19400, 14650)], // Room for the illuminated effect.
  ['idle8', frame(-8850, -2100, 16500, 13700)], // Include the photos on the table.
  ['idle11', frame(2640, 420, 13520, 8510)],
  ['idle12', poolTableFront],
  ['idle13', frame(2000, 160, 13710, 8780)],
  ['idle14', frame(-1320, -1170, 16660, 12320)],
  ['idle17', poolTableFront],
  ['idle18', frame(690, -1170, 15190, 8980)],
 ])],
 ['wuqi_3', groupedIdleFrames([
  [frame(-6940, -1200, 16040, 11835), [1]],
  [frame(-1635, -120, 10880, 6985), [2, 6]],
  [rotatedFrame(-15920, -10070, 25425, 13640, -53.93), [3, 7]],
  [frame(-7000, -1690, 15830, 11265), [4]],
  [frame(-5555, -1160, 14485, 10210), [5, 9, 10]],
 ])],
]);
const tiltedBathFrame = rotatedFrame(-1140, 310, 8180, 6690, 12.03);
const closeBathFrame = frame(685, 625, 7350, 4490);
const live2dIdleExportVariants = new Map([
 ['jinshi_2', new Map([
  ['idle1', live2dIdleExportFrames.get('jinshi_2')],
  ['idle2', frame(90, 135, 7935, 5475)],
  ['idle3', frame(-460, -225, 8565, 5945)],
  ['idle4', tiltedBathFrame],
  ['idle5', tiltedBathFrame],
  ['idle6', tiltedBathFrame],
  ['idle7', closeBathFrame],
  ['idle8', closeBathFrame],
  ['idle9', closeBathFrame],
  ['idle10', frame(-13310, -9420, 21360, 14285)],
  ['idle11', closeBathFrame],
  ['idle12', closeBathFrame],
  ['idle13', closeBathFrame],
  ['idle14', closeBathFrame],
  ['idle15', closeBathFrame],
  ['idle16', closeBathFrame],
  ['idle17', closeBathFrame],
  ['idle18', closeBathFrame],
  ['idle19', frame(55, 160, 7925, 5525)],
  ['idle20', closeBathFrame],
 ])],
]);
// Each group shares the same artwork window inside the surrounding matte.
const reviewedIdleExportFrames = [
 ['aersasi_2', [
  [frame(-4036, 1086, 13525, 10080), [5]],
 ]],
 ['ankeleiqi_4', [
  [frame(-2160, -1983, 12164, 7631), [12]],
  [rotatedFrame(-244, -2086, 10200, 7914, 1.91), [14]],
  [frame(-1844, -1276, 11785, 6503), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
 ]],
 ['anninvwang_2', [
  // The opaque interaction cover obscures the artwork in a standalone export.
  [Object.freeze({ ...frame(-42, 278, 8005, 4855), hiddenDrawables: ['ArtMesh893'] }), [5]],
 ]],
 ['antu_2', [
  [frame(-1499, -532, 12328, 7999), [8, 32]],
  [frame(-1285, -440, 12164, 8212), [5, 37]],
  [frame(-1258, -213, 12111, 7612), [10, 12, 21, 22, 36]],
  [frame(-1232, -55, 11283, 7488), [3, 6, 7, 35]],
  [rotatedFrame(-1350, 0, 11254, 7662, 1.24), [2]],
  [frame(-1235, -229, 12097, 8177), [4]],
  [frame(-1750, -870, 13040, 9005), [9]],
 ]],
 ['aogusite_4', [
  [frame(-80, -290, 9880, 5755), [13]],
  [frame(0, 0, 9990, 5740), [18]],
 ]],
 ['baifeng_2', [
  [rotatedFrame(-10701, -4033, 15473, 12369, 7.81), [9]],
 ]],
 ['baifeng_3', [
  [rotatedFrame(1241, 32, 7293, 4516, -0.9), [4]],
  [rotatedFrame(1278, -24, 7296, 4460, -1.61), [5]],
  [rotatedFrame(1065, 6, 7292, 4530, -0.89), [2]],
  [rotatedFrame(-1713, 254, 9284, 6547, 15.64), [23]],
 ]],
 ['baiyanjuren_4', [
  [rotatedFrame(2234, -4691, 10689, 5486, -33.11), [16, 17]],
  [rotatedFrame(864, 30, 10553, 5530, -13.76), [1]],
  [rotatedFrame(563, -144, 10801, 5735, -13.76), [2]],
 ]],
 ['beilaosenlin_2', [
  [frame(218, 150, 14064, 7719), [7, 10, 13]],
  [rotatedFrame(-12451, -12504, 25313, 8671, -34.26), [9]],
 ]],
 ['benningdun_2', [
  [frame(-1670, -985, 11155, 6305), [4, 13, 21, 33]],
  [frame(-1795, -890, 11020, 6140), [44, 45]],
  [frame(-1625, -1130, 10930, 6250), [48]],
  [frame(-1600, -925, 11085, 6270), [49]],
  [frame(-1702, -1064, 11332, 6492), [5, 9, 14, 16, 17, 22, 23, 24, 25, 37, 38, 41, 47]],
  [frame(-1783, -1874, 11412, 6587), [32]],
 ]],
 ['bunao_3', [
  [frame(52, -177, 7610, 4455), [5]],
  [frame(30, -295, 7725, 4425), [7]],
  [frame(-27, 14, 7668, 4505), [6]],
  [frame(17, 25, 7583, 7066), [4, 10, 11]],
  [frame(2, -64, 7597, 7709), [9]],
 ]],
 ['chaijun_6', [
  [frame(-1713, -1105, 11288, 6505), [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15, 23, 24, 25, 26, 27, 30, 31, 32, 35, 36, 37, 38, 41, 42, 49]],
 ]],
 ['feiteliedadi_4', [
  [rotatedFrame(-2427, -3043, 18289, 8947, -8.41), [34]],
  [rotatedFrame(-3065, -3355, 18810, 9314, -8.42), [21, 40]],
  [rotatedFrame(-8756, -4574, 24619, 14791, -9.97), [25]],
  [rotatedFrame(-2683, -4758, 19566, 8118, -20.27), [2]],
  [rotatedFrame(-2737, 199, 15959, 11032, 10.8), [3]],
  [rotatedFrame(-9549, -2136, 22556, 16475, 6.95), [17]],
  [rotatedFrame(-2321, -28, 15849, 10490, 8.46), [31]],
  [rotatedFrame(-1647, -2561, 17561, 8563, -9.46), [4]],
  [rotatedFrame(-5758, -2412, 19694, 12337, 5.67), [20]],
  [rotatedFrame(-4779, -1344, 18384, 12085, 7.77), [16]],
  [rotatedFrame(-4970, -3152, 20815, 11783, -8.38), [23]],
  [rotatedFrame(-1770, -2829, 18077, 8676, -10.09), [11]],
  [rotatedFrame(-4344, -615, 17406, 11964, 11.36), [8]],
  [rotatedFrame(-8673, -4110, 24701, 15200, -6), [27]],
  [rotatedFrame(-8476, -5794, 24962, 13519, -18.02), [26]],
  [rotatedFrame(-3941, -3353, 19615, 10351, -8.37), [22]],
  [rotatedFrame(-3092, -3449, 19356, 9549, -10.08), [12]],
  [rotatedFrame(-4155, -1063, 17556, 11532, 8.49), [37]],
 ]],
 ['gaoxiong_7', [
  [frame(2156, 886, 8060, 4168), [10]],
  [frame(830, 15, 9306, 5984), [12]],
 ]],
 ['guandao_3', [
  [frame(1096, 1793, 8804, 6226), [4, 5, 6, 7, 8, 9, 10, 11, 16]],
 ]],
 ['jianwu_2', [
  [rotatedFrame(-14624, -15182, 28271, 10182, -11.26), [5]],
  [rotatedFrame(-2467, -4389, 15545, 6310, -19.34), [3]],
  [rotatedFrame(-4170, -6091, 17493, 6804, -28.35), [6]],
  [rotatedFrame(-2768, -5223, 15220, 5204, -29.24), [2]],
  [rotatedFrame(-5153, -4932, 16805, 8111, -16.26), [4]],
  [rotatedFrame(-16378, -15365, 31326, 12901, -17.44), [7]],
 ]],
 ['jinluhao_3', [
  [frame(-1230, -572, 14862, 8259), [36]],
  [frame(-2336, -1214, 15880, 8926), [20, 26, 27, 28, 29, 38]],
 ]],
 ['kebensi_2', [
  [frame(-760, -855, 12620, 7480), [8]],
  [rotatedFrame(-805, -1100, 12565, 7255, -2.39), [11]],
  [frame(-853, -622, 13098, 7530), [7]],
 ]],
 ['liekexingdunii_2', [
  [rotatedFrame(-4173, -5179, 19800, 8642, -7.87), [14]],
  [rotatedFrame(-1592, -1648, 15974, 8697, -6.49), [7, 8]],
  [rotatedFrame(-6038, -666, 17885, 13198, -7.92), [1]],
 ]],
 ['luyijiushi_4', [
  [frame(5, 658, 7466, 4563), [3, 4, 13]],
 ]],
 ['masaina_2', [
  [frame(-1615, -1028, 11647, 6755), [6, 8]],
  [frame(-1567, -980, 11597, 6694), [2, 4]],
 ]],
 ['meikelunbao_2', [
  [frame(92, 337, 7737, 4279), [1, 2, 4, 5, 6]],
 ]],
 ['mingji_2', [
  [frame(-6021, -1250, 16184, 12487), [5, 6, 18, 24]],
  [rotatedFrame(-6258, -3438, 10418, 10100, -7.81), [25]],
 ]],
 ['ougen_8', [
  [rotatedFrame(-290, -1636, 9940, 4762, -13.94), [6]],
  [frame(-400, -24, 8300, 5428), [11]],
  [frame(-6, -22, 8704, 5422), [2, 3, 4, 7, 12, 13]],
  [frame(-1017, -576, 9121, 5778), [5]],
 ]],
 ['pulimaosi_3', [
  [frame(1, 7, 7975, 4707), [4, 5, 6, 7, 8, 9, 10, 11, 14, 16, 17]],
  [frame(-917, 6, 8945, 5790), [12]],
  [trackDrawable(frame(0, 0, 8000, 4740), 'ArtMesh30', { includeCorners: true }), [15]],
  [frame(-907, -603, 8631, 5056), [3]],
  [frame(-228, -454, 7846, 4306), [2]],
  [rotatedFrame(-1144, -545, 9507, 5874, -3.34), [13]],
 ]],
 ['qisheng_2', [
  [frame(9, 113, 6923, 4111), [4, 5, 6, 8, 9]],
 ]],
 ['shi_3', [
  [frame(-10, -9, 10543, 8684), [23]],
 ]],
 ['shi_2', [
  [frame(1440, 320, 10080, 6540), [1]],
  [frame(-2930, -920, 14450, 7740), [2]],
  [frame(-8140, -5270, 19140, 8310), [3]],
  [frame(-5810, -2400, 18200, 9880), [4]],
  [frame(-4920, -2380, 17710, 9870), [5]],
  [rotatedFrame(-4310, -3390, 18280, 7980, -7.43), [6, 7]],
  [rotatedFrame(-4310, -3460, 18280, 7910, -7.43), [8]],
  [rotatedFrame(-7510, -1510, 17850, 11240, 14.04), [9]],
  [frame(3530, 430, 7750, 6560), [10]],
 ]],
 ['siwanshi_3', [
  [frame(1216, 526, 9681, 5492), [1]],
 ]],
 ['tiancheng_cv_2', [
  [rotatedFrame(-9383, 746, 22765, 19712, 24.78), [5]],
 ]],
 ['tiancheng_cv_3', [
  [frame(1506, 1302, 6260, 4396), [2, 15]],
  [rotatedFrame(-4388, -187, 10631, 9744, 12.02), [8]],
  [rotatedFrame(-4162, -737, 10816, 9174, 5.24), [10]],
  [rotatedFrame(-3326, 182, 9170, 8459, 12.02), [6]],
  [frame(-675, -167, 8337, 5809), [14]],
 ]],
 ['tianlangxing_5', [
  [frame(-908, 1060, 7508, 5900), [10]],
 ]],
 ['u2501_2', [
  [frame(555, 280, 9490, 5670), [5]],
  [frame(555, 280, 9490, 5760), [27]],
  [frame(594, 329, 9534, 5402), [1, 2, 3, 4, 10, 11, 12, 13, 14, 17, 18, 19, 25, 26]],
  [frame(579, 330, 9477, 5910), [6, 7, 8, 9]],
 ]],
 ['wuqi_3', [
  [trackDrawable(frame(370, 340, 9240, 5190), 'ui_14', { whenVisible: true }), [11]],
 ]],
 ['wuzang_4', [
  [frame(36, 10, 9946, 5638), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 24, 26, 28, 30, 32, 44, 45, 46]],
 ]],
 ['xingdengbao_3', [
  [frame(1521, 739, 6458, 3603), [7, 8, 9, 10]],
 ]],
 ['xingdengbao_2', [
  [frame(200, 2550, 4050, 6040), [3]],
 ]],
 ['xinnong_4', [
  [rotatedFrame(-5187, -2935, 15747, 8799, -13.13), [1]],
  [rotatedFrame(-8543, -5682, 20839, 10750, -21.8), [4]],
  [rotatedFrame(-8359, -4090, 19328, 11475, -12.09), [7]],
  [rotatedFrame(-11210, -6499, 22857, 12608, -21.04), [2]],
  [rotatedFrame(-12708, -6248, 25005, 14840, -20.32), [5]],
  [rotatedFrame(-6554, -3878, 17865, 9834, -17.93), [6]],
 ]],
 ['yanusi_7', [
  [frame(-1690, -1053, 11256, 6418), [20, 27, 28, 29, 37, 38, 42, 43, 44, 47, 48, 49, 50, 53, 54, 56, 57, 59, 60]],
 ]],
 ['yuanchou_3', [
  [frame(487, 396, 7655, 5044), [2]],
 ]],
 ['yuekechengii_3', [
  [frame(-2428, -1532, 16770, 9283), [5, 10, 11]],
 ]],
 ['yunxian_3', [
  [frame(609, 334, 7604, 4226), [6, 8, 9, 10]],
 ]],
 ['z13_2', [
  [frame(371, 405, 10326, 6304), [1]],
  [frame(-239, 39, 10279, 6599), [7, 8, 9, 11]],
  [frame(-237, 41, 10277, 7128), [2]],
  [frame(-240, 25, 10320, 6935), [10]],
 ]],
 ['zhangwu_2', [
  [frame(-1999, -1317, 11559, 6600), [19, 23]],
  [frame(-284, -1687, 8698, 7232), [27]],
  [rotatedFrame(-2307, 1914, 4636, 7871, 43.45), [29]],
  [rotatedFrame(-2406, 1853, 4587, 7900, 45), [28]],
 ]],
 ['zhenzhuhao_2', [
  [frame(-971, -569, 15033, 8340), [14, 16, 17, 18, 19, 20]],
  [frame(-16183, -9171, 30162, 17220), [5]],
 ]],
];
for (const [id, groups] of reviewedIdleExportFrames) {
 live2dIdleExportVariants.set(id, groupedIdleFrames(groups));
}
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
 live2dIdleVariants.get(id)?.get(motion) || live2dFrames.get(id) || (motion === 'idle' ? live2dIdleFrames.get(id) : null) || null;
export const authoredLive2DExportFrame = (id, motion) =>
 (motion === 'idle' ? live2dIdleExportFrames.get(id) : live2dIdleExportVariants.get(id)?.get(motion)) || authoredLive2DFrame(id, motion);
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
