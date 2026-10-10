import { FISH_LENGTH, GRAVITY, SEA_SIZE } from '../../config';
import { range, rngFromSeed } from '../../core/random';
import { ellipseCourse, type BoatCourse } from './boat';
import type { Ground } from '../ground';

/**
 * A leap out of the water and back into it. Ballistic, so the fish leaves at whatever angle and
 * speed it was swimming at and gravity does the rest, which is both what actually happens and the
 * cheapest way to get an arc that is right without tuning it by eye.
 */
export interface Leap {
  /** Horizontal speed the fish leaves the water at. */
  readonly launchSpeed: number;
  /** Angle above the water it leaves at, in radians. A fish barely clears the surface. */
  readonly launchAngle: number;
  /** Seconds the fish stays clear of the water. Derived from the launch, so it cannot disagree. */
  readonly duration: number;
}

export interface FishPose {
  x: number;
  y: number;
  z: number;
  /** Heading in the XZ plane, where 0 points along +x. */
  yaw: number;
  /** Nose up positive, in radians. */
  pitch: number;
  /** Whether the fish is clear of the water this frame, which is when it can be drawn at all. */
  airborne: boolean;
}

/** One fish: where it swims, how it leaps, and when. */
export interface Fish {
  /** Its own course through the water, so a school is not one fish travelling in a circle. */
  readonly course: BoatCourse;
  /** Where it starts on that course, in radians. */
  readonly startAngle: number;
  /** Radians per second it swims at. */
  readonly rate: number;
  readonly leap: Leap;
  /** Seconds between leaps, and the offset into the first cycle, so a school is not in unison. */
  readonly interval: number;
  readonly offset: number;
}

/** Seconds a fish is clear of the water for a given launch. */
export function leapDuration(launchSpeed: number, launchAngle: number): number {
  const vertical = launchSpeed * Math.sin(launchAngle);
  // A fish that launches flat has no upward velocity to bring back down, so there is nothing to
  // solve and the leap is instantaneous rather than infinite.
  if (vertical <= 0) return 0;
  return (2 * vertical) / GRAVITY;
}

/**
 * How far a leaping fish travels from where it left the water, counting both the coast of its own
 * course over the leap and the straight-line run of the arc. A fish can be well clear of a wall in
 * flight, so this is what a course radius has to be less than.
 */
export function leapReach(leap: Leap, rate: number): number {
  const coast = rate * leap.duration;
  const run = leap.launchSpeed * Math.cos(leap.launchAngle) * leap.duration;
  return Math.hypot(coast, run);
}

/** How high above the surface the fish gets, which is what sets how big a leap reads on screen. */
export function leapHeight(launchSpeed: number, launchAngle: number): number {
  const vertical = launchSpeed * Math.sin(launchAngle);
  return (vertical * vertical) / (2 * GRAVITY);
}

/**
 * Where a fish is at a given time. `sinceLeap` is measured from the start of the leap it is in the
 * middle of, or is `null` when the fish is in the water and not due to come out yet.
 *
 * Taken as an absolute time rather than an accumulating one, so a fish's position never drifts with
 * frame time and two fish asked about the same instant agree with each other.
 */
export function fishPose(fish: Fish, time: number, sea: Ground): FishPose {
  // The course advances whether the fish is in the air or not: a leaping fish keeps swimming, which
  // is why a leap carries it along its course instead of returning to where it left the water.
  const angle = fish.startAngle + fish.rate * time;
  const { x, z, yaw } = fish.course.at(angle);

  // Which cycle we are in, and how far through it. The offset staggers a school so they are not all
  // breaking the surface together.
  const cycle = time + fish.offset;
  const sinceLeap = cycle - Math.floor(cycle / fish.interval) * fish.interval;
  if (sinceLeap >= fish.leap.duration) return { x, y: sea.heightAt(x, z), z, yaw, pitch: 0, airborne: false };

  const { launchSpeed, launchAngle } = fish.leap;
  // Height along a ballistic arc, starting and ending at the surface: v*t - g*t^2/2. It has to be
  // written that way round rather than as a parabola through an apex, so the fish is exactly on the
  // water at both ends of the leap rather than close to it.
  const height = launchSpeed * Math.sin(launchAngle) * sinceLeap - 0.5 * GRAVITY * sinceLeap * sinceLeap;
  // Nose angle follows the arc's tangent, so the fish points along its own trajectory instead of
  // pitching as though it were on a fixed spring.
  const vertical = launchSpeed * Math.sin(launchAngle) - GRAVITY * sinceLeap;
  return {
    x,
    y: sea.heightAt(x, z) + Math.max(0, height),
    z,
    yaw,
    pitch: Math.atan2(vertical, launchSpeed * Math.cos(launchAngle)),
    airborne: true,
  };
}

/** True on the frame a fish comes back down into the water, which is when it should splash. */
export function hasLanded(fish: Fish, previousTime: number, time: number): boolean {
  const crossing = (t: number) => {
    const cycle = t + fish.offset;
    const since = cycle - Math.floor(cycle / fish.interval) * fish.interval;
    return since < fish.leap.duration;
  };
  // Requires having been in the air last frame, so a long frame that skipped over the whole leap
  // does not splash a fish that was never seen leaving.
  return crossing(previousTime) && !crossing(time);
}

/**
 * A school of fish in the basin. Scattered courses, rates and leap times, so the school reads as a
 * shoal rather than as one fish duplicated: no two share a course radius or a beat.
 */
export function school(seed: string, size: number = SEA_SIZE): readonly Fish[] {
  const rng = rngFromSeed(`${seed}:fish`);
  const count = Math.round(range(rng, 14, 20));
  return Array.from({ length: count }, () => {
    const launchSpeed = range(rng, 9, 14);
    const launchAngle = range(rng, 0.75, 1.05);
    const leap: Leap = { launchSpeed, launchAngle, duration: leapDuration(launchSpeed, launchAngle) };
    const rate = range(rng, 0.16, 0.34);
    const interval = range(rng, 5, 11);
    // A course is only safe if the fish stays inside the basin for the whole of its worst leap. The
    // course's outermost point is its own semi-axis, and the leap carries the fish further out still,
    // so the radius has to leave room for the leap rather than being picked freely and hoped for.
    const run = leapReach(leap, rate);
    // Half the fish as well as the leap: a course has to leave room for the body, or the tail of a
    // fish sailing at its outermost point hangs over the wall.
    const outer = (size / 2) * 0.9 - run - FISH_LENGTH / 2;
    // Spread between a course comfortably bigger than the leap and the largest one that still fits.
    // `range` would return values the wrong way round if the two crossed, which they would in a basin
    // too small for this launch, so the lower bound is held under the upper.
    const floor = Math.min(run * range(rng, 2, 3), outer * 0.6);
    const radius = range(rng, floor, outer);
    const course = ellipseCourse(radius, radius * range(rng, 0.8, 1));
    return {
      course,
      startAngle: range(rng, 0, Math.PI * 2),
      rate,
      leap,
      interval,
      // Spread over a whole interval, which is what keeps the school from pulsing together.
      offset: range(rng, 0, interval),
    };
  });
}

