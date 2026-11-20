import assert from 'node:assert/strict';
import { EffectTimeline } from '../azurlane-interaction/viewer/effect-timeline.mjs';

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
timeline.setSpeed(2);
assert.equal(timeline.time, 6, 'changing speed preserves the current phase');
timeline.advance(1); assert.equal(timeline.time, 6, 'changing speed does not unfreeze a fixed effect');
timeline.restart(); timeline.advance(.75);
assert.equal(timeline.time, 1.5, 'restart retains the selected effect speed');
const playing = timeline.snapshot();
timeline.sample({}, 11.5, true);
assert.equal(samples.at(-1).time, 11.5);
assert.deepEqual(timeline.snapshot(), playing, 'export sampling leaves the preview clock intact');
timeline.setSpeed(.5);
timeline.advance(1); assert.equal(timeline.time, 2);
timeline.restore(playing); assert.equal(timeline.speed, 2);
timeline.setSpeed(NaN); assert.equal(timeline.speed, 2);
const effectWithFlipbook = new EffectTimeline(manager, {
 ...motion,
 _motionData:{
  curves:[
   {type:1,id:'Curtain',segmentCount:1,baseSegmentIndex:0},
   {type:1,id:'SpriteFrame',segmentCount:1,baseSegmentIndex:1},
   {type:2,id:'Mask',segmentCount:1,baseSegmentIndex:2},
   {type:1,id:'Constant',segmentCount:1,baseSegmentIndex:3},
   {type:1,id:'Light',segmentCount:2,baseSegmentIndex:4},
  ],
  segments:[
   {basePointIndex:0,segmentType:0},{basePointIndex:2,segmentType:2},
   {basePointIndex:4,segmentType:3},{basePointIndex:6,segmentType:0},
   {basePointIndex:8,segmentType:2},{basePointIndex:9,segmentType:1},
  ],
  points:[0,1,0,7,0,1,.5,.5,0,0,.2,.6,0].map(value=>({value})),
 }
});
assert.deepEqual([...effectWithFlipbook.blendableIds],['Curtain','Light'],
 'export blends continuous effects and leaves flipbook indices and stepped masks on their authored frames');
console.log('Effect loop, playback rate, freeze and restoration checks passed');
