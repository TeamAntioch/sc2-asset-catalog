// The Music Finder's start function: opens the cards, the embeddings model and the ranker, then
// serves the page. The package's CLI calls it with the public defaults: the stock music (the ids
// extracted into the cache folder on a first start, joined to the shipped listening notes), Jev
// when TYPESAFE_API_KEY or the key file holds a key, a $1.00 spend cap, the platform's cache
// folder, no Audio folder and no tick log unless one is named. sc2-adjutant's own wrapper calls it
// with more options.
//
// The options beyond the defaults are for sc2-adjutant and may change. Each is a value passed in
// here; nothing is discovered or loaded by name.

import path from "node:path";

import { catalogCacheDir } from "@team-antioch/sc2-asset-catalog/catalog/catalog-dirs.js";
import type { ExtractMusicOptions } from "@team-antioch/sc2-asset-catalog/catalog/extract-music.js";
import { unextractedNotesReport } from "@team-antioch/sc2-asset-catalog/catalog/music-catalog.js";
import type { Embedder } from "@team-antioch/sc2-finder-kit/embedder.js";
import { loadTogether } from "@team-antioch/sc2-finder-kit/load-together.js";
import { payloadLog, payloadLogFile } from "@team-antioch/sc2-finder-kit/payload-log.js";
import type { Ranker } from "@team-antioch/sc2-finder-kit/ranker.js";
import { type FinderSettings, readFinderSettings, writeFinderSettings } from "@team-antioch/sc2-finder-kit/settings.js";
import { spendCap } from "@team-antioch/sc2-finder-kit/spend-cap.js";
import { TICK_LOG_FILE } from "@team-antioch/sc2-finder-kit/tray.js";

import { type AudioIndex, indexAudioFolder } from "./audio.ts";
import type { MusicLayer } from "./cards.ts";
import { type KeySource, openRanker } from "./credentials.ts";
import { musicVectorCacheFile, openFinder } from "./finder.ts";
import { MUSIC_FINDER_PORT, startFinderServer, type TrayAction } from "./server.ts";
import { ensureMusic, type FinderSources, stockSources } from "./sources.ts";

export { ensureMusic, type FinderSources, stockSources } from "./sources.ts";
export type { AudioIndex } from "./audio.ts";
export type { MusicFact, MusicLayer, MusicLayerFields, MusicSources } from "./cards.ts";
export { MUSIC_FINDER_PORT, type TrayAction, type TrayActionContext, type TrayActionInput, type TrayActionResult } from "./server.ts";

export type StartFinderOptions = {
  /** For sc2-adjutant, may change: what the cards are made from (the stock music in the cache folder by default, extracted there on a first start). */
  readonly sources?: FinderSources;
  /** For sc2-adjutant, may change: what its own sources add to each card, such as album titles and composers: `text` is searched, `facts` are shown. */
  readonly layer?: MusicLayer;
  /** For sc2-adjutant, may change: buttons on the tray that hand its cards on (sc2-adjutant's own). */
  readonly trayActions?: readonly TrayAction[];
  /** The Audio folder: a folder of the game's music .ogg files the user extracted, or its index. Cards play from it; without one they say how to hear them. */
  readonly audio?: string | AudioIndex;
  /** For tests and sc2-adjutant, may change: the ranker; Jev with TYPESAFE_API_KEY or the key file by default, none for null. */
  readonly ranker?: Ranker | null;
  /** US dollars this session may spend on the ranker ($1.00 by default). */
  readonly budget?: number;
  /** The tick log: a folder for its ticks.jsonl, or (for sc2-adjutant, may change) the file for a choice. None by default. */
  readonly tickLog?: string | ((choice: string | undefined) => string);
  /** The port (4635 by default; 0 for any free one). */
  readonly port?: number;
  /** The cache folder: vectors, payload logs and settings (the platform's by default). */
  readonly cacheDir?: string;
  /** Where the page's settings are kept (in the cache folder by default). */
  readonly settingsFile?: string;
  /** For tests: the embeddings model in place of the local one, or what loads it. */
  readonly embedder?: Embedder | (() => Promise<Embedder>);
  /** For tests: the fetch and the listing a first start extracts the music with. */
  readonly fetch?: typeof globalThis.fetch;
  readonly listMirrorFiles?: ExtractMusicOptions["listMirrorFiles"];
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
  /** How many files the Audio folder holds, when there is one. */
  readonly audioFiles: number | undefined;
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

export async function startMusicFinder(options: StartFinderOptions = {}): Promise<RunningFinder> {
  const log = options.log ?? (() => {});
  const cacheDir = options.cacheDir ?? catalogCacheDir();
  // A bad Audio folder is said before anything downloads.
  const audio = typeof options.audio === "string" ? await indexAudioFolder(options.audio) : options.audio;
  if (audio?.duplicates.length) log(`${audio.duplicates.length} file names are in the Audio folder more than once; the first of each is used`);
  const embedder = await loadTogether({
    ...(options.embedder ? { embedder: options.embedder } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    log,
    extract: options.sources
      ? undefined
      : ({ log: quiet, fetch }) => ensureMusic(cacheDir, { log: quiet, fetch, ...(options.listMirrorFiles ? { listMirrorFiles: options.listMirrorFiles } : {}), ...(options.env ? { env: options.env } : {}) }),
  });
  const chosen = options.sources ?? stockSources(cacheDir);
  // Notes whose file no id plays are left out; the first read says how many.
  let reported = false;
  const sources: FinderSources = {
    watch: chosen.watch,
    load: async () => {
      const loaded = await chosen.load();
      const report = reported ? undefined : unextractedNotesReport(loaded.catalog);
      reported = true;
      if (report) log(report);
      return loaded;
    },
  };
  const logFile = payloadLogFile("music-finder-", cacheDir);
  const opened: { readonly ranker?: Ranker | undefined; readonly off?: string | undefined; readonly keySource?: KeySource | undefined } =
    options.ranker === null ? { off: "ranking is turned off" } : options.ranker ? { ranker: options.ranker } : openRanker({ ...(options.env ? { env: options.env } : {}), log: payloadLog(logFile) });
  const finder = await openFinder({
    load: sources.load,
    embedder,
    cacheFile: musicVectorCacheFile(embedder.model, cacheDir),
    watch: sources.watch,
    ...(options.layer ? { layer: options.layer } : {}),
    // Said once, the first time an ask is cut: every ask this long is, and a line a keystroke would drown the rest.
    onCut: ((said = false) => ({ kept, cut }: { kept: number; cut: number }) => {
      if (said) return;
      said = true;
      log(`Jev takes about 55,000 tokens of tracks in one request, so an ask's ${kept + cut} candidates are cut to the best ${kept}; the rest aren't ranked or shown`);
    })(),
    onReload: ({ embedded }) => log(`Cards written again${embedded ? `, ${embedded} embedded` : ""}`),
    onError: (error) => log(`Reading the cards again failed: ${(error as Error).message}`),
  });
  const { tickLog } = options;
  const settingsFile = options.settingsFile ?? path.join(cacheDir, "music-finder-settings.json");
  let server;
  try {
    server = await startFinderServer({
      finder,
      audio,
      ranker: opened.ranker,
      off: opened.off,
      keySource: opened.keySource,
      budget: spendCap(options.budget),
      trayActions: options.trayActions ?? [],
      tickLog: typeof tickLog === "string" ? () => path.join(tickLog, TICK_LOG_FILE) : tickLog,
      settings: await readFinderSettings(settingsFile),
      saveSettings: (settings: FinderSettings) => writeFinderSettings(settingsFile, settings),
      port: options.port ?? MUSIC_FINDER_PORT,
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
    audioFiles: audio?.files.size,
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
