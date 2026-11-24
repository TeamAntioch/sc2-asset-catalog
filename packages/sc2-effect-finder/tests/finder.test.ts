// The Effect Finder (src/finder.ts) with a fake embeddings model and fake rankers: the narrowing,
// the cut to 30, `find`'s ranking and its reasons for none, the spend cap, the answer shape, and the
// Jev request the effects' wording makes. No call reaches Jev.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { jevRanker, jevRequest } from "@team-antioch/sc2-finder-kit/jev-ranker.js";
import { type PayloadEntry, type Ranker, RankerError, type Ranking } from "@team-antioch/sc2-finder-kit/ranker.js";
import { spendCap } from "@team-antioch/sc2-finder-kit/spend-cap.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { effectAnswer } from "../src/answer.ts";
import { type EffectCard, effectCards } from "../src/cards.ts";
import { EFFECT_LIMIT, type EffectFinder, effectVectorCacheFile, NOT_RANKED, openEffectFinder } from "../src/finder.ts";
import { JEV_WORDING, LEVELS, levelName } from "../src/wording.ts";
import { fakeEmbedder } from "./fake-embedder.ts";
import { cardOf, CARDS, look } from "./fixtures.ts";

const ARC = "Assets/Effects/Terran/ArcWeaponImpact/ArcWeaponImpact.m3";
const FIRE = "Assets/Effects/Neutral/BurningUnit_Lg/BurningUnit_Lg.m3";
const RING = "Assets/Effects/Protoss/StasisRing/StasisRing.m3";

let dir: string;
let finder: EffectFinder | undefined;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "effect-finder-"));
});
afterEach(async () => {
  finder?.close();
  finder = undefined;
  await rm(dir, { recursive: true, force: true });
});

/** A ranker that grades as told, and counts its calls. */
const grades = (levels: Record<string, number>, cost = 0.4) => {
  const asked: string[] = [];
  const ranker: Ranker<EffectCard> = {
    name: "jev",
    async rank({ ask, candidates }): Promise<Ranking> {
      asked.push(ask);
      return { ranker: "jev", model: "jev-test", grades: new Map(candidates.map((card) => [card.id, { level: levels[card.id] ?? 0 }])), timings: { request: 5, total: 6 }, usage: { input: 1000, output: 0 }, cost };
    },
  };
  return { ranker, asked };
};

const open = async (options: Partial<Parameters<typeof openEffectFinder>[0]> = {}) => (finder = await openEffectFinder({ cards: CARDS, embedder: fakeEmbedder(), cacheFile: path.join(dir, "vectors.bin"), ...options }));

describe("narrowing", () => {
  it("finds an effect by its words and by its meaning, and embeds each card once", async () => {
    await open();
    expect(finder!.embeddedOnOpen).toBe(3);
    const narrowing = await finder!.narrow("lightning");
    // The fake model puts lightning near sparks: no word of the ask is in the card.
    expect(narrowing.candidates[0]).toMatchObject({ id: ARC, embeddings: 1 });
    expect(narrowing.candidates[0]!.keyword).toBeUndefined();
    finder!.close();
    expect((await open()).embeddedOnOpen).toBe(0);
  });

  it("keeps only the kinds a pinned kind tag names", async () => {
    await open();
    const narrowing = await finder!.narrow("sparks", { tags: [{ facet: "kind", value: "ground", pinned: true }] });
    expect(narrowing.candidates.map(({ id }) => id)).toEqual([RING]);
  });

  it("cuts each ask to the best 30", async () => {
    const many = effectCards(new Map(Array.from({ length: 45 }, (_, i) => [`Assets/Effects/Other/Spark${i}/Spark${i}.m3`, look("burst", "A small shower of white sparks jumps off the Marine.", ["sparks", "impact", "white"])])));
    await open({ cards: many });
    expect((await finder!.narrow("white sparks")).candidates).toHaveLength(EFFECT_LIMIT);
  });

  it("keeps its vectors in a file of their own beside the other finders'", () => {
    expect(path.basename(effectVectorCacheFile("Xenova/gte-small", dir))).toBe("effects-vectors-Xenova_gte-small.bin");
  });
});

describe("find", () => {
  it("orders the narrowed effects by Jev's grade, with the cost", async () => {
    const { ranker, asked } = grades({ [RING]: 2.5, [FIRE]: 1 });
    await open({ ranker });
    const found = await finder!.find("a ring on the ground for an area spell");
    expect(asked).toEqual(["a ring on the ground for an area spell"]);
    expect(found.ranked).toBe(true);
    expect(found.effects[0]).toMatchObject({ id: RING, level: 2.5 });
    expect(found.cost).toBe(0.4);
    expect(found.timings.rank).toBe(6);
  });

  it("gives the narrowing's order, and says why, with no ranker, with rank false or with nothing found", async () => {
    await open({ off: "no key" });
    const found = await finder!.find("lightning");
    expect(found).toMatchObject({ ranked: false, notRanked: "no key", cost: 0 });
    expect(found.effects[0]!.id).toBe(ARC);
    finder!.close();

    const { ranker, asked } = grades({});
    await open({ ranker });
    expect((await finder!.find("fire", { rank: false })).notRanked).toBe(NOT_RANKED);
    expect((await finder!.find("   ")).notRanked).toMatch(/nothing to rank/);
    expect(asked).toEqual([]);
  });

  it("stops calling Jev at the spend cap, and counts a failed call's cost", async () => {
    const { ranker, asked } = grades({});
    await open({ ranker, cap: spendCap(0.5) });
    expect((await finder!.find("fire")).ranked).toBe(true);
    expect((await finder!.find("fire")).ranked).toBe(true);
    const third = await finder!.find("fire");
    expect(third.ranked).toBe(false);
    expect(third.notRanked).toMatch(/spend cap/);
    expect(asked).toHaveLength(2);
    finder!.close();

    const cap = spendCap(1);
    await open({ cap, ranker: { name: "jev", rank: async () => Promise.reject(new RankerError("jev", "no score", { cost: 0.1 })) } });
    const failed = await finder!.find("fire");
    expect(failed).toMatchObject({ ranked: false, cost: 0.1 });
    expect(failed.notRanked).toMatch(/Jev didn't answer/);
    expect(cap.spent).toBe(0.1);
  });
});

describe("the answer", () => {
  it("gives the look, the model's path and folder, the picture and the grade", () => {
    const answer = effectAnswer(cardOf("BurningUnit_Lg"), { level: 2.6, keyword: 1 });
    expect(answer).toMatchObject({ file: FIRE, name: "BurningUnit_Lg", folder: "Neutral", kind: "aura", colors: ["orange", "yellow"], size: "medium", moving: "follows", afterDestroy: "gone", level: 2.6, keyword: 1 });
    expect(answer.picture.url).toBe("https://gallery.example/effects/Neutral/BurningUnit_Lg/BurningUnit_Lg.jpg");
    expect(answer).not.toHaveProperty("embeddings");
    expect(effectAnswer(effectCards(new Map([["Assets/Effects/Other/Blank/Blank.m3", look("nothing", "Nothing shows in any frame; the name suggests a hidden marker.", ["marker", "hidden", "none"])]]))[0]!)).not.toHaveProperty("size");
  });
});

/** Answers as Jev does: a score per question, by the scores given in question order. */
const fakeJev = (scores: readonly number[]) => async (): Promise<Response> => {
  const answers = Object.fromEntries(scores.map((score, i) => [`c${i}`, { type: "score", score, confidence: 0.9, legend: {}, probabilities: {} }]));
  return new Response(JSON.stringify({ model: "jev-test", answers, usage: { input_tokens: 1000, output_tokens: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
};

describe("the effects' Jev wording", () => {
  it("asks one Score question per effect, about an effect for an actor", () => {
    const request = jevRequest({ ask: "blue sparks", candidates: [cardOf("ArcWeaponImpact"), cardOf("StasisRing")] }, JEV_WORDING);
    expect(request.state).toEqual({ about: JEV_WORDING.about, ask: "blue sparks" });
    expect(request.state.about).toMatch(/effect model to put on an actor/);
    expect(Object.keys(request.questions)).toEqual(["c0", "c1"]);
    expect(JSON.stringify(request.questions.c0)).toContain("How well does `effect` look like what `ask` asks for?");
    expect(JSON.stringify(request.questions.c0)).toContain("crackling burst");
    expect(JSON.stringify(request.questions.c1)).toContain(LEVELS[3]);
    expect(levelName(2.6)).toBe("looks exactly like this");
  });

  it("ranks through the kit's ranker with the key kept out of its log", async () => {
    const log: PayloadEntry[] = [];
    await open({ ranker: jevRanker<EffectCard>({ apiKey: "secret-key", wording: JEV_WORDING, fetch: fakeJev([0.2, 2.6, 1]), log: (entry) => log.push(entry) }) });
    const found = await finder!.find("a ring of teal light on the ground");
    expect(found.ranked).toBe(true);
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log)).not.toContain("secret-key");
    expect(await readdir(dir)).toEqual(["vectors.bin"]);
  });
});
