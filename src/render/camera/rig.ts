import * as THREE from 'three';
import { CAMERA_MODES, type CameraMode } from '../../models/cameraModes';
import { cameraConstants, type CameraConstants, type CameraFraming } from '../../models/cameraFraming';
import type { Ground } from '../../models/ground';

const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = { x: 0, z: 0 };

/** Used until a scene says otherwise, and while one is being built. */
const DEFAULT_FRAMING: CameraFraming = { radius: 90, surface: 0 };

/**
 * A single perspective camera driven by one of several fixed behaviors. It never moves the
 * viewer through the world (no first-person walking); "ground" only lets you look around.
 *
 * Distances come from the active scene's framing rather than fixed constants, so a small tabletop
 * diorama is not viewed from the far side of a landscape.
 */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.5, 600);
  private mode: CameraMode = 'orbit';
  private ambient = false;
  private autoMotion = true;
  private motionTime = 0;
  private framing: CameraFraming = DEFAULT_FRAMING;
  private orbit = { theta: 0.8, phi: 1.05, radius: cameraConstants(DEFAULT_FRAMING).orbitRadius };
  private readonly look = { yaw: 0.6, pitch: 0.02 };
  private readonly scratch = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.autoMotion = true;
    this.camera.fov = CAMERA_MODES[mode].fov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Adopts a scene's framing and re-frames the orbit camera to suit it. Resetting the orbit is
   * deliberate: keeping a radius sized for the previous scene is what put the camera inside this
   * one.
   */
  setFraming(framing: CameraFraming): void {
    this.framing = framing;
    const k = cameraConstants(framing);
    this.orbit.radius = k.orbitRadius;
  }

  setAmbient(on: boolean): void { this.ambient = on; }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Any user interaction stops automatic sweeping until the mode changes. */
  interrupt(): void { this.autoMotion = false; }

  drag(dx: number, dy: number): void {
    if (this.mode === 'orbit') {
      this.orbit.theta -= dx * 0.005;
      this.orbit.phi = THREE.MathUtils.clamp(this.orbit.phi - dy * 0.005, 0.15, 1.5);
    } else if (this.mode === 'ground') {
      this.look.yaw -= dx * 0.004;
      this.look.pitch = THREE.MathUtils.clamp(this.look.pitch - dy * 0.004, -0.6, 0.8);
    }
  }

  zoom(factor: number): void {
    const k = cameraConstants(this.framing);
    if (this.mode === 'orbit') this.orbit.radius = THREE.MathUtils.clamp(this.orbit.radius * factor, k.orbitMin, k.orbitMax);
  }

  update(dt: number, ground: Ground): void {
    if (this.ambient) this.motionTime += dt;
    this.camera.up.copy(UP);
    const k = cameraConstants(this.framing);
    switch (this.mode) {
      case 'orbit': return this.updateOrbit(dt, ground);
      case 'ground': return this.updateGround(dt, ground, k);
      case 'plane': return this.updatePlane(ground, k);
      case 'overhead': return this.updateOverhead(k);
      case 'ridge': return this.updateRidge(ground, k);
    }
  }

  /** Horizontal unit vector the camera faces, falling back to screen-up when looking straight down. */
  groundForward(): { x: number; z: number } {
    this.camera.getWorldDirection(this.forward);
    let { x, z } = this.forward;
    if (Math.hypot(x, z) < 0.25) ({ x, z } = this.camera.up);
    const length = Math.hypot(x, z) || 1;
    return { x: x / length, z: z / length };
  }

  private updateOrbit(dt: number, ground: Ground): void {
    const o = this.orbit;
    if (this.autoMotion && this.ambient) o.theta += 0.09 * dt;
    const target = ground.heightAt(0, 0) + 2;
    const x = o.radius * Math.sin(o.phi) * Math.sin(o.theta);
    const z = o.radius * Math.sin(o.phi) * Math.cos(o.theta);
    this.camera.position.set(x, Math.max(target + o.radius * Math.cos(o.phi), ground.heightAt(x, z) + 3), z);
    this.camera.lookAt(0, target, 0);
  }

  private updateGround(dt: number, ground: Ground, k: CameraConstants): void {
    if (this.autoMotion && this.ambient) this.look.yaw += 0.072 * dt;
    // Stand wherever this scene wants a viewer to be, which is not always the origin.
    const eye = this.framing.eye ?? ORIGIN;
    // Sit on whichever surface is higher: the terrain, or the tabletop of a diorama.
    const y = Math.max(ground.heightAt(eye.x, eye.z), this.framing.surface) + k.eyeOffset;
    const c = Math.cos(this.look.pitch);
    this.camera.position.set(eye.x, y, eye.z);
    this.camera.lookAt(
      eye.x + Math.sin(this.look.yaw) * c * 10,
      y + Math.sin(this.look.pitch) * 10,
      eye.z + Math.cos(this.look.yaw) * c * 10,
    );
  }

  private updatePlane(ground: Ground, k: CameraConstants): void {
    const t = this.motionTime;
    const R = k.planeRadius;
    const a = t * 0.06;
    const px = R * Math.cos(a);
    const pz = R * Math.sin(a);
    const py = Math.max(k.planeMinHeight, ground.heightAt(px, pz) + 30) + Math.sin(t * 0.3) * 3;
    this.camera.position.set(px, py, pz);
    const target = this.scratch.set(R * 0.85 * Math.cos(a + 0.25), k.planeTargetHeight, R * 0.85 * Math.sin(a + 0.25));
    this.forward.copy(target).sub(this.camera.position).normalize();
    this.camera.up.applyAxisAngle(this.forward, 0.22 + Math.sin(t * 0.4) * 0.05); // bank into the turn
    this.camera.lookAt(target);
  }

  private updateOverhead(k: CameraConstants): void {
    const a = this.motionTime * 0.03;
    this.camera.position.set(0, k.overheadHeight, 0);
    this.camera.up.set(Math.sin(a), 0, Math.cos(a));
    this.camera.lookAt(0, 0, 0);
  }

  private updateRidge(ground: Ground, k: CameraConstants): void {
    const x = k.ridgeX + Math.sin(this.motionTime * 0.1) * (k.ridgeX * 0.11);
    const z = k.ridgeZ;
    this.camera.position.set(x, ground.heightAt(x, z) + k.ridgeHeight, z);
    this.camera.lookAt(0, k.ridgeTargetHeight, 0);
  }
}
