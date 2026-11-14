// The kit's finder with toy cards: it narrows by what the finder's keyword search and embeddings
// give, honours the finder's tags and dependencies, and writes the cards again on a reload.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type Finder, openFinder } from "../src/finder.ts";
import { fakeEmbedder } from "./fake-embedder.ts";
import { type ToyCard, toyTagMatches, TOYS } from "./toy.ts";

let dir: string | undefined;
let open: Finder<ToyCard, readonly ToyCard[]> | undefined;
afterEach(async () => {
  open?.close();
  open = undefined;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

const start = async (cards: readonly ToyCard[] = TOYS) => {
  dir = await mkdtemp(path.join(tmpdir(), "finder-kit-"));
  let now = cards;
  const finder = await openFinder<ToyCard, readonly ToyCard[]>({
    load: async () => now,
    cards: (sources) => sources,
    keyword: (sources, ask) => {
      const words = ask.toLowerCase().match(/[a-z]+/g) ?? [];
      return sources.filter((card) => words.some((word) => card.text.toLowerCase().includes(word)));
    },
    tagMatches: toyTagMatches,
    provides: (dependencies, card) => card.dependency === undefined || dependencies.includes(card.dependency),
    embedder: fakeEmbedder(),
    cacheFile: path.join(dir, "vectors.bin"),
  });
  open = finder;
  return { finder, set: (next: readonly ToyCard[]) => void (now = next) };
};

describe("openFinder with toy cards", () => {
  it("embeds every card on a cold start and finds a card by the finder's keyword search", async () => {
    const { finder } = await start();
    expect(finder.embeddedOnOpen).toBe(TOYS.length);
    const { candidates } = await finder.narrow("hoop");
    expect(candidates[0]!.id).toBe("GreenRing");
  });

  it("keeps only the cards a pinned tag matches, by the finder's own tag rule", async () => {
    const { finder } = await start();
    const { candidates } = await finder.narrow("round", { tags: [{ facet: "colour", value: "red", pinned: true }] });
    expect(candidates.map(({ id }) => id).sort()).toEqual(["RedBall", "RedCube"]);
  });

  it("raises the cards an unpinned tag matches", async () => {
    const { finder } = await start();
    const plain = await finder.narrow("round");
    const raised = await finder.narrow("round", { tags: [{ facet: "colour", value: "blue" }] });
    expect(raised.candidates[0]!.id).toBe("BlueBall");
    expect(plain.candidates.map(({ id }) => id)).toContain("BlueBall");
  });

  it("marks the cards a map's dependencies provide, and takes them first", async () => {
    const { finder } = await start();
    const { candidates } = await finder.narrow("round", { dependencies: [] });
    expect(candidates.find(({ id }) => id === "RedCube")?.card.provided).toBe(false);
    expect(candidates.find(({ id }) => id === "BlueBall")?.card.provided).toBe(true);
    const withPack = await finder.narrow("round", { dependencies: ["Extra Pack"] });
    expect(withPack.candidates.find(({ id }) => id === "GreenRing")?.card.provided).toBe(true);
  });

  it("writes the cards again on a reload, embedding only the changed ones", async () => {
    const { finder, set } = await start();
    set([...TOYS, { id: "PinkCone", name: "Pink Cone", text: "Pink Cone\npointed and pink; colour: pink", colour: "pink" }]);
    expect(await finder.reload()).toEqual({ embedded: 1 });
    expect(finder.cards.has("PinkCone")).toBe(true);
  });
});
