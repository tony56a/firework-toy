import * as THREE from 'three';
import { TERRAIN_SEGMENTS } from '../config';
import type { Terrain } from '../models/terrain';

const GRASS_A = new THREE.Color(0x5f9a45);
const GRASS_B = new THREE.Color(0x8db85a);
const DRY = new THREE.Color(0xb9b26a);
const DARK = new THREE.Color(0x3f7a3a);

/** Builds and owns the ground mesh for a Terrain. */
export class TerrainView {
  private mesh: THREE.Mesh | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  set(terrain: Terrain): void {
    this.dispose();
    const geometry = new THREE.PlaneGeometry(terrain.size, terrain.size, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      position.setY(i, terrain.heightAt(x, z));
      const w = terrain.groundWeights(x, z);
      color.copy(GRASS_A).lerp(GRASS_B, w.grass).lerp(DRY, w.dry).lerp(DARK, w.dark).multiplyScalar(w.shade);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }

  dispose(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = null;
  }
}
