'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const at = process.argv.indexOf('--site');
const root = at < 0 ? path.resolve(__dirname, '..') : path.resolve(process.argv[at + 1]);
const isSource = fs.existsSync(path.join(root, 'scripts/build-asset-catalog.js'));
const file = rel => path.join(root, rel);
const read = rel => fs.readFileSync(file(rel), 'utf8');
const api = require(file('common/asset-display-overrides.js'));
let checks = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
const records = api.metadata.overrides.nikki;
equal(Object.keys(records).length, 70, 'all reviewed entries, including the final eight');
const fixture = {
  c984_00: ['other', '语音通讯屏 · SOUND ONLY'],
  c984_01: ['other', '通讯屏 · X 标识'],
  c976_00: ['other', 'T.RONY · 终端界面'],
  c870_02_bg: ['other', 'C870 · 白色坐垫'],
  c870_02_fg: ['other', 'C870 · 三脚小桌与摆件'],
  c017_00_slillcut: ['skill', 'Anis: Star · 技能动画（C017）'],
  c851_00_skillut: ['skill', 'Raven · 技能动画（C851）'],
  'catalog-c470_00_z_f': ['skill', '小红帽 · 技能动画（C470）'],
  c821_01: ['skill', 'C821 · 技能动画'],
  dummy_aim_00: ['other', '瞄准姿势测试人偶'],
  dummy_cover_00: ['other', '掩体姿势测试人偶'],
};
for (const [id, expected] of Object.entries(fixture)) {
  const original = {id, name:'original:' + id, originalName:'original:' + id, resourceType:'lobby', cutscenes:[{dir:'spine/'+id+'/',skel:id+'.skel',atlas:id+'.atlas'}]};
  const snapshot = JSON.stringify(original);
  const revised = api.apply('nikki', original);
  equal([revised.resourceType,revised.displayName],expected,id);
  equal(revised.originalName,original.originalName,'keep original names');
  equal(revised.id,id,'keep stable IDs');
  equal(revised.cutscenes,original.cutscenes,'keep all asset URLs');
  equal(JSON.stringify(original),snapshot,'do not mutate caller-owned indexes');
  equal(api.apply('nikki',revised),revised,'idempotent decoration');
  assert.ok(revised.searchText.includes(revised.displayName) && revised.searchText.includes(id)); checks++;
}
for (const id of ['c870_00','c870_01','c870_02','c871_00','c871_01','c871_02','c140_00','c913_00','c011_cover_00','EventTitle_WhiteMemory_01','catalog-c011_cover_00']) {
  const original={id,name:'untouched',resourceType:'lobby'};
  assert.strictEqual(api.apply('nikki',original),original,'only reviewed exact IDs may change: '+id); checks++;
}
for (const source of ['bd2','majsoul','nikke']) {
  const original={id:'c984_00',name:'other source',resourceType:'lobby'};
  assert.strictEqual(api.apply(source,original),original,'do not correct another game or Mod by matching ID'); checks++;
}
equal(Object.values(records).filter(r=>r.reviewNumber>=63).map(r=>r.resourceType),Array(8).fill('other'),'the user approved other for all pending entries');

const browser={window:{}};
vm.createContext(browser);
vm.runInContext(read('common/asset-display-overrides.js'),browser);
equal(browser.window.ArtHubDisplayOverrides.get('nikki','c984_00').resourceType,'other','browser export is functional');
const kit=read('common/kit.js');
const begin=kit.indexOf('  const NIKKE_CATEGORY_LABEL =');
const end=kit.indexOf('  // cutscene.html',begin);
assert.ok(begin>=0 && end>begin);
const context={displayOverrides:browser.window.ArtHubDisplayOverrides,assetCatalog:{spine:{nikki:{c984_00:{id:'c984_00',originalName:'raw panel',displayName:'wrong cached portrait',resourceType:'lobby'}}}},embeddedSpineMeta:{},
  assetTypeLabels:()=>({unknown:'其它',other:'其它'})};
vm.createContext(context);
vm.runInContext('const K={};\n'+kit.slice(begin,end)+'\nthis.rules=K;',context);
const assetBegin=kit.indexOf('  K.decorateAssetIndex =');
const assetEnd=kit.indexOf('\n  function galleryFrameInfo',assetBegin);
vm.runInContext(kit.slice(assetBegin,assetEnd),context);
const stale={catalogNormalized:true,characters:[{id:'c984_00',type:'catalog',resourceType:'lobby',name:'wrong cached portrait',originalName:'raw panel'}]};
const corrected=context.rules.decorateNikkeIndex(stale);
equal(corrected.characters[0].resourceType,'other','correct a stale embedded resourceType');
equal(corrected.characters[0].name,'语音通讯屏 · SOUND ONLY','correct stale embedded names');
const oldCatalogResult=context.rules.decorateAssetIndex({characters:stale.characters},'nikki');
equal(oldCatalogResult.characters[0].resourceType,'other','old naming directory cannot overwrite reviewed categories');
equal(oldCatalogResult.characters[0].displayName,'语音通讯屏 · SOUND ONLY','old naming directory cannot overwrite reviewed names');
const normalizedResult=context.rules.decorateAssetIndex(stale,'nikki');
equal(normalizedResult.characters[0].resourceType,'other','normalized indexes also receive reviewed corrections');

const indexRel=isSource?'data/nikki/index/nikki_chars.json':'nikki/nikki_chars.json';
const raw=JSON.parse(read(indexRel));
const snapshot=JSON.stringify(raw);
const visible=context.rules.decorateNikkeIndex(raw);
const counts={skill:0,battle:0,lobby:0,other:0};
for (const entry of visible.characters) {
  const current=isSource?(records[entry.id]?.resourceType || entry.resourceType || entry.type):entry.resourceType;
  counts[['skill','battle','lobby'].includes(current)?current:'other']++;
}
equal(JSON.stringify(raw),snapshot,'actual input index remains untouched');
equal(visible.characters.length,2037,'hidden entries and visible asset count stay intact');
if (!isSource) {
  equal(counts,{skill:229,battle:776,lobby:524,other:508},'reviewed live categories');
  for (const [id,record] of Object.entries(records)) {
    const entry=raw.characters.find(e=>e.id===id);
    assert.ok(entry,'published entry exists: '+id); checks++;
    equal([entry.resourceType,entry.displayName],[record.resourceType,record.displayName],'published metadata agrees with review: '+id);
  }
}
if (isSource) {
  const before=read('common/asset-catalog.json');
  const rebuilt=require(file('scripts/build-asset-catalog.js')).buildCatalog();
  for (const [id,record] of Object.entries(records)) {
    equal([rebuilt.spine.nikki[id].resourceType,rebuilt.spine.nikki[id].displayName],[record.resourceType,record.displayName],'catalog rebuilding retains reviewed correction: '+id);
  }
  equal(read('common/asset-catalog.json'),before,'read-only build check does not write catalog');
}
for (const rel of isSource?['sources/bd2/viewer/cutscene.html','sources/majsoul/viewer/index.html']:['bd2/viewer/cutscene.html','nikki/viewer/cutscene.html','majsoul/viewer/index.html']) {
  const html=read(rel),corrections=html.indexOf('common/asset-display-overrides.js'),shared=html.indexOf('common/kit.js');
  assert.ok(corrections>=0 && corrections<shared,'real HTML loads corrections before Kit: '+rel); checks++;
}
console.log(JSON.stringify({ok:true,checks,reviewedEntries:70,visible:visible.characters.length,source:isSource,classification:isSource?undefined:counts}));
