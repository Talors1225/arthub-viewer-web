import assert from 'node:assert/strict';
import { orderedMotionData, installMotionCompatibility, configurePortraitMotions } from '../azurlane-interaction/viewer/portrait-motion.mjs?v=20261114-interaction-export-loading';

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
const loopManager = { createMotion() { return {
 getLoopDuration: () => 6, isLoop: () => true,
 doUpdateParameters(model, time, weight, entry) { entry.setStartTime(time); },
}; } };
configurePortraitMotions(loopManager, {}, { ids: [], defaultValues: [] });
const loopMotion = loopManager.createMotion({}, 'idle');
let start = 0;
const entry = { getStartTime: () => start, setStartTime: value => { start = value; } };
loopMotion.doUpdateParameters({}, 6.04, 1, entry);
assert.equal(start, 6, 'retain the 40ms overshoot instead of restarting the clock late');
loopMotion.doUpdateParameters({}, 18.03, 1, entry);
assert.equal(start, 18, 'preserve phase even after a long delayed update');
let loads = 0, resolveLoad;
const loader = { createMotion: () => ({}), loadMotion() { loads++; return new Promise(resolve => { resolveLoad = resolve; }); } };
configurePortraitMotions(loader, {}, { ids: [], defaultValues: [] });
const firstLoad = loader.loadMotion('idle', 0), duplicateLoad = loader.loadMotion('idle', 0);
assert.equal(firstLoad, duplicateLoad, 'automatic idle and explicit idle share an in-flight request');
await Promise.resolve(); assert.equal(loads, 1); resolveLoad('loaded'); await firstLoad;
const retry = loader.loadMotion('idle', 0); await Promise.resolve();
assert.equal(loads, 2, 'only in-flight requests are held; the runtime owns its loaded cache');
resolveLoad('cached'); await retry;
console.log('Portrait motion compatibility checks passed');
