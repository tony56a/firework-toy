import { CONCRETE_JOINT_WIDTH, CONCRETE_PANEL, CONCRETE_SIZE } from '../config';
import { createNoise, fbm, type Noise2D } from '../core/noise';
import { clamp, rngFromSeed } from '../core/random';
import type { Ground } from './ground';

/** Blend factors describing the concrete at a point; the renderer maps them to colors. */
export interface ConcreteWeights {
  /** Base tone, 0 dark to 1 pale. */
  tone: number;
  /** Weathering and staining, 0 clean to 1 heavily marked. */
  stain: number;
}

export interface ConcretePanel {
  col: number;
  row: number;
  /** Centre of the panel in world space. */
  x: number;
  z: number;
  /** How much this panel differs from its neighbours, so the slab reads as separate pours. */
  toneShift: number;
}

/**
 * A flat slab of poured concrete, pure and seeded: no three.js, so the panel layout and surface
 * mix can be tested on their own. Height is constant by design, which is the point of the scene.
 */
export class ConcreteSlab implements Ground {
  readonly size = CONCRETE_SIZE;
  /** Columns of panels across the slab. */
  readonly columns: number;
  readonly rows: number;
  private readonly panelList: ConcretePanel[];
  private readonly toneNoise: Noise2D;
  private readonly stainNoise: Noise2D;

  constructor(seed: string) {
    const rng = rngFromSeed(seed);
    this.toneNoise = createNoise(rng);
    this.stainNoise = createNoise(rng);
    this.columns = Math.round(CONCRETE_SIZE / CONCRETE_PANEL);
    this.rows = this.columns;
    this.panelList = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.columns; col++) {
        this.panelList.push({
          col, row,
          x: -CONCRETE_SIZE / 2 + CONCRETE_PANEL * (col + 0.5),
          z: -CONCRETE_SIZE / 2 + CONCRETE_PANEL * (row + 0.5),
          toneShift: (rng() - 0.5) * 0.16,
        });
      }
    }
  }

  /** Every cast panel, in row-major order. Read-only; the renderer reads tone, it never writes. */
  get panels(): readonly ConcretePanel[] {
    return this.panelList;
  }

  /** The slab is dead flat, so launches and the camera both sit at y = 0. */
  heightAt(_x?: number, _z?: number): number {
    return 0;
  }

  panelAt(x: number, z: number): ConcretePanel {
    const col = clamp(Math.floor((x + CONCRETE_SIZE / 2) / CONCRETE_PANEL), 0, this.columns - 1);
    const row = clamp(Math.floor((z + CONCRETE_SIZE / 2) / CONCRETE_PANEL), 0, this.rows - 1);
    return this.panelList[row * this.columns + col];
  }

  /**
   * 0 in the middle of a panel, rising to 1 in an expansion joint. Joints are what make a flat slab
   * read as concrete rather than as grey plastic.
   */
  jointAt(x: number, z: number): number {
    const half = CONCRETE_SIZE / 2;
    // Distance to the nearest joint line on one axis, counting the slab border as a joint.
    const nearest = (v: number) => {
      const t = (v + half) % CONCRETE_PANEL;
      const toPanelLine = Math.min(t, CONCRETE_PANEL - t);
      const toBorder = half - Math.abs(v);
      return Math.max(0, Math.min(toPanelLine, toBorder));
    };
    const d = Math.min(nearest(x), nearest(z));
    return clamp(1 - d / CONCRETE_JOINT_WIDTH, 0, 1);
  }

  weightsAt(x: number, z: number): ConcreteWeights {
    const panel = this.panelAt(x, z);
    const stain = fbm(this.stainNoise, x * 0.02 + 11, z * 0.02 - 7, 3);
    return {
      tone: clamp(0.55 + panel.toneShift + (fbm(this.toneNoise, x * 0.035, z * 0.035, 2) - 0.5) * 0.3, 0, 1),
      stain: clamp(Math.max(0, stain - 0.42) * 1.9, 0, 1),
    };
  }
}
