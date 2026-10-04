export type Rng = () => number;

export function hashSeed(text: string): number {
  let h = 1779033703;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Small, fast, seedable PRNG (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngFromSeed = (seed: string): Rng => mulberry32(hashSeed(seed));

export const range = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
