/* Restored from installed ship_l2d / SpinePaintingConst and the matching
 * Live2dDrag / Live2DPainting Lua control flow. Game data is never executed.
 * The renderer supplies deformed-mesh hits, model parameters and audio output. */
export const array = value => Array.isArray(value) ? value : [];
export const choose = (value, random = Math.random) => Array.isArray(value) ? value[Math.floor(random() * value.length)] : value;
const has = (list, value) => array(list).includes(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const sameRange = (v,r,lowerOpen=false) => Array.isArray(r) && (lowerOpen ? v>r[0] : v>=r[0]) && (lowerOpen ? v<=r[1] : v<r[1]);
export const basicActions = {TouchHead:'touch_head',TouchBody:'touch_body',TouchSpecial:'touch_special'};
export function motionCue(name) {
 name=name.replace(/_ex$/,'');
 return ({touch_head:'touch_head',touch_body:'touch_1',touch_special:'touch_2',mission:'task',complete:'expedition',wedding:'propose'})[name] || name;
}
export function voiceClip(model,cue,favor=0,exact=false){
 const active=array(model.voice?.activeClips);
 if(exact)return active.find(c=>c.name===cue)||array(model.voice?.clips).find(c=>c.name===cue);
 const candidates=active.filter(c=>c.cue===cue&&(c.threshold??0)<=favor).sort((a,b)=>(b.threshold??0)-(a.threshold??0));
 return candidates[0]||active.find(c=>c.name===cue)||array(model.voice?.clips).find(c=>c.name===cue);
}
export function clampValue(value,config) {
 if (config.drag_direct===1 && value<0 || config.drag_direct===2 && value>0) value=0;
 if (config.range_abs===1) value=Math.abs(value);
 const range=Array.isArray(config.range)?config.range:[0,1];
 return Math.max(range[0],Math.min(range[1],value));
}
export function condition(config,idle) {
 const c=object(config.react_condition);
 return (!array(c.idle_on).length || has(c.idle_on,idle)) && !has(c.idle_off,idle);
}
export function triangleContains(x,y,vertices,indices) {
 for(let i=0;i+2<indices.length;i+=3) {
  const a=indices[i]*2,b=indices[i+1]*2,c=indices[i+2]*2;
  const cross=(ax,ay,bx,by)=>(x-bx)*(ay-by)-(ax-bx)*(y-by);
  const p=cross(vertices[a],vertices[a+1],vertices[b],vertices[b+1]);
  const q=cross(vertices[b],vertices[b+1],vertices[c],vertices[c+1]);
  const r=cross(vertices[c],vertices[c+1],vertices[a],vertices[a+1]);
  const area=(vertices[b]-vertices[a])*(vertices[c+1]-vertices[a+1])-(vertices[b+1]-vertices[a+1])*(vertices[c]-vertices[a]);
  if(Math.abs(area)>1e-10 && !((p<0||q<0||r<0)&&(p>0||q>0||r>0))) return true;
 }
 return false;
}
export function polygonContains(x,y,vertices) {
 let inside=false;
 for(let i=0,j=vertices.length-1;i<vertices.length;j=i++) {
  const a=vertices[i],b=vertices[j];
  if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
 }
 return inside;
}
export function fitSceneBounds(rects) {
 const valid=rects.filter(r=>r.bounds.length===4&&r.bounds.every(Number.isFinite)&&r.bounds[2]>r.bounds[0]&&r.bounds[3]>r.bounds[1]);
 if(!valid.length)return {bounds:{x:0,y:0,width:2000,height:2000},excluded:[]};
 const anchor=valid.reduce((a,b)=>(a.bounds[2]-a.bounds[0])*(a.bounds[3]-a.bounds[1])>(b.bounds[2]-b.bounds[0])*(b.bounds[3]-b.bounds[1])?a:b).bounds;
 const span=Math.max(anchor[2]-anchor[0],anchor[3]-anchor[1]),excluded=[];
 const near=valid.filter(r=>{const b=r.bounds,gap=Math.max(anchor[0]-b[2],b[0]-anchor[2],anchor[1]-b[3],b[1]-anchor[3],0);if(gap>span*16){excluded.push(r.name);return false;}return true;});
 const minX=Math.min(...near.map(r=>r.bounds[0])),minY=Math.min(...near.map(r=>r.bounds[1])),maxX=Math.max(...near.map(r=>r.bounds[2])),maxY=Math.max(...near.map(r=>r.bounds[3]));
 return {bounds:{x:(minX+maxX)/2,y:(minY+maxY)/2,width:maxX-minX,height:maxY-minY},excluded};
}
class Controller {
 constructor(model,adapter={},options={}) {
  this.model=model;this.adapter=adapter;this.random=options.random||Math.random;this.storage=options.storage;
  this.time=0;this.disposed=false;this.generation=0;this.trace=[];this.lastActivity=0;
  this.state={idleIndex:0,idle:model.defaultAnimation||'idle',action:null,busy:false,actionTime:0,normalizedTime:0,skin:'',fold:false,interactions:0,favor:options.favor??1200,errors:[],missingActions:[]};
  try {this.saved=JSON.parse(this.storage?.getItem(this.key)||'{}');}catch{this.saved={};}
 }
 get key(){return 'arthub.azurlane.gameplay.v2.'+this.model.id;}
 log(type,data={}){this.trace.push({time:+this.time.toFixed(3),type,...data});if(this.trace.length>100)this.trace.shift();this.adapter.trace?.(type,data);}
 save(data){if(this.disposed)return;try{this.storage?.setItem(this.key,JSON.stringify(data));}catch{} }
 sound(bank,cue,options={}){this.adapter.sound?.(bank,cue,options);this.log('sound',{bank,cue});}
 dispose(){this.disposed=true;this.generation++;this.adapter.stopAudio?.();}
}
export class Live2DController extends Controller {
 constructor(model,adapter={},options={}) {
  super(model,adapter,options);this.states=array(model.interaction?.configs).map(config=>({config,value:config.start_value||0,target:config.start_value||0,start:config.start_value||0,from:config.start_value||0,smoothAt:0,axisX:config.start_value||0,axisY:config.start_value||0,active:false,step:1,cooldown:0,flag:false,dwell:0,releaseAt:null,animationFlag:false,moveStep:0}));
  this.pointer=null;this.enable=[];this.ignore=[];this.events=[];this.boardResult=null;this.boardJobs=[];this.noticeDepth=0;this.relationValues=new Map();this.restore();
 }
 restore(){
  this.state.idleIndex=Number.isInteger(this.saved.idleIndex)?this.saved.idleIndex:0;
  this.enable=array(this.saved.enable);this.ignore=array(this.saved.ignore);
  for(const s of this.states){const v=this.saved.parameters?.[s.config.id];if(s.config.revert===-1&&s.config.save_parameter!==-1&&Number.isFinite(v)){s.value=s.target=s.from=clampValue(v,s.config);s.axisX=s.axisY=s.value;}if(s.config.action_trigger?.type===6&&this.saved.steps?.[s.config.id])s.step=this.saved.steps[s.config.id];}
  this.state.idle=this.idleName();
  for(const s of this.states)for(const r of array(s.config.relation_parameter?.list))if(r.type===104&&r.idle===this.state.idleIndex&&Number.isFinite(r.target))this.relationValues.set(r.name,{id:r.name,value:r.target,mode:r.mode||s.config.mode||1,configId:s.config.id});
 }
 saveState(){const parameters={},steps={};for(const s of this.states){if(s.config.revert===-1&&s.config.save_parameter!==-1)parameters[s.config.id]=s.target;if(s.config.action_trigger?.type===6)steps[s.config.id]=s.step;}this.save({idleIndex:this.state.idleIndex,enable:this.enable,ignore:this.ignore,parameters,steps});}
 reset(){this.uiSound=null;this.saved={};for(const s of this.states){Object.assign(s,{value:s.config.start_value||0,target:s.config.start_value||0,from:s.config.start_value||0,axisX:s.config.start_value||0,axisY:s.config.start_value||0,active:false,step:1,cooldown:0,flag:false,releaseAt:null});delete s.clickAt;delete s.pendingTarget;delete s.relationGeneration;delete s.relationAt;}this.relationValues.clear();this.enable=[];this.ignore=[];this.setIdle(0);this.generation++;this.state.busy=false;this.pointer=null;this.boardResult=null;this.boardJobs=[];this.restore();this.saveState();this.playIdle();this.log('reset');}
 idleName(){const index=this.state.idleIndex;const state=index===0?'idle':'idle'+index;return this.resolve(state)?state:this.model.defaultAnimation||'idle';}
 resolve(name){
  const mapped=this.model.animator?.states?.[name]?.motion;
  if(mapped && this.model.animations.includes(mapped))return mapped;
  if(this.model.animations.includes(name))return name;
  // Unity commonly names state idle1 while its underlying clip is idle.
  if(name==='idle1'&&this.model.animations.includes('idle')&&!this.model.animations.includes('idle1'))return 'idle';
  return null;
 }
 allowedAction(name){
  if(this.ignore.includes(name))return false;
  if(this.enable.length&&!this.enable.includes(name))return false;
  for(const s of this.states){const t=object(s.config.action_trigger);if(t.type!==12)continue;const val=this.dragValue(t.parameter);if(!sameRange(val,t.num,true))continue;const a=object(s.config.action_trigger_active);if(has(a.ignore,name))return false;if(array(a.enable).length&&!has(a.enable,name))return false;}
  return true;
 }
 setIdle(index){
  if(!Number.isInteger(index)||index<0)return;const changed=this.state.idleIndex!==index;this.state.idleIndex=index;this.state.idle=this.idleName();
  if(changed){for(const s of this.states){const cfg=s.config;if(cfg.revert_idle_index===1||cfg.revert_idle_index===true||has(cfg.revert_idle_index,index)){this.target(s,cfg.start_value||0,true);s.axisX=s.axisY=s.target;}if(cfg.revert_action_index===1)s.step=1;if(has(cfg.action_trigger?.reset_index_action,this.state.action))s.step=1;}this.notify(3,{idle:index,idle_change:true});this.log('idle',{index,motion:this.state.idle});this.adapter.idle?.(index);}
 }
 activeData(data={},source){
  const a=object(data);let idle=choose(Array.isArray(a.idle)?a.idle.filter(i=>a.repeatFlag||a.repeat_flag||i!==this.state.idleIndex):a.idle,this.random);
  if(Number.isInteger(idle))this.setIdle(idle);
  if(Array.isArray(a.enable)||a.enable&&typeof a.enable==='object')this.enable=array(a.enable);
  else {const m=array(a.idle_enable).find(v=>v[0]===this.state.idleIndex);if(m)this.enable=array(m[1]);}
  if(Array.isArray(a.ignore)||a.ignore&&typeof a.ignore==='object')this.ignore=array(a.ignore);
  else {const m=array(a.idle_ignore).find(v=>v[0]===this.state.idleIndex);if(m)this.ignore=array(m[1]);}
  if(a.fold!==undefined){this.state.fold=a.fold===1;this.adapter.fold?.(this.state.fold);}
  this.saveState();
 }
 target(s,value,immediate=false){if(!Number.isFinite(value))return;s.from=s.value;s.target=clampValue(value,s.config);s.smoothAt=this.time;if(immediate)s.value=s.target;s.releaseAt=null;}
 dragValue(name){return this.states.find(s=>s.config.parameter===name)?.value??0;}
 parameter(name){return this.adapter.parameter?.(name)??this.dragValue(name);}
 noticeFor(s,type){this.notify(type,{draw_able_name:s.config.draw_able_name,parameter_name:s.config.parameter,values:s.value});}
 notify(type,data){
  if(this.noticeDepth++>16){this.noticeDepth--;this.log('listener-cycle');return;}
  try{for(const s of this.states){const t=object(s.config.action_trigger),listener=object(s.config.listener_data);if(type===1)s.cooldown=Math.min(this.limit(s),.2)+this.time;if(type===2&&has(t.click_cd,data.draw_able_name))s.cooldown=this.time+this.limit(s);
   if(listener.type!==type)continue;const key=type===1?data.action:type===2?data.draw_able_name:type===3?data.idle:undefined;let changed=false;
   for(const change of array(listener.change)){if(!has(change[1],key))continue;const value=change[0]===1?s.target+change[2]:change[2];if(t.change_focus===false&&this.state.busy)s.pendingTarget=value;else this.target(s,value);if(change[3]>0)s.step=change[3];changed=true;}
   if(changed){s.listenerTrigger=true;const apply=array(listener.apply);if(apply[0]===1){const fit=array(apply[1]).find(r=>sameRange(s.pendingTarget??s.target,r));if(fit)this.activeData({...object(s.config.action_trigger_active),idle:fit[2]},s);}}
  }}finally{this.noticeDepth--;}
 }
 limit(s){return s.config.limit_time>0?s.config.limit_time:4;}
 start(hits,x,y,world={x:0,y:0}) {
  if(this.disposed)return;this.lastActivity=this.time;this.pointer={x,y,startX:x,startY:y,down:this.time,hits:array(hits),world,used:false};
  for(const s of this.states){const c=s.config;if(!has(hits,c.draw_able_name)||!condition(c,this.state.idleIndex)||c.ignore_action===1&&this.state.busy)continue;s.active=true;s.down=this.time;s.dwell=0;s.triggeredHold=false;s.released=false;s.firstRelease=false;s.originX=s.axisX;s.originY=s.axisY;s.circleStart=s.target;s.animationFlag=false;if(c.action_trigger?.type===3)s.step=1;}
  for(const s of this.states){const t=object(s.config.action_trigger);if(s.active&&t.down&&[2,6,9,11].includes(t.type)){if(t.type===9&&Math.abs(this.parameter(t.parameter)-t.num)>.05)continue;if(t.type===11&&!sameRange(this.parameter(t.parameter),t.num))continue;if(this.fire(s))this.noticeFor(s,2);}}
  this.notify(5,{draw_able_name:hits[0],down:true});
 }
 move(x,y,world={x:0,y:0}){
  if(!this.pointer)return;this.pointer.x=x;this.pointer.y=y;this.pointer.world=world;
  for(const s of this.states){if(!s.active)continue;const c=s.config,dx=x-this.pointer.startX,dy=-(y-this.pointer.startY);s.offsetX=(s.originX||0)+(c.offset_x?dx/c.offset_x:0);s.offsetY=(s.originY||0)+(c.offset_y?dy/c.offset_y:0);
   if(c.offset_circle&&typeof c.offset_circle==='object'){const pos=array(c.offset_circle.pos),angle=((Math.atan2(world.x-(pos[0]||0),world.y-(pos[1]||0))*180/Math.PI+(c.offset_circle.start||0))%360+360)%360;this.target(s,angle/360*(array(c.range)[1]||1));}
   else if(c.offset_y)this.target(s,s.offsetY);else if(c.offset_x)this.target(s,s.offsetX);
  }
 }
 end(x,y,cancel=false){
  if(!this.pointer)return;const p=this.pointer;const click=!cancel&&Math.abs(x-p.startX)<30&&Math.abs(y-p.startY)<30&&this.time-p.down<.5;let consumed=false;
  for(const s of this.states){if(!s.active)continue;s.active=false;s.released=true;s.firstRelease=!cancel;s.axisX=s.offsetX??s.target;s.axisY=s.offsetY??s.target;
   const c=s.config,t=object(c.action_trigger);if(!cancel&&click&&[2,6,9,11,15].includes(t.type)){if(!t.down)s.clickAt=this.time+.1;consumed=true;}
   if(!cancel&&t.type===3&&t.last&&s.step!==1){s.step=array(t.action_list).length;this.fire(s);consumed=true;}
   if(!cancel&&t.type===14&&t.active===0&&sameRange(this.parameter(t.parameter||c.parameter),t.range,true)){this.fire(s);consumed=true;}
   const part=object(c.parts_data),values=array(part.parts||part.list||part.parts_value);
   if(values.length){const candidates=part.type===2?values.filter(v=>v<=s.target):part.type===3?values.filter(v=>v>=s.target):values;const v=(candidates.length?candidates:values).reduce((a,b)=>Math.abs(a-s.target)<Math.abs(b-s.target)?a:b);this.target(s,v);}
   if(c.revert>=0)s.releaseAt=this.time+c.revert/1000;
  }
  if(click&&!consumed){const area=p.hits.find(h=>basicActions[h]);if(area)consumed=this.action(basicActions[area],{interactive:true});else if(!p.hits.length)this.mainTouch();}
  this.pointer=null;this.notify(5,{down:false});this.saveState();return consumed;
 }
 mainTouch(){if(this.state.busy)return;const choices=this.model.animations.filter(n=>/^main_\d+$/.test(n)&&this.allowedAction(n));if(choices.length)this.action(choose(choices,this.random),{interactive:true});}
 fire(s){
  const c=s.config,t=object(c.action_trigger);if(s.flag||s.cooldown>this.time||!condition(c,this.state.idleIndex))return false;
  const step=s.step,entry=array(t.action_list)[step-1]||t;const action=choose(entry.action??t.action,this.random);const activeList=array(c.action_trigger_active?.active_list),active=activeList[step-1]||object(c.action_trigger_active);
  const focus=(entry.focus??t.focus)===1;if(this.state.busy&&!focus)return false;
  if(action&&!this.allowedAction(action))return false;
  if(typeof active.idle==='number'&&active.idle===this.state.idleIndex&&!active.repeat_flag&&!active.repeatFlag)return false;
  const target=entry.target??t.target;if(Number.isFinite(target))this.target(s,t.circle!==undefined&&target===s.target?s.start:target,(entry.target_focus??t.target_focus)===1);
  const oldIdle=this.state.idleIndex,playsAction=typeof action==='string'&&action.length>0;
  s.flag=playsAction&&!focus;s.cooldown=Array.isArray(t.action_list)&&!playsAction?this.time:this.time+this.limit(s);s.dwell=0;
  if(Array.isArray(t.action_list))s.step=step>=t.action_list.length?1:step+1;
  if(action==='idle'){s.flag=false;this.activeData(active,s);this.playIdle();}
  else if(action){if(!this.action(action,{interactive:true,focus,force:true,source:s})){s.flag=false;return false;}}
  else s.flag=false;
  if(action!=='idle')this.activeData(active,s);
  if(!playsAction&&oldIdle!==this.state.idleIndex&&!this.state.busy)this.playIdle();
  this.state.interactions++;this.log('trigger',{id:c.id,triggerType:t.type,area:c.draw_able_name,action,step,idleIndex:this.state.idleIndex});this.saveState();return true;
 }
 playIdle(){return this.action(this.idleName(),{idle:true,force:true,voice:false});}
 action(name,options={}) {
  if(this.disposed||!name)return false;
  if(options.interactive&&!options.force&&!options.source&&this.state.favor>=1000&&/^(touch_head|touch_body|touch_special|main_\d+|home|login|mail|mission|mission_complete|complete)$/.test(name)&&this.resolve(name+'_ex'))name+='_ex';
  if(!options.force&&!this.allowedAction(name))return false;if(this.state.busy&&!options.focus&&!options.force&&!options.idle)return false;
  const motion=this.resolve(name);
  if(!motion){if(!this.state.missingActions.includes(name))this.state.missingActions.push(name);this.log('missing-action',{name});return false;}
  const generation=++this.generation;Object.assign(this.state,{action:name,motion,busy:!options.idle,actionTime:0,normalizedTime:0,motionPending:false});
  this.state.interactions+=options.interactive&&!options.source?1:0;this.events=array(this.model.motionEvents?.[motion]).map(e=>({...e,fired:false}));
  this.duration=this.model.motionDurations?.[motion]||1;this.finishTime=this.events.find(e=>e.functionName==='OnFinishAnim')?.time??this.duration;
  this.pendingCue=options.voice===false||options.idle?null:motionCue(name);this.pendingVoicePlayed=false;
  this.actionOptions=options;if(!options.idle)this.notify(1,{action:name});this.lastActivity=this.time;
  const calibrate=object(this.model.skinConfig?.l2d_voice_calibrate),dialog=({touch_1:'touch',touch_2:'touch2',touch_head:'headtouch',task:'mission'})[this.pendingCue]||this.pendingCue;
  this.voiceAt=calibrate.use_event?null:(Number(calibrate[dialog])||0);
  const started=()=>{if(generation!==this.generation||this.disposed)return;this.state.motionPending=false;this.state.actionTime=0;if(this.pendingCue&&this.voiceAt===0)this.voiceCue();this.runEvents(0);};
  try{const result=this.adapter.play?.(motion,!!options.idle,{generation,fade:.25,state:name});if(result&&typeof result.then==='function'){this.state.motionPending=true;Promise.resolve(result).then(started,error=>{if(generation!==this.generation||this.disposed)return;this.state.errors.push(error.message||String(error));this.state.motionPending=false;this.state.busy=false;this.log('play-error',{motion,error:String(error)});});}else started();}catch(error){this.state.motionPending=false;this.state.busy=false;this.state.errors.push(String(error));}
  this.log('action',{name,motion,idle:!!options.idle});return true;
 }
 voiceCue(){if(this.pendingVoicePlayed||!this.pendingCue)return;this.pendingVoicePlayed=true;const dialog=({touch_1:'touch',touch_2:'touch2',touch_head:'headtouch',task:'mission'})[this.pendingCue]||this.pendingCue,se=this.model.skinConfig?.l2d_se?.[dialog];this.uiSound=Array.isArray(se)&&se[0]?{cue:se[0],at:this.time+(Number(se[1])||0)}:null;this.sound(this.model.voiceBank,this.pendingCue,{voice:true,calibrate:true,action:this.state.action});}
 event(e){
  if(e.functionName==='OnAnimEvent')this.voiceCue();
  if(e.data){for(const token of String(e.data).split(/[;|]/)){const [kind,id,volume]=token.split('_');if(!id)continue;
   if(kind==='vocal')this.sound(this.model.voiceBank,'vocal_'+id+'_'+this.model.voiceVariant,{voice:true});
   else if(kind==='button'||kind==='interaction')this.sound(kind==='button'?'se-skinbutton':'se-skininteractive',this.model.skinId+'_'+id,{voice:false});
   else if(kind==='bgm'||kind==='bgmsingle')this.sound('se-skin','skin-'+this.model.shipGroup+'_'+id,{loop:kind==='bgm',volume:volume?Number(volume)/100:1,channel:'bgm'});
   else if(kind==='bgmvolume')this.adapter.volume?.(Number(id)/100);
  }}
 }
 runEvents(time){for(const e of this.events){if(!e.fired&&e.time<=time+1e-6){e.fired=true;this.event(e);}}}
 tick(dt){
  if(this.disposed)return;this.time+=dt;if(!this.state.motionPending){this.state.actionTime+=dt;this.state.normalizedTime=this.state.actionTime/Math.max(.001,this.duration||1);this.runEvents(this.state.actionTime);if(this.voiceAt!==null&&this.state.actionTime>=this.voiceAt)this.voiceCue();}
  if(this.uiSound&&this.time>=this.uiSound.at){this.sound('se-ui','ui-'+this.uiSound.cue,{voice:false});this.uiSound=null;}
  if(this.state.busy&&this.state.actionTime>=Math.max(.01,this.finishTime??this.duration??1)){
   const prev=this.state.action;this.state.busy=false;for(const s of this.states){s.flag=false;if(s.pendingTarget!==undefined){this.target(s,s.pendingTarget);delete s.pendingTarget;}}
   this.adapter.finish?.(prev);this.playIdle();
  } else if(!this.state.busy&&this.state.actionTime>=this.duration){this.state.actionTime%=Math.max(.001,this.duration);this.events.forEach(e=>e.fired=false);this.runEvents(this.state.actionTime);}
  for(const s of this.states){
   const c=s.config,t=object(c.action_trigger);if(!condition(c,this.state.idleIndex))continue;
   for(const r of array(c.relation_parameter?.list)){if(r.type!==104)continue;const key=r.name+':'+r.idle;
    s.relationAt||={};s.relationGeneration||={};
    if(this.state.busy&&!this.state.motionPending&&this.state.action===t.action&&this.state.idleIndex===r.idle){if(s.relationGeneration[key]!==this.generation){s.relationGeneration[key]=this.generation;s.relationAt[key]=this.time+(r.time||0);}if(this.time>=s.relationAt[key]&&Number.isFinite(r.target))this.relationValues.set(r.name,{id:r.name,value:r.target,mode:r.mode||c.mode||1,configId:c.id});}
   }
   if(s.releaseAt!==null&&this.time>=s.releaseAt){this.target(s,s.start);s.releaseAt=null;s.reverting=true;s.flag=false;}
   if(c.gyro===1){const g=this.adapter.gyro?.()||{x:0,y:0,z:0};const val=(g.x*(c.gyro_x||0)+g.y*(c.gyro_y||0)+g.z*(c.gyro_z||0));this.target(s,s.start+val);}
   const smooth=(s.reverting?c.revert_smooth:c.smooth)/1000||0;
   let delta=s.target-s.from;if(c.offset_circle&&typeof c.offset_circle==='object'){const span=(array(c.range)[1]||1)-(array(c.range)[0]||0);if(Math.abs(delta)>span/2)delta-=Math.sign(delta)*span;}
   s.value=smooth>0?s.from+delta*Math.min(1,(this.time-s.smoothAt)/smooth):s.target;
   if(Math.abs(s.value-s.target)<.05){s.value=s.target;s.reverting=false;}
   if(t.type===5&&!this.state.busy){const fit=array(t.const_fit).find(f=>f.idle===this.state.idleIndex);if(fit&&fit.target!==s.target)this.target(s,fit.target);}
   const entry=array(t.action_list)[s.step-1]||t,num=entry.num??t.num,time=entry.time??t.time??0;
   const can=!s.flag&&s.cooldown<=this.time&&(!this.state.busy||t.focus===1||entry.focus===1);
   if(s.clickAt!==undefined&&this.time>=s.clickAt){delete s.clickAt;if(can){if(t.type===15)this.boardClick(s);else if(t.type===9?Math.abs(this.parameter(t.parameter)-num)<=.05:t.type===11?sameRange(this.parameter(t.parameter),t.num):true){if(this.fire(s))this.noticeFor(s,2);}}}
   if(t.type===1&&can){if(Math.abs(s.value-num)<=Math.abs(num)*.25)s.dwell+=dt;if(s.dwell>time)this.fire(s);}
   else if(t.type===3&&s.active&&can&&this.time-s.down>time){if(this.fire(s)){s.down=this.time;this.noticeFor(s,5);}}
   else if(t.type===4&&s.active&&can){if(Math.abs((s.offsetX||0)-num?.[0])<=Math.abs(num?.[0]||0)*.25&&Math.abs((s.offsetY||0)-num?.[1])<=Math.abs(num?.[1]||0)*.25)s.dwell+=dt;if(s.dwell>time){if(this.fire(s))this.noticeFor(s,6);}}
   else if(t.type===7&&s.listenerTrigger&&can){s.listenerTrigger=false;this.fire(s);}
   else if(t.type===8&&s.active)this.target(s,s.target+dt/(t.delta||1));
   else if(t.type===10){const state=(t.trigger_name==='idle'&&t.trigger_index>0)?'idle'+t.trigger_index:t.trigger_name;const match=(this.state.action===state||this.state.motion===this.resolve(state))&&this.state.idleIndex===t.trigger_index;let range=true;if(Array.isArray(t.parameter_range))range=sameRange(this.parameter(t.parameter_range[0]),t.parameter_range[1]);if(match&&range&&this.state.normalizedTime>=t.trigger_rate&&!s.animationFlag&&can){s.animationFlag=true;this.fire(s);s.flag=false;}if(!match)s.animationFlag=false;}
   else if(t.type===13&&!this.state.busy){s.moveStep++;if(s.moveStep>=10){s.moveStep=0;const now=this.parameter(t.parameter);if(s.lastMove!==undefined)this.target(s,s.target+Math.abs(now-s.lastMove)*(t.rate||0));s.lastMove=now;}if(can&&Number.isFinite(num)&&Math.abs(s.value-num)<=Math.abs(num)*.1)this.fire(s);}
   else if(t.type===14&&t.active===1&&s.active&&!s.moveUp&&sameRange(s.value,t.range,true)&&can){s.moveUp=true;this.fire(s);}else if(t.type===14&&!s.active)s.moveUp=false;
   if(t.type===16&&this.boardResult!==null&&((t.win===1)===this.boardResult)&&can){if(this.fire(s))this.boardResult=null;}
  }
  const due=this.boardJobs.filter(j=>j.at<=this.time);this.boardJobs=this.boardJobs.filter(j=>j.at>this.time);for(const job of due)job.fn();
 }
 boardClick(s){
  const cells=this.states.filter(v=>v.config.action_trigger?.type===15);if(cells.length!==9||Math.abs(s.value)>.1)return;
  const mine=cells.filter(c=>c.target>0).length,enemy=cells.filter(c=>c.target<0).length;if(mine>enemy||this.boardResult!==null)return;
  this.target(s,1,true);this.state.interactions++;this.log('board-move',{id:s.config.id,value:1});
  const result=()=>{const winlines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];for(const side of [1,-1])if(winlines.some(line=>line.every(i=>cells[i].target===side)))return side===1;if(cells.every(c=>c.target!==0))return true;return null;};
  let ended=result();if(ended!==null){this.boardJobs.push({at:this.time+.5,fn:()=>{this.boardResult=ended;}});return;}
  this.boardJobs.push({at:this.time+.2,fn:()=>{const empty=cells.filter(c=>!c.target);const ai=choose(empty,this.random);if(ai)this.target(ai,-1,true);const out=result();if(out!==null)this.boardJobs.push({at:this.time+.5,fn:()=>{this.boardResult=out;}});}});
 }
 parameters(){const out=[];for(const s of this.states){if(!condition(s.config,this.state.idleIndex))continue;const t=object(s.config.action_trigger);if(has(t.remove_com_list,this.state.action))continue;const look=this.adapter.look?.()||{x:0,y:0};let value=s.value;if(s.config.react_pos_x)value+=look.x*s.config.react_pos_x;if(s.config.react_pos_y)value+=look.y*s.config.react_pos_y;if(s.config.parameter)out.push({id:s.config.parameter,value,mode:s.config.mode||1,configId:s.config.id});
   for(const r of array(s.config.relation_parameter?.list)){let v=r.type===101?s.offsetX??s.axisX:r.type===102?s.offsetY??s.axisY:r.type===103?array(r.relation_value)[s.step-1]:undefined;if(Number.isFinite(v))out.push({id:r.name,value:clampValue(v,{...s.config,...r,range_abs:r.rangeAbs??r.range_abs??s.config.range_abs,range:r.range||s.config.range}),mode:r.mode||s.config.mode||1,configId:s.config.id});}
  }out.push(...this.relationValues.values());return out;}
}
export class SpineController extends Controller {
 constructor(model,adapter={},options={}){
  super(model,adapter,options);this.rules=object(model.interaction?.spine);this.queue=[];this.state.idle=this.saved.idle||this.rules.hx_idle&&model.id.endsWith('_hx')&&this.rules.hx_idle||this.model.defaultAnimation||'normal';this.state.skin=this.saved.skin||'';this.current=null;this.dragPass=true;
  if(this.state.skin)this.adapter.skin?.(this.state.skin);
 }
 reset(){this.state.idle=this.model.defaultAnimation||'normal';this.state.skin='';this.state.busy=false;this.current=null;this.queue=[];this.adapter.skin?.('');this.adapter.fold?.(false);this.saveState();this.playIdle();}
 saveState(){this.save({idle:this.state.idle,skin:this.state.skin});}
 matches(c,hit,drag){
  if(c.hit&&c.hit!==hit)return false;if(c.skin&&c.skin!==this.state.skin)return false;
  if(typeof c.idle==='string'&&c.idle!==this.state.idle||Array.isArray(c.idle)&&!c.idle.includes(this.state.idle))return false;
  if(c.favor>=0&&this.state.favor<c.favor)return false;
  // MainSpinePainting passes true for a drag exceeding 200 px, false on release.
  // Lua only evaluates the restriction for a truthy click field.
  if(c.click===true&&drag===true)return false;return true;
 }
 touch(hit,{drag:isDrag=false}={}){
  if(this.state.busy||!this.dragPass)return false;this.lastActivity=this.time;const drag=this.rules.drag_data;
  if(!drag)return false;
  if(drag.type===3){this.queue=array(drag.config_client).slice();return this.next();}
  const config=array(drag.config_client).find(c=>this.matches(c,hit,isDrag));if(!config)return false;
  return this.apply(config);
 }
 apply(c){
  let i=0;const choices=array(c.action);if(choices.length)i=Array.isArray(c.idle)&&!Array.isArray(c.change_idle)?Math.max(0,c.idle.indexOf(this.state.idle)):Math.floor(this.random()*choices.length);
  const action=choices.length?choices[i]:c.action;
  const idle=Array.isArray(c.change_idle)?c.change_idle[i]:c.change_idle;
  this.current={config:c,idle,skin:c.skin_change,event:choose(c.event,this.random),actionCv:choose(c.action_cv,this.random),finishCv:choose(c.finish_cv,this.random),actionCvPlayed:false};
  if(c.fold!==undefined){this.state.fold=!!c.fold;this.adapter.fold?.(!!c.fold);}
  if(c.effect_hide)this.adapter.effects?.(false);if(c.alpha_data)this.adapter.alpha?.(c.alpha_data);
  this.state.interactions++;this.log('spine-trigger',{action,idle,hit:c.hit});
  if(!action){this.state.busy=true;this.adapter.assistantEvent?.(this.current.event);this.finish();return true;}
  return this.action(action,{interactive:true,config:c});
 }
 next(){if(!this.queue.length){this.state.busy=false;this.playIdle();return true;}return this.action(this.queue.shift(),{interactive:true,sequence:true});}
 playIdle(){return this.action(this.state.idle,{idle:true,force:true});}
 action(name,options={}){
  if(!name||this.disposed)return false;if(this.state.busy&&!options.force&&!options.idle)return false;
  if(!options.force){if(!this.dragPass)return false;if(name==='login'&&this.state.idle!==(this.model.defaultAnimation||'normal'))return false;for(const rule of array(this.rules.action_enable))if(rule.name===this.state.idle&&has(rule.ignore,name))return false;}
  const names=this.model.animations||[];
  const motion=names.includes(name)?name:this.model.id.endsWith('_hx')&&names.includes(name+'_hx')?name+'_hx':null;
  if(!motion){if(!this.state.missingActions.includes(name))this.state.missingActions.push(name);this.log('missing-action',{name});return false;}
  Object.assign(this.state,{action:name,motion,busy:!options.idle,actionTime:0});this.actionOptions=options;const g=++this.generation;
  Promise.resolve(this.adapter.play?.(motion,!!options.idle,{generation:g,clear:options.config?.clear_track})).catch(e=>{if(g!==this.generation||this.disposed)return;this.state.errors.push(String(e));this.state.busy=false;});
  if(options.interactive&&!this.current){this.sound(this.model.voiceBank,motionCue(name),{voice:true});}
  this.log('action',{name,idle:!!options.idle});return true;
 }
 event(name){
  if(name==='finish'){this.finish();return;}
  if(name==='action'&&this.current&&!this.current.actionCvPlayed){this.current.actionCvPlayed=true;if(this.current.actionCv)this.sound(this.model.voiceBank,this.current.actionCv+'_'+this.model.voiceVariant,{voice:true,exact:true});if(this.current.event)this.adapter.assistantEvent?.(this.current.event);}
  if(name==='drag_on')this.dragPass=false;if(name==='drag_off')this.dragPass=true;
  if(name==='effect_on'||name==='effect_off')this.adapter.effects?.(name==='effect_on');
  const [kind,bank,cue,volume]=name.split('_');if((kind==='bgm'||kind==='bgmsingle')&&bank&&cue)this.sound('se-skin',bank+'_'+cue,{loop:kind==='bgm',channel:'bgm',volume:volume!==undefined?Number(volume):1});
 }
 finish(){
  if(!this.state.busy)return;this.state.busy=false;
  const c=this.current;if(c){if(c.idle)this.state.idle=c.idle;if(c.skin){this.state.skin=this.state.skin===c.skin?'':c.skin;this.adapter.skin?.(this.state.skin);}if(c.config.fold){this.state.fold=false;this.adapter.fold?.(false);}if(c.config.effect_hide)this.adapter.effects?.(true);if(c.finishCv)this.sound(this.model.voiceBank,c.finishCv+'_'+this.model.voiceVariant,{voice:true,exact:true});this.current=null;this.saveState();}
  if(this.actionOptions?.sequence){this.next();return;}this.playIdle();
 }
 tick(dt){this.time+=dt;this.state.actionTime+=dt;}
}
