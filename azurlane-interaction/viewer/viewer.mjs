import {Live2DController,SpineController,array,basicActions,motionCue,triangleContains,polygonContains,fitSceneBounds,voiceClip} from './controller.mjs';
const $=id=>document.getElementById(id),K=window.SpineKit,BASE='..';
const stage=$('stage');let canvas=$('canvas'),selected,allModels=[],controller,render,disposeRenderer,adapter,loadGeneration=0,portraitTime=0,space=false,showHits=false;
K.initStageUI({canvas});
const loadingPreview=K.createLoadingPreview(stage);
let previewPending=false,nextPreviewCheck=0;
const previewSample=document.createElement('canvas');previewSample.width=previewSample.height=64;
const previewContext=previewSample.getContext('2d',{willReadFrequently:true});
const bootPreviewId=new URL(location.href).searchParams.get('id');
if(/^[a-z0-9_-]+$/i.test(bootPreviewId||''))loadingPreview.begin(0,{path:K.siteRoot()+'thumbs/azurlane/'+encodeURIComponent(bootPreviewId)+'.webp',label:'当前立绘',trimImage:true});
const view={zoom:1,panX:0,panY:0,playing:true,speed:1,frames:0,ready:false};
let editor=null,exporting=false,volume=Number(localStorage.getItem('arthub:azurlane:volume')??1);
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
function zoomTo(next,x,y){if(!Number.isFinite(next)||next<=0)return;next=Math.max(.1,Math.min(8,next));if(Number.isFinite(x)){const r=canvas.getBoundingClientRect(),f=next/view.zoom;view.panX=f*view.panX+(1-f)*(x-r.left-r.width/2);view.panY=f*view.panY+(1-f)*(y-r.top-r.height/2);}view.zoom=next;for(const id of ['zOut','zPct','zIn'])$(id).disabled=!view.ready;$('zPct').textContent=next<100?Math.round(next*100)+'%':next.toPrecision(3)+'×';}
$('zIn').onclick=()=>zoomTo(view.zoom*1.25);$('zOut').onclick=()=>zoomTo(view.zoom/1.25);$('fit').onclick=()=>{view.panX=view.panY=0;zoomTo(1);};$('zPct').onclick=()=>$('fit').click();
stage.addEventListener('wheel',e=>{if(e.target!==canvas)return;e.preventDefault();zoomTo(view.zoom*Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);},{passive:false});
let ctx,muted=false,audioSerial=0,audioScope=0,voiceAnalyser,mouth=0;const channels=new Map(),buffers=new Map();
async function unlockAudio(){ctx||=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')await ctx.resume();evidence.audio.contextState=ctx.state;}
function stopChannel(channel){const job=channels.get(channel);if(job){job.cancelled=true;try{job.source?.stop();}catch{}job.source?.disconnect();job.gain?.disconnect();channels.delete(channel);}if(channel==='voice'){voiceAnalyser=null;evidence.audio.state='idle';adapter?.expression?.(null);}}
function stopAudio(){audioScope++;for(const ch of [...channels.keys()])stopChannel(ch);voiceAnalyser=null;evidence.audio.state='idle';evidence.audio.rms=0;}
async function playSound(bank,cue,options={}){
 if(!cue||muted||!selected)return;const model=selected,scope=audioScope;
 const clip=options.voice?voiceClip(model,cue,controller?.state.favor??0,options.exact):model.soundBanks?.[bank]?.find(c=>c.name===cue);
 if(!clip){const key=bank+':'+cue;if(!evidence.audio.missing.includes(key))evidence.audio.missing.push(key);return;}
 const channel=options.channel||(options.voice?'voice':'sfx'+(++audioSerial%8));const previous=channels.get(channel);if(channel==='bgm'&&previous?.clip===clip.name&&previous.gain){previous.baseVolume=options.volume??1;previous.gain.gain.setTargetAtTime(previous.baseVolume*volume,ctx.currentTime,.05);return;}stopChannel(channel);
 const job={cancelled:false};channels.set(channel,job);await unlockAudio();
 let buffer=buffers.get(clip.url);if(!buffer){const r=await fetch(clip.url);if(!r.ok)throw Error('声音资源 '+r.status+' '+clip.name);buffer=await ctx.decodeAudioData(await r.arrayBuffer());buffers.set(clip.url,buffer);while(buffers.size>24)buffers.delete(buffers.keys().next().value);}
 if(job.cancelled||scope!==audioScope||selected!==model||muted)return;
 const source=ctx.createBufferSource(),gain=ctx.createGain(),baseVolume=Number.isFinite(options.volume)?options.volume:1;source.buffer=buffer;source.loop=!!options.loop;gain.gain.value=baseVolume*volume;source.connect(gain);gain.connect(ctx.destination);Object.assign(job,{source,gain,clip:clip.name,baseVolume});
 if(options.voice){voiceAnalyser=ctx.createAnalyser();voiceAnalyser.fftSize=512;source.connect(voiceAnalyser);Object.assign(evidence.audio,{state:'playing',clip:clip.name,cue:clip.cue||cue,plays:evidence.audio.plays+1,seconds:buffer.duration});adapter?.expression?.(clip.cue||cue);$('voice-status').textContent=labels[clip.cue]||clip.cue||cue;$('dialogue').textContent=clip.text||'';$('voice').value=clip.name;}
 else evidence.audio.effects=(evidence.audio.effects||0)+1;
 source.onended=()=>{if(channels.get(channel)!==job)return;channels.delete(channel);source.disconnect();gain.disconnect();if(options.voice){voiceAnalyser=null;evidence.audio.state='ended';evidence.audio.rms=0;adapter?.expression?.(null);}};source.start();
}
function sound(bank,cue,options){playSound(bank,cue,options).catch(e=>{evidence.audio.error=e.message;$('voice-status').textContent='声音读取失败：'+e.message;});}
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
  const preview=document.createElement('div');preview.className='ph';const text=document.createElement('div');text.className='tm';const name=document.createElement('div'),tag=document.createElement('span'),star=document.createElement('button');name.className='tn';tag.className='tt';star.className='tstar'+(K.favs.has(entry(m).k)?' on':'');name.textContent=portraitName(m);tag.textContent=m.type==='live2d'?'Live2D':'Spine';star.type='button';star.title=K.favs.has(entry(m).k)?'取消收藏':'收藏';star.setAttribute('aria-label',star.title);star.setAttribute('aria-pressed',String(K.favs.has(entry(m).k)));star.innerHTML=K.uiIcon('star',18,K.favs.has(entry(m).k));text.append(name);card.append(preview,text,tag,star);const thumb=libraryThumbs['azurlane:'+m.id];K.setPreview(preview,thumb?THUMB_PREFIX+thumb:null);
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
$('btnAnimTab').onclick=()=>{const open=!document.body.classList.contains('interaction-open');if(open)viewerUI.showTab('anim');setPanelOpen('interaction',open);if(open&&innerWidth<=760)setPanelOpen('library',false);};
$('gridClose').onclick=()=>setPanelOpen('library',false);$('panel-close').onclick=()=>setPanelOpen('interaction',false);
document.querySelectorAll('[data-panel-tab]').forEach(tab=>tab.addEventListener('click',()=>{const name=tab.dataset.panelTab;document.querySelectorAll('[data-panel-tab]').forEach(button=>{const active=button===tab;button.classList.toggle('on',active);button.setAttribute('aria-selected',String(active));});document.querySelectorAll('[data-panel-page]').forEach(page=>page.classList.toggle('on',page.dataset.panelPage===name));}));
$('railStar').onclick=()=>{if(selected){K.favs.toggle(entry(selected));populate();}};
$('railThumb').onclick=()=>$('fit').click();
$('btnPrev').onclick=()=>step(-1);$('btnNext').onclick=()=>step(1);

function step(direction){if(!allModels.length)return;const index=allModels.findIndex(m=>m.id===selected?.id);const next=index<0?(direction>0?0:allModels.length-1):(index+direction+allModels.length)%allModels.length;setPanelOpen('library',false);loadModel(allModels[next].id).catch(fail);}
$('play').onclick=()=>{view.playing=!view.playing;$('play').textContent=view.playing?'暂停':'播放';if(ctx)(view.playing?ctx.resume():ctx.suspend()).catch(()=>{});};
$('speed').onchange=()=>view.speed=Number($('speed').value);
$('animation').onchange=()=>{unlockAudio().catch(()=>{});controller?.action($('animation').value,{force:true,idle:$('loop').checked,interactive:true});};
$('loop').onchange=()=>$('animation').onchange();
$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'声音：关':'声音：开';evidence.audio.muted=muted;if(muted)stopAudio();else unlockAudio().catch(()=>{});};
$('voice-play').onclick=()=>{const c=selected?.voice?.activeClips?.find(c=>c.name===$('voice').value);if(c)sound(selected.voiceBank,c.name,{voice:true,exact:true});};
$('voice-stop').onclick=()=>stopChannel('voice');$('reset-state').onclick=()=>{stopAudio();controller?.reset();};$('show-hits').onclick=()=>{showHits=!showHits;$('show-hits').textContent=showHits?'隐藏触摸区域':'显示触摸区域';};
$('favor').onchange=()=>{if(controller)controller.state.favor=Number($('favor').value);};
function localPoint(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
const stagePan=K.createStagePan({stage,button:$('btnStagePan'),modeSelect:$('pointer-mode'),accepts:target=>target===canvas,ready:()=>view.ready&&!exporting,
 move:(dx,dy)=>{view.panX+=dx;view.panY+=dy;},
 tap:event=>{unlockAudio().catch(()=>{});const p=localPoint(event),hits=adapter.hits(p.x,p.y);evidence.interaction.hits=hits;if(selected.type==='live2d'){controller.start(hits,p.x,p.y,adapter.world(p.x,p.y));controller.end(p.x,p.y);}else{const hit=hits[0];if(!hit||!controller.touch(hit,{drag:false}))spineBasic(hit);}}
});
stage.addEventListener('pointerdown',e=>{
 if(e.target!==canvas||e.button!==0||!view.ready)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);unlockAudio().catch(()=>{});const p=localPoint(e),pan=space||$('pointer-mode').value==='pan',hits=pan?[]:adapter.hits(p.x,p.y);pointer={x:p.x,y:p.y,startX:p.x,startY:p.y,pan,hits,down:portraitTime};evidence.interaction.hits=hits;
 if(!pan&&selected.type==='live2d')controller.start(hits,p.x,p.y,adapter.world(p.x,p.y));
});
stage.addEventListener('pointermove',e=>{
 const p=localPoint(e);
 if(!pointer)return;
 if(pointer.pan){view.panX+=p.x-pointer.x;view.panY+=p.y-pointer.y;}
 else if(selected.type==='live2d'){
  controller.move(p.x,p.y,adapter.world(p.x,p.y));const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);look.targetX=Math.max(-1,Math.min(1,(p.x-pointer.startX)/w*(selected.interaction.settings.DragRateX||5)));look.targetY=Math.max(-1,Math.min(1,-(p.y-pointer.startY)/h*(selected.interaction.settings.DragRateY||3)));
 }
 else if(!pointer.triggered&&pointer.hits[0]&&(Math.abs(p.x-pointer.startX)>200||Math.abs(p.y-pointer.startY)>200)){pointer.triggered=controller.touch(pointer.hits[0],{drag:true});}
 pointer.x=p.x;pointer.y=p.y;
});
function release(e,cancel=false){if(!pointer)return;const p=localPoint(e),down=pointer;pointer=null;look.targetX=look.targetY=0;if(down.pan)return;
 if(selected.type==='live2d')controller.end(p.x,p.y,cancel);
 else if(!cancel&&!down.triggered){const click=Math.abs(p.x-down.startX)<30&&Math.abs(p.y-down.startY)<30&&portraitTime-down.down<.5;const hit=down.hits[0];if(hit){if((Math.abs(p.x-down.startX)<200||Math.abs(p.y-down.startY)<200)&&!controller.touch(hit,{drag:false})&&click)spineBasic(hit);}else if(click)spineBasic();}
}
stage.addEventListener('pointerup',e=>release(e));stage.addEventListener('pointercancel',e=>release(e,true));
window.addEventListener('keydown',e=>{if(e.code==='Space'&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)){space=true;e.preventDefault();}if(e.key==='Escape'){fold(false);setPanelOpen('library',false);setPanelOpen('interaction',false);}});window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;if(pointer&&controller instanceof Live2DController)controller.end(pointer.x,pointer.y,true);pointer=null;look.targetX=look.targetY=0;});
function spineBasic(hit){if(controller.state.busy)return;let event=selected.interaction.hitAreas.find(h=>h.id===hit)?.event;if(selected.id.endsWith('_hx')&&event==='TouchSpecial')event='TouchBody';if(event){const action=basicActions[event];if(!controller.action(action,{interactive:true}))sound(selected.voiceBank,motionCue(action),{voice:true});return;}const candidates=selected.animations.filter(n=>/^main_\d+$/.test(n));if(candidates.length)controller.action(candidates[Math.floor(Math.random()*candidates.length)],{interactive:true});else{const clips=selected.voice.activeClips.filter(c=>/^main_\d+$/.test(c.cue));const c=clips[Math.floor(Math.random()*clips.length)];if(c)sound(selected.voiceBank,c.cue,{voice:true});}}
const viewerUI=window.createInteractionViewerUI({
 animations:()=>array(selected?.animations).map(name=>({name,duration:selected.motionDurations?.[name]||adapter?.duration?.(name)||0})),
 playback:()=>{const timeline=adapter?.timeline?.()||{};return {ready:view.ready&&view.frames>2,key:selected?.id+':'+loadGeneration,name:timeline.name||controller?.state.motion,time:timeline.time??controller?.state.actionTime??0,duration:timeline.duration||selected?.motionDurations?.[controller?.state.motion]||0,loop:timeline.loop??$('loop').checked,playing:view.playing,speed:view.speed,canSeek:!!adapter?.seek};},
 setPlaying:playing=>{if(view.playing!==playing)$('play').click();},
 setSpeed:speed=>{view.speed=speed;},
 setLoop:loop=>{$('loop').checked=loop;$('loop').onchange();},
 selectAnimation:name=>{if(!view.playing)$('play').click();$('animation').value=name;$('animation').onchange();},
 seek:time=>{adapter?.seek?.(time);if(controller){controller.state.actionTime=time;controller.state.normalizedTime=time/Math.max(.001,controller.duration||adapter?.timeline?.().duration||1);for(const event of controller.events||[])event.fired=event.time<=time;controller.pendingVoicePlayed=true;}stopAudio();},
 canvas:()=>canvas,onError:fail,
 tools:{
  identity:()=>selected?.id+':'+loadGeneration,editor:()=>editor,name:()=>selected?.name||selected?.id||'azurlane',
  reload:()=>selected&&loadModel(selected.id),openPanel:open=>setPanelOpen('interaction',open),stopAudio,
  setExporting:value=>{exporting=value;},capture:state=>adapter.capture(state),setBackground:()=>{},
  soundEnabled:()=>!muted,setSoundEnabled:enabled=>{if(muted===enabled)$('sound').click();},volume:()=>volume,
  setVolume:value=>{volume=value;localStorage.setItem('arthub:azurlane:volume',value);for(const job of channels.values())if(job.gain)job.gain.gain.value=(job.baseVolume??1)*value;},voiceTab:'voice',
  drawableOrder:part=>evidence.model?.internalModel.coreModel.getModel().drawables.renderOrders[part.index]||0,
 }
});
function controls(){
 $('animation').replaceChildren(...selected.animations.map(name=>{const o=document.createElement('option');o.value=o.textContent=name;return o;}));$('animation').disabled=false;$('play').disabled=false;viewerUI.refreshAnimations();
 $('touch-actions').replaceChildren();for(const [area,label] of [['TouchHead','摸头'],['TouchBody','普通触摸'],['TouchSpecial','特殊触摸']]){const button=document.createElement('button');button.textContent=label;button.dataset.area=area;const name=basicActions[area],voice=selected.voice.activeClips.find(c=>c.cue===motionCue(name));button.disabled=!selected.animations.includes(name)&&!voice;button.onclick=()=>{unlockAudio().catch(()=>{});if(!controller.action(name,{interactive:true})&&voice&&!controller.state.busy)sound(selected.voiceBank,voice.cue,{voice:true});};$('touch-actions').append(button);}
 const areas=[...new Set(array(selected.interaction.hitAreas).map(h=>h.id))];$('hit-area').replaceChildren(...areas.map(name=>{const o=document.createElement('option');o.value=o.textContent=name;return o;}));$('hit-trigger').disabled=!areas.length;
 $('hit-trigger').onclick=()=>{const area=$('hit-area').value;unlockAudio().catch(()=>{});if(controller instanceof Live2DController){controller.start([area],0,0);controller.end(0,0);}else if(!controller.touch(area,{drag:false}))spineBasic(area);};
 $('voice').replaceChildren(...selected.voice.activeClips.map(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=(labels[c.cue]||c.cue)+(c.variant==='skin'?' · 皮肤':'')+(c.threshold?' · '+(c.threshold>=1000?'誓约':'好感')+' '+(c.threshold>=1000?c.threshold-1000:c.threshold):'');return o;}));
 $('drag-controls').replaceChildren();
 const drags=array(selected.interaction.configs).filter(c=>c.draw_able_name&&(c.offset_x||c.offset_y||c.action_trigger?.type===3));
 $('interaction-note').textContent=selected.type==='live2d'?`触摸、拖拽和长按由当前姿态决定。${drags.length} 个拖拽／长按控制；滚轮可继续放大。`:(selected.interaction.spine?.drag_data?'在原始热点内点击或拖动，可切换动作与姿态。':'这项资源没有独立互动规则，可播放原始动画。');
}
async function live2dPortrait(model,generation){
 const app=new PIXI.Application({view:canvas,resizeTo:stage,autoStart:false,antialias:true,backgroundAlpha:0,resolution:Math.max(2,devicePixelRatio||1),autoDensity:true,preserveDrawingBuffer:true});
 let live;
 const dispose=()=>{const gl=app.renderer?.gl,core=live?.internalModel?.coreModel,native=core?.getModel(),moc=native&&mocOwners.get(native);try{live?.destroy({children:true,texture:true,baseTexture:true});app.destroy(false,{children:true,texture:true,baseTexture:true});}catch{}if(moc&&!core?.getModel()&&!releasedMocs.has(moc)){moc._release();releasedMocs.add(moc);releasedMocCount++;}try{gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}};
 try{live=await PIXI.live2d.Live2DModel.from(model.modelUrl,{autoInteract:false,autoUpdate:false,motionPreload:PIXI.live2d.MotionPreloadStrategy.IDLE});if(generation!==loadGeneration){dispose();return null;}}catch(e){dispose();throw e;}
 app.stage.addChild(live);live.anchor.set(.5,.5);const natural={width:live.internalModel.width,height:live.internalModel.height},internal=live.internalModel,core=internal.coreModel.getModel(),indexes=new Map(core.parameters.ids.map((id,i)=>[id,i]));
 evidence.model=live;evidence.app=app;editor=window.createInteractionLive2DEditor({live,core,hitAreas:model.interaction.hitAreas});const mouthIds=internal.settings.json.Groups?.find(g=>g.Name==='LipSync')?.Ids||[];
 // PIXI's Live2DModel.update only queues elapsed time; native deformation runs
 // inside app.render. Apply visibility after that update and before drawing.
 const nativeDraw=internal.draw.bind(internal);internal.draw=gl=>{viewerUI.tools.after();nativeDraw(gl);};
 const lookParams=array(model.interaction.lookParameters).filter(p=>indexes.has(p.id));
 let effectManager,effectTime=0;
 const manager=internal.motionManager,queue=manager.queueManager||manager.motionManager;
 // A separate queue retains the Unity effect layer when the base motion changes.
 if(model.animations.includes('effect')&&queue?.constructor){try{effectManager=new queue.constructor();const motion=await manager.loadMotion('effect',0);if(motion){motion.setIsLoop(true);effectManager.startMotion?.(motion,false,0);}}catch(e){evidence.effectLayerError=String(e);}}
 if(generation!==loadGeneration){dispose();return null;}
 internal.on('beforeModelUpdate',()=>{
  const parameters=core.parameters;
  if(effectManager){try{effectManager.doUpdateMotion?.(internal.coreModel,effectTime);}catch(e){evidence.effectLayerError=String(e);effectManager=null;}}
  const ignoreLook=controller?.states?.some(s=>s.active&&s.config.ignore_react===1);
  if(!ignoreLook)for(const p of lookParams){const i=indexes.get(p.id),rates=model.skinConfig.l2d_drag_rate,rate=Array.isArray(rates)?rates[p.axis]??1:1,value=p.factor*(p.axis===0?look.x:p.axis===1?look.y:look.x*look.y)*rate,range=model.skinConfig.l2d_para_range?.[p.id]||[parameters.minimumValues[i],parameters.maximumValues[i]];parameters.values[i]=Math.max(range[0],Math.min(range[1],parameters.values[i]+value));}
  const applied={};for(const p of controller?.parameters?.()||[]){const i=indexes.get(p.id);if(i===undefined)continue;let value=p.mode===2?parameters.values[i]+p.value:p.mode===3?parameters.values[i]*p.value:p.value;value=Math.max(parameters.minimumValues[i],Math.min(parameters.maximumValues[i],value));parameters.values[i]=value;applied[p.id]=value;}evidence.interaction.appliedParameters=applied;
  const gain=model.skinConfig.lip_sync_gain||model.interaction.mouth?.Gain||4;
  const ring=indexes.get('Paramring');if(ring!==undefined)parameters.values[ring]=controller?.state.favor>=1000?1:0;
  for(const id of mouthIds){const i=indexes.get(id);if(i!==undefined&&evidence.audio.state==='playing')parameters.values[i]=Math.max(parameters.values[i],Math.min(1,mouth*gain));}
  evidence.audio.mouthValues=Object.fromEntries(mouthIds.map(id=>[id,parameters.values[indexes.get(id)]]));editor?.applyParameters?.();
 });
 let playSerial=0;
 const api={sound,stopAudio,fold,look:()=>look,parameter:id=>{const i=indexes.get(id);return i===undefined?undefined:core.parameters.values[i];},
  play:async(name,loop,options={})=>{const serial=++playSerial,motion=await manager.loadMotion(name,0);if(generation!==loadGeneration||serial!==playSerial)return;if(!motion)throw Error('动作不可用 '+name);if(model.animator?.states?.[options.state||name]?.writeDefaults){for(let i=0;i<core.parameters.ids.length;i++){const id=core.parameters.ids[i];core.parameters.values[i]=model.animator.defaultParameters?.[id]??core.parameters.defaultValues[i];}internal.coreModel.saveParameters();}motion.setIsLoop(loop);await live.motion(name,0,3);evidence.animation=name;$('animation').value=name;},
  world:(x,y)=>{const p=live.toModelPosition(new PIXI.Point(x,y));return {x:p.x,y:p.y};},
  hits:(x,y)=>{
   const p=api.world(x,y),d=core.drawables,hits=[];
   for(const h of model.interaction.hitAreas){const i=internal.getDrawableIndex(h.id);if(i<0)continue;const vertices=internal.getDrawableVertices(h.id);let hit=false;
    if(h.precision===1)hit=triangleContains(p.x,p.y,vertices,d.indices[i]);
    else {let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(let j=0;j<vertices.length;j+=2){minX=Math.min(minX,vertices[j]);maxX=Math.max(maxX,vertices[j]);minY=Math.min(minY,vertices[j+1]);maxY=Math.max(maxY,vertices[j+1]);}hit=p.x>=minX&&p.x<=maxX&&p.y>=minY&&p.y<=maxY;}
    if(hit)hits.push({id:h.id,order:d.renderOrders[i]});
   }return hits.sort((a,b)=>b.order-a.order).map(h=>h.id);
  },
  duration:name=>model.motionDurations?.[name]||0,
  timeline:()=>{const item=[...(queue?._motions||[])].reverse().find(item=>!item.isFinished()&&item._motion);const duration=model.motionDurations?.[evidence.animation]||item?._motion?.getLoopDuration?.()||0,elapsed=item?.isStarted()?Math.max(0,item.getStateTime()-item.getStartTime()):0,loop=!!item?._motion?.isLoop?.();return {name:evidence.animation,time:duration?(loop?elapsed%duration:Math.min(duration,elapsed)):0,duration,loop};},
  seek:(seconds,delta=0)=>{const item=[...(queue?._motions||[])].reverse().find(item=>!item.isFinished()&&item._motion);if(!item)return;const duration=model.motionDurations?.[evidence.animation]||item._motion.getLoopDuration(),time=Math.max(0,Math.min(duration-.0001,seconds)),clock=live.elapsedTime/1000;item.setStartTime(clock-time);item.setFadeInStartTime(clock-time);item.setEndTime(item._motion.isLoop()?-1:clock-time+duration);item.setIsFinished(false);item.setLastCheckEventSeconds(clock);internal.update(delta*1000,live.elapsedTime);live.deltaTime=0;app.render();},
  polygons:()=>model.interaction.hitAreas.map(h=>{const vertices=internal.getDrawableVertices(h.id);if(!vertices)return null;const pts=[];for(let j=0;j<vertices.length;j+=2){const p=new PIXI.Point(vertices[j],vertices[j+1]);internal.localTransform.apply(p,p);live.worldTransform.apply(p,p);pts.push([p.x,p.y]);}return {id:h.id,vertices:pts};}).filter(Boolean)
 };
 api.capture=()=>{
  const parameters=core.parameters.values.slice(),parts=core.parts.opacities.slice(),nativeSaved=internal.coreModel._savedParameters.slice(),resolution=app.renderer.resolution;
  const restorePhysics=preserveSimulation(internal.physics),restoreEffect=preserveSimulation(effectManager),entries=[...(queue?._motions||[])].map(item=>({item,values:{...item}})),elapsed=live.elapsedTime,delta=live.deltaTime,savedEffectTime=effectTime;let lastTime=0;
  return {draw:(time,size)=>{editor.before();app.renderer.resolution=size.width/stage.clientWidth;app.renderer.resize(stage.clientWidth,stage.clientHeight);if(time!==null){live.elapsedTime=elapsed+time*1000;effectTime=savedEffectTime+time;api.seek(time,Math.max(0,time-lastTime));lastTime=time;}else app.render();return canvas;},
   dispose:()=>{restorePhysics();restoreEffect();for(const {item,values} of entries)Object.assign(item,values);effectTime=savedEffectTime;live.elapsedTime=elapsed;live.deltaTime=delta;core.parameters.values.set(parameters);core.parts.opacities.set(parts);internal.coreModel._savedParameters=nativeSaved;internal.coreModel.update();app.renderer.resolution=resolution;app.renderer.resize(stage.clientWidth,stage.clientHeight);render(0);}};
 };
 render=dt=>{viewerUI.tools.before();const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);if(app.renderer.screen.width!==w||app.renderer.screen.height!==h)app.renderer.resize(w,h);const scale=Math.min(w/natural.width,h/natural.height)*.93*view.zoom;live.scale.set(scale);live.position.set(w/2+view.panX,h/2+view.panY);if(view.playing){effectTime+=dt*view.speed;live.update(dt*1000*view.speed);}app.render();};
 disposeRenderer=dispose;evidence.interaction.hitAreaChecks=model.interaction.hitAreas.map(h=>({id:h.id,exists:internal.getDrawableIndex(h.id)>=0}));return api;
}
async function spinePortrait(model,generation){
 const context=new spine.webgl.ManagedWebGLRenderingContext(canvas,{alpha:true,antialias:true,preserveDrawingBuffer:true}),gl=context.gl,scene=new spine.webgl.SceneRenderer(canvas,context,true),assets=new spine.webgl.AssetManager(context);
 const dispose=()=>{try{assets.dispose();scene.dispose();gl.getExtension('WEBGL_lose_context')?.loseContext();}catch{}};
 for(const spec of model.layers){spec.skelUrl=BASE+'/assets/spinepainting/'+enc(spec.folder+spec.skeleton);spec.atlasUrl=BASE+'/assets/spinepainting/'+enc(spec.atlas);assets.loadBinary(spec.skelUrl);assets.loadTextureAtlas(spec.atlasUrl);}
 try{await new Promise((resolve,reject)=>{const start=performance.now();function check(){if(generation!==loadGeneration)return reject(Error('superseded'));if(assets.hasErrors())return reject(Error(JSON.stringify(assets.getErrors())));if(assets.isLoadingComplete())return resolve();if(performance.now()-start>60000)return reject(Error('骨骼或纹理读取超时'));setTimeout(check,25);}check();});}catch(e){dispose();throw e;}
 let layers;try{layers=model.layers.map(spec=>{const loader=new spine.AtlasAttachmentLoader(assets.get(spec.atlasUrl)),reader=spec.format==='json'?new spine.SkeletonJson(loader):new spine.SkeletonBinary(loader),bytes=assets.get(spec.skelUrl),data=reader.readSkeletonData(spec.format==='json'?JSON.parse(new TextDecoder().decode(bytes)):bytes),skeleton=new spine.Skeleton(data);if(spec.initialSkin&&data.findSkin(spec.initialSkin))skeleton.setSkinByName(spec.initialSkin);skeleton.setToSetupPose();Object.assign(skeleton,{x:spec.x||0,y:spec.y||0,scaleX:spec.scaleX||1,scaleY:spec.scaleY||1});if(spec.rotation)skeleton.bones[0].rotation+=spec.rotation;if(spec.color)Object.assign(skeleton.color,spec.color);const stateData=new spine.AnimationStateData(data);stateData.defaultMix=.15;const state=new spine.AnimationState(stateData);skeleton.updateWorldTransform();return {data,skeleton,state,spec};});}catch(e){dispose();throw e;}
 evidence.layers=layers;evidence.renderer=scene;model.animations=[...new Set(layers.flatMap(l=>l.data.animations.map(a=>a.name)))].sort();
 let mainLayer=0,sequence=0;
 for(let i=0;i<layers.length;i++)layers[i].state.addListener({event:(entry,event)=>{if(i===mainLayer&&entry.animation.name===controller?.state.motion)controller.event(event.data.name);},complete:entry=>{if(i===mainLayer&&entry.animation.name===controller?.state.motion&&controller.state.busy)controller.finish();}});
 const api={sound,stopAudio,fold,assistantEvent:area=>{if(basicActions[area])sound(model.voiceBank,motionCue(basicActions[area]),{voice:true});},skin:name=>{for(const l of layers){const skin=l.data.findSkin(name||l.spec.initialSkin||'default');if(skin){l.skeleton.setSkin(skin);l.skeleton.setSlotsToSetupPose();}}},effects:visible=>{evidence.effectsVisible=visible;},alpha:data=>{evidence.alphaData=data;},
  expression:cue=>{if(!cue){for(const l of layers)l.state.setEmptyAnimation(1,.15);return;}if(controller?.state.busy)return;const field=({touch_1:'touch',touch_2:'touch2',touch_head:'headtouch',task:'mission',get:'unlock'})[cue]||cue;let name=model.expression?.base?.[field]||model.expression?.base?.default;const extra=model.expression?.extra?.[field];for(const row of array(extra))if(row[0]<=controller.state.favor)name=row[1];if(name===undefined||name===null||name==='')return;const multiple=model.interaction.spine?.multiple_face;if(array(multiple?.name).length&&Number.isFinite(Number(name))){const offset=array(multiple.data).find(r=>r[0]===controller.state.idle)?.[1]||0;name=String(Number(name)+offset);}name=String(name);for(const l of layers)if(l.data.findAnimation(name))l.state.setAnimation(1,name,true);evidence.expression={cue,name};},
  play:async(name,loop,options={})=>{sequence++;let max=-1;for(let i=0;i<layers.length;i++){const a=layers[i].data.findAnimation(name);if(a&&a.duration>max){max=a.duration;mainLayer=i;}}for(const l of layers){const a=l.data.findAnimation(name);if(a&&!l.spec.freeze){for(const track of array(options.clear))l.state.setEmptyAnimation(track,0);l.state.setAnimation(0,name,loop);}else if(!l.state.getCurrent(0)){const def=l.data.findAnimation(l.spec.defaultAnimation||model.defaultAnimation)||l.data.animations[0];if(def)l.state.setAnimation(0,def.name,true);}l.state.apply(l.skeleton);l.skeleton.updateWorldTransform();}evidence.animation=name;$('animation').value=name;},
  duration:name=>Math.max(0,...layers.map(layer=>layer.data.findAnimation(name)?.duration||0)),
  timeline:()=>{const item=layers[mainLayer]?.state.getCurrent(0),duration=item?.animation?.duration||0,elapsed=Math.max(0,item?.trackTime||0);return {name:item?.animation?.name,time:duration?(item.loop?elapsed%duration:Math.min(duration,elapsed)):0,duration,loop:!!item?.loop};},
  seek:seconds=>{for(const layer of layers){const item=layer.state.getCurrent(0);if(!item)continue;const time=Math.max(0,Math.min(item.animation.duration-.0001,seconds));item.trackTime=item.trackLast=item.nextTrackLast=time;item.animationLast=item.nextAnimationLast=time;layer.state.apply(layer.skeleton);layer.skeleton.updateWorldTransform();}},
  world:(x,y)=>{const w=stage.clientWidth,h=stage.clientHeight,units=Math.max(bounds.width/w,bounds.height/h)*1.1/view.zoom;return {x:bounds.x+(x-w/2-view.panX)*units,y:bounds.y-(y-h/2-view.panY)*units};},
  hits:(x,y)=>{const p=api.world(x,y);return array(model.interaction.hitAreas).filter(h=>polygonContains(p.x,p.y,h.vertices)).map(h=>h.id);},
  polygons:()=>{const w=stage.clientWidth,h=stage.clientHeight,units=Math.max(bounds.width/w,bounds.height/h)*1.1/view.zoom;return array(model.interaction.hitAreas).map(area=>({id:area.id,vertices:area.vertices.map(p=>[(p[0]-bounds.x)/units+w/2+view.panX,(bounds.y-p[1])/units+h/2+view.panY])}));}
 };
 for(const l of layers){const a=l.data.findAnimation(l.spec.defaultAnimation||model.defaultAnimation)||l.data.animations[0];if(a)l.state.setAnimation(0,a.name,true);l.state.apply(l.skeleton);l.skeleton.updateWorldTransform();}
 const rectangles=[];
 for(const l of layers)for(const slot of l.skeleton.drawOrder){const a=slot.attachment;let vertices;if(a instanceof spine.RegionAttachment){vertices=new Float32Array(8);a.computeWorldVertices(slot.bone,vertices,0,2);}else if(a instanceof spine.MeshAttachment){vertices=new Float32Array(a.worldVerticesLength);a.computeWorldVertices(slot,0,a.worldVerticesLength,vertices,0,2);}if(!vertices?.length)continue;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(let i=0;i<vertices.length;i+=2){minX=Math.min(minX,vertices[i]);maxX=Math.max(maxX,vertices[i]);minY=Math.min(minY,vertices[i+1]);maxY=Math.max(maxY,vertices[i+1]);}rectangles.push({name:slot.data.name,bounds:[minX,minY,maxX,maxY]});}
 const framing=fitSceneBounds(rectangles),bounds=framing.bounds;evidence.bounds=bounds;evidence.offscreenLayers=framing.excluded;const maxBuffer=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
 const project=(x,y)=>{const p=api.world(0,0),q=api.world(stage.clientWidth,stage.clientHeight);return {x:(x-p.x)/(q.x-p.x)*stage.clientWidth,y:(y-p.y)/(q.y-p.y)*stage.clientHeight};};
 editor=window.createInteractionSpineEditor({layers,ns:spine,project,unproject:api.world});
 api.capture=animation=>window.createInteractionSpineCapture({layers,ns:spine,canvas,renderer:scene,gl,editor,animation,restore:()=>render(0)});
 render=dt=>{viewerUI.tools.before();const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight),density=Math.min(Math.max(2,devicePixelRatio||1),maxBuffer/Math.max(w,h)),bw=Math.round(w*density),bh=Math.round(h*density);if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}gl.viewport(0,0,bw,bh);scene.camera.setViewport(bw,bh);const units=Math.max(bounds.width/w,bounds.height/h)*1.1/view.zoom;scene.camera.zoom=units/density;scene.camera.position.x=bounds.x-view.panX*units;scene.camera.position.y=bounds.y+view.panY*units;scene.camera.update();gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);for(const l of layers){if(view.playing){l.state.update(dt*view.speed);l.state.apply(l.skeleton);l.skeleton.updateWorldTransform();}}viewerUI.tools.after();scene.begin();for(const l of layers)scene.drawSkeleton(l.skeleton,true);scene.end();};
 disposeRenderer=dispose;return api;
}
async function getJson(url,required=true){const r=await fetch(url);if(!r.ok){if(!required&&r.status===404)return null;throw Error(r.status+' '+url);}return r.json();}
async function loadModel(id,{history=true}={}){
 stagePan.cancel();
 const requestedId=id;id=canonicalModelId(id);if(id!==requestedId){const url=new URL(location.href);url.searchParams.set('id',id);window.history.replaceState(null,'',url);}
 viewerUI.tools.prepareLoad();
 const generation=++loadGeneration;previewPending=true;nextPreviewCheck=0;loadingPreview.begin(generation,{path:K.siteRoot()+'thumbs/azurlane/'+encodeURIComponent(id)+'.webp',label:allModels.find(m=>m.id===id)?.name||id,trimImage:true});view.ready=evidence.ready=false;render=null;pointer=null;editor=null;controller?.dispose();controller=null;disposeRenderer?.();disposeRenderer=null;stopAudio();fold(false);delete evidence.model;delete evidence.app;delete evidence.layers;delete evidence.renderer;delete evidence.bounds;evidence.errors=[];evidence.interaction={};evidence.audio.missing=[];
 const next=canvas.cloneNode(false);canvas.replaceWith(next);canvas=next;Object.assign(view,{zoom:1,panX:0,panY:0,playing:true,frames:0});look.x=look.y=look.targetX=look.targetY=0;portraitTime=0;zoomTo(1);$('status').textContent=id+' · 正在读取模型和交互…';
 const data=await Promise.all([getJson(BASE+'/catalog/'+encodeURIComponent(id)+'.json'),getJson(BASE+'/model-audio/'+encodeURIComponent(id)+'.json',false),allModels.find(m=>m.id===id)?.type==='live2d'?getJson(BASE+'/animators/'+encodeURIComponent(id)+'.json',false):null]).catch(e=>{if(generation!==loadGeneration)return null;throw e;});
 if(!data)return false;const [model,audio,animator]=data;
 if(generation!==loadGeneration)return false;selected=model;if(audio)Object.assign(model,audio);if(animator)model.animator=animator;evidence.selected=model;$('active-name').textContent=stageName(model);populate();
 let loaded;try{loaded=await (model.type==='live2d'?live2dPortrait(model,generation):spinePortrait(model,generation));}catch(e){if(generation!==loadGeneration)return false;throw e;}if(generation!==loadGeneration||!loaded)return false;adapter=loaded;
 controller=model.type==='live2d'?new Live2DController(model,adapter,{storage:localStorage,favor:Number($('favor').value)}):new SpineController(model,adapter,{storage:localStorage,favor:Number($('favor').value)});evidence.controller=controller;evidence.adapter=adapter;controls();controller.playIdle();
 view.ready=evidence.ready=true;zoomTo(view.zoom);document.title=stageName(model)+' · ArtHub';$('status').textContent=stageName(model)+' · '+model.animations.length+' 个动作';K.setLibraryStageReady(true);populate();
 if(history){const url=new URL(location.href);url.searchParams.set('id',id);window.history.replaceState(null,'',url);K.history.push(entry(model));}return true;
}
function record(){
 let pose=2166136261;const add=v=>{pose=Math.imul(pose^Math.round(v*10000),16777619)>>>0;};const core=evidence.model?.internalModel.coreModel.getModel();if(core)for(const v of core.drawables.vertexPositions)for(let i=0;i<v.length;i+=6)add(v[i]);else for(const l of evidence.layers||[])for(const b of l.skeleton.bones){add(b.worldX);add(b.worldY);add(b.a);add(b.d);}
 Object.assign(evidence.interaction,{count:controller.state.interactions,idleIndex:controller.state.idleIndex,lastMotion:controller.state.motion});
 evidence.memory={createdMocs,releasedMocs:releasedMocCount,liveMocs:createdMocs-releasedMocCount};
 const state={id:selected.id,type:selected.type,ready:evidence.ready,frames:view.frames,pose,zoom:view.zoom,animation:evidence.animation,canvas:[canvas.width,canvas.height],state:{...controller.state},voiceCount:selected.voice.activeClips.length,interaction:evidence.interaction,audio:evidence.audio,trace:controller.trace.slice(-12),errors:evidence.errors};evidenceNode.textContent=JSON.stringify(state);
 $('game-state').textContent='当前姿态：'+(selected.type==='live2d'?controller.state.idleIndex:controller.state.idle)+' · '+(controller.state.busy?'动作中':'可交互');
 if(showHits){const polygons=adapter.polygons?.()||[];$('hit-overlay').setAttribute('viewBox',`0 0 ${stage.clientWidth} ${stage.clientHeight}`);$('hit-overlay').replaceChildren(...polygons.map(h=>{const polygon=document.createElementNS('http://www.w3.org/2000/svg','polygon');polygon.setAttribute('points',h.vertices.map(p=>p.join(',')).join(' '));polygon.setAttribute('fill','#ffce6e22');polygon.setAttribute('stroke','#ffce6e');polygon.setAttribute('stroke-width','1');return polygon;}));}else $('hit-overlay').replaceChildren();
}
window.__loadAzurLane=loadModel;window.addEventListener('popstate',()=>{const id=new URL(location.href).searchParams.get('id'),match=allModels.find(m=>m.id===canonicalModelId(id));if(match){setPanelOpen('library',false);loadModel(id,{history:false}).catch(fail);}else setPanelOpen('library',true);});window.addEventListener('pagehide',()=>{loadGeneration++;controller?.dispose();disposeRenderer?.();ctx?.close().catch(()=>{});});
let previous=performance.now(),nextEvidence=0;
function frame(now){const dt=Math.min(.1,(now-previous)/1000);previous=now;try{if(!exporting&&view.ready&&controller){updateAudio(dt);if(view.playing){portraitTime+=dt*view.speed;const d=1-Math.exp(-dt/(selected.interaction.settings?.DampingTime||.3));look.x+=(look.targetX-look.x)*d;look.y+=(look.targetY-look.y)*d;controller.tick(dt*view.speed);}render?.(dt);view.frames++;
 if(previewPending&&view.frames>2&&!controller.state.motionPending&&now>=nextPreviewCheck){nextPreviewCheck=now+100;const gl=evidence.app?.renderer?.gl||canvas.getContext('webgl2')||canvas.getContext('webgl');if(gl&&!gl.isContextLost()&&canvas.width>1&&canvas.height>1){previewContext.clearRect(0,0,64,64);previewContext.drawImage(canvas,0,0,64,64);const pixels=previewContext.getImageData(0,0,64,64).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>8){loadingPreview.ready(loadGeneration);previewPending=false;break;}}}
 viewerUI.update();if(now>=nextEvidence){record();nextEvidence=now+250;}}}catch(e){view.ready=evidence.ready=false;fail(e);}requestAnimationFrame(frame);}
requestAnimationFrame(frame);
try{const [listing,thumbData,retired]=await Promise.all([getJson(BASE+'/characters.json'),getJson(THUMB_PREFIX+'index.json',false).catch(()=>null),getJson('./retired-models.json')]);retiredModels=retired;allModels=listing.characters.filter(m=>!retiredModels[m.id]);libraryThumbs=thumbData?.items||{};evidence.catalog=allModels;$('counts').textContent=`${allModels.length} 项 · ${allModels.filter(m=>m.type==='live2d').length} Live2D / ${allModels.filter(m=>m.type==='spine').length} Spine`;K.setLibraryStageReady(false);populate();const id=new URL(location.href).searchParams.get('id'),initial=allModels.find(m=>m.id===canonicalModelId(id));if(initial)await loadModel(id);else setPanelOpen('library',true);}catch(e){fail(e);}
