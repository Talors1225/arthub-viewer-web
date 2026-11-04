import {liveDefinition} from './bundle.mjs?v=20261104-unified-final';
const K=window.SpineKit;
let runtimeQueue=Promise.resolve();
async function spineRuntime(version){
  const minor=version.split('.').slice(0,2).join('.');
  runtimeQueue=runtimeQueue.catch(()=>{}).then(async()=>{
    const file=minor==='4.1'?'spine-webgl.js':'spine-webgl-'+minor+'.js',url=minor==='3.8'?'../../azurlane-interaction/viewer/vendor/spine-player.js':'../../bd2/viewer/vendor/'+file;
    if(!await K.loadSpineVersion(minor,[url]))throw Error('Spine '+minor+' 运行库无法加载');
    const ns=K.spineNS[minor];if(ns.webgl)Object.assign(ns,ns.webgl);return ns;
  });return runtimeQueue;
}
function image(url,signal){return new Promise((resolve,reject)=>{
  const img=new Image();const cancel=()=>{img.src='';reject(new DOMException('已取消加载','AbortError'));};
  if(signal.aborted)return cancel();signal.addEventListener('abort',cancel,{once:true});
  img.onload=()=>{signal.removeEventListener('abort',cancel);resolve(img);};img.onerror=()=>{signal.removeEventListener('abort',cancel);reject(Error('贴图无法解码'));};img.src=url;
});}
const check=signal=>{if(signal.aborted)throw new DOMException('已取消加载','AbortError');};
function modelBounds(skeleton,ns,visibleOnly){
  if(!visibleOnly)return K.measureBounds(skeleton,ns);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;const boxes=[];
  for(const slot of skeleton.drawOrder){
    const attachment=slot.getAttachment();if(!slot.bone.active||!attachment||slot.color.a*(attachment.color?.a??1)<.0001)continue;
    let vertices;
    if(attachment instanceof ns.RegionAttachment){vertices=new Float32Array(8);attachment.computeWorldVertices(slot.bone,vertices,0,2);}
    else if(attachment instanceof ns.MeshAttachment){vertices=new Float32Array(attachment.worldVerticesLength);attachment.computeWorldVertices(slot,0,vertices.length,vertices,0,2);}
    if(!vertices||!vertices.every(Number.isFinite))continue;
    let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
    for(let i=0;i<vertices.length;i+=2){left=Math.min(left,vertices[i]);right=Math.max(right,vertices[i]);bottom=Math.min(bottom,vertices[i+1]);top=Math.max(top,vertices[i+1]);}
    boxes.push({left,right,bottom,top,area:(right-left)*(top-bottom)});
  }
  const largest=Math.max(0,...boxes.map(b=>b.area));
  // This opt-in framing preset excludes tiny control sprites far outside the visible character.
  for(const b of boxes){if(b.area<largest*.01)continue;minX=Math.min(minX,b.left);maxX=Math.max(maxX,b.right);minY=Math.min(minY,b.bottom);maxY=Math.max(maxY,b.top);}
  return {minX,minY,maxX,maxY};
}
function resize(canvas){const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),density=Math.min(2,devicePixelRatio||1),pw=Math.round(w*density),ph=Math.round(h*density);if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;return {w,h,density};}
function stageFrame(canvas){
  const area=K.stageViewArea(canvas),rect=canvas.getBoundingClientRect(),pill=document.getElementById('status'),info=pill?.getBoundingClientRect(),bottom=area.top+area.height;
  const top=info?.height&&info.top<rect.top+rect.height*.3&&getComputedStyle(pill).opacity!=='0'?Math.max(area.top,info.bottom+10):area.top;
  return {left:area.left-rect.left,top:top-rect.top,width:area.width,height:Math.max(100,bottom-top)};
}
export async function loadSpine(bundle,model,canvas,signal,onProgress){
  const ns=await spineRuntime(model.version);check(signal);
  const context=K.createGL(canvas,ns);if(!context)throw Error('无法创建 WebGL，请开启浏览器硬件加速');
  const {mgl,renderer}=context,gl=mgl.gl,atlasText=await bundle.files.get(model.atlas).text(),legacy=model.version.startsWith('3.8.');
  const declaredSizes=new Map();
  if(legacy&&model.atlasSizeMode==='declared'){
    const lines=atlasText.split(/\r?\n/);let pageNext=true;
    for(let i=0;i<lines.length;i++){const line=lines[i].trim();if(!line){pageNext=true;continue;}if(pageNext){pageNext=false;const size=/^size:\s*(\d+)\s*,\s*(\d+)/.exec(lines[i+1]||'');if(size&&+size[1]>0&&+size[2]>0)declaredSizes.set(line,{width:+size[1],height:+size[2]});}}
  }
  let atlas=legacy?new ns.TextureAtlas(atlasText,()=>({setFilters(){},setWraps(){},getImage:()=>({width:1,height:1})})):new ns.TextureAtlas(atlasText);
  let disposed=false,tools,lastView,lastFrame;const textures=[];
  const dispose=()=>{if(disposed)return;disposed=true;for(const texture of textures)texture.dispose();renderer.dispose();try{gl.getExtension('WEBGL_lose_context')?.loseContext();}catch{}};
  try{
    const pageTextures=new Map();for(let i=0;i<atlas.pages.length;i++){
      const page=atlas.pages[i],file=bundle.resolve(model.atlas,page.name);onProgress('正在读取贴图 '+(i+1)+' / '+atlas.pages.length);
      const img=await image(bundle.url(file),signal);check(signal);
      const texture=new ns.GLTexture(mgl,img);
      // Unity can resample a non-power-of-two atlas while keeping its original atlas coordinates.
      // Keep the uploaded bitmap intact and use the declared logical size for Spine's UV math.
      if(declaredSizes.has(page.name)){const logical=declaredSizes.get(page.name);texture.getImage=()=>logical;}
      textures.push(texture);pageTextures.set(page.name,texture);if(!legacy){page.texture=texture;page.setTexture(texture);}
    }
    if(legacy){atlas=new ns.TextureAtlas(atlasText,name=>pageTextures.get(name));for(const page of atlas.pages)page.pma=true;}
    const loader=new ns.AtlasAttachmentLoader(atlas),reader=model.format==='json'?new ns.SkeletonJson(loader):new ns.SkeletonBinary(loader);
    const data=reader.readSkeletonData(model.format==='json'?model.json:new Uint8Array(await bundle.files.get(model.path).arrayBuffer()));check(signal);
    const skeleton=new ns.Skeleton(data);skeleton.setToSetupPose();
    if(model.initialSkin&&data.findSkin(model.initialSkin)){skeleton.setSkinByName(model.initialSkin);skeleton.setSlotsToSetupPose();}
    const state=new ns.AnimationState(new ns.AnimationStateData(data));state.data.defaultMix=.15;
    const animations=data.animations.map(a=>({name:a.name,duration:a.duration}));
    const first=animations.find(a=>a.name===model.initialAnimation)||animations.find(a=>/^(idle|normal|loop|default)$/i.test(a.name))||animations[0];if(first)state.setAnimation(0,first.name,true);
    state.apply(skeleton);skeleton.updateWorldTransform(ns.Physics?.update);
    let bounds=modelBounds(skeleton,ns,model.visibleBounds);
    const validBounds=value=>value&&[value.minX,value.minY,value.maxX,value.maxY].every(Number.isFinite)&&value.maxX-value.minX>=1&&value.maxY-value.minY>=1;
    if(model.remote&&!validBounds(bounds)){
      const box=model.json?.skeleton;
      if(box&&[box.x,box.y,box.width,box.height].every(Number.isFinite)&&box.width>0&&box.height>0)bounds={minX:box.x,minY:box.y,maxX:box.x+box.width,maxY:box.y+box.height};
    }
    if(!bounds||![bounds.minX,bounds.minY,bounds.maxX,bounds.maxY].every(Number.isFinite))throw Error('模型没有可显示的部件');
    if(bounds.maxX-bounds.minX<1||bounds.maxY-bounds.minY<1)throw Error('模型的显示范围为空');
    const layer={skeleton,data,state,atlas},layers=[layer];
    function world(x,y){const f=lastFrame||stageFrame(canvas),unit=Math.max((bounds.maxX-bounds.minX)/f.width,(bounds.maxY-bounds.minY)/f.height)*1.06/lastView.zoom;return {x:(bounds.minX+bounds.maxX)/2+(x-(f.left+f.width/2)-lastView.x)*unit,y:(bounds.minY+bounds.maxY)/2-(y-(f.top+f.height/2)-lastView.y)*unit};}
    function project(x,y){const a=world(0,0),b=world(canvas.clientWidth,canvas.clientHeight);return {x:(x-a.x)/(b.x-a.x)*canvas.clientWidth,y:(y-a.y)/(b.y-a.y)*canvas.clientHeight};}
    const editor=window.createInteractionSpineEditor({layers,ns,project,unproject:world});
    const api={type:'spine',canvas,editor,animations,skins:data.skins.map(s=>s.name),warnings:[],
      interactionPoint(clientX,clientY){const r=canvas.getBoundingClientRect();return world(clientX-r.left,clientY-r.top);},
      interactionPolygons(hotspots){return hotspots.filter(h=>h.enabled).map(h=>({...h,paths:h.paths.map(path=>path.map(([x,y])=>{const bone=h.bone?skeleton.findBone(h.bone):null;return bone?{x:bone.a*x+bone.b*y+bone.worldX,y:bone.c*x+bone.d*y+bone.worldY}:{x,y};}))}));},
      interactionProject:project,
      interactionContains(point){
        for(const slot of skeleton.drawOrder){
          const a=slot.getAttachment();if(!slot.bone.active||!a||slot.color.a*(a.color?.a??1)<.001)continue;
          let vertices,triangles;
          if(a instanceof ns.RegionAttachment){vertices=new Float32Array(8);a.computeWorldVertices(slot.bone,vertices,0,2);triangles=[0,1,2,2,3,0];}
          else if(a instanceof ns.MeshAttachment){vertices=new Float32Array(a.worldVerticesLength);a.computeWorldVertices(slot,0,vertices.length,vertices,0,2);triangles=a.triangles;}
          if(!vertices?.every(Number.isFinite))continue;
          for(let i=0;i<triangles.length;i+=3){const p=Array.from(triangles.slice(i,i+3),n=>({x:vertices[n*2],y:vertices[n*2+1]}));const cross=(a,b)=>(point.x-b.x)*(a.y-b.y)-(a.x-b.x)*(point.y-b.y);const signs=p.map((a,j)=>cross(a,p[(j+1)%3]));if(signs.some(v=>v>0)&&signs.some(v=>v<0))continue;if(Math.abs((p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[1].y-p[0].y)*(p[2].x-p[0].x))>.001)return true;}
        }return false;
      },
      expression(name){if(!data.findSkin(name))return false;skeleton.setSkinByName(name);skeleton.setSlotsToSetupPose();state.apply(skeleton);skeleton.updateWorldTransform(ns.Physics?.pose);return true;},
      playOnce(name,back){if(!data.findAnimation(name))return false;state.setAnimation(0,name,name===back);if(back&&back!==name&&data.findAnimation(back))state.addAnimation(0,back,true,0);return true;},
      setTools(value){tools=value;},dispose,
      play(name,loop=true){if(!data.findAnimation(name))throw Error('动画不存在');state.setAnimation(0,name,loop);},
      loop(value){const track=state.getCurrent(0);if(track)track.loop=value;},
      seek(time){const track=state.getCurrent(0);if(track){track.trackTime=Math.max(0,Math.min(track.animation.duration,time));track.animationLast=track.nextAnimationLast=track.trackTime;state.apply(skeleton);skeleton.updateWorldTransform(ns.Physics?.pose);}},
      skin(name){skeleton.setSkinByName(name);skeleton.setSlotsToSetupPose();state.apply(skeleton);skeleton.updateWorldTransform(ns.Physics?.pose);const next=modelBounds(skeleton,ns,model.visibleBounds);if(next&&next.maxX>next.minX&&next.maxY>next.minY&&[next.minX,next.minY,next.maxX,next.maxY].every(Number.isFinite))bounds=next;},
      playback(){const t=state.getCurrent(0),d=t?.animation.duration||0;return {name:t?.animation.name||'',duration:d,time:d?(t.loop?t.trackTime%d:Math.min(d,t.trackTime)):0,loop:t?.loop??true};},
      render(dt,view){if(disposed)return;lastView=view;const {w,h,density}=resize(canvas);lastFrame=stageFrame(canvas);gl.viewport(0,0,canvas.width,canvas.height);tools?.before();if(view.playing){state.update(dt*view.speed);skeleton.update?.(dt*view.speed);}state.apply(skeleton);skeleton.updateWorldTransform(ns.Physics?.update);tools?.after();
        const a=world(w/2,h/2),b=world(w/2+1,h/2);renderer.camera.setViewport(canvas.width,canvas.height);renderer.camera.zoom=(b.x-a.x)/density;renderer.camera.position.set(a.x,a.y,0);renderer.camera.update();gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);renderer.begin();renderer.drawSkeleton(skeleton,!!atlas.pages[0]?.pma);renderer.end();},
      capture(animation){return window.createInteractionSpineCapture({layers,ns,canvas,renderer,gl,editor,animation,restore:()=>api.render(0,lastView)});},
    };return api;
  }catch(error){dispose();throw error;}
}

function preserveSimulation(root){const saved=[],seen=new WeakSet();function visit(value){if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);if(ArrayBuffer.isView(value)){const copy=value.slice();saved.push(()=>value.set(copy));return;}const entries=Object.entries(Object.getOwnPropertyDescriptors(value)).filter(([key,d])=>d.writable&&key!=='_model').map(([key,d])=>[key,d.value]);saved.push(()=>{for(const [key,original]of entries)value[key]=original;});for(const [,child]of entries)visit(child);}visit(root);return ()=>saved.forEach(fn=>fn());}
let liveScripts;
async function loadLiveScripts(){
  return liveScripts ||= (async()=>{for(const file of ['live2dcubismcore.min.js','pixi-6.5.10.min.js','cubism4-0.4.0.min.js'])await K.loadScript('../../azurlane-interaction/viewer/vendor/live2d/'+file);
  })().catch(error=>{liveScripts=null;throw error;});
}
export async function loadLive2D(bundle,model,canvas,signal,onProgress){
  await loadLiveScripts();check(signal);onProgress('正在读取 Live2D 模型与贴图');
  const {data,warnings}=await liveDefinition(bundle,model);
  // Local imports do not infer game voice rules or start sound on their own.
  for(const motions of Object.values(data.FileReferences.Motions||{}))for(const motion of motions)delete motion.Sound;
  const app=new PIXI.Application({view:canvas,width:1,height:1,autoStart:false,antialias:true,backgroundAlpha:0,resolution:1,autoDensity:false,preserveDrawingBuffer:true});
  let live,disposed=false,tools,lastView,current='',loop=true,fittingBounds;
  // The bundled Cubism adapter releases its native Moc on internalModel destroy.
  const dispose=()=>{if(disposed)return;disposed=true;const gl=app.renderer?.gl;try{live?.destroy({children:true,texture:true,baseTexture:true});app.destroy(false,{children:true,texture:true,baseTexture:true});}catch{}try{gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}};
  try{
    const settings=new PIXI.live2d.Cubism4ModelSettings(data);
    // pixi-live2d's legacy URL resolver strips the colon from blob:http URLs.
    // Use an instance-scoped resolver, and only allow files selected locally.
    settings.resolveURL=reference=>{if(typeof reference!=='string'||!reference.startsWith('blob:'))throw Error('模型引用了未选择的文件：'+reference);return reference;};
    live=await PIXI.live2d.Live2DModel.from(settings,{autoInteract:false,autoUpdate:false,motionPreload:PIXI.live2d.MotionPreloadStrategy.NONE});check(signal);
    app.stage.addChild(live);live.anchor.set(.5,.5);
    const internal=live.internalModel,core=internal.coreModel.getModel(),natural={width:internal.width,height:internal.height};
    const editor=window.createInteractionLive2DEditor({live,core,hitAreas:data.HitAreas?.map(a=>({id:a.Id}))||[]});
    internal.on('beforeModelUpdate',()=>editor.applyParameters());
    const nativeDraw=internal.draw.bind(internal);internal.draw=gl=>{tools?.after();nativeDraw(gl);};
    const manager=internal.motionManager,queue=manager.queueManager||manager.motionManager;
    const animations=[],mapping=new Map();
    for(const [group,motions]of Object.entries(data.FileReferences.Motions||{}))for(let i=0;i<motions.length;i++){
      const name=group+(motions.length>1?' / '+(i+1):'');let duration=0;
      try{const motion=await bundle.json(motions[i]._localPath);duration=motion.Meta?.Duration||0;}catch{}
      animations.push({name,duration});mapping.set(name,{group,index:i});
    }
    let playSerial=0;
    const api={type:'live2d',canvas,editor,animations,skins:[],warnings,setTools(value){tools=value;},dispose,
      async play(name,repeat=true){const item=mapping.get(name);if(!item)throw Error('动作不存在');const serial=++playSerial,motion=await manager.loadMotion(item.group,item.index);check(signal);if(serial!==playSerial)return;motion.setIsLoop(repeat);await live.motion(item.group,item.index,3);current=name;loop=repeat;},
      loop(value){loop=value;for(const item of queue?._motions||[])item._motion?.setIsLoop(value);},
      playback(){const item=[...(queue?._motions||[])].reverse().find(i=>!i.isFinished()&&i._motion),duration=animations.find(a=>a.name===current)?.duration||item?._motion?.getLoopDuration?.()||0,elapsed=item?.isStarted()?Math.max(0,item.getStateTime()-item.getStartTime()):0;return {name:current,duration,time:duration?(loop?elapsed%duration:Math.min(duration,elapsed)):0,loop};},
      seek(seconds,delta=0){const item=[...(queue?._motions||[])].reverse().find(i=>!i.isFinished()&&i._motion);if(!item)return;const time=Math.max(0,Math.min(api.playback().duration-.0001,seconds)),clock=live.elapsedTime/1000;item.setStartTime(clock-time);item.setFadeInStartTime(clock-time);item.setEndTime(loop?-1:clock-time+api.playback().duration);item.setIsFinished(false);item.setLastCheckEventSeconds(clock);internal.update(delta*1000,live.elapsedTime);live.deltaTime=0;app.render();},
      render(dt,view){if(disposed)return;lastView=view;tools?.before();const {w,h}=resize(canvas);app.renderer.resolution=Math.min(2,devicePixelRatio||1);if(app.renderer.screen.width!==w||app.renderer.screen.height!==h)app.renderer.resize(w,h);const f=stageFrame(canvas),fit=fittingBounds||=K.live2DViewBounds(internal,natural,data.HitAreas?.map(a=>a.Id)||[]),scale=Math.min(f.width/fit.width,f.height/fit.height)*.92*view.zoom;live.scale.set(scale);live.position.set(f.left+f.width/2+view.x+(natural.width/2-fit.x)*scale,f.top+f.height/2+view.y+(natural.height/2-fit.y)*scale);editor.applyParameters();if(view.playing)live.update(dt*1000*view.speed);app.render();},
      capture(){
        const hit=new Set(data.HitAreas?.map(a=>a.Id)||[]);
        const measure=()=>{const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
        for(let i=0;i<core.drawables.ids.length;i++){
          if(hit.has(core.drawables.ids[i])||!internal.coreModel.getDrawableDynamicFlagIsVisible(i)||core.drawables.opacities[i]<=.001||editor.hidden.has(core.drawables.ids[i])||!core.drawables.indices[i].length)continue;
          const vertices=internal.getDrawableVertices(i),b={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};for(let j=0;j<vertices.length;j+=2){const p=internal.localTransform.apply(new PIXI.Point(vertices[j],vertices[j+1]));b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);}
          if(b.maxX-b.minX>natural.width*4||b.maxY-b.minY>natural.height*4){b.minX=Math.max(0,b.minX);b.maxX=Math.min(natural.width,b.maxX);b.minY=Math.max(0,b.minY);b.maxY=Math.min(natural.height,b.maxY);}
          if(b.maxX>b.minX&&b.maxY>b.minY)for(const key of Object.keys(bounds))bounds[key]=key.startsWith('min')?Math.min(bounds[key],b[key]):Math.max(bounds[key],b[key]);
        }
        return bounds;};
        const bounds=measure(),transform={x:live.x,y:live.y,sx:live.scale.x,sy:live.scale.y,px:live.pivot.x,py:live.pivot.y},parameters=core.parameters.values.slice(),parts=core.parts.opacities.slice(),saved=internal.coreModel._savedParameters.slice(),restorePhysics=preserveSimulation(internal.physics),entries=[...(queue?._motions||[])].map(item=>({item,values:{...item}})),elapsed=live.elapsedTime,delta=live.deltaTime,resolution=app.renderer.resolution;
        let lastTime=0;
        const rewind=()=>{restorePhysics();entries.forEach(({item,values})=>Object.assign(item,values));live.elapsedTime=elapsed;live.deltaTime=delta;core.parameters.values.set(parameters);core.parts.opacities.set(parts);internal.coreModel._savedParameters=saved.slice();internal.coreModel.update();lastTime=0;};
        const advance=time=>{live.elapsedTime=elapsed+time*1000;api.seek(time,Math.max(0,time-lastTime));lastTime=time;};
        return {pixelYUp:false,pngSize:quality=>({...K.exportDimensions(bounds,quality),fullFrame:true}),draw(time,size,background){tools?.before();
          if(size.fullFrame&&size.tiled!==false)return K.renderTiledPNG(size,tile=>{app.renderer.resolution=1;app.renderer.resize(tile.width,tile.height);live.pivot.set(0,0);live.scale.set(size.scale);live.position.set(size.width/2-size.centerX*size.scale-tile.x,size.height/2-size.centerY*size.scale-tile.y);live.deltaTime=0;app.render();return canvas;},background);
          if(size.fullFrame){app.renderer.resolution=1;app.renderer.resize(size.width,size.height);live.pivot.set(0,0);live.scale.set(size.scale);live.position.set(size.width/2-size.centerX*size.scale,size.height/2-size.centerY*size.scale);}
          else{app.renderer.resolution=size.width/Math.max(1,canvas.clientWidth);app.renderer.resize(canvas.clientWidth,canvas.clientHeight);}
          if(time!==null)advance(time);else app.render();return canvas;
        },measure(time){tools?.before();advance(time);return measure();},rewind,dispose(){rewind();live.pivot.set(transform.px,transform.py);live.scale.set(transform.sx,transform.sy);live.position.set(transform.x,transform.y);app.renderer.resolution=resolution;app.renderer.resize(canvas.clientWidth,canvas.clientHeight);api.render(0,lastView);}};
      },
    };
    const first=animations.find(a=>/^idle/i.test(a.name))||animations[0];if(first)await api.play(first.name,true);return api;
  }catch(error){dispose();throw error;}
}
