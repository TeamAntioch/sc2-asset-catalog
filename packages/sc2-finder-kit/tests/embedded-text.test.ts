// What the embeddings model reads of a card (src/card.ts `embeddedText`): its `embedText`, else its `text`.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { embeddedText, type FinderCard } from "../src/card.ts";
import { EmbeddingIndex } from "../src/embedding-index.ts";
import { fakeEmbedder } from "./fake-embedder.ts";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

const named: FinderCard = { id: "A", name: "A", text: "A (a word)\nslow strings", embedText: "slow strings" };
const plain: FinderCard = { id: "B", name: "B", text: "B\nbright horns" };

describe("embeddedText", () => {
  it("is the embedText when a card has one, else its text", () => {
    expect(embeddedText(named)).toBe("slow strings");
    expect(embeddedText(plain)).toBe("B\nbright horns");
  });
});

describe("the embedding index", () => {
  it("embeds each card's embeddedText, so cards that differ only in text the model doesn't read share one vector", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "embedded-text-"));
    const embedder = fakeEmbedder();
    const index = await EmbeddingIndex.open(embedder, path.join(dir, "vectors.bin"));
    const twin: FinderCard = { id: "C", name: "C", text: "C (other words)\nslow strings", embedText: "slow strings" };
    const { embedded } = await index.update([named, twin, plain]);
    expect(embedder.calls.flat().sort()).toEqual(["B\nbright horns", "slow strings"]);
    expect(embedded).toBe(3); // counted in cards, as the index says
  });
});
