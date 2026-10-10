import { FISH_LENGTH } from '../../config';

/**
 * Fitting a downloaded fish mesh to the size this world uses.
 *
 * A model from a model library arrives at whatever scale and orientation its author exported it at:
 * 3cm or 30m, nose along any of six directions, sitting off at some unrelated origin. None of that
 * can be hardcoded, and guessing at it per model means retuning every time the asset changes. So the
 * fit is derived from the mesh's own bounding box every time it loads.
 *
 * Kept free of three.js so it can be unit tested; `render/fishAssets.ts` does the measuring.
 */

/** The three full side lengths of a mesh's bounding box, before any fitting. */
export interface Extent {
  x: number;
  y: number;
  z: number;
}

/** The offset of a mesh's bounding box from its own centre, in three axes. */
export interface BoxOffset {
  x: number;
  y: number;
  z: number;
}

/** Which end of the mesh's longest axis its nose is at. */
export type NoseEnd = 'positive' | 'negative';

/** How to turn a mesh of some size into a fish of the size this world draws. */
export interface FishFit {
  /** Uniform scale making the fish's longest axis exactly `length`. */
  scale: number;
  /**
   * Rotations to apply, in order, each an XYZ Euler triple in radians.
   *
   * A list rather than one Euler angle because the nose fix has to come after the turn onto x: doing
   * it first would need the centre offset to be worked out through a rotation that is no longer the
   * one being applied, and the fish ends up somewhere other than the origin.
   */
  turns: ReadonlyArray<readonly [number, number, number]>;
  /** Translation putting the fitted mesh's centre on the origin, once the turns are applied. */
  offset: readonly [number, number, number];
}

/**
 * Which axis of the bounding box is longest, and how far it is.
 *
 * Returns null for a box with no measurable extent in any direction, which is what an unloaded or
 * empty mesh reports. Treating that as length zero rather than as a fit would put a divide by zero
 * and a NaN matrix into the scene graph.
 */
export function longestAxis(extent: Extent): { axis: 'x' | 'y' | 'z'; length: number } | null {
  const longest = Math.max(extent.x, extent.y, extent.z);
  if (!Number.isFinite(longest) || longest <= 0) return null;
  // Ordered by extent, so a tie resolves to the first axis rather than to whichever was compared
  // last. A fish lying exactly along two axes is a 45-degree fish about its nose, and no choice here
  // makes that right, so it does not matter which way the tie goes.
  if (extent.x === longest) return { axis: 'x', length: longest };
  if (extent.y === longest) return { axis: 'y', length: longest };
  return { axis: 'z', length: longest };
}

/** Euler angles, in radians, that turn `axis` onto +x. */
function rotationOntoX(axis: 'x' | 'y' | 'z'): readonly [number, number, number] {
  // Order matters: the x case is the identity and must not pick up a rotation from the others.
  if (axis === 'x') return [0, 0, 0];
  if (axis === 'y') return [0, 0, -Math.PI / 2];
  return [0, Math.PI / 2, 0];
}

/** Applies one XYZ Euler triple, in the same order three.js would. */
function turnOnce(p: BoxOffset, rx: number, ry: number, rz: number): BoxOffset {
  const y1 = p.y * Math.cos(rx) - p.z * Math.sin(rx);
  const z1 = p.y * Math.sin(rx) + p.z * Math.cos(rx);
  const x2 = p.x * Math.cos(ry) + z1 * Math.sin(ry);
  const z2 = -p.x * Math.sin(ry) + z1 * Math.cos(ry);
  const x3 = x2 * Math.cos(rz) - y1 * Math.sin(rz);
  return { x: x3, y: x2 * Math.sin(rz) + y1 * Math.cos(rz), z: z2 };
}

/**
 * How to fit a mesh with this bounding box, so that it draws as a fish of `length` pointing along +x
 * with its centre on the origin.
 *
 * `nose` is which end of the longest axis the head is on, which no bounding box can tell you: a fish
 * is not symmetric front to back, but a box is. It is measured once by looking at the model — here by
 * finding which end its eyes are at — and then passed in, because it is the one thing about an
 * imported asset that cannot be derived.
 */
export function fishFit(
  extent: Extent,
  centre: BoxOffset,
  length: number = FISH_LENGTH,
  nose: NoseEnd = 'positive',
): FishFit | null {
  const longest = longestAxis(extent);
  if (!longest) return null;
  const turns: Array<readonly [number, number, number]> = [rotationOntoX(longest.axis)];
  // A half turn about y in the fitted frame sends a nose that ended up on -x to +x. It is a rotation
  // rather than a mirror, so the fish turns around to face the other way and stays the right way up.
  if (nose === 'negative') turns.push([0, Math.PI, 0]);
  // The offset has to cancel the centre as it is after every turn, not before them, so it is worked
  // out by running the turns on the scaled centre rather than on the authored one.
  const scaled: BoxOffset = {
    x: centre.x * (length / longest.length),
    y: centre.y * (length / longest.length),
    z: centre.z * (length / longest.length),
  };
  const placed = turns.reduce((p, [rx, ry, rz]) => turnOnce(p, rx, ry, rz), scaled);
  return {
    scale: length / longest.length,
    turns,
    offset: [-placed.x, -placed.y, -placed.z],
  };
}