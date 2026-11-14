// A stand-in for the embeddings model: each word hashed into one of 64 dimensions, so texts that
// share words lie close. It records what it was asked to embed.
import type { Embedder } from "@team-antioch/sc2-finder-kit/embedder.js";

export type FakeEmbedder = Embedder & { readonly calls: string[][] };

const DIMENSIONS = 64;

const hash = (word: string): number => {
  let h = 2166136261;
  for (const char of word) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return (h >>> 0) % DIMENSIONS;
};

/** Words that mean one thing, as a real model would place them: "eerie" near "tense". */
const SYNONYMS: Record<string, string> = { eerie: "tense", creepy: "tense", dread: "tense" };

export function fakeEmbedder(model = "fake-model"): FakeEmbedder {
  const calls: string[][] = [];
  return {
    model,
    calls,
    async embed(texts) {
      calls.push([...texts]);
      return texts.map((text) => {
        const vector = new Float32Array(DIMENSIONS);
        for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) vector[hash(SYNONYMS[word] ?? word)]! += 1;
        const norm = Math.hypot(...vector) || 1;
        return vector.map((value) => value / norm);
      });
    },
  };
}
