import {
  BUILDING_CLEARANCE, BUILDING_MAX_DEPTH, BUILDING_MAX_HEIGHT, BUILDING_MIN_DEPTH, BUILDING_MIN_HEIGHT,
  CONCRETE_SIZE, PAD_RADIUS, TOWER_HEIGHT, TOWER_OFFSET, TOWER_WIDTH,
} from '../config';
import { range, rngFromSeed, type Rng } from '../core/random';

/**
 * The launch site on the concrete pad: where the rocket stands, where the tower is, and where the
 * buildings go. Pure layout with no renderer dependency, so what can and cannot overlap is checked
 * here rather than discovered on screen.
 */

export interface Spot {
  x: number;
  z: number;
}

export interface Building extends Spot {
  width: number;
  depth: number;
  height: number;
  rotationY: number;
  /** Two random numbers the renderer uses to vary the facade. */
  tint: [number, number];
}

/** The rocket stands at the centre, so the pad can be centred on it. */
export const ROCKET_SPOT: Readonly<Spot> = { x: 0, z: 0 };

/** The service tower stands off to one side, the way a real one does, rather than behind. */
export const TOWER_SPOT: Readonly<Spot> = { x: 0, z: TOWER_OFFSET };

/** Height of the tower, kept here so the layout and the renderer agree. */
export const TOWER_SIZE = { height: TOWER_HEIGHT, width: TOWER_WIDTH };

/**
 * Ground buildings, arranged along both sides of the site and set back from the pad so nothing
 * crowds the rocket. Placed on a grid rather than scattered, which reads as a facility rather than
 * as debris, and seeded so a new seed gives a different but equally orderly site.
 */
export function siteBuildings(seed: string, count: number = 8): readonly Building[] {
  const rng = rngFromSeed(`${seed}:site`);
  const buildings: Building[] = [];
  const step = 22;
  // Two rows either side of the pad, running along x.
  const rows: ReadonlyArray<number> = [-BUILDING_CLEARANCE - 12, BUILDING_CLEARANCE + 12];
  for (const z of rows) {
    for (let i = 0; i < count / rows.length; i++) {
      const x = (i - (count / rows.length - 1) / 2) * step;
      buildings.push({
        x, z,
        width: range(rng, 7, 12),
        depth: range(rng, BUILDING_MIN_DEPTH, BUILDING_MAX_DEPTH),
        height: range(rng, BUILDING_MIN_HEIGHT, BUILDING_MAX_HEIGHT),
        rotationY: rng() < 0.5 ? 0 : Math.PI / 2,
        tint: [rng(), rng()],
      });
    }
  }
  return buildings;
}

/** True when a building would sit on the pad apron or the tower, which the layout must avoid. */
export function clashesWithPad(building: Building, padRadius: number = PAD_RADIUS): boolean {
  return Math.hypot(building.x, building.z) < padRadius;
}

/** Buildings that would run off the edge of the slab, which the renderer cannot show. */
export function offSlab(building: Building, half: number = CONCRETE_SIZE / 2 - 2): boolean {
  const reach = Math.max(building.width, building.depth) / 2;
  return Math.abs(building.x) + reach > half || Math.abs(building.z) + reach > half;
}

/** Rejection sampler used to place a building without disturbing the rest of the layout. */
export function tryPlaceBuilding(
  rng: Rng, taken: readonly Building[], padRadius: number, half: number,
): Building | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate: Building = {
      x: range(rng, -half, half),
      z: range(rng, -half, half),
      width: range(rng, 7, 12),
      depth: range(rng, BUILDING_MIN_DEPTH, BUILDING_MAX_DEPTH),
      height: range(rng, BUILDING_MIN_HEIGHT, BUILDING_MAX_HEIGHT),
      rotationY: 0,
      tint: [rng(), rng()],
    };
    if (clashesWithPad(candidate, padRadius) || offSlab(candidate, half)) continue;
    // Keep a gap between buildings so they read as separate structures.
    if (taken.some((b) => Math.hypot(b.x - candidate.x, b.z - candidate.z) < 12)) continue;
    return candidate;
  }
  return null;
}
