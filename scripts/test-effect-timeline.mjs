import assert from 'node:assert/strict';
import { EffectTimeline } from '../azurlane-interaction/viewer/effect-timeline.mjs?v=20261114-interaction-export-loading';

const item = {};
for (const key of ['IsAvailable', 'IsFinished', 'IsStarted', 'StartTime', 'EndTime', 'FadeInStartTime', 'LastCheckEventSeconds']) {
 item['set' + key] = value => { item[key] = value; };
}
const samples = [];
const manager = { startMotion: () => item, doUpdateMotion(model, time) {
 samples.push({ time, start: item.StartTime, fade: item.FadeInStartTime });
 // Simulate the SDK mutating its queue entry at a boundary.
 item.StartTime = time;
} };
let loopFade;
const motion = { getLoopDuration: () => 12, setIsLoop() {}, setIsLoopFadeIn: value => { loopFade = value; }, getFadeInTime: () => 1, _motionData: { curves: [] } };
const timeline = new EffectTimeline(manager, motion);
assert.equal(loopFade, false);
timeline.advance(11.99); timeline.sample({});
timeline.advance(.03); timeline.sample({});
assert.ok(Math.abs(timeline.time - .02) < 1e-10, 'preserve overshoot at a loop boundary');
assert.equal(samples[1].start, 0, 'reset SDK bookkeeping, not animation phase');
assert.ok(samples[1].time - samples[1].fade > 1, 'do not fade in every loop');
timeline.seek(6); const snapshot = timeline.snapshot();
timeline.advance(10); assert.equal(timeline.time, 6, 'fixed effect does not advance');
timeline.setFixed(false); timeline.advance(.25); assert.equal(timeline.time, 6.25);
timeline.restore(snapshot); assert.equal(timeline.time, 6); assert.equal(timeline.fixed, true);
console.log('Effect loop, overshoot, freeze and restoration checks passed');
