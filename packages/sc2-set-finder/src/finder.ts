// The Set Finder (docs/adr/0001, 0002): the kit's finder over the sets' cards, with their keyword
// search and tags, and `find`, which narrows an ask and has Jev rank it in one call, for a caller
// with no page (sc2-adjutant's find_sets tool, the test command). The page's server asks the same
// finder's `narrow` and ranks through the kit's asker.
//
// There are about eighty sets, and the kit's nearest cards are about two hundred, so every set
// would be a candidate and Jev would grade them all. Each ask is cut to the best 24 of the merge,
// which holds every set a keyword found and the nearest of the rest.

import path from "node:path";

import { type Finder as KitFinder, type NarrowOptions, openFinder as kitOpenFinder, vectorCacheFile } from "@team-antioch/sc2-finder-kit/finder.js";
import type { Embedder } from "@team-antioch/sc2-finder-kit/embedder.js";
import { jevRankBudget } from "@team-antioch/sc2-finder-kit/jev-ranker.js";
import type { LanguageDetector } from "@team-antioch/sc2-finder-kit/language-detector.js";
import type { Narrowed, RankBudget } from "@team-antioch/sc2-finder-kit/narrow.js";
import { orderByFit, type Ranker, RankerError } from "@team-antioch/sc2-finder-kit/ranker.js";
import type { SpendCap } from "@team-antioch/sc2-finder-kit/spend-cap.js";
import type { Translator } from "@team-antioch/sc2-finder-kit/translator.js";

import type { SetCard } from "./cards.ts";
import { keywordSearch, type Tag, tagMatches } from "./narrow.ts";
import { JEV_WORDING } from "./wording.ts";

/** What the kit's finder reads: the cards, made once. */
export type SetSources = { readonly cards: readonly SetCard[] };

/** How many of the merged candidates an ask keeps for the ranker and the page. */
export const SET_LIMIT = 24;

/** What Jev takes in one request, counted for the sets' cards (docs/adr/0002); 24 cards are far below it. */
export const SET_RANK_BUDGET: RankBudget<SetCard> = jevRankBudget<SetCard>(JEV_WORDING);

/** The sets' vectors in their own file, so the other finders, which share the cache folder, and this one don't replace each other's. */
export const setVectorCacheFile = (model: string, cacheDir?: string): string => {
  const file = vectorCacheFile(model, cacheDir);
  return path.join(path.dirname(file), `sets-${path.basename(file)}`);
};

/** A set an ask found: its places in the two searches, and Jev's grade from 0 (doesn't fit) to 3 (reads as exactly this) when it was ranked. */
export type FoundSet = Narrowed<SetCard> & { readonly level?: number };

export type FoundSets = {
  readonly ask: string;
  /** Best first: by Jev's grade when ranked, else in the narrowing's order. */
  readonly sets: readonly FoundSet[];
  readonly ranked: boolean;
  /** Why there is no ranking. */
  readonly notRanked?: string;
  /** US dollars this ask cost, estimated. */
  readonly cost: number;
  /** Milliseconds: the narrowing, and Jev's call. */
  readonly timings: { readonly narrow: number; readonly rank?: number };
};

export type FindOptions = {
  /** False for the narrowing alone. */
  readonly rank?: boolean;
  /** Pinned tags filter (`kind: room`); the rest raise, and go to Jev as context. */
  readonly tags?: readonly Tag[];
  /** How many candidates to narrow to and rank (24 by default). */
  readonly limit?: number;
  readonly signal?: AbortSignal;
};

export type SetFinderOptions = {
  readonly cards: readonly SetCard[];
  readonly embedder: Embedder;
  /** Where the cards' vectors are kept between starts (see setVectorCacheFile). */
  readonly cacheFile: string;
  /** Jev, for `find`: none, or why it is off, and `find` gives the narrowing's order. */
  readonly ranker?: Ranker<SetCard> | undefined;
  readonly off?: string | undefined;
  /** The session's spend cap, for `find`. */
  readonly cap?: SpendCap | undefined;
  /** Turns an ask in another language into English before it is searched; none by default (the kit's translator.js). */
  readonly translator?: Translator;
  readonly languageDetector?: LanguageDetector;
  /** For tests: another rank budget than Jev's. */
  readonly rankBudget?: RankBudget<SetCard>;
};

export type SetFinder = KitFinder<SetCard, SetSources> & {
  /** Why `find` doesn't rank, when there is no ranker. */
  readonly rankerOff: string | undefined;
  find(ask: string, options?: FindOptions): Promise<FoundSets>;
};

export const NOT_RANKED = "rank: false asked for the narrowing alone";
const NO_RANKER = "no ranker";
const NOTHING_TO_RANK = "the narrowing found nothing to rank";

export async function openSetFinder({ cards, embedder, cacheFile, ranker, off, cap, translator, languageDetector, rankBudget = SET_RANK_BUDGET }: SetFinderOptions): Promise<SetFinder> {
  const finder = await kitOpenFinder<SetCard, SetSources>({
    load: async () => ({ cards }),
    cards: (sources) => sources.cards,
    // Pinned tags the search doesn't take, the kit checks on its matches.
    keyword: (sources, ask) => keywordSearch(sources.cards, ask),
    tagMatches,
    // A set needs no map dependency.
    provides: () => false,
    rankBudget,
    embedder,
    cacheFile,
    ...(translator ? { translator } : {}),
    ...(languageDetector ? { languageDetector } : {}),
  });
  const narrow = (ask: string, options: NarrowOptions = {}) => finder.narrow(ask, { limit: SET_LIMIT, ...options });
  const rankerOff = ranker ? undefined : (off ?? NO_RANKER);

  return {
    get cards() {
      return finder.cards;
    },
    get sources() {
      return finder.sources;
    },
    embeddedOnOpen: finder.embeddedOnOpen,
    reload: () => finder.reload(),
    close: () => finder.close(),
    narrow,
    rankerOff,
    async find(ask, { rank = true, tags = [], limit = SET_LIMIT, signal } = {}) {
      const narrowing = await narrow(ask, { tags, limit });
      const candidates = narrowing.candidates;
      const timings = { narrow: narrowing.timings.total + (narrowing.timings.translate ?? 0) };
      const unranked = (notRanked: string, cost = 0): FoundSets => ({ ask, sets: candidates, ranked: false, notRanked, cost, timings });
      if (!rank) return unranked(NOT_RANKED);
      if (!ranker) return unranked(rankerOff!);
      if (candidates.length === 0) return unranked(NOTHING_TO_RANK);
      if (cap && !cap.allows()) return unranked(cap.reason);
      try {
        const ranking = await ranker.rank({ ask, tags, candidates: candidates.map(({ card }) => card) }, signal ? { signal } : {});
        cap?.record(ranking.cost);
        return { ask, sets: orderByFit(candidates, ranking.grades), ranked: true, cost: ranking.cost, timings: { ...timings, rank: ranking.timings.total } };
      } catch (error) {
        if (!(error instanceof RankerError)) throw error;
        cap?.record(error.cost);
        return unranked(`Jev didn't answer (${error.message}), so the narrowing's order is shown`, error.cost);
      }
    },
  };
}
