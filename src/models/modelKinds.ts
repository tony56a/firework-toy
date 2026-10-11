/** The kinds of little model the scene knows how to build and display. */
export type ModelKind = 'pine' | 'oak' | 'acacia';

export const MODEL_KINDS: readonly ModelKind[] = ['pine', 'oak', 'acacia'];

/**
 * One tree standing on the ground: where it is, how it is turned and sized, and how it is coloured.
 *
 * Shared by every scene that scatters trees, so a species only has to be described once and any of
 * them can be drawn by `TreeView`. The forest's pines and oaks and the savanna's acacias differ only
 * in which species they place and how densely.
 */
export interface TreeInstance {
  kind: ModelKind;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  tiltX: number;
  tiltZ: number;
  scale: [number, number, number];
  /** Two random numbers in [0, 1) the renderer uses to vary foliage colour. */
  tint: [number, number];
}
