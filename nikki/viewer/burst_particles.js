import {clamp, curve, gradient, integrate, rng, euler, mulRotation, rotate, point} from './burst-math.js';
import {clockAt} from './timelines.js';

const radians = Math.PI/180;
const white = [1,1,1,1], identity = [0,0,0,1];
const multiply = (a,b) => a.map((x,i)=>x*b[i]);
const TAU = Math.PI*2;
const rotateShape = (shape, angle) => rotate(angle, euler(...shape.rotation.map(x=>x*radians)));

function shapeSample(shape, random) {
  if (!shape) return {position:[0,0,0],direction:[0,0,1]};
  const angle = random() * (shape.arc || 360) * radians;
  const outer = Math.max(0,shape.radius), inner=outer*(1-clamp(shape.thickness));
  const radius = Math.sqrt(inner*inner + random()*(outer*outer-inner*inner));
  let position, direction;
  if ([0,1,2,3].includes(shape.type)) {
    const z = shape.type < 2 ? random()*2-1 : random();
    const xy = Math.sqrt(1-z*z);
    direction=[xy*Math.cos(angle),xy*Math.sin(angle),z];
    const distance = shape.type%2 ? outer : radius;
    position=direction.map(x=>x*distance);
  } else if ([4,7,8,9].includes(shape.type)) {
    const cone = shape.angle*radians;
    const depth=shape.type>=8 ? random()*shape.length : 0;
    const reach=radius+depth*Math.tan(cone);
    position=[Math.cos(angle)*reach,Math.sin(angle)*reach,depth];
    direction=[Math.sin(cone)*Math.cos(angle),Math.sin(cone)*Math.sin(angle),Math.cos(cone)];
  } else if ([10,11].includes(shape.type)) {
    direction=[Math.cos(angle),Math.sin(angle),0];
    position=direction.map(x=>x*(shape.type===11 ? outer : radius));
  } else if (shape.type===12) {
    position=[(random()*2-1)*outer,0,0];
    direction=[0,0,1];
  } else {
    position=Array.from({length:3},()=>random()-.5);
    if ([15,16].includes(shape.type)) position[Math.floor(random()*3)] = random()<.5 ? -.5 : .5;
    if ([17,18].includes(shape.type)) position[2]=0;
    direction=[0,0,1];
  }
  if (shape.randomDirection) {
    const phi=random()*TAU,z=random()*2-1,r=Math.sqrt(1-z*z), mix=shape.randomDirection;
    direction=direction.map((x,i)=>x*(1-mix)+[r*Math.cos(phi),r*Math.sin(phi),z][i]*mix);
  }
  return {
    position:rotateShape(shape,multiply(position,shape.scale)).map((x,i)=>x+shape.position[i]),
    direction:rotateShape(shape,direction),
  };
}

function emit(emitter, seed, length) {
  const {particle:p}=emitter;
  const random=rng(seed || p.seed || 1);
  const delay=Math.max(0,curve(p.delay,0,random()));
  const period=Math.max(.01,p.length || 5);
  const warm = p.prewarm && p.loop ? period : 0;
  const end = Math.max(0, length * p.speed + warm - delay);
  const times=[];
  const cycles=p.loop ? Math.floor(end/period)+1 : 1;
  for (let cycle=0;cycle<Math.min(120,cycles);cycle++) {
    const start=cycle*period;
    const stop=Math.min(period,end-start);
    for (const [at,count,repeats,interval,probability] of p.emission.bursts) {
      for (let repeat=0;repeat<Math.max(1,repeats||1);repeat++) {
        const t=at+repeat*(interval||.01);
        if (t>stop || random()>probability) continue;
        const amount=clamp(Math.round(curve(count,t/period,random())),0,2048);
        for(let i=0;i<amount;i++) times.push(start+t);
      }
    }
    const step=1/120;
    let progress=0;
    const rateSeed=random();
    for(let t=step;t<=stop+1e-7;t+=step) {
      progress += Math.max(0,curve(p.emission.rate,t/period,rateSeed))*step;
      while(progress>=1-1e-7 && times.length<24000) {
        times.push(start+t);
        progress--;
      }
    }
  }
  const particles=[], alive=[];
  for (const birth of times.sort((a,b)=>a-b).slice(0,24000)) {
    for(let i=alive.length-1;i>=0;i--) if(alive[i]<=birth) alive.splice(i,1);
    if(alive.length>=Math.min(p.limit||1000,2048)) continue;
    const start=(birth%period)/period;
    const life=Math.max(0,curve(p.initial.life,start,random()));
    if(life<1e-7) continue;
    alive.push(birth+life);
    const width=curve(p.initial.size[0],start,random());
    particles.push({
      birth, life, origin:shapeSample(p.shape,random), speed:curve(p.initial.speed,start,random()),
      gravity:curve(p.initial.gravity,start,random()), size:[width,p.initial.size3D ? curve(p.initial.size[1],start,random()) : width],
      rotation:p.initial.rotation.map((channel,i)=>i===2||p.initial.rotation3D?curve(channel,start,random()):0),
      color:gradient(p.initial.color,start,random()),uv:p.uv?curve(p.uv.start,start,random()):0,
      row:random(),r:Array.from({length:17},random),
    });
  }
  return {particles,delay,warm};
}

function frameRect(uv, age, life, p) {
  if (!uv || uv.x<1 || uv.y<1 || uv.x*uv.y===1) return [0,0,1,1];
  const x=uv.x, y=uv.y;
  const rowOnly=uv.animationType===1;
  const n=rowOnly ? x : x*y;
  const phase=uv.timeMode===2 ? age*(uv.fps||30)/n : curve(uv.frame,age/life,p.r[16])*(uv.cycles||1);
  let frame=Math.floor(Math.fround((p.uv+phase)*n));
  frame=(frame%n+n)%n;
  if(rowOnly) frame+=clamp(uv.rowMode===0?uv.row:Math.floor(p.row*y),0,y-1)*x;
  const col=frame%x,row=Math.floor(frame/x);
  return [col/x,row/y,(col+1)/x,(row+1)/y];
}

function sampleMotion(ps, p, age) {
  const {r,origin}=p;
  const progress=clamp(age/p.life);
  const velocity=ps.velocity;
  const modifier=velocity ? curve(velocity.modifier,progress,r[0]) : 1;
  const speed=p.speed*modifier;
  const offset=origin.position.map((x,i)=>x+origin.direction[i]*speed*age);
  if(velocity) {
    for(let i=0;i<3;i++) offset[i]+=integrate(velocity.xyz[i],age,p.life,r[i+1]);
  }
  if(ps.force) {
    for(let i=0;i<3;i++) offset[i]+=.5*curve(ps.force[i],progress,r[i+4])*age*age;
  }
  offset[1]-=4.905*p.gravity*age*age;
  if(ps.noise) {
    const amount=curve(ps.noise.strength,progress,r[7]);
    for(let i=0;i<3;i++) {
      const shift=r[8+i]*TAU;
      offset[i]+=(Math.sin(shift+age*ps.noise.frequency*TAU)-Math.sin(shift))*amount;
    }
  }
  return offset;
}

export function createParticles(scene,timeline) {
  const cache = new Map();
  const active = new Set();
  function sample(emitter, time, pose, viewRotation) {
    const ps=emitter.particle;
    const driver=timeline.particleClock(emitter.node,time);
    if(!driver && !ps.playOnAwake) return [];
    const seed=ps.autoSeed ? driver?.seed || ps.seed : ps.seed || driver?.seed;
    const key=emitter.id+':'+seed;
    if(!cache.has(key)) {
      cache.set(key,emit(emitter,seed,scene.duration*3));
    }
    const data=cache.get(key);
    const elapsed=driver ? clockAt(driver,time) : time-pose.activatedAt;
    const t=elapsed*ps.speed+data.warm-data.delay;
    if(t < -1e-7) return [];
    const entries=[];
    const sizeScale=ps.scaleMode===0 ? pose.scale : ps.scaleMode===1 ? pose.localScale : [1,1,1];
    for(const p of data.particles) {
      const age=t-p.birth;
      if(age < -1e-7) break;
      if(age>=p.life) continue;
      const local=Math.max(0,age), progress=local/p.life;
      const tint=ps.color?gradient(ps.color,progress,p.r[11]):white;
      const c=multiply(p.color,tint);
      if(c[3]<=1e-4) continue;
      const x=ps.size?curve(ps.size.x,progress,p.r[12]):1;
      const y=ps.size?.separate?curve(ps.size.y,progress,p.r[13]):x;
      const w=Math.abs(p.size[0]*x*sizeScale[0]), h=Math.abs(p.size[1]*y*sizeScale[1]);
      if(!w || !h || !Number.isFinite(w+h)) continue;
      const a=p.rotation.map((rot,i)=>rot+(ps.spin?integrate(ps.spin[i],local,p.life,p.r[14+i]):0));
      let basis=emitter.alignment===2||emitter.renderMode===4 ? pose.rotation : emitter.alignment===1 ? identity : viewRotation;
      if(emitter.renderMode===2) basis=euler(Math.PI/2,0,0);
      const position=point(pose,sampleMotion(ps,p,local));
      let height=h;
      if(emitter.renderMode===1) {
        const next=point(pose,sampleMotion(ps,p,local+1/120));
        const dx=next[0]-position[0], dy=next[1]-position[1];
        if(dx||dy) a[2]=Math.atan2(dy,dx)-Math.PI/2;
        height=h*(emitter.lengthScale||1)+Math.hypot(dx,dy)*(emitter.velocityScale||0)*120;
      }
      entries.push({position,rotation:mulRotation(basis,euler(...a)),width:w,height,
        uv:frameRect(ps.uv,local,p.life,p),color:c,source:emitter,pose,age:local});
      if(ps.modules.includes('TrailModule') && local>.05) {
        const past=point(pose,sampleMotion(ps,p,Math.max(0,local-.075)));
        const dx=position[0]-past[0],dy=position[1]-past[1];
        const length=Math.hypot(dx,dy);
        if(length>1e-4) entries.push({
          position:position.map((x,i)=>(x+past[i])/2),rotation:euler(0,0,Math.atan2(dy,dx)-Math.PI/2),
          width:w*.65,height:length,uv:[0,0,1,1],color:[...c.slice(0,3),c[3]*.6],
          source:emitter,pose,trail:true,
        });
      }
    }
    if(entries.length) active.add(emitter.id);
    return entries;
  }
  return {sample,active};
}
