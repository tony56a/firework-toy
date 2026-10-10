/**
 * Fitting a downloaded mesh to the size this world uses.
 *
 * A model from a model library arrives at whatever scale and orientation its author exported it at:
 * 3cm or 30m, long axis down any of six directions, sitting off at some unrelated origin. None of that
 * can be hardcoded, and guessing at it per model means retuning every time the asset changes. So the
 * fit is derived from the mesh's own bounding box every time it loads.
 *
 * Kept free of three.js so it can be unit tested; `render/gltfAssets.ts` does the measuring.
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

/** Which way round the mesh faces, as the far end of its long axis. */
export type FrontEnd = 'positive' | 'negative';

/** One of the three principal axes. */
export type Axis = 'x' | 'y' | 'z';

/** How to fit a mesh into this world: what size, along which axis, facing which way. */
export interface MeshFitOptions {
  /** Length the mesh's longest axis is scaled to. */
  length: number;
  /** Axis the mesh is laid along once fitted. Defaults to x, which is what a pose is measured on. */
  along?: Axis;
  /** Which end of the longest axis is the front. See {@link FrontEnd}. */
  front?: FrontEnd;
}

/** How to turn a mesh of some size into one drawn at a known size, axis and facing. */
export interface MeshFit {
  /** Uniform scale making the mesh's longest axis exactly `length`. */
  scale: number;
  /**
   * Rotations to apply, in order, each an XYZ Euler triple in radians.
   *
   * A list rather than one Euler angle because the facing fix has to come after the turn onto the
   * target axis: doing it first would need the centre offset to be worked out through a rotation that
   * is no longer the one being applied, and the mesh ends up somewhere other than the origin.
   */
  turns: ReadonlyArray<readonly [number, number, number]>;
  /** Translation putting the fitted mesh's centre on the origin, once the turns are applied. */
  offset: readonly [number, number, number];
}

const HALF_PI = Math.PI / 2;

/**
 * Quarter turns taking each source axis onto each target axis, keyed by target first.
 *
 * Explicit rather than computed, because every one of these is a single axis-aligned quarter turn with
 * an exact angle, and deriving them from quaternions would put floats where quarter turns belong.
 */
const TURNS_ONTO: Readonly<Record<Axis, Readonly<Record<Axis, readonly [number, number, number]>>>> = {
  x: { x: [0, 0, 0], y: [0, 0, -HALF_PI], z: [0, HALF_PI, 0] },
  y: { x: [0, 0, HALF_PI], y: [0, 0, 0], z: [-HALF_PI, 0, 0] },
  z: { x: [0, -HALF_PI, 0], y: [HALF_PI, 0, 0], z: [0, 0, 0] },
};

/**
 * A half turn that flips `axis`, for putting a backwards-facing front the right way round.
 *
 * The half turn has to be about an axis *perpendicular* to the one being flipped: a half turn about
 * an axis leaves that axis alone and negates the other two, so turning about the target itself would
 * fix nothing. Of the two perpendicular axes, y is preferred wherever it is available, because y is
 * up in this world and a turn about it rolls the mesh rather than pitching it. Fitting along y is the
 * one case with no such choice — there the pitch is unavoidable, since flipping y is the request.
 */
function halfTurn(flipping: Axis): readonly [number, number, number] {
  const about: Axis = flipping === 'y' ? 'z' : 'y';
  return about === 'z' ? [0, 0, Math.PI] : [0, Math.PI, 0];
}

/**
 * Which axis of the bounding box is longest, and how far it is.
 *
 * Returns null for a box with no measurable extent in any direction, which is what an unloaded or
 * empty mesh reports. Treating that as length zero rather than as a fit would put a divide by zero
 * and a NaN matrix into the scene graph.
 */
export function longestAxis(extent: Extent): { axis: Axis; length: number } | null {
  const longest = Math.max(extent.x, extent.y, extent.z);
  if (!Number.isFinite(longest) || longest <= 0) return null;
  // Ordered by extent, so a tie resolves to the first axis rather than to whichever was compared
  // last. A mesh lying exactly along two axes is a 45-degree object about its front, and no choice
  // here makes that right, so it does not matter which way the tie goes.
  if (extent.x === longest) return { axis: 'x', length: longest };
  if (extent.y === longest) return { axis: 'y', length: longest };
  return { axis: 'z', length: longest };
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
 * How to fit a mesh with this bounding box, so that it draws at `length` along `along`, facing the way
 * `front` says, with its centre on the origin.
 *
 * `front` is which end of the longest axis is the front, which no bounding box can tell you: an
 * object is not symmetric front to back, but a box is. It is measured once by looking at the model —
 * here by finding which end a fish's eyes are at — and then passed in, because it is the one thing
 * about an imported asset that cannot be derived.
 */
export function fitMesh(
  extent: Extent,
  centre: BoxOffset,
  options: MeshFitOptions,
): MeshFit | null {
  const along = options.along ?? 'x';
  const longest = longestAxis(extent);
  if (!longest) return null;
  const turns: Array<readonly [number, number, number]> = [TURNS_ONTO[along][longest.axis]];
  // A half turn about the target axis sends a front that ended up at the far end to the near one. It
  // is a rotation rather than a mirror, so the object turns around to face the other way and stays
  // the right way up.
  if ((options.front ?? 'positive') === 'negative') turns.push(halfTurn(along));
  // The offset has to cancel the centre as it is after every turn, not before them, so it is worked
  // out by running the turns on the scaled centre rather than on the authored one.
  const scale = options.length / longest.length;
  const scaled: BoxOffset = { x: centre.x * scale, y: centre.y * scale, z: centre.z * scale };
  const placed = turns.reduce((p, [rx, ry, rz]) => turnOnce(p, rx, ry, rz), scaled);
  return { scale, turns, offset: [-placed.x, -placed.y, -placed.z] };
}