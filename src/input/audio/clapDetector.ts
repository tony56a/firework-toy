import { Emitter } from '../../core/emitter';
import type { DetectorMode } from '../../models/appState';
import {
  analysisBins, classifierThreshold, dbToPower, extractFeatures, judgeSpectral, learnNoise,
  levelThresholds, measureLevel, MIN_CREST, type SpectralFeatures,
} from './features';
import type { AudioFrame, ClipClassifier } from './types';

export interface ClapDetectorEvents {
  clap: { mode: DetectorMode };
  status: string;
  level: { rms: number; hit: boolean };
}

const COOLDOWN_MS = 350;
const CLASSIFIER_DELAY_MS = 450;
const CLASSIFIER_COOLDOWN_MS = 1100;
const CALIBRATION_MS = 2000;

/**
 * Decides whether each audio frame contains a clap. Every mode starts from an energy onset;
 * the mode decides what else must be true. `update` is driven externally, so tests can feed
 * synthetic frames with a synthetic clock.
 */
export class ClapDetector extends Emitter<ClapDetectorEvents> {
  sensitivity = 7;
  mode: DetectorMode = 'spectral';

  private classifier: ClipClassifier | null = null;
  private background = 0.01;
  private previousRms = 0;
  private cooldownUntil = 0;
  private hitUntil = 0;
  private pendingAt = 0;
  private calibrateUntil = 0;
  private frames = 0;
  private epoch = 0;
  private noise = new Float32Array(0);
  private power = new Float32Array(0);

  setClassifier(classifier: ClipClassifier | null): void {
    this.classifier = classifier;
  }

  calibrate(now: number): void {
    this.calibrateUntil = now + CALIBRATION_MS;
    this.emit('status', 'Calibrating, stay quiet for 2 s');
  }

  reset(): void {
    this.epoch++;
    this.background = 0.01;
    this.previousRms = 0;
    this.cooldownUntil = this.hitUntil = this.pendingAt = this.calibrateUntil = 0;
    this.frames = 0;
    this.noise = new Float32Array(0);
  }

  update(frame: AudioFrame, now: number): void {
    const bins = frame.spectrumDb.length;
    if (this.noise.length !== bins) {
      this.noise = new Float32Array(bins).fill(1e-12);
      this.power = new Float32Array(bins);
    }
    const level = measureLevel(frame.highpassed);
    const { ratio, floor } = levelThresholds(this.sensitivity);
    const threshold = Math.max(floor, this.background * ratio);
    dbToPower(frame.spectrumDb, this.power);
    const range = analysisBins(frame.sampleRate, frame.fftSize, bins);
    const features = extractFeatures(this.power, this.noise, range);

    const calibrating = now < this.calibrateUntil;
    if (this.calibrateUntil && !calibrating) {
      this.calibrateUntil = 0;
      this.emit('status', 'Calibrated to this room');
    }

    this.resolvePending(frame, now);
    const onset = !calibrating && level.rms > threshold && this.previousRms <= threshold
      && level.crest > MIN_CREST && now > this.cooldownUntil;
    if (onset) this.onOnset(features, now);

    this.frames++;
    if (calibrating) learnNoise(this.noise, this.power, range, 0.1);
    else if (this.frames < 30) learnNoise(this.noise, this.power, range, 0.3);
    else if (level.rms < this.background * 2) learnNoise(this.noise, this.power, range, 0.03);
    if (calibrating || level.rms < this.background * 2 || now > this.cooldownUntil) {
      const keep = calibrating ? 0.9 : 0.97;
      this.background = Math.max(0.0005, this.background * keep + level.rms * (1 - keep));
    }
    this.previousRms = level.rms;
    this.emit('level', { rms: level.rms, hit: now < this.hitUntil });
  }

  private onOnset(features: SpectralFeatures, now: number): void {
    const mode = this.mode === 'classifier' && !this.classifier ? 'spectral' : this.mode;
    if (mode === 'level') {
      this.fire(now, mode);
    } else if (mode === 'spectral') {
      const reason = judgeSpectral(features, this.sensitivity);
      if (reason === null) this.fire(now, mode);
      else this.emit('status', `Ignored (${reason})`);
    } else {
      this.cooldownUntil = now + CLASSIFIER_COOLDOWN_MS;
      this.pendingAt = now + CLASSIFIER_DELAY_MS;
    }
  }

  private resolvePending(frame: AudioFrame, now: number): void {
    if (!this.pendingAt || now < this.pendingAt || !this.classifier) return;
    this.pendingAt = 0;
    const epoch = this.epoch;
    const needed = classifierThreshold(this.sensitivity);
    this.classifier.classify(frame.recent16k()).then((score) => {
      if (epoch !== this.epoch) return;
      if (score > needed) {
        this.fire(performance.now(), 'classifier');
        this.emit('status', `Clap confirmed (${score.toFixed(2)})`);
      } else {
        this.emit('status', `Rejected by classifier (${score.toFixed(2)} < ${needed.toFixed(2)})`);
      }
    }, () => this.emit('status', 'Classifier error'));
  }

  private fire(now: number, mode: DetectorMode): void {
    this.cooldownUntil = now + COOLDOWN_MS;
    this.hitUntil = now + 200;
    this.emit('clap', { mode });
  }
}
