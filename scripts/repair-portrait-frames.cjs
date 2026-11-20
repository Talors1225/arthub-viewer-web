'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const probes = require('./portrait-frame-probe.cjs');

const site = path.resolve(__dirname, '..');
const registered = path.join(site, 'azurlane-interaction/viewer/auto-scene-apertures.mjs');
const pages = {
 azur:'/azurlane-interaction/viewer/index.html',
 nikki:'/nikki/viewer/cutscene.html', bd2:'/bd2/viewer/cutscene.html',
 cc:'/crosscore/viewer/cutscene.html', cci:'/crosscore-interaction/viewer/index.html',
 fated:'/bd2/fated/index.html', majsoul:'/majsoul/viewer/index.html', riichi:'/riichicity/viewer/index.html',
};

async function openLocalSite() {
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json',
  '.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm'};
 const server=http.createServer((request,response)=>{
  try {
   const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
   const parts=pathname.split('/').filter(Boolean);
   if (!['GET','HEAD'].includes(request.method) || parts.some(part=>part.startsWith('.') || /[\\:\0]/.test(part))) {
    return response.writeHead(404).end();
   }
   let file=path.join(site,...parts);
   if(fs.statSync(file,{throwIfNoEntry:false})?.isDirectory())file=path.join(file,'index.html');
   if(!fs.statSync(file,{throwIfNoEntry:false})?.isFile())return response.writeHead(404).end();
   const real=fs.realpathSync(file);
   const relative=path.relative(site,real);
   if(!relative||path.isAbsolute(relative)||relative.split(path.sep).includes('..'))return response.writeHead(404).end();
   response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
   if(request.method==='HEAD')return response.end();
   fs.createReadStream(real).on('error',()=>response.destroy()).pipe(response);
  } catch { response.destroy(); }
 });
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 return {server, origin:'http://127.0.0.1:'+server.address().port};
}

async function localTarget(explicit) {
 const origin=explicit || 'http://127.0.0.1:55431';
 const url=new URL(origin);
 if(!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/')
  throw Error('Use the local ArtHub site address.');
 try {
  const index=await fetch(url.origin+'/azurlane-interaction/characters.json',{signal:AbortSignal.timeout(3000)});
  if(index.ok && Array.isArray((await index.json()).characters)){
   const module=await fetch(url.origin+'/azurlane-interaction/viewer/auto-scene-apertures.mjs',{signal:AbortSignal.timeout(3000)});
   if(module.ok && (await module.text()).includes('export const automaticSceneApertures'))return {origin:url.origin};
  }
 }catch { /* Start the local checkout if a review server is not running. */ }
 if(explicit)throw Error('Could not open the ArtHub catalog at '+origin);
 return openLocalSite();
}

function playwright() {
 try { return require('playwright'); }
 catch (error) {
  if (error.code!=='MODULE_NOT_FOUND') throw error;
  const bundled = path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  if (fs.existsSync(bundled)) return require(bundled);
  throw Error('Playwright is required. Install it with npm install --no-save playwright, then run npx playwright install chromium.');
 }
}

async function discover(page, origin, games) {
 await page.goto(origin + pages.azur, { waitUntil:'domcontentloaded', timeout:35000 });
 await page.waitForFunction(()=>window.SpineKit?.fetchJSON, null, {timeout:15000});
 return page.evaluate(async ({pages,games})=>{
  const catalogPaths = {
   azur:'/azurlane-interaction/characters.json',nikki:'/nikki/nikki_chars.json',bd2:'/bd2/bd2_chars.json',
   cc:'/crosscore/crosscore_chars.json',cci:'/crosscore-interaction/catalog/catalog.json',fated:'/bd2/fated/catalog.json',
   majsoul:'/majsoul/characters.json',riichi:'/riichicity/characters.json',
  };
  return Promise.all(games.map(async game=>{
   try {
    const data = await SpineKit.fetchJSON(catalogPaths[game]);
    let models = data.characters ?? data.models;
    if (!Array.isArray(models)) throw Error('Unrecognized catalog');
    if (game==='azur') {
     const retired=await SpineKit.fetchJSON('/azurlane-interaction/viewer/retired-models.json');
     models=models.filter(model=>!retired[model.id]);
    }
    if (['nikki','bd2','cc'].includes(game)) models=models.filter(model=>model.cutscenes?.length && (game!=='nikki' ||
      !SpineKit.shouldOmitNikkeViewerEntry(model) || model.cutscenes[0].nativeBurst));
    if (game==='cci') models=models.filter(model=>model.available);
    if (game==='riichi') models=models.flatMap(ch=>ch.variants).filter(model=>
     !['spine_1000905__haixia-tunvlang2','spine_1003606__lengquanhuiyaziSP-shanyao2'].includes(model.id));
    const discovered = models.map(model=>{
     const id=String(model.id), encoded=encodeURIComponent(id);
     const query=game==='cci'?'?model=':game==='majsoul'?'#sel=':'?id=';
     const phases=game==='cci'?[...new Set([model.prefab,...Object.values(model.variants||{})])]:null;
     return {game,id,path:pages[game]+query+encoded,phases};
    });
    const rows = [...new Map(discovered.map(row => [row.path, row])).values()];
    if (!rows.length) throw Error('Empty catalog');
    return {game,rows};
   } catch (error) { return {game,error:error.message,rows:[]}; }
  }));
 },{pages,games});
}

// Narrow read-only hooks into the existing viewer. These live in the audit
// browser only. The public player does not perform pixel readbacks for this tool.
function replaceEntry(body, target, replacement) {
 if (!body.includes(target)) throw Error('Viewer entry changed: ' + target);
 return body.replace(target,replacement+target);
}

function standaloneProbe(game) {
 if (game==='majsoul') return `
  window.__frameAudit = {
   ready: () => !!curEntry && !!layers.length,
   assetId: () => curEntry?.id,
   count: () => 1,
   actions: () => Array.from(new Set(layers.filter(layer=>layer.visible).flatMap(layer=>layer.data.animations.map(clip=>clip.name)))),
   select: name => { curAnimName=name;playAll(name,false);pausedAll=true; },
   seek: fraction => {
    for(const layer of layers) {
     const track=layer.state.getCurrent(0); if(track)track.trackTime=track.animation.duration*fraction;
    }
    return window.__frameDraw(()=>frame(performance.now()));
   },
  };
 `;
 const choose = game==='bd2' ? 'await changeAnimation(name,{resume:false});' : 'selectAnimation(name);';
 return `
  window.__frameAudit = {
   ready: () => !!cut && !!window.__frameAuditReady,
   assetId: () => cur?.id,
   load(id) {
    const asset=chars.find(entry=>String(entry.id)===id);
    if(!asset)throw Error('Resource is missing: '+id);
    selectChar(asset,false);
   },
   count: () => cur.cutscenes.length,
   variant: index => loadCutscene(index),
   ${game==='cc' ? 'framing: () => ({ motion:getTrack()?.animation.name, bounds:cut.bounds }),' : ''}
   actions: () => (${game==='nikki'?'sceneAnimations()':'cut.data.animations'}).map(clip=>clip.name),
   select: async name => { animSel.value=name;${choose} playing=false; },
   seek: fraction => {seekTo(fraction);return window.__frameDraw(()=>loop(performance.now()));},
  };
 `;
}

async function prepare(context, origin) {
 const serialized = Object.values(probes).map(fn=>fn.toString()).join('\n');
 await context.addInitScript({content:`(() => {
  ${serialized}
  window.ArthubFrameProbe={${Object.keys(probes).join(',')}};
  })();
  window.__frameDraw=render=>{
   window.__frameAuditStepping=true;
   try{render();return true;}finally{window.__frameAuditStepping=false;}
  };
  Object.defineProperty(window,'createInteractionViewerUI',{configurable:true,set(factory) {
   Object.defineProperty(window,'createInteractionViewerUI',{configurable:true,writable:true,value: driver=>{
    window.__frameDriver=driver;return factory(driver);
   }});
  }});
  Object.defineProperty(window,'SpineKit',{configurable:true,set(K) {
   Object.defineProperty(window,'SpineKit',{configurable:true,writable:true,value:K});
   // Keep alpha visible to the scan even when the viewer normally uses a solid stage.
   Object.defineProperty(K,'createStageBackground',{configurable:true,set(factory) {
    Object.defineProperty(K,'createStageBackground',{configurable:true,writable:true,
     value:options=>factory({...options,read:()=> 'checker'})});
   }});
   let ready;
   Object.defineProperty(K,'setLibraryStageReady',{configurable:true,set(fn){ready=fn;},get(){
    return value=>{window.__frameAuditReady=value;return ready?.call(K,value);};
   }});
  }});`});
 const variants = new Map(['nikki','bd2','cc','majsoul'].map(game=>[pages[game],game]));
 await context.route(url=>url.origin===origin && (variants.has(url.pathname) ||
   ['/azurlane-interaction/viewer/viewer.mjs','/azurlane-interaction/viewer/auto-scene-apertures.mjs',
    '/bd2/fated/viewer.mjs','/crosscore-interaction/viewer/app.mjs'].includes(url.pathname)), async route=>{
  let response;
  try { response=await route.fetch({timeout:25000,maxRetries:2}); }
  catch {
   // A canceled navigation or transient localhost reset belongs to this page,
   // not to the whole multi-resource scan.
   await route.abort().catch(()=>{});
   return;
  }
  if(!response.ok())return route.fulfill({response}).catch(()=>{});
  const name=new URL(route.request().url()).pathname;
  let body=await response.text();
  if (variants.has(name)) {
   const game=variants.get(name), frame=game==='majsoul'?'frame':'loop';
   body=body.replace(`requestAnimationFrame(${frame});`,`if(!window.__frameAuditStepping) requestAnimationFrame(${frame});`);
   body=replaceEntry(body,'  async function exportAnimation',standaloneProbe(game));
  } else if(name.endsWith('/crosscore-interaction/viewer/app.mjs')) {
   body=body.replaceAll('requestAnimationFrame(render);','if(!window.__frameAuditStepping) requestAnimationFrame(render);');
   body=replaceEntry(body,'function render()','window.__frameRender = () => window.__frameDraw(render);\n');
  }
  else if (name.endsWith('/auto-scene-apertures.mjs')) body=replaceEntry(body,' const rules = ',
    ' const test=window.__autoFrameTest; if(test?.id===id&&test.motion===motion)return test.aperture;\n');
  else if (name.endsWith('/fated/viewer.mjs')) body=replaceEntry(body,'function renderFrame(t)',`
   let scanClips=[];
   window.__frameAudit = {
    ready: ()=>!!scene?.gestures && !scene.loadingVariants && !!canvas.dataset.ready,
    assetId: ()=>scene?.model.id,
    count: ()=>1,
    actions: ()=>{
     const stages=scene.variants || new Map([[scene.gestures.groupIndex,scene]]);
     scanClips=[...stages].flatMap(([owner,picture]) =>
      picture.gestures.animationGroups.flatMap(group=>group.clips.map(clip=>({...clip,owner}))));
     return scanClips.map(({name,owner})=>({name,owner}));
    },
    select: ({name,owner})=>{
     const clip=scanClips.find(clip=>clip.name===name && clip.owner===owner);
     if(!clip)throw Error('Motion data is missing: '+name);
     if(scene.variants)scene.gestures.enterGroup(clip.owner,false);
     scene.gestures.previewAnimation(clip);
    },
    seek: fraction=>{
     const {state,skeleton}=scene;
     for(const track of state.tracks.filter(Boolean)) track.trackTime=track.animation.duration*fraction;
     state.apply(skeleton);
     if (typeof portraitFrame==='function') {
      const activeFrame=portraitFrame(scene);
      if (activeFrame!==scene.displayFrame)fit(activeFrame,true);
     }
     const updateWorld=()=>K.updateWorldTransform(skeleton,runtime.Physics?.update);
     updateWorld(); scene.gestures.applyOverrides(updateWorld); drawPortrait(scene,true);return true;
    }
   };
  `);
  else {
   body=body.replace('if(!exporting&&view.ready&&controller)', 'if(!window.__frameAuditEncoding&&!exporting&&view.ready&&controller)');
   body=replaceEntry(body,'evidence.adapter=adapter;controls();','evidence.auditRender=()=>render(0);');
   body=replaceEntry(body,'async function loadModel(id,','evidence.auditLoad=id=>loadModel(id,{history:false});\n');
   body=replaceEntry(body,' const apertureFallback =',' evidence.auditCamera=frameForAperture; evidence.authoredMatte=aperture;\n');
   body=replaceEntry(body," let stageClipPath = '';",' evidence.auditStageCrop=()=>displayedStageCrop;\n');
  }
  await route.fulfill({response,body}).catch(()=>{});
 });
}

async function inspect({game,id,phases,only,targets,apply,registeredRules=[],verify=[]}) {
 const {makeFrameProbe,live2DRingProbe,inspectCameraMatte,artworkRetention,artworkOutset,confirmedFrame,improvedFrame,
  sameFraming,apertureSwitchIsSmooth,verifyApertureExports} = window.ArthubFrameProbe;
 const read=makeFrameProbe(), stage=()=>document.querySelector('#stage canvas,#scene,#cv,#spineCanvas,canvas');
 const frames=[0,.09,.25,.47,.65,.82,.96,.999];
 const denseFrames=[...new Set([...frames,...Array.from({length:15},(_,i)=>(i+1)/16)])].sort((a,b)=>a-b);
 const nextFrame=()=>new Promise(requestAnimationFrame);
 const selected=(motion,variant,owner)=> (!only.length || only.includes(motion)) &&
  (!targets || targets.some(target=>target.motion===motion &&
   (target.variant===undefined || target.variant===variant) && (target.owner===undefined || target.owner===owner)));
 const entries=[];
 if (game==='azur') {
  const e=window.__azurlane, api=e.adapter;
  if(String(e.selected.id)!==id)throw Error('Loaded the wrong portrait: '+e.selected.id);
  e.view.playing=false;
  if (e.app) {
   e.app.renderer.resolution=1;
   e.app.renderer.resize(innerWidth,innerHeight);
  }
  await api.prepareExport?.();
  const canApply=apply && e.selected.type==='live2d';
  const transform=()=>{
   const {a,b,c,d,tx,ty}=e.model.worldTransform;
   return {a,b,c,d,tx,ty};
  };
  const visualSample=()=>read(stage(),true,canApply ? transform() : null);
  const existing=new Map(registeredRules.flatMap(rule=>rule.motions.map(motion=>[motion,rule.aperture])));
  const proposals=new Map(verify.map(({motion,aperture})=>[motion,aperture]));
  const encoded=new Set();
  const rings = e.app && live2DRingProbe(e.model);
  const author = e.authoredMatte;
  const nativeMatte = author?.preserveAngle && (author.edges || author.drawable && author.minOpacity >= .85)
   ? author.edges ? {edges:author.edges,preserveAngle:true}
                  : {drawable:author.drawable,corners:author.corners,preserveAngle:true}
   : null;
  for(const motion of e.selected.animations.filter(name=>proposals.size ? proposals.has(name) : selected(name))){
   const row={motion,frames:0,flags:0};
   entries.push(row);
   try {
    if (!e.controller.action(motion,{force:true,manual:true,idle:true,resetPose:true,voice:false})) throw Error('Motion is not selectable');
    const end=performance.now()+16000;
    while(e.controller.state.motionPending&&performance.now()<end) await new Promise(r=>setTimeout(r,8));
    const {duration,name}=api.timeline();
    if (name!==motion) throw Error('Selected another motion: '+name);
    const prior=existing.get(motion), candidates=new Map();
    const transition=canApply ? targets?.find(target=>target.motion===motion)?.transitionCameras ?? [] : [];
    const preset=proposals.get(motion);
    const milestones=(proposals.size || transition?.length ? denseFrames : frames).map(fraction=>duration*fraction);
    // A relative timeline sample can jump over the entire camera fade at the
    // start of a long motion. Cover those individual seconds as well.
    const intro=rings ? [.16,.33,.5,.65,.75,.85,1,1.25,1.5].filter(time=>time<duration) : [];
    const flaggedTimes=transition?.flatMap(item=>item.times).filter(time=>Number.isFinite(time) && time>=0 && time<duration) ?? [];
    const times=[...new Set([...milestones,...intro,...flaggedTimes].map(time=>+time.toFixed(4)))].sort((a,b)=>a-b);
    const cameras=new Map();
    const seek=time=>{api.seek?.(time,0,false,true);e.auditRender();};
    const inspectRule=(time,aperture)=>{
     window.__autoFrameTest={id,motion,aperture};
     seek(time);
     return visualSample();
    };
    if (preset?.trackWhenTransparent || transition?.length) {
     const alternatives=preset ? [preset] : transition.map(({camera})=>({
      ...camera,preserveAngle:true,trackWhenTransparent:true,reviewed:true,
     }));
     delete window.__autoFrameTest;
     const old=times.map(time=>{seek(time);return visualSample();});
     row.frames=times.length;
     for (const aperture of alternatives) {
      const proofs=[];
      for (let i=0;i<times.length;i++) {
       const metric=inspectRule(times[i],aperture), opening=e.auditStageCrop();
       if (!opening || metric.empty || metric.coverage < .982 || metric.sceneEdge) break;
       const opacity=inspectCameraMatte(e.model.internalModel.coreModel.getModel().drawables,aperture,opening,opening)?.opacity ?? 0;
       // Outside the active transition, preserve the art shown by the old camera.
       if(opacity < .1 && !old[i].empty && artworkRetention(old[i],metric)<.94)break;
       proofs.push(metric);
      }
      if(proofs.length!==times.length)continue;
      if(!preset)row.aperture=aperture;
      else {
       const key=JSON.stringify(aperture), encode=!encoded.has(key);
       await verifyApertureExports({api,duration,read,seek,encode,reference:proofs,times,transform});
       if(encode && duration>0)encoded.add(key);
       row.verification={mobileFrames:times.length,png:true,video:duration>0,encodedSample:encode};
      }
      break;
     }
     if(!row.aperture && !row.verification)row.verifyError='镜头之前或之后的构图需要核对';
     continue;
    }
    const hasBorder=metric=>metric.suspect || metric.solidStrip || metric.wedge && metric.content>=.15;
    const baseline=times.map(time=>{
     if(canApply)window.__autoFrameTest={id,motion,aperture:null};
     seek(time);
     const metric=visualSample();
     row.frames++;
     if(metric.empty)row.emptyFrames=(row.emptyFrames||0)+1;
     if(metric.solidStrip)row.stripFlags=(row.stripFlags||0)+1;
     if(metric.sceneEdge)row.sceneEdgeFrames=(row.sceneEdgeFrames||0)+1;
     if(metric.suspect)row.flags++;
     if(rings && canApply && !proposals.size && hasBorder(metric)){
      for(const aperture of rings()) candidates.set(JSON.stringify(aperture),aperture);
     }
     if(rings && canApply && !proposals.size && metric.sceneEdge){
      for(const aperture of rings.backdrops()) candidates.set(JSON.stringify(aperture),aperture);
     }
     if(rings && !proposals.size && !canApply){
      const displayed=e.auditStageCrop();
      const options=[...(nativeMatte ? [nativeMatte] : []), ...rings(.08)];
      let exposed=false;
      for(const camera of options){
       const opening=e.auditCamera({...camera,trackWhenTransparent:true});
       const sample=inspectCameraMatte(e.model.internalModel.coreModel.getModel().drawables,camera,opening,displayed);
       if(!sample?.exposed || sample.opacity>.98)continue;
       exposed=true;
       const key=JSON.stringify(camera);
       if(!cameras.has(key))cameras.set(key,{camera,times:[]});
       cameras.get(key).times.push(time);
      }
      if(exposed)row.transitionFrames=(row.transitionFrames||0)+1;
     }
     return metric;
    });
    if(cameras.size)row.transitionCameras=[...cameras.values()];
    const compare=(aperture, samples=times, reference=baseline)=>{
     let passed=0,valid=true,retained=1,wedges=0,outset=0,previousChanged=null,previousMetric;
     const metrics=samples.map((time,i)=>{
      const before=reference[i], after=inspectRule(time,aperture);
      const changed=!sameFraming(before,after);
      if(changed){
       retained=Math.min(retained,artworkRetention(before,after));
       outset=Math.max(outset,artworkOutset(before,after));
       valid &&= confirmedFrame(before,after);
      }
      if(previousChanged!==null && previousChanged!==changed){
       const switched=changed ? [before,after] : [reference[i-1],previousMetric];
       valid &&= apertureSwitchIsSmooth(...switched);
      }
      if(after.wedge && before.content>=.15)wedges++;
      if(improvedFrame(before,after))passed++;
      previousChanged=changed;
      previousMetric=after;
      return after;
     });
     return {passed,valid,retained,wedges,outset,metrics};
    };
    const sufficientlyBetter=(candidate,reference)=>candidate.valid && !candidate.wedges &&
     candidate.passed>=Math.min(reference.length,Math.max(2,Math.ceil(reference.filter(metric=>metric.suspect||metric.sceneEdge).length*.75)));
    if(proposals.size){
     const aperture=proposals.get(motion), proof=compare(aperture);
     row.retained=+proof.retained.toFixed(3);
     if(!sufficientlyBetter(proof,baseline)){
      row.verifyError='手机画幅或转场复测未通过';
      continue;
     }
     const key=JSON.stringify(aperture);
     const encode=!encoded.has(key);
     await verifyApertureExports({api,duration,read,seek,encode,reference:baseline,times,transform});
     if(encode && duration>0)encoded.add(key);
     row.verification={mobileFrames:times.length,retained:row.retained,png:true,video:duration>0,encodedSample:encode};
     continue;
    }
    const current=prior ? compare(prior) : null;
    if(current){
     row.retained=+current.retained.toFixed(3);
     if(current.retained<.96)row.removeRepair=true;
     else {
      row.keepRepair=true;
      if(current.wedges)row.remainingWedge=current.wedges;
      if(!current.wedges && !current.metrics.some(metric=>metric.suspect||metric.sceneEdge))continue;
     }
     candidates.set(JSON.stringify(prior),prior);
    }
    if(candidates.size)row.candidates=candidates.size;
    // Reuse the same textured mesh in the asset's motions. Try the visible
    // matte, a wider opening inferred from retained art, or the native angle.
    for(const aperture of candidates.values()){
     const guarded={...aperture,minOpacity:.96};
     for(const option of [guarded,{...guarded,preserveAngle:true}]){
      const trial=compare(option);
      const padded=trial.outset>.01 && trial.outset<=.15 ? {...option,outset:trial.outset} : null;
      const chosen=sufficientlyBetter(trial,baseline) ? option : padded && sufficientlyBetter(compare(padded),baseline) ? padded : null;
      if(!chosen)continue;
      const fullTimes=duration ? denseFrames.map(fraction=>fraction*duration) : [0];
      const fullBaseline=fullTimes.map(time=>inspectRule(time,null));
      const proof=compare(chosen,fullTimes,fullBaseline);
      if(!sufficientlyBetter(proof,fullBaseline))continue;
      if(row.keepRepair){
       const existingProof=compare(prior,fullTimes,fullBaseline);
       // Replacing an existing crop must remove its remaining edge without
       // sacrificing the coverage that the old rule already delivered.
       if(proof.retained+.005<existingProof.retained ||
          proof.passed<existingProof.passed || proof.wedges>existingProof.wedges)continue;
      }
      row.aperture=chosen;
      row.improved=proof.passed;
      row.previewFrames=fullTimes.length;
      break;
     }
     if(row.aperture)break;
    }
   }catch(error){row.error=error.message;}
   finally{delete window.__autoFrameTest;}
  }
  return entries;
 }

 const driver=window.__frameDriver, legacy=window.__frameAudit;
 const actual=legacy?.assetId() ?? (game==='cci' ? __crosscoreTest.snapshot().modelId : null);
 if(actual!=null && String(actual)!==id)throw Error('Loaded the wrong portrait: '+actual);
 const variants=phases ?? Array.from({length:legacy?.count()||1},(_,i)=>i);
 for(const variant of variants){
  if(targets && !targets.some(target=>(target.variant===undefined || target.variant===variant) &&
     (!only.length || only.includes(target.motion))))continue;
  if(phases && variant.toLowerCase()!==__crosscoreTest.snapshot().prefab?.toLowerCase()) {
   await __crosscoreTest.selectPrefab(variant);
   if(__crosscoreTest.snapshot().prefab?.toLowerCase()!==variant.toLowerCase())throw Error('Could not load phase '+variant);
  } else if(!phases && variant>0) await legacy.variant(variant);
  const actions=driver ? driver.animations().map(clip=>clip.name) : legacy.actions();
  const reference = legacy?.framing?.();
  const distinct=new Map(actions.map(action=>[typeof action==='string'?action:action.name+'|'+action.owner,action]));
  for(const action of distinct.values()){
   const motion=typeof action==='string'?action:action.name;
   if(!selected(motion,variant,action.owner))continue;
   const row={variant,motion,owner:action.owner,frames:0,flags:0};
   entries.push(row);
   try {
    if(driver){
     await driver.selectAnimation(motion);driver.setPlaying(false);
     if(driver.playback().name!==motion)throw Error('Selected another motion: '+driver.playback().name);
    }else await legacy.select(action);
    if (/^(?:idle|loop|normal)/i.test(reference?.motion ?? '') && reference.bounds) {
     const bounds=legacy.framing().bounds;
     const area=b=>(b.maxX-b.minX)*(b.maxY-b.minY);
     const enlargement=Math.sqrt(area(bounds)/area(reference.bounds));
     if (Number.isFinite(enlargement) && enlargement>=2.2) row.framingScale=+enlargement.toFixed(2);
    }
    for(const fraction of frames){
     let drawn=false;
     if(driver){
      driver.seek(driver.playback().duration*fraction);
      drawn=window.__frameRender?.() || false;
     }
     else drawn=legacy.seek(fraction);
     if(!drawn)await nextFrame();
     const metric=read(stage(),true);
     row.frames++;
     if(metric.empty)row.emptyFrames=(row.emptyFrames||0)+1;
     row.flags+=Number(!!metric.suspect);
     if(metric.solidStrip)row.stripFlags=(row.stripFlags||0)+1;
     if(metric.sceneEdge)row.sceneEdgeFrames=(row.sceneEdgeFrames||0)+1;
    }
   }catch(error){row.error=error.message;}
  }
 }
 return entries;
}

function enroll(previous, scans) {
 for (const item of scans) {
  if(item.game!=='azur')continue;
  const changes=item.actions?.filter(row=>row.aperture||row.removeRepair) ?? [];
  if(!changes.length) continue;
  const updated=new Map((previous[item.id] ?? []).flatMap(rule=>rule.motions.map(motion=>[motion,rule.aperture])));
  for(const {motion,aperture,removeRepair} of changes){
   if(removeRepair)updated.delete(motion);
   if(aperture)updated.set(motion,aperture);
  }
  const grouped=new Map();
  for(const [motion,aperture] of [...updated].sort(([a],[b])=>a.localeCompare(b))){
   const key=JSON.stringify(aperture);
   if(!grouped.has(key))grouped.set(key,{aperture,motions:[]});
   grouped.get(key).motions.push(motion);
  }
  if(grouped.size)previous[item.id]=[...grouped.values()];
  else delete previous[item.id];
 }
 return previous;
}

const marker=/export const automaticSceneApertures = ([\s\S]+?);\r?\n/;
function parseRegistry(before) {
 const data=marker.exec(before)?.[1];
 if(!data)throw Error('Cannot update the generated crop registry');
 return JSON.parse(data);
}
function installRepairs(scans, reportDir, expected) {
 if (!scans.some(row=>row.actions?.some(action=>action.aperture||action.removeRepair))) return;
 const temp=registered+'.new';
 const fd=fs.openSync(temp,'wx');
 let installed=false, opened=true;
 try {
  const before=fs.readFileSync(registered,'utf8');
  if(before!==expected)throw Error('Another scan changed the registered crops. Retry with the current version.');
  const updated=JSON.stringify(enroll(parseRegistry(before),scans),null,1);
  const output=before.replace(marker,'export const automaticSceneApertures = '+updated+';\n');
  if(output===before)return;
  const backup=path.join(reportDir,'auto-scene-apertures-before.mjs');
  if(!fs.existsSync(backup))fs.writeFileSync(backup,before,{encoding:'utf8',flag:'wx'});
  fs.writeFileSync(fd,output,'utf8');
  fs.closeSync(fd);
  opened=false;
  fs.renameSync(temp,registered);
  installed=true;
 } finally {
  if(opened)fs.closeSync(fd);
  if(!installed)fs.unlinkSync(temp);
 }
}

function previousReport(input) {
 if(!input)return null;
 const file=fs.statSync(input).isDirectory() ? path.join(input,'summary.json') : input;
 const content=fs.readFileSync(file,'utf8');
 const {review}=JSON.parse(content);
 if(!Array.isArray(review))throw Error('The input report has no list of flagged motions.');
 const targets=new Map();
 for(const {game,id,motion,variant,owner,transitionCameras} of review){
  if(!Object.hasOwn(pages,game) || typeof id!=='string' || typeof motion!=='string')throw Error('Invalid motion in the input report.');
  const key=game+'|'+id;
  if(!targets.has(key))targets.set(key,[]);
  targets.get(key).push({motion,variant,owner,transitionCameras});
 }
 return {targets,file:fs.realpathSync(file),hash:createHash('sha256').update(content).digest('hex')};
}

function summarize(scans, catalogs, mode) {
 const repaired=scans.flatMap(row=>(row.actions||[]).filter(clip=>clip.aperture).map(clip=>({id:row.id,...clip})));
 return {
  mode, catalogs,
  checked:scans.filter(row=>!row.error).length, loadErrors:scans.filter(row=>row.error).length,
  motions:scans.reduce((sum,row)=>sum+(row.actions?.length||0),0),
  frameChecks:scans.reduce((sum,row)=>sum+(row.actions||[]).reduce((n,entry)=>n+entry.frames,0),0),
  retained:scans.reduce((sum,row)=>sum+(row.actions||[]).filter(clip=>clip.keepRepair).length,0),
  reverted:scans.reduce((sum,row)=>sum+(row.actions||[]).filter(clip=>clip.removeRepair).length,0),
  ruleGroups:new Set(repaired.map(clip=>clip.id+'|'+JSON.stringify(clip.aperture))).size,
  repaired, review:scans.flatMap(row=>(row.actions||[]).filter(clip=>clip.error||clip.verifyError||clip.emptyFrames===clip.frames||
   clip.removeRepair||clip.remainingWedge||clip.sceneEdgeFrames||clip.transitionFrames||clip.framingScale||(clip.flags||clip.stripFlags)&&!clip.aperture&&!clip.keepRepair).map(clip=>({game:row.game,id:row.id,...clip}))),
 };
}

function writeReport(dir, summary, scans, origin) {
 const safe=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
 const locations=new Map(scans.map(item=>[item.game+'|'+item.id,item.path]));
 const repairedById=new Map();
 for(const {id,motion} of summary.repaired){
  const motions=repairedById.get(id)||[];
  motions.push(motion);repairedById.set(id,motions);
 }
 const link=(game,id)=>origin?`<a href="${safe(origin+locations.get(game+'|'+id))}">${safe(id)}</a>`:safe(id);
 const rows=[...repairedById].map(([id,motions])=>`<tr><th>${link('azur',id)}</th><td>${motions.length}</td><td>${safe(motions.join('、'))}</td></tr>`).join('');
 function reviewNote(record) {
  if(record.error)return record.error;
  if(record.verifyError)return record.verifyError;
  if(record.removeRepair)return (summary.mode==='apply' ? '已撤销裁切，原画保留率 ' : '需复核裁切，原画保留率 ')+Math.round(record.retained*100)+'%';
  if(record.remainingWedge)return '扫描画面仍有黑角';
  if(record.framingScale)return '画幅范围约为待机的 '+record.framingScale+' 倍，需核对分镜';
  if(record.emptyFrames===record.frames)return '没有可见画面';
  if(record.transitionFrames)return '转场期间露出矩形遮罩 ' + record.transitionFrames + '/' + record.frames + ' 帧';
  if(record.sceneEdgeFrames)return '疑似场景露边 ' + record.sceneEdgeFrames + '/' + record.frames + ' 帧';
  const matches=Math.max(record.flags,record.stripFlags||0);
  return '疑似边框 ' + matches + '/' + record.frames + ' 帧';
 }
 const pendingGroups=new Map();
 for(const record of summary.review){
  const stage=record.owner ?? record.variant ?? '';
  const key=JSON.stringify([record.game,record.id,stage]);
  if(!pendingGroups.has(key))pendingGroups.set(key,{game:record.game,id:record.id,stage,notes:[]});
  pendingGroups.get(key).notes.push(record);
 }
 const pending=[...pendingGroups.values()].map(({game,id,stage,notes})=>{
  const details=notes.map(record=>`<li>${safe(record.motion)} · ${safe(reviewNote(record))}</li>`).join('');
  return `<tr><th>${safe(game)} · ${link(game,id)}${stage!==''?' · '+safe(stage):''}</th><td><details><summary>${notes.length} 个动作</summary><ul>${details}</ul></details></td></tr>`;
 }).join('');
 const failures=[...summary.applicationError ? ['规则写入失败 '+summary.applicationError] : [],
  ...summary.catalogs.filter(entry=>entry.error).map(entry=>entry.game+' '+entry.error),
  ...scans.filter(item=>item.error).map(item=>item.game+' '+item.id+' '+item.error)];
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <title>ArtHub 画幅检查</title><style>
 body{margin:32px auto;padding:0 18px;max-width:1100px;font:15px/1.6 system-ui;color:#252830}h1{font-size:28px}
 a{color:#174f87}table{width:100%;border-collapse:collapse;overflow-wrap:anywhere}th{text-align:left}td,th{padding:8px 10px;border-bottom:1px solid #e1e4ea}
 details{margin-block:22px}summary{cursor:pointer;font-weight:600}
 </style>
 <h1>ArtHub 画幅检查</h1><p>检查了 ${summary.checked} 个资源、${summary.motions} 个动作和 ${summary.frameChecks} 个画面。</p>
 <p>${summary.mode==='apply'?'本地写入':'通过自动验证'} ${summary.repaired.length} 个动作的取景，涉及 ${summary.ruleGroups} 套画幅规则。复核保留 ${summary.retained} 条规则，${summary.mode==='apply'?'撤销':'拟撤销'} ${summary.reverted} 条过度裁切规则。</p>
 <p>${summary.review.length} 个动作待复核，${summary.loadErrors} 个资源加载失败。</p>
 <details open><summary>通过自动验证的取景</summary><table><thead><tr><th>资源</th><th>动作数</th><th>动作</th></tr></thead><tbody>${rows}</tbody></table></details>
 <details><summary>待复核</summary><table><thead><tr><th>资源与阶段</th><th>涉及动作</th></tr></thead><tbody>${pending}</tbody></table></details>
 <details><summary>加载或目录异常</summary><ul>${failures.map(error=>'<li>'+safe(error)+'</li>').join('')}</ul></details></html>`;
 fs.writeFileSync(path.join(dir,'report.html'),html,'utf8');
}

async function main() {
 const args=new Map(process.argv.slice(2).map(arg=>{
  const i=arg.indexOf('=');return i<0?[arg,true]:[arg.slice(0,i),arg.slice(i+1)];
 }));
 const params=['--url','--games','--ids','--motions','--workers','--report-dir','--scan-only','--dry-run','--from-report','--inventory','--resume'];
 for(const flag of args.keys())if(!params.includes(flag))throw Error('Unknown option: '+flag);
 const selected=args.get('--games')?.split(',') ?? Object.keys(pages);
 if(selected.some(game=>!pages[game]))throw Error('Unknown resource catalog');
 const ids=new Set(args.get('--ids')?.split(',')??[]), only=args.get('--motions')?.split(',')??[];
 const flagged=previousReport(args.get('--from-report'));
 const autoApply=!args.has('--scan-only'), shouldSave=autoApply&&!args.has('--dry-run');
 const count=Number(args.get('--workers')||5);
 if(!Number.isInteger(count)||count<1||count>12)throw Error('Use between 1 and 12 workers.');
 const dir=path.resolve(args.get('--report-dir')||fs.mkdtempSync(path.join(os.tmpdir(),'ArtHub-frame-audit-')));
 fs.mkdirSync(dir,{recursive:true});
 const outputSummary=path.join(fs.realpathSync(dir),'summary.json');
 if(flagged && path.relative(outputSummary,flagged.file)==='')throw Error('Choose an output folder different from the input report.');
 const engine=playwright().chromium;
 const chromePaths=[process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.LOCALAPPDATA]
  .filter(Boolean).flatMap(parent=>['Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe'].map(child=>path.join(parent,child)));
 const pathToBrowser=process.env.ARTHUB_BROWSER || chromePaths.find(file=>fs.existsSync(file));
 const {origin,server}=await localTarget(args.get('--url'));
 const scans=[];
 let browser;
 let catalogs;
 try {
  browser=await engine.launch({executablePath:pathToBrowser,headless:true,args:['--mute-audio','--use-angle=d3d11','--disable-background-timer-throttling']});
  const inventoryPage=await browser.newPage();
  catalogs=await discover(inventoryPage,origin,selected);
  await inventoryPage.close();
  const work=catalogs.flatMap(catalog=>catalog.rows)
   .filter(row=>(!ids.size||ids.has(row.id)) && (!flagged || flagged.targets.has(row.game+'|'+row.id)));
  console.log(catalogs.map(c=>c.game+' '+(c.error??c.rows.length)).join(' | '));
  console.log('Report:',dir);
  if(args.has('--inventory')) {
   fs.writeFileSync(path.join(dir,'inventory.json'),JSON.stringify(catalogs,null,2)+'\n','utf8');return;
  }
  if(!work.length)throw Error('No matching resources');
  const file=path.join(dir,'results.jsonl');
  const originalRegistry=autoApply ? fs.readFileSync(registered,'utf8') : null;
  const priorScope=path.join(dir,'scope.json'), scope=JSON.stringify({
   version:selected.includes('azur')?4:selected.includes('cc')?3:2,site,url:args.get('--url')??null,games:selected,ids:[...ids],motions:only,
   apply:autoApply,reportHash:flagged?.hash,registryHash:originalRegistry && createHash('sha256').update(originalRegistry).digest('hex'),
  });
  if(args.has('--resume')&&fs.existsSync(file)){
   if(!fs.existsSync(priorScope)||fs.readFileSync(priorScope,'utf8')!==scope)throw Error('The report directory belongs to another scan. Resume with the same options.');
   const allowed=new Set(work.map(row=>row.game+'|'+row.id));
   const saved=new Map();
   for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    if(!line)continue;
    try {
     const row=JSON.parse(line), key=row.game+'|'+row.id;
    if(allowed.has(key)&&!row.error&&!row.actions?.some(action=>action.error||action.verifyError))saved.set(key,row);
    }catch { /* A canceled scan may have left an incomplete last line. */ }
   }
   scans.push(...saved.values());
   fs.writeFileSync(file,scans.map(result=>JSON.stringify(result)+'\n').join(''),'utf8');
   for(let i=work.length-1;i>=0;i--)if(saved.has(work[i].game+'|'+work[i].id))work.splice(i,1);
  }else fs.writeFileSync(file,'','utf8');
  fs.writeFileSync(priorScope,scope,'utf8');
  const total=work.length+scans.length;
  const previousRules=originalRegistry ? parseRegistry(originalRegistry) : {};
  let next=0;
  await Promise.all(Array.from({length:Math.min(work.length,count)},async()=>{
   const context=await browser.newContext({viewport:{width:1280,height:760}});
   await prepare(context,origin);
   let page, pageGame, loads=0;
   try {
    while(next<work.length){
     const row=work[next++], result={...row};
     const reusable=['azur','nikki','bd2','cc'].includes(row.game);
     const reuse=reusable && page && !page.isClosed() && pageGame===row.game && loads<30;
     try {
      if(reuse){
       await page.evaluate(({game,id})=>game==='azur' ? __azurlane.auditLoad(id) : __frameAudit.load(id),row);
      }else{
       await page?.close().catch(()=>{});
       page=await context.newPage();pageGame=row.game;loads=0;
       await page.goto(origin+row.path,{waitUntil:'domcontentloaded',timeout:45000});
      }
      loads++;
      const ready=await page.waitForFunction(({game,id})=>{
       const status=document.querySelector('#status')?.textContent;
       if (status && /(?:^|·\s*)(?:加载失败|无法加载)/.test(status.trim())) return 'failed';
       if(game==='azur')return window.__azurlane?.ready && String(__azurlane.selected?.id)===id &&
        !__azurlane.controller.state.motionPending && __azurlane.view.frames>2;
       if(['nikki','bd2','cc'].includes(game))return window.__frameAudit?.assetId()===id && __frameAudit.ready();
       return window.__frameDriver?.playback()?.ready || window.__frameAudit?.ready();
      },row,{timeout:row.game==='riichi' ? 65000 : 45000});
      if(await ready.jsonValue()==='failed')throw Error('资源加载失败');
      const options={
       game:row.game,id:row.id,phases:row.phases,only,apply:autoApply,targets:flagged?.targets.get(row.game+'|'+row.id),
       registeredRules:row.game==='azur'?previousRules[row.id]:undefined,
      };
      result.actions=await page.evaluate(inspect,options);
      const proposed=result.actions.filter(action=>action.aperture);
      if(proposed.length){
       try {
        await page.setViewportSize({width:390,height:844});
        const proofs=await page.evaluate(inspect,{...options,verify:proposed});
        const proofByMotion=new Map(proofs.map(proof=>[proof.motion,proof]));
        for(const action of proposed){
         const proof=proofByMotion.get(action.motion);
         if(proof?.verification){
          action.verification=proof.verification;
          delete action.removeRepair;
          delete action.keepRepair;
          delete action.remainingWedge;
         }else{
          action.verifyError=proof?.verifyError || proof?.error || '无法复验该动作';
          delete action.aperture;
         }
        }
       }catch(error){
        for(const action of proposed){
         action.verifyError=String(error.message).split('\n')[0];
         delete action.aperture;
        }
       }finally{await page.setViewportSize({width:1280,height:760});}
      }
      for(const target of options.targets ?? []){
       if(only.length && !only.includes(target.motion))continue;
       if(!result.actions.some(action=>action.motion===target.motion &&
          (target.variant===undefined || target.variant===action.variant) &&
          (target.owner===undefined || target.owner===action.owner))){
        result.actions.push({...target,frames:0,flags:0,error:'当前资源中没有找到该动作或阶段'});
       }
      }
     } catch(error){
      const status=await page?.locator('#status').first().textContent({timeout:1000}).catch(()=>null);
      result.error=[String(error.message).split('\n')[0],status?.trim()].filter(Boolean).join(' · ');
     }
     finally {if(result.error || !reusable)await page?.close().catch(()=>{});}
     scans.push(result);
     fs.appendFileSync(file,JSON.stringify(result)+'\n','utf8');
     if(scans.length%10===0||work.length<25||result.error)console.log(scans.length+'/'+total,row.game,row.id,
      result.error??('motions '+result.actions.length+', suspect '+result.actions.filter(a=>a.flags).length+', repaired '+result.actions.filter(a=>a.aperture).length));
    }
   }finally{await context.close();}
  }));
  const summary=summarize(scans,catalogs.map(({game,error,rows})=>({game,registered:rows.length,error})),
   shouldSave?'apply':autoApply?'dry-run':'scan');
  if(shouldSave){
   try {installRepairs(scans,dir,originalRegistry);}
   catch(error){
    summary.mode='dry-run';
    summary.applicationError=error.message;
    console.error(error.message);
    process.exitCode=1;
   }
  }
  fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n','utf8');
  writeReport(dir,summary,scans,server?null:origin);
  console.log('Checked',summary.checked,'resources,',summary.motions,'motions,',summary.frameChecks,'frames.');
  console.log(summary.mode==='apply'?'Local repairs':'Verified proposals',summary.repaired.length,'for',
   new Set(summary.repaired.map(row=>row.id)).size,'resources. Review',summary.review.length,'motions. Load errors',summary.loadErrors);
  console.log('Report:',path.join(dir,'report.html'));
 } finally {await browser?.close();server?.closeAllConnections();server?.close();}
}

if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports = {summarize,writeReport};
