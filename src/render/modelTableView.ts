import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TABLE_DEPTH, TABLE_HEIGHT, TABLE_LEG_HEIGHT, TABLE_TOP_THICKNESS, TABLE_WIDTH,
} from '../config';
import { MODEL_KINDS } from '../models/modelKinds';
import { tableLayout, tableLegPositions, type TableModel } from '../models/sky/tableModels';
import { LEAF_MATERIAL, TRUNK_MATERIAL, modelGeometry, modelLeafColor } from './modelGeometry';

const TOP_COLOR = 0x7a5c3e;
const LEG_COLOR = 0x5d4630;
const TOP_Y = TABLE_HEIGHT - TABLE_TOP_THICKNESS / 2; // centre of the slab

/** The tabletop slab, plus a cube leg at each corner. Returns two groups so the legs can be darker. */
function tableGeometry(): THREE.BufferGeometry {
  const slab = new THREE.BoxGeometry(TABLE_WIDTH, TABLE_TOP_THICKNESS, TABLE_DEPTH).translate(0, TOP_Y, 0);
  const legs = tableLegPositions().map(({ x, z }) =>
    new THREE.BoxGeometry(TABLE_LEG_HEIGHT, TABLE_LEG_HEIGHT, TABLE_LEG_HEIGHT)
      .translate(x, TABLE_LEG_HEIGHT / 2, z));
  return mergeGeometries(
    [slab, ...legs].map((g) => (g.index ? g.toNonIndexed() : g)),
    true,
  )!;
}

/**
 * A diorama table standing in the sky scene, with the catalogue of models displayed on it. The
 * table itself is furniture and never changes; `set` replaces which models are on show.
 */
export class ModelTableView {
  private readonly table: THREE.Mesh;
  private meshes: THREE.InstancedMesh[] = [];

  constructor(private readonly scene: THREE.Scene) {
    const materials = [
      new THREE.MeshStandardMaterial({ color: TOP_COLOR, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: LEG_COLOR, roughness: 0.9 }),
    ];
    this.table = new THREE.Mesh(tableGeometry(), materials);
    this.table.castShadow = true;
    this.table.receiveShadow = true;
    this.scene.add(this.table);
  }

  /** Top surface height, which is where the track and the models sit. */
  static get surfaceY(): number {
    return TABLE_HEIGHT;
  }

  /** Places the given models along the middle of the table, one instanced mesh per species. */
  set(models: readonly TableModel[]): void {
    this.clear();
    const spots = tableLayout(models.length);
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    for (const kind of MODEL_KINDS) {
      const list = models.map((m, i) => ({ model: m, spot: spots[i] })).filter((e) => e.model.kind === kind);
      if (list.length === 0) continue;
      const geometry = modelGeometry(kind);
      const trunks = new THREE.InstancedMesh(geometry.trunk, TRUNK_MATERIAL, list.length);
      const leaves = new THREE.InstancedMesh(geometry.leaves, LEAF_MATERIAL, list.length);
      list.forEach(({ model, spot }, i) => {
        object.position.set(spot.x, TABLE_HEIGHT, spot.z);
        object.rotation.set(0, i * 1.1, 0); // turn each one so they do not read as copies
        object.scale.setScalar(model.scale);
        object.updateMatrix();
        trunks.setMatrixAt(i, object.matrix);
        leaves.setMatrixAt(i, object.matrix);
        leaves.setColorAt(i, modelLeafColor(kind, [i * 0.31, i * 0.17], color));
      });
      for (const mesh of [trunks, leaves]) {
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.meshes.push(mesh);
      }
    }
  }

  private clear(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.meshes = [];
  }
}