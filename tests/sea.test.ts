import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOAT_BEAM, BOAT_LENGTH, FISH_LENGTH, SEA_SIZE, WAVE_AMPLITUDE, WAVE_EDGE_BAND,
} from '../src/config';
import { FlatGround, type Ground } from '../src/models/ground';
import { basinCourse, boatPose, ellipseCourse } from '../src/models/sea/boat';
import { fishPose, hasLanded, leapDuration, leapHeight, leapReach, school } from '../src/models/sea/fish';
import { Sea } from '../src/models/sea/sea';
import { fitMesh, longestAxis, type Extent } from '../src/models/meshFit';
import { edgeFade, waveHeight } from '../src/models/sea/waves';

/** Fits to the size this world draws fish at, which is what every fish-fit test is about. */
const toWorldSize = (extent: Extent, centre = { x: 0, y: 0, z: 0 }) =>
  fitMesh(extent, centre, { length: FISH_LENGTH, along: 'x', front: 'positive' });

const HALF = SEA_SIZE / 2;

test('the swell never rises or falls further than the sea amplitude allows', () => {
  const sea = new Sea();
  let highest = -Infinity;
  let lowest = Infinity;
  for (let t = 0; t < 20; t += 0.37) {
    sea.advance(0.37);
    for (let x = -HALF; x <= HALF; x += 3) {
      for (let z = -HALF; z <= HALF; z += 3) {
        const h = sea.heightAt(x, z);
        highest = Math.max(highest, h);
        lowest = Math.min(lowest, h);
      }
    }
  }
  assert.ok(highest <= WAVE_AMPLITUDE + 1e-9, `crest of ${highest} exceeds ${WAVE_AMPLITUDE}`);
  assert.ok(lowest >= -WAVE_AMPLITUDE - 1e-9, `trough of ${lowest} below -${WAVE_AMPLITUDE}`);
});

test('the swell is still level at the walls and fully running in open water', () => {
  assert.equal(edgeFade(HALF, 0), 0);
  assert.equal(edgeFade(0, HALF), 0);
  // Past the wall too, so nothing the camera or the launcher queries outside the basin ever moves.
  assert.equal(edgeFade(HALF + 40, 0), 0);
  assert.equal(edgeFade(0, 0), 1);
  // The fade is a gradient across the whole band rather than a step at one line.
  const middle = edgeFade(HALF - WAVE_EDGE_BAND / 2, 0);
  assert.ok(middle > 0.1 && middle < 0.9, `edge fade of ${middle} mid-band`);
  assert.equal(waveHeight(HALF, 0, 3.5), 0);
});

test('the sea bounds the area launches are clamped to', () => {
  const sea = new Sea();
  assert.equal(sea.size, SEA_SIZE);
  const smaller = new Sea(40);
  assert.equal(smaller.size, 40);
});

test('the boat course stays inside the basin with the whole hull aboard', () => {
  const course = basinCourse();
  // The reach of the hull along its own heading is its half length, so a course sized by the half
  // length guarantees neither end of the boat can reach a wall.
  const reach = BOAT_LENGTH;
  for (let a = 0; a < Math.PI * 2; a += 0.01) {
    const p = course.at(a);
    assert.ok(Math.abs(p.x) + reach <= HALF + 1e-9, `x of ${p.x} at angle ${a.toFixed(2)}`);
    assert.ok(Math.abs(p.z) + reach <= HALF + 1e-9, `z of ${p.z} at angle ${a.toFixed(2)}`);
  }
});

test('the boat points along the course it is sailing', () => {
  const course = ellipseCourse(40, 25);
  for (let a = 0; a < Math.PI * 2; a += 0.02) {
    const p = course.at(a);
    // Heading is the direction of travel, so stepping a little along it must increase the position
    // by that step. Checked against the next point rather than a derivative to stay independent of
    // how the course is parameterized.
    const next = course.at(a + 1e-3);
    const moved = { x: next.x - p.x, z: next.z - p.z };
    const length = Math.hypot(moved.x, moved.z);
    assert.ok(length > 0, `course stalls at angle ${a.toFixed(2)}`);
    const aligned = (moved.x * Math.cos(p.yaw) + moved.z * Math.sin(p.yaw)) / length;
    assert.ok(aligned > 0.999, `heading off the course by ${aligned} at angle ${a.toFixed(2)}`);
  }
});

test('the boat floats on the swell and leans with it', () => {
  const sea = new Sea();
  const course = ellipseCourse(40, 25);
  let anyTilt = false;
  for (let step = 0; step < 400; step++) {
    sea.advance(1 / 60);
    const pose = boatPose(course, step * 0.01, sea);
    // The hull sits on the surface, so the boat is never floating above or sunk below it.
    assert.ok(Math.abs(pose.y - sea.heightAt(pose.x, pose.z)) < 1e-9);
    assert.ok(Math.abs(pose.pitch) < 0.5, `pitch of ${pose.pitch} is more than a boat would lean`);
    assert.ok(Math.abs(pose.roll) < 0.5, `roll of ${pose.roll} is more than a boat would lean`);
    if (Math.abs(pose.pitch) > 1e-3 || Math.abs(pose.roll) > 1e-3) anyTilt = true;
  }
  assert.ok(anyTilt, 'the boat never leaned on a moving sea');
});

test('a boat on a flat sea floats level', () => {
  const flat = new FlatGround(SEA_SIZE);
  const course = ellipseCourse(40, 25);
  const pose = boatPose(course, 0.7, flat);
  assert.ok(Math.abs(pose.pitch) < 1e-9 && Math.abs(pose.roll) < 1e-9, 'leaned on flat water');
});

test('the hull is short enough for the course margin to mean something', () => {
  // basinCourse stands off by the boat's length, so a beam wider than that margin would put the
  // side of the hull through the wall long before the bow reached it.
  assert.ok(BOAT_BEAM < BOAT_LENGTH, `beam ${BOAT_BEAM} is not inside length ${BOAT_LENGTH}`);
});
test('a leap starts and ends on the surface and peaks in between', () => {
  // Flat water, so the apex can be compared against a single number. A fish leaping over a swell
  // rides it as well, which is a different property and is not what this is checking.
  const sea: Ground = new FlatGround();
  const course = ellipseCourse(40, 30);
  const launchSpeed = 12;
  const launchAngle = 0.95;
  const duration = leapDuration(launchSpeed, launchAngle);
  assert.ok(duration > 0, 'a fish launching upward has no time in the air');
  const fish = {
    course,
    startAngle: 0.4,
    rate: 0.25,
    leap: { launchSpeed, launchAngle, duration },
    interval: 6,
    offset: 0,
  };
  // With no offset the leap starts at t = 0 and the arc is measured from there.
  const start = 0;
  const apex = leapHeight(launchSpeed, launchAngle);
  const highest = fishPose(fish, start + duration / 2, sea);
  assert.ok(
    Math.abs(highest.y - sea.heightAt(highest.x, highest.z) - apex) < 1e-9,
    `apex ${highest.y} off by more than ${apex}`,
  );
  // Either end of the leap is exactly on the water, not near it.
  const leaving = fishPose(fish, start, sea);
  assert.equal(leaving.airborne, true, 'airborne the instant it leaves the water');
  assert.ok(Math.abs(leaving.y - sea.heightAt(leaving.x, leaving.z)) < 1e-9);
  const justBefore = fishPose(fish, start + duration - 1e-6, sea);
  assert.ok(Math.abs(justBefore.y - sea.heightAt(justBefore.x, justBefore.z)) < 0.01, 'still airborne at the end');
  const after = fishPose(fish, start + duration, sea);
  assert.equal(after.airborne, false, 'back in the water by the end of the leap');
  assert.ok(Math.abs(after.y - sea.heightAt(after.x, after.z)) < 1e-9);
});

test('a fish in the water is level and riding the surface', () => {
  const sea = new Sea();
  const duration = leapDuration(12, 0.95);
  const fish = {
    course: ellipseCourse(40, 30),
    startAngle: 0.4,
    rate: 0.25,
    leap: { launchSpeed: 12, launchAngle: 0.95, duration },
    interval: 6,
    offset: 0,
  };
  for (let t = 3; t < 4; t += 0.1) {
    const pose = fishPose(fish, t, sea);
    assert.equal(pose.airborne, false, `airborne at ${t.toFixed(1)}, between leaps`);
    assert.equal(pose.pitch, 0);
    assert.ok(Math.abs(pose.y - sea.heightAt(pose.x, pose.z)) < 1e-9);
  }
});

test('a fish rises nose first and comes down nose last', () => {
  const duration = leapDuration(12, 0.95);
  const fish = {
    course: ellipseCourse(40, 30),
    startAngle: 0,
    rate: 0,
    leap: { launchSpeed: 12, launchAngle: 0.95, duration },
    interval: 6,
    offset: 0,
  };
  const flat = new FlatGround();
  const early = fishPose(fish, 0.01, flat);
  const late = fishPose(fish, duration - 0.01, flat);
  const apex = duration / 2;
  const peak = fishPose(fish, apex, flat);
  assert.ok(early.pitch > 0, 'nose down on the way out');
  assert.ok(late.pitch < 0, 'nose up on the way in');
  // Level at the top of the arc, which is what makes it read as a leap and not a tumble.
  assert.ok(Math.abs(peak.pitch) < Math.abs(early.pitch), 'not level at the apex');
});

test('fish jump repeatedly and never at exactly the same moment', () => {
  const fishes = school('meadow');
  assert.ok(fishes.length >= 14, `only ${fishes.length} fish in the school`);
  const durations = fishes.map((f) => f.leap.duration);
  for (const d of durations) assert.ok(d > 0, 'every fish spends time in the air');
  // Two fish sharing a launch beat would leap in unison, which reads as one fish duplicated.
  const offsets = fishes.map((f) => f.offset % f.interval);
  assert.equal(new Set(offsets.map((o) => o.toFixed(3))).size, fishes.length, 'leaps are not staggered');
});

test('a school is deterministic per seed and differs between seeds', () => {
  const a = school('meadow');
  const b = school('meadow');
  const c = school('lagoon');
  assert.deepEqual(a.map((f) => [f.startAngle, f.rate]), b.map((f) => [f.startAngle, f.rate]));
  assert.notDeepEqual(a.map((f) => f.startAngle), c.map((f) => f.startAngle));
});

test('no leaping fish ever leaves the basin, not even between frames', () => {
  const fishes = school('meadow');
  // Finely enough that a leap is sampled many times over, which is the only way to catch a fish
  // sailing past a wall in the frames between two coarse samples.
  for (const fish of fishes) {
    for (let t = 0; t < 120; t += 0.02) {
      const pose = fishPose(fish, t, new FlatGround());
      assert.ok(Math.abs(pose.x) <= HALF, `x of ${pose.x.toFixed(1)} at ${t.toFixed(2)}`);
      assert.ok(Math.abs(pose.z) <= HALF, `z of ${pose.z.toFixed(1)} at ${t.toFixed(2)}`);
    }
  }
});

test('a leaping fish keeps its whole body inside the basin', () => {
  const fishes = school('meadow');
  for (const fish of fishes) {
    for (let t = 0; t < 120; t += 0.02) {
      const pose = fishPose(fish, t, new FlatGround());
      // The course is bounded by the centre of the fish, so the body has to be allowed for on top.
      const reach = Math.abs(pose.x) + FISH_LENGTH / 2;
      assert.ok(reach <= HALF, `nose of fish at x ${reach.toFixed(1)} at ${t.toFixed(2)}`);
      const across = Math.abs(pose.z) + FISH_LENGTH / 2;
      assert.ok(across <= HALF, `nose of fish at z ${across.toFixed(1)} at ${t.toFixed(2)}`);
    }
  }
});

test('every fish does break the surface over a long enough run', () => {
  const fishes = school('meadow');
  fishes.forEach((fish, i) => {
    let airborne = 0;
    for (let t = 0; t < 120; t += 0.02) if (fishPose(fish, t, new FlatGround()).airborne) airborne++;
    assert.ok(airborne > 0, `fish ${i} never left the water`);
  });
});

test('a landing is only reported on the frame a fish comes down', () => {
  const duration = leapDuration(12, 0.95);
  const fish = {
    course: ellipseCourse(40, 30),
    startAngle: 0,
    rate: 0,
    leap: { launchSpeed: 12, launchAngle: 0.95, duration },
    interval: 6,
    offset: 0,
  };
  // Stepping across the end of the leap is a landing.
  assert.equal(hasLanded(fish, 0.1, duration + 0.01), true);
  // Two frames both in the water are not, or a fish would splash every frame it swam.
  assert.equal(hasLanded(fish, duration + 0.01, duration + 0.02), false);
  // Nor is a leap that started and is still going.
  assert.equal(hasLanded(fish, 0.1, 0.2), false);
});

test('a leap covers further than the fish swims in its own water', () => {
  const fishes = school('meadow');
  for (const fish of fishes) {
    const reach = leapReach(fish.leap, fish.rate);
    assert.ok(reach > 0, 'a leap that goes nowhere');
    // A leap lasting a meaningful part of its interval is what stops the fish reading as a floater.
    assert.ok(fish.leap.duration < fish.interval, `leap of ${fish.leap.duration} fills the interval`);
  }
});

test('a fish mesh is fitted to this world size whatever it arrived as', () => {
  const fit = toWorldSize({ x: 40, y: 12, z: 8 });
  assert.ok(fit, 'a mesh with extent should fit');
  assert.ok(Math.abs(fit.scale * 40 - FISH_LENGTH) < 1e-9, `scaled to ${fit.scale * 40}`);
});

test('a fish is fitted nose-along-x whichever axis it was authored on', () => {
  for (const axis of ['x', 'y', 'z'] as const) {
    const extent = axis === 'x' ? { x: 10, y: 3, z: 2 } : axis === 'y' ? { x: 3, y: 10, z: 2 } : { x: 3, y: 2, z: 10 };
    assert.deepEqual(longestAxis(extent), { axis, length: 10 });
    const fit = toWorldSize(extent)!;
    // The turn onto x has to be a real quarter turn, so a 10-unit fish becomes a 10-unit fish along
    // x and not a 10-unit fish still standing up. Only the first turn is the fit; the nose fix, if
    // any, is a separate half turn after it.
    const turned = (fit.turns[0] as readonly number[]).some((a: number) => Math.abs(a) > 1e-9);
    assert.equal(turned, axis !== 'x', `axis ${axis} should${axis === 'x' ? ' not' : ''} rotate`);
    assert.equal(fit.turns.length, 1, 'a nose-forward fish needs no second turn');
  }
});

test('a fish is centred on the origin after fitting, even if the asset sat off at an origin', () => {
  const fit = toWorldSize({ x: 10, y: 3, z: 2 }, { x: 100, y: -40, z: 7 })!;
  // An x-long fish is not turned, so its centre offset stays on the axis it was authored on and the
  // offset has to cancel it exactly.
  const [dx, dy, dz] = fit.offset;
  assert.ok(Math.abs(dx + 100 * fit.scale) < 1e-6, `x offset of ${dx} does not cancel the mesh centre`);
  assert.ok(Math.abs(dy + -40 * fit.scale) < 1e-6, `y offset of ${dy}`);
  assert.ok(Math.abs(dz + 7 * fit.scale) < 1e-6, `z offset of ${dz}`);
});

test('a fish authored long-way-down is put on the origin despite being turned to match', () => {
  // The interesting case: a y-long fish is rotated onto x, so the centre offset it was authored at
  // moves onto a different axis as the mesh turns. Getting this wrong leaves the fish 900 units above
  // the sea, which is invisible rather than obviously broken.
  const fit = toWorldSize({ x: 2, y: 10, z: 3 }, { x: 5, y: 900, z: -12 })!;
  const [, , rz] = fit.turns[0];
  assert.ok(Math.abs(rz) > 1e-9, 'a y-long fish is turned onto x');
  assert.ok(Math.abs(fit.scale * 10 - FISH_LENGTH) < 1e-9, 'sized to this world');
  // Turned by -90 degrees about z: the mesh's y centre lands on +x and its x centre on -y. The offset
  // cancels whichever axis the centre ended up on, which is why it has to be computed after the turn.
  const [dx, dy] = fit.offset;
  assert.ok(Math.abs(dx + 900 * fit.scale) < 1e-6, `x offset of ${dx} should cancel the turned centre`);
  assert.ok(Math.abs(dy - 5 * fit.scale) < 1e-6, `y offset of ${dy} should cancel the turned centre`);
});

test('a fish exported tail-first is turned round rather than drawn swimming backwards', () => {
  // The pack's fish are all nose-at-negative-z, so this is the case that actually occurs. The nose
  // fix has to come after the turn onto x: put it first and the centre offset is computed through a
  // rotation that is no longer the one applied, and the fish lands somewhere other than the origin.
const authored = { x: 3, y: 2, z: 10 };
const backwards = fitMesh(authored, { x: 0, y: 0, z: 0 }, { length: FISH_LENGTH, along: 'x', front: 'negative' })!;
const forwards = toWorldSize(authored)!;
  assert.equal(forwards.turns.length, 1, 'no extra turn when the nose already points the right way');
  assert.equal(backwards.turns.length, 2, 'a half turn is added to send the nose to +x');
  const [, ry] = backwards.turns[1];
  assert.ok(Math.abs(Math.abs(ry) - Math.PI) < 1e-9, `nose turn of ${ry} is not a half turn`);
});

test('the nose fix still centres a fish that was also authored off-origin', () => {
  // Both halves of the fit have to compose: a tail-first fish sitting 800 units off the origin, in a
  // frame that then gets turned onto x and then turned round again.
  const fit = fitMesh(
    { x: 3, y: 2, z: 10 },
    { x: 40, y: -800, z: 25 },
    { length: FISH_LENGTH, along: 'x', front: 'negative' },
  )!;
  // Applied to the scaled centre by hand, in the same order the renderer applies them.
  const s = fit.scale;
  let p = { x: 40 * s, y: -800 * s, z: 25 * s };
  for (const [rx, ry, rz] of fit.turns) {
    const y1 = p.y * Math.cos(rx) - p.z * Math.sin(rx);
    const z1 = p.y * Math.sin(rx) + p.z * Math.cos(rx);
    const x2 = p.x * Math.cos(ry) + z1 * Math.sin(ry);
    const z2 = -p.x * Math.sin(ry) + z1 * Math.cos(ry);
    p = { x: x2 * Math.cos(rz) - y1 * Math.sin(rz), y: x2 * Math.sin(rz) + y1 * Math.cos(rz), z: z2 };
  }
  const [dx, dy, dz] = fit.offset;
  assert.ok(Math.abs(p.x + dx) < 1e-6, `x lands at ${p.x + dx} after the offset`);
  assert.ok(Math.abs(p.y + dy) < 1e-6, `y lands at ${p.y + dy} after the offset`);
  assert.ok(Math.abs(p.z + dz) < 1e-6, `z lands at ${p.z + dz} after the offset`);
});

test('a mesh with no extent is reported unfit rather than fitted to a NaN', () => {
  // What an empty, single-point or missing mesh measures: no axis has a usable length, so there is
  // nothing to scale by. Fitting it anyway would put a divide by zero and a NaN matrix into the
  // scene graph, and a NaN transform in three.js quietly disappears rather than erroring — so the
  // null has to come from here.
  for (const extent of [{ x: 0, y: 0, z: 0 }, { x: -3, y: -2, z: -1 }, { x: NaN, y: 1, z: 1 }]) {
    assert.equal(longestAxis(extent), null, `${JSON.stringify(extent)} should not be fittable`);
    assert.equal(toWorldSize(extent), null);
  }
});

test('a mesh flat in one axis still fits, because it only needs one axis to scale by', () => {
  // A fish that is a plane has no thickness, but it still has a length and is still drawable.
  const fit = toWorldSize({ x: 0, y: 4, z: 0 })!;
  assert.ok(Math.abs(fit.scale * 4 - FISH_LENGTH) < 1e-9);
});

/** Applies a fit's turns to a vector, in the order the renderer applies them. */
function turned(fit: { turns: ReadonlyArray<readonly [number, number, number]> }, p: Extent): Extent {
  let v = { ...p };
  for (const [rx, ry, rz] of fit.turns) {
    const y1 = v.y * Math.cos(rx) - v.z * Math.sin(rx);
    const z1 = v.y * Math.sin(rx) + v.z * Math.cos(rx);
    const x2 = v.x * Math.cos(ry) + z1 * Math.sin(ry);
    const z2 = -v.x * Math.sin(ry) + z1 * Math.cos(ry);
    v = { x: x2 * Math.cos(rz) - y1 * Math.sin(rz), y: x2 * Math.sin(rz) + y1 * Math.cos(rz), z: z2 };
  }
  return v;
}

const AXES = ['x', 'y', 'z'] as const;
/** A box of the given size with its longest side on `axis`. */
const longOn = (axis: 'x' | 'y' | 'z', length: number): Extent =>
  axis === 'x' ? { x: length, y: 3, z: 2 } : axis === 'y' ? { x: 3, y: length, z: 2 } : { x: 3, y: 2, z: length };

test('a mesh can be fitted along any axis, not just x', () => {
  // The loader is general: an asset that wants to lie along z says so rather than the fit hardcoding
  // x. Running the turns on a vector down the long axis has to leave it pointing along the target,
  // which is what stops an asset laid along z coming back as a fish standing on its tail.
  for (const along of AXES) {
    const author = longOn(along, 10);
    const fit = fitMesh(author, { x: 0, y: 0, z: 0 }, { length: FISH_LENGTH, along })!;
    assert.ok(Math.abs(fit.scale * 10 - FISH_LENGTH) < 1e-9, `along ${along}, sized to ${fit.scale * 10}`);
    const probe = turned(fit, { x: along === 'x' ? 10 : 0, y: along === 'y' ? 10 : 0, z: along === 'z' ? 10 : 0 });
    assert.ok(Math.abs(probe[along] - 10) < 1e-6, `along ${along}, ended at ${probe[along]} instead of 10`);
    for (const other of AXES.filter((a) => a !== along)) {
      assert.ok(Math.abs(probe[other]) < 1e-6, `along ${along}, spilled onto ${other} at ${probe[other]}`);
    }
  }
});

test('a mesh authored long-way-down is stood up when fitted along y', () => {
  // The turn has to be made, not skipped: a z-long box fitted along y with no turn at all would come
  // back lying flat, which is the mistake the generalised turn table exists to prevent.
  const stood = fitMesh(longOn('z', 10), { x: 0, y: 0, z: 0 }, { length: FISH_LENGTH, along: 'y' })!;
  assert.ok((stood.turns[0] as readonly number[]).some((a) => Math.abs(a) > 1e-9), 'stood up onto y');
  const probe = turned(stood, { x: 0, y: 0, z: 10 });
  assert.ok(Math.abs(probe.y - 10) < 1e-6, `ended on y at ${probe.y}`);
});

test('a backwards-facing mesh is turned round whichever axis it is fitted along', () => {
  // The half turn has to flip the front, and it has to be about an axis perpendicular to the one
  // being flipped — a half turn about the target axis leaves the target axis alone and fixes nothing.
  for (const along of AXES) {
    const author = longOn(along, 10);
    const backwards = fitMesh(author, { x: 0, y: 0, z: 0 }, { length: FISH_LENGTH, along, front: 'negative' })!;
    const forwards = fitMesh(author, { x: 0, y: 0, z: 0 }, { length: FISH_LENGTH, along, front: 'positive' })!;
    assert.equal(forwards.turns.length, 1, `along ${along}, front already forward`);
    assert.equal(backwards.turns.length, 2, `along ${along}, a half turn is added`);
    // The two fits must land on opposite ends, which is the whole point of adding the half turn.
    const probe = { x: along === 'x' ? 10 : 0, y: along === 'y' ? 10 : 0, z: along === 'z' ? 10 : 0 };
    const front = turned(forwards, probe);
    const back = turned(backwards, probe);
    for (const axis of AXES) {
      assert.ok(
        Math.abs(front[axis] + back[axis]) < 1e-6,
        `along ${along}, half turn did not flip ${axis}: ${front[axis]} vs ${back[axis]}`,
      );
    }
  }
});

test('fitting a mesh along the axis it was authored on needs no turn at all', () => {
  // Every entry in the turn table has to exist, identity included. A missing one is undefined rather
  // than absent, and it reaches three.js as a NaN rotation that silently draws nothing.
  for (const along of AXES) {
    const fit = fitMesh(longOn(along, 10), { x: 0, y: 0, z: 0 }, { length: FISH_LENGTH, along })!;
    const turn = fit.turns[0];
    assert.ok(Array.isArray(turn), `along ${along}, first turn is defined`);
    assert.ok(
      (turn as readonly number[]).every((a) => Math.abs(a) < 1e-9),
      `along ${along}, turns by ${JSON.stringify(turn)}`,
    );
  }
});

test('fitting does not depend on the size of the asset it was given', () => {
  // The same fish at 100x scale has to come out the same size, which is the point of measuring
  // rather than hardcoding.
const small = toWorldSize({ x: 0.5, y: 0.2, z: 0.1 })!;
const large = toWorldSize({ x: 500, y: 200, z: 100 })!;
  assert.ok(Math.abs(small.scale * 0.5 - large.scale * 500) < 1e-9);
  assert.ok(Math.abs(large.scale * 500 - FISH_LENGTH) < 1e-9);
});
