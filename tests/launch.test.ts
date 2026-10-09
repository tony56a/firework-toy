import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONCRETE_SIZE, LAUNCH_BURST_HEIGHT, LAUNCH_CLIMB, LAUNCH_HOLD, PAD_RADIUS, PLUME_LENGTH,
  ROCKET_HEIGHT, SITE_VIEWER_Z, TOWER_OFFSET,
} from '../src/config';
import { launchFinished, launchState, LAUNCH_DURATION } from '../src/models/launch';

test('nothing has happened before the button is pressed', () => {
  for (const t of [0, -1, -100]) {
    const s = launchState(t);
    assert.equal(s.phase, 'idle');
    assert.equal(s.altitude, 0, 'the rocket should be sitting on the pad');
    assert.equal(s.throttle, 0, 'no engine running');
    assert.equal(s.burst, false);
    assert.equal(s.visible, true, 'the rocket should still be drawn');
  }
});

test('the clamps hold it down at first', () => {
  assert.equal(launchState(LAUNCH_HOLD / 2).phase, 'hold');
  assert.equal(launchState(LAUNCH_HOLD / 2).altitude, 0, 'it must not creep up while clamped');
  assert.equal(launchState(LAUNCH_HOLD - 0.01).phase, 'hold');
});

test('the rocket leaves the pad slowly, then gains speed', () => {
  const start = launchState(LAUNCH_HOLD + 0.01);
  const early = launchState(LAUNCH_HOLD + LAUNCH_CLIMB * 0.25);
  const late = launchState(LAUNCH_HOLD + LAUNCH_CLIMB * 0.75);
  assert.ok(start.altitude < early.altitude, 'it should start slow');
  assert.ok(early.altitude < late.altitude);
  // Ease-out at the start: the first quarter of the climb covers less than a quarter of the height.
  assert.ok(
    early.altitude < LAUNCH_BURST_HEIGHT * 0.25,
    `first quarter reached ${early.altitude}, too high for an easing climb`,
  );
});

test('the rocket reaches the burst altitude and bursts once', () => {
  const atTop = launchState(LAUNCH_HOLD + LAUNCH_CLIMB);
  assert.equal(atTop.phase, 'burst');
  assert.ok(Math.abs(atTop.altitude - LAUNCH_BURST_HEIGHT) < 1e-9);
  assert.equal(atTop.burst, true, 'the burst should happen at the top');
  assert.equal(atTop.visible, false, 'the rocket is gone once it bursts');
  // And only that frame: the very next moment must not burst again.
  assert.equal(launchState(LAUNCH_HOLD + LAUNCH_CLIMB + 0.05).burst, false);
  assert.equal(launchState(LAUNCH_HOLD + LAUNCH_CLIMB + 0.5).burst, false);
});

test('the burst happens high enough to read as a launch, and in frame', () => {
  // Above the rocket, so it does not burst on the pad, but below the orbit camera at roughly y=36,
  // or the burst happens behind the viewer. These two constraints are what fix the height.
  assert.ok(LAUNCH_BURST_HEIGHT > ROCKET_HEIGHT, 'it should burst above the rocket');
  assert.ok(LAUNCH_BURST_HEIGHT < 36, 'the orbit camera looks down from about y=36');
});

test('the pad resets after the sequence, so it can launch again', () => {
  assert.ok(launchFinished(LAUNCH_DURATION - 0.01) === false);
  assert.ok(launchFinished(LAUNCH_DURATION), 'it should be over by then');
  assert.ok(launchFinished(LAUNCH_DURATION + 5));
  // Long after everything, it should not keep reporting a burst.
  assert.equal(launchState(LAUNCH_DURATION + 5).burst, false);
});

test('altitude never goes backwards or leaves the world', () => {
  let previous = -1;
  for (let t = 0; t <= LAUNCH_DURATION; t += 1 / 120) {
    const s = launchState(t);
    assert.ok(s.altitude >= previous - 1e-9, `altitude dipped at t=${t}`);
    assert.ok(s.altitude >= 0 && s.altitude <= LAUNCH_BURST_HEIGHT + 1e-9);
    assert.ok(s.throttle >= 0 && s.throttle <= 1, `throttle out of range at t=${t}`);
    previous = s.altitude;
  }
});

test('the sequence is a function of time, so a dropped frame changes nothing', () => {
  // Stepping straight to a time gives the same answer as stepping there in many small pieces. The
  // times avoid the phase boundaries, where a landing either side is a legitimate difference.
  for (const t of [0.5, 1.4, 2.9, 3.6]) {
    const direct = launchState(t);
    let stepped = launchState(0);
    for (let s = 1 / 60; s <= t; s += 1 / 60) stepped = launchState(s);
    assert.equal(direct.phase, stepped.phase);
    assert.ok(Math.abs(direct.altitude - stepped.altitude) < 0.2, `altitude jumped at t=${t}`);
  }
});

test('the engine is lit while it flies and out once it has gone', () => {
  assert.ok(launchState(LAUNCH_HOLD + LAUNCH_CLIMB * 0.5).throttle > 0.5, 'full throttle in flight');
  assert.equal(launchState(LAUNCH_HOLD + LAUNCH_CLIMB).throttle, 0);
  assert.equal(launchState(0).throttle, 0);
});

test('the plume is a sensible length against the rocket', () => {
  // Too long and it reads as a firework, too short and the launch looks unpowered.
  assert.ok(PLUME_LENGTH > 1, 'there should be a visible plume');
  assert.ok(PLUME_LENGTH < ROCKET_HEIGHT, 'the plume should not be longer than the rocket');
});

test('a standing viewer is not standing inside the rocket', () => {
  // The rocket occupies the origin, so an origin-centred viewpoint would be inside it. This is the
  // sort of thing that only shows up as a view from inside a cylinder.
  // Widened to number, or TS folds the constant and rules the comparison unreachable.
  const viewerZ: number = SITE_VIEWER_Z;
  assert.ok(viewerZ !== 0, 'the viewer must be moved off the origin');
  assert.ok(
    Math.abs(SITE_VIEWER_Z) > PAD_RADIUS,
    'the viewer should stand clear of the apron, not on it',
  );
  assert.ok(Math.abs(SITE_VIEWER_Z) < CONCRETE_SIZE / 2 - 2, 'the viewer must still be on the slab');
});

test('the viewer stands opposite the tower, so the rocket is in front of it', () => {
  const viewerZ: number = SITE_VIEWER_Z;
  const towerZ: number = TOWER_OFFSET;
  assert.ok(Math.sign(viewerZ) !== Math.sign(towerZ), 'tower and viewer are on the same side');
});
