/**
 * How a scene wants the camera to treat it. The rig used to hardcode forest-sized numbers, which
 * left a small tabletop diorama framed like a landscape: too far out, and able to zoom inside
 * itself. Each scene states its own subject size and surface instead.
 */
export interface CameraFraming {
  /** Radius of the sphere around the origin the camera should frame. */
  radius: number;
  /** Height of the surface the viewer can stand on, above the ground. */
  surface: number;
}

export interface CameraConstants {
  orbitRadius: number;
  orbitMin: number;
  orbitMax: number;
  /** Height of a viewer's eye above the surface they stand on. */
  eyeOffset: number;
  overheadHeight: number;
  planeRadius: number;
  planeMinHeight: number;
  planeTargetHeight: number;
  ridgeX: number;
  ridgeZ: number;
  ridgeHeight: number;
  ridgeTargetHeight: number;
}

/**
 * Ratios below are expressed against the framing radius, with the forest's own numbers in
 * brackets: the forest spans WORLD_SIZE (radius 90), so its orbit sat at 95 (1.06x) and its
 * overhead camera at 170 (1.89x). Deriving rather than hardcoding keeps the forest looking exactly
 * as it did while letting a small subject frame itself.
 */
export function cameraConstants(framing: CameraFraming): CameraConstants {
  const r = framing.radius;
  return {
    orbitRadius: r * 1.06,
    // Close enough in to inspect a tree, far enough out never to end up inside the subject.
    orbitMin: r * 0.45,
    orbitMax: r * 4,
    eyeOffset: 1.4,
    overheadHeight: r * 1.89,
    planeRadius: r * 0.83,
    planeMinHeight: r * 0.56,
    planeTargetHeight: framing.surface + 3.5,
    ridgeX: -r * 0.78,
    ridgeZ: r * 0.78,
    ridgeHeight: r * 0.16,
    ridgeTargetHeight: framing.surface + 1.5,
  };
}
