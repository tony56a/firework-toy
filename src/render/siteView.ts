import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  PAD_RADIUS, ROCKET_HEIGHT, ROCKET_RADIUS, TOWER_HEIGHT, TOWER_OFFSET, TOWER_WIDTH,
} from '../config';
import { ROCKET_SPOT, TOWER_SPOT, siteBuildings, type Building } from '../models/site';

const merged = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;

const CONCRETE_APRON = 0x9a958c;
const CONCRETE_EDGE = 0x7d786f;
const TOWER_COLOR = 0x9c3f34;
const STEEL = 0x6f747a;
const DARK_STEEL = 0x40464c;

const BUILDING_COLORS = [0x8d8579, 0x7b7f86, 0x948a7c, 0x6f7580, 0x8a8177];

/** The apron the rocket stands on: a disc with a slightly raised kerb, plus a darker apron ring. */
function apronGeometry(): THREE.BufferGeometry {
  const disc = new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS, 0.35, 48).translate(0, 0.175, 0);
  const kerb = new THREE.TorusGeometry(PAD_RADIUS - 0.3, 0.28, 8, 48)
    .rotateX(Math.PI / 2)
    .translate(0, 0.35, 0);
  return merged([disc, kerb]);
}

/**
 * A service tower: four legs with cross-bracing, so it reads as a steel frame rather than a slab.
 * Built once and instanced per level.
 */
function towerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const half = TOWER_WIDTH / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        new THREE.BoxGeometry(0.5, TOWER_HEIGHT, 0.5)
          .translate(sx * half, TOWER_HEIGHT / 2, sz * half),
      );
    }
  }
  // Cross-bracing on each of the four faces, one diagonal per storey.
  const storeys = Math.floor(TOWER_HEIGHT / 4);
  for (let i = 0; i < storeys; i++) {
    const y = i * 4;
    for (const side of [-1, 1]) {
      const along = new THREE.BoxGeometry(TOWER_WIDTH * 1.42, 0.28, 0.28)
        .rotateZ(side * Math.atan(4 / TOWER_WIDTH))
        .translate(0, y + 2, side * half);
      parts.push(along);
      const across = new THREE.BoxGeometry(0.28, 0.28, TOWER_WIDTH * 1.42)
        .rotateX(-side * Math.atan(4 / TOWER_WIDTH))
        .translate(side * half, y + 2, 0);
      parts.push(across);
    }
  }
  return merged(parts);
}

/** One building: a box plus a slightly inset roof cap, so the roofline is not a bare edge. */
function buildingGeometry(b: Building): { body: THREE.BufferGeometry; roof: THREE.BufferGeometry } {
  const body = new THREE.BoxGeometry(b.width, b.height, b.depth)
    .translate(0, b.height / 2, 0);
  const roof = new THREE.BoxGeometry(b.width * 0.92, 0.4, b.depth * 0.92)
    .translate(0, b.height + 0.2, 0);
  return { body, roof };
}

/**
 * The static launch site standing on the concrete pad: apron, service tower and the ground buildings
 * around them. The rocket itself is not here, because `RocketLaunchView` has to move it; everything
 * fixed comes from the model, so what can overlap was decided there rather than here.
 */
export class SiteView {
  private readonly meshes: THREE.Object3D[] = [];

  constructor(private readonly scene: THREE.Scene, seed: string) {
    const apron = new THREE.Mesh(
      apronGeometry(),
      new THREE.MeshLambertMaterial({ color: CONCRETE_APRON }),
    );
    apron.receiveShadow = true;
    apron.position.set(ROCKET_SPOT.x, 0, ROCKET_SPOT.z);
    this.add(apron);

    // A darker ring inlaid in the apron, marking where the rocket is meant to stand.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(ROCKET_RADIUS * 1.8, ROCKET_RADIUS * 2.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: CONCRETE_EDGE }),
    );
    ring.position.set(ROCKET_SPOT.x, 0.36, ROCKET_SPOT.z);
    this.add(ring);

    const tower = new THREE.Mesh(
      towerGeometry(),
      new THREE.MeshStandardMaterial({ color: TOWER_COLOR, roughness: 0.8 }),
    );
    tower.castShadow = true;
    tower.position.set(TOWER_SPOT.x, 0.35, TOWER_SPOT.z);
    this.add(tower);

    // A walkway from the tower to the rocket. It spans from the tower face to the rocket, stopping
    // short of the body so it does not disappear inside it.
    const armLength = TOWER_OFFSET - TOWER_WIDTH / 2 - ROCKET_RADIUS * 1.6;
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(armLength, 0.3, 1.4),
      new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.6, metalness: 0.3 }),
    );
    arm.position.set(0, ROCKET_HEIGHT * 0.42, TOWER_OFFSET / 2 + 0.5);
    this.add(arm);

    // A support leg under the far end, so the walkway is not floating.
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, ROCKET_HEIGHT * 0.42, 0.5),
      new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.6, metalness: 0.3 }),
    );
    leg.position.set(0, ROCKET_HEIGHT * 0.21, TOWER_OFFSET - ROCKET_RADIUS * 1.8);
    this.add(leg);

    for (const [i, b] of siteBuildings(seed).entries()) {
      const { body, roof } = buildingGeometry(b);
      const color = new THREE.Color(BUILDING_COLORS[i % BUILDING_COLORS.length]);
      color.multiplyScalar(0.85 + b.tint[0] * 0.3);
      const block = new THREE.Mesh(body, new THREE.MeshLambertMaterial({ color }));
      block.castShadow = true;
      block.receiveShadow = true;
      block.position.set(b.x, 0, b.z);
      block.rotation.y = b.rotationY;
      this.add(block);

      const cap = new THREE.Mesh(roof, new THREE.MeshLambertMaterial({ color: DARK_STEEL }));
      cap.position.set(b.x, 0, b.z);
      cap.rotation.y = b.rotationY;
      this.add(cap);
    }
  }

  private add(mesh: THREE.Object3D): void {
    this.scene.add(mesh);
    this.meshes.push(mesh);
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.traverse((child) => {
        const m = child as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const material = m.material as THREE.Material | THREE.Material[];
        for (const one of Array.isArray(material) ? material : [material]) one.dispose();
      });
    }
    this.meshes.length = 0;
  }
}
