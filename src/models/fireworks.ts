import { GRAVITY } from '../config';
import { mixRgb, type RGB } from '../core/color';
import { range, type Rng } from '../core/random';
import { PALETTES, pickColors, type Palette } from './fireworkPalettes';

export const EFFECTS = ['peony', 'ring', 'willow', 'double', 'crackle'] as const;
export type Effect = (typeof EFFECTS)[number];

export interface Vec3 { x: number; y: number; z: number }

export interface VolleyParams {
  origin: Vec3;
  /** Horizontal unit vector the camera faces; "x range" spreads shells sideways relative to it. */
  forward: { x: number; z: number };
  horizontalRange: number;
  heightRange: number;
  shells: number;
  /** Defaults to the rainbow palette. */
  palette?: Palette;
}

export const MAX_PARTICLES = 9000;

interface Rocket { x: number; y: number; z: number; vx: number; vy: number; vz: number; primary: RGB; secondary: RGB; palette: Palette; effect: Effect }
interface Scheduled { t: number; run: () => void }

/** What a view needs to draw a rocket: where it is, where it is going, and what color it burns. */
export type RocketState = Pick<Rocket, 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz' | 'primary' | 'secondary' | 'effect'>;

/**
 * Particle simulation with no rendering dependencies. Positions and colors live in typed arrays
 * that a view can upload directly; dead particles are drawn black (additive blending hides them).
 */
export class FireworkSim {
  readonly positions = new Float32Array(MAX_PARTICLES * 3);
  readonly colors = new Float32Array(MAX_PARTICLES * 3);
  /** Brief light at the latest burst. `intensity` is normalized: 1 at the flash, decaying to 0. */
  readonly flash = { x: 0, y: 0, z: 0, color: [1, 1, 1] as RGB, intensity: 0 };

  private readonly velocity = new Float32Array(MAX_PARTICLES * 3);
  private readonly baseColor = new Float32Array(MAX_PARTICLES * 3);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly gravity = new Float32Array(MAX_PARTICLES);
  private readonly drag = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  private scheduled: Scheduled[] = [];
  private rockets: Rocket[] = [];

  constructor(private readonly rng: Rng = Math.random) {}

  get activeRockets(): number { return this.rockets.length; }
  get pendingLaunches(): number { return this.scheduled.length; }
  /** Read-only view of the rockets in flight, in launch order. */
  get rocketStates(): ReadonlyArray<RocketState> { return this.rockets; }

  liveParticles(): number {
    let n = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) if (this.life[i] > 0) n++;
    return n;
  }

  launchVolley(p: VolleyParams): void {
    let delay = 0;
    for (let i = 0; i < p.shells; i++) {
      this.scheduled.push({ t: delay, run: () => this.launchRocket(p) });
      delay += range(this.rng, 0.35, 0.8);
    }
  }

  step(dt: number): void {
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      this.scheduled[i].t -= dt;
      if (this.scheduled[i].t <= 0) this.scheduled.splice(i, 1)[0].run();
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.vy -= GRAVITY * dt;
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      for (let n = 0; n < 3; n++) {
        this.emit(r.x, r.y, r.z, range(this.rng, -0.8, 0.8), -range(this.rng, 2, 4), range(this.rng, -0.8, 0.8), [1, 0.6, 0.25], 0.5, 2, 1.5);
      }
      if (r.vy <= 0) { this.rockets.splice(i, 1); this.explode(r); }
    }
    this.stepParticles(dt);
    this.flash.intensity *= Math.exp(-dt * 5);
  }

  private launchRocket(p: VolleyParams): void {
    const palette = p.palette ?? PALETTES.rainbow;
    const height = range(this.rng, p.heightRange * 0.4, p.heightRange);
    const v0 = Math.sqrt(2 * GRAVITY * height);
    const flightTime = v0 / GRAVITY;
    const sideways = range(this.rng, -1, 1) * p.horizontalRange;
    const depth = range(this.rng, -0.15, 0.15) * p.horizontalRange;
    const { x: fx, z: fz } = p.forward;
    this.rockets.push({
      x: p.origin.x, y: p.origin.y, z: p.origin.z,
      vx: (-fz * sideways + fx * depth) / flightTime, vy: v0, vz: (fx * sideways + fz * depth) / flightTime,
      ...pickColors(palette, this.rng), palette, effect: EFFECTS[Math.floor(this.rng() * EFFECTS.length)],
    });
  }

  private explode(r: Rocket): void {
    const { x, y, z, effect, primary, secondary, palette } = r;
    Object.assign(this.flash, { x, y, z, color: primary, intensity: 1 });
    switch (effect) {
      case 'peony':
        this.sphereBurst(x, y, z, 220, range(this.rng, 12, 16), primary, 2.4, 6, 1.1);
        break;
      case 'ring':
        this.ringBurst(x, y, z, 120, 15, primary, 2.5, 5, 1.0);
        this.sphereBurst(x, y, z, 40, 5, palette.spark, 1.2, 5, 1.5);
        break;
      case 'willow':
        this.sphereBurst(x, y, z, 180, range(this.rng, 7, 11), palette.willow, 4.2, 5, 0.7, 0.35);
        break;
      case 'double':
        this.sphereBurst(x, y, z, 120, 8, primary, 2, 6, 1.2);
        this.sphereBurst(x, y, z, 180, 15, secondary, 2.6, 6, 1.1);
        break;
      case 'crackle': {
        const mini = mixRgb(palette.spark, [1, 1, 1], 0.6);
        this.sphereBurst(x, y, z, 150, 13, palette.spark, 1.6, 6, 1.4);
        for (let i = 0; i < 22; i++) {
          this.scheduled.push({
            t: 0.9 + this.rng() * 0.6,
            run: () => {
              const d = this.randomUnit(range(this.rng, 6, 12));
              this.sphereBurst(x + d[0], y + d[1], z + d[2], 14, 3.5, mini, 0.5, 4, 1.5);
            },
          });
        }
        break;
      }
    }
  }

  private randomUnit(scale = 1): [number, number, number] {
    let x: number, y: number, z: number, l: number;
    do {
      x = this.rng() * 2 - 1; y = this.rng() * 2 - 1; z = this.rng() * 2 - 1;
      l = x * x + y * y + z * z;
    } while (l > 1 || l < 0.01);
    const s = scale / Math.sqrt(l);
    return [x * s, y * s, z * s];
  }

  private sphereBurst(x: number, y: number, z: number, n: number, speed: number, c: RGB, life: number, grav: number, drag: number, spread = 0.15): void {
    for (let i = 0; i < n; i++) {
      const d = this.randomUnit(speed * range(this.rng, 1 - spread, 1 + spread));
      this.emit(x, y, z, d[0], d[1], d[2], c, life * range(this.rng, 0.8, 1.2), grav, drag);
    }
  }

  private ringBurst(x: number, y: number, z: number, n: number, speed: number, c: RGB, life: number, grav: number, drag: number): void {
    const [nx, ny, nz] = this.randomUnit();
    const [ax, ay, az] = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = ny * az - nz * ay, uy = nz * ax - nx * az, uz = nx * ay - ny * ax;
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th), s = speed * range(this.rng, 0.97, 1.03);
      this.emit(x, y, z, (ux * cs + vx * sn) * s, (uy * cs + vy * sn) * s, (uz * cs + vz * sn) * s, c, life, grav, drag);
    }
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, c: RGB, life: number, grav: number, drag: number): void {
    const i = this.cursor;
    const k = i * 3;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    this.positions[k] = x; this.positions[k + 1] = y; this.positions[k + 2] = z;
    this.velocity[k] = vx; this.velocity[k + 1] = vy; this.velocity[k + 2] = vz;
    this.baseColor[k] = c[0]; this.baseColor[k + 1] = c[1]; this.baseColor[k + 2] = c[2];
    this.life[i] = this.maxLife[i] = life;
    this.gravity[i] = grav;
    this.drag[i] = drag;
  }

  private stepParticles(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.colors[k] = this.colors[k + 1] = this.colors[k + 2] = 0; continue; }
      const damp = Math.max(0, 1 - this.drag[i] * dt);
      this.velocity[k] *= damp;
      this.velocity[k + 1] = this.velocity[k + 1] * damp - this.gravity[i] * dt;
      this.velocity[k + 2] *= damp;
      this.positions[k] += this.velocity[k] * dt;
      this.positions[k + 1] += this.velocity[k + 1] * dt;
      this.positions[k + 2] += this.velocity[k + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      const alpha = f * f * (f < 0.3 ? range(this.rng, 0.5, 1) : 1);
      this.colors[k] = this.baseColor[k] * alpha;
      this.colors[k + 1] = this.baseColor[k + 1] * alpha;
      this.colors[k + 2] = this.baseColor[k + 2] * alpha;
    }
  }
}
