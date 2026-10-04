import type { Rng } from './random';

export type Noise2D = (x: number, y: number) => number;

/** Seeded 2D value noise in [0, 1) with smoothstep interpolation. */
export function createNoise(rng: Rng): Noise2D {
  const order = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = order[i & 255];
  const values = new Float32Array(256);
  for (let i = 0; i < 256; i++) values[i] = rng();

  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const at = (i: number, j: number) => values[perm[perm[X + i] + Y + j]];
    const a = at(0, 0) + (at(1, 0) - at(0, 0)) * u;
    const b = at(0, 1) + (at(1, 1) - at(0, 1)) * u;
    return a + (b - a) * v;
  };
}

/** Fractal Brownian motion: layered octaves, normalized back to [0, 1). */
export function fbm(noise: Noise2D, x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / total;
}
