// The finder kit's translator slot: the catalog's words, and so both searches and the ranker, are
// English. An ask written in another script (Russian, Korean, Chinese, Arabic...) is translated to
// English first, by whatever fills the slot, and the English is what narrows and ranks. A caller
// with no translator, an English ask, and a translator that fails or runs out of time all leave the
// ask as typed: translating can only help, never stop a search.
//
// A different script is known from the ask's letters, which needs no library. Latin-script
// languages (Spanish, German, French...) look English to every local check, so with a language
// detector (language-detector.ts) an ask that isn't made of the catalog's own English words is put
// to it, and translated unless it says English; without one they pass untranslated.

import { inVocabulary, type LanguageDetector } from "./language-detector.ts";

/** Turns an ask into English, keeping the game's own terms (Zerg, doodad, ids) as they are. */
export interface Translator {
  translate(ask: string, options?: { readonly signal?: AbortSignal }): Promise<string>;
}

/** Whether the ask has a letter outside the Latin script: Cyrillic, Hangul, Han, Kana, Greek, Arabic... */
export const needsTranslation = (ask: string): boolean => /(?!\p{Script=Latin})\p{L}/u.test(ask);

/** How long a translator gets, in milliseconds, before the ask is searched as typed. */
export const TRANSLATE_TIMEOUT_MS = 3000;

export type Translation = {
  /** The ask as typed. */
  readonly original: string;
  /** The ask the searches ran on: the translation, or the original when it was English or couldn't be translated. */
  readonly english: string;
  /** Whether `english` is a translation: false when the detector called the ask English, or the translator failed. */
  readonly translated: boolean;
  /** Milliseconds the detector and the translator took, including a failed or timed-out call. */
  readonly ms: number;
  /** What the detector said, when it was asked. */
  readonly detection?: { readonly english: boolean; readonly pEnglish: number; readonly cost: number } | { readonly error: string };
  /** Why the ask was left as typed, when the translator failed. */
  readonly error?: string;
};

export type TranslateOptions = {
  /** How long each of the detector and the translator gets, in milliseconds. */
  readonly timeout?: number;
  /** Decides, for a Latin-script ask the vocabulary doesn't cover, whether it is English. None: such asks aren't translated. */
  readonly detector?: LanguageDetector | undefined;
  /** The catalog's English words: an ask made of them is English with no detector call. */
  readonly vocabulary?: ReadonlySet<string> | undefined;
};

/**
 * The ask in English, when it needs translating and a translator is given; else undefined, with the
 * translator not called. An ask needs translating when it has letters outside the Latin script, or
 * is Latin script the vocabulary doesn't cover and the detector doesn't call English (a detector
 * that fails counts as not English). When the detector was asked and called it English, the result
 * says so and the ask stands. A translator that throws, times out or answers nothing leaves the ask
 * as typed, with the reason in `error`.
 */
export async function translateAsk(ask: string, translator: Translator | undefined, { timeout = TRANSLATE_TIMEOUT_MS, detector, vocabulary }: TranslateOptions = {}): Promise<Translation | undefined> {
  if (!translator) return undefined;
  const started = performance.now();
  const took = () => performance.now() - started;
  let detection: Translation["detection"];
  if (!needsTranslation(ask)) {
    if (!detector || /^[^\p{L}]*$/u.test(ask) || (vocabulary && inVocabulary(ask, vocabulary))) return undefined;
    try {
      detection = await detector.detect(ask, { signal: AbortSignal.timeout(timeout) });
      if (detection.english) return { original: ask, english: ask, translated: false, ms: took(), detection };
    } catch (error) {
      detection = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  try {
    const english = (await translator.translate(ask, { signal: AbortSignal.timeout(timeout) })).trim();
    if (!english) return { original: ask, english: ask, translated: false, ms: took(), ...(detection ? { detection } : {}), error: "the translator answered nothing" };
    return { original: ask, english, translated: true, ms: took(), ...(detection ? { detection } : {}) };
  } catch (error) {
    return { original: ask, english: ask, translated: false, ms: took(), ...(detection ? { detection } : {}), error: error instanceof Error ? error.message : String(error) };
  }
}
