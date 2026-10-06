import { WORLD_SIZE } from '../config';

/**
 * Height lookup for whatever the camera and fireworks sit on. `Terrain` satisfies this, and so does
 * `FlatGround`, which lets scenes without a heightfield plug into the same camera and launch code.
 */
export interface Ground {
  /** Side length of the playable area; launches are clamped to its edges. */
  readonly size: number;
  heightAt(x: number, z: number): number;
}

/** A level plane at y = 0, for scenes that have no terrain to stand on. */
export class FlatGround implements Ground {
  constructor(readonly size: number = WORLD_SIZE) {}

  heightAt(): number {
    return 0;
  }
}
