import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRAIN_SPEED_DEFAULT } from '../config';
import type { Track } from '../models/track';

/** How far apart vehicles sit along the track, and how many of them there are. */
const VEHICLE_COUNT = 4;
const COUPLING_GAP = 4.2;
const LOCO_LENGTH = 5.4;

const BODY_COLOR = 0xc2452f;
const CAB_COLOR = 0x2f4a63;
const WAGON_COLOR = 0x6f7f52;

const merged = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;

/**
 * Geometries are built along +x with the origin at the leading coupler, so a vehicle only needs a
 * position and a yaw to sit on the track.
 */
const LOCO = merged([
  new THREE.BoxGeometry(LOCO_LENGTH, 1.5, 2).translate(LOCO_LENGTH / 2, 1.35, 0),
  new THREE.BoxGeometry(2, 1.5, 1.9).translate(LOCO_LENGTH - 1.3, 2.7, 0), // cab
  new THREE.CylinderGeometry(0.3, 0.3, 1.1, 8).translate(LOCO_LENGTH - 2.6, 3.7, 0), // funnel
]);
const WAGON = merged([
  new THREE.BoxGeometry(3, 1.1, 2).translate(1.5, 1.1, 0),
  new THREE.BoxGeometry(3, 0.35, 2.1).translate(1.5, 1.7, 0), // load bed
]);

const WHEEL_RADIUS = 0.45;

const shadowed = (mesh: THREE.Mesh): THREE.Mesh => {
  mesh.castShadow = true;
  return mesh;
};

function wheels(count: number, spacing: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const x = spacing * (i + 0.5);
    for (const z of [-1.05, 1.05]) {
      parts.push(
        new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.22, 8)
          .rotateX(Math.PI / 2)
          .translate(x, WHEEL_RADIUS, z),
      );
    }
  }
  return merged(parts);
}

/** Sleepers laid flat along the loop, so the train appears to run on rails rather than hover. */
function sleepers(track: Track, y: number): THREE.InstancedMesh {
  const spacing = 1.6;
  const count = Math.max(2, Math.floor(track.length / spacing));
  const sleeper = new THREE.BoxGeometry(0.7, 0.16, 2.6);
  const mesh = new THREE.InstancedMesh(
    sleeper,
    new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }),
    count,
  );
  const object = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const p = track.at((i * track.length) / count);
    object.position.set(p.x, y, p.z);
    object.rotation.set(0, -p.heading, 0); // geometry runs along +x, heading is measured from +x
    object.updateMatrix();
    mesh.setMatrixAt(i, object.matrix);
  }
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A toy train running a fixed loop. Speed is in world units per second and is driven by the
 * caller, so the slider in the panel stays in charge of it.
 */
export class TrainView {
  private readonly vehicles: THREE.Object3D[] = [];
  private readonly rails: THREE.InstancedMesh;
  private speed = TRAIN_SPEED_DEFAULT;
  private travelled = 0;

  constructor(private readonly scene: THREE.Scene, private readonly track: Track, y: number) {
    // Built once and cloned per vehicle: an Object3D can only have one parent, so the same mesh
    // cannot be shared between groups.
    const locoBody = shadowed(new THREE.Mesh(LOCO, new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.6 })));
    const locoWheels = shadowed(new THREE.Mesh(
      wheels(2, LOCO_LENGTH / 2),
      new THREE.MeshStandardMaterial({ color: CAB_COLOR, roughness: 0.5 }),
    ));
    const wagonBody = shadowed(new THREE.Mesh(WAGON, new THREE.MeshStandardMaterial({ color: WAGON_COLOR, roughness: 0.7 })));
    const wagonWheels = shadowed(new THREE.Mesh(
      wheels(2, 3),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.9 }),
    ));
    for (let i = 0; i < VEHICLE_COUNT; i++) {
      const group = new THREE.Group();
      group.add((i === 0 ? locoBody : wagonBody).clone(), (i === 0 ? locoWheels : wagonWheels).clone());
      group.position.y = y;
      this.vehicles.push(group);
      this.scene.add(group);
    }
    this.rails = sleepers(track, y - 0.02);
    this.scene.add(this.rails);
  }

  /** Units per second. Zero stops the train where it is. */
  setSpeed(speed: number): void {
    this.speed = speed;
  }

  update(dt: number): void {
    this.travelled = (this.travelled + this.speed * dt) % this.track.length;
    this.vehicles.forEach((vehicle, i) => {
      const p = this.track.at(this.travelled - i * COUPLING_GAP);
      vehicle.position.x = p.x;
      vehicle.position.z = p.z;
      vehicle.rotation.y = -p.heading;
    });
  }
}