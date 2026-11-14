// The Jev ranker (docs/adr/0001): one TypeSafe request per ask. The state is the ask, the object and the
// tags; each candidate gets one Score question with its card, on four levels. Jev judges, the
// code orders (ranker.ts). What it is told about the finder's cards is the finder's wording. The exact payload goes to the log, and a failed call or a missing
// answer is an error, never a low grade.

import { type Fetch, score, type SystemOneRequest, TypeSafeClient } from "@typesafe-ai/sdk";

import type { FinderCard } from "./card.ts";
import type { RankBudget } from "./narrow.ts";
import { type Grade, type PayloadLog, type RankRequest, RankerError, type Ranker, type Ranking, tagText } from "./ranker.ts";

/**
 * Every word a finder has Jev judge by, in one place to audit and edit: what the ask is about, the
 * Score question, the name the candidate's card goes under in each question, and the levels from 0
 * up, each a situation that reads on its own.
 */
export type JevWording = {
  readonly about: string;
  readonly question: string;
  /** The question's field for the candidate's card: `doodad`, so the question can say `doodad`. */
  readonly field: string;
  readonly levels: readonly [string, ...string[]];
};

export const JEV_MODEL = "jev-latest";
/** US dollars per input token; output is free. */
export const JEV_INPUT_PRICE = 0.042 / 1e6;

/**
 * What one request to Jev can carry, as input tokens. Jev refuses a request over its limit with
 * `400 max_tokens_exceeded` (docs/adr/0002). The Music Finder met it: its asks took 57k to 65.7k
 * input tokens at 168 to 187 candidates and the ones with 189 to 198 candidates were refused, so
 * the limit is somewhere about 65k. A request is cut to 55k estimated tokens, which leaves room for
 * the estimate being off (it counts bytes, not tokens) and for the ask, tags and the state.
 */
export const JEV_TOKEN_BUDGET = 55_000;
/** Bytes per token for the estimate: the measured 3.66 for the music's request, rounded down so the estimate runs high. */
export const JEV_BYTES_PER_TOKEN = 3.4;
/** The question's key (`"c123":`) and the comma after it. */
const QUESTION_KEY_BYTES = 8;

/** What a finder hands Jev: the budget, and each candidate's estimated tokens, counted from the question it will be sent as. */
export function jevRankBudget<C extends FinderCard = FinderCard>(wording: JevWording, limit: number = JEV_TOKEN_BUDGET): RankBudget<C> {
  // The question's levels are the same on every candidate: only the card's text varies.
  const fixed = JSON.stringify(score({ question: wording.question, [wording.field]: "" }, wording.levels)).length + QUESTION_KEY_BYTES;
  return { limit, cost: (card) => Math.ceil((fixed + JSON.stringify(card.text).length - 2) / JEV_BYTES_PER_TOKEN) };
}

export type JevOptions = {
  readonly apiKey: string;
  readonly wording: JevWording;
  readonly log?: PayloadLog;
  /** For tests: answers in place of the API. */
  readonly fetch?: Fetch;
  /** Milliseconds per attempt (10 s by default). */
  readonly timeout?: number;
};

/** The request for one ask: what is sent and logged. Question i is about candidate i. */
export function jevRequest({ ask, object, tags, candidates }: RankRequest, wording: JevWording): SystemOneRequest {
  const state: { about: string; ask: string; object?: string; tags?: string[] } = { about: wording.about, ask };
  if (object) state.object = object;
  if (tags?.length) state.tags = tags.map(tagText);
  const questions = Object.fromEntries(candidates.map((card, i) => [`c${i}`, score({ question: wording.question, [wording.field]: card.text }, wording.levels)]));
  return { model: JEV_MODEL, state, questions };
}

export function jevRanker<C extends FinderCard = FinderCard>(options: JevOptions): Ranker<C> {
  const { wording } = options;
  const client = new TypeSafeClient({ apiKey: options.apiKey, logLevel: "off", ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.timeout ? { timeout: options.timeout } : {}) });
  return {
    name: "jev",
    async rank(request, { signal } = {}): Promise<Ranking> {
      const started = performance.now();
      const payload = jevRequest(request, wording);
      const sent = performance.now();
      const at = new Date().toISOString();
      let result;
      try {
        result = await client.systemOne(payload, signal ? { signal } : {});
      } catch (error) {
        // The key never goes further than the client: not into the log, the terminal or the page.
        const hide = (text: string) => (options.apiKey ? text.split(options.apiKey).join("[the key]") : text);
        options.log?.({ ranker: "jev", at, ms: performance.now() - sent, request: payload, error: hide(String(error)) });
        // The SDK's error is kept as a copy with the key hidden: its name, message and status.
        // Its network code too (ENOTFOUND, say), from its own cause, so an outage still reads as one.
        const failure = error as Error & { status?: number; cause?: { code?: unknown } };
        const code = failure.cause?.code;
        const cause = Object.assign(new Error(hide(failure.message)), {
          name: failure.name,
          ...(failure.status !== undefined ? { status: failure.status } : {}),
          ...(typeof code === "string" ? { code } : {}),
        });
        throw new RankerError("jev", `the request failed: ${cause.message}`, { cause });
      }
      const answered = performance.now();
      options.log?.({ ranker: "jev", at, ms: answered - sent, request: payload, response: result });
      const logged = performance.now() - answered; // the log write is not part of the ranker's time
      const input = result.usage.input_tokens ?? 0;
      const cost = input * JEV_INPUT_PRICE;
      const grades = new Map<string, Grade>();
      request.candidates.forEach((card, i) => {
        const answer = result.answers[`c${i}`];
        // Answered, so paid for: the error carries the cost for the spend cap.
        if (answer?.type !== "score" || !Number.isFinite(answer.score)) throw new RankerError("jev", `no score for ${card.id}`, { cost });
        const given = answer.probabilities as Record<number, number> | null | undefined;
        grades.set(card.id, given ? { level: answer.score, probabilities: wording.levels.map((_, level) => given[level] ?? 0) } : { level: answer.score });
      });
      return {
        ranker: "jev",
        model: result.model,
        grades,
        timings: { request: answered - sent, total: performance.now() - started - logged },
        usage: { input, output: result.usage.output_tokens ?? 0 },
        cost,
      };
    },
  };
}
