import * as THREE from 'three';

/** Owns the WebGL renderer. Scenes own their own `THREE.Scene` and are handed in at render time. */
export class SceneRenderer {
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

  /** Draws whichever scene is active this frame. */
  render(camera: THREE.Camera, scene: THREE.Scene): void {
    this.renderer.render(scene, camera);
  }
}
