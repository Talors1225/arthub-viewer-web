import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Live2DController, SpineController } from '../azurlane-interaction/viewer/controller.mjs?v=20261114-interaction-export-loading';
import { motionWithDefaults, configurePortraitMotions } from '../azurlane-interaction/viewer/portrait-motion.mjs?v=20261114-interaction-export-loading';
import { InteractionController } from '../crosscore-interaction/viewer/controller.mjs?v=20261114-interaction-export-loading';
import { FatedGestures } from '../bd2/fated/gestures.mjs?v=20261114-interaction-export-loading';

const base = { id:'test', defaultAnimation:'idle', animations:['idle','main_1','touch_body','touch_idle1'], motionDurations:{idle:5,main_1:2,touch_body:1,touch_idle1:1}, interaction:{configs:[]} };
const create = configs => {
 const plays=[]; const model={...base,interaction:{configs:configs||[]}};
 const controller=new Live2DController(model,{play:(name,loop)=>plays.push({name,loop})},{random:()=>0});
 controller.playIdle();plays.length=0;
 return {controller,plays};
};
{
 const {controller:c,plays}=create();
 c.start([],20,20);c.end(20,20);c.tick(.016);
 assert.equal(c.pointer,null);assert.deepEqual(plays,[],'blank space must not choose a random main animation');
 c.start(['TouchBody'],20,20);c.end(20,20,false,['TouchBody']);c.tick(.016);
 assert.equal(plays[0].name,'touch_body','a real hit still triggers its action');
 c.start(['TouchBody'],20,20);c.end(20,20);assert.equal(plays.length,1,'busy tap must not restart the action');
}
for(const gesture of ['cancel','move-back','end-outside','hold']) {
 const {controller:c,plays}=create();c.start(['TouchBody'],20,20);
 if(gesture==='move-back'){c.move(60,20);c.move(20,20);}
 if(gesture==='hold')c.tick(.6);
 c.end(20,20,gesture==='cancel',gesture==='end-outside'?[]:['TouchBody']);c.tick(.016);
 assert.deepEqual(plays,[],gesture+' must not turn into a tap');
}
{
 const {controller:c,plays}=create();c.start(['TouchBody'],0,0);c.tick(.8);
 c.end(0,0,false,['TouchBody'],.2);
 assert.equal(plays[0]?.name,'touch_body','a short physical tap still works at 4x animation speed');
 const slow=create();slow.controller.start(['TouchBody'],0,0);slow.controller.tick(.2);
 slow.controller.end(0,0,false,['TouchBody'],.8);
 assert.equal(slow.plays.length,0,'slow animation speed must not turn a long press into a tap');
}
{
 const {controller:c,plays}=create([{id:1,draw_able_name:'TouchIdle1',parameter:'p',action_trigger:{type:2,action:'touch_idle1'},action_trigger_active:{idle:0}}]);
 c.start(['TouchIdle1','TouchBody'],0,0);c.end(0,0);
 assert.equal(plays[0]?.name,'touch_body','an unavailable overlapping control must not swallow the usable hinted region');
}
{
 const config={id:1,draw_able_name:'TouchIdle1',parameter:'p',range:[0,1],revert:-1,action_trigger:{type:2,action:'touch_idle1'}};
 const {controller:c,plays}=create([config]);
 c.start(['TouchIdle1'],0,0);c.end(0,0);c.tick(.016);
 assert.equal(plays[0]?.name,'touch_idle1','configured taps respond on the next frame without a 100 ms artificial delay');
 c.reset();plays.length=0;c.start(['TouchIdle1'],0,0);c.end(0,0);c.reset();plays.length=0;c.tick(.2);
 assert.deepEqual(plays,[],'reset cancels any pending click');
}
{
 const plays=[],s=new SpineController({...base,interaction:{spine:{drag_data:{type:3,config_client:['main_1']}}}},{play:name=>plays.push(name)});
 assert.equal(s.touch(undefined),false);assert.deepEqual(plays,[],'Spine sequences require a real hit');
}
{
 const resolvers=[];const c=new Live2DController(base,{play:()=>new Promise(resolve=>resolvers.push(resolve))});
 c.action('touch_body');c.tick(.8);assert.equal(c.state.actionTime,0,'load time must not consume animation time');
 c.reset();resolvers[0]();await Promise.resolve();assert.equal(c.state.motionPending,true,'an old request must not finish the new request');
 resolvers[1]();await Promise.resolve();assert.equal(c.state.motionPending,false);assert.equal(c.state.motion,'idle');
}
{
 const source={Meta:{Duration:2,CurveCount:1,TotalSegmentCount:1,TotalPointCount:2},Curves:[{Target:'Parameter',Id:'Body',Segments:[0,1,0,2,0]}]};
 const json=JSON.stringify(source),motion=motionWithDefaults(source,{Body:0,Clothes:1,Unused:0});
 assert.equal(JSON.stringify(source),json,'never mutate authored motions');
 assert.equal(motion.Curves.filter(c=>c.Id==='Body').length,1,'preserve keyed motion parameters');
 assert.deepEqual(motion.Curves.find(c=>c.Id==='Clothes').Segments,[0,1,0,2,1]);
 assert.equal(motion.Meta.TotalSegmentCount,3);assert.equal(motion.Meta.TotalPointCount,6);
 let stopped=false,queued=false;
 const manager={createMotion:data=>data,queueManager:{stopAllMotions(){stopped=true;},startMotion(){queued=true;}}};
 configurePortraitMotions(manager,{animator:{states:{idle:{motion:'idle',writeDefaults:true}}}},{ids:['Clothes'],defaultValues:[1]});
 assert.equal(manager.createMotion(source,'idle').Curves.length,2);
 assert.equal(manager.createMotion(source,'custom'),source,'states without Write Defaults remain unchanged');
 manager._startMotion({setFinishedMotionHandler(){}});
 assert.ok(queued&&!stopped,'preserve the outgoing animation for its fade');
 const clip={setFinishedMotionHandler(){}},other={};let retired=0;
 manager.queueManager._motions=[{_motion:clip,setIsFinished:()=>retired++},{_motion:other,setIsFinished:()=>assert.fail('unrelated fade must continue')}];
 manager._startMotion(clip);assert.equal(retired,1,'a cached motion must not update twice on replay');
}
{
 const source={Meta:{Duration:2},Curves:[{Target:'Parameter',Id:'Cloud',Segments:[0,0,0,2,1]}]};
 const manager={createMotion:data=>data};
 configurePortraitMotions(manager,{animator:{layers:[{states:['idle']},{states:['effect','effect_hx','effect_shop_hx']}],states:{idle:{motion:'idle',writeDefaults:true},effect:{motion:'effect',writeDefaults:true},effect_hx:{motion:'effect_hx',writeDefaults:true},effect_shop_hx:{motion:'effect_shop_hx',writeDefaults:true}}}},{ids:['Body','Cloud'],defaultValues:[0,0]});
 for(const name of ['effect','effect_hx','effect_shop_hx'])assert.equal(manager.createMotion(source,name),source,'overlay must not add character reset curves: '+name);
 assert.ok(manager.createMotion(source,'idle').Curves.some(c=>c.Id==='Body'),'base layer still restores its unkeyed parameters');
}
{
 const events=[],c=new InteractionController({idle:'idle',actions:[{index:1,sName:'drag',sType:6,gesture:1,areas:[[0,0,10,10,0]],content:{drag:{slots:['hand']}}}]},e=>events.push(e));
 assert.equal(c.hit(100,100),null);assert.equal(c.hit(0,0)?.index,1);
 assert.equal(c.beginDrag(1,0),true);c.endDrag(true);
 assert.equal(events.at(-1).cancelled,true);assert.equal(c.dragging,null,'cancelled gestures must unlock input');
}
globalThis.window={spine:{GLTexture:{}}};
const {SpineScene}=await import('../crosscore-interaction/viewer/scene.mjs?v=20261114-interaction-export-loading');
{
 const scene=Object.create(SpineScene.prototype);
 Object.assign(scene,{definition:{nodes:[{path:'pos/goal',x:0,y:0}]},objectDrag:{drag:{targetPosObjNames:['goal_success'],slots:['hand']},node:{x:0,y:0},path:'pos/item',dx:0,dy:0},nodeVisibility:new Map(),hiddenSlots:new Set(['hand'])});
 assert.equal(scene.endObjectDrag(true),null,'pinch/cancel must not commit a drop action even over its target');
 assert.equal(scene.hiddenSlots.size,0);assert.equal(scene.objectDrag,null);
}
{
 const calls=[],f=Object.create(FatedGestures.prototype);
 Object.defineProperty(f,'group',{value:{idle:'idle'}});
 Object.assign(f,{animations:new Set(['idle','new']),reaction:{track:0,entry:{}},reveals:new Map(),record(){},state:{setAnimation:(...args)=>{calls.push(args);return{};},getCurrent:()=>null}});
 f.play({},[],0,false,'preview',['new']);
 assert.deepEqual(calls,[[0,'new',false]],'replacing a base-track preview must not insert an idle pose in between');
}
{
 const html=readFileSync(new URL('../crosscore-interaction/viewer/index.html',import.meta.url),'utf8');
 const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(match=>match[1].includes('let failed = false'))?.[1];
 assert.ok(script,'startup error handler is present');
 const events={},loading={hidden:true,textContent:''},window={addEventListener:(name,fn)=>events[name]=fn};
 vm.runInNewContext(script,{window,document:{getElementById:()=>loading},console:{error(){}},location:new URL('https://viewer.test/crosscore-interaction/viewer/index.html'),URL});
 for(const target of [{tagName:'IMG',src:'/thumbnail.png'},{tagName:'AUDIO',src:'/voice.ogg'},{tagName:'SCRIPT',src:'https://analytics.test/script.js'}]){
  events.error({target});assert.equal(loading.hidden,true,'optional resources must not mark the viewer failed');
 }
 events.error({target:{tagName:'SCRIPT',src:'/app.mjs'}});
 assert.equal(loading.hidden,false,'critical viewer scripts must still report a startup failure');
 assert.match(loading.textContent,/app\.mjs/);
}
console.log('Interaction input, cancellation, timing and transition checks passed');
