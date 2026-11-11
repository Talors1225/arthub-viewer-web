import { FatedGestures } from './gestures.mjs';
import { FatedSound } from './sounds.mjs?v=20261109-fated-video';
import { startVideoCapture, VIDEO_FPS, VIDEO_LIMIT } from './video.mjs?v=20261109-fated-video';

const K = window.SpineKit;
const $ = id => document.getElementById(id);
const library = $('library'), stage = $('stage'), canvas = $('portrait');
const search = $('search'), cards = $('cards'), tool = $('tool');
const soundControl = $('sound-mode');
const hints = $('hints'), hintLayer = $('gesture-hints'), hintStatus = $('hint-status');
const scoreMeter = $('score-meter'), scoreBar = scoreMeter.querySelector('progress'), scoreText = scoreMeter.querySelector('span');
const controls = stage.querySelector('.controls');
const more = $('more'), exitImmersive = $('exit-immersive');
const recordingBar = $('recording-bar'), recordingTime = $('recording-time');
const store = K.Store('bd2-fated');
const stageBackground = K.createStageBackground({ stage, read: () => store.get('bg', '#000000'), write: color => store.set('bg', color) });
const markers = new Map();
let guideOn = false, lastGuideFrame = -Infinity;
let authoredRules;
let audioRoot, audioManifest, soundMode = 'all';
const initialParams = new URLSearchParams(location.search);
const probe = initialParams.get('probe') === '1' && ['127.0.0.1', 'localhost'].includes(location.hostname);
const pageSize = 12;
let models = [], page = 1, assetsRoot, request, scene, gl, runtime, lastFrame = 0;
let pan = null;
let routePending = false;
let videoRecording = null;

function modelURL(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('id', id);
  else url.searchParams.delete('id');
  return url;
}

function asset(path) {
  return new URL(path, assetsRoot).href;
}

function renderLibrary() {
  const query = search.value.trim().toLocaleLowerCase();
  const matches = models.filter(model =>
    [model.name, model.id, model.prefab].join(' ').toLocaleLowerCase().includes(query));
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  page = Math.min(page, pages);
  cards.replaceChildren();
  $('count').textContent = matches.length ? matches.length + ' 套互动立绘' : '没有符合条件的立绘';
  for (const model of matches.slice((page - 1) * pageSize, page * pageSize)) {
    const link = document.createElement('a');
    link.className = 'card';
    link.href = modelURL(model.id);
    const image = document.createElement('img');
    image.src = asset('thumbs/' + model.id + '.webp');
    image.alt = '';
    image.loading = 'lazy';
    const label = document.createElement('strong');
    label.textContent = model.name;
    link.append(image, label);
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(model.id);
    });
    cards.appendChild(link);
  }
  $('pages').hidden = pages <= 1;
  $('page-label').textContent = page + ' / ' + pages;
  $('previous').disabled = page <= 1;
  $('next').disabled = page >= pages;
}

function setMessage(text, retry = false) {
  $('message').textContent = text;
  $('load').hidden = !text;
  $('retry').hidden = !retry;
  stage.setAttribute('aria-busy', String(Boolean(text) && !retry));
}

function cancelInput(id) {
  scene?.gestures.cancel(id);
  if (id == null || pan?.id === id) pan = null;
  if (!scene?.gestures.gesture) delete canvas.dataset.gesture;
}

function dispose() {
  stopVideoRecording();
  request?.abort();
  K.hideMenu();
  K.closeToolPopup();
  setImmersive(false);
  cancelInput();
  scene?.sound?.dispose();
  K.disposeAtlas(scene?.atlas);
  scene = null;
  tool.hidden = true;
  soundControl.hidden = true;
  scoreMeter.hidden = true;
  hints.disabled = true;
  more.disabled = true;
  clearGuide();
  delete canvas.dataset.ready;
}

function showLibrary() {
  dispose();
  stage.hidden = true;
  library.hidden = false;
  document.title = '棕色尘埃 2 · 有缘之客 | ArtHub';
  renderLibrary();
}

function updateTools() {
  const gestures = scene.gestures;
  const options = gestures.tools;
  const value = options.map(option => option.id).join(',');
  if (tool.dataset.options !== value) {
    tool.dataset.options = value;
    tool.replaceChildren(...options.map(option => new Option(option.id === 0 ? '手势' : '道具 ' + option.id, option.id)));
  }
  const selected = String(gestures.tool.id);
  if (tool.value !== selected) tool.value = selected;
  tool.hidden = options.length <= 1;
  tool.disabled = gestures.toolLocked;
}

function resize() {
  if (!gl || stage.hidden || K.pngExporting || videoRecording?.capturing) return;
  K.resizeCanvas(canvas, gl.renderer);
  K.syncRendererSize(canvas, gl.mgl, gl.renderer);
  fit();
}

function fit() {
  if (!scene || videoRecording?.capturing) return;
  const { skeleton, bounds } = scene;
  const width = bounds.maxX - bounds.minX, height = bounds.maxY - bounds.minY;
  const scale = Math.min(canvas.width * 0.93 / width, canvas.height * 0.91 / height);
  scene.fitScale = scale;
  skeleton.scaleX = skeleton.scaleY = scale;
  skeleton.x = -(bounds.minX + bounds.maxX) * scale / 2;
  skeleton.y = -(bounds.minY + bounds.maxY) * scale / 2;
}

function toWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * canvas.width / rect.width - canvas.width / 2,
    y: canvas.height / 2 - (clientY - rect.top) * canvas.height / rect.height,
  };
}

function toClient(position, rect = canvas.getBoundingClientRect()) {
  return {
    x: rect.left + (position.x + canvas.width / 2) * rect.width / canvas.width,
    y: rect.top + (canvas.height / 2 - position.y) * rect.height / canvas.height,
  };
}

function clearGuide() {
  scene?.gestures.setGuideSpeed();
  markers.clear();
  hintLayer.replaceChildren();
  hintLayer.hidden = true;
  hintStatus.hidden = true;
  lastGuideFrame = -Infinity;
}

function updateGuide(t) {
  if (!guideOn || t - lastGuideFrame < 34) return;
  lastGuideFrame = t;
  const rect = canvas.getBoundingClientRect();
  const occlusions = [controls.getBoundingClientRect(), $('back').getBoundingClientRect()];
  if (!scoreMeter.hidden) occlusions.push(scoreMeter.getBoundingClientRect());
  const usable = ({ x, y }) => x >= rect.left + 14 && x <= rect.right - 14 &&
    y >= rect.top + 14 && y <= rect.bottom - 14 &&
    !occlusions.some(box => x >= box.left - 12 && x <= box.right + 12 && y >= box.top - 12 && y <= box.bottom + 12);
  const guide = scene.gestures.guide(position => toClient(position, rect), usable, t);
  scene.gestures.setGuideSpeed(guide.speed);
  const keys = new Set(guide.markers.map(marker => marker.key));
  for (const [key, element] of markers) {
    if (keys.has(key)) continue;
    element.remove();
    markers.delete(key);
  }
  const labels = { tap: '点按', hold: '长按', drag: '拖动', drop: '落点' };
  for (const marker of guide.markers) {
    let element = markers.get(marker.key);
    if (!element) {
      element = document.createElement('div');
      element.append(document.createElement('span'));
      markers.set(marker.key, element);
      hintLayer.append(element);
    }
    element.className = marker.kind === 'drop' ? 'drop-marker' : 'gesture-marker';
    element.classList.toggle('label-left', rect.right - marker.x < 70);
    element.dataset.point = marker.point;
    element.dataset.source = marker.key;
    element.dataset.next = marker.next ?? '';
    element.dataset.clicksLeft = marker.clicksLeft || '';
    element.dataset.priority = marker.priority || '';
    element.dataset.ready = String(Boolean(marker.ready));
    element.style.transform = 'translate(' + (marker.x - rect.left) + 'px, ' + (marker.y - rect.top) + 'px)';
    const label = marker.ready ? (marker.waiting ? '按住' : '松开')
      : marker.kind === 'drop' && marker.priority === 'reveal' ? '继续互动' : labels[marker.kind];
    if (element.firstChild.textContent !== label) element.firstChild.textContent = label;
  }
  hintLayer.hidden = !keys.size;
  const progress = (scene.gestures.groupIndex + 1) + '/' + scene.gestures.profile.groups.length;
  const message = progress + '　' + guide.message;
  if (hintStatus.textContent !== message) hintStatus.textContent = message;
  hintStatus.hidden = false;
}

function zoom(factor, x, y) {
  if (!scene || videoRecording?.capturing) return;
  const { skeleton, fitScale } = scene;
  const old = skeleton.scaleX;
  const scale = Math.min(fitScale * 4, Math.max(fitScale * 0.7, old * factor));
  const anchor = x === undefined ? { x: 0, y: 0 } : toWorld(x, y);
  skeleton.x = anchor.x + (skeleton.x - anchor.x) * scale / old;
  skeleton.y = anchor.y + (skeleton.y - anchor.y) * scale / old;
  skeleton.scaleX = skeleton.scaleY = scale;
}

async function showModel(model) {
  dispose();
  library.hidden = true;
  stage.hidden = false;
  document.title = model.name + ' · 棕色尘埃 2 | ArtHub';
  canvas.setAttribute('aria-label', model.name + ' · 可点按、长按和拖动的互动立绘');
  setMessage('正在加载 ' + model.name);
  const controller = request = new AbortController();
  const { signal } = controller;
  const dir = 'assets/' + model.dir;
  let atlas;
  try {
    const [SP, profile] = await Promise.all([
      K.ensureSpine(model.spineVersion, '../viewer/vendor/'),
      K.fetchJSON(asset(dir + 'interaction.json'), { signal }),
    ]);
    signal.throwIfAborted();
    if (profile.schemaVersion !== 1 || profile.id !== model.id || !profile.groups.length) throw new Error('互动配置不匹配');
    if (!gl || runtime !== SP) {
      gl = K.createGL(canvas, SP);
      if (!gl) throw new Error('无法启动 WebGL');
      runtime = SP;
    }
    const files = await K.loadSpineFiles(SP, gl.mgl, {
      atlasURL: asset(dir + model.atlas), skeletonURL: asset(dir + model.skel), signal,
      onProgress: text => { if (!signal.aborted) setMessage(text); },
    });
    atlas = files.atlas;
    signal.throwIfAborted();
    const data = new SP.SkeletonBinary(new SP.AtlasAttachmentLoader(atlas)).readSkeletonData(files.bytes);
    const skeleton = new SP.Skeleton(data);
    const stateData = new SP.AnimationStateData(data);
    stateData.defaultMix = 0.12;
    const state = new SP.AnimationState(stateData);
    const audioModel = audioManifest?.models[model.id];
    const sound = audioModel ? new FatedSound(audioModel, audioManifest, audioRoot, soundMode, probe) : null;
    const gestures = new FatedGestures(profile, skeleton, state, data, SP.TranslateTimeline, model.frame, authoredRules[model.id], sound);
    state.apply(skeleton);
    K.updateWorldTransform(skeleton, SP.Physics?.pose);
    const bounds = model.frame || K.measureBounds(skeleton, SP, false);
    if (!bounds || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) throw new Error('立绘没有可见画面');
    scene = { model, skeleton, state, gestures, bounds, atlas, sound, pma: Boolean(atlas.pages[0].pma) };
    atlas = null;
    soundControl.hidden = !sound;
    soundControl.value = soundMode;
    resize();
    updateTools();
  } catch (error) {
    if (!signal.aborted) setMessage('加载失败 · ' + error.message, true);
  } finally {
    K.disposeAtlas(atlas);
  }
}

function renderRoute() {
  if (K.pngExporting) {
    routePending = true;
    return;
  }
  routePending = false;
  const id = new URLSearchParams(location.search).get('id');
  const model = models.find(entry => entry.id === id);
  if (model) void showModel(model);
  else showLibrary();
}

function navigate(id) {
  history.pushState(null, '', modelURL(id));
  renderRoute();
}

function drawPortrait(picture, cropPreview = false) {
  const { mgl, renderer } = gl;
  const raw = mgl.gl;
  raw.clearColor(0, 0, 0, 0);
  raw.clear(raw.COLOR_BUFFER_BIT);
  if (!picture) return;
  const { skeleton, model } = picture;
  const frame = cropPreview && model.frame;
  if (frame) {
    // Some portraits draw an opaque matte past the authored frame.
    const x = raw.drawingBufferWidth / 2 + skeleton.x;
    const y = raw.drawingBufferHeight / 2 + skeleton.y;
    const left = Math.floor(x + frame.minX * skeleton.scaleX);
    const bottom = Math.floor(y + frame.minY * skeleton.scaleY);
    const right = Math.ceil(x + frame.maxX * skeleton.scaleX);
    const top = Math.ceil(y + frame.maxY * skeleton.scaleY);
    raw.scissor(left, bottom, right - left, top - bottom);
    raw.enable(raw.SCISSOR_TEST);
  }
  try {
    renderer.begin();
    try { renderer.drawSkeleton(skeleton, picture.pma); }
    finally { renderer.end(); }
  } finally {
    if (frame) raw.disable(raw.SCISSOR_TEST);
  }
}

function renderFrame(t) {
  requestAnimationFrame(renderFrame);
  const dt = lastFrame ? Math.min((t - lastFrame) / 1000, 0.1) : 0;
  lastFrame = t;
  if (!gl || document.hidden || stage.hidden || K.pngExporting || gl.mgl.gl.isContextLost()) return;
  if (!scene) { drawPortrait(null); return; }
  const { state, skeleton, gestures } = scene;
  gestures.tick(t, dt);
  state.update(dt);
  state.apply(skeleton);
  const updateWorld = () => K.updateWorldTransform(skeleton, runtime.Physics?.update);
  updateWorld();
  gestures.applyOverrides(updateWorld);
  gestures.updateDragDestination(t);
  if (!gestures.gesture?.dragging) delete canvas.dataset.gesture;
  drawPortrait(scene, !videoRecording?.capturing);
  captureVideoFrame(t);
  updateTools();
  const gauge = gestures.gauge;
  scoreMeter.hidden = !gauge;
  if (gauge) {
    const text = Math.round(gestures.score) + '/' + gauge.range[1];
    if (scoreText.textContent !== text) {
      scoreBar.max = gauge.range[1] - gauge.range[0];
      scoreBar.value = gestures.score - gauge.range[0];
      scoreText.textContent = text;
    }
  }
  if (!canvas.dataset.ready) {
    canvas.dataset.ready = 'true';
    hints.disabled = false;
    more.disabled = Boolean(videoRecording);
    setMessage('');
  }
  updateGuide(t);
}

function portraitExportFrame({ model, bounds }) {
  return model.exportFrame || bounds;
}

function pngPose(quality) {
  return K.pngExportPose([scene.skeleton], quality, runtime, portraitExportFrame(scene));
}

function captureWorldPose(skeleton) {
  const { x, y, scaleX, scaleY } = skeleton;
  // Gesture overrides can affect the displayed bones after their local values are restored.
  const bones = skeleton.bones.map(bone => ({
    bone, a: bone.a, b: bone.b, c: bone.c, d: bone.d, x: bone.worldX, y: bone.worldY,
  }));
  return () => {
    const sx = skeleton.scaleX / scaleX, sy = skeleton.scaleY / scaleY;
    for (const saved of bones) {
      const { bone } = saved;
      bone.a = saved.a * sx; bone.b = saved.b * sx;
      bone.c = saved.c * sy; bone.d = saved.d * sy;
      bone.worldX = skeleton.x + (saved.x - x) * sx;
      bone.worldY = skeleton.y + (saved.y - y) * sy;
    }
  };
}

function portraitFilename(model) {
  return 'bd2-' + model.name.replace(/[\\/:*?"<>|]+/g, '_');
}

async function exportPortrait(quality, transparent, copy = false) {
  if (!scene || !canvas.dataset.ready || K.pngExporting || videoRecording) return;
  const picture = scene, { width, height } = canvas, { mgl, renderer } = gl;
  K.closeToolPopup();
  more.focus({ preventScroll: true });
  try {
    const applyWorldPose = captureWorldPose(picture.skeleton);
    const pose = pngPose(quality);
    cancelInput();
    const result = await K.exportPNG({
      canvas, size: pose.size, pose, transparent, copy, background: stageBackground.get(),
      filename: portraitFilename(picture.model) + '.png',
      resize(_scale, tile) {
        K.syncRendererSize(canvas, mgl, renderer);
        pose.apply(tile);
        applyWorldPose();
      },
      draw: () => drawPortrait(picture),
      restore() {
        pose.restore();
        K.resizeCanvas(canvas, renderer);
        K.syncRendererSize(canvas, mgl, renderer);
        if (canvas.width !== width || canvas.height !== height) fit();
        applyWorldPose();
        drawPortrait(picture, true);
      },
    });
    const label = copy ? '已复制图片' : '已导出 PNG';
    K.toast(label + ' · ' + result.w + '×' + result.h + (result.adapted ? '（适配尺寸）' : ''), 'ok');
  } catch (error) {
    if (K.isAbort(error)) K.toast('已取消导出', 'info');
    else K.toast((copy ? '复制失败 · ' : '导出失败 · ') + error.message, 'err');
  } finally {
    if (routePending && !K.pngExporting) renderRoute();
  }
}

function restoreVideoView(session) {
  if (!session.capturing) return;
  session.capturing = false;
  clearTimeout(session.limitTimer);
  recordingBar.hidden = true;
  delete stage.dataset.videoRecording;
  stage.style.removeProperty('--video-aspect');
  if (scene !== session.picture) return;
  cancelInput();
  const { skeleton, gestures } = scene;
  K.resizeCanvas(canvas, gl.renderer);
  K.syncRendererSize(canvas, gl.mgl, gl.renderer);
  if (canvas.width === session.view.width && canvas.height === session.view.height) {
    Object.assign(skeleton, session.view.transform);
  } else fit();
  const updateWorld = () => K.updateWorldTransform(skeleton, runtime.Physics?.pose);
  updateWorld();
  gestures.applyOverrides(updateWorld);
  drawPortrait(scene, true);
}

function stopVideoRecording(save = true) {
  const session = videoRecording;
  if (!session?.capturing) return;
  if (session.capture) session.capture.stop(save);
  else session.controller.abort();
  restoreVideoView(session);
}

async function completeVideoRecording(session) {
  try {
    const file = await session.capture.result;
    if (session.frameError) throw session.frameError;
    if (file) {
      K.downloadBlob(file.blob, portraitFilename(session.picture.model) + '-互动.' + file.extension);
      K.toast('已导出 ' + file.extension.toUpperCase() + ' 视频', 'ok');
    } else K.toast('已取消录制', 'info');
  } catch (error) {
    K.toast('视频录制失败 · ' + error.message, 'err');
  } finally {
    restoreVideoView(session);
    session.audio?.release();
    videoRecording = null;
    more.disabled = !canvas.dataset.ready;
  }
}

function captureVideoFrame(now) {
  const session = videoRecording;
  if (!session?.capturing || !session.capture) return;
  try {
    session.capture.frame(now);
    const seconds = Math.min(VIDEO_LIMIT, Math.max(0, Math.floor((now - session.started) / 1000)));
    const text = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    if (recordingTime.value !== text) recordingTime.value = text;
  } catch (error) {
    session.frameError = error;
    stopVideoRecording(false);
  }
}

async function recordPortrait(quality, withAudio) {
  if (!scene || !canvas.dataset.ready || K.pngExporting || videoRecording) return;
  const { skeleton } = scene;
  const { x, y, scaleX, scaleY } = skeleton;
  const view = { width: canvas.width, height: canvas.height, transform: { x, y, scaleX, scaleY } };
  const controller = new AbortController();
  const session = videoRecording = { picture: scene, view, controller, capturing: true };
  K.closeToolPopup();
  more.disabled = true;
  try {
    const size = K.exportDimensions(portraitExportFrame(scene), quality, 'video', 0);
    const applyWorldPose = captureWorldPose(skeleton);
    cancelInput();
    stage.style.setProperty('--video-aspect', String(size.width / size.height));
    stage.dataset.videoRecording = 'true';
    canvas.width = size.width;
    canvas.height = size.height;
    const raw = gl.mgl.gl;
    if (raw.drawingBufferWidth !== size.width || raw.drawingBufferHeight !== size.height) {
      throw new Error('设备无法分配当前画质的画布，请试试标准画质');
    }
    K.syncRendererSize(canvas, gl.mgl, gl.renderer);
    skeleton.scaleX = skeleton.scaleY = size.scale;
    skeleton.x = -size.centerX * size.scale;
    skeleton.y = -size.centerY * size.scale;
    applyWorldPose();
    drawPortrait(scene);
    recordingTime.value = '0:00';
    $('recording-state').textContent = '准备录制';
    $('video-save').disabled = true;
    recordingBar.hidden = false;
    if (withAudio) {
      try { session.audio = scene.sound?.captureAudio(); } catch {}
      if (!session.audio) K.toast('本次录制没有录入互动声音', 'info');
    }
    session.capture = await startVideoCapture(K, canvas, quality, stageBackground.get(), session.audio?.track, controller.signal);
    session.started = performance.now();
    $('recording-state').textContent = '录制中';
    $('video-save').disabled = false;
    $('video-save').focus({ preventScroll: true });
    session.limitTimer = setTimeout(() => stopVideoRecording(), VIDEO_LIMIT * 1000);
    void completeVideoRecording(session);
  } catch (error) {
    restoreVideoView(session);
    session.audio?.release();
    videoRecording = null;
    more.disabled = !canvas.dataset.ready;
    if (K.isAbort(error)) K.toast('已取消录制', 'info');
    else K.toast('无法开始录制 · ' + error.message, 'err');
  }
}

function mountVideoOptions(panel) {
  panel.innerHTML = '<div class="col video-options"><label for="video-quality">画质</label>'
    + '<select class="action" id="video-quality"></select>'
    + '<label><input id="video-audio" type="checkbox"> 录入互动声音</label>'
    + '<p role="status">录制时可以点按、拖拽，最长 ' + VIDEO_LIMIT + ' 秒。</p>'
    + '<button class="record-start" type="button">开始录制</button></div>';
  const quality = panel.querySelector('#video-quality'), audio = panel.querySelector('#video-audio');
  const button = panel.querySelector('.record-start');
  const choices = K.animationExportPresets;
  for (const preset of choices) {
    const label = preset.id === 'medium' ? '标准' : '高清';
    quality.add(new Option(label + ' · 长边 ' + preset.videoEdge + ' · ' + VIDEO_FPS + ' 帧/秒', preset.id));
  }
  const saved = store.get('videoQuality', 'medium');
  quality.value = choices.some(preset => preset.id === saved) ? saved : 'medium';
  audio.disabled = !scene.sound || soundMode === 'off';
  audio.checked = !audio.disabled && store.get('videoAudio', true);
  if (!window.VideoEncoder || !window.VideoFrame) {
    try {
      if (!canvas.captureStream) throw new Error('不支持画面捕获');
      K.videoExportFormats();
    } catch {
      button.disabled = true;
      panel.querySelector('[role="status"]').textContent = '当前浏览器不支持录制互动视频。';
    }
  }
  button.onclick = () => {
    store.set('videoQuality', quality.value);
    if (!audio.disabled) store.set('videoAudio', audio.checked);
    recordPortrait(K.animationExportPreset(quality.value), audio.checked);
  };
}

function openToolPanel(title, mount) {
  const panel = document.createElement('div');
  panel.className = 'stage-popup fated-tool-popup';
  mount(panel);
  document.body.append(panel);
  K.attachPopupChrome(panel, { button: more, title, close: () => panel.remove() });
}

function mountBackgroundOptions(panel) {
  stageBackground.mount(panel);
  const note = document.createElement('p');
  note.className = 'fated-background-note';
  note.textContent = '底色用于舞台留白和立绘透明区域。原画自带的场景会保留。';
  panel.querySelector('.stage-background-options').prepend(note);
}

function setImmersive(enabled) {
  stage.toggleAttribute('data-immersive', enabled);
  exitImmersive.hidden = !enabled;
}

K.setUiIcon(more, 'more', '更多');
$('video-save').onclick = () => stopVideoRecording();
$('video-cancel').onclick = () => stopVideoRecording(false);
more.onclick = () => {
  if (more.getAttribute('aria-expanded') === 'true') { K.hideMenu(); return; }
  const rect = more.getBoundingClientRect();
  const menu = K.showMenu([
    { heading: '导出' },
    { label: '导出立绘 PNG', fn: () => openToolPanel('导出 PNG', panel => K.mountExportOptions(panel, {
      kind: 'png',
      quality: store.get('pngQuality', 'medium'),
      transparent: stageBackground.get() === 'checker',
      onChange: quality => store.set('pngQuality', quality),
      getSize: quality => pngPose(quality).size,
      getDetail: () => 'PNG · 当前互动姿势',
      onExport: (quality, transparent) => exportPortrait(quality, transparent),
      onCopy: (quality, transparent) => exportPortrait(quality, transparent, true),
    })) },
    { label: '录制互动视频', fn: () => openToolPanel('录制互动视频', mountVideoOptions) },
    { heading: '画面' },
    { label: '背景颜色 / 预设', fn: () => openToolPanel('背景颜色 / 预设', mountBackgroundOptions) },
    { label: '沉浸模式', fn: () => { setImmersive(true); exitImmersive.focus(); } },
  ], rect.right, rect.bottom + 6, { title: '更多功能', owner: more, moreMenu: true });
  menu.style.left = Math.max(8, rect.right - menu.offsetWidth) + 'px';
  if (rect.bottom + 6 + menu.offsetHeight > innerHeight - 8) {
    menu.style.top = Math.max(8, rect.top - menu.offsetHeight - 6) + 'px';
  }
};
exitImmersive.onclick = () => { setImmersive(false); more.focus(); };
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !event.defaultPrevented && !exitImmersive.hidden) exitImmersive.click();
});

search.oninput = () => { page = 1; renderLibrary(); };
$('previous').onclick = () => { page--; renderLibrary(); library.scrollTop = 0; };
$('next').onclick = () => { page++; renderLibrary(); library.scrollTop = 0; };
$('back').onclick = () => navigate(null);
$('retry').onclick = renderRoute;
$('hints').onclick = () => {
  guideOn = !guideOn;
  hints.setAttribute('aria-pressed', String(guideOn));
  if (!guideOn) clearGuide();
};
$('restart').onclick = () => { cancelInput(); scene?.gestures.restart(); };
$('fit').onclick = fit;
$('zoom-in').onclick = () => zoom(1.2);
$('zoom-out').onclick = () => zoom(1 / 1.2);
tool.onchange = () => scene?.gestures.chooseTool(Number(tool.value));
soundControl.onchange = () => {
  soundMode = soundControl.value;
  scene?.sound?.setMode(soundMode);
};
window.addEventListener('popstate', renderRoute);
window.addEventListener('blur', () => cancelInput());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopVideoRecording();
    cancelInput();
  }
});
K.observeCanvas(canvas, resize);
K.bindPinch(stage, {
  ready: () => Boolean(scene && canvas.dataset.ready && !K.pngExporting && !videoRecording?.capturing),
  isChrome: target => target !== canvas,
  // The interaction handler owns single taps.
  isTap: () => false,
  cancelDrag: () => cancelInput(),
  zoom,
});

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  if (!K.pngExporting) zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX, event.clientY);
}, { passive: false });
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || !scene || !canvas.dataset.ready || K.pngExporting) return;
  scene.sound?.unlock();
  if (scene.gestures.inputLocked) return;
  const { pointerId, clientX, clientY } = event;
  const screen = { x: clientX, y: clientY };
  const world = toWorld(clientX, clientY);
  if (!scene.gestures.start(pointerId, screen, world, performance.now()) && !videoRecording?.capturing) {
    pan = { id: pointerId, world };
  }
  canvas.setPointerCapture(pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!scene) return;
  const { pointerId, clientX, clientY } = event;
  const world = toWorld(clientX, clientY);
  if (pan?.id === pointerId) {
    scene.skeleton.x += world.x - pan.world.x;
    scene.skeleton.y += world.y - pan.world.y;
    pan.world = world;
  } else {
    scene.gestures.move(pointerId, { x: clientX, y: clientY }, world, performance.now());
  }
  if (scene.gestures.gesture?.dragging) canvas.dataset.gesture = 'drag';
  if (event.pointerType === 'mouse' && !event.buttons) {
    canvas.dataset.hotspot = String(!scene.gestures.inputLocked && scene.gestures.match(world).length > 0);
  }
});
canvas.addEventListener('pointerleave', () => { delete canvas.dataset.hotspot; });
canvas.addEventListener('pointerup', event => {
  if (event.isPrimary) scene?.sound?.unlock();
  scene?.gestures.finish(event.pointerId, toWorld(event.clientX, event.clientY), performance.now());
  cancelInput(event.pointerId);
});
canvas.addEventListener('pointercancel', event => cancelInput(event.pointerId));
canvas.addEventListener('lostpointercapture', event => cancelInput(event.pointerId));

if (probe) {
  window.fatedGuestProbe = () => canvas.dataset.ready ? {
    ...scene.gestures.snapshot(toClient), sound: scene.sound?.snapshot(),
  } : null;
}

async function start() {
  const root = window.ARTHUB_COS_CONFIG?.fatedGuestAssetsRoot;
  if (!root) throw new Error('有缘之客资源暂未开放');
  assetsRoot = new URL(root.replace(/\/?$/, '/'), location.href);
  if (assetsRoot.origin !== location.origin && assetsRoot.protocol !== 'https:') throw new Error('资源地址需要使用 HTTPS');
  const soundRoot = window.ARTHUB_COS_CONFIG?.fatedGuestAudioRoot;
  if (soundRoot) {
    const url = new URL(soundRoot.replace(/\/?$/, '/'), location.href);
    if (url.origin === location.origin || url.protocol === 'https:') audioRoot = url;
  }
  const [catalog, rules, sound] = await Promise.all([
    K.fetchJSON('./catalog.json?v=20261111-export-frame'), K.fetchJSON('./rules.json'),
    audioRoot ? K.fetchJSON(new URL('manifest.json', audioRoot).href).catch(() => null) : null,
  ]);
  if (catalog.schemaVersion !== 1 || !catalog.models.length) throw new Error('资源目录为空或版本不匹配');
  if (rules.version !== 1 || !catalog.models.every(model => rules.models?.[model.id])) throw new Error('原始互动规则不匹配');
  authoredRules = rules.models;
  if (sound?.schemaVersion === 1 && sound.models && sound.files) audioManifest = sound;
  models = catalog.models;
  renderRoute();
  requestAnimationFrame(renderFrame);
}

start().catch(error => { $('count').textContent = error.message; });
