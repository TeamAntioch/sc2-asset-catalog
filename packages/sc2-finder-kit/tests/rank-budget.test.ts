// The rank budget (docs/adr/0002): what Jev can take in one request, and how a merged list is cut to it.
import { describe, expect, it } from "vitest";

import type { FinderCard } from "../src/card.ts";
import { JEV_BYTES_PER_TOKEN, JEV_TOKEN_BUDGET, jevRankBudget, jevRequest } from "../src/jev-ranker.ts";
import { fitToBudget, mergeNarrowing, type Narrowed } from "../src/narrow.ts";
import { toyWording } from "./toy.ts";

/** A music-sized card: the real Music Finder's cards average 640 characters of text, and its four levels are about 124 characters each. */
const MUSIC_WORDING = { about: "A scene needs music.", question: "How well does `track` suit what `ask` needs?", field: "track", levels: ["a".repeat(124), "b".repeat(124), "c".repeat(124), "d".repeat(124)] } as const;
const card = (id: string, length: number): FinderCard => ({ id, name: id, text: "x".repeat(length) });
const narrowed = (cards: readonly FinderCard[]): Narrowed[] => cards.map((c, i) => ({ id: c.id, card: c, score: 1 - i / 1000 }));

describe("jevRankBudget", () => {
  it("counts a candidate from the question it will be sent as", () => {
    const budget = jevRankBudget(MUSIC_WORDING);
    const cards = [card("a", 100), card("b", 640), card("c", 2000)];
    const request = jevRequest({ ask: "a scene", candidates: cards }, MUSIC_WORDING);
    cards.forEach((c, i) => {
      const sent = JSON.stringify(request.questions[`c${i}`]).length + `"c${i}":,`.length;
      // Within a token or two of the bytes actually sent, and never under the real count.
      expect(budget.cost(c)).toBeGreaterThanOrEqual(Math.floor(sent / JEV_BYTES_PER_TOKEN) - 1);
      expect(budget.cost(c)).toBeLessThanOrEqual(Math.ceil(sent / JEV_BYTES_PER_TOKEN) + 2);
    });
  });

  it("counts bytes, not characters: a card of multi-byte text costs more than an ASCII one of the same length", () => {
    const budget = jevRankBudget(MUSIC_WORDING);
    const ascii = card("a", 300);
    const accented = { ...ascii, text: "é".repeat(300) };
    expect(budget.cost(accented)).toBeGreaterThan(budget.cost(ascii));
    const request = jevRequest({ ask: "a scene", candidates: [accented] }, MUSIC_WORDING);
    const sent = Buffer.byteLength(JSON.stringify(request.questions.c0)) + `"c0":,`.length;
    expect(budget.cost(accented)).toBeGreaterThanOrEqual(Math.floor(sent / JEV_BYTES_PER_TOKEN) - 1);
  });

  it("is the 55,000-token default, and another limit when one is asked for", () => {
    expect(jevRankBudget(toyWording).limit).toBe(JEV_TOKEN_BUDGET);
    expect(JEV_TOKEN_BUDGET).toBe(55_000);
    expect(jevRankBudget(toyWording, 1000).limit).toBe(1000);
  });
});

describe("fitToBudget", () => {
  it("cuts a 198-candidate music request, which is over the budget, to one that fits", () => {
    const budget = jevRankBudget(MUSIC_WORDING);
    const all = narrowed(Array.from({ length: 198 }, (_, i) => card(`track${i}`, 640)));
    const before = all.reduce((total, { card: c }) => total + budget.cost(c), 0);
    expect(before).toBeGreaterThan(budget.limit); // the size that made Jev answer 400 max_tokens_exceeded
    const { kept, cut, cost } = fitToBudget(all, budget);
    expect(cost).toBeLessThanOrEqual(budget.limit);
    expect(kept.reduce((total, { card: c }) => total + budget.cost(c), 0)).toBe(cost);
    expect(kept.length + cut).toBe(198);
    expect(kept.length).toBeGreaterThan(130);
    expect(kept.length).toBeLessThan(170);
    expect(kept.map(({ id }) => id)).toEqual(all.slice(0, kept.length).map(({ id }) => id)); // the best kept, in order
  });

  it("cuts what is lowest ranked in both searches, not one search's whole tail", () => {
    // Two searches with nothing in common: the merge alternates them, so the tail it cuts is both lists' lowest.
    const cards = new Map(Array.from({ length: 200 }, (_, i) => [`${i < 100 ? "k" : "n"}${i % 100}`, card(`${i < 100 ? "k" : "n"}${i % 100}`, 640)] as const));
    const keyword = Array.from({ length: 100 }, (_, i) => ({ id: `k${i}` }));
    const nearest = Array.from({ length: 100 }, (_, i) => ({ id: `n${i}`, similarity: 1 - i / 1000 }));
    const merged = mergeNarrowing(keyword, nearest, cards, { tagMatches: () => true });
    expect(merged).toHaveLength(200);
    const { kept } = fitToBudget(merged, jevRankBudget(MUSIC_WORDING));
    const fromKeyword = kept.filter(({ id }) => id.startsWith("k")).length;
    const fromNearest = kept.length - fromKeyword;
    expect(kept.length).toBeLessThan(200);
    expect(Math.abs(fromKeyword - fromNearest)).toBeLessThanOrEqual(1);
    // What was kept is each list's best.
    expect(kept.filter(({ id }) => id.startsWith("k")).map(({ id }) => id)).toEqual(keyword.slice(0, fromKeyword).map(({ id }) => id));
  });

  it("cuts nothing when everything fits, and keeps at least one when one card alone is over", () => {
    const budget = jevRankBudget(MUSIC_WORDING);
    const short = narrowed(Array.from({ length: 200 }, (_, i) => card(`s${i}`, 120)));
    expect(fitToBudget(short, budget)).toMatchObject({ cut: 0 });
    expect(fitToBudget(short, budget).kept).toHaveLength(200);
    const huge = narrowed([card("huge", 400_000), card("next", 100)]);
    expect(fitToBudget(huge, budget)).toMatchObject({ cut: 1 });
    expect(fitToBudget(huge, budget).kept.map(({ id }) => id)).toEqual(["huge"]);
  });
});
