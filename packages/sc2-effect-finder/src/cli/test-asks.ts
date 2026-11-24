// The Effect Finder's test command: runs the narrowing on the repo's test-effect-asks.json (each ask
// with the effects it should find) and on a tick log's asks (`--tick-log <folder>`), with the real
// embeddings model, and reports the hit rate and timings, the reviewed asks apart from the rest.
// Then, when a TypeSafe key is set (with TYPESAFE_API_KEY, else the key file every finder's `login`
// saves), Jev grades every ask's narrowed effects and it reports how many expected effects are in
// Jev's first 3 against the narrowing's own first 3, its timings and the estimated spend. It fails
// when the narrowing's p95 is over 50 ms, a warm start is over 3 s, an ask names an effect the cards
// don't have, or a Jev call fails.
//
//   npm run test-effect-asks -- [--asks <file>] [--tick-log <folder>] [--runs n] [--model <name>] [--no-rank] [--budget dollars] [--json]
//
// An ask's expected effects are the models' paths. Jev's calls are live, made only when this is run
// by hand, never by the test suite or CI; each sends an ask and its 30 candidates' cards, and they
// stop before the estimated spend would pass --budget (0.50 US dollars by default). Every call's
// exact payload goes to a file in the cache folder. A repo command only: it isn't published with
// the package.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { catalogCacheDir } from "@team-antioch/sc2-asset-catalog/catalog/catalog-dirs.js";
import { FINDER_MODEL, localEmbedder } from "@team-antioch/sc2-finder-kit/embedder.js";
import { isMainModule } from "@team-antioch/sc2-finder-kit/is-main.js";
import { payloadLog, payloadLogFile } from "@team-antioch/sc2-finder-kit/payload-log.js";
import { keySourceText, openRanker } from "@team-antioch/sc2-finder-kit/credentials.js";
import { spendCap } from "@team-antioch/sc2-finder-kit/spend-cap.js";
import { addHits, formatHits, hits, type Hits, type NarrowingCase, NARROWING_P95_MS, percentile, readTestAsks, TICK_LOG_FILE, tickLogCases, topHits, WARM_START_MS, warmStartMs } from "@team-antioch/sc2-finder-kit/test-asks.js";

import { type EffectCard, effectCards } from "../cards.ts";
import { type EffectFinder, effectVectorCacheFile, openEffectFinder } from "../finder.ts";
import { JEV_WORDING } from "../wording.ts";

const USAGE = "Usage: npm run test-effect-asks -- [--asks <file>] [--tick-log <folder>] [--runs n] [--model <name>] [--no-rank] [--budget dollars] [--json]";

/** The repo's test asks, from a checkout: packages/sc2-effect-finder/{src,dist}/cli/ to the top. */
const REPO_TEST_ASKS = fileURLToPath(new URL("../../../../test-effect-asks.json", import.meta.url));

/** How many of the ranked effects the mapper sees first: about a row of cards. */
export const TOP_EFFECTS = 3;

/** The effects have no `login` of their own: any finder's saves the key file this reads. */
const LOGIN_COMMAND = "@team-antioch/sc2-doodad-finder";

/** A first call's cost, guessed before Jev has answered: well above what a 30-effect ask costs. */
const FIRST_CALL_GUESS = 0.005;

export { NARROWING_P95_MS, WARM_START_MS };

/** The expected effects the cards don't have: a typo, or an effect the looks no longer hold. */
export const unknownEffects = (testCase: NarrowingCase, cards: ReadonlyMap<string, unknown>): string[] => testCase.targets.filter((id) => !cards.has(id));

type Opened = { readonly finder: EffectFinder; readonly ms: number };

async function open(model: string, ranked: Parameters<typeof openEffectFinder>[0]["ranker"] = undefined, budget?: number): Promise<Opened> {
  const started = performance.now();
  const embedder = await localEmbedder({ model });
  const finder = await openEffectFinder({ cards: effectCards(), embedder, cacheFile: effectVectorCacheFile(model, catalogCacheDir()), ranker: ranked, ...(budget !== undefined ? { cap: spendCap(budget) } : {}) });
  return { finder, ms: performance.now() - started };
}

type CaseResult = {
  readonly case: NarrowingCase;
  readonly unknown: readonly string[];
  readonly found: Hits;
  readonly top: Hits;
  readonly missed: readonly string[];
  readonly narrowed: readonly string[];
  readonly narrowP50: number;
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { asks: { type: "string" }, "tick-log": { type: "string" }, runs: { type: "string" }, model: { type: "string" }, "no-rank": { type: "boolean" }, budget: { type: "string" }, json: { type: "boolean" }, "start-only": { type: "boolean" }, help: { type: "boolean" } },
  });
  if (values.help) return void console.log(USAGE);
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const model = values.model ?? FINDER_MODEL;
  if (values["start-only"]) {
    const { finder } = await open(model);
    await finder.narrow("warm start");
    finder.close();
    return;
  }
  const runs = Number(values.runs ?? 5);
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs takes a whole number above 0\n${USAGE}`);
  const budget = Number(values.budget ?? 0.5);
  if (!(budget >= 0)) throw new Error(`--budget takes US dollars, 0 or more\n${USAGE}`);
  const asksFile = values.asks !== undefined ? path.resolve(cwd, values.asks) : REPO_TEST_ASKS;
  if (!existsSync(asksFile)) throw new Error(`No test asks at ${asksFile}: give a file with --asks\n${USAGE}`);

  const log = values.json ? () => {} : (line: string) => console.log(line);
  log(`Model ${model}`);
  const payloads = payloadLogFile("effect-test-");
  const jev = values["no-rank"] ? { off: "--no-rank asked for none" } : openRanker<EffectCard>({ log: payloadLog(payloads), wording: JEV_WORDING, command: LOGIN_COMMAND });
  if (jev.off) log(`Jev is off: ${jev.off}`);
  if (jev.keySource) log(`Ranking with Jev, with ${keySourceText(jev.keySource)}`);
  const opened = await open(model, jev.ranker, budget);
  log(`Opened in ${Math.round(opened.ms)} ms (${opened.finder.cards.size} cards, ${opened.finder.embeddedOnOpen} embedded now)`);
  const warm = warmStartMs(fileURLToPath(import.meta.url), model);
  log(`Warm start in a new process: ${Math.round(warm)} ms`);

  const asked = await readTestAsks(asksFile);
  const ticks = await tickLogCases(values["tick-log"] !== undefined ? [path.join(path.resolve(cwd, values["tick-log"]), TICK_LOG_FILE)] : []);
  const cases = [...asked, ...ticks.cases];
  for (const { file, reason } of ticks.skipped) log(`Skipped ${file}: ${reason}`);
  if (!cases.length) throw new Error("No test cases: the test asks file has none and no tick log was given");

  const { finder } = opened;
  const results: CaseResult[] = [];
  const totals: number[] = [];
  for (const testCase of cases) {
    const tags = testCase.tags?.map((tag) => ({ ...tag, pinned: true }));
    let narrowed: string[] = [];
    const caseTotals: number[] = [];
    // The first run warms the case up and isn't timed.
    for (let run = 0; run <= runs; run++) {
      const narrowing = await finder.narrow(testCase.ask, tags ? { tags } : {});
      narrowed = narrowing.candidates.map(({ id }) => id);
      if (run === 0) continue;
      totals.push(narrowing.timings.total);
      caseTotals.push(narrowing.timings.total);
    }
    const found = new Set(narrowed);
    results.push({
      case: testCase,
      unknown: unknownEffects(testCase, finder.cards),
      found: hits(testCase.targets, found),
      top: topHits(narrowed, testCase.targets, TOP_EFFECTS),
      missed: testCase.targets.filter((id) => !found.has(id)),
      narrowed,
      narrowP50: percentile(caseTotals, 50),
    });
  }

  // Jev over every case's narrowed effects; the narrowing's own order for comparison.
  let spend = 0;
  let jevTop: Hits = { found: 0, of: 0 };
  let narrowingTop: Hits = { found: 0, of: 0 };
  const jevTimes: number[] = [];
  const jevErrors: string[] = [];
  let stopped: string | undefined;
  if (jev.ranker) {
    let lastCost = FIRST_CALL_GUESS;
    for (const result of results.filter((entry) => entry.narrowed.length)) {
      if (spend + 1.5 * lastCost > budget) {
        stopped = `stopped after ${jevTimes.length} asks: the next call would take the spend past $${budget.toFixed(2)}`;
        break;
      }
      const tags = result.case.tags?.map((tag) => ({ ...tag, pinned: true }));
      const answer = await finder.find(result.case.ask, tags ? { tags } : {});
      spend += answer.cost;
      if (!answer.ranked) {
        jevErrors.push(`${result.case.from}: ${answer.notRanked}`);
        log(`Jev failed on ${result.case.from}: ${answer.notRanked}`);
        continue;
      }
      lastCost = answer.cost;
      jevTimes.push(answer.timings.rank ?? 0);
      jevTop = addHits(jevTop, topHits(answer.effects.map(({ id }) => id), result.case.targets, TOP_EFFECTS));
      narrowingTop = addHits(narrowingTop, result.top);
    }
  }
  finder.close();

  const sum = (pick: (result: CaseResult) => Hits, of = results) => of.map(pick).reduce(addHits, { found: 0, of: 0 });
  const reviewed = results.filter((result) => result.case.reviewed);
  const unreviewed = results.filter((result) => !result.case.reviewed);
  const unknown = results.flatMap((result) => result.unknown.map((id) => `${result.case.from}: ${id}`));
  const p50 = percentile(totals, 50);
  const p95 = percentile(totals, 95);
  const failures = [
    ...(p95 > NARROWING_P95_MS ? [`narrowing p95 ${p95.toFixed(1)} ms is over ${NARROWING_P95_MS} ms`] : []),
    ...(warm > WARM_START_MS ? [`warm start ${Math.round(warm)} ms is over ${WARM_START_MS} ms`] : []),
    ...(jevErrors.length ? [`Jev failed on ${jevErrors.length} asks`] : []),
    ...(unknown.length ? [`${unknown.length} expected effects the cards don't have (counted as missed): ${unknown.join(", ")}`] : []),
  ];

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          cases: results.map(({ case: { from, ask, reviewed: checked }, found, top, missed, unknown: none, narrowed }) => ({ from, ask, reviewed: checked, found, top, missed, unknown: none, narrowed: narrowed.length })),
          hitRate: { all: sum((r) => r.found), reviewed: sum((r) => r.found, reviewed), unreviewed: sum((r) => r.found, unreviewed), top3: sum((r) => r.top) },
          timings: { p50, p95, narrowings: totals.length, warmStart: warm, open: opened.ms },
          ranking: jev.ranker ? { asked: jevTimes.length, top3: jevTop, narrowingOrderTop3: narrowingTop, p50: percentile(jevTimes, 50), p95: percentile(jevTimes, 95), spend, payloads, errors: jevErrors, ...(stopped ? { stopped } : {}) } : { off: jev.off },
          failures,
        },
        null,
        2,
      ),
    );
  } else {
    log("");
    for (const result of results) {
      const missed = result.missed.length ? `; missed ${result.missed.join(", ")}` : "";
      log(`${result.case.from}${result.case.reviewed ? "" : " (unreviewed)"} "${result.case.ask}": ${formatHits(result.found)} of its expected among ${result.narrowed.length}, narrowing's first ${TOP_EFFECTS} ${formatHits(result.top)}${missed}`);
    }
    log("");
    log(`Narrowing hit rate: ${formatHits(sum((r) => r.found))} (reviewed asks ${formatHits(sum((r) => r.found, reviewed))}, unreviewed ${formatHits(sum((r) => r.found, unreviewed))})`);
    log(`Narrowing's first ${TOP_EFFECTS}: ${formatHits(sum((r) => r.top))}`);
    log(`Narrowing over ${totals.length} asks: p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`);
    log(`Warm start: ${Math.round(warm)} ms`);
    if (jev.ranker) {
      log(`Jev over ${jevTimes.length} asks: first ${TOP_EFFECTS} ${formatHits(jevTop)} (the narrowing's own order ${formatHits(narrowingTop)}); p50 ${Math.round(percentile(jevTimes, 50))} ms, p95 ${Math.round(percentile(jevTimes, 95))} ms`);
      if (stopped) log(`Jev ${stopped}`);
      log(`Estimated spend this run: $${spend.toFixed(4)}; payloads in ${payloads}`);
    }
    log(failures.length ? `FAILED: ${failures.join("; ")}` : "Passed the speed targets");
  }
  if (failures.length) process.exitCode = 1;
}

// Run only as the program: importing it runs nothing.
if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
