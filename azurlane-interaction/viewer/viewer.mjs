import {Live2DController,SpineController,array,basicActions,motionCue,triangleContains,polygonContains,fitSceneBounds,voiceClip,highestFavor} from './controller.mjs?v=20261113-az-interaction-hint';
import {EffectTimeline} from './effect-timeline.mjs?v=499c19e6892b';
import {hasEffectControls} from './effect-controls.mjs?v=499c19e6892b';
import {portraitFrameBounds,spinePortraitFrameBounds,portraitSurroundNames,authoredLive2DFrame,authoredLive2DExportFrame,authoredSpineFrame} from './portrait-frame.mjs?v=20261113-az-interaction-hint';
import {readPortraitAsset,loadPortraitSpineAssets,prepareLive2DSettings} from './portrait-assets.mjs?v=20261109-portrait-frame1';
import {decodePortraitAudio} from './portrait-audio-decode.mjs?v=20261113-az-audio';
const $=id=>document.getElementById(id),K=window.SpineKit,BASE='..';
const stage=$('stage'),interactionHint=$('interaction-hint'),hintButton=$('show-hint');
let canvas=$('canvas'),selected,allModels=[],controller,render,disposeRenderer,adapter,loadGeneration=0,portraitTime=0,space=false;
let hintsEnabled=true,hintArea=null,previousHintArea=null,hintInteractionCount=0;
const interactButton=$('btnStagePan');
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
const synchronizedVideoPortraits = new Map([
 ['yanusi_7', 60], ['aogusite_4', 72], ['adaerbote_3', 20], ['bailong_3', 10], ['jian_3', 16],
]);
// Reviewed default motions whose independent effects do not close with the character's cycle.
const blendedVideoPortraits = new Set([
 'aerbien_3', 'aersasi_2', 'aersasi_3', 'ankeleiqi_2', 'baerdimo_6', 'benningdun_2',
 'bulaimodun_4', 'bulaimodun_5', 'chaijun_5', 'dafeng_6', 'dujiaoshou_6', 'gezi_2',
 'jiluofu_3', 'jinshi_2', 'junhe_4', 'kewei_6', 'kuersike_2', 'luoma_2', 'luyijiushi_2',
 'meikelunbao_2', 'mingji_2', 'nengdai_3', 'qianwei_2', 'qiye_7', 'qiye_9', 'qiye_10',
 'shi_2', 'sitelasibao_2', 'tianlangxing_5', 'weineituo_2', 'wuerlixi_3', 'wuzang_4',
 'xianghe_2', 'xingdengbao_2', 'xinnong_4', 'xuefeng_3', 'xukufu_3', 'yuekechengii_3',
 'zhala_2', 'zhenzhuhao_2',
]);
const thumbRevision = id => portraitsWithSkinOne.has(id) ? '?v=20261110-az-spine-skins' : '';
const previewPath = id => K.siteRoot()+'thumbs/azurlane/'+encodeURIComponent(id)+'.webp'+thumbRevision(id);
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
K.initTheme(libraryPrefs);K.bindThemePalette($('btnTheme'),libraryPrefs);
$('thumbGrid').dataset.density=libraryPrefs.get('density','standard');
$('thumbGrid').dataset.kitDensityReady='1';
let retiredModels={};
const canonicalModelId=id=>retiredModels[id]||id;
const THUMB_PREFIX='../../thumbs/';
const enc=path=>path.split('/').map(encodeURIComponent).join('/');
const labels={touch_1:'普通触摸',touch_2:'特殊触摸',touch_head:'摸头',login:'登录',home:'回港',task:'任务',mission_complete:'任务完成',main_1:'主界面 1',main_2:'主界面 2',main_3:'主界面 3',propose:'誓约'};
function fail(error){const message=error.message||String(error);loadingPreview.fail(loadGeneration,message);$('status').textContent='加载失败：'+message;evidence.errors.push(message);}
function portraitName(m){const character=String(m.characterName||'').trim(),skin=String(m.skinName||'').trim();return character&&skin&&skin!==character&&!/\{namecode:\d+\}/i.test(skin)?character+' · '+skin:character||String(m.name||m.id||'');}
function variantLabel(m){return /_hx$/.test(m.id)?'HX版':/_asmr$/.test(m.id)?'ASMR版':'';}
function stageName(m){const variant=variantLabel(m);return portraitName(m)+(variant?'（'+variant+'）':'');}
function entry(m){const url=new URL(BASE+'/viewer/index.html?id='+encodeURIComponent(m.id),location.href);return {k:'azurlane:'+m.id,src:'azurlane-interaction',t:stageName(m),s:m.type==='live2d'?'Live2D':'Spine',u:url.pathname+url.search};}
function zoomTo(next,x,y){if(!Number.isFinite(next)||next<=0)return;next=Math.max(.1,Math.min(8,next));if(Number.isFinite(x)){const r=canvas.getBoundingClientRect(),frame=stageFrame(),f=next/view.zoom;view.panX=f*view.panX+(1-f)*(x-r.left-frame.x);view.panY=f*view.panY+(1-f)*(y-r.top-frame.y);}view.zoom=next;for(const id of ['zOut','zPct','zIn'])$(id).disabled=!view.ready;$('zPct').textContent=next<100?Math.round(next*100)+'%':next.toPrecision(3)+'×';}
$('zIn').onclick=()=>zoomTo(view.zoom*1.25);$('zOut').onclick=()=>zoomTo(view.zoom/1.25);$('fit').onclick=()=>{view.panX=view.panY=0;zoomTo(1);};$('zPct').onclick=()=>$('fit').click();
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
 if(!clip){const key=bank+':'+cue;if(!evidence.audio.missing.includes(key))evidence.audio.missing.push(key);return;}
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
  if(options?.voice)K.toast('台词播放失败。打开「互动」可以试听重试。','err',4000,'azur-audio');
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
  K.setPreview(preview,thumb?THUMB_PREFIX+thumb+thumbRevision(m.id):null);
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
document.querySelectorAll('[data-panel-tab]').forEach(tab=>tab.addEventListener('click',()=>{const name=tab.dataset.panelTab;document.querySelectorAll('[data-panel-tab]').forEach(button=>{const active=button===tab;button.classList.toggle('on',active);button.setAttribute('aria-selected',String(active));});document.querySelectorAll('[data-panel-page]').forEach(page=>page.classList.toggle('on',page.dataset.panelPage===name));if(name==='interaction'&&view.ready)stagePan.setMode('interact');}));
$('railStar').onclick=()=>{if(selected){K.favs.toggle(entry(selected));populate();}};
$('railThumb').onclick=()=>$('fit').click();
$('btnPrev').onclick=()=>step(-1);$('btnNext').onclick=()=>step(1);

function step(direction){if(!allModels.length)return;const index=allModels.findIndex(m=>m.id===selected?.id);const next=index<0?(direction>0?0:allModels.length-1):(index+direction+allModels.length)%allModels.length;setPanelOpen('library',false);loadModel(allModels[next].id).catch(fail);}
$('play').onclick=()=>{view.playing=!view.playing;$('play').textContent=view.playing?'暂停':'播放';if(ctx)(view.playing?ctx.resume():ctx.suspend()).catch(()=>{});};
$('speed').onchange=()=>view.speed=Number($('speed').value);
$('animation').onchange=()=>{unlockAudio().catch(()=>{});controller?.action($('animation').value,{force:true,idle:$('loop').checked,interactive:true});};
$('loop').onchange=()=>$('animation').onchange();
$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'声音：关':'声音：开';evidence.audio.muted=muted;if(muted)stopAudio();else unlockAudio().catch(()=>{});};
function auditionVoice(clip){
 if(!clip||!view.ready||exporting)return;
 if(muted)$('sound').click();
 if(volume===0){setVolume(.7);const slider=document.querySelector('.viewer-sound-volume input');if(slider)slider.value=volume;}
 sound(selected.voiceBank,clip.name,{voice:true,exact:true});
}
$('voice-play').onclick=()=>auditionVoice(selected?.voice?.activeClips?.find(c=>c.name===$('voice').value));
$('interaction-voice').onclick=()=>{
 if(!selected)return;
 const clips=selected.voice.activeClips,favor=controller?.state.favor??0;
 auditionVoice(voiceClip(selected,'touch_head',favor)||voiceClip(selected,'touch_1',favor)||clips[0]);
};
$('voice-stop').onclick=()=>stopChannel('voice');
$('reset-state').onclick=()=>{stopAudio();controller?.reset();hintArea=previousHintArea=null;interactionHint.hidden=true;};
hintButton.onclick=()=>{
 hintsEnabled=!hintsEnabled;
 hintButton.setAttribute('aria-pressed',String(hintsEnabled));
 updateInteractionHint();
};
const hintLabels={tap:'点这里',hold:'长按这里',drag:'从这里拖动'};
function updateInteractionHint(){
 if(!hintsEnabled||!view.ready||exporting||stage.dataset.panMode!=='interact'||stage.dataset.clickMode==='part-editing'||
    stage.dataset.clickMode==='pose'||stage.dataset.pinching||controller.state.busy||pointer||$('gridView').classList.contains('open')){
  interactionHint.hidden=true;
  return;
 }
 if(controller.state.interactions!==hintInteractionCount){
  hintInteractionCount=controller.state.interactions;
  previousHintArea=hintArea;
  hintArea=null;
 }
 const regions=adapter.polygons()||[],rect=canvas.getBoundingClientRect();
 const ordered=[
  ...regions.filter(area=>area.id===hintArea),
  ...regions.filter(area=>area.id!==hintArea&&area.id!==previousHintArea),
  ...regions.filter(area=>area.id!==hintArea&&area.id===previousHintArea),
 ];
 for(const area of ordered){
  if(!area.vertices.length)continue;
  const event=selected.interaction.hitAreas.find(item=>item.id===area.id)?.event;
  const gesture=controller.hintGesture(area.id,event);
  if(!gesture)continue;
  const xs=area.vertices.map(point=>point[0]),ys=area.vertices.map(point=>point[1]);
  const left=Math.max(44,Math.min(...xs)),right=Math.min(rect.width-44,Math.max(...xs));
  const top=Math.max(48,Math.min(...ys)),bottom=Math.min(rect.height-16,Math.max(...ys));
  if(right<left||bottom<top)continue;
  for(const u of [.5,.25,.75])for(const v of [.5,.25,.75]){
   const x=left+(right-left)*u,y=top+(bottom-top)*v;
   if(document.elementFromPoint(rect.left+x,rect.top+y)!==canvas)continue;
   if(adapter.hits(x,y)[0]!==area.id)continue;
   hintArea=area.id;
   interactionHint.style.left=x+'px';
   interactionHint.style.top=y+'px';
   const label=hintLabels[gesture];
   if(interactionHint.firstElementChild.textContent!==label)interactionHint.firstElementChild.textContent=label;
   interactionHint.hidden=false;
   return;
  }
 }
 interactionHint.hidden=true;
}
function localPoint(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function cancelInteraction(){
 if(pointer)release(pointer.id,pointer,true);
 look.targetX=look.targetY=0;
}
const stagePan=K.createStagePan({stage,button:interactButton,modeSelect:$('pointer-mode'),interactiveButton:true,accepts:isStagePointer,ready:()=>view.ready&&!exporting,
 onModeChange:mode=>{
  cancelInteraction();
  interactionHint.hidden=true;
  K.clearToasts('azur-interaction');
  if(mode==='interact'){
   viewerUI.tools.exitEditing();
   $('interaction-more').open=false;
   if(!view.playing)$('play').click();
   unlockAudio().catch(()=>{});
   viewerUI.showTab('interaction');
   setPanelOpen('library',false);
   setPanelOpen('interaction',true);
   K.toast(hintsEnabled?'互动已开启 · 按画面上的提示操作。':'互动已开启 · 可以直接操作立绘。','info',3600,'azur-interaction');
  }else if($('floatPanel').dataset.tab==='interaction')setPanelOpen('interaction',false);
 },
 move:(dx,dy)=>{view.panX+=dx;view.panY+=dy;},
 tap:event=>{if(!view.playing)$('play').click();unlockAudio().catch(()=>{});const p=localPoint(event),hits=adapter.hits(p.x,p.y);evidence.interaction.hits=hits;if(selected.type==='live2d'){controller.start(hits,p.x,p.y,adapter.world(p.x,p.y));controller.end(p.x,p.y);}else{const hit=hits[0];if(!hit||!controller.touch(hit,{drag:false}))spineBasic(hit);}}
});
stage.addEventListener('pointerdown',e=>{
 if(pointer||!isStagePointer(e.target)||e.button!==0||!view.ready||exporting)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);if(!view.playing)$('play').click();unlockAudio().catch(()=>{});const p=localPoint(e),pan=space||$('pointer-mode').value==='pan',hits=pan?[]:adapter.hits(p.x,p.y);pointer={id:e.pointerId,x:p.x,y:p.y,startX:p.x,startY:p.y,pan,hits,down:portraitTime};evidence.interaction.hits=hits;
 interactionHint.hidden=true;
 if(!pan&&selected.type==='live2d')controller.start(hits,p.x,p.y,adapter.world(p.x,p.y));
});
stage.addEventListener('pointermove',e=>{
 const p=localPoint(e);
 if(pointer?.id!==e.pointerId)return;
 if(pointer.pan){view.panX+=p.x-pointer.x;view.panY+=p.y-pointer.y;}
 else if(selected.type==='live2d'){
  controller.move(p.x,p.y,adapter.world(p.x,p.y));const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);look.targetX=Math.max(-1,Math.min(1,(p.x-pointer.startX)/w*(selected.interaction.settings.DragRateX||5)));look.targetY=Math.max(-1,Math.min(1,-(p.y-pointer.startY)/h*(selected.interaction.settings.DragRateY||3)));
 }
 else if(!pointer.triggered&&pointer.hits[0]&&(Math.abs(p.x-pointer.startX)>200||Math.abs(p.y-pointer.startY)>200)){pointer.triggered=controller.touch(pointer.hits[0],{drag:true});}
 pointer.x=p.x;pointer.y=p.y;
});
function release(id,p,cancel=false){if(pointer?.id!==id)return;const down=pointer;pointer=null;look.targetX=look.targetY=0;if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);if(down.pan)return;
 if(selected.type==='live2d'){
  if(!cancel&&down.hits.includes(hintArea)&&controller.hintGesture(hintArea)==='drag'&&Math.hypot(p.x-down.startX,p.y-down.startY)>=12){
   previousHintArea=hintArea;hintArea=null;
  }
  controller.end(p.x,p.y,cancel);
 }
 else if(!cancel&&!down.triggered){const click=Math.abs(p.x-down.startX)<30&&Math.abs(p.y-down.startY)<30&&portraitTime-down.down<.5;const hit=down.hits[0];if(hit){if((Math.abs(p.x-down.startX)<200||Math.abs(p.y-down.startY)<200)&&!controller.touch(hit,{drag:false})&&click)spineBasic(hit);}else if(click)spineBasic();}
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
function spineBasic(hit){if(controller.state.busy)return;let event=selected.interaction.hitAreas.find(h=>h.id===hit)?.event;if(selected.id.endsWith('_hx')&&event==='TouchSpecial')event='TouchBody';if(event){const action=basicActions[event];if(!controller.action(action,{interactive:true}))sound(selected.voiceBank,motionCue(action),{voice:true});return;}const candidates=selected.animations.filter(n=>/^main_\d+$/.test(n));if(candidates.length)controller.action(candidates[Math.floor(Math.random()*candidates.length)],{interactive:true});else{const clips=selected.voice.activeClips.filter(c=>/^main_\d+$/.test(c.cue));const c=clips[Math.floor(Math.random()*clips.length)];if(c)sound(selected.voiceBank,c.cue,{voice:true});}}
const viewerUI=window.createInteractionViewerUI({
 animations:()=>array(selected?.animations).filter(name=>name!=='effect'||!adapter?.effectTimeline).map(name=>({name,duration:selected.motionDurations?.[name]||adapter?.duration?.(name)||0})),
 playback:()=>{const timeline=adapter?.timeline?.()||{};return {ready:view.ready&&view.frames>2&&!exporting,key:selected?.id+':'+loadGeneration,name:timeline.name||controller?.state.motion,time:timeline.time??controller?.state.actionTime??0,duration:timeline.duration||selected?.motionDurations?.[controller?.state.motion]||0,loop:timeline.loop??$('loop').checked,playing:view.playing,speed:view.speed,canSeek:!!adapter?.seek};},
 setPlaying:playing=>{if(!exporting&&view.playing!==playing)$('play').click();},
 setSpeed:speed=>{if(!exporting)view.speed=speed;},
 setLoop:loop=>{if(exporting)return;$('loop').checked=loop;$('loop').onchange();},
 selectAnimation:name=>{if(!view.ready||exporting||name==='effect'&&adapter?.effectTimeline)return;if(!view.playing)$('play').click();$('animation').value=name;$('animation').onchange();},
 seek:time=>{if(!view.ready||exporting)return;adapter?.seek?.(time);if(controller){controller.state.actionTime=time;controller.state.normalizedTime=time/Math.max(.001,controller.duration||adapter?.timeline?.().duration||1);for(const event of controller.events||[])event.fired=event.time<=time;controller.pendingVoicePlayed=true;}stopAudio();},
 effectPlayback:()=>view.ready&&adapter?.effectTimeline?{...adapter.effectTimeline.state(),ready:!exporting}:null,
 seekEffect:time=>{if(!view.ready||exporting)return;adapter?.effectTimeline?.seek(time);adapter?.refreshEffect?.();},
 setEffectFixed:fixed=>{if(!view.ready||exporting)return;adapter?.effectTimeline?.setFixed(fixed);adapter?.refreshEffect?.();},
 restartEffect:()=>{if(!view.ready||exporting)return;adapter?.effectTimeline?.restart();adapter?.refreshEffect?.();},
 canvas:()=>canvas,onError:fail,
 tools:{
  identity:()=>selected?.id+':'+loadGeneration,editor:()=>editor,name:()=>selected?.name||selected?.id||'azurlane',
  reload:()=>{const id=retryId||selected?.id;if(id)return loadModel(id).catch(fail);},openPanel:open=>setPanelOpen('interaction',open),stopAudio,
  setExporting:value=>{if(value){stagePan.cancel();cancelInteraction();}exporting=value;interactButton.disabled=value||!view.ready;viewerUI.update(true);},capture:(state,format,quality)=>adapter.capture(state,format,quality),
  videoDuration:state=>adapter?.videoDuration?.(state)??state.duration,setBackground:()=>{},
  soundEnabled:()=>!muted,setSoundEnabled:enabled=>{if(muted===enabled)$('sound').click();},volume:()=>volume,
  setVolume,voiceTab:'voice',
  drawableOrder:part=>evidence.model?.internalModel.coreModel.getModel().drawables.renderOrders[part.index]||0,
 }
});
K.initCleanChrome();
function controls(){
 $('animation').replaceChildren(...selected.animations.map(name=>{const o=document.createElement('option');o.value=o.textContent=name;return o;}));$('animation').disabled=false;$('play').disabled=false;viewerUI.refreshAnimations();
 for(const id of ['reset-state','show-hint'])$(id).disabled=false;
 const areas=[...new Set(array(selected.interaction.hitAreas).map(h=>h.id))];$('hit-area').replaceChildren(...areas.map(name=>{const o=document.createElement('option');o.value=o.textContent=name;return o;}));$('hit-trigger').disabled=!areas.length;
 $('hit-trigger').onclick=()=>{const area=$('hit-area').value;unlockAudio().catch(()=>{});if(controller instanceof Live2DController){controller.start([area],0,0);controller.end(0,0);}else if(!controller.touch(area,{drag:false}))spineBasic(area);};
 $('voice').replaceChildren(...selected.voice.activeClips.map(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=(labels[c.cue]||c.cue)+(c.variant==='skin'?' · 皮肤':'')+(c.threshold?' · '+(c.threshold>=1000?'誓约':'好感')+' '+(c.threshold>=1000?c.threshold-1000:c.threshold):'');return o;}));
 $('interaction-note').textContent='按画面上的提示点按、拖动或长按。关闭面板后也能继续互动。';
 $('interaction-voice').hidden=!selected.voice.activeClips.length;
}
function commonLoopDuration(motionFrames, effectFrames, fps) {
 let a = motionFrames, b = effectFrames;
 while (b) [a, b] = [b, a % b];
 return motionFrames / a * effectFrames / fps;
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
function live2DFrameAtPose(frame, internal) {
 const anchor = frame?.anchor;
 if (!anchor) return frame;
 const index = internal.getDrawableIndex(anchor.drawable);
 if (index < 0) return frame;
 if (anchor.whenVisible) {
  const model = internal.coreModel;
  if (editor?.hidden.has(anchor.drawable) || !model.getDrawableDynamicFlagIsVisible(index) || model.getModel().drawables.opacities[index] < .2) return frame;
 }
 const vertices = internal.getDrawableVertices(index);
 if (!vertices || (!anchor.corners && vertices.length !== 8)) return frame;
 const indices = anchor.corners ?? [0, 1, 2, 3];
 if (indices.some(i => i * 2 + 1 >= vertices.length)) return frame;
 const matrix = internal.localTransform;
 const points = indices.map(i => matrix.apply(new PIXI.Point(vertices[i * 2], vertices[i * 2 + 1])));
 const rotation = anchor.align ? -Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x) : frame.rotation ?? 0;
 const cos = Math.cos(rotation), sin = Math.sin(rotation);
 const corners = anchor.align ? points.map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos })) : points;
 let centerX = 0, centerY = 0;
 for (const corner of corners) {
  centerX += corner.x / 4;
  centerY += corner.y / 4;
 }
 const aspect = (frame.maxX - frame.minX) / (frame.maxY - frame.minY);
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
 if (!Number.isFinite(halfHeight) || halfHeight <= 0) return frame;
 const halfWidth = halfHeight * aspect;
 return { minX: centerX - halfWidth, minY: centerY - halfHeight * (1 + 2 * (anchor.headroom ?? 0)),
  maxX: centerX + halfWidth, maxY: centerY + halfHeight, rotation };
}
async function live2dPortrait(model,generation){
 const app=new PIXI.Application({view:canvas,resizeTo:stage,autoStart:false,antialias:true,backgroundAlpha:0,resolution:Math.max(2,devicePixelRatio||1),autoDensity:true,preserveDrawingBuffer:true});
 let live, preparedSettings;
 const dispose=()=>{const gl=app.renderer?.gl,core=live?.internalModel?.coreModel,native=core?.getModel(),moc=native&&mocOwners.get(native);try{live?.destroy({children:true,texture:true,baseTexture:true});app.destroy(false,{children:true,texture:true,baseTexture:true});}catch{}finally{preparedSettings?.release();}if(moc&&!core?.getModel()&&!releasedMocs.has(moc)){moc._release();releasedMocs.add(moc);releasedMocCount++;}try{gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}};
 try {
  let settings = model.modelUrl;
  if (model.id === 'zhenzhuhao_2') {
   let lastProgress = '';
   preparedSettings = await prepareLive2DSettings(model.modelUrl, {
    signal: loadAbort.signal, motions: [model.defaultAnimation, 'idle', 'effect'],
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
   autoInteract: false, autoUpdate: false, motionPreload: PIXI.live2d.MotionPreloadStrategy.IDLE,
  });
  if (generation !== loadGeneration) { dispose(); return null; }
 } catch (error) { dispose(); throw error; }
 app.stage.addChild(live);live.anchor.set(.5,.5);const natural={width:live.internalModel.width,height:live.internalModel.height},internal=live.internalModel,core=internal.coreModel.getModel(),indexes=new Map(core.parameters.ids.map((id,i)=>[id,i]));
 const baseFrame = authoredLive2DFrame(model.id), portraitSurrounds = portraitSurroundNames(model.id);
 const pivotX = natural.width / 2, pivotY = natural.height / 2;
 evidence.model=live;evidence.app=app;editor=window.createInteractionLive2DEditor({live,core,hitAreas:model.interaction.hitAreas});const mouthIds=internal.settings.json.Groups?.find(g=>g.Name==='LipSync')?.Ids||[];
 let effectManager,effectMotion,effectTimeline,effectTime=0,sampleExportEffect=null;const renderedParameters=core.parameters.values.slice();
 const dragCover = model.id === 'wuqi_3' ? core.drawables.ids.indexOf('ArtMesh766') : -1;
 const coverDragParameter = indexes.get('touch_drag6');
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
  // The converted drag cover is opaque at rest and hides the entire room.
  if (dragCover < 0 || coverDragParameter === undefined || renderedParameters[coverDragParameter] > .001) {
   nativeDraw(gl);
   return;
  }
  const opacity = core.drawables.opacities[dragCover];
  core.drawables.opacities[dragCover] = 0;
  try { nativeDraw(gl); }
  finally { core.drawables.opacities[dragCover] = opacity; }
 };
 const lookParams=array(model.interaction.lookParameters).filter(p=>indexes.has(p.id));
 const manager=internal.motionManager,queue=manager.queueManager||manager.motionManager;
 // A separate queue retains the Unity effect layer when the base motion changes.
 if(model.animations.includes('effect')&&queue?.constructor){try{effectManager=new queue.constructor();effectMotion=await manager.loadMotion('effect',0);if(effectMotion){if(hasEffectControls(model.id))effectTimeline=new EffectTimeline(effectManager,effectMotion);else{effectMotion.setIsLoop(true);effectManager.startMotion(effectMotion,false,0);}}}catch(e){evidence.effectLayerError=String(e);effectManager=null;}}
 if(generation!==loadGeneration){dispose();return null;}
 const effectBaseParameters=effectTimeline?core.parameters.values.slice():null,effectParameterIndices=new Set((effectTimeline?.parameterIds||[]).map(id=>indexes.get(id)).filter(index=>index!==undefined));
 internal.on('beforeModelUpdate',()=>{
  const parameters=core.parameters;
  effectBaseParameters?.set(parameters.values);
  if(sampleExportEffect)sampleExportEffect();
  else if(effectManager){try{if(effectTimeline)effectTimeline.sample(internal.coreModel);else effectManager.doUpdateMotion(internal.coreModel,effectTime);}catch(e){evidence.effectLayerError=String(e);effectManager=null;effectTimeline=null;api.effectTimeline=null;}}
  const ignoreLook=controller?.states?.some(s=>s.active&&s.config.ignore_react===1);
  if(!ignoreLook)for(const p of lookParams){const i=indexes.get(p.id),rates=model.skinConfig.l2d_drag_rate,rate=Array.isArray(rates)?rates[p.axis]??1:1,value=p.factor*(p.axis===0?look.x:p.axis===1?look.y:look.x*look.y)*rate,range=model.skinConfig.l2d_para_range?.[p.id]||[parameters.minimumValues[i],parameters.maximumValues[i]];parameters.values[i]=Math.max(range[0],Math.min(range[1],parameters.values[i]+value));}
  const applied={};for(const p of controller?.parameters?.()||[]){const i=indexes.get(p.id);if(i===undefined)continue;let value=p.mode===2?parameters.values[i]+p.value:p.mode===3?parameters.values[i]*p.value:p.value;value=Math.max(parameters.minimumValues[i],Math.min(parameters.maximumValues[i],value));parameters.values[i]=value;applied[p.id]=value;}evidence.interaction.appliedParameters=applied;
  const gain=model.skinConfig.lip_sync_gain||model.interaction.mouth?.Gain||4;
  const ring=indexes.get('Paramring');if(ring!==undefined)parameters.values[ring]=controller?.state.favor>=1000?1:0;
  for(const id of mouthIds){const i=indexes.get(id);if(i!==undefined&&evidence.audio.state==='playing')parameters.values[i]=Math.max(parameters.values[i],Math.min(1,mouth*gain));}
  evidence.audio.mouthValues=Object.fromEntries(mouthIds.map(id=>[id,parameters.values[indexes.get(id)]]));editor?.applyParameters?.();renderedParameters.set(parameters.values);
 });
 let playSerial=0, activeMotion=model.defaultAnimation;
 let stageCrop = authoredLive2DFrame(model.id, activeMotion);
 let stageClip = null;
 const api={sound,stopAudio,fold,look:()=>look,parameter:id=>{const i=indexes.get(id);return i===undefined?undefined:core.parameters.values[i];},
  effectTimeline,
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
   const serial=++playSerial, motion=await manager.loadMotion(name,0);
   if(generation!==loadGeneration||serial!==playSerial)return;
   if(!motion)throw Error('动作不可用 '+name);
   if(model.animator?.states?.[options.state||name]?.writeDefaults){
    for(let i=0;i<core.parameters.ids.length;i++){
     const id=core.parameters.ids[i];
     core.parameters.values[i]=model.animator.defaultParameters?.[id]??core.parameters.defaultValues[i];
    }
    internal.coreModel.saveParameters();
   }
   motion.setIsLoop(loop);
   await live.motion(name,0,3);
   if(generation!==loadGeneration||serial!==playSerial)return;
   activeMotion=evidence.animation=name;
   stageCrop = authoredLive2DFrame(model.id, name);
   $('animation').value=name;
  },
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
  seek:(seconds,delta=0,draw=true)=>{const item=[...(queue?._motions||[])].reverse().find(item=>!item.isFinished()&&item._motion);if(!item)return;const duration=model.motionDurations?.[activeMotion]||item._motion.getLoopDuration(),time=Math.max(0,Math.min(duration-.0001,seconds)),clock=live.elapsedTime/1000;item.setStartTime(clock-time);item.setFadeInStartTime(clock-time);item.setEndTime(item._motion.isLoop()?-1:clock-time+duration);item.setIsFinished(false);item.setLastCheckEventSeconds(clock);internal.update(delta*1000,live.elapsedTime);live.deltaTime=0;if(draw)app.render();},
  polygons:()=>hotspots.map(h=>{const vertices=hotspotVertices(h);if(!vertices?.length)return null;const pts=[];for(let j=0;j<vertices.length;j+=2){const p=new PIXI.Point(vertices[j],vertices[j+1]);internal.localTransform.apply(p,p);live.worldTransform.apply(p,p);pts.push([p.x,p.y]);}return {id:h.id,vertices:pts};}).filter(Boolean)
 };
 function videoLoopPlan(playback) {
  const motionDuration = playback.duration;
  if (!playback.loop || !/^idle\d*$/.test(playback.name) || !Number.isFinite(motionDuration) || motionDuration <= 0) return null;
  const item = [...(queue?._motions || [])].reverse().find(entry => !entry.isFinished() && entry._motion?.isLoop());
  if (!item) return null;
  const legacyEffect = !effectTimeline ? effectManager?._motions?.[0] : null;
  const effectDuration = effectTimeline?.fixed ? 0 : effectTimeline?.duration ?? legacyEffect?._motion?.getLoopDuration?.() ?? 0;
  const plan = { item, legacyEffect, motionDuration, duration: motionDuration, effectDuration: 0, transition: 0 };
  if (!Number.isFinite(effectDuration) || effectDuration <= 0) return plan;
  const syncLimit = synchronizedVideoPortraits.get(model.id);
  if (syncLimit) {
   const sourceFPS = item._motion._sourceFrameRate;
   const fps = Number.isFinite(sourceFPS) && sourceFPS > 0 ? sourceFPS : 60;
   const motionFrames = Math.round(motionDuration * fps), effectFrames = Math.round(effectDuration * fps);
   if (motionFrames > 0 && effectFrames > 0 && Math.abs(motionDuration * fps - motionFrames) < .001 &&
       Math.abs(effectDuration * fps - effectFrames) < .001) {
    const duration = commonLoopDuration(motionFrames, effectFrames, fps);
    if (duration <= syncLimit) return { ...plan, duration, motionDuration: motionFrames / fps, effectDuration };
   }
  }
  if (blendedVideoPortraits.has(model.id) &&
      (playback.name === model.defaultAnimation || model.id === 'wuerlixi_3' && playback.name === 'idle1')) {
   // These backgrounds have a much longer cycle than the action. Blend only their
   // parameters near the join, keeping the motion at its original speed and length.
   return { ...plan, effectDuration, transition: Math.min(2, motionDuration / 3) };
  }
  return plan;
 }
 api.videoDuration = playback => videoLoopPlan(playback)?.duration ?? playback.duration;
 api.capture=(playback={},format,quality)=>{
  const motionFrame = authoredLive2DExportFrame(model.id, playback.name || activeMotion);
  const authoredFrame = live2DFrameAtPose(motionFrame, internal);
  const hitMeshes=new Set(model.interaction.hitAreas.map(area=>area.id));
  const surrounds=new Set([...portraitSurrounds, ...(motionFrame?.hiddenDrawables ?? [])]);
  const measure=()=>{
  const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity},rectangles=[];
  for(let i=0;i<core.drawables.ids.length;i++){
   if(hitMeshes.has(core.drawables.ids[i])||surrounds.has(core.drawables.ids[i])||!internal.coreModel.getDrawableDynamicFlagIsVisible(i)||core.drawables.opacities[i]<=.001||editor.hidden.has(core.drawables.ids[i])||!core.drawables.indices[i].length)continue;
   const vertices=internal.getDrawableVertices(i);
   const b={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
   for(let j=0;j<vertices.length;j+=2){const p=internal.localTransform.apply(new PIXI.Point(vertices[j],vertices[j+1]));b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);}
   // Screen-filling backdrop meshes can span over 100,000 pixels. Their
   // meaningful frame is the authored model canvas, not an infinite backdrop.
   if(b.maxX-b.minX>natural.width*4||b.maxY-b.minY>natural.height*4){b.minX=Math.max(0,b.minX);b.maxX=Math.min(natural.width,b.maxX);b.minY=Math.max(0,b.minY);b.maxY=Math.min(natural.height,b.maxY);}
   if(b.maxX>b.minX&&b.maxY>b.minY){rectangles.push({name:core.drawables.ids[i],bounds:[b.minX,b.minY,b.maxX,b.maxY]});for(const key of Object.keys(bounds))bounds[key]=key.startsWith('min')?Math.min(bounds[key],b[key]):Math.max(bounds[key],b[key]);}
  }
  return model.id==='guanghui_9'?portraitFrameBounds(model.id,rectangles)||bounds:bounds;};
  const bounds=authoredFrame || measure(),transform={x:live.x,y:live.y,sx:live.scale.x,sy:live.scale.y,px:live.pivot.x,py:live.pivot.y,rotation:live.rotation};
  const parameters=core.parameters.values.slice(),renderedFrame=renderedParameters.slice(),effectBaseFrame=effectBaseParameters?.slice(),parts=core.parts.opacities.slice(),nativeSaved=internal.coreModel._savedParameters.slice(),resolution=app.renderer.resolution;
  const originalQueue = queue?._motions;
  const restorePhysics=preserveSimulation(internal.physics),restoreEffect=preserveSimulation(effectManager),entries=[...(originalQueue||[])].map(item=>({item,values:{...item}})),elapsed=live.elapsedTime,delta=live.deltaTime,savedEffect=effectTimeline?.snapshot(),savedEffectTime=effectTime;
  const loop = format === 'video' ? videoLoopPlan(playback) : null;
  const breath = loop ? internal.breath : null;
  const breathTime = breath?._currentTime;
  const loopTimeline = loop && K.exportTimeline(loop.duration, quality, 'video');
  const step = loopTimeline ? loopTimeline.duration / loopTimeline.frames : 0;
  const warmFrames = loop ? Math.ceil(Math.min(2, loop.motionDuration) / step) : 0;
  const warmTime = warmFrames * step;
  const effectStart = savedEffect?.time ?? (loop?.legacyEffect ? savedEffectTime - Math.max(0, loop.legacyEffect.getStartTime()) : 0);
  const effectFade = loop?.effectDuration && loop.legacyEffect
   ? Math.max(0, effectMotion.getFadeInTime(), ...effectMotion._motionData.curves.map(curve => curve.fadeInTime || 0)) + 1 : 0;
  const effectChannels = loop?.transition ? [core.parameters.values, core.parts.opacities].map(values => ({
   values, original: values.slice(), alternate: values.slice(),
  })) : [];
  let lastTime=0,warmed=false;
  // The SDK restores base parameters after deforming a frame. Rebuild from
  // the actual rendered parameters, then restore the base values separately.
  const rewind = () => {
   restorePhysics(); restoreEffect();
   if (loop) queue._motions = originalQueue;
   if (Number.isFinite(breathTime)) breath._currentTime = breathTime;
   for (const {item, values} of entries) Object.assign(item, values);
   if (savedEffect) effectTimeline.restore(savedEffect);
   if (effectBaseFrame) effectBaseParameters.set(effectBaseFrame);
   effectTime = savedEffectTime;
   live.elapsedTime = elapsed; live.deltaTime = delta;
   core.parameters.values.set(renderedFrame); core.parts.opacities.set(parts);
   internal.coreModel.update();
   core.parameters.values.set(parameters); renderedParameters.set(renderedFrame);
   internal.coreModel._savedParameters = nativeSaved.slice();
   lastTime = 0; warmed = false;
  };
  const sampleEffect = time => {
   const phase = loopPhase(effectStart + time, loop.effectDuration);
   if (savedEffect) {
    effectTimeline.restore({ ...savedEffect, time: phase, settled: true });
    effectTimeline.sample(internal.coreModel);
   } else {
    const item = loop.legacyEffect;
    effectTime = phase;
    item.setIsStarted(true); item.setIsFinished(false);
    item.setStartTime(0); item.setEndTime(-1); item.setFadeInStartTime(phase - effectFade);
    item.setLastCheckEventSeconds(effectTime);
    effectManager.doUpdateMotion(internal.coreModel, effectTime);
   }
  };
  const sample = (time, draw) => {
   live.elapsedTime = elapsed + (warmTime + time) * 1000;
   if (loop?.effectDuration) {
    sampleExportEffect = () => {
     const blendStart = loop.duration - loop.transition;
     if (!loop.transition || time <= blendStart) { sampleEffect(time); return; }
     const fraction = Math.min(1, (time - blendStart) / loop.transition);
     const blend = fraction * fraction * (3 - 2 * fraction);
     for (const {values, original} of effectChannels) original.set(values);
     sampleEffect(time - loop.duration);
     for (const {values, original, alternate} of effectChannels) {
      alternate.set(values);
      values.set(original);
     }
     sampleEffect(time);
     for (const {values, alternate} of effectChannels) {
      for (let i = 0; i < values.length; i++) values[i] += (alternate[i] - values[i]) * blend;
     }
    };
   } else if (savedEffect) {
    effectTimeline.restore(savedEffect); effectTimeline.advance(time);
   } else effectTime = savedEffectTime + Math.max(0, time);
   const deltaTime = Math.max(0, time - lastTime);
   // Cubism adds a separate breathing oscillator before the authored effect layer.
   // Keep its phase constant so it does not change across the exported seam.
   if (Number.isFinite(breathTime)) breath._currentTime = breathTime - deltaTime;
   try {
    api.seek(loop ? loopPhase(time, loop.motionDuration) : time, deltaTime, draw);
   } finally {
    sampleExportEffect = null;
   }
   lastTime = time;
  };
  const advance = (time, draw = true) => {
   if (loop && !warmed) {
    // Enter the first frame from the previous cycle so Cubism fades and physics have the right pose.
    queue._motions = [loop.item];
    lastTime = -warmTime;
    for (let frame = warmFrames; frame > 0; frame--) sample(-frame * step, false);
    warmed = true;
   }
   sample(time, draw);
  };
  const setCaptureFrame = (size, tile, rotation = authoredFrame?.rotation ?? 0) => {
   live.pivot.set(0, 0);
   live.rotation = rotation;
   live.scale.set(size.scale);
   live.position.set(size.width / 2 - size.centerX * size.scale - (tile?.x ?? 0),
    size.height / 2 - size.centerY * size.scale - (tile?.y ?? 0));
  };
  return {pixelYUp:false,fixedFrame:authoredFrame,pngSize:quality=>({...K.exportDimensions(bounds,quality,'png',authoredFrame ? 0 : undefined),fullFrame:true}),
   measure:time=>{editor.before();advance(time);return measure();},rewind,
   draw:(time,size,background)=>{const added=[...surrounds].filter(id=>!editor.hidden.has(id));for(const id of added)editor.hidden.add(id);try{editor.before();
    if(size.fullFrame&&size.tiled!==false)return K.renderTiledPNG(size,tile=>{editor.before();app.renderer.resolution=1;app.renderer.resize(tile.width,tile.height);setCaptureFrame(size,tile);live.deltaTime=0;app.render();return canvas;},background);
    const followArtwork = size.fullFrame && motionFrame?.anchor && time !== null;
    if(size.fullFrame){
     app.renderer.resolution=1;app.renderer.resize(size.width,size.height);
     if (followArtwork) {
      advance(time, false);
      const poseFrame = live2DFrameAtPose(motionFrame, internal);
      const fit = stageBoundsForFrame(poseFrame);
      const scale = size.scale * (authoredFrame.maxX - authoredFrame.minX) / fit.width;
      setCaptureFrame({ ...size, scale, centerX: fit.x, centerY: fit.y }, null, poseFrame.rotation);
     } else setCaptureFrame(size);
    }
    else{app.renderer.resolution=size.width/stage.clientWidth;app.renderer.resize(stage.clientWidth,stage.clientHeight);}
    if(time!==null&&!followArtwork)advance(time);else app.render();return canvas;}finally{for(const id of added)editor.hidden.delete(id);editor.before();}},
   dispose:()=>{rewind();live.pivot.set(transform.px,transform.py);live.rotation=transform.rotation;live.scale.set(transform.sx,transform.sy);live.position.set(transform.x,transform.y);app.renderer.resolution=resolution;app.renderer.resize(stage.clientWidth,stage.clientHeight);render(0);}};
 };
 let fittingBounds = baseFrame && stageBoundsForFrame(baseFrame);
 let stageClipPath = '';
 render = dt => {
  viewerUI.tools.before();
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  if (app.renderer.screen.width !== w || app.renderer.screen.height !== h) app.renderer.resize(w, h);
  const frame = stageFrame();
  fittingBounds ||= K.live2DViewBounds(internal, natural, [...model.interaction.hitAreas.map(a => a.id), ...portraitSurrounds]);
  const crop = live2DFrameAtPose(stageCrop, internal);
  const fit = crop ? stageBoundsForFrame(crop) : fittingBounds;
  const scale = Math.min(frame.width / fit.width, frame.height / fit.height) * .92 * view.zoom;
  const rotation = crop?.rotation ?? 0, cos = Math.cos(rotation), sin = Math.sin(rotation);
  live.rotation = rotation;
  live.scale.set(scale);
  live.position.set(frame.x + view.panX + (pivotX * cos - pivotY * sin - fit.x) * scale,
   frame.y + view.panY + (pivotX * sin + pivotY * cos - fit.y) * scale);
  if (stageCrop) {
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
  if (view.playing) {
   if (effectTimeline) effectTimeline.advance(dt * view.speed);
   else effectTime += dt * view.speed;
   live.update(dt * 1000 * view.speed);
  }
  app.render();
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
 evidence.layers=layers;evidence.renderer=scene;model.animations=[...new Set(layers.flatMap(l=>l.data.animations.map(a=>a.name)))].sort();
 let mainLayer=0,sequence=0;
 for(let i=0;i<layers.length;i++)layers[i].state.addListener({event:(entry,event)=>{if(i===mainLayer&&entry.animation.name===controller?.state.motion)controller.event(event.data.name);},complete:entry=>{if(i===mainLayer&&entry.animation.name===controller?.state.motion&&controller.state.busy)controller.finish();}});
 const api={sound,stopAudio,fold,assistantEvent:area=>{if(basicActions[area])sound(model.voiceBank,motionCue(basicActions[area]),{voice:true});},skin:name=>{for(const l of layers){const skin=l.data.findSkin(name||l.spec.initialSkin||model.defaultSkin||'default');if(skin){l.skeleton.setSkin(skin);l.skeleton.setSlotsToSetupPose();}}},effects:visible=>{evidence.effectsVisible=visible;},alpha:data=>{evidence.alphaData=data;},
  expression:cue=>{if(!cue){for(const l of layers)l.state.setEmptyAnimation(1,.15);return;}if(controller?.state.busy)return;const field=({touch_1:'touch',touch_2:'touch2',touch_head:'headtouch',task:'mission',get:'unlock'})[cue]||cue;let name=model.expression?.base?.[field]||model.expression?.base?.default;const extra=model.expression?.extra?.[field];for(const row of array(extra))if(row[0]<=controller.state.favor)name=row[1];if(name===undefined||name===null||name==='')return;const multiple=model.interaction.spine?.multiple_face;if(array(multiple?.name).length&&Number.isFinite(Number(name))){const offset=array(multiple.data).find(r=>r[0]===controller.state.idle)?.[1]||0;name=String(Number(name)+offset);}name=String(name);for(const l of layers)if(l.data.findAnimation(name))l.state.setAnimation(1,name,true);evidence.expression={cue,name};},
  play:async(name,loop,options={})=>{sequence++;let max=-1;for(let i=0;i<layers.length;i++){const a=layers[i].data.findAnimation(name);if(a&&a.duration>max){max=a.duration;mainLayer=i;}}for(const l of layers){const a=l.data.findAnimation(name);if(a&&!l.spec.freeze){for(const track of array(options.clear))l.state.setEmptyAnimation(track,0);l.state.setAnimation(0,name,loop);}else if(!l.state.getCurrent(0)){const def=l.data.findAnimation(l.spec.defaultAnimation||model.defaultAnimation)||l.data.animations[0];if(def)l.state.setAnimation(0,def.name,true);}l.state.apply(l.skeleton);l.skeleton.updateWorldTransform();}evidence.animation=name;$('animation').value=name;},
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
 const rectangles=[];
 if (!authoredFrame) for(const l of layers)for(const slot of l.skeleton.drawOrder){const a=slot.attachment;let vertices;if(a instanceof spine.RegionAttachment){vertices=new Float32Array(8);a.computeWorldVertices(slot.bone,vertices,0,2);}else if(a instanceof spine.MeshAttachment){vertices=new Float32Array(a.worldVerticesLength);a.computeWorldVertices(slot,0,a.worldVerticesLength,vertices,0,2);}if(!vertices?.length)continue;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(let i=0;i<vertices.length;i+=2){minX=Math.min(minX,vertices[i]);maxX=Math.max(maxX,vertices[i]);minY=Math.min(minY,vertices[i+1]);maxY=Math.max(maxY,vertices[i+1]);}rectangles.push({name:slot.data.name,bounds:[minX,minY,maxX,maxY]});}
 const framing = authoredFrame ? { bounds: stageBoundsForFrame(authoredFrame), excluded: [] } : fitSceneBounds(rectangles);
 const bounds=framing.bounds;evidence.bounds=bounds;evidence.offscreenLayers=framing.excluded;const maxBuffer=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
 const project=(x,y)=>{const p=api.world(0,0),q=api.world(stage.clientWidth,stage.clientHeight);return {x:(x-p.x)/(q.x-p.x)*stage.clientWidth,y:(y-p.y)/(q.y-p.y)*stage.clientHeight};};
 editor=window.createInteractionSpineEditor({layers,ns:spine,project,unproject:api.world});
 api.capture = animation => {
  const hidden = new Set(editor.hidden), surrounds = portraitSurroundNames(model.id);
  layers.forEach((layer, i) => {
   for (const slot of layer.skeleton.slots) if (surrounds.has(slot.data.name)) hidden.add(i + ':' + slot.data.name);
  });
  const session = window.createInteractionSpineCapture({ layers, ns:spine, canvas, renderer:scene, gl,
   editor:{...editor, hidden}, animation, restore:()=>render(0) });
  if (authoredFrame) session.fixedFrame = authoredFrame;
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
  for (const layer of layers) {
   if (view.playing) {
    layer.state.update(dt * view.speed);
    layer.state.apply(layer.skeleton);
    layer.skeleton.updateWorldTransform();
   }
  }
  viewerUI.tools.after();
  if (authoredFrame) {
   const scale = density / units;
   const left = Math.floor(bw / 2 + (authoredFrame.minX - camera.position.x) * scale);
   const right = Math.ceil(bw / 2 + (authoredFrame.maxX - camera.position.x) * scale);
   const bottom = Math.floor(bh / 2 + (authoredFrame.minY - camera.position.y) * scale);
   const top = Math.ceil(bh / 2 + (authoredFrame.maxY - camera.position.y) * scale);
   gl.enable(gl.SCISSOR_TEST);
   gl.scissor(left, bottom, right - left, top - bottom);
  }
  try {
   scene.begin();
   for (const layer of layers) scene.drawSkeleton(layer.skeleton, true);
   scene.end();
  } finally {
   if (authoredFrame) gl.disable(gl.SCISSOR_TEST);
  }
 };
 disposeRenderer=dispose;return api;
}
async function getJson(url,required=true,signal){try{return JSON.parse(new TextDecoder().decode(await readPortraitAsset(url,{signal})));}catch(error){if(!required&&error.status===404)return null;throw error;}}
async function loadModel(id,{history=true}={}){
 if(exporting)return false;
 loadAbort?.abort();loadAbort=new AbortController();retryId=id;
 stagePan.cancel();cancelInteraction();
 interactButton.disabled=true;for(const key of ['reset-state','show-hint'])$(key).disabled=true;$('interaction-voice').hidden=true;interactionHint.hidden=true;hintArea=previousHintArea=null;hintInteractionCount=0;K.clearToasts('azur-interaction');K.clearToasts('azur-audio');$('interaction-more').open=false;$('interaction-note').textContent='立绘正在加载，完成后可开启互动。';
 const requestedId=id;id=canonicalModelId(id);if(id!==requestedId){const url=new URL(location.href);url.searchParams.set('id',id);window.history.replaceState(null,'',url);}
 viewerUI.tools.prepareLoad();
 const generation=++loadGeneration;previewPending=true;nextPreviewCheck=0;loadingPreview.begin(generation,{path:previewPath(id),label:allModels.find(m=>m.id===id)?.name||id,trimImage:true});view.ready=evidence.ready=false;viewerUI.update(true);render=null;pointer=null;editor=null;controller?.dispose();controller=null;disposeRenderer?.();disposeRenderer=null;stopAudio();fold(false);delete evidence.model;delete evidence.app;delete evidence.layers;delete evidence.renderer;delete evidence.bounds;delete evidence.effect;delete evidence.effectLayerError;evidence.errors=[];evidence.interaction={};evidence.audio.missing=[];
 if (canvas.style.clipPath) stage.style.removeProperty('touch-action');
 const next=canvas.cloneNode(false);next.style.clipPath='';canvas.replaceWith(next);canvas=next;Object.assign(view,{zoom:1,panX:0,panY:0,playing:true,frames:0});look.x=look.y=look.targetX=look.targetY=0;portraitTime=0;zoomTo(1);$('status').textContent=id+' · 正在读取模型和交互…';
 const data=await Promise.all([getJson(BASE+'/catalog/'+encodeURIComponent(id)+'.json',true,loadAbort.signal),getJson(BASE+'/model-audio/'+encodeURIComponent(id)+'.json',false,loadAbort.signal),allModels.find(m=>m.id===id)?.type==='live2d'?getJson(BASE+'/animators/'+encodeURIComponent(id)+'.json',false,loadAbort.signal):null]).catch(e=>{if(generation!==loadGeneration)return null;loadAbort.abort(e);throw e;});
 if(!data)return false;const [model,audio,animator]=data;
 if(generation!==loadGeneration)return false;selected=model;if(audio)Object.assign(model,audio);if(animator)model.animator=animator;evidence.selected=model;$('active-name').textContent=stageName(model);populate();
 let loaded;try{loaded=await (model.type==='live2d'?live2dPortrait(model,generation):spinePortrait(model,generation));}catch(e){if(generation!==loadGeneration)return false;throw e;}if(generation!==loadGeneration||!loaded)return false;adapter=loaded;
 controller=model.type==='live2d'?new Live2DController(model,adapter,{storage:localStorage,favor:highestFavor(model)}):new SpineController(model,adapter,{storage:localStorage,favor:highestFavor(model)});evidence.controller=controller;evidence.adapter=adapter;controls();controller.playIdle();
 view.ready=evidence.ready=true;interactButton.disabled=false;zoomTo(view.zoom);document.title=stageName(model)+' · ArtHub';$('status').textContent=stageName(model)+' · '+model.animations.length+' 个动作';K.setLibraryStageReady(true);populate();
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
 viewerUI.update();if(now>=nextEvidence){record();nextEvidence=now+250;}}}catch(e){view.ready=evidence.ready=false;fail(e);}requestAnimationFrame(frame);}
requestAnimationFrame(frame);
try{const [listing,thumbData,retired]=await Promise.all([getJson(BASE+'/characters.json'),getJson(THUMB_PREFIX+'index.json',false).catch(()=>null),getJson('./retired-models.json')]);retiredModels=retired;allModels=listing.characters.filter(m=>!retiredModels[m.id]);libraryThumbs=thumbData?.items||{};evidence.catalog=allModels;$('counts').textContent=`${allModels.length} 项 · ${allModels.filter(m=>m.type==='live2d').length} Live2D / ${allModels.filter(m=>m.type==='spine').length} Spine`;K.setLibraryStageReady(false);populate();const id=new URL(location.href).searchParams.get('id'),initial=allModels.find(m=>m.id===canonicalModelId(id));if(initial)await loadModel(id);else setPanelOpen('library',true);}catch(e){fail(e);}
