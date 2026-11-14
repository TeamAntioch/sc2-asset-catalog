// The Doodad Finder's narrowing over its sources (docs/adr/0001), as its process keeps it: the kit's
// finder (@team-antioch/sc2-finder-kit/finder.js) with the doodads' cards, keyword search, tags and
// dependencies.

import { providesDependency } from "@team-antioch/sc2-asset-catalog/catalog/doodad-dependencies.js";
import { type DoodadSearchSources, matchDoodads } from "@team-antioch/sc2-asset-catalog/catalog/doodad-search.js";
import { type Finder as KitFinder, type FinderOptions as KitFinderOptions, openFinder as kitOpenFinder } from "@team-antioch/sc2-finder-kit/finder.js";

import { jevRankBudget } from "@team-antioch/sc2-finder-kit/jev-ranker.js";

import { type CandidateCard, candidateCards } from "./cards.ts";
import { askWords, pinnedFacets, tagMatches } from "./narrow.ts";
import { JEV_WORDING } from "./wording.ts";

export { KEYWORD_RESULTS, NEAREST_MATCHES, NEAREST_RESULTS, type NarrowOptions, type Narrowing, vectorCacheFile } from "@team-antioch/sc2-finder-kit/finder.js";

export type FinderOptions = Pick<KitFinderOptions<CandidateCard, DoodadSearchSources>, "load" | "embedder" | "cacheFile" | "watch" | "onReload" | "onError">;

export type Finder = KitFinder<CandidateCard, DoodadSearchSources>;

export const openFinder = (options: FinderOptions): Promise<Finder> =>
  kitOpenFinder<CandidateCard, DoodadSearchSources>({
    ...options,
    cards: (sources) => candidateCards(sources),
    keyword: (sources, ask, tags) => {
      const words = askWords(ask);
      return words.length ? matchDoodads({ words, ...pinnedFacets(tags) }, sources) : [];
    },
    tagMatches,
    // Jev refuses a request over its token limit (the kit's jev-ranker.ts); the doodads' cards are short enough that a default 200 never reaches it (tests/finder.test.ts).
    rankBudget: jevRankBudget<CandidateCard>(JEV_WORDING),
    provides: (dependencies, card) => card.dependency === undefined || providesDependency(dependencies, card.dependency),
  });
