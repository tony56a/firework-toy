import { mulberry32 } from '../src/core/random';
import type { AudioFrame } from '../src/input/audio/types';

export const SAMPLE_RATE = 44100;
export const FFT_SIZE = 1024;
const BINS = FFT_SIZE / 2;

type Shape = 'silence' | 'clap' | 'lowThump' | 'tone';

/** Synthetic analysis frame. Spectra are given directly in dB, so no FFT is needed. */
export function makeFrame(shape: Shape, seed = 1): AudioFrame {
  const rng = mulberry32(seed);
  const highpassed = new Float32Array(FFT_SIZE);
  const spectrumDb = new Float32Array(BINS).fill(-90);
  const amp = shape === 'silence' ? 0.001 : 0.5;
  for (let i = 0; i < FFT_SIZE; i++) {
    const decay = shape === 'silence' ? 1 : Math.exp(-i / 150);
    highpassed[i] = (rng() * 2 - 1) * amp * decay;
  }
  if (shape === 'clap') spectrumDb.fill(-30);
  if (shape === 'lowThump') for (let i = 0; i < 12; i++) spectrumDb[i] = -30;
  if (shape === 'tone') spectrumDb[70] = -30; // about 3 kHz
  return { sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE, highpassed, spectrumDb, recent16k: () => new Float32Array(15600) };
}
