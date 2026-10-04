import * as THREE from 'three';

/** Owns the WebGL renderer and the scene graph root. Views attach their objects to `scene`. */
export class SceneRenderer {
  readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  /** Fits the drawing buffer to the window and returns the new aspect ratio. */
  resize(): number {
    const { innerWidth: w, innerHeight: h } = window;
    this.renderer.setSize(w, h, false);
    return w / h;
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }
}
