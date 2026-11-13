// The Finder process's ask endpoint behind the page (src/asker.ts): the narrowing 250 ms after
// typing pauses, the ranker on Enter or when idle, the 300 ms wait for it, and newer asks
// cancelling older ones. Fake timers, a fake narrowing and fake rankers: no model, no calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type AskEvent, type Asker, createAsker } from "../src/asker.ts";
import { candidateCards } from "../src/cards.ts";
import type { Narrowing } from "../src/finder.ts";
import type { Narrowed } from "../src/narrow.ts";
import { type Grade, type Ranker, RankerError, type RankRequest } from "../src/ranker.ts";
import { spendCap } from "../src/spend-cap.ts";
import { sources } from "./fixtures.ts";

const CARDS = new Map(candidateCards(sources()).map((card) => [card.id, card]));

/** The narrowing: every card whose text has the ask's first word, in id order. */
const narrowings: string[] = [];
const narrow = async (text: string): Promise<Narrowing> => {
  narrowings.push(text);
  const word = text.trim().split(/\s+/)[0]!.toLowerCase();
  const candidates: Narrowed[] = [...CARDS.values()].filter((card) => card.text.toLowerCase().includes(word)).map((card, i) => ({ id: card.id, card, score: 1 / (i + 1) }));
  return { candidates, timings: { keyword: 1, embed: 1, nearest: 1, merge: 1, total: 4 } };
};

type FakeRanker = Ranker & { readonly calls: RankRequest[]; readonly aborted: string[] };

/** A ranker that answers after `ms`, grading the last candidate highest, and stops when aborted. */
function slowRanker(ms: number, options: { fail?: boolean } = {}): FakeRanker {
  const calls: RankRequest[] = [];
  const aborted: string[] = [];
  return {
    name: "jev",
    calls,
    aborted,
    rank(request, { signal } = {}) {
      calls.push(request);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (options.fail) return reject(new Error("jev: the call failed"));
          const grades = new Map<string, Grade>(request.candidates.map((card, i) => [card.id, { level: i === request.candidates.length - 1 ? 3 : 0 }]));
          resolve({ ranker: "jev", model: "fake", grades, timings: { request: ms, total: ms }, usage: { input: 10, output: 0 }, cost: 0.001 });
        }, ms);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          aborted.push(request.ask);
          reject(signal.reason);
        });
      });
    },
  };
}

let events: (AskEvent & { at: number })[];
let asker: Asker | undefined;
let started: number;
beforeEach(() => {
  vi.useFakeTimers();
  started = Date.now();
  events = [];
  narrowings.length = 0;
});
afterEach(() => {
  asker?.close();
  asker = undefined;
  vi.useRealTimers();
});

const open = (ranker?: Ranker) => {
  asker = createAsker({ narrow, ranker, emit: (event) => events.push({ ...event, at: Date.now() - started }) });
  return asker;
};
const kinds = () => events.map((event) => `${event.type} ${event.text} at ${event.at}`);

describe("createAsker", () => {
  it("narrows 250 ms after typing pauses, for the last text only", async () => {
    const ask = open(slowRanker(100));
    ask.ask({ text: "p", mode: "type", version: 1 });
    await vi.advanceTimersByTimeAsync(100);
    ask.ask({ text: "pr", mode: "type", version: 1 });
    await vi.advanceTimersByTimeAsync(100);
    ask.ask({ text: "press", mode: "type", version: 1 });
    await vi.advanceTimersByTimeAsync(249);
    expect(narrowings).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(narrowings).toEqual(["press"]);
    expect(events).toMatchObject([{ type: "narrowed", text: "press", version: 1, at: 450 }]);
  });

  it("ranks 1.5 s after typing pauses, or after the page's own idle setting", async () => {
    const ranker = slowRanker(100);
    const ask = open(ranker);
    ask.ask({ text: "press", mode: "type", version: 1 });
    await vi.advanceTimersByTimeAsync(1499);
    expect(ranker.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(101);
    expect(kinds()).toEqual(["narrowed press at 250", "ranked press at 1600"]);
    ask.ask({ text: "steel", mode: "type", version: 1, idleMs: 600 });
    await vi.advanceTimersByTimeAsync(700);
    expect(ranker.calls.map(({ ask }) => ask)).toEqual(["press", "steel"]);
  });

  it("on Enter, narrows at once and shows only the ranked order when the ranker answers within 300 ms", async () => {
    const ask = open(slowRanker(200));
    ask.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(kinds()).toEqual(["ranked press at 200"]);
    const ranked = events[0] as Extract<AskEvent, { type: "ranked" }>;
    // The fake grades the narrowing's last candidate highest: it comes first.
    expect(ranked.candidates[0]!.level).toBe(3);
    expect(ranked.candidates.map(({ id }) => id)).toContain("FoundryStamperHead");
  });

  it("with a slow ranker, shows the narrowing's order at 300 ms and re-sorts once when it answers", async () => {
    const ask = open(slowRanker(800));
    ask.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(299);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(kinds()).toEqual(["narrowed press at 300", "ranked press at 800"]);
  });

  it("doesn't send the narrowing twice when typing already showed it before Enter", async () => {
    const ranker = slowRanker(800);
    const ask = open(ranker);
    ask.ask({ text: "press", mode: "type", version: 1 });
    await vi.advanceTimersByTimeAsync(400);
    ask.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(kinds()).toEqual(["narrowed press at 250", "ranked press at 1200"]);
    // Enter stopped the idle wait: one call.
    expect(ranker.calls).toHaveLength(1);
  });

  it("cancels an older ask: its ranker call is aborted and nothing it finds is sent", async () => {
    const ranker = slowRanker(800);
    const ask = open(ranker);
    ask.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(400);
    expect(kinds()).toEqual(["narrowed press at 300"]);
    ask.ask({ text: "crate", mode: "type", version: 1 });
    expect(ranker.aborted).toEqual(["press"]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(kinds()).toEqual(["narrowed press at 300", "narrowed crate at 650", "ranked crate at 2700"]);
  });

  it("cancels a pending narrowing when the ask changes before it runs", async () => {
    const ask = open();
    ask.ask({ text: "press", mode: "type", version: 1 });
    await vi.advanceTimersByTimeAsync(200);
    ask.ask({ text: "", mode: "type", version: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(narrowings).toEqual([]);
    expect(events).toEqual([]);
  });

  it("treats the same text in a newer state version (a tag pinned) as a new ask", async () => {
    const ranker = slowRanker(100);
    const ask = open(ranker);
    ask.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(200);
    ask.ask({ text: "press", mode: "refresh", version: 2, tags: [{ facet: "story", value: "industry", pinned: true }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(kinds()).toEqual(["ranked press at 100", "narrowed press at 200"]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(ranker.calls.map(({ tags }) => tags)).toEqual([undefined, [{ facet: "story", value: "industry", pinned: true }]]);
  });

  it("goes back to an ask it has ranked without another call", async () => {
    const ranker = slowRanker(100);
    const ask = open(ranker);
    ask.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(200);
    ask.ask({ text: "crate", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(200);
    ask.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(ranker.calls).toHaveLength(2);
    expect(kinds()).toEqual(["ranked press at 100", "ranked crate at 300", "ranked press at 400"]);
  });

  it("shows the narrowing and the failure when the ranker fails, never low levels", async () => {
    const ask = open(slowRanker(100, { fail: true }));
    ask.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(kinds()).toEqual(["narrowed press at 100", "failed press at 100"]);
    expect(events[1]).toMatchObject({ error: "jev: the call failed", narrowed: true });
  });

  it("ranks a failed ask again on the next Enter", async () => {
    const flaky = slowRanker(100, { fail: true });
    const good = slowRanker(100);
    let calls = 0;
    const ranker: Ranker = { name: "jev", rank: (request, options) => (calls++ === 0 ? flaky : good).rank(request, options) };
    const ask = open(ranker);
    ask.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    ask.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    expect(kinds()).toEqual(["narrowed press at 100", "failed press at 100", "ranked press at 1100"]);
  });

  it("says the narrowing failed, and narrows and ranks again on the next Enter", async () => {
    let narrows = 0;
    const flakyNarrow = async (text: string): Promise<Narrowing> => {
      if (narrows++ === 0) throw new Error("the embeddings model failed");
      return narrow(text);
    };
    const ranker = slowRanker(100);
    asker = createAsker({ narrow: flakyNarrow, ranker, emit: (event) => events.push({ ...event, at: Date.now() - started }) });
    asker.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(kinds()).toEqual(["failed press at 0"]);
    expect(events[0]).toMatchObject({ error: "the embeddings model failed", narrowed: false });
    expect(ranker.calls).toHaveLength(0);
    asker.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(narrows).toBe(2);
    expect(kinds()).toEqual(["failed press at 0", "ranked press at 1100"]);
  });

  it("says the narrowing failed when it fails after the ranker's wait", async () => {
    const slowFailing = (): Promise<Narrowing> => new Promise((_, reject) => setTimeout(() => reject(new Error("the narrowing timed out")), 500));
    asker = createAsker({ narrow: slowFailing, ranker: slowRanker(100), emit: (event) => events.push({ ...event, at: Date.now() - started }) });
    asker.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(kinds()).toEqual(["failed press at 500"]);
  });

  it("counts what a ranker's failed but answered call cost against the spend cap", async () => {
    const cap = spendCap(1);
    const billed: Ranker = { name: "jev", rank: async () => Promise.reject(new RankerError("jev", "no score for X", { cost: 0.25 })) };
    asker = createAsker({ narrow, ranker: billed, budget: cap, emit: (event) => events.push({ ...event, at: Date.now() - started }) });
    asker.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(kinds()).toEqual(["narrowed press at 0", "failed press at 0"]);
    expect(cap.spent).toBe(0.25);
  });

  it("ranks a ticked card's ask with the tags it was ticked with, apart from the same text's ranking with other tags", async () => {
    const ranker = slowRanker(100);
    const ask = open(ranker);
    const now = [{ facet: "story", value: "industry" }];
    const then = [{ facet: "biome", value: "snow" }];
    ask.ask({ text: "press", mode: "enter", version: 1, tags: now });
    await vi.advanceTimersByTimeAsync(200);
    const ranked = ask.ranked({ text: "press", mode: "enter", version: 1, tags: then });
    await vi.advanceTimersByTimeAsync(200);
    expect((await ranked).tags).toEqual(then);
    expect(ranker.calls.map((call) => call.tags)).toEqual([now, then]);
    // The page's own ask still has its own ranking.
    await expect(ask.ranked({ text: "press", mode: "enter", version: 1, tags: now })).resolves.toMatchObject({ tags: now });
    expect(ranker.calls).toHaveLength(2);
  });

  it("with no ranker on, Enter shows the narrowing", async () => {
    const ask = open();
    ask.ask({ text: "press", mode: "enter", version: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(kinds()).toEqual(["narrowed press at 0"]);
  });

  it("gives a ticked card's ask its ranking, ranking it now when it has none", async () => {
    const ranker = slowRanker(100);
    const ask = open(ranker);
    ask.ask({ text: "press", mode: "type", version: 1 });
    await vi.advanceTimersByTimeAsync(300);
    const ranked = ask.ranked({ text: "press", mode: "type", version: 1 });
    await vi.advanceTimersByTimeAsync(100);
    expect((await ranked).ranking.ranker).toBe("jev");
    expect(kinds()).toEqual(["narrowed press at 250", "ranked press at 400"]);
    // Ranked once: the idle wait finds it ranked.
    await vi.advanceTimersByTimeAsync(2000);
    expect(ranker.calls).toHaveLength(1);
    await expect(ask.ranked({ text: "press", mode: "type", version: 1 })).resolves.toBe(await ranked);
  });

  it("still gives a ticked card's ask its ranking when typing moves on while it is ranked", async () => {
    const ranker = slowRanker(500);
    const ask = open(ranker);
    ask.ask({ text: "press", mode: "type", version: 1 });
    await vi.advanceTimersByTimeAsync(300);
    const ranked = ask.ranked({ text: "press", mode: "type", version: 1 });
    await vi.advanceTimersByTimeAsync(100);
    ask.ask({ text: "press h", mode: "type", version: 1 });
    await vi.advanceTimersByTimeAsync(600);
    await expect(ranked).resolves.toMatchObject({ ranking: { ranker: "jev" } });
    // The page's ask moved on: the ranking for the tick isn't sent.
    expect(kinds()).toEqual(["narrowed press at 250", "narrowed press h at 650"]);
  });
});
