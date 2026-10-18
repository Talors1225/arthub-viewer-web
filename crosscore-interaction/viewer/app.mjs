import { InteractionController, trackFor } from './controller.mjs?v=20261015-2';
import { SpineScene } from './scene.mjs?v=20261015-2';

const $ = selector => document.querySelector(selector), SP = window.spine, K = window.SpineKit;
const canvas = $('#scene'), overlay = $('#overlay'), stage = $('#stage'), paint = overlay.getContext('2d');
const loadingPreview = K.createLoadingPreview(stage);
let previewSequence = 0, previewScene = null, previewPending = false;
window.__crosscorePreviewFailure = reason => loadingPreview.fail(previewSequence, reason);
const initialPreviewId = new URL(location.href).searchParams.get('model');
if (/^\d+$/.test(initialPreviewId || '')) loadingPreview.begin(0, { path: K.siteRoot() + 'thumbs/crosscore/interaction-' + initialPreviewId + '.webp', label: '当前立绘', trimImage: true });
const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
if (!gl) throw new Error('WebGL 不可用，请在本机浏览器开启硬件加速后重试。');
const context = new SP.ManagedWebGLRenderingContext(gl), renderer = new SP.SceneRenderer(canvas, context);
const sourceRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const response = await fetch(`${sourceRoot}/catalog/catalog.json`);
if (!response.ok) throw new Error(`立绘目录读取失败（${response.status}）`);
const catalog = await response.json();
const models = catalog.models.filter(model => model.available), modelById = new Map(models.map(model => [Number(model.id), model]));
let model, scene, controller, transition, transitionUntil = 0, requestId = 0, last = performance.now() / 1000;
let audio = new Audio(), audioResult = null, cueName = null, pointer = null, lastFailure = null, lastActionState = '';
let callbacks = [], specialMode = false, searchTimer, pendingFit = null, modelGroupFilter = 'all';
let viewZoom = 1;
const viewPan = { x: 0, y: 0 };
const playback = { playing: true, speed: 1, loop: true, time: 0 };
let animationPreview = null, activeTrack = 0;
let gridPage = 1, gridPageSize = K.libraryPageSize();
const libraryPrefs = K.Store('crosscore-interaction');
K.initTheme(libraryPrefs); K.bindThemePalette($('#btnTheme'), libraryPrefs);
$('#thumbGrid').dataset.density = libraryPrefs.get('density', 'standard');
$('#thumbGrid').dataset.kitDensityReady = '1';
let sortMode = libraryPrefs.get('sortMode', 'name'), sortDirection = libraryPrefs.get('sortDirection', 'asc');
const thumbnailManifest = await fetch('../../thumbs/index.json').then(r => r.ok ? r.json() : null).catch(() => null);
const libraryThumbs = thumbnailManifest?.items || {};
const thumbnailFor = row => libraryThumbs['crosscore-interaction:' + row.id];

let editor = null, exporting = false, volume = Number(localStorage.getItem('arthub:crosscore:volume') ?? .65);
audio.volume = volume;
const PREVIEW_TRACK = 50;
const now = () => playback.time;
const gestureNames = ['点击', '向左拖动', '向右拖动', '向上拖动', '向下拖动', '拖动', '按住拖动'];
const favoriteEntry = row => ({ k: `crosscore-interaction:${row.id}`, src: 'crosscore-interaction', t: row.name, s: row.title || row.group, u: `${location.pathname}?model=${encodeURIComponent(row.id)}` });
$('#coverage').textContent = `${catalog.summary.availableCount} 套可互动 · ${catalog.summary.actionCount.toLocaleString('zh-CN')} 条配置`;

function fillModels() {
  const select = $('#model'), selected = select.value || String(model?.id || ''), query = $('#gridSearch').value.trim().toLocaleLowerCase();
  let matches = models.filter(m => (modelGroupFilter === 'favorite' ? K.favs.has(favoriteEntry(m).k) : modelGroupFilter === 'all' || m.group === modelGroupFilter) && `${m.name} ${m.title} ${m.id} ${m.group}`.toLocaleLowerCase().includes(query));
  const direction = sortDirection === 'desc' ? -1 : 1;
  const byName = (a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
  if (sortMode === 'name') matches = matches.slice().sort((a, b) => direction * byName(a, b));
  else if (sortMode === 'group') matches = matches.slice().sort((a, b) => direction * (a.group.localeCompare(b.group, 'zh-CN') || byName(a, b)));
  else if (sortDirection === 'desc') matches = matches.slice().reverse();
  select.replaceChildren();
  for (const groupName of ['角色皮肤', '多人场景', '剧情互动']) {
    const rows = matches.filter(m => m.group === groupName);
    if (!rows.length) continue;
    const group = document.createElement('optgroup'); group.label = `${groupName}（${rows.filter(m => m.available).length}）`;
    for (const row of rows) { const option = new Option(`${row.name}${row.available ? '' : '（资源未配置）'}`, row.id); option.disabled = !row.available; group.append(option); }
    select.append(group);
  }
  if (matches.some(m => String(m.id) === selected)) select.value = selected;
  else select.value = String(matches.find(m => m.available)?.id || '');
  $('#modelMeta').textContent = `${matches.filter(m => m.available).length} 套匹配 · 共 ${catalog.summary.availableCount} 套可互动`;
  gridPageSize = K.libraryPageSize();
  const pageCount = Math.max(1, Math.ceil(matches.length / gridPageSize));
  gridPage = Math.min(Math.max(1, gridPage), pageCount);
  $('#gridSub').textContent = matches.length + ' 个资源 · 第 ' + gridPage + ' / ' + pageCount + ' 页';
  renderModelCards(matches.slice((gridPage - 1) * gridPageSize, gridPage * gridPageSize));
  renderPagination(pageCount); updateLibraryCounts();
  $('#btnPrev').disabled = $('#btnNext').disabled = !matches.some(m => m.available);
  const starred = !!model && K.favs.has(favoriteEntry(model).k);
  $('#railStar').disabled = !model;
  $('#railStar').setAttribute('aria-pressed', String(starred));
  $('#railStar').innerHTML = K.uiIcon('star', 18, starred);
}
function renderModelCards(rows) {
  const current = String(model?.id || '');
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const card = document.createElement('div');
    card.setAttribute('role', 'button'); card.tabIndex = 0; card.dataset.id = String(row.id);
    card.className = `thumb-card${String(row.id) === current ? ' active' : ''}`;

    card.setAttribute('aria-label', `${row.name}${row.available ? '' : '，本地资源未配置'}`);
    card.title = row.name;
    const picture = document.createElement('span');
    picture.className = 'ph';
    const mark = document.createElement('span');
    mark.className = 'crosscore-mark';
    mark.textContent = '✦';
    const type = document.createElement('span');
    type.className = 'tt';
    type.textContent = row.group || '互动立绘';
    const thumb = thumbnailFor(row); K.setPreview(picture, thumb ? '../../thumbs/' + thumb : null);
    const text = document.createElement('span');
    text.className = 'tm';
    const name = document.createElement('span');
    name.className = 'tn';
    name.textContent = row.name;
    const meta = document.createElement('span');
    meta.className = 'ts';
    meta.textContent = row.title && row.title !== row.name ? row.title : '';
    text.append(name, meta);
    const star = document.createElement('button'); star.type = 'button'; star.className = 'tstar';
    const favorite = K.favs.has(favoriteEntry(row).k); star.classList.toggle('on', favorite);
    star.title = favorite ? '取消收藏' : '收藏'; star.setAttribute('aria-label', star.title); star.setAttribute('aria-pressed', String(favorite)); star.innerHTML = K.uiIcon('star', 18, favorite);
    star.addEventListener('click', event => { event.stopPropagation(); K.favs.toggle(favoriteEntry(row)); fillModels(); });
    card.append(type, picture, text, star);
    card.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('.tstar')) { event.preventDefault(); card.click(); } });
    card.addEventListener('click', () => {
      setPanelOpen('library', false);
      loadModel(row.id).catch(fail);
    });
    fragment.append(card);
  }
  $('#thumbGrid').replaceChildren(fragment);
}

function updateLibraryCounts() {
 for (const button of document.querySelectorAll('[data-group]')) {
  const group = button.dataset.group;
  const count = models.filter(row => group === 'all' || group === 'favorite' ? group === 'all' || K.favs.has(favoriteEntry(row).k) : row.group === group).length;
  button.hidden = group !== 'favorite' && group !== 'all' && count === 0;
  if (group === 'favorite') { button.classList.add('library-favorites'); button.innerHTML = K.uiIcon('star', 18); button.setAttribute('aria-label', '收藏资源，' + count + ' 项'); }
  else { button.replaceChildren(document.createTextNode(group === 'all' ? '全部 ' : group + ' ')); const n = document.createElement('span'); n.className = 'n'; n.textContent = count; button.append(n); }
 }
 const button = $('#crosscoreSortDir'), desc = sortDirection === 'desc';
 K.setUiIcon(button, desc ? 'down' : 'up', desc ? '降序' : '升序');

 button.setAttribute('aria-label', '当前' + (desc ? '降序' : '升序') + '；点击切换');
}
function renderPagination(totalPages){
 for(const nav of K.paginationHosts($('#gridView'))){nav.replaceChildren();nav.hidden=totalPages<=1;if(totalPages<=1)continue;
  const add=(label,page,{current=false,disabled=false,gap=false}={})=>{const button=document.createElement(gap?'span':'button');button.className=gap?'grid-page-gap':'grid-page-btn'+(current?' on':'');button.textContent=label;if(!gap){button.type='button';button.disabled=disabled;if(current)button.setAttribute('aria-current','page');button.setAttribute('aria-label',label==='‹'?'上一页':label==='›'?'下一页':'第 '+label+' 页');if(!disabled)button.onclick=()=>{gridPage=page;fillModels();$('#gridView').scrollTo({top:0,behavior:'smooth'});};}nav.append(button);};
  add('‹',gridPage-1,{disabled:gridPage<=1});const radius=matchMedia('(max-width: 720px)').matches?1:2,pages=[...new Set([1,...Array.from({length:Math.max(0,Math.min(totalPages-1,gridPage+radius)-Math.max(2,gridPage-radius)+1)},(_,i)=>Math.max(2,gridPage-radius)+i),totalPages])].sort((a,b)=>a-b);let previous=0;for(const page of pages){if(previous&&page-previous>1)add('…',undefined,{gap:true});add(String(page),page,{current:page===gridPage});previous=page;}add('›',gridPage+1,{disabled:gridPage>=totalPages});
 }
}
$('#crosscoreSort').value = sortMode;
$('#crosscoreSort').addEventListener('change', event => { sortMode = event.target.value; libraryPrefs.set('sortMode', sortMode); gridPage = 1; fillModels(); });
$('#crosscoreSortDir').addEventListener('click', () => { sortDirection = sortDirection === 'desc' ? 'asc' : 'desc'; libraryPrefs.set('sortDirection', sortDirection); gridPage = 1; fillModels(); });
matchMedia('(max-width: 720px)').addEventListener('change', () => { const first = (gridPage - 1) * gridPageSize; gridPageSize = K.libraryPageSize(); gridPage = Math.floor(first / gridPageSize) + 1; fillModels(); });

function step(direction) {
  const options = [...$('#model').options].filter(option => !option.disabled);
  if (!options.length) return;
  const index = options.findIndex(option => option.value === $('#model').value);
  const next = index < 0 ? (direction > 0 ? 0 : options.length - 1) : (index + direction + options.length) % options.length;
  $('#model').value = options[next].value;
  loadModel($('#model').value).catch(fail);
}
function updateZoomControls() {
 for (const id of ['zOut', 'zPct', 'zIn']) $( '#' + id ).disabled = !scene;
 $('#zPct').textContent = Math.round(viewZoom * 100) + '%';
}
function fit() {
 if (!scene) return;
 const bounds = scene.bounds, area = K.stageViewArea(canvas), rect = canvas.getBoundingClientRect();
 const units = Math.max(bounds.width / area.width, bounds.height / area.height) * 1.08 / viewZoom;
 renderer.camera.viewportWidth = units * rect.width; renderer.camera.viewportHeight = units * rect.height;
 const offsetX = area.left + area.width / 2 - rect.left - rect.width / 2 + viewPan.x;
 const offsetY = rect.top + rect.height / 2 - area.top - area.height / 2 - viewPan.y;
 renderer.camera.position.set(bounds.x + bounds.width / 2 - offsetX * units, bounds.y + bounds.height / 2 - offsetY * units, 0);
 renderer.camera.update(); updateZoomControls();
}
function setZoom(value) {
 if (!scene || !Number.isFinite(value)) return;
 viewZoom = Math.max(.1, Math.min(8, value)); pendingFit = null; fit();
}
$('#zOut').addEventListener('click', () => setZoom(viewZoom / 1.25));
$('#zIn').addEventListener('click', () => setZoom(viewZoom * 1.25));
$('#zPct').addEventListener('click', () => $('#fit').click());
stage.addEventListener('wheel', event => { if (!scene || ![canvas, overlay].includes(event.target)) return; event.preventDefault(); setZoom(viewZoom * Math.exp(-event.deltaY * .0015)); }, { passive: false });
function fitVisiblePixels() {
  if (!scene) return false;
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  const rows = new Uint32Array(canvas.height), columns = new Uint32Array(canvas.width);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let left = canvas.width, right = -1, bottom = canvas.height, top = -1, count = 0;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
    rows[y]++; columns[x]++; count++;
    left = Math.min(left, x); right = Math.max(right, x); bottom = Math.min(bottom, y); top = Math.max(top, y);
  }
  if (right - left < 2 || top - bottom < 2) return false;
  const focus = (histogram, low, high) => {
    let sum = 0, start = low, end = high;
    for (let i = low; i <= high; i++) { sum += histogram[i]; if (sum > count * 0.01) { start = i; break; } }
    sum = 0;
    for (let i = high; i >= low; i--) { sum += histogram[i]; if (sum > count * 0.01) { end = i; break; } }
    // A few distant effect particles must not shrink the entire character.
    return end - start < (high - low) * 0.8 ? [start, end] : [low, high];
  };
  [left, right] = focus(columns, left, right); [bottom, top] = focus(rows, bottom, top);
  const camera = renderer.camera;
  scene.bounds = { x: camera.position.x + (left / canvas.width - 0.5) * camera.viewportWidth,
    y: camera.position.y + (bottom / canvas.height - 0.5) * camera.viewportHeight,
    width: (right - left + 1) / canvas.width * camera.viewportWidth,
    height: (top - bottom + 1) / canvas.height * camera.viewportHeight };
  fit(); return true;
}
function screenPoint(x, y) {
  const camera = renderer.camera;
  return { x: (x - camera.position.x) / camera.viewportWidth * stage.clientWidth + stage.clientWidth / 2, y: stage.clientHeight / 2 - (y - camera.position.y) / camera.viewportHeight * stage.clientHeight };
}
function worldPoint(x, y) {
  const rect = stage.getBoundingClientRect(), camera = renderer.camera;
  return { x: camera.position.x + (x - rect.left - stage.clientWidth / 2) / stage.clientWidth * camera.viewportWidth, y: camera.position.y - (y - rect.top - stage.clientHeight / 2) / stage.clientHeight * camera.viewportHeight };
}
function soundEnabled() { return $('#sound').getAttribute('aria-pressed') === 'true'; }
function setVoiceStatus(message) { const status = $('#voice-status'); if (status) status.textContent = message; }
function stopAudio() {
  audio.pause(); audio.currentTime = 0; audioResult = null; cueName = null; $('#subtitle').textContent = '';
  setVoiceStatus(soundEnabled() ? '已停止播放' : '声音已关闭');
}
function playAudio(ids, hideTxt) {
  if (!ids?.length || !soundEnabled()) return;
  stopAudio();
  const id = ids[0], cue = catalog.cues[String(id)];
  if (!cue?.path) {
    audioResult = { id, status: 'missing', cue: cue?.cueName };
    const reason = cue?.unavailableReason || '此动作对应的语音文件当前不可用。';
    $('#subtitle').textContent = reason; $('#dialogue').textContent = cue?.script1 || cue?.script2 || '';
    setVoiceStatus(reason); return;
  }
  cueName = cue.cueName;
  const current = new Audio(cue.path); audio = current; audio.volume = volume;
  const result = { id, cue: cueName, status: 'loading' }; audioResult = result;
  if (!hideTxt) { $('#subtitle').textContent = cue.script1 || cue.script2 || ''; $('#dialogue').textContent = cue.script1 || cue.script2 || ''; }
  if ([...$('#voice').options].some(option => option.value === String(id))) $('#voice').value = String(id);
  setVoiceStatus((cue.cueName || '语音') + ' 正在加载…');
  current.addEventListener('ended', () => {
    if (audio !== current) return;
    result.status = 'ended'; setVoiceStatus((cue.cueName || '语音') + ' 播放完毕');
  });
  current.play().then(() => { result.status = 'playing'; setVoiceStatus((cue.cueName || '语音') + ' 播放中'); }).catch(error => {
    result.status = 'failed'; result.error = error.message;
    if (audio === current) { $('#subtitle').textContent = '语音未能播放：' + error.message; setVoiceStatus('语音未能播放：' + error.message); }
  });
}
function fillVoiceOptions() {
  const select = $('#voice'), previous = select.value, seen = new Set();
  select.replaceChildren();
  for (const action of model?.actions || []) {
    const ids = Array.isArray(action.audioId) ? action.audioId : action.audioId == null ? [] : [action.audioId];
    for (const id of ids) {
      const key = String(id), cue = catalog.cues[key];
      if (seen.has(key) || !cue) continue;
      seen.add(key);
      const actionName = action.sName || (gestureNames[action.gesture || 0] + ' ' + action.index);
      const title = cue.cueName || ('语音 ' + key);
      select.add(new Option(actionName + ' · ' + title + (cue.path ? '' : '（本地缺失）'), key));
    }
  }
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
  const selectedCue = catalog.cues[String(select.value)];
  $('#dialogue').textContent = selectedCue?.script1 || selectedCue?.script2 || '';
  setVoiceStatus(select.options.length ? '选择台词或点击立绘播放对应语音' : '当前立绘没有配置语音');
}
function updateVoicePreview() {
  const cue = catalog.cues[String($('#voice').value)];
  $('#dialogue').textContent = cue?.script1 || cue?.script2 || '';
  setVoiceStatus(!soundEnabled() ? '声音已关闭' : cue?.path ? '准备就绪，点击播放台词' : cue ? '语音文件当前不可用' : '当前立绘没有配置语音');
}
function setSoundEnabled(enabled) {
  const button = $('#sound');
  button.setAttribute('aria-pressed', String(!!enabled));
  button.textContent = enabled ? '声音：开' : '声音：关';
  if (!enabled) { stopAudio(); $('#asmrPlayer').pause(); setVoiceStatus('声音已关闭'); }
  else setVoiceStatus($('#voice').options.length ? '选择台词或点击立绘播放对应语音' : '当前立绘没有配置语音');
}
function updateActions() {
  if (!model || !controller || !scene) return;
  const key = `${model.id}:${controller.role}:${[...controller.active].filter(([,v]) => v).map(([i]) => i).join(',')}:${specialMode}`;
  if (key === lastActionState) return;
  lastActionState = key; $('#actions').replaceChildren(); $('#specialActions').replaceChildren();
  for (const action of model.actions.filter(a => a.sName !== 'in' && (a.role || 1) === controller.role)) {
    const name = action.content?.asmr ? '关联音声' : action.content?.changerole && !action.sName ? '切换人物状态' : `${gestureNames[action.gesture || 0]} ${action.index}`;
    const button = document.createElement('button'); button.textContent = name; button.title = action.sName || name;
    button.classList.toggle('active', !!controller.active.get(action.index));
    button.disabled = !!action.sName && !scene.hasAnimation(action.sName) && !action.content?.randomActions && !action.content?.orderActions;
    button.addEventListener('click', () => { endAnimationPreview(); playback.playing = true; scene.clear([1]); controller.trigger(action.index, now(), true); }); $('#actions').append(button);
    if (specialMode && action.sName && !action.content?.isSpineUI) { const clone = button.cloneNode(true); clone.addEventListener('click', () => { endAnimationPreview(); playback.playing = true; scene.clear([1]); controller.trigger(action.index, now(), true); }); $('#specialActions').append(clone); }
  }
  $('#special').classList.toggle('visible', specialMode);
}
function handleSceneEvent(event) {
  if (event.track === PREVIEW_TRACK) return;
  if (event.kind === 'complete') callbacks.push(() => controller?.complete(event.index, now()));
  if (event.kind === 'segment-reached') callbacks.push(() => controller?.segmentReached(event.track, now()));
  if (event.kind === 'missing-animation') $('#feedback').textContent = `当前资源没有配置中的动画 ${event.name}，可切换状态或查看其他动作。`;
  if (event.kind === 'spine-event') {
    const trigger = event.name.match(/^trigger[iIl]ndex_(\d+)/i);
    if (trigger) callbacks.push(() => controller?.trigger(Number(trigger[1]), now(), true));
    if (/^spineui/i.test(event.name)) { specialMode = !specialMode; lastActionState = ''; }
    if (event.name.startsWith('SpineAudio_')) { const id = catalog.eventCues?.[event.name.slice('SpineAudio_'.length)]; if (id) playAudio([id]); }
  }
}
async function loadPrefab(key, ownerRequest) {
  const definition = catalog.prefabs[key];
  if (!definition?.ready) throw new Error(`对应姿态的资源不在本地：${definition?.name || key}`);
  const loaded = await SpineScene.load(definition, context, handleSceneEvent);
  if (ownerRequest !== requestId) { loaded.dispose(); return null; }
  viewerUI.tools.prepareLoad(); scene?.dispose(); scene = loaded; animationPreview = null; activeTrack = 0;
  editor = window.createInteractionSpineEditor({ layers: scene.layers, ns: SP, project: screenPoint, unproject: (x, y) => { const rect = stage.getBoundingClientRect(); return worldPoint(x + rect.left, y + rect.top); } });
  viewerUI.refreshAnimations(); fit(); pendingFit = { scene: loaded, at: now() + 0.1, expires: now() + 2 }; return loaded;
}
async function loadModel(identity) {
  stagePan.cancel(); viewPan.x = viewPan.y = 0;
  const selected = modelById.get(Number(identity));
  if (!selected?.available) throw new Error(selected?.unavailableReason || '该立绘暂无完整本地资源');
  viewerUI.tools.prepareLoad(); editor = null;
  const request = ++requestId;
  previewSequence = request; previewPending = true; previewScene = null; viewZoom = 1;
  const previewThumb = thumbnailFor(selected);
  loadingPreview.begin(request, { path: previewThumb ? K.siteRoot() + 'thumbs/' + previewThumb : null, label: selected.name, trimImage: true });
  pointer = null; controller = null; callbacks = []; playback.playing = true; pendingFit = null; stopAudio(); transition?.dispose(); transition = null; specialMode = false; lastActionState = '';
  model = selected; fillVoiceOptions(); lastFailure = null; $('#loading').hidden = false; $('#loading').textContent = `正在加载 ${model.name}…`;
  $('#model').value = String(model.id); $('#active-name').textContent = model.name; $('#stage-info').textContent = `${model.name} · 正在加载`; fillModels(); $('#subtitle').textContent = ''; $('#feedback').textContent = '正在加载…';
  let loaded;
  try { loaded = await loadPrefab(model.prefab, request); }
  catch (error) { if (request !== requestId) return; throw error; }
  if (!loaded || request !== requestId) return;
  previewScene = loaded;
  controller = new InteractionController({ ...model, idle: loaded.idle }, handleInteraction, track => scene?.trackStatus(track));
  $('#loading').hidden = true; K.setLibraryStageReady(true);
  $('#stage-info').textContent = `${model.name} · ${model.actions.length} 条互动配置`;
  const thumb = thumbnailFor(model); K.setPreview($('#railThumb'), thumb ? '../../thumbs/' + thumb : null);
  document.title = model.name + ' · ArtHub';
  const gestures = [...new Set(model.actions.filter(a => a.gesture).map(a => gestureNames[a.gesture]))];
  $('#hint').textContent = `点击热点播放对应反应。${gestures.length ? `本套还支持：${gestures.join('、')}。` : '可打开热点显示，查看可点击位置。'}`;
  $('#feedback').textContent = `${model.name} 已就绪`; $('#detail').textContent = `${model.group} · ${model.id} · ${model.actions.length} 条交互配置`;
  $('#entrance').disabled = !scene.hasAnimation('in');
  const url = new URL(location.href); url.searchParams.set('model', String(model.id)); history.replaceState(null, '', url); updateActions();
}
async function switchRole(result) {
  const request = requestId, activeController = controller; $('#loading').hidden = false; $('#loading').textContent = '正在切换人物状态…';
  try { const loaded = await loadPrefab(result.prefab, request); if (!loaded || controller !== activeController) return; activeController.roleLoaded(now(), loaded.idle, result.next); $('#loading').hidden = true; lastActionState = ''; updateActions(); }
  catch (error) { if (request === requestId) { activeController.switching = false; fail(error); } }
}
async function playInterlude(result) {
  const request = requestId, definition = catalog.prefabs[result.prefab]; if (!definition?.ready) return;
  const loaded = await SpineScene.load(definition, context);
  if (request !== requestId) { loaded.dispose(); return; }
  transition?.dispose(); transition = loaded; transitionUntil = now() + result.duration;
}
function handleInteraction(result) {
  if (!scene || !controller) return;
  if (result.kind === 'ignored') {
    const messages = { cooldown: '请稍等片刻再点击', busy: '当前动作结束后可继续点击', condition: '需先完成其他互动或切换到对应状态', 'segment-moving': '这段动作进行中，停下后可继续点击', transition: '正在切换或拖动，完成后可继续互动', inactive: '此热点当前未激活' };
    $('#feedback').textContent = messages[result.reason] || '该互动暂不可用'; return;
  }
  if (result.kind === 'clear') scene.clear(result.tracks);
  if (result.kind === 'idle') scene.changeIdle(result.name);
  if (result.kind === 'role') { switchRole(result); return; }
  if (result.kind === 'interlude') { playInterlude(result).catch(fail); return; }
  if (result.kind === 'asmr') { openAsmr(result.id); return; }
  if (result.kind === 'plot') { $('#feedback').textContent = `剧情分支 ${result.nextId}`; return; }
  if (['action', 'segment', 'repeat'].includes(result.kind)) {
    const started = scene.play(result, now());
    if (started) { activeTrack = result.track; playAudio(result.audioIds, result.hideTxt); $('#feedback').textContent = result.kind === 'segment' ? `分段互动 · 第 ${result.phase} 步` : '已触发对应动作'; }
    else if (result.kind === 'repeat') $('#feedback').textContent = '已继续当前动作';
  }
  if (result.kind === 'restore-object') scene.restoreObject(result.content);
  if (result.kind === 'drag-start') { scene.beginObjectDrag(result, controller.action(result.index)); playAudio(result.audioIds, result.hideTxt); $('#feedback').textContent = '正在拖动'; }
  if (result.kind === 'drag-move') { if (result.content.drag) scene.moveObjectDrag(result); else scene.gesture(result, now()); }
  if (result.kind === 'drag-end') {
    if (result.content.drag) { const name = scene.endObjectDrag(); if (name) { scene.play({ ...result, kind: 'action', name, fadeIn: true, fadeOut: true }, now()); playAudio(controller.audioIds(controller.action(result.index))); } else if (result.content.drag.slots?.length) controller.restoreObjects.add(result.index); }
    else scene.recover(result, now()); $('#feedback').textContent = '拖动结束，可继续互动';
  }
  if (result.name) $('#detail').textContent = `模型：${model.id}\n人物状态：${controller.role}\n动画：${result.name}\n待机：${controller.idle}\n语音：${cueName || '无'}`;
  updateActions();
}
function openAsmr(identity) {
  if (!soundEnabled()) { $('#feedback').textContent = '声音已关闭'; return; }
  const data = catalog.asmrs?.[String(identity)]; if (!data) { $('#feedback').textContent = '该音声尚未在本地找到'; return; }
  stopAudio(); $('#asmrTitle').textContent = data.name; $('#asmrInfo').textContent = data.description || ''; $('#asmrTrack').replaceChildren();
  for (const track of data.tracks || []) if (catalog.cues[String(track.id)]?.path) $('#asmrTrack').append(new Option(track.name, track.id));
  if (!$('#asmrTrack').options.length) $('#asmrInfo').textContent = '本地暂无可播放的音声文件。'; $('#asmrDialog').showModal(); playAsmr();
}
function playAsmr() { const player = $('#asmrPlayer'); player.pause(); if (!soundEnabled()) { setVoiceStatus('声音已关闭'); return; } const cue = catalog.cues[$('#asmrTrack').value]; if (cue?.path) { player.src = cue.path; player.play().catch(() => {}); } }
function drawRegions() {
  paint.clearRect(0, 0, overlay.width, overlay.height); if (!scene || !controller || !$('#regions').checked) return;
  const dpr = overlay.width / stage.clientWidth; paint.save(); paint.scale(dpr, dpr);
  for (const action of model.actions) {
    const area = action.areas?.[0]; if (!area || !controller.active.get(action.index)) continue;
    const [x, y, width, height, angle] = area; if (width <= 0 || height <= 0) continue;
    const center = screenPoint(x, y), scale = stage.clientWidth / renderer.camera.viewportWidth;
    paint.save(); paint.translate(center.x, center.y); paint.rotate(-angle * Math.PI / 180); paint.strokeStyle = action.gesture ? '#dc9fef' : action.sType === 7 ? '#80cdf6' : '#edcd8b'; paint.fillStyle = '#c4d7eb09'; paint.lineWidth = 1.3;
    paint.fillRect(-width * scale / 2, -height * scale / 2, width * scale, height * scale); paint.strokeRect(-width * scale / 2, -height * scale / 2, width * scale, height * scale); paint.restore();
    paint.fillStyle = '#e1e8f2'; paint.font = '11px Microsoft YaHei'; paint.fillText(`${action.index} ${gestureNames[action.gesture || 0]}`, center.x + 4, center.y - 5);
  }
  paint.restore();
}
function timelineEntry() {
  if (!scene) return null;
  return scene.main.state.getCurrent(animationPreview ? PREVIEW_TRACK : activeTrack) || scene.main.state.getCurrent(0);
}
function timeline() {
  const entry = timelineEntry(), duration = entry?.animation?.duration || 0, elapsed = Math.max(0, entry?.trackTime || 0);
  return { name: entry?.animation?.name, duration, time: duration ? (entry.loop ? elapsed % duration : Math.min(duration, elapsed)) : 0, loop: !!entry?.loop };
}
function endAnimationPreview() {
  if (!animationPreview || !scene) return;
  for (const layer of scene.layers) layer.state.clearTrack(PREVIEW_TRACK);
  animationPreview = null; activeTrack = 0; scene.update(0, now());
}
function startAnimationPreview(name, time = 0, loop = playback.loop) {
  if (!scene?.hasAnimation(name)) return;
  stopAudio(); playback.loop = loop; animationPreview = { name }; activeTrack = PREVIEW_TRACK;
  for (const layer of scene.layers) {
    layer.state.clearTrack(PREVIEW_TRACK);
    const animation = layer.skeleton.data.findAnimation(name); if (!animation) continue;
    const entry = layer.state.setAnimation(PREVIEW_TRACK, name, loop); entry.mixDuration = 0;
    entry.trackTime = entry.trackLast = entry.nextTrackLast = Math.min(time, Math.max(0, animation.duration - .0001));
    entry.animationLast = entry.nextAnimationLast = entry.trackTime;
  }
  scene.update(0, now());
}
const viewerUI = window.createInteractionViewerUI({
  animations: () => scene?.main.skeleton.data.animations.map(animation => ({ name: animation.name, duration: animation.duration })) || [],
  playback: () => ({ ...timeline(), ready: !!scene && !!controller && $('#loading').hidden, playing: playback.playing, speed: playback.speed, key: model?.id + ':' + scene?.definition.name }),
  setPlaying: playing => { playback.playing = playing; if (!playing) audio.pause(); else if (audioResult?.status === 'playing') audio.play().catch(() => {}); },
  setSpeed: speed => { playback.speed = speed; },
  setLoop: loop => { const current = timeline(); if (!animationPreview) startAnimationPreview(current.name, current.time, loop); else { playback.loop = loop; for (const layer of scene.layers) { const entry = layer.state.getCurrent(PREVIEW_TRACK); if (entry) entry.loop = loop; } } },
  selectAnimation: name => { playback.playing = true; startAnimationPreview(name); },
  seek: time => { const current = timeline(); startAnimationPreview(current.name, time, current.loop); },
  canvas: () => canvas, onError: fail,
  tools: {
    identity: () => model?.id + ':' + scene?.definition.name + ':' + requestId, editor: () => editor, name: () => model?.name || 'crosscore',
    reload: () => model && loadModel(model.id), openPanel: open => setPanelOpen('interaction', open), stopAudio,
    setExporting: value => { exporting = value; }, setBackground: () => {},
    soundEnabled, setSoundEnabled, voiceTab: 'voice',
    volume: () => volume, setVolume: value => { volume = value; audio.volume = value; $('#asmrPlayer').volume = value; localStorage.setItem('arthub:crosscore:volume', value); },
    capture: animation => {
      const captureScene = Object.create(scene);
      return window.createInteractionSpineCapture({ layers: scene.layers, ns: SP, canvas, renderer, gl, editor, animation,
        visible: layer => scene.visible(layer),
        extraBounds: () => {
          const result = [], drag = scene.objectDrag;
          if (drag?.overlay) result.push(K.measureBounds(drag.overlay, SP));
          for (const { def } of drag?.sprites || []) {
            const angle = (def.rotation || 0) * Math.PI / 180, w = (Math.abs(def.width * Math.cos(angle)) + Math.abs(def.height * Math.sin(angle))) / 2, h = (Math.abs(def.width * Math.sin(angle)) + Math.abs(def.height * Math.cos(angle))) / 2;
            result.push({ minX: def.centerX + drag.dx - w, maxX: def.centerX + drag.dx + w, minY: def.centerY + drag.dy - h, maxY: def.centerY + drag.dy + h });
          }
          return result;
        },
        drawScene: (layers, size) => {
          captureScene.layers = layers; captureScene.main = layers[scene.layers.indexOf(scene.main)];
          const viewport = (x, y) => ({ x: (x - renderer.camera.position.x) / (renderer.camera.viewportWidth * renderer.camera.zoom) * size.width + size.width / 2, y: (y - renderer.camera.position.y) / (renderer.camera.viewportHeight * renderer.camera.zoom) * size.height + size.height / 2 });
          captureScene.draw(renderer, viewport);
        }, restore: () => {} });
    },
  }
});
function render() {
  const wall = performance.now() / 1000, delta = Math.min(0.05, wall - last); last = wall;
  if (exporting) { requestAnimationFrame(render); return; }
  const step = playback.playing ? delta * playback.speed : 0; if (!animationPreview) playback.time += step; const current = now();
  const dpr = Math.min(window.devicePixelRatio || 1, 2), width = Math.max(1, Math.round(stage.clientWidth * dpr)), height = Math.max(1, Math.round(stage.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = overlay.width = width; canvas.height = overlay.height = height; gl.viewport(0, 0, width, height); fit(); }
  try {
    viewerUI.tools.before();
    if (!animationPreview && playback.playing) controller?.tick(current);
    if (pointer && pointer.action.gesture === 6 && !pointer.started && current - pointer.at >= 0.3) pointer.started = controller.beginDrag(pointer.action.index, current);
    if (animationPreview && scene) for (const layer of scene.layers) { const entry = layer.state.getCurrent(PREVIEW_TRACK); if (entry) entry.trackTime += step; }
    scene?.update(animationPreview ? 0 : step, current); viewerUI.tools.after(); if (!animationPreview && playback.playing) for (const callback of callbacks.splice(0)) callback(); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const viewport = (x, y) => ({ x: (x - renderer.camera.position.x) / renderer.camera.viewportWidth * width + width / 2, y: (y - renderer.camera.position.y) / renderer.camera.viewportHeight * height + height / 2 });
    scene?.draw(renderer, viewport);
    if (pendingFit && pendingFit.scene === scene && current >= pendingFit.at && !pointer) {
      if (fitVisiblePixels()) { pendingFit = null; gl.clear(gl.COLOR_BUFFER_BIT); scene.draw(renderer, viewport); }
      else if (current >= pendingFit.expires) pendingFit = null;
    }
    if (transition) { if (current >= transitionUntil) { transition.dispose(); transition = null; } else { transition.update(animationPreview ? 0 : step, current); transition.draw(renderer, viewport); } }
    if (previewPending && previewSequence === requestId && scene === previewScene && controller && !pendingFit && !gl.isContextLost() && canvas.width > 1 && canvas.height > 1) { loadingPreview.ready(previewSequence); previewPending = false; }
    drawRegions(); updateActions(); viewerUI.update();
  } catch (error) { if (lastFailure !== error.message) fail(error); }
  requestAnimationFrame(render);
}
const stagePan = K.createStagePan({ stage, button: $('#btnStagePan'), accepts: target => target === canvas || target === overlay,
  ready: () => !!scene && !!controller && !previewPending && !exporting,
  move: (dx, dy) => { pendingFit = null; viewPan.x += dx; viewPan.y += dy; fit(); },
  tap: event => { const point = worldPoint(event.clientX, event.clientY), action = controller.hit(point.x, point.y); if (action && (!action.gesture || controller.restoreObjects.has(action.index))) { endAnimationPreview(); playback.playing = true; controller.trigger(action.index, now()); } }
});
stage.addEventListener('pointerdown', event => {
  if (!scene || !controller || event.button !== 0 || (event.target !== canvas && event.target !== overlay)) return;
  endAnimationPreview(); playback.playing = true;
  const point = worldPoint(event.clientX, event.clientY), action = controller.hit(point.x, point.y); if (!action) return;
  stage.setPointerCapture(event.pointerId); pointer = { id: event.pointerId, action, previous: point, start: point, at: now(), started: false };
});
stage.addEventListener('pointermove', event => {
  if (!pointer || pointer.id !== event.pointerId || !controller) return;
  const point = worldPoint(event.clientX, event.clientY), dx = point.x - pointer.previous.x, dy = point.y - pointer.previous.y;
  if (pointer.action.gesture && !controller.restoreObjects.has(pointer.action.index)) {
    if (!pointer.started && pointer.action.gesture !== 6 && Math.hypot(point.x - pointer.start.x, point.y - pointer.start.y) > 3) pointer.started = controller.beginDrag(pointer.action.index, now());
    if (pointer.started) controller.moveDrag(dx, dy);
  }
  pointer.previous = point;
});
function releasePointer(event, cancelled = false) {
  if (!pointer || pointer.id !== event.pointerId) return;
  if (pointer.started) controller?.endDrag(); else if (!cancelled && (!pointer.action.gesture || controller?.restoreObjects.has(pointer.action.index))) controller?.trigger(pointer.action.index, now()); pointer = null;
}
stage.addEventListener('pointerup', event => releasePointer(event)); stage.addEventListener('pointercancel', event => releasePointer(event, true));
$('#gridSearch').addEventListener('input', () => {
  gridPage = 1; fillModels();
});
$('#model').addEventListener('change', () => { clearTimeout(searchTimer); loadModel($('#model').value).catch(fail); });
$('#btnPrev').addEventListener('click', () => step(-1)); $('#btnNext').addEventListener('click', () => step(1));
$('#reset').addEventListener('click', () => model && loadModel(model.id).catch(fail)); $('#fit').addEventListener('click', () => { stagePan.cancel(); viewPan.x = viewPan.y = 0; viewZoom = 1; fit(); if (scene) pendingFit = { scene, at: now(), expires: now() + 2 }; });
$('#railThumb').addEventListener('click', () => $('#fit').click());
$('#railStar').addEventListener('click', () => { if (model) { K.favs.toggle(favoriteEntry(model)); fillModels(); } });

$('#entrance').addEventListener('click', () => { endAnimationPreview(); playback.playing = true; const entry = model.actions.find(a => a.sName === 'in'); if (entry) controller.trigger(entry.index, now(), true); });
$('#sound').addEventListener('click', () => setSoundEnabled(!soundEnabled()));
$('#voice').addEventListener('change', updateVoicePreview);
$('#voice-play').addEventListener('click', () => { if (!$('#voice').value) { setVoiceStatus('当前立绘没有可播放的语音'); return; } playAudio([$('#voice').value], false); });
$('#voice-stop').addEventListener('click', () => { stopAudio(); setVoiceStatus('已停止播放'); });
$('#asmrTrack').addEventListener('change', playAsmr); $('#closeAsmr').addEventListener('click', () => $('#asmrDialog').close()); $('#asmrDialog').addEventListener('close', () => $('#asmrPlayer').pause());
function setPanelOpen(name, open) {
  const target = name === 'library' ? $('#gridView') : $('#floatPanel');
  const button = name === 'library' ? $('#railGrid') : $('#btnAnimTab');
  target.classList.toggle('open', open);
  document.body.classList.toggle(`${name}-open`, open);
  button.setAttribute('aria-expanded', String(open));
}
$('#railGrid').addEventListener('click', () => setPanelOpen('library', !$('#gridView').classList.contains('open')));
$('#btnAnimTab').addEventListener('click', () => { const open = !$('#floatPanel').classList.contains('open'); if (open) viewerUI.showTab('anim'); setPanelOpen('interaction', open); });
$('#gridClose').addEventListener('click', () => setPanelOpen('library', false));
$('#panel-close').addEventListener('click', () => setPanelOpen('interaction', false));
document.querySelectorAll('[data-panel-tab]').forEach(tab => tab.addEventListener('click', () => {
  const pageName = tab.dataset.panelTab;
  document.querySelectorAll('[data-panel-tab]').forEach(button => {
    const active = button === tab;
    button.classList.toggle('on', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-panel-page]').forEach(page => page.classList.toggle('on', page.dataset.panelPage === pageName));
}));
document.querySelectorAll('[data-group]').forEach(button => button.addEventListener('click', () => {
  modelGroupFilter = button.dataset.group; gridPage = 1;
  document.querySelectorAll('[data-group]').forEach(chip => {
    const active = chip === button;
    chip.classList.toggle('on', active);
    chip.setAttribute('aria-pressed', String(active));
  });
  fillModels();
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { setPanelOpen('library', false); setPanelOpen('interaction', false); }
});
function fail(error) { loadingPreview.fail(previewSequence, error.message); lastFailure = error.message; $('#loading').hidden = false; $('#loading').textContent = `加载失败：${error.message}`; console.error(error); }
window.__crosscoreTest = {
  snapshot: () => ({ ready: !!scene && !!controller && !controller.switching && $('#loading').hidden, modelId: model?.id, prefab: scene?.definition.name, idle: controller?.idle, ...controller?.snapshot(), tracks: scene?.main.state.tracks.filter(Boolean).map(entry => ({ track: entry.trackIndex, name: entry.animation?.name, time: entry.trackTime, timeScale: entry.timeScale })), audio: audioResult, error: lastFailure, view: scene && { bounds: scene.bounds, x: renderer.camera.position.x, y: renderer.camera.position.y, width: renderer.camera.viewportWidth, height: renderer.camera.viewportHeight, fitting: !!pendingFit } }),
  screenForArea: index => {
    const area = controller.action(index).areas[0], rect = stage.getBoundingClientRect(), angle = area[4] * Math.PI / 180;
    for (const u of [0, -0.25, 0.25, -0.45, 0.45]) for (const v of [0, -0.25, 0.25, -0.45, 0.45]) {
      const x = area[0] + u * area[2] * Math.cos(angle) - v * area[3] * Math.sin(angle), y = area[1] + u * area[2] * Math.sin(angle) + v * area[3] * Math.cos(angle), point = screenPoint(x, y);
      if (controller.hit(x, y)?.index === index && point.x > 1 && point.y > 1 && point.x < rect.width - 1 && point.y < rect.height - 1) return { x: point.x + rect.left, y: point.y + rect.top };
    }
    throw new Error(`热点 ${index} 当前被其他热点覆盖或不在画面内`);
  },
  screenForWorld: (x, y) => { const point = screenPoint(x, y), rect = stage.getBoundingClientRect(); return { x: point.x + rect.left, y: point.y + rect.top }; },
  catalog: () => ({ models: models.map(m => ({ id: m.id, name: m.name, available: m.available, group: m.group })), summary: catalog.summary }),
  select: id => loadModel(id),
  selectPrefab: async key => { const loaded = await loadPrefab(key, requestId); if (loaded) { controller.roleLoaded(now(), loaded.idle); $('#loading').hidden = true; } },
};
fillModels(); K.initStageUI({ canvas, refit: () => { if (scene) fit(); } }); requestAnimationFrame(render);
K.setLibraryStageReady(false);
const initial = new URL(location.href).searchParams.get('model');
if (initial && modelById.get(Number(initial))?.available) await loadModel(Number(initial)).catch(fail);
else setPanelOpen('library', true);
