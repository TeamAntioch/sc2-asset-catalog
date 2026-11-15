// The Doodad Finder's test command (docs/adr/0001), narrowing part: runs the narrowing on the
// repo's test-asks.json (each ask with the doodads it should find) and on a tick log's asks
// (`--tick-log <folder>`, a Finder's), with the real embeddings model, and reports the hit rate
// and timings, the reviewed asks apart from the rest. Then, ranking part, Jev (with
// TYPESAFE_API_KEY, else the key file `login` saved) grades every ask's narrowed candidates, and it reports the top-10 hit rate, the
// timings and the estimated spend. It fails when the narrowing's p95 is over 50 ms, a warm start
// over 3 s, Jev's p50 over 300 ms or its p95 over 800 ms, or a call fails.
//
//   npm run test-asks -- [--asks <file>] [--tick-log <folder>] [--runs n] [--model <name>] [--no-rank] [--budget dollars] [--json]
//
// Jev's are live calls, made only when this is run by hand, never by the test suite or CI: each
// sends an ask (with its object and tags) and its candidates' cards. They stop before the
// estimated spend would pass --budget (0.50 US dollars by default); --no-rank makes none. Every
// call's exact payload goes to a file per run in the cache folder's ranker-payloads/. The catalog
// is extracted into the cache folder first if it isn't there, and the model's weights download
// there the first time. A repo command only: it isn't published with the package.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { catalogCacheDir } from "@team-antioch/sc2-asset-catalog/catalog/catalog-dirs.js";

import { keySourceText, openRanker } from "../credentials.ts";
import { FINDER_MODEL, localEmbedder } from "../embedder.ts";
import { type Finder, openFinder, vectorCacheFile } from "../finder.ts";
import type { Narrowed } from "../narrow.ts";
import { payloadLog, payloadLogFile } from "../payload-log.ts";
import { orderByFit, type Ranker, type RankerName } from "../ranker.ts";
import { ensureCatalog, stockSources } from "../stock-sources.ts";
import { isMainModule } from "./is-main.ts";
import { addHits, FIRST_CALL_GUESS, formatHits, type Hits, hits, type NarrowingCase, NARROWING_P95_MS, percentile, readTestAsks, TICK_LOG_FILE, TOP_RANKED, tickLogCases, topHits, WARM_START_MS, warmStartMs } from "../test-asks.ts";

const USAGE = "Usage: npm run test-asks -- [--asks <file>] [--tick-log <folder>] [--runs n] [--model <name>] [--no-rank] [--budget dollars] [--json]";

/** The repo's test asks, from a checkout: packages/sc2-doodad-finder/{src,dist}/cli/ to the top. */
const REPO_TEST_ASKS = fileURLToPath(new URL("../../../../test-asks.json", import.meta.url));

/** The speed targets the command fails on (the narrowing's and the warm start's are the kit's). */
export { NARROWING_P95_MS, WARM_START_MS };
export const JEV_P50_MS = 300;
export const JEV_P95_MS = 800;
/** Reported only: Enter to the final order with Jev. */
export const ENTER_P50_MS = 350;

/** This run's payload log. */
const PAYLOAD_LOG = payloadLogFile();
const logPayload = payloadLog(PAYLOAD_LOG);

/** How many of an ask's expected ids count as its best ones. */
const TOP = 3;

type Opened = { readonly finder: Finder; readonly embedded: number; readonly ms: number };

async function open(model: string): Promise<Opened> {
  const started = performance.now();
  const cacheDir = catalogCacheDir();
  const [embedder] = await Promise.all([localEmbedder({ model }), ensureCatalog(cacheDir)]);
  const sources = stockSources(cacheDir);
  const finder = await openFinder({ load: sources.load, embedder, cacheFile: vectorCacheFile(model) });
  return { finder, embedded: finder.embeddedOnOpen, ms: performance.now() - started };
}

type CaseResult = {
  readonly case: NarrowingCase;
  readonly targets: Hits;
  readonly top: Hits;
  readonly accepted: Hits;
  readonly missed: readonly string[];
  readonly unknown: readonly string[];
  readonly merged: number;
  /** The narrowing's last candidates and its p50 time for this ask, for the ranker. */
  readonly narrowed: readonly Narrowed[];
  readonly narrowP50: number;
  /** The targets the catalog knows, best first. */
  readonly known: readonly string[];
};

type RankerResult = {
  readonly ranker: RankerName;
  /** Targets in the top 10, out of as many as fit there; and of each ask's best three. */
  readonly top: Hits;
  readonly best: Hits;
  /** The same asks' targets in the top 10 of the narrowing's own order, to compare with. */
  readonly narrowingTop: Hits;
  readonly times: readonly number[];
  readonly enter: readonly number[];
  readonly asked: number;
  readonly cases: readonly { readonly from: string; readonly top: Hits; readonly ms: number }[];
  readonly errors: readonly string[];
  readonly stopped?: string;
};

type Spend = { total: number; readonly budget: number };

/** One ranker over every case, sequentially, after one untimed call to open its connection; stopping before the spend would pass the budget. */
async function rankCases(ranker: Ranker, results: readonly CaseResult[], spend: Spend, log: (line: string) => void): Promise<RankerResult> {
  const none = { found: 0, of: 0 };
  const out = { top: none, best: none, narrowingTop: none, times: [] as number[], enter: [] as number[], asked: 0, cases: [] as { from: string; top: Hits; ms: number }[], errors: [] as string[] };
  let lastCost = FIRST_CALL_GUESS;
  let stopped: string | undefined;
  const asks = results.filter((result) => result.narrowed.length);
  const rank = ({ case: testCase, narrowed }: CaseResult) => ranker.rank({ ask: testCase.ask, object: testCase.object, tags: testCase.tags, candidates: narrowed.map(({ card }) => card) });
  const affordable = () => spend.total + 1.5 * lastCost <= spend.budget;
  if (asks.length && affordable()) {
    // Untimed: opens the connection. Its failure is logged, not counted against an ask.
    try {
      const ranking = await rank(asks[0]!);
      spend.total += ranking.cost;
      lastCost = ranking.cost;
    } catch (error) {
      log(`${ranker.name} failed on its untimed first call: ${(error as Error).message}`);
    }
  }
  for (const result of asks) {
    if (!affordable()) {
      stopped = `stopped after ${out.asked} asks: the next call would take the spend past $${spend.budget.toFixed(2)}`;
      break;
    }
    const { case: testCase, narrowed } = result;
    try {
      const ranking = await rank(result);
      spend.total += ranking.cost;
      lastCost = ranking.cost;
      const ordering = performance.now();
      const ordered = orderByFit(narrowed, ranking.grades).map(({ id }) => id);
      const orderMs = performance.now() - ordering;
      out.asked++;
      out.times.push(ranking.timings.total);
      out.enter.push(result.narrowP50 + ranking.timings.total + orderMs);
      const top = topHits(ordered, result.known, TOP_RANKED);
      out.top = addHits(out.top, top);
      out.best = addHits(out.best, topHits(ordered, result.known.slice(0, TOP), TOP_RANKED));
      out.narrowingTop = addHits(out.narrowingTop, topHits(narrowed.map(({ id }) => id), result.known, TOP_RANKED));
      out.cases.push({ from: testCase.from, top, ms: ranking.timings.total });
    } catch (error) {
      out.errors.push(`${testCase.from}: ${(error as Error).message}`);
      log(`${ranker.name} failed on ${testCase.from}: ${(error as Error).message}`);
    }
  }
  if (!asks.length) stopped = "had no asks: no narrowing found any candidates";
  return { ranker: ranker.name, ...out, ...(stopped ? { stopped } : {}) };
}

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
  const opened = await open(model);
  log(`Opened in ${Math.round(opened.ms)} ms (${opened.finder.cards.size} cards, ${opened.embedded} embedded now)`);
  const warm = warmStartMs(fileURLToPath(import.meta.url), model);
  log(`Warm start in a new process: ${Math.round(warm)} ms`);

  const asked = await readTestAsks(asksFile);
  const ticks = await tickLogCases(values["tick-log"] !== undefined ? [path.join(path.resolve(cwd, values["tick-log"]), TICK_LOG_FILE)] : []);
  const cases = [...asked, ...ticks.cases];
  for (const { file, reason } of ticks.skipped) log(`Skipped ${file}: ${reason}`);
  if (!cases.length) throw new Error("No test cases: the test asks file has none and no tick log was given");

  const results: CaseResult[] = [];
  const totals: number[] = [];
  const stages = { keyword: [] as number[], embed: [] as number[], nearest: [] as number[], merge: [] as number[] };
  const { finder } = opened;
  for (const testCase of cases) {
    let found: Set<string> | undefined;
    let narrowed: readonly Narrowed[] = [];
    const caseTotals: number[] = [];
    // The first run warms the case up and isn't timed.
    for (let run = 0; run <= runs; run++) {
      const narrowing = await finder.narrow(testCase.ask, { ...(testCase.tags ? { tags: testCase.tags } : {}) });
      narrowed = narrowing.candidates;
      found = new Set(narrowing.candidates.map(({ id }) => id));
      if (run === 0) continue;
      totals.push(narrowing.timings.total);
      caseTotals.push(narrowing.timings.total);
      for (const stage of Object.keys(stages) as (keyof typeof stages)[]) stages[stage].push(narrowing.timings[stage]);
    }
    const known = testCase.targets.filter((id) => finder.cards.has(id));
    const accepted = known.filter((id) => finder.cards.get(id)!.entry.uses.length > 0);
    results.push({
      case: testCase,
      targets: hits(known, found!),
      top: hits(known.slice(0, TOP), found!),
      accepted: hits(accepted, found!),
      missed: known.filter((id) => !found!.has(id)),
      unknown: testCase.targets.filter((id) => !finder.cards.has(id)),
      merged: found!.size,
      narrowed,
      narrowP50: percentile(caseTotals, 50),
      known,
    });
  }
  finder.close();

  // Jev over every case's narrowed candidates; the narrowing's own order for comparison.
  const jevOpened = values["no-rank"] ? { off: "--no-rank asked for none" } : openRanker({ log: logPayload });
  const off = jevOpened.off ? [{ ranker: "jev", reason: jevOpened.off }] : [];
  for (const { ranker, reason } of off) log(`Ranker ${ranker} is off: ${reason}`);
  if (jevOpened.keySource) log(`Ranking with Jev, with ${keySourceText(jevOpened.keySource)}`);
  const spend: Spend = { total: 0, budget };
  const ranked: RankerResult[] = [];
  if (jevOpened.ranker) ranked.push(await rankCases(jevOpened.ranker, results, spend, log));

  const sum = (pick: (result: CaseResult) => Hits, of = results) => of.map(pick).reduce(addHits, { found: 0, of: 0 });
  const reviewed = results.filter((result) => result.case.reviewed);
  const unreviewed = results.filter((result) => !result.case.reviewed);
  const p50 = percentile(totals, 50);
  const p95 = percentile(totals, 95);
  const stageP50 = Object.fromEntries(Object.entries(stages).map(([stage, times]) => [stage, percentile(times, 50)]));
  const jev = ranked.find(({ ranker }) => ranker === "jev");
  const jevP50 = jev ? percentile(jev.times, 50) : Number.NaN;
  const jevP95 = jev ? percentile(jev.times, 95) : Number.NaN;
  const failures = [
    ...(p95 > NARROWING_P95_MS ? [`narrowing p95 ${p95.toFixed(1)} ms is over ${NARROWING_P95_MS} ms`] : []),
    ...(warm > WARM_START_MS ? [`warm start ${Math.round(warm)} ms is over ${WARM_START_MS} ms`] : []),
    // Jev with a key but no timed ask can't pass its targets.
    ...(jev && !jev.times.length ? ["Jev timed no asks, so its speed targets weren't measured"] : []),
    ...(jevP50 > JEV_P50_MS ? [`Jev p50 ${Math.round(jevP50)} ms is over ${JEV_P50_MS} ms`] : []),
    ...(jevP95 > JEV_P95_MS ? [`Jev p95 ${Math.round(jevP95)} ms is over ${JEV_P95_MS} ms`] : []),
    ...ranked.filter(({ errors }) => errors.length).map(({ ranker, errors }) => `${ranker} failed on ${errors.length} asks`),
  ];
  const rankerSummary = (result: RankerResult) => ({
    ranker: result.ranker,
    asked: result.asked,
    top10: result.top,
    best3InTop10: result.best,
    narrowingOrderTop10: result.narrowingTop,
    p50: percentile(result.times, 50),
    p95: percentile(result.times, 95),
    enterP50: percentile(result.enter, 50),
    cases: result.cases,
    errors: result.errors,
    ...(result.stopped ? { stopped: result.stopped } : {}),
  });

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          cases: results.map(({ case: { from, ask, reviewed: checked }, narrowed: _narrowed, narrowP50: _narrowP50, known: _known, ...rest }) => ({ from, ask, reviewed: checked, ...rest })),
          hitRate: { targets: sum((r) => r.targets), reviewed: sum((r) => r.targets, reviewed), unreviewed: sum((r) => r.targets, unreviewed), top: sum((r) => r.top), accepted: sum((r) => r.accepted) },
          timings: { p50, p95, stageP50, narrowings: totals.length, warmStart: warm, open: opened.ms },
          ranking: { rankers: ranked.map(rankerSummary), off, spend: spend.total, payloads: PAYLOAD_LOG },
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
      const unknown = result.unknown.length ? `; not in the catalog ${result.unknown.join(", ")}` : "";
      log(`${result.case.from}${result.case.reviewed ? "" : " (unreviewed)"} "${result.case.ask}": ${formatHits(result.targets)} of its expected among ${result.merged}, top ${TOP} ${formatHits(result.top)}${missed}${unknown}`);
    }
    log("");
    log(`Narrowing hit rate: ${formatHits(sum((r) => r.targets))} (reviewed asks ${formatHits(sum((r) => r.targets, reviewed))}, unreviewed ${formatHits(sum((r) => r.targets, unreviewed))})`);
    log(`Narrowing hit rate, top ${TOP} of each ask: ${formatHits(sum((r) => r.top))}`);
    log(`Narrowing hit rate, with a Doodad Use: ${formatHits(sum((r) => r.accepted))}`);
    log(
      `Narrowing over ${totals.length} asks: p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms (p50 keyword ${stageP50.keyword!.toFixed(1)}, embed ${stageP50.embed!.toFixed(1)}, nearest ${stageP50.nearest!.toFixed(1)}, merge ${stageP50.merge!.toFixed(1)} ms)`,
    );
    log(`Warm start: ${Math.round(warm)} ms`);
    log("");
    for (const result of ranked) {
      const summary = rankerSummary(result);
      for (const { from, top, ms } of result.cases) log(`  ${result.ranker} ${from}: top ${TOP_RANKED} ${formatHits(top)} in ${Math.round(ms)} ms`);
      log(
        `${result.ranker} over ${result.asked} asks: top ${TOP_RANKED} ${formatHits(result.top)} (the narrowing's own order ${formatHits(result.narrowingTop)}), best ${TOP} of each ask in the top ${TOP_RANKED} ${formatHits(result.best)}`,
      );
      log(`${result.ranker} timings: p50 ${Math.round(summary.p50)} ms, p95 ${Math.round(summary.p95)} ms; Enter to final order (narrowing + ranking + order) p50 ${Math.round(summary.enterP50)} ms (target ${ENTER_P50_MS} ms, reported only)`);
      if (result.stopped) log(`${result.ranker} ${result.stopped}`);
    }
    if (jevOpened.ranker) log(`Estimated spend this run: $${spend.total.toFixed(4)}; payloads in ${PAYLOAD_LOG}`);
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
