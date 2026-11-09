import {clamp} from './burst-math.js';
import {createBurst} from './burst_scene.js';
import {clockAt} from './timelines.js';

export async function openSkillBurst({canvas,key,signal,assetsRoot,settings,hiddenSlots,getAudio,changed,finished,progress}){
  const root=new URL(assetsRoot.replace(/\/$/,'')+'/',location.href);
  const objectURL=key=>new URL(key.split('/').map(encodeURIComponent).join('/'),root).href;
  const read=async(url,method,requestSignal=signal)=>{
    const response=await fetch(url,{signal:requestSignal});
    if(!response.ok) throw new Error('资源读取失败 ('+response.status+')');
    return response[method]();
  };
  const scene=await read(objectURL('nikki/bursts/scenes/'+key+'.json'),'json');
  const asset=ref=>{
    const object=scene.storage[ref];
    if(!object) throw new Error('资源未匹配 '+ref);
    return objectURL(object);
  };
  const engine=await createBurst(canvas,scene,root,progress,asset,signal);
  signal.throwIfAborted();
  const partTargets=engine.bindPartState(hiddenSlots);
  const duration=scene.duration;
  let time=0, playing=false, starting=false, disposed=false, revision=0, dirty=true;
  let speed=settings.speed, loop=false, volume=settings.volume, muted=settings.muted;
  let audio=null, mix=null, analyser=null, clock=null, sources=[], cues=[], counts={};
  const decoded=new Map();
  const notes=[...engine.failedModels.map(item=>'骨骼 '+item.name),...engine.failedTextures.map(item=>item.split('/').at(-1))];
  const observer=new ResizeObserver(()=>{dirty=true;});
  observer.observe(canvas);

  function draw(){
    counts=engine.render(time);
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
  let backdrop=null;
  function showBackdrop(){
    if(!backdrop){
      const sample=document.createElement('canvas');
      sample.width=sample.height=24;
      const ctx=sample.getContext('2d',{willReadFrequently:true});
      let best=null;
      for(const fraction of [.48,.34,.62,.22,.74,.84,.15]){
        const at=duration*fraction;
        const frame=engine.renderBackdrop(at,192);
        if(!frame.background) continue;
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
        if(!best || score>best.score) best={time:at,score,lit,layers:frame.background};
      }
      backdrop=best || {time:null};
    }
    if(backdrop.time===null) return false;
    engine.renderBackdrop(backdrop.time); dirty=false;
    return true;
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
      time=now(); draw();
      if(time>=duration){stop();changed();if(loop) void start(0);else finished();}
    },
    toggle(){if(playing||starting) pause(); else void start(time>=duration ? 0 : time);},
    stop,pause,seek,showBackdrop,
    tickBackdrop(){if(dirty && backdrop?.time!=null) showBackdrop();},
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
      mix?.disconnect(); analyser?.disconnect();
    },
  };
}
