'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const option = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const root = path.resolve(option('--site') || path.join(__dirname, '..'));
let checks = 0;
const check = (value, expected, label) => { assert.deepEqual(value, expected, label); checks++; };

// Events are delivered manually so a detached image can finish after a newer
// model without relying on arbitrary timers. The viewer code under test is real.
class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
    this.dataset = {}; this.attributes = {}; this.listeners = new Map();
    this.hidden = false; this.textContent = ''; this.className = '';
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: name => { if (!this.classList.contains(name)) this.className = (this.className + ' ' + name).trim(); },
      remove: name => { this.className = this.className.split(/\s+/).filter(x => x !== name).join(' '); },
      toggle: (name, on) => { on ? this.classList.add(name) : this.classList.remove(name); },
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) {
    if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(x => x !== node);
    node.parentElement = this; this.children.push(node); return node;
  }
  replaceChildren(...nodes) { for (const node of this.children) node.parentElement = null; this.children = []; this.append(...nodes); }
  addEventListener(name, callback, options = {}) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push({callback, once: options.once});
  }
  dispatch(name) {
    const event = {type: name, stopped: false, stopPropagation() { this.stopped = true; }};
    for (const item of [...(this.listeners.get(name) || [])]) {
      item.callback(event);
      if (item.once) this.listeners.set(name, this.listeners.get(name).filter(x => x !== item));
    }
    return event;
  }
  click() { return this.dispatch('click'); }
}

const K = {};
const retryButton = new Element('button'); let retried = 0;
retryButton.addEventListener('click', () => retried++);
const context = vm.createContext({window: {SpineKit: K},
  location: {pathname: '/arthub-viewer-web/nikki/viewer/cutscene.html'},
  document: {createElement: tag => new Element(tag), getElementById: id => id === 'btnRetry' ? retryButton : null},
  DOMException, AbortController, URL, setTimeout, clearTimeout});
const loader = fs.readFileSync(path.join(root, 'common/asset-loader.js'), 'utf8');
new vm.Script(loader, {filename: 'asset-loader.js'}).runInContext(context);
check(K.stagePosterPath('nikki', 'c871_01', 'Catalog'), '/arthub-viewer-web/posters/nikki/c871_01--Catalog.webp', 'direct poster URL without thumbnail manifest');
check(K.stagePosterPath('nikki', 'c871_02', 'Catalog'), '/arthub-viewer-web/posters/nikki/c871_02--Catalog.webp', 'costume variants cannot share a poster');
check(K.stagePosterPath('unknown', 'sample'), null, 'unknown source cannot escape poster root');
context.location.pathname = '/bd2/viewer/cutscene.html';
check(K.stagePosterPath('bd2', '000101'), '/posters/bd2/000101--0.webp', 'local root supported');
context.location.pathname = '/arthub-viewer-web/nikki/viewer/cutscene.html';
const stage = new Element('div'); stage.className = 'stage';
const preview = K.createLoadingPreview(stage);
const overlay = stage.children[0];
const picture = overlay.children[0], notice = overlay.children[1];
const title = notice.children[0], state = notice.children[1], retry = notice.children[2];
const message = state.children[1];
check(overlay.hidden, true, 'initially hidden');
check(state.getAttribute('role'), 'status', 'accessible loading status');
preview.begin(1, {path: '/one.webp', label: '角色一'});
const oldImage = picture.children[0];
check(overlay.hidden, false, 'open before model download');
check(stage.classList.contains('loading-preview-active'), true, 'canvas concealed while loading');
check(stage.getAttribute('aria-busy'), 'true', 'loading state');
check(message.textContent, '动态加载中', 'visible loading feedback');
check(oldImage.src, '/one.webp', 'dedicated static poster instead of full texture');
check(overlay.dataset.fit, '0.92', 'same fitted stage area as NIKKE and BD2');
check(oldImage.fetchPriority, 'high', 'preview request priority');
oldImage.dispatch('load');
check(overlay.classList.contains('has-preview'), true, 'loaded static image visible');
check(overlay.hidden, false, 'thumbnail loading is not model completion');

preview.begin(2, {path: '/two.webp', label: '角色二'});
const image = picture.children[0];
oldImage.dispatch('error');
preview.ready(1); preview.fail(1, 'old failure'); preview.setImage(1, '/stale.webp');
check(picture.children[0], image, 'old image failure cannot remove current preview');
check(overlay.hidden, false, 'old model cannot hide current loading status');
check(overlay.dataset.state, 'loading', 'old failure ignored');
image.dispatch('load');
check(overlay.classList.contains('has-preview'), true, 'current preview can load');
preview.fail(2, 'HTTP 503');
check(overlay.dataset.state, 'error', 'current failure visible');
check(picture.children[0], image, 'failure retains preview');
check(message.textContent, '动态加载失败', 'failure feedback');
check(retry.hidden, false, 'retry exposed');
check(stage.getAttribute('aria-busy'), 'false', 'failed request no longer busy');
check(retry.dispatch('pointerdown').stopped, true, 'retry does not start canvas dragging');
check(retry.dispatch('pointerup').stopped, true, 'retry does not select a model part');
check(retry.click().stopped, true, 'retry does not propagate canvas tap');
check(retried, 1, 'retry invokes existing model loader');
preview.ready(2);
check(overlay.hidden, false, 'a later render cannot erase current failure');

preview.begin(3, {label: 'Direct link', fit: .85});
check(overlay.dataset.fit, '0.85', 'same fitted stage area as multi-layer Mahjong Soul');
check(picture.children.length, 0, 'late manifest supported');
check(title.textContent, 'Direct link', 'resource label visible without a thumbnail');
check(retry.hidden, true, 'retry resets for a fresh request');
preview.setImage(3, '/late.webp');
const lateImage = picture.children[0]; lateImage.dispatch('load');
check(overlay.classList.contains('has-preview'), true, 'late thumbnail attaches to current request');
preview.setImage(3, '/late.webp');
check(picture.children[0], lateImage, 'same image does not restart a request');
preview.setImage(3, '/updated.webp');
const updatedImage = picture.children[0];
lateImage.dispatch('error');
check(picture.children[0], updatedImage, 'replaced image callback ignored within same model');
updatedImage.dispatch('error');
check(overlay.dataset.state, 'loading', 'broken thumbnail does not fail the model');
check(picture.children.length, 0, 'broken image not left on screen');
preview.ready(3);
check(overlay.hidden, true, 'first draw hides preview');
check(stage.classList.contains('loading-preview-active'), false, 'first draw reveals canvas');
check(picture.children.length, 0, 'completed request releases preview element');
preview.setImage(3, '/too-late.webp'); preview.fail(3, 'too late');
check(overlay.hidden, true, 'late metadata cannot reopen completed preview');
check(stage.getAttribute('aria-busy'), 'false', 'ready state');
preview.begin(4, {path: '/cancelled.webp'});
const cancelledImage = picture.children[0]; preview.cancel(); cancelledImage.dispatch('load');
check(overlay.hidden, true, 'cancelled preview remains hidden');
check(overlay.classList.contains('has-preview'), false, 'late image event cannot resurrect cancellation');

const publicViewers = ['nikki/viewer/cutscene.html', 'bd2/viewer/cutscene.html', 'majsoul/viewer/index.html'];
const viewers = fs.existsSync(path.join(root, publicViewers[0])) ? publicViewers
  : ['sources/bd2/viewer/cutscene.html', 'sources/majsoul/viewer/index.html'];
for (const file of viewers) {
  const html = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], {filename: file});
  const draw = html.match(/renderer\.end\(\);\n\s*if \((?:cut|layers\.length)[^\n]+\) \{\n\s*playerDrawnSeq[^\n]+\n\s*loadingPreview\.ready[^\n]+\n\s*\}/);
  assert.ok(draw, file + ': test the actual first-draw boundary');
  const base = {cut: {}, layers: [{visible: true}], cv: {width: 390, height: 700}, canvas: {width: 390, height: 700},
    raw: {isContextLost: () => false}, cutLoadSeq: 11, loadSeq: 11, playerDrawnSeq: -1,
    loadingPreview: preview, renderer: {end() {}}};
  preview.begin(11, {path: '/draw.webp'});
  vm.runInNewContext(draw[0], {...base, raw: {isContextLost: () => true}});
  check(overlay.hidden, false, file + ': lost WebGL context must not hide preview');
  vm.runInNewContext(draw[0], {...base, cv: {width: 1, height: 1}, canvas: {width: 1, height: 1}});
  check(overlay.hidden, false, file + ': invisible canvas must not complete preview');
  vm.runInNewContext(draw[0], {...base, cut: null, layers: [{visible: false}]});
  check(overlay.hidden, false, file + ': no drawable model must not complete preview');
  assert.throws(() => vm.runInNewContext(draw[0], {...base, renderer: {end() {throw new Error('draw failed');}}}), /draw failed/);
  check(overlay.hidden, false, file + ': completion follows successful drawing');
  vm.runInNewContext(draw[0], base);
  check(overlay.hidden, true, file + ': successful first draw reveals animation');
  const helper = html.match(/function stagePreviewPath\([^)]*\) \{[\s\S]*?\n  \}/);
  assert.ok(helper, file + ': test real variant lookup');
  const variant = {variant: 'Lobby'}, cur = {id: 'sample', cutscenes: [variant, {variant: 'Skill'}]};
  const env = vm.createContext({K, routeSource: 'nikki', cur});
  vm.runInContext(helper[0], env);
  check(env.stagePreviewPath(file.includes('majsoul') ? {id: 'sample'} : variant),
    file.includes('majsoul') ? '/arthub-viewer-web/posters/majsoul/sample--binary.webp' : '/arthub-viewer-web/posters/nikki/sample--Lobby.webp', file + ': matching resource poster without gallery lookup');
  if (!file.includes('majsoul')) check(env.stagePreviewPath(cur.cutscenes[1]), '/arthub-viewer-web/posters/nikki/sample--Skill.webp', file + ': variant has its own image');
  else {
    check(env.stagePreviewPath({id:'sample', composite:true}), '/arthub-viewer-web/posters/majsoul/sample--layers.webp', 'composite poster contains all layers');
    check(env.stagePreviewPath({id:'sample', skel:'different.json'}), '/arthub-viewer-web/posters/majsoul/sample--json.webp', 'duplicate ID JSON variant retains separate poster');
  }
  const chrome = html.match(/const isChrome = \(t\) =>[^\n]+/);
  assert.ok(chrome, file + ': test actual touch exclusion');
  const input = vm.createContext({});
  vm.runInContext(chrome[0] + '\nthis.classify = isChrome;', input);
  check(input.classify({closest: name => name === '.stage-loading-preview' ? retry : null}), true,
    file + ': retry is a control before touch capture and context menu');
  check(input.classify({closest: () => null}), false, file + ': normal model gestures preserved');
}
const result = {ok: true, checks, viewers, scenarios: ['static-first', 'rapid-switch', 'stale-image', 'late-manifest',
  'thumbnail-error', 'model-error-and-retry', 'first-draw', 'context-loss', 'variant-preview', 'cancellation'],
  scope: 'DOM contract and viewer code; does not replace visual browser testing'};
if (option('--output')) fs.writeFileSync(option('--output'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
