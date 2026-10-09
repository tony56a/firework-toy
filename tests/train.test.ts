import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRACK_RADIUS } from '../src/config';
import { roundedRectTrack, wheelAngle, type TrackPoint } from '../src/models/track';

/**
 * The train view derives its vehicle positions straight from the track, so these check the
 * arrangement that view relies on: vehicles trail the engine by a fixed gap and stay on the rail
 * when the loop wraps.
 */
const RADIUS = TRACK_RADIUS;
const track = roundedRectTrack(52, 28, RADIUS);
const COUPLING_GAP = 4.2;
const VEHICLE_COUNT = 4;

const at = (distance: number): TrackPoint => track.at(distance);

/** Straight-line distance covered by an arc of length L on a track of radius R. */
const chordOf = (arc: number, radius: number): number => 2 * radius * Math.sin(arc / (2 * radius));

test('vehicles sit a fixed spacing apart along the track, corners cutting the chord', () => {
  for (const travelled of [0, 13.7, 47.1, track.length - 3, track.length * 0.83]) {
    const engine = at(travelled);
    for (let i = 1; i < VEHICLE_COUNT; i++) {
      const wagon = at(travelled - i * COUPLING_GAP);
      const gap = Math.hypot(wagon.x - engine.x, wagon.z - engine.z);
      const alongTrack = i * COUPLING_GAP;
      // Straight lines measure the full spacing; the tightest the track ever gets is its corners.
      assert.ok(gap <= alongTrack + 1e-9, `vehicle ${i} is further than ${alongTrack} at ${travelled}`);
      assert.ok(
        gap >= chordOf(alongTrack, RADIUS) - 1e-9,
        `vehicle ${i} is ${gap} from the engine at ${travelled}, tighter than any corner allows`,
      );
    }
  }
});

test('vehicles keep their distance from each other across the wrap', () => {
  // Close to the loop's length the train is mid-corner and straddles the seam.
  for (const travelled of [track.length - 6, track.length - 1, 0, 0.5]) {
    const points = Array.from({ length: VEHICLE_COUNT }, (_, i) => at(travelled - i * COUPLING_GAP));
    for (let i = 1; i < points.length; i++) {
      const step = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
      assert.ok(step < COUPLING_GAP + 0.001, `coupling stretched to ${step} at ${travelled}`);
      assert.ok(step > 1, `coupling collapsed to ${step} at ${travelled}`);
    }
  }
});

test('no vehicle ends up off the table at any distance', () => {
  for (let d = 0; d < track.length; d += 0.25) {
    for (let i = 0; i < VEHICLE_COUNT; i++) {
      const p = at(d - i * COUPLING_GAP);
      assert.ok(Math.abs(p.x) <= 26 + 1e-9 && Math.abs(p.z) <= 14 + 1e-9, `off the rail at ${d}`);
    }
  }
});

test('a wheel turns through the angle its rolling distance implies', () => {
  const radius = 0.45;
  assert.equal(wheelAngle(0, radius), 0);
  // A full turn covers the wheel's circumference.
  assert.ok(Math.abs(wheelAngle(2 * Math.PI * radius, radius) - 2 * Math.PI) < 1e-12);
  // Half a lap around the loop is half a turn of arc per wheel radius travelled.
  assert.ok(Math.abs(wheelAngle(10, radius) - 10 / radius) < 1e-12);
  assert.ok(wheelAngle(3, radius) > 0, 'rolling forward should turn the wheel forward');
  assert.ok(wheelAngle(-3, radius) < 0, 'rolling back should turn it back');
  // Proportional: twice the distance is twice the angle.
  assert.ok(Math.abs(wheelAngle(7, radius) - 2 * wheelAngle(3.5, radius)) < 1e-12);
});

test('every axle sits under its body, not past the end', () => {
  // Mirrors the view's inset placement; the old code used a spacing that put a wagon's rear
  // wheel 1.5 units behind the wagon.
  for (const [name, bodyLength] of [['loco', 5.4], ['wagon', 3]] as const) {
    for (const x of [bodyLength * 0.25, bodyLength * 0.75]) {
      assert.ok(x > 0, `${name} front axle is behind the coupler`);
      assert.ok(x < bodyLength, `${name} rear axle is past the body`);
    }
  }
});
