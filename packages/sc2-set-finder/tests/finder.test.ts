// The Set Finder (src/finder.ts) with a fake embeddings model and fake rankers: the narrowing, the
// cut to 24, `find`'s ranking and its reasons for none, the spend cap, the answer shape, and the Jev
// request the sets' wording makes. No call reaches Jev.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { jevRanker, jevRequest } from "@team-antioch/sc2-finder-kit/jev-ranker.js";
import { type PayloadEntry, type Ranker, RankerError, type Ranking } from "@team-antioch/sc2-finder-kit/ranker.js";
import { spendCap } from "@team-antioch/sc2-finder-kit/spend-cap.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setAnswer } from "../src/answer.ts";
import { type SetCard, setCards } from "../src/cards.ts";
import { NOT_RANKED, openSetFinder, SET_LIMIT, type SetFinder, setVectorCacheFile } from "../src/finder.ts";
import { JEV_WORDING, LEVELS, levelName } from "../src/wording.ts";
import { fakeEmbedder } from "./fake-embedder.ts";
import { cardOf, CARDS, look } from "./fixtures.ts";

let dir: string;
let finder: SetFinder | undefined;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "set-finder-"));
});
afterEach(async () => {
  finder?.close();
  finder = undefined;
  await rm(dir, { recursive: true, force: true });
});

/** A ranker that grades as told, and counts its calls. */
const grades = (levels: Record<string, number>, cost = 0.4) => {
  const asked: string[] = [];
  const ranker: Ranker<SetCard> = {
    name: "jev",
    async rank({ ask, candidates }): Promise<Ranking> {
      asked.push(ask);
      return { ranker: "jev", model: "jev-test", grades: new Map(candidates.map((card) => [card.id, { level: levels[card.id] ?? 0 }])), timings: { request: 5, total: 6 }, usage: { input: 1000, output: 0 }, cost };
    },
  };
  return { ranker, asked };
};

const open = async (options: Partial<Parameters<typeof openSetFinder>[0]> = {}) => (finder = await openSetFinder({ cards: CARDS, embedder: fakeEmbedder(), cacheFile: path.join(dir, "vectors.bin"), ...options }));

describe("narrowing", () => {
  it("finds a set by its words and by its meaning, and embeds each card once", async () => {
    await open();
    expect(finder!.embeddedOnOpen).toBe(3);
    const narrowing = await finder!.narrow("a pub");
    // The fake model puts pub near bar: no word of the ask is in the card.
    expect(narrowing.candidates[0]).toMatchObject({ id: "dive-bar", embeddings: 1 });
    expect(narrowing.candidates[0]!.keyword).toBeUndefined();
    finder!.close();
    expect((await open()).embeddedOnOpen).toBe(0);
  });

  it("keeps only the kinds a pinned kind tag names", async () => {
    await open();
    const narrowing = await finder!.narrow("a bar", { tags: [{ facet: "kind", value: "exterior", pinned: true }] });
    expect(narrowing.candidates.map(({ id }) => id)).toEqual(["night-street"]);
  });

  it("cuts each ask to the best 24", async () => {
    const many = setCards(new Map(Array.from({ length: 40 }, (_, i) => [`hall-${i}`, look(`Hall ${i}`, "room", "A long stone hall with pillars down both sides and a throne at the far end.", ["interior", "hall", "throne"])])));
    await open({ cards: many });
    expect((await finder!.narrow("a throne hall")).candidates).toHaveLength(SET_LIMIT);
  });

  it("keeps its vectors in a file of their own beside the other finders'", () => {
    expect(path.basename(setVectorCacheFile("Xenova/gte-small", dir))).toBe("sets-vectors-Xenova_gte-small.bin");
  });
});

describe("find", () => {
  it("orders the narrowed sets by Jev's grade, with the cost", async () => {
    const { ranker, asked } = grades({ "night-street": 2.5, "dive-bar": 1 });
    await open({ ranker });
    const found = await finder!.find("somewhere in the city for a tavern scene");
    expect(asked).toEqual(["somewhere in the city for a tavern scene"]);
    expect(found.ranked).toBe(true);
    expect(found.sets.map((entry) => [entry.id, entry.level])).toEqual([
      ["night-street", 2.5],
      ["dive-bar", 1],
      ["ship-bridge", 0],
    ]);
    expect(found.cost).toBe(0.4);
    expect(found.timings.rank).toBe(6);
  });

  it("gives the narrowing's order, and says why, with no ranker, with rank false or with nothing found", async () => {
    await open({ off: "no key" });
    const found = await finder!.find("a pub");
    expect(found).toMatchObject({ ranked: false, notRanked: "no key", cost: 0 });
    expect(found.sets[0]!.id).toBe("dive-bar");
    expect(found.sets[0]!.level).toBeUndefined();
    finder!.close();

    const { ranker, asked } = grades({});
    await open({ ranker });
    expect((await finder!.find("a pub", { rank: false })).notRanked).toBe(NOT_RANKED);
    expect((await finder!.find("   ")).notRanked).toMatch(/nothing to rank/);
    expect(asked).toEqual([]);
  });

  it("stops calling Jev at the spend cap, and counts a failed call's cost", async () => {
    const { ranker, asked } = grades({});
    await open({ ranker, cap: spendCap(0.5) });
    expect((await finder!.find("a bar")).ranked).toBe(true);
    expect((await finder!.find("a bar")).ranked).toBe(true);
    const third = await finder!.find("a bar");
    expect(third.ranked).toBe(false);
    expect(third.notRanked).toMatch(/spend cap/);
    expect(asked).toHaveLength(2);
    finder!.close();

    const cap = spendCap(1);
    await open({ cap, ranker: { name: "jev", rank: async () => Promise.reject(new RankerError("jev", "no score for dive-bar", { cost: 0.1 })) } });
    const failed = await finder!.find("a bar");
    expect(failed).toMatchObject({ ranked: false, cost: 0.1 });
    expect(failed.notRanked).toMatch(/Jev didn't answer/);
    expect(failed.sets.length).toBeGreaterThan(0);
    expect(cap.spent).toBe(0.1);
  });
});

describe("the answer", () => {
  it("gives what a host's tool needs: the look, the measurements, the files and the pictures with their addresses, and the grade", () => {
    const answer = setAnswer(cardOf("ship-bridge"), { level: 2.6, keyword: 1 });
    expect(answer).toMatchObject({
      id: "ship-bridge",
      name: "Ship Bridge",
      kind: "room",
      facets: ["interior", "terran", "bridge", "ship"],
      standsInFor: ["a ship's command deck"],
      confidence: "medium",
      source: "Blizzard campaign",
      size: [8.2, 12.6, 4.1],
      cameras: 2,
      files: ["Cutscenes/ShipBridge.SC2Cutscene"],
      level: 2.6,
      keyword: 1,
    });
    expect(answer.pictures[1]).toMatchObject({ shows: "from the door", url: "https://gallery.example/sets/ship-bridge/card/2.jpg", inGame: { url: "https://gallery.example/sets/ship-bridge/card/2-game.jpg" } });
    expect(answer.views).toHaveLength(2);
    expect(answer).not.toHaveProperty("rooms");
    expect(answer).not.toHaveProperty("embeddings");
  });
});

/** Answers as Jev does: a score per question, by the scores given in question order. */
const fakeJev = (scores: readonly number[]) => async (): Promise<Response> => {
  const answers = Object.fromEntries(scores.map((score, i) => [`c${i}`, { type: "score", score, confidence: 0.9, legend: {}, probabilities: {} }]));
  return new Response(JSON.stringify({ model: "jev-test", answers, usage: { input_tokens: 1000, output_tokens: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
};

describe("the sets' Jev wording", () => {
  it("asks one Score question per set, about a place for a cutscene", () => {
    const request = jevRequest({ ask: "a pub", candidates: [cardOf("dive-bar"), cardOf("ship-bridge")] }, JEV_WORDING);
    expect(request.state).toEqual({ about: JEV_WORDING.about, ask: "a pub" });
    expect(request.state.about).toMatch(/staging a StarCraft II cutscene/);
    expect(Object.keys(request.questions)).toEqual(["c0", "c1"]);
    expect(JSON.stringify(request.questions.c0)).toContain("How well does `set` fit the place `ask` asks for?");
    expect(JSON.stringify(request.questions.c0)).toContain('"set"');
    expect(JSON.stringify(request.questions.c0)).toContain("grubby bar");
    expect(JSON.stringify(request.questions.c1)).toContain(LEVELS[3]);
    expect(levelName(2.6)).toBe("reads as exactly this");
  });

  it("ranks through the kit's ranker with the key kept out of its log", async () => {
    const log: PayloadEntry[] = [];
    await open({ ranker: jevRanker<SetCard>({ apiKey: "secret-key", wording: JEV_WORDING, fetch: fakeJev([0.2, 2.6, 1]), log: (entry) => log.push(entry) }) });
    const found = await finder!.find("a starship bridge");
    expect(found.ranked).toBe(true);
    expect(found.cost).toBeCloseTo(0.000042);
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log)).not.toContain("secret-key");
    expect(await readdir(dir)).toEqual(["vectors.bin"]);
  });
});
