// The ranker's payload log (docs/adr/0001): every call's exact payload and answer, a file per run in the
// cache folder's ranker-payloads/, so runs don't mix and old ones can be deleted whole.

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { catalogCacheDir } from "@teamantioch/sc2-asset-catalog/catalog/catalog-dirs.js";

import type { PayloadLog } from "./ranker.ts";

/** A new run's log file, named for when it started, after `prefix` (such as `finder-`). */
export const payloadLogFile = (prefix = "", cacheDir: string = catalogCacheDir()): string =>
  path.join(cacheDir, "ranker-payloads", `${prefix}${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);

/** A log that appends each entry to `file` as a line of JSON. */
export const payloadLog =
  (file: string): PayloadLog =>
  (entry) => {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(entry)}\n`);
  };
