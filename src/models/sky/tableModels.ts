import { MODEL_SPACING, TABLE_DEPTH, TABLE_LEG_HEIGHT, TABLE_LEG_INSET, TABLE_WIDTH, TRACK_INSET } from '../../config';
import type { ModelKind } from '../modelKinds';

/**
 * The models on show on the table, in the order they are placed. Growing the collection means
 * adding entries here; the table works out where each one stands.
 */
export interface TableModel {
  kind: ModelKind;
  label: string;
  scale: number;
}

export const TABLE_MODELS: readonly TableModel[] = [
  { kind: 'pine', label: 'Tall pine', scale: 2.4 },
  { kind: 'oak', label: 'Broad oak', scale: 2.2 },
  { kind: 'pine', label: 'Sapling', scale: 1.5 },
  { kind: 'oak', label: 'Old oak', scale: 2.8 },
];

export interface TableSpot {
  x: number;
  z: number;
}

/**
 * Spreads models along the middle of the tabletop, clear of the track that loops around the edge.
 * A single row keeps every model visible at once, which is the point of a display table.
 */
export function tableLayout(count: number, spacing: number = MODEL_SPACING): ReadonlyArray<TableSpot> {
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({
    x: (i - (count - 1) / 2) * spacing,
    z: 0,
  }));
}

/** Half-extents of the loop the train runs, which the layout has to stay inside. */
export const TRACK_BOUNDS = {
  width: TABLE_WIDTH - 2 * TRACK_INSET,
  depth: TABLE_DEPTH - 2 * TRACK_INSET,
};

/**
 * Where the table's legs stand: one cube at each corner, tucked under the slab and set in from
 * the border by `inset` so the slab visibly overhangs them. Legs are cubes of side `legSize`,
 * which keeps them from reading as thin sticks under a wide top.
 */
export function tableLegPositions(
  legSize: number = TABLE_LEG_HEIGHT,
  inset: number = TABLE_LEG_INSET,
): ReadonlyArray<TableSpot> {
  const x = TABLE_WIDTH / 2 - inset - legSize / 2;
  const z = TABLE_DEPTH / 2 - inset - legSize / 2;
  return [{ x: -x, z: -z }, { x, z: -z }, { x, z }, { x: -x, z }];
}
