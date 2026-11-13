// The ranker's credential (docs/adr/0001), held by the Finder's process alone: Jev's key from
// TYPESAFE_API_KEY in the environment, else the key file `sc2-doodad-finder login` saved
// (key-file.ts), on every platform. The variable wins. With no key, Jev is off, with a message
// saying how to give it one, and asks are narrowed only.

import { type ConfigPlatform, keyFile, readKeyFile } from "./key-file.ts";
import { jevRanker } from "./jev-ranker.ts";
import type { PayloadLog, Ranker } from "./ranker.ts";
import { npxHint } from "@team-antioch/sc2-asset-catalog/util/npx.js";

export const NO_JEV_KEY =
  `no TypeSafe key: run \`${npxHint("@team-antioch/sc2-doodad-finder login")}\`, or set TYPESAFE_API_KEY, to rank with Jev; until then the narrowing's order is shown`;

/** Where a key came from: what /status and the CLI may say, never the key. */
export type KeySource = "environment" | "key file";

/** Jev's key and where it came from: TYPESAFE_API_KEY, else the key file, else none. */
export function jevKey(on: ConfigPlatform = {}): { readonly key: string; readonly source: KeySource } | undefined {
  const fromEnv = (on.env ?? process.env).TYPESAFE_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: "environment" };
  const fromFile = readKeyFile(on);
  return fromFile ? { key: fromFile, source: "key file" } : undefined;
}

/** Jev's key alone: TYPESAFE_API_KEY, else the key file, else none. */
export const jevApiKey = (on: ConfigPlatform = {}): string | undefined => jevKey(on)?.key;

/** The ranker when it has its credential, and where that came from, else why it is off. */
export type OpenedRanker = { readonly ranker: Ranker; readonly keySource: KeySource; readonly off?: undefined } | { readonly ranker?: undefined; readonly keySource?: undefined; readonly off: string };

/** Where a key came from, in words. */
export const keySourceText = (source: KeySource): string => (source === "environment" ? "the key in TYPESAFE_API_KEY" : "the saved key");

/** Jev with its key, else off: with no key, or (Jev being optional) a key file that can't be read. */
export function openRanker({ env, log }: { readonly env?: Readonly<Record<string, string | undefined>>; readonly log?: PayloadLog } = {}): OpenedRanker {
  const on = env ? { env } : {};
  let found;
  try {
    found = jevKey(on);
  } catch (error) {
    return { off: `can't read the key file ${keyFile(on)} (${(error as Error).message}): run \`${npxHint("@team-antioch/sc2-doodad-finder login")}\` again, or set TYPESAFE_API_KEY` };
  }
  return found ? { ranker: jevRanker({ apiKey: found.key, ...(log ? { log } : {}) }), keySource: found.source } : { off: NO_JEV_KEY };
}
