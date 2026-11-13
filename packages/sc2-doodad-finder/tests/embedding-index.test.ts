// The Doodad Finder's embeddings of its cards (src/embedding-index.ts) and their cache, with a fake model.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { candidateCards } from "../src/cards.ts";
import { EmbeddingIndex } from "../src/embedding-index.ts";
import { fakeEmbedder } from "./fake-embedder.ts";
import { sources } from "./fixtures.ts";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});
const cacheFile = async () => path.join((dir ??= await mkdtemp(path.join(tmpdir(), "doodad-finder-"))), "vectors.bin");

describe("EmbeddingIndex", () => {
  it("finds the cards nearest an ask, nearest first", async () => {
    const embedder = fakeEmbedder();
    const index = await EmbeddingIndex.open(embedder, await cacheFile());
    await index.update(candidateCards(sources()));
    const [ask] = await embedder.embed(["something to take cover behind"], "query");
    expect(index.nearest(ask!, 1).map(({ id }) => id)).toEqual(["Sandbags"]);
    expect(index.nearest(ask!, 3)).toHaveLength(3);
  });

  it("gives each update's own nearest, which a later update doesn't change, so cards and their vectors swap together", async () => {
    const embedder = fakeEmbedder();
    const index = await EmbeddingIndex.open(embedder, await cacheFile());
    const cards = candidateCards(sources());
    const { nearest: before } = await index.update(cards);
    await index.update(cards.filter((card) => card.id !== "Sandbags"));
    const [ask] = await embedder.embed(["something to take cover behind"], "query");
    expect(before(ask!, 1).map(({ id }) => id)).toEqual(["Sandbags"]);
    expect(index.nearest(ask!, 1).map(({ id }) => id)).not.toEqual(["Sandbags"]);
  });

  it("embeds on a start only the cards whose text the cache hasn't seen, and on an update only the cards that changed", async () => {
    const file = await cacheFile();
    const cards = candidateCards(sources());
    const first = fakeEmbedder();
    await (await EmbeddingIndex.open(first, file)).update(cards);
    expect(first.calls.flat()).toHaveLength(cards.length);

    // A warm start: every card's vector is in the cache.
    const warm = fakeEmbedder();
    const index = await EmbeddingIndex.open(warm, file);
    expect(await index.update(cards)).toMatchObject({ embedded: 0 });
    expect(warm.calls).toEqual([]);

    // A Doodad Use added to one doodad changes its card alone.
    const changed = candidateCards(sources({ notes: { SupplyCrate: { uses: [{ use: "cover for a Marine on a catwalk" }] } } }));
    expect(await index.update(changed)).toMatchObject({ embedded: 1 });
    expect(warm.calls.flat()).toEqual([changed.find((card) => card.id === "SupplyCrate")!.text]);
  });

  it("counts the cards it embedded, not the texts, so two cards with one text both count", async () => {
    const embedder = fakeEmbedder();
    const index = await EmbeddingIndex.open(embedder, await cacheFile());
    const cards = candidateCards(sources());
    const twin = { ...cards[0]!, id: `${cards[0]!.id}Twin` };
    expect(await index.update([...cards, twin])).toMatchObject({ embedded: cards.length + 1 });
    expect(embedder.calls.flat()).toHaveLength(cards.length);
  });

  it("takes a cache file cut short as no cache, and embeds every card again", async () => {
    const file = await cacheFile();
    const cards = candidateCards(sources());
    await (await EmbeddingIndex.open(fakeEmbedder(), file)).update(cards);
    const bytes = await readFile(file);
    await writeFile(file, bytes.subarray(0, bytes.length - 64 * 4));
    const again = fakeEmbedder();
    expect(await (await EmbeddingIndex.open(again, file)).update(cards)).toMatchObject({ embedded: cards.length });
  });

  it("keeps the vectors of another model apart: a new model embeds every card again", async () => {
    const file = await cacheFile();
    const cards = candidateCards(sources());
    await (await EmbeddingIndex.open(fakeEmbedder("one"), file)).update(cards);
    const other = fakeEmbedder("two");
    expect(await (await EmbeddingIndex.open(other, file)).update(cards)).toMatchObject({ embedded: cards.length });
  });

  it("leaves out of nearest the cards a filter refuses", async () => {
    const embedder = fakeEmbedder();
    const index = await EmbeddingIndex.open(embedder, await cacheFile());
    await index.update(candidateCards(sources()));
    const [ask] = await embedder.embed(["take cover"], "query");
    expect(index.nearest(ask!, 1, (id) => id !== "Sandbags").map(({ id }) => id)).not.toContain("Sandbags");
  });
});
