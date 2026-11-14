// The Doodad Finder's narrowing over its sources (src/finder.ts): cards embedded on opening, an ask
// narrowed by keywords and embeddings, and a changed Doodad Use re-embedded when its file changes.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { jevRankBudget } from "@team-antioch/sc2-finder-kit/jev-ranker.js";
import { afterEach, describe, expect, it } from "vitest";

import { type Finder, openFinder } from "../src/finder.ts";
import { fakeEmbedder } from "./fake-embedder.ts";
import { sources, VOID_CAMPAIGN } from "./fixtures.ts";
import { JEV_WORDING } from "../src/wording.ts";

let dir: string | undefined;
let finder: Finder | undefined;
afterEach(async () => {
  finder?.close();
  finder = undefined;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});
const tempDir = async () => (dir ??= await mkdtemp(path.join(tmpdir(), "doodad-finder-")));
const ids = (found: { candidates: readonly { id: string }[] }) => found.candidates.map(({ id }) => id);

describe("openFinder", () => {
  it("narrows an ask by its words and by meaning: 'cover' finds the sandbags, which share no word with it", async () => {
    finder = await openFinder({ load: async () => sources(), embedder: fakeEmbedder(), cacheFile: path.join(await tempDir(), "vectors.bin") });
    const found = await finder.narrow("a press head");
    expect(ids(found)[0]).toBe("FoundryStamperHead");
    expect(found.candidates.find(({ id }) => id === "FoundryStamperHead")).toMatchObject({ keyword: 1 });
    const cover = await finder.narrow("something to take cover behind");
    expect(cover.candidates.find(({ id }) => id === "Sandbags")).toMatchObject({ embeddings: 1 });
    expect(cover.candidates.find(({ id }) => id === "Sandbags")).not.toHaveProperty("keyword");
    expect(cover.timings.total).toBeGreaterThanOrEqual(0);
  });

  it("marks for a map what its dependencies provide", async () => {
    finder = await openFinder({ load: async () => sources(), embedder: fakeEmbedder(), cacheFile: path.join(await tempDir(), "vectors.bin") });
    const found = await finder.narrow("steel", { dependencies: [VOID_CAMPAIGN] });
    expect(found.candidates.find(({ id }) => id === "FoundryStamperHead")!.card.provided).toBe(true);
    expect(found.candidates.find(({ id }) => id === "SupplyCrate")!.card.provided).toBe(false);
  });

  it("takes each search's hundred with the map's provided matches first, after its pinned tags filter, and gives at most 200", async () => {
    // 300 crates the map has, matching one word; one it lacks matching two, and one in the Char tileset sorting last.
    const crates = Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [`Crate${String(i).padStart(3, "0")}`, { name: `Crate ${i}`, package: "mods/liberty.sc2mod", variations: 1, description: { look: "crate", kind: "built" as const, size: "small" as const, role: "prop" as const, story: [], biome: ["any"] } }]),
    );
    const doodads = {
      ...crates,
      VoidStoryCrate: { name: "Void Story Crate", package: "campaigns/voidstory.sc2campaign", variations: 1, description: { look: "steel crate", kind: "built" as const, size: "small" as const, role: "prop" as const, story: [], biome: ["any"] } },
      ZCharCrate: { name: "Z Char Crate", package: "mods/liberty.sc2mod", variations: 1, tilesets: ["Char"], description: { look: "crate", kind: "built" as const, size: "small" as const, role: "prop" as const, story: [], biome: ["any"] } },
    };
    finder = await openFinder({ load: async () => sources({ doodads, terrainObjects: {} }), embedder: fakeEmbedder(), cacheFile: path.join(await tempDir(), "vectors.bin") });
    const steel = await finder.narrow("steel crate", { dependencies: [VOID_CAMPAIGN] });
    // Nearly every crate is provided, and the cap still holds.
    expect(steel.candidates.length).toBeLessThanOrEqual(200);
    expect(steel.candidates.every(({ card }) => card.provided)).toBe(true);
    expect(steel.candidates.filter(({ keyword }) => keyword !== undefined)).toHaveLength(100);
    // Without a map's dependencies, the two-word match comes first.
    const plain = await finder.narrow("steel crate");
    expect(plain.candidates.find(({ id }) => id === "VoidStoryCrate")).toMatchObject({ keyword: 1 });
    const char = await finder.narrow("crate", { tags: [{ facet: "tileset", value: "Char", pinned: true }] });
    expect(ids(char)).toEqual(["ZCharCrate"]);
  });

  it("re-embeds within a second the one card whose Doodad Use changed in a watched file", async () => {
    const usesFile = path.join(await tempDir(), "uses.json");
    await writeFile(usesFile, "[]");
    const load = async () => sources({ notes: { SupplyCrate: { uses: (JSON.parse(await readFile(usesFile, "utf8")) as string[]).map((use) => ({ use })) } } });
    const embedder = fakeEmbedder();
    const reloads: number[] = [];
    finder = await openFinder({ load, embedder, cacheFile: path.join(await tempDir(), "vectors.bin"), watch: [usesFile], onReload: ({ embedded }) => reloads.push(embedded) });
    embedder.calls.length = 0;
    const changedAt = Date.now();
    await writeFile(usesFile, JSON.stringify(["hiding spot on a catwalk"]));
    await expect.poll(() => reloads.length, { timeout: 1000, interval: 20 }).toBeGreaterThan(0);
    expect(Date.now() - changedAt).toBeLessThan(1000);
    expect(reloads).toEqual([1]);
    expect(embedder.calls.flat()).toEqual([expect.stringContaining("used as: hiding spot on a catwalk")]);
    expect(ids(await finder.narrow("catwalk hiding spot"))[0]).toBe("SupplyCrate");
  });
});

describe("the Doodad Finder's rank budget", () => {
  it("never bites at the default 200: 200 cards of the longest real card text (337 characters) cost less than Jev's budget", () => {
    const budget = jevRankBudget(JEV_WORDING);
    const longest = { id: "Longest", name: "Longest", text: "x".repeat(337) };
    expect(200 * budget.cost(longest)).toBeLessThan(budget.limit);
  });
});
