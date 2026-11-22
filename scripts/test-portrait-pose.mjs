import assert from 'node:assert/strict';
import {configurePortraitRendering} from '../azurlane-interaction/viewer/portrait-motion.mjs';

const forearm = new Float32Array(120 * 2);
forearm.set([.5, 0], 63 * 2);
forearm.set([.5, 1], 82 * 2);
forearm.set([1, .4], 4 * 2);
forearm.set([0, .4], 56 * 2);
forearm.set([.5, -.5], 50 * 2);
const fold = new Float32Array(185 * 2);
fold.set([.5, 1], 37 * 2);
fold.set([.5, .5], 103 * 2);
const originalFold = fold.slice();
const drawables = {
 ids: ['ArtMesh552', 'ArtMesh237', 'ArtMesh550', 'ArtMesh395', 'LayerInBetween', 'ArtMesh231'],
 renderOrders: Int32Array.of(0, 3, 5, 1, 2, 4),
 opacities: Float32Array.of(1, 1, 1, 1, 1, 1),
 vertexPositions: [forearm, null, null, null, null, fold],
};
const original = [...drawables.renderOrders];
const originalVertices = forearm.slice();
let drawnVertices, drawnFold;
const renderer = { doDrawModel() {
 drawnVertices = forearm.slice();
 drawnFold = fold.slice();
 return [...drawables.renderOrders];
} };

configurePortraitRendering(renderer, drawables, 'another');
assert.deepEqual(renderer.doDrawModel(), original);
assert.deepEqual(drawnVertices, originalVertices);
assert.deepEqual(drawnFold, originalFold);
configurePortraitRendering(renderer, drawables, 'pulimaosi_3');
const corrected = [3, 2, 5, 0, 1, 4];
assert.deepEqual(renderer.doDrawModel(), corrected);
assert(drawnVertices[82 * 2 + 1] > originalVertices[82 * 2 + 1]);
assert.deepEqual(drawnVertices.slice(50 * 2, 50 * 2 + 2), originalVertices.slice(50 * 2, 50 * 2 + 2));
assert(drawnFold[103 * 2 + 1] > originalFold[103 * 2 + 1]);
assert.deepEqual(drawnFold.slice(0, 37 * 2 + 2), originalFold.slice(0, 37 * 2 + 2));
assert.deepEqual([...drawables.renderOrders], original);
assert.deepEqual(forearm, originalVertices);
assert.deepEqual(fold, originalFold);
drawables.opacities[3] = 0;
assert.deepEqual(renderer.doDrawModel(), corrected);
assert.deepEqual(drawnVertices, originalVertices);
assert.deepEqual(drawnFold, originalFold);
drawables.opacities[3] = 1;
drawables.opacities[0] = 0;
assert.deepEqual(renderer.doDrawModel(), original);
assert.deepEqual(drawnVertices, originalVertices);
drawables.opacities[0] = 1;
drawables.renderOrders.set(corrected);
assert.deepEqual(renderer.doDrawModel(), corrected);

const failingRenderer = { doDrawModel() { throw Error('draw failed'); } };
drawables.renderOrders.set(original);
configurePortraitRendering(failingRenderer, drawables, 'pulimaosi_3');
assert.throws(() => failingRenderer.doDrawModel(), /draw failed/);
assert.deepEqual([...drawables.renderOrders], original);
assert.deepEqual(forearm, originalVertices);
assert.deepEqual(fold, originalFold);

const crossingOrders = Int32Array.of(3, 5, 7, 0, 4, 6, 2, 1);
const crossingOpacities = Float32Array.of(.65, 1, 1, 1, 1, 1, 1, .65);
const crossing = {
 ...drawables,
 ids: [...drawables.ids, 'ArtMesh392', 'ArtMesh242'],
 renderOrders: crossingOrders,
 opacities: crossingOpacities,
};
const originalOrders = crossingOrders.slice(), originalOpacities = crossingOpacities.slice();
const crossingRenderer = { doDrawModel() {
 assert(crossingOpacities[0] > .92, 'cover the duplicate line through the transition');
 assert.equal(crossingOpacities[7], 0, 'the opaque forearm takes over its duplicate underlay');
 const reach = forearm[82 * 2 + 1] - originalVertices[82 * 2 + 1];
 assert(reach > 0 && reach < .2, 'keep a short skin join when the arm swings out');
 throw Error('draw failed during overlap');
} };
configurePortraitRendering(crossingRenderer, crossing, 'pulimaosi_3');
assert.throws(() => crossingRenderer.doDrawModel(), /draw failed during overlap/);
assert.deepEqual(crossingOrders, originalOrders);
assert.deepEqual(crossingOpacities, originalOpacities);
assert.deepEqual(forearm, originalVertices);
assert.deepEqual(fold, originalFold);
console.log('Plymouth arm seam, forearm overlap and rendering restoration passed');
