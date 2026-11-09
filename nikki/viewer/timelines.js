import {clamp, keyedCurve, mulRotation, rotate, euler, point} from './burst-math.js';

const radians = Math.PI / 180;
const contains = (clip, time) => time + 1e-7 >= clip.start && time + 1e-7 < clip.start + clip.duration;
const clockAt = (clip, time) => Math.max(0, time - clip.start) * clip.rate + clip.clipIn;

function sample(channel, time) {
  if (!channel) return null;
  const [kind, data, fps, dense] = channel;
  if (kind === 'constant') return data;
  if (kind === 'samples') {
    if (!dense?.length) return null;
    const i = clamp((time - data) * fps, 0, dense.length - 1);
    const n = Math.floor(i);
    return dense[n] + ((dense[n + 1] ?? dense[n]) - dense[n]) * (i - n);
  }
  if (kind === 'keyed') return keyedCurve(data, time);
  if (!data?.length) return null;
  const next = data.findIndex(key => key[0] > time + 1e-7);
  if (next === 0) return data[0][4];
  if (next === -1) return data.at(-1)[4];
  const [start, a, b, c, value] = data[next - 1];
  const t = Math.max(0, time - start);
  return ((a * t + b) * t + c) * t + value;
}

function absolute(clip, context) {
  const start = context.origin + clip.start / context.rate;
  const end = start + clip.duration / context.rate;
  const lo = Math.max(context.lo, start), hi = Math.min(context.hi, end);
  if (hi <= lo) return null;
  const rate = context.rate * clip.rate;
  return { ...clip, start: lo, duration: hi - lo, clipIn: clip.clipIn + (lo - start) * rate, rate };
}

function normalizeQuaternion(q) {
  const length = Math.hypot(...q);
  return length > 1e-7 ? q.map(value => value / length) : [0,0,0,1];
}

export function compileTimeline(scene) {
  const gates = new Map(), clocks = new Map(), spine = new Map();
  const curves = [], audio = [], events = [];
  const byId = new Map(scene.timelines.map(timeline => [timeline.id, timeline]));
  const roots = Object.keys(scene.nodes);
  const ancestors = new Map(roots.map(key => {
    const path = [];
    for (let at=key; at && !path.includes(at); at=scene.nodes[at]?.parent) path.push(at);
    return [key, path];
  }));
  const note = (map, key, value) => {
    if (!key) return;
    if (!map.has(key)) map.set(key,[]);
    map.get(key).push(value);
  };
  function visit(timeline, context, parents) {
    if (!timeline || parents.has(timeline.id)) return;
    const nextParents = new Set([...parents, timeline.id]);
    for (const source of timeline.controls) {
      const c = absolute(source, context);
      if (!c) continue;
      if (c.active) note(gates, c.node, c);
      if (c.particles) note(clocks, c.node, c);
      if (!c.director) continue;
      for (const child of scene.timelines) {
        if (child.node!==c.node && !(c.hierarchy && ancestors.get(child.node)?.includes(c.node))) continue;
        visit(child, {origin:c.start-c.clipIn/c.rate, rate:c.rate, lo:c.start, hi:c.start+c.duration},nextParents);
      }
    }
    for (const source of timeline.spine) {
      const c = absolute(source, context);
      if (c) note(spine,c.node,c);
    }
    for (const [items, target] of [[timeline.curves,curves],[timeline.audio,audio],[timeline.events,events]]) {
      for (const source of items) {
        const c = absolute(source,context);
        if (c) target.push(c);
      }
    }
  }
  visit(byId.get(scene.master), {origin:0,rate:1,lo:0,hi:scene.duration}, new Set());
  events.sort((a,b)=>a.start-b.start);
  const nodeOrder = roots.slice().sort((a,b) => ancestors.get(a).length-ancestors.get(b).length);
  const orderedClocks = new Map(nodeOrder.map(key => {
    const candidates = ancestors.get(key).flatMap((ancestor,index) => (clocks.get(ancestor) || [])
      .filter(clip => index===0 || clip.hierarchy));
    return [key,candidates.sort((a,b)=>b.start-a.start)];
  }));

  function sampleScene(time) {
    const edits = new Map();
    const delta = time >= scene.duration ? scene.duration - 1e-6 : time;
    for (const clip of curves) {
      if (!contains(clip,delta)) continue;
      const t=clockAt(clip,delta);
      for (const binding of clip.bindings) {
        if (!edits.has(binding.node)) edits.set(binding.node,{});
        const edit=edits.get(binding.node);
        const values=binding.values.map(ch=>sample(ch,t));
        if (binding.channel===undefined) {
          if (binding.offset) values.forEach((v,i)=>{if (v!==null) values[i]=v+binding.offset[i];});
          edit[binding.prop]=values;
        } else {
          edit[binding.prop] ??= [];
          if (values[0]!==null) edit[binding.prop][binding.channel]=values[0];
        }
      }
    }
    const poses = new Map();
    for (const key of nodeOrder) {
      const source=scene.nodes[key], edit=edits.get(key)||{};
      const parent=poses.get(source.parent);
      const v=(group,base)=>base.map((x,i)=>edit[group]?.[i] ?? x);
      const position=v('position',source.position);
      const rotation=edit.euler ? euler(...edit.euler.map(x=>(x??0)*radians)) : normalizeQuaternion(v('rotation',source.rotation));
      const localScale=v('scale',source.scale);
      const schedule=gates.get(key);
      const control=schedule?.find(clip=>contains(clip,delta));
      const isActive=schedule ? !!control : edit.active?.[0]===undefined ? source.active : edit.active[0]>.5;
      poses.set(key,{
        position:parent ? point(parent,position) : position,
        rotation:parent ? mulRotation(parent.rotation,rotation) : rotation,
        scale:parent ? localScale.map((x,i)=>x*parent.scale[i]) : localScale,
        localScale, edit, active:isActive && (!parent || parent.active),
        activatedAt:Math.max(parent?.activatedAt??0,control?.start??0),
      });
    }
    return poses;
  }

  function spineClip(model, time) {
    const candidates = spine.get(model.node) || [];
    return candidates.find(clip => contains(clip,time) && (!clip.data || clip.data===model.skeletonData))
      || candidates.find(clip => contains(clip,time) && (!clip.component || clip.component===model.id));
  }
  function particleClock(node, time) {
    return orderedClocks.get(node)?.find(clip=>contains(clip,time));
  }
  return {sampleScene,spineClip,particleClock,audio,events,hasSpineTrack:node=>spine.has(node)};
}

export {contains,clockAt};
