import { GRAZE_REACH, HERD_SPEED_DEFAULT, SAVANNA_SIZE } from '../../config';
import { range, rngFromSeed } from '../../core/random';
import type { Ground } from '../ground';

/**
 * A herd of grazers wandering a savanna.
 *
 * The animals are posed from absolute time rather than stepped forward by the frame, for the same
 * reason the fish are: a position that accumulates `dt` drifts with frame rate, and two animals asked
 * about the same instant have to agree with each other or the herd shears apart.
 */

/** The three kinds of grazer on the plain. They are told apart by shape and by how they move. */
export type GrazerKind = 'wildebeest' | 'zebra' | 'giraffe';

export const GRAZER_KINDS: readonly GrazerKind[] = ['wildebeest', 'zebra', 'giraffe'];

/** How big each kind is, and how far its head reaches when it drops to graze. */
export interface GrazerSpec {
  /** Nose to tail, which is what the body geometry is built around. */
  length: number;
  /** How tall it stands, giraffes by a long way. */
  height: number;
  /** How far below standing the head drops to graze, in the same units as height. */
  grazeDrop: number;
  /** Neck and head reach forward from the shoulder, as a fraction of length. */
  neck: number;
  /** Stride length as a fraction of its own length, so a giraffe takes visibly longer steps. */
  stride: number;
}

export const GRAZER_SPECS: Readonly<Record<GrazerKind, GrazerSpec>> = {
  wildebeest: { length: 4.2, height: 2, grazeDrop: 1.6, neck: 0.5, stride: 0.9 },
  zebra: { length: 4.6, height: 2.3, grazeDrop: 1.8, neck: 0.52, stride: 1 },
  // The drop is most of its height and the neck is long, which is what makes a grazing giraffe read
  // as one: a shape you can see over the top of the herd.
  giraffe: { length: 8, height: 8.6, grazeDrop: 6.8, neck: 0.9, stride: 1.15 },
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
  /** Whether the head is down grazing this frame, which is what the renderer drops it for. */
  headDown: boolean;
  /** Where in its stride cycle it is, in [0, 1). Drives the legs. */
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

/** How far ahead to sample the wander to get a heading. Any small step gives the same direction. */
const YAW_EPSILON = 0.05;

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
  const headDown = Math.sin(grazer.grazePhase + grazer.grazeRate * pace * time) > threshold;

  const stride = (grazer.cadence * pace * time + grazer.phase) % 1;
  return {
    x: here.x,
    y: ground.heightAt(here.x, here.z),
    z: here.z,
    yaw,
    headDown,
    // Legs stop while the head is down: an animal eating is not striding.
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
 */
export function herd(
  seed: string,
  count: number,
  size: number = SAVANNA_SIZE,
  spacing: number = 8,
): readonly Grazer[] {
  const rng = rngFromSeed(`${seed}:herd`);
  // Leaves the middle of the plain open, so the herd is spread across it rather than crowded into
  // the one spot a random scatter would otherwise put most of them.
  const limit = (size / 2) * GRAZE_REACH - spacing;
  return Array.from({ length: Math.max(0, Math.round(count)) }, (_, i) => {
    // Divided round the three kinds so the mix is guaranteed rather than left to chance: a herd of
    // twenty that happened to draw fifteen wildebeest and no giraffes is not a mix.
    const kind = GRAZER_KINDS[i % GRAZER_KINDS.length];
    const reachX = range(rng, size * 0.04, size * 0.11);
    const reachZ = range(rng, size * 0.04, size * 0.11);
    const grazeDuty = range(rng, 0.3, 0.6);
    return {
      kind,
      homeX: range(rng, -limit, limit),
      homeZ: range(rng, -limit, limit),
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