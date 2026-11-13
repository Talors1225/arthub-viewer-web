import assert from 'node:assert/strict';
import { orderedMotionData, installMotionCompatibility } from '../azurlane-interaction/viewer/portrait-motion.mjs';

// A converter puts a model curve between character and hit-region parameters.
// The SDK scans Model -> Parameter -> PartOpacity without revisiting a group.
const curves = [
 { Target: 'Parameter', Id: 'Body', Segments: [0, .7] },
 { Target: 'Model', Id: 'EyeBlink', Segments: [0, 1] },
 { Target: 'Parameter', Id: 'NextTouchRegion', Segments: [0, 0] },
 { Target: 'PartOpacity', Id: 'Light', Segments: [0, .5] },
];
const source = { Meta: { CurveCount: curves.length }, Curves: curves };
const snapshot = JSON.stringify(source);
function sdkRead(data) {
 let index = 0; const read = [];
 for (const target of ['Model', 'Parameter', 'PartOpacity']) {
  while (index < data.Meta.CurveCount && data.Curves[index].Target === target) read.push(data.Curves[index++].Id);
 }
 return read;
}
assert.deepEqual(sdkRead(source), ['Body']);
const ordered = orderedMotionData(source);
assert.deepEqual(sdkRead(ordered), ['EyeBlink', 'Body', 'NextTouchRegion', 'Light']);
assert.equal(JSON.stringify(source), snapshot, 'original source data must remain unchanged');
assert.equal(ordered.Meta, source.Meta);
assert.equal(ordered.Curves[2], source.Curves[2], 'keyframes and IDs must remain unchanged');
assert.equal(orderedMotionData(ordered), ordered, 'valid motions need no copy or reorder');
assert.equal(orderedMotionData(null), null);
class Manager { createMotion(data, group) { return { data, group, owner: this }; } }
const runtime = { Cubism4MotionManager: Manager };
installMotionCompatibility(runtime);
const create = Manager.prototype.createMotion;
installMotionCompatibility(runtime);
assert.equal(Manager.prototype.createMotion, create, 'install once across resource switches');
const manager = new Manager(), motion = manager.createMotion(source, 'idle');
assert.equal(motion.owner, manager);
assert.equal(motion.group, 'idle');
assert.deepEqual(sdkRead(motion.data), sdkRead(ordered));
console.log('Portrait motion compatibility checks passed');
