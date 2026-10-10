import { ACACIA_HEIGHT, MAX_ACACIAS } from '../../config';
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
  maxAttempts: number;
}

const DEFAULTS: ScatterOptions = { minSpacing: 12, margin: 12, maxAttempts: 120_000 };

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
    const density = savanna.acaciaDensity(x, z);
    // The power curve keeps the thin areas genuinely thin, so the plain has open ground to graze on
    // rather than an even sprinkle everywhere.
    const acceptance = Math.pow(Math.max(0, density - 0.42) * 2.6, 1.5) * 1.4 + 0.01;
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