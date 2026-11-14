// A finder's test cases (docs/adr/0001): a test-asks.json, typical mappers' asks each
// with the cards it should find, and the asks in a tick log (`--tick-log`), each with the cards
// ticked from it. A test ask is marked `reviewed` once its expected ids have been checked by hand.
//
//   { "about": "…", "asks": [{ "ask": "press head", "object": "crushing press over a conveyor belt",
//     "expected": ["SpaceDockArch", …], "from": "crushing press search, part name", "reviewed": true }] }

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import { parseJsonFile, TextSchema as Text } from "@team-antioch/sc2-asset-catalog/util/parse-json.js";
import { z } from "zod";

import type { Tag } from "./card.ts";

export { TICK_LOG_FILE } from "./tray.ts";

/** One ask and the cards it should find. */
export type NarrowingCase = {
  /** Where it came from: a test ask's source, or a tick log's line. */
  readonly from: string;
  readonly ask: string;
  /** The object the ask is a part of, when it is one. */
  readonly object?: string;
  readonly tags?: readonly Tag[];
  /** The ids it should find, best first. */
  readonly targets: readonly string[];
  /** Whether its targets were checked by hand: a tick log's always are. */
  readonly reviewed: boolean;
};

const TestAskSchema = z
  .object({
    ask: Text,
    object: Text.optional(),
    tags: z.array(z.object({ facet: Text, value: Text }).strict()).optional(),
    expected: z.array(Text).min(1),
    from: Text.optional(),
    reviewed: z.boolean(),
  })
  .strict();

const TestAsksSchema = z.object({ about: z.string().optional(), asks: z.array(TestAskSchema) }).strict();

/** A test asks file's cases, refused naming `shown` and each issue's path when it isn't valid. */
export function parseTestAsks(text: string, shown: string): NarrowingCase[] {
  return parseJsonFile(text, shown, TestAsksSchema, "a valid test asks file").asks.map(({ ask, object, tags, expected, from, reviewed }, i) => ({
    from: from ?? `${shown} ask ${i + 1}`,
    ask,
    ...(object !== undefined ? { object } : {}),
    ...(tags !== undefined ? { tags: tags as Tag[] } : {}),
    targets: expected,
    reviewed,
  }));
}

export const readTestAsks = async (file: string): Promise<NarrowingCase[]> => parseTestAsks(await readFile(file, "utf8"), file);

/** A tick log's line: the ask, its tags, the ids ticked from it so far, best first. The Finder appends one on every tick, so an ask's last line holds all its ticks. */
export type TickLine = { readonly ask: string; readonly tags?: readonly Tag[]; readonly ticked: readonly string[]; readonly object?: string };

export type ReadCases = { readonly cases: NarrowingCase[]; readonly skipped: { readonly file: string; readonly reason: string }[] };

/** A case per ask in each tick log, from the ask's last line. A file that isn't there is skipped quietly, a line that doesn't read with its reason. */
export async function tickLogCases(files: readonly string[]): Promise<ReadCases> {
  const skipped: ReadCases["skipped"] = [];
  const latest = new Map<string, NarrowingCase>();
  for (const file of files) {
    const text = await readFile(file, "utf8").catch(() => undefined);
    if (text === undefined) continue;
    text.split("\n").forEach((line, i) => {
      if (!line.trim()) return;
      try {
        const tick = JSON.parse(line) as TickLine;
        if (typeof tick.ask !== "string" || !Array.isArray(tick.ticked)) throw new Error("needs an ask and the ids ticked");
        const object = typeof tick.object === "string" ? tick.object : undefined;
        // A later line for the ask replaces an earlier one, keeping its place.
        latest.set(JSON.stringify([file, object, tick.ask]), {
          from: `tick log line ${i + 1}`,
          ask: tick.ask,
          ...(object ? { object } : {}),
          ...(tick.tags ? { tags: tick.tags } : {}),
          targets: tick.ticked,
          reviewed: true,
        });
      } catch (error) {
        skipped.push({ file: `${file}:${i + 1}`, reason: (error as Error).message });
      }
    });
  }
  return { cases: [...latest.values()].filter(({ targets }) => targets.length), skipped };
}

/** How many of some ids were found: a hit rate's numerator and denominator. */
export type Hits = { readonly found: number; readonly of: number };

export const hits = (ids: readonly string[], found: ReadonlySet<string>): Hits => ({ found: ids.filter((id) => found.has(id)).length, of: ids.length });

export const addHits = (a: Hits, b: Hits): Hits => ({ found: a.found + b.found, of: a.of + b.of });

export const formatHits = ({ found, of }: Hits): string => (of ? `${found}/${of} (${Math.round((100 * found) / of)}%)` : "none");

/** The p-th percentile (0-100) of some numbers, by nearest rank. */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
}

/** How many targets a ranked list has in its top n, out of as many of them as could be there. */
export const topHits = (ranked: readonly string[], targets: readonly string[], n: number): Hits => {
  const top = new Set(ranked.slice(0, n));
  return { found: targets.filter((id) => top.has(id)).length, of: Math.min(n, targets.length) };
};

/** The speed targets a finder's test command fails on. */
export const NARROWING_P95_MS = 50;
export const WARM_START_MS = 3000;

/** How many of the ranked candidates the mapper sees first. */
export const TOP_RANKED = 10;
/** A first call's cost, guessed before any ranker has answered: well above what a 200-card ask costs. */
export const FIRST_CALL_GUESS = 0.01;

/**
 * A warm start, in a process of its own so nothing is loaded yet: Node starting, the model, the
 * sources, the cards and the cache. `command` is the CLI module that takes `--start-only --model`.
 */
export function warmStartMs(command: string, model: string): number {
  const started = performance.now();
  const run = spawnSync(process.execPath, [command, "--start-only", "--model", model], { encoding: "utf8" });
  const ms = performance.now() - started;
  if (run.status !== 0) throw new Error(`The warm start failed: ${run.stderr.trim()}`);
  return ms;
}
