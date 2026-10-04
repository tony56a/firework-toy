import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TreeInstance, TreeKind } from '../models/trees';

const stretched = (g: THREE.BufferGeometry, x: number, y: number, z: number, sy = 1): THREE.BufferGeometry => {
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return g;
};
const merged = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
const trunk = (radius: number, height: number) =>
  stretched(new THREE.CylinderGeometry(radius * 0.7, radius, height, 6), 0, height / 2, 0);

const GEOMETRY: Record<TreeKind, { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry }> = {
  pine: {
    trunk: trunk(0.25, 1.8),
    leaves: merged([
      stretched(new THREE.ConeGeometry(1.7, 2.4, 7), 0, 2.4, 0),
      stretched(new THREE.ConeGeometry(1.3, 2.2, 7), 0, 3.6, 0),
      stretched(new THREE.ConeGeometry(0.85, 2.0, 7), 0, 4.8, 0),
    ]),
  },
  oak: {
    trunk: trunk(0.32, 2.4),
    leaves: merged([
      stretched(new THREE.IcosahedronGeometry(1.9, 1), 0, 3.6, 0, 0.85),
      stretched(new THREE.IcosahedronGeometry(1.3, 1), 1.1, 3.0, 0.4),
      stretched(new THREE.IcosahedronGeometry(1.2, 1), -0.9, 3.2, -0.6),
    ]),
  },
};
const TRUNK_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1, flatShading: true });
const LEAF_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });

const foliageColor = (kind: TreeKind, [a, b]: [number, number], out: THREE.Color): THREE.Color =>
  kind === 'pine' ? out.setHSL(0.36 + a * 0.04, 0.45, 0.2 + b * 0.08) : out.setHSL(0.17 + a * 0.2, 0.5, 0.3 + b * 0.1);

/** Renders TreeInstances as two instanced meshes (trunks, foliage) per species. */
export class TreeView {
  private meshes: THREE.InstancedMesh[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  set(trees: readonly TreeInstance[]): void {
    this.clear();
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    for (const kind of ['pine', 'oak'] as const) {
      const list = trees.filter((t) => t.kind === kind);
      if (list.length === 0) continue;
      const trunks = new THREE.InstancedMesh(GEOMETRY[kind].trunk, TRUNK_MATERIAL, list.length);
      const leaves = new THREE.InstancedMesh(GEOMETRY[kind].leaves, LEAF_MATERIAL, list.length);
      list.forEach((t, i) => {
        object.position.set(t.x, t.y - 0.1, t.z);
        object.rotation.set(t.tiltX, t.rotationY, t.tiltZ);
        object.scale.set(...t.scale);
        object.updateMatrix();
        trunks.setMatrixAt(i, object.matrix);
        leaves.setMatrixAt(i, object.matrix);
        leaves.setColorAt(i, foliageColor(kind, t.tint, color));
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
