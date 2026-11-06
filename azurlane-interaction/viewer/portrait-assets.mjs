const abortError=()=>new DOMException('加载已取消','AbortError');
const encodePath=path=>path.split('/').map(encodeURIComponent).join('/');
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
 const cancel=()=>{clearTimeout(timer);reject(signal.reason||abortError());},timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);
 if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
});
// A stalled connection is different from a large file that is still arriving.
export async function readPortraitAsset(url, options={}) {
 const {signal,onProgress,fetcher=fetch,idleMs=45000,maxMs=600000,retries=1}=options;
 for(let attempt=0;;attempt++) {
  if(signal?.aborted)throw signal.reason||abortError();
  const request=new AbortController();let idle,total;
  const cancel=()=>request.abort(signal.reason||abortError());
  const timeout=()=>request.abort(new Error('资源长时间没有响应，请重试'));
  const touch=()=>{clearTimeout(idle);idle=setTimeout(timeout,idleMs);};
  if(signal)signal.addEventListener('abort',cancel,{once:true});
  total=setTimeout(()=>request.abort(new Error('资源加载时间过长，请重试')),maxMs);touch();
  try {
   const response=await fetcher(url,{signal:request.signal});touch();
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
// This viewer uses the 3.8 runtime's callback-based TextureAtlas constructor.
export async function loadPortraitSpineAssets(ns,context,layers,options={}) {
 const controller=new AbortController(),signal=controller.signal,parent=options.signal;
 const cancel=()=>controller.abort(parent.reason||abortError());
 if(parent?.aborted)cancel();else parent?.addEventListener('abort',cancel,{once:true});
 const textures=new Set(),progress=new Map();let files=0,completed=0,closed=false;
 const dispose=()=>{if(closed)return;closed=true;for(const texture of textures)try{texture.dispose();}catch{}textures.clear();};
 const report=(key,state)=>{if(signal.aborted)return;if(state.retry){options.onProgress?.('连接中断，正在重试读取立绘…');return;}progress.set(key,state.loaded);const bytes=[...progress.values()].reduce((a,b)=>a+b,0);options.onProgress?.('正在读取立绘 · '+(bytes/1048576).toFixed(1)+' MB'+(files?' · '+completed+'/'+files+' 文件':''));};
 const read=async(url)=>{files++;const bytes=await readPortraitAsset(url,{...options,signal,onProgress:s=>report(url,s)});completed++;return bytes;};
 const base=options.base;
 try {
  const jobs=layers.map(async spec=>{
   const atlasURL=base+encodePath(spec.atlas);
   const binaryJob=(async()=>{const key=spec.folder+spec.skeleton;files++;const result=await readPortraitSkeleton(key,base,{...options,signal,onProgress:s=>report(key,s),onTransport:kind=>options.onTransport?.(key,kind)});completed++;return result;})();
   const atlasJob=(async()=>{
    const text=new TextDecoder().decode(await read(atlasURL)),names=atlasPageNames(text),images=new Map();let next=0;
    const workers=Array.from({length:Math.min(3,names.length)},async()=>{
     try{while(next<names.length){if(signal.aborted)throw signal.reason||abortError();const name=names[next++],url=new URL(encodePath(name),new URL(atlasURL,location.href)).href,image=await decodeImage(await read(url),signal);images.set(name,image);}}
     catch(error){controller.abort(error);throw error;}
    });
    const results=await Promise.allSettled(workers),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    if(signal.aborted)throw signal.reason||abortError();
    return new ns.TextureAtlas(text,name=>{const texture=new ns.webgl.GLTexture(context,images.get(name));textures.add(texture);return texture;});
   })();
   const results=await Promise.allSettled([atlasJob,binaryJob].map(job=>job.catch(error=>{controller.abort(error);throw error;}))),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
   return {spec,atlas:results[0].value,bytes:results[1].value};
  }).map(job=>job.catch(error=>{controller.abort(error);throw error;}));
  const results=await Promise.allSettled(jobs),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  options.onProgress?.('正在准备立绘…');return {layers:results.map(r=>r.value),dispose};
 }catch(error){controller.abort(error);dispose();throw error;}
 finally{parent?.removeEventListener('abort',cancel);}
}
