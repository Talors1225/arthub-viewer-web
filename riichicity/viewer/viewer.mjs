import {importBundle,discoverModels} from './bundle.mjs?v=20261104-unified-final';
import {loadSpine,loadLive2D} from './runtimes.mjs?v=20261104-unified-final';
const K=window.SpineKit,$=id=>document.getElementById(id),stage=$('stage');
let canvas=$('canvas'),engine=null,activeBundle=null,bundle=null,models=[],selected=null,identity='',epoch=0,pending=null,exporting=false,renderFailed=false,gridPlaying=true;
const catalogMode=true;
let catalog=null,requestedModel=null,loadingModel=null,autoOpenInitial=false;
const loadingPreview=K.createLoadingPreview(stage);
const view={zoom:1,x:0,y:0,playing:true,speed:1},store=K.Store('riichicity-ui');
K.initTheme(store);K.bindThemePalette($('btnTheme'),store);K.setUiIcon($('homeAction'),'home');
K.setUiIcon($('localSponsor'),'heart','爱发电');
const status=(text,error=false)=>{$('importStatus').textContent=text;$('importStatus').classList.toggle('error',error);};
function busy(value){
  $('importBusy').hidden=!value||!!loadingModel;
  for(const id of ['zIn','zOut','zPct','btnAnimTab'])$(id).disabled=!!value||!engine||renderFailed;
}
function issues(messages){$('issuesList').replaceChildren(...messages.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));$('issuesBox').hidden=!messages.length;}
function showLibrary(open){
  if(open&&!catalog)autoOpenInitial=false;
  if(open&&!pending&&requestedModel!==selected){requestedModel=selected;loadingPreview.cancel();renderFailed=false;busy(false);}
  catalog?.voicePanel.setVisible(!open);
  if(open&&!$('gridView').classList.contains('open')){gridPlaying=view.playing;view.playing=false;K.closeToolPopup();openPanel(false);}
  if(!open&&!engine&&!requestedModel)return;
  $('gridView').classList.toggle('open',open);$('railGrid').setAttribute('aria-expanded',String(open));
  for(const id of ['stage','rail','toolStrip','playbar','floatPanel'])$(id).inert=open;
  if(!open)view.playing=gridPlaying;
}
function openPanel(value){$('floatPanel').classList.toggle('open',value);K.refreshStageUI?.();}
function zoom(next){view.zoom=Math.max(.1,Math.min(8,next));$('zPct').textContent=Math.round(view.zoom*100)+'%';}
$('zIn').onclick=()=>zoom(view.zoom*1.25);$('zOut').onclick=()=>zoom(view.zoom/1.25);$('zPct').onclick=$('fit').onclick=()=>{view.x=view.y=0;zoom(1);};
$('railThumb').onclick=()=>$('fit').click();$('railGrid').onclick=()=>{if(pending)cancelLoad();else showLibrary(true);};$('gridClose').onclick=()=>showLibrary(false);$('homeAction').onclick=()=>{location.href='../../index.html';};
$('btnAnimTab').onclick=()=>openPanel(!$('floatPanel').classList.contains('open'));$('panel-close').onclick=()=>openPanel(false);
const ui=window.createInteractionViewerUI({
  animations:()=>engine?.animations||[],playback:()=>({ready:!!engine&&!pending&&!renderFailed,key:identity,name:'',duration:0,time:0,loop:true,...engine?.playback(),playing:view.playing,speed:view.speed,canSeek:true}),
  setPlaying:playing=>{view.playing=playing;},setSpeed:speed=>{view.speed=speed;},setLoop:loop=>engine?.loop(loop),
  selectAnimation:async name=>{catalog?.voicePanel.suspend();await engine.play(name,$('pbLoop').getAttribute('aria-pressed')!=='false');view.playing=true;},seek:time=>engine?.seek(time),canvas:()=>canvas,
  onError:error=>{K.toast(error.message||String(error),'err');},
  tools:{identity:()=>identity,editor:()=>!pending&&!renderFailed?engine?.editor||null:null,name:()=>selected?.name||'riichicity',reload:()=>selected&&loadModel(selected,activeBundle),openPanel,
    voiceTab:catalogMode?'voice':undefined,
    setExporting:value=>{exporting=value;if(value)catalog?.voicePanel.suspend();},capture:state=>engine.capture(state),setBackground:()=>{},soundEnabled:()=>catalog?.voicePanel.enabled??false,setSoundEnabled:value=>{if(catalog)catalog.voicePanel.enabled=value;},volume:()=>catalog?.voicePanel.volume??0,setVolume:value=>{if(catalog)catalog.voicePanel.volume=value;},
    drawableOrder:part=>part.index||0,
  },
});
// Game voice mappings and cloud catalog search do not describe local MOD files.
if(!catalogMode)$('btnVoiceSettings').remove();$('btnGlobalSearch').remove();
K.initStageUI({canvas,refit:()=>{}});
$('btnStagePan').hidden=true;
stage.addEventListener('wheel',event=>{if(event.target!==canvas||exporting)return;event.preventDefault();zoom(view.zoom*Math.exp(-event.deltaY*.0015));},{passive:false});
const touches=new Map();let pinch=null;
stage.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'&&event.target===canvas){touches.set(event.pointerId,[event.clientX,event.clientY]);if(touches.size===2){pan.cancel();event.preventDefault();event.stopImmediatePropagation();const p=[...touches.values()];pinch={distance:Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]),zoom:view.zoom};}}},true);
stage.addEventListener('pointermove',event=>{if(!touches.has(event.pointerId))return;touches.set(event.pointerId,[event.clientX,event.clientY]);if(pinch&&touches.size===2){event.preventDefault();event.stopImmediatePropagation();const p=[...touches.values()];zoom(pinch.zoom*Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1])/Math.max(1,pinch.distance));}},true);
for(const type of ['pointerup','pointercancel'])stage.addEventListener(type,event=>{touches.delete(event.pointerId);if(touches.size<2)pinch=null;},true);
const pan=K.createStagePan({stage,button:$('btnStagePan'),accepts:target=>target===canvas,ready:()=>!!engine&&!pending&&!exporting,move:(x,y)=>{view.x+=x;view.y+=y;},tap:event=>catalog?.voicePanel.tap(event)});
function renderModels(){
  if(catalog){catalog.render(selected);return;}
  const q=$('modSearch').value.toLocaleLowerCase(),fragment=document.createDocumentFragment();
  for(const model of models.filter(m=>(m.path+' '+m.name).toLocaleLowerCase().includes(q))){
    const button=document.createElement('button');button.className='mod-model'+(selected===model?' active':'');button.type='button';
    const name=document.createElement('strong'),type=document.createElement('span'),path=document.createElement('small');name.textContent=model.name;type.textContent=model.type==='spine'?'Spine '+model.version:'Live2D · Cubism 4';path.textContent=model.path;button.append(name,type,path);button.onclick=()=>loadModel(model);fragment.append(button);
  }
  $('modelList').replaceChildren(fragment);$('modelSection').hidden=!models.length;
}
($('modSearch')||$('gridSearch')).oninput=renderModels;
async function loadModel(model,targetBundle=bundle){
  if(exporting){K.toast('请先结束导出');return;}
  catalog?.voicePanel.beforeLoad();
  pending?.abort();const sequence=++epoch,controller=pending=new AbortController();let candidate,acquiredBundle=null;
  requestedModel=loadingModel=model;pan.cancel();K.closeToolPopup();openPanel(false);
  loadingPreview.begin(sequence,{path:catalog?.previewPath(model)||model.thumbnail,label:model.name,trimImage:true});
  $('status').textContent=model.name+' · 动态加载中';showLibrary(false);
  busy(true);status('正在加载 '+model.name+'…');
  try{
    if(model.remote&&!targetBundle){acquiredBundle=await catalog.fetchBundle(model,controller.signal);targetBundle=acquiredBundle;}
    const runtimeModel=model.remote?{...model,json:await targetBundle.json(model.path)}:model;
    const nextCanvas=canvas.cloneNode(false);candidate=await (model.type==='spine'?loadSpine:loadLive2D)(targetBundle,runtimeModel,nextCanvas,controller.signal,text=>{if(sequence===epoch)status(text);});
    if(sequence!==epoch){candidate.dispose();return;}
    const bytes=await targetBundle.files.get(model.path).arrayBuffer(),key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,24);
    if(sequence!==epoch){candidate.dispose();return;}
    ui.tools.prepareLoad();pan.cancel();openPanel(false);const previous=engine,oldBundle=activeBundle;
    canvas.replaceWith(nextCanvas);canvas=nextCanvas;engine=candidate;candidate=null;activeBundle=targetBundle;selected=model;renderFailed=false;
    identity=key;
    previous?.dispose();if(oldBundle&&oldBundle!==activeBundle&&oldBundle!==bundle)oldBundle.dispose();
    Object.assign(view,{zoom:1,x:0,y:0,playing:true,speed:1});gridPlaying=true;engine.setTools(ui.tools);ui.tools.sync();
    $('skinSelect').replaceChildren(...engine.skins.map(name=>new Option(name,name)));$('skinRow').hidden=engine.skins.length<2;
    if(model.initialSkin&&engine.skins.includes(model.initialSkin))$('skinSelect').value=model.initialSkin;
    $('skinSelect').onchange=()=>{engine.skin($('skinSelect').value);};
    $('gridClose').hidden=false;for(const id of ['zIn','zOut','zPct'])$(id).disabled=false;for(const id of ['btnPrev','btnNext'])$(id).disabled=models.length<2;zoom(1);
    $('status').textContent=model.name+' · '+(catalog?'':(model.type==='spine'?'Spine '+model.version:'Live2D')+' · ')+engine.animations.length+' 个动作'+(model.needsReview?' · 部分动作待适配':'');
    if(catalog){catalog.loaded(model,engine);K.setLibraryStageReady?.(true);}
    renderModels();showLibrary(false);engine.render(0,view);
    const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
    if(!canvas.width||!canvas.height||gl?.isContextLost())throw Error('画面暂时无法显示，请重试');
    loadingPreview.ready(sequence);document.title=model.name+' · ArtHub';ui.refreshAnimations();issues([...(model.warnings||[]),...(engine.warnings||[])]);status('已加载 '+model.name+'，可从资源库切换角色和皮肤。');
  }catch(error){candidate?.dispose();if(sequence===epoch){
    if(error.name==='AbortError'){loadingPreview.cancel();showLibrary(true);status('已取消加载');}
    else{renderFailed=true;loadingPreview.fail(sequence,error.message);$('status').textContent=model.name+' · 加载失败';status(model.name+' 加载失败：'+error.message,true);}
  }}
  finally{if(acquiredBundle&&acquiredBundle!==activeBundle)acquiredBundle.dispose();if(sequence===epoch){pending=null;loadingModel=null;busy(false);}}
}
async function importFiles(files){
  if(!files.length)return;if(exporting){K.toast('请先结束导出');return;}
  pending?.abort();const sequence=++epoch;busy(true);status('正在识别本地文件…');let candidate;
  try{
    if(files.length>1&&[...files].some(f=>/\.zip$/i.test(f.name)))throw Error('请选择一个完整 ZIP，或一组已解包文件');
    candidate=await importBundle(files);const result=await discoverModels(candidate);
    if(sequence!==epoch){candidate.dispose();return;}
    if(!result.models.length)throw Error(result.issues.join('\n')||'没有找到可用模型。请包含 .skel / Spine JSON、.atlas 和贴图，或完整的 .model3.json 资源。');
    if(bundle&&bundle!==activeBundle)bundle.dispose();bundle=candidate;candidate=null;models=result.models;issues(result.issues);renderModels();status('识别到 '+models.length+' 套立绘，'+bundle.files.size+' 个文件。');
    if(models.length===1)await loadModel(models[0]);
  }catch(error){candidate?.dispose();if(sequence===epoch)status(error.message,true);}
  finally{if(sequence===epoch)busy(false);}
}
$('chooseFolder').onclick=()=>$('folderInput').click();$('chooseFiles').onclick=()=>$('filesInput').click();
for(const id of ['folderInput','filesInput'])$(id).onchange=event=>{const files=[...event.target.files];event.target.value='';importFiles(files);};
function cancelLoad(){pending?.abort();pending=null;++epoch;loadingModel=requestedModel=null;loadingPreview.cancel();catalog?.cancelNavigation();busy(false);K.setLibraryStageReady?.(!!engine);showLibrary(true);status('已取消加载');if(selected&&engine)catalog?.voicePanel.setModel(selected,engine);}
$('cancelLoad').onclick=cancelLoad;$('btnRetry').onclick=()=>{if(requestedModel)loadModel(requestedModel);};
$('btnPrev').onclick=()=>{if(catalog){catalog.step(-1);return;}const i=models.indexOf(selected);if(models.length)loadModel(models[(i-1+models.length)%models.length]);};$('btnNext').onclick=()=>{if(catalog){catalog.step(1);return;}const i=models.indexOf(selected);if(models.length)loadModel(models[(i+1)%models.length]);};
for(const id of ['btnPrev','btnNext'])$(id).disabled=true;
$('clearFiles').onclick=()=>{pending?.abort();pending=null;++epoch;ui.tools.prepareLoad();openPanel(false);engine?.dispose();engine=null;if(activeBundle&&activeBundle!==bundle)activeBundle.dispose();bundle?.dispose();bundle=activeBundle=null;models=[];selected=null;identity='';busy(false);issues([]);renderModels();for(const id of ['zIn','zOut','zPct','btnPrev','btnNext'])$(id).disabled=true;$('gridClose').hidden=true;$('status').textContent='请先导入本地立绘';showLibrary(true);status('本地资源已关闭。');};
const drop=$('dropZone');drop.ondragover=event=>{event.preventDefault();drop.classList.add('drag-over');};drop.ondragleave=()=>drop.classList.remove('drag-over');
async function droppedEntries(items,fallback){
  const entries=[...items].map(item=>item.webkitGetAsEntry?.()).filter(Boolean);if(!entries.length)return [...fallback];const files=[];
  async function read(entry){if(files.length>=4096)throw Error('文件过多，请仅选择当前立绘');if(entry.isFile){const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));Object.defineProperty(file,'relativePath',{value:entry.fullPath.replace(/^\//,'')});files.push(file);}else if(entry.isDirectory){const reader=entry.createReader();while(true){const children=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!children.length)break;for(const child of children)await read(child);}}}
  for(const entry of entries)await read(entry);return files;
}
drop.ondrop=async event=>{event.preventDefault();drop.classList.remove('drag-over');try{await importFiles(await droppedEntries(event.dataTransfer.items,event.dataTransfer.files));}catch(error){status(error.message,true);}};
K.bindKeys({' ':()=>{if(engine&&!pending)view.playing=!view.playing;},'f':()=>$('fit').click(),'F':()=>$('fit').click(),'g':()=>{if(pending)cancelLoad();else showLibrary(!$('gridView').classList.contains('open'));},'G':()=>$('railGrid').click(),'Escape':()=>{K.closeToolPopup();openPanel(false);},'ArrowLeft':()=>$('btnPrev').click(),'ArrowRight':()=>$('btnNext').click(),'+':()=>zoom(view.zoom*1.25),'-':()=>zoom(view.zoom/1.25)});
showLibrary(true);
let last=performance.now();function frame(now){requestAnimationFrame(frame);const dt=Math.min(.1,(now-last)/1000);last=now;if(engine&&!exporting&&!document.hidden&&!renderFailed&&!$('gridView').classList.contains('open'))try{engine.render(dt,view);catalog?.voicePanel.tick();}catch(error){renderFailed=true;status('绘制失败：'+error.message,true);showLibrary(true);}ui.update();ui.tools.update();}requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{pending?.abort();engine?.dispose();if(activeBundle&&activeBundle!==bundle)activeBundle.dispose();bundle?.dispose();});
async function initializeCatalog(){
  busy(true);status('正在读取麻雀一番街角色目录…');
  $('catalogRetry').hidden=true;
  try{const module=await import('./catalog.mjs?v=20261104-unified-final');
    catalog=await module.createCatalog({selectModel:loadModel,status});models=catalog.models;renderModels();busy(false);
    if(catalog.initial&&autoOpenInitial)await loadModel(catalog.initial);
    else if(requestedModel){loadingPreview.cancel();requestedModel=null;showLibrary(true);status('没有找到这个立绘，请从资源库重新选择。',true);}
  }catch(error){busy(false);loadingPreview.cancel();requestedModel=null;showLibrary(true);status(error.message,true);$('catalogRetry').hidden=false;}
}
$('catalogRetry').onclick=initializeCatalog;
const initialId=new URL(location.href).searchParams.get('id');
if(/^[a-z0-9_-]+$/i.test(initialId||'')){autoOpenInitial=true;requestedModel={id:initialId};loadingPreview.begin(0,{path:K.siteRoot()+'riichicity/thumbs/'+encodeURIComponent(initialId)+'.webp',label:'当前立绘',trimImage:true});showLibrary(false);}
initializeCatalog();
