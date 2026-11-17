(() => {
  'use strict';

  const catalogURL = new URL('../favorite-wallpapers/catalog.json?v=20261117', document.currentScript.src);
  // Match the verified 16:9 wallpaper camera in the preview and both exporters.
  const frame = Object.freeze({ minX: -960, minY: -540, maxX: 960, maxY: 540 });
  let catalogPromise;

  function readCatalog() {
    if (!catalogPromise) {
      catalogPromise = window.SpineKit.fetchJSON(catalogURL.href).catch(error => {
        catalogPromise = null;
        throw error;
      });
    }
    return catalogPromise;
  }

  function layerTransform(layer, camera) {
    const depth = layer.position[2] - camera.position[2];
    const halfHeight = camera.orthographic ? camera.size : Math.tan(camera.fov * Math.PI / 360) * depth;
    if (!(halfHeight > 0) || !layer.planar || layer.angle !== 0 || layer.stretch[0] !== layer.stretch[1]) {
      throw new Error('珍藏品壁纸包含不支持的镜头变换');
    }
    const factor = frame.maxY / halfHeight;
    return [
      (layer.position[0] - camera.position[0]) * factor,
      (layer.position[1] - camera.position[1]) * factor,
      layer.scale * layer.stretch[0] * factor,
    ];
  }

  async function loadVariant(reference) {
    const catalog = await readCatalog();
    const scene = catalog.items.find(item => item.id === reference.wallpaperId);
    if (!scene) throw new Error('缺少珍藏品壁纸 ' + reference.wallpaperId);
    // The authored touch timeline lists the character before its background tracks.
    const character = scene.layers.find(layer => layer.id === scene.timelines.touch.tracks[0]?.target);
    if (!character) throw new Error('珍藏品壁纸缺少角色层');
    const publicRoot = window.ARTHUB_COS_CONFIG?.root;
    if (!publicRoot) throw new Error('未配置 NIKKE 资源桶');
    const resourceRoot = new URL(catalog.assetPrefix + '/' + encodeURIComponent(scene.id) + '/', publicRoot.replace(/\/?$/, '/'));
    const assetURL = path => new URL(path.split('/').map(encodeURIComponent).join('/'), resourceRoot).href;

    function sourceFor(layer) {
      return {
        skel: layer.skel, atlas: layer.atlas, format: 'binary', previewSkin: layer.skin,
        drawOrder: layer.order, previewTransform: layerTransform(layer, scene.camera),
        wallpaperLayer: layer,
        wallpaperFiles: {
          skeletonURL: assetURL(layer.skel), atlasURL: assetURL(layer.atlas),
          atlasPageURL: name => assetURL('textures/' + name),
        },
      };
    }

    return {
      ...reference, ...sourceFor(character), wallpaperScene: scene,
      compositeLayers: scene.layers.filter(layer => layer !== character).map(layer => ({
        ...sourceFor(layer), reuseBase: layer.skel === character.skel && layer.atlas === character.atlas,
      })),
    };
  }

  function durationOf(scene, name) {
    const timeline = scene.timelines[name];
    const jump = name === 'idle' && timeline.jumps.find(item => item.from > item.to && item.to === 0);
    return jump ? jump.from : Math.max(timeline.duration || 0, ...timeline.tracks.map(track => track.start + track.duration));
  }

  function actions(scene, SP) {
    return Object.entries({ idle: '待机', touch: '触碰动作' }).map(([name, label]) => {
      const duration = durationOf(scene, name);
      return { name, label, duration, clock: new SP.Animation(name, [], duration) };
    });
  }

  function timelineTime(duration, seconds, loop) {
    const time = Math.max(0, seconds);
    return loop ? time % duration : Math.min(time, duration);
  }

  function sampleLayer(layer, scene, name, seconds, loop, SP) {
    const authored = layer.source.wallpaperLayer;
    const time = timelineTime(durationOf(scene, name), seconds, loop);
    const trackAt = (timeline, cursor) => timeline.tracks.find(track => (
      track.target === authored.id && cursor >= track.start && cursor <= track.start + track.duration
    ));
    let track = trackAt(scene.timelines[name], time);
    let cursor = time;
    if (!track && name !== 'idle') {
      cursor = timelineTime(durationOf(scene, 'idle'), time, true);
      track = trackAt(scene.timelines.idle, cursor);
    }
    const animation = layer.data.findAnimation(track?.animation || authored.animation);
    layer.skeleton.setToSetupPose();
    if (animation) {
      const poseTime = track ? (cursor - track.start) * track.speed + track.clipIn : time;
      animation.apply(layer.skeleton, 0, poseTime, track?.loop ?? true, null, 1, SP.MixBlend.replace, SP.MixDirection.mixIn);
    }
  }

  window.NikkeWallpaper = { frame, loadVariant, actions, sampleLayer };
})();
