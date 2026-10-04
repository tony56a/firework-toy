import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mulberry32 } from '../src/core/random';
import { FireworkSim, MAX_PARTICLES } from '../src/models/fireworks';

const volley = (shells: number, overrides = {}) => ({
  origin: { x: 5, y: 2, z: -3 }, forward: { x: 0, z: -1 }, horizontalRange: 20, heightRange: 75, shells, ...overrides,
});

function run(sim: FireworkSim, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) sim.step(dt);
}

test('a volley schedules shells, launches them, and they burst', () => {
  const sim = new FireworkSim(mulberry32(1));
  sim.launchVolley(volley(4));
  assert.equal(sim.pendingLaunches, 4);
  sim.step(0.001);
  assert.equal(sim.activeRockets, 1);
  run(sim, 4);
  assert.equal(sim.pendingLaunches, 0);
  assert.ok(sim.liveParticles() > 0, 'bursts should leave live particles');
});

test('rockets in flight are exposed for rendering and disappear when they burst', () => {
  const sim = new FireworkSim(mulberry32(4));
  sim.launchVolley(volley(2));
  assert.equal(sim.rocketStates.length, 0);
  run(sim, 1);
  const seen = sim.rocketStates;
  assert.ok(seen.length > 0, 'a rising rocket should be visible to views');
  for (const r of seen) {
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z));
    assert.ok(r.vy > 0, 'rockets climb before they burst');
    assert.ok(r.primary.every((c) => c >= 0 && c <= 1));
  }
  run(sim, 8);
  assert.equal(sim.rocketStates.length, 0);
});

test('everything fades out eventually', () => {
  const sim = new FireworkSim(mulberry32(2));
  sim.launchVolley(volley(3));
  run(sim, 30);
  assert.equal(sim.activeRockets, 0);
  assert.equal(sim.liveParticles(), 0);
  assert.ok(sim.flash.intensity < 1e-6);
});

test('rockets rise from the requested origin and bursts stay in a plausible range', () => {
  const sim = new FireworkSim(mulberry32(3));
  sim.launchVolley(volley(1, { horizontalRange: 0, heightRange: 60 }));
  sim.step(0.001);
  run(sim, 8);
  // With no sideways range, the burst happens directly above the origin.
  assert.ok(Math.abs(sim.flash.x - 5) < 1e-3 && Math.abs(sim.flash.z + 3) < 1e-3);
  assert.ok(sim.flash.y > 2 + 60 * 0.4 - 2 && sim.flash.y <= 2 + 60 + 1, `burst height ${sim.flash.y}`);
});

test('horizontal range spreads bursts sideways relative to the camera', () => {
  const xs: number[] = [];
  for (let seed = 1; seed <= 12; seed++) {
    const sim = new FireworkSim(mulberry32(seed));
    sim.launchVolley(volley(1, { forward: { x: 0, z: -1 }, horizontalRange: 40 }));
    sim.step(0.001);
    run(sim, 8);
    xs.push(sim.flash.x);
  }
  assert.ok(Math.max(...xs) - Math.min(...xs) > 20, 'bursts should spread along screen x');
});

test('the simulation is deterministic for a given rng and never produces NaN', () => {
  const a = new FireworkSim(mulberry32(9));
  const b = new FireworkSim(mulberry32(9));
  for (const sim of [a, b]) { sim.launchVolley(volley(5)); run(sim, 5); }
  assert.deepEqual(a.positions, b.positions);
  assert.ok(a.positions.every(Number.isFinite) && a.colors.every(Number.isFinite));
  assert.equal(a.positions.length, MAX_PARTICLES * 3);
});

import { PALETTE_IDS, PALETTES, pickColors, swatchColors } from '../src/models/fireworkPalettes';

test('every palette yields valid, deterministic colors, and two-tone picks differ', () => {
  for (const id of PALETTE_IDS) {
    const a = mulberry32(5);
    const b = mulberry32(5);
    for (let i = 0; i < 30; i++) {
      const pa = pickColors(PALETTES[id], a);
      assert.deepEqual(pa, pickColors(PALETTES[id], b));
      for (const c of [...pa.primary, ...pa.secondary]) assert.ok(c >= 0 && c <= 1, `${id} out of range: ${c}`);
      assert.notDeepEqual(pa.primary, pa.secondary, `${id} secondary should differ`);
    }
    assert.ok(swatchColors(PALETTES[id]).length >= 4);
  }
});

test('warm palettes lean red and cold palettes lean blue', () => {
  const rng = mulberry32(11);
  for (let i = 0; i < 100; i++) {
    for (const c of Object.values(pickColors(PALETTES.warm, rng))) assert.ok(c[0] >= c[2], `warm ${c}`);
    for (const c of Object.values(pickColors(PALETTES.cold, rng))) assert.ok(c[2] >= c[0], `cold ${c}`);
  }
});

test('the chosen palette controls burst color in the simulation, and rainbow is the default', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const cold = new FireworkSim(mulberry32(seed));
    cold.launchVolley(volley(1, { palette: PALETTES.cold }));
    cold.step(0.001);
    run(cold, 8);
    assert.ok(cold.flash.color[2] >= cold.flash.color[0], `seed ${seed}: flash ${cold.flash.color}`);
  }
  const plain = new FireworkSim(mulberry32(1));
  plain.launchVolley(volley(1));
  plain.step(0.001);
  run(plain, 8);
  assert.ok(plain.flash.color.every(Number.isFinite));
});
