import * as THREE from 'three';
import { rngFromSeed } from '../core/random';
import type { AtmospherePreset } from '../models/timeOfDay';

/** Three r155+ uses physical light units; classic-style intensities need this factor to look the same. */
const LEGACY_LIGHT_SCALE = Math.PI;

/** The moon is a painted disc on the sky texture, placed by longitude and elevation like the stars. */
function drawMoon(g: CanvasRenderingContext2D, W: number, H: number): void {
  const lon = 0.62 * Math.PI * 2;
  const elevation = 0.55 * (Math.PI / 2);
  const x = (lon / (Math.PI * 2)) * W;
  const y = H / 2 - (elevation / (Math.PI / 2)) * (H / 2);
  const radius = 44;
  const halo = g.createRadialGradient(x, y, radius * 0.7, x, y, radius * 6);
  halo.addColorStop(0, 'rgba(206,222,255,0.32)');
  halo.addColorStop(1, 'rgba(206,222,255,0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(x, y, radius * 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e9efff';
  g.beginPath();
  g.arc(x, y, radius, 0, Math.PI * 2);
  g.fill();
}

function createSkyTexture(preset: AtmospherePreset): THREE.CanvasTexture {
  const W = 4096;
  const H = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const gradient = g.createLinearGradient(0, 0, 0, H / 2);
  preset.sky.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  g.fillStyle = gradient;
  g.fillRect(0, 0, W, H / 2);
  g.fillStyle = preset.sky[preset.sky.length - 1][1];
  g.fillRect(0, H / 2, W, H / 2);

  if (preset.stars) {
    const rng = rngFromSeed('stars');
    for (let i = 0; i < 2600; i++) {
      const lon = rng() * Math.PI * 2;
      const elevation = Math.asin(rng()); // uniform over the upper hemisphere
      const size = rng() < 0.08 ? 3 : rng() < 0.4 ? 2 : 1;
      const width = Math.min(14, size / Math.max(Math.cos(elevation), 0.1)); // stretch near the pole
      g.fillStyle = `rgba(255,255,255,${0.35 + rng() * 0.65})`;
      g.fillRect((lon / (Math.PI * 2)) * W - width / 2, H / 2 - (elevation / (Math.PI / 2)) * (H / 2), width, size);
    }
    drawMoon(g, W, H);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

/** Sky dome, fog and lights, driven by a time-of-day preset. */
export class Atmosphere {
  private readonly hemisphere = new THREE.HemisphereLight();
  private readonly sun = new THREE.DirectionalLight();
  private readonly skyMaterial = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false });
  private readonly sky: THREE.Mesh;
  private readonly fog = new THREE.Fog(0xffffff, 90, 260);

  constructor(scene: THREE.Scene) {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 260 });
    this.sun.shadow.bias = -0.0006;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), this.skyMaterial);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.fog = this.fog;
    scene.add(this.hemisphere, this.sun, this.sky);
  }

  apply(preset: AtmospherePreset): void {
    this.skyMaterial.map?.dispose();
    this.skyMaterial.map = createSkyTexture(preset);
    this.skyMaterial.needsUpdate = true;
    this.fog.color.setHex(preset.fog);
    this.sun.color.setHex(preset.sunColor);
    this.sun.intensity = preset.sunIntensity * LEGACY_LIGHT_SCALE;
    this.sun.position.set(...preset.sunPosition);
    this.hemisphere.color.setHex(preset.hemiSky);
    this.hemisphere.groundColor.setHex(preset.hemiGround);
    this.hemisphere.intensity = preset.hemiIntensity * LEGACY_LIGHT_SCALE;
  }

  /** The dome is centered on the camera so it never parallaxes. */
  follow(camera: THREE.Camera): void {
    this.sky.position.copy(camera.position);
  }
}
