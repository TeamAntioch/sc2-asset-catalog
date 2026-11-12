// Records one live answer from Jev on the synthetic fixture cards, for the ranker's unit tests to
// replay (tests/recorded/). Run by hand only, with TYPESAFE_API_KEY set or a key saved by `login`: never in the test suite. Only response bodies are kept: no headers, no credential.
// It spends a little (under a cent); run it again only when a ranker's request changes shape.
//
//   npm run build -w @teamantioch/sc2-asset-catalog && node packages/sc2-doodad-finder/tests/record-ranker-responses.ts

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { candidateCards } from "../src/cards.ts";
import { jevApiKey } from "../src/credentials.ts";
import { jevRanker } from "../src/jev-ranker.ts";
import type { RankRequest } from "../src/ranker.ts";
import { sources } from "./fixtures.ts";

export const RECORDED_REQUEST: Omit<RankRequest, "candidates"> = { ask: "a heavy press head that stamps down", object: "crushing press over a conveyor", tags: [{ facet: "story", value: "industry" }] };

const recordedFile = (name: string) => fileURLToPath(new URL(`recorded/${name}.json`, import.meta.url));

/** A fetch that keeps the last response body it saw. */
function recording() {
  const seen: { body?: unknown } = {};
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const response = await globalThis.fetch(url, init);
    if (new URL(String(url)).pathname.match(/\/systemone$/)) seen.body = await response.clone().json();
    return response;
  };
  return { fetch, seen };
}

async function main() {
  const request: RankRequest = { ...RECORDED_REQUEST, candidates: candidateCards(sources()) };
  const key = jevApiKey();
  if (!key) throw new Error("No TypeSafe key: run `npx @teamantioch/sc2-doodad-finder login`, or set TYPESAFE_API_KEY");
  const jev = recording();
  const jevRanking = await jevRanker({ apiKey: key, fetch: jev.fetch }).rank(request);
  await writeFile(recordedFile("jev"), `${JSON.stringify(jev.seen.body, null, 2)}\n`);
  for (const ranking of [jevRanking]) {
    console.log(`${ranking.ranker} (${ranking.model}): ${Math.round(ranking.timings.request)} ms, $${ranking.cost.toFixed(5)}, usage ${JSON.stringify(ranking.usage)}`);
    console.log(`  ${[...ranking.grades].map(([id, { level }]) => `${id} ${level.toFixed(2)}`).join(", ")}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
