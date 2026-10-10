import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACACIA_HEIGHT, GRAZE_BOB, MAX_HERD, SAVANNA_SIZE } from '../src/config';
import { scatterAcacias } from '../src/models/savanna/acacias';
import { Savanna } from '../src/models/savanna/ground';
import {
  GRAZER_KINDS, GRAZER_SPECS, grazeAngle, grazerPose, herd, type Grazer, type GrazerKind,
} from '../src/models/savanna/grazer';
import { FlatGround } from '../src/models/ground';

const HALF = SAVANNA_SIZE / 2;

test('the plain is flat enough to be a plain', () => {
  const savanna = new Savanna('meadow');
  // A savanna is not a hill country. The forest's relief is 22 units; this has to stay well under
  // it or the herd ends up walking up and down slopes and the scene reads as moorland.
  let lowest = Infinity;
  let highest = -Infinity;
  for (let i = 0; i <= 40; i++) {
    for (let j = 0; j <= 40; j++) {
      const h = savanna.heightAt(-HALF + i * 5, -HALF + j * 5);
      lowest = Math.min(lowest, h);
      highest = Math.max(highest, h);
    }
  }
  assert.ok(highest - lowest < 6, `relief of ${(highest - lowest).toFixed(1)} is too hilly`);
});

test('the plain is level at its rim, so the herd boundary is an edge rather than a slope', () => {
  const savanna = new Savanna('meadow');
  // Measured as the spread of heights over an area, not as one height against another: two single
  // points differ by the noise alone and say nothing about how bumpy the ground is around them.
  const spread = (cx: number, cz: number) => {
    let lowest = Infinity;
    let highest = -Infinity;
    for (let i = -6; i <= 6; i++) {
      for (let j = -6; j <= 6; j++) {
        const h = savanna.heightAt(cx + i * 3, cz + j * 3);
        lowest = Math.min(lowest, h);
        highest = Math.max(highest, h);
      }
    }
    return highest - lowest;
  };
  const middle = spread(0, 0);
  const rim = spread(HALF * 0.75, HALF * 0.75);
  assert.ok(rim < middle, `rim spread ${rim.toFixed(2)} is not flatter than the middle's ${middle.toFixed(2)}`);
  // And the plain has to end close to level, or the last animal before the boundary is on a bank.
  assert.ok(Math.abs(savanna.heightAt(HALF, HALF)) < 0.6, `the rim sits at ${savanna.heightAt(HALF, HALF)}`);
});

test('the plain is deterministic per seed and differs between seeds', () => {
  const a = new Savanna('meadow');
  const b = new Savanna('meadow');
  const c = new Savanna('savanna');
  const at = (s: Savanna) => [s.heightAt(10, 20), s.heightAt(-30, 40), s.acaciaDensity(5, 5)];
  assert.deepEqual(at(a), at(b), 'the same seed must give the same plain');
  assert.notDeepEqual(at(a), at(c), 'a different seed should give a different plain');
});

test('grass weights stay in their documented range', () => {
  const savanna = new Savanna('meadow');
  for (let i = 0; i < 300; i++) {
    const w = savanna.grassWeights(-HALF + (i / 300) * SAVANNA_SIZE, i * 1.7 - HALF);
    for (const [name, value] of Object.entries(w)) {
      assert.ok(value >= 0 && value <= 1.5, `${name} of ${value} is out of range`);
    }
  }
});

test('acacias are scattered, capped and kept apart', () => {
  const savanna = new Savanna('meadow');
  const trees = scatterAcacias(savanna, 'meadow', 400);
  assert.ok(trees.length > 0, 'no acacias were placed at all');
  assert.ok(trees.length <= 400, `placed ${trees.length}, asked for 400`);
  for (const tree of trees) {
    assert.ok(Math.abs(tree.x) <= HALF && Math.abs(tree.z) <= HALF, `at ${tree.x},${tree.z}`);
    // Standing on the ground rather than floating over it or buried in it.
    assert.ok(Math.abs(tree.y - savanna.heightAt(tree.x, tree.z)) < 1e-9, 'not on the ground');
    assert.ok(tree.tiltX < 0.08 && tree.tiltX > -0.08, `tilt of ${tree.tiltX} is past leaning over`);
  }
  for (let i = 1; i < trees.length; i++) {
    for (let j = 0; j < i; j++) {
      const gap = Math.hypot(trees[i].x - trees[j].x, trees[i].z - trees[j].z);
      // The canopy is broad, so two acacias closer than a few metres read as one hedge.
      assert.ok(gap > 9, `two acacias ${gap.toFixed(1)} apart`);
    }
  }
});

test('raising the acacia count only adds trees, and never moves the ones already there', () => {
  const savanna = new Savanna('meadow');
  const few = scatterAcacias(savanna, 'meadow', 60);
  const more = scatterAcacias(savanna, 'meadow', 240);
  assert.ok(more.length > few.length, 'asking for more gave fewer');
  for (const tree of few) {
    const same = more.some((m) => m.x === tree.x && m.z === tree.z);
    assert.ok(same, `the acacia at ${tree.x},${tree.z} moved when the count rose`);
  }
});

test('a herd is deterministic per seed and differs between seeds', () => {
  const a = herd('meadow', 12);
  const b = herd('meadow', 12);
  const c = herd('savanna', 12);
  const at = (h: readonly Grazer[]) => h.map((g) => `${g.kind}@${g.homeX.toFixed(3)},${g.homeZ.toFixed(3)}`);
  assert.deepEqual(at(a), at(b), 'the same seed must give the same herd');
  assert.notDeepEqual(at(a), at(c), 'a different seed should give a different herd');
});

test('the herd is dealt round all three kinds however many there are', () => {
  for (const size of [1, 2, 3, 7, 15, MAX_HERD]) {
    const kinds = new Set(herd('meadow', size).map((g) => g.kind));
    const expected = Math.min(size, GRAZER_KINDS.length);
    assert.equal(kinds.size, expected, `size ${size} drew ${kinds.size} kinds, wanted ${expected}`);
  }
});

test('a herd of zero is an empty herd rather than an error', () => {
  assert.equal(herd('meadow', 0).length, 0);
});

test('every grazer stays inside the plain, and never further from home than it was given', () => {
  // This is the property the whole wander is built for: reachX and reachZ are stated as the bound,
  // so the test can assert the bound directly rather than searching for a maximum.
  const grazers = herd('meadow', MAX_HERD);
  for (const grazer of grazers) {
    for (let t = 0; t < 240; t += 0.37) {
      const pose = grazerPose(grazer, t, new FlatGround(SAVANNA_SIZE));
      assert.ok(
        Math.abs(pose.x - grazer.homeX) <= grazer.reachX + 1e-9,
        `x strayed ${Math.abs(pose.x - grazer.homeX).toFixed(2)} past its reach of ${grazer.reachX}`,
      );
      assert.ok(
        Math.abs(pose.z - grazer.homeZ) <= grazer.reachZ + 1e-9,
        `z strayed ${Math.abs(pose.z - grazer.homeZ).toFixed(2)} past its reach of ${grazer.reachZ}`,
      );
      assert.ok(Math.abs(pose.x) <= HALF && Math.abs(pose.z) <= HALF, `left the plain at ${pose.x},${pose.z}`);
    }
  }
});

test('a grazer stands on the ground it is posed over', () => {
  const savanna = new Savanna('meadow');
  const grazers = herd('meadow', 12);
  for (const grazer of grazers) {
    for (let t = 0; t < 20; t += 1.1) {
      const pose = grazerPose(grazer, t, savanna);
      assert.ok(Math.abs(pose.y - savanna.heightAt(pose.x, pose.z)) < 1e-9, 'not standing on the ground');
    }
  }
});

test('a grazer faces the way it is going', () => {
  // Yaw is the instantaneous heading, so it has to agree with a short step along the path rather
  // than a long one: on a wandering curve the animal has genuinely turned by the time it is a third
  // of a second ahead, and comparing against that would fail on a heading that is not wrong.
  const savanna = new Savanna('meadow');
  for (const grazer of herd('meadow', 12)) {
    for (let t = 0; t < 20; t += 0.83) {
      const pose = grazerPose(grazer, t, savanna);
      const ahead = grazerPose(grazer, t + 0.02, savanna);
      const step = Math.hypot(ahead.x - pose.x, ahead.z - pose.z);
      if (step < 1e-9) continue;
      const bearing = Math.atan2(ahead.z - pose.z, ahead.x - pose.x);
      const difference = Math.abs(Math.atan2(Math.sin(bearing - pose.yaw), Math.cos(bearing - pose.yaw)));
      assert.ok(difference < 0.05, `facing ${difference.toFixed(3)} rad away from where it went`);
    }
  }
});

test('a grazer is posed from absolute time, so the same instant always gives the same place', () => {
  // Two animals asked about the same instant have to agree, or the herd shears apart as frame time
  // varies. Posing is a function of time, not an accumulation, so this holds by construction.
  const savanna = new Savanna('meadow');
  const grazers = herd('meadow', 12);
  for (const grazer of grazers) {
    assert.deepEqual(grazerPose(grazer, 12.5, savanna), grazerPose(grazer, 12.5, savanna));
  }
});

test('graving happens for the share of the time each animal was given', () => {
  // The duty is solved from the sine rather than eyeballed, so it is asserted as a measured fraction
  // over a long run instead of trusted.
  const savanna = new Savanna('meadow');
  for (const grazer of herd('meadow', 9)) {
    let down = 0;
    let total = 0;
    // Long enough to cover several of each animal's own cycle, so the fraction is not a coincidence.
    for (let t = 0; t < 600; t += 0.01) {
      if (grazerPose(grazer, t, savanna).headDown) down++;
      total++;
    }
    const measured = down / total;
    assert.ok(
      Math.abs(measured - grazer.grazeDuty) < 0.02,
      `grazed ${(measured * 100).toFixed(1)}% of the time, asked for ${(grazer.grazeDuty * 100).toFixed(1)}%`,
    );
  }
});

test('a head-down grazer has stopped striding', () => {
  const savanna = new Savanna('meadow');
  for (const grazer of herd('meadow', 12)) {
    for (let t = 0; t < 30; t += 0.29) {
      const pose = grazerPose(grazer, t, savanna);
      if (pose.headDown) assert.equal(pose.stride, 0, 'an animal eating should not be marching on the spot');
    }
  }
});

test('a grazer tips its head down by about as far as its own reach says', () => {
  // Solved from the neck rather than chosen, so the angle has to put the nose at the graze drop.
  for (const kind of GRAZER_KINDS) {
    const spec = GRAZER_SPECS[kind as GrazerKind];
    const angle = grazeAngle(spec);
    const reach = spec.neck * spec.length;
    // The nose hangs reach * sin(angle) below the shoulder.
    const drop = -Math.sin(angle) * reach;
    assert.ok(drop <= spec.grazeDrop + 1e-9, `${kind} drops ${drop.toFixed(2)}, asked ${spec.grazeDrop}`);
    // And it should be a real graze, not a token one.
    assert.ok(drop > spec.grazeDrop * 0.6, `${kind} only drops ${drop.toFixed(2)}`);
    assert.ok(angle < 0, `${kind} tips its head up rather than down`);
  }
});

test('a giraffe grazes deeper than the animals it is standing among', () => {
  // The reason the giraffe is in the herd: its drop is measured from its own height, so it has to put
  // its head below the backs of everything else.
  const giraffe = GRAZER_SPECS.giraffe;
  for (const kind of ['elephant', 'rhino'] as const) {
    assert.ok(
      giraffe.height - giraffe.grazeDrop < GRAZER_SPECS[kind].height,
      `a grazing giraffe stands ${(giraffe.height - giraffe.grazeDrop).toFixed(1)}, above a ${kind}`,
    );
  }
});

test('every kind names a model, a fitting and a front, or it would be drawn wrong', () => {
  // The three things that cannot be derived from a file: where it is, which way its head is, and
  // what to draw it from. A kind missing any of them is a kind drawn at the wrong size or backwards.
  for (const kind of GRAZER_KINDS) {
    const spec = GRAZER_SPECS[kind];
    assert.ok(spec.model, `${kind} has no model`);
    assert.ok(spec.length > 0, `${kind} has no length`);
    assert.ok(spec.front === 'positive' || spec.front === 'negative', `${kind} has no front`);
  }
});

test('the graze dips the whole animal, and only while it is grazing', () => {
  // A loaded animal is one merged mesh, so the dip is the only thing carrying the graze. It has to be
  // there, it has to be bounded, and it has to stop when the animal stops grazing — otherwise every
  // animal in the herd rocks gently on the spot.
  const savanna = new Savanna('meadow');
  for (const grazer of herd('meadow', 12)) {
    let bobbed = false;
    for (let t = 0; t < 60; t += 0.05) {
      const pose = grazerPose(grazer, t, savanna);
      assert.ok(pose.bob >= 0, `a dipped animal rose by ${pose.bob}`);
      assert.ok(pose.bob <= GRAZE_BOB + 1e-9, `a dip of ${pose.bob} is past GRAZE_BOB`);
      if (!pose.headDown) assert.equal(pose.bob, 0, 'an animal that is not grazing should be level');
      else bobbed = true;
    }
    assert.ok(bobbed, `${grazer.kind} never grazed in 60 seconds, so its dip was never exercised`);
  }
});

test('the herd speed slider stops and starts the herd without changing it', () => {
  // At zero the wander stops advancing, so the herd freezes where it is standing. What it must not
  // do is snap back to the middle of its patch, which is what a speed of zero would mean if the
  // slider were applied by scaling a distance travelled rather than the rate of the wander.
  const savanna = new Savanna('meadow');
  for (const grazer of herd('meadow', 12)) {
    const still = [grazerPose(grazer, 5, savanna, 0), grazerPose(grazer, 50, savanna, 0)];
    assert.deepEqual(still[0], still[1], 'a stopped animal drifted');

    const early = grazerPose(grazer, 5, savanna);
    const late = grazerPose(grazer, 50, savanna);
    assert.ok(
      Math.hypot(late.x - early.x, late.z - early.z) > 0.01,
      'a moving animal stood still',
    );
  }
});

test('a stopped herd stands where it was, not where its home is', () => {
  const savanna = new Savanna('meadow');
  for (const grazer of herd('meadow', 12)) {
    const stopped = grazerPose(grazer, 30, savanna, 0);
    assert.ok(
      Math.hypot(stopped.x - grazer.homeX, stopped.z - grazer.homeZ) > 0.001,
      'a stopped animal teleported back to the middle of its patch',
    );
  }
});

test('acacias vary in size, and every one of them is in scale with the plain', () => {
  const savanna = new Savanna('meadow');
  const sizes = scatterAcacias(savanna, 'meadow', 120).map((t) => t.scale);
  // A stand where every tree is the same height reads as a plantation rather than as something that
  // grew where it happened to, so the spread has to be real rather than cosmetic jitter.
  assert.ok(Math.max(...sizes) / Math.min(...sizes) > 1.5, `sizes span only ${Math.min(...sizes).toFixed(1)} to ${Math.max(...sizes).toFixed(1)}`);
  for (const scale of sizes) {
    // Read against the plain's own size: an acacia has to stand proud of the grass without being a
    // landmark, and that ratio is what has to hold as either is retuned.
    assert.ok(scale > ACACIA_HEIGHT * 0.6, `acacia of ${scale.toFixed(1)} is undersized`);
    assert.ok(scale < SAVANNA_SIZE * 0.1, `acacia of ${scale.toFixed(1)} dwarfs the plain`);
  }
});