/**
 * Countdown phrases, in the languages offered. Kept separate from the countdown timing so the
 * sequence can be tested and reasoned about without a browser, and so adding a language is one
 * entry here rather than a change spread across the app.
 *
 * English is listed first because it is the default and the one speech is most reliable in.
 */

export const COUNTDOWN_PHRASES = {
  en: { three: 'three', two: 'two', one: 'one', launch: 'launch', hold: 'holding' },
  es: { three: 'tres', two: 'dos', one: 'uno', launch: 'lanzamiento', hold: 'esperando' },
  fr: { three: 'trois', two: 'deux', one: 'un', launch: 'lancement', hold: 'attente' },
  de: { three: 'drei', two: 'zwei', one: 'eins', launch: 'start', hold: 'warte' },
  it: { three: 'tre', two: 'due', one: 'uno', launch: 'lancio', hold: 'attesa' },
  ja: { three: 'さん', two: 'に', one: 'いち', launch: 'かいし', hold: 'まちます' },
  zh: { three: '三', two: '二', one: '一', launch: '发射', hold: '准备' },
  ru: { three: 'три', two: 'два', one: 'раз', launch: 'пуск', hold: 'ожидание' },
} as const satisfies Record<string, Record<CountdownKey, string>>;

export type CountdownKey = 'three' | 'two' | 'one' | 'launch' | 'hold';

export type LanguageId = keyof typeof COUNTDOWN_PHRASES;

export const LANGUAGE_IDS = Object.keys(COUNTDOWN_PHRASES) as LanguageId[];

/** Human-readable names for the picker, rather than showing bare locale codes. */
export const LANGUAGE_LABELS: Record<LanguageId, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ja: '日本語',
  zh: '中文',
  ru: 'Русский',
};

/** BCP 47 tags the speech API wants, which are not the same as our own ids. */
export const SPEECH_LOCALES: Record<LanguageId, string> = {
  en: 'en-GB',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  ja: 'ja-JP',
  zh: 'zh-CN',
  ru: 'ru-RU',
};

/** The phrase for a step, falling back to English for anything we have no string for. */
export function phrase(key: CountdownKey, language: LanguageId): string {
  return COUNTDOWN_PHRASES[language]?.[key] ?? COUNTDOWN_PHRASES.en[key];
}
