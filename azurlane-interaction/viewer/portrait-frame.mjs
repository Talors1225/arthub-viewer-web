// Reviewed scene anchors. The original models and render order are unchanged.
// These layers sit outside the illustrated scene and can dominate its bounds.
const rules = {
 dafeng_4: { surrounds:['ArtMesh149','ArtMesh269','ArtMesh270','ArtMesh271'] },
 yunlong_3: { anchors:['yc2_bj'], surrounds:['kkkkk','kkkkk2','kkkkk3','kkkkk4'] },
 guanghui_9: { anchors:['ArtMesh292'], surrounds:['ArtMesh545','ArtMesh546','ArtMesh416','ArtMesh518','ArtMesh519','ArtMesh977','ArtMesh978','ArtMesh979','ArtMesh980'] },
 baifeng: { surrounds:['bj_fw1'] },
 kubo_2: { surrounds:['ArtMesh277','ArtMesh278','ArtMesh279','ArtMesh280'] },
 nengdai_2: { surrounds:['ArtMesh91','ArtMesh97','ArtMesh98','ArtMesh99'] },
};
export const portraitSurroundNames=id=>new Set(rules[id]?.surrounds||[]);
const frame = (minX, minY, maxX, maxY) => Object.freeze({ minX, minY, maxX, maxY });
const trackDrawable = (crop, drawable, options = {}) =>
 Object.freeze({ ...crop, anchor: Object.freeze({ drawable, ...options }) });
const openingMatte = (crop, drawable, corners) => trackDrawable(crop, drawable,
 { corners, nativeAspect: true, includeCorners: true, fadeToFrame: true });
const anchoragePool = frame(-240, -180, 9340, 8280);
const cowpensRoom = frame(38, 33, 11651, 6586);
const ringMatteWindow = frame(-1580, -909, 11182, 6344);
const baltimoreScene = frame(-818, -595, 8801, 8571);
const guamRoom = frame(500, 814, 10785, 6450);
const clemenceauOpening = openingMatte(frame(-260, 200, 9380, 7160), 'MB_blackbgjuxing', [4, 5, 6, 7]);
const unicornOpening = openingMatte(frame(-2770, 630, 11270, 9000), 'ArtMesh1', [4, 5, 6, 7]);
const benningtonOpening = openingMatte(frame(-1900, -1445, 11400, 6480), 'ArtMesh271', [1, 3, 2, 0]);
const pirateCarWindow = openingMatte(frame(-2140, -760, 12600, 7850), 'ArtMesh674', [4, 5, 6, 7]);
const lionTransitionWindow = frame(-230, 210, 12410, 6595);
const lionTransitionCrop = Object.freeze({ ...lionTransitionWindow, anchor: Object.freeze({
 edges: [['ArtMesh226', 2, 3], ['ArtMesh231', 0, 1], ['ArtMesh222', 0, 1], ['ArtMesh229', 2, 3]],
 nativeAspect: true, fadeToFrame: true,
}) });
// The sky has support vertices inside its four outer corners. Follow those corners as the camera tilts.
const mogadorSky = trackDrawable(frame(-3080, -2400, 11080, 7840), 'ArtMesh654', { corners: [1, 0, 2, 3], align: true });
const mogadorSkyWithCard = trackDrawable(mogadorSky, mogadorSky.anchor.drawable, { ...mogadorSky.anchor, headroom: .32 });
// The blue mattes close over the sky during these camera moves.
const mogadorMatteEdges = [['ArtMesh669', 2, 3], ['ArtMesh672', 0, 1], ['ArtMesh1153', 0, 1], ['ArtMesh671', 2, 3]];
const mogadorCloseUp = trackDrawable(mogadorSky, mogadorSky.anchor.drawable,
 { ...mogadorSky.anchor, aperture: mogadorMatteEdges, aspect: 1.738 });
const mogadorWideShot = trackDrawable(mogadorSky, mogadorSky.anchor.drawable,
 { ...mogadorSky.anchor, aperture: mogadorMatteEdges, aspect: 1.563 });
const mogadorAircraft = frame(-1596, 53, 1963, 2074);
const vicksburgNormalFrame = frame(-1515, -1835, 1841, 915);
const vicksburgExFrame = frame(-1487, -1799, 1820, 876);
// Match the scene inside the outer matte. Live2D uses a top-left origin.
const live2dFrames = new Map([
 ['baerdimo_6', baltimoreScene], // Preserve the scene while fog drifts beyond its edges.
 ['shuixinghao_2', frame(0, 0, 8000, 5500)], // Authored canvas excludes the oversized MB_blackbgjuxing matte.
 ['feiteliekaer_4', frame(0, 0, 9449, 5570)], // Authored camera canvas; off-canvas scene cards are not presentation bounds.
 ['jinjiang_2', frame(0, 0, 8000, 4712)],
 ['suweiaitongmeng_3', frame(0, 0, 19310, 13260)],
 ['anninvwang_2', frame(-100, 220, 8160, 5060)],
 ['guanghui_9', frame(-5050, -3100, 15070, 10385)],
 ['wuqi_3', frame(370, 185, 9240, 5300)],
]);
const live2dIdleFrames = new Map([
 ['ankeleiqi_2', anchoragePool],
 ['aogusite_4', frame(39, 34, 9972, 5719)],
 ['dafeng_6', frame(-1900, 925, 9280, 7070)], // Inside the beach scene's picture frame.
 ['dafeng_7', frame(-11200, -3500, 16000, 14500)], // Keep the complete pool table in the two overhead opening shots.
 ['gaoxiong_7', frame(931, 143, 9157, 5868)],
 ['gezi_2', frame(430, 866, 10721, 6385)],
 ['kebensi_2', cowpensRoom],
 ['liekexingdunii_2', frame(203, 69, 13872, 7970)],
 ['lisailiu_2', frame(-505, 159, 9283, 9081)],
 ['luyijiushi_2', frame(-1050, 500, 7040, 9860)], // The throne and the rocks in its immediate foreground.
 ['mingji_2', frame(36, 95, 8963, 5313)],
 ['mojiaduoer_4', mogadorSky],
 ['ougen_8', frame(-13, 6, 8676, 5391)],
 ['pulimaosi_3', frame(27, 31, 7965, 4736)],
 ['xinnong_6', frame(8, 8, 10052, 6770)], // Trim curtain geometry outside the illustrated room.
 ['qiershazhi_2', frame(-3798, -907, 11880, 9978)],
 ['sebao_2', frame(208, 56, 13932, 7841)],
 ['shi_2', frame(-264, 266, 12467, 6675)],
 ['shi_3', frame(1, 25, 10514, 8659)],
 ['u2501_2', frame(602, 336, 9571, 5366)],
 ['wuerlixi_3', frame(-615, 345, 8995, 7940)], // Center the car and clip the distant end of the smoke trail.
 ['wuzang_4', frame(46, 19, 9943, 5662)],
 ['xianghe_2', frame(-1650, 950, 9600, 9600)], // Keep the cranes and the mist around the character.
 ['xingdengbao_3', frame(-1, 10, 8002, 4544)],
 ['yuanchou_3', frame(445, 416, 7964, 5064)],
 ['z13_2', frame(-211, 121, 10268, 6584)],
]);
const live2dIdleExportFrames = new Map([
 ['qisheng_2', frame(102, 149, 7370, 4505)],
 ['masaina_2', frame(-1515, -934, 11580, 6635)],
 ['aersasi_3', frame(-1230, -765, 8500, 5420)], // Inside the forest backdrop throughout the idle cycle.
 ['zhenzhuhao_2', frame(-2100, -1240, 16105, 9460)],
 ['baiyanjuren_4', frame(1116, 1804, 8868, 6190)],
 ['baifeng_3', frame(8, 8, 7992, 4566)], // Inside the four oversized surround meshes.
 ['zhangwu_2', frame(-1930, -1220, 11550, 6568)], // The room, without drifting petals outside it.
 ['ankeleiqi_2', Object.freeze({ ...anchoragePool, hiddenDrawables: ['ArtMesh532', 'ArtMesh533', 'ArtMesh534', 'ArtMesh536', 'ArtMesh542'] })],
 ['jinshi_2', frame(66, 72, 7925, 5480)], // The scene inside the surrounding fog.
]);
// Bounds are in the rotated Live2D canvas for scenes with a tilted picture frame.
const rotatedFrame = (minX, minY, maxX, maxY, degrees) =>
 Object.freeze({ ...frame(minX, minY, maxX, maxY), rotation: degrees * Math.PI / 180 });
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
 ['mojiaduoer_4', new Map([
  ...groupedIdleFrames([
   [mogadorSky, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 29, 30, 32, 36, 37, 38, 39, 40, 41, 42, 50]],
   [mogadorSkyWithCard, [34]],
  ]),
  ['touch_drag9', mogadorSkyWithCard],
  ['touch_drag10', mogadorSkyWithCard],
 ])],
 ['wuerlixi_3', groupedIdleFrames([[live2dIdleFrames.get('wuerlixi_3'), [1]]])],
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
  [frame(-1360, -62, 12210, 7544), [24]],
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
  [frame(-1655, -1070, 11265, 6472), [17, 19]],
  [rotatedFrame(-10701, -4033, 15473, 12369, 7.81), [9]],
 ]],
 ['baifeng_3', [
  [rotatedFrame(1241, 32, 7293, 4516, -0.9), [4]],
  [rotatedFrame(1278, -24, 7296, 4460, -1.61), [5]],
  [rotatedFrame(1065, 6, 7292, 4530, -0.89), [2]],
  [rotatedFrame(-1713, 254, 9284, 6547, 15.64), [23]],
 ]],
 ['baiyanjuren_4', [
  [rotatedFrame(2313, -4025, 10620, 4722, -33.11), [16, 17]],
  [rotatedFrame(1170, 143, 10340, 5350, -13.76), [1]],
  [rotatedFrame(890, 28, 10620, 5530, -13.76), [2]],
  [frame(-2406, -18, 12342, 7999), [3, 4]],
  [frame(-2172, 124, 12069, 7867), [5]],
  [frame(1116, 1804, 8868, 6190), [6]],
  [frame(1116, 1736, 8868, 6118), [7, 8]],
  [frame(936, 1735, 8680, 6108), [9]],
  [frame(752, 1821, 8843, 6082), [10]],
  // The underwater shot sits inside a separate black matte.
  [frame(1430, 2100, 8420, 5900), [11, 12, 13, 14, 15]],
  [frame(-1910, 210, 15655, 10140), [18, 19]],
  [frame(847, 1461, 8599, 5841), [23, 24]],
 ]],
 ['beilaosenlin_2', [
  [frame(218, 150, 14064, 7719), [7, 10, 13]],
  [rotatedFrame(-12451, -12504, 25313, 8671, -34.26), [9]],
 ]],
 ['benningdun_2', [
  [ringMatteWindow, [1, 2, 3, 6, 7]],
  [frame(-1670, -985, 11155, 6305), [4, 13, 21, 33]],
  [frame(-1795, -890, 11020, 6140), [44, 45]],
  [frame(-1625, -1130, 10930, 6250), [48]],
  [frame(-1600, -925, 11085, 6270), [49]],
  [frame(-1702, -1064, 11332, 6492), [5, 9, 14, 16, 17, 22, 23, 24, 25, 37, 38, 41, 47]],
  [frame(-1783, -1874, 11412, 6587), [32]],
 ]],
 ['bunao_3', [
  [frame(82, 126, 7589, 7710), [3]],
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
  [cowpensRoom, [1, 4, 5, 7, 8, 9, 10, 13]],
  [frame(38, 690, 11651, 6586), [2]],
  [frame(38, 1400, 11651, 6586), [3]],
  [frame(38, 48, 11300, 6520), [6, 12]],
  [rotatedFrame(95, -320, 11720, 6390, -2.39), [11]],
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
 ['sebao_2', [
  [frame(216, 65, 13924, 7831), [1, 2, 3, 4, 5, 6, 7, 8, 9]],
 ]],
 ['shi_3', [
  [frame(60, 58, 10496, 8642), [2, 12, 13, 14, 18]],
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
 ['xinnong_6', [
  [frame(1515, 1072, 8682, 5314), [9, 10]],
 ]],
 ['yanusi_7', [
  [frame(-1690, -1053, 11256, 6418), [20, 27, 28, 29, 37, 38, 42, 43, 44, 47, 48, 49, 50, 53, 54, 56, 57, 59, 60]],
 ]],
 ['yingxianzuo_3', [
  [frame(-430, 1760, 10100, 5935), [1]],
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
  [frame(711, 800, 9320, 5785), [3]],
  [frame(818, 893, 9158, 5770), [4, 5, 6]],
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
 ['kashan_2', frame(-2930, -215, 2555, 2861)], // Keep the window light inside the kitchen backdrop.
 ['maoxianhao_2', frame(-3026, -42, 3048, 3489)],
 ['sikula_4', frame(-3120, -452, 2882, 3284)], // Keep the smoke within the full scene.
 ['suweiaitongmeng_4', frame(-2560, -55, 2570, 2920)],
 ['weikesibao_3', frame(-1104, -889, 1427, 542)],
 ['yunlong_3', frame(-2126, -356, 2133, 2312)],
]);
// These three ASMR versions use the same scene coordinates as the base skins.
for (const id of ['aimudeng_5', 'haichou_2', 'hu_2']) spineFrames.set(id + '_asmr', spineFrames.get(id));
// Default browsing crops measured from the opaque illustration, excluding distant effects.
// Export framing and per-motion authored anchors remain independent.
const defaultStageFrames = new Map([
 ['shuixinghao_2', frame(0, 0, 8000, 5500)], // Authored canvas excludes the oversized MB_blackbgjuxing matte.
 ['feiteliekaer_4', frame(0, 0, 9449, 5570)],
 ['jinjiang_2', frame(0, 0, 8000, 4712)],
 ['suweiaitongmeng_3', frame(0, 0, 19310, 13260)],
 ['baifeng_3', frame(8, 8, 7992, 4566)], // Clip the huge colored outer matte, also when zoomed out.
 ['adaerbote_3', frame(377, 435, 8238, 6761)],
 ['adaerbote_4', frame(-2374, -23, 2384, 2760)],
 ['alabama_3', frame(-1417, -8, 1465, 1643)],
 ['ankeleiqi_3', frame(-3961, -5108, 25376, 10835)],
 ['banerwei_3', frame(-4006, -1139, 12443, 9807)],
 ['bawu_2', frame(-1668, -7, 1764, 2035)],
 ['beikaluolaina_3', frame(-1997, -685, 2014, 1925)],
 ['bulaimodun_5', frame(331, 310, 6302, 6537)],
 ['bunao_3', frame(-73, -8, 7742, 6163)],
 ['chuyue_2', frame(-3236, 554, 10864, 8271)],
 ['fage_2', frame(-2272, -1480, 2157, 1334)],
 ['feiteliedadi_5', frame(-1965, -13, 2064, 2376)],
 ['gangyishawa_2', frame(-2826, -1676, 2780, 1723)],
 ['guandao_2', frame(-3, -58, 7429, 6485)],
 ['hailunna_4', frame(-1408, 860, 7547, 6584)],
 ['jianye_2', frame(403, 1132, 8461, 7991)],
 ['jianye_4', frame(1276, 2411, 11342, 9517)],
 ['jinluhao_2', frame(-15, -685, 8324, 8047)],
 ['jinluhao_3', frame(-2308, -1196, 16036, 9029)],
 ['junhe_4', frame(645, 243, 6696, 6804)],
 ['junhe_5', frame(808, 377, 7054, 6894)],
 ['kaiersheng_3', frame(-3029, -882, 3064, 3300)],
 ['kewei_4', frame(-383, -587, 10627, 9490)],
 ['leiniya_2', frame(-1348, -3, 1452, 1633)],
 ['makeboluo_3', frame(-1495, -11, 1520, 1782)],
 ['mojiaduoer_2', frame(-45, 526, 7545, 7544)],
 ['mojiaduoer_4', mogadorSky],
 ['mojiaduoer_5', mogadorAircraft],
 ['nengdai_3', frame(287, 183, 4732, 4801)],
 ['nengdai_9', frame(-1429, -4, 1435, 1611)],
 ['ninghai_4', frame(1290, 3, 3152, 4345)],
 ['ougen_7', frame(-1624, -1316, 2256, 1556)],
 ['pinghai_4', frame(2496, 210, 4874, 4345)],
 ['qinli_2', frame(-2899, -18, 2898, 3426)],
 ['qiye_7', frame(589, 261, 10526, 9416)],
 ['qiye_9', frame(-3661, -182, 11429, 8267)],
 ['rangbaer_5', frame(-3580, -238, 11917, 8129)],
 ['shengluyisi_3', frame(527, 171, 5271, 5705)],
 ['siwangzhuzai_2', frame(-1913, -17, 1924, 2457)],
 ['siwanshi_3', frame(-1039, 36, 12882, 7535)],
 ['siwanshi_4', frame(-1284, -754, 1360, 833)],
 ['suweiaitongmeng_2', frame(735, 131, 6855, 6638)],
 ['tiancheng_cv_2', frame(747, 869, 18379, 11499)],
 ['tiancheng_cv_3', frame(-65, -20, 7757, 5154)],
 ['weiyan_4', frame(719, 507, 7173, 7582)],
 ['weizhang_3', frame(171, 545, 11149, 8772)],
 ['xiafei_4', frame(235, 463, 9349, 6205)],
 ['xinnong_3', frame(661, 691, 6722, 5979)],
 ['xinnong_4', frame(-4980, -1081, 14027, 9704)],
 ['xinzexi_3', frame(-30, 274, 8664, 7230)],
 ['yanusi_7', frame(-1642, -1096, 11250, 6488)],
 ['yibei_3', frame(93, 297, 6751, 6859)],
 ['yueke_ger_4', frame(-1807, -1, 1914, 2919)],
 ['yuekechengii_3', frame(-2360, -1408, 16718, 9228)],
 ['yunxian_2', frame(-5228, -199, 13754, 10676)],
 ['yunxian_3', frame(237, -152, 8317, 4503)],
 ['zhaohe_4', frame(-1621, -20, 1856, 1975)],
 ['zhenzhuhao_2', frame(-2502, -1598, 16366, 10981)],
]);
export const defaultPortraitStageFrame = id => defaultStageFrames.get(id) || null;

// These scenes have a defined picture window in every pose. Falling back to
// all drawable bounds for idle2/etc includes giant matte or curtain geometry.
const cleanSceneFrame = id => id === 'xinnong_6' ? live2dIdleFrames.get(id)
 : ['zhangwu_2','baifeng_3'].includes(id) ? live2dIdleExportFrames.get(id) : null;
// Use the reviewed picture area when a surrounding matte or effect dominates the preview.
const live2dMotionStageFrames = new Map([
 ...['change_out', 'idle36', 'idle37', 'idle38', 'idle39', 'idle40', 'touch_idle25', 'touch_idle36', 'touch_special']
  .map(motion => ['mojiaduoer_4:' + motion, mogadorCloseUp]),
 ['mojiaduoer_4:idle50', mogadorWideShot],
 ['aersasi_3:idle', frame(-1230, -765, 8500, 5420)],
 ['gezi_2:idle6', guamRoom],
 ['gezi_2:touch_idle13', frame(315, 564, 10951, 6663)],
 ['gezi_2:touch_idle18', guamRoom],
 ['benningdun_2:login', benningtonOpening],
 ['chuyue_2:touch_drag3', openingMatte(defaultStageFrames.get('chuyue_2'), 'MB_blackbgjuxing3', [4, 5, 6, 7])],
 ['dujiaoshou_6:login', unicornOpening],
 ['kelaimengsuo_2:login', clemenceauOpening],
 ['mingji_2:touch_idle19', pirateCarWindow],
 ['mingji_2:touch_idle26', pirateCarWindow],
 ['rangbaer_5:touch_idle3', openingMatte(defaultStageFrames.get('rangbaer_5'), 'ArtMesh557', [1, 3, 2, 0])],
 ['shi_2:touch_drag11', lionTransitionCrop],
 ['gaoxiong_7:touch_idle18', frame(2123, 817, 8199, 4282)],
 ['daofeng_4:idle', frame(671, -41, 6460, 5404)],
 ['daofeng_4:home', frame(17, -76, 7191, 5404)], // The first glint occupies only a few pixels.
 ['hailunna_4:wedding', trackDrawable(frame(-1500, 851, 7604, 6597), 'MB_blackbgjuxing',
  { corners: [4, 5, 6, 7], whenVisible: true, includeCorners: true })],
 ['dulianglai_2:login', frame(768, 704, 14385, 9146)],
 ['wuerlixi_2:login', frame(-1100, -365, 9480, 8720)],
 ['weiyan_4:home', frame(0, 0, 8000, 8000)], // The wide panning background extends outside the native camera canvas.
 ['weiyan_6:home', openingMatte(frame(115, -214, 7523, 6900), 'ArtMesh44', [4, 5, 6, 7])],
 ['z46_3:login', frame(580, -1600, 12550, 6800)], // Keep the opening flag and the later character in the camera window.
 ['jialisuoniye_3:touch_special', frame(7, 637, 9534, 6070)],
 ['jinshi_2:touch_idle16', frame(713, 607, 7302, 4477)],
 ['baiyanjuren_4:touch_idle14', frame(1448, 2091, 8410, 5881)],
 ['guandao_3:home', frame(1051, 1711, 8864, 6887)],
 ['edu_3:home', openingMatte(frame(100, -30, 8015, 5250), 'ArtMesh159', [5, 7, 6, 4])],
 ['pinghai_6:login', openingMatte(frame(590, -120, 5316, 5150), 'mask_black_16b11', [1, 3, 2, 0])],
 ['qianwei_2:home', frame(-1196, -508, 7316, 6098)],
 ['bulaimodun_4:home', openingMatte(frame(-1066, 67, 7134, 8254), 'mask_black_16b11', [1, 3, 2, 0])],
 ['ougen_5:idle', frame(126, 1520, 8447, 8151)],
]);
export const authoredLive2DFrame = (id, motion) =>
 live2dMotionStageFrames.get(id + ':' + motion)
 || (cleanSceneFrame(id) && live2dIdleExportVariants.get(id)?.get(motion))
 || live2dIdleVariants.get(id)?.get(motion) || live2dFrames.get(id)
 || (motion === 'idle' ? live2dIdleFrames.get(id) : null) || cleanSceneFrame(id) || null;
const live2dOpeningFrames = new Map([
 ['aimudeng_2:home', frame(5, 5, 8360, 6498)],
 ['chaijun_4:home', frame(3048, 3015, 17854, 13202)],
 ['hemin_3:login', frame(18, 364, 6578, 6690)],
 ['jiuyun_2:login', frame(1772, 1988, 6252, 5022)],
 ['ougen_6:login', frame(1460, 2748, 7585, 6120)],
 ['weiyan_6:login', frame(3134, 1175, 5889, 3973)],
 ['z46_4:login', frame(826, 3, 10080, 5343)],
 ['zengkehaijunshangjiang_2:login', frame(-751, 1850, 9972, 7055)],
]);
export const authoredLive2DExportFrame = (id, motion) =>
 live2dOpeningFrames.get(id + ':' + motion)
 || (motion === 'idle' ? live2dIdleExportFrames.get(id) : live2dIdleExportVariants.get(id)?.get(motion))
 || authoredLive2DFrame(id, motion)
 || (id === 'kebensi_2' ? cowpensRoom : null)
 || (id === 'baifeng_3' ? live2dIdleExportFrames.get(id) : null);
// These shutter bars cover the stage outside of the interactive close-up.
const magicStageShutter = Object.freeze(['ArtMesh501', 'ArtMesh227']);
const magicStageCloseUps = new Set(['idle2', 'idle13', 'idle14', 'idle15', 'idle16']);
const mogadorInteractionCovers = Object.freeze(['ArtMesh1385', 'ArtMesh1410']);
const pirateCarMatte = Object.freeze(['ArtMesh1072']);
// Game interface backdrops can paint over the standalone artwork.
export const authoredLive2DInterfaceCovers = id => id === 'mojiaduoer_4' ? mogadorInteractionCovers
 : id === 'mingji_2' ? pirateCarMatte : [];
const lionSceneMatte = Object.freeze(['ArtMesh222', 'ArtMesh226', 'ArtMesh229', 'ArtMesh231',
 'ArtMesh243', 'ArtMesh244', 'ArtMesh287', 'ArtMesh288', 'ArtMesh686']);
const jianwuOpeningMatte = Object.freeze(['ArtMesh460', 'ArtMesh463', 'ArtMesh464', 'ArtMesh465']);
export function authoredLive2DExportHidden(id, motion) {
 if (id === 'shi_2' && (motion === 'touch_idle1' || motion === 'effect')) return lionSceneMatte;
 if (id === 'jianwu_2' && motion === 'home') return jianwuOpeningMatte;
 return id === 'xinnong_5' && magicStageCloseUps.has(motion) ? magicStageShutter : authoredLive2DInterfaceCovers(id);
}

// The pool background's upper edge is at -2.16° in the uncorrected shot.
const argusLevelFrame = rotatedFrame(-2634, -57, 12257, 8409, 2.16);
export const authoredLive2DLevelFrame = (id, motion) =>
 id === 'baiyanjuren_4' && motion === 'idle3' ? argusLevelFrame : null;

// Mesh vertices on the inside of each authored screen matte, in the
// order top-left, bottom-left, bottom-right, top-right.
const sceneWindowMotions = /^(?:idle\d*|touch_\w+|main_\d+|mail|mission(?:_complete)?|complete|effect|wedding)$/;
const live2dExportWindows = new Map([
 ['ankeleiqi_4', { drawable:'ArtMesh44', corners:[4, 5, 6, 7] }],
 ['baiyanjuren_4', { drawable:'ArtMesh323', corners:[4, 5, 6, 7], motions:/^(?:home|touch_idle\d+)$/ }],
 ['benningdun_2', { drawable:'jiezhihuan7', frame:ringMatteWindow, motions:/./ }],
 ['chaijun_6', { drawable:'jiezhihuan7', frame:ringMatteWindow, motions:/./ }],
 ['jinshi_2', { drawable:'ArtMesh24', corners:[4, 5, 6, 7], motions:/^touch_(?:idle|drag)\d+$/ }],
 ['aogusite_4', { drawable:'ArtMesh1077', corners:[4, 5, 6, 7] }],
 ['gaoxiong_7', { drawable:'ArtMesh531', corners:[4, 5, 6, 7], motions:sceneWindowMotions }],
 ['guandao_3', { drawable:'ArtMesh8', corners:[4, 6, 7, 8] }],
 ['jianwu_2', { drawable:'ArtMesh182', corners:[1, 3, 2, 0], motions:/^home$/ }],
 ['mingji_2', { drawable:'ArtMesh674', corners:[4, 5, 6, 7], motions:sceneWindowMotions,
   closeUps:new Set(['idle15', 'idle16', 'idle20', 'idle23', 'idle28', 'idle30']) }],
 ['mojiaduoer_4', { drawable:'ArtMesh654', frame:mogadorSky, motions:/./ }],
 ['naximofu_2', { drawable:'ArtMesh301', corners:[9, 8, 7, 4] }],
 ['qiye_7', { drawable:'MB_blackbgjuxing3', corners:[4, 5, 6, 7], motions:/^login$/ }],
 ['qisheng_2', { drawable:'ArtMesh363', corners:[1, 3, 2, 0], motions:/./ }],
 ['sailimiye_2', { drawable:'ArtMesh779', corners:[0, 1, 2, 3], motions:sceneWindowMotions }],
 ['tiancheng_cv_3', { drawable:'MB_blackbgjuxing', corners:[4, 5, 6, 7], motions:/^touch_idle20$/ }],
 ['u2501_2', { drawable:'ArtMesh932', corners:[4, 5, 6, 7], motions:/^(?:idle|touch_)\w*$/ }],
 ['wuzang_4', { drawable:'ArtMesh', corners:[4, 5, 6, 7], motions:sceneWindowMotions }],
]);
export function authoredLive2DExportWindow(id, motion) {
 const spec = live2dExportWindows.get(id);
 return spec && (spec.motions ?? /^idle\d*$/).test(motion) && !spec.closeUps?.has(motion) ? spec : null;
}

const spineExportMotionFrames = new Map([
 ['na_2_doa:normal', frame(-2010, 6, 2013, 2365)],
 ['xianghe_4:normal', frame(-2648, -3844, 2501, 1995)],
 ['digaiteluyin_2:normal', frame(-2685, 64, 2645, 3040)],
 ['yuekechengii_2:normal', frame(-1481, -628, 1719, 1787)],
 ['qisheng_3:normal_touch', frame(-1809, 8, 1988, 3264)],
 ['siwanshi_4:touch_special_normal', frame(-1238, -827, 1381, 917)], // The second shot moves onto the canvas as the selected clip is sampled.
 ['siwanshi_4:login', frame(-1284, -754, 1360, 833)],
 ['feiteliedadi_5:login', frame(-1965, -13, 2064, 2376)],
 ['yuekechengii_4:login', frame(-1495, 8, 1613, 1832)],
 // Inset past the background texture's transparent antialias edge.
 ['yuekegongjue_5:normal', frame(-1948, -1739, 1947, 1248)],
 ['tianjinfeng_3:normal', frame(-2398, 8, 2398, 2724)], // Inside the classroom background; exclude atlas-edge pixels.
 ['tianjinfeng_3:change_in', frame(-2398, 8, 2398, 2724)],
 ['qisheng_3:normal', frame(-1817, 0, 1997, 3272)],
 ['jumeihuali_2:normal', frame(-2945, 5, 2945, 3390)],
 ['anninvwang_3:normal', frame(-1334, 0, 1366, 1801)],
 ['lilisha_2:normal', frame(-3339, -1905, 3043, 1797)],
 ['tiejiaohao_2:normal', frame(-4153, -2326, 4181, 2524)],
 ['yuekegongjue_5:ex', frame(-1954, -1745, 1953, 1254)],

 ['tianjinfeng_2:normal', frame(-2200, -2000, 2300, 2300)],
 ['bisimaiz_3:normal', frame(-2174, -8, 2120, 2463)],
]);
export const authoredSpineExportFrame = (id, motion) => spineExportMotionFrames.get(id + ':' + motion) || authoredSpineFrame(id);
const spineMotionStageFrames = new Map([
 ['tianjinfeng_2:normal', spineExportMotionFrames.get('tianjinfeng_2:normal')],
 ['weikesibao_2:normal', vicksburgNormalFrame],
 ['weikesibao_2:ex', vicksburgExFrame],
]);
export const authoredSpineFrame = (id, motion) => spineMotionStageFrames.get(id + ':' + motion) || spineFrames.get(id) || null;

// The visible scene inside the game's matte defines the picture in every export format.
const sceneExportCrops = new Map([
 ['guandao_3:idle', frame(256, 1387, 9703, 6755)],
 ...['normal', 'login', 'change_out', 'touch_body', 'touch_head', 'touch_special', 'touch_special_2', 'touch_special_normal']
  .map(motion => ['mojiaduoer_5:' + motion, mogadorAircraft]),
 ['guandao_3:idle1', frame(273, 1489, 9616, 6725)],
 ['guandao_3:idle17', frame(273, 1289, 9685, 6364)],
 ['guandao_3:idle2', frame(273, 1483, 9639, 6742)],
 ['guandao_3:idle3', frame(273, 1415, 9616, 6698)],
 ['antu_2:idle15', frame(-1099, 67, 12015, 7352)],
 ['baifeng_2:touch_idle19', frame(-1655, -1012, 11266, 6426)],
 ['jinluhao_3:login', frame(-1842, -816, 15547, 8570)],
 ['sebao_2:touch_idle7', frame(278, 145, 13871, 7804)],
 ['ankeleiqi_4:idle14', rotatedFrame(1348, 1046, 8422, 5321, 1.91)],
 ['yanusi_7:touch_idle57', frame(-1520, -816, 11094, 6285)],
 ['jianwu_2:home', { inset: [0.03, 0.038, 0.04, 0.037] }],
]);

// These crops stay inside the illustrated background over the exported action.
// Tracked windows use left, top, right, and bottom fractions of the picture.
const mogadorVideoInset = { inset: [0.0132, 0.0366, 0.0132, 0.0921] };
const sceneVideoCrops = new Map([
 ['feiteliedadi_4:idle', frame(151, 136, 14778, 8554)],
 ['feiteliekaer_3:idle', frame(29, 26, 5289, 3133)],
 ['naximofu_4:normal', frame(-2892, 211, 2850, 3195)],
 ['yingrui_4:normal', frame(-1677, -980, 1689, 957)],
 ['aijier_4:idle', frame(64, 74, 14204, 9942)],
 ['baifeng_2:idle', frame(-1641, -1065, 11212, 6470)],
 ['baifeng_2:idle9', rotatedFrame(-10337, -3669, 15200, 12005, 7.81)],
 ['baiyanjuren_4:idle9', frame(936, 1735, 8680, 6000)],
 ['chaijun_6:idle', frame(-2588, -1064, 12204, 7497)],
 ['feiteliedadi_4:idle11', rotatedFrame(-1666, -2518, 17801, 8676, -10.09)],
 ['fulankelin_2:normal', frame(-2026, -1190, 2329, 1194)],
 ['gaoxiong_7:idle1', { inset: [0.03, 0, 0, 0] }],
 ['guanghui_9:idle', frame(-4910, -2855, 14895, 10140)],
 ['guanghui_9:touch_special', frame(-4910, -2855, 14895, 10140)],
 ['hailunna_4:idle', frame(-1341, 927, 7492, 6537)],
 ['huashengdun_3:normal', frame(-2356, -127, 2252, 2739)],
 ['jian_3:idle', frame(33, 19, 1901, 1084)],
 ['lafeiii_3:idle', frame(-5686, 124, 13398, 10001)],
 ['lafeiii_4:normal', frame(-1780, 17, 1990, 2246)],
 ['leiniya_2:normal', frame(-1332, 13, 1438, 1613)],
 ['liekexingdunii_2:idle', frame(203, 188, 13872, 7970)],
 ['liekexingdunii_2:idle8', rotatedFrame(-1348, -1434, 15974, 8697, -6.49)],
 ['mojiaduoer_3:idle', frame(275, 222, 8415, 4519)],
 ['mojiaduoer_4:idle', { inset: [0, 0.017, 0, 0.039] }],
 ['nina_2:normal', frame(-1897, 132, 1902, 2132)],
 ['shi_3:idle', frame(75, 25, 10514, 8659)],
 ['siwanshi_3:idle1', frame(1216, 526, 9681, 5271)],
 ['tiancheng_cv_3:idle', frame(30, 92, 7737, 5108)],
 ['tiancheng_cv_3:idle14', frame(-455, 115, 8337, 5809)],
 ['weineituo_2:idle', frame(-748, 1356, 8040, 6800)],
 ['wuqi_3:idle', frame(432, 262, 9132, 5223)],
 ['wuqi_3:touch_special', frame(432, 262, 9132, 5207)],
 ['yuekegongjue_5:ex', frame(-1954, -1724, 1953, 1233)],
 ['yunlong_2:ex', frame(-1578, 12, 1634, 2014)],
 ['yunlong_2:normal', frame(-1578, 12, 1634, 2014)],
 ['z13_2:idle1', frame(700, 561, 10326, 6217)],
 ['aersasi_3:idle17', frame(-872, -27, 8906, 5984)],
 ['aimudeng_2:idle', frame(51, 68, 5024, 6443)],
 ['aimudeng_2:touch_special', frame(51, 1620, 4990, 6443)],
 ['ankeleiqi_4:idle', frame(-648, 119, 9759, 5729)],
 ['benningdun_2:idle', frame(-1639, -1385, 11097, 6527)],
 ['buleisite_3:idle', frame(1004, 1426, 18082, 10809)],
 ['buleisite_3:touch_special', frame(1042, 1201, 17556, 10922)],
 ['dulianglai_2:idle', frame(1509, 1513, 14173, 9803)],
 ['dulianglai_2:idle1', frame(1558, 1593, 14066, 9732)],
 ['gangyishawa_3:idle', frame(51, 72, 12434, 7417)],
 ['gangyishawa_3:idle9', frame(46, 117, 12862, 7719)],
 ['gaoxiong_7:idle11', { inset: [0, 0, 0, 0.17] }],
 ['guanghui_7:idle', frame(-1079, 966, 9344, 7431)],
 ['guanghui_7:touch_idle11', frame(-919, 966, 9346, 7431)],
 ['i404_2:login', frame(-1441, 12, 1260, 1558)],
 ['i404_3:login', frame(-1441, 12, 1260, 1558)],
 ['jianwu_2:idle', frame(-2010, -1168, 11263, 6970)],
 ['jianwu_3:touch_special', frame(-6843, -3369, 6860, 4586)],
 ['jinluhao_4:touch_head', frame(-1570, 14, 1824, 1979)],
 ['junzhu_5:idle', frame(-113, -21, 1908, 1189)],
 ['junzhu_5:touch_idle8', frame(-23, -15, 1906, 1103)],
 ['kewei_6:idle', frame(-4256, -1326, 17988, 10455)],
 ['kewei_6:idle6', frame(-3410, -1504, 17189, 9406)],
 ['lvzuofu_2:idle', frame(-1129, 1004, 7883, 6304)],
 ['lvzuofu_2:wedding', frame(-1129, 1023, 7883, 6304)],
 ['meiyinci_3:idle', frame(504, 611, 6469, 3816)],
 ['molisen_3:drag_ex', frame(-1655, 21, 1651, 1894)],
 ['nabulesi_2:idle', frame(378, 784, 15505, 8207)],
 ['nabulesi_2:touch_drag11', frame(628, 784, 15505, 8238)],
 ['naximofu_2:idle', frame(430, 461, 13151, 7335)],
 ['qianjian_2:idle', frame(109, 91, 7895, 4973)],
 ['qianjian_2:idle3', frame(99, 102, 7895, 4964)],
 ['qiannai_2_doa:drag_ex', frame(-1016, 18, 1008, 1210)],
 ['qisheng_2:touch_special', frame(195, 276, 7361, 4450)],
 ['qiye_10:idle', frame(-2280, -937, 11812, 7071)],
 ['qiye_9:idle', frame(-3206, 157, 11096, 7925)],
 ['rangbaer_5:idle', frame(-3019, 421, 11253, 7851)],
 ['shi_2:idle', frame(1005, 313, 11969, 6628)],
 ['siwanshi_4:touch_special', frame(-1136, -619, 1249, 714)],
 ['telafaerjia_2:idle', frame(584, 481, 6197, 3624)],
 ['telafaerjia_2:idle6', frame(3, 196, 6490, 3706)],
 ['tiancheng_cv_2:idle', frame(2186, 1871, 17513, 10524)],
 ['xinnong_4:idle', frame(-4522, -759, 13743, 9182)],
 ['yanusi_7:idle', frame(-1532, -963, 11101, 6334)],
 ['yunxian_2:idle', frame(-5089, -53, 13620, 10526)],
 ['yunxian_3:idle', frame(375, 297, 7819, 4388)],
 ['aogusite_3:normal', frame(-2389, -1444, 2481, 1508)],
 ['feiteliedadi_4:idle1', frame(238, 190, 14739, 8475)],
 ['feiteliedadi_4:idle10', frame(238, 190, 14739, 8475)],
 ['feiteliedadi_4:idle12', rotatedFrame(-2930, -3074, 19032, 9444, -10.08)],
 ['feiteliedadi_4:idle15', frame(-3552, -1762, 18286, 10732)],
 ['feiteliedadi_4:idle16', rotatedFrame(-4611, -1032, 17994, 11996, 7.77)],
 ['feiteliedadi_4:idle17', rotatedFrame(-9394, -1782, 22170, 16353, 6.95)],
 ['feiteliedadi_4:idle2', rotatedFrame(-2522, -4336, 19298, 8017, -20.27)],
 ['feiteliedadi_4:idle20', rotatedFrame(-5574, -2104, 19326, 12212, 5.67)],
 ['feiteliedadi_4:idle21', rotatedFrame(-2749, -2936, 18441, 9158, -8.42)],
 ['feiteliedadi_4:idle22', rotatedFrame(-3544, -3012, 19501, 10180, -8.37)],
 ['feiteliedadi_4:idle23', rotatedFrame(-4598, -2843, 20691, 11598, -8.38)],
 ['feiteliedadi_4:idle25', rotatedFrame(-8435, -4197, 24298, 14495, -9.97)],
 ['feiteliedadi_4:idle27', rotatedFrame(-8352, -3721, 24380, 15051, -6)],
 ['feiteliedadi_4:idle29', frame(195, 171, 14745, 8510)],
 ['feiteliedadi_4:idle3', rotatedFrame(-2602, 470, 15554, 10941, 10.8)],
 ['feiteliedadi_4:idle30', frame(181, 160, 14766, 8535)],
 ['feiteliedadi_4:idle32', frame(181, 160, 14766, 8535)],
 ['feiteliedadi_4:idle33', frame(181, 160, 14766, 8535)],
 ['feiteliedadi_4:idle35', frame(181, 160, 14766, 8535)],
 ['feiteliedadi_4:idle36', frame(181, 160, 14766, 8535)],
 ['feiteliedadi_4:idle38', frame(-3442, -2292, 18204, 10129)],
 ['feiteliedadi_4:idle39', frame(-3442, -2292, 18204, 10129)],
 ['feiteliedadi_4:idle4', rotatedFrame(-1369, -2331, 17376, 8380, -9.46)],
 ['feiteliedadi_4:idle41', frame(-3006, -1900, 17801, 10041)],
 ['feiteliedadi_4:idle42', frame(-3006, -1900, 17801, 10041)],
 ['feiteliedadi_4:idle50', frame(-6795, -2475, 21308, 13633)],
 ['feiteliedadi_4:idle6', frame(238, 190, 14739, 8475)],
 ['feiteliedadi_4:idle7', frame(-3234, -1317, 17996, 10828)],
 ['feiteliedadi_4:idle8', rotatedFrame(-4239, -311, 16935, 11870, 11.36)],
 ['feiteliekaer_3:idle1', frame(39, 33, 5283, 3125)],
 ['feiteliekaer_3:idle2', frame(39, 33, 5283, 3125)],
 ['feiteliekaer_3:idle3', frame(-2253, -978, 8230, 5203)],
 ['feiteliekaer_3:idle4', frame(-2270, -1125, 8213, 5056)],
 ['feiteliekaer_3:idle5', frame(-2340, -945, 8416, 5371)],
 ['mojiaduoer_4:idle10', mogadorVideoInset],
 ['mojiaduoer_4:idle11', mogadorVideoInset],
 ['mojiaduoer_4:idle12', mogadorVideoInset],
 ['mojiaduoer_4:idle13', mogadorVideoInset],
 ['mojiaduoer_4:idle14', mogadorVideoInset],
 ['mojiaduoer_4:idle15', mogadorVideoInset],
 ['mojiaduoer_4:idle2', mogadorVideoInset],
 ['mojiaduoer_4:idle3', mogadorVideoInset],
 ['mojiaduoer_4:idle4', mogadorVideoInset],
 ['mojiaduoer_4:idle5', mogadorVideoInset],
 ['mojiaduoer_4:idle6', mogadorVideoInset],
 ['mojiaduoer_4:idle7', mogadorVideoInset],
 ['mojiaduoer_4:idle8', mogadorVideoInset],
 ['mojiaduoer_4:idle9', mogadorVideoInset],
 ['xinnong_4:idle8', frame(-4429, -670, 13636, 9142)],
 ['balaka_2:normal', frame(335, 226, 5724, 3090)],
 ['bawu_2:normal', frame(-1625, 32, 1720, 1994)],
 ['changmen_6:normal', frame(643, 234, 5547, 3555)],
 ['fuluoxiluofu_3:normal', frame(-1039, -320, 1937, 1408)],
 ['geluosite_3:normal', frame(-1881, -1092, 2010, 1249)],
 ['guanghui_8:normal', frame(-2511, 51, 2980, 3151)],
 ['haerfude_2:normal', frame(-2529, -1851, 2855, 1991)],
 ['i404_2:normal', frame(-1434, 29, 1251, 1545)],
 ['i404_3:normal', frame(-1434, 29, 1251, 1545)],
 ['jianwu_3:normal', frame(-6803, -3303, 6784, 4541)],
 ['jianwu_4:normal', frame(-2220, 51, 2330, 2633)],
 ['jianye_5:ex', frame(-1741, -1099, 1860, 849)],
 ['jianye_5:normal', frame(-1741, -1099, 1860, 849)],
 ['kaiersheng_3:ex', frame(-2559, -284, 2575, 2710)],
 ['kaiersheng_3:normal', frame(-2559, -284, 2575, 2710)],
 ['kala_2:normal', frame(-1931, 82, 1948, 2246)],
 ['kansasi_2:normal', frame(-1673, 27, 1866, 2421)],
 ['kashan_2:normal', frame(-2667, 3, 2292, 2563)],
 ['kewei_5:normal', frame(-2131, -1312, 2182, 1090)],
 ['kuangsan_2:normal', frame(-2603, 265, 2580, 3238)],
 ['linglai_2:normal', frame(-1759, -1061, 1625, 997)],
 ['lingyangzhe3_2:normal', frame(398, 344, 6397, 3793)],
 ['liuliang_2:normal', frame(-2807, 69, 2968, 3448)],
 ['moermansike_3:normal', frame(-3219, -2057, 3482, 1669)],
 ['molisen_3:ex', frame(-1632, 48, 1636, 1880)],
 ['nengdai_9:normal', frame(-1397, 24, 1397, 1577)],
 ['qiershazhi_3:normal', frame(-2776, -1480, 2777, 1468)],
 ['qisheng_3:ex', frame(-1794, 26, 1975, 3048)],
 ['sikula_4:normal', frame(-2347, -172, 2242, 3093)],
 ['sisinai_2:normal', frame(-2919, -820, 3400, 2914)],
 ['siwanshi_4:normal', frame(-1123, -604, 1245, 707)],
 ['talin_4:normal', frame(-2589, 57, 2460, 3103)],
 ['tansuozhe_2:normal', frame(-3556, -955, 3362, 3174)],
 ['weikesibao_2:ex', vicksburgExFrame],
 ['weikesibao_2:normal', vicksburgNormalFrame],
 ['wuerlixi_4:normal', frame(-4829, -3727, 5332, 2050)],
 ['xingzuo_2:normal', frame(-1317, -528, 1432, 1141)],
 ['xinzexi_4:normal', frame(-3950, -2193, 3954, 2162)],
 ['yongqi_2:normal', frame(-1867, 101, 1905, 2376)],
 ['yueke_ger_4:normal', frame(-1763, 69, 1867, 2866)],
 ['yunxian_3:idle4', frame(-510, 146, 8804, 5211)],
 ['z15_2:normal', frame(-2019, 35, 1975, 2500)],
 ['z52_2:normal', frame(-1750, -995, 1836, 1121)],
 ['zhaohe_4:normal', frame(-1486, 60, 1769, 1894)],
]);
export function authoredSceneExportCrop(id, motion, format) {
 const key = id + ':' + motion;
 return sceneExportCrops.get(key) ?? (format === 'video' ? sceneVideoCrops.get(key) : null) ?? null;
}
export function portraitFrameBounds(id, rectangles) {
 const rule=rules[id];if(!rule)return null;
 const valid=rectangles.filter(r=>r.visible!==false&&r.bounds?.length===4&&r.bounds.every(Number.isFinite)&&r.bounds[2]>r.bounds[0]&&r.bounds[3]>r.bounds[1]);
 const anchors=valid.filter(r=>rule.anchors?.includes(r.name));
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
