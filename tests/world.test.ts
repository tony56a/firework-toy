import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_TREES } from '../src/config';
import { Terrain } from '../src/models/terrain';
import { scatterTrees } from '../src/models/trees';

test('terrain is deterministic per seed and differs between seeds', () => {
  const a = new Terrain('meadow');
  const b = new Terrain('meadow');
  const c = new Terrain('another');
  const pts: Array<[number, number]> = [[0, 0], [10, -20], [-55, 33], [80, 80]];
  for (const [x, z] of pts) assert.equal(a.heightAt(x, z), b.heightAt(x, z));
  assert.ok(pts.some(([x, z]) => a.heightAt(x, z) !== c.heightAt(x, z)));
});

test('ground weights stay in their documented ranges', () => {
  const t = new Terrain('w');
  for (let i = 0; i < 300; i++) {
    const w = t.groundWeights(i * 0.6 - 90, 90 - i * 0.55);
    assert.ok(w.grass >= 0 && w.grass <= 1);
    assert.ok(w.dry >= 0 && w.dry <= 1);
    assert.ok(w.dark >= 0 && w.dark <= 1);
    assert.ok(w.shade >= 0.85 && w.shade <= 1.15);
  }
});

test('trees respect minimum spacing, margins and the central clearing', () => {
  const terrain = new Terrain('meadow');
  const trees = scatterTrees(terrain, 'meadow', 1200);
  assert.ok(trees.length > 400, `expected a decent forest, got ${trees.length}`);
  const half = terrain.size / 2 - 6;
  for (const t of trees) {
    assert.ok(Math.abs(t.x) <= half && Math.abs(t.z) <= half);
    assert.ok(Math.hypot(t.x, t.z) >= 8);
    assert.equal(t.y, terrain.heightAt(t.x, t.z));
  }
  let closest = Infinity;
  for (let i = 0; i < trees.length; i++) {
    for (let j = i + 1; j < trees.length; j++) {
      closest = Math.min(closest, Math.hypot(trees[i].x - trees[j].x, trees[i].z - trees[j].z));
    }
  }
  assert.ok(closest >= 3.4 - 1e-9, `closest pair was ${closest}`);
});

test('raising the tree count only adds trees', () => {
  const terrain = new Terrain('meadow');
  const few = scatterTrees(terrain, 'meadow', 300);
  const many = scatterTrees(terrain, 'meadow', 900);
  assert.equal(few.length, 300);
  assert.deepEqual(many.slice(0, 300), few);
});

test('tree count is capped and zero means an empty field', () => {
  const terrain = new Terrain('meadow');
  assert.equal(scatterTrees(terrain, 'meadow', 0).length, 0);
  assert.ok(scatterTrees(terrain, 'meadow', 99_999).length <= MAX_TREES);
});

test('both species appear in a large forest', () => {
  const kinds = new Set(scatterTrees(new Terrain('meadow'), 'meadow', 1200).map((t) => t.kind));
  assert.deepEqual([...kinds].sort(), ['oak', 'pine']);
});
