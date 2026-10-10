import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { CameraRig } from '../src/render/camera/rig';
import { CONCRETE_GROUND } from '../src/models/concrete';
import {
  LAUNCH_BURST_MAX, LAUNCH_BURST_MIN, TABLE_DEPTH, TABLE_HEIGHT, TABLE_WIDTH, WORLD_SIZE,
} from '../src/config';
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

test('a tracked point stays on screen across the whole burst height range', () => {
  // The reason the camera follows the rocket: with a fixed view, a burst at 150 is far above any
  // camera that also has to keep the pad in shot. Projecting the target checks it is actually in
  // frame, which is the property that matters and is easy to break by moving the rig.
  const rig = new CameraRig();
  rig.setFraming({ radius: 65, surface: 0, eye: { x: 0, z: -30 } });
  rig.setAspect(1.6);
  const point = new THREE.Vector3();

  for (const height of [LAUNCH_BURST_MIN, LAUNCH_BURST_MAX]) {
    for (const y of [0, height * 0.25, height * 0.5, height]) {
      rig.setTracking({ x: 0, y, z: 0 });
      rig.update(1 / 60, CONCRETE_GROUND);
      // project() needs the world matrix, and nothing renders in a unit test.
      rig.camera.updateMatrixWorld();
      point.set(0, y, 0).project(rig.camera);
      assert.ok(Math.abs(point.x) <= 1, `tracked point left the frame sideways at y=${y}`);
      assert.ok(Math.abs(point.y) <= 1, `tracked point left the frame vertically at y=${y}`);
    }
  }
});

test('tracking takes precedence over the mode, and clearing it gives the mode back', () => {
  const rig = new CameraRig();
  rig.setFraming({ radius: 65, surface: 0, eye: { x: 0, z: -30 } });
  rig.setAspect(1.6);
  rig.setMode('overhead');

  rig.update(1 / 60, CONCRETE_GROUND);
  const overhead = rig.camera.position.clone();

  rig.setTracking({ x: 0, y: 80, z: 0 });
  assert.equal(rig.isTracking, true);
  rig.update(1 / 60, CONCRETE_GROUND);
  const tracking = rig.camera.position.clone();
  assert.ok(tracking.distanceTo(overhead) > 1, 'tracking should move the camera off the mode');

  rig.setTracking(null);
  assert.equal(rig.isTracking, false);
  rig.update(1 / 60, CONCRETE_GROUND);
  assert.ok(
    rig.camera.position.distanceTo(overhead) < 0.001,
    'the original mode should be restored exactly',
  );
});

test('the tracking camera never sinks below the ground', () => {
  // A low burst would otherwise put the camera underground while looking up at the rocket.
  const rig = new CameraRig();
  rig.setFraming({ radius: 65, surface: 0, eye: { x: 0, z: -30 } });
  rig.setAspect(1.6);
  for (const y of [0, 1, 5, LAUNCH_BURST_MIN]) {
    rig.setTracking({ x: 0, y, z: 0 });
    rig.update(1 / 60, CONCRETE_GROUND);
    assert.ok(rig.camera.position.y > 0, `camera sank to y=${rig.camera.position.y} tracking y=${y}`);
  }
});
