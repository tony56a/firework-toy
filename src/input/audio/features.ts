/** Pure signal-analysis helpers. No browser APIs, so everything here is unit-testable. */

export interface LevelMetrics { rms: number; peak: number; crest: number }

export function measureLevel(samples: Float32Array): LevelMetrics {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    sum += v * v;
    if (v > peak) peak = v;
  }
  const rms = Math.sqrt(sum / samples.length);
  return { rms, peak, crest: peak / (rms + 1e-6) };
}

/** A clap has a sharp waveform; sustained noise and voice have a lower peak-to-RMS ratio. */
export const MIN_CREST = 2.2;

/** Sensitivity 1..10 maps to an onset ratio over the running background and an absolute floor. */
export function levelThresholds(sensitivity: number): { ratio: number; floor: number } {
  return {
    ratio: Math.max(1.5, 5 - sensitivity * 0.35),
    floor: Math.max(0.003, 0.02 - sensitivity * 0.0016),
  };
}

export function dbToPower(db: Float32Array, out: Float32Array): void {
  for (let i = 0; i < db.length; i++) out[i] = Math.pow(10, db[i] / 10);
}

export interface BinRange { lo: number; hi: number; binHz: number }

/** Analysis band: 300 Hz to 10 kHz. */
export function analysisBins(sampleRate: number, fftSize: number, binCount: number): BinRange {
  const binHz = sampleRate / fftSize;
  return { lo: Math.max(1, Math.round(300 / binHz)), hi: Math.min(binCount - 1, Math.round(10_000 / binHz)), binHz };
}

export interface SpectralFeatures {
  /** Share of total power that rises above twice the learned noise profile. */
  excessFrac: number;
  /** Share of that excess power lying between 1 and 8 kHz. */
  bandRatio: number;
  /** Center of mass of the excess power in the 1 to 8 kHz band, in Hz. */
  centroid: number;
  /** Geometric over arithmetic mean of power in 1 to 8 kHz. 1 is white noise, near 0 is tonal. */
  flatness: number;
}

export function extractFeatures(power: Float32Array, noise: Float32Array, bins: BinRange): SpectralFeatures {
  let total = 0, excess = 0, mid = 0, weighted = 0, logSum = 0, powerSum = 0, count = 0;
  for (let i = bins.lo; i <= bins.hi; i++) {
    const p = power[i];
    const hz = i * bins.binHz;
    const e = Math.max(0, p - 2 * noise[i]);
    total += p;
    excess += e;
    if (hz >= 1000 && hz <= 8000) {
      mid += e;
      weighted += e * hz;
      logSum += Math.log(p + 1e-20);
      powerSum += p;
      count++;
    }
  }
  return {
    excessFrac: excess / (total + 1e-20),
    bandRatio: mid / (excess + 1e-20),
    centroid: weighted / (mid + 1e-20),
    flatness: count ? Math.exp(logSum / count) / (powerSum / count + 1e-20) : 0,
  };
}

export function learnNoise(noise: Float32Array, power: Float32Array, bins: BinRange, rate: number): void {
  for (let i = bins.lo; i <= bins.hi; i++) noise[i] = noise[i] * (1 - rate) + power[i] * rate;
}

/** Returns why the sound does not look like a clap, or null when it does. */
export function judgeSpectral(f: SpectralFeatures, sensitivity: number): string | null {
  if (f.excessFrac < 0.5 - sensitivity * 0.03) return 'narrow band';
  if (f.bandRatio < 0.55) return 'mostly low frequency';
  if (f.centroid < 1000 || f.centroid > 6500) return 'centroid off';
  if (f.flatness < 0.25 - sensitivity * 0.02) return 'tonal';
  return null;
}

/** Minimum classifier score to accept a clap. */
export const classifierThreshold = (sensitivity: number): number => 0.35 - sensitivity * 0.03;
