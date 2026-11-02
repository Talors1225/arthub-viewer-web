// Ported from the installed game's SpineInteractive and SoundManager Lua.
// Configuration and collider polygons are exported without executing the Lua.
export function skinId(model){return /^spine_([12]\d{6})(?:_|$)/.exec(model.skinKey)?.[1]||'0';}
export function voiceRoute(role,skin,form,id,special={},locale='default',variant=''){
 role=String(role);skin=String(skin);id=String(id);let path=role,name=id;
 if(role==='10024')path=['0','1002404'].includes(skin)?role:['1002401','1002402'].includes(skin)?'1002401':'1002403';
 if(role==='10041'&&skin==='1004102')path=skin;
 if(role==='10048'&&skin==='1004802')path=skin;
 if(role==='10066'&&skin==='1006602')path=skin;
 if(['10050','10067'].includes(role)&&locale==='ko')path=role+'_ko';
 if(role==='10065'&&locale==='chs')path=role+'_chs';
 if(role==='10044'&&variant==='new')path=role+'_new';
 if(role==='10057')path=skin==='1005702'?'1005703':form===0?'1005701':'1005702';
 const cfg=special[role]||{};
 if(role==='10012'&&form===1&&cfg.modelDef?.[id])name+='_1';
 if(role==='10024'&&cfg.callDef?.[skin]?.[id])name+=form===2?'_father':'_mother';
 if(role==='10035'&&cfg.skinDef?.[skin]?.[id])name+='_limbo';
 if(role==='10041'&&!cfg.ignoreSkinDef?.[skin]&&cfg.geminiDef?.[id]&&form===4)name+='_white';
 return {group:'audios_'+path,id:name};
}
export function subtitleKey(role,skin,form,id,special={}){
 role=String(role);skin=String(skin);const cfg=special[role]||{};let key='sound_content_'+role+'_'+id;
 if(role==='10012'&&form===1&&cfg.modelDef?.[id])key+='_1';
 if(role==='10024')key+=['_loli','_girl','_lady'][['0','1002404'].includes(skin)?0:['1002401','1002402'].includes(skin)?1:2]+(cfg.callDef?.[skin]?.[id]?(form===2?'_father':'_mother'):'_normal');
 if(role==='10035'&&cfg.skinDef?.[skin]?.[id])key+='_limbo';
 if(['10041','10048','10066'].includes(role)&&['1004102','1004802','1006602'].includes(skin))key='sound_content_'+skin+'_'+id;
 if(role==='10057')key=skin==='1005702'?'sound_content_'+skin+'_'+id:key+(form===0?'_Yayoi':'_Hatsubaki');
 return key;
}
export function loginSound(skin,date=new Date()){
 const day=(date.getMonth()+1)+'-'+date.getDate(),fixed={'1-1':'6002','2-14':'6003','4-1':'6004','10-31':'6007','12-25':'6008'};
 if(fixed[day])return fixed[day];
 if(date.getFullYear()===2025){if(day==='8-29')return '6005';if(day==='10-6')return '6006';}
 else {const lunar=new Intl.DateTimeFormat('en-u-ca-chinese',{month:'numeric',day:'numeric'}).formatToParts(date),month=lunar.find(p=>p.type==='month')?.value,day=lunar.find(p=>p.type==='day')?.value;if(month==='7'&&day==='7')return '6005';if(month==='8'&&day==='15')return '6006';}
 return ['0','1002401','1002403','1003502','1004102','1004802','1005702'].includes(String(skin))?'5002':'5003';
}
export function inside(point,polygon){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
// These skins dispatch to separate game controllers / minigames rather than the
// generic configuration. Their ordinary dialogue works; their special hotspots
// remain inactive until those controllers are ported.
export const customSkins=new Set(['1005002','1004404','1004104','1005003','1001604','1001505','1003505','1003406','1001105','1005103','1006502','1006603','1006702']);
export function createInteraction({model,engine,geometry,config,play,stop,enabled,notify,form}){
 const skin=skinId(model),rows=config.configs[skin]||config.configs[model.roleId]||[];
 // A single ArtHub item is one skeleton. Never apply a sibling binder's action.
 const skeletonNames=new Set(geometry.binders.filter(b=>b.skeleton&&model.path.split('/').pop().replace(/\.json$/,'').toLowerCase()===b.skeleton.replace(/_SkeletonData$/,'').toLowerCase()).map(b=>b.skeleton));
 const hotspots=geometry.hotspots.filter(h=>!skeletonNames.size||skeletonNames.has(h.skeleton));
 const row=rows.find(r=>r.binder==='skeleton'||!r.binder)||rows[0]||{};
 let sequence=0,level=null,resetAt=0,action=null,disposed=false;
 const normal=model.initialSkin||'Normal';
 function reset(){level=null;resetAt=0;engine.expression(normal);}
 function say(id,subtitle=true){const duration=play(String(id),subtitle);if(duration){resetAt=performance.now()+(duration+1)*1000;return true;}return false;}
 return {
  login(){if(!disposed&&enabled()&&say(loginSound(skin)))level='expression';},
  tap(event){
   if(disposed||!enabled())return;
   const point=engine.interactionPoint(event.clientX,event.clientY);
   const hit=engine.interactionPolygons(hotspots).find(h=>h.paths.some(p=>inside(point,p)));
   if(!hit&&!engine.interactionContains(point))return;
   if(level==='expression'){stop();reset();return;}
   if(level==='action'){stop();return;}
   const part=hit?.part||'other';
   if(hit&&(customSkins.has(skin)||['mechanism','mechanism2','ext1','ext2'].includes(part)||(model.roleId==='10057'&&part==='chest'))){notify('该皮肤的专用互动尚未接入；可在声音面板试听台词。');return;}
   if(part==='other'){
    const ids=skin==='1004203'?['5005','5006']:['5004','5005','5006'];const id=ids[sequence++%ids.length];
    let face=row['enter_'+id];if(skin==='1001203'&&face&&face!=='Normal')face=(engine.playback().name.includes('HEI')?'HEI/':'BAI/')+face;
    if(face)engine.expression(face);if(say(id))level='expression';else reset();
   }else{
    let cfg=row[part];if(!cfg?.anim)return;
    const current=engine.playback().name;
    const when=(Array.isArray(cfg.when)?cfg.when:Object.values(cfg.when||{})).find(w=>w.cur===current);if(when)cfg={...cfg,...when};
    const stage=/^(\d+)\//.exec(current)?.[0]||'',name=stage+cfg.anim,back=stage+(cfg.back||'Idle');
    if(!engine.playOnce(name,back)){notify('当前立绘中未找到该热点的动作。');return;}
    if(cfg.sound)say(cfg.sound,cfg.subtitle===1);
    if(name!==back){level='action';action=name;}else {level=null;action=null;}
   }
  },
  tick(){if(disposed)return;if(level==='expression'&&performance.now()>=resetAt)reset();if(level==='action'&&engine.playback().name!==action){level=null;action=null;}},
  cancel(){stop();reset();},
  dispose(){disposed=true;stop();},
  get limited(){return customSkins.has(skin);},
 };
}
