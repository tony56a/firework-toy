import { hslToRgb, type RGB } from '../core/color';
import { range, type Rng } from '../core/random';

export type PaletteId = 'rainbow' | 'warm' | 'cold' | 'neon' | 'pastel' | 'metal';

/** [hue, saturation, lightness], all in [0, 1]. */
type HSL = readonly [number, number, number];

export interface Palette {
  label: string;
  /** Burst colors. `null` means any hue on the wheel, with a complementary second color for double bursts. */
  hues: ReadonlyArray<HSL> | null;
  /** Color of willow bursts. */
  willow: RGB;
  /** Color of crackle bursts and the bright core of rings. */
  spark: RGB;
}

const hsl = ([h, s, l]: HSL): RGB => hslToRgb(h, s, l);

export const PALETTES: Record<PaletteId, Palette> = {
  rainbow: { label: 'Rainbow', hues: null, willow: hslToRgb(0.11, 1, 0.6), spark: [1, 0.85, 0.5] },
  warm: {
    label: 'Warm',
    hues: [[0.99, 1, 0.55], [0.03, 1, 0.55], [0.07, 1, 0.55], [0.11, 1, 0.58], [0.14, 1, 0.6]],
    willow: hslToRgb(0.09, 1, 0.55), spark: [1, 0.7, 0.35],
  },
  cold: {
    label: 'Cold',
    hues: [[0.5, 1, 0.6], [0.55, 1, 0.6], [0.6, 1, 0.62], [0.67, 0.9, 0.68], [0.75, 0.9, 0.68], [0.5, 0.6, 0.85]],
    willow: hslToRgb(0.55, 0.8, 0.75), spark: [0.7, 0.9, 1],
  },
  neon: {
    label: 'Neon',
    hues: [[0.83, 1, 0.55], [0.33, 1, 0.5], [0.5, 1, 0.5], [0.16, 1, 0.5], [0.9, 1, 0.55]],
    willow: hslToRgb(0.33, 1, 0.55), spark: [0.9, 1, 0.9],
  },
  pastel: {
    label: 'Pastel',
    hues: [[0.95, 0.8, 0.8], [0.1, 0.8, 0.8], [0.33, 0.6, 0.8], [0.55, 0.8, 0.82], [0.75, 0.7, 0.82]],
    willow: hslToRgb(0.1, 0.7, 0.8), spark: [1, 0.95, 0.9],
  },
  metal: {
    label: 'Gold and silver',
    hues: [[0.12, 0.9, 0.62], [0.1, 0.8, 0.55], [0.6, 0.1, 0.88], [0, 0, 0.95]],
    willow: hslToRgb(0.12, 0.9, 0.62), spark: [1, 0.97, 0.85],
  },
};

export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];

/** Picks the main burst color and a different secondary color for two-tone effects. */
export function pickColors(palette: Palette, rng: Rng): { primary: RGB; secondary: RGB } {
  if (!palette.hues) {
    const h = rng();
    return { primary: hslToRgb(h, 1, 0.58), secondary: hslToRgb(h + 0.45, 1, 0.58) };
  }
  const n = palette.hues.length;
  const i = Math.floor(rng() * n);
  const j = n > 1 ? (i + 1 + Math.floor(rng() * (n - 1))) % n : i;
  const jitter = (c: HSL): HSL => [c[0] + range(rng, -0.015, 0.015), c[1], c[2]];
  return { primary: hsl(jitter(palette.hues[i])), secondary: hsl(jitter(palette.hues[j])) };
}

/** Colors to show in the UI as a preview of the palette. */
export function swatchColors(palette: Palette): RGB[] {
  return palette.hues ? palette.hues.map(hsl) : [0, 0.17, 0.33, 0.5, 0.67, 0.83].map((h) => hslToRgb(h, 1, 0.58));
}
