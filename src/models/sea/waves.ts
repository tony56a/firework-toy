import { GRAVITY, SEA_SIZE, WAVE_AMPLITUDE, WAVE_EDGE_BAND } from '../../config';
import { clamp } from '../../core/random';

/**
 * One directional component of the swell. `rate` scales how fast the component travels, so the
 * longer waves can be given a slower beat than the chop without hand-picking angular frequencies.
 */
interface Swell {
  dirX: number;
  dirZ: number;
  wavelength: number;
  amplitude: number;
  rate: number;
}

/**
 * A few crossing components rather than one. Two crossing waves would read as a regular corduroy
 * pattern, which is the giveaway of a synthetic sea; three unrelated directions do not line up
 * anywhere, so the surface keeps looking irregular all the way across the basin.
 */
const SWELL: readonly Swell[] = [
  { dirX: 1, dirZ: 0.25, wavelength: 34, amplitude: 1, rate: 1 },
  { dirX: -0.4, dirZ: 1, wavelength: 19, amplitude: 0.55, rate: 1.1 },
  { dirX: 0.7, dirZ: -0.8, wavelength: 11, amplitude: 0.28, rate: 1.25 },
];

const TOTAL_AMPLITUDE = SWELL.reduce((total, s) => total + s.amplitude, 0);

/**
 * How far the waves have run down near the walls. Zero at the waterline of a wall and a unit in
 * open water, smoothstepped between so there is no crease where the two meet. Past the wall it
 * stays zero, which is what keeps the surface from poking through the basin.
 */
export function edgeFade(x: number, z: number, size: number = SEA_SIZE): number {
  const half = size / 2;
  const distance = Math.min(half - Math.abs(x), half - Math.abs(z));
  const t = clamp(distance / WAVE_EDGE_BAND, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Surface height of the water above the still level at a point and time. Deep-water dispersion,
 * omega = sqrt(g k), so the long waves travel faster than the chop the way real swell does.
 *
 * Returned scaled so the components sum to at most WAVE_AMPLITUDE above the still level and the
 * same below it, which is what lets callers treat WAVE_AMPLITUDE as the sea's whole range.
 */
export function waveHeight(x: number, z: number, time: number, size: number = SEA_SIZE): number {
  const fade = edgeFade(x, z, size);
  if (fade === 0) return 0;
  let sum = 0;
  for (const s of SWELL) {
    const k = (Math.PI * 2) / s.wavelength;
    sum += s.amplitude * Math.sin(k * (x * s.dirX + z * s.dirZ) - s.rate * Math.sqrt(GRAVITY * k) * time);
  }
  return (sum / TOTAL_AMPLITUDE) * WAVE_AMPLITUDE * fade;
}