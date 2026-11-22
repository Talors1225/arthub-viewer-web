const abortError=()=>new DOMException('加载已取消','AbortError');
const encodePath=path=>path.split('/').map(encodeURIComponent).join('/');
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
 const cancel=()=>{clearTimeout(timer);reject(signal.reason||abortError());},timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);
 if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
});
// A stalled connection is different from a large file that is still arriving.
export async function readPortraitAsset(url, options={}) {
 const {signal,onProgress,fetcher=fetch,idleMs=45000,maxMs=600000,retries=1,priority}=options;
 for(let attempt=0;;attempt++) {
  if(signal?.aborted)throw signal.reason||abortError();
  const request=new AbortController();let idle,total;
  const cancel=()=>request.abort(signal.reason||abortError());
  const timeout=()=>request.abort(new Error('资源长时间没有响应，请重试'));
  const touch=()=>{clearTimeout(idle);idle=setTimeout(timeout,idleMs);};
  if(signal)signal.addEventListener('abort',cancel,{once:true});
  total=setTimeout(()=>request.abort(new Error('资源加载时间过长，请重试')),maxMs);touch();
  try {
   const response=await fetcher(url,{signal:request.signal,priority});touch();
   if(!response.ok){const error=new Error('资源读取失败（HTTP '+response.status+'）');error.status=response.status;throw error;}
   const length=Number(response.headers.get('content-length'))||0,chunks=[];let loaded=0;
   onProgress?.({loaded,total:length,attempt});
   if(response.body?.getReader){
    const reader=response.body.getReader();
    try {while(true){const item=await reader.read();if(item.done)break;if(request.signal.aborted)throw request.signal.reason||abortError();touch();chunks.push(item.value);loaded+=item.value.length;onProgress?.({loaded,total:length,attempt});}}
    finally {reader.releaseLock();}
   }else{const bytes=new Uint8Array(await response.arrayBuffer());chunks.push(bytes);loaded=bytes.length;onProgress?.({loaded,total:length,attempt});}
   if(request.signal.aborted)throw request.signal.reason||abortError();
   const bytes=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   return bytes;
  }catch(caught){
   const error=request.signal.aborted?request.signal.reason||caught:caught;
   if(signal?.aborted)throw signal.reason||abortError();
   if(attempt>=retries||error.status&&![408,429,500,502,503,504].includes(error.status))throw error;
   onProgress?.({retry:true,attempt:attempt+1});
  }finally{clearTimeout(idle);clearTimeout(total);signal?.removeEventListener('abort',cancel);}
  await sleep(options.retryMs??400,signal);
 }
}
// Stage the first-frame files so Cubism can reuse completed downloads on a retry.
export async function prepareLive2DSettings(url, options = {}) {
 const { signal: parent, onProgress, motions = ['idle', 'effect'], stageFiles = true, progressiveTexture = false, ...transport } = options;
 const controller = new AbortController(), signal = controller.signal;
 const cancel = () => controller.abort(parent.reason || abortError());
 if (parent?.aborted) cancel();
 else parent?.addEventListener('abort', cancel, { once: true });
 const objectURLs = [], previewTextures = new Map();
 const release = () => {
  for (const objectURL of objectURLs.splice(0)) URL.revokeObjectURL(objectURL);
 };
 const read = (file, progress) => readPortraitAsset(file, { idleMs: 15000, ...transport, signal, onProgress: progress });
 try {
  const settingsURL = new URL(url, globalThis.location?.href).href;
  const settings = JSON.parse(new TextDecoder().decode(await read(settingsURL)));
  const references = settings.FileReferences;
  const files = [];
  const add = (file, type, assign, preview, index) => {
   if (file) files.push({ url: new URL(file, settingsURL).href, type, assign, preview, index, bytes: 0, complete: false, retrying: false });
  };
  if(stageFiles)add(references.Moc, 'application/octet-stream', value => { references.Moc = value; });
  for(const [index,file] of references.Textures.entries()){
   const preview = progressiveTexture && await globalThis.SpineKit?.texturePreviewFor?.(new URL(file, settingsURL).href);
   const usable = preview && !preview.pma && !(preview.width*preview.height>=4096*4096 && globalThis.navigator?.deviceMemory<=2);
   if(stageFiles||usable)add(file,'image/png',value=>{references.Textures[index]=value;},usable?preview:null,index);
  }
  if (stageFiles) {
   for (const field of ['Physics', 'Pose']) add(references[field], 'application/json', value => { references[field] = value; });
   for (const motion of new Set(motions)) {
    for (const clip of references.Motions?.[motion] || []) add(clip.File, 'application/json', value => { clip.File = value; });
   }
  }
  const report = () => {
   if (signal.aborted) return;
   const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
   const completed = files.filter(file => file.complete).length;
   const stage = files.some(file => file.retrying) ? '连接停顿，正在重试' : '正在下载模型和贴图';
   onProgress?.(stage + ' · ' + completed + '/' + files.length + ' 文件 · ' + (bytes / 1048576).toFixed(1) + ' MiB',
    { completed, total: files.length, bytes, unit: '文件' });
  };
  report();
  const readFile = (file,url) => read(url, progress => {
   file.bytes = progress.retry ? 0 : progress.loaded;
   if (progress.retry || file.bytes) file.retrying = !!progress.retry;
   report();
  });
  const stash = (file, bytes, type) => {
   const objectURL = URL.createObjectURL(new Blob([bytes], {type}));
   objectURLs.push(objectURL);
   file.assign(objectURL);
  };
  let next = 0;
  const results = await Promise.allSettled(Array.from({length:Math.min(files.length,3)},async()=>{
   try {
    while (next < files.length) {
     if(signal.aborted)throw signal.reason||abortError();
     const file=files[next++];
     if(file.preview){
      try {
       const bytes=await readFile(file,file.preview.url),image=await decodeImage(bytes,signal);
       const {width,height}=file.preview;
       if(image.naturalWidth!==width||image.naturalHeight!==height)throw Error('压缩贴图尺寸与清单不符');
       stash(file,bytes,'image/webp');
       previewTextures.set(file.index,{url:file.url,width,height});
      }catch(error){
       if(signal.aborted)throw signal.reason||error;
       file.bytes=0;
      }
     }
     if(!previewTextures.has(file.index) && stageFiles)stash(file,await readFile(file,file.url),file.type);
     file.complete = true;
     file.retrying = false;
     report();
    }
   } catch (error) {
    controller.abort(error);
    throw error;
   }
  }));
  const failed = results.find(result => result.status === 'rejected');
  if (signal.aborted || failed) throw signal.reason || failed.reason;
  return { settings: { ...settings, url: settingsURL }, previewTextures, release };
 } catch (error) {
  release();
  throw error;
 } finally {
  parent?.removeEventListener('abort', cancel);
 }
}
const packedSkeletons={
 'yunlong_2_res/yunlong_2.skel':{path:'yunlong_2_res/optimized/ed4457c74e1e7c32.skel.gz',bytes:85071015},
};
export async function readPortraitSkeleton(path, base, options={}) {
 const packed=packedSkeletons[path];
 if(packed&&typeof DecompressionStream!=='undefined'&&options.preferCompressed!==false){
  try {
   let bytes=await readPortraitAsset(base+encodePath(packed.path),options);
   if(bytes[0]===0x1f&&bytes[1]===0x8b)bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
   if(options.signal?.aborted)throw options.signal.reason||abortError();
   if(bytes.length!==packed.bytes)throw new Error('压缩资源校验失败');
   options.onTransport?.('gzip');return bytes;
  }catch(error){if(options.signal?.aborted)throw options.signal.reason||error;options.onProgress?.({retry:true});}
 }
 const bytes=await readPortraitAsset(base+encodePath(path),options);options.onTransport?.('original');return bytes;
}
export function atlasPageNames(text) {
 const names=[];let page=true;
 for(const line of text.split(/\r?\n/)){const value=line.trim();if(!value){page=true;continue;}if(page){names.push(value);page=false;}}
 if(!names.length)throw new Error('立绘图集为空');return [...new Set(names)];
}
function decodeImage(bytes,signal) {
 return new Promise((resolve,reject)=>{
  const image=new Image(),url=URL.createObjectURL(new Blob([bytes]));let done=false;
  const finish=error=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);image.onload=image.onerror=null;URL.revokeObjectURL(url);if(error){image.src='';reject(error);}else resolve(image);};
  const cancel=()=>finish(signal.reason||abortError()),timer=setTimeout(()=>finish(new Error('贴图解码超时，请重试')),30000);
  image.onload=()=>finish();image.onerror=()=>finish(new Error('贴图无法解码，请重试'));
  if(signal?.aborted)cancel();else{signal?.addEventListener('abort',cancel,{once:true});image.src=url;}
 });
}

// Cubism consults live.textures by index on each draw. Swapping these Pixi
// textures preserves the model, motion queue, clipping masks and editor state.
export function createLive2DTextureUpgrade(PIXI,live,pending,parent){
 const controller=new AbortController(),signal=controller.signal;
 const abort=()=>controller.abort(parent.reason||abortError());
 if(parent?.aborted)abort();else parent?.addEventListener('abort',abort,{once:true});
 let work,timer,queued=false;
 async function finish(priority='high'){
  clearTimeout(timer);
  if(!pending.size)return !signal.aborted;
  if(work){
   const complete=await work;
   if(complete||priority!=='high'||signal.aborted)return complete;
  }
  if(work)return work;
  const tasks=[...pending.entries()];
  const upgrade=async()=>{
   while(tasks.length&&!signal.aborted){
    const [index,file]=tasks.pop();
    let replacement;
    try{
     const image=await decodeImage(await readPortraitAsset(file.url,{signal,priority}),signal);
     if(signal.aborted||image.naturalWidth!==file.width||image.naturalHeight!==file.height)continue;
     const old=live.textures[index],base=old.baseTexture;
     replacement=PIXI.Texture.from(image,{
      alphaMode:base.alphaMode,mipmap:base.mipmap,scaleMode:base.scaleMode,
      wrapMode:base.wrapMode,resolution:base.resolution,anisotropicLevel:base.anisotropicLevel,
     });
     if(!replacement.valid)continue;
     live.textures[index]=replacement;
     replacement=null;
     pending.delete(index);
     old.destroy(true);
    }catch{ /* The preview remains available while a later export retries. */ }
    finally{replacement?.destroy(true);}
   }
  };
  work=Promise.all(Array.from({length:Math.min(2,tasks.length)},upgrade))
   .then(()=>!signal.aborted&&!pending.size).finally(()=>{work=null;});
  return work;
 }
 function queue(){
  if(queued||!pending.size||signal.aborted||globalThis.navigator?.connection?.saveData)return;
  queued=true;
  const start=()=>{if(!signal.aborted&&document.visibilityState==='visible')void finish('low');};
  timer=setTimeout(()=>{
   if(document.visibilityState==='visible')start();
   else document.addEventListener('visibilitychange',start,{signal});
  },2600);
 }
 return {queue,finish,dispose(){
  clearTimeout(timer);
  controller.abort(abortError());
  parent?.removeEventListener('abort',abort);
 }};
}

// This viewer uses the 3.8 runtime's callback-based TextureAtlas constructor.
export async function loadPortraitSpineAssets(ns,context,layers,options={}) {
 const K=globalThis.SpineKit;
 const controller=new AbortController(),signal=controller.signal,parent=options.signal;
 const cancel=()=>controller.abort(parent.reason||abortError());
 if(parent?.aborted)cancel();else parent?.addEventListener('abort',cancel,{once:true});
 const textures=new Set(),progress=new Map();let files=0,completed=0,closed=false;
 const dispose=()=>{if(closed)return;closed=true;for(const texture of textures)try{
  if(K?.disposeSceneTexture)K.disposeSceneTexture(texture);
  else texture.dispose();
 }catch{}textures.clear();};
 const report=(key,state)=>{if(signal.aborted)return;if(state.retry){options.onProgress?.('连接中断，正在重试读取立绘…');return;}progress.set(key,state.loaded);const bytes=[...progress.values()].reduce((a,b)=>a+b,0);options.onProgress?.('正在读取立绘 · '+(bytes/1048576).toFixed(1)+' MB'+(files?' · '+completed+'/'+files+' 文件':''));};
 const read=async(url)=>{files++;const bytes=await readPortraitAsset(url,{...options,signal,onProgress:s=>report(url,s)});completed++;return bytes;};
 const base=options.base;
 try {
  const jobs=layers.map(async spec=>{
   const atlasURL=base+encodePath(spec.atlas);
   const binaryJob=(async()=>{const key=spec.folder+spec.skeleton;files++;const result=await readPortraitSkeleton(key,base,{...options,signal,onProgress:s=>report(key,s),onTransport:kind=>options.onTransport?.(key,kind)});completed++;return result;})();
   const atlasJob=(async()=>{
    const text=new TextDecoder().decode(await read(atlasURL)),names=atlasPageNames(text),pages=new Map();let next=0;
    const workers=Array.from({length:Math.min(3,names.length)},async()=>{
     try{
      while(next<names.length){
       if(signal.aborted)throw signal.reason||abortError();
       const name=names[next++],url=new URL(encodePath(name),new URL(atlasURL,location.href)).href;
       let texture;
       if(options.progressiveTexture&&K?.loadSceneTexture){
        files++;
        ({texture}=await K.loadSceneTexture(ns.webgl,context,url,{
         signal,pma:false,progressiveTexture:true,autoUpgrade:false,timeout:options.maxMs||600000,
         retryIdleMs:options.idleMs||45000,retryHTTP:true,
        }));
        completed++;report(url,{loaded:0});
       }else{
        const image=await decodeImage(await read(url),signal);
        texture=new ns.webgl.GLTexture(context,image);
       }
       textures.add(texture);pages.set(name,texture);
      }
     }
     catch(error){controller.abort(error);throw error;}
    });
    const results=await Promise.allSettled(workers),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    if(signal.aborted)throw signal.reason||abortError();
    return new ns.TextureAtlas(text,name=>pages.get(name));
   })();
   const results=await Promise.allSettled([atlasJob,binaryJob].map(job=>job.catch(error=>{controller.abort(error);throw error;}))),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
   return {spec,atlas:results[0].value,bytes:results[1].value};
  }).map(job=>job.catch(error=>{controller.abort(error);throw error;}));
  const results=await Promise.allSettled(jobs),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  options.onProgress?.('正在准备立绘…');return {
   layers:results.map(r=>r.value),dispose,
   queueTextureUpgrade:()=>{if(options.progressiveTexture)textures.forEach(texture=>K?.queueTextureUpgrade?.(texture));},
   prepareExport:()=>options.progressiveTexture&&K?.requireTextureQuality?.(textures),
  };
 }catch(error){controller.abort(error);dispose();throw error;}
 finally{parent?.removeEventListener('abort',cancel);}
}
