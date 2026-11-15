// The Music Finder's narrowing (src/finder.ts) with a fake embeddings model: the keyword search and
// the nearest cards merged, the filters as pinned tags, and the default that hides what a map can't play.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fitToBudget, type Narrowed } from "@team-antioch/sc2-finder-kit/narrow.js";

import { type Finder, MUSIC_RANK_BUDGET, musicVectorCacheFile, openFinder } from "../src/finder.ts";
import { fakeEmbedder } from "./fake-embedder.ts";
import { SOURCES } from "./fixtures.ts";

let dir: string;
let finder: Finder | undefined;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "music-finder-"));
});
afterEach(async () => {
  finder?.close();
  finder = undefined;
  await rm(dir, { recursive: true, force: true });
});

const open = async () => (finder = await openFinder({ load: async () => SOURCES, embedder: fakeEmbedder(), cacheFile: path.join(dir, "vectors.bin"), watch: [] }));
const pin = (facet: string, value: string) => ({ facet, value, pinned: true });
const ids = async (ask: string, tags: Parameters<Finder["narrow"]>[1] = {}) => (await finder!.narrow(ask, tags)).candidates.map(({ id }) => id);

describe("narrowing", () => {
  it("finds the track by its words and by its meaning", async () => {
    await open();
    expect((await ids("tense approach"))[0]).toBe("TenseApproach");
    // The fake model puts eerie near tense: no word of the ask is in the card.
    const found = (await finder!.narrow("eerie")).candidates.find(({ id }) => id === "TenseApproach");
    expect(found?.embeddings).toBeDefined();
    expect(found?.keyword).toBeUndefined();
  });

  it("hides the silent, unplayable and map-local ids by default, and shows them for show: everything", async () => {
    await open();
    expect(await ids("marching patrol silent nothing plays")).not.toContain("MapOnlyTrack");
    expect(await ids("marching patrol silent nothing plays")).not.toContain("SilentTrack");
    const all = await ids("marching patrol silent nothing plays", { tags: [pin("show", "everything")] });
    expect(all).toContain("MapOnlyTrack");
    expect(all).toContain("SilentTrack");
  });

  it("filters by a pinned rating, kind and length, on both searches", async () => {
    await open();
    const calm = await ids("music", { tags: [pin("energy", "1-2")] });
    expect(calm).toContain("CalmAmbient");
    expect(calm).not.toContain("HeroicVictory");
    const stingers = await ids("music", { tags: [pin("kind", "stinger")] });
    expect(stingers).toEqual(["HeroicVictory"]);
    const long = await ids("music", { tags: [pin("length", "100-")] });
    expect(long).toEqual(["CalmAmbient"]);
  });

  it("drops what the map's dependencies don't bring, and keeps what they do", async () => {
    await open();
    expect(await ids("calm drone chimes", { tags: [pin("map has", "Nova Covert Ops (Art Mod)")] })).not.toContain("CalmAmbient");
    expect(await ids("calm drone chimes", { tags: [pin("map has", "Void (Campaign)")] })).toContain("CalmAmbient");
  });

  it("raises what an unpinned tag matches", async () => {
    await open();
    const plain = await ids("music");
    const raised = await ids("music", { tags: [{ facet: "kind", value: "stinger" }] });
    expect(raised.indexOf("HeroicVictory")).toBeLessThanOrEqual(plain.indexOf("HeroicVictory"));
  });

  it("keeps its vectors apart from the Doodad Finder's", () => {
    expect(path.basename(musicVectorCacheFile("Xenova/gte-small", dir))).toBe("music-vectors-Xenova_gte-small.bin");
  });

  it("serves a Sound with its Soundtrack's id as its own card", async () => {
    await open();
    expect(finder!.cards.get("Dual (Sound)")?.entry.kind).toBe("Sound");
    expect(finder!.cards.get("Dual")?.entry.kind).toBe("Soundtrack");
  });
});

describe("the rank budget", () => {
  const longCard = (i: number) => ({ id: `Track${i}`, name: `Track ${i}`, text: "x".repeat(640) });

  it("is Jev's, counted for the music's wording, and cuts a 198-candidate ask, which Jev refused, to one that fits", () => {
    expect(MUSIC_RANK_BUDGET.limit).toBe(55_000);
    const all: Narrowed[] = Array.from({ length: 198 }, (_, i) => ({ id: `Track${i}`, card: longCard(i), score: 1 - i / 1000 }));
    const before = all.reduce((total, { card }) => total + MUSIC_RANK_BUDGET.cost(card as never), 0);
    expect(before).toBeGreaterThan(MUSIC_RANK_BUDGET.limit);
    const { kept, cut, cost } = fitToBudget(all as never, MUSIC_RANK_BUDGET as never);
    expect(cost).toBeLessThanOrEqual(MUSIC_RANK_BUDGET.limit);
    expect(kept.length + cut).toBe(198);
    expect(cut).toBeGreaterThan(0);
  });

  it("cuts an ask's candidates to the budget it was opened with, says how many, and leaves a short ask whole", async () => {
    const said: { kept: number; cut: number }[] = [];
    finder = await openFinder({ load: async () => SOURCES, embedder: fakeEmbedder(), cacheFile: path.join(dir, "vectors.bin"), watch: [], rankBudget: { limit: 2, cost: () => 1 }, onCut: (cut) => said.push(cut) });
    const found = await finder.narrow("music");
    expect(found.candidates).toHaveLength(2);
    expect(found.cut).toBeGreaterThan(0);
    expect(said).toEqual([{ kept: 2, cut: found.cut }]);
    finder.close();
    finder = await openFinder({ load: async () => SOURCES, embedder: fakeEmbedder(), cacheFile: path.join(dir, "vectors2.bin"), watch: [], onCut: (cut) => said.push(cut) });
    expect((await finder.narrow("music")).cut).toBe(0);
    expect(said).toHaveLength(1);
  });
});
