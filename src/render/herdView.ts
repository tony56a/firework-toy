import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  GRAZER_SPECS, grazeAngle,
  type GrazerKind, type GrazerPose, type GrazerSpec,
} from '../models/savanna/grazer';

/**
 * A herd drawn as instanced meshes: three kinds, each as a body, a head and four legs.
 *
 * The head and the legs are separate instanced meshes rather than part of the body because both are
 * animated per animal — the head drops to graze, the legs swing with the stride — and an instanced
 * mesh carries one matrix per instance, so anything that moves independently needs its own. Three
 * kinds times three meshes is nine draw calls for the whole herd.
 *
 * Everything is posed by composing matrices rather than by placing meshes in the scene graph: each
 * animal's transform is built once and the head and legs are multiplied onto it, so a head cannot
 * drift away from the body it belongs to when the two disagree about a heading.
 */

/** Body colour per kind. Zebra stripes are not modelled; it reads as the pale one in the herd. */
const HIDE: Readonly<Record<GrazerKind, number>> = {
  wildebeest: 0x4a4238,
  zebra: 0xd8d2c4,
  giraffe: 0xc08d4e,
};

/** How far the legs swing either side of straight, in radians. */
const STRIDE_SWING = 0.42;
/** Fraction of the body each leg's hip sits from the centre, fore-aft and across. */
const HIP_FORE = 0.34;
const HIP_OVER = 0.26;
/** How far below the body's centre its hips sit, which is what sets the legs' length. */
const HIP_DROP = 0.2;
/**
 * Diagonal pairs swing together, as they do on any four-legged animal. Without this the herd walks
 * with all sixteen legs in step, which reads as a machine rather than as animals.
 */
const HIP_PHASE = [0, 0.5, 0.5, 0];

/** The torso, built along +x with its centre on the origin, so a pose is a position and a turn. */
function bodyGeometry(spec: GrazerSpec): THREE.BufferGeometry {
  const length = spec.length;
  const body = new THREE.CapsuleGeometry(length * 0.22, length * 0.52, 3, 8)
    .rotateZ(Math.PI / 2)
    .scale(1, 1, 0.82);
  // The shoulder hump a grazing animal carries, which is most of what reads as wildebeest. Low and
  // broad rather than tall: a narrow cone on the withers reads as a fin or a horn from any angle.
  const hump = new THREE.ConeGeometry(length * 0.22, length * 0.16, 6)
    .translate(length * 0.26, length * 0.13, 0);
  return mergeGeometries([body.toNonIndexed(), hump.toNonIndexed()])!;
}

/**
 * Neck and head, reaching forward along +x from the shoulder.
 *
 * The origin is at the shoulder rather than at the head, because this is what gets rotated to graze,
 * and a head that pivots about its own skull looks like a hat tipping rather than an animal bending
 * down to eat.
 */
function headGeometry(spec: GrazerSpec): THREE.BufferGeometry {
  const length = spec.neck * spec.length;
  const neck = new THREE.CylinderGeometry(spec.length * 0.09, spec.length * 0.13, length, 6)
    .rotateZ(-Math.PI / 2)
    .translate(length / 2, 0, 0);
  const skull = new THREE.BoxGeometry(length * 0.32, spec.length * 0.14, spec.length * 0.14)
    .translate(length * 0.94, -spec.length * 0.03, 0);
  return mergeGeometries([neck.toNonIndexed(), skull.toNonIndexed()])!;
}

/**
 * One leg, hanging down from its hip at the origin, so a swing is a turn about the origin.
 *
 * Its length is the drop from the hip to the ground, which is the animal's height less the distance
 * the hip sits below its body centre. Sizing it from the height alone makes every leg overshoot the
 * ground by that same drop, which on a giraffe is long enough to stand the animal in a pit.
 */
function legGeometry(spec: GrazerSpec): THREE.BufferGeometry {
  const length = spec.height - spec.length * HIP_DROP;
  return new THREE.CylinderGeometry(spec.length * 0.045, spec.length * 0.035, length, 5)
    .translate(0, -length / 2, 0);
}

interface KindMeshes {
  body: THREE.InstancedMesh;
  head: THREE.InstancedMesh;
  legs: THREE.InstancedMesh;
}

export class HerdView {
  private readonly groups = new Map<GrazerKind, KindMeshes>();
  private readonly geometries = new Map<GrazerKind, { body: THREE.BufferGeometry; head: THREE.BufferGeometry; leg: THREE.BufferGeometry }>();
  private readonly counts = new Map<GrazerKind, number>();

  private readonly object = new THREE.Object3D();
  private readonly body = new THREE.Matrix4();
  private readonly part = new THREE.Matrix4();
  private readonly matrix = new THREE.Matrix4();

  constructor(private readonly scene: THREE.Scene) {}

  /**
   * Rebuilds the herd as one set of instanced meshes per kind. The animals do not move until `pose`
   * is called, so the herd is drawn wherever it last stood until the scene asks again.
   */
  set(kinds: readonly GrazerKind[]): void {
    this.clear();
    for (const kind of kinds) {
      const members = kinds.reduce((n, k) => n + (k === kind ? 1 : 0), 0);
      if (members === 0) continue;
      const spec = GRAZER_SPECS[kind];
      const geometries = {
        body: bodyGeometry(spec),
        head: headGeometry(spec),
        leg: legGeometry(spec),
      };
      this.geometries.set(kind, geometries);
      const material = new THREE.MeshStandardMaterial({ color: HIDE[kind], roughness: 0.9, flatShading: true });
      const group: KindMeshes = {
        body: new THREE.InstancedMesh(geometries.body, material, members),
        head: new THREE.InstancedMesh(geometries.head, material, members),
        legs: new THREE.InstancedMesh(geometries.leg, material, members * 4),
      };
      for (const mesh of [group.body, group.head, group.legs]) {
        mesh.castShadow = true;
        this.scene.add(mesh);
      }
      this.groups.set(kind, group);
    }
    // Which animal occupies which instance of its kind, so a pose can find its own slot rather than
    // searching for it. Without this every animal would be written to every kind's first slot.
    this.slots = new Map<number, number>();
    const seen = new Map<GrazerKind, number>();
    kinds.forEach((kind, i) => {
      const slot = seen.get(kind) ?? 0;
      this.slots.set(i, slot);
      seen.set(kind, slot + 1);
    });
    this.counts.clear();
    for (const [kind, count] of seen) this.counts.set(kind, count);
  }

  /** Instance slot for each animal, rebuilt by `set`. */
  private slots = new Map<number, number>();

  /** Poses the whole herd. One call per frame, after `set` has built the meshes. */
  pose(kinds: readonly GrazerKind[], poses: readonly GrazerPose[]): void {
    for (let i = 0; i < poses.length; i++) {
      const kind = kinds[i];
      const meshes = this.groups.get(kind);
      const slot = this.slots.get(i);
      if (!meshes || slot === undefined) continue;
      const spec = GRAZER_SPECS[kind];
      const pose = poses[i];

      // YXZ, so the pitch is about the animal's own across-axis rather than about world x. With the
      // default order a giraffe would rear and roll depending on which way it happened to be facing.
      this.object.rotation.order = 'YXZ';
      this.object.position.set(pose.x, pose.y + spec.height, pose.z);
      // Yaw negated for the same reason as the boat and the fish: the pose is measured in the XZ
      // plane with 0 along +x, and a rotation about +y turns +x toward -z.
      this.object.rotation.set(0, -pose.yaw, 0);
      this.object.updateMatrix();
      this.body.copy(this.object.matrix);
      meshes.body.setMatrixAt(slot, this.body);

      // Head: the shoulder offset and the graze pitch, both in the body's own frame.
      this.object.position.set(spec.length * 0.34, spec.length * 0.16, 0);
      this.object.rotation.set(pose.headDown ? grazeAngle(spec) : 0, 0, 0);
      this.object.updateMatrix();
      this.part.copy(this.object.matrix);
      this.matrix.multiplyMatrices(this.body, this.part);
      meshes.head.setMatrixAt(slot, this.matrix);

      // Legs: four hips, swung about their own top by the stride. A head-down animal has its stride
      // pinned to zero by the model, so it stands still rather than marching on the spot.
      for (let leg = 0; leg < 4; leg++) {
        const swing = Math.sin((pose.stride + HIP_PHASE[leg]) * Math.PI * 2) * STRIDE_SWING;
        const across = leg % 2 === 0 ? HIP_OVER : -HIP_OVER;
        const fore = leg < 2 ? HIP_FORE : -HIP_FORE;
        this.object.position.set(spec.length * fore, -spec.length * HIP_DROP, spec.length * across);
        this.object.rotation.set(swing, 0, 0);
        this.object.updateMatrix();
        this.part.copy(this.object.matrix);
        this.matrix.multiplyMatrices(this.body, this.part);
        meshes.legs.setMatrixAt(slot * 4 + leg, this.matrix);
      }
    }
    for (const meshes of this.groups.values()) {
      for (const mesh of [meshes.body, meshes.head, meshes.legs]) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private clear(): void {
    for (const meshes of this.groups.values()) {
      for (const mesh of [meshes.body, meshes.head, meshes.legs]) {
        this.scene.remove(mesh);
        mesh.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
    this.groups.clear();
    for (const geometries of this.geometries.values()) {
      for (const geometry of Object.values(geometries)) geometry.dispose();
    }
    this.geometries.clear();
    this.slots.clear();
    this.counts.clear();
  }

  dispose(): void {
    this.clear();
  }
}