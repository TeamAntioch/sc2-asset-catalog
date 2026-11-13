// The Doodad Finder's start function: opens the cards, the embeddings model and the ranker, then
// serves the page. The package's CLI calls it with the public defaults: the stock catalog
// (extracted into the cache folder on a first start), Jev when TYPESAFE_API_KEY or the key file holds a key, a $1.00
// spend cap, the platform's cache folder, and no tick log unless one is named. sc2-adjutant's own
// CLI calls it with more options.
//
// The options beyond the defaults are for sc2-adjutant and may change. Each is a value passed in
// here; nothing is discovered or loaded by name.

import path from "node:path";

import { catalogCacheDir } from "@team-antioch/sc2-asset-catalog/catalog/catalog-dirs.js";
import { gitTreeFiles, type ListGitTree } from "@team-antioch/sc2-asset-catalog/catalog/extract-catalog.js";

import { type KeySource, openRanker } from "./credentials.ts";
import { type Embedder, localEmbedder, MissingRuntimeError } from "./embedder.ts";
import { openFinder, vectorCacheFile } from "./finder.ts";
import { payloadLog, payloadLogFile } from "./payload-log.ts";
import type { Ranker } from "./ranker.ts";
import { type Badges, FINDER_PORT, startFinderServer, type TrayAction, type TrayObjects } from "./server.ts";
import { type FinderSettings, readFinderSettings, writeFinderSettings } from "./settings.ts";
import { spendCap } from "./spend-cap.ts";
import { ensureCatalog, type FinderSources, stockSources } from "./stock-sources.ts";
import { TICK_LOG_FILE } from "./tray.ts";

export { ensureCatalog, type FinderSources, stockSources } from "./stock-sources.ts";

export type StartFinderOptions = {
  /** For sc2-adjutant, may change: what the cards are made from (the stock catalog in the cache folder by default, extracted there on a first start). */
  readonly sources?: FinderSources;
  /** For sc2-adjutant, may change: a choice whose dependencies badge the cards (such as its maps). */
  readonly badges?: Badges;
  /** For sc2-adjutant, may change: buttons on the tray that hand its cards on (sc2-adjutant's own). */
  readonly trayActions?: readonly TrayAction[];
  /**
   * For sc2-adjutant, may change: objects the tray can be kept for (sc2-adjutant's searches). With one
   * named or reopened, the ranker gets its title, and its ticks and Search Part lines are saved as
   * they change. None by default: the tray is the session's.
   */
  readonly objects?: TrayObjects;
  /** For tests and sc2-adjutant, may change: the ranker; Jev with TYPESAFE_API_KEY or the key file by default, none for null. */
  readonly ranker?: Ranker | null;
  /** US dollars this session may spend on the ranker ($1.00 by default). */
  readonly budget?: number;
  /** The tick log: a folder for its ticks.jsonl, or (for sc2-adjutant, may change) the file for a badges choice. None by default. */
  readonly tickLog?: string | ((choice: string | undefined) => string);
  /** The port (4634 by default; 0 for any free one). */
  readonly port?: number;
  /** The cache folder: vectors, payload logs and settings (the platform's by default). */
  readonly cacheDir?: string;
  /** Where the page's settings are kept (in the cache folder by default). */
  readonly settingsFile?: string;
  /** For tests: the embeddings model in place of the local one, or what loads it. */
  readonly embedder?: Embedder | (() => Promise<Embedder>);
  /** For tests: the fetch a first start extracts the catalog with, and what lists the gallery when GitHub's API refuses. */
  readonly fetch?: typeof globalThis.fetch;
  readonly listGitTree?: ListGitTree;
  /** For tests: the environment the key and the config folder are read from (the process's by default). */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** For sc2-adjutant, may change: more for /status to say. */
  readonly status?: Readonly<Record<string, unknown>>;
  /** Lines worth showing the user as the Finder runs. */
  readonly log?: (line: string) => void;
};

export type RunningFinder = {
  readonly url: string;
  /** How many cards there are, and how many opening embedded. */
  readonly cards: number;
  readonly embeddedOnOpen: number;
  /** Why there is no ranker, when there is none. */
  readonly off: string | undefined;
  /** Where Jev's key came from (TYPESAFE_API_KEY or the key file), when the Finder opened Jev with one. */
  readonly keySource: KeySource | undefined;
  /** US dollars the ranker has cost this session, estimated. */
  readonly spend: number;
  /** The ranker's payload log, when there is a ranker. */
  readonly payloadLog: string | undefined;
  close(): Promise<void>;
};

export async function startFinder(options: StartFinderOptions = {}): Promise<RunningFinder> {
  const log = options.log ?? (() => {});
  const cacheDir = options.cacheDir ?? catalogCacheDir();
  const embedder = await loadTogether(cacheDir, options, log);
  const sources = options.sources ?? stockSources(cacheDir);
  const logFile = payloadLogFile("finder-", cacheDir);
  const opened: { readonly ranker?: Ranker | undefined; readonly off?: string | undefined; readonly keySource?: KeySource | undefined } =
    options.ranker === null ? { off: "ranking is turned off" } : options.ranker ? { ranker: options.ranker } : openRanker({ ...(options.env ? { env: options.env } : {}), log: payloadLog(logFile) });
  const finder = await openFinder({
    load: sources.load,
    embedder,
    cacheFile: vectorCacheFile(embedder.model, cacheDir),
    watch: sources.watch,
    onReload: ({ embedded }) => log(`Cards written again${embedded ? `, ${embedded} embedded` : ""}`),
    onError: (error) => log(`Reading the cards again failed: ${(error as Error).message}`),
  });
  const { tickLog } = options;
  const settingsFile = options.settingsFile ?? path.join(cacheDir, "finder-settings.json");
  let server;
  try {
    server = await startFinderServer({
      finder,
      ranker: opened.ranker,
      off: opened.off,
      keySource: opened.keySource,
      budget: spendCap(options.budget),
      badges: options.badges,
      trayActions: options.trayActions ?? [],
      objects: options.objects,
      tickLog: typeof tickLog === "string" ? () => path.join(tickLog, TICK_LOG_FILE) : tickLog,
      settings: await readFinderSettings(settingsFile),
      saveSettings: (settings: FinderSettings) => writeFinderSettings(settingsFile, settings),
      port: options.port ?? FINDER_PORT,
      ...(options.status ? { status: options.status } : {}),
      log,
    });
  } catch (error) {
    finder.close();
    throw error;
  }
  return {
    url: server.url,
    cards: finder.cards.size,
    embeddedOnOpen: finder.embeddedOnOpen,
    off: opened.off,
    keySource: opened.keySource,
    get spend() {
      return server.spend;
    },
    payloadLog: opened.ranker ? logFile : undefined,
    async close() {
      finder.close();
      await server.close();
    },
  };
}

/**
 * The catalog (extracted on a first start) and the model, loaded together: on a first start both
 * download. Whichever fails first is said, and a machine that can't load the model (on Windows,
 * without the Visual C++ runtime) is told so at once, the extraction stopped and quiet. Any other
 * model failure waits on the catalog, whose own failure (offline, say) is the one worth saying.
 */
async function loadTogether(cacheDir: string, options: StartFinderOptions, log: (line: string) => void): Promise<Embedder> {
  const stop = new AbortController();
  const fetch = options.fetch ?? globalThis.fetch;
  const stoppable: typeof globalThis.fetch = (input, init) => fetch(input, { ...init, signal: stop.signal });
  const quiet = (line: string) => {
    if (!stop.signal.aborted) log(line);
  };
  // A stopped API listing must not fall back to a git clone that nothing could stop.
  const listGitTree: ListGitTree = (url, folder) => (stop.signal.aborted ? Promise.reject(new Error("stopped")) : (options.listGitTree ?? gitTreeFiles)(url, folder));
  const catalog = options.sources ? Promise.resolve() : ensureCatalog(cacheDir, { log: quiet, fetch: stoppable, listGitTree });
  const model = typeof options.embedder === "function" ? options.embedder() : options.embedder ? Promise.resolve(options.embedder) : localEmbedder();
  const first = await Promise.race([
    model.then((embedder) => ({ embedder }), (error: unknown) => ({ modelError: error })),
    // The catalog's success doesn't end the race: only its failure does.
    catalog.then(() => new Promise<never>(() => {}), (error: unknown) => ({ catalogError: error })),
  ]);
  if ("catalogError" in first) throw first.catalogError;
  if ("modelError" in first) {
    if (first.modelError instanceof MissingRuntimeError) {
      stop.abort();
      catalog.catch(() => {});
      throw first.modelError;
    }
    await catalog;
    throw first.modelError;
  }
  await catalog;
  return first.embedder;
}
