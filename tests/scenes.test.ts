import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD_SIZE } from '../src/config';
import { DEFAULT_STATE } from '../src/models/appState';
import { FlatGround, type Ground } from '../src/models/ground';
import { SCENE_IDS, SCENES } from '../src/models/scenes';
import { Terrain } from '../src/models/terrain';

test('a flat ground is level everywhere and spans the world', () => {
  const flat: Ground = new FlatGround();
  assert.equal(flat.size, WORLD_SIZE);
  for (let i = 0; i < 200; i++) assert.equal(flat.heightAt(i * 7 - 300, 300 - i * 5), 0);
});

test('Terrain can stand in wherever a Ground is expected', () => {
  const ground: Ground = new Terrain('meadow');
  assert.equal(ground.size, WORLD_SIZE);
  assert.ok(Number.isFinite(ground.heightAt(12, -40)));
});

test('every scene id has a label for the picker', () => {
  for (const id of SCENE_IDS) {
    assert.ok(SCENES[id].label.length > 0, `missing label for ${id}`);
  }
  assert.deepEqual(Object.keys(SCENES).sort(), [...SCENE_IDS].sort());
});

test('the default state starts on a real scene', () => {
  assert.ok(SCENE_IDS.includes(DEFAULT_STATE.sceneId));
});