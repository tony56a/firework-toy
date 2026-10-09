import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODEL_SPACING, TABLE_DEPTH, TABLE_WIDTH, TRACK_INSET } from '../src/config';
import { MODEL_KINDS } from '../src/models/modelKinds';
import { TABLE_MODELS, TRACK_BOUNDS, tableLayout } from '../src/models/tableModels';

test('models are spread evenly and centred on the table', () => {
  const spots = tableLayout(4);
  assert.equal(spots.length, 4);
  assert.ok(Math.abs(spots[0].x + spots[3].x) < 1e-9, 'row should be centred on the origin');
  for (let i = 1; i < spots.length; i++) {
    assert.ok(Math.abs(spots[i].x - spots[i - 1].x - MODEL_SPACING) < 1e-9);
  }
  assert.ok(spots.every((s) => s.z === 0));
});

test('an empty table lays out nothing', () => {
  assert.deepEqual(tableLayout(0), []);
  assert.deepEqual(tableLayout(-3), []);
});

test('every displayed model has a layout spot clear of the track', () => {
  const spots = tableLayout(TABLE_MODELS.length);
  assert.equal(spots.length, TABLE_MODELS.length);
  const halfW = TRACK_BOUNDS.width / 2;
  const halfD = TRACK_BOUNDS.depth / 2;
  for (const [i, spot] of spots.entries()) {
    const model = TABLE_MODELS[i];
    const radius = 1.9 * model.scale; // widest part of either canopy
    assert.ok(Math.abs(spot.x) + radius < halfW, `model ${model.label} overlaps the track in x`);
    assert.ok(Math.abs(spot.z) + radius < halfD, `model ${model.label} overlaps the track in z`);
  }
});

test('the track loop fits on the tabletop', () => {
  assert.equal(TRACK_BOUNDS.width, TABLE_WIDTH - 2 * TRACK_INSET);
  assert.equal(TRACK_BOUNDS.depth, TABLE_DEPTH - 2 * TRACK_INSET);
  assert.ok(TRACK_BOUNDS.width > 0 && TRACK_BOUNDS.depth > 0);
});

test('the catalogue only names models the renderer can build', () => {
  assert.ok(TABLE_MODELS.length > 0);
  for (const model of TABLE_MODELS) {
    assert.ok(MODEL_KINDS.includes(model.kind), `unknown model kind ${model.kind}`);
    assert.ok(model.label.length > 0);
    assert.ok(model.scale > 0);
  }
});