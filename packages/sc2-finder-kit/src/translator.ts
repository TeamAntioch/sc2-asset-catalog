// The finder kit's translator slot: the catalog's words, and so both searches and the ranker, are
// English. An ask written in another script (Russian, Korean, Chinese, Arabic...) is translated to
// English first, by whatever fills the slot, and the English is what narrows and ranks. A caller
// with no translator, an English ask, and a translator that fails or runs out of time all leave the
// ask as typed: translating can only help, never stop a search.
//
// Only a different script is detected, which needs no library and can't mistake English for
// anything else. Latin-script languages (Spanish, German...) pass untranslated until a detector
// for them is worth adding.

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
  /** The ask the searches ran on: the translation, or the original when it couldn't be translated. */
  readonly english: string;
  /** Milliseconds the translator took, including a failed or timed-out call. */
  readonly ms: number;
  /** Why the ask was left as typed, when the translator failed. */
  readonly error?: string;
};

/**
 * The ask in English, when it needs translating and a translator is given; else undefined, with the
 * translator not called. A translator that throws, times out or answers nothing leaves the ask as
 * typed, with the reason in `error`.
 */
export async function translateAsk(ask: string, translator: Translator | undefined, { timeout = TRANSLATE_TIMEOUT_MS }: { readonly timeout?: number } = {}): Promise<Translation | undefined> {
  if (!translator || !needsTranslation(ask)) return undefined;
  const started = performance.now();
  try {
    const english = (await translator.translate(ask, { signal: AbortSignal.timeout(timeout) })).trim();
    if (!english) return { original: ask, english: ask, ms: performance.now() - started, error: "the translator answered nothing" };
    return { original: ask, english, ms: performance.now() - started };
  } catch (error) {
    return { original: ask, english: ask, ms: performance.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}
