const curveOrder = { Model: 0, Parameter: 1, PartOpacity: 2 };
const installed = new WeakSet();
const plymouthShirtFold = [
 [103, 37, .84], [102, 94, .81], [89, 94, .83], [90, 95, .74],
 [91, 96, .26], [94, 37, .20], [95, 83, .13],
];

function smoothTaper(value) {
 const t = Math.max(0, Math.min(1, value));
 return t * t * (3 - 2 * t);
}

function tuckPlymouthShirt(vertices, original, riseX, riseY) {
 // The shirt's overlapping shadow mesh extends below the seam by the badge.
 // Tuck its last two rows toward the seam along the actual arm direction.
 const lengthSquared = riseX * riseX + riseY * riseY;
 for (const [vertex, seam, weight] of plymouthShirtFold) {
  const i = vertex * 2, j = seam * 2;
  const distance = (original[j] - original[i]) * riseX + (original[j + 1] - original[i + 1]) * riseY;
  const lift = Math.max(0, distance) / lengthSquared * weight;
  vertices[i] += riseX * lift;
  vertices[i + 1] += riseY * lift;
 }
}

function closePlymouthArmSeam(vertices, shirtFold, originalFold, overlap) {
 // The forearm's skin overlay starts below the upper arm in this pose.
 // Use its own vertices to extend the join towards the shoulder as it moves.
 const cuff = 63 * 2, shoulder = 82 * 2, innerSide = 4 * 2, outerSide = 56 * 2;
 const baseX = vertices[cuff], baseY = vertices[cuff + 1];
 const riseX = vertices[shoulder] - baseX, riseY = vertices[shoulder + 1] - baseY;
 const innerX = vertices[innerSide], innerY = vertices[innerSide + 1];
 const widthX = innerX - vertices[outerSide], widthY = innerY - vertices[outerSide + 1];
 const area = widthX * riseY - widthY * riseX;
 if (!Number.isFinite(area) || Math.abs(area) < 1e-6) return;
 if (shirtFold) tuckPlymouthShirt(shirtFold, originalFold, riseX, riseY);
 for (let i = 0; i < vertices.length; i += 2) {
  const x = vertices[i], y = vertices[i + 1];
  const along = (widthX * (y - baseY) - widthY * (x - baseX)) / area;
  const across = ((innerX - x) * riseY - (innerY - y) * riseX) / area;
  const joinWeight = smoothTaper(along + .03);
  const lift = joinWeight * (.65 - .53 * overlap);
  const slide = joinWeight * smoothTaper(1.55 * across) * (.18 - .12 * overlap);
  vertices[i] += riseX * lift + widthX * slide;
  vertices[i + 1] += riseY * lift + widthY * slide;
 }
}

const naplesElbowEdge = [
 [12, .7], [13, 1], [14, 1], [15, 1], [16, 1], [17, 1], [18, .65],
 [44, .65], [45, 1], [46, 1], [47, 1], [48, 1], [49, .85], [50, .4],
];

// Outer edge vertices approach the matching point of the moving forearm cap.
const naplesElbowJoin = [
 [18, 24, .9], [19, 25, .85], [20, 0, .65],
 [42, 49, .65], [43, 48, .8],
];

function configureNaplesElbow(renderer, drawables, currentMotion) {
 const upperArm = drawables.ids.indexOf('ArtMesh499');
 const forearm = drawables.ids.indexOf('ArtMesh498');
 const upper = drawables.vertexPositions?.[upperArm];
 const lower = drawables.vertexPositions?.[forearm];
 if (upper?.length !== 132 || lower?.length !== 112) return;
 const saved = upper.slice();
 const draw = renderer.doDrawModel;
 renderer.doDrawModel = function (...args) {
  if (!/^idle(?:9|10|11|12)$/.test(currentMotion()) ||
      drawables.opacities[upperArm] < .98 || drawables.opacities[forearm] < .98) return draw.apply(this, args);
  // The upper-arm cap extends beyond the forearm in these bends and draws a
  // second outline. Tuck only its lowest rows under the forearm's inner edge.
  const x = lower[90], y = lower[91];
  const tangentX = lower[94] - x, tangentY = lower[95] - y;
  const length = Math.hypot(tangentX, tangentY);
  if (length < 1e-6) return draw.apply(this, args);
  let nx = -tangentY / length, ny = tangentX / length;
  if ((lower[102] - x) * nx + (lower[103] - y) * ny < 0) { nx = -nx; ny = -ny; }
  const outwardX = lower[48] - lower[102], outwardY = lower[49] - lower[103];
  const outwardLength = Math.hypot(outwardX, outwardY);
  if (outwardLength < 1e-6) return draw.apply(this, args);
  const ox = outwardX / outwardLength, oy = outwardY / outwardLength;
  saved.set(upper);
  try {
   // Keep the bend connected where the outer contour meets the forearm,
   // without moving the shoulder or changing the original draw order.
   for (const [vertex, reference, amount] of naplesElbowJoin) {
    const i = vertex * 2, j = reference * 2;
    const distance = (lower[j] - upper[i]) * ox + (lower[j + 1] - upper[i + 1]) * oy;
    const shift = Math.max(0, Math.min(distance, outwardLength * .55)) * amount;
    upper[i] += ox * shift;
    upper[i + 1] += oy * shift;
   }
   for (const [vertex, weight] of naplesElbowEdge) {
    const i = vertex * 2;
    const distance = (x - upper[i]) * nx + (y - upper[i + 1]) * ny;
    const shift = Math.max(0, Math.min(distance, length * .65)) * weight;
    upper[i] += nx * shift;
    upper[i + 1] += ny * shift;
   }
   return draw.apply(this, args);
  } finally { upper.set(saved); }
 };
}

export function configurePortraitRendering(renderer, drawables, id, currentMotion) {
 if (id === 'nabulesi_3') return configureNaplesElbow(renderer, drawables, currentMotion);
 if (id !== 'pulimaosi_3') return;
 const [elbow, shirt, hand, upperArm, fold, forearm, forearmUnderlay] = [
  'ArtMesh552', 'ArtMesh237', 'ArtMesh550', 'ArtMesh395', 'ArtMesh231', 'ArtMesh392', 'ArtMesh242',
 ]
  .map(name => drawables.ids.indexOf(name));
 if (elbow < 0 || shirt < 0 || hand < 0) return;
 const {renderOrders, opacities} = drawables;
 const savedOrders = renderOrders.slice();
 const elbowVertices = drawables.vertexPositions?.[elbow];
 const savedVertices = elbowVertices?.length === 120 * 2 ? elbowVertices.slice() : null;
 const foldVertices = drawables.vertexPositions?.[fold];
 const savedFold = foldVertices?.length === 185 * 2 ? foldVertices.slice() : null;
 const draw = renderer.doDrawModel;
 renderer.doDrawModel = function (...args) {
  const from = renderOrders[elbow], to = renderOrders[shirt];
  if (!(from < to && to < renderOrders[hand]) ||
      opacities[elbow] < .001 || opacities[shirt] < .001 || opacities[hand] < .001) return draw.apply(this, args);
  // The hand sits in front of the shirt. Draw its elbow connector above the
  // shirt as well, while preserving the order of every other drawable.
  savedOrders.set(renderOrders);
  const joinVisible = savedVertices && upperArm >= 0 && opacities[upperArm] >= .001;
  const foldVisible = joinVisible && savedFold && opacities[fold] >= .001
   && to < renderOrders[fold] && renderOrders[fold] < renderOrders[hand];
  const elbowOpacity = opacities[elbow], underlayOpacity = opacities[forearmUnderlay];
  const forearmOverlap = joinVisible && forearm >= 0 && forearmUnderlay >= 0
   && renderOrders[forearmUnderlay] < renderOrders[forearm] && renderOrders[forearm] < from
   ? smoothTaper(Math.min(opacities[forearm], underlayOpacity) / .56) : 0;
  if (joinVisible) savedVertices.set(elbowVertices);
  if (foldVisible) savedFold.set(foldVertices);
  try {
   for (let i = 0; i < renderOrders.length; i++) {
    if (renderOrders[i] > from && renderOrders[i] <= to) renderOrders[i]--;
   }
   renderOrders[elbow] = to;
   if (joinVisible) closePlymouthArmSeam(elbowVertices, foldVisible ? foldVertices : null, savedFold, forearmOverlap);
   if (forearmOverlap > 0) {
    // The two forearm drawings overlap while the elbow swings out. Reduce the
    // doubled edge as the replacement appears, and shorten the skin extension.
    const underlayFade = smoothTaper((opacities[forearm] - .3) / .63);
    opacities[forearmUnderlay] = underlayOpacity * (1 - forearmOverlap * underlayFade);
    opacities[elbow] = elbowOpacity + .8 * (1 - elbowOpacity) * smoothTaper(elbowOpacity / .6) * forearmOverlap;
   }
   return draw.apply(this, args);
  } finally {
   renderOrders.set(savedOrders);
   if (joinVisible) elbowVertices.set(savedVertices);
   if (foldVisible) foldVertices.set(savedFold);
   if (forearmOverlap > 0) {
    opacities[forearmUnderlay] = underlayOpacity;
    opacities[elbow] = elbowOpacity;
   }
  }
 };
}

export function orderedMotionData(data) {
 const curves = data?.Curves;
 if (!Array.isArray(curves)) return data;
 const rank = curve => curveOrder[curve.Target] ?? 3;
 if (!curves.some((curve, i) => i && rank(curve) < rank(curves[i - 1]))) return data;
 // Cubism reads contiguous target groups and stops a group at the first
 // different target. Converted clips can put EyeBlink between parameters,
 // silently skipping all subsequent parameters (including touch regions).
 return { ...data, Curves: curves.slice().sort((a, b) => rank(a) - rank(b)) };
}

export function installMotionCompatibility(runtime) {
 const prototype = runtime?.Cubism4MotionManager?.prototype;
 if (!prototype || installed.has(prototype)) return;
 const create = prototype.createMotion;
 prototype.createMotion = function (data, ...args) {
  return create.call(this, orderedMotionData(data), ...args);
 };
 installed.add(prototype);
}

export function motionWithDefaults(data, defaults) {
 const curves = data?.Curves;
 if (!Array.isArray(curves)) return data;
 const keyed = new Set(curves.filter(curve => curve.Target === 'Parameter').map(curve => curve.Id));
 const duration = Math.max(0, data.Meta?.Duration || 0);
 const missing = Object.entries(defaults).filter(([id, value]) => !keyed.has(id) && Number.isFinite(value));
 if (!missing.length) return data;
 // Unity's Write Defaults belongs to the incoming state. Include unkeyed
 // parameters in that state's fade instead of snapping the whole model first.
 const extra = missing.map(([Id, value]) => ({ Target: 'Parameter', Id, Segments: [0, value, 0, duration, value] }));
 return orderedMotionData({ ...data, Meta: { ...data.Meta,
  CurveCount: curves.length + extra.length,
  TotalSegmentCount: (data.Meta?.TotalSegmentCount || 0) + extra.length,
  TotalPointCount: (data.Meta?.TotalPointCount || 0) + extra.length * 2,
 }, Curves: [...curves, ...extra] });
}

export function configurePortraitMotions(manager, model, parameters) {
 const load = manager.loadMotion, pending = new Map();
 if (load) manager.loadMotion = function (group, index) {
  const key = JSON.stringify([group, index]);
  if (!pending.has(key)) {
   const task = Promise.resolve().then(() => load.call(this, group, index)).finally(() => pending.delete(key));
   pending.set(key, task);
  }
  return pending.get(key);
 };

 const defaults = Object.fromEntries(parameters.ids.map((id, i) => [id, model.animator?.defaultParameters?.[id] ?? parameters.defaultValues[i]]));
 // Write Defaults is scoped to the layer that owns a state. Adding character
 // defaults to an overlay would erase the base animation on every frame.
 const states = model.animator?.states || {};
 const baseStates = new Set(model.animator?.layers?.[0]?.states || Object.keys(states).filter(name => !/^effect(?:_|$)/.test(name)));
 const resetMotions = new Set(Object.entries(states).filter(([name, state]) => baseStates.has(name) && state.writeDefaults).map(([name, state]) => state.motion || name));
 const create = manager.createMotion;
 manager.createMotion = function (data, group, definition) {
  const motion = create.call(this, resetMotions.has(group) ? motionWithDefaults(data, defaults) : data, group, definition);
  const update = motion.doUpdateParameters;
  if (update) motion.doUpdateParameters = function (model, time, weight, entry) {
   const start = entry.getStartTime(), duration = this.getLoopDuration();
   const result = update.call(this, model, time, weight, entry);
   // Cubism 0.4 rebases loops to the current render time, losing the fraction
   // after the boundary. Keep that fraction without changing authored curves.
   if (this.isLoop() && duration > 0 && Number.isFinite(start) && time - start >= duration) {
    entry.setStartTime(start + Math.floor((time - start) / duration) * duration);
   }
   return result;
  };
  return motion;
 };
 // pixi-live2d's Cubism4 adapter stops the old clip unconditionally. Let the
 // Cubism queue keep it for its authored fade-out, including action -> idle.
 manager._startMotion = function (motion, onFinish) {
  // A cached CubismMotion stores its own loop/evaluation clock. It cannot run
  // in two queue entries at once when Reset/replay chooses the same clip.
  for (const entry of this.queueManager._motions || []) if (entry._motion === motion) entry.setIsFinished(true);
  // Repeat the authored loop directly; a new fade each lap causes a visible pause.
  motion.setIsLoopFadeIn?.(false);
  motion.setFinishedMotionHandler(onFinish);
  return this.queueManager.startMotion(motion, false, performance.now());
 };
}
