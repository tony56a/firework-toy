import * as THREE from 'three';
import type { FireworkSim } from '../models/fireworks';

/** Physical units: tune to taste. Bursts are 20 to 100 units from the ground, so intensity scales with distance squared. */
const FLASH_PEAK = 20_000;

function createSprite(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** Draws a FireworkSim as additive points plus a short-lived point light. */
export class FireworksView {
  private readonly positions: THREE.BufferAttribute;
  private readonly colors: THREE.BufferAttribute;
  private readonly light = new THREE.PointLight(0xffffff, 0, 0, 2);

  constructor(scene: THREE.Scene, private readonly sim: FireworkSim) {
    this.positions = new THREE.BufferAttribute(sim.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colors = new THREE.BufferAttribute(sim.colors, 3).setUsage(THREE.DynamicDrawUsage);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('color', this.colors);
    const material = new THREE.PointsMaterial({
      size: 1.7, map: createSprite(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false; // the bounding sphere would be stale
    scene.add(points, this.light);
  }

  sync(): void {
    this.positions.needsUpdate = true;
    this.colors.needsUpdate = true;
    const { x, y, z, color, intensity } = this.sim.flash;
    this.light.position.set(x, y, z);
    this.light.color.setRGB(color[0], color[1], color[2]);
    this.light.intensity = intensity * FLASH_PEAK;
  }
}
