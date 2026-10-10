import { BOAT_BEAM, BOAT_LENGTH, SEA_SIZE } from '../../config';
import type { Ground } from '../ground';

/** Where the boat is on its course and which way it faces. */
export interface BoatPose {
  x: number;
  y: number;
  z: number;
  /** Heading in the XZ plane, where 0 points along +x. */
  yaw: number;
  /** Nose up positive, in radians. */
  pitch: number;
  /** Starboard side down positive, in radians. */
  roll: number;
}

/**
 * A closed elliptical course for the boat to work around. An ellipse rather than a rounded
 * rectangle because the sea is the only thing in this scene that shows where the boat has been, and
 * a continuous curve reads better against it than four straight runs and four corners.
 *
 * Parameterized by angle rather than arc length, so the boat slows on the flat sides of the ellipse
 * and speeds up at the ends. That is backwards for a real boat, but it keeps the mapping exact: a
 * point on an ellipse maps to exactly one angle, with no table or search to go stale.
 */
export interface BoatCourse {
  readonly radiusX: number;
  readonly radiusZ: number;
  at(angle: number): { x: number; z: number; yaw: number };
}

export function ellipseCourse(radiusX: number, radiusZ: number): BoatCourse {
  return {
    radiusX,
    radiusZ,
    at(angle: number) {
      const x = Math.cos(angle) * radiusX;
      const z = Math.sin(angle) * radiusZ;
      // The tangent to the ellipse, which is what a boat steering round a course actually points
      // along. Differentiating the position gives (-rx sin, rz cos).
      return { x, z, yaw: Math.atan2(radiusZ * Math.cos(angle), -radiusX * Math.sin(angle)) };
    },
  };
}

/**
 * A course that keeps the whole hull inside the basin. The boat is steered from its centre, so the
 * course itself has to stand off by more than the hull's reach along its direction of travel.
 */
export function basinCourse(
  size: number = SEA_SIZE,
  margin: number = BOAT_LENGTH,
): BoatCourse {
  const limit = size / 2 - margin;
  return ellipseCourse(limit, limit);
}

/**
 * Samples the surface either side of the boat, so it can lean with the water rather than slide on
 * it. Takes a `Ground` rather than a `Sea` because nothing here needs the swell itself, only the
 * height at a point, which lets a test float the boat on flat water.
 */
function slope(sea: Ground, x: number, z: number, dx: number, dz: number): number {
  return sea.heightAt(x + dx, z + dz) - sea.heightAt(x - dx, z - dz);
}

/**
 * Where the boat sits and how it is tilted at a point on its course. Kept in the model rather than
 * the renderer so the pose can be tested without a browser: the boat floating level on a sloping sea
 * is the kind of thing that only shows up once it is already on screen.
 */
export function boatPose(course: BoatCourse, angle: number, sea: Ground): BoatPose {
  const { x, z, yaw } = course.at(angle);
  // Half the hull either way, so the tilt is measured over the boat's own length and beam rather
  // than over an arbitrary step, which would make a long boat look stiffer than a short one.
  const reach = BOAT_LENGTH / 2;
  const halfBeam = BOAT_BEAM / 2;
  const dx = Math.cos(yaw) * reach;
  const dz = Math.sin(yaw) * reach;
  return {
    x,
    y: sea.heightAt(x, z),
    z,
    yaw,
    pitch: Math.atan(slope(sea, x, z, dx, dz) / (2 * reach)),
    // Across the beam, which is perpendicular to the heading.
    roll: Math.atan(slope(sea, x, z, -Math.sin(yaw) * halfBeam, Math.cos(yaw) * halfBeam) / BOAT_BEAM),
  };
}