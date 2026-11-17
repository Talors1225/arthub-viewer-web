'use strict';

const library = document.getElementById('wallpaperLibrary');
const player = document.getElementById('wallpaperPlayer');
const search = document.getElementById('wallpaperSearch');
const cards = document.getElementById('wallpaperCards');
const count = document.getElementById('wallpaperCount');
const canvas = document.getElementById('wallpaperCanvas');
const status = document.getElementById('wallpaperStatus');
const touch = document.getElementById('wallpaperTouch');
const pause = document.getElementById('wallpaperPause');
const route = new URL(location.href);
const requested = route.searchParams.get('id');
const release = '20261117';

let current;
let mode = 'idle';
let actionTime = 0;
let idleTime = 0;
let ambientTime = 0;
let paused = false;
let previousFrame;

function pageURL(id, query) {
  const next = new URL('./', location.href);
  if (id) next.searchParams.set('id', id);
  if (query) next.searchParams.set('q', query);
  return next.href;
}

async function read(url, format) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + url);
  return response[format]();
}

function searchItems(items, query) {
  const needle = query.trim().normalize('NFKC').toLowerCase();
  return items.filter(item => (item.name + ' ' + item.id).normalize('NFKC').toLowerCase().includes(needle));
}

async function showLibrary(items, missing = false) {
  library.hidden = false;
  count.textContent = '正在载入壁纸…';
  const thumbnails = (await read('../../thumbs/index.json?v=' + release + '-wallpapers', 'json')).items;
  search.value = route.searchParams.get('q') || '';
  const render = () => {
    const matches = searchItems(items, search.value);
    const query = search.value.trim();
    history.replaceState(null, '', pageURL(null, query));
    count.textContent = (missing ? '找不到指定的壁纸。' : '') + (matches.length ? matches.length + ' 套壁纸' : '未找到匹配的壁纸');
    cards.replaceChildren();
    for (const item of matches) {
      const card = document.createElement('a');
      card.href = pageURL(item.id, query);
      card.className = 'wallpaper-card';
      const cover = thumbnails[item.thumbKey];
      if (cover) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = '';
        img.width = 360;
        img.height = 288;
        img.src = '../../thumbs/' + cover;
        card.append(img);
      }
      const name = document.createElement('strong');
      name.textContent = item.name;
      card.append(name);
      cards.append(card);
    }
  };
  search.addEventListener('input', render);
  render();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图集载入失败 ' + src));
    image.src = src;
  });
}

function loadSpine() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '../viewer/vendor/spine-webgl.js';
    script.onload = () => resolve(window.spine);
    script.onerror = () => reject(new Error('Spine 播放器载入失败'));
    document.head.append(script);
  });
}

function actionLength(timeline) {
  return Math.max(timeline.duration || 0, ...timeline.tracks.map(track => track.start + track.duration));
}

function loopTime(timeline, time) {
  const jump = timeline.jumps.find(({from, to}) => Number.isFinite(from) && Number.isFinite(to) && from > to);
  if (jump && time >= jump.from) return jump.to + (time - jump.to) % (jump.from - jump.to);
  const duration = actionLength(timeline);
  return duration > 0 ? time % duration : time;
}

function trackAt(timeline, layer, time) {
  return timeline.tracks.find(track => track.target === layer.id && time >= track.start && time < track.start + track.duration);
}

function drawLayer(layer) {
  const {SP, renderer, item, camera} = current;
  const {skeleton, data, position, angle, scale, stretch, pma} = layer;
  const depth = position[2] - camera.position[2];
  const height = camera.orthographic ? camera.size : Math.tan(camera.fov * Math.PI / 360) * depth;
  if (height <= 0) return;
  const loop = loopTime(item.timelines.idle, mode === 'idle' ? idleTime : ambientTime);
  const touchTrack = mode === 'touch' ? trackAt(item.timelines.touch, layer, actionTime) : null;
  const track = touchTrack || trackAt(item.timelines.idle, layer, loop);
  const time = track ? ((touchTrack ? actionTime : loop) - track.start) * track.speed + track.clipIn : ambientTime;
  const animation = data.findAnimation(track?.animation || layer.animation);

  skeleton.setToSetupPose();
  if (animation) {
    animation.apply(skeleton, 0, time, track?.loop ?? true, null, 1, SP.MixBlend.replace, SP.MixDirection.mixIn);
  }
  skeleton.updateWorldTransform();

  // Evaluate bone constraints in their authored units before the scene and camera transforms.
  const offsetX = (position[0] - camera.position[0]) / height;
  const offsetY = (position[1] - camera.position[1]) / height;
  const scaleX = stretch[0] * scale / height;
  const scaleY = stretch[1] * scale / height;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  renderer.drawSkeleton(skeleton, pma, -1, -1, (vertices, length, stride) => {
    for (let i = 0; i < length; i += stride) {
      const x = vertices[i] * scaleX;
      const y = vertices[i + 1] * scaleY;
      vertices[i] = offsetX + x * cos - y * sin;
      vertices[i + 1] = offsetY + x * sin + y * cos;
    }
  });
}

function renderFrame(now) {
  const {gl, renderer, item} = current;
  const dt = previousFrame == null ? 0 : Math.min(.1, (now - previousFrame) / 1000);
  previousFrame = now;
  if (!paused) {
    ambientTime += dt;
    if (mode === 'idle') idleTime += dt;
    if (mode === 'touch') actionTime += dt;
  }
  if (mode === 'touch' && actionTime >= actionLength(item.timelines.touch)) setMode('idle');

  const dpi = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(canvas.clientWidth * dpi));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpi));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, width, height);
  gl.clearColor(.075, .085, .115, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  renderer.camera.viewportWidth = 2 * width / height;
  renderer.camera.viewportHeight = 2;
  renderer.begin();
  for (const layer of current.layers) drawLayer(layer);
  renderer.end();
  requestAnimationFrame(renderFrame);
}

function setMode(next) {
  mode = next;
  actionTime = 0;
  if (next === 'idle') idleTime = 0;
  status.textContent = next === 'touch' ? '触碰动作' : '待机';
}

function setPaused(value) {
  paused = value;
  pause.textContent = value ? '继续' : '暂停';
  pause.setAttribute('aria-pressed', String(value));
}

async function openPlayer(catalog, item) {
  player.hidden = false;
  document.title = item.name + ' · 珍藏品壁纸 | ArtHub';
  document.getElementById('wallpaperTitle').textContent = item.name;
  const query = route.searchParams.get('q') || '';
  document.getElementById('wallpaperBack').href = pageURL(null, query);
  const matches = searchItems(catalog.items, query);
  const sequence = matches.includes(item) ? matches : catalog.items;
  const index = sequence.indexOf(item);
  if (sequence.length > 1) {
    for (const [id, offset] of [['wallpaperPrevious', -1], ['wallpaperNext', 1]]) {
      const link = document.getElementById(id);
      link.href = pageURL(sequence[(index + offset + sequence.length) % sequence.length].id, query);
      link.hidden = false;
    }
  }

  const SP = await loadSpine();
  const gl = canvas.getContext('webgl', {alpha: false, antialias: true});
  if (!gl) throw new Error('当前浏览器无法使用 WebGL');
  SP.GLTexture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL = true;
  const renderer = new SP.SceneRenderer(canvas, gl);
  const root = new URL(catalog.assetPrefix + '/' + item.id + '/', window.ARTHUB_COS_CONFIG.root.replace(/\/?$/, '/'));
  const resourceURL = path => new URL(path.split('/').map(encodeURIComponent).join('/'), root);
  const assets = new Map();
  const loadAssets = async layer => {
    const [atlasText, buffer] = await Promise.all([
      read(resourceURL(layer.atlas), 'text'),
      read(resourceURL(layer.skel), 'arrayBuffer'),
    ]);
    const atlas = new SP.TextureAtlas(atlasText);
    const images = await Promise.all(atlas.pages.map(page => loadImage(resourceURL('textures/' + page.name))));
    atlas.pages.forEach((page, i) => {
      const image = images[i];
      if (image.naturalWidth !== page.width || image.naturalHeight !== page.height) {
        throw new Error('图集尺寸不匹配 ' + page.name);
      }
      page.setTexture(new SP.GLTexture(gl, image));
    });
    const spineBinary = new SP.SkeletonBinary(new SP.AtlasAttachmentLoader(atlas));
    const data = spineBinary.readSkeletonData(new Uint8Array(buffer));
    return {data, pma: atlas.pages.some(page => page.pma)};
  };
  const layers = await Promise.all(item.layers.map(async layer => {
    const key = layer.skel + '|' + layer.atlas;
    if (!assets.has(key)) assets.set(key, loadAssets(layer));
    const {data, pma} = await assets.get(key);
    const skeleton = new SP.Skeleton(data);
    if (layer.skin) skeleton.setSkinByName(layer.skin);
    return {...layer, skeleton, data, pma};
  }));

  current = {SP, gl, renderer, item, layers, camera: item.camera};
  setMode('idle');
  setPaused(false);
  touch.disabled = false;
  pause.disabled = false;
  canvas.dataset.ready = 'true';
  const startTouch = () => {
    if (mode === 'touch') return;
    setMode('touch');
    setPaused(false);
  };
  touch.addEventListener('click', startTouch);
  canvas.addEventListener('click', startTouch);
  pause.addEventListener('click', () => setPaused(!paused));
  requestAnimationFrame(renderFrame);
}

read('catalog.json?v=' + release, 'json').then(catalog => {
  const item = catalog.items.find(entry => entry.id === requested);
  return item ? openPlayer(catalog, item) : showLibrary(catalog.items, !!requested);
}).catch(error => {
  if (player.hidden) {
    library.hidden = false;
    count.textContent = '壁纸清单暂时无法载入，请刷新重试。';
  } else {
    status.textContent = '壁纸暂时无法播放，请刷新重试。';
  }
  console.error(error);
});
