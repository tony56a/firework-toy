import { MAX_TREES } from '../../config';
import { rngFromSeed } from '../../core/random';
import type { Terrain } from './terrain';

export type TreeKind = 'pine' | 'oak';

export interface TreeInstance {
  kind: TreeKind;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  tiltX: number;
  tiltZ: number;
  scale: [number, number, number];
  /** Two random numbers in [0, 1) the renderer uses to vary foliage color. */
  tint: [number, number];
}

export interface ScatterOptions {
  minSpacing: number;
  margin: number;
  clearingRadius: number;
  maxAttempts: number;
}

const DEFAULTS: ScatterOptions = { minSpacing: 3.4, margin: 6, clearingRadius: 8, maxAttempts: 120_000 };

/**
 * Dart-throwing scatter with a minimum spacing, weighted by the terrain's forest density.
 * The attempt sequence does not depend on `count`, so raising the count only adds trees.
 */
export function scatterTrees(
  terrain: Terrain,
  seed: string,
  count: number,
  options: Partial<ScatterOptions> = {},
): TreeInstance[] {
  const o = { ...DEFAULTS, ...options };
  const target = Math.min(count, MAX_TREES);
  const rng = rngFromSeed(`${seed}:trees`);
  const half = terrain.size / 2 - o.margin;
  const cell = o.minSpacing;
  const grid = new Map<number, TreeInstance[]>();
  const keyOf = (gi: number, gj: number) => (gi + 2048) * 4096 + (gj + 2048);
  const trees: TreeInstance[] = [];

  for (let attempt = 0; attempt < o.maxAttempts && trees.length < target; attempt++) {
    const x = (rng() * 2 - 1) * half;
    const z = (rng() * 2 - 1) * half;
    const forest = terrain.forestDensity(x, z);
    const acceptance = Math.pow(Math.max(0, (forest - 0.35) * 2.8), 1.3) * 1.2 + 0.01;
    if (rng() > acceptance) continue;
    if (Math.hypot(x, z) < o.clearingRadius) continue;

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

    const kind: TreeKind = terrain.pineBias(x, z) > 0.5 || rng() < 0.12 ? 'pine' : 'oak';
    const s = 0.7 + rng() * 0.9;
    const tree: TreeInstance = {
      kind, x, z, y: terrain.heightAt(x, z),
      rotationY: rng() * Math.PI * 2,
      tiltX: (rng() - 0.5) * 0.06,
      tiltZ: (rng() - 0.5) * 0.06,
      scale: [s * (0.9 + rng() * 0.2), s * (0.85 + rng() * 0.3), s * (0.9 + rng() * 0.2)],
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
