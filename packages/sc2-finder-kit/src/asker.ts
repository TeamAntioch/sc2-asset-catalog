// A finder process's asks (docs/adr/0001), behind the page's ask endpoint. The page sends
// each change to the ask as it is typed; the process decides when to narrow and when to rank:
//
//   typing    the narrowing runs 250 ms after typing pauses, and its cards are shown
//   idle      1.5 s after typing pauses (a setting), the ranker runs
//   Enter     the narrowing runs at once if it hasn't, then the ranker
//   ranking   the page waits up to 300 ms for the ranker; past that it is shown the narrowing's
//             order, and the ranked order replaces it once, when the ranker answers
//
// A newer ask cancels the older one: its timers stop, its ranker call is aborted, and nothing it
// finds afterwards is sent. Asks are known by their text and the state version they were made in
// (its tags and the map's dependencies), and by the tags it runs with, so a change of tags is a new ask too. Once the session's spend cap is
// reached, an ask that would rank shows the narrowing's order and a `capped` event says why.

import type { NarrowOptions, Narrowing } from "./finder.ts";
import type { Narrowed, Tag } from "./narrow.ts";
import { orderByFit, type Ranker, RankerError, type RankerName, type Ranking } from "./ranker.ts";
import type { SpendCap } from "./spend-cap.ts";

export type AskMode = "type" | "enter" | "refresh";

/** What an ask runs with, besides its text: the page's state when it was made. */
export type AskContext = {
  readonly tags?: readonly Tag[] | undefined;
  /** The object the ask is a part of, when there is one: context for the ranker. */
  readonly object?: string | undefined;
  /** A map's dependencies: the cards they provide are marked and kept first. */
  readonly dependencies?: readonly string[] | undefined;
};

export type AskRequest = AskContext & {
  readonly text: string;
  /** `type` for a keystroke, `enter` to rank now, `refresh` to narrow again now (the tags changed). */
  readonly mode: AskMode;
  /** The page state's version: an ask is its text and version. */
  readonly version: number;
  /** How long typing pauses before the ranker runs, in ms: the page's setting. */
  readonly idleMs?: number | undefined;
};

export type RankedCandidate = Narrowed & { readonly level: number };

export type AskEvent =
  | { readonly type: "narrowed"; readonly text: string; readonly version: number; readonly candidates: readonly Narrowed[]; readonly ms: number }
  | {
      readonly type: "ranked";
      readonly text: string;
      readonly version: number;
      readonly ranker: RankerName;
      /** The tags it ran with. */
      readonly tags: readonly Tag[];
      readonly candidates: readonly RankedCandidate[];
      /** From the ranker being asked for to its order: the narrowing, the call and the order. */
      readonly ms: number;
      readonly cost: number;
    }
  | {
      readonly type: "failed";
      readonly text: string;
      readonly version: number;
      /** The ranker the ask was for; none when no ranker is on. */
      readonly ranker?: RankerName;
      readonly error: string;
      /** Whether the narrowing's order is shown: false when the narrowing itself failed. */
      readonly narrowed: boolean;
    }
  | { readonly type: "capped"; readonly text: string; readonly version: number; readonly reason: string };

export type AskTiming = { readonly debounceMs: number; readonly idleMs: number; readonly budgetMs: number };

/** The spec's timings: narrow after 250 ms, rank after 1.5 s idle, wait 300 ms for the ranker. */
export const ASK_TIMING: AskTiming = { debounceMs: 250, idleMs: 1500, budgetMs: 300 };

/** An ask's ranking: the ranker's answer and the narrowed candidates in its order. */
export type AskRanking = { readonly ranking: Ranking; readonly tags: readonly Tag[]; readonly candidates: readonly RankedCandidate[]; readonly ms: number };

export type AskerOptions = {
  readonly narrow: (text: string, options: NarrowOptions) => Promise<Narrowing>;
  /** The ranker; with none, asks are narrowed only. */
  readonly ranker?: Ranker | undefined;
  /** The session's spend cap: past it, no more ranker calls. Each ranking's cost is recorded in it. */
  readonly budget?: SpendCap;
  readonly emit: (event: AskEvent) => void;
  readonly timing?: Partial<AskTiming>;
  /** Called with each ranker's answer. */
  readonly onRanking?: (ranking: Ranking) => void;
};

export type Asker = {
  ask(request: AskRequest): void;
  /** The ranking for an ask, for ticking a card from it: the one it has, else one made now. */
  ranked(request: AskRequest): Promise<AskRanking>;
  close(): void;
};

type Ask = {
  readonly key: string;
  readonly request: AskRequest;
  readonly controller: AbortController;
  narrowing?: Promise<Narrowing>;
  ranking?: Promise<AskRanking>;
  /** Whether its results have been sent: its narrowing, or its ranking. */
  shown?: "narrowed" | "ranked";
  rankStarted?: boolean;
  debounce?: NodeJS.Timeout;
  idle?: NodeJS.Timeout;
};

/** An ask's key: its version, its tags and its text. The version moves when the page's tags do, but a ticked card's ask can be ranked with the tags it was ticked with. */
const keyOf = ({ text, version, tags }: Pick<AskRequest, "text" | "version" | "tags">): string =>
  `${version}\n${JSON.stringify((tags ?? []).map(({ facet, value, pinned }) => [facet, value, pinned === true]))}\n${text.trim()}`;

/** How many past asks' rankings are kept: going back to an earlier ask costs no call. */
const KEPT_RANKINGS = 50;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createAsker(options: AskerOptions): Asker {
  const timing = { ...ASK_TIMING, ...options.timing };
  const kept = new Map<string, AskRanking>();
  let current: Ask | undefined;

  const { budget } = options;
  const stale = (ask: Ask) => current !== ask;
  const narrowNow = (ask: Ask): Promise<Narrowing> => {
    if (ask.narrowing) return ask.narrowing;
    const { text, tags, dependencies } = ask.request;
    const narrowing = options.narrow(text, { ...(tags ? { tags } : {}), dependencies });
    ask.narrowing = narrowing;
    // A failed narrowing isn't kept either: the next Enter or idle pause on this ask narrows again.
    narrowing.catch(() => {
      if (ask.narrowing === narrowing) delete ask.narrowing;
    });
    return narrowing;
  };

  const showNarrowing = async (ask: Ask): Promise<void> => {
    const narrowing = await narrowNow(ask);
    if (stale(ask) || ask.shown) return;
    ask.shown = "narrowed";
    options.emit({ type: "narrowed", text: ask.request.text, version: ask.request.version, candidates: narrowing.candidates, ms: narrowing.timings.total });
  };

  const rankingOf = (ask: Ask, ranker: Ranker): Promise<AskRanking> => {
    if (ask.ranking) return ask.ranking;
    const known = kept.get(ask.key);
    if (known?.ranking.ranker === ranker.name) return (ask.ranking = Promise.resolve(known));
    const started = performance.now();
    ask.ranking = (async () => {
      const { candidates: narrowed } = await narrowNow(ask);
      const { text, object, tags } = ask.request;
      let ranking: Ranking | undefined;
      try {
        ranking = narrowed.length ? await ranker.rank({ ask: text, object, tags, candidates: narrowed.map(({ card }) => card) }, { signal: ask.controller.signal }) : undefined;
      } catch (error) {
        // A call answered (and paid for) but not read still counts against the cap.
        if (error instanceof RankerError && error.cost > 0) budget?.record(error.cost);
        throw error;
      }
      if (ranking) {
        budget?.record(ranking.cost);
        options.onRanking?.(ranking);
      }
      const candidates = ranking ? orderByFit(narrowed, ranking.grades) : [];
      const result: AskRanking = {
        ranking: ranking ?? { ranker: ranker.name, model: "", grades: new Map(), timings: { request: 0, total: 0 }, usage: { input: 0, output: 0 }, cost: 0 },
        tags: tags ?? [],
        candidates,
        ms: performance.now() - started,
      };
      kept.delete(ask.key);
      kept.set(ask.key, result);
      if (kept.size > KEPT_RANKINGS) kept.delete(kept.keys().next().value!);
      return result;
    })();
    // A ranking no one waits for (it was cancelled) mustn't be an unhandled rejection.
    ask.ranking.catch(() => {});
    return ask.ranking;
  };

  /** Whether the ask's ranking is known, so no call is needed for it. */
  const known = (ask: Ask, ranker: Ranker): boolean => ask.ranking !== undefined || kept.get(ask.key)?.ranking.ranker === ranker.name;

  const rankNow = async (ask: Ask): Promise<void> => {
    const { ranker } = options;
    // With no ranker, or none allowed, a failed narrowing is the ask's only failure: said, not dropped.
    const narrowOrSay = (): Promise<boolean> =>
      showNarrowing(ask).then(
        () => true,
        (error: unknown) => {
          if (!stale(ask)) options.emit({ type: "failed", text: ask.request.text, version: ask.request.version, error: (error as Error).message, narrowed: false });
          return false;
        },
      );
    if (!ranker) return void (await narrowOrSay());
    if (ask.rankStarted) return;
    ask.rankStarted = true;
    if (budget && !budget.allows() && !known(ask, ranker)) {
      if (!(await narrowOrSay())) {
        // Not capped yet as far as this ask goes: the next Enter narrows again.
        ask.rankStarted = false;
        return;
      }
      if (!stale(ask)) options.emit({ type: "capped", text: ask.request.text, version: ask.request.version, reason: budget.reason });
      return;
    }
    const ranking = rankingOf(ask, ranker);
    const late = await Promise.race([ranking.then(() => false, () => false), sleep(timing.budgetMs).then(() => true)]);
    try {
      if (late) await showNarrowing(ask);
      const { candidates, ranking: answer, ms, tags } = await ranking;
      if (stale(ask)) return;
      ask.shown = "ranked";
      options.emit({ type: "ranked", text: ask.request.text, version: ask.request.version, ranker: ranker.name, tags, candidates, ms, cost: answer.cost });
    } catch (error) {
      if (stale(ask)) return;
      // A failed ranking isn't kept: the next Enter or idle pause on this ask calls the ranker again.
      delete ask.ranking;
      ask.rankStarted = false;
      // The narrowing's order is shown when the narrowing worked; when it failed, it isn't run again now.
      const narrowed = ask.narrowing ? await showNarrowing(ask).then(() => true, () => false) : false;
      if (stale(ask)) return;
      options.emit({ type: "failed", text: ask.request.text, version: ask.request.version, ranker: ranker.name, error: (error as Error).message, narrowed });
    }
  };

  const later = (ask: Ask, timer: "debounce" | "idle", ms: number, run: (ask: Ask) => Promise<void>) => {
    clearTimeout(ask[timer]);
    ask[timer] = setTimeout(() => void run(ask).catch(() => {}), ms);
  };
  const stopTimers = (ask: Ask) => {
    clearTimeout(ask.debounce);
    clearTimeout(ask.idle);
  };
  const cancel = (ask: Ask | undefined) => {
    if (!ask) return;
    stopTimers(ask);
    ask.controller.abort(new Error("A newer ask replaced this one"));
  };

  return {
    ask(request) {
      const key = keyOf(request);
      let ask = current;
      if (ask?.key !== key) {
        cancel(current);
        current = undefined;
        if (!request.text.trim()) return;
        ask = { key, request, controller: new AbortController() };
        current = ask;
        if (request.mode === "type") later(ask, "debounce", timing.debounceMs, showNarrowing);
      }
      const idle = request.idleMs ?? timing.idleMs;
      if (request.mode === "type") {
        // The same ask typed again (a trailing space): the idle wait starts over.
        if (!ask.rankStarted) later(ask, "idle", idle, rankNow);
      } else if (request.mode === "enter") {
        stopTimers(ask);
        void rankNow(ask).catch(() => {});
      } else {
        stopTimers(ask);
        void showNarrowing(ask).catch(() => {});
        if (!ask.rankStarted) later(ask, "idle", idle, rankNow);
      }
    },
    async ranked(request) {
      const key = keyOf(request);
      const known = kept.get(key);
      if (known) return known;
      const { ranker } = options;
      if (!ranker) throw new Error("No ranker is on");
      // A ranking already under way for the current ask was paid for before the cap was reached.
      if (budget && !budget.allows() && !(current?.key === key && current.ranking)) throw new Error(`No ranking: ${budget.reason}`);
      if (current?.key === key) {
        const ask = current;
        void rankNow(ask).catch(() => {});
        try {
          return await rankingOf(ask, ranker);
        } catch (error) {
          // A newer ask cancelled it: the tick still needs it, so it is ranked on its own below.
          if (!ask.controller.signal.aborted) throw error;
        }
      }
      // An ask no longer current: ranked on its own, its results not sent.
      return rankingOf({ key, request, controller: new AbortController() }, ranker);
    },
    close() {
      cancel(current);
      current = undefined;
    },
  };
}
