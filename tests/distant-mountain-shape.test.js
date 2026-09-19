import test from 'node:test';
import assert from 'node:assert/strict';
import {distantRidgeHeight as height, distantRidgeColor as color} from '../src/distant-mountain-shape.js';

const zAt = (a, layer) => 1450 + layer * 560 + a * 1150;
test('horizon ranges remain deterministic, continuous and closed at both feet', () => {
 for (let layer = 0; layer < 3; layer++) {
  let max = 0;
  for (let x = -2600; x <= 3300; x += 41) {
   assert.equal(height(x, zAt(0, layer), 0, layer), 0);
   assert.equal(height(x, zAt(1, layer), 1, layer), 0);
   for (let a = .01; a < 1; a += .025) {
    const h = height(x, zAt(a, layer), a, layer);
    assert.ok(Number.isFinite(h) && h >= 0 && h < 900);
    assert.equal(h, height(x, zAt(a, layer), a, layer));
    assert.ok(Math.abs(h - height(x + .01, zAt(a, layer), a, layer)) < .1);
    assert.ok(Math.abs(h - height(x, zAt(a + .00001, layer), a + .00001, layer)) < .1);
    max = Math.max(max, h);
   }
  }
  assert.ok(max > 390 && max < 700, `layer ${layer} has a useful, bounded silhouette: ${max}`);
 }
});

test('ranges have distinct wandering crests and asymmetrical faces at the render-grid scale', () => {
 const profiles = [];
 for (let layer = 0; layer < 3; layer++) {
  const crestPositions = [], heights = [];
  for (let x = -2300; x <= 3000; x += 100) {
   const row = Array.from({length: 55}, (_, k) => height(x, zAt(k / 54, layer), k / 54, layer));
   const highest = Math.max(...row); heights.push(highest);
   crestPositions.push(row.indexOf(highest) / 54);
   for (let k = 1; k < row.length; k++) assert.ok(Math.abs(row[k] - row[k - 1]) < 70, 'no unresolved vertical walls');
  }
  assert.ok(Math.max(...crestPositions) - Math.min(...crestPositions) > .14, 'crest meanders instead of extruding a fixed profile');
  assert.ok(Math.max(...heights) - Math.min(...heights) > 190, 'deep saddles between main peaks');
  profiles.push(heights);
 }
 for (let layer = 1; layer < 3; layer++) assert.ok(profiles[layer].some((h, i) => Math.abs(h - profiles[layer - 1][i]) > 200), 'layers have independent main peaks');
});

test('baked geological colors stay finite with smooth metre-scale variation', () => {
 for (let layer = 0; layer < 3; layer++) for (let x = -2600; x < 3300; x += 73) {
  const rgb = color(x, 330, 2100, .5, .7, -.5, layer);
  const nearby = color(x + .01, 330, 2100, .5, .7, -.5, layer);
  assert.equal(rgb.length, 3);
  rgb.forEach((channel, i) => {
   assert.ok(Number.isFinite(channel) && channel >= .03 && channel < .4);
   assert.ok(Math.abs(channel - nearby[i]) < .0001);
  });
 }
});
