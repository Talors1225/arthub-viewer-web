import {point} from './burst-math.js';

const quad=[0,1,2,2,3,0];
const drawable=(attachment,api)=>attachment instanceof api.RegionAttachment || attachment instanceof api.MeshAttachment;

export function spineParts(data,api){
  const indices=new Set();
  for(const skin of data.skins){
    for(const entry of skin.getAttachments()){
      if(drawable(entry.attachment,api)) indices.add(entry.slotIndex);
    }
  }
  return data.slots.filter(slot=>indices.has(slot.index)).map(slot=>({id:slot.name,name:slot.name}));
}

export function applyPartVisibility(model){
  const api=model.context.SP;
  for(const name of model.hiddenSlots){
    const slot=model.instance.findSlot(name);
    if(slot && drawable(slot.attachment,api)) slot.setAttachment(null);
  }
}

function cross(a,b,x,y){
  return (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
}

function inside(a,b,c,x,y){
  if(!a || !b || !c) return false;
  const area=cross(a,b,c[0],c[1]);
  if(Math.abs(area)<1e-5) return false;
  const sign=Math.sign(area);
  return sign*cross(a,b,x,y)>=0 && sign*cross(b,c,x,y)>=0 && sign*cross(c,a,x,y)>=0;
}

export function pickSpinePart(drawn,camera,x,y){
  for(let m=drawn.length-1;m>=0;m--){
    const {model,pose}=drawn[m];
    const api=model.context.SP;
    const modern=model.modern;
    const slots=model.instance.drawOrder;
    for(let i=slots.length-1;i>=0;i--){
      const slot=slots[i], attachment=slot.attachment;
      if(!slot.bone.active || slot.color.a*(attachment?.color?.a??1)<=.001 || !drawable(attachment,api)) continue;
      const region=attachment instanceof api.RegionAttachment;
      const vertices=new Float32Array(region ? 8 : attachment.worldVerticesLength);
      if(region) attachment.computeWorldVertices(modern ? slot : slot.bone,vertices,0,2);
      else attachment.computeWorldVertices(slot,0,vertices.length,vertices,0,2);
      const screen=[];
      for(let j=0;j<vertices.length;j+=2){
        const vx=vertices[j], vy=vertices[j+1];
        screen.push(modern ? camera.project(point(pose,[vx,vy,0])) : [vx,vy]);
      }
      const triangles=region ? quad : attachment.triangles;
      for(let j=0;j<triangles.length;j+=3){
        if(inside(screen[triangles[j]],screen[triangles[j+1]],screen[triangles[j+2]],x,y)){
          return {layer:model.id,id:slot.data.name};
        }
      }
    }
  }
  return null;
}

export function mountBurstParts(Kit,viewer,{pause,redraw,onOpen}){
  const $=id=>document.getElementById(id);
  const layers=viewer.partLayers.filter(layer=>layer.parts.length);
  if(!layers.length) return null;
  const toolbar=$('parts');
  const panel=$('parts-panel');
  const layerSelect=$('parts-layer');
  const banner=$('parts-pick-banner');
  const pickedLabel=$('parts-picked');
  const hidePicked=$('parts-hide-picked');
  let picking=false, selected=null;

  for(const layer of layers){
    const option=document.createElement('option');
    option.value=layer.key;
    option.textContent=layer.label;
    layerSelect.append(option);
  }
  $('parts-layer-row').hidden=layers.length<2;
  const controller=Kit.mountPartsPanel({
    listEl:$('parts-list'),filterEl:$('parts-search'),
    allEl:$('parts-all'),noneEl:$('parts-none'),invEl:$('parts-invert'),
    getTargets:()=>layers.map(layer=>({...layer,active:layer.key===layerSelect.value})),
    onChange:redraw,
    onRefresh(){
      const count=layers.reduce((sum,layer)=>sum+layer.hidden.size,0);
      $('parts-hidden-count').textContent=count ? '已隐藏 '+count : '';
      hidePicked.disabled=!selected || layers.find(layer=>layer.key===layerSelect.value).hidden.has(selected);
    },
  });

  function open(visible){
    picking=false;
    panel.hidden=!visible;
    banner.hidden=true;
    toolbar.setAttribute('aria-expanded',String(visible));
    if(visible){onOpen();controller.refresh();}
    else Kit.hideMenu();
  }
  toolbar.disabled=false;
  toolbar.onclick=()=>open(panel.hidden);
  $('parts-close').onclick=()=>{open(false);toolbar.focus();};
  layerSelect.onchange=()=>{
    selected=null;
    pickedLabel.textContent='';
    $('parts-search').value='';
    $('parts-list').scrollTop=0;
    controller.refresh();
  };
  hidePicked.onclick=()=>{if(selected) controller.hide(selected);};
  $('parts-pick').onclick=()=>{
    pause();
    Kit.hideMenu();
    picking=true;
    panel.hidden=true;
    toolbar.setAttribute('aria-expanded','false');
    $('parts-pick-text').textContent='点一下画面中的部件';
    banner.hidden=false;
  };
  $('parts-pick-cancel').onclick=()=>open(true);
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape') return;
    if(picking) open(true);
    else if(!panel.hidden){open(false);toolbar.focus();}
  });
  return {
    close(){if(picking || !panel.hidden) open(false);},
    canvasClick(event){
      if(!picking) return false;
      const hit=viewer.pickPart(event.clientX,event.clientY);
      if(!hit){
        $('parts-pick-text').textContent='这里没有可选部件，试着点一下角色';
        return true;
      }
      layerSelect.value=hit.layer;
      selected=hit.id;
      pickedLabel.textContent='已选中 '+selected;
      open(true);
      controller.focus(selected);
      return true;
    },
  };
}
