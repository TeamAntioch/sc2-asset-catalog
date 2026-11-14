// The Music Finder's test command (docs/adr/0004): runs the narrowing on the repo's
// test-music-asks.json (each ask with the tracks it should find) and on a tick log's asks
// (`--tick-log <folder>`, a Finder's), with the real embeddings model, and reports the hit rate
// and timings, the reviewed asks apart from the rest. Then, when a TypeSafe key is set (with
// TYPESAFE_API_KEY, else the key file `login` saved), Jev grades every ask's narrowed candidates
// and it reports the top-10 hit rate against the narrowing's own order, its timings and the
// estimated spend. It fails when the narrowing's p95 is over 50 ms, a warm start is over 3 s, or a
// Jev call fails.
//
//   npm run test-music-asks -- [--asks <file>] [--tick-log <folder>] [--runs n] [--model <name>] [--no-rank] [--budget dollars] [--json]
//
// An ask's expected tracks are music files by base name (`P07CinePart02`, in any case), or card
// ids: the game's ids shift between patches and several ids can play one file, so a track counts as
// found when any card that plays it is among the candidates. Jev's calls are live, made only when
// this is run by hand, never by the test suite or CI; each sends an ask and its candidates' cards,
// and they stop before the estimated spend would pass --budget (0.50 US dollars by default).
// Every call's exact payload goes to a file in the cache folder. The music ids are extracted into
// the cache folder first if they aren't there. A repo command only: it isn't published with the
// package.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { catalogCacheDir } from "@team-antioch/sc2-asset-catalog/catalog/catalog-dirs.js";
import { FINDER_MODEL, localEmbedder } from "@team-antioch/sc2-finder-kit/embedder.js";
import type { Narrowed } from "@team-antioch/sc2-finder-kit/narrow.js";
import { payloadLog, payloadLogFile } from "@team-antioch/sc2-finder-kit/payload-log.js";
import { orderByFit } from "@team-antioch/sc2-finder-kit/ranker.js";
import { addHits, formatHits, type Hits, type NarrowingCase, percentile, readTestAsks, TICK_LOG_FILE, tickLogCases } from "@team-antioch/sc2-finder-kit/test-asks.js";

import type { MusicCard } from "../cards.ts";
import { keySourceText, openRanker } from "../credentials.ts";
import { type Finder, musicVectorCacheFile, openFinder } from "../finder.ts";
import { ensureMusic, stockSources } from "../sources.ts";
import { isMainModule } from "./is-main.ts";

const USAGE = "Usage: npm run test-music-asks -- [--asks <file>] [--tick-log <folder>] [--runs n] [--model <name>] [--no-rank] [--budget dollars] [--json]";

/** The repo's test asks, from a checkout: packages/sc2-music-finder/{src,dist}/cli/ to the top. */
const REPO_TEST_ASKS = fileURLToPath(new URL("../../../../test-music-asks.json", import.meta.url));

/** The speed targets the command fails on. */
export const NARROWING_P95_MS = 50;
export const WARM_START_MS = 3000;

/** How many of the ranked candidates the mapper sees first. */
const TOP_RANKED = 10;
/** A first call's cost, guessed before any ranker has answered: well above what a 200-card ask costs. */
const FIRST_CALL_GUESS = 0.01;

/** The card ids that play an expected track: the card with that id, or every card with a file of that base name. */
export function cardsFor(expected: string, cards: ReadonlyMap<string, MusicCard>): string[] {
  if (cards.has(expected)) return [expected];
  const key = expected.toLowerCase();
  return [...cards.values()].filter((card) => card.pieces.some((piece) => piece.key === key)).map((card) => card.id);
}

/** How many expected tracks any of whose cards is among some ids. */
export function trackHits(expected: readonly (readonly string[])[], found: ReadonlySet<string>): Hits {
  return { found: expected.filter((ids) => ids.some((id) => found.has(id))).length, of: expected.length };
}

type Opened = { readonly finder: Finder; readonly embedded: number; readonly ms: number };

async function open(model: string): Promise<Opened> {
  const started = performance.now();
  const cacheDir = catalogCacheDir();
  const [embedder] = await Promise.all([localEmbedder({ model }), ensureMusic(cacheDir, { log: (line) => console.error(line) })]);
  const sources = stockSources(cacheDir);
  const finder = await openFinder({ load: sources.load, embedder, cacheFile: musicVectorCacheFile(model) });
  return { finder, embedded: finder.embeddedOnOpen, ms: performance.now() - started };
}

/** A warm start, in a process of its own so nothing is loaded yet: Node starting, the model, the sources, the cards and the cache. */
function warmStart(model: string): number {
  const started = performance.now();
  const self = fileURLToPath(import.meta.url);
  const run = spawnSync(process.execPath, [self, "--start-only", "--model", model], { encoding: "utf8" });
  const ms = performance.now() - started;
  if (run.status !== 0) throw new Error(`The warm start failed: ${run.stderr.trim()}`);
  return ms;
}

type CaseResult = {
  readonly case: NarrowingCase;
  /** Each expected track as the card ids that play it; tracks no card plays are in `unknown`. */
  readonly tracks: readonly (readonly string[])[];
  readonly unknown: readonly string[];
  readonly found: Hits;
  readonly top: Hits;
  readonly missed: readonly string[];
  readonly merged: number;
  readonly narrowed: readonly Narrowed<MusicCard>[];
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
  const opened = await open(model);
  log(`Opened in ${Math.round(opened.ms)} ms (${opened.finder.cards.size} cards, ${opened.embedded} embedded now)`);
  const warm = warmStart(model);
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
    const tracks: string[][] = [];
    const names: string[] = [];
    const unknown: string[] = [];
    for (const expected of testCase.targets) {
      const ids = cardsFor(expected, finder.cards);
      if (ids.length) {
        tracks.push(ids);
        names.push(expected);
      } else unknown.push(expected);
    }
    let found = new Set<string>();
    let narrowed: readonly Narrowed<MusicCard>[] = [];
    const caseTotals: number[] = [];
    // The first run warms the case up and isn't timed.
    for (let run = 0; run <= runs; run++) {
      const narrowing = await finder.narrow(testCase.ask, { ...(testCase.tags ? { tags: testCase.tags.map((tag) => ({ ...tag, pinned: true })) } : {}) });
      narrowed = narrowing.candidates;
      found = new Set(narrowing.candidates.map(({ id }) => id));
      if (run === 0) continue;
      totals.push(narrowing.timings.total);
      caseTotals.push(narrowing.timings.total);
    }
    results.push({
      case: testCase,
      tracks,
      unknown,
      found: trackHits(tracks, found),
      top: trackHits(tracks.slice(0, 3), found),
      missed: names.filter((_, i) => !tracks[i]!.some((id) => found.has(id))),
      merged: found.size,
      narrowed,
      narrowP50: percentile(caseTotals, 50),
    });
  }
  finder.close();

  // Jev over every case's narrowed candidates; the narrowing's own order for comparison.
  const PAYLOAD_LOG = payloadLogFile("music-test-");
  const jevOpened = values["no-rank"] ? { off: "--no-rank asked for none" } : openRanker({ log: payloadLog(PAYLOAD_LOG) });
  if (jevOpened.off) log(`Jev is off: ${jevOpened.off}`);
  if (jevOpened.keySource) log(`Ranking with Jev, with ${keySourceText(jevOpened.keySource)}`);
  let spend = 0;
  let jevTop: Hits = { found: 0, of: 0 };
  let narrowingTop: Hits = { found: 0, of: 0 };
  const jevTimes: number[] = [];
  const jevErrors: string[] = [];
  let stopped: string | undefined;
  if (jevOpened.ranker) {
    let lastCost = FIRST_CALL_GUESS;
    const asks = results.filter((result) => result.narrowed.length && result.tracks.length);
    for (const result of asks) {
      if (spend + 1.5 * lastCost > budget) {
        stopped = `stopped after ${jevTimes.length} asks: the next call would take the spend past $${budget.toFixed(2)}`;
        break;
      }
      try {
        const ranking = await jevOpened.ranker.rank({ ask: result.case.ask, object: result.case.object, tags: result.case.tags?.map((tag) => ({ ...tag, pinned: true })), candidates: result.narrowed.map(({ card }) => card) });
        spend += ranking.cost;
        lastCost = ranking.cost;
        jevTimes.push(ranking.timings.total);
        const ordered = orderByFit(result.narrowed, ranking.grades).map(({ id }) => id);
        jevTop = addHits(jevTop, trackHits(result.tracks, new Set(ordered.slice(0, TOP_RANKED))));
        narrowingTop = addHits(narrowingTop, trackHits(result.tracks, new Set(result.narrowed.slice(0, TOP_RANKED).map(({ id }) => id))));
      } catch (error) {
        jevErrors.push(`${result.case.from}: ${(error as Error).message}`);
        log(`Jev failed on ${result.case.from}: ${(error as Error).message}`);
      }
    }
  }

  const sum = (pick: (result: CaseResult) => Hits, of = results) => of.map(pick).reduce(addHits, { found: 0, of: 0 });
  const reviewed = results.filter((result) => result.case.reviewed);
  const unreviewed = results.filter((result) => !result.case.reviewed);
  const p50 = percentile(totals, 50);
  const p95 = percentile(totals, 95);
  const failures = [
    ...(p95 > NARROWING_P95_MS ? [`narrowing p95 ${p95.toFixed(1)} ms is over ${NARROWING_P95_MS} ms`] : []),
    ...(warm > WARM_START_MS ? [`warm start ${Math.round(warm)} ms is over ${WARM_START_MS} ms`] : []),
    ...(jevErrors.length ? [`Jev failed on ${jevErrors.length} asks`] : []),
  ];

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          cases: results.map(({ case: { from, ask, reviewed: checked }, found, top, missed, unknown, merged }) => ({ from, ask, reviewed: checked, found, top, missed, unknown, merged })),
          hitRate: { all: sum((r) => r.found), reviewed: sum((r) => r.found, reviewed), unreviewed: sum((r) => r.found, unreviewed), top3: sum((r) => r.top) },
          timings: { p50, p95, narrowings: totals.length, warmStart: warm, open: opened.ms },
          ranking: jevOpened.ranker ? { asked: jevTimes.length, top10: jevTop, narrowingOrderTop10: narrowingTop, p50: percentile(jevTimes, 50), p95: percentile(jevTimes, 95), spend, payloads: PAYLOAD_LOG, errors: jevErrors, ...(stopped ? { stopped } : {}) } : { off: jevOpened.off },
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
      const unknown = result.unknown.length ? `; no card plays ${result.unknown.join(", ")}` : "";
      log(`${result.case.from}${result.case.reviewed ? "" : " (unreviewed)"} "${result.case.ask}": ${formatHits(result.found)} of its expected among ${result.merged}, first 3 ${formatHits(result.top)}${missed}${unknown}`);
    }
    log("");
    log(`Narrowing hit rate: ${formatHits(sum((r) => r.found))} (reviewed asks ${formatHits(sum((r) => r.found, reviewed))}, unreviewed ${formatHits(sum((r) => r.found, unreviewed))})`);
    log(`Narrowing hit rate, first 3 expected of each ask: ${formatHits(sum((r) => r.top))}`);
    log(`Narrowing over ${totals.length} asks: p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`);
    log(`Warm start: ${Math.round(warm)} ms`);
    if (jevOpened.ranker) {
      log(`Jev over ${jevTimes.length} asks: top ${TOP_RANKED} ${formatHits(jevTop)} (the narrowing's own order ${formatHits(narrowingTop)}); p50 ${Math.round(percentile(jevTimes, 50))} ms, p95 ${Math.round(percentile(jevTimes, 95))} ms`);
      if (stopped) log(`Jev ${stopped}`);
      log(`Estimated spend this run: $${spend.toFixed(4)}; payloads in ${PAYLOAD_LOG}`);
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
