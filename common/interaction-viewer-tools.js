/* Standard ArtHub tools shared by interactive Spine and Live2D viewers. */
(() => {
  'use strict';
  const K = window.SpineKit, $ = id => document.getElementById(id);
  const poseTools = document.body.dataset.poseTools !== 'disabled';
  const siteRoot = new URL('../', document.currentScript.src).pathname;
  K.siteRoot = () => siteRoot;
  // Earlier web builds saved Azur Lane's relative asset base as a history URL.
  // Keep each record and repair only that viewer link so cross-game jumps work.
  for (const key of ['gav:hist', 'gav:favs']) try {
    const items = JSON.parse(localStorage.getItem(key) || '[]'); if (!Array.isArray(items)) continue; let changed = false;
    for (const item of items) if (item?.src === 'azurlane-interaction' && /^\.\.\/viewer\/index\.html\?/.test(item.u || '')) {
      const url = new URL(item.u, location.href); item.u = siteRoot + 'azurlane-interaction/viewer/index.html' + url.search + url.hash; changed = true;
    }
    if (changed) localStorage.setItem(key, JSON.stringify(items));
  } catch (_) { /* A disabled local store must not prevent the viewer opening. */ }
  const standardSearch = K.searchStaticCatalog, searchIndexes = new Map();
  K.searchStaticCatalog = async query => {
    const q = String(query || '').trim().toLocaleLowerCase(); if (q.length < 2) return [];
    const extra = [
      { key: 'azurlane', group: '碧蓝航线', index: 'azurlane-interaction/characters.json', page: 'azurlane-interaction/viewer/index.html?id=' },
      { key: 'crosscore-interaction', group: '交错战线 · 互动', index: 'crosscore-interaction/catalog/catalog.json', page: 'crosscore-interaction/viewer/index.html?model=' },
      { key: 'crosscore', group: '交错战线 · Spine', index: 'crosscore/crosscore_chars.json?v=3d25e0f795d0', page: 'crosscore/viewer/cutscene.html?id=' },
    ];
    const results = await Promise.allSettled(extra.map(async game => {
      if (!searchIndexes.has(game.key)) {
        const pending = K.fetchJSON(siteRoot + game.index).then(data => data.characters || data.models || []);
        searchIndexes.set(game.key, pending); pending.catch(() => searchIndexes.delete(game.key));
      }
      return (await searchIndexes.get(game.key)).filter(row => row.available !== false && [row.id, row.name, row.displayName, row.originalName, row.sourceBundle, row.characterName, row.skinName, row.title, row.group].filter(Boolean).join(' ').toLocaleLowerCase().includes(q)).slice(0, 15)
        .map(row => ({ group: game.group, title: row.displayName || row.name || row.id, sub: game.key === 'crosscore' ? (row.category || 'Spine') : (row.skinName || String(row.id)), url: siteRoot + game.page + encodeURIComponent(row.id) }));
    }));
    return [...results.flatMap(result => result.status === 'fulfilled' ? result.value : []), ...await standardSearch(query).catch(() => [])];
  };
  const fields = ['x', 'y', 'rotation', 'scaleX', 'scaleY'];
  const poseOf = bone => Object.fromEntries(fields.map(key => [key, bone[key]]));
  const worldUpdate = (skeleton, ns) => skeleton.updateWorldTransform(ns.Physics?.pose);
  const path = (ctx, points, close = true) => {
    if (!points.length) return;
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
    if (close) ctx.closePath(); ctx.stroke();
  };
  function triangleHit(x, y, a, b, c) {
    if (!a || !b || !c || Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) < 1e-5) return false;
    const cross = (p, q) => (x - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (y - q[1]);
    const d = [cross(a, b), cross(b, c), cross(c, a)];
    return !(d.some(v => v < 0) && d.some(v => v > 0));
  }
  let pickCanvas, pickContext;
  const unreadableImages = new WeakSet();
  function partHit(x, y, geometry) {
    if (!geometry?.triangles) return false;
    const { points, triangles, uvs, image } = geometry;
    for (let i = 0; i < triangles.length; i += 3) {
      const ids = Array.from(triangles.slice(i, i + 3)), [a, b, c] = ids.map(index => points[index]);
      if (!triangleHit(x, y, a, b, c)) continue;
      if (!image || !uvs || unreadableImages.has(image)) return true;
      const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      const wa = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det;
      const wb = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det;
      const weights = [wa, wb, 1 - wa - wb];
      const u = ids.reduce((sum, index, n) => sum + weights[n] * uvs[index * 2], 0);
      const v = ids.reduce((sum, index, n) => sum + weights[n] * uvs[index * 2 + 1], 0);
      try {
        if (!pickCanvas) { pickCanvas = document.createElement('canvas'); pickCanvas.width = pickCanvas.height = 1; pickContext = pickCanvas.getContext('2d', { willReadFrequently: true }); }
        pickContext.clearRect(0, 0, 1, 1);
        const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
        pickContext.drawImage(image, Math.max(0, Math.min(width - 1, Math.floor(u * width))), Math.max(0, Math.min(height - 1, Math.floor(v * height))), 1, 1, 0, 0, 1, 1);
        if (pickContext.getImageData(0, 0, 1, 1).data[3] > 8) return true;
      } catch (_) {
        unreadableImages.add(image); if (pickCanvas) pickCanvas.width = 1;
        return true;
      }
    }
    return false;
  }

  // Each runtime owns its native objects. Overrides are restored before its
  // next animation update so visibility and bone edits never accumulate.
  window.createInteractionSpineEditor = ({ layers, ns, project, unproject }) => {
    const hidden = new Set(), poses = new Map(), savedAlpha = new Map(), savedPose = new Map();
    const parts = [], bones = [];
    layers.forEach((layer, index) => {
      for (const slot of layer.skeleton.slots) parts.push({ id: `${index}:${slot.data.name}`, name: slot.data.name, layer, slot });
      for (const bone of layer.skeleton.bones) bones.push({ id: `${index}:${bone.data.name}`, name: bone.data.name, layer, bone });
    });
    function geometry(part) {
      const attachment = part.slot.attachment;
      if (!attachment || !part.slot.bone.active || part.slot.color.a <= .001) return null;
      let vertices, triangles;
      if (attachment instanceof ns.RegionAttachment) {
        vertices = new Float32Array(8);
        // Region attachments use a Bone in 3.8/4.0 and a Slot in 4.1+.
        attachment.computeWorldVertices('sequence' in attachment ? part.slot : part.slot.bone, vertices, 0, 2);
        triangles = [0, 1, 2, 2, 3, 0];
      } else if (attachment instanceof ns.MeshAttachment) {
        vertices = new Float32Array(attachment.worldVerticesLength);
        attachment.computeWorldVertices(part.slot, 0, vertices.length, vertices, 0, 2);
        triangles = attachment.triangles;
      } else if (attachment.worldVerticesLength) {
        vertices = new Float32Array(attachment.worldVerticesLength);
        attachment.computeWorldVertices(part.slot, 0, vertices.length, vertices, 0, 2);
      } else return null;
      const points = [];
      for (let i = 0; i < vertices.length; i += 2) { const p = project(vertices[i], vertices[i + 1]); points.push([p.x, p.y]); }
      const mesh = attachment instanceof ns.MeshAttachment;
      return { points, triangles, uvs: attachment.uvs, image: (attachment.region?.texture || attachment.region?.page?.texture)?.getImage?.(), mesh, hull: mesh && attachment.hullLength ? points.slice(0, attachment.hullLength / 2) : points,
        kind: ns.PathAttachment && attachment instanceof ns.PathAttachment ? 'paths' : ns.ClippingAttachment && attachment instanceof ns.ClippingAttachment ? 'clipping' : 'regions' };
    }
    return {
      type: 'spine', hidden, poses, parts: () => parts, bones: () => bones, geometry,
      drawOrder: part => parts.length * layers.indexOf(part.layer) + part.layer.skeleton.drawOrder.indexOf(part.slot),
      before() {
        for (const [slot, alpha] of savedAlpha) slot.color.a = alpha;
        for (const [bone, pose] of savedPose) Object.assign(bone, pose);
        savedAlpha.clear(); savedPose.clear();
      },
      after() {
        for (const part of parts) if (hidden.has(part.id)) { savedAlpha.set(part.slot, part.slot.color.a); part.slot.color.a = 0; }
        const dirty = new Set();
        for (const item of bones) if (poses.has(item.id)) {
          savedPose.set(item.bone, poseOf(item.bone)); Object.assign(item.bone, poses.get(item.id)); dirty.add(item.layer.skeleton);
        }
        for (const skeleton of dirty) worldUpdate(skeleton, ns);
      },
      pose: id => { const item = bones.find(item => item.id === id); return item ? poseOf(item.bone) : null; },
      setPose(id, values) { const item = bones.find(item => item.id === id); if (item) poses.set(id, { ...poseOf(item.bone), ...values }); },
      moveBone(id, x, y) {
        const item = bones.find(item => item.id === id); if (!item) return;
        const p = unproject(x, y), parent = item.bone.parent;
        if (parent) {
          const dx = p.x - parent.worldX, dy = p.y - parent.worldY, det = parent.a * parent.d - parent.b * parent.c;
          if (Math.abs(det) > 1e-8) this.setPose(id, { x: (dx * parent.d - dy * parent.b) / det, y: (dy * parent.a - dx * parent.c) / det });
        } else this.setPose(id, { x: (p.x - item.layer.skeleton.x) / item.layer.skeleton.scaleX, y: (p.y - item.layer.skeleton.y) / item.layer.skeleton.scaleY });
      },
      bonePoint: item => project(item.bone.worldX, item.bone.worldY),
      boneEnd: item => project(item.bone.worldX + item.bone.a * item.bone.data.length, item.bone.worldY + item.bone.c * item.bone.data.length),
      capturePose: () => Object.fromEntries(bones.map(item => [item.id, poseOf(item.bone)])),
      applyPose(value) { poses.clear(); for (const item of bones) if (value[item.id]) poses.set(item.id, value[item.id]); },
      resetPose() { this.before(); poses.clear(); },
    };
  };

  window.createInteractionLive2DEditor = ({ live, core, hitAreas = [] }) => {
    const hidden = new Set(), poses = new Map(), saved = new Map(), drawables = core.drawables;
    const parts = drawables.ids.map((name, index) => ({ id: name, name, index }));
    const parameters = core.parameters.ids.map((name, index) => ({ id: name, name, index }));
    const interactionMeshes = new Set(hitAreas.map(area => area.id));
    let dirty = false;
    return {
      type: 'live2d', hidden, poses, parts: () => parts, bones: () => [], parameters: () => parameters,
      pickable: part => !interactionMeshes.has(part.id) && drawables.textureIndices[part.index] >= 0,
      before() { for (const [index, alpha] of saved) drawables.opacities[index] = alpha; saved.clear(); },
      applyParameters() { for (const [id, value] of poses) { const i = core.parameters.ids.indexOf(id); if (i >= 0) core.parameters.values[i] = value; } },
      after() {
        if (dirty) { this.applyParameters(); live.internalModel.coreModel.update(); dirty = false; }
        for (const part of parts) if (hidden.has(part.id)) { saved.set(part.index, drawables.opacities[part.index]); drawables.opacities[part.index] = 0; }
      },
      geometry(part) {
        if (drawables.opacities[part.index] <= .001) return null;
        const vertices = live.internalModel.getDrawableVertices(part.id), points = [];
        for (let i = 0; i < vertices.length; i += 2) {
          const p = new PIXI.Point(vertices[i], vertices[i + 1]); live.internalModel.localTransform.apply(p, p); live.worldTransform.apply(p, p); points.push([p.x, p.y]);
        }
        return { points, triangles: drawables.indices[part.index], mesh: true };
      },
      parameter(item) { const p = core.parameters, i = item.index; return { value: poses.get(item.id) ?? p.values[i], min: p.minimumValues[i], max: p.maximumValues[i], default: p.defaultValues[i] }; },
      setParameter(id, value) { poses.set(id, value); dirty = true; },
      capturePose: () => Object.fromEntries(parameters.map(item => [item.id, core.parameters.values[item.index]])),
      applyPose(value) { poses.clear(); for (const item of parameters) if (Number.isFinite(value[item.id])) poses.set(item.id, value[item.id]); dirty = true; },
      resetPose() { for (const item of parameters) if (poses.has(item.id)) core.parameters.values[item.index] = core.parameters.defaultValues[item.index]; poses.clear(); dirty = true; },
    };
  };

  // Reuse the current GL textures, but animate independent skeleton/state
  // objects. Export cannot trigger the portrait controller's events or phases.
  window.createInteractionSpineCapture = ({ layers, ns, canvas, renderer, gl, editor, animation, restore, drawScene, visible = () => true, extraBounds = () => [] }) => {
    const width = canvas.width, height = canvas.height, camera = renderer.camera;
    const saved = { width: camera.viewportWidth, height: camera.viewportHeight, zoom: camera.zoom, x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const copies = layers.map((layer, index) => {
      const original = layer.skeleton, skeleton = new ns.Skeleton(original.data);
      if (original.skin) skeleton.setSkin(original.skin);
      Object.assign(skeleton, { x: original.x, y: original.y, scaleX: original.scaleX, scaleY: original.scaleY });
      Object.assign(skeleton.color, original.color);
      original.bones.forEach((bone, i) => Object.assign(skeleton.bones[i], poseOf(bone)));
      original.slots.forEach((slot, i) => { skeleton.slots[i].setAttachment(slot.attachment); Object.assign(skeleton.slots[i].color, slot.color); skeleton.slots[i].deform = slot.deform.slice(); if (slot.darkColor && skeleton.slots[i].darkColor) Object.assign(skeleton.slots[i].darkColor, slot.darkColor); });
      skeleton.drawOrder = original.drawOrder.map(slot => skeleton.slots[slot.data.index]);
      const state = new ns.AnimationState(new ns.AnimationStateData(original.data));
      for (const entry of layer.state.tracks.filter(Boolean)) {
        if (!original.data.findAnimation(entry.animation.name)) continue;
        const copy = state.setAnimation(entry.trackIndex, entry.animation.name, entry.loop); copy.mixDuration = 0; copy.trackTime = entry.trackTime;
      }
      const track = original.data.findAnimation(animation.name);
      if (track) { state.clearTracks(); state.setAnimation(0, track.name, false).mixDuration = 0; }
      const base = skeleton.bones.map(poseOf);
      return { ...layer, skeleton, state, index, base, pma: layer.atlas?.pages?.[0]?.pma ?? true };
    });
    // Measure the frozen visible pose in model units, independently of the camera.
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const include = b => { if (b) for (const key of Object.keys(bounds)) bounds[key] = key.startsWith('min') ? Math.min(bounds[key], b[key]) : Math.max(bounds[key], b[key]); };
    copies.forEach((item, i) => {
      for (const slot of item.skeleton.slots) if (editor?.hidden.has(`${i}:${slot.data.name}`)) slot.color.a = 0;
      worldUpdate(item.skeleton, ns);
      if (visible(layers[i], i)) include(K.measureBounds(item.skeleton, ns, false));
    });
    for (const b of extraBounds()) include(b);
    const pose = time => {
      for (const item of copies) {
        item.base.forEach((base, i) => Object.assign(item.skeleton.bones[i], base));
        if (time !== null) { for (const entry of item.state.tracks.filter(Boolean)) { entry.trackTime = time; entry.animationLast = entry.nextAnimationLast = time; } item.state.apply(item.skeleton); }
        for (const bone of item.skeleton.bones) { const edited = editor?.poses.get(`${item.index}:${bone.data.name}`); if (edited) Object.assign(bone, edited); }
        for (const slot of item.skeleton.slots) if (editor?.hidden.has(`${item.index}:${slot.data.name}`)) slot.color.a = 0;
        worldUpdate(item.skeleton, ns);
      }
    };
    return {
      pngSize: quality => ({ ...K.exportDimensions(bounds, quality), fullFrame: true }),
      measure(time) {
        pose(time);
        const frame = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        for (const b of [...copies.map((item, i) => visible(layers[i], i) ? K.measureBounds(item.skeleton, ns, false) : null), ...extraBounds()]) {
          if (b) for (const key of Object.keys(frame)) frame[key] = key.startsWith('min') ? Math.min(frame[key], b[key]) : Math.max(frame[key], b[key]);
        }
        return frame;
      },
      rewind() { pose(0); },
      draw(time, size, background) {
        if (size.fullFrame && !size.tile && size.tiled !== false) return K.renderTiledPNG(size, tile => this.draw(time, {
          ...size, width: tile.width, height: tile.height, tile: true,
          centerX: size.centerX + (tile.x + tile.width / 2 - size.width / 2) / size.scale,
          centerY: size.centerY + (size.height / 2 - tile.y - tile.height / 2) / size.scale,
        }, background));
        canvas.width = size.width; canvas.height = size.height; gl.viewport(0, 0, size.width, size.height);
        camera.setViewport(size.width, size.height); camera.zoom = size.fullFrame ? 1 / size.scale : saved.width * saved.zoom / size.width;
        camera.position.set(size.fullFrame ? size.centerX : saved.x, size.fullFrame ? size.centerY : saved.y, saved.z); camera.update();
        const solidBackground = background && background !== 'checker';
        const color = K.parseColor(solidBackground ? background : '#000000', [0, 0, 0]);
        gl.clearColor(...color, solidBackground ? 1 : 0); gl.clear(gl.COLOR_BUFFER_BIT);
        pose(time);
        if (drawScene) drawScene(copies, size);
        else { renderer.begin(); for (const item of copies) renderer.drawSkeleton(item.skeleton, item.pma); renderer.end(); }
        return canvas;
      },
      dispose() {
        canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height);
        camera.setViewport(saved.width, saved.height); camera.zoom = saved.zoom; camera.position.set(saved.x, saved.y, saved.z); camera.update(); restore();
      },
    };
  };

  // Install the same toolbar entries before kit.js builds its compact menu.
  const tools = [
    ['btnRetry', '重新加载当前资源'], ['btnRestoreParts', '恢复默认部件显示'], ['btnGlobalSearch', '全局搜索'],
    ['btnPartEdit', '部件编辑'], ...(poseTools ? [['btnBoneEdit', '骨骼编辑模式']] : []), ['btnDebug', '骨骼 / 网格 / 包围盒 调试视图'],
    ['btnPng', '导出 PNG 立绘'], ['btnGif', '导出动画'], ['btnBg', '背景颜色 / 预设'],
    ['btnVoiceSettings', '角色声音设置'], ['btnPresetImmersive', '沉浸模式'],
  ];
  const strip = $('toolStrip');
  const legacy = document.createElement('div'); legacy.hidden = true; document.body.append(legacy);
  for (const id of ['fit', 'reset']) if ($(id)) legacy.append($(id));
  for (const [id, title] of tools) {
    const button = document.createElement('button'); button.type = 'button'; button.id = id; button.title = title; button.setAttribute('aria-label', title); strip.append(button);
  }
  const tabs = document.querySelector('#floatPanel .rp-tabs');
  const extras = document.createElement('div'); extras.className = 'rp-extra-tabs'; extras.setAttribute('role', 'tablist'); extras.setAttribute('aria-label', '立绘互动');
  for (const tab of [...tabs.children]) if (tab.dataset.panelTab !== 'anim') extras.append(tab);
  document.querySelector('#floatPanel .rp-panel-head').after(extras);
  for (const [name, label] of [['parts', '部件'], ...(poseTools ? [['pose', '姿势']] : [])]) {
    const tab = document.createElement('button'); tab.type = 'button'; tab.dataset.panelTab = name; tab.textContent = label; tab.setAttribute('aria-selected', 'false'); tabs.append(tab);
  }
  const extraTabs = [...extras.children], phonePanel = matchMedia('(max-width: 720px)');
  const arrangeTabs = () => { const target = phonePanel.matches ? tabs : extras; for (const tab of extraTabs) target.append(tab); };
  phonePanel.addEventListener('change', arrangeTabs); arrangeTabs();
  $('floatPanel').insertAdjacentHTML('beforeend', `
    <div class="rp-page" data-panel-page="parts">
      <p id="partEditHint" class="muted">开启动画部件编辑后，点击画面可选择隐藏部件。</p>
      <button id="exitPartEdit" class="edit-btn" type="button">开启部件编辑</button>
      <div class="row"><input id="partFilter" class="text-input" type="search" placeholder="过滤部件名" aria-label="过滤部件名"></div>
      <div class="opt-row"><button id="partAll" type="button">全显</button><button id="partNone" type="button">全隐</button><button id="partInv" type="button">反选</button></div>
      <div id="slotList" class="viewer-part-list"></div>
    </div>
    <div class="rp-page" data-panel-page="pose">
      <p id="poseHint" class="muted"></p><button id="poseEditToggle" class="edit-btn" type="button">开启姿势编辑</button>
      <div class="opt-row"><button id="poseSave" type="button">保存姿势</button><button id="poseReset" type="button">恢复姿势</button><button id="poseLock" type="button" aria-pressed="false">锁定姿势</button></div>
      <input id="boneFilter" class="text-input" type="search" placeholder="过滤骨骼名 / 参数名" aria-label="过滤骨骼名或参数名">
      <select id="boneSelect" class="text-input" aria-label="选择骨骼或参数"></select>
      <div id="boneFields"></div><div id="poseList" class="anim-list"></div>
    </div>`);
  if (!poseTools) $('floatPanel').querySelector('[data-panel-page=pose]')?.remove();
  const editOverlay = document.createElement('canvas'); editOverlay.id = 'viewerEditOverlay'; editOverlay.setAttribute('aria-hidden', 'true'); $('stage').append(editOverlay);
  const exit = document.createElement('button'); exit.id = 'immersiveExit'; exit.type = 'button'; exit.textContent = '退出沉浸模式'; exit.hidden = true; document.body.append(exit);

  window.createInteractionViewerTools = (driver, ui) => {
    const cfg = driver.tools, storeKey = 'arthub:interaction-tools:' + location.pathname;
    let editor, identity, mode = '', lastRefresh = 0, selectedPart = null, dragBone = null, partPress = null, partTap = null, resumeEdit = false, poseLocked = false, popup = null, exporting = false;
    let background, exportUrl = null;
    const backgroundControl = K.createStageBackground({ stage: $('stage'),
      read: () => localStorage.getItem(storeKey + ':background'), write: value => localStorage.setItem(storeKey + ':background', value),
      onChange: value => { background = value; cfg.setBackground?.(value === 'checker' ? null : value); },
    });
    const debug = {}, paint = editOverlay.getContext('2d');
    const toast = (message, type = 'info') => K.toast(message, type);
    const report = error => { console.error(error); toast(error.message || String(error), 'err'); };
    const run = fn => { try { Promise.resolve(fn()).catch(report); } catch (error) { report(error); } };
    const requireEditor = () => { if (!editor || !driver.playback().ready) throw new Error('请先加载一个资源'); return editor; };
    const currentKey = () => cfg.identity();
    const poseKey = () => storeKey + ':poses:' + identity;
    const storedPoses = () => { try { return JSON.parse(localStorage.getItem(poseKey()) || '{}'); } catch (_) { return {}; } };
    function closePopup() {
      if (popup?._toolDismiss) { popup._toolDismiss(); return; }
      popup?.remove(); popup = null;
    }
    function showPopup(button, title, mount) {
      closePopup(); K.hideMenu();
      popup = document.createElement('div'); popup.className = 'stage-popup viewer-tools-popup'; popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', title);
      document.body.append(popup); mount(popup);
      K.attachPopupChrome(popup, {button, title, close:closePopup});
      popup.addEventListener('click', event => event.stopPropagation());
    }
    document.addEventListener('pointerdown', event => { if (popup && !popup.contains(event.target) && !event.target.closest('.ctx-menu, .tool-strip')) closePopup(); });
    function openTab(name) {
      ui.showTab(name); cfg.openPanel(true); refresh();
    }
    function setMode(next) {
      if (next === 'pose' && !poseTools) return;
      if (next) requireEditor();
      if (poseTools && next === 'pose' && mode !== 'pose') { resumeEdit = driver.playback().playing; driver.setPlaying(false); cfg.stopAudio?.(); }
      if (poseTools && mode === 'pose' && next !== 'pose') { if (!poseLocked) { editor?.resetPose(); renderBoneFields(); } if (resumeEdit) { driver.setPlaying(true); resumeEdit = false; } }
      mode = next; dragBone = null; partPress = partTap = null; selectedPart = null;
      $('stage').dataset.clickMode = mode === 'parts' ? 'part-editing' : mode === 'pose' ? 'pose' : 'audio';
      const modeButtons = [['btnPartEdit', 'parts']];
      if (poseTools) modeButtons.push(['btnBoneEdit', 'pose']);
      for (const [id, value] of modeButtons) { const button = $(id); if (!button) continue; button.classList.toggle('on', mode === value); button.setAttribute('aria-pressed', String(mode === value)); }
      $('exitPartEdit').textContent = mode === 'parts' ? '结束点选' : '开启点选';
      $('exitPartEdit').title = mode === 'parts' ? '结束部件点选，恢复拖动画面和点击互动' : '在画面中点选需要隐藏的部件';
      $('exitPartEdit').setAttribute('aria-pressed', String(mode === 'parts'));
      $('partEditHint').textContent = mode === 'parts' ? '部件编辑已开启：点击画面选择部件，确认后隐藏。' : '部件列表可切换显示；开启编辑后可在画面点选。';
      if (poseTools) $('poseEditToggle').textContent = mode === 'pose' ? '结束编辑，恢复点击互动' : '开启姿势编辑';
      if (next) { const tab = next === 'parts' ? 'parts' : 'pose'; if ($('floatPanel').dataset.tab === tab) cfg.openPanel(true); else openTab(tab); }
    }
    function renderParts() {
      const list = $('slotList'), query = $('partFilter').value.toLocaleLowerCase(), fragment = document.createDocumentFragment();
      for (const part of editor?.parts() || []) {
        if (query && !part.name.toLocaleLowerCase().includes(query)) continue;
        const row = document.createElement('div'); row.className = 'viewer-part-row';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'eye';
        const visible = !editor.hidden.has(part.id); button.innerHTML = K.uiIcon(visible ? 'eye' : 'eyeOff'); button.setAttribute('aria-label', (visible ? '隐藏 ' : '显示 ') + part.name); button.setAttribute('aria-pressed', String(visible));
        button.onclick = () => { if (editor.hidden.has(part.id)) editor.hidden.delete(part.id); else editor.hidden.add(part.id); renderParts(); };
        const name = document.createElement('span'); name.textContent = part.name; name.title = part.id; row.append(button, name); fragment.append(row);
        row.onpointerenter = () => { selectedPart = part; }; row.onpointerleave = () => { selectedPart = null; };
      }
      list.replaceChildren(fragment); $('btnRestoreParts').dataset.hiddenCount = String(editor?.hidden.size || 0);
    }
    function renderBones() {
      const list = $('boneSelect'), query = $('boneFilter').value.toLocaleLowerCase(), old = list.value;
      const items = editor?.type === 'live2d' ? editor.parameters() : editor?.bones() || [];
      list.replaceChildren(...items.filter(item => !query || item.name.toLocaleLowerCase().includes(query)).map(item => new Option(item.name, item.id)));
      if ([...list.options].some(option => option.value === old)) list.value = old;
      renderBoneFields();
    }
    function renderBoneFields() {
      const box = $('boneFields'), id = $('boneSelect').value; box.replaceChildren(); if (!editor || !id) return;
      const live2d = editor.type === 'live2d', item = live2d && editor.parameters().find(item => item.id === id);
      const values = live2d ? { value: editor.parameter(item).value } : editor.pose(id);
      if (!values) return;
      for (const [key, label] of live2d ? [['value', '参数值']] : [['x', 'X'], ['y', 'Y'], ['rotation', '旋转'], ['scaleX', '缩放 X'], ['scaleY', '缩放 Y']]) {
        const row = document.createElement('label'); row.className = 'viewer-bone-field'; row.textContent = label;
        const input = document.createElement('input'); input.type = 'number'; input.step = key.startsWith('scale') || live2d ? '.01' : '.1'; input.value = Number(values[key].toFixed(3)); input.setAttribute('aria-label', label);
        if (live2d) { const bounds = editor.parameter(item); input.min = bounds.min; input.max = bounds.max; }
        input.oninput = () => run(() => { const value = input.valueAsNumber; if (!Number.isFinite(value)) return; if (mode !== 'pose') setMode('pose'); if (live2d) editor.setParameter(id, Math.max(Number(input.min), Math.min(Number(input.max), value))); else editor.setPose(id, { [key]: value }); });
        row.append(input); box.append(row);
      }
    }
    function renderPoses() {
      $('poseList').replaceChildren();
      for (const [name, value] of Object.entries(storedPoses())) {
        const row = document.createElement('div'); row.className = 'viewer-pose-row';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'anim-row'; button.textContent = name; button.onclick = () => { setMode('pose'); editor.applyPose(value); renderBoneFields(); };
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'edit-btn'; remove.textContent = '×'; remove.setAttribute('aria-label', '删除姿势 ' + name); remove.onclick = () => { const poses = storedPoses(); delete poses[name]; localStorage.setItem(poseKey(), JSON.stringify(poses)); renderPoses(); };
        row.append(button, remove); $('poseList').append(row);
      }
    }
    function refresh() {
      if (poseTools) {
        const type = editor?.type;
        $('poseHint').textContent = type === 'live2d' ? 'Live2D 使用参数变形，没有 Spine 骨骼。可在这里编辑参数并保存姿势。' : '开启编辑后可拖动画面中的骨骼，或输入位置、旋转和缩放。';
      }
      renderParts();
      if (poseTools) { renderBones(); renderPoses(); }
    }
    function sync() {
      const key = currentKey(); if (identity === key && editor === cfg.editor()) return;
      setMode(''); if (poseTools) { poseLocked = false; $('poseLock').setAttribute('aria-pressed', 'false'); $('poseLock').classList.remove('on'); } identity = key; editor = cfg.editor(); selectedPart = null; refresh();
    }
    function dimensions(quality) { return cfg.capture(driver.playback()).pngSize(quality); }
    async function exportFile(quality, transparent, format = 'png', copy = false) {
      requireEditor(); if (exporting) return; closePopup();
      const state = driver.playback(), name = (cfg.name() + (format === 'png' ? '' : '_' + state.name)).replace(/[\\/:*?"<>|]+/g, '_');
      const exportBackground = background;
      const job = format === 'png' ? null : K.exportProgress(); let session;
      exporting = true; document.body.dataset.viewerExporting = 'true'; cfg.setExporting(true); cfg.stopAudio?.();
      try {
        session = await cfg.capture(state);
        const size = format === 'png' ? K.illustrationExportSize(session, quality) : await K.animationExportSize({ session, duration: state.duration, quality, kind: format,
          signal: job.signal, onProgress: value => job.update(.2 * value, '正在识别立绘范围…') });
        const gl = driver.canvas().getContext('webgl2') || driver.canvas().getContext('webgl');
        const limit = gl ? Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 8192;
        if (format !== 'png' && Math.max(size.width, size.height) > limit) throw new Error(`导出尺寸超过当前设备 ${limit} 像素限制，请选择较低质量`);
        const output = format === 'png' ? null : document.createElement('canvas'); if (output) { output.width = size.width; output.height = size.height; }
        const ctx = output?.getContext('2d', { willReadFrequently: format === 'gif' });
        const draw = time => { const source = session.draw(time, size, null); K.paintExportBackground(ctx, size.width, size.height, exportBackground === 'checker' && format === 'gif' ? null : exportBackground); ctx.drawImage(source, 0, 0, size.width, size.height); };
        let blob, extension = format;
        if (format === 'png') {
          const frame = session.draw(null, size, transparent ? null : exportBackground);
          session.dispose(); session = null; cfg.setExporting(false);
          blob = await new Promise((resolve, reject) => frame.toBlob(value => value ? resolve(value) : reject(new Error('浏览器无法编码此尺寸的 PNG，请尝试关闭其他页面后重试')), 'image/png'));
          if (copy) { if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('当前浏览器不支持复制图片'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); }
        } else if (format === 'video') {
          const result = await K.encodeCanvasVideo({ canvas: output, duration: state.duration, quality, draw, signal: job.signal, onProgress: (value, time) => job.update(.2 + .8 * value, `导出视频 ${time.toFixed(1)} / ${state.duration.toFixed(1)} 秒 · ${size.width}×${size.height}`) }); ({ blob, extension } = result);
        } else {
          const codec = await import('./vendor/gifenc.esm.js'), gif = codec.GIFEncoder(), plan = K.exportTimeline(state.duration, quality, 'gif');
          for (let i = 0; i < plan.frames; i++) {
            job.check(); draw(plan.timeAt(i)); const rgba = ctx.getImageData(0, 0, size.width, size.height).data;
            const palette = codec.quantize(rgba, 255, { format: 'rgb565' }), indices = codec.applyPalette(rgba, palette, 'rgb565');
            for (let p = 0; p < indices.length; p++) indices[p] = rgba[p * 4 + 3] < 128 ? 0 : indices[p] + 1;
            gif.writeFrame(indices, size.width, size.height, { palette: [[0, 0, 0], ...palette], delay: plan.delayAt(i), transparent: true, transparentIndex: 0 });
            await job.update(.2 + .8 * (i + 1) / plan.frames, `导出 ${i + 1} / ${plan.frames} 帧 · ${size.width}×${size.height}`);
          }
          gif.finish(); blob = new Blob([gif.bytes()], { type: 'image/gif' });
        }
        job?.check(); if (!copy) {
          K.downloadBlob(blob, name + '.' + extension);
          if (exportUrl) URL.revokeObjectURL(exportUrl); exportUrl = URL.createObjectURL(blob);
          showPopup($(format === 'png' ? 'btnPng' : 'btnGif'), '导出完成', pop => {
            const col = document.createElement('div'); col.className = 'col';
            const title = document.createElement('strong'); title.textContent = '导出完成';
            const detail = document.createElement('p'); detail.textContent = `${extension.toUpperCase()} · ${size.width}×${size.height} · ${(blob.size / 1024 / 1024).toFixed(2)} MB`;
            const showPreview = format !== 'png' || size.width * size.height <= 64 * 1024 * 1024;
            const preview = document.createElement(format === 'video' ? 'video' : 'img'); if (showPreview) preview.src = exportUrl; preview.style.cssText = 'display:block;max-width:260px;max-height:180px;object-fit:contain;background:repeating-conic-gradient(#272b33 0% 25%,#171b22 0% 50%) 0 0 / 16px 16px';
            if (format === 'video') preview.controls = true; else preview.alt = '导出预览';
            const download = document.createElement('a'); download.href = exportUrl; download.download = name + '.' + extension; download.textContent = '保存文件'; download.className = 'edit-btn';
            const close = document.createElement('button'); close.type = 'button'; close.textContent = '关闭'; close.onclick = closePopup;
            col.append(title, detail); if (showPreview) col.append(preview);
            col.append(download, close); pop.append(col);
          });
        }
        toast((copy ? '已复制图片' : '已导出 ' + extension.toUpperCase()) + `：${size.width}×${size.height}`, 'ok');
      } catch (error) {
        if (error.name === 'AbortError') toast('已取消导出');
        else { report(error); showPopup($(format === 'png' ? 'btnPng' : 'btnGif'), '导出失败', pop => { const text = document.createElement('p'); text.className = 'muted'; text.textContent = '导出失败：' + error.message; pop.append(text); }); }
      }
      finally { try { session?.dispose(); } finally { exporting = false; delete document.body.dataset.viewerExporting; cfg.setExporting(false); job?.close(); ui.update(true); } }
    }
    function exportPopup(button, animation) {
      showPopup(button, animation ? '导出动画' : '导出 PNG', pop => K.mountExportOptions(pop, {
        kind: animation ? 'animation' : 'png', quality: 'high', transparent: background === 'checker',
        getDetail: (quality, format) => {
          requireEditor(); const state = driver.playback();
          if (animation && !state.duration) throw new Error('请先选择一个有时长的动画');
          if (animation) { const preset = K.animationExportPreset(quality); return `自适应立绘比例 · 长边 ${format === 'video' ? preset.videoEdge : preset.gifEdge} 像素 · ${state.duration.toFixed(2)} 秒 · 背景跟随舞台 · 无声`; }
          dimensions(quality);
          const preset = K.exportPreset(quality);
          return `按立绘范围裁剪 · ${preset.pngEdge ? '长边 ' + preset.pngEdge + ' 像素' : '原始像素比例'} · 背景跟随舞台 · PNG 无损编码`;
        },
        onExport: (quality, transparent, format) => exportFile(quality, transparent, animation ? format : 'png'),
        ...(animation ? {} : { onCopy: (quality, transparent) => exportFile(quality, transparent, 'png', true) }),
      }));
    }
    const toolActions = [
      ['btnRetry', () => { setMode(''); return cfg.reload(); }],
      ['btnRestoreParts', () => { requireEditor().hidden.clear(); renderParts(); toast('已恢复默认部件显示', 'ok'); }],
      ['btnGlobalSearch', () => K.openSearchPalette?.()],
      ['btnPartEdit', () => setMode(mode === 'parts' ? '' : 'parts')],
      ['exitPartEdit', () => setMode(mode === 'parts' ? '' : 'parts')],
      ['btnPng', () => exportPopup($('btnPng'), false)], ['btnGif', () => exportPopup($('btnGif'), true)],
    ];
    if (poseTools) toolActions.push(
      ['btnBoneEdit', () => setMode(mode === 'pose' ? '' : 'pose')],
      ['poseEditToggle', () => setMode(mode === 'pose' ? '' : 'pose')],
      ['poseReset', () => { requireEditor().resetPose(); poseLocked = false; $('poseLock').setAttribute('aria-pressed', 'false'); $('poseLock').classList.remove('on'); renderBoneFields(); toast('已恢复姿势', 'ok'); }],
      ['poseLock', () => { requireEditor(); poseLocked = !poseLocked; $('poseLock').setAttribute('aria-pressed', String(poseLocked)); $('poseLock').classList.toggle('on', poseLocked); toast(poseLocked ? '姿势已锁定' : '已取消姿势锁定'); }],
      ['poseSave', () => { requireEditor(); const poses = storedPoses(), name = '姿势 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }); poses[name] = editor.capturePose(); localStorage.setItem(poseKey(), JSON.stringify(poses)); renderPoses(); toast('姿势已保存到本机', 'ok'); }],
    );
    for (const [id, action] of toolActions) $(id)?.addEventListener('click', () => run(() => { closePopup(); return action(); }));
    for (const [id, action] of [['partAll', () => editor.hidden.clear()], ['partNone', () => editor.parts().forEach(part => editor.hidden.add(part.id))], ['partInv', () => editor.parts().forEach(part => editor.hidden.has(part.id) ? editor.hidden.delete(part.id) : editor.hidden.add(part.id))]]) $(id).onclick = () => run(() => { requireEditor(); action(); renderParts(); });
    $('partFilter').oninput = renderParts;
    if (poseTools) { $('boneFilter').oninput = renderBones; $('boneSelect').onchange = renderBoneFields; }
    document.querySelectorAll('[data-panel-tab]').forEach(button => button.addEventListener('click', () => { if (mode && button.dataset.panelTab !== (mode === 'parts' ? 'parts' : 'pose')) setMode(''); refresh(); }));
    $('panel-close').addEventListener('click', () => setMode(''));
    $('btnAnimTab').addEventListener('click', () => { closePopup(); if (mode) setMode(''); });
    $('btnBg').onclick = () => showPopup($('btnBg'), '背景颜色 / 预设', pop => backgroundControl.mount(pop));
    $('btnDebug').onclick = () => showPopup($('btnDebug'), '骨骼 / 网格 / 包围盒 调试视图', pop => {
      pop.innerHTML = '<div class="col"><div class="col-title">调试视图</div></div>';
      for (const [flag, label] of [['bones', '骨骼线'], ['regions', '区域框'], ['bounds', '包围盒'], ['meshHull', '网格轮廓'], ['meshTris', '网格三角面'], ['paths', '路径'], ['clipping', '裁剪形状']]) {
        const row = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!debug[flag]; input.disabled = ['bones', 'paths', 'clipping'].includes(flag) && editor?.type === 'live2d'; input.onchange = () => { debug[flag] = input.checked; }; row.append(input, ' ' + label); pop.firstChild.append(row);
      }
      if (editor?.type === 'live2d') { const hint = document.createElement('p'); hint.className = 'muted'; hint.textContent = 'Live2D 没有 Spine 骨骼，使用网格与参数查看变形。'; pop.firstChild.append(hint); }
    });
    $('btnVoiceSettings').onclick = () => showPopup($('btnVoiceSettings'), '角色声音设置', pop => {
      pop.innerHTML = '<div class="col"><div class="col-title">角色声音设置</div><label><input type="checkbox" id="viewerSoundEnabled"> 启用角色声音</label><label>音量 <input type="range" min="0" max="1" step=".05" id="viewerSoundVolume" aria-label="角色声音音量"></label><button type="button">打开声音与互动</button></div>';
      const enabled = pop.querySelector('input[type=checkbox]'), volume = pop.querySelector('input[type=range]'); enabled.checked = cfg.soundEnabled(); volume.value = cfg.volume();
      enabled.onchange = () => cfg.setSoundEnabled(enabled.checked); volume.oninput = () => cfg.setVolume(Number(volume.value));
      pop.querySelector('button').onclick = () => { closePopup(); openTab(cfg.voiceTab || 'interaction'); };
    });
    function immersive(value) { document.body.classList.toggle('viewer-immersive', value); $('immersiveExit').hidden = !value; if (value) { setMode(''); cfg.openPanel(false); closePopup(); } }
    $('btnPresetImmersive').onclick = () => immersive(true); $('immersiveExit').onclick = () => immersive(false);
    document.addEventListener('keydown', event => { if (!exporting && event.key === 'Escape') { setMode(''); immersive(false); closePopup(); } });

    // Capture phase takes precedence only while the user explicitly edits.
    // Normal touch/drag/long press handlers keep receiving their original events.
    $('stage').addEventListener('pointerdown', event => {
      if ((!mode && !exporting) || !event.target.matches('canvas, svg')) return;
      event.preventDefault(); event.stopImmediatePropagation(); if (exporting || event.button !== 0) return;
      const rect = $('stage').getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
      if (mode === 'pose' && editor.type === 'spine') {
        let nearest = null, distance = 22;
        for (const item of editor.bones()) { const p = editor.bonePoint(item), d = Math.hypot(p.x - x, p.y - y); if (d < distance) { nearest = item; distance = d; } }
        if (nearest) { dragBone = { id: nearest.id, pointer: event.pointerId }; $('boneFilter').value = ''; renderBones(); $('boneSelect').value = nearest.id; renderBoneFields(); $('stage').setPointerCapture(event.pointerId); }
      } else if (mode === 'parts') { partTap = null; partPress = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; }
    }, true);
    $('stage').addEventListener('pointermove', event => {
      if (!mode && !exporting) return; if (!dragBone && !event.target.matches('canvas, svg')) return; event.stopImmediatePropagation();
      if (partPress?.id === event.pointerId && Math.hypot(event.clientX - partPress.x, event.clientY - partPress.y) >= 6) partPress.moved = true;
      if (dragBone?.pointer === event.pointerId) { const rect = $('stage').getBoundingClientRect(); editor.moveBone(dragBone.id, event.clientX - rect.left, event.clientY - rect.top); renderBoneFields(); }
    }, true);
    for (const type of ['pointerup', 'pointercancel']) $('stage').addEventListener(type, event => {
      if (mode || exporting) {
        if (event.target.matches('canvas, svg') || dragBone) event.stopImmediatePropagation();
        if (partPress?.id === event.pointerId) {
          partTap = type === 'pointerup' && !partPress.moved && Math.hypot(event.clientX - partPress.x, event.clientY - partPress.y) < 6 ? { x: event.clientX, y: event.clientY } : null;
          partPress = null;
        }
        dragBone = null;
      }
    }, true);
    // Open after the completed click: a pointerdown menu is dismissed by that
    // same gesture's document click handler before the user can choose an item.
    $('stage').addEventListener('click', event => {
      const tap = partTap; partTap = null;
      if (mode !== 'parts' || exporting || !tap || !event.target.matches('canvas, svg')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const rect = $('stage').getBoundingClientRect(), x = tap.x - rect.left, y = tap.y - rect.top;
      const candidates = editor.parts().slice().reverse();
      if (editor.type === 'live2d') candidates.sort((a, b) => cfg.drawableOrder(b) - cfg.drawableOrder(a));
      else if (editor.drawOrder) candidates.sort((a, b) => editor.drawOrder(b) - editor.drawOrder(a));
      const part = candidates.find(part => editor.pickable?.(part) !== false && partHit(x, y, editor.geometry(part)));
      if (part) { selectedPart = part; K.showMenu([{ heading: part.name }, { label: '隐藏此部件', fn: () => { editor.hidden.add(part.id); selectedPart = null; renderParts(); } }, { label: '取消', fn: () => { selectedPart = null; } }], tap.x, tap.y); }
    }, true);
    function drawOverlay() {
      const width = $('stage').clientWidth, height = $('stage').clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (editOverlay.width !== Math.round(width * dpr) || editOverlay.height !== Math.round(height * dpr)) { editOverlay.width = Math.round(width * dpr); editOverlay.height = Math.round(height * dpr); }
      paint.setTransform(dpr, 0, 0, dpr, 0, 0); paint.clearRect(0, 0, width, height); paint.lineWidth = 1; paint.strokeStyle = '#9ad7ff';
      if (!editor) return;
      if (selectedPart || Object.values(debug).some(Boolean)) for (const part of editor.parts()) {
        const selected = part === selectedPart; if (!selected && !debug.regions && !debug.meshHull && !debug.meshTris && !debug.bounds && !debug.paths && !debug.clipping) continue;
        const g = editor.geometry(part); if (!g?.points.length) continue;
        paint.strokeStyle = selected ? '#f5cf80' : '#9ad7ff80';
        if (selected || debug.regions && !g.mesh || debug.meshHull && g.mesh || debug[g.kind]) path(paint, g.hull || g.points, g.kind !== 'paths');
        if (debug.meshTris && g.triangles) for (let i = 0; i < g.triangles.length; i += 3) path(paint, Array.from(g.triangles.slice(i, i + 3), index => g.points[index]));
        if (debug.bounds) { const xs = g.points.map(p => p[0]), ys = g.points.map(p => p[1]); paint.strokeRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); }
      }
      if ((mode === 'pose' || debug.bones) && editor.type === 'spine') for (const item of editor.bones()) {
        const p = editor.bonePoint(item), q = editor.boneEnd(item), selected = poseTools && item.id === $('boneSelect').value;
        paint.strokeStyle = selected ? '#ffb76d' : '#adc4ed88'; path(paint, [[p.x, p.y], [q.x, q.y]], false);
        paint.fillStyle = paint.strokeStyle; paint.beginPath(); paint.arc(p.x, p.y, selected ? 4 : 2, 0, Math.PI * 2); paint.fill();
      }
    }
    K.initSearchPalette();
    return {
      sync, before: () => { sync(); editor?.before(); },
      exitEditing() { closePopup(); setMode(''); K.closeToolPopup?.(); },
      prepareLoad() { setMode(''); editor = null; identity = null; selectedPart = null; },
      after: () => { editor?.after(); drawOverlay(); },
      update() { if (performance.now() - lastRefresh > 800) { lastRefresh = performance.now(); sync(); } },
      get exporting() { return exporting; }, get mode() { return mode; },
    };
  };
})();
