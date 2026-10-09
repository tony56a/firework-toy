import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRAIN_SPEED_DEFAULT } from '../config';
import { type Track, wheelAngle } from '../models/track';

/** How far apart vehicles sit along the track, and how many of them there are. */
const VEHICLE_COUNT = 4;
const COUPLING_GAP = 4.2;
const LOCO_LENGTH = 5.4;
const WAGON_LENGTH = 3;

const BODY_COLOR = 0xc2452f;
const CAB_COLOR = 0x2f4a63;
const WAGON_COLOR = 0x6f7f52;
const WHEEL_COLOR = 0x2b2b2b;

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
  new THREE.BoxGeometry(WAGON_LENGTH, 1.1, 2).translate(WAGON_LENGTH / 2, 1.1, 0),
  new THREE.BoxGeometry(WAGON_LENGTH, 0.35, 2.1).translate(WAGON_LENGTH / 2, 1.7, 0), // load bed
]);

const WHEEL_RADIUS = 0.45;
const WHEEL_THICKNESS = 0.22;
const HALF_GAUGE = 1.05; // how far the rails sit either side of the centreline

/** One wheel, centred on its own axle so it can be spun by rotating the mesh. */
function wheelGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_THICKNESS, 8).rotateX(Math.PI / 2);
}

/** Axle positions inset from each end, so every wheel sits under the body rather than past it. */
function axlePositions(bodyLength: number): [number, number] {
  return [bodyLength * 0.25, bodyLength * 0.75];
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
 *
 * Each vehicle is a group holding the body, with its wheels parented to that body and left at a
 * fixed local offset. Parenting them to the vehicle rather than to the scene is what keeps them
 * attached: the group's position and yaw follow the track, and the wheels come along for free
 * instead of each needing its own placement.
 */
export class TrainView {
  private readonly vehicles: THREE.Group[] = [];
  private readonly wheels: THREE.Mesh[][] = [];
  private readonly rails: THREE.InstancedMesh;
  private speed = TRAIN_SPEED_DEFAULT;
  private travelled = 0;

  constructor(private readonly scene: THREE.Scene, private readonly track: Track, y: number) {
    for (let i = 0; i < VEHICLE_COUNT; i++) {
      const isLoco = i === 0;
      const bodyLength = isLoco ? LOCO_LENGTH : WAGON_LENGTH;
      const body = new THREE.Mesh(
        isLoco ? LOCO : WAGON,
        new THREE.MeshStandardMaterial({
          color: isLoco ? BODY_COLOR : WAGON_COLOR,
          roughness: isLoco ? 0.6 : 0.7,
        }),
      );
      body.castShadow = true;

      const wheels: THREE.Mesh[] = [];
      for (const x of axlePositions(bodyLength)) {
        for (const z of [-HALF_GAUGE, HALF_GAUGE]) {
          const wheel = new THREE.Mesh(
            wheelGeometry(),
            new THREE.MeshStandardMaterial({
              color: isLoco ? CAB_COLOR : WHEEL_COLOR,
              roughness: isLoco ? 0.5 : 0.9,
            }),
          );
          wheel.position.set(x, WHEEL_RADIUS, z);
          wheel.castShadow = true;
          body.add(wheel); // children of the body, so they ride along
          wheels.push(wheel);
        }
      }

      const vehicle = new THREE.Group();
      vehicle.add(body);
      vehicle.position.y = y;
      this.vehicles.push(vehicle);
      this.wheels.push(wheels);
      this.scene.add(vehicle);
    }
    this.rails = sleepers(track, y - 0.02);
    this.scene.add(this.rails);
  }

  /** Units per second. Zero stops the train where it is. */
  setSpeed(speed: number): void {
    this.speed = speed;
  }

  update(dt: number): void {
    // Keep rolling on past the start of the loop: the angle is derived from total distance, so a
    // backwards or looping train keeps turning instead of snapping back when `travelled` wraps.
    this.travelled = (this.travelled + this.speed * dt) % this.track.length;
    const rolled = wheelAngle(this.travelled, WHEEL_RADIUS);
    this.vehicles.forEach((vehicle, i) => {
      const p = this.track.at(this.travelled - i * COUPLING_GAP);
      vehicle.position.x = p.x;
      vehicle.position.z = p.z;
      vehicle.rotation.y = -p.heading;
      // Wheels spin about their own axle, so they must not inherit the vehicle's yaw. The sign is
      // negative because the vehicles travel along +x: for the contact point at the bottom of the
      // wheel to stay put, omega has to be -distance/radius about +z.
      for (const wheel of this.wheels[i]) wheel.rotation.set(0, 0, -rolled);
    });
  }
}