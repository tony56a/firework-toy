import { SPEECH_LOCALES, type LanguageId } from '../models/countdownPhrases';

/**
 * Speaks the countdown using the browser's own speech synthesis, so there is nothing to install and
 * no audio leaves the machine.
 *
 * Two things make this less straightforward than it looks. Voice lists load asynchronously, so
 * `getVoices()` is often empty on the first call and only fills in after a `voiceschanged` event.
 * And availability varies wildly: headless Chrome has the API but no voices, and a Linux box may
 * have none at all. Every path here therefore treats speech as optional, because a countdown with
 * no voice is still a working countdown.
 */
export class Speech {
  private readonly synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  private voices: SpeechSynthesisVoice[] = [];
  /** The last phrase spoken, kept so a repeated phrase is not cut off mid-word. */
  private last = '';

  constructor() {
    if (!this.synth) return;
    this.loadVoices();
    // Chrome populates the list asynchronously; without this the first launch would be silent.
    this.synth.addEventListener?.('voiceschanged', () => this.loadVoices());
  }

  /** Whether anything can actually be spoken right now. */
  get available(): boolean {
    return this.synth !== undefined && this.voices.length > 0;
  }

  /** The voices the browser offers for a language, for showing in the UI or for diagnostics. */
  voicesFor(language: LanguageId): SpeechSynthesisVoice[] {
    const tag = SPEECH_LOCALES[language];
    return this.voices.filter((v) => v.lang.toLowerCase().startsWith(tag.slice(0, 2).toLowerCase()));
  }

  /** Speaks `text`, cancelling anything already in progress. A no-op where speech is unavailable. */
  speak(text: string, language: LanguageId, rate = 1): void {
    if (!this.synth || !text) return;
    // Repeating the same phrase does not restart cleanly, so nudge it to force a new utterance.
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text === this.last ? `${text} ` : text);
    utterance.lang = SPEECH_LOCALES[language];
    utterance.rate = rate;
    const match = this.voicesFor(language)[0];
    if (match) utterance.voice = match;
    this.last = text;
    this.synth.speak(utterance);
  }

  /** Stops anything in flight, used when a launch is aborted or the scene is swapped. */
  cancel(): void {
    this.synth?.cancel();
  }

  private loadVoices(): void {
    if (!this.synth) return;
    const loaded = this.synth.getVoices();
    // Some browsers return [] until voiceschanged; keep whatever we already had rather than
    // discarding a working list.
    if (loaded.length > 0) this.voices = loaded;
  }
}
