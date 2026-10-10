import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Acacia } from '../models/savanna/acacias';

const BARK = new THREE.MeshStandardMaterial({ color: 0x6b5842, roughness: 1, flatShading: true });
const CANOPY = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });

/**
 * The acacia's shape, and the one thing that makes it read as a savanna tree rather than any tree:
 * the canopy is a wide, flat slab on top of a bare trunk, with the branches forking out beneath it
 * and stopping well short of the leaves.
 *
 * The whole tree is drawn from the origin up, so scaling by an acacia's own size gives a taller tree
 * that is exactly the same shape, and there is no per-tree geometry.
 */

/** Trunk and the branches that splay out under the canopy, merged into one geometry. */
function woodGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.09, 0.16, 0.62, 6).translate(0, 0.31, 0);
  // Branches lean out and stop short, which is what leaves the gap of bare wood under the canopy.
  const branch = (angle: number, height: number, tilt: number) =>
    new THREE.CylinderGeometry(0.04, 0.075, height, 5)
      .rotateZ(tilt)
      .translate(Math.sin(tilt) * height * 0.5, height * 0.62, 0)
      .rotateY(angle);
  const branches = [
    branch(0, 0.34, 0.5),
    branch(2.1, 0.3, 0.62),
    branch(4.2, 0.32, 0.44),
    branch(5.5, 0.28, 0.55),
  ];
  return mergeGeometries(
    [trunk, ...branches].map((g) => (g.index ? g.toNonIndexed() : g)),
  )!;
}

/**
 * The canopy as a flattened dome. Squashed on y and widened, because an acacia's crown is broader
 * than it is deep — that flat top is the silhouette the whole scene is named for.
 */
function canopyGeometry(): THREE.BufferGeometry {
  const slab = new THREE.IcosahedronGeometry(1, 1).scale(1.15, 0.34, 1.15).translate(0, 0.78, 0);
  const clump = new THREE.IcosahedronGeometry(0.6, 1).scale(1, 0.42, 1).translate(0.62, 0.74, 0.18);
  return mergeGeometries([slab.toNonIndexed(), clump.toNonIndexed()])!;
}

export class AcaciaView {
  private wood: THREE.InstancedMesh | null = null;
  private leaves: THREE.InstancedMesh | null = null;
  private readonly woodGeometry = woodGeometry();
  private readonly canopyGeometry = canopyGeometry();

  constructor(private readonly scene: THREE.Scene) {}

  set(trees: readonly Acacia[]): void {
    this.clear();
    if (trees.length === 0) return;
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    this.wood = new THREE.InstancedMesh(this.woodGeometry, BARK, trees.length);
    this.leaves = new THREE.InstancedMesh(this.canopyGeometry, CANOPY, trees.length);
    trees.forEach((t, i) => {
      object.position.set(t.x, t.y - 0.15, t.z);
      object.rotation.set(t.tiltX, t.rotationY, t.tiltZ);
      object.scale.setScalar(t.scale);
      object.updateMatrix();
      this.wood!.setMatrixAt(i, object.matrix);
      this.leaves!.setMatrixAt(i, object.matrix);
      // Two numbers off the acacia, so no two trees in a stand are quite the same green.
      this.leaves!.setColorAt(i, color.setHSL(0.22 + t.tint[0] * 0.06, 0.34 + t.tint[1] * 0.12, 0.26 + t.tint[0] * 0.07));
    });
    for (const mesh of [this.wood, this.leaves]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  private clear(): void {
    for (const mesh of [this.wood, this.leaves]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      // Frees the instance buffers only; the geometries and materials are shared and outlive this.
      mesh.dispose();
    }
    this.wood = null;
    this.leaves = null;
  }

  dispose(): void {
    this.clear();
    this.woodGeometry.dispose();
    this.canopyGeometry.dispose();
  }
}