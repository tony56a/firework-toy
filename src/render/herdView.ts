import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRAZER_SPECS, grazeAngle, type GrazerKind, type GrazerPose, type GrazerSpec } from '../models/savanna/grazer';
import type { LoadedMesh } from './gltfAssets';

/**
 * A herd drawn as one instanced mesh per kind.
 *
 * A kind with a downloaded model is drawn as that model, already fitted and centred by the loader.
 * A kind without one is built here as a body, a head and four legs, which is the fallback that keeps
 * a fresh clone running when the files are missing.
 *
 * The fallback splits the head and the legs off because an instanced mesh carries one matrix per
 * instance, so anything that has to move on its own needs a mesh of its own. A downloaded animal has
 * no such split — it merges to one geometry — so the graze arrives as a dip of the whole body for
 * both, which is why the dip lives in the pose rather than here.
 *
 * Everything is posed by composing matrices rather than by placing meshes in the scene graph: each
 * animal's transform is built once and the head and legs are multiplied onto it, so a head cannot
 * drift away from the body it belongs to when the two disagree about a heading.
 */

/** Body colour per kind. Zebra stripes are not modelled; it reads as the pale one in the herd. */
const HIDE: Readonly<Record<GrazerKind, number>> = {
  elephant: 0x8e8a86,
  giraffe: 0xc08d4e,
  rhino: 0x77706a,
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

/**
 * The torso, built along +x with its centre on the origin, so a pose is a position and a turn.
 *
 * The one feature each kind is named for is added here, at the shoulder: an elephant's trunk and
 * tusks, a giraffe's shoulder hump, a rhino's horn. The fallback only has to appear for a second or
 * two before the file lands, but it has to be recognisable while it is there — three of the same
 * grey box would not read as a herd of three different animals at all.
 */
function bodyGeometry(spec: GrazerSpec, kind: GrazerKind): THREE.BufferGeometry {
  const length = spec.length;
  const body = new THREE.CapsuleGeometry(length * 0.22, length * 0.52, 3, 8)
    .rotateZ(Math.PI / 2)
    .scale(1, 1, 0.82);
  const parts: THREE.BufferGeometry[] = [body.toNonIndexed()];
  if (kind === 'elephant') {
    // Trunk hanging off the front of the head, and the tusks either side of it.
    const trunk = new THREE.CylinderGeometry(length * 0.03, length * 0.045, length * 0.55, 5)
      .rotateZ(-0.25)
      .translate(length * 0.62, -length * 0.16, 0);
    const tusk = (across: number) => new THREE.ConeGeometry(length * 0.025, length * 0.2, 5)
      .rotateZ(Math.PI / 2)
      .translate(length * 0.58, length * 0.02, across);
    parts.push(trunk.toNonIndexed(), tusk(length * 0.08).toNonIndexed(), tusk(-length * 0.08).toNonIndexed());
  } else if (kind === 'rhino') {
    // The horn on the snout is the whole silhouette of a rhino at this size.
    parts.push(new THREE.ConeGeometry(length * 0.035, length * 0.26, 5)
      .rotateZ(-Math.PI / 2)
      .translate(length * 0.6, length * 0.06, 0)
      .toNonIndexed());
  } else {
    // A giraffe carries a low shoulder hump; narrow and tall reads as a fin or a horn instead.
    parts.push(new THREE.ConeGeometry(length * 0.2, length * 0.14, 6)
      .translate(length * 0.22, length * 0.12, 0)
      .toNonIndexed());
  }
  return mergeGeometries(parts)!;
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

/** How one kind is drawn: from its downloaded model, or from geometry built here as a fallback. */
interface KindDraw {
  kind: GrazerKind;
  members: number;
  /** Height from the ground to the animal's centre, which is what the pose is lifted by. */
  lift: number;
  /** The drawn animal, or null when this kind is drawn from its downloaded model instead. */
  loaded: THREE.InstancedMesh | null;
  fallback: KindMeshes | null;
  geometries: { body: THREE.BufferGeometry; head: THREE.BufferGeometry; leg: THREE.BufferGeometry } | null;
}

export class HerdView {
  private readonly draws = new Map<GrazerKind, KindDraw>();

  private readonly object = new THREE.Object3D();
  private readonly body = new THREE.Matrix4();
  private readonly part = new THREE.Matrix4();
  private readonly matrix = new THREE.Matrix4();

  constructor(private readonly scene: THREE.Scene) {}

  /**
   * Rebuilds the herd, one draw per kind.
   *
   * A kind with a loaded model is one instanced mesh of that model; a kind without one falls back to
   * a body, a head and four legs built here. The two are not interchangeable: only the fallback can
   * move its head and legs on their own, so the graze arrives as a whole-body dip either way.
   *
   * The loaded geometry belongs to whoever loaded it, so it is borrowed here and never disposed.
   */
  set(kinds: readonly GrazerKind[], loaded: Readonly<Partial<Record<GrazerKind, LoadedMesh>>>): void {
    this.clear();
    for (const kind of kinds) {
      const members = kinds.reduce((n, k) => n + (k === kind ? 1 : 0), 0);
      if (members === 0) continue;
      const spec = GRAZER_SPECS[kind];
      const model: LoadedMesh | null = loaded[kind] ?? null;
      const draw: KindDraw = {
        kind, members,
        // A loaded animal's height is measured off its own fitted geometry, because the fit put its
        // centre on the origin and told us nothing about how tall it ended up. Assuming the spec's
        // height instead would float it or sink it by the difference between the two.
        lift: model ? (model.geometry.boundingBox!.max.y - model.geometry.boundingBox!.min.y) / 2 : spec.height,
        loaded: null,
        fallback: null,
        geometries: null,
      };
      if (model) {
        const mesh = new THREE.InstancedMesh(model.geometry, model.materials, members);
        mesh.castShadow = true;
        this.scene.add(mesh);
        draw.loaded = mesh;
      } else {
        const geometries = { body: bodyGeometry(spec, kind), head: headGeometry(spec), leg: legGeometry(spec) };
        const material = new THREE.MeshStandardMaterial({ color: HIDE[kind], roughness: 0.9, flatShading: true });
        const fallback: KindMeshes = {
          body: new THREE.InstancedMesh(geometries.body, material, members),
          head: new THREE.InstancedMesh(geometries.head, material, members),
          legs: new THREE.InstancedMesh(geometries.leg, material, members * 4),
        };
        for (const one of [fallback.body, fallback.head, fallback.legs]) {
          one.castShadow = true;
          this.scene.add(one);
        }
        draw.fallback = fallback;
        draw.geometries = geometries;
      }
      this.draws.set(kind, draw);
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
  }

  /** Instance slot for each animal, rebuilt by `set`. */
  private slots = new Map<number, number>();

  /** Poses the whole herd. One call per frame, after `set` has built the meshes. */
  pose(kinds: readonly GrazerKind[], poses: readonly GrazerPose[]): void {
    for (let i = 0; i < poses.length; i++) {
      const kind = kinds[i];
      const draw = this.draws.get(kind);
      const slot = this.slots.get(i);
      if (!draw || slot === undefined) continue;
      const spec = GRAZER_SPECS[kind];
      const pose = poses[i];

      // YXZ throughout, so every pitch is about the animal's own across-axis rather than about world
      // x. With the default order an animal would rear and roll depending on which way it was facing.
      // The bob is on z, which in this order is applied first and is therefore a nose-down dip about
      // the animal's own lateral axis, before the yaw swings it to face where it is going.
      this.object.rotation.order = 'YXZ';
      this.object.position.set(pose.x, pose.y + draw.lift, pose.z);
      // Yaw negated for the same reason as the boat and the fish: the pose is measured in the XZ
      // plane with 0 along +x, and a rotation about +y turns +x toward -z.
      this.object.rotation.set(0, -pose.yaw, pose.bob);
      this.object.updateMatrix();
      this.body.copy(this.object.matrix);

      if (draw.loaded) {
        draw.loaded.setMatrixAt(slot, this.body);
        continue;
      }
      const meshes = draw.fallback!;
      meshes.body.setMatrixAt(slot, this.body);

      // Head: the shoulder offset and the graze pitch, both in the body's own frame.
      this.object.position.set(spec.length * 0.34, spec.length * 0.16, 0);
      this.object.rotation.set(pose.headDown ? grazeAngle(spec) : 0, 0, 0);
      this.object.updateMatrix();
      this.part.copy(this.object.matrix);
      this.matrix.multiplyMatrices(this.body, this.part);
      meshes.head.setMatrixAt(slot, this.matrix);

      // Legs: four hips, swung about their own top by the stride. A grazing animal has its stride
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
    for (const draw of this.draws.values()) {
      if (draw.loaded) {
        draw.loaded.instanceMatrix.needsUpdate = true;
      } else if (draw.fallback) {
        for (const mesh of [draw.fallback.body, draw.fallback.head, draw.fallback.legs]) {
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  private clear(): void {
    for (const draw of this.draws.values()) {
      if (draw.loaded) {
        this.scene.remove(draw.loaded);
        // The geometry and materials came from the loader and belong to it. Only the instance
        // buffers are freed here.
        draw.loaded.dispose();
      }
      if (draw.fallback) {
        for (const mesh of [draw.fallback.body, draw.fallback.head, draw.fallback.legs]) {
          this.scene.remove(mesh);
          mesh.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      }
      for (const geometry of Object.values(draw.geometries ?? {})) geometry.dispose();
    }
    this.draws.clear();
    this.slots.clear();
  }

  dispose(): void {
    this.clear();
  }
}