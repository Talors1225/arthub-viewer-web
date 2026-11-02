import {skinId,voiceRoute,subtitleKey,createInteraction} from './interaction.mjs?v=20261102-riichi-r2-1';

export function createVoicePanel(assetBase){
 const $=id=>document.getElementById(id),audio=$('riichiVoiceAudio'),groups=$('voiceGroup'),voices=$('voiceSelect'),message=$('voiceStatus'),search=$('voiceSearch'),bubble=$('riichiSubtitle'),toggle=$('voiceInteractive'),volume=$('voiceVolume');
 let epoch=0,playEpoch=0,controller=null,model=null,data=null,clips=[],interaction=null,config=null,engine=null,visible=false;
 const cache=new Map(),locales={default:'默认',chs:'中文',ko:'韩语',jp:'日语',en:'英语'};
 let configPromise;
 try{toggle.checked=localStorage.getItem('riichi-interaction')!=='off';volume.value=localStorage.getItem('riichi-volume')||'80';}catch{}
 const stop=()=>{++playEpoch;audio.pause();audio.removeAttribute('src');audio.load();bubble.hidden=true;bubble.textContent='';};
 function form(){return Number($('voiceForm').value);}
 function current(){return clips.find(c=>c.id===voices.value);}
 function playClip(clip,subtitle='',label=clip?.label){
  if(!clip)return 0;stop();const ticket=playEpoch,modelEpoch=epoch;
  audio.src=clip.url;audio.volume=Number(volume.value)/100;
  message.textContent='正在播放：'+(label||clip.id);
  if(subtitle){bubble.textContent=subtitle;bubble.hidden=false;}
  audio.play().catch(error=>{if(ticket===playEpoch&&modelEpoch===epoch){bubble.hidden=true;message.textContent=error.name==='NotAllowedError'?'点击立绘即可开始语音互动。':'播放失败：'+error.message;}});
  return clip.duration;
 }
 function eventVoice(id,subtitle=true){
  if(!data||!toggle.checked||!visible||document.hidden)return 0;
  const selected=data.groups.find(g=>g.id===groups.value),skin=skinId(model);
  const route=voiceRoute(model.roleId,skin,form(),id,config.specialSound,selected?.locale,selected?.variant);
  const clip=data.groups.find(g=>g.id===route.group)?.clips.find(c=>c.id===route.id);
  if(!clip){message.textContent='当前导出资源缺少这句互动语音：'+route.id;return 0;}
  const text=subtitle?config.subtitles[subtitleKey(model.roleId,skin,form(),id,config.specialSound)]||'':'';
  return playClip(clip,text,clip.label);
 }
 function renderClips(){
  interaction?.cancel();const group=data?.groups.find(g=>g.id===groups.value),q=search.value.trim().toLocaleLowerCase();
  clips=(group?.clips||[]).filter(c=>!q||(c.id+' '+c.label).toLocaleLowerCase().includes(q)).slice().sort((a,b)=>Number(a.label.startsWith('语音 '))-Number(b.label.startsWith('语音 '))||a.id.localeCompare(b.id,undefined,{numeric:true}));
  voices.replaceChildren(...clips.map(c=>new Option(c.label+(c.label.startsWith('语音 ')?'':' · '+c.id)+' · '+c.duration.toFixed(1)+'s',c.id)));
  if(clips.some(c=>c.id==='5002'))voices.value='5002';
  $('voicePlay').disabled=!clips.length;$('voiceStop').disabled=!clips.length;
  message.textContent=clips.length?clips.length+' 条语音 · 点击立绘可触发互动':'没有匹配的语音';
 }
 groups.onchange=renderClips;search.oninput=renderClips;
 $('voicePlay').onclick=()=>{interaction?.cancel();const clip=current();if(clip)playClip(clip);};
 $('voiceStop').onclick=()=>{interaction?.cancel();stop();message.textContent='已停止播放';};
 volume.oninput=()=>{audio.volume=Number(volume.value)/100;try{localStorage.setItem('riichi-volume',volume.value);}catch{}};
 toggle.onchange=()=>{if(!toggle.checked)interaction?.cancel();try{localStorage.setItem('riichi-interaction',toggle.checked?'on':'off');}catch{}};
 $('voiceForm').onchange=()=>interaction?.cancel();
 audio.onended=()=>{bubble.hidden=true;message.textContent='播放结束';};
 audio.onerror=()=>{if(audio.getAttribute('src')){bubble.hidden=true;message.textContent='语音文件无法播放，请选择其他语音';}};
 voices.onchange=()=>{interaction?.cancel();stop();message.textContent='已选择：'+(current()?.label||'');};
 const suspend=()=>interaction?.cancel();
 document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
 window.addEventListener('pagehide',()=>{controller?.abort();interaction?.dispose();stop();});
 async function json(url,signal){const response=await fetch(url,{signal});if(!response.ok)throw Error('互动资源读取失败（'+response.status+'）');return response.json();}
 return {
  get enabled(){return toggle.checked;},set enabled(value){toggle.checked=!!value;toggle.onchange();},
  get volume(){return Number(volume.value)/100;},set volume(value){volume.value=String(Math.round(Math.max(0,Math.min(1,value))*100));volume.oninput();},
  beforeLoad(){++epoch;controller?.abort();interaction?.dispose();interaction=null;stop();},
  setVisible(value){visible=!!value;if(!visible)suspend();},
  suspend,tap(event){interaction?.tap(event);},tick(){interaction?.tick();},
  async setModel(next,runtime,greeting=false){
   const ticket=++epoch;controller?.abort();controller=new AbortController();interaction?.dispose();interaction=null;stop();model=next;engine=runtime;data=null;clips=[];
   groups.replaceChildren();voices.replaceChildren();search.value='';$('voicePlay').disabled=$('voiceStop').disabled=true;message.textContent='正在读取角色语音与互动配置…';
   const options={'10012':[['0','白天'],['1','黑夜']],'10024':[['2','爸爸'],['3','妈妈']],'10041':[['0','黑子'],['4','白子']],'10057':[['0','弥霄'],['1','初椿']]};
   $('voiceFormRow').hidden=!options[model.roleId];$('voiceForm').replaceChildren(...(options[model.roleId]||[['0','默认']]).map(([id,label])=>new Option(label,id)));
   if(model.roleId==='10041'&&/baizi/i.test(model.path))$('voiceForm').value='4';
   if(model.roleId==='10012'&&/_1$/.test(model.skinKey))$('voiceForm').value='1';
   try{
    const signal=controller.signal;
    configPromise||=json(assetBase+'interaction/config.json').catch(error=>{configPromise=null;throw error;});
    const [roleData,interactionConfig,geometry]=await Promise.all([cache.has(model.roleId)?cache.get(model.roleId):json(assetBase+'audio/index/roles/'+encodeURIComponent(model.roleId)+'.json',signal),configPromise,json(assetBase+'interaction/models/'+encodeURIComponent(model.id)+'.json',signal)]);
    if(ticket!==epoch)return;data=roleData;cache.set(model.roleId,data);config=interactionConfig;
    const skin=skinId(model),ids=new Set();
    for(const f of [0,1,2,3,4])for(const locale of ['default','chs','ko'])for(const variant of ['','new'])ids.add(voiceRoute(model.roleId,skin,f,'5004',config.specialSound,locale,variant).group);
    const preferred=voiceRoute(model.roleId,skin,form(),'5004',config.specialSound).group;
    const available=data.groups.filter(g=>g.clips.length&&ids.has(g.id)).sort((a,b)=>Number(b.id===preferred)-Number(a.id===preferred)||a.id.localeCompare(b.id));
    groups.replaceChildren(...available.map(g=>new Option((g.skinId?'当前皮肤语音':'角色语音')+' · '+(locales[g.locale]||g.locale)+(g.variant==='new'?' · 新版':''),g.id)));
    $('voiceScope').textContent=available.some(g=>g.skinId)?'已按游戏规则匹配皮肤与角色语音。':'已匹配角色语音。';
    if(!available.length){message.textContent='该角色暂无可播放语音';return;}renderClips();
    interaction=createInteraction({model,engine,geometry,config,play:eventVoice,stop,enabled:()=>toggle.checked,notify:text=>window.SpineKit.toast(text),form});
    $('voiceScope').textContent+=' 普通点击依次播放互动台词；播放中点击可停止。'+(interaction.limited?' 此皮肤的专用互动仍待适配。':geometry.hotspots.length?' 已接入游戏热点动作。':'');
    if(greeting&&visible&&!document.hidden)interaction.login();
   }catch(error){if(ticket===epoch&&error.name!=='AbortError')message.textContent=error.message;}
  }
 };
}
