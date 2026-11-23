import {clamp} from './burst-math.js';
import {createBurst} from './burst_scene.js?v=skill-stage3';
import {clockAt} from './timelines.js';

// Last visible composition before the closing flash on the authored timeline.
const endingBackdrops = {
  'core-25956': { frame: 129 },
  'core-26015': { frame: 214, branch: 'c195_00_cut_scene/root/fx_root/back_loop/' },
  'core-26115': { frame: 223 },
};

// These are outputs of the existing ending-frame and pillarbox probes, in native timeline seconds.
const reviewedIdle = {
  'core-25937': {model:'catalog-c010_00_skillcut', animation:'Idle', digest:'d7dacba7a963458cfcc48a92d41776cafb44ac5ec5beb1bd78d47a2889a26568', aspect:.9690207913030021, time:1.7966666269302367},
  'core-25970': {model:'c090_00_skillcut', digest:'a9f0d343ca7019f07ec7082afcddae23888d0138792380cf57c76b6fabe7fcc9', aspect:1, time:1.7966666269302367},
  'core-26002': {model:'c170_00_skillcut', digest:'54f275f954850685aa4aa58c00e7d92258ed26947ba4727676fb448fbb2c7de7', aspect:.8700517031025963, time:1.6466666507720946},
  'core-26021': {model:'c210_00_skillcut', digest:'48495300f8e58b6e53253a45f5352c63e625eab3090c6373ed32d01ed11e7068', aspect:.824638087994336, time:2.2133332538604735},
};

function findEndingTime(scene) {
  const fps = scene.fps || 60;
  const master = (scene.timelines || []).find(t => t.id === scene.master) || scene.timelines?.[0];
  if (!master) return Math.max(0.15, (scene.duration || 1) - 0.25);
  const mode0 = (master.fades || []).filter(f => f.mode === 0);
  const mode0End = mode0.length ? Math.max(...mode0.map(f => (f.start || 0) + (f.duration || 0))) : null;
  const spineEnd = master.spine?.length ? Math.max(...master.spine.map(s => (s.start || 0) + (s.duration || 0))) : null;
  let tEnd = (mode0End && spineEnd) ? Math.min(mode0End, spineEnd) : (mode0End ?? spineEnd ?? Math.max(0.2, (scene.duration || 1) - 0.22));
  tEnd = Math.min(tEnd, (scene.duration || tEnd) - 1 / fps);
  let tFlash = null;
  for (const c of (master.controls || [])) {
    const nm = c.name || '';
    const cEnd = (c.start || 0) + (c.duration || 0);
    if (/(?:white|black|fade|flash|blend_plane)/i.test(nm) && c.start >= tEnd - 0.65 && c.start <= tEnd + 0.05) {
      if (tFlash === null || c.start < tFlash) tFlash = c.start;
    }
    // Catch explicit closing blackout planes that start earlier (e.g. Anchor c351 fx_blend_black 2.10-2.92).
    if (/^(?:fx_)?blend(?:_plane)?_black$/i.test(nm) && cEnd >= tEnd - 0.15 && c.start >= tEnd * 0.45 && c.start <= tEnd - 0.05) {
      if (tFlash === null || c.start < tFlash) tFlash = c.start;
    }
  }
  const nodes = scene.nodes || {};
  for (const clip of (master.curves || [])) {
    for (const b of (clip.bindings || [])) {
      const nodeName = nodes[b.node]?.name || '';
      if (!/(?:white|black|fade|flash|blend)/i.test(nodeName)) continue;
      if ((b.prop !== 'color' && b.prop !== 'matColor') || b.channel !== 3) continue;
      for (const seg of (b.values || [])) {
        const pts = Array.isArray(seg) && seg[0] === 'poly' ? seg[1] : null;
        if (!Array.isArray(pts) || pts.length < 2) continue;
        for (let i = 0; i < pts.length - 1; i++) {
          const [t0, , , , v0] = pts[i];
          const [t1, , , , v1] = pts[i + 1];
          if (t0 >= tEnd - 0.7 && t0 <= tEnd && v0 <= 0.12 && v1 >= 0.45 && t1 > t0) {
            if (tFlash === null || t0 < tFlash) tFlash = t0;
          }
        }
      }
    }
  }
  const base = tFlash !== null ? Math.min(tFlash - 0.12, tEnd - 0.05) : (tEnd - 0.18);
  return clamp(base, 0.15, Math.max(0.15, (scene.duration || 1) - 0.08));
}

export async function openSkillBurst({canvas,key,signal,assetsRoot,settings,hiddenSlots,getAudio,changed,finished,progress}){
  const root=new URL(assetsRoot.replace(/\/$/,'')+'/',location.href);
  const objectURL=key=>new URL(key.split('/').map(encodeURIComponent).join('/'),root).href;
  const read=async(url,method,requestSignal=signal)=>{
    const response=await fetch(url,{signal:requestSignal});
    if(!response.ok) throw new Error('资源读取失败 ('+response.status+')');
    return response[method]();
  };
  const bytes=await read(objectURL('nikki/bursts/scenes/'+key+'.json'),'arrayBuffer');
  const scene=JSON.parse(new TextDecoder().decode(bytes));
  const hint=reviewedIdle[key];
  let sceneDigest, previousFraming;
  const framingKey='arthub-nikke-ending-v1:'+key;
  if(globalThis.crypto?.subtle){
    try {
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      sceneDigest=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      previousFraming=JSON.parse(sessionStorage.getItem(framingKey));
    } catch { /* Use the live framing probes if the digest is unavailable. */ }
  }
  const asset=ref=>{
    const object=scene.storage[ref];
    if(!object) throw new Error('资源未匹配 '+ref);
    return objectURL(object);
  };
  const engine=await createBurst(canvas,scene,root,progress,asset,signal);
  if(signal.aborted){engine.dispose();throw signal.reason;}
  const partTargets=engine.bindPartState(hiddenSlots);
  const duration=scene.duration;
  const endingBackdrop=endingBackdrops[key];
  let time=0, playing=false, starting=false, disposed=false, revision=0, dirty=true;
  let drawnFrame=-1;
  const playbackFps=scene.fps>0 ? scene.fps : 60;
  let speed=settings.speed, loop=false, volume=settings.volume, muted=settings.muted;
  let audio=null, mix=null, analyser=null, clock=null, sources=[], cues=[], counts={};
  const decoded=new Map();
  const notes=[...engine.failedModels.map(item=>'骨骼 '+item.name),...engine.failedTextures.map(item=>item.split('/').at(-1))];
  const observer=new ResizeObserver(()=>{dirty=true;});
  observer.observe(canvas);

  function draw(){
    counts=engine.render(time);
    drawnFrame=Math.floor(time*playbackFps);
    dirty=false;
  }
  function now(){
    if(!playing) return time;
    const current=clock.audio ? audio.currentTime : performance.now()/1000;
    return Math.min(duration,clock.offset+Math.max(0,current-clock.start)*speed);
  }
  function stop(){
    time=now(); playing=starting=false; revision++;
    for(const [source,gain] of sources){
      try{source.stop();}catch{}
      source.disconnect();gain.disconnect();
    }
    sources=[]; cues=[];
  }
  function output(){
    if(!mix) return;
    const at=audio.currentTime;
    mix.gain.cancelScheduledValues(at);
    mix.gain.setTargetAtTime(muted ? 0 : volume,at,.018);
  }
  function prepareAudio(){
    if(!engine.timeline.audio.length) return [];
    if(!audio){
      audio=getAudio();
      if(!audio) return [];
      mix=audio.createGain();
      mix.gain.value=muted ? 0 : volume;
      analyser=audio.createAnalyser();
      mix.connect(analyser); analyser.connect(audio.destination);
    }else if(audio.state!=='running') getAudio();
    return engine.timeline.audio.map(async clip=>{
      if(!decoded.has(clip.file)){
        const requestSignal=AbortSignal.any?.([signal,AbortSignal.timeout(15000)]) || signal;
        const pending=Promise.resolve()
          .then(()=>read(asset(clip.file),'arrayBuffer',requestSignal))
          .then(bytes=>audio.decodeAudioData(bytes))
          .catch(()=>{
            decoded.delete(clip.file);
            if(!signal.aborted && !disposed && !notes.includes('原音轨读取失败')) notes.push('原音轨读取失败');
            return null;
          });
        decoded.set(clip.file,pending);
      }
      const buffer=await decoded.get(clip.file);
      return buffer ? {...clip,buffer} : null;
    });
  }
  function scheduleSound(clip){
    const current=now();
    const at=Math.max(current,clip.start), end=Math.min(duration,clip.start+clip.duration);
    if(at>=end) return;
    const input=clockAt(clip,at);
    const samples=Math.min((end-at)*clip.rate,clip.buffer.duration-input);
    if(samples<=0) return;
    const source=audio.createBufferSource(), gain=audio.createGain();
    const begin=clock.audio ? clock.start+(at-clock.offset)/speed : audio.currentTime+(at-current)/speed;
    source.buffer=clip.buffer; source.playbackRate.value=clip.rate*speed; gain.gain.value=clip.volume;
    source.connect(gain); gain.connect(mix); source.start(Math.max(begin,audio.currentTime),input,samples);
    sources.push([source,gain]); cues.push({name:clip.name,start:at,offset:input});
  }
  async function start(offset){
    stop();
    const token=++revision;
    time=offset; starting=true;
    draw(); changed();
    const pending=prepareAudio();
    // Give the audio a short head start. A slow clip can join at the current timeline time.
    if(pending.length){
      let timer;
      await Promise.race([Promise.all(pending),new Promise(resolve=>{timer=setTimeout(resolve,1800);})])
        .finally(()=>clearTimeout(timer));
    }
    if(disposed||signal.aborted||token!==revision) return;
    const audioClock=audio?.state==='running';
    const begin=audioClock ? audio.currentTime+.03 : performance.now()/1000;
    clock={audio:audioClock,start:begin,offset};
    starting=false; playing=true;
    for(const ready of pending) void ready.then(clip=>{
      if(clip && playing && token===revision && audio.state==='running') scheduleSound(clip);
    });
    changed();
  }
  function pause(){
    stop(); draw(); changed();
  }
  function seek(value,resume=playing||starting){
    stop(); time=clamp(value,0,duration);
    draw(); changed();
    if(!resume) return;
    if(time<duration) void start(time);
    else if(loop) void start(0);
    else finished();
  }
  let backdrop=null, backdropImage=null;
  function buildComposition(aspect, animation, preferredModelName, compositeLayers) {
    if (!animation || !/idle|loop|stand/i.test(animation)) return null;
    const frame={width:Math.round(1024*Math.min(1,aspect)),height:Math.round(1024/Math.max(1,aspect))};
    let at = endingBackdrop ? endingBackdrop.frame / scene.fps : findEndingTime(scene);
    const reviewed=sceneDigest && !hiddenSlots.size && [hint,previousFraming].find(row=>
      row && row.digest===sceneDigest && row.model===preferredModelName &&
      (row.animation||'idle')===animation && Math.abs(row.aspect-aspect)<1e-7 &&
      Number.isFinite(row.time) && row.time>=0 && row.time<=duration &&
      (row.effectiveAspect===undefined || (row.effectiveAspect>=.65 && row.effectiveAspect<=aspect)));
    if(reviewed) at=reviewed.time;
    if (!reviewed && !endingBackdrop) {
      const probe = document.createElement('canvas');
      probe.width = probe.height = 24;
      const pctx = probe.getContext('2d', { willReadFrequently: true });
      const candidates = [at, at - 0.15, at - 0.30, at - 0.45, at - 0.65, at - 0.90, at - 1.20].filter(v => v >= 0.1);
      let chosen = null;
      for (const cand of candidates) {
        const res = engine.renderComposition(cand, animation, 0, { width: 96, height: 96 }, preferredModelName, compositeLayers);
        if (!res || !res.spine) continue;
        pctx.clearRect(0, 0, 24, 24);
        pctx.drawImage(canvas, 0, 0, 24, 24);
        const rgba = pctx.getImageData(0, 0, 24, 24).data;
        let lit = 0, clipped = 0, dark = 0;
        for (let i = 0; i < rgba.length; i += 4) {
          const hi = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
          const lo = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
          if (hi > 14) lit++;
          if (lo > 246) clipped++;
          if (hi <= 14) dark++;
        }
        const total = rgba.length / 4;
        if (clipped / total < 0.42 && dark / total < 0.85 && lit / total > 0.15) {
          chosen = cand;
          break;
        }
      }
      if (chosen === null) return null;
      at = chosen;
    }
    // Probe the rendered composition at requested aspect and trim pure-black outer pillarbox bars
    // (Unity burst scenes use vertical FOV; narrowing aspect removes empty black side voids cleanly).
    let effectiveAspect = reviewed?.effectiveAspect ?? aspect;
    if (!reviewed && aspect > 0.72) {
      const pw = Math.max(32, Math.round(160 * Math.min(1, aspect)));
      const ph = Math.max(32, Math.round(160 / Math.max(1, aspect)));
      if (engine.renderComposition(at, animation, 0, { width: pw, height: ph }, preferredModelName, compositeLayers)) {
        const probeC = document.createElement('canvas');
        probeC.width = pw; probeC.height = ph;
        const pctx = probeC.getContext('2d', { willReadFrequently: true });
        pctx.drawImage(canvas, 0, 0, pw, ph);
        const rgba = pctx.getImageData(0, 0, pw, ph).data;
        const colIsBlack = x => {
          let blk = 0;
          for (let y = 0; y < ph; y++) {
            const i = (y * pw + x) * 4;
            if (Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) <= 12) blk++;
          }
          return blk / ph >= 0.96;
        };
        let leftBlk = 0, rightBlk = 0;
        while (leftBlk < (pw >> 1) && colIsBlack(leftBlk)) leftBlk++;
        while (rightBlk < (pw >> 1) && colIsBlack(pw - 1 - rightBlk)) rightBlk++;
        const symPad = Math.min(leftBlk, rightBlk);
        if (symPad >= Math.max(3, Math.floor(pw * 0.02))) {
          // Trim symmetrically plus 2px safety margin to remove anti-aliased dark edge
          const keepW = Math.max(Math.round(pw * 0.5), pw - (symPad + 2) * 2);
          effectiveAspect = clamp(aspect * (keepW / pw), 0.65, aspect);
        }
      }
    }
    // Both stage and export textures can sample the just-rendered WebGL canvas directly.
    const update=(name,time,edge=1024)=>{
      frame.width=Math.max(2,Math.round(edge*Math.min(1,effectiveAspect)));
      frame.height=Math.max(2,Math.round(edge/Math.max(1,effectiveAspect)));
      // Hold the original environment at its ending frame.
      // Character motion remains live and the same sampler serves exports.
      if (!engine.renderComposition(at,name,time,frame,preferredModelName,compositeLayers)) return false;
      return true;
    };
    if(!update(animation,0)) return null;
    if(!reviewed && sceneDigest && !hiddenSlots.size){
      previousFraming={digest:sceneDigest,model:preferredModelName,animation,aspect,effectiveAspect,time:at};
      try { sessionStorage.setItem(framingKey,JSON.stringify(previousFraming)); } catch { /* Memory cache still applies. */ }
    }
    return {image:canvas,update,at,fps:playbackFps,aspect:effectiveAspect};
  }
  function buildBackdrop(aspect){
    if(backdrop) return backdropImage;
    const size=edge=>({width:Math.round(edge*Math.min(1,aspect)),height:Math.round(edge/Math.max(1,aspect))});
    const renderBackdrop=(time,edge)=>engine.renderBackdrop(time,size(edge),endingBackdrop?.branch);
    const sample=document.createElement('canvas');
    sample.width=sample.height=24;
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    const endingTime=endingBackdrop ? endingBackdrop.frame/scene.fps : null;
    const sampleTimes=[.48,.34,.62,.22,.74,.84,.15].map(fraction=>duration*fraction);
    if(endingTime!==null && endingTime<duration) sampleTimes.unshift(endingTime);
    let best=null;
    for(const at of sampleTimes){
      const frame=renderBackdrop(at,192);
      if(!frame.background) continue;
      ctx.clearRect(0,0,24,24);
      ctx.drawImage(canvas,0,0,24,24);
      const rgba=ctx.getImageData(0,0,24,24).data;
      let lit=0, exposed=0, clipped=0;
      for(let i=0;i<rgba.length;i+=4){
        const hi=Math.max(rgba[i],rgba[i+1],rgba[i+2]), lo=Math.min(rgba[i],rgba[i+1],rgba[i+2]);
        if(hi>12) lit++;
        if(hi>22 && lo<242) exposed++;
        if(lo>248) clipped++;
      }
      if(lit<22) continue;
      const score=exposed+.18*lit-.45*clipped;
      if(at===endingTime){
        best={time:at,score,lit,layers:frame.background};
        break;
      }
      if(!best || score>best.score) best={time:at,score,lit,layers:frame.background};
    }
    backdrop=best || {time:null};
    if(!best) return null;
    renderBackdrop(best.time,2048);
    const captured=document.createElement('canvas');
    captured.width=canvas.width; captured.height=canvas.height;
    const pixels=captured.getContext('2d',{willReadFrequently:true});
    pixels.drawImage(canvas,0,0);
    const {width,height}=captured, rgba=pixels.getImageData(0,0,width,height).data;
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=0,i=3;y<height;y++) for(let x=0;x<width;x++,i+=4){
      if(rgba[i]<12) continue;
      left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y);
    }
    if(right<left || bottom<top) { backdrop={time:null}; return null; }
    backdropImage=document.createElement('canvas');
    backdropImage.width=right-left+1; backdropImage.height=bottom-top+1;
    backdropImage.getContext('2d').drawImage(captured,left,top,backdropImage.width,backdropImage.height,0,0,backdropImage.width,backdropImage.height);
    renderBackdrop(best.time,192);
    return backdropImage;
  }
  let zoom=1,panX=0,panY=0;
  function view(){
    canvas.style.transform='translate('+panX+'px,'+panY+'px) scale('+zoom+')';
  }
  return {
    duration,notes,partTargets, audioTracks:engine.timeline.audio.length,
    get playing(){return playing||starting;},
    get time(){return time;},
    get zoom(){return zoom;},
    tick(){
      if(!playing){if(dirty) draw(); return;}
      time=now();
      if(dirty || drawnFrame!==Math.floor(time*playbackFps)) draw();
      if(time>=duration){stop();changed();if(loop) void start(0);else finished();}
    },
    toggle(){if(playing||starting) pause(); else void start(time>=duration ? 0 : time);},
    stop,pause,seek,buildBackdrop,buildComposition,
    get backdrop(){return backdrop;},
    replay(){void start(0);},
    step(direction){seek(time+direction/scene.fps,false);},
    mix(value,silent){volume=value;muted=silent;output();},
    setLoop(value){loop=value;},
    setSpeed(value){
      const offset=now(), wasPlaying=playing||starting;
      stop(); speed=value;
      if(wasPlaying) void start(offset);
    },
    redraw:draw,
    hit:(x,y)=>engine.pickPart(x,y)?.id || null,
    fit(){zoom=1;panX=0;panY=0;view();},
    pan(x,y){panX+=x;panY+=y;view();},
    zoomBy(factor,x=0,y=0){
      const next=clamp(zoom*factor,.25,4);
      panX=x-(x-panX)*next/zoom; panY=y-(y-panY)*next/zoom;
      zoom=next; view();
    },
    snapshot(){
      const wave=new Float32Array(analyser?.fftSize??0);
      analyser?.getFloatTimeDomainData(wave);
      let peak=0; for(const sample of wave) peak=Math.max(peak,Math.abs(sample));
      return {key,duration,time,playing,zoom,counts,notes,cues,peak,volume,muted,gain:mix?.gain.value??null,
        audioTracks:engine.timeline.audio.length,hidden:hiddenSlots.size};
    },
    dispose(){
      if(disposed) return;
      disposed=true; stop(); observer.disconnect();
      engine.dispose();
      mix?.disconnect(); analyser?.disconnect();
    },
  };
}
