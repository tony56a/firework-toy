import { WORLD_SIZE } from '../../config';
import { createNoise, fbm, type Noise2D } from '../../core/noise';
import { clamp, rngFromSeed } from '../../core/random';
import type { Ground } from '../ground';

/** Blend factors describing the ground surface at a point. The renderer maps them to colors. */
export interface GroundWeights {
  grass: number;
  dry: number;
  dark: number;
  shade: number;
}

/** Pure, seeded description of the landscape: heights, forest density and surface mix. */
export class Terrain implements Ground {
  readonly size: number;
  private readonly heightNoise: Noise2D;
  private readonly colorNoise: Noise2D;
  private readonly forestNoise: Noise2D;
  private readonly speciesNoise: Noise2D;

  constructor(seed: string, size: number = WORLD_SIZE) {
    this.size = size;
    const rng = rngFromSeed(seed);
    this.heightNoise = createNoise(rng);
    this.colorNoise = createNoise(rng);
    this.forestNoise = createNoise(rng);
    this.speciesNoise = createNoise(rng);
  }

  heightAt(x: number, z: number): number {
    const e = fbm(this.heightNoise, x * 0.011, z * 0.011, 4);
    const edge = Math.min(Math.hypot(x, z) / (this.size / 2), 1);
    return (e - 0.5) * 22 * (0.4 + edge * 0.9);
  }

  /** Larger values mean denser forest. Roughly 0.2 to 0.8. */
  forestDensity(x: number, z: number): number {
    return fbm(this.forestNoise, x * 0.025, z * 0.025, 3);
  }

  /** Above 0.5 favors pines over oaks. */
  pineBias(x: number, z: number): number {
    return this.speciesNoise(x * 0.03, z * 0.03);
  }

  groundWeights(x: number, z: number): GroundWeights {
    return {
      grass: fbm(this.colorNoise, x * 0.05, z * 0.05, 3),
      dry: clamp(Math.max(0, fbm(this.colorNoise, x * 0.02 + 40, z * 0.02, 2) - 0.55) * 2.2, 0, 1),
      dark: clamp(Math.max(0, fbm(this.forestNoise, x * 0.03, z * 0.03, 2) - 0.55) * 1.6, 0, 1),
      shade: 0.85 + fbm(this.colorNoise, x * 0.4, z * 0.4, 1) * 0.3,
    };
  }
}
