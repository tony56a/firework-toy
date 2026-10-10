export const WORLD_SIZE = 180;
export const TERRAIN_SEGMENTS = 150;
export const MAX_TREES = 2400;
export const GRAVITY = 9;

// The diorama table in the sky scene, and the loop the toy train runs around it.
export const TABLE_WIDTH = 64;
export const TABLE_DEPTH = 40;
export const TABLE_HEIGHT = 2.6;
export const TABLE_TOP_THICKNESS = 0.7;
/** How far the legs sit in from the table border, so they read as tucked under the slab. */
export const TABLE_LEG_INSET = 5;
export const TABLE_LEG_HEIGHT = TABLE_HEIGHT - TABLE_TOP_THICKNESS;
/** Keeps the track this far in from the table edge, so the loop stays on the tabletop. */
export const TRACK_INSET = 6;
export const TRACK_RADIUS = 9;
/** Distance between displayed models along the middle of the table. */
export const MODEL_SPACING = 11;
export const TRAIN_SPEED_MAX = 3;
export const TRAIN_SPEED_DEFAULT = 1;

// The concrete pad in the third scene: a flat slab cast as a grid of panels.
export const CONCRETE_SIZE = 130;
export const CONCRETE_THICKNESS = 2;
/** Side length of one cast panel, which sets where the expansion joints fall. */
export const CONCRETE_PANEL = 13;
export const CONCRETE_JOINT_WIDTH = 0.55;
/** Aggregate speckle: cycles per world unit, and how strongly it tints. */
export const CONCRETE_SPECKLE_SCALE = 1.7;
export const CONCRETE_SPECKLE_STRENGTH = 0.8;

// The launch site standing on the concrete: the pad the rocket sits on and the buildings beside it.
export const PAD_RADIUS = 14;
/**
 * The rocket, an Atlas V 551, sized against the pad so the two read together. The real vehicle is
 * 58.3 m tall against a 3.81 m core, so at 22 units the core comes out at 0.72: a 15:1 slenderness.
 * That thinness is the point of the vehicle, but it is well inside the apron, so the pad rings
 * drawn from this radius are correspondingly tight.
 */
export const ROCKET_HEIGHT = 22;
export const ROCKET_RADIUS = 0.72;
/**
 * How far back from the pad the service tower stands, and how tall it is. Far enough back that it
 * does not hide the rocket from the orbit and ground cameras, and shorter than the rocket so the
 * rocket still reads as the tallest thing on the pad.
 */
export const TOWER_OFFSET = 13;
export const TOWER_HEIGHT = 18;
export const TOWER_WIDTH = 4;
/** Ground buildings are set this far out from the pad, clear of the apron. */
export const BUILDING_CLEARANCE = 26;
export const BUILDING_MIN_HEIGHT = 5;
export const BUILDING_MAX_HEIGHT = 17;
export const BUILDING_MIN_DEPTH = 5;
export const BUILDING_MAX_DEPTH = 11;

/**
 * The launch sequence, in seconds. Hold clamps the rocket down, then it rises easing away as a real
 * one does, then bursts at apex.
 *
 * The burst height is adjustable rather than fixed, because the camera now follows the rocket and
 * there is no longer a height that would otherwise fall outside the frame. The floor is roughly
 * three times the rocket's own height, so the pad is left visibly below the burst.
 */
export const LAUNCH_HOLD = 0.9;
export const LAUNCH_CLIMB = 3.4;
export const LAUNCH_BURST_DEFAULT = 60;
export const LAUNCH_BURST_MIN = 40;
export const LAUNCH_BURST_MAX = 150;
/** How long the pad stays empty after a launch before the rocket is set up again. */
export const LAUNCH_RESET = 2.6;
/**
 * Where a standing viewer is placed in the concrete scene. The rocket stands at the origin, so the
 * default origin-centred viewpoint would put the viewer inside it. This is on the far side of the
 * pad from the service tower, so looking at the pad puts the rocket in front with the tower behind.
 */
export const SITE_VIEWER_Z = -30;
/** Seconds between spoken numbers in the launch countdown. */
export const COUNTDOWN_TICK = 1.1;
/** The count a launch starts from, and the longest and shortest it can be set to. */
export const COUNTDOWN_DEFAULT = 10;
export const COUNTDOWN_MIN = 3;
export const COUNTDOWN_MAX = 10;

// The sea: a walled basin of water with a boat working a course inside it. The basin is bounded on
// purpose, so the water reads as a thing with edges rather than a horizon that goes on forever.
export const SEA_SIZE = 150;
/** Depth from the waterline down to the top of the basin floor. */
export const SEA_DEPTH = 5;
export const SEA_FLOOR_THICKNESS = 2;
/** How far the walls stand above the waterline, and how thick they are. */
export const SEA_RIM_HEIGHT = 1.8;
export const SEA_RIM_THICKNESS = 4;
export const SEA_SEGMENTS = 120;
/** Overall swell height. Each wave in the sea model is a fraction of this. */
export const WAVE_AMPLITUDE = 0.5;
/**
 * Waves are eased to nothing across this band at the walls, so the water meets them flat instead of
 * clipping through them.
 */
export const WAVE_EDGE_BAND = 10;
export const BOAT_LENGTH = 8;
export const BOAT_BEAM = 2.6;
export const BOAT_SPEED_DEFAULT = 2.2;
export const BOAT_SPEED_MAX = 6;

/**
 * The downloaded low-poly fish, where the app looks for it. Served from `public/` so it sits beside
 * the app as a plain file. If it is missing the sea falls back to a fish drawn in code, so a fresh
 * clone still runs.
 *
 * "Low Poly Fish" by Floreswa, CC Attribution (CC BY 4.0), from Sketchfab. Attribution is required by
 * the licence: https://sketchfab.com/3d-models/low-poly-fish-ad9f6c5834ce491fa3a891010b781ae6
 */
export const FISH_MODEL_URL = 'models/low-poly-fish.glb';

// The fish in the sea. Big enough to read as fish from the orbit camera rather than as specks, and
// sized against the boat so the two look like they belong in the same water: a fish comes up roughly
// half the length of the hull it is swimming past.
export const FISH_LENGTH = 4;
export const FISH_DEPTH = 1.3;
/**
 * Which end of a downloaded fish's longest axis its head is at. A bounding box cannot tell you —
 * a fish is not symmetric front to back but a box is — so this was measured off the file, by finding
 * which end the eyes sit on. Every one of the three fish in the pack agrees.
 */
export const FISH_NOSE_END = 'negative' as const;


/** Peak engine plume length, and how fast it flickers. */
export const PLUME_LENGTH = 7;
export const PLUME_FLICKER = 18;
