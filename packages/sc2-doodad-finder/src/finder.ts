// The Doodad Finder's narrowing over its sources (docs/adr/0001), as its process keeps it: the cards
// embedded when it opens (only the ones the cache hasn't seen), each ask narrowed by the catalog's keyword
// search and the nearest cards, and the cards written and embedded again when a watched file
// changes (the catalog's files, and any others the sources name).

import { type FSWatcher, watch } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { providesDependency } from "@team-antioch/sc2-asset-catalog/catalog/doodad-dependencies.js";
import { catalogCacheDir } from "@team-antioch/sc2-asset-catalog/catalog/catalog-dirs.js";
import { type DoodadSearchSources, matchDoodads } from "@team-antioch/sc2-asset-catalog/catalog/doodad-search.js";

import { type CandidateCard, candidateCards } from "./cards.ts";
import type { Embedder } from "./embedder.ts";
import { EmbeddingIndex, type Nearest } from "./embedding-index.ts";
import { askWords, mergeNarrowing, type Narrowed, pinnedFacets, providedFirst, type Tag, tagMatches } from "./narrow.ts";

/** A model's vector cache: a file per model in the cache folder. */
export const vectorCacheFile = (model: string, cacheDir: string = catalogCacheDir()): string => path.join(cacheDir, `vectors-${model.replace(/[^A-Za-z0-9.-]+/g, "_")}.bin`);

/** About a hundred from each search, as docs/adr/0001 has it. */
export const KEYWORD_RESULTS = 100;
export const NEAREST_RESULTS = 100;
/** The nearest cards the embeddings search puts the provided ones first among: its matches. */
export const NEAREST_MATCHES = 2 * NEAREST_RESULTS;

/** How long a burst of file events settles before the cards are written again. */
const SETTLE_MS = 50;

export type FinderOptions = {
  /** Reads the sources afresh: on opening, and after each watched change. */
  readonly load: () => Promise<DoodadSearchSources>;
  readonly embedder: Embedder;
  /** The vector cache file. */
  readonly cacheFile: string;
  /** Files and folders whose changes write the cards again; a folder is watched with everything in it. */
  readonly watch?: readonly string[];
  /** Called after each reload a watched change set off, with how many cards it embedded; or with the error it met. */
  readonly onReload?: (result: { readonly embedded: number }) => void;
  readonly onError?: (error: unknown) => void;
};

export type NarrowOptions = {
  readonly tags?: readonly Tag[];
  /** A map's dependencies: the doodads they provide are marked, and each search takes them first among its matches. */
  readonly dependencies?: readonly string[] | undefined;
  /** At most this many (200 by default). */
  readonly limit?: number;
};

export type Narrowing = {
  readonly candidates: readonly Narrowed[];
  /** Milliseconds: the keyword search, embedding the ask, the nearest cards, the merge, and all of it. */
  readonly timings: { readonly keyword: number; readonly embed: number; readonly nearest: number; readonly merge: number; readonly total: number };
};

export type Finder = {
  narrow(ask: string, options?: NarrowOptions): Promise<Narrowing>;
  /** Reads the sources and writes the cards again, embedding the changed ones. */
  reload(): Promise<{ readonly embedded: number }>;
  /** Every card, by id. */
  readonly cards: ReadonlyMap<string, CandidateCard>;
  /** The sources as last read: for looking up a card's picture. */
  readonly sources: DoodadSearchSources;
  /** How many cards opening embedded: none on a warm start. */
  readonly embeddedOnOpen: number;
  close(): void;
};

/** Watches each path: a folder with everything in it, a file through its folder, so a file replaced by a rename is still seen. */
async function watchPaths(paths: readonly string[], changed: () => void, onError: (error: unknown) => void): Promise<FSWatcher[]> {
  const watchers: FSWatcher[] = [];
  for (const target of paths) {
    const isFolder = await stat(target).then(
      (found) => found.isDirectory(),
      () => false,
    );
    const folder = isFolder ? target : path.dirname(target);
    const name = path.basename(target);
    try {
      const watcher = watch(folder, { recursive: isFolder, persistent: false }, (_event, file) => (isFolder || file === null || file === name ? changed() : undefined));
      // A watched folder deleted or shut off (the cache folder is safe to delete) stops its watch, not the process.
      watcher.on("error", (error) => {
        watcher.close();
        onError(error);
      });
      watchers.push(watcher);
    } catch {
      // A folder that isn't there (one the sources name before it exists) has nothing to watch.
    }
  }
  return watchers;
}

export async function openFinder(options: FinderOptions): Promise<Finder> {
  const index = await EmbeddingIndex.open(options.embedder, options.cacheFile);
  /** The sources and their cards, embedded: swapped whole, with the cards' own nearest, so an ask under way when they change never mixes old and new. */
  const read = async (): Promise<Loaded & { readonly embedded: number }> => {
    const sources = await options.load();
    const cards = candidateCards(sources);
    const { embedded, nearest } = await index.update(cards);
    return { sources, cards, byId: new Map(cards.map((card) => [card.id, card])), nearest, embedded };
  };
  const first = await read();
  let loaded: Loaded = first;
  const embeddedOnOpen = first.embedded;
  // Cards marked for a map's dependencies, kept for the last ones asked for.
  let marked: { key: string; of: Loaded; cards: ReadonlyMap<string, CandidateCard> } | undefined;

  const cardsFor = (of: Loaded, dependencies: readonly string[] | undefined): ReadonlyMap<string, CandidateCard> => {
    if (dependencies === undefined) return of.byId;
    const key = JSON.stringify(dependencies);
    if (marked?.key !== key || marked.of !== of) {
      const provides = (card: CandidateCard) => card.dependency === undefined || providesDependency(dependencies, card.dependency);
      marked = { key, of, cards: new Map([...of.byId].map(([id, card]) => [id, { ...card, provided: provides(card) }])) };
    }
    return marked.cards;
  };

  // One reload at a time; a change during one runs another after it.
  let running: Promise<{ embedded: number }> | undefined;
  let again = false;
  const reload = async (): Promise<{ embedded: number }> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      let embedded = 0;
      do {
        again = false;
        const next = await read();
        embedded += next.embedded;
        loaded = next;
      } while (again);
      return { embedded };
    })();
    try {
      return await running;
    } finally {
      running = undefined;
    }
  };

  let timer: NodeJS.Timeout | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      reload().then(
        (result) => options.onReload?.(result),
        (error: unknown) => options.onError?.(error),
      );
    }, SETTLE_MS);
  };
  const watchers = await watchPaths(options.watch ?? [], changed, (error) => options.onError?.(error));

  return {
    get cards() {
      return loaded.byId;
    },
    get sources() {
      return loaded.sources;
    },
    embeddedOnOpen,
    reload,
    close() {
      clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    },
    async narrow(ask, { tags = [], dependencies, limit } = {}) {
      const started = performance.now();
      const now = loaded;
      const cards = cardsFor(now, dependencies);
      const pinned = tags.filter((tag) => tag.pinned);
      const keeps = (id: string) => mergeKeeps(cards, id, pinned);
      const words = askWords(ask);
      // Pinned tags the search can't take filter before the cut; then the map's provided matches first.
      const matches = words.length ? matchDoodads({ words, ...pinnedFacets(tags) }, now.sources) : [];
      const keyword = providedFirst(pinned.length ? matches.filter(({ id }) => keeps(id)) : matches, cards, KEYWORD_RESULTS);
      const keywordDone = performance.now();
      const [vector] = ask.trim() ? await options.embedder.embed([ask], "query") : [];
      const embedDone = performance.now();
      const nearest = vector ? providedFirst(now.nearest(vector, NEAREST_MATCHES, pinned.length ? keeps : undefined), cards, NEAREST_RESULTS) : [];
      const nearestDone = performance.now();
      const candidates = mergeNarrowing(keyword, nearest, cards, { tags, ...(limit !== undefined ? { limit } : {}) });
      const done = performance.now();
      return {
        candidates,
        timings: { keyword: keywordDone - started, embed: embedDone - keywordDone, nearest: nearestDone - embedDone, merge: done - nearestDone, total: done - started },
      };
    },
  };
}

type Loaded = { readonly sources: DoodadSearchSources; readonly cards: readonly CandidateCard[]; readonly byId: ReadonlyMap<string, CandidateCard>; readonly nearest: Nearest };

/** Whether every pinned tag matches a card, as the merge keeps it, so the nearest hundred are all ones it keeps. */
const mergeKeeps = (cards: ReadonlyMap<string, CandidateCard>, id: string, pinned: readonly Tag[]): boolean => {
  const card = cards.get(id);
  return card !== undefined && pinned.every((tag) => tagMatches(card, tag));
};
