// What the Finder's page remembers between runs: the last badges choice and how long typing pauses
// before it ranks, as a small JSON file. A file that is missing or doesn't read is no settings.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** What the page remembers between runs. */
export type FinderSettings = { readonly lastChoice?: string | undefined; readonly idleMs?: number | undefined };

export async function readFinderSettings(file: string): Promise<FinderSettings> {
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    return {
      ...(typeof raw.lastChoice === "string" ? { lastChoice: raw.lastChoice } : {}),
      ...(typeof raw.idleMs === "number" && raw.idleMs >= 250 ? { idleMs: raw.idleMs } : {}),
    };
  } catch {
    return {};
  }
}

export async function writeFinderSettings(file: string, settings: FinderSettings): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(settings)}\n`);
}
