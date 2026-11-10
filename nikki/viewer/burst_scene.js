import {clamp,rotate,point,mulRotation} from './burst-math.js';
import {makePostProcess,loadImage} from './burst-post.js?v=20261109-skill-background';
import {compileTimeline,clockAt} from './timelines.js';
import {createParticles} from './burst_particles.js';
import {spineParts,applyPartVisibility,pickSpinePart} from './burst-parts.js';

const corners = [[0,0],[1,0],[1,1],[0,1]];
const quad = [0,1,2,2,3,0];
const identity = [0,0,0,1];
const white = [1,1,1,1];
const multiply=(a,b)=>a.map((x,i)=>x*b[i]);
const pathURL=(path,base)=>new URL(path.split('/').map(encodeURIComponent).join('/'),base).href;

async function parallel(items, width, run) {
  const out=new Array(items.length);
  let next=0;
  await Promise.all(Array.from({length:Math.min(width,items.length)},async()=>{
    for(let i=next++;i<items.length;i=next++) out[i]=await run(items[i],i);
  }));
  return out;
}

function selectedCamera(scene,poses,height) {
  const camera=scene.cameras.find(c=>c.enabled && poses.get(c.node)?.active);
  const transform=camera && poses.get(camera.node);
  const rotation=transform?.rotation || identity;
  const inverse=[-rotation[0],-rotation[1],-rotation[2],rotation[3]];
  const position=transform?.position || scene.camera.position;
  const fov=clamp(transform?.edit.fov?.[0] ?? camera?.fov ?? scene.camera.fov,1,175);
  const focal=height*.5/Math.tan(fov*Math.PI/360);
  const ortho=transform?.edit.orthoSize?.[0] ?? camera?.orthoSize;
  const near=camera?.near ?? scene.camera.near;
  const far=camera?.far ?? scene.camera.far;
  function project(world) {
    const p=rotate(world.map((x,i)=>x-position[i]),inverse);
    if(p[2]<near || p[2]>far) return null;
    const scale=ortho ? height/(2*ortho) : focal/p[2];
    return [p[0]*scale,p[1]*scale,scale,p[2]];
  }
  function depth(world) {
    return rotate(world.map((x,i)=>x-position[i]),inverse)[2];
  }
  return {project,depth,rotation};
}

function shade(material, tint, pose) {
  const edit=pose.edit;
  const c=edit.matColor ? material.tint.map((x,i)=>edit.matColor[i]??x) : material.tint;
  const intensity=clamp(edit.intensity?.[0] ?? material.intensity ?? 1,0,32);
  const alpha=edit.alpha?.[0] ?? 1;
  return multiply(tint,c).map((x,i)=>i===3?clamp(x*alpha):Math.max(0,x*intensity));
}

function uvStyle(material, pose) {
  const transform=material.uvTransform || [1,1,0,0];
  return transform.map((value,index)=>pose.edit.uvTransform?.[index] ?? value);
}

function backdrop(source, nodes) {
  if(source.role!=='background') return false;
  const node=nodes[source.node];
  if(/(?:^|[\W_])(?:front|foreground|fg)(?:[\W_]|$)/i.test(node.path)) return false;
  if(source.kind==='SpriteRenderer') return true;
  return /(?:^|[\W_])(?:bg|background|sky|backdrop)(?:[\W_]|$)/i.test(node.name)
    || /\/bg_root\/[^/]+(?:_bg_|_background_)/i.test(node.path);
}

export async function createBurst(canvas,scene,base,onProgress=()=>{},asset=(path)=>pathURL(path,base),signal) {
  const Kit=window.SpineKit;
  if(!Kit.spineNS['4.1']) Kit.captureSpine('4.1');
  const SP=Kit.getSpine('4.1');
  const baseGL=Kit.createGL(canvas,SP);
  if(!baseGL) throw new Error('浏览器无法启动 WebGL');
  const gl=baseGL.mgl.gl;
  const contexts=new Map([['4.1',{...baseGL,SP}]]);
  const runtime=async version=>{
    const key=String(version).match(/^4\.[012]/)?.[0] || '4.1';
    if(!contexts.has(key)){
      const api=await Kit.ensureSpine(version,'vendor/');
      const setup=Kit.createGL(canvas,api);
      if(!setup) throw new Error('Spine 运行库无法创建舞台');
      contexts.set(key,{...setup,SP:api});
    }
    return contexts.get(key);
  };
  const failedModels=[];
  const models=[];
  for(const model of scene.models) {
    try {
      const context=await runtime(model.version);
      const api=context.SP;
      const files=await Kit.loadSpineFiles(api,context.mgl,{
        atlasURL:asset(model.atlas),skeletonURL:asset(model.skel),
        atlasPageURL:page=>asset(model.atlas.slice(0,model.atlas.lastIndexOf('/')+1)+page),signal,
      });
      const loader=new api.AtlasAttachmentLoader(files.atlas);
      const parser=model.format==='json' ? new api.SkeletonJson(loader) : new api.SkeletonBinary(loader);
      parser.scale=model.scale||.01;
      const data=model.format==='json' ? parser.readSkeletonData(JSON.parse(new TextDecoder().decode(files.bytes)))
        : parser.readSkeletonData(files.bytes);
      const instance=new api.Skeleton(data);
      const skin=model.skin && data.findSkin(model.skin);
      if(skin) instance.setSkin(skin);
      const modern=!model.version.startsWith('4.0');
      models.push({...model,context,data,instance,modern,hiddenSlots:new Set(),parts:spineParts(data,api),
        pma:!!files.atlas.pages[0]?.pma});
    }catch(error){
      if(signal?.aborted) throw signal.reason;
      failedModels.push({name:model.name,message:error.message});
    }
  }
  if(!models.length) throw new Error(failedModels[0]?.message || '原包无可读取的 Spine');
  const needed=[...new Set(scene.renderers.flatMap(r=>[r.sprite,...r.materials.map(m=>m.texture)]).filter(Boolean))];
  const failedTextures=[];
  let loaded=0;
  const pairs=await parallel(needed,5,async file=>{
    try {
      const image=await (async()=>{
        if(!signal) return loadImage(asset(file));
        const response=await fetch(asset(file),{signal});
        if(!response.ok) throw new Error('读取贴图失败 ('+response.status+')');
        const local=URL.createObjectURL(await response.blob());
        try{return await loadImage(local);}finally{URL.revokeObjectURL(local);}
      })();
      const texture=new SP.GLTexture(baseGL.mgl,image);
      return [file,{texture,size:[image.naturalWidth,image.naturalHeight]}];
    }catch(error){
      failedTextures.push(file);
      return [file,null];
    }finally{
      onProgress(++loaded,needed.length);
    }
  });
  if(signal?.aborted) throw signal.reason;
  const textures=new Map(pairs);
  const unit=document.createElement('canvas');
  unit.width=unit.height=1;
  const ctx=unit.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,1,1);
  const solid={texture:new SP.GLTexture(baseGL.mgl,unit),size:[1,1]};
  const timeline=compileTimeline(scene);
  const backgrounds=new Set(scene.renderers.filter(r=>backdrop(r,scene.nodes)));
  const particles=createParticles(scene,timeline);
  const post=makePostProcess(gl,scene.camera.post);
  const buffer=new Float32Array(48);
  let width=0,height=0,currentRenderer=null;

  function resize(frame) {
    const dpr=Math.min(window.devicePixelRatio||1,1.5);
    const w=frame?.width ?? Math.max(2,Math.round(canvas.clientWidth*dpr));
    const h=frame?.height ?? Math.max(2,Math.round(canvas.clientHeight*dpr));
    if(w===width && h===height) return;
    width=canvas.width=w;height=canvas.height=h;
    for(const context of contexts.values()) context.renderer.camera.setViewport(width,height);
  }
  function begin(renderer) {
    if(currentRenderer!==renderer) {
      currentRenderer?.end();
      currentRenderer=renderer;
      renderer.begin();
    }
    return renderer.batcher;
  }
  function blendMode(batcher, material) {
    const blend=material.blend;
    const mode=blend.startsWith('add')?1:blend==='multiply'?2:blend==='screen'?3:0;
    batcher.setBlendMode(mode,blend==='pma'||blend==='add-pma');
  }
  function drawQuad(piece,camera) {
    const {source,pose}=piece;
    const material=source.materials[piece.trail?1:0] || source.materials[0];
    const file=piece.texture || material.texture;
    const tex=file ? textures.get(file) : solid;
    if(!tex) return false;
    const c=shade(material,piece.color,pose);
    if(c[3]<=1e-4) return false;
    const [u0,v0,u1,v1]=piece.uv;
    const [sx,sy,ox,oy]=uvStyle(material,pose);
    const insetX=.5/tex.size[0],insetY=.5/tex.size[1];
    const px=piece.pivot?.[0]||0,py=piece.pivot?.[1]||0;
    for(let i=0;i<4;i++){
      const [x,y]=corners[i];
      const offset=rotate([(x-.5+px)*piece.width,(y-.5+py)*piece.height,0],piece.rotation);
      const projected=camera.project(piece.position.map((v,j)=>v+offset[j]));
      if(!projected) return false;
      const u=(x?u1-insetX:u0+insetX)*sx+ox;
      const v=(y?v0+insetY:v1-insetY)*sy-oy;
      buffer.set([projected[0],projected[1],...c,u,v,0,0,0,0],i*12);
    }
    const batcher=begin(baseGL.renderer);
    blendMode(batcher,material);
    batcher.draw(tex.texture,buffer,quad);
    return true;
  }
  function drawMesh(entry,camera) {
    const {source,pose,particle}=entry,mesh=source.mesh;
    if(!mesh) return false;
    const transformed=mesh.vertices.map(vertex=>{
      const world=particle ? rotate([vertex[0]*particle.width,vertex[1]*particle.height,vertex[2]*particle.width],
        particle.rotation).map((x,i)=>x+particle.position[i]) : point(pose,vertex);
      return camera.project(world);
    });
    const batcher=begin(baseGL.renderer);
    let drawn=false;
    for(let group=0;group<mesh.indices.length;group++) {
      const material=source.materials[group]||source.materials[0];
      const tex=material.texture?textures.get(material.texture):solid;
      const color=shade(material,particle?.color||white,pose);
      if(!tex || color[3]<=1e-4) continue;
      const [sx,sy,ox,oy]=uvStyle(material,pose);
      const uv=particle?.uv || [0,0,1,1];
      const triangles=mesh.indices[group];
      blendMode(batcher,material);
      const vertices=[],indices=[];
      const flush=()=>{
        if(!indices.length) return;
        batcher.draw(tex.texture,new Float32Array(vertices),indices);
        vertices.length=0;indices.length=0;drawn=true;
      };
      for(let i=0;i<triangles.length;i+=3){
        const ids=triangles.slice(i,i+3);
        if(ids.length!==3 || ids.some(id=>!transformed[id])) continue;
        for(const id of ids){
          const [x,y]=transformed[id],xy=mesh.uv[id]||[0,0];
          const u=uv[0]+(xy[0]*sx+ox)*(uv[2]-uv[0]);
          const v=uv[1]+(1-xy[1]*sy-oy)*(uv[3]-uv[1]);
          indices.push(vertices.length/12);
          vertices.push(x,y,...color,u,v,0,0,0,0);
        }
        if(indices.length>=1500) flush();
      }
      flush();
    }
    return drawn;
  }
  function drawSpine(entry,time,camera) {
    const {model,pose}=entry,context=model.context;
    const skeleton=model.instance;
    const c=timeline.spineClip(model,time);
    const name=c?.animation||model.defaultAnimation;
    const animation=name ? model.data.findAnimation(name) : null;
    if(!animation && timeline.hasSpineTrack(model.node) && !model.defaultAnimation) return false;
    const center=camera.project(pose.position);
    if(!center) return false;
    skeleton.setToSetupPose();
    skeleton.x=0;skeleton.y=0;skeleton.scaleX=1;skeleton.scaleY=1;
    if(animation){
      animation.apply(skeleton,-1,c?clockAt(c,time):time-pose.activatedAt,
        c?c.loop:model.loop,null,c?.alpha??1,0,0);
    }
    const modern=model.modern;
    if(!modern){
      skeleton.x=center[0];skeleton.y=center[1];skeleton.scaleX=center[2]*pose.scale[0];skeleton.scaleY=center[2]*pose.scale[1];
    }
    Kit.updateWorldTransform(skeleton,context.SP.Physics?.update);
    applyPartVisibility(model);
    begin(context.renderer);
    context.renderer.drawSkeleton(skeleton,model.pma,-1,-1,modern?(vertices,count,stride)=>{
      for(let i=0;i<count;i+=stride){
        const projected=camera.project(point(pose,[vertices[i],vertices[i+1],0]));
        if(projected){vertices[i]=projected[0];vertices[i+1]=projected[1];}
      }
    }:null);
    return true;
  }
  const drawnSpines=[];
  let frameCamera;
  const partLayers=models.map((model,i)=>{
    const name=scene.nodes[model.node]?.name || model.name;
    const label=models.length===1 ? model.name : '图层 '+(i+1)+' · '+name;
    return {key:model.id,label,hidden:model.hiddenSlots,parts:model.parts};
  });
  function pickPart(clientX,clientY){
    const rect=canvas.getBoundingClientRect();
    if(!rect.width || !rect.height || !frameCamera) return null;
    const x=(clientX-rect.left)/rect.width*width-width/2;
    const y=height/2-(clientY-rect.top)/rect.height*height;
    return pickSpinePart(drawnSpines,frameCamera,x,y);
  }
  function backdropItems(queue,extraBranch){
    const leaf=/(?:^|[\/_\s])(?:bg|background|backdrop)(?:[_\/\s.]|$)/i;
    const foreground=/(?:^|[\/_\s])(?:fg|front|foreground|flash|fadeout)(?:[_\/\s.]|$)|blend_white/i;
    const path=item=>scene.nodes[item.model?.node||item.source.node].path;
    const independent=item=>{
      const nodePath=path(item);
      if(foreground.test(nodePath)) return false;
      if(item.model) return leaf.test(item.model.name) || (/\/bg_root\//i.test(nodePath) && !/\/cha_root\//i.test(nodePath));
      return item.source.role==='background' || Boolean(extraBranch && nodePath.startsWith(extraBranch));
    };
    const named=queue.filter(independent);
    if(named.length) return named;
    const character=queue.findIndex(item=>item.model && !independent(item));
    if(character<0) return [];
    // When node names omit the role, use only layers actually drawn behind the first character.
    return queue.slice(0,character).filter(item=>!item.model && !foreground.test(path(item))
      && !/\/(?:cha_root|screen_root)\//i.test(path(item)));
  }
  function render(time, includeSpine=true, includeFx=true, backdropOnly=false, frame, extraBranch) {
    resize(frame);
    const t=clamp(time,0,scene.duration-1e-6);
    const poses=timeline.sampleScene(t);
    const camera=selectedCamera(scene,poses,height);
    frameCamera=camera;
    drawnSpines.length=0;
    const queue=[];
    for(const model of includeSpine ? models : []) {
      const pose=poses.get(model.node);
      if(pose?.active && (pose.edit.enabled?.[0]??model.enabled))
        queue.push({model,pose,position:pose.position,order:model.order,layer:model.layer});
    }
    for(const source of includeFx ? scene.renderers : []){
      const pose=poses.get(source.node);
      if(!pose?.active || !(pose.edit.enabled?.[0]??source.enabled)) continue;
      const common={source,pose,order:source.order,layer:source.layer,backdrop:backgrounds.has(source)};
      if(source.particle){
        for(const particle of particles.sample(source,t,pose,camera.rotation)){
          if(source.mesh&&!particle.trail) queue.push({...common,particle,position:particle.position});
          else queue.push({...common,...particle,pivot:source.pivot});
        }
      }else if(source.mesh){
        queue.push({...common,position:pose.position});
      }else if(source.size){
        const spriteColor=source.color||white;
        const c=pose.edit.color?spriteColor.map((x,i)=>pose.edit.color[i]??x):spriteColor;
        const uv=source.flip?.[0]?[1,0,0,1]:[0,0,1,1];
        if(source.flip?.[1]) [uv[1],uv[3]]=[1,0];
        queue.push({...common,position:pose.position,rotation:pose.rotation,color:c,uv,
          pivot:source.pivot?.map(x=>.5-x),width:source.size[0]*pose.scale[0],height:source.size[1]*pose.scale[1],
          texture:source.sprite});
      }
    }
    for(const item of queue) item.depth=camera.depth(item.position);
    queue.sort((a,b)=>Number(!!b.backdrop)-Number(!!a.backdrop) || a.layer-b.layer || a.order-b.order || b.depth-a.depth);
    post.start(width,height,backdropOnly);
    const counts={spine:0,background:0,effect:0,nodes:[]};
    for(const item of backdropOnly ? backdropItems(queue,extraBranch) : queue){
      let drawn;
      if(item.model) drawn=drawSpine(item,t,camera);
      else if(item.source.mesh && !item.trail) drawn=drawMesh(item,camera);
      else drawn=drawQuad(item,camera);
      if(drawn) {
        if(item.model) drawnSpines.push(item);
        counts[backdropOnly?'background':item.model?'spine':item.source.role]++;
        counts.nodes.push(scene.nodes[item.model?.node || item.source.node]?.name);
      }
    }
    currentRenderer?.end();
    currentRenderer=null;
    post.end(backdropOnly);
    return counts;
  }
  function bindPartState(hidden){
    return models.map((model,i)=>{
      model.hiddenSlots=hidden; partLayers[i].hidden=hidden;
      return {skeleton:model.instance,hiddenSlots:hidden,data:{slots:model.parts}};
    });
  }
  return {render,renderBackdrop:(time,frame,extraBranch)=>render(time,true,true,true,frame,extraBranch),timeline,failedModels,failedTextures,partLayers,pickPart,bindPartState};
}
