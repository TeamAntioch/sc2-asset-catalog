// The kit's stand-in for the embeddings model, with the synonyms the Effect Finder's tests use.
import { fakeEmbedder as kitFakeEmbedder, type FakeEmbedder } from "../../sc2-finder-kit/tests/fake-embedder.ts";

export type { FakeEmbedder };

/** Words that mean one thing, as a real model would place them: "lightning" near sparks. */
const SYNONYMS: Readonly<Record<string, string>> = { lightning: "sparks", zap: "sparks", blaze: "flames", inferno: "flames" };

export const fakeEmbedder = (model = "fake-model"): FakeEmbedder => kitFakeEmbedder(model, SYNONYMS);
