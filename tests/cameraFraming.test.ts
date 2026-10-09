import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TABLE_DEPTH, TABLE_HEIGHT, TABLE_WIDTH, WORLD_SIZE } from '../src/config';
import { cameraConstants, type CameraFraming } from '../src/models/cameraFraming';

const FOREST: CameraFraming = { radius: WORLD_SIZE / 2, surface: 0 };
const SKY: CameraFraming = {
  radius: Math.hypot(TABLE_WIDTH / 2, TABLE_DEPTH / 2),
  surface: TABLE_HEIGHT,
};

test('the forest keeps the camera distances it always had', () => {
  const k = cameraConstants(FOREST);
  // These are the values CameraRig used to hardcode; the forest must look unchanged.
  assert.ok(Math.abs(k.orbitRadius - 95) < 1, `orbit radius moved to ${k.orbitRadius}`);
  assert.ok(Math.abs(k.overheadHeight - 170) < 2, `overhead moved to ${k.overheadHeight}`);
  assert.ok(Math.abs(k.planeRadius - 75) < 1.5, `plane radius moved to ${k.planeRadius}`);
  assert.ok(Math.abs(k.ridgeX + 70) < 1.5, `ridge x moved to ${k.ridgeX}`);
  assert.ok(Math.abs(k.ridgeZ - 70) < 1.5, `ridge z moved to ${k.ridgeZ}`);
  assert.ok(Math.abs(k.eyeOffset - 1.2) < 0.25, `eye height moved to ${k.eyeOffset}`);
});

test('a small subject is framed much closer than a landscape', () => {
  const forest = cameraConstants(FOREST);
  const sky = cameraConstants(SKY);
  assert.ok(sky.orbitRadius < forest.orbitRadius / 2, 'the table should not be viewed from afar');
  assert.ok(sky.overheadHeight < forest.overheadHeight / 2, 'overhead should scale down too');
});

test('zooming in can never put the camera inside the subject', () => {
  for (const framing of [FOREST, SKY]) {
    const k = cameraConstants(framing);
    assert.ok(k.orbitMin > framing.radius * 0.3, 'minimum orbit is too tight');
    assert.ok(k.orbitMax > k.orbitRadius, 'maximum orbit should exceed the default');
  }
});

test('the diorama viewer stands on the tabletop, above it', () => {
  const k = cameraConstants(SKY);
  assert.ok(k.eyeOffset > 0);
  assert.ok(SKY.surface === TABLE_HEIGHT, 'the surface to stand on should be the tabletop');
});

test('every derived distance is finite, non-zero, and points the right way', () => {
  for (const framing of [FOREST, SKY]) {
    for (const [name, value] of Object.entries(cameraConstants(framing))) {
      assert.ok(Number.isFinite(value), `${name} is not finite`);
      assert.ok(Math.abs(value) > 0, `${name} is zero`);
      // ridgeX is a signed offset from the origin; every other value is a distance.
      if (name !== 'ridgeX') assert.ok(value > 0, `${name} is ${value}`);
    }
  }
  // The ridge camera should sit off to one side, not down the middle.
  assert.ok(cameraConstants(FOREST).ridgeX < 0 && cameraConstants(FOREST).ridgeZ > 0);
  assert.ok(cameraConstants(SKY).ridgeX < 0 && cameraConstants(SKY).ridgeZ > 0);
});
