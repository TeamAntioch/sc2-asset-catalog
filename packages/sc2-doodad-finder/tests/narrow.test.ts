// The Doodad Finder's narrowing (src/narrow.ts): the catalog's keyword search and the embeddings search,
// merged, over synthetic catalogs with a fake model.
import { describe, expect, it } from "vitest";

import { candidateCards } from "../src/cards.ts";
import { mergeNarrowing, providedFirst } from "../src/narrow.ts";
import { sources, VOID_CAMPAIGN } from "./fixtures.ts";

const cards = (dependencies?: readonly string[]) => new Map(candidateCards(sources(), dependencies).map((card) => [card.id, card]));
const ids = (merged: readonly { id: string }[]) => merged.map(({ id }) => id);
const neighbours = (...list: string[]) => list.map((id, i) => ({ id, similarity: 1 - i / 10 }));
const keywords = (...list: [string, number][]) => list.map(([id, score]) => ({ id, score }));

describe("providedFirst", () => {
  it("puts a search's matches the map's dependencies provide ahead of the rest, each in its order, and takes the first n", () => {
    const forMap = cards([VOID_CAMPAIGN]);
    const matches = keywords(["SupplyCrate", 3], ["FoundryStamperHead", 1], ["Sandbags", 3], ["FoundryPressFrame", 1]);
    expect(ids(providedFirst(matches, forMap, 3))).toEqual(["FoundryStamperHead", "FoundryPressFrame", "SupplyCrate"]);
    // Without a map's dependencies nothing is provided: the search's own order.
    expect(ids(providedFirst(matches, cards(), 3))).toEqual(["SupplyCrate", "FoundryStamperHead", "Sandbags"]);
  });
});

describe("mergeNarrowing", () => {
  it("merges the keyword and embeddings results without duplicates, the ones both found first", () => {
    const merged = mergeNarrowing(keywords(["FoundryStamperHead", 2], ["FoundryPressFrame", 1]), neighbours("SupplyCrate", "FoundryPressFrame", "Sandbags"), cards());
    expect(ids(merged)).toHaveLength(4);
    expect(new Set(ids(merged)).size).toBe(4);
    expect(ids(merged)[0]).toBe("FoundryPressFrame");
    expect(merged.find(({ id }) => id === "FoundryPressFrame")).toMatchObject({ keyword: 2, embeddings: 2 });
    expect(merged.find(({ id }) => id === "SupplyCrate")).toMatchObject({ embeddings: 1 });
    expect(merged.find(({ id }) => id === "SupplyCrate")).not.toHaveProperty("keyword");
  });

  it("places each list's results in the order its search gave them", () => {
    // A search with a map's dependencies gives the provided frame first though it matched fewer words.
    const merged = mergeNarrowing(keywords(["FoundryPressFrame", 1], ["FoundryStamperHead", 3]), [], cards());
    expect(ids(merged)).toEqual(["FoundryPressFrame", "FoundryStamperHead"]);
  });

  it("cuts to the limit, provided or not: being provided adds nothing to the merge", () => {
    // Void (Campaign) brings in the stamper head and the base mods' frame; the crates, sandbags and boulder need Void Story.
    const forMap = cards([VOID_CAMPAIGN]);
    const merged = mergeNarrowing(keywords(["FoundryStamperHead", 1], ["FoundryPressFrame", 1], ["SupplyCrate", 3]), neighbours("MossyBoulder"), forMap, { limit: 1 });
    expect(merged).toHaveLength(1);
  });

  it("raises the candidates a tag matches without dropping the rest, and keeps only those every pinned tag matches", () => {
    const keyword = keywords(["SupplyCrate", 1], ["FoundryPressFrame", 1], ["MossyBoulder", 1]);
    expect(ids(mergeNarrowing(keyword, [], cards()))).toEqual(["SupplyCrate", "FoundryPressFrame", "MossyBoulder"]);
    const raised = mergeNarrowing(keyword, [], cards(), { tags: [{ facet: "story", value: "wild" }] });
    expect(ids(raised)).toEqual(["MossyBoulder", "SupplyCrate", "FoundryPressFrame"]);
    const pinned = mergeNarrowing(keyword, [], cards(), { tags: [{ facet: "story", value: "industry", pinned: true }] });
    expect(ids(pinned)).toEqual(["FoundryPressFrame"]);
    // A tileset tag matches a doodad's tilesets.
    const tileset = mergeNarrowing(keywords(["SupplyCrate", 1], ["FoundryStamperHead", 1]), [], cards(), { tags: [{ facet: "tileset", value: "foundry", pinned: true }] });
    expect(ids(tileset)).toEqual(["FoundryStamperHead"]);
  });
});
