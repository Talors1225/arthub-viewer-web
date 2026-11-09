export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const turn = 2 * Math.PI;
const degrees = Math.PI / 180;
const identity = [0, 0, 0, 1];
const axes = ['x', 'y', 'z'];
const epsilon = 1e-7;

export function active(clip, time) {
  return time + epsilon >= clip.start && time + epsilon < clip.start + clip.duration;
}

export function localTime(clip, time) {
  return Math.max(0, time - clip.start) * clip.rate + clip.clipIn;
}

function bezier(a, b, c, d, t) {
  const u = 1 - t;
  return a * u ** 3 + 3 * b * u ** 2 * t + 3 * c * u * t ** 2 + d * t ** 3;
}

export function keyedCurve(keys, time) {
  if (!keys?.length) return time;
  if (time <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (time >= b[0]) continue;
    if (!Number.isFinite(a[3]) || !Number.isFinite(b[2])) return a[1];
    const delta = b[0] - a[0];
    const t = (time - a[0]) / delta;
    const outgoing = a[4] & 2 ? a[6] : 1 / 3;
    const incoming = b[4] & 1 ? b[5] : 1 / 3;
    let s = t;
    if ((a[4] & 2) || (b[4] & 1)) {
      let low = 0, high = 1;
      for (let j = 0; j < 12; j++) {
        s = (low + high) / 2;
        if (bezier(0, outgoing, 1 - incoming, 1, s) < t) low = s;
        else high = s;
      }
    }
    return bezier(a[1], a[1] + a[3] * delta * outgoing,
      b[1] - b[2] * delta * incoming, b[1], s);
  }
  return keys.at(-1)[1];
}

function curve(spec, t, r) {
  const [mode, max, min, upper, lower] = spec;
  if (mode === 0) return max;
  if (mode === 3) return mix(min, max, r);
  if (mode === 1) return max * keyedCurve(upper, t);
  return mix(min * keyedCurve(lower, t), max * keyedCurve(upper, t), r);
}

function integrate(spec, age, life, random) {
  if (spec[0] === 0 || spec[0] === 3) return curve(spec, 0, random) * age;
  const steps = Math.max(1, Math.ceil(age * 30));
  const step = age / steps;
  let total = 0;
  for (let i = 0; i < steps; i++) total += curve(spec, (i + .5) * step / life, random) * step;
  return total;
}

function keyColor(keys, time, fixed) {
  const at = keys.findIndex(key => key[0] > time);
  if (at === -1) return keys.at(-1).slice(1);
  if (at === 0) return keys[0].slice(1);
  const a = keys[at - 1], b = keys[at];
  const ratio = fixed ? 0 : (time - a[0]) / (b[0] - a[0]);
  return a.slice(1).map((value, index) => mix(value, b[index + 1], ratio));
}

function gradient(spec, time, r) {
  const [mode, max, min, upper, lower] = spec;
  if (mode === 0) return max;
  if (mode === 2) return max.map((x, i) => mix(min[i], x, r));
  const sample = (g, t) => [
    ...(g?.rgb.length ? keyColor(g.rgb, t, g.mode === 1) : [1,1,1]),
    ...(g?.alpha.length ? keyColor(g.alpha, t, g.mode === 1) : [1]),
  ];
  if (mode === 1 || mode === 4) return sample(upper, mode === 4 ? r : time);
  const a = sample(lower, time);
  return sample(upper, time).map((x, i) => mix(a[i], x, r));
}

export {curve, gradient, integrate, euler, point, rng};

function streamValue(keys, time) {
  const next = keys.findIndex(key => key[0] > time + epsilon);
  if (next === 0) return keys[0][4];
  if (next === -1) return keys.at(-1)[4];
  const [start, a, b, c, value] = keys[next - 1];
  const t = Math.max(0, time - start);
  return ((a * t + b) * t + c) * t + value;
}

export function unityCurve(scene, node, time, channel) {
  return streamValue(scene.curves[node].values[channel], time);
}

export function mulRotation(a, b) {
  const [x, y, z, w] = a, [i, j, k, l] = b;
  return [w * i + x * l + y * k - z * j,
    w * j - x * k + y * l + z * i,
    w * k + x * j - y * i + z * l,
    w * l - x * i - y * j - z * k];
}

export function rotate(v, rotation) {
  const [x, y, z] = v, [i, j, k, w] = rotation;
  const tx = 2 * (j * z - k * y);
  const ty = 2 * (k * x - i * z);
  const tz = 2 * (i * y - j * x);
  return [x + w * tx + j * tz - k * ty,
    y + w * ty + k * tx - i * tz,
    z + w * tz + i * ty - j * tx];
}

function euler(x, y, z) {
  const aroundX = [Math.sin(x / 2), 0, 0, Math.cos(x / 2)];
  const aroundY = [0, Math.sin(y / 2), 0, Math.cos(y / 2)];
  const aroundZ = [0, 0, Math.sin(z / 2), Math.cos(z / 2)];
  return mulRotation(aroundY, mulRotation(aroundX, aroundZ));
}

export function transforms(scene, time) {
  const matrices = {};
  function get(name) {
    if (matrices[name]) return matrices[name];
    const node = scene.nodes[name];
    let { position, rotation, scale } = node;
    const recorded = scene.curves[name];
    if (recorded && name !== scene.overlay.node) {
      const channels = recorded.values.map(keys => streamValue(keys, time));
      position = channels.slice(0, 3).map((value, index) => value + recorded.offsetPosition[index]);
      if (channels.length === 9) {
        rotation = euler(...channels.slice(3, 6).map(angle => angle * degrees));
        scale = channels.slice(6, 9);
      }
    }
    const localScale = scale;
    if (node.parent) {
      const parent = get(node.parent);
      position = point(parent, position);
      rotation = mulRotation(parent.rotation, rotation);
      scale = scale.map((value, index) => value * parent.scale[index]);
    }
    matrices[name] = { position, rotation, scale, localScale };
    return matrices[name];
  }
  for (const name of Object.keys(scene.nodes)) get(name);
  return matrices;
}

function point(node, local) {
  return rotate(local.map((value, index) => value * node.scale[index]), node.rotation)
    .map((value, index) => node.position[index] + value);
}

function rng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function sampleShape(shape, random) {
  if (!shape) return { position: [0, 0, 0], direction: [0, 0, 1] };
  let local, direction;
  if (shape.type === 5) {
    local = axes.map(() => random() - .5);
    direction = [0, 0, 1];
  } else {
    const phi = random() * turn;
    const radius = Math.sqrt(mix((1 - shape.thickness) ** 2, 1, random()));
    const angle = shape.angle * degrees;
    const depth = shape.type === 8 ? random() * shape.length : 0;
    const spread = radius * (shape.radius + Math.tan(angle) * depth);
    local = [Math.cos(phi) * spread, Math.sin(phi) * spread, depth];
    direction = [Math.cos(phi) * Math.sin(angle) * radius,
      Math.sin(phi) * Math.sin(angle) * radius, Math.cos(angle)];
  }
  if (shape.randomDirection) {
    const phi = random() * turn, z = random() * 2 - 1;
    const radius = Math.sqrt(1 - z * z);
    const randomDirection = [Math.cos(phi) * radius, Math.sin(phi) * radius, z];
    direction = direction.map((value, i) => mix(value, randomDirection[i], shape.randomDirection));
  }
  const rotation = euler(...shape.rotation.map(angle => angle * degrees));
  return {
    position: rotate(local.map((value, i) => value * shape.scale[i]), rotation)
      .map((value, i) => value + shape.position[i]),
    direction: rotate(direction, rotation),
  };
}

function prepareParticles(emitter, clip) {
  const random = rng(clip.seed);
  const delay = curve(emitter.delay, 0, random());
  const limit = Math.min(emitter.length, Math.max(0, localTime(clip, clip.start + clip.duration) * emitter.simulationSpeed - delay));
  const births = [];
  for (const [start, count, cycles, interval, probability] of emitter.emission.bursts) {
    for (let i = 0; i < cycles; i++) {
      const time = start + i * interval;
      if (time > limit || random() > probability) continue;
      const countAt = Math.round(curve(count, time / emitter.length, random()));
      for (let j = 0; j < countAt; j++) births.push(time);
    }
  }
  let accumulated = 0;
  const rateRandom = random();
  const tick = 1 / 120;
  for (let time = tick; time <= limit + epsilon; time += tick) {
    accumulated += Math.max(0, curve(emitter.emission.rate, time / emitter.length, rateRandom)) * tick;
    while (accumulated >= 1 - epsilon) {
      births.push(time);
      accumulated -= 1;
    }
  }
  const { initial } = emitter;
  const particles = [];
  for (const birth of births.sort((a, b) => a - b)) {
    if (particles.filter(particle => particle.birth + particle.life > birth).length >= emitter.limit) continue;
    const t = birth / emitter.length;
    const val = key => curve(initial[key], t, random());
    const width = val('startSize');
    const size = [width, initial.size3D ? val('startSizeY') : width];
    const rotation = [initial.rotation3D ? val('startRotationX') : 0,
      initial.rotation3D ? val('startRotationY') : 0, val('startRotation')];
    particles.push({
      birth, size, rotation, life: val('startLifetime'), speed: val('startSpeed'),
      color: gradient(initial.color, t, random()), gravity: val('gravityModifier'),
      origin: sampleShape(emitter.shape, random), uv: curve(emitter.uv.start, t, random()),
      randomness: Array.from({ length: 9 }, random),
    });
  }
  return { emitter, clip, delay, particles };
}

export function createEmitters(scene) {
  return scene.particles.flatMap(emitter => scene.controls
    .filter(clip => clip.node === emitter.node)
    .map(clip => prepareParticles(emitter, clip)));
}

export function drawables(group, time, node) {
  const { emitter, clip, delay, particles } = group;
  if (!active(clip, time)) return [];
  const systemTime = localTime(clip, time) * emitter.simulationSpeed - delay;
  const { size, spin, velocity, uv } = emitter;
  const pieces = [];
  const scale = emitter.scaleMode === 1 ? node.localScale : node.scale;
  for (const p of particles) {
    const age = systemTime - p.birth;
    if (age < -epsilon || age >= p.life) continue;
    const t = Math.max(0, age);
    const progress = t / p.life;
    const r = p.randomness;
    const tint = emitter.color ? gradient(emitter.color, progress, r[0]) : [1, 1, 1, 1];
    const color = p.color.map((value, i) => clamp(value * tint[i]));
    if (color[3] <= 0) continue;
    const speedMultiplier = velocity ? curve(velocity.speedModifier, progress, r[1]) : 1;
    const offset = p.origin.direction.map((value, i) => p.origin.position[i] + value * p.speed * t * speedMultiplier);
    if (velocity) for (let i = 0; i < 3; i++) offset[i] += integrate(velocity[axes[i]], t, p.life, r[2 + i]);
    offset[1] -= 4.905 * p.gravity * t * t;
    let width = p.size[0], height = p.size[1];
    if (size) {
      const x = Math.max(0, curve(size.curve, progress, r[5]));
      width *= x;
      height *= size.separate ? Math.max(0, curve(size.y, progress, r[6])) : x;
    }
    if (emitter.scaleMode !== 2) {
      width *= scale[0];
      height *= scale[1];
    }
    if (width <= 0 || height <= 0) continue;
    const angles = p.rotation.slice();
    if (spin) {
      angles[2] += integrate(spin.curve, t, p.life, r[7]);
      if (spin.separate) {
        angles[0] += integrate(spin.x, t, p.life, r[5]);
        angles[1] += integrate(spin.y, t, p.life, r[6]);
      }
    }
    if (emitter.renderMode === 1 && velocity) {
      const vx = curve(velocity.x, progress, r[2]), vy = curve(velocity.y, progress, r[3]);
      if (vx || vy) angles[2] = Math.atan2(vy, vx) - Math.PI / 2;
    }
    const rotation = mulRotation(emitter.alignment === 2 ? node.rotation : identity, euler(...angles));
    const total = uv.x * uv.y;
    const number = Math.floor(Math.fround((p.uv + curve(uv.frame, progress, r[8]) * uv.cycles) * total));
    const frame = (number % total + total) % total;
    const u = frame % uv.x / uv.x, v = Math.floor(frame / uv.x) / uv.y;
    pieces.push({
      position: point(node, offset), width, height, rotation, color, pivot: emitter.pivot,
      texture: emitter.texture, additive: emitter.additive, node: emitter.node, order: emitter.order,
      uv: [u, v, u + 1 / uv.x, v + 1 / uv.y],
    });
  }
  return pieces;
}
