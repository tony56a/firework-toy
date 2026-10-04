import type { AudioFrame } from './types';

export class MicrophoneError extends Error {
  constructor(readonly reason: 'blocked' | 'denied' | 'unavailable', message: string) {
    super(message);
    this.name = 'MicrophoneError';
  }
}

const YAMNET_SAMPLES = 15_600;

/** Owns the getUserMedia stream and Web Audio graph; hands out analysis frames on demand. */
export class MicrophoneSource {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private highpass: AnalyserNode | null = null;
  private spectrum: AnalyserNode | null = null;
  private ring = new Float32Array(0);
  private timeBuf = new Float32Array(0);
  private freqBuf = new Float32Array(0);
  private writeIndex = 0;
  private frame: AudioFrame | null = null;

  get active(): boolean { return this.ctx !== null; }

  static blockedByPolicy(): boolean {
    const policy = (document as Document & { permissionsPolicy?: { allowsFeature(name: string): boolean } }).permissionsPolicy;
    return !navigator.mediaDevices || (policy !== undefined && !policy.allowsFeature('microphone'));
  }

  /** `deviceId` is a seam for a future device picker; the default device is used when omitted. */
  async start(deviceId?: string): Promise<void> {
    if (MicrophoneSource.blockedByPolicy()) {
      throw new MicrophoneError('blocked', 'Microphone is blocked in this embedded view. Open the page directly in your browser.');
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : 'error';
      const reason = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable';
      throw new MicrophoneError(reason, `Microphone unavailable (${name})`);
    }
    const ctx = new AudioContext();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 1200;
    const filtered = ctx.createAnalyser();
    filtered.fftSize = 1024;
    const spectrum = ctx.createAnalyser();
    spectrum.fftSize = 1024;
    spectrum.smoothingTimeConstant = 0;
    source.connect(highpass).connect(filtered);
    source.connect(spectrum);

    // ScriptProcessorNode is deprecated but simple; an AudioWorklet is the long-term replacement.
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute).connect(ctx.destination);
    this.ring = new Float32Array(Math.ceil(ctx.sampleRate * 1.6));
    this.writeIndex = 0;
    processor.onaudioprocess = (ev) => {
      const data = ev.inputBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        this.ring[this.writeIndex] = data[i];
        this.writeIndex = (this.writeIndex + 1) % this.ring.length;
      }
    };
    Object.assign(this, { ctx, stream, processor, highpass: filtered, spectrum });
    this.timeBuf = new Float32Array(filtered.fftSize);
    this.freqBuf = new Float32Array(spectrum.frequencyBinCount);
    this.frame = this.createFrame(ctx, spectrum);
  }

  stop(): void {
    if (this.processor) this.processor.onaudioprocess = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = this.stream = this.processor = this.highpass = this.spectrum = this.frame = null;
  }

  /** Fills and returns the shared frame; valid until the next call. */
  readFrame(): AudioFrame | null {
    if (!this.frame || !this.highpass || !this.spectrum) return null;
    this.highpass.getFloatTimeDomainData(this.timeBuf);
    this.spectrum.getFloatFrequencyData(this.freqBuf);
    return this.frame;
  }

  private createFrame(ctx: AudioContext, spectrum: AnalyserNode): AudioFrame {
    return {
      sampleRate: ctx.sampleRate,
      fftSize: spectrum.fftSize,
      highpassed: this.timeBuf,
      spectrumDb: this.freqBuf,
      recent16k: () => this.resampleRecent(ctx.sampleRate),
    };
  }

  private resampleRecent(sampleRate: number): Float32Array {
    const out = new Float32Array(YAMNET_SAMPLES);
    const len = this.ring.length;
    const span = Math.round((YAMNET_SAMPLES * sampleRate) / 16_000);
    for (let i = 0; i < YAMNET_SAMPLES; i++) {
      const pos = (this.writeIndex - span + (i * span) / YAMNET_SAMPLES + len * 2) % len;
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      out[i] = this.ring[i0 % len] * (1 - frac) + this.ring[(i0 + 1) % len] * frac;
    }
    return out;
  }
}
