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
/** The rocket itself, sized against the pad so the two read together. */
export const ROCKET_HEIGHT = 22;
export const ROCKET_RADIUS = 1.7;
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
