// The Jev ranker (docs/adr/0001): one TypeSafe request per ask. The state is the ask, the object and the
// tags; each candidate gets one Score question with its card, on the four levels. Jev judges, the
// code orders (ranker.ts). The exact payload goes to the log, and a failed call or a missing
// answer is an error, never a low grade.

import { type Fetch, score, type SystemOneRequest, TypeSafeClient } from "@typesafe-ai/sdk";

import { type Grade, type PayloadLog, type RankRequest, RankerError, type Ranker, type Ranking, tagText } from "./ranker.ts";
import { ABOUT, JEV_QUESTION, LEVELS } from "./wording.ts";

export const JEV_MODEL = "jev-latest";
/** US dollars per input token; output is free. */
export const JEV_INPUT_PRICE = 0.042 / 1e6;

export type JevOptions = {
  readonly apiKey: string;
  readonly log?: PayloadLog;
  /** For tests: answers in place of the API. */
  readonly fetch?: Fetch;
  /** Milliseconds per attempt (10 s by default). */
  readonly timeout?: number;
};

/** The request for one ask: what is sent and logged. Question i is about candidate i. */
export function jevRequest({ ask, object, tags, candidates }: RankRequest): SystemOneRequest {
  const state: { about: string; ask: string; object?: string; tags?: string[] } = { about: ABOUT, ask };
  if (object) state.object = object;
  if (tags?.length) state.tags = tags.map(tagText);
  const questions = Object.fromEntries(candidates.map((card, i) => [`c${i}`, score({ question: JEV_QUESTION, doodad: card.text }, LEVELS)]));
  return { model: JEV_MODEL, state, questions };
}

export function jevRanker(options: JevOptions): Ranker {
  const client = new TypeSafeClient({ apiKey: options.apiKey, logLevel: "off", ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.timeout ? { timeout: options.timeout } : {}) });
  return {
    name: "jev",
    async rank(request, { signal } = {}): Promise<Ranking> {
      const started = performance.now();
      const payload = jevRequest(request);
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
        const failure = error as Error & { status?: number };
        const cause = Object.assign(new Error(hide(failure.message)), { name: failure.name, ...(failure.status !== undefined ? { status: failure.status } : {}) });
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
        grades.set(card.id, given ? { level: answer.score, probabilities: LEVELS.map((_, level) => given[level] ?? 0) } : { level: answer.score });
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
