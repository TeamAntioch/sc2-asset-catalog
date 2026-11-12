// The session's spend cap (src/spend-cap.ts) as the asker keeps it: Jev is called until the
// estimated spend reaches the cap, then each ask shows the narrowing's order and says why.
// Fake timers, a fake narrowing and a fake ranker: no calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type AskEvent, type Asker, createAsker } from "../src/asker.ts";
import { candidateCards } from "../src/cards.ts";
import type { Narrowing } from "../src/finder.ts";
import type { Grade, Ranker, RankRequest } from "../src/ranker.ts";
import { DEFAULT_BUDGET, spendCap } from "../src/spend-cap.ts";
import { sources } from "./fixtures.ts";

const CARDS = [...candidateCards(sources())];
const narrow = async (): Promise<Narrowing> => ({ candidates: CARDS.map((card, i) => ({ id: card.id, card, score: 1 / (i + 1) })), timings: { keyword: 1, embed: 1, nearest: 1, merge: 1, total: 4 } });

/** Costs 40 cents a call, and grades the last card highest. */
const calls: RankRequest[] = [];
const ranker: Ranker = {
  name: "jev",
  async rank(request) {
    calls.push(request);
    const grades = new Map<string, Grade>(request.candidates.map((card, i) => [card.id, { level: i === request.candidates.length - 1 ? 3 : 0 }]));
    return { ranker: "jev", model: "fake", grades, timings: { request: 1, total: 1 }, usage: { input: 10, output: 0 }, cost: 0.4 };
  },
};

let events: AskEvent[];
let asker: Asker | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  events = [];
  calls.length = 0;
});
afterEach(() => {
  asker?.close();
  vi.useRealTimers();
});

describe("the spend cap", () => {
  it("is $1.00 a session unless set", () => {
    expect(DEFAULT_BUDGET).toBe(1);
    expect(spendCap().limit).toBe(1);
    expect(() => spendCap(-1)).toThrow(/0 or more/);
  });

  it("stops calling Jev once the spend reaches it, shows the narrowing's order and says why", async () => {
    const cap = spendCap(1);
    asker = createAsker({ narrow, ranker, budget: cap, emit: (event) => events.push(event) });
    for (const [i, text] of ["press", "crate", "boulder", "light"].entries()) {
      asker.ask({ text, mode: "enter", version: i });
      await vi.advanceTimersByTimeAsync(400);
    }
    // 40 cents, 80 cents, then $1.20: past the dollar, the fourth ask isn't sent.
    expect(calls.map(({ ask }) => ask)).toEqual(["press", "crate", "boulder"]);
    expect(cap.spent).toBeCloseTo(1.2);
    const last = events.filter((event) => event.text === "light");
    expect(last.map(({ type }) => type)).toEqual(["narrowed", "capped"]);
    const capped = last[1] as Extract<AskEvent, { type: "capped" }>;
    expect(capped.reason).toContain("$1.00");
    expect(capped.reason).toContain("--budget");
    // The narrowing's order, as it came.
    expect((last[0] as Extract<AskEvent, { type: "narrowed" }>).candidates.map(({ id }) => id)).toEqual(CARDS.map(({ id }) => id));
  });

  it("refuses a ranking asked for directly once it is reached", async () => {
    const cap = spendCap(0);
    asker = createAsker({ narrow, ranker, budget: cap, emit: (event) => events.push(event) });
    await expect(asker.ranked({ text: "press", mode: "enter", version: 1 })).rejects.toThrow(/spend cap/);
    expect(calls).toEqual([]);
  });
});
