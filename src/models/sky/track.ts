/**
 * How far a wheel of the given radius has turned after rolling `distance` along the track. A
 * wheel rolls without slipping, so the distance it covers equals the arc it turns through.
 */
export function wheelAngle(distance: number, radius: number): number {
  return distance / radius;
}

/** A closed loop for the toy train: where it is and which way it faces at any distance travelled.
 * Pure maths with no renderer dependency, so the layout can be tested on its own.
 */

export interface TrackPoint {
  x: number;
  z: number;
  /** Direction of travel in the XZ plane, in radians, where 0 points along +x. */
  heading: number;
}

export interface Track {
  readonly length: number;
  /** `distance` wraps, so negative values run backwards from the start. */
  at(distance: number): TrackPoint;
}

/** Straight run along a fixed axis. */
const straight = (length: number, x0: number, z0: number, dx: number, dz: number, heading: number) => ({
  length,
  sample: (t: number): TrackPoint => ({ x: x0 + dx * t, z: z0 + dz * t, heading }),
});

/** Quarter-circle corner. `theta` runs clockwise, so the tangent is (sin, -cos). */
const corner = (cx: number, cz: number, radius: number, theta0: number) => ({
  length: (Math.PI / 2) * radius,
  sample: (t: number): TrackPoint => {
    const theta = theta0 - t * (Math.PI / 2);
    return {
      x: cx + radius * Math.cos(theta),
      z: cz + radius * Math.sin(theta),
      heading: Math.atan2(-Math.cos(theta), Math.sin(theta)),
    };
  },
});

type Segment = { length: number; sample: (t: number) => TrackPoint };

/**
 * A rounded-rectangle loop centred on the origin, built from four straight runs and four
 * quarter-circle corners. Straight runs stay on the rectangle's edges, so the loop never
 * leaves the width/depth it was given.
 */
export function roundedRectTrack(width: number, depth: number, radius: number): Track {
  const halfW = width / 2;
  const halfD = depth / 2;
  const r = Math.min(radius, halfW, halfD);
  const sx = halfW - r; // straight half-length along x
  const sz = halfD - r; // straight half-length along z

  const segments: Segment[] = [
    straight(2 * sx, -sx, halfD, 2 * sx, 0, 0),
    corner(sx, halfD - r, r, Math.PI / 2),
    straight(2 * sz, halfW, sz, 0, -2 * sz, -Math.PI / 2),
    corner(halfW - r, -sz, r, 0),
    straight(2 * sx, sx, -halfD, -2 * sx, 0, Math.PI),
    corner(-sx, -halfD + r, r, -Math.PI / 2),
    straight(2 * sz, -halfW, -sz, 0, 2 * sz, Math.PI / 2),
    corner(-(halfW - r), sz, r, Math.PI),
  ];

  const length = segments.reduce((total, s) => total + s.length, 0);

  return {
    length,
    at(distance: number): TrackPoint {
      let d = distance % length;
      if (d < 0) d += length;
      for (const segment of segments) {
        if (d < segment.length) return segment.sample(segment.length === 0 ? 0 : d / segment.length);
        d -= segment.length;
      }
      return segments[segments.length - 1].sample(1); // only reachable through float drift
    },
  };
}