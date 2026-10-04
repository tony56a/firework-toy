import { Emitter } from '../../core/emitter';
import type { DetectorMode } from '../../models/appState';
import { ClapDetector } from './clapDetector';
import { MicrophoneError, MicrophoneSource } from './microphone';
import { YamnetClassifier } from './yamnet';

export interface ClapInputEvents {
  clap: void;
  status: string;
  level: { rms: number; hit: boolean };
}

/** Facade over the microphone, detector and optional classifier. The app only talks to this. */
export class ClapInput extends Emitter<ClapInputEvents> {
  private readonly mic = new MicrophoneSource();
  private readonly detector = new ClapDetector();

  constructor() {
    super();
    this.detector.on('clap', () => this.emit('clap', undefined));
    this.detector.on('status', (s) => this.emit('status', s));
    this.detector.on('level', (l) => this.emit('level', l));
  }

  /** Resolves to whether the microphone is actually on afterwards. */
  async setEnabled(enabled: boolean): Promise<boolean> {
    if (!enabled) {
      this.mic.stop();
      this.detector.reset();
      this.emit('status', 'Mic off');
      this.emit('level', { rms: 0, hit: false });
      return false;
    }
    try {
      await this.mic.start();
      this.detector.reset();
      this.emit('status', 'Listening for claps');
      return true;
    } catch (err) {
      this.emit('status', err instanceof MicrophoneError ? err.message : 'Microphone failed to start');
      return false;
    }
  }

  setSensitivity(value: number): void { this.detector.sensitivity = value; }
  setMode(mode: DetectorMode): void { this.detector.mode = mode; }
  calibrate(now: number): void {
    if (this.mic.active) this.detector.calibrate(now);
    else this.emit('status', 'Turn the microphone on first');
  }

  async loadClassifier(modelUrl?: string): Promise<void> {
    this.emit('status', 'Loading classifier (large download)...');
    try {
      this.detector.setClassifier(await YamnetClassifier.load(modelUrl || undefined));
      this.emit('status', 'Classifier ready');
    } catch (err) {
      this.detector.setClassifier(null);
      const why = err instanceof Error ? err.message : 'blocked';
      this.emit('status', `Classifier failed (${why}). Paste a tfjs model URL and try again.`);
    }
  }

  /** Call once per animation frame. */
  tick(now: number): void {
    const frame = this.mic.readFrame();
    if (frame) this.detector.update(frame, now);
  }
}
