const curveOrder = { Model: 0, Parameter: 1, PartOpacity: 2 };
const installed = new WeakSet();

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
