function animationGroupsFor(picture) {
  const gestures = picture.gestures;
  const variants = picture.variants || new Map([[gestures.groupIndex, picture]]);
  const grouped = new Map();
  for (const [owner, variant] of variants) {
    for (const group of variant.gestures.animationGroups) {
      const target = grouped.get(group.key) || { ...group, clips: [] };
      grouped.set(group.key, target);
      for (const clip of group.clips) {
        // Identical names can be authored in both skeletons; prefer the matching stage.
        const existing = target.clips.findIndex(item => item.name === clip.name);
        const candidate = { ...clip, owner };
        if (existing < 0) target.clips.push(candidate);
        else if (owner === clip.groupIndex) target.clips[existing] = candidate;
      }
    }
  }
  const groups = [...grouped.values()].sort((a, b) => Number(a.key === 'other') - Number(b.key === 'other') || a.key.localeCompare(b.key, 'en', { numeric: true }));
  return groups;
}
import { FatedGestures } from './gestures.mjs?v=20261122-unified-viewer';
import { FatedSound } from './sounds.mjs?v=20261122-unified-viewer';
import { startVideoCapture, VIDEO_FPS, VIDEO_LIMIT } from './video.mjs?v=20261120-recording-surface';

const backgroundMattes = { B_BG_black: ['B_BG_black', 'B_BG_black2', 'B_BG_black3', 'B_BG_black4'] };
const frameMattes = {
  dating6: { Black: ['Black'] },
  dating9: { 'BK _type2': ['BK _type2'], white: ['black', 'black2', 'black3', 'black4'] },
  dating11: { 'fr (1013)': ['fr (1013)'] },
  dating12: { BK: ['BK'] },
  dating13: { BK: ['BK'], BK2: ['BK2'], BK3: ['BK3'], BK4: ['BK4'] },
  dating14: backgroundMattes,
  dating15: { FR: ['FR'] },
  dating16: { ...backgroundMattes, 'ID1_fr)Bk glow': ['ID1_fr)Bk glow'] },
  dating17: backgroundMattes,
  dating18: backgroundMattes,
  dating19: { 'black glow side_re': ['black glow side_re', 'black glow side_re2', 'black glow side_re3', 'black glow side_re4'] },
  dating20: backgroundMattes,
  dating21: { Black_blur: ['Black_blur'] },
  dating22: { BK_side: ['BK_side', 'BK_side2'], BK_ud: ['BK_ud', 'BK_ud2'] },
};
const matteTransitions = {
  dating16: { clips: ['motion1_15', 'motion1_16', 'motion1_17'], regions: ['ID1_fr)Bk glow'] },
  dating18: { clips: ['mix6_32_1', 'mix6_33_1'], regions: ['B_BG_black'] },
};

function findFrameMattes(model, skeleton) {
  const mattes = [];
  for (const [region, names] of Object.entries(frameMattes[model.id] ?? {})) {
    for (const name of names) {
      const slot = skeleton.findSlot(name);
      if (slot) mattes.push({ region, slot });
    }
  }
  return mattes;
}

function muteFrameMattes({ model, mattes, state }) {
  if (K.framing.original) return [];
  const transition = matteTransitions[model.id];
  const preserveFade = transition && state.tracks.some(track => {
    for (let entry = track; entry; entry = entry.mixingFrom) {
      if (transition.clips.includes(entry.animation.name)) return true;
    }
    return false;
  });
  const muted = [];
  for (const { region, slot } of mattes) {
    // A transition can use its own vignette while the outer frame is still attached.
    if (preserveFade && transition.regions.includes(region)) continue;
    if (slot.attachment?.region?.name !== region || slot.color.a <= 0) continue;
    muted.push([slot, slot.color.a]);
    slot.color.a = 0;
  }
  return muted;
}

const isImageAttachment = (attachment, spine) =>
  attachment instanceof spine.RegionAttachment || attachment instanceof spine.MeshAttachment;

function createPartTarget(skeleton, spine) {
  const indices = new Set();
  for (const skin of skeleton.data.skins) {
    for (const { slotIndex, attachment } of skin.getAttachments()) {
      if (isImageAttachment(attachment, spine)) indices.add(slotIndex);
    }
  }
  const slots = new Map(skeleton.slots.filter(slot => indices.has(slot.data.index)).map(slot => [slot.data.name, slot]));
  return { slots, hidden: new Set(), parts: [...slots.keys()].map(name => ({ id: name, name })) };
}

const K = window.SpineKit;
const $ = id => document.getElementById(id);
const library = $('gridView'), stage = $('stage'), canvas = $('portrait');
const search = $('gridSearch'), cards = $('thumbGrid'), tool = $('tool');
const sort = $('fated-sort'), sortDirection = $('fated-sort-direction');
const libraryAll = $('fated-library-all'), libraryStars = $('fated-library-stars');
const soundControl = $('sound-mode');
const hints = $('hints'), hintLayer = $('gesture-hints'), hintStatus = $('hint-status');
const scoreMeter = $('score-meter'), scoreBar = scoreMeter.querySelector('progress'), scoreText = scoreMeter.querySelector('span');
const panel = $('floatPanel'), panelTabs = [...panel.querySelectorAll('[data-panel-tab]')];
const animationStage = $('animation-stage'), partsDialog = $('parts-dialog'), pickButton = $('exitPartEdit');
const interactButton = $('btnStagePan'), immersiveExit = $('immersiveExit'), starButton = $('railStar');
const zoomButtons = [$('zOut'), $('zPct'), $('zIn')];
const exportButtons = [$('btnPng'), $('btnGif')];
const recordingBar = $('recording-bar'), recordingTime = $('recording-time');
const store = K.Store('bd2-fated');
const volume = window.ArtHubBd2Volume;
const stageBackground = K.createStageBackground({ stage, read: () => store.get('bg', '#000000'), write: color => store.set('bg', color) });
const markers = new Map();
const nameOrder = new Intl.Collator('zh-CN', { numeric: true });
const moreButton = () => document.querySelector('.kit-more-tool');
let guideOn = false, lastGuideFrame = -Infinity;
let authoredRules;
let audioRoot, audioManifest, soundMode = 'all';
const initialParams = new URLSearchParams(location.search);
const probe = initialParams.get('probe') === '1' && ['127.0.0.1', 'localhost'].includes(location.hostname);
let models = [], libraryMatches = [], favoritesOnly = false, descending = store.get('descending', false);
let page = 1, assetsRoot, request, activeModel, scene, gl, runtime, lastFrame = 0;
let interactive = true, playing = true, playbackSpeed = 1;
let pan = null, interactionTouch = null, partTap = null, pendingPartPick = null;
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

function starredIds() {
  return new Set(store.get('stars', []));
}

function updateResourceNavigation() {
  const starred = starredIds().has(activeModel?.id);
  starButton.setAttribute('aria-pressed', String(starred));
  starButton.classList.toggle('on', starred);
  starButton.innerHTML = K.uiIcon('star', 18, starred);
  starButton.disabled = !activeModel;
  const list = libraryMatches.includes(activeModel) ? libraryMatches : models;
  const index = list.indexOf(activeModel);
  for (const [id, model] of [['btnPrev', list[index - 1]], ['btnNext', list[index + 1]]]) {
    const button = $(id);
    button.disabled = index < 0 || !model;
    button.onclick = model ? () => navigate(model.id) : null;
  }
}

function toggleFavorite(id) {
  const stars = starredIds();
  if (!stars.delete(id)) stars.add(id);
  store.set('stars', [...stars]);
  renderLibrary();
  K.refreshStageUI?.();
}

function libraryCard(model, starred) {
  const card = document.createElement('article');
  card.className = 'thumb-card';
  card.classList.toggle('selected', model === activeModel);
  const link = document.createElement('a');
  link.className = 'fated-card-link';
  link.href = modelURL(model.id);
  const image = document.createElement('div');
  image.className = 'ph';
  K.setPreview(image, K.thumbnailURL(model.thumbnail ? K.siteRoot() + 'thumbs/' + model.thumbnail : asset('thumbs/' + model.id + '.webp')));
  const meta = document.createElement('div'), name = document.createElement('div');
  meta.className = 'tm';
  name.className = 'tn';
  name.textContent = model.name;
  meta.append(name);
  link.append(image, meta);
  link.onclick = event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(model.id);
  };
  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'tstar' + (starred ? ' on' : '');
  star.innerHTML = K.uiIcon('star', 18, starred);
  star.onclick = () => toggleFavorite(model.id);
  card.append(link, star);
  return card;
}

function renderPagination(total) {
  for (const nav of K.paginationHosts(library)) {
    nav.hidden = total <= 1;
    nav.replaceChildren();
    if (nav.hidden) continue;
    const pages = Array.from({ length: total }, (_, index) => [String(index + 1), index + 1]);
    for (const [label, target] of [['‹', page - 1], ...pages, ['›', page + 1]]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'grid-page-btn' + (target === page ? ' on' : '');
      button.textContent = label;
      button.disabled = target < 1 || target > total;
      if (target === page) button.setAttribute('aria-current', 'page');
      button.onclick = () => {
        page = target;
        renderLibrary();
        library.scrollTo({ top: 0, behavior: 'smooth' });
      };
      nav.append(button);
    }
  }
}

function renderLibrary() {
  const query = search.value.trim().toLocaleLowerCase();
  const stars = starredIds();
  const matches = models.filter(model => (!favoritesOnly || stars.has(model.id)) &&
    [model.name, model.id, model.prefab].join(' ').toLocaleLowerCase().includes(query));
  if (sort.value === 'name') matches.sort((a, b) => nameOrder.compare(a.name, b.name));
  if (descending) matches.reverse();
  libraryMatches = matches;
  const pageSize = K.libraryPageSize();
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  page = Math.min(page, pages);
  cards.replaceChildren(...matches.slice((page - 1) * pageSize, page * pageSize).map(model => libraryCard(model, stars.has(model.id))));
  $('gridSub').textContent = matches.length + ' 个资源';
  $('fated-star-count').textContent = String(models.filter(model => stars.has(model.id)).length);
  libraryAll.classList.toggle('on', !favoritesOnly);
  libraryStars.classList.toggle('on', favoritesOnly);
  if (!matches.length) {
    const empty = document.createElement('p');
    empty.className = 'fated-library-empty';
    empty.textContent = favoritesOnly && !query ? '暂无收藏资源' : '没有符合条件的立绘';
    cards.append(empty);
  }
  renderPagination(pages);
  updateResourceNavigation();
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
  if (id == null || interactionTouch === id) interactionTouch = null;
  if (id == null || partTap?.id === id) partTap = null;
  if (id == null) pendingPartPick = null;
  if (!scene?.gestures.gesture) delete canvas.dataset.gesture;
}

function dispose() {
  stopVideoRecording();
  request?.abort();
  K.hideMenu();
  K.closeToolPopup();
  closePanel();
  setImmersive(false);
  cancelInput();
  scene?.sound?.dispose();
  for (const extra of scene?.extraAtlases || []) if (extra !== scene.atlas) K.disposeAtlas(extra);
  K.disposeAtlas(scene?.atlas);
  scene = null;
  activeModel = null;
  $('fated-tool-field').hidden = true;
  scoreMeter.hidden = true;
  setStageReady(false);
  animationStage.hidden = true;
  animationStage.replaceChildren();
  $('animFilter').value = '';
  playbackUI.refreshAnimations();
  clearGuide();
  delete canvas.dataset.ready;
}

function showLibrary(keepCurrent = false) {
  if (keepCurrent && canvas.dataset.ready) {
    closePanel();
    K.hideMenu();
    K.closeToolPopup();
    cancelInput();
    scene.sound?.setMode('off');
  } else dispose();
  stage.hidden = true;
  library.classList.add('open');
  K.setLibraryStageReady(Boolean(canvas.dataset.ready));
  document.title = '棕色尘埃 2 · 有缘之客 | ArtHub';
  renderLibrary();
}

function showStage(model) {
  library.classList.remove('open');
  K.closeThemePalette();
  stage.hidden = false;
  document.title = model.name + ' · 棕色尘埃 2 | ArtHub';
  K.refreshStageUI?.();
}

function closeLibrary() {
  if (!scene || !canvas.dataset.ready) return;
  scene.sound?.setMode(soundMode, Boolean(scene.sound.context));
  showStage(scene.model);
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
  $('fated-tool-field').hidden = options.length <= 1;
  tool.disabled = gestures.toolLocked;
}

function resize() {
  if (!gl || stage.hidden || K.pngExporting || videoRecording?.capturing) return;
  K.resizeCanvas(canvas, gl.renderer);
  K.syncRendererSize(canvas, gl.mgl, gl.renderer);
  fit(undefined, true);
}

function portraitFrame(picture, forExport = false) {
  // Fit and export use the game's stage rectangle. Original preview still draws
  // all source layers, including the parts outside this stage.
  if (K.framing.original) return picture.nativeFrame;
  const { model, bounds, gestures, state } = picture;
  const clip = state.getCurrent(0)?.animation.name;
  let reviewedClip = clip;
  for (let overlay = state.getCurrent(1); overlay; overlay = overlay.mixingFrom) {
    if (overlay.animation.name === '<empty>') continue;
    reviewedClip = overlay.animation.name;
    break;
  }
  const group = model.groupFrames?.[gestures.group.id];
  const fullFrame = Boolean(group?.fullFrameClips?.includes(clip));
  const reviewedGroup = model.reviewedFrames?.[String(gestures.groupIndex)];
  const reviewedFrame = reviewedGroup?.[reviewedClip] || (!fullFrame && reviewedGroup?.['*']);
  if (reviewedFrame) return reviewedFrame;
  // These clips reveal a second scene beyond the first shot's vignette.
  if (group && !fullFrame) return group.frame;
  return model.displayFrame || (forExport && model.exportFrame) || bounds;
}

function fit(frame = scene && portraitFrame(scene), preserveView = false) {
  if (!scene || videoRecording?.capturing) return;
  const { skeleton, displayFrame, fitScale, viewArea } = scene;
  const area = K.stageViewArea(canvas);
  const width = frame.maxX - frame.minX, height = frame.maxY - frame.minY;
  const scale = 0.97 * Math.min(area.pixelWidth / width, area.pixelHeight / height);
  const keep = preserveView && displayFrame && fitScale && viewArea;
  const zoom = keep ? skeleton.scaleX / fitScale : 1;
  const panX = keep ? skeleton.x + (displayFrame.minX + displayFrame.maxX) * skeleton.scaleX / 2 - viewArea.offsetX : 0;
  const panY = keep ? skeleton.y + (displayFrame.minY + displayFrame.maxY) * skeleton.scaleY / 2 - viewArea.offsetY : 0;
  scene.fitScale = scale;
  scene.displayFrame = frame;
  scene.viewArea = area;
  skeleton.scaleX = skeleton.scaleY = scale * zoom;
  skeleton.x = area.offsetX + panX - (frame.minX + frame.maxX) * skeleton.scaleX / 2;
  skeleton.y = area.offsetY + panY - (frame.minY + frame.maxY) * skeleton.scaleY / 2;
  $('zPct').textContent = Math.round(zoom * 100) + '%';
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
  if (!guideOn || !interactive || t - lastGuideFrame < 34) return;
  lastGuideFrame = t;
  const rect = canvas.getBoundingClientRect();
  const occlusions = [...document.querySelectorAll('#rail, #toolStrip, #siteMobileDock, #playbar, #floatPanel.open, #status, #score-meter, #recording-bar')]
    .map(element => element.getBoundingClientRect()).filter(box => box.width && box.height);
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
  if (hintStatus.textContent !== guide.message) hintStatus.textContent = guide.message;
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
  $('zPct').textContent = Math.round(scale / fitScale * 100) + '%';
}

async function showModel(model) {
  dispose();
  activeModel = model;
  playing = true;
  $('status').textContent = model.name;
  showStage(model);
  updateResourceNavigation();
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
    sound?.setVolume(volume.read());
    const gestures = new FatedGestures(profile, skeleton, state, data, SP.TranslateTimeline, model.frame, authoredRules[model.id], sound);
    state.apply(skeleton);
    K.updateWorldTransform(skeleton, SP.Physics?.pose);
    const bounds = model.frame || K.measureBounds(skeleton, SP, false);
    if (!bounds || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) throw new Error('立绘没有可见画面');
    scene = {
      model, skeleton, state, gestures, bounds, atlas, sound, pma: Boolean(atlas.pages[0].pma),
      nativeFrame: bounds,
      mattes: findFrameMattes(model, skeleton),
      partTarget: createPartTarget(skeleton, SP),
    };
    atlas = null;
    if (model.groupAssets) {
      const activeScene = scene;
      activeScene.loadingVariants = true;
      const variants = new Map([[0, {
        skeleton, state, gestures, atlas: activeScene.atlas, pma: activeScene.pma, mattes: activeScene.mattes,
        nativeFrame: activeScene.nativeFrame,
        partTarget: activeScene.partTarget,
      }]]);
      activeScene.extraAtlases = [activeScene.atlas];
      activeScene.variants = variants;
      for (let index = 1; index < profile.groups.length; index++) {
        const spec = model.groupAssets[profile.groups[index].id];
        if (!spec || spec.skel === model.skel) continue;
        const groupFiles = await K.loadSpineFiles(SP, gl.mgl, {
          atlasURL: asset(dir + spec.atlas), skeletonURL: asset(dir + spec.skel), signal,
        });
        activeScene.extraAtlases.push(groupFiles.atlas);
        signal.throwIfAborted();
        const groupData = new SP.SkeletonBinary(new SP.AtlasAttachmentLoader(groupFiles.atlas)).readSkeletonData(groupFiles.bytes);
        const groupSkeleton = new SP.Skeleton(groupData);
        const groupStateData = new SP.AnimationStateData(groupData);
        groupStateData.defaultMix = 0.12;
        const groupState = new SP.AnimationState(groupStateData);
        const groupGestures = new FatedGestures(profile, groupSkeleton, groupState, groupData,
          SP.TranslateTimeline, spec.frame || model.frame, authoredRules[model.id], sound, index);
        variants.set(index, { skeleton: groupSkeleton, state: groupState, gestures: groupGestures,
          atlas: groupFiles.atlas, pma: Boolean(groupFiles.atlas.pages[0].pma), mattes: findFrameMattes(model, groupSkeleton),
          nativeFrame: spec.frame || bounds,
          partTarget: createPartTarget(groupSkeleton, SP) });
      }
      for (const [index, variant] of variants) {
        variant.gestures.onGroupChange = (next, transition) => {
          if (next === index || !variants.has(next)) return false;
          const target = variants.get(next);
          for (const key of ['x','y','scaleX','scaleY']) target.skeleton[key] = activeScene.skeleton[key];
          target.gestures.enterGroup(next, transition);
          Object.assign(activeScene, target);
          if (canvas.dataset.ready) setStageReady(true);
          if (panel.classList.contains('open') && partsDialog.classList.contains('on')) partsPanel.refresh();
          return true;
        };
      }
    }
    scene.loadingVariants = false;
    const groups = animationGroupsFor(scene);
    scene.animationGroups = groups;
    scene.animationClips = new Map(groups.flatMap(group => group.clips.map(clip => [clip.name, clip])));
    animationStage.replaceChildren(new Option('全部阶段', ''),
      ...groups.map(group => new Option(group.label, group.key)));
    animationStage.hidden = groups.length < 2;
    $('status').textContent = model.name + ' · ' + scene.animationClips.size + ' 个动作';
    soundControl.value = soundMode;
    soundControl.disabled = !sound;
    resize();
    updateTools();
    playbackUI.refreshAnimations();
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
  if (scene?.model.id === id && canvas.dataset.ready) {
    if (library.classList.contains('open')) closeLibrary();
    return;
  }
  history.pushState(null, '', modelURL(id));
  renderRoute();
}

function previewFrame(picture) {
  return !K.framing.original && (picture.model.frame || picture.displayFrame !== picture.bounds) && picture.displayFrame;
}

function drawPortrait(picture, cropPreview = false, clearColor = null) {
  const { mgl, renderer } = gl;
  const raw = mgl.gl;
  if (clearColor) raw.clearColor(...clearColor, 1);
  else raw.clearColor(0, 0, 0, 0);
  raw.clear(raw.COLOR_BUFFER_BIT);
  if (!picture || picture.loadingVariants) return;
  const { skeleton } = picture;
  const frame = cropPreview && previewFrame(picture);
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
  // Edge textures are separate from the scene lights and can share slots with animation attachments.
  const muted = muteFrameMattes(picture);
  const hiddenAttachments = [];
  try {
    for (const name of picture.partTarget.hidden) {
      const slot = picture.partTarget.slots.get(name);
      const attachment = slot.attachment;
      if (!isImageAttachment(attachment, runtime)) continue;
      // A temporary draw override preserves the current attachment, deform and timeline state.
      hiddenAttachments.push([slot, attachment]);
      slot.attachment = null;
    }
    renderer.begin();
    try { renderer.drawSkeleton(skeleton, picture.pma); }
    finally { renderer.end(); }
  } finally {
    for (const [slot, attachment] of hiddenAttachments) slot.attachment = attachment;
    for (const [slot, opacity] of muted) slot.color.a = opacity;
    if (frame) raw.disable(raw.SCISSOR_TEST);
  }
}

function renderFrame(t) {
  requestAnimationFrame(renderFrame);
  const dt = lastFrame ? Math.min((t - lastFrame) / 1000, 0.1) : 0;
  lastFrame = t;
  if (!gl || document.hidden || stage.hidden || K.pngExporting || gl.mgl.gl.isContextLost()) return;
  if (!scene || scene.loadingVariants) { drawPortrait(null); return; }
  if (playing) scene.gestures.tick(t, dt);
  const { state, skeleton, gestures } = scene;
  if (playing) state.update(dt * playbackSpeed);
  state.apply(skeleton);
  const recording = videoRecording?.capturing;
  if (recording) syncVideoFrame(videoRecording);
  else {
    const frame = portraitFrame(scene);
    if (scene.displayFrame !== frame) fit(frame, true);
  }
  const updateWorld = () => K.updateWorldTransform(skeleton, runtime.Physics?.update);
  updateWorld();
  gestures.applyOverrides(updateWorld);
  if (playing) gestures.updateDragDestination(t);
  if (!gestures.gesture?.dragging) delete canvas.dataset.gesture;
  if (!captureVideoFrame(t)) {
    drawPortrait(scene, !recording, recording ? videoRecording.clearColor : null);
  }
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
    setStageReady(true);
    setMessage('');
  }
  playbackUI.update();
  updateGuide(t);
}

function portraitExportFrame(picture) {
  return portraitFrame(picture, true);
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
  moreButton()?.focus({ preventScroll: true });
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
  delete document.body.dataset.viewerExporting;
  stage.style.removeProperty('--video-aspect');
  if (scene !== session.picture) return;
  cancelInput();
  const { skeleton, gestures } = scene;
  K.resizeCanvas(canvas, gl.renderer);
  K.syncRendererSize(canvas, gl.mgl, gl.renderer);
  if (canvas.width === session.view.width && canvas.height === session.view.height) {
    Object.assign(skeleton, session.view.transform);
    const frame = portraitFrame(scene);
    if (scene.displayFrame !== frame) fit(frame, true);
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
  }
}

function captureVideoFrame(now) {
  const session = videoRecording;
  if (!session?.capturing || !session.capture) return false;
  try {
    session.capture.frame(now, () => drawPortrait(session.picture, false, session.clearColor));
    const seconds = Math.min(VIDEO_LIMIT, Math.max(0, Math.floor((now - session.started) / 1000)));
    const text = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    if (recordingTime.value !== text) recordingTime.value = text;
  } catch (error) {
    session.frameError = error;
    stopVideoRecording(false);
  }
  return true;
}

function syncVideoFrame(session, frame = portraitExportFrame(session.picture)) {
  if (frame === session.frame) return;
  const { skeleton } = session.picture;
  // Recording keeps its canvas size when a transition opens the wider scene.
  const scale = Math.min(canvas.width / (frame.maxX - frame.minX), canvas.height / (frame.maxY - frame.minY));
  skeleton.scaleX = skeleton.scaleY = scale;
  skeleton.x = -(frame.minX + frame.maxX) * scale / 2;
  skeleton.y = -(frame.minY + frame.maxY) * scale / 2;
  session.frame = frame;
}

async function recordPortrait(quality, withAudio) {
  if (!scene || !canvas.dataset.ready || K.pngExporting || videoRecording) return;
  const { skeleton } = scene;
  const { x, y, scaleX, scaleY } = skeleton;
  const view = { width: canvas.width, height: canvas.height, transform: { x, y, scaleX, scaleY } };
  const controller = new AbortController();
  const background = stageBackground.get();
  const clearColor = background === 'checker' ? null : K.parseColor(background, [0, 0, 0]);
  const frame = portraitExportFrame(scene);
  const session = videoRecording = { picture: scene, frame, view, controller, clearColor, capturing: true };
  K.closeToolPopup();
  try {
    const size = K.exportDimensions(frame, quality, 'video', 0);
    const applyWorldPose = captureWorldPose(skeleton);
    cancelInput();
    stage.style.setProperty('--video-aspect', String(size.width / size.height));
    stage.dataset.videoRecording = 'true';
    document.body.dataset.viewerExporting = 'true';
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
    drawPortrait(scene, false, clearColor);
    recordingTime.value = '0:00';
    $('recording-state').textContent = '准备录制';
    $('video-save').disabled = true;
    recordingBar.hidden = false;
    // Let the recording layout render before starting the capture clock.
    await K.awaitExportTask(new Promise(resolve => setTimeout(resolve, 200)), controller.signal);
    if (withAudio) {
      try { session.audio = scene.sound?.captureAudio(); } catch {}
      if (!session.audio) K.toast('本次录制没有录入互动声音', 'info');
    }
    session.capture = await startVideoCapture(K, canvas, quality, background, session.audio?.track, controller.signal, !!clearColor);
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
    if (K.isAbort(error)) K.toast('已取消录制', 'info');
    else K.toast('无法开始录制 · ' + error.message, 'err');
  }
}

function mountVideoOptions(panel) {
  panel.innerHTML = '<div class="col video-options"><label for="video-quality">画质</label>'
    + '<select class="ctl" id="video-quality"></select>'
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

const partsPanel = K.mountPartsPanel({
  listEl: $('fated-parts-list'),
  filterEl: $('fated-part-filter'),
  allEl: $('fated-parts-show'),
  noneEl: $('fated-parts-hide'),
  invEl: $('fated-parts-invert'),
  getTargets: () => scene ? [scene.partTarget] : [],
});

function setPartPicking(enabled) {
  cancelInput();
  if (!enabled) K.hideMenu();
  stage.toggleAttribute('data-picking-parts', enabled);
  pickButton.setAttribute('aria-pressed', String(enabled));
  pickButton.textContent = enabled ? '结束点选' : '画面点选';
}

function pickPart(clientX, clientY) {
  const { x, y } = toWorld(clientX, clientY);
  const { skeleton, partTarget } = scene;
  const frame = previewFrame(scene);
  if (frame) {
    const localX = (x - skeleton.x) / skeleton.scaleX;
    const localY = (y - skeleton.y) / skeleton.scaleY;
    if (localX < frame.minX || localX > frame.maxX || localY < frame.minY || localY > frame.maxY) return;
  }
  const muted = muteFrameMattes(scene);
  try {
    const drawOrder = skeleton.drawOrder.filter(slot => !partTarget.hidden.has(slot.data.name) &&
      isImageAttachment(slot.attachment, runtime));
    const name = K.hitTestSlot({ drawOrder, slots: drawOrder }, x, y, runtime);
    if (name) {
      partsPanel.focus(name);
      K.showMenu([
        { heading: name },
        { label: '隐藏此部件', fn: () => {
          if (scene?.partTarget === partTarget && stage.hasAttribute('data-picking-parts')) partsPanel.hide(name);
        } },
        { label: '取消' },
      ], clientX, clientY);
    }
  } finally {
    for (const [slot, opacity] of muted) slot.color.a = opacity;
  }
}

function closePanel() {
  panel.classList.remove('open');
  document.body.classList.remove('interaction-open');
  if (stage.hasAttribute('data-picking-parts')) setPartPicking(false);
}

function setStageReady(ready) {
  for (const button of [...zoomButtons, ...exportButtons, interactButton, $('btnAnimTab')]) button.disabled = !ready;
  const available = {
    anim: scene?.animationClips?.size,
    parts: scene?.partTarget.parts.length,
    interaction: Boolean(scene),
    voice: Boolean(scene),
  };
  for (const tab of panelTabs) {
    tab.disabled = !ready || !available[tab.dataset.panelTab];
    tab.hidden = ready && !available[tab.dataset.panelTab];
  }
}

function playbackTrack() {
  const overlay = scene?.state.getCurrent(1);
  return overlay && overlay.animationEnd > overlay.animationStart ? overlay : scene?.state.getCurrent(0);
}

function playbackCanEdit() {
  const gestures = scene?.gestures;
  return Boolean(gestures && !gestures.gesture && !gestures.switching &&
    (!gestures.reaction || gestures.reaction.kind === 'preview'));
}

function setPlaying(enabled) {
  if (!enabled) {
    cancelInput();
    scene?.sound?.stopReaction();
  }
  playing = enabled;
}

function animationOptions() {
  const groups = scene?.animationGroups ?? [];
  const listed = animationStage.value
    ? groups.find(group => group.key === animationStage.value)?.clips ?? []
    : [...(scene?.animationClips?.values() ?? [])];
  return listed.map(clip => ({
    name: clip.name,
    duration: (scene.variants?.get(clip.owner)?.skeleton ?? scene.skeleton).data.findAnimation(clip.name)?.duration ?? 0,
  }));
}

const playbackUI = window.createInteractionViewerUI({
  canvas: () => canvas,
  animations: animationOptions,
  playback: () => {
    const track = playbackTrack();
    const canEdit = playbackCanEdit();
    return {
      key: scene?.model.id,
      ready: Boolean(scene && canvas.dataset.ready),
      name: track?.animation.name,
      time: track ? track.getAnimationTime() - track.animationStart : 0,
      duration: track ? track.animationEnd - track.animationStart : 0,
      loop: track?.loop,
      playing,
      speed: playbackSpeed,
      canSeek: canEdit,
      canLoop: canEdit,
    };
  },
  selectAnimation(name) {
    const clip = scene?.animationClips?.get(name);
    if (!clip || !canvas.dataset.ready || K.pngExporting || videoRecording) return;
    cancelInput();
    setPlaying(true);
    scene.sound?.unlock();
    if (scene.variants) scene.gestures.enterGroup(clip.owner, false);
    scene.gestures.previewAnimation(clip);
  },
  setPlaying,
  setSpeed: speed => { playbackSpeed = speed; },
  setLoop(loop) {
    const track = playbackTrack();
    if (track && playbackCanEdit()) track.loop = loop;
  },
  seek(time) {
    const track = playbackTrack();
    if (!track || !playbackCanEdit()) return;
    const duration = track.animationEnd - track.animationStart;
    track.trackTime = Math.min(time, track.loop ? Math.max(0, duration - 0.000001) : duration);
    track.trackLast = track.nextTrackLast = track.trackTime;
    track.animationLast = track.nextAnimationLast = track.animationStart + track.trackTime;
  },
  onError: error => K.toast(error.message, 'err'),
});

async function prepareOriginals() {
  if (!scene) throw new Error('请先加载一个资源');
}

function mountPngOptions(popup) {
  popup.classList.add('viewer-tools-popup');
  K.mountExportOptions(popup, {
    prepareOriginals,
    kind: 'png',
    quality: store.get('pngQuality', 'high'),
    transparent: stageBackground.get() === 'checker',
    onChange: quality => store.set('pngQuality', quality),
    getSize: quality => pngPose(quality).size,
    getDetail: () => 'PNG · 当前互动姿势',
    onExport: (quality, transparent) => exportPortrait(quality, transparent),
    onCopy: (quality, transparent) => exportPortrait(quality, transparent, true),
  });
}

function setInteractionMode(enabled) {
  cancelInput();
  interactive = enabled;
  stage.dataset.panMode = enabled ? 'interact' : 'pan';
  interactButton.classList.toggle('on', enabled);
  interactButton.setAttribute('aria-pressed', String(enabled));
  interactButton.title = enabled ? '关闭立绘互动' : '开启立绘互动';
  if (!enabled) {
    clearGuide();
    delete canvas.dataset.hotspot;
  }
}

function setImmersive(enabled) {
  document.body.classList.toggle('viewer-immersive', enabled);
  immersiveExit.hidden = !enabled;
  if (enabled) closePanel();
  K.refreshStageUI?.();
}

function refreshLibraryFilter() {
  page = 1;
  library.scrollTop = 0;
  renderLibrary();
}

sort.value = store.get('sort', 'default');
if (!sort.value) sort.value = 'default';
if (descending) sortDirection.title = '当前降序，点击切换为升序';
search.oninput = refreshLibraryFilter;
sort.onchange = () => { store.set('sort', sort.value); refreshLibraryFilter(); };
sortDirection.onclick = () => {
  descending = !descending;
  sortDirection.title = descending ? '当前降序，点击切换为升序' : '当前升序，点击切换为降序';
  K.setUiIcon(sortDirection, descending ? 'down' : 'up');
  store.set('descending', descending);
  refreshLibraryFilter();
};
libraryAll.onclick = () => { favoritesOnly = false; refreshLibraryFilter(); };
libraryStars.onclick = () => { favoritesOnly = true; refreshLibraryFilter(); };
starButton.onclick = () => { if (activeModel) toggleFavorite(activeModel.id); };
$('railGrid').onclick = () => { if (!K.pngExporting && !videoRecording) showLibrary(true); };
$('gridClose').onclick = closeLibrary;
$('retry').onclick = renderRoute;

$('btnAnimTab').onclick = () => panel.classList.add('open');
$('panel-close').onclick = closePanel;
for (const tab of panelTabs) {
  tab.addEventListener('click', () => {
    if (tab.dataset.panelTab === 'parts') partsPanel.refresh();
    else if (stage.hasAttribute('data-picking-parts')) setPartPicking(false);
  });
}
animationStage.onchange = () => playbackUI.refreshAnimations();
pickButton.onclick = () => setPartPicking(!stage.hasAttribute('data-picking-parts'));
interactButton.onclick = () => {
  setInteractionMode(!interactive);
  if (interactive && scene) {
    const { gestures, sound } = scene;
    if (gestures.reaction?.kind === 'preview') {
      sound?.stopReaction();
      gestures.enterGroup(gestures.groupIndex, false);
    }
    setPlaying(true);
  }
};
K.setUiIcon(interactButton, 'interact', '互动');
setInteractionMode(interactive);
$('hints').onclick = () => {
  guideOn = !guideOn;
  hints.setAttribute('aria-pressed', String(guideOn));
  if (guideOn) setInteractionMode(true);
  else clearGuide();
};
$('restart').onclick = () => { cancelInput(); setPlaying(true); scene?.gestures.restart(); };
$('zPct').onclick = $('railThumb').onclick = () => fit();
$('zIn').onclick = () => zoom(1.2);
$('zOut').onclick = () => zoom(1 / 1.2);
tool.onchange = () => scene?.gestures.chooseTool(Number(tool.value));
soundControl.onchange = () => {
  soundMode = soundControl.value;
  scene?.sound?.setMode(soundMode);
};
volume.mount($('fated-voice-volume'), value => scene?.sound?.setVolume(value));

K.makeStagePopup($('btnPng'), mountPngOptions);
K.makeStagePopup($('btnGif'), popup => {
  popup.classList.add('viewer-tools-popup');
  K.prepareExportMenu(popup, prepareOriginals, mountVideoOptions);
});
K.makeStagePopup($('btnBg'), stageBackground.mount);
$('btnPresetImmersive').onclick = () => { setImmersive(true); immersiveExit.focus(); };
immersiveExit.onclick = () => { setImmersive(false); moreButton()?.focus(); };
$('video-save').onclick = () => stopVideoRecording();
$('video-cancel').onclick = () => stopVideoRecording(false);

K.initTheme(store);
K.bindThemePalette($('btnTheme'), store);
cards.dataset.density = store.get('density', 'standard');
K.stageFramingMenuItem = () => K.framing.menuItem({
  disabled: !scene || !canvas.dataset.ready || K.pngExporting || Boolean(videoRecording),
  onChange() {
    if (!scene || K.pngExporting || videoRecording) return;
    const restoreWorld = captureWorldPose(scene.skeleton);
    fit();
    restoreWorld();
    drawPortrait(scene, true);
  },
});
K.initStageUI({ canvas, refit: () => { if (!stage.hidden) resize(); } });
matchMedia('(max-width: 720px)').addEventListener('change', () => { if (models.length) renderLibrary(); });
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
  ready: () => Boolean(scene && canvas.dataset.ready && interactionTouch === null && !K.pngExporting && !videoRecording?.capturing),
  isChrome: target => target !== canvas,
  // The interaction handler owns single taps.
  isTap: () => false,
  cancelDrag: () => cancelInput(),
  zoom,
});

// Keep Safari's viewport zoom out of the interaction stage.
const preventBrowserZoom = event => event.preventDefault();
stage.addEventListener('gesturestart', preventBrowserZoom, { passive: false });
stage.addEventListener('gesturechange', preventBrowserZoom, { passive: false });

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  if (!K.pngExporting) zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX, event.clientY);
}, { passive: false });
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || !scene || !canvas.dataset.ready || K.pngExporting) return;
  if (stage.hasAttribute('data-picking-parts')) {
    K.hideMenu();
    pendingPartPick = null;
    partTap = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  const { pointerId, clientX, clientY } = event;
  const screen = { x: clientX, y: clientY };
  const world = toWorld(clientX, clientY);
  if (playing && interactive) {
    scene.sound?.unlock();
    if (scene.gestures.inputLocked) return;
    if (scene.gestures.start(pointerId, screen, world, performance.now())) {
      // Some hotspots trigger before release. Keep the touch reserved until it ends.
      if (event.pointerType === 'touch') interactionTouch = pointerId;
      canvas.setPointerCapture(pointerId);
      return;
    }
  }
  if (!videoRecording?.capturing) {
    pan = { id: pointerId, world };
    canvas.setPointerCapture(pointerId);
  }
});
canvas.addEventListener('pointermove', event => {
  if (!scene) return;
  const { pointerId, clientX, clientY } = event;
  const picking = stage.hasAttribute('data-picking-parts');
  if (picking) {
    if (partTap?.id !== pointerId) return;
    if (!pan && Math.hypot(clientX - partTap.x, clientY - partTap.y) > 8) {
      pan = { id: pointerId, world: toWorld(partTap.x, partTap.y) };
    }
  }
  const world = toWorld(clientX, clientY);
  if (pan?.id === pointerId) {
    scene.skeleton.x += world.x - pan.world.x;
    scene.skeleton.y += world.y - pan.world.y;
    pan.world = world;
  } else if (!picking && playing && interactive) {
    scene.gestures.move(pointerId, { x: clientX, y: clientY }, world, performance.now());
  }
  if (picking) return;
  if (scene.gestures.gesture?.dragging) canvas.dataset.gesture = 'drag';
  if (event.pointerType === 'mouse' && !event.buttons) {
    canvas.dataset.hotspot = String(playing && interactive && !scene.gestures.inputLocked && scene.gestures.match(world).length > 0);
  }
});
canvas.addEventListener('pointerleave', () => { delete canvas.dataset.hotspot; });
canvas.addEventListener('pointerup', event => {
  if (stage.hasAttribute('data-picking-parts')) {
    if (!pan && partTap?.id === event.pointerId && Math.hypot(event.clientX - partTap.x, event.clientY - partTap.y) <= 8) {
      pendingPartPick = { x: event.clientX, y: event.clientY, target: scene?.partTarget };
    }
    cancelInput(event.pointerId);
    return;
  }
  if (playing && interactive && scene) {
    if (event.isPrimary) scene.sound?.unlock();
    scene.gestures.finish(event.pointerId, toWorld(event.clientX, event.clientY), performance.now());
  }
  cancelInput(event.pointerId);
});
// Open after the completed click so the same tap cannot dismiss its own menu.
canvas.addEventListener('click', event => {
  const pick = pendingPartPick;
  pendingPartPick = null;
  if (!pick || !stage.hasAttribute('data-picking-parts') || !scene || scene.partTarget !== pick.target || K.pngExporting) return;
  event.preventDefault();
  event.stopPropagation();
  pickPart(pick.x, pick.y);
});
canvas.addEventListener('pointercancel', event => cancelInput(event.pointerId));
canvas.addEventListener('lostpointercapture', event => cancelInput(event.pointerId));

if (probe) {
  window.fatedGuestProbe = () => canvas.dataset.ready ? {
    ...scene.gestures.snapshot(toClient), sound: scene.sound?.snapshot(),
    zoom: scene.skeleton.scaleX / scene.fitScale,
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
    K.fetchJSON('./catalog.json?v=20261122-reviewed-frames'), K.fetchJSON('./rules.json'),
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

start().catch(error => { $('gridSub').textContent = error.message; });
