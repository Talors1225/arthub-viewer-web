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
