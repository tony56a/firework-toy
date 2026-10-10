/**
 * Countdown phrases, in the languages offered. Kept separate from the countdown timing so the
 * sequence can be tested and reasoned about without a browser, and so adding a language is one
 * entry here rather than a change spread across the app.
 *
 * English is listed first because it is the default and the one speech is most reliable in.
 *
 * Each language needs a word for every number the countdown can reach. That is not implied by the
 * other entries: several languages, Japanese especially, change form as the count rises, so a
 * language with only one to three cannot be counted up to ten.
 */

export const COUNTDOWN_PHRASES = {
  en: { one: 'one', two: 'two', three: 'three', four: 'four', five: 'five', six: 'six', seven: 'seven', eight: 'eight', nine: 'nine', ten: 'ten', launch: 'launch', hold: 'holding' },
  es: { one: 'uno', two: 'dos', three: 'tres', four: 'cuatro', five: 'cinco', six: 'seis', seven: 'siete', eight: 'ocho', nine: 'nueve', ten: 'diez', launch: 'lanzamiento', hold: 'esperando' },
  fr: { one: 'un', two: 'deux', three: 'trois', four: 'quatre', five: 'cinq', six: 'six', seven: 'sept', eight: 'huit', nine: 'neuf', ten: 'dix', launch: 'lancement', hold: 'attente' },
  de: { one: 'eins', two: 'zwei', three: 'drei', four: 'vier', five: 'fünf', six: 'sechs', seven: 'sieben', eight: 'acht', nine: 'neun', ten: 'zehn', launch: 'start', hold: 'warte' },
  it: { one: 'uno', two: 'due', three: 'tre', four: 'quattro', five: 'cinque', six: 'sei', seven: 'sette', eight: 'otto', nine: 'nove', ten: 'dieci', launch: 'lancio', hold: 'attesa' },
  ja: { one: 'いち', two: 'に', three: 'さん', four: 'よん', five: 'ご', six: 'ろく', seven: 'なな', eight: 'はち', nine: 'きゅう', ten: 'じゅう', launch: 'かいし', hold: 'まちます' },
  zh: { one: '一', two: '二', three: '三', four: '四', five: '五', six: '六', seven: '七', eight: '八', nine: '九', ten: '十', launch: '发射', hold: '准备' },
  // Russian counts down with "раз" for one, as in a launch sequence, rather than "один".
  ru: { one: 'раз', two: 'два', three: 'три', four: 'четыре', five: 'пять', six: 'шесть', seven: 'семь', eight: 'восемь', nine: 'девять', ten: 'десять', launch: 'пуск', hold: 'ожидание' },
} as const satisfies Record<string, Record<CountdownKey, string>>;

/** A number the count can say, or one of the two spoken cues around it. */
export type CountdownKey =
  | 'one' | 'two' | 'three' | 'four' | 'five' | 'six' | 'seven' | 'eight' | 'nine' | 'ten'
  | 'launch' | 'hold';

/** The number keys, counting up from one, so index + 1 is the number itself. */
export const NUMBER_KEYS = [
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
] as const satisfies ReadonlyArray<CountdownKey>;

export type NumberKey = (typeof NUMBER_KEYS)[number];

/** The key for a given number, or null if the count cannot be reached. */
export function numberKey(n: number): NumberKey | null {
  return n >= 1 && n <= NUMBER_KEYS.length ? NUMBER_KEYS[n - 1] : null;
}

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
