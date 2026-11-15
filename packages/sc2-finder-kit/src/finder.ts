// A finder's narrowing over its sources (docs/adr/0001), as its process keeps it: the cards embedded
// when it opens (only the ones the cache hasn't seen), each ask narrowed by the finder's keyword
// search and the nearest cards, and the cards written and embedded again when a watched file changes
// (the finder's files, and any others the sources name). What the sources are, how a source makes
// its cards, what the keyword search is and what a tag or a dependency matches are the finder's:
// it passes them in.

import { type FSWatcher, watch } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { catalogCacheDir } from "@team-antioch/sc2-asset-catalog/catalog/catalog-dirs.js";

import type { FinderCard, Tag } from "./card.ts";
import type { Embedder } from "./embedder.ts";
import { EmbeddingIndex, type Nearest } from "./embedding-index.ts";
import { fitToBudget, mergeNarrowing, type Narrowed, providedFirst, type RankBudget } from "./narrow.ts";

/** A model's vector cache: a file per model in the cache folder. */
export const vectorCacheFile = (model: string, cacheDir: string = catalogCacheDir()): string => path.join(cacheDir, `vectors-${model.replace(/[^A-Za-z0-9.-]+/g, "_")}.bin`);

/** About a hundred from each search, as docs/adr/0001 has it. */
export const KEYWORD_RESULTS = 100;
export const NEAREST_RESULTS = 100;
/** The nearest cards the embeddings search puts the provided ones first among: its matches. */
export const NEAREST_MATCHES = 2 * NEAREST_RESULTS;

/** How long a burst of file events settles before the cards are written again. */
const SETTLE_MS = 50;

export type FinderOptions<C extends FinderCard, S> = {
  /** Reads the sources afresh: on opening, and after each watched change. */
  readonly load: () => Promise<S>;
  /** The card for everything the sources hold. */
  readonly cards: (sources: S) => readonly C[];
  /**
   * The keyword search over the sources: its matches for an ask, best first, with the pinned tags'
   * facets it can take already applied. The kit keeps the pinned ones it couldn't, puts the provided
   * ones first and cuts to a hundred.
   */
  readonly keyword: (sources: S, ask: string, tags: readonly Tag[]) => readonly { readonly id: string }[];
  /** Whether a tag matches a card. */
  readonly tagMatches: (card: C, tag: Tag) => boolean;
  /** Whether a map's dependencies already bring a card in. */
  readonly provides: (dependencies: readonly string[], card: C) => boolean;
  /**
   * What the finder's ranker can take in one request. Each ask's candidates are cut to it before
   * they are returned, lowest ranked first (see `fitToBudget`). None by default.
   */
  readonly rankBudget?: RankBudget<C>;
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
  /** A map's dependencies: the cards they provide are marked, and each search takes them first among its matches. */
  readonly dependencies?: readonly string[] | undefined;
  /** At most this many (200 by default). */
  readonly limit?: number;
};

export type Narrowing<C extends FinderCard = FinderCard> = {
  readonly candidates: readonly Narrowed<C>[];
  /** How many merged candidates the rank budget dropped (0 without one, or when all fit). */
  readonly cut: number;
  /** Milliseconds: the keyword search, embedding the ask, the nearest cards, the merge, and all of it. */
  readonly timings: { readonly keyword: number; readonly embed: number; readonly nearest: number; readonly merge: number; readonly total: number };
};

export type Finder<C extends FinderCard, S> = {
  narrow(ask: string, options?: NarrowOptions): Promise<Narrowing<C>>;
  /** Reads the sources and writes the cards again, embedding the changed ones. */
  reload(): Promise<{ readonly embedded: number }>;
  /** Every card, by id. */
  readonly cards: ReadonlyMap<string, C>;
  /** The sources as last read: for looking up a card's picture, say. */
  readonly sources: S;
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

export async function openFinder<C extends FinderCard, S>(options: FinderOptions<C, S>): Promise<Finder<C, S>> {
  const index = await EmbeddingIndex.open(options.embedder, options.cacheFile);
  type Loaded = { readonly sources: S; readonly cards: readonly C[]; readonly byId: ReadonlyMap<string, C>; readonly nearest: Nearest };
  /** The sources and their cards, embedded: swapped whole, with the cards' own nearest, so an ask under way when they change never mixes old and new. */
  const read = async (): Promise<Loaded & { readonly embedded: number }> => {
    const sources = await options.load();
    const cards = options.cards(sources);
    const { embedded, nearest } = await index.update(cards);
    return { sources, cards, byId: new Map(cards.map((card) => [card.id, card])), nearest, embedded };
  };
  const first = await read();
  let loaded: Loaded = first;
  const embeddedOnOpen = first.embedded;
  // Cards marked for a map's dependencies, kept for the last ones asked for.
  let marked: { key: string; of: Loaded; cards: ReadonlyMap<string, C> } | undefined;

  const cardsFor = (of: Loaded, dependencies: readonly string[] | undefined): ReadonlyMap<string, C> => {
    if (dependencies === undefined) return of.byId;
    const key = JSON.stringify(dependencies);
    if (marked?.key !== key || marked.of !== of) {
      marked = { key, of, cards: new Map([...of.byId].map(([id, card]) => [id, { ...card, provided: options.provides(dependencies, card) }])) };
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
      /** Whether every pinned tag matches a card, as the merge keeps it, so the nearest hundred are all ones it keeps. */
      const keeps = (id: string) => {
        const card = cards.get(id);
        return card !== undefined && pinned.every((tag) => options.tagMatches(card, tag));
      };
      // Pinned tags the search can't take filter before the cut; then the map's provided matches first.
      const matches = options.keyword(now.sources, ask, tags);
      const keyword = providedFirst(pinned.length ? matches.filter(({ id }) => keeps(id)) : matches, cards, KEYWORD_RESULTS);
      const keywordDone = performance.now();
      const [vector] = ask.trim() ? await options.embedder.embed([ask], "query") : [];
      const embedDone = performance.now();
      const nearest = vector ? providedFirst(now.nearest(vector, NEAREST_MATCHES, pinned.length ? keeps : undefined), cards, NEAREST_RESULTS) : [];
      const nearestDone = performance.now();
      const merged = mergeNarrowing(keyword, nearest, cards, { tags, tagMatches: options.tagMatches, ...(limit !== undefined ? { limit } : {}) });
      const { kept: candidates, cut } = options.rankBudget ? fitToBudget(merged, options.rankBudget) : { kept: merged, cut: 0 };
      const done = performance.now();
      return {
        candidates,
        cut,
        timings: { keyword: keywordDone - started, embed: embedDone - keywordDone, nearest: nearestDone - embedDone, merge: done - nearestDone, total: done - started },
      };
    },
  };
}
