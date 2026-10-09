'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || path.join(__dirname,'..'));
const posterRoot = path.join(root,fs.existsSync(path.join(root,'posters'))?'posters':'web-posters');
const index = JSON.parse(fs.readFileSync(path.join(posterRoot,'index.json'),'utf8'));
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;};
const expected = [];
for (const [game,pub,src] of [['nikki','nikki/nikki_chars.json','data/nikki/index/nikki_chars.json'], ['bd2','bd2/bd2_chars.json','sources/bd2/index/bd2_chars.json'], ['majsoul','majsoul/characters.json','sources/majsoul/index/characters.json']]) {
  const file=path.join(root,fs.existsSync(path.join(root,pub))?pub:src);
  const rows=JSON.parse(fs.readFileSync(file,'utf8')).characters;
  for(const c of rows) {
    if(game==='majsoul') expected.push(game+':'+c.id+':'+(c.composite?'layers':/\.json$/i.test(c.skel)?'json':'binary'));
    else for(const v of c.cutscenes||[])expected.push(game+':'+c.id+':'+String(v.variant??'0'));
  }
}
check(new Set(expected).size===expected.length,'every exact source/variant has a unique identity');
const unavailable=index.unavailable||{},ready=Object.keys(index.items);
for(const key of expected) {
  check(!!index.items[key]!==!!unavailable[key],key+': either a real verified poster or an explicit original-data failure');
  if(unavailable[key])check(typeof unavailable[key].reason==='string'&&unavailable[key].reason.length>0,key+': failure reason retained');
}
check(ready.every(key=>expected.includes(key)),'no orphaned or wrong-resource posters');
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
console.log(JSON.stringify({ok:true,checks,expected:expected.length,ready:ready.length,unavailable:Object.keys(unavailable),scope:'Identity, coverage, dimensions and file integrity; alpha pixels are independently decoded in the release evidence.'}));
