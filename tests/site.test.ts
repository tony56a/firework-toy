import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUILDING_CLEARANCE, CONCRETE_SIZE, PAD_RADIUS, ROCKET_HEIGHT, ROCKET_RADIUS,
} from '../src/config';
import { clashesWithPad, offSlab, ROCKET_SPOT, siteBuildings, TOWER_SPOT, tryPlaceBuilding } from '../src/models/site';
import { rngFromSeed } from '../src/core/random';

const HALF = CONCRETE_SIZE / 2;
const footprint = (b: { width: number; depth: number; rotationY: number }) =>
  (b.rotationY === 0 ? b.width : b.depth) / 2;

test('the rocket and the tower stand apart, and the tower is off to one side', () => {
  assert.deepEqual(ROCKET_SPOT, { x: 0, z: 0 }, 'the pad should be centred on the rocket');
  const gap = Math.hypot(TOWER_SPOT.x - ROCKET_SPOT.x, TOWER_SPOT.z - ROCKET_SPOT.z);
  assert.ok(gap > ROCKET_RADIUS * 2, 'the tower would clip the rocket');
  assert.ok(TOWER_SPOT.z !== 0, 'a tower directly behind reads worse than one beside');
});

test('the rocket is a sensible size against the pad it stands on', () => {
  assert.ok(ROCKET_HEIGHT > PAD_RADIUS, 'a stubby rocket reads as a buoy');
  assert.ok(ROCKET_HEIGHT < PAD_RADIUS * 3, 'a rocket taller than this dwarfs its own pad');
  assert.ok(ROCKET_RADIUS * 2 < PAD_RADIUS, 'the rocket should stand well inside the apron');
});

test('no building sits on the pad, the tower, or off the slab', () => {
  for (const seed of ['meadow', 'harbour', 'another', 'seed-4', 'seed-5']) {
    for (const b of siteBuildings(seed)) {
      assert.ok(!clashesWithPad(b), `building at ${b.x},${b.z} is on the pad`);
      assert.ok(!offSlab(b), `building at ${b.x},${b.z} runs off the slab`);
      // Clear of the tower as well as the rocket.
      assert.ok(
        Math.hypot(b.x - TOWER_SPOT.x, b.z - TOWER_SPOT.z) > PAD_RADIUS,
        `building at ${b.x},${b.z} is on the tower`,
      );
    }
  }
});

test('buildings are set back from the pad, in two rows either side of it', () => {
  const buildings = siteBuildings('meadow');
  const rows = new Set(buildings.map((b) => Math.sign(b.z)));
  assert.deepEqual([...rows].sort(), [-1, 1], 'buildings should straddle the pad');
  for (const b of buildings) {
    assert.ok(Math.abs(b.z) >= BUILDING_CLEARANCE, `building at z=${b.z} crowds the pad`);
  }
});

test('buildings keep clear of each other, so they read as separate structures', () => {
  const buildings = siteBuildings('meadow');
  for (const b of buildings) {
    for (const other of buildings) {
      if (b === other) continue;
      const gap = Math.hypot(b.x - other.x, b.z - other.z);
      assert.ok(gap > 10, `buildings at ${b.x},${b.z} and ${other.x},${other.z} are ${gap.toFixed(1)} apart`);
    }
  }
});

test('buildings stay inside the slab even counting their own footprint', () => {
  for (const b of siteBuildings('meadow')) {
    assert.ok(Math.abs(b.x) + footprint(b) <= HALF, `building at x=${b.x} overhangs the edge`);
    assert.ok(Math.abs(b.z) + footprint(b) <= HALF, `building at z=${b.z} overhangs the edge`);
  }
});

test('the same seed gives the same site, a different seed does not', () => {
  const again = siteBuildings('meadow');
  assert.deepEqual(again, siteBuildings('meadow'));
  const other = siteBuildings('harbour');
  assert.notDeepEqual(again.map((b) => b.height), other.map((b) => b.height));
});

test('building sizes stay within the intended range', () => {
  for (const b of [...siteBuildings('meadow'), ...siteBuildings('harbour')]) {
    assert.ok(b.height >= 5 && b.height <= 17, `height ${b.height}`);
    assert.ok(b.depth >= 5 && b.depth <= 11, `depth ${b.depth}`);
    assert.ok(b.width > 0 && b.tint.every((t) => t >= 0 && t < 1));
  }
});

test('the rejection sampler refuses to place anything on the pad or off the slab', () => {
  const rng = rngFromSeed('probe');
  const placed = [];
  for (let i = 0; i < 6; i++) {
    const b = tryPlaceBuilding(rng, placed, PAD_RADIUS, HALF - 2);
    assert.ok(b, 'the sampler should find somewhere for six buildings');
    assert.ok(!clashesWithPad(b) && !offSlab(b));
    placed.push(b);
  }
});

test('the sampler gives up rather than looping forever on a crowded pad', () => {
  const rng = rngFromSeed('crowded');
  // Blanket the whole slab, so every candidate spot is within 12 of something already taken.
  const taken = [];
  for (let x = -HALF; x <= HALF; x += 6) {
    for (let z = -HALF; z <= HALF; z += 6) {
      taken.push({
        x, z, width: 8, depth: 8, height: 8,
        rotationY: 0, tint: [0, 0] as [number, number],
      });
    }
  }
  // Nowhere is free, so it must return null rather than place an overlapping building.
  assert.equal(tryPlaceBuilding(rng, taken, PAD_RADIUS, HALF - 2), null);
});
