import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEA_DEPTH, SEA_FLOOR_THICKNESS, SEA_RIM_HEIGHT, SEA_RIM_THICKNESS, SEA_SIZE } from '../config';
import type { Sea } from '../models/sea/sea';
import { waveHeight } from '../models/sea/waves';

const FLOOR_COLOR = 0x6b7d63;
const RIM_COLOR = 0x8d8577;

const DEEP_COLOR = new THREE.Color(0x0d3550);
const SHALLOW_COLOR = new THREE.Color(0x2f7d94);

/**
 * The basin: a floor slab and four walls around a square of water. The walls are what make the sea
 * a bounded thing rather than an ocean, and they give the surface an edge to die out against.
 *
 * Built as merged geometry with two materials so the floor and the walls can be tinted apart while
 * still being one disposable mesh.
 */
function basinGeometry(): THREE.BufferGeometry {
  const floor = new THREE.BoxGeometry(SEA_SIZE, SEA_FLOOR_THICKNESS, SEA_SIZE)
    .translate(0, -SEA_DEPTH - SEA_FLOOR_THICKNESS / 2, 0);
  const wallHeight = SEA_DEPTH + SEA_RIM_HEIGHT + SEA_FLOOR_THICKNESS;
  // Walls run from the underside of the floor slab up to the rim, so the basin reads as one solid
  // block rather than four walls standing on a separate floor.
  const centreY = SEA_RIM_HEIGHT - wallHeight / 2;
  // Half the outside edge of the wall, which puts its inner face exactly on the water's edge.
  const span = SEA_SIZE / 2 + SEA_RIM_THICKNESS / 2;
  // Overlapping runs at the corners, so the basin has no gaps where the walls meet.
  const runLength = SEA_SIZE + 2 * SEA_RIM_THICKNESS;
  // `alongX` picks which axis a wall runs down. Stated per wall rather than inferred from its
  // length: a wall's length says nothing about its orientation, and inferring one from the other
  // put two of these walls across the basin instead of around it.
  const wall = (alongX: boolean, offset: number) =>
    new THREE.BoxGeometry(
      alongX ? runLength : SEA_RIM_THICKNESS,
      wallHeight,
      alongX ? SEA_RIM_THICKNESS : runLength,
    ).translate(alongX ? 0 : offset, centreY, alongX ? offset : 0);
  const walls = mergeGeometries(
    [
      wall(true, -span),
      wall(true, span),
      wall(false, -span),
      wall(false, span),
    ].map((g) => (g.index ? g.toNonIndexed() : g)),
  )!;
  return mergeGeometries(
    [floor.toNonIndexed(), walls].map((g) => (g.index ? g.toNonIndexed() : g)),
    true,
  )!;
}

/**
 * The water surface, rebuilt every frame from the same wave function the boat floats on. Sharing
 * that function is the point: a surface drawn from one wave field and a boat floated on another
 * would drift through each other as the two animations diverged.
 *
 * Colours are baked once by depth rather than per frame, because the sea bed does not move.
 */
export class SeaView {
  private readonly basin: THREE.Mesh;
  private readonly surface: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;

  constructor(private readonly scene: THREE.Scene, private readonly sea: Sea) {
    this.basin = new THREE.Mesh(
      basinGeometry(),
      [
        new THREE.MeshLambertMaterial({ color: FLOOR_COLOR }),
        new THREE.MeshLambertMaterial({ color: RIM_COLOR }),
      ],
    );
    this.basin.receiveShadow = true;
    this.scene.add(this.basin);

    this.geometry = new THREE.PlaneGeometry(this.sea.size, this.sea.size, 96, 96);
    this.geometry.rotateX(-Math.PI / 2);
    const position = this.geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      // Deepest at the middle, shoaling toward the walls, which is what makes the basin read as a
      // bowl rather than a painted square.
      const d = Math.hypot(position.getX(i), position.getZ(i)) / (this.sea.size / 2);
      color.copy(SHALLOW_COLOR).lerp(DEEP_COLOR, Math.min(1, d));
      colors.set([color.r, color.g, color.b], i * 3);
    }
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.surface = new THREE.Mesh(
      this.geometry,
      new THREE.MeshPhongMaterial({
        vertexColors: true,
        shininess: 90,
        specular: 0x9fd8e8,
        transparent: true,
        opacity: 0.86,
      }),
    );
    this.surface.receiveShadow = true;
    this.scene.add(this.surface);
  }

  /** Displaces the surface to the current swell and re-lights it from the new normals. */
  update(): void {
    const position = this.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, waveHeight(position.getX(i), position.getZ(i), this.sea.elapsed, this.sea.size));
    }
    position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  dispose(): void {
    this.scene.remove(this.basin, this.surface);
    this.basin.geometry.dispose();
    for (const material of this.basin.material as THREE.Material[]) material.dispose();
    this.geometry.dispose();
    (this.surface.material as THREE.Material).dispose();
  }
}