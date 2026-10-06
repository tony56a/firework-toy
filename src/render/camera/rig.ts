import * as THREE from 'three';
import { CAMERA_MODES, type CameraMode } from '../../models/cameraModes';
import type { Ground } from '../../models/ground';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * A single perspective camera driven by one of several fixed behaviors. It never moves the
 * viewer through the world (no first-person walking); "ground" only lets you look around.
 */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.5, 600);
  private mode: CameraMode = 'orbit';
  private ambient = false;
  private autoMotion = true;
  private motionTime = 0;
  private readonly orbit = { theta: 0.8, phi: 1.05, radius: 95 };
  private readonly look = { yaw: 0.6, pitch: 0.02 };
  private readonly scratch = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.autoMotion = true;
    this.camera.fov = CAMERA_MODES[mode].fov;
    this.camera.updateProjectionMatrix();
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
    if (this.mode === 'orbit') this.orbit.radius = THREE.MathUtils.clamp(this.orbit.radius * factor, 8, 200);
  }

  update(dt: number, ground: Ground): void {
    if (this.ambient) this.motionTime += dt;
    this.camera.up.copy(UP);
    switch (this.mode) {
      case 'orbit': return this.updateOrbit(dt, ground);
      case 'ground': return this.updateGround(dt, ground);
      case 'plane': return this.updatePlane(ground);
      case 'overhead': return this.updateOverhead();
      case 'ridge': return this.updateRidge(ground);
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

  private updateGround(dt: number, ground: Ground): void {
    if (this.autoMotion && this.ambient) this.look.yaw += 0.072 * dt;
    const y = ground.heightAt(0, 0) + 1.2;
    const c = Math.cos(this.look.pitch);
    this.camera.position.set(0, y, 0);
    this.camera.lookAt(Math.sin(this.look.yaw) * c * 10, y + Math.sin(this.look.pitch) * 10, Math.cos(this.look.yaw) * c * 10);
  }

  private updatePlane(ground: Ground): void {
    const t = this.motionTime;
    const R = 75;
    const a = t * 0.06;
    const px = R * Math.cos(a);
    const pz = R * Math.sin(a);
    const py = Math.max(50, ground.heightAt(px, pz) + 30) + Math.sin(t * 0.3) * 3;
    this.camera.position.set(px, py, pz);
    const target = this.scratch.set(R * 0.85 * Math.cos(a + 0.25), 6, R * 0.85 * Math.sin(a + 0.25));
    this.forward.copy(target).sub(this.camera.position).normalize();
    this.camera.up.applyAxisAngle(this.forward, 0.22 + Math.sin(t * 0.4) * 0.05); // bank into the turn
    this.camera.lookAt(target);
  }

  private updateOverhead(): void {
    const a = this.motionTime * 0.03;
    this.camera.position.set(0, 170, 0);
    this.camera.up.set(Math.sin(a), 0, Math.cos(a));
    this.camera.lookAt(0, 0, 0);
  }

  private updateRidge(ground: Ground): void {
    const x = -70 + Math.sin(this.motionTime * 0.1) * 8;
    const z = 70;
    this.camera.position.set(x, ground.heightAt(x, z) + 14, z);
    this.camera.lookAt(0, ground.heightAt(0, 0) + 4, 0);
  }
}
