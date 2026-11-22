import {linkedForm} from './dual-form.mjs?v=20261116-dual-form';
import {Live2DController,SpineController,array,basicActions,motionCue,triangleContains,polygonContains,fitSceneBounds,voiceClip,highestFavor} from './controller.mjs?v=20261119-clip-capture';
import {EffectTimeline} from './effect-timeline.mjs?v=20261120-effect-loop-catalog';
import {effectControlPortraits,hasEffectControls} from './effect-controls.mjs?v=20261120-effect-speed';
import {portraitFrameBounds,spinePortraitFrameBounds,portraitSurroundNames,authoredLive2DFrame,authoredLive2DExportFrame,authoredLive2DExportHidden,authoredLive2DExportWindow,authoredLive2DLevelFrame,authoredLive2DInterfaceCovers,authoredLive2DScreenEdges,authoredSpineFrame,authoredSpineExportFrame,defaultPortraitStageFrame,authoredSceneExportCrop,authoredLive2DSceneAperture,authoredSpineSceneAperture} from './portrait-frame.mjs?v=20261121-portraits';
import {automaticSceneAperture} from './auto-scene-apertures.mjs?v=20261121-scene-fit';
import {readPortraitAsset,loadPortraitSpineAssets,prepareLive2DSettings} from './portrait-assets.mjs?v=20261109-portrait-frame1';
import {decodePortraitAudio} from './portrait-audio-decode.mjs?v=20261113-az-audio';
import {installMotionCompatibility,configurePortraitMotions,configurePortraitRendering} from './portrait-motion.mjs?v=20261120-plymouth-arm-seam';
const $=id=>document.getElementById(id),K=window.SpineKit,BASE='..';
const stage=$('stage'),interactionHint=$('interaction-hint'),hintButton=$('show-hint');
const hintNav=$('interaction-hint-nav'),hintCount=$('interaction-hint-count'),nextHintButton=$('next-hint');
let canvas=$('canvas'),selected,allModels=[],controller,render,disposeRenderer,adapter,loadGeneration=0,portraitTime=0,space=false;
let hintsEnabled=false,hintArea=null,hintInteractionCount=0,hintAdvance=false,hasInteraction=false;
const hintVisits=new Map();
let hintManualAdvance=false,hintInputPose='',lastHintVisit='';
function hintPoseKey(){return selected?.type==='live2d'?String(controller?.state.idleIndex??0):`${controller?.state.idle||''}:${controller?.state.skin||''}`;}
function resetHintVisits(){hintVisits.clear();hintInputPose='';lastHintVisit='';hintManualAdvance=false;}
function recordHintVisit(type,data){
 const basic=type==='action'&&!data.idle&&Object.keys(basicActions).find(id=>basicActions[id]===data.name?.replace(/_ex$/,''));
 const area=type==='trigger'?data.area:type==='spine-trigger'?data.hit:basic;
 if(!area)return;
 const key=`${hintInputPose||hintPoseKey()}|${area}`,event=`${key}|${controller?.time}`;
 if(event===lastHintVisit)return;
 lastHintVisit=event;hintVisits.set(key,(hintVisits.get(key)||0)+1);
}
const interactButton=$('btnStagePan');
const fixedView=$('fixed-view');
const isStagePointer = target => target === canvas || (target === stage && canvas.style.clipPath !== '');
let stageFrameCache=null;
K.initStageUI({canvas,refit:()=>{stageFrameCache=null;}});
function stageFrame(){
 if(stageFrameCache?.canvas===canvas&&stageFrameCache.w===stage.clientWidth&&stageFrameCache.h===stage.clientHeight)return stageFrameCache;
 const rect=canvas.getBoundingClientRect(),area=K.stageViewArea(canvas);
 return stageFrameCache={canvas,w:stage.clientWidth,h:stage.clientHeight,width:area.width,height:area.height,x:area.left-rect.left+area.width/2,y:area.top-rect.top+area.height/2};
}
const loadingPreview=K.createLoadingPreview(stage);
const arromanchesPortrait = 'aluomangshi_2';
const portraitsWithSkinOne = new Set([arromanchesPortrait, 'feiteliedadi_5', 'yuekechengii_4']);
// Existing reviewed exports can intentionally blend texture selections and
// masks. Preserve those transitions and use continuous tracks for new cases.
const loopedEffectPortraits = new Set([
 'kebensi_2', 'shuixinghao_2', 'pulimaosi_3', 'xingdengbao_3', 'xinnong_5', 'xinnong_6', 'dafeng_7',
 'yanusi_7', 'aogusite_4', 'adaerbote_3', 'bailong_3', 'jian_3',
]);
const blendedVideoPortraits = new Set([
 'aerbien_3', 'aersasi_2', 'aersasi_3', 'ankeleiqi_2', 'baerdimo_6', 'benningdun_2',
 'bulaimodun_4', 'bulaimodun_5', 'chaijun_5', 'dafeng_6', 'dujiaoshou_6', 'gezi_2',
 'jiluofu_3', 'jinshi_2', 'kewei_6', 'kuersike_2', 'luoma_2', 'luyijiushi_2',
 'meikelunbao_2', 'mingji_2', 'nengdai_3', 'qianwei_2', 'qiye_7', 'qiye_9', 'qiye_10',
 'shi_2', 'sitelasibao_2', 'tianlangxing_5', 'weineituo_2', 'wuerlixi_3', 'wuzang_4',
 'xianghe_2', 'xingdengbao_2', 'xinnong_4', 'xuefeng_3', 'xukufu_3', 'yuekechengii_3',
 'zhala_2', 'zhenzhuhao_2',
]);
const previewPath = id => {
 const coverId = id === 'wuqi_3_hx' ? 'wuqi_3' : id;
 return K.thumbnailURL(K.siteRoot()+'thumbs/azurlane/'+encodeURIComponent(coverId)+'.webp');
};
let previewPending=false,nextPreviewCheck=0;
const previewSample=document.createElement('canvas');previewSample.width=previewSample.height=64;
const previewContext=previewSample.getContext('2d',{willReadFrequently:true});
const bootPreviewId=new URL(location.href).searchParams.get('id');
if(/^[a-z0-9_-]+$/i.test(bootPreviewId||''))loadingPreview.begin(0,{path:previewPath(bootPreviewId),label:'当前立绘',trimImage:true});
const view={zoom:1,panX:0,panY:0,playing:true,speed:1,frames:0,ready:false};
let loadAbort=null,retryId=null;
let editor=null,exporting=false,volume=1;
const savedVolume=Number(localStorage.getItem('arthub:azurlane:volume')??1);
if(Number.isFinite(savedVolume))volume=Math.min(1,Math.max(0,savedVolume));
const evidence=window.__azurlane=window.__dynamicViewer={view,ready:false,errors:[],interaction:{},audio:{state:'idle',plays:0,maxRms:0,missing:[]}};
const formButton=$('btnSwitchForm');
let formSwitch=null,formButtonKey='';
const compactFormQuery=window.matchMedia('(max-width:600px), (max-height:520px)');
function updateFormButton(){
 const key=[selected?.id,allModels.length,view.ready,exporting,formSwitch?.phase,compactFormQuery.matches].join(':');
 if(key===formButtonKey)return;formButtonKey=key;
 const link=linkedForm(selected?.id,allModels);
 formButton.hidden=!link&&!formSwitch;
 formButton.disabled=!formSwitch&&(!view.ready||exporting);
 const compact=compactFormQuery.matches;
 const fullLabel=formSwitch?'取消切换':link?.index?'返回原形态':'切换形态';
 const label=compact?(formSwitch?'取消':link?.index?'返回':'形态'):fullLabel;
 if(formButton.textContent!==label)formButton.textContent=label;
 if(formButton.getAttribute('aria-label')!==fullLabel)formButton.setAttribute('aria-label',fullLabel);
 formButton.title=formSwitch?'取消切换并返回原形态':link?'切换至 '+(allModels.find(m=>m.id===link.target)?.name||link.target):'';
 evidence.form={target:link?.target||null,switching:!!formSwitch,phase:formSwitch?.phase||null};
}
function cancelFormSwitch(restore=true){
 const token=formSwitch;if(!token)return;
 formSwitch=null;token.abort.abort();token.complete=null;
 updateFormButton();
 if(restore)loadModel(token.origin).catch(fail);
}
// A transition owns the animation clock. Prevent panel/gesture actions from
// replacing it mid-flight; the same visible button always permits cancellation.
for(const type of ['click','pointerdown','wheel','keydown'])document.addEventListener(type,event=>{
 if(!formSwitch||event.target.closest?.('#btnSwitchForm'))return;
 if(type==='keydown'&&event.key==='Escape')cancelFormSwitch();
 event.preventDefault();event.stopImmediatePropagation();
},{capture:true,passive:false});
function waitFormMotion(token,name,start=true){
 return new Promise((resolve,reject)=>{
  const active=controller,errors=active.state.errors.length;
  let timer,timeout;
  const finish=error=>{clearInterval(timer);clearTimeout(timeout);token.abort.signal.removeEventListener('abort',aborted);token.complete=null;error?reject(error):resolve();};
  const aborted=()=>finish(new DOMException('切换已取消','AbortError'));
  token.complete=()=>finish();token.abort.signal.addEventListener('abort',aborted,{once:true});
  timer=setInterval(()=>{
   if(active!==controller||active.disposed)return aborted();
   if(active.state.errors.length>errors)finish(new Error(active.state.errors.at(-1)));
  },100);
  timeout=setTimeout(()=>finish(new Error('切换动作加载超时，请重试')),90000);
  if(start&&!active.action(name,{force:true,manual:true,voice:false,onComplete:()=>token.complete?.()}))finish(new Error('切换动作不可用：'+name));
 });
}
async function switchForm(){
 if(formSwitch){cancelFormSwitch();return;}
 const link=linkedForm(selected?.id,allModels);if(!link||!view.ready||exporting)return;
 const token={origin:selected.id,abort:new AbortController(),phase:'out',complete:null};formSwitch=token;
 const playing=view.playing,speed=view.speed;
 try{
  cancelInteraction();stopAudio();clearHint();stagePan.setMode('pan');
  setPanelOpen('interaction',false);view.playing=true;view.speed=1;adapter?.setInteractionViewFixed?.(false);
  updateFormButton();
  if(selected.animations.includes('change_out'))await waitFormMotion(token,'change_out');
  if(formSwitch!==token)return;
  token.phase='loading';
  const loaded=await loadModel(link.target,{formToken:token,initialAction:'change_in'});
  if(formSwitch!==token||!loaded)return;
  token.phase='in';
  if(selected.animations.includes('change_in'))await waitFormMotion(token,'change_in',false);
  if(formSwitch!==token)return;
  view.playing=playing;view.speed=speed;formSwitch=null;updateFormButton();
 }catch(error){
  if(formSwitch!==token)return;
  formSwitch=null;token.abort.abort();
  const restored=await loadModel(token.origin).catch(error=>{fail(error);return false;});
  K.toast(restored?'形态切换失败，已返回原形态，可再次重试。':'形态切换失败，请重新加载立绘后重试。','err');
  evidence.formError=String(error);updateFormButton();
 }
}
formButton.addEventListener('click',()=>void switchForm());
// pixi-live2d-display 0.4 releases the Model but leaves its native Moc allocated.
// Keep that owner until the Model has been destroyed, then release it as well.
const mocOwners=new WeakMap(),releasedMocs=new WeakSet();let createdMocs=0,releasedMocCount=0;
// Cubism physics owns mutable JS vectors and caches. Preserve those caches
// while sampling an export, without copying the native model or its heap.
function preserveSimulation(root){
 const saved=[],seen=new WeakSet();
 function visit(value){if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
  if(ArrayBuffer.isView(value)){const copy=value.slice();saved.push(()=>value.set(copy));return;}
  const props=Object.getOwnPropertyDescriptors(value),entries=Object.entries(props).filter(([key,d])=>d.writable&&key!=='_model').map(([key,d])=>[key,d.value]);
  saved.push(()=>{for(const [key,original]of entries)value[key]=original;});for(const [,child]of entries)visit(child);
 }visit(root);return ()=>{for(const restore of saved)restore();};
}
const nativeFromMoc=Live2DCubismCore.Model.fromMoc;
Live2DCubismCore.Model.fromMoc=function(moc){const model=nativeFromMoc.call(this,moc);if(model){mocOwners.set(model,moc);createdMocs++;}return model;};
const evidenceNode=document.createElement('script');evidenceNode.type='application/json';evidenceNode.id='pilot-evidence';document.body.append(evidenceNode);
const look={x:0,y:0,targetX:0,targetY:0};let pointer,libraryFilter='all',gridPage=1,gridPageSize=K.libraryPageSize(),libraryThumbs={},sortMode='name',sortDirection='asc';
const libraryPrefs=K.Store('azurlane-interaction');sortMode=libraryPrefs.get('sortMode','name');sortDirection=libraryPrefs.get('sortDirection','asc');
fixedView.checked=libraryPrefs.get('fixedInteractionView',true);
K.initTheme(libraryPrefs);K.bindThemePalette($('btnTheme'),libraryPrefs);
$('thumbGrid').dataset.density=libraryPrefs.get('density','standard');
$('thumbGrid').dataset.kitDensityReady='1';
let retiredModels={};
const canonicalModelId=id=>retiredModels[id]||id;
const THUMB_PREFIX='../../thumbs/';
const THUMB_INDEX=THUMB_PREFIX+'index.json?v=20261120-soviet-scene';
const enc=path=>path.split('/').map(encodeURIComponent).join('/');
const labels={touch_1:'普通触摸',touch_2:'特殊触摸',touch_head:'摸头',login:'登录',home:'回港',task:'任务',mission_complete:'任务完成',main_1:'主界面 1',main_2:'主界面 2',main_3:'主界面 3',propose:'誓约'};
function fail(error){const message=error.message||String(error);loadingPreview.fail(loadGeneration,message);$('status').textContent='加载失败：'+message;evidence.errors.push(message);}
function portraitName(m){const character=String(m.characterName||'').trim(),skin=String(m.skinName||'').trim();return character&&skin&&skin!==character&&!/\{namecode:\d+\}/i.test(skin)?character+' · '+skin:character||String(m.name||m.id||'');}
function variantLabel(m){return /_hx$/.test(m.id)?'HX版':/_asmr$/.test(m.id)?'ASMR版':'';}
function stageName(m){const variant=variantLabel(m);return portraitName(m)+(variant?'（'+variant+'）':'');}
function entry(m){const url=new URL(BASE+'/viewer/index.html?id='+encodeURIComponent(m.id),location.href);return {k:'azurlane:'+m.id,src:'azurlane-interaction',t:stageName(m),s:m.type==='live2d'?'Live2D':'Spine',u:url.pathname+url.search};}
function zoomTo(next,x,y){if(!Number.isFinite(next)||next<=0)return;next=Math.max(.1,Math.min(8,next));if(Number.isFinite(x)){const r=canvas.getBoundingClientRect(),frame=stageFrame(),f=next/view.zoom;view.panX=f*view.panX+(1-f)*(x-r.left-frame.x);view.panY=f*view.panY+(1-f)*(y-r.top-frame.y);}view.zoom=next;for(const id of ['zOut','zPct','zIn'])$(id).disabled=!view.ready;$('zPct').textContent=next<100?Math.round(next*100)+'%':next.toPrecision(3)+'×';}
$('zIn').onclick=()=>zoomTo(view.zoom*1.25);$('zOut').onclick=()=>zoomTo(view.zoom/1.25);$('fit').onclick=()=>{view.panX=view.panY=0;adapter?.refit?.();zoomTo(1);};$('zPct').onclick=()=>$('fit').click();
stage.addEventListener('wheel',e=>{if(!isStagePointer(e.target))return;e.preventDefault();zoomTo(view.zoom*Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);},{passive:false});
let ctx,muted=false,audioSerial=0,audioScope=0,voiceAnalyser,mouth=0;const channels=new Map(),buffers=new Map();
async function unlockAudio(){
 if(muted)return;
 if(navigator.audioSession&&navigator.audioSession.type!=='playback'){
  try{navigator.audioSession.type='playback';}catch{}
 }
 ctx||=new (window.AudioContext||window.webkitAudioContext)();
 if(ctx.state!=='running'&&ctx.state!=='closed')await ctx.resume();
 evidence.audio.contextState=ctx.state;
 if(ctx.state!=='running')throw Error('声音设备尚未就绪');
}
function setVolume(value){
 volume=value;
 localStorage.setItem('arthub:azurlane:volume',value);
 for(const job of channels.values())if(job.gain)job.gain.gain.value=(job.baseVolume??1)*value;
}
function stopChannel(channel){const job=channels.get(channel);if(job){job.cancelled=true;try{job.source?.stop();}catch{}job.source?.disconnect();job.gain?.disconnect();channels.delete(channel);}if(channel==='voice'){voiceAnalyser=null;evidence.audio.state='idle';adapter?.expression?.(null);}}
function stopAudio(){audioScope++;for(const ch of [...channels.keys()])stopChannel(ch);voiceAnalyser=null;evidence.audio.state='idle';evidence.audio.rms=0;}
async function playSound(bank,cue,options={}){
 if(!cue||muted||!selected)return;const model=selected,scope=audioScope;
 const clip=options.voice?voiceClip(model,cue,controller?.state.favor??0,options.exact):model.soundBanks?.[bank]?.find(c=>c.name===cue);
 if(!clip){const key=bank+':'+cue;if(!evidence.audio.missing.includes(key))evidence.audio.missing.push(key);if(options.voice){$('voice-status').textContent='这个动作暂无匹配台词。';$('dialogue').textContent='';}return;}
 const channel=options.channel||(options.voice?'voice':'sfx'+(++audioSerial%8));const previous=channels.get(channel);if(channel==='bgm'&&previous?.clip===clip.name&&previous.gain){previous.baseVolume=options.volume??1;previous.gain.gain.setTargetAtTime(previous.baseVolume*volume,ctx.currentTime,.05);return;}stopChannel(channel);
 const job={cancelled:false};channels.set(channel,job);
 let buffer=buffers.get(clip.url);
 try{
  await unlockAudio();
  if(job.cancelled||muted)return;
  if(!buffer){
   const response=await fetch(clip.url);
   if(!response.ok)throw Error('声音资源 '+response.status+' '+clip.name);
   buffer=await decodePortraitAudio(ctx,await response.arrayBuffer());
   buffers.set(clip.url,buffer);
   while(buffers.size>24)buffers.delete(buffers.keys().next().value);
  }
 }catch(error){
  if(job.cancelled||channels.get(channel)!==job)return;
  channels.delete(channel);
  throw error;
 }
 if(job.cancelled||scope!==audioScope||selected!==model||muted)return;
 const source=ctx.createBufferSource(),gain=ctx.createGain(),baseVolume=Number.isFinite(options.volume)?options.volume:1;source.buffer=buffer;source.loop=!!options.loop;gain.gain.value=baseVolume*volume;source.connect(gain);gain.connect(ctx.destination);Object.assign(job,{source,gain,clip:clip.name,baseVolume});
 if(options.voice){K.clearToasts('azur-audio');delete evidence.audio.error;voiceAnalyser=ctx.createAnalyser();voiceAnalyser.fftSize=512;source.connect(voiceAnalyser);Object.assign(evidence.audio,{state:'playing',clip:clip.name,cue:clip.cue||cue,plays:evidence.audio.plays+1,seconds:buffer.duration});adapter?.expression?.(clip.cue||cue);$('voice-status').textContent=labels[clip.cue]||clip.cue||cue;$('dialogue').textContent=clip.text||'';$('voice').value=clip.name;}
 else evidence.audio.effects=(evidence.audio.effects||0)+1;
 source.onended=()=>{if(channels.get(channel)!==job)return;channels.delete(channel);source.disconnect();gain.disconnect();if(options.voice){voiceAnalyser=null;evidence.audio.state='ended';evidence.audio.rms=0;adapter?.expression?.(null);}};source.start();
}
function sound(bank,cue,options){
 playSound(bank,cue,options).catch(error=>{
  evidence.audio.error=error.message;
  $('voice-status').textContent='声音暂时无法播放，可以重试。';
  if(options?.voice)K.toast('台词播放失败。打开「更多 → 声音」可以试听重试。','err',4000,'azur-audio');
 });
}
function updateAudio(dt){let rms=0;if(voiceAnalyser&&ctx?.state==='running'){const pcm=new Float32Array(voiceAnalyser.fftSize);voiceAnalyser.getFloatTimeDomainData(pcm);rms=Math.sqrt(pcm.reduce((s,v)=>s+v*v,0)/pcm.length);}evidence.audio.rms=rms;evidence.audio.maxRms=Math.max(rms,evidence.audio.maxRms);const smooth=selected?.skinConfig?.lip_smoothing||selected?.interaction?.mouth?.Smoothing||.08;mouth+=(rms-mouth)*(1-Math.exp(-dt/Math.max(.01,smooth)));}
function fold(value){document.body.classList.toggle('fold',value);}
function updateCategoryCounts(){
 const counts={all:allModels.length,live2d:allModels.filter(m=>m.type==='live2d').length,spine:allModels.filter(m=>m.type==='spine').length,favorite:allModels.filter(m=>K.favs.has(entry(m).k)).length};
 for(const chip of document.querySelectorAll('#filterChips [data-filter]')){const count=chip.querySelector('.n');if(count)count.textContent=String(counts[chip.dataset.filter]||0);}
}
function updateSortDirection(){const button=$('azurlaneSortDir'),descending=sortDirection==='desc';button.title=descending?'当前降序，点击切换为升序':'当前升序，点击切换为降序';button.setAttribute('aria-label',button.title);K.setUiIcon(button,descending?'down':'up',descending?'降序':'升序');}
function renderPagination(totalPages){
 for(const nav of K.paginationHosts($('gridView'))){nav.replaceChildren();nav.hidden=totalPages<=1;if(totalPages<=1)continue;
  const add=(label,page,{current=false,disabled=false,gap=false}={})=>{const button=document.createElement(gap?'span':'button');button.className=gap?'grid-page-gap':'grid-page-btn'+(current?' on':'');button.textContent=label;if(!gap){button.type='button';button.disabled=disabled;if(current)button.setAttribute('aria-current','page');button.setAttribute('aria-label',label==='‹'?'上一页':label==='›'?'下一页':'第 '+label+' 页');if(!disabled)button.onclick=()=>{gridPage=page;populate();$('gridView').scrollTo({top:0,behavior:'smooth'});};}nav.append(button);};
  add('‹',gridPage-1,{disabled:gridPage<=1});const radius=matchMedia('(max-width: 720px)').matches?1:2,pages=[...new Set([1,...Array.from({length:Math.max(0,Math.min(totalPages-1,gridPage+radius)-Math.max(2,gridPage-radius)+1)},(_,i)=>Math.max(2,gridPage-radius)+i),totalPages])].sort((a,b)=>a-b);let previous=0;for(const page of pages){if(previous&&page-previous>1)add('…',undefined,{gap:true});add(String(page),page,{current:page===gridPage});previous=page;}add('›',gridPage+1,{disabled:gridPage>=totalPages});
 }
}
function populate(){
 const query=$('gridSearch').value.trim().toLocaleLowerCase(),cards=$('thumbGrid');let items=allModels.filter(m=>(m.name+' '+m.characterName+' '+m.skinName+' '+m.id).toLocaleLowerCase().includes(query)&&(libraryFilter==='all'||libraryFilter===m.type||libraryFilter==='favorite'&&K.favs.has(entry(m).k)));
 const direction=sortDirection==='desc'?-1:1;
 if(sortMode==='name')items=[...items].sort((a,b)=>direction*portraitName(a).localeCompare(portraitName(b),'zh-CN',{numeric:true,sensitivity:'base'}));
 else if(sortMode==='type')items=[...items].sort((a,b)=>direction*(String(a.type).localeCompare(String(b.type))||portraitName(a).localeCompare(portraitName(b),'zh-CN',{numeric:true,sensitivity:'base'})));
 else if(sortDirection==='desc')items=[...items].reverse();
 gridPageSize=K.libraryPageSize();const pageCount=Math.max(1,Math.ceil(items.length/gridPageSize));gridPage=Math.min(Math.max(1,gridPage),pageCount);const pageItems=items.slice((gridPage-1)*gridPageSize,gridPage*gridPageSize),fragment=document.createDocumentFragment();
 for(const m of pageItems){const card=document.createElement('div');card.className='thumb-card'+(m.id===selected?.id?' active':'');card.dataset.id=m.id;card.setAttribute('role','button');card.tabIndex=0;card.setAttribute('aria-label',portraitName(m));
  const preview=document.createElement('div');preview.className='ph';const text=document.createElement('div');text.className='tm';const name=document.createElement('div'),tag=document.createElement('span'),star=document.createElement('button');name.className='tn';tag.className='tt';star.className='tstar'+(K.favs.has(entry(m).k)?' on':'');name.textContent=portraitName(m);tag.textContent=m.type==='live2d'?'Live2D':'Spine';star.type='button';star.title=K.favs.has(entry(m).k)?'取消收藏':'收藏';star.setAttribute('aria-label',star.title);star.setAttribute('aria-pressed',String(K.favs.has(entry(m).k)));star.innerHTML=K.uiIcon('star',18,K.favs.has(entry(m).k));text.append(name);card.append(preview,text,tag,star);
  const thumb=libraryThumbs['azurlane:'+m.id];
  K.setPreview(preview,thumb?K.thumbnailURL(THUMB_PREFIX+thumb):null);
  const variant=variantLabel(m);if(variant){const badge=document.createElement('span');badge.className='tv';badge.textContent=variant;badge.title=variant==='HX版'?'原游戏 HX 变体，模型或动作配置与标准版存在差异':variant;card.append(badge);}
  card.addEventListener('click',event=>{if(event.target.closest('.tstar'))return;setPanelOpen('library',false);loadModel(m.id).catch(fail);});card.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('.tstar')){event.preventDefault();setPanelOpen('library',false);loadModel(m.id).catch(fail);}});star.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();K.favs.toggle(entry(m));populate();});fragment.append(card);
 }
 cards.replaceChildren(fragment);$('gridSub').textContent=`${items.length} 个资源 · 第 ${gridPage} / ${pageCount} 页`;renderPagination(pageCount);updateCategoryCounts();updateSortDirection();
 $('btnPrev').disabled=$('btnNext').disabled=!selected;const starred=!!selected&&K.favs.has(entry(selected).k);$('railStar').disabled=!selected;$('railStar').setAttribute('aria-pressed',String(starred));$('railStar').innerHTML=K.uiIcon('star',18,starred);
}
$('gridSearch').oninput=()=>{gridPage=1;populate();};document.querySelectorAll('#filterChips [data-filter]').forEach(button=>button.onclick=()=>{libraryFilter=button.dataset.filter;gridPage=1;document.querySelectorAll('#filterChips [data-filter]').forEach(chip=>{const active=chip===button;chip.classList.toggle('on',active);chip.setAttribute('aria-pressed',String(active));});populate();});
$('azurlaneSort').value=sortMode;$('azurlaneSort').onchange=event=>{sortMode=event.target.value;libraryPrefs.set('sortMode',sortMode);gridPage=1;populate();};$('azurlaneSortDir').onclick=()=>{sortDirection=sortDirection==='desc'?'asc':'desc';libraryPrefs.set('sortDirection',sortDirection);gridPage=1;populate();};
matchMedia('(max-width: 720px)').addEventListener('change',()=>{const firstIndex=(gridPage-1)*gridPageSize;gridPageSize=K.libraryPageSize();gridPage=Math.floor(firstIndex/gridPageSize)+1;populate();});
function setPanelOpen(name,open){document.body.classList.toggle(name+'-open',open);$(name==='library'?'gridView':'floatPanel').classList.toggle('open',open);$(name==='library'?'railGrid':'btnAnimTab').setAttribute('aria-expanded',String(open));}
$('railGrid').onclick=()=>{const open=!document.body.classList.contains('library-open');setPanelOpen('library',open);if(open&&innerWidth<=760)setPanelOpen('interaction',false);};
$('btnAnimTab').onclick=()=>{const open=!document.body.classList.contains('interaction-open')||$('floatPanel').dataset.tab==='interaction';if(open)viewerUI.showTab('anim');setPanelOpen('interaction',open);if(open&&innerWidth<=760)setPanelOpen('library',false);};
$('gridClose').onclick=()=>setPanelOpen('library',false);$('panel-close').onclick=()=>setPanelOpen('interaction',false);
document.querySelectorAll('[data-panel-tab]').forEach(tab=>tab.addEventListener('click',()=>{if(tab.hidden||tab.disabled)return;const name=tab.dataset.panelTab;document.querySelectorAll('[data-panel-tab]').forEach(button=>{const active=button===tab;button.classList.toggle('on',active);button.setAttribute('aria-selected',String(active));});document.querySelectorAll('[data-panel-page]').forEach(page=>page.classList.toggle('on',page.dataset.panelPage===name));if(name==='interaction'&&view.ready&&hasInteraction){if(stage.dataset.panMode!=='interact')stagePan.setMode('interact');setPanelOpen('interaction',true);}}));
$('railStar').onclick=()=>{if(selected){K.favs.toggle(entry(selected));populate();}};
$('railThumb').onclick=()=>$('fit').click();
$('btnPrev').onclick=()=>step(-1);$('btnNext').onclick=()=>step(1);

function step(direction){if(!allModels.length)return;const index=allModels.findIndex(m=>m.id===selected?.id);const next=index<0?(direction>0?0:allModels.length-1):(index+direction+allModels.length)%allModels.length;setPanelOpen('library',false);loadModel(allModels[next].id).catch(fail);}
$('play').onclick=()=>{view.playing=!view.playing;$('play').textContent=view.playing?'暂停':'播放';if(ctx)(view.playing?ctx.resume():ctx.suspend()).catch(()=>{});};
$('speed').onchange=()=>view.speed=Number($('speed').value);
$('animation').onchange=()=>{unlockAudio().catch(()=>{});controller?.action($('animation').value,{force:true,idle:$('loop').checked,interactive:true,manual:true,resetPose:true});};
$('loop').onchange=()=>$('animation').onchange();
$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'声音：关':'声音：开';evidence.audio.muted=muted;if(muted)stopAudio();else unlockAudio().catch(()=>{});};
function auditionVoice(clip){
 if(!clip||!view.ready||exporting)return;
 if(muted)$('sound').click();
 sound(selected.voiceBank,clip.name,{voice:true,exact:true});
}
$('voice-play').onclick=()=>auditionVoice(selected?.voice?.activeClips?.find(c=>c.name===$('voice').value));
$('interaction-voice').onclick=()=>{
 if(!selected)return;
 const clips=selected.voice.activeClips,favor=controller?.state.favor??0;
 auditionVoice(voiceClip(selected,'touch_head',favor)||voiceClip(selected,'touch_1',favor)||clips[0]);
};
$('voice-stop').onclick=()=>stopChannel('voice');
$('reset-state').onclick=()=>{cancelInteraction();stopAudio();adapter?.setInteractionViewFixed?.(false);controller?.reset();$('fit').click();hintArea=null;hintAdvance=false;resetHintVisits();clearHint();};
$('exit-interaction').onclick=()=>{
 cancelInteraction();
 hintsEnabled=false;hintButton.setAttribute('aria-pressed','false');clearHint();
 stagePan.setMode('pan');
 $('interaction-more').open=false;
 setPanelOpen('interaction',false);
};
$('refit-interaction').onclick=()=>{$('fit').click();setPanelOpen('interaction',false);};
fixedView.onchange=()=>{
 libraryPrefs.set('fixedInteractionView',fixedView.checked);
 adapter?.setInteractionViewFixed?.(fixedView.checked);
};
hintButton.onclick=()=>{
 hintsEnabled=!hintsEnabled;
 hintButton.setAttribute('aria-pressed',String(hintsEnabled));
 updateInteractionHint();
};
const hintLabels={tap:'点这里',hold:'长按这里',drag:'从这里拖动'};
const hintSamples=[.5,.25,.75,.125,.875,.375,.625,.04,.96];
function clearHint(){
 interactionHint.hidden=hintNav.hidden=true;
}
nextHintButton.onclick=()=>{
 hintManualAdvance=true;
 hintAdvance=true;
 updateInteractionHint();
};
function findHintPoint(area,rect,gestures,live){
 if(!area.vertices.length)return null;
 const xs=area.vertices.map(point=>point[0]),ys=area.vertices.map(point=>point[1]);
 const left=Math.max(7,Math.min(...xs)),right=Math.min(rect.width-7,Math.max(...xs));
 const top=Math.max(7,Math.min(...ys)),bottom=Math.min(rect.height-7,Math.max(...ys));
 if(right<left||bottom<top)return null;
 const gesture=gestures.get(area.id);
 function candidate(x,y){
  if(x<left||x>right||y<top||y>bottom||document.elementFromPoint(rect.left+x,rect.top+y)!==canvas)return null;
  const hits=adapter.hits(x,y);
  if(live){
   // Live2D starts every hit region. An overlapping region that cannot
   // respond to this gesture cannot hide the underlying control.
   if(hits.find(id=>gestures.get(id)===gesture)!==area.id)return null;
  }else if(hits[0]!==area.id)return null;
  return {id:area.id,x,y,gesture};
 }
 for(const u of hintSamples)for(const v of hintSamples){
  const point=candidate(left+(right-left)*u,top+(bottom-top)*v);
  if(point)return point;
 }
 // Slender polygons may pass between all the grid samples.
 const vertices=area.vertices;
 const stride=Math.max(1,Math.ceil(vertices.length/24));
 for(let i=0;i<vertices.length;i+=stride){
  const a=vertices[i],b=vertices[(i+1)%vertices.length];
  const point=candidate((a[0]+b[0])/2,(a[1]+b[1])/2);
  if(point)return point;
 }
 return null;
}
function updateInteractionHint(){
 if(!hasInteraction||!hintsEnabled||!view.ready||exporting||stage.dataset.panMode!=='interact'||stage.dataset.clickMode==='part-editing'||
    stage.dataset.clickMode==='pose'||stage.dataset.pinching||pointer||$('gridView').classList.contains('open')){
  clearHint();
  return;
 }
 if(controller.state.busy||controller.state.motionPending){
  interactionHint.hidden=true;hintNav.hidden=false;nextHintButton.disabled=true;
  const message=controller.state.motionPending?'正在准备动作…':'动作播放中，结束后继续互动';
  if(hintCount.textContent!==message)hintCount.textContent=message;
  return;
 }
 nextHintButton.disabled=false;
 if(controller.state.interactions!==hintInteractionCount){
  hintInteractionCount=controller.state.interactions;
  hintAdvance=true;
 }
 const source=selected.interaction.hitAreas;
 const regions=new Map(adapter.polygons().map(area=>[area.id,area]));
 const gestures=new Map(source.map(area=>[area.id,controller.hintGesture(area.id,area.event)]));
 const rect=canvas.getBoundingClientRect(),live=selected.type==='live2d';
 const candidates=[];
 for(let i=0;i<source.length;i++){
  const id=source[i].id,area=regions.get(id);
  if(!area||!gestures.get(id))continue;
  const point=findHintPoint(area,rect,gestures,live);
  if(point)candidates.push({...point,index:i});
 }
 if(!candidates.length){interactionHint.hidden=true;hintNav.hidden=false;nextHintButton.disabled=true;if(hintCount.textContent!=='当前画面暂无可用提示')hintCount.textContent='当前画面暂无可用提示';return;}
 const current=source.findIndex(area=>area.id===hintArea);
 let next=hintAdvance?-1:candidates.findIndex(point=>point.id===hintArea);
 if(next<0)next=candidates.findIndex(point=>point.index>current);
 if(next<0)next=0;
 if(!hintManualAdvance&&(hintAdvance||!candidates.some(point=>point.id===hintArea))){
  // Rotating the global area list can repeatedly choose the exit of a new
  // pose. Balance actual interactions within each pose so every branch gets
  // a turn; explicit "next" still walks the visible points in their order.
  const visits=candidates.map(point=>hintVisits.get(`${hintPoseKey()}|${point.id}`)||0),least=Math.min(...visits);
  for(let offset=0;offset<candidates.length;offset++){const index=(next+offset)%candidates.length;if(visits[index]===least){next=index;break;}}
 }
 hintManualAdvance=false;
 const point=candidates[next],label=hintLabels[point.gesture],count=`当前姿态 ${next+1} / ${candidates.length}`;
 hintArea=point.id;
 hintAdvance=false;
 interactionHint.style.left=point.x+'px';
 interactionHint.style.top=point.y+'px';
 interactionHint.style.setProperty('--hint-label-offset',Math.max(48,Math.min(rect.width-48,point.x))-point.x+'px');
 interactionHint.toggleAttribute('data-label-below',point.y<60);
 if(interactionHint.firstElementChild.textContent!==label)interactionHint.firstElementChild.textContent=label;
 if(hintCount.textContent!==count)hintCount.textContent=count;
 interactionHint.hidden=false;
 nextHintButton.hidden=candidates.length<2;
 hintNav.hidden=false;
}
const releasePortraits = new Set(['nabulesi_3', 'banerwei_4', 'xinaoerliang_3']);
function localPoint(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function cancelInteraction(){
 if(pointer)release(pointer.id,pointer,true);
 look.targetX=look.targetY=0;
}
const stagePan=K.createStagePan({stage,button:interactButton,modeSelect:$('pointer-mode'),interactiveButton:true,accepts:isStagePointer,ready:()=>view.ready&&!exporting,
 onModeChange:mode=>{
  cancelInteraction();
  clearHint();
  adapter?.setInteractionViewFixed?.(mode==='interact'&&fixedView.checked);
  K.clearToasts('azur-interaction');
  if(mode==='interact'){
   viewerUI.tools.exitEditing();
   if(controller?.actionOptions?.manual){controller.playIdle();adapter.setInteractionViewFixed?.(false);adapter.refit?.();}
   $('interaction-more').open=false;
   if(!view.playing)$('play').click();
   unlockAudio().catch(()=>{});
   setPanelOpen('library',false);
   setPanelOpen('interaction',false);
   if(!$('playbar').classList.contains('collapsed'))$('playbarToggle').click();
  }else if($('floatPanel').dataset.tab==='interaction')setPanelOpen('interaction',false);
 },
 move:(dx,dy)=>{view.panX+=dx;view.panY+=dy;},
 tap:event=>{
  const p=localPoint(event),hits=adapter.hits(p.x,p.y);
  if(!hits.length)return;
  if(!view.playing)$('play').click();
  unlockAudio().catch(()=>{});
  hintInputPose=hintPoseKey();
  evidence.interaction.hits=hits;
  if(selected.type==='live2d'){
   if(fixedView.checked)adapter.setInteractionViewFixed(true);
   controller.start(hits,p.x,p.y,adapter.world(p.x,p.y));
   controller.end(p.x,p.y,false,hits);
  }else{
   const hit=hits[0];
   if(hit){
    const baseTouch=releasePortraits.has(selected.id)&&!array(selected.interaction.spine?.hit_area).includes(hit);
    if(baseTouch||!controller.touch(hit,{drag:false}))spineBasic(hit);
   }
  }
 }
});
stage.addEventListener('pointerdown',e=>{
 if(pointer||!isStagePointer(e.target)||e.button!==0||!view.ready||exporting)return;
 const p=localPoint(e),pan=space||$('pointer-mode').value==='pan',hits=pan?[]:adapter.hits(p.x,p.y);
 if(!pan&&!hits.length)return;
 e.preventDefault();canvas.setPointerCapture(e.pointerId);if(!view.playing)$('play').click();unlockAudio().catch(()=>{});
 pointer={id:e.pointerId,x:p.x,y:p.y,startX:p.x,startY:p.y,pan,hits,at:performance.now(),moved:false};evidence.interaction.hits=hits;
 hintInputPose=hintPoseKey();clearHint();
 if(!pan&&selected.type==='live2d')controller.start(hits,p.x,p.y,adapter.world(p.x,p.y));
});
stage.addEventListener('pointermove',e=>{
 const p=localPoint(e);
 if(pointer?.id!==e.pointerId)return;
 pointer.moved ||= Math.hypot(p.x-pointer.startX,p.y-pointer.startY)>=12;
 if(pointer.pan){view.panX+=p.x-pointer.x;view.panY+=p.y-pointer.y;}
 else if(selected.type==='live2d'){
  controller.move(p.x,p.y,adapter.world(p.x,p.y));const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);look.targetX=Math.max(-1,Math.min(1,(p.x-pointer.startX)/w*(selected.interaction.settings.DragRateX||5)));look.targetY=Math.max(-1,Math.min(1,-(p.y-pointer.startY)/h*(selected.interaction.settings.DragRateY||3)));
 }
 else if(!pointer.triggered&&pointer.hits[0]){
  const hit=pointer.hits[0];
  const nativeGesture=releasePortraits.has(selected.id)&&array(selected.interaction.spine?.hit_area).includes(hit);
  const scale=nativeGesture?devicePixelRatio:1;
  const distance=Math.max(Math.abs(p.x-pointer.startX),Math.abs(p.y-pointer.startY))*scale;
  if(distance>200&&(!releasePortraits.has(selected.id)||nativeGesture)){
   pointer.triggered=controller.touch(hit,{drag:true});
  }
 }
 pointer.x=p.x;pointer.y=p.y;
});
function release(id,p,cancel=false){if(pointer?.id!==id)return;const down=pointer;pointer=null;look.targetX=look.targetY=0;if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);if(down.pan)return;
 if(selected.type==='live2d'){
  if(!cancel&&down.hits.includes(hintArea)&&controller.hintGesture(hintArea)==='drag'&&Math.hypot(p.x-down.startX,p.y-down.startY)>=12){
   recordHintVisit('trigger',{area:hintArea});
   hintAdvance=true;
  }
  controller.end(p.x,p.y,cancel,cancel?[]:adapter.hits(p.x,p.y),(performance.now()-down.at)/1000);
 }
 else if(!cancel&&!down.triggered){
  const hit=down.hits[0];
  if(!hit)return;
  if(releasePortraits.has(selected.id)&&array(selected.interaction.spine?.hit_area).includes(hit)){
   const dx=Math.abs(p.x-down.startX)*devicePixelRatio,dy=Math.abs(p.y-down.startY)*devicePixelRatio;
   if(dx<200||dy<200)controller.touch(hit,{drag:false});
  }else if(!down.moved&&Math.hypot(p.x-down.startX,p.y-down.startY)<12&&performance.now()-down.at<500&&adapter.hits(p.x,p.y).includes(hit)){
   if(releasePortraits.has(selected.id)||!controller.touch(hit,{drag:false}))spineBasic(hit);
  }
 }
}
stage.addEventListener('pointerup',e=>{
 if(pointer?.id===e.pointerId&&!pointer.pan)unlockAudio().catch(()=>{});
 release(e.pointerId,localPoint(e));
});
stage.addEventListener('pointercancel',e=>release(e.pointerId,localPoint(e),true));
stage.addEventListener('lostpointercapture',e=>{if(pointer?.id===e.pointerId)cancelInteraction();});
K.bindPinch(stage,{
 isChrome:target=>!isStagePointer(target),ready:()=>view.ready&&!exporting,
 cancelDrag:()=>{stagePan.cancel();if(pointer){cancelInteraction();stopAudio();}},
 zoom:(factor,x,y)=>zoomTo(view.zoom*factor,x,y),
});
window.addEventListener('keydown',e=>{if(e.code==='Space'&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)&&!e.target.closest?.('button,[role="button"]')){space=true;e.preventDefault();}if(e.key==='Escape'){fold(false);setPanelOpen('library',false);setPanelOpen('interaction',false);}});window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;cancelInteraction();});
// Opening the interaction menu must not toggle interaction off or reset a preview.
interactButton.addEventListener('click', event => {
 event.preventDefault(); event.stopImmediatePropagation();
 const panel=document.getElementById('floatPanel');
 const open=!(panel.classList.contains('open')&&panel.dataset.tab==='interaction');
 if(open){ if(stage.dataset.panMode!=='interact')stagePan.setMode('interact'); viewerUI.showTab('interaction'); }
 setPanelOpen('interaction',open);
},true);
function spineBasic(hit){const area=selected.interaction.hitAreas.find(h=>h.id===hit);if(!area||controller.state.busy)return;let event=area.event;if(selected.id.endsWith('_hx')&&event==='TouchSpecial')event='TouchBody';const action=basicActions[event];if(action){if(!controller.action(action,{interactive:true}))sound(selected.voiceBank,motionCue(action),{voice:true});return;}const candidates=selected.animations.filter(n=>/^main_\d+$/.test(n));if(candidates.length)controller.action(candidates[Math.floor(Math.random()*candidates.length)],{interactive:true});else{const clips=selected.voice.activeClips.filter(c=>/^main_\d+$/.test(c.cue));const c=clips[Math.floor(Math.random()*clips.length)];if(c)sound(selected.voiceBank,c.cue,{voice:true});}}
// The export renderer reuses the stage WebGL context. Keep its resized
// canvas and successive export poses out of the visible preview.
let exportPreview = null;
function showExportPreview() {
 const still = canvas.cloneNode(false);
 still.removeAttribute('id');
 still.setAttribute('aria-hidden', 'true');
 still.dataset.exportPreview = '';
 still.style.pointerEvents = 'none';
 const context = still.getContext('2d');
 if (!context) return;
 context.drawImage(canvas, 0, 0);
 const visibility = canvas.style.visibility;
 canvas.before(still);
 canvas.style.visibility = 'hidden';
 exportPreview = { still, source: canvas, visibility };
}
function restoreExportPreview() {
 if (!exportPreview) return;
 exportPreview.source.style.visibility = exportPreview.visibility;
 exportPreview.still.remove();
 exportPreview = null;
}

const cameraLevelActions = new Set([
 'xinnong_5:idle18', 'baiyanjuren_4:idle3', 'qisheng_3:ex', 'qisheng_3:ex_touch',
 'qisheng_3:normal_touch', 'tianjinfeng_2:normal', 'tianjinfeng_3:normal',
]);
const currentActionKey = () => selected?.id + ':' + adapter?.timeline().name;

const viewerUI=window.createInteractionViewerUI({
 animations:()=>array(selected?.animations).filter(name=>name!=='effect'||!adapter?.effectTimeline).map(name=>({name,duration:selected.motionDurations?.[name]||adapter?.duration?.(name)||0})),
 playback:()=>{const timeline=adapter?.timeline?.()||{};return {selecting:!!controller?.state.motionPending,ready:view.ready&&view.frames>2&&!exporting,key:selected?.id+':'+loadGeneration,name:timeline.name||controller?.state.motion,time:timeline.time??controller?.state.actionTime??0,duration:timeline.duration||selected?.motionDurations?.[controller?.state.motion]||0,loop:timeline.loop??$('loop').checked,playing:view.playing,speed:view.speed,canSeek:!!adapter?.seek};},
 setPlaying:playing=>{if(!exporting&&view.playing!==playing)$('play').click();},
 setSpeed:speed=>{if(!exporting)view.speed=speed;},
 setLoop:loop=>{if(exporting)return;$('loop').checked=loop;$('loop').onchange();},
  selectAnimation:name=>{if(!view.ready||exporting||name==='effect'&&adapter?.effectTimeline)return;stagePan.setMode('pan');adapter?.setInteractionViewFixed?.(false);if(!view.playing)$('play').click();$('animation').value=name;$('animation').onchange();},
 seek:time=>{if(!view.ready||exporting)return;adapter?.seek?.(time);if(controller){controller.state.actionTime=time;controller.state.normalizedTime=time/Math.max(.001,controller.duration||adapter?.timeline?.().duration||1);for(const event of controller.events||[])event.fired=event.time<=time;controller.pendingVoicePlayed=true;}stopAudio();},
 effectPlayback:()=>view.ready&&adapter?.effectTimeline?{...adapter.effectTimeline.state(),ready:!exporting}:null,
 seekEffect:time=>{if(!view.ready||exporting)return;adapter?.effectTimeline?.seek(time);adapter?.refreshEffect?.();},
 setEffectSpeed:speed=>{if(view.ready&&!exporting)adapter?.effectTimeline?.setSpeed(speed);},
 setEffectFixed:fixed=>{if(!view.ready||exporting)return;adapter?.effectTimeline?.setFixed(fixed);adapter?.refreshEffect?.();},
 restartEffect:()=>{if(!view.ready||exporting)return;adapter?.effectTimeline?.restart();adapter?.refreshEffect?.();},
 canvas:()=>canvas,onError:fail,
 tools:{
  identity:()=>selected?.id+':'+loadGeneration,editor:()=>editor,name:()=>selected?.name||selected?.id||'azurlane',
  reload:()=>{const id=retryId||selected?.id;if(id)return loadModel(id).catch(fail);},openPanel:open=>setPanelOpen('interaction',open),stopAudio,
   setExporting:value=>{
    if (value && !exporting) {
     stagePan.cancel();cancelInteraction();clearHint();
     try { showExportPreview(); } catch (_) { /* Export remains available if a preview snapshot cannot be allocated. */ }
    }
    if (!value) restoreExportPreview();
    exporting=value;
    interactButton.disabled=value||!view.ready||!hasInteraction;
    viewerUI.update(true);
   },
   capture:(state,format,quality)=>adapter.capture(state,format,quality),
  beforeExport:signal=>K.awaitExportTask(Promise.resolve(adapter?.prepareExport?.()),signal),
  videoDuration:state=>adapter?.videoDuration?.(state)??state.duration,setBackground:()=>{},
  cameraLevel:()=>cameraLevelActions.has(currentActionKey()) ? !!adapter.levelExport : null,
  setCameraLevel:value=>{if(adapter)adapter.levelExport=value;},
  cameraAngle:()=>currentActionKey()==='qisheng_3:normal_touch' ? adapter.levelAngle ?? 0 : null,
  setCameraAngle:value=>{if(adapter)adapter.levelAngle=value;},
  soundEnabled:()=>!muted,setSoundEnabled:enabled=>{if(muted===enabled)$('sound').click();},volume:()=>volume,
  setVolume,voiceTab:'voice',
  drawableOrder:part=>evidence.model?.internalModel.coreModel.getModel().drawables.renderOrders[part.index]||0,
 }
});
K.initCleanChrome();
function refreshVoiceControls(){
 const value=$('voice').value;
 $('voice').replaceChildren(...selected.voice.activeClips.map(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=(labels[c.cue]||c.cue)+(c.variant==='skin'?' · 皮肤':'')+(c.threshold?' · '+(c.threshold>=1000?'誓约':'好感')+' '+(c.threshold>=1000?c.threshold-1000:c.threshold):'');return o;}));
 if([...$('voice').options].some(option=>option.value===value))$('voice').value=value;
 $('interaction-voice').hidden=!selected.voice.activeClips.length;
}
function controls(){
 $('animation').replaceChildren(...selected.animations.map(name=>{const o=document.createElement('option');o.value=o.textContent=name;return o;}));$('animation').disabled=false;$('play').disabled=false;viewerUI.refreshAnimations();
 for(const id of ['reset-state','show-hint'])$(id).disabled=false;
 const areas=new Set(array(selected.interaction.hitAreas).map(h=>h.id));
 // Basic head/body voice reactions are available by tapping in view mode.
 // The dedicated mode is only for authored gesture/state interactions.
 hasInteraction=selected.type==='live2d'
  ? array(selected.interaction.configs).some(config=>areas.has(config.draw_able_name)&&evidence.model.internalModel.getDrawableIndex(config.draw_able_name)>=0&&
    (config.offset_x||config.offset_y||config.offset_circle||[2,3,6,8,9,11,15].includes(Number(config.action_trigger?.type))))
  : areas.size>0&&array(selected.interaction.spine?.drag_data?.config_client).length>0;
 const tab=document.querySelector('[data-panel-tab="interaction"]');
 interactButton.hidden=!hasInteraction;tab.hidden=tab.disabled=!hasInteraction;
 $('fixed-view-setting').hidden=!hasInteraction||selected.type!=='live2d';
 evidence.interaction.available=hasInteraction;
 refreshVoiceControls();
 $('interaction-note').textContent='点按、长按或拖动立绘互动；也可点击下一步浏览动作。';
 $('interaction-voice').hidden=!selected.voice.activeClips.length;
}
function loopPhase(time, duration) {
 const phase = time % duration;
 const normalized = phase < 0 ? phase + duration : phase;
 return normalized >= duration - 1e-7 ? 0 : normalized;
}

function stageBoundsForFrame(frame) {
 return {
  width: frame.maxX - frame.minX,
  height: frame.maxY - frame.minY,
  x: (frame.minX + frame.maxX) / 2,
  y: (frame.minY + frame.maxY) / 2,
 };
}
function sceneExportCrop(model, motion, format) {
 if (editor.hidden.size || editor.poses.size) return null;
 return authoredSceneExportCrop(model.id, motion, format);
}
function insetLive2DFrame(frame, inset) {
 if (!frame || !inset) return frame;
 const [left, top, right, bottom] = inset;
 const width = frame.maxX - frame.minX, height = frame.maxY - frame.minY;
 return { ...frame, minX: frame.minX + width * left, minY: frame.minY + height * top,
  maxX: frame.maxX - width * right, maxY: frame.maxY - height * bottom };
}
function intersectMatteEdges([a, b], [c, d]) {
 const ax = b.x - a.x, ay = b.y - a.y, bx = d.x - c.x, by = d.y - c.y;
 const determinant = ax * by - ay * bx;
 if (Math.abs(determinant) < 1) return null;
 const t = ((c.x - a.x) * by - (c.y - a.y) * bx) / determinant;
 return new PIXI.Point(a.x + ax * t, a.y + ay * t);
}
function matteAperture(edges, internal, minOpacity = .99, requireVisible = false) {
 const model = internal.coreModel, opacity = model.getModel().drawables.opacities;
 const lines = [];
 for (const [id, start, end] of edges) {
  const index = internal.getDrawableIndex(id);
  if (index < 0 || opacity[index] < minOpacity || editor?.hidden.has(id)
      || (requireVisible && !model.getDrawableDynamicFlagIsVisible(index))) return null;
  const vertices = internal.getDrawableVertices(index);
  if (!vertices || Math.max(start, end) * 2 + 1 >= vertices.length) return null;
  lines.push([start, end].map(position => internal.localTransform.apply(
   new PIXI.Point(vertices[position * 2], vertices[position * 2 + 1]),
  )));
 }
 const [top, left, bottom, right] = lines;
 const corners = [intersectMatteEdges(top, left), intersectMatteEdges(bottom, left),
  intersectMatteEdges(bottom, right), intersectMatteEdges(top, right)];
 if (corners.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
 // When the shutter closes, its inner edges cross. Keep the stage frame for that cut.
 const [p, q, r] = corners;
 if ((q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y) < 100000) return null;
 return corners;
}
function mattePoints(points, internal, minOpacity = .2, requireVisible = false) {
 const corners = [];
 const model = internal.coreModel, {opacities} = model.getModel().drawables;
 for (const [id, point] of points) {
  const index = internal.getDrawableIndex(id);
  if (index < 0 || opacities[index] < minOpacity || editor?.hidden.has(id)
      || (requireVisible && !model.getDrawableDynamicFlagIsVisible(index))) return null;
  const vertices = internal.getDrawableVertices(index);
  if (!vertices || point * 2 + 1 >= vertices.length) return null;
  corners.push(internal.localTransform.apply(new PIXI.Point(vertices[point * 2], vertices[point * 2 + 1])));
 }
 return corners;
}
function live2DFrameAtPose(frame, internal) {
 const anchor = frame?.anchor;
 if (!anchor) return frame;
 if (anchor.points) {
  const corners = mattePoints(anchor.points, internal, anchor.trackWhenTransparent ? 0 : anchor.minOpacity,
   !anchor.trackWhenTransparent && anchor.minOpacity !== undefined);
  return corners ? cropAtMatteCorners(frame, anchor, corners, 1) : frame;
 }
 if (anchor.edges) {
  const corners = matteAperture(anchor.edges, internal, anchor.trackWhenTransparent ? 0 : anchor.minOpacity,
   !anchor.trackWhenTransparent && anchor.reviewed);
  return corners ? cropAtMatteCorners(frame, anchor, corners, 1) : frame;
 }
 const index = internal.getDrawableIndex(anchor.drawable);
 if (index < 0) return frame;
 let weight = 1;
 if (anchor.whenVisible || anchor.fadeToFrame) {
  const model = internal.coreModel;
  const opacity = model.getModel().drawables.opacities[index];
  if (editor?.hidden.has(anchor.drawable)) return frame;
  if (!anchor.trackWhenTransparent && (!model.getDrawableDynamicFlagIsVisible(index)
      || opacity < (anchor.minOpacity ?? (anchor.fadeToFrame ? .001 : .2)))) return frame;
  if (anchor.fadeToFrame) weight = Math.min(1, opacity);
 }
 const vertices = internal.getDrawableVertices(index);
 if (!vertices || (anchor.vertexCount && vertices.length !== anchor.vertexCount * 2)
  || (!anchor.corners && vertices.length !== 8)) return frame;
 const indices = anchor.corners ?? [0, 1, 2, 3];
 if (indices.some(i => i * 2 + 1 >= vertices.length)) return frame;
 const matrix = internal.localTransform;
 const points = indices.map(i => matrix.apply(new PIXI.Point(vertices[i * 2], vertices[i * 2 + 1])));
 if (!anchor.corners && !anchor.includeCorners) {
  // Cubism quads can list opposite corners consecutively. Walk the perimeter
  // so the inscribed crop is never measured against a crossing diagonal.
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  points.sort((a, b) => Math.atan2(a.y - y, a.x - x) - Math.atan2(b.y - y, b.x - x));
 }
 const crop = cropAtMatteCorners(frame, anchor, points, weight);
 const aperture = anchor.aperture && matteAperture(anchor.aperture, internal, .12);
 return aperture ? cropInsideAperture(crop, aperture) : crop;
}
function cropInsideAperture(crop, corners, keepOpening = false) {
 const cos = Math.cos(crop.rotation ?? 0), sin = Math.sin(crop.rotation ?? 0);
 const [topLeft, bottomLeft, bottomRight, topRight] = corners.map(({ x, y }) => ({
  x: x * cos - y * sin, y: x * sin + y * cos,
 }));
 const minX = Math.max(crop.minX, topLeft.x, bottomLeft.x);
 const maxX = Math.min(crop.maxX, topRight.x, bottomRight.x);
 const minY = Math.max(crop.minY, topLeft.y, topRight.y);
 const maxY = Math.min(crop.maxY, bottomLeft.y, bottomRight.y);
 if (minX === crop.minX && maxX === crop.maxX && minY === crop.minY && maxY === crop.maxY) return crop;
 if (keepOpening && maxX > minX && maxY > minY) return {minX,minY,maxX,maxY,rotation:crop.rotation};
 // Keep the opening inside the underlying artwork, including while the bars move.
 const aspect = (crop.maxX - crop.minX) / (crop.maxY - crop.minY);
 const height = Math.min(maxY - minY, (maxX - minX) / aspect) * .99;
 if (height < 1) return crop;
 const width = height * aspect, x = (minX + maxX) / 2, y = (minY + maxY) / 2;
 return { minX: x - width / 2, minY: y - height / 2,
  maxX: x + width / 2, maxY: y + height / 2, rotation: crop.rotation };
}
function cropAtMatteCorners(frame, anchor, points, weight) {
 const edge = anchor.alignTop ? points[3] : anchor.align ? points[1] : null;
 const rotation = edge ? -Math.atan2(edge.y - points[0].y, edge.x - points[0].x) : frame.rotation ?? 0;
 const cos = Math.cos(rotation), sin = Math.sin(rotation);
 const corners = edge ? points.map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos })) : points;
 let centerX = 0, centerY = 0;
 for (const corner of corners) {
  centerX += corner.x / 4;
  centerY += corner.y / 4;
 }
 const span = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
 const aspect = anchor.aspect ?? (anchor.nativeAspect
  ? (span(points[0], points[3]) + span(points[1], points[2])) / (span(points[0], points[1]) + span(points[3], points[2]))
  : (frame.maxX - frame.minX) / (frame.maxY - frame.minY));
 if (!Number.isFinite(aspect) || aspect <= 0) return frame;
 let halfHeight;
 if (anchor.includeCorners) {
  halfHeight = Math.max(...corners.map(corner => Math.max(Math.abs(corner.x - centerX) / aspect, Math.abs(corner.y - centerY))));
 } else {
  // Fit a rectangle of constant aspect ratio inside the projected artwork.
  halfHeight = Infinity;
  for (let i = 0; i < corners.length; i++) {
   const a = corners[i], b = corners[(i + 1) % corners.length];
   const nx = b.y - a.y, ny = a.x - b.x;
   halfHeight = Math.min(halfHeight, Math.abs(nx * (centerX - a.x) + ny * (centerY - a.y)) / (Math.abs(nx) * aspect + Math.abs(ny)));
  }
  halfHeight *= .98;
 }
 if (!Number.isFinite(halfHeight) || halfHeight < 1) return frame;
 halfHeight = Math.max(halfHeight, (anchor.minWidth ?? 0) / (2 * aspect));
 if (anchor.outset > 0) halfHeight *= 1 + 2 * Math.min(.15, anchor.outset);
 const halfWidth = halfHeight * aspect;
 // Ignore a shutter whose opening is still wider than the camera's scene.
 if (anchor.maxOpeningWidth > 0 && halfWidth * 2 > anchor.maxOpeningWidth) return frame;
 const crop = { minX: centerX - halfWidth, minY: centerY - halfHeight * (1 + 2 * (anchor.headroom ?? 0)),
  maxX: centerX + halfWidth, maxY: centerY + halfHeight, rotation };
 if (weight === 1) return crop;
 // As the opening matte fades, reveal the rest of the full scene continuously.
 for (const edge of ['minX', 'minY', 'maxX', 'maxY']) crop[edge] = frame[edge] + (crop[edge] - frame[edge]) * weight;
 return crop;
}
function live2DExportWindowAtPose(id, motion, internal) {
 const spec = authoredLive2DExportWindow(id, motion);
 if (!spec) return null;
 const index = internal.getDrawableIndex(spec.drawable);
 const model = internal.coreModel;
 if (index < 0 || editor?.hidden.has(spec.drawable) || !model.getDrawableDynamicFlagIsVisible(index)
  || model.getModel().drawables.opacities[index] < .2) return null;
 if (spec.frame) return spec.frame;
 const anchor = { drawable:spec.drawable, corners:spec.corners, whenVisible:true };
 const probe = { anchor:{...anchor, nativeAspect:true} };
 const frame = live2DFrameAtPose(probe, internal);
 // A window used by another phase may be invisible. Keep the normal
 // pixel bounds for that phase rather than applying a stale aperture.
 if (frame === probe) return null;
 return {...frame, anchor};
}
async function live2dPortrait(model,generation){
 installMotionCompatibility(PIXI.live2d);
 const app=new PIXI.Application({view:canvas,autoStart:false,antialias:true,backgroundAlpha:0,resolution:Math.max(2,devicePixelRatio||1),autoDensity:true,preserveDrawingBuffer:true});
 let live, preparedSettings;
 const dispose=()=>{const gl=app.renderer?.gl,core=live?.internalModel?.coreModel,native=core?.getModel(),moc=native&&mocOwners.get(native);try{live?.destroy({children:true,texture:true,baseTexture:true});app.destroy(false,{children:true,texture:true,baseTexture:true});}catch{}finally{preparedSettings?.release();}if(moc&&!core?.getModel()&&!releasedMocs.has(moc)){moc._release();releasedMocs.add(moc);releasedMocCount++;}try{gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}};
 try {
  let settings = model.modelUrl;
  if (model.id === 'zhenzhuhao_2') {
   let lastProgress = '';
   preparedSettings = await prepareLive2DSettings(model.modelUrl, {
    signal: loadAbort.signal, motions: [model.defaultAnimation || 'idle'],
    onProgress(text, metrics) {
     if (generation !== loadGeneration || text === lastProgress) return;
     lastProgress = text;
     $('status').textContent = text;
     loadingPreview.progress(generation, text, metrics);
    },
   });
   loadingPreview.progress(generation, '正在解码珍珠号立绘');
   settings = new PIXI.live2d.Cubism4ModelSettings(preparedSettings.settings);
   const resolveFile = settings.resolveURL.bind(settings);
   // The SDK's legacy URL resolver rewrites the scheme inside blob URLs.
   settings.resolveURL = file => file.startsWith('blob:') ? file : resolveFile(file);
  }
  live = await PIXI.live2d.Live2DModel.from(settings, {
   autoInteract: false, autoUpdate: false, motionPreload: PIXI.live2d.MotionPreloadStrategy.NONE,
  });
  if (generation !== loadGeneration) { dispose(); return null; }
 } catch (error) { dispose(); throw error; }
 app.stage.addChild(live);live.anchor.set(.5,.5);const natural={width:live.internalModel.width,height:live.internalModel.height},internal=live.internalModel,core=internal.coreModel.getModel(),indexes=new Map(core.parameters.ids.map((id,i)=>[id,i]));
 const defaultStageFrame = defaultPortraitStageFrame(model.id);
 const baseFrame = authoredLive2DFrame(model.id) || defaultStageFrame, portraitSurrounds = portraitSurroundNames(model.id);
 const aperture = authoredLive2DSceneAperture(model.id);
 const apertureRule = motion => {
  const generated = automaticSceneAperture(model.id,motion);
  if (generated?.reviewed && generated.trackWhenTransparent) return generated;
  const shot=aperture?.shots?.find(rule=>rule.motions.test(motion));
  if (shot) return shot;
  if (generated?.reviewed) return generated;
  if (!aperture?.reviewed) return generated ?? aperture;
  return !aperture.motions || aperture.motions.test(motion) ? aperture : generated;
 };
 const hasApertureFallback = motion => !!aperture && (!aperture.reviewed || !!aperture.fallback)
  && (!aperture.motions || aperture.motions.test(motion));
 const frameForAperture = rule => {
  if (rule?.fixedFrame) return rule.fixedFrame;
  if (!rule) return null;
  const resolve = source => {
   const probe = { anchor:{...source,nativeAspect:true,alignTop:!source.preserveAngle,whenVisible:true} };
   const frame = live2DFrameAtPose(probe, internal);
   return frame === probe ? null : frame;
  };
  let source = rule;
  let frame = resolve(source);
  if (!frame && rule.alternate) {
   source = {...rule,...rule.alternate};
   frame = resolve(source);
  }
  if (!frame) return null;
  for (const limit of source.inside ?? []) {
   const corners = limit.edges ? matteAperture(limit.edges, internal) : mattePoints(limit.points, internal);
   if (corners) frame = cropInsideAperture(frame, corners, limit.keepOpening);
  }
  return insetLive2DFrame(frame, source.inset);
 };
 const apertureAtPose = (motion = activeMotion) => frameForAperture(apertureRule(motion));
 const apertureFallback = aperture && (aperture.fallback || baseFrame ||
  { minX:0, minY:0, maxX:natural.width, maxY:natural.height });
 const pivotX = natural.width / 2, pivotY = natural.height / 2;
 evidence.model=live;evidence.app=app;editor=window.createInteractionLive2DEditor({live,core,hitAreas:model.interaction.hitAreas});const mouthIds=internal.settings.json.Groups?.find(g=>g.Name==='LipSync')?.Ids||(model.id==='nabulesi_3'&&indexes.has('ParamMouthOpenY')?['ParamMouthOpenY']:[]);
 let effectTimeline, effectBaseParameters, sampleExportPose;
 const renderedParameters=core.parameters.values.slice(), effectParameterIndices=new Set();
 const dragCover = model.id === 'wuqi_3' ? core.drawables.ids.indexOf('ArtMesh766') : -1;
 const coverDragParameter = indexes.get('touch_drag6');
 let activeMotion=model.defaultAnimation, coverMotion;
 let interfaceCovers=[], savedCoverOpacity=new Float32Array(0);
 const hotspots = model.interaction.hitAreas.map(area => ({ ...area, index: internal.getDrawableIndex(area.id) })).filter(area => area.index >= 0);
 const hotspotVertices = ({ index }) => {
  const { drawables } = core;
  if (drawables.opacities[index] <= .001 || !internal.coreModel.getDrawableDynamicFlagIsVisible(index)) return null;
  return internal.getDrawableVertices(index);
 };
 // PIXI's Live2DModel.update only queues elapsed time; native deformation runs
 // inside app.render. Apply visibility after that update and before drawing.
 const nativeDraw = internal.draw.bind(internal);
 internal.draw = gl => {
  viewerUI.tools.after();
  if (coverMotion !== activeMotion) {
   coverMotion=activeMotion;
   // Keep the drawable available to the camera's aperture calculation.
   const covers = authoredLive2DInterfaceCovers(model.id, coverMotion).concat(authoredLive2DScreenEdges(model.id, coverMotion));
   interfaceCovers=[...new Set(covers)].map(id => internal.getDrawableIndex(id)).filter(index => index >= 0);
   savedCoverOpacity=new Float32Array(interfaceCovers.length);
  }
  // The converted drag cover is opaque at rest and hides the entire room.
  const hideDragCover = dragCover >= 0 && coverDragParameter !== undefined && !(renderedParameters[coverDragParameter] > .001);
  if (!interfaceCovers.length && !hideDragCover) return nativeDraw(gl);
  const opacities = core.drawables.opacities, dragOpacity = hideDragCover ? opacities[dragCover] : 0;
  if (hideDragCover) opacities[dragCover] = 0;
  for (let i = 0; i < interfaceCovers.length; i++) {
   const index = interfaceCovers[i];
   savedCoverOpacity[i] = opacities[index];
   opacities[index] = 0;
  }
  try { nativeDraw(gl); }
  finally {
   for (let i = 0; i < interfaceCovers.length; i++) opacities[interfaceCovers[i]] = savedCoverOpacity[i];
   if (hideDragCover) opacities[dragCover] = dragOpacity;
  }
 };
 const lookParams=array(model.interaction.lookParameters).filter(p=>indexes.has(p.id));
 const manager=internal.motionManager,queue=manager.queueManager||manager.motionManager;
 configurePortraitMotions(manager,model,core.parameters);
 configurePortraitRendering(internal.renderer,core.drawables,model.id);
 // A separate queue retains the Unity effect layer when the base motion changes.
 let effectLoad;
 const loadEffect = () => effectLoad ||= (async () => {
  if (!model.animations.includes('effect') || !queue?.constructor) return;
  const motion = await manager.loadMotion('effect', 0);
  if (generation !== loadGeneration) return;
  if (!motion) throw Error('背景特效暂时无法加载');
  effectTimeline = new EffectTimeline(new queue.constructor(), motion);
  effectBaseParameters = core.parameters.values.slice();
  for (const id of effectTimeline.parameterIds) if (indexes.has(id)) effectParameterIndices.add(indexes.get(id));
  api.effectTimeline = hasEffectControls(model.id) ? effectTimeline : null;
  delete evidence.effectLayerError;
  viewerUI.refreshAnimations(); viewerUI.update(true);
 })().catch(error => { effectLoad = null; if (generation === loadGeneration) evidence.effectLayerError = String(error); throw error; });
 if(generation!==loadGeneration){dispose();return null;}
 internal.on('beforeModelUpdate',()=>{
  const parameters=core.parameters;
  effectBaseParameters?.set(parameters.values);
  if(sampleExportPose)sampleExportPose();
  else if(effectTimeline){try{effectTimeline.sample(internal.coreModel);}catch(e){evidence.effectLayerError=String(e);effectTimeline=null;api.effectTimeline=null;}}
  const ignoreLook=controller?.states?.some(s=>s.active&&s.config.ignore_react===1);
  if(!ignoreLook)for(const p of lookParams){const i=indexes.get(p.id),rates=model.skinConfig.l2d_drag_rate,rate=Array.isArray(rates)?rates[p.axis]??1:1,value=p.factor*(p.axis===0?look.x:p.axis===1?look.y:look.x*look.y)*rate,range=model.skinConfig.l2d_para_range?.[p.id]||[parameters.minimumValues[i],parameters.maximumValues[i]];parameters.values[i]=Math.max(range[0],Math.min(range[1],parameters.values[i]+value));}
  const applied={};for(const p of controller?.parameters?.()||[]){const i=indexes.get(p.id);if(i===undefined)continue;let value=p.mode===2?parameters.values[i]+p.value:p.mode===3?parameters.values[i]*p.value:p.value;value=Math.max(parameters.minimumValues[i],Math.min(parameters.maximumValues[i],value));parameters.values[i]=value;applied[p.id]=value;}evidence.interaction.appliedParameters=applied;
  const gain=model.skinConfig.lip_sync_gain||model.interaction.mouth?.Gain||4;
  const ring=indexes.get('Paramring');if(ring!==undefined)parameters.values[ring]=controller?.state.favor>=1000?1:0;
  for(const id of mouthIds){const i=indexes.get(id);if(i!==undefined&&evidence.audio.state==='playing')parameters.values[i]=Math.max(parameters.values[i],Math.min(1,mouth*gain));}
  evidence.audio.mouthValues=Object.fromEntries(mouthIds.map(id=>[id,parameters.values[indexes.get(id)]]));editor?.applyParameters?.();renderedParameters.set(parameters.values);
 });
 let playSerial=0;
 let stageCrop = authoredLive2DFrame(model.id, activeMotion) || defaultStageFrame;
 let displayedStageCrop, renderedStageMotion, stageCropFixed = false;
 let stageClip = null;
 const api={sound,stopAudio,fold,look:()=>look,parameter:id=>{const i=indexes.get(id);return i===undefined?undefined:core.parameters.values[i];},
  prepareExport:async()=>{await loadEffect();if(generation===loadGeneration)api.refreshEffect();},
  setInteractionViewFixed:fixed=>{stageCropFixed=fixed&&!apertureAtPose()&&!stageCrop?.anchor&&displayedStageCrop!==undefined;},
  refit:()=>{refitPending=true;},
  effectTimeline:null,
  refreshEffect:()=>{
   if(!effectTimeline)return;
   // A paused background seek must not rerun character fades or physics.
   const base=core.parameters.values.slice(),frame=renderedParameters.slice();
   core.parameters.values.set(effectBaseParameters);internal.emit('beforeModelUpdate');
   for(let i=0;i<frame.length;i++)if(!effectParameterIndices.has(i))core.parameters.values[i]=frame[i];
   renderedParameters.set(core.parameters.values);internal.coreModel.update();core.parameters.values.set(base);
   live.deltaTime=0;app.render();evidence.effect=effectTimeline.state();
  },
  play:async(name,loop,options={})=>{
   const serial=++playSerial;
   const waiting=setTimeout(()=>{if(generation===loadGeneration&&serial===playSerial){evidence.loadingMotion=name;$('status').textContent='正在加载动作 '+name+'，当前画面继续播放…';}},150);
   let motion;
   try { motion=await manager.loadMotion(name,0); }
   catch(error){if(generation===loadGeneration&&serial===playSerial)K.toast('动作加载失败，可再次点击重试：'+name,'err');throw error;}
   finally{clearTimeout(waiting);if(generation===loadGeneration&&serial===playSerial){delete evidence.loadingMotion;$('status').textContent=stageName(model)+' · '+model.animations.length+' 个动作';}}
   if(generation!==loadGeneration||serial!==playSerial)return;
   if(!motion)throw Error('动作不可用 '+name);
   motion.setIsLoop(loop);
   // Explicitly replaying the same action (including Reset) must restart its
   // clock as well; the library otherwise refuses it as already playing.
   if(manager.state.currentGroup===name)manager.state.complete();
   const started=await live.motion(name,0,3);
   if(generation!==loadGeneration||serial!==playSerial)return;
   if(!started)throw Error('动作未能开始 '+name);
   activeMotion=evidence.animation=name;
   stageCrop = authoredLive2DFrame(model.id, name) || defaultStageFrame;
   $('animation').value=name;
   if (!view.playing) {
    // A paused clock cannot finish a crossfade. Display the selected pose
    // immediately instead of retaining the outgoing action indefinitely.
    const entries=queue?._motions||[];
    for(const entry of entries.slice(0,-1))entry.setIsFinished(true);
    internal.update(0,live.elapsedTime);
    api.seek(0,0,true,true);
   }
   // Start optional background work only after the first playable action is ready.
   void loadEffect().catch(()=>{});
  },
  idle:index=>{const state=index?'idle'+index:'idle',name=model.animator?.states?.[state]?.motion||state;if(manager.definitions[name])manager.loadMotion(name,0).catch(()=>{});},
  world:(x,y)=>{const p=live.toModelPosition(new PIXI.Point(x,y));return {x:p.x,y:p.y};},
  hits:(x,y)=>{
   const p=api.world(x,y),d=core.drawables,hits=[];
   if (stageClip && (x < stageClip.left || x > stageClip.right || y < stageClip.top || y > stageClip.bottom)) return hits;
   for(const h of hotspots){const i=h.index,vertices=hotspotVertices(h);if(!vertices?.length)continue;let hit=false;
    if(h.precision===1)hit=triangleContains(p.x,p.y,vertices,d.indices[i]);
    else {let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(let j=0;j<vertices.length;j+=2){minX=Math.min(minX,vertices[j]);maxX=Math.max(maxX,vertices[j]);minY=Math.min(minY,vertices[j+1]);maxY=Math.max(maxY,vertices[j+1]);}hit=p.x>=minX&&p.x<=maxX&&p.y>=minY&&p.y<=maxY;}
    if(hit)hits.push({id:h.id,order:d.renderOrders[i]});
   }return hits.sort((a,b)=>b.order-a.order).map(h=>h.id);
  },
  duration:name=>model.motionDurations?.[name]||0,
  timeline:()=>{const item=[...(queue?._motions||[])].reverse().find(item=>!item.isFinished()&&item._motion);const duration=model.motionDurations?.[activeMotion]||item?._motion?.getLoopDuration?.()||0,elapsed=item?.isStarted()?Math.max(0,item.getStateTime()-item.getStartTime()):0,loop=!!item?._motion?.isLoop?.();return {name:activeMotion,time:duration?(loop?elapsed%duration:Math.min(duration,elapsed)):0,duration,loop};},
  seek:(seconds,delta=0,draw=true,settleFade=false)=>{const item=[...(queue?._motions||[])].reverse().find(item=>!item.isFinished()&&item._motion);if(!item)return;const duration=model.motionDurations?.[activeMotion]||item._motion.getLoopDuration(),time=Math.max(0,Math.min(duration-.0001,seconds)),clock=live.elapsedTime/1000;const fade=settleFade?Math.max(0,item._motion.getFadeInTime(),...item._motion._motionData.curves.map(curve=>curve.fadeInTime||0)):0;item.setStartTime(clock-time);item.setFadeInStartTime(clock-time-fade);item.setEndTime(item._motion.isLoop()?-1:clock-time+duration);item.setIsFinished(false);item.setLastCheckEventSeconds(clock);internal.update(delta*1000,live.elapsedTime);live.deltaTime=0;if(draw)app.render();},
  polygons:()=>hotspots.map(h=>{const vertices=hotspotVertices(h);if(!vertices?.length)return null;const pts=[];for(let j=0;j<vertices.length;j+=2){const p=new PIXI.Point(vertices[j],vertices[j+1]);internal.localTransform.apply(p,p);live.worldTransform.apply(p,p);pts.push([p.x,p.y]);}return {id:h.id,vertices:pts};}).filter(Boolean)
 };
 function exportLoopPlan(playback, captureMotion, effect, reviewedFormat) {
  const {duration,name} = playback;
  if (!playback.loop || !/^idle\d*$/.test(name) || !Number.isFinite(duration) || duration <= 0 ||
      !captureMotion?._motion?.isLoop()) return null;
  const reviewedDefault = blendedVideoPortraits.has(model.id) &&
   (name === model.defaultAnimation || model.id === 'wuerlixi_3' && name === 'idle1');
  const reviewedEffect = reviewedFormat && (loopedEffectPortraits.has(model.id) || reviewedDefault);
  const continuousEffect = model.motionLoop?.effect === true && effectTimeline?.blendableIds.size>0;
  const alignEffect = !!effect && !effect.fixed && (reviewedEffect || continuousEffect);
  if (!alignEffect) return {duration,alignEffect,transition:0};
  const effectElapsed = duration * effect.speed;
  const cycles = Math.round(effectElapsed / effect.duration);
  const closes = cycles > 0 && Math.abs(effectElapsed - cycles * effect.duration) < .0001;
  // Keep the character's original cycle. Ease only the effect's animated
  // values into the phase they would have just before the first frame.
  return {duration,alignEffect,reviewedEffect,transition:closes ? 0 : Math.min(2, duration / 3)};
 }
 api.videoDuration = playback => playback.duration;
 api.capture=(playback={},format,quality)=>{
  const motion = playback.name || activeMotion;
  const levelFrame = api.levelExport ? authoredLive2DLevelFrame(model.id, motion) : null;
  const safeCrop = sceneExportCrop(model, motion, format);
  const rule = apertureRule(motion);
  const useAperture = !!rule && !levelFrame;
  const followReviewedScene = useAperture && rule.reviewed;
  const motionFrame = levelFrame ?? (safeCrop?.inset ? null : safeCrop) ?? authoredLive2DExportFrame(model.id, motion)
   ?? live2DExportWindowAtPose(model.id, motion, internal) ?? (hasApertureFallback(motion) ? apertureFallback : null);
  // When a separate screen matte goes away, return to the camera the preview
  // was using for the full scene. The previous inset would clip the reveal.
  const fallback = followReviewedScene && fittingBounds ? {
   minX:fittingBounds.x-fittingBounds.width/2, minY:fittingBounds.y-fittingBounds.height/2,
   maxX:fittingBounds.x+fittingBounds.width/2, maxY:fittingBounds.y+fittingBounds.height/2,
  } : null;
  const captureAperture = () => useAperture ? apertureAtPose(motion) : null;
  const captureFrameAtPose = (opening = captureAperture()) => opening
   || insetLive2DFrame(live2DFrameAtPose(motionFrame || fallback, internal), safeCrop?.inset);
  const animatedMatte = !useAperture && motionFrame?.anchor?.fadeToFrame && (format === 'video' || format === 'gif');
  const authoredFrame = animatedMatte ? motionFrame : captureFrameAtPose();
  let exportRotation = authoredFrame?.rotation ?? 0;
  if (api.levelExport && model.id === 'xinnong_5' && playback.name === 'idle18') {
   const index = internal.getDrawableIndex('ArtMesh370');
   if (index >= 0) {
    const v = internal.getDrawableVertices(index), matrix = internal.localTransform;
    const left = matrix.apply(new PIXI.Point(v[2], v[3])), right = matrix.apply(new PIXI.Point(v[0], v[1]));
    exportRotation = -Math.atan2(right.y-left.y, right.x-left.x);
   }
  }
  const rotateExport = p => { const c=Math.cos(exportRotation),s=Math.sin(exportRotation);return {x:p.x*c-p.y*s,y:p.x*s+p.y*c}; };

  const hitMeshes=new Set(model.interaction.hitAreas.map(area=>area.id));
  const surrounds=new Set([...portraitSurrounds, ...authoredLive2DExportHidden(model.id, motion), ...(motionFrame?.hiddenDrawables ?? [])]);
  const measure=()=>{
  const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity},rectangles=[];
  for(let i=0;i<core.drawables.ids.length;i++){
   if(hitMeshes.has(core.drawables.ids[i])||surrounds.has(core.drawables.ids[i])||!internal.coreModel.getDrawableDynamicFlagIsVisible(i)||core.drawables.opacities[i]<=.001||editor.hidden.has(core.drawables.ids[i])||!core.drawables.indices[i].length)continue;
   const vertices=internal.getDrawableVertices(i);
   const b={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
   for(let j=0;j<vertices.length;j+=2){const p=rotateExport(internal.localTransform.apply(new PIXI.Point(vertices[j],vertices[j+1])));b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);}
   // Screen-filling backdrop meshes can span over 100,000 pixels. Their
   // meaningful frame is the authored model canvas, not an infinite backdrop.
   if(b.maxX-b.minX>natural.width*4||b.maxY-b.minY>natural.height*4){b.minX=Math.max(0,b.minX);b.maxX=Math.min(natural.width,b.maxX);b.minY=Math.max(0,b.minY);b.maxY=Math.min(natural.height,b.maxY);}
   if(b.maxX>b.minX&&b.maxY>b.minY){rectangles.push({name:core.drawables.ids[i],bounds:[b.minX,b.minY,b.maxX,b.maxY]});for(const key of Object.keys(bounds))bounds[key]=key.startsWith('min')?Math.min(bounds[key],b[key]):Math.max(bounds[key],b[key]);}
  }
  return model.id==='guanghui_9'?portraitFrameBounds(model.id,rectangles)||bounds:bounds;};
  let bounds = authoredFrame || measure();
  if (authoredFrame && followReviewedScene && rule.animationAspect && (format === 'video' || format === 'gif')) {
   // An animation has one output size even when an authored opening changes
   // shape. Size the file independently of the pose displayed at export time.
   const fit = stageBoundsForFrame(authoredFrame);
   const halfWidth = fit.width / 2, halfHeight = halfWidth / rule.animationAspect;
   bounds = {minX:fit.x-halfWidth, minY:fit.y-halfHeight, maxX:fit.x+halfWidth, maxY:fit.y+halfHeight};
  }
  const transform={x:live.x,y:live.y,sx:live.scale.x,sy:live.scale.y,px:live.pivot.x,py:live.pivot.y,rotation:live.rotation};
  const parameters=core.parameters.values.slice(),renderedFrame=renderedParameters.slice(),effectBaseFrame=effectBaseParameters?.slice(),parts=core.parts.opacities.slice(),nativeSaved=internal.coreModel._savedParameters.slice(),resolution=app.renderer.resolution;
  const originalQueue = queue?._motions;
  const captureMotion = [...(originalQueue || [])].reverse().find(item => !item.isFinished() && item._motion);
  const restorePhysics=preserveSimulation(internal.physics),restoreEffect=preserveSimulation(effectTimeline?.manager),entries=[...(originalQueue||[])].map(item=>({item,values:{...item}})),elapsed=live.elapsedTime,delta=live.deltaTime,savedEffect=effectTimeline?.snapshot();
  const video = format === 'video', animated = video || format === 'gif';
  const reviewedGif = format === 'gif' && ['curtains','wheel'].includes(effectControlPortraits[model.id]);
  const reviewedFormat = video || reviewedGif;
  const goldenHind = ['jinluhao_2','jinluhao_3'].includes(model.id) && model.motionLoop?.[motion] === true;
  const goldenHindGif = format === 'gif' && goldenHind;
  const syncGifEffect = format === 'gif' && savedEffect && model.motionLoop?.effect === true;
  const loop = reviewedFormat || syncGifEffect || goldenHindGif
   ? exportLoopPlan(playback, captureMotion, savedEffect, reviewedFormat) : null;
  const warmCharacter = loop && (reviewedFormat || goldenHindGif);
  const breath = internal.breath;
  const breathTime = breath?._currentTime;
  const loopTimeline = warmCharacter && K.exportTimeline(loop.duration, quality, format);
  const step = loopTimeline ? loopTimeline.duration / loopTimeline.frames : 0;
  const warmFrames = warmCharacter ? Math.ceil(Math.min(2, loop.duration) / step) : 0;
  const warmTime = warmFrames * step;
  // This skin has looping idle clips whose continuous deformation tracks
  // end at a different pose. Close the loop in the rig before drawing, while
  // texture switches and the independently animated background stay intact.
  const motionData = loop && goldenHind && captureMotion._motion._motionData;
  const poseChannels = motionData ? motionData.curves.flatMap(curve => {
   const i = indexes.get(curve.id);
   if (curve.type !== 1 || i === undefined || effectParameterIndices.has(i)) return [];
   const segments = motionData.segments.slice(curve.baseSegmentIndex, curve.baseSegmentIndex + curve.segmentCount);
   return segments.some(segment => segment.segmentType > 1) ? [] : [i];
  }) : [];
  const poseBlend = poseChannels.length ? Math.min(1, loop.duration / 5) : 0;
  const openingBlend = model.id === 'jinluhao_3' && ['idle17','idle22'].includes(motion) ? .16 : 0;
  let firstPose;
  const effectChannels = loop?.transition ? [
   [core.parameters.ids, core.parameters.values], [core.parts.ids, core.parts.opacities],
  ].map(([ids,values]) => ({
   values, original: values.slice(), alternate: values.slice(),
   indices: ids.flatMap((id,i)=>loop.reviewedEffect||effectTimeline.blendableIds.has(id)?[i]:[]),
  })) : [];
  let lastTime=0,warmed=false;
  // The SDK restores base parameters after deforming a frame. Rebuild from
  // the actual rendered parameters, then restore the base values separately.
  const rewind = () => {
   restorePhysics(); restoreEffect();
   queue._motions = originalQueue;
   if (Number.isFinite(breathTime)) breath._currentTime = breathTime;
   for (const {item, values} of entries) Object.assign(item, values);
   if (savedEffect) effectTimeline.restore(savedEffect);
   if (effectBaseFrame) effectBaseParameters.set(effectBaseFrame);
   live.elapsedTime = elapsed; live.deltaTime = delta;
   core.parameters.values.set(renderedFrame); core.parts.opacities.set(parts);
   internal.coreModel.update();
   core.parameters.values.set(parameters); renderedParameters.set(renderedFrame);
   internal.coreModel._savedParameters = nativeSaved.slice();
   lastTime = 0; warmed = false; firstPose = undefined;
  };
  const sampleEffect = (time, approachOpening = false) => {
   const elapsed = loop?.alignEffect ? time : Math.max(0,time);
   const clock = savedEffect.time + elapsed * savedEffect.speed;
   // A clip starting at the effect's first frame may have a different last
   // pose in the authored effect. Approach the opening within its own cycle.
   const phase = savedEffect.fixed ? savedEffect.time : loopPhase(approachOpening ? Math.max(0,clock) : clock, savedEffect.duration);
   effectTimeline.sample(internal.coreModel, phase, loop?.alignEffect || savedEffect.settled || clock >= savedEffect.duration);
  };
  const sample = (time, draw) => {
   live.elapsedTime = elapsed + (warmTime + time) * 1000;
   if (poseBlend || animated && savedEffect) {
    sampleExportPose = () => {
     const values = core.parameters.values;
     if (poseBlend) {
      if (time === 0) firstPose = values.slice();
      else if (firstPose && time > 0 && time < openingBlend) {
       const fraction = time / openingBlend;
       const blend = fraction * fraction * (3 - 2 * fraction);
       for (const i of poseChannels) values[i] = firstPose[i] + (values[i] - firstPose[i]) * blend;
      } else if (firstPose && time > loop.duration - poseBlend) {
       const fraction = Math.min(1, 1 - (loop.duration - time) / poseBlend);
       const blend = fraction * fraction * (3 - 2 * fraction);
       for (const i of poseChannels) values[i] += (firstPose[i] - values[i]) * blend;
      }
     }
     if (!savedEffect) return;
     if (!loop?.transition) { sampleEffect(time); return; }
     const blendStart = loop.duration - loop.transition;
     if (time <= blendStart) { sampleEffect(time); return; }
     const fraction = Math.min(1, (time - blendStart) / loop.transition);
     const blend = fraction * fraction * (3 - 2 * fraction);
     for (const {values, original} of effectChannels) original.set(values);
     sampleEffect(time - loop.duration, !loop.reviewedEffect);
     for (const {values, original, alternate} of effectChannels) {
      alternate.set(values);
      values.set(original);
     }
     sampleEffect(time);
     for (const {values, alternate, indices} of effectChannels) {
      for (const i of indices) values[i] += (alternate[i] - values[i]) * blend;
     }
    };
   }
   const deltaTime = Math.max(0, time - lastTime);
   // Cubism adds a separate breathing oscillator before the authored effect layer.
   // Keep its phase constant so it does not change across the exported seam.
   if (warmCharacter && Number.isFinite(breathTime)) breath._currentTime = breathTime - deltaTime;
   try {
    // Export the selected clip's actual pose, not the live preview's fade-in
    // from whichever animation happened to be playing before it.
    api.seek(warmCharacter ? loopPhase(time, loop.duration) : time, deltaTime, draw, video || !!warmCharacter);
   } finally {
    sampleExportPose = null;
   }
   lastTime = time;
  };
  const advance = (time, draw = true) => {
   if ((video || warmCharacter) && !warmed) {
    // Isolate the active clip, including touch/main motions in video exports.
    // Keep the original array untouched so rewind restores outgoing fades too.
    queue._motions = captureMotion ? [captureMotion] : [];
    if (warmCharacter) {
     // Enter a looping first frame from its previous cycle to settle physics.
     lastTime = -warmTime;
     for (let frame = warmFrames; frame > 0; frame--) sample(-frame * step, false);
    }
    warmed = true;
   }
   sample(time, draw);
  };
  const resizeCapture = (width, height, resolution) => {
   if (app.renderer.resolution === resolution && app.renderer.screen.width === width && app.renderer.screen.height === height) return;
   app.renderer.resolution = resolution;
   app.renderer.resize(width, height);
  };
  const setCaptureFrame = (size, tile, rotation = exportRotation) => {
   live.pivot.set(0, 0);
   live.rotation = rotation;
   live.scale.set(size.scale);
   live.position.set(size.width / 2 - size.centerX * size.scale - (tile?.x ?? 0),
    size.height / 2 - size.centerY * size.scale - (tile?.y ?? 0));
  };
  let clippedCapture;
  function clipCaptureToArtwork(width, height) {
   const left = Math.max(0, Math.ceil((canvas.width - width) / 2));
   const top = Math.max(0, Math.ceil((canvas.height - height) / 2));
   if (!left && !top) return canvas;
   clippedCapture ||= document.createElement('canvas');
   if (clippedCapture.width !== canvas.width) clippedCapture.width = canvas.width;
   if (clippedCapture.height !== canvas.height) clippedCapture.height = canvas.height;
   const context = clippedCapture.getContext('2d');
   const artworkWidth = canvas.width - 2 * left, artworkHeight = canvas.height - 2 * top;
   context.clearRect(0, 0, canvas.width, canvas.height);
   if (artworkWidth > 0 && artworkHeight > 0) {
    context.drawImage(canvas, left, top, artworkWidth, artworkHeight, left, top, artworkWidth, artworkHeight);
   }
   return clippedCapture;
  }
  return {pixelYUp:false,fixedFrame:authoredFrame && bounds,pngSize:quality=>({...K.exportDimensions(bounds,quality,'png',authoredFrame ? 0 : undefined),fullFrame:true}),
   measure:time=>{editor.before();advance(time);return measure();},rewind,
   draw:(time,size,background)=>{const added=[...surrounds].filter(id=>!editor.hidden.has(id));for(const id of added)editor.hidden.add(id);try{editor.before();
    if(size.fullFrame&&size.tiled!==false)return K.renderTiledPNG(size,tile=>{editor.before();resizeCapture(tile.width,tile.height,1);setCaptureFrame(size,tile);live.deltaTime=0;app.render();return canvas;},background);
    const followArtwork = size.fullFrame && (useAperture || motionFrame?.anchor) && time !== null;
    let clipWidth, clipHeight;
    if(size.fullFrame){
     resizeCapture(size.width,size.height,1);
     if (followArtwork) {
      advance(time, false);
      const opening = captureAperture();
      const poseFrame = captureFrameAtPose(opening);
      if (poseFrame) {
       const fit = stageBoundsForFrame(poseFrame);
       const widthFit = size.width / fit.width, heightFit = size.height / fit.height;
       const contain = animatedMatte || followReviewedScene && Math.max(widthFit, heightFit)>Math.min(widthFit, heightFit)*1.02;
       const scale = contain ? Math.min(widthFit, heightFit) : useAperture ? Math.max(widthFit, heightFit) : widthFit;
       setCaptureFrame({ ...size, scale, centerX: fit.x, centerY: fit.y }, null, poseFrame.rotation);
       if (opening && followReviewedScene && contain) {
        // The preview clips the moving opening with CSS. The encoder reads
        // canvas pixels directly, so clear the matte outside the same opening.
        clipWidth = fit.width * scale;
        clipHeight = fit.height * scale;
       }
      } else setCaptureFrame(size);
     } else setCaptureFrame(size);
    }
    else resizeCapture(stage.clientWidth,stage.clientHeight,size.width/stage.clientWidth);
    if(time!==null&&!followArtwork)advance(time);else app.render();
    return clipWidth ? clipCaptureToArtwork(clipWidth, clipHeight) : canvas;
   }finally{for(const id of added)editor.hidden.delete(id);editor.before();}},
   dispose:()=>{rewind();live.pivot.set(transform.px,transform.py);live.rotation=transform.rotation;live.scale.set(transform.sx,transform.sy);live.position.set(transform.x,transform.y);app.renderer.resolution=resolution;app.renderer.resize(stage.clientWidth,stage.clientHeight);render(0);}};
 };
 let fittingBounds = baseFrame && stageBoundsForFrame(baseFrame), refitPending=false;
 let stageClipPath = '';
 render = dt => {
  viewerUI.tools.before();
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  if (app.renderer.screen.width !== w || app.renderer.screen.height !== h) app.renderer.resize(w, h);
  const frame = stageFrame();
  const useApertureFallback = hasApertureFallback(activeMotion);
  if (view.playing) {
   effectTimeline?.advance(dt * (api.effectTimeline ? 1 : view.speed));
   live.update(dt * 1000 * view.speed);
   if ((apertureRule(activeMotion) || stageCrop?.anchor?.aperture || stageCrop?.anchor?.syncPose) && live.deltaTime) {
    // Measure the same pose that will be drawn so a moving matte cannot outrun its crop.
    internal.update(live.deltaTime, live.elapsedTime);
    live.deltaTime = 0;
   }
  }
  fittingBounds ||= K.live2DViewBounds(internal, natural, [...model.interaction.hitAreas.map(a => a.id), ...portraitSurrounds]);
  if(refitPending&&!controller.state.motionPending&&renderedStageMotion===activeMotion){
   fittingBounds=baseFrame?stageBoundsForFrame(baseFrame):K.live2DViewBounds(internal,natural,[...model.interaction.hitAreas.map(a=>a.id),...portraitSurrounds]);
   stageCropFixed=false;refitPending=false;
  }
  // Fixed interaction preserves the viewer transform. A drawn scene window can still move inside it.
  const activeAperture = apertureAtPose();
  if (!stageCropFixed || stageCrop?.anchor || activeAperture || useApertureFallback) {
   displayedStageCrop = activeAperture || live2DFrameAtPose(stageCrop || (useApertureFallback ? apertureFallback : null), internal);
   stageCropFixed = !activeAperture && !useApertureFallback && !stageCrop?.anchor && fixedView.checked && stage.dataset.panMode === 'interact'
    && !controller.state.motionPending && renderedStageMotion === activeMotion;
  }
  const crop = displayedStageCrop;
  const fit = crop ? stageBoundsForFrame(crop) : fittingBounds;
  const scale = Math.min(frame.width / fit.width, frame.height / fit.height) * .92 * view.zoom;
  const rotation = crop?.rotation ?? 0, cos = Math.cos(rotation), sin = Math.sin(rotation);
  live.rotation = rotation;
  live.scale.set(scale);
  live.position.set(frame.x + view.panX + (pivotX * cos - pivotY * sin - fit.x) * scale,
   frame.y + view.panY + (pivotX * sin + pivotY * cos - fit.y) * scale);
  if (crop || portraitSurrounds.size) {
   // Cubism manages its own WebGL scissor state. Clip only the displayed canvas.
   const halfWidth = fit.width * scale / 2, halfHeight = fit.height * scale / 2;
   const x = frame.x + view.panX, y = frame.y + view.panY;
   stageClip = { left:x-halfWidth, top:y-halfHeight, right:x+halfWidth, bottom:y+halfHeight };
   const insets = [y - halfHeight, w - x - halfWidth, h - y - halfHeight, x - halfWidth];
   const clip = 'inset(' + insets.map(inset => Math.max(0, inset).toFixed(2) + 'px').join(' ') + ')';
   if (stageClipPath !== clip) {
    if (!stageClipPath) stage.style.touchAction = 'none';
    stageClipPath = clip;
    canvas.style.clipPath = clip;
   }
  } else if (stageClipPath) {
   stageClip = null;
   canvas.style.removeProperty('clip-path');
   stage.style.removeProperty('touch-action');
   stageClipPath = '';
  }
  app.render();
  renderedStageMotion = activeMotion;
  evidence.effect = effectTimeline?.state() || null;
 };
 disposeRenderer=dispose;evidence.interaction.hitAreaChecks=model.interaction.hitAreas.map(h=>({id:h.id,exists:internal.getDrawableIndex(h.id)>=0}));return api;
}
async function spinePortrait(model,generation){
 // The setup skin for these portraits omits body attachments supplied by skin 1.
 if (portraitsWithSkinOne.has(model.id)) model.defaultSkin ||= '1';
 const context=new spine.webgl.ManagedWebGLRenderingContext(canvas,{alpha:true,antialias:true,preserveDrawingBuffer:true}),gl=context.gl,scene=new spine.webgl.SceneRenderer(canvas,context,true);let assets;
 const dispose=()=>{try{assets?.dispose();scene.dispose();gl.getExtension('WEBGL_lose_context')?.loseContext();}catch{}};
 for(const spec of model.layers){spec.skelUrl=BASE+'/assets/spinepainting/'+enc(spec.folder+spec.skeleton);spec.atlasUrl=BASE+'/assets/spinepainting/'+enc(spec.atlas);}
 try{assets=await loadPortraitSpineAssets(spine,context,model.layers,{base:BASE+'/assets/spinepainting/',signal:loadAbort.signal,onProgress:text=>{if(generation===loadGeneration){$('status').textContent=text;loadingPreview.progress(generation,text);}},onTransport:(file,kind)=>{if(generation===loadGeneration)(evidence.loadTransports||={})[file]=kind;}});}catch(e){dispose();throw e;}
 if(generation!==loadGeneration){dispose();return null;}
 let layers;
 try {
  layers = assets.layers.map(({spec,atlas,bytes})=>{
   const loader = new spine.AtlasAttachmentLoader(atlas);
   const reader = spec.format === 'json' ? new spine.SkeletonJson(loader) : new spine.SkeletonBinary(loader);
   const data = reader.readSkeletonData(spec.format === 'json' ? JSON.parse(new TextDecoder().decode(bytes)) : bytes);
   const skeleton = new spine.Skeleton(data);
   const initialSkin = spec.initialSkin || model.defaultSkin;
   if (initialSkin && data.findSkin(initialSkin)) skeleton.setSkinByName(initialSkin);
   skeleton.setToSetupPose();
   Object.assign(skeleton,{x:spec.x||0,y:spec.y||0,scaleX:spec.scaleX||1,scaleY:spec.scaleY||1});
   if (spec.rotation) skeleton.bones[0].rotation += spec.rotation;
   if (spec.color) Object.assign(skeleton.color,spec.color);
   const stateData = new spine.AnimationStateData(data);
   stateData.defaultMix = .15;
   const state = new spine.AnimationState(stateData);
   skeleton.updateWorldTransform();
   return {data,skeleton,state,spec,atlas};
  });
 } catch (error) {
  dispose();
  throw error;
 }
 evidence.layers=layers;evidence.renderer=scene;
 const aperture = authoredSpineSceneAperture(model.id);
 const apertureAtPose = sceneLayers => K.spineArtworkAperture(sceneLayers, spine, aperture);
 const mogadorAircraft = model.id === 'mojiaduoer_5';
 model.animations=[...new Set(layers.flatMap(layer=>layer.data.animations.map(animation=>animation.name)))].sort();
 // This auxiliary scene's one-second normal track contains no renderable
 // attachments at any point. The visible stand2 track is its actual action.
 // The aircraft form's numbered tracks are still poses used by expressions.
 if (mogadorAircraft) model.animations = model.animations.filter(name => !/^[1-5]$/.test(name));
 let mainLayer=0,sequence=0;
 for(let i=0;i<layers.length;i++)layers[i].state.addListener({event:(entry,event)=>{if(i===mainLayer&&entry.animation.name===controller?.state.motion)controller.event(event.data.name);},complete:entry=>{if(i===mainLayer&&entry.animation.name===controller?.state.motion&&controller.state.busy)controller.finish();}});
 const api={sound,stopAudio,fold,assistantEvent:area=>{if(basicActions[area])sound(model.voiceBank,motionCue(basicActions[area]),{voice:true});},skin:name=>{for(const l of layers){const skin=l.data.findSkin(name||l.spec.initialSkin||model.defaultSkin||'default');if(skin){l.skeleton.setSkin(skin);l.skeleton.setSlotsToSetupPose();}}},effects:visible=>{evidence.effectsVisible=visible;},alpha:data=>{evidence.alphaData=data;},
  expression:cue=>{if(!cue){for(const l of layers)l.state.setEmptyAnimation(1,.15);return;}if(controller?.state.busy)return;const field=({touch_1:'touch',touch_2:'touch2',touch_head:'headtouch',task:'mission',get:'unlock'})[cue]||cue;let name=model.expression?.base?.[field]||model.expression?.base?.default;const extra=model.expression?.extra?.[field];for(const row of array(extra))if(row[0]<=controller.state.favor)name=row[1];if(name===undefined||name===null||name==='')return;const multiple=model.interaction.spine?.multiple_face;if(array(multiple?.name).length&&Number.isFinite(Number(name))){const offset=array(multiple.data).find(r=>r[0]===controller.state.idle)?.[1]||0;name=String(Number(name)+offset);}name=String(name);for(const l of layers)if(l.data.findAnimation(name))l.state.setAnimation(1,name,true);evidence.expression={cue,name};},
  play:async(name,loop,options={})=>{
   sequence++;
   if (options.manual && (options.resetPose || mogadorAircraft || model.id === 'yuekegongjue_5')) {
    for (const layer of layers) {
     if (model.id === 'yuekegongjue_5') layer.state.clearTracks();
     else {
      if (layer.spec.freeze || !layer.data.findAnimation(name)) continue;
      layer.state.clearTrack(0);
     }
     layer.skeleton.setToSetupPose();
     if (layer.spec.rotation) layer.skeleton.bones[0].rotation += layer.spec.rotation;
    }
   }
   let max = -1;
   for (let i = 0; i < layers.length; i++) {
    const action = layers[i].data.findAnimation(name);
    if (action && action.duration > max) { max = action.duration; mainLayer = i; }
   }
   for (const layer of layers) {
    const action = layer.data.findAnimation(name);
    if (action && !layer.spec.freeze) {
     for (const track of array(options.clear)) layer.state.setEmptyAnimation(track, 0);
     layer.state.setAnimation(0, name, loop);
    } else if (!layer.state.getCurrent(0)) {
     const start = layer.data.findAnimation(layer.spec.defaultAnimation || model.defaultAnimation) || layer.data.animations[0];
     if (start) layer.state.setAnimation(0, start.name, true);
    }
    layer.state.apply(layer.skeleton);
    layer.skeleton.updateWorldTransform();
   }
   evidence.animation = name;
   $('animation').value = name;
   const nextFrame = authoredSpineFrame(model.id, name) || baseStageFrame;
   if (nextFrame !== stageFrameCrop) {
    stageFrameCrop = nextFrame;
    bounds = stageFrameCrop ? stageBoundsForFrame(stageFrameCrop) : framing.bounds;
    evidence.bounds = bounds;
   }
  },
  duration:name=>Math.max(0,...layers.map(layer=>layer.data.findAnimation(name)?.duration||0)),
  timeline:()=>{const item=layers[mainLayer]?.state.getCurrent(0),duration=item?.animation?.duration||0,elapsed=Math.max(0,item?.trackTime||0);return {name:item?.animation?.name,time:duration?(item.loop?elapsed%duration:Math.min(duration,elapsed)):0,duration,loop:!!item?.loop};},
  seek:seconds=>{for(const layer of layers){const item=layer.state.getCurrent(0);if(!item)continue;const time=Math.max(0,Math.min(item.animation.duration-.0001,seconds));item.trackTime=item.trackLast=item.nextTrackLast=time;item.animationLast=item.nextAnimationLast=time;layer.state.apply(layer.skeleton);layer.skeleton.updateWorldTransform();}},
  world:(x,y)=>{const frame=stageFrame(),units=Math.max(bounds.width/frame.width,bounds.height/frame.height)*1.1/view.zoom;return {x:bounds.x+(x-frame.x-view.panX)*units,y:bounds.y-(y-frame.y-view.panY)*units};},
  hits:(x,y)=>{
   const p = api.world(x,y);
   const hits = array(model.interaction.hitAreas).filter(h=>polygonContains(p.x,p.y,h.vertices)).map(h=>h.id);
   const skin = controller?.state.skin;
   // The two skin switch hotspots have identical geometry.
   if (model.id === arromanchesPortrait && (skin === '1' || skin === '2')) {
    const inactive = skin === '1' ? 'skin_2' : 'skin_1';
    return hits.filter(id=>id!==inactive);
   }
   return hits;
  },
  polygons:()=>{const frame=stageFrame(),units=Math.max(bounds.width/frame.width,bounds.height/frame.height)*1.1/view.zoom;return array(model.interaction.hitAreas).map(area=>({id:area.id,vertices:area.vertices.map(p=>[(p[0]-bounds.x)/units+frame.x+view.panX,(bounds.y-p[1])/units+frame.y+view.panY])}));}
 };
 for(const l of layers){const a=l.data.findAnimation(l.spec.defaultAnimation||model.defaultAnimation)||l.data.animations[0];if(a)l.state.setAnimation(0,a.name,true);l.state.apply(l.skeleton);l.skeleton.updateWorldTransform();}
 const authoredFrame = authoredSpineFrame(model.id);
 const baseStageFrame = authoredFrame || defaultPortraitStageFrame(model.id) || aperture?.fallback;
 let stageFrameCrop = authoredSpineFrame(model.id, model.defaultAnimation) || baseStageFrame;
 const rectangles=[];
 if (!authoredFrame) for(const l of layers)for(const slot of l.skeleton.drawOrder){const a=slot.attachment;let vertices;if(a instanceof spine.RegionAttachment){vertices=new Float32Array(8);a.computeWorldVertices(slot.bone,vertices,0,2);}else if(a instanceof spine.MeshAttachment){vertices=new Float32Array(a.worldVerticesLength);a.computeWorldVertices(slot,0,a.worldVerticesLength,vertices,0,2);}if(!vertices?.length)continue;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(let i=0;i<vertices.length;i+=2){minX=Math.min(minX,vertices[i]);maxX=Math.max(maxX,vertices[i]);minY=Math.min(minY,vertices[i+1]);maxY=Math.max(maxY,vertices[i+1]);}rectangles.push({name:slot.data.name,bounds:[minX,minY,maxX,maxY]});}
 const framing = baseStageFrame ? { bounds: stageBoundsForFrame(baseStageFrame), excluded: [] } : fitSceneBounds(rectangles);
 let bounds=stageFrameCrop?stageBoundsForFrame(stageFrameCrop):framing.bounds;evidence.bounds=bounds;evidence.offscreenLayers=framing.excluded;const maxBuffer=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
 const project=(x,y)=>{const p=api.world(0,0),q=api.world(stage.clientWidth,stage.clientHeight);return {x:(x-p.x)/(q.x-p.x)*stage.clientWidth,y:(y-p.y)/(q.y-p.y)*stage.clientHeight};};
 editor=window.createInteractionSpineEditor({layers,ns:spine,project,unproject:api.world});
 api.capture = (animation, format) => {
  const hidden = new Set(editor.hidden), surrounds = portraitSurroundNames(model.id);
  layers.forEach((layer, i) => {
   for (const slot of layer.skeleton.slots) if (surrounds.has(slot.data.name)) hidden.add(i + ':' + slot.data.name);
  });
  const session = window.createInteractionSpineCapture({ layers, ns:spine, canvas, renderer:scene, gl,
   editor:{...editor, hidden}, animation, fromSetupPose:format !== 'png', artworkAperture:aperture,
   restore:()=>render(0) });
  const exportFrame = apertureAtPose(layers) ?? sceneExportCrop(model, animation.name, format) ?? authoredSpineExportFrame(model.id, animation.name);
  // This shot's alternate scene is positioned by the selected track. Sample
  // its current time for PNG too, even while the preview is still mixing in.
  if (format === 'png' && model.id === 'siwanshi_4' && animation.name === 'touch_special_normal') {
   const draw = session.draw.bind(session);
   session.draw = (time, size, background) => draw(time ?? animation.time ?? 0, size, background);
  }
  let levelFrame;
  const qishengLevel = model.id === 'qisheng_3' && cameraLevelActions.has(model.id+':'+animation.name);
  if (api.levelExport && (qishengLevel || (['tianjinfeng_2','tianjinfeng_3'].includes(model.id) && animation.name === 'normal'))) {
   const name = model.id === 'qisheng_3' ? 'bj' : model.id === 'tianjinfeng_2' ? 'bj_a' : 'bj_b';
   // Measure the selected action independently of the outgoing preview pose.
   const levelLayers = qishengLevel ? layers.map(layer => {
    const skeleton = new spine.Skeleton(layer.data);
    if (layer.skeleton.skin) skeleton.setSkin(layer.skeleton.skin);
    skeleton.setToSetupPose();
    Object.assign(skeleton, {x:layer.skeleton.x,y:layer.skeleton.y,scaleX:layer.skeleton.scaleX,scaleY:layer.skeleton.scaleY});
    if (layer.spec.rotation) skeleton.bones[0].rotation += layer.spec.rotation;
    const state = new spine.AnimationState(new spine.AnimationStateData(layer.data));
    if (layer.data.findAnimation(animation.name)) state.setAnimation(0,animation.name,true).mixDuration=0;
    state.apply(skeleton);skeleton.updateWorldTransform();
    return {skeleton};
   }) : layers;
   const slot = levelLayers.flatMap(layer => layer.skeleton.slots).find(slot => slot.data.name === name && slot.attachment instanceof spine.RegionAttachment);
   if (slot) {
    const vertices = new Float32Array(8); slot.attachment.computeWorldVertices(slot.bone,vertices,0,2);
    let rotation = Math.atan2(vertices[7]-vertices[1],vertices[6]-vertices[0]);
    // Mirrored attachments reverse the edge, not the intended camera orientation.
    if (rotation > Math.PI/2) rotation -= Math.PI;
    if (rotation < -Math.PI/2) rotation += Math.PI;
    const manualAngle = qishengLevel && animation.name === 'normal_touch' ? (api.levelAngle ?? 0) * Math.PI / 180 : 0;
    rotation += manualAngle;
    const cos = Math.cos(rotation), sin = Math.sin(rotation), xs=[],ys=[];
    for (let i=0;i<8;i+=2) { xs.push(vertices[i]*cos+vertices[i+1]*sin);ys.push(-vertices[i]*sin+vertices[i+1]*cos); }
    const inset = qishengLevel ? 8 : 0;
    if (manualAngle) {
     // Inscribe the original aspect ratio in the rotated picture so its
     // transparent corners never become part of the downloaded video.
     const cx = xs.reduce((a,b)=>a+b,0) / 4;
     const cy = ys.reduce((a,b)=>a+b,0) / 4;
     const width = Math.hypot(vertices[6]-vertices[0], vertices[7]-vertices[1]);
     const height = Math.hypot(vertices[2]-vertices[0], vertices[3]-vertices[1]);
     const aspect = width / height;
     let halfHeight = Infinity;
     for (let i=0;i<4;i++) {
      const j=(i+1)%4, nx=ys[j]-ys[i], ny=xs[i]-xs[j];
      const distance = Math.abs(nx * (cx-xs[i]) + ny * (cy-ys[i]));
      halfHeight = Math.min(halfHeight, distance / (Math.abs(nx)*aspect + Math.abs(ny)));
     }
     levelFrame = {minX:cx-halfHeight*aspect+inset,minY:cy-halfHeight+inset,
      maxX:cx+halfHeight*aspect-inset,maxY:cy+halfHeight-inset,rotation};
    } else {
     levelFrame = {minX:Math.min(...xs)+inset,minY:Math.min(...ys)+inset,maxX:Math.max(...xs)-inset,maxY:Math.max(...ys)-inset,rotation};
    }
   }
  }
  if (levelFrame || exportFrame) session.fixedFrame = levelFrame || exportFrame;
  else {
   const frame = spinePortraitFrameBounds(model.id, layers, spine, hidden);
   if (frame) session.pngSize = quality => ({ ...K.exportDimensions(frame, quality), fullFrame:true });
  }
  return session;
 };
 render = dt => {
  viewerUI.tools.before();
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  const density = Math.min(Math.max(2, devicePixelRatio || 1), maxBuffer / Math.max(w, h));
  const bw = Math.round(w * density), bh = Math.round(h * density);
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  if (view.playing) for (const layer of layers) {
   layer.state.update(dt * view.speed);
   layer.state.apply(layer.skeleton);
   layer.skeleton.updateWorldTransform();
  }
  if (aperture) {
   stageFrameCrop = apertureAtPose(layers);
   bounds = stageBoundsForFrame(stageFrameCrop);
  }
  gl.viewport(0, 0, bw, bh);
  const camera = scene.camera, frame = stageFrame();
  const units = Math.max(bounds.width / frame.width, bounds.height / frame.height) * 1.1 / view.zoom;
  camera.setViewport(bw, bh);
  camera.zoom = units / density;
  camera.position.x = bounds.x - (view.panX + frame.x - w / 2) * units;
  camera.position.y = bounds.y + (view.panY + frame.y - h / 2) * units;
  camera.update();
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  viewerUI.tools.after();
  if (stageFrameCrop) {
   const scale = density / units;
   const left = Math.floor(bw / 2 + (stageFrameCrop.minX - camera.position.x) * scale);
   const right = Math.ceil(bw / 2 + (stageFrameCrop.maxX - camera.position.x) * scale);
   const bottom = Math.floor(bh / 2 + (stageFrameCrop.minY - camera.position.y) * scale);
   const top = Math.ceil(bh / 2 + (stageFrameCrop.maxY - camera.position.y) * scale);
   gl.enable(gl.SCISSOR_TEST);
   gl.scissor(left, bottom, right - left, top - bottom);
  }
  try {
   K.drawSpineArtwork(layers, aperture, () => {
    scene.begin();
    for (const layer of layers) scene.drawSkeleton(layer.skeleton, true);
    scene.end();
   });
  } finally {
   if (stageFrameCrop) gl.disable(gl.SCISSOR_TEST);
  }
 };
 disposeRenderer=dispose;return api;
}
async function getJson(url,required=true,signal){try{return JSON.parse(new TextDecoder().decode(await readPortraitAsset(url,{signal})));}catch(error){if(!required&&error.status===404)return null;throw error;}}
async function loadModel(id,{history=true,formToken=null,initialAction=null}={}){
 if(formSwitch && formToken!==formSwitch)cancelFormSwitch(false);
 if(exporting)return false;
 resetHintVisits();
 hintsEnabled=false;hintButton.setAttribute('aria-pressed','false');
 loadAbort?.abort();loadAbort=new AbortController();retryId=id;
 stagePan.cancel();stagePan.setMode('pan');cancelInteraction();hasInteraction=false;interactButton.hidden=true;
 const interactionTab=document.querySelector('[data-panel-tab="interaction"]');interactionTab.hidden=interactionTab.disabled=true;
 setPanelOpen('interaction',false);
 interactButton.disabled=true;for(const key of ['reset-state','show-hint'])$(key).disabled=true;$('interaction-voice').hidden=true;clearHint();hintArea=null;hintAdvance=false;hintInteractionCount=0;K.clearToasts('azur-interaction');K.clearToasts('azur-audio');$('interaction-more').open=false;$('interaction-note').textContent='立绘正在加载，完成后可开启互动。';
 const requestedId=id;id=canonicalModelId(id);if(id!==requestedId){const url=new URL(location.href);url.searchParams.set('id',id);window.history.replaceState(null,'',url);}
 const thumbnail=releasePortraits.has(id)?libraryThumbs['azurlane:'+id]:null;
 if(thumbnail)K.setPreview($('railThumb'),K.thumbnailURL(THUMB_PREFIX+thumbnail));
 else $('railThumb').replaceChildren();
 viewerUI.tools.prepareLoad();
 const generation=++loadGeneration;previewPending=true;nextPreviewCheck=0;loadingPreview.begin(generation,{path:previewPath(id),label:allModels.find(m=>m.id===id)?.name||id,trimImage:true});view.ready=evidence.ready=false;viewerUI.update(true);render=null;pointer=null;editor=null;controller?.dispose();controller=null;disposeRenderer?.();disposeRenderer=null;stopAudio();fold(false);delete evidence.model;delete evidence.app;delete evidence.layers;delete evidence.renderer;delete evidence.bounds;delete evidence.effect;delete evidence.effectLayerError;evidence.errors=[];evidence.interaction={};evidence.audio.missing=[];
 if (canvas.style.clipPath) stage.style.removeProperty('touch-action');
 const next=canvas.cloneNode(false);next.style.clipPath='';canvas.replaceWith(next);canvas=next;Object.assign(view,{zoom:1,panX:0,panY:0,playing:true,frames:0});look.x=look.y=look.targetX=look.targetY=0;portraitTime=0;zoomTo(1);$('status').textContent=id+' · 正在读取模型和交互…';
 const data=await Promise.all([getJson(BASE+'/catalog/'+encodeURIComponent(id)+'.json',true,loadAbort.signal),allModels.find(m=>m.id===id)?.type==='live2d'?getJson(BASE+'/animators/'+encodeURIComponent(id)+'.json',false,loadAbort.signal):null]).catch(e=>{if(generation!==loadGeneration)return null;loadAbort.abort(e);throw e;});
 if(!data)return false;const [model,animator]=data;
 if(generation!==loadGeneration)return false;selected=model;if(animator)model.animator=animator;evidence.selected=model;$('active-name').textContent=stageName(model);populate();
 // Supplemental voice mappings must not hold the first visible frame hostage.
 void getJson(BASE+'/model-audio/'+encodeURIComponent(id)+'.json',false,loadAbort.signal).then(audio=>{
  if(generation!==loadGeneration||!audio)return;
  Object.assign(model,audio);
  if(view.ready)refreshVoiceControls();
 }).catch(error=>{if(generation===loadGeneration&&error.name!=='AbortError')evidence.audio.metadataError=String(error);});
 let loaded;try{loaded=await (model.type==='live2d'?live2dPortrait(model,generation):spinePortrait(model,generation));}catch(e){if(generation!==loadGeneration)return false;throw e;}if(generation!==loadGeneration||!loaded)return false;adapter=loaded;
 const previousTrace=adapter.trace;adapter.trace=(type,data)=>{previousTrace?.call(adapter,type,data);recordHintVisit(type,data);};
 controller=model.type==='live2d'?new Live2DController(model,adapter,{storage:localStorage,favor:highestFavor(model)}):new SpineController(model,adapter,{storage:localStorage,favor:highestFavor(model)});evidence.controller=controller;evidence.adapter=adapter;controls();if(initialAction && model.animations.includes(initialAction))controller.action(initialAction,{force:true,manual:true,voice:false,onComplete:()=>{controller?.playIdle();formToken?.complete?.();}});else controller.playIdle();
 view.ready=evidence.ready=true;interactButton.disabled=!hasInteraction;if(hasInteraction&&releasePortraits.has(id))stagePan.setMode('interact');zoomTo(view.zoom);document.title=stageName(model)+' · ArtHub';$('status').textContent=stageName(model)+' · '+model.animations.length+' 个动作';K.setLibraryStageReady(true);populate();
 updateFormButton();
 if(history){const url=new URL(location.href);url.searchParams.set('id',id);window.history.replaceState(null,'',url);K.history.push(entry(model));}return true;
}
function record(){
 let pose=2166136261;const add=v=>{pose=Math.imul(pose^Math.round(v*10000),16777619)>>>0;};const core=evidence.model?.internalModel.coreModel.getModel();if(core)for(const v of core.drawables.vertexPositions)for(let i=0;i<v.length;i+=6)add(v[i]);else for(const l of evidence.layers||[])for(const b of l.skeleton.bones){add(b.worldX);add(b.worldY);add(b.a);add(b.d);}
 Object.assign(evidence.interaction,{count:controller.state.interactions,idleIndex:controller.state.idleIndex,lastMotion:controller.state.motion});
 evidence.memory={createdMocs,releasedMocs:releasedMocCount,liveMocs:createdMocs-releasedMocCount};
 const state={id:selected.id,type:selected.type,ready:evidence.ready,frames:view.frames,pose,zoom:view.zoom,animation:evidence.animation,canvas:[canvas.width,canvas.height],state:{...controller.state},voiceCount:selected.voice.activeClips.length,interaction:evidence.interaction,audio:evidence.audio,trace:controller.trace.slice(-12),errors:evidence.errors};evidenceNode.textContent=JSON.stringify(state);
 updateInteractionHint();
}
window.__loadAzurLane=loadModel;window.addEventListener('popstate',()=>{const id=new URL(location.href).searchParams.get('id'),match=allModels.find(m=>m.id===canonicalModelId(id));if(match){setPanelOpen('library',false);loadModel(id,{history:false}).catch(fail);}else setPanelOpen('library',true);});window.addEventListener('pagehide',()=>{loadGeneration++;loadAbort?.abort();controller?.dispose();disposeRenderer?.();ctx?.close().catch(()=>{});});
let previous=performance.now(),nextEvidence=0;
function frame(now){const dt=Math.min(.1,(now-previous)/1000);previous=now;try{if(!exporting&&view.ready&&controller){updateAudio(dt);if(view.playing){portraitTime+=dt*view.speed;const d=1-Math.exp(-dt/(selected.interaction.settings?.DampingTime||.3));look.x+=(look.targetX-look.x)*d;look.y+=(look.targetY-look.y)*d;controller.tick(dt*view.speed);}render?.(dt);view.frames++;
 if(previewPending&&view.frames>2&&!controller.state.motionPending&&now>=nextPreviewCheck){nextPreviewCheck=now+100;const gl=evidence.app?.renderer?.gl||canvas.getContext('webgl2')||canvas.getContext('webgl');if(gl&&!gl.isContextLost()&&canvas.width>1&&canvas.height>1){previewContext.clearRect(0,0,64,64);previewContext.drawImage(canvas,0,0,64,64);const pixels=previewContext.getImageData(0,0,64,64).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>8){loadingPreview.ready(loadGeneration);previewPending=false;break;}}}
 updateFormButton();viewerUI.update();if(now>=nextEvidence){record();nextEvidence=now+250;}}}catch(e){view.ready=evidence.ready=false;fail(e);}requestAnimationFrame(frame);}
requestAnimationFrame(frame);
try{const [listing,thumbData,retired]=await Promise.all([getJson(BASE+'/characters.json?v=20261120-scene-layers'),getJson(K.thumbnailURL(THUMB_INDEX),false).catch(()=>null),getJson('./retired-models.json')]);retiredModels=retired;allModels=listing.characters.filter(m=>!retiredModels[m.id]);libraryThumbs=thumbData?.items||{};evidence.catalog=allModels;$('counts').textContent=`${allModels.length} 项 · ${allModels.filter(m=>m.type==='live2d').length} Live2D / ${allModels.filter(m=>m.type==='spine').length} Spine`;K.setLibraryStageReady(false);populate();const id=new URL(location.href).searchParams.get('id'),initial=allModels.find(m=>m.id===canonicalModelId(id));if(initial)await loadModel(id);else setPanelOpen('library',true);}catch(e){fail(e);}
