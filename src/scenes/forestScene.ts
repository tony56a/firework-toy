import { WORLD_SIZE } from '../config';
import type { AppState } from '../models/appState';
import type { CameraFraming } from '../models/cameraFraming';
import type { FireworkSim } from '../models/fireworks';
import { Terrain } from '../models/terrain';
import { scatterTrees } from '../models/trees';
import { TerrainView } from '../render/terrainView';
import { TreeView } from '../render/treeView';
import { SceneBase, type SceneReport } from './sceneBase';

/** A heightfield of grass with a forest scattered over it, and the original scene. */
export class ForestScene extends SceneBase {
  /** The whole field is the subject, and the viewer sits on the terrain rather than on a slab. */
  readonly framing: CameraFraming = { radius: WORLD_SIZE / 2, surface: 0 };
  private readonly terrainView: TerrainView;
  private readonly treeView: TreeView;
  private terrain: Terrain;

  constructor(sim: FireworkSim, report: SceneReport, seed: string) {
    super(sim, report);
    this.terrainView = new TerrainView(this.three);
    this.treeView = new TreeView(this.three);
    this.terrain = new Terrain(seed);
    this.terrainView.set(this.terrain);
  }

  /** The terrain is rebuilt when the seed changes, so expose it through a getter. */
  get ground(): Terrain {
    return this.terrain;
  }

  react(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void {
    if (changed.includes('seed')) {
      this.terrain = new Terrain(state.seed);
      this.terrainView.set(this.terrain);
      this.rebuildTrees(state);
    } else if (changed.includes('treeCount')) {
      this.rebuildTrees(state);
    }
    this.commonReact(state, changed);
  }

  private rebuildTrees(state: Readonly<AppState>): void {
    const trees = scatterTrees(this.terrain, state.seed, state.treeCount);
    this.treeView.set(trees);
    const pines = trees.filter((t) => t.kind === 'pine').length;
    this.report.setTreeStats(`${trees.length} trees (${pines} pine, ${trees.length - pines} oak)`);
  }
}
