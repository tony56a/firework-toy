import { SAVANNA_SIZE } from '../../config';
import { createNoise, fbm, type Noise2D } from '../../core/noise';
import { clamp, rngFromSeed } from '../../core/random';
import type { Ground } from '../ground';

/**
 * A wide, flat plain of dry grass, with the low-frequency swell that decides where a herd can graze.
 *
 * Much flatter than the forest's terrain on purpose. A savanna reads as flat because what makes it a
 * savanna is the scatter of trees and animals across it, and a lumpy heightfield reads as hills with
 * a few trees on them instead. The relief here is a fraction of the forest's, which is also what lets
 * the herd be placed by noise alone without every animal needing to find its own level.
 */

/** Blend factors describing the grass at a point. The renderer maps these to colors. */
export interface GrassWeights {
  /** Lighter, drier straw against shorter greener growth. */
  green: number;
  /** Bare, sun-bleached ground showing through. */
  bare: number;
  /** Per-blade shading, so the surface is not flat even where the colours agree. */
  shade: number;
}

export class Savanna implements Ground {
  readonly size: number;
  private readonly heightNoise: Noise2D;
  private readonly grassNoise: Noise2D;
  private readonly acaciaNoise: Noise2D;

  constructor(seed: string, size: number = SAVANNA_SIZE) {
    this.size = size;
    const rng = rngFromSeed(seed);
    this.heightNoise = createNoise(rng);
    this.grassNoise = createNoise(rng);
    this.acaciaNoise = createNoise(rng);
  }

  /**
   * A shallow swell, fading out toward the rim of the plain.
   *
   * Much flatter than the forest's terrain on purpose. A savanna reads as flat because what makes it
   * a savanna is the scatter of trees and animals across it, and a lumpy heightfield reads as hills
   * with a few trees on them instead.
   */
  heightAt(x: number, z: number): number {
    const e = fbm(this.heightNoise, x * 0.008, z * 0.008, 3);
    const edge = Math.min(Math.hypot(x, z) / (this.size / 2), 1);
    // Fading out toward the rim, so the plain ends in a level edge rather than a bank that the last
    // animal has to climb down and the camera has to look across.
    return (e - 0.5) * 5 * (1 - edge * 0.7);
  }

  /** Larger values mean acacias stand more readily. Roughly 0.2 to 0.8. */
  acaciaDensity(x: number, z: number): number {
    return fbm(this.acaciaNoise, x * 0.02, z * 0.02, 3);
  }

  grassWeights(x: number, z: number): GrassWeights {
    return {
      green: fbm(this.grassNoise, x * 0.035, z * 0.035, 3),
      bare: clamp(Math.max(0, fbm(this.grassNoise, x * 0.015 + 30, z * 0.015, 2) - 0.5) * 2.4, 0, 1),
      shade: 0.86 + fbm(this.grassNoise, x * 0.5, z * 0.5, 1) * 0.28,
    };
  }
}