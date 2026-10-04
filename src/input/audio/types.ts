/** One snapshot of microphone analysis, produced by a source and consumed by the detector. */
export interface AudioFrame {
  sampleRate: number;
  fftSize: number;
  /** Time-domain samples after a high-pass filter (removes rumble and voice fundamentals). */
  highpassed: Float32Array;
  /** Magnitude spectrum in dB of the unfiltered signal, `fftSize / 2` bins. */
  spectrumDb: Float32Array;
  /** The most recent 15600 samples (0.975 s) resampled to 16 kHz mono, as YAMNet expects. */
  recent16k(): Float32Array;
}

/** Anything that can score a 16 kHz clip for "was that a clap". */
export interface ClipClassifier {
  /** Probability-like score in [0, 1]. */
  classify(samples16k: Float32Array): Promise<number>;
}
