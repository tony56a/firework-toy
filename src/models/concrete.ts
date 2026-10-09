import { CONCRETE_SIZE } from '../config';
import type { Ground } from './ground';

/**
 * The ground for the concrete scene: a flat slab of a known size.
 *
 * This used to carry the panel grid, tones and expansion joints, but those now live in a fragment
 * shader where they have to, since they vary per pixel. All that is left here is flatness and a
 * size, which `FlatGround` already provides, so the scene uses that directly and this file is gone.
 *
 * @see ConcreteMaterial for the surface itself.
 */

/** Re-exported so the scene and its tests can talk about one slab size. */
export const CONCRETE_GROUND: Ground = {
  size: CONCRETE_SIZE,
  heightAt: () => 0,
};
