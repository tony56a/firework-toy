import { ACACIA_HEIGHT, MAX_ACACIAS, PLAIN_CLEARING } from '../../config';
import { rngFromSeed } from '../../core/random';
import type { Savanna } from './ground';

export interface Acacia {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  /** How much it leans off vertical, and which way. A savanna acacia is never quite upright. */
  tiltX: number;
  tiltZ: number;
  scale: number;
  /** Two random numbers in [0, 1) the renderer uses to vary canopy colour. */
  tint: [number, number];
}

export interface ScatterOptions {
  minSpacing: number;
  margin: number;
  /**
   * Radius kept clear around `clearOf`, so the eye-level camera is not standing under a canopy.
   */
  clearingRadius: number;
  /**
   * Where the clearing is. Defaults to the origin, which suits a scene viewed from above; the
   * savanna's viewer stands well off to one side, so it passes its own.
   */
  clearOf: { x: number; z: number };
  /**
   * Furthest out from the middle that a tree may stand, as a fraction of the plain's half-width.
   *
   * The trees are a belt rather than a field, leaving open grass beyond them. The camera rig puts
   * its ridge and flyover positions at a fixed fraction of the framing radius, and when the trees
   * reached the edge of the plain those cameras stood inside the wood with a canopy across the lens.
   */
  outerReach: number;
  maxAttempts: number;
}

const ORIGIN = { x: 0, z: 0 };
const DEFAULTS: ScatterOptions = {
  minSpacing: 10, margin: 12, clearingRadius: PLAIN_CLEARING, outerReach: 0.62,
  clearOf: ORIGIN, maxAttempts: 120_000,
};

/**
 * Dart-throwing scatter of acacias, weighted by the plain's density noise.
 *
 * The spacing is much wider than the forest's because an acacia is a broad, flat-topped tree: set
 * them as close together as the forest's pines and the canopies merge into one hedge, which is the
 * look of a wood and not of a savanna. The attempt sequence does not depend on `count`, so raising
 * the count only adds trees rather than moving the ones already placed.
 */
export function scatterAcacias(
  savanna: Savanna,
  seed: string,
  count: number,
  options: Partial<ScatterOptions> = {},
): Acacia[] {
  const o = { ...DEFAULTS, ...options };
  const target = Math.min(count, MAX_ACACIAS);
  const rng = rngFromSeed(`${seed}:acacias`);
  const half = savanna.size / 2 - o.margin;
  const cell = o.minSpacing;
  const grid = new Map<number, Acacia[]>();
  const keyOf = (gi: number, gj: number) => (gi + 2048) * 4096 + (gj + 2048);
  const trees: Acacia[] = [];

  for (let attempt = 0; attempt < o.maxAttempts && trees.length < target; attempt++) {
    const x = (rng() * 2 - 1) * half;
    const z = (rng() * 2 - 1) * half;
    if (Math.hypot(x - o.clearOf.x, z - o.clearOf.z) < o.clearingRadius) continue;
    if (Math.hypot(x, z) > (savanna.size / 2) * o.outerReach) continue;
    const density = savanna.acaciaDensity(x, z);
    // The power curve keeps the thin areas thin, so the belt has open ground between clumps rather
    // than an even sprinkle. Floored, because without a floor the count depends on where this
    // particular seed's noise happens to be low: the same belt held 95 trees across the whole plain
    // and 8 once it was cut down, which made the count slider meaningless rather than varied.
    const acceptance = Math.max(0.34, Math.pow(Math.max(0, density - 0.42) * 2.6, 1.5) * 1.4 + 0.01);
    if (rng() > acceptance) continue;

    const gi = Math.floor(x / cell);
    const gj = Math.floor(z / cell);
    let crowded = false;
    for (let i = -1; i <= 1 && !crowded; i++) {
      for (let j = -1; j <= 1 && !crowded; j++) {
        const neighbors = grid.get(keyOf(gi + i, gj + j));
        if (neighbors?.some((n) => Math.hypot(n.x - x, n.z - z) < o.minSpacing)) crowded = true;
      }
    }
    if (crowded) continue;

    const tree: Acacia = {
      x, z, y: savanna.heightAt(x, z),
      rotationY: rng() * Math.PI * 2,
      // Capped well under a right angle: a leaning tree is characterful, a fallen one is a bug.
      tiltX: (rng() - 0.5) * 0.14,
      tiltZ: (rng() - 0.5) * 0.14,
      // A wide spread of sizes, because a stand where every tree is the same height reads as a
      // plantation rather than as something that grew where it happened to.
      scale: ACACIA_HEIGHT * (0.65 + rng() * 0.8),
      tint: [rng(), rng()],
    };
    const key = keyOf(gi, gj);
    const bucket = grid.get(key);
    if (bucket) bucket.push(tree);
    else grid.set(key, [tree]);
    trees.push(tree);
  }
  return trees;
}