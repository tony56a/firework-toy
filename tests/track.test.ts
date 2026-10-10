import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roundedRectTrack, type Track } from '../src/models/sky/track';

const WIDTH = 52;
const DEPTH = 28;
const RADIUS = 8;
const track: Track = roundedRectTrack(WIDTH, DEPTH, RADIUS);

test('the loop is as long as its four straights and four quarter circles', () => {
  const r = Math.min(RADIUS, WIDTH / 2, DEPTH / 2);
  const expected = 2 * (WIDTH - 2 * r) + 2 * (DEPTH - 2 * r) + 2 * Math.PI * r;
  assert.ok(Math.abs(track.length - expected) < 1e-9, `${track.length} vs ${expected}`);
});

test('the loop is closed and distance wraps both ways', () => {
  const start = track.at(0);
  for (const offset of [track.length, track.length * 3, -track.length]) {
    const p = track.at(offset);
    assert.ok(Math.abs(p.x - start.x) < 1e-9 && Math.abs(p.z - start.z) < 1e-9);
  }
  assert.deepEqual(track.at(-5), track.at(track.length - 5));
});

test('the loop stays inside the rectangle it was given', () => {
  for (let d = 0; d < track.length; d += 0.37) {
    const p = track.at(d);
    assert.ok(Math.abs(p.x) <= WIDTH / 2 + 1e-9, `x out of bounds: ${p.x}`);
    assert.ok(Math.abs(p.z) <= DEPTH / 2 + 1e-9, `z out of bounds: ${p.z}`);
  }
});

test('there are no jumps between the straight runs and the corners', () => {
  // Sampled finely enough to land either side of every segment boundary.
  let previous = track.at(0);
  for (let d = 0.05; d < track.length; d += 0.05) {
    const p = track.at(d);
    const step = Math.hypot(p.x - previous.x, p.z - previous.z);
    assert.ok(step < 0.25, `discontinuity of ${step} at distance ${d.toFixed(2)}`);
    previous = p;
  }
});

test('the heading points the way the track actually travels', () => {
  // Compared against a central difference so a chord measures the tangent at d on both the
  // straights and the corners. Near a segment boundary the chord spans two pieces of track and
  // tilts slightly, so allow a small tolerance: a reversed heading is pi and a wrong-segment
  // heading is far larger, so this still catches a real mistake.
  const epsilon = 0.01;
  const tolerance = 0.01;
  for (let d = 0; d < track.length; d += 0.9) {
    const p = track.at(d);
    const behind = track.at(d - epsilon);
    const ahead = track.at(d + epsilon);
    const travelled = Math.atan2(ahead.z - behind.z, ahead.x - behind.x);
    const drift = Math.abs(((p.heading - travelled + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    assert.ok(drift < tolerance, `heading off by ${drift} rad at distance ${d}`);
  }
});

test('the straights report an exact axis heading', () => {
  const cardinal = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const driftFrom = (a: number, b: number): number =>
    Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const onAxis = (heading: number): boolean => cardinal.some((a) => driftFrom(heading, a) < 1e-9);

  let checked = 0;
  for (let d = 0; d < track.length; d += 0.05) {
    const p = track.at(d);
    const behind = track.at(d - 0.02);
    const ahead = track.at(d + 0.02);
    // Only points whose neighbours are on the same straight, so the chord stays on one line.
    if (!onAxis(p.heading) || !onAxis(behind.heading) || !onAxis(ahead.heading)) continue;
    const travelled = Math.atan2(ahead.z - p.z, ahead.x - p.x);
    const drift = driftFrom(p.heading, travelled);
    assert.ok(drift < 1e-9, `straight heading off by ${drift} rad at ${d}`);
    checked++;
  }
  assert.ok(checked > 1000, `expected to check most of the loop, only checked ${checked} points`);
});

test('a radius larger than the shape collapses onto the tightest loop that fits', () => {
  const tiny = roundedRectTrack(4, 4, 50);
  for (let d = 0; d < tiny.length; d += 0.5) {
    const p = tiny.at(d);
    assert.ok(Math.abs(p.x) <= 2 + 1e-9 && Math.abs(p.z) <= 2 + 1e-9);
  }
});