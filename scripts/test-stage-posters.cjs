'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const vm = require('node:vm');
const args = process.argv.slice(2);
const root = path.resolve(args[0] && !args[0].startsWith('--') ? args.shift() : path.join(__dirname,'..'));
const coverOption = args.indexOf('--bd2-cover-root');
if (coverOption >= 0) assert.ok(args[coverOption + 1], '--bd2-cover-root needs a directory');
const bd2CoverRoot = coverOption >= 0 ? path.resolve(args[coverOption + 1]) : null;
const posterRoot = path.join(root,fs.existsSync(path.join(root,'posters'))?'posters':'web-posters');
const index = JSON.parse(fs.readFileSync(path.join(posterRoot,'index.json'),'utf8'));
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;};

const K = {};
const location = {pathname: ''};
vm.runInNewContext(fs.readFileSync(path.join(root, 'common/asset-loader.js'), 'utf8'), {window: {SpineKit: K}, location});
const routes = [
  {game: 'nikki', catalog: 'nikki/nikki_chars.json', source: 'data/nikki/index/nikki_chars.json', viewer: 'nikki/viewer/cutscene.html', sourceViewer: 'sources/bd2/viewer/cutscene.html'},
  {game: 'bd2', catalog: 'bd2/bd2_chars.json', source: 'sources/bd2/index/bd2_chars.json', viewer: 'bd2/viewer/cutscene.html', sourceViewer: 'sources/bd2/viewer/cutscene.html'},
  {game: 'majsoul', catalog: 'majsoul/characters.json', source: 'sources/majsoul/index/characters.json', viewer: 'majsoul/viewer/index.html', sourceViewer: 'sources/majsoul/viewer/index.html'},
];
const expected = new Set(), checkedCoverFiles = new Set();
const unavailable = index.unavailable || {}, ready = Object.keys(index.items);
const previewCounts = {dedicated: 0, burst: 0, catalog: 0};

function checkWebp(file, key) {
  if (checkedCoverFiles.has(file)) return;
  const bytes = fs.readFileSync(file);
  check(bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP', key + ': actual WebP cover');
  checkedCoverFiles.add(file);
}

for (const {game, catalog, source, viewer, sourceViewer} of routes) {
  const file = path.join(root, fs.existsSync(path.join(root, catalog)) ? catalog : source);
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')).characters;
  const html = fs.readFileSync(path.join(root, fs.existsSync(path.join(root, viewer)) ? viewer : sourceViewer), 'utf8').replace(/\r\n/g, '\n');
  const helper = html.match(/function stagePreviewPath\([^)]*\) \{[\s\S]*?\n  \}/);
  check(helper, game + ': test the real preview selector');
  const context = vm.createContext({K, routeSource: game, THUMB_PREFIX: '../../thumbs/', webThumbs: {}});
  vm.runInContext(helper[0], context);
  const sitePath = '/arthub-viewer-web/';
  location.pathname = sitePath + viewer;
  const pageUrl = new URL(location.pathname, 'https://arthub.test');
  for (const character of rows) {
    context.cur = character;
    const variants = game === 'majsoul' ? [character] : character.cutscenes || [];
    for (const variant of variants) {
      const variantId = game === 'majsoul'
        ? (character.composite ? 'layers' : /\.json$/i.test(character.skel) ? 'json' : 'binary')
        : String(variant.variant ?? '0');
      const key = [game, character.id, variantId].join(':');
      check(!expected.has(key), key + ': unique source and variant');
      expected.add(key);
      check(!(index.items[key] && unavailable[key]), key + ': no conflicting poster status');
      if (unavailable[key]) {
        check(typeof unavailable[key].reason === 'string' && unavailable[key].reason.length > 0, key + ': failure reason retained');
        continue;
      }
      const selected = context.stagePreviewPath(variant);
      check(selected, key + ': viewer selects a preview');
      const url = new URL(selected, pageUrl);
      check(url.origin === pageUrl.origin && url.pathname.startsWith(sitePath), key + ': preview stays on the site asset route');
      const relative = decodeURIComponent(url.pathname.slice(sitePath.length));
      if (game === 'nikki' && character.burst?.cover) {
        check(selected === character.burst.cover && relative === 'nikki/burst-covers/' + character.burst.key + '.webp', key + ': matching skill cover');
        checkWebp(path.join(root, relative), key);
        previewCounts.burst++;
      } else if (game === 'bd2' && character.thumbnail) {
        check(character.thumbnail === 'bd2/portraits/' + character.id + '.webp' && relative === 'thumbs/' + character.thumbnail,
          key + ': matching catalog portrait cover');
        if (bd2CoverRoot) checkWebp(path.join(bd2CoverRoot, character.thumbnail), key);
        previewCounts.catalog++;
      } else {
        check(index.items[key] && relative === 'posters/' + index.items[key].path, key + ': matching dedicated poster');
        previewCounts.dedicated++;
      }
    }
  }
}
check(ready.every(key=>expected.has(key)),'no orphaned or wrong-resource posters');
for(const [key,item] of Object.entries(index.items)) {
  const [game,...parts]=key.split(':'),file=path.resolve(posterRoot,item.path);
  check(item.path===game+'/'+parts.join('--')+'.webp',key+': URL matches viewer identity');
  check(file.startsWith(posterRoot+path.sep)&&fs.existsSync(file),key+': referenced asset exists');
  check(fs.statSync(file).size===item.bytes,key+': manifest and deployed bytes agree');
  check(Math.max(item.width,item.height)>=1280&&Math.max(item.width,item.height)<=1281,key+': dedicated high-resolution preview (one-pixel floating-point rounding allowance)');
  check(item.visiblePixels>=32&&item.transparentPixels>0,key+': rendered content on transparent background');
}
for(const key of ['nikki:c871_01:Catalog','nikki:c871_02:Catalog','bd2:000101:0','majsoul:40010803__layers:layers']) check(!!index.items[key],key+': real regression sample');
check(index.items['nikki:c871_01:Catalog'].path!==index.items['nikki:c871_02:Catalog'].path,'reported costumes retain independent artwork');
console.log(JSON.stringify({ok:true,checks,expected:expected.size,ready:ready.length,previewCounts,
  coversChecked:checkedCoverFiles.size,bd2CoverFilesChecked:Boolean(bd2CoverRoot),unavailable:Object.keys(unavailable),
  scope:'Runtime preview selection, asset identities, dedicated poster dimensions and file integrity.'}));
