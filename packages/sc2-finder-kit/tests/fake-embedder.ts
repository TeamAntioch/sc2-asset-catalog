// A stand-in for the embeddings model: each word hashed into one of 64 dimensions, so texts that
// share words lie close. It records what it was asked to embed.
import type { Embedder } from "../src/embedder.ts";

export type FakeEmbedder = Embedder & { readonly calls: string[][] };

const DIMENSIONS = 64;

const hash = (word: string): number => {
  let h = 2166136261;
  for (const char of word) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return (h >>> 0) % DIMENSIONS;
};

/** Words that mean one thing, as a real model would place them: "cover" near sandbags and crates. */
export const DOODAD_SYNONYMS: Readonly<Record<string, string>> = { cover: "sacks", hide: "sacks", behind: "sacks" };

/**
 * The finders' tests share this one (the Doodad and Music Finders' import it from here: tests
 * aren't in any published package). `synonyms` maps a word to the word it should land beside.
 */
export function fakeEmbedder(model = "fake-model", synonyms: Readonly<Record<string, string>> = DOODAD_SYNONYMS): FakeEmbedder {
  const calls: string[][] = [];
  return {
    model,
    calls,
    async embed(texts) {
      calls.push([...texts]);
      return texts.map((text) => {
        const vector = new Float32Array(DIMENSIONS);
        for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) vector[hash(synonyms[word] ?? word)]! += 1;
        const norm = Math.hypot(...vector) || 1;
        return vector.map((value) => value / norm);
      });
    },
  };
}
