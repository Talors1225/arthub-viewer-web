(function () {
  'use strict';

  // Model-space rectangles inside the scene mattes. Both viewers use the
  // original animation and draw order inside these apertures.
  const authoredFrames = new Map([
    ['20110_skin_Arpeggio07.json', { minX: -3618, minY: -2048, maxX: 3614, maxY: 2042 }], // bg / box2
    ['30300_skin_Bluebuck03c.json', { minX: -2890, minY: -1740, maxX: 2740, maxY: 1690 }], // background_108
    ['40230_skin_Scorching03b.json', { minX: -1930, minY: -1250, maxX: 1980, maxY: 1070 }], // tx_heiping2
    ['20030_skin_Pyrock03b.json', { minX: -2470, minY: -1740, maxX: 2860, maxY: 1430 }], // AAAkuang
  ]);
  // These actions move artwork or a transition across the interaction camera.
  // Preserve the camera composition instead of fitting the union of that motion.
  const actionFrames = new Map([
    ['60310_skin_Tizona04b.json', {
      actions: ['click6', 'idle2', 'idle3', 'click7_1', 'click7_2', 'click8', 'click9', 'click10', 'click12'],
      frame: { minX: -1350, minY: -1050, maxX: 1130, maxY: 850 },
    }],
    ['78020_skin_CurtanaSP03b.json', {
      actions: ['click6'], // The scope opens over the normal room camera.
      frame: { minX: -3390, minY: -1460, maxX: 3240, maxY: 2610 },
    }],
    ['60020_skin_Joyeuse05.json', {
      actions: ['click7'], // Allow the phone bezel to travel across the enlarged car art.
      frame: { minX: -2860, minY: -1710, maxX: 3020, maxY: 1720 },
    }],
    ['60320_skin_dainslef03.json', {
      actions: ['click2'], // Animated letterbox over the opening room shot.
      frame: { minX: -3300, minY: -2080, maxX: 3220, maxY: 2320 },
    }],
    ['60350_skin_Ijen03.json', {
      actions: ['click7', 'click7_b', 'click9'],
      frame: { minX: -2470, minY: -440, maxX: 2800, maxY: 3040 },
    }],
    ['20080_skin_Melody06.json', {
      actions: ['click10b', 'guochang'],
      frame: { minX: -3340, minY: -1980, maxX: 3210, maxY: 2470 },
    }],
    ['CG0085_TwinStarAttendantsB.json', {
      actions: ['click3', 'click4', 'click5', 'click6', 'guochang'],
      frame: { minX: -4740, minY: -2040, maxX: 4580, maxY: 4240 },
    }],
    ['10070_skin_Cinnabar03c.json', {
      actions: ['click11_2'],
      frame: { minX: -4500, minY: -2510, maxX: 4500, maxY: 3500 },
    }],
    ['50030_skin_Stinger03.json', {
      actions: ['in'], // The curtain opens while the room camera pulls back.
      frame: { minX: -3330, minY: -2060, maxX: 3560, maxY: 2590 },
    }],
    ['60300_skin_Moralltach03.json', {
      actions: ['guochang1', 'guochang2', 'guochang3'],
      frame: { minX: -3750, minY: -2240, maxX: 3750, maxY: 2600 },
    }],
  ]);

  const wideEdge = { TX_BG_black10: ['TX_BG_black10', 'TX_BG_black11', 'TX_BG_black12', 'TX_BG_black13'] };
  const frameMattes = new Map([
    ['20030_skin_Pyrock03b.json', { AAAkuang: ['AAAkuang'] }],
    ['20110_skin_Arpeggio07.json', { box: ['box'], box2: ['box2'] }],
    ['20140_skin_Capriccio04b.json', { tx_heiping4: ['tx_heiping4'] }],
    ['30180_skin_Machairodus05b.json', { bgkuang1: ['bgkuang1'], bgkuang2: ['bgkuang2'] }],
    ['30300_skin_Bluebuck03c.json', wideEdge],
    ['40230_skin_Scorching03b.json', { tx_heiping2: ['tx_heiping2'] }],
    ['60310_skin_Tizona04a.json', { tx_heiping4: ['tx_heiping4'] }],
    ['60310_skin_Tizona04b.json', { tx_heiping4: ['tx_heiping4'] }],
    ['70310_skin_Atum06b.json', { TX_BG_black: ['TX_BG_black', 'TX_BG_black2', 'TX_BG_black3', 'TX_BG_black4'] }],
    ['70400_skin_LycorisRadiata03b.json', { heikuang: ['heikuang'] }],
    ['78050_skin_Osiris03a.json', wideEdge],
    ['78050_skin_Osiris03b.json', wideEdge],
    ['78050_skin_Osiris03b_ASMR.json', wideEdge],
  ]);

  function modelFrame(skeletonFile, animation) {
    const scene = actionFrames.get(skeletonFile);
    if (scene?.actions.includes(animation)) return scene.frame;
    return authoredFrames.get(skeletonFile);
  }

  function interactionFrame(layer, animation) {
    if (!layer) return null;
    const frame = modelFrame(layer.def.skeleton.split('/').pop(), animation);
    const { x, y, scaleX, scaleY, rotation } = layer.def.render;
    if (!frame || rotation || !(scaleX > 0 && scaleY > 0)) return null;
    return {
      minX: x + frame.minX * scaleX, minY: y + frame.minY * scaleY,
      maxX: x + frame.maxX * scaleX, maxY: y + frame.maxY * scaleY,
    };
  }

  function drawLayer(renderer, layer, animation = layer.state?.getCurrent(0)?.animation.name) {
    const { skeleton } = layer;
    const pma = layer.pma ?? Boolean(layer.atlas.pages[0]?.pma);
    const file = layer.source?.skel ?? layer.def?.skeleton?.split('/').pop();
    const mattes = frameMattes.get(file);
    // Osiris uses the edge texture as part of the opening reveal.
    // Cinnabar's changing close-up mask is intentionally outside this list.
    if (!mattes || (file === '78050_skin_Osiris03a.json' && animation === 'in')) {
      renderer.drawSkeleton(skeleton, pma);
      return;
    }
    const muted = [];
    for (const [region, names] of Object.entries(mattes)) {
      for (const name of names) {
        const slot = skeleton.findSlot(name);
        if (slot?.attachment?.region?.name !== region || slot.color.a <= 0) continue;
        muted.push([slot, slot.color.a]);
        slot.color.a = 0;
      }
    }
    try { renderer.drawSkeleton(skeleton, pma); }
    finally { for (const [slot, opacity] of muted) slot.color.a = opacity; }
  }

  window.CrossCoreSceneFraming = { modelFrame, interactionFrame, drawLayer };
})();
