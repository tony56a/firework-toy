import { SEA_SIZE } from '../../config';
import type { Ground } from '../ground';
import { waveHeight } from './waves';

/**
 * The sea: a bounded basin of water. Implements `Ground` so the camera and the firework launcher
 * treat it like any other surface, and so launches are clamped to the basin rather than sailing off
 * past the walls.
 */
export class Sea implements Ground {
  readonly size: number;
  private time = 0;

  constructor(size: number = SEA_SIZE) {
    this.size = size;
  }

  heightAt(x: number, z: number): number {
    return waveHeight(x, z, this.time, this.size);
  }

  /** Advances the swell. Held by the scene so every consumer reads the same phase. */
  advance(dt: number): void {
    this.time += dt;
  }

  /** Seconds since the scene started, so the renderer can phase its own detail to match. */
  get elapsed(): number {
    return this.time;
  }
}