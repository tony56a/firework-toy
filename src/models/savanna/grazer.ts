import {
  ELEPHANT_MODEL_URL, GIRAFFE_MODEL_URL, GRAZE_BOB, GRAZE_REACH, HERD_SPEED_DEFAULT, PLAIN_CLEARING,
  RHINO_MODEL_URL, SAVANNA_SIZE,
} from '../../config';
import { clamp, range, rngFromSeed } from '../../core/random';
import type { Axis } from '../meshFit';
import type { Ground } from '../ground';

/**
 * A herd of grazers wandering a savanna.
 *
 * The animals are posed from absolute time rather than stepped forward by the frame, for the same
 * reason the fish are: a position that accumulates `dt` drifts with frame rate, and two animals asked
 * about the same instant have to agree with each other or the herd shears apart.
 */

/** The three kinds of grazer on the plain, one for each downloaded model. */
export type GrazerKind = 'elephant' | 'giraffe' | 'rhino';

export const GRAZER_KINDS: readonly GrazerKind[] = ['elephant', 'giraffe', 'rhino'];

/** How big each kind is, and what it is drawn from. */
export interface GrazerSpec {
  /** Nose to tail, which is both the size a downloaded model is fitted to and the body's length. */
  length: number;
  /** How tall it stands. Only the drawn fallback uses this; a loaded model's height comes from itself. */
  height: number;
  /**
   * How far below standing the head drops to graze, in the same units as height.
   *
   * Kept within what the neck below can actually reach: the tip hangs `neck * length` from the
   * shoulder, so a drop longer than that asks for an angle that does not exist and the head stops
   * where it was. An elephant barely drops its head at all — it reaches with its trunk.
   */
  grazeDrop: number;
  /**
   * Neck and head reach forward from the shoulder, as a fraction of length.
   *
   * Over 1 for the giraffe, whose neck really is about as long as its body. This only sizes the drawn
   * fallback; a loaded animal brings its own proportions and is not built from these numbers.
   */
  neck: number;
  /** Stride length as a fraction of its own length, so a giraffe takes visibly longer steps. */
  stride: number;
  /** The glb to draw this kind from, or null to draw it in code. */
  model: string | null;
  /** Which axis of a downloaded model's own box is nose to tail. Used to work out the scale. */
  lengthAxis: Axis;
  /**
   * The rotations that stand a downloaded model up and point it along +x, as XYZ Euler triples in
   * radians, applied in order.
   *
   * Written out per animal rather than derived from an axis and a facing, because a downloaded
   * animal's pose is a measured fact about one particular file and there is nothing to derive. Each
   * of these was read off its file by a feature that only exists at one end:
   *
   * - elephant: the +x end reaches down to −2.36 against a −1.9 body floor, which is its trunk
   *   hanging below the head, so the head is already at +x and nothing needs turning.
   * - giraffe: the +x end tops out at 4.89 (head and ossicones) while the −x end bottoms at
   *   −4.89 (feet), so likewise the head is already at +x.
   * - rhino: its ends are within 0.06 of each other in height, so height says nothing. Its horns are
   *   the two small meshes at raw z ≈ −1.2 and −1.4, so the head is at −z; a quarter turn about y
   *   lays −z onto −x, and the half turn after it sends the head to +x.
   *
   * Worth knowing: reading these off a render is not good enough. All three were first written as
   * a facing and a derived turn, from looking at a picture, and the picture was misread — the
   * elephant and the giraffe came out facing backwards. They are numbers now because they were
   * measured, not because they were seen.
   */
  turns: ReadonlyArray<readonly [number, number, number]>;
}

const HALF_PI = Math.PI / 2;
const NO_TURNS: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 0]];
/** Lay raw −z onto −x, then turn the animal round so its head faces +x. */
const RHINO_TURNS: ReadonlyArray<readonly [number, number, number]> = [[0, HALF_PI, 0], [0, Math.PI, 0]];

export const GRAZER_SPECS: Readonly<Record<GrazerKind, GrazerSpec>> = {
  // Heights are the measured heights of the fitted models, so the drawn fallback is not a different
  // size from the animal that replaces it a moment later.
  elephant: {
    length: 7, height: 4.7, grazeDrop: 1.9, neck: 0.3, stride: 0.8,
    model: ELEPHANT_MODEL_URL, lengthAxis: 'x', turns: NO_TURNS,
  },
  // Authored standing and 519 units tall, in centimetres. Its length is on x, not on the y it is
  // tallest in, which is the whole reason `lengthAxis` exists.
  giraffe: {
    length: 6.5, height: 9.8, grazeDrop: 7.5, neck: 1.2, stride: 1.15,
    model: GIRAFFE_MODEL_URL, lengthAxis: 'x', turns: NO_TURNS,
  },
  // The only one of the three that is longest nose to tail, and the only rigged one: see its URL.
  rhino: {
    length: 5, height: 2.6, grazeDrop: 1.2, neck: 0.28, stride: 0.75,
    model: RHINO_MODEL_URL, lengthAxis: 'z', turns: RHINO_TURNS,
  },
};

export interface Grazer {
  readonly kind: GrazerKind;
  /** Middle of the patch it wanders about. */
  readonly homeX: number;
  readonly homeZ: number;
  /**
   * How far it strays from home on each axis.
   *
   * Held on each axis separately, and exactly equal to the bound of the wander below, so "the animal
   * stays within reach of its home" is the same statement as "the animal stays inside the plain".
   * A single radial reach would have to be checked against a rectangle by a search at run time.
   */
  readonly reachX: number;
  readonly reachZ: number;
  /** Rate its wander turns, and the offset that keeps two animals off the same beat. */
  readonly rate: number;
  readonly phase: number;
  /** Strides per second, before the herd speed is applied. */
  readonly cadence: number;
  /** The head-down cycle, as a rate and an offset. */
  readonly grazeRate: number;
  readonly grazePhase: number;
  /** Fraction of the cycle spent with its head down. */
  readonly grazeDuty: number;
}

export interface GrazerPose {
  x: number;
  y: number;
  z: number;
  /** Heading in the XZ plane, where 0 points along +x. */
  yaw: number;
  /** Whether it is grazing this frame, which is what the renderer plays the graze beat for. */
  headDown: boolean;
  /**
   * Nose-down dip of the whole animal while grazing, in radians. Zero whenever it is not grazing.
   *
   * A loaded animal is one merged mesh, so its head cannot drop on its own; the dip is what carries
   * the beat instead. The drawn fallback uses it too, so the two are grazing the same way.
   */
  bob: number;
  /** Where in its stride cycle it is, in [0, 1). Drives the legs of the drawn fallback. */
  stride: number;
}

/**
 * How far the wander throws an animal from its home, on one axis.
 *
 * Exactly 1, by construction: the two sine terms are weighted 0.78 and 0.22, and the triangle
 * inequality puts their sum at no more than 1. That is what lets `reachX` mean what it says.
 */
const WANDER_MAIN = 0.78;
const WANDER_WOBBLE = 0.22;

/**
 * Where a grazer's wander has put it at a given time, relative to its home.
 *
 * A pair of sine terms at incommensurate rates rather than a circle. A circle is exactly what the
 * sea's boat sails, and reusing it here would make the herd read as one animal copied N times going
 * round a ring. The two rates mean the path never quite closes, so an animal drifts across the patch
 * over a minute or so instead of retracing its steps forever.
 */
function wander(grazer: Grazer, time: number, pace: number): { x: number; z: number } {
  const a = grazer.phase + grazer.rate * time * pace;
  return {
    x: grazer.homeX + grazer.reachX * (WANDER_MAIN * Math.sin(a) + WANDER_WOBBLE * Math.sin(a * 2.7 + grazer.phase)),
    z: grazer.homeZ
      + grazer.reachZ * (WANDER_MAIN * Math.cos(a * 0.8) + WANDER_WOBBLE * Math.sin(a * 1.9 + grazer.phase * 2)),
  };
}

/**
 * How far ahead to sample the wander to get a heading.
 *
 * Small, because this is a finite difference and the error grows with how far the path curves across
 * the step. At 0.05s the estimate was measurably behind the animal's real heading on the tighter
 * wander, which showed up as a head that pointed a few degrees off while walking.
 */
const YAW_EPSILON = 0.01;

/**
 * Where a grazer is and what it is doing at a given time.
 *
 * `speed` scales how fast the whole herd moves, and is divided by the default rather than used raw
 * so that the speed a grazer is described at is the speed it actually walks at by default.
 */
export function grazerPose(
  grazer: Grazer,
  time: number,
  ground: Ground,
  speed: number = HERD_SPEED_DEFAULT,
): GrazerPose {
  const pace = speed / HERD_SPEED_DEFAULT;
  const here = wander(grazer, time, pace);
  const ahead = wander(grazer, time + YAW_EPSILON, pace);
  // Where the animal is going rather than which way it was last frame, so it turns into its new
  // heading instead of walking sideways for a frame after every change.
  const yaw = Math.atan2(ahead.z - here.z, ahead.x - here.x);

  // The head goes down for `grazeDuty` of the cycle. `sin(a) > t` holds for a fraction
  // (π - 2·asin t) / 2π of a cycle, so solving that for the duty gives the threshold below: it is
  // the reason the duty here is exact rather than roughly half the time.
  //
  // The whole cycle runs on the paced clock, like the wander and the stride. A herd stopped at speed
  // zero has to be an animal standing still, and a graze cycle that kept running would put its head
  // down and lift it again while its feet never moved.
  const threshold = Math.sin(Math.PI * (0.5 - grazer.grazeDuty));
  const beat = Math.sin(grazer.grazePhase + grazer.grazeRate * pace * time);
  const headDown = beat > threshold;

  // How far into the grazing part of the cycle this is, from 0 at the moment it starts to 1 at the
  // peak. Measuring it from the threshold rather than from the sine itself is what keeps the dip
  // pointing the right way: an animal with a duty over half has a negative threshold, and taking the
  // sine as the dip would tilt it nose-up through the whole of a graze.
  const depth = threshold >= 1 ? 0 : (beat - threshold) / (1 - threshold);
  const bob = headDown ? GRAZE_BOB * clamp(depth, 0, 1) : 0;

  const stride = (grazer.cadence * pace * time + grazer.phase) % 1;
  return {
    x: here.x,
    y: ground.heightAt(here.x, here.z),
    z: here.z,
    yaw,
    headDown,
    bob,
    // Legs stop while grazing: an animal eating is not striding.
    stride: headDown ? 0 : stride,
  };
}

/**
 * How far the head has to tip down for the animal to reach the grass.
 *
 * Solved from the neck rather than chosen, because `grazeDrop` is stated as a height the head must
 * reach and the neck is a lever of known length. The sine is clamped because a neck too short for
 * its own drop would otherwise ask for an angle that does not exist, and the animal would tip past
 * the point where its nose is under the ground.
 */
export function grazeAngle(spec: GrazerSpec): number {
  const reach = spec.neck * spec.length;
  return -Math.asin(Math.min(1, spec.grazeDrop / reach));
}

/**
 * A herd on the plain: three kinds, each on its own patch, with its own gait and grazing beat.
 *
 * Patches are kept apart so the kinds do not walk through each other. `spacing` is the room left
 * around each patch as well as between them, which is what stops two kinds overlapping at the one
 * place their patches happen to be nearest.
 *
 * Every patch is held outside `clearing` by its own reach as well as by the clearing itself, not
 * just clear of the middle. A patch whose centre was allowed to sit inside the clearing would still
 * wander into it, and the camera is standing there.
 */
/**
 * A point on a square between `inner` and `outer` from the origin.
 *
 * Rejection rather than an angle-and-radius sample, because the region wanted is a square annulus:
 * sampling by angle and radius needs a non-uniform radius to fill a square, and getting that wrong
 * crowds the corners. Falls back to the outer edge rather than returning nothing, so a clearing too
 * big for the plain costs the herd its spread rather than its animals.
 */
function awayFromClearing(
  rng: () => number,
  inner: number,
  outer: number,
  avoid: { x: number; z: number },
): { x: number; z: number } {
  const from = Math.min(inner, outer * 0.9);
  const clearOf = (x: number, z: number) => Math.hypot(x - avoid.x, z - avoid.z) >= from;
  for (let attempt = 0; attempt < 64; attempt++) {
    const x = range(rng, -outer, outer);
    const z = range(rng, -outer, outer);
    if (clearOf(x, z)) return { x, z };
  }
  const x = avoid.x + range(rng, -outer, outer);
  const z = avoid.z + range(rng, -outer, outer);
  const d = Math.hypot(x - avoid.x, z - avoid.z) || 1;
  return { x: avoid.x + ((x - avoid.x) / d) * from, z: avoid.z + ((z - avoid.z) / d) * from };
}

export function herd(
  seed: string,
  count: number,
  size: number = SAVANNA_SIZE,
  spacing: number = 8,
  clearing: number = PLAIN_CLEARING,
  avoid: { x: number; z: number } = { x: 0, z: 0 },
): readonly Grazer[] {
  const rng = rngFromSeed(`${seed}:herd`);
  // Leaves the middle of the plain open, so the herd is spread across it rather than crowded into
  // the one spot a random scatter would otherwise put most of them.
  const limit = (size / 2) * GRAZE_REACH - spacing;
  return Array.from({ length: Math.max(0, Math.round(count)) }, (_, i) => {
    // Divided round the three kinds so the mix is guaranteed rather than left to chance: a herd of
    // twenty that happened to draw fifteen wildebeest and no giraffes is not a mix.
    const kind = GRAZER_KINDS[i % GRAZER_KINDS.length];
    // A smaller reach than it could be, because it is added to the clearing and both come off the
    // same budget. A reach that fills the gap turns the herd into a thin ring around the middle.
    const reachX = range(rng, size * 0.03, size * 0.08);
    const reachZ = range(rng, size * 0.03, size * 0.08);
    const grazeDuty = range(rng, 0.3, 0.6);
    // Outside the clearing by this animal's own reach, so it can graze towards the middle but never
    // into it. Falls back to the far side of the annulus if the draws keep landing too close in.
    const home = awayFromClearing(rng, clearing + Math.max(reachX, reachZ), limit, avoid);
    return {
      kind,
      homeX: home.x,
      homeZ: home.z,
      reachX,
      reachZ,
      rate: range(rng, 0.1, 0.26),
      phase: range(rng, 0, Math.PI * 2),
      // A giraffe's legs are longer, so it takes longer strides at the same rate.
      cadence: range(rng, 0.9, 1.5) / GRAZER_SPECS[kind].stride,
      grazeRate: range(rng, 0.12, 0.3),
      grazePhase: range(rng, 0, Math.PI * 2),
      grazeDuty,
    };
  });
}