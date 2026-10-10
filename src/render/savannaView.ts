import * as THREE from 'three';
import { TERRAIN_SEGMENTS } from '../config';
import type { Savanna } from '../models/savanna/ground';

const DRY_A = new THREE.Color(0x9c9155);
const DRY_B = new THREE.Color(0xc4b069);
const GREEN = new THREE.Color(0x6f7f42);
const BARE = new THREE.Color(0xb5a487);

/**
 * The plain itself, as one displaced, vertex-coloured mesh.
 *
 * Built the same way as the forest's terrain and for the same reason: the heights written here are
 * the same `heightAt` the herd is posed against, so the animals stand on the ground rather than
 * near it. The difference is only the palette — dry straw and bare earth, not lawn.
 */
export class SavannaView {
  private mesh: THREE.Mesh | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  set(savanna: Savanna): void {
    this.dispose();
    const geometry = new THREE.PlaneGeometry(
      savanna.size, savanna.size, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS,
    );
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      position.setY(i, savanna.heightAt(x, z));
      const w = savanna.grassWeights(x, z);
      color.copy(DRY_A).lerp(DRY_B, w.green).lerp(GREEN, w.green * 0.35).lerp(BARE, w.bare).multiplyScalar(w.shade);
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