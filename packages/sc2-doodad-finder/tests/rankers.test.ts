// The Jev ranker (src/jev-ranker.ts) against an answer recorded live on the synthetic fixture cards
// (tests/record-ranker-responses.ts): what it sends, the grades it reads, its payload log, and a failed call or an unreadable answer as an error, never low
// grades. No call here reaches the network.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { candidateCards } from "../src/cards.ts";
import { jevRanker } from "../src/jev-ranker.ts";
import { type PayloadEntry, type RankRequest, RankerError } from "../src/ranker.ts";
import { LEVELS } from "../src/wording.ts";
import { sources } from "./fixtures.ts";
import { RECORDED_REQUEST } from "./record-ranker-responses.ts";

const recorded = (name: string): unknown => JSON.parse(readFileSync(new URL(`recorded/${name}.json`, import.meta.url), "utf8"));
const request: RankRequest = { ...RECORDED_REQUEST, candidates: candidateCards(sources()) };

/** A fetch that answers every call with one body and status, counting the calls. */
function answering(body: unknown, status = 200) {
  const calls: string[] = [];
  const fetch = async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

describe("the Jev ranker", () => {
  it("grades every candidate from its Score, the stamper head as exactly this and the boulder as not fitting", async () => {
    const log: PayloadEntry[] = [];
    const { fetch, calls } = answering(recorded("jev"));
    const ranking = await jevRanker({ apiKey: "ts-test", fetch, log: (entry) => log.push(entry) }).rank(request);
    expect(calls).toHaveLength(1);
    expect(ranking.ranker).toBe("jev");
    expect(ranking.model).toBe("jev-1.14.0");
    expect(ranking.grades.size).toBe(request.candidates.length);
    expect(ranking.grades.get("FoundryStamperHead")!.level).toBeGreaterThan(2.5);
    expect(ranking.grades.get("MossyBoulder")!.level).toBeLessThan(1);
    expect(ranking.grades.get("FoundryStamperHead")!.probabilities).toHaveLength(4);
    expect(ranking.usage.input).toBeGreaterThan(0);
    expect(ranking.cost).toBeGreaterThan(0);
    expect(ranking.timings.total).toBeGreaterThanOrEqual(ranking.timings.request);
    // The log holds the exact payload: the ask, object and tags as state, one Score per card on the four levels.
    expect(log).toHaveLength(1);
    const sent = log[0]!.request as { state: Record<string, unknown>; questions: Record<string, { type: string; instructions: { doodad: string }; criteria: readonly string[] }> };
    expect(sent.state).toMatchObject({ ask: RECORDED_REQUEST.ask, object: RECORDED_REQUEST.object, tags: ["story: industry"] });
    expect(Object.values(sent.questions)).toHaveLength(request.candidates.length);
    expect(sent.questions.c0).toMatchObject({ type: "score", criteria: LEVELS, instructions: { doodad: request.candidates[0]!.text } });
    expect(JSON.stringify(log[0])).not.toContain("ts-test");
  });

  it("leaves out an empty object and tags", async () => {
    const log: PayloadEntry[] = [];
    await jevRanker({ apiKey: "ts-test", fetch: answering(recorded("jev")).fetch, log: (entry) => log.push(entry) }).rank({ ...request, object: undefined, tags: [] });
    expect(Object.keys((log[0]!.request as { state: object }).state)).toEqual(["about", "ask"]);
  });

  it("throws on a failed call, and logs it, rather than grading low", async () => {
    const log: PayloadEntry[] = [];
    const ranker = jevRanker({ apiKey: "ts-test", fetch: answering({ error: { message: "upstream down" } }, 500).fetch, log: (entry) => log.push(entry) });
    await expect(ranker.rank(request)).rejects.toBeInstanceOf(RankerError);
    expect(log.at(-1)).toMatchObject({ ranker: "jev", error: expect.any(String) });
  });

  it("keeps the key out of a failed call's error and its log line", async () => {
    const log: PayloadEntry[] = [];
    const ranker = jevRanker({ apiKey: "ts-secret-key", fetch: (async () => Promise.reject(new Error("refused with Bearer ts-secret-key"))) as unknown as typeof globalThis.fetch, log: (entry) => log.push(entry) });
    const failed = await ranker.rank(request).catch((error: unknown) => error as Error);
    expect(failed).toBeInstanceOf(RankerError);
    expect(JSON.stringify({ message: (failed as Error).message, cause: (failed as Error).cause, log })).not.toContain("ts-secret-key");
  });

  it("throws when a candidate's answer is missing", async () => {
    const answer = recorded("jev") as { answers: Record<string, unknown> };
    delete answer.answers.c3;
    const failed = jevRanker({ apiKey: "ts-test", fetch: answering(answer).fetch }).rank(request);
    await expect(failed).rejects.toThrow(/Sandbags/);
    // The call was answered, so it was paid for: the error says what it cost.
    await expect(failed).rejects.toMatchObject({ cost: expect.any(Number) });
    expect(((await failed.catch((error: unknown) => error)) as RankerError).cost).toBeGreaterThan(0);
  });

  it("grades from the score alone when an answer has no probabilities", async () => {
    const answer = recorded("jev") as { answers: Record<string, { probabilities?: unknown }> };
    delete answer.answers.c0!.probabilities;
    const ranking = await jevRanker({ apiKey: "ts-test", fetch: answering(answer).fetch }).rank(request);
    expect(ranking.grades.get("FoundryStamperHead")).toEqual({ level: expect.any(Number) });
  });
});
