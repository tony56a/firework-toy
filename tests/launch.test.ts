import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONCRETE_SIZE, LAUNCH_BURST_DEFAULT, LAUNCH_BURST_MAX, LAUNCH_BURST_MIN, LAUNCH_CLIMB,
  LAUNCH_HOLD, PAD_RADIUS, PLUME_LENGTH, ROCKET_HEIGHT, SITE_VIEWER_Z, TOWER_OFFSET,
} from '../src/config';
import { launchFinished, launchState, LAUNCH_DURATION, shouldTrack } from '../src/models/concrete/launch';

test('nothing has happened before the button is pressed', () => {
  for (const t of [0, -1, -100]) {
    const s = launchState(t);
    assert.equal(s.phase, 'idle');
    assert.equal(s.altitude, 0, 'the rocket should be sitting on the pad');
    assert.equal(s.throttle, 0, 'no engine running');
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
    early.altitude < LAUNCH_BURST_DEFAULT * 0.25,
    `first quarter reached ${early.altitude}, too high for an easing climb`,
  );
});

test('the rocket reaches the burst altitude and then disappears', () => {
  const atTop = launchState(LAUNCH_HOLD + LAUNCH_CLIMB);
  assert.equal(atTop.phase, 'burst');
  assert.ok(Math.abs(atTop.altitude - LAUNCH_BURST_DEFAULT) < 1e-9);
  assert.equal(atTop.visible, false, 'the rocket is gone once it bursts');
});

/**
 * Walks the whole sequence the way the frame loop does, counting transitions into the burst phase.
 * The burst is fired off that transition, so this is the only way to check it fires exactly once.
 */
function countBursts(fps: number, hitch = 0): number {
  const dt = 1 / fps;
  let bursts = 0;
  let previous = launchState(0).phase;
  let elapsed = 0;
  let frame = 0;
  while (elapsed < LAUNCH_DURATION + 1) {
    if (hitch > 0 && frame === Math.floor(fps * 2)) elapsed += hitch;
    const phase = launchState(elapsed).phase;
    if (phase === 'burst' && previous !== 'burst') bursts++;
    previous = phase;
    elapsed += dt;
    frame++;
  }
  return bursts;
}

test('the burst fires exactly once at any frame rate', () => {
  // Regression: firing from a fixed 1/60s window instead of the transition into the burst phase
  // fired nothing at all between roughly 15 and 50fps, because no frame landed inside the window,
  // and fired twice at 120fps, where two frames did. The rocket would rise and vanish in silence.
  for (const fps of [120, 90, 60, 50, 30, 24, 20, 15, 10]) {
    assert.equal(countBursts(fps), 1, `should burst once at ${fps}fps`);
  }
});

test('a dropped frame mid-climb does not swallow the burst', () => {
  // A backgrounded tab or a long GC pause makes one frame take half a second, which steps clean
  // over the top of the climb.
  assert.equal(countBursts(60, 0.5), 1);
  assert.equal(countBursts(30, 1.2), 1);
});

test('every selectable burst height clears the rocket', () => {
  for (const height of [LAUNCH_BURST_MIN, LAUNCH_BURST_DEFAULT, LAUNCH_BURST_MAX]) {
    assert.ok(height > ROCKET_HEIGHT, `a burst at ${height} would be at or below the rocket`);
  }
});

test('the burst goes wherever the chosen height says, not a fixed altitude', () => {
  for (const height of [LAUNCH_BURST_MIN, 90, LAUNCH_BURST_MAX]) {
    const atTop = launchState(LAUNCH_HOLD + LAUNCH_CLIMB, height);
    assert.equal(atTop.phase, 'burst');
    assert.ok(
      Math.abs(atTop.altitude - height) < 1e-9,
      `asked for ${height} but the rocket stopped at ${atTop.altitude}`,
    );
  }
});

test('the climb still eases out at any height', () => {
  // A higher burst must not make liftoff abrupt, so the easing has to scale with the height.
  for (const height of [LAUNCH_BURST_MIN, LAUNCH_BURST_MAX]) {
    const early = launchState(LAUNCH_HOLD + LAUNCH_CLIMB * 0.25, height);
    assert.ok(
      early.altitude < height * 0.25,
      `at ${height} the first quarter reached ${early.altitude}, too high for an easing climb`,
    );
  }
});

test('altitude never leaves the requested range at any height', () => {
  for (const height of [LAUNCH_BURST_MIN, LAUNCH_BURST_MAX]) {
    for (let t = 0; t <= LAUNCH_DURATION; t += 1 / 60) {
      const s = launchState(t, height);
      assert.ok(s.altitude >= 0 && s.altitude <= height + 1e-9, `altitude ${s.altitude} outside 0..${height}`);
    }
  }
});

test('the camera follows the rocket from the moment the clamps hold it', () => {
  // Tracking at the hold rather than at liftoff means the view is already in place and does not
  // cut at the exact moment the rocket moves.
  assert.equal(shouldTrack('hold'), true);
  assert.equal(shouldTrack('climb'), true);
  assert.equal(shouldTrack('burst'), true);
  assert.equal(shouldTrack('idle'), false);
});

test('the pad resets after the sequence, so it can launch again', () => {
  assert.ok(launchFinished(LAUNCH_DURATION - 0.01) === false);
  assert.ok(launchFinished(LAUNCH_DURATION), 'it should be over by then');
  assert.ok(launchFinished(LAUNCH_DURATION + 5));
  // Beyond the end the snapshot keeps reporting the burst, because it is a pure function of
  // elapsed time and has no way to know the view has stopped asking. Coming back to the pad is the
  // view's job: it drops the clock on launchFinished and then reads a negative elapsed time.
  assert.equal(launchState(LAUNCH_DURATION + 5).phase, 'burst');
  assert.equal(launchState(-1).phase, 'idle');
  assert.equal(launchState(-1).visible, true, 'the rocket should be back on the pad');
});

test('altitude never goes backwards or leaves the world', () => {
  let previous = -1;
  for (let t = 0; t <= LAUNCH_DURATION; t += 1 / 120) {
    const s = launchState(t);
    assert.ok(s.altitude >= previous - 1e-9, `altitude dipped at t=${t}`);
    assert.ok(s.altitude >= 0 && s.altitude <= LAUNCH_BURST_DEFAULT + 1e-9);
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
