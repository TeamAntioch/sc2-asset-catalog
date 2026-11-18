// The finder kit's language detector slot. An ask in another script is known by its letters
// (translator.ts); one in Latin script (Spanish, German, French, Portuguese, Polish...) is not, and
// reads as English to every local check. A detector says whether an ask is English, and only asks
// that look English to the catalog's own vocabulary and aren't already known to be are put to it,
// so an English ask costs no call. It is a tiebreaker, never a gate: a detector that fails or
// can't tell leaves the ask to be translated, since translating English leaves it as it was and
// not translating a foreign ask loses its results.

export type Detection = {
  readonly english: boolean;
  /** The detector's probability that the ask is English, 0 to 1. */
  readonly pEnglish: number;
  /** US dollars, estimated, for a spend cap. */
  readonly cost: number;
};

export interface LanguageDetector {
  detect(ask: string, options?: { readonly signal?: AbortSignal }): Promise<Detection>;
}

/** At or above this probability an ask is English; below it, it is translated. High, so a doubtful ask is translated. */
export const ENGLISH_AT = 0.8;

const wordsOf = (text: string): string[] => text.toLowerCase().match(/\p{L}+/gu) ?? [];

/** The words of the cards' English text, lower-cased: what an English ask in this catalog is made of. */
export function vocabularyOf(texts: Iterable<string>): Set<string> {
  const vocabulary = new Set<string>();
  for (const text of texts) for (const word of wordsOf(text)) vocabulary.add(word);
  return vocabulary;
}

/** Whether a word, or its singular, is one of the vocabulary's. */
const known = (word: string, vocabulary: ReadonlySet<string>): boolean =>
  vocabulary.has(word) || (word.endsWith("ies") && vocabulary.has(`${word.slice(0, -3)}y`)) || (word.endsWith("es") && vocabulary.has(word.slice(0, -2))) || (word.endsWith("s") && vocabulary.has(word.slice(0, -1)));

/** Whether every word of the ask is in the vocabulary, in some plural: an ask that is English with no call needed. */
export const inVocabulary = (ask: string, vocabulary: ReadonlySet<string>): boolean => wordsOf(ask).every((word) => known(word, vocabulary));

/** Remembers each ask's detection (up to `max`, the oldest forgotten first), so an ask asked again costs no call and no cost. A failure is not remembered. */
export function cachingDetector(inner: LanguageDetector, max = 500): LanguageDetector {
  const seen = new Map<string, Detection>();
  return {
    async detect(ask, options) {
      const again = seen.get(ask);
      if (again) return { ...again, cost: 0 };
      const detection = await inner.detect(ask, options);
      seen.set(ask, detection);
      if (seen.size > max) seen.delete(seen.keys().next().value!);
      return detection;
    },
  };
}
