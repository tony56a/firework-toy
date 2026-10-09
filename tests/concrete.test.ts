import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONCRETE_JOINT_WIDTH, CONCRETE_PANEL, CONCRETE_SIZE } from '../src/config';
import { ConcreteSlab } from '../src/models/concrete';

const slab = new ConcreteSlab('meadow');
const half = CONCRETE_SIZE / 2;

test('the slab is flat everywhere, which is the whole point of the scene', () => {
  for (const [x, z] of [[0, 0], [30, -12], [-64, 64], [half - 0.1, -half + 0.1]]) {
    assert.equal(slab.heightAt(x, z), 0);
  }
});

test('panels tile the slab without gaps or overlaps', () => {
  assert.equal(slab.columns * CONCRETE_PANEL, CONCRETE_SIZE, 'panels should exactly fill the slab');
  assert.equal(slab.panels.length ?? slab.columns * slab.rows, slab.columns * slab.rows);
});

test('every panel centre resolves back to its own panel', () => {
  for (const panel of slab.panels) {
    const found = slab.panelAt(panel.x, panel.z);
    assert.equal(found.col, panel.col);
    assert.equal(found.row, panel.row);
  }
});

test('panelAt clamps to the slab instead of running off the edge', () => {
  const far = slab.panelAt(9999, -9999);
  assert.equal(far.col, slab.columns - 1);
  assert.equal(far.row, 0);
});

test('joints are strongest on panel boundaries and absent mid-panel', () => {
  // The slab takes an even number of panels, so the origin falls on a joint line.
  assert.ok(slab.jointAt(0, 0) > 0.9, 'an even panel count puts a joint through the origin');
  const centre = slab.panels[Math.floor(slab.panels.length / 2)];
  assert.equal(slab.jointAt(centre.x, centre.z), 0, 'a panel centre is not a joint');
  const boundary = -half + CONCRETE_PANEL; // first vertical joint line
  assert.ok(slab.jointAt(boundary, 3) > 0.9, 'a joint should be opaque on the line');
  assert.ok(slab.jointAt(boundary + CONCRETE_JOINT_WIDTH, 3) < 1e-6, 'and clear of it');
});

test('joints fall on both axes and at the rim', () => {
  const mid = CONCRETE_PANEL * 2 - half;
  assert.ok(slab.jointAt(5, mid) > 0.9, 'joints should run across z as well as x');
  assert.ok(slab.jointAt(half, half) > 0, 'the slab border should read as a joint');
});

test('surface weights stay in range across the whole slab', () => {
  for (let x = -half; x <= half; x += 7.3) {
    for (let z = -half; z <= half; z += 7.3) {
      const w = slab.weightsAt(x, z);
      for (const [name, value] of Object.entries(w)) {
        assert.ok(value >= 0 && value <= 1, `${name} out of range at ${x},${z}: ${value}`);
      }
    }
  }
});

test('the same seed gives the same slab, a different seed does not', () => {
  const again = new ConcreteSlab('meadow');
  const other = new ConcreteSlab('harbour');
  assert.deepEqual(again.weightsAt(4, 9), slab.weightsAt(4, 9));
  const differs = [[0, 13], [-26, 40], [31, -7]].some(
    ([x, z]) => again.weightsAt(x, z).tone !== other.weightsAt(x, z).tone,
  );
  assert.ok(differs, 'a new seed should pour a visibly different slab');
});

test('neighbouring panels differ in tone, so the slab reads as separate pours', () => {
  const shifts = slab.panels.map((p) => p.toneShift);
  assert.ok(Math.max(...shifts) - Math.min(...shifts) > 0.05, 'panels are too uniform');
});
