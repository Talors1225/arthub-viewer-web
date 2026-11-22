'use strict';

const fs = require('node:fs');
const { createHash } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { largestOpaqueRectangle, makeFrameProbe } = require('./portrait-frame-probe.cjs');

const { values, positionals } = parseArgs({
 allowPositionals: true,
 options: {
  origin: { type: 'string', default: 'http://127.0.0.1:55446' },
  out: { type: 'string' },
  workers: { type: 'string', default: '2' },
  mobile: { type: 'boolean' },
  original: { type: 'boolean' },
  'capture-all': { type: 'boolean' },
  zoom: { type: 'string', default: '0' },
  actions: { type: 'string' },
 },
});
if (!values.out) throw new Error('Specify --out DIRECTORY for review evidence');
const out = path.resolve(values.out);
const workerCount = Number(values.workers);
const zoomSteps = Number(values.zoom);
if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 4) throw new Error('--workers must be an integer from 1 to 4');
if (!Number.isInteger(zoomSteps) || zoomSteps < 0 || zoomSteps > 6) throw new Error('--zoom must be an integer from 0 to 6');
fs.mkdirSync(out, { recursive: true });

const results = path.join(out, 'results.jsonl');
const runFile = path.join(out, 'run.json');
const invalidated = path.join(out, 'invalidated.json');
const viewport = values.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
const viewerPath = '/azurlane-interaction/viewer/';
const catalogPath = '/azurlane-interaction/characters.json';
const fingerprintPaths = [
 catalogPath, ...['index.html', 'viewer.mjs', 'portrait-frame.mjs', 'portrait-motion.mjs', 'controller.mjs',
  'auto-scene-apertures.mjs', 'retired-models.json'].map(file => viewerPath + file),
 '/common/kit.js', '/common/stage-ui.js', '/common/site-ui.js', '/common/interaction-viewer-ui.js',
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function describeRun(request) {
 const origin = new URL(values.origin).origin;
 const inputs = Object.fromEntries(await Promise.all(fingerprintPaths.map(async file => {
  const response = await request.get(new URL(file, origin).href, { timeout: 15000 });
  if (!response.ok()) throw new Error('Cannot fingerprint ' + file + ': ' + response.status());
  return [file, sha256(await response.body())];
 })));
 const config = {
  origin, inputs, viewport, zoomSteps, framing: values.original ? 'original' : 'clean',
  actions: values.actions || null, captureAll: Boolean(values['capture-all']),
  sampler: sha256(fs.readFileSync(__filename)), probe: sha256(fs.readFileSync(require.resolve('./portrait-frame-probe.cjs'))),
 };
 return { ...config, digest: sha256(JSON.stringify(config)) };
}

function resume(run) {
 if (fs.existsSync(invalidated)) throw new Error('The preview changed during this scan. Specify a new --out.');
 if (fs.existsSync(runFile)) {
  const existing = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  if (existing.digest !== run.digest) throw new Error('This output belongs to a different viewer build or scan configuration. Specify a new --out.');
 } else {
  if (fs.existsSync(results)) throw new Error('This output contains unversioned results. Specify a new --out.');
  fs.writeFileSync(runFile, JSON.stringify(run, null, 2), { flag: 'wx' });
 }
 return new Set(fs.existsSync(results) ? fs.readFileSync(results, 'utf8').split('\n').filter(Boolean)
  .map(line => JSON.parse(line)).filter(record => record.run === run.digest && !record.error && !record.failures.length).map(record => record.id) : []);
}

function playwright() {
 try { return require('playwright'); }
 catch { return require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
}

function scanInPage({ captureAll, zoomSteps, actionFilter }) {
 const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
 const { adapter, controller, selected, view, model, effect } = window.__azurlane;
 const canvas = document.querySelector('#canvas');
 const source = document.createElement('canvas');
 const context = source.getContext('2d');
 const probe = makeFrameProbe();

 function copyVisible() {
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  const scale = Math.min(1, 640 / Math.max(cssWidth, cssHeight));
  source.width = Math.max(2, Math.round(cssWidth * scale));
  source.height = Math.max(2, Math.round(cssHeight * scale));
  const clip = getComputedStyle(canvas).clipPath;
  const [kind, inner] = /^([\w-]+)\((.*)\)$/.exec(clip)?.slice(1) || [];
  const coordinate = (token, css, pixels) => token.endsWith('%')
   ? parseFloat(token) / 100 * pixels : parseFloat(token) / css * pixels;
  const x = value => coordinate(value, cssWidth, source.width);
  const y = value => coordinate(value, cssHeight, source.height);
  if (kind === 'polygon') {
   context.beginPath();
   for (const [i, point] of inner.split(',').entries()) {
    const [left, top] = point.trim().split(/\s+/);
    if (i === 0) context.moveTo(x(left), y(top));
    else context.lineTo(x(left), y(top));
   }
   context.closePath();
   context.clip();
  } else if (kind === 'inset') {
   const [top, right = top, bottom = top, left = right] = inner.split(' round ')[0].trim().split(/\s+/);
   context.beginPath();
   context.rect(x(left), y(top), source.width - x(left) - x(right), source.height - y(top) - y(bottom));
   context.clip();
  }
  context.drawImage(canvas, 0, 0, source.width, source.height);
  return kind || 'none';
 }

 return (async () => {
  document.querySelector('#exit-interaction').click();
  adapter.setInteractionViewFixed?.(false);
  if (view.playing) document.querySelector('#play').click();
  for (let i = 0; i < zoomSteps; i++) document.querySelector('#zOut').click();
  const include = actionFilter ? new RegExp(actionFilter) : null;
  const names = [...new Set(selected.animations)].filter(name => !include || include.test(name));
  const failures = [];
  const actions = [];
  const evidence = [];
  for (const name of names) {
   try {
    const effectTimeline = name === 'effect' ? adapter.effectTimeline : null;
    if (!effectTimeline) {
     // Keep the opening pose if it is already active. Select other actions
     // through the viewer controller so setup attachments and events match the page.
     if (adapter.timeline().name !== name) {
      const started = controller.action(name, { force: true, idle: true, manual: true, resetPose: true, voice: false });
      if (!started) throw new Error('Viewer cannot select this action');
      const deadline = performance.now() + 15000;
      while (controller.state.motionPending || adapter.timeline().name !== name) {
       if (performance.now() >= deadline) throw new Error('Viewer did not select the requested action');
       await paint();
      }
     }
    }
    const active = effectTimeline ? effectTimeline.state() : adapter.timeline();
    const duration = Number(active.duration);
    if (!effectTimeline && active.name !== name) throw new Error('Active timeline is ' + active.name);
    if (!Number.isFinite(duration) || duration < 0) throw new Error('Action has no measurable runtime duration');
    if (effectTimeline) effectTimeline.setFixed(true);
    const samples = [];
    let best = null;
    for (const fraction of duration > 0 ? [.03, .5, .97] : [0]) {
     const time = duration * fraction;
     if (effectTimeline) {
      effectTimeline.seek(time);
      adapter.refreshEffect?.();
     } else if (model?.internalModel) adapter.seek(time, 0, true, true);
     else adapter.seek(time);
     await paint();
     const measured = effectTimeline ? effectTimeline.state() : adapter.timeline();
     if (!Number.isFinite(measured.time) || Math.abs(measured.time - time) > .02) {
      throw new Error('Timeline seek mismatch at ' + time + 's (' + measured.time + 's)');
     }
     const clip = copyVisible();
     const signal = probe(source);
     const { artwork, ...metrics } = signal;
     samples.push({ fraction, time, measuredTime: measured.time, clip, ...metrics });
     if (captureAll) evidence.push({ name, fraction, image: source.toDataURL('image/webp', .82) });
     else {
      const score = 8 * !!signal.suspect + 5 * !!signal.empty + 3 * !!signal.solidStrip + 2 * !!signal.wedge +
       2 * (signal.dark > .55 && signal.content > .015) + Number(!!signal.sceneEdge);
      if (score >= 2 && score > (best?.score || 0)) {
       best = { name, fraction, score, image: source.toDataURL('image/webp', .76) };
      }
     }
    }
    effectTimeline?.setFixed(false);
    actions.push({ name, duration, samples });
    if (best) evidence.push(best);
   } catch (error) {
    failures.push({ name, error: String(error.message || error) });
   }
  }
  return {
   id: selected.id, label: selected.name, type: selected.type, advertised: names.length,
   actions, failures, evidence, effect: Boolean(effect), playPaused: !view.playing,
  };
 })();
}

async function main() {
 const browser = await playwright().chromium.launch({ headless: true, channel: 'msedge' });
 try {
  const context = await browser.newContext({ viewport });
  const run = await describeRun(context.request);
  const completed = resume(run);
  const response = await context.request.get(new URL(catalogPath, run.origin).href);
  if (!response.ok()) throw new Error('Cannot open Azur Lane catalog: ' + response.status());
  const bytes = await response.body();
  if (sha256(bytes) !== run.inputs[catalogPath]) throw new Error('Catalog changed at scan startup. Retry after the preview is stable.');
  const catalog = JSON.parse(bytes).characters;
 const byId = new Map(catalog.map(entry => [entry.id, entry]));
 const selected = positionals.length ? positionals.map(id => {
  if (!byId.has(id)) throw new Error('Unknown Azur Lane catalog ID: ' + id);
  return byId.get(id);
 }) : catalog;
 const pending = selected.filter(entry => !completed.has(entry.id));
  const source = '(' + scanInPage.toString() + ')';
  const helpers = largestOpaqueRectangle.toString() + '\n' + makeFrameProbe.toString();
  console.log('Catalog: %d, selected: %d, done in this folder: %d', catalog.length, pending.length, completed.size);
  async function worker() {
   const page = await context.newPage();
   try {
    for (let entry; (entry = pending.shift());) {
     let record;
     try {
      const url = new URL(viewerPath + 'index.html', run.origin);
      url.searchParams.set('id', entry.id);
      if (values.original) url.searchParams.set('framing', 'original');
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForFunction(id => {
       const viewer = window.__azurlane;
       return viewer?.errors?.length || (viewer?.ready && viewer.selected?.id === id &&
        !viewer.controller?.state.motionPending && viewer.view.frames > 3);
      }, entry.id, { timeout: 45000 });
      const loadError = await page.evaluate(() => window.__azurlane.errors.at(-1));
      if (loadError) throw new Error(loadError);
      await page.addScriptTag({ content: helpers + '\nwindow.runAzurFrameScan = ' + source });
      const { evidence, ...report } = await page.evaluate(options => window.runAzurFrameScan(options), {
       captureAll: Boolean(values['capture-all']), zoomSteps, actionFilter: values.actions,
      });
      record = report;
      for (const { name, fraction, image } of evidence) {
       const stem = name.replace(/[^a-z0-9_-]/gi, '_');
       const file = [entry.id, stem, Math.round(100 * fraction)].join('__') + '.webp';
       fs.writeFileSync(path.join(out, file), Buffer.from(image.split(',')[1], 'base64'));
      }
     } catch (error) {
      record = { id: entry.id, error: String(error.message || error) };
     }
     fs.appendFileSync(results, JSON.stringify({ ...record, run: run.digest }) + '\n');
     console.log('%s: %s', entry.id, record.error || (record.actions.length + '/' + record.advertised + ' actions, ' +
      record.actions.reduce((total, action) => total + action.samples.length, 0) + ' samples'));
    }
   } finally { await page.close(); }
  }
  await Promise.all(Array.from({ length: Math.min(workerCount, pending.length) }, worker));
  const finalRun = await describeRun(context.request);
  if (finalRun.digest !== run.digest) {
   fs.writeFileSync(invalidated, JSON.stringify({ start: run.digest, end: finalRun.digest }, null, 2), { flag: 'wx' });
   throw new Error('Viewer files changed during the scan. Results were marked unstable. Specify a new --out.');
  }
 } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
