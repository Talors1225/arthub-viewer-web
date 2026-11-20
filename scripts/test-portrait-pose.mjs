import assert from 'node:assert/strict';
import {configurePortraitRendering} from '../azurlane-interaction/viewer/portrait-motion.mjs';

const forearm = new Float32Array(120 * 2);
forearm.set([.5, 0], 63 * 2);
forearm.set([.5, 1], 82 * 2);
forearm.set([1, .4], 4 * 2);
forearm.set([0, .4], 56 * 2);
forearm.set([.5, -.5], 50 * 2);
const drawables = {
 ids: ['ArtMesh552', 'ArtMesh237', 'ArtMesh550', 'ArtMesh395', 'LayerInBetween'],
 renderOrders: Int32Array.of(0, 3, 4, 1, 2),
 opacities: Float32Array.of(1, 1, 1, 1, 1),
 vertexPositions: [forearm],
};
const original = [...drawables.renderOrders];
const originalVertices = forearm.slice();
let drawnVertices;
const renderer = { doDrawModel() {
 drawnVertices = forearm.slice();
 return [...drawables.renderOrders];
} };

configurePortraitRendering(renderer, drawables, 'another');
assert.deepEqual(renderer.doDrawModel(), original);
assert.deepEqual(drawnVertices, originalVertices);
configurePortraitRendering(renderer, drawables, 'pulimaosi_3');
assert.deepEqual(renderer.doDrawModel(), [3, 2, 4, 0, 1]);
assert(drawnVertices[82 * 2 + 1] > originalVertices[82 * 2 + 1]);
assert.deepEqual(drawnVertices.slice(50 * 2, 50 * 2 + 2), originalVertices.slice(50 * 2, 50 * 2 + 2));
assert.deepEqual([...drawables.renderOrders], original);
assert.deepEqual(forearm, originalVertices);
drawables.opacities[3] = 0;
assert.deepEqual(renderer.doDrawModel(), [3, 2, 4, 0, 1]);
assert.deepEqual(drawnVertices, originalVertices);
drawables.opacities[3] = 1;
drawables.opacities[0] = 0;
assert.deepEqual(renderer.doDrawModel(), original);
assert.deepEqual(drawnVertices, originalVertices);
drawables.opacities[0] = 1;
drawables.renderOrders.set([3, 2, 4, 0, 1]);
assert.deepEqual(renderer.doDrawModel(), [3, 2, 4, 0, 1]);

const failingRenderer = { doDrawModel() { throw Error('draw failed'); } };
drawables.renderOrders.set(original);
configurePortraitRendering(failingRenderer, drawables, 'pulimaosi_3');
assert.throws(() => failingRenderer.doDrawModel(), /draw failed/);
assert.deepEqual([...drawables.renderOrders], original);
assert.deepEqual(forearm, originalVertices);
console.log('Plymouth arm seam, draw order and restoration passed');
