import * as THREE from 'three';
import type { TreeInstance } from '../models/trees';
import {
  LEAF_MATERIAL, MODEL_KINDS, TRUNK_MATERIAL, modelGeometry, modelLeafColor,
} from './modelGeometry';

/** Renders TreeInstances as two instanced meshes (trunks, foliage) per species. */
export class TreeView {
  private meshes: THREE.InstancedMesh[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  set(trees: readonly TreeInstance[]): void {
    this.clear();
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    for (const kind of MODEL_KINDS) {
      const list = trees.filter((t) => t.kind === kind);
      if (list.length === 0) continue;
      const geometry = modelGeometry(kind);
      const trunks = new THREE.InstancedMesh(geometry.trunk, TRUNK_MATERIAL, list.length);
      const leaves = new THREE.InstancedMesh(geometry.leaves, LEAF_MATERIAL, list.length);
      list.forEach((t, i) => {
        object.position.set(t.x, t.y - 0.1, t.z);
        object.rotation.set(t.tiltX, t.rotationY, t.tiltZ);
        object.scale.set(...t.scale);
        object.updateMatrix();
        trunks.setMatrixAt(i, object.matrix);
        leaves.setMatrixAt(i, object.matrix);
        leaves.setColorAt(i, modelLeafColor(kind, t.tint, color));
      });
      for (const mesh of [trunks, leaves]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.meshes.push(mesh);
      }
    }
  }

  private clear(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.dispose(); // frees instance buffers only; geometries and materials are shared
    }
    this.meshes = [];
  }
}