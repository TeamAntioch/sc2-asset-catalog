// The Set Finder's start function: makes the cards, opens the embeddings model and the ranker, then
// serves the page. The package's CLI calls it with the public defaults: the published sets (the
// catalog's set looks, their pictures linked from the sc2-mapping-reference gallery), Jev when
// TYPESAFE_API_KEY or the key file holds a key, a $1.00 spend cap, the platform's cache folder and
// no tick log unless one is named. sc2-adjutant calls it with its own sets laid over the published
// ones.
//
// The options beyond the defaults are for sc2-adjutant and may change. Each is a value passed in
// here; nothing is discovered or loaded by name.
//
// This module is the package's main entry, so what a host needs is exported from it too.

import path from "node:path";

import { catalogCacheDir } from "@team-antioch/sc2-asset-catalog/catalog/catalog-dirs.js";
import { type Embedder, localEmbedder } from "@team-antioch/sc2-finder-kit/embedder.js";
import type { LanguageDetector } from "@team-antioch/sc2-finder-kit/language-detector.js";
import { payloadLog, payloadLogFile } from "@team-antioch/sc2-finder-kit/payload-log.js";
import type { Ranker } from "@team-antioch/sc2-finder-kit/ranker.js";
import { type FinderSettings, readFinderSettings, writeFinderSettings } from "@team-antioch/sc2-finder-kit/settings.js";
import { spendCap } from "@team-antioch/sc2-finder-kit/spend-cap.js";
import type { Translator } from "@team-antioch/sc2-finder-kit/translator.js";
import { TICK_LOG_FILE } from "@team-antioch/sc2-finder-kit/tray.js";

import { type SetCard, type SetLayer, setCards } from "./cards.ts";
import { type KeySource, openRanker } from "./credentials.ts";
import { openSetFinder, type SetFinder, setVectorCacheFile } from "./finder.ts";
import { SET_FINDER_PORT, startSetFinderServer, type TrayAction } from "./server.ts";

export { type SetAnswer, setAnswer } from "./answer.ts";
export { cardText, cardTexts, type PictureAt, PUBLISHED_SOURCE, setCard, type SetCard, type SetCardPicture, setCards, type SetCardsOptions, type SetLayer } from "./cards.ts";
export { type KeySource, NO_JEV_KEY, openRanker, type OpenedRanker } from "./credentials.ts";
export { type FindOptions, type FoundSet, type FoundSets, NOT_RANKED, openSetFinder, SET_LIMIT, type SetFinder, type SetFinderOptions, setVectorCacheFile } from "./finder.ts";
export { SET_FINDER_PORT, startSetFinderServer, type TrayAction, type TrayActionContext, type TrayActionInput, type TrayActionResult } from "./server.ts";
export { JEV_WORDING, LEVELS, levelName } from "./wording.ts";

export type StartSetFinderOptions = {
  /** For sc2-adjutant, may change: the cards, in place of the published sets' (make them with setCards). */
  readonly cards?: readonly SetCard[];
  /** For sc2-adjutant, may change: sets of its own, laid over the published ones (setCards' `extra`). */
  readonly extra?: readonly SetLayer[];
  /** The gallery the published sets' pictures are linked from (sc2-mapping-reference on GitHub by default). */
  readonly base?: string;
  /** For sc2-adjutant, may change: buttons on the tray that hand its sets on. */
  readonly trayActions?: readonly TrayAction[];
  /** For tests and sc2-adjutant, may change: the ranker; Jev with TYPESAFE_API_KEY or the key file by default, none for null. */
  readonly ranker?: Ranker<SetCard> | null;
  /** US dollars this session may spend on the ranker ($1.00 by default). */
  readonly budget?: number;
  /** The tick log: a folder for its ticks.jsonl, or (for sc2-adjutant, may change) the file for a choice. None by default. */
  readonly tickLog?: string | ((choice: string | undefined) => string);
  /** The port (4636 by default; 0 for any free one). */
  readonly port?: number;
  /** The cache folder: vectors, payload logs and settings (the platform's by default). */
  readonly cacheDir?: string;
  /** Where the page's settings are kept (in the cache folder by default). */
  readonly settingsFile?: string;
  /** Turns an ask in another language into English before it is searched; none by default (the kit's translator.js). */
  readonly translator?: Translator;
  readonly languageDetector?: LanguageDetector;
  /** For tests: the embeddings model in place of the local one, or what loads it. */
  readonly embedder?: Embedder | (() => Promise<Embedder>);
  /** For tests: the environment the key and the config folder are read from (the process's by default). */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** For sc2-adjutant, may change: more for /status to say. */
  readonly status?: Readonly<Record<string, unknown>>;
  /** Lines worth showing the user as the Finder runs. */
  readonly log?: (line: string) => void;
};

export type RunningSetFinder = {
  readonly url: string;
  /** How many cards there are, and how many opening embedded. */
  readonly cards: number;
  readonly embeddedOnOpen: number;
  /** Why there is no ranker, when there is none. */
  readonly off: string | undefined;
  /** Where Jev's key came from (TYPESAFE_API_KEY or the key file), when the Finder opened Jev with one. */
  readonly keySource: KeySource | undefined;
  /** US dollars the ranker has cost this session, estimated: the page's asks and `finder.find`'s together. */
  readonly spend: number;
  /** The ranker's payload log, when there is a ranker. */
  readonly payloadLog: string | undefined;
  /** For sc2-adjutant, may change: the finder the page asks, whose `find` ranks under the same spend cap. */
  readonly finder: SetFinder;
  close(): Promise<void>;
};

export async function startSetFinder(options: StartSetFinderOptions = {}): Promise<RunningSetFinder> {
  const log = options.log ?? (() => {});
  const cacheDir = options.cacheDir ?? catalogCacheDir();
  const cards = options.cards ?? setCards(undefined, { ...(options.base ? { base: options.base } : {}), ...(options.extra ? { extra: options.extra } : {}) });
  if (cards.length === 0) throw new Error("No sets to search: the cards are empty");
  const { embedder: given } = options;
  const embedder = typeof given === "function" ? await given() : (given ?? (await localEmbedder()));
  const logFile = payloadLogFile("set-finder-", cacheDir);
  const opened: { readonly ranker?: Ranker<SetCard> | undefined; readonly off?: string | undefined; readonly keySource?: KeySource | undefined } =
    options.ranker === null ? { off: "ranking is turned off" } : options.ranker ? { ranker: options.ranker } : openRanker({ ...(options.env ? { env: options.env } : {}), log: payloadLog(logFile) });
  const cap = spendCap(options.budget);
  const finder = await openSetFinder({
    cards,
    embedder,
    cacheFile: setVectorCacheFile(embedder.model, cacheDir),
    ranker: opened.ranker,
    off: opened.off,
    cap,
    ...(options.translator ? { translator: options.translator } : {}),
    ...(options.languageDetector ? { languageDetector: options.languageDetector } : {}),
  });
  const { tickLog } = options;
  const settingsFile = options.settingsFile ?? path.join(cacheDir, "set-finder-settings.json");
  let server;
  try {
    server = await startSetFinderServer({
      finder,
      ranker: opened.ranker,
      off: opened.off,
      keySource: opened.keySource,
      budget: cap,
      trayActions: options.trayActions ?? [],
      tickLog: typeof tickLog === "string" ? () => path.join(tickLog, TICK_LOG_FILE) : tickLog,
      settings: await readFinderSettings(settingsFile),
      saveSettings: (settings: FinderSettings) => writeFinderSettings(settingsFile, settings),
      port: options.port ?? SET_FINDER_PORT,
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
      return cap.spent;
    },
    payloadLog: opened.ranker ? logFile : undefined,
    finder,
    async close() {
      finder.close();
      await server.close();
    },
  };
}
