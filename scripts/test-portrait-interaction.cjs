'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const at = process.argv.indexOf('--site');
const root = at < 0 ? path.resolve(__dirname, '..') : path.resolve(process.argv[at + 1]);
const viewer = fs.existsSync(path.join(root, 'nikki/viewer/cutscene.html'))
  ? 'nikki/viewer/cutscene.html' : 'sources/bd2/viewer/cutscene.html';
const html = fs.readFileSync(path.join(root, viewer), 'utf8').replace(/\r\n/g, '\n');
const {Controller} = require(path.join(root, 'common/portrait-audio.js'));
const indexFile = fs.existsSync(path.join(root, 'nikki/audio-logic.json'))
  ? 'nikki/audio-logic.json' : 'data/nikki/index/nikke-audio-logic.json';
const index = JSON.parse(fs.readFileSync(path.join(root, indexFile), 'utf8'));
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
const tap = html.match(/stage\.addEventListener\('pointerup', \(e\) => \{([\s\S]*?)\n  \}\);/);
assert.ok(tap, 'test the real viewer pointerup handler');
let checks = 0;
function scenario(overrides = {}) {
  const called = [];
  const context = {down:{},moved:false,boneDrag:null,boneEditMode:false,partEditMode:false,routeSource:'nikki',
    cut:{skeleton:{}},cur:{},devicePixelRatio:1,
    stage:{releasePointerCapture(){},classList:{remove(){}}},
    cv:{width:100,height:100,getBoundingClientRect:()=>({left:0,top:0})},
    isChrome:()=>false,hitBoneAt:()=>null,
    K:{getSpine(){},hitTestSlot:()=> 'body',toast:message=>called.push(['hint',message])},
    status:message=>called.push(['status',message]),
    showPartPopup:()=>called.push(['parts']),hidePartPopup:()=>called.push(['hide']),
    portraitAudio:{interact:()=>{called.push(['audio']);return false;},interactionHint:()=> '暂无匹配音频'},
    ...overrides};
  vm.createContext(context);
  vm.runInContext('tap = (e) => {' + tap[1] + '\n};',context);
  context.tap({button:0,pointerId:1,clientX:50,clientY:50,target:{}});
  return called;
}
let events = scenario();
assert.ok(!events.some(e=>e[0]==='parts'), 'missing audio must NEVER open the part editor by default'); checks++;
assert.ok(events.some(e=>e[0]==='audio')); checks++;
assert.ok(events.some(e=>e[0]==='hint')); checks++;
events = scenario({partEditMode:true});
assert.ok(events.some(e=>e[0]==='parts')); assert.ok(!events.some(e=>e[0]==='audio')); checks+=2;
events = scenario({routeSource:'bd2'});
assert.ok(events.some(e=>e[0]==='parts')); checks++;
for (const overrides of [{moved:true},{isChrome:()=>true},{down:null},{boneEditMode:true}]) {
  events = scenario(overrides);
  assert.ok(!events.some(e=>['parts','audio'].includes(e[0]))); checks++;
}
events = scenario({portraitAudio:null});
assert.ok(!events.some(e=>e[0]==='parts')); assert.ok(events.some(e=>e[0]==='hint')); checks+=2;
events = scenario({K:{getSpine(){},hitTestSlot:()=>null,toast(){}}});
assert.ok(!events.some(e=>['parts','audio'].includes(e[0]))); checks++;
const state = {id:'c010_00',animation:'idle',animations:['idle','action']};
const controller = Object.create(Controller.prototype);
Object.assign(controller,{index,resourceId:state.id,prefs:{enabled:true,voices:true,effects:true,affinity:'normal'},
  adapter:{snapshot:()=>state}});
assert.equal(controller.interactionHint(),''); checks++;
state.id = 'c989_00';
assert.match(controller.interactionHint(),/暂未匹配/); checks++;
controller.prefs.enabled = false;
assert.match(controller.interactionHint(),/声音已关闭/); checks++;
controller.prefs.enabled = true; controller.index = null;
assert.match(controller.interactionHint(),/加载中/); checks++;
controller.indexError = 'HTTP 404';
assert.match(controller.interactionHint(),/加载失败/); checks++;
controller.index = index; controller.indexError = ''; state.id = 'c010_00';
controller.prefs.voices = false; controller.prefs.effects = false;
assert.match(controller.interactionHint(),/都已关闭/); checks++;
controller.prefs.effects = true;
assert.equal(controller.interactionHint(),'','effects still available with dialogue disabled'); checks++;
controller.index = {...index,resources:{...index.resources,c010_00:{animations:{}}}};
assert.match(controller.interactionHint(),/点击台词已关闭/); checks++;
controller.index = index;
controller.prefs.voices = true;
controller.prefs.affinity = 'love';
assert.equal(controller.interactionHint(),''); checks++;
state.id = 'not-a-lobby';
assert.match(controller.interactionHint(),/暂未匹配/); checks++;
state.id = 'c989_00';
const effectName = Object.keys(index.clips).find(name=>index.clips[name].kind==='animation-sfx');
controller.index = {...index,resources:{...index.resources,c989_00:{animations:{other:[{name:effectName,time:0}]}}}};
assert.match(controller.interactionHint(),/其它动画音效/); checks++;
controller.index.resources.c989_00.animations.action = [{name:effectName,time:0}];
assert.equal(controller.interactionHint(),''); checks++;
controller.prefs.effects = false;
assert.match(controller.interactionHint(),/动画音效已关闭/); checks++;
const mode = html.match(/function setPartEditMode\(enabled\) \{([\s\S]*?)\n  \}\n  btnPartEdit/);
assert.ok(mode, 'test the real explicit mode switch');
const changes = [];
const panelClasses = new Set();
const buttonAttrs = {};
const modeState = {routeSource:'nikki',boneEditMode:false,partEditMode:false,highlightSlot:'body',
  stage:{dataset:{}},btnPartEdit:{classList:{toggle(){}},setAttribute:(k,v)=>{buttonAttrs[k]=v;}},
  floatPanel:{dataset:{},classList:{contains:k=>panelClasses.has(k),remove:k=>panelClasses.delete(k)}},
  btnParts:{classList:{remove(){}}},hidePartPopup:()=>changes.push('hide'),
  portraitAudio:{reset:()=>changes.push('reset'),playbackChanged:()=>changes.push('playback')},
  setFloatPanel:tab=>{modeState.floatPanel.dataset.tab=tab;panelClasses.add('open');},
  K:{toast:()=>changes.push('toast')},btnBoneEdit:{click:()=>{modeState.boneEditMode=false;}}};
vm.createContext(modeState);
vm.runInContext('setMode = (enabled) => {' + mode[1] + '\n};',modeState);
modeState.setMode(true);
assert.equal(modeState.stage.dataset.clickMode,'part-editing'); checks++;
assert.equal(buttonAttrs['aria-pressed'],'true'); checks++;
assert.ok(panelClasses.has('open')); checks++;
assert.ok(changes.includes('reset') && changes.includes('playback')); checks++;
assert.equal(modeState.highlightSlot,null); checks++;
changes.length=0; modeState.setMode(true);
assert.ok(panelClasses.has('open')); assert.ok(!changes.includes('reset')); checks+=2;
modeState.setMode(false);
assert.equal(modeState.stage.dataset.clickMode,'audio'); checks++;
assert.equal(buttonAttrs['aria-pressed'],'false'); checks++;
assert.ok(!panelClasses.has('open')); checks++;
modeState.boneEditMode=true; modeState.setMode(true);
assert.equal(modeState.boneEditMode,false); checks++;
modeState.setMode(false); modeState.routeSource='bd2'; modeState.setMode(true);
assert.equal(modeState.partEditMode,false); checks++;
assert.match(html,/let partEditMode = false/,'each visit must default to audio, not persisted editing'); checks++;
assert.ok(!/store\.(?:get|set)\(['"]partEditMode/.test(html)); checks++;
assert.match(html,/id="btnPartEdit"/); assert.match(html,/id="exitPartEdit"/); checks+=2;
assert.match(html,/active:.*!partEditMode/,'editing must suspend dialogue and scheduled effects'); checks++;
console.log(JSON.stringify({ok:true,viewer,checks,c989:{voices:0,animationEvents:0},
  scenarios:['audio-default','missing-audio-no-parts','explicit-part-edit','bd2-preserved','drag-not-tap',
    'bone-edit-no-audio','chrome-not-tap','module-loading','muted','no-match','index-error']}));
