// The kit's stand-in for the embeddings model, with the synonyms the Music Finder's tests use.
import { fakeEmbedder as kitFakeEmbedder, type FakeEmbedder } from "../../sc2-finder-kit/tests/fake-embedder.ts";

export type { FakeEmbedder };

/** Words that mean one thing, as a real model would place them: "eerie" near "tense". */
const SYNONYMS: Readonly<Record<string, string>> = { eerie: "tense", creepy: "tense", dread: "tense" };

export const fakeEmbedder = (model = "fake-model"): FakeEmbedder => kitFakeEmbedder(model, SYNONYMS);
