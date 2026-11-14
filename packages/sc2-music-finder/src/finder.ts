// The Music Finder's narrowing over its sources (docs/adr/0001, 0002), as its process keeps it: the kit's
// finder (@team-antioch/sc2-finder-kit/finder.js) with the music's cards, keyword search, tags and
// dependencies, and with the default that hides what a map can't play.

import { providesDependency } from "@team-antioch/sc2-asset-catalog/catalog/doodad-dependencies.js";
import { type Finder as KitFinder, type FinderOptions as KitFinderOptions, openFinder as kitOpenFinder, vectorCacheFile } from "@team-antioch/sc2-finder-kit/finder.js";
import { jevRankBudget } from "@team-antioch/sc2-finder-kit/jev-ranker.js";
import type { RankBudget } from "@team-antioch/sc2-finder-kit/narrow.js";
import path from "node:path";

import { type MusicCard, type MusicLayer, type MusicSources, musicCards } from "./cards.ts";
import { keywordMatches, tagMatches, withDefaultShow } from "./narrow.ts";
import { JEV_WORDING } from "./wording.ts";

export { KEYWORD_RESULTS, NEAREST_MATCHES, NEAREST_RESULTS, type NarrowOptions, type Narrowing } from "@team-antioch/sc2-finder-kit/finder.js";

/** The music's vectors in their own file, so the Doodad Finder, which shares the cache folder, and this one don't replace each other's. */
export const musicVectorCacheFile = (model: string, cacheDir?: string): string => {
  const file = vectorCacheFile(model, cacheDir);
  return path.join(path.dirname(file), `music-${path.basename(file)}`);
};

/**
 * What Jev takes in one request, counted for the music's cards (docs/adr/0002). A track's card is
 * about 640 characters and the four levels repeat in every question, so a candidate costs about
 * 355 tokens and the narrowing's 170 to 198 cards ran over Jev's limit (`400 max_tokens_exceeded`
 * on asks with 189 or more). Each ask's candidates are cut to this, lowest ranked first.
 */
export const MUSIC_RANK_BUDGET: RankBudget<MusicCard> = jevRankBudget<MusicCard>(JEV_WORDING);

export type FinderOptions = Pick<KitFinderOptions<MusicCard, MusicSources>, "load" | "embedder" | "cacheFile" | "watch" | "onReload" | "onError"> & {
  /** For sc2-adjutant, may change: what its own sources add to each card. */
  readonly layer?: MusicLayer;
  /** Said when an ask's candidates were cut to the rank budget: how many were kept and how many cut. */
  readonly onCut?: (cut: { readonly kept: number; readonly cut: number }) => void;
  /** For tests: another rank budget than Jev's. */
  readonly rankBudget?: RankBudget<MusicCard>;
};

export type Finder = KitFinder<MusicCard, MusicSources>;

export async function openFinder({ layer, onCut, rankBudget = MUSIC_RANK_BUDGET, ...options }: FinderOptions): Promise<Finder> {
  const finder = await kitOpenFinder<MusicCard, MusicSources>({
    ...options,
    cards: (sources) => musicCards(sources, layer),
    keyword: keywordMatches,
    tagMatches,
    rankBudget,
    provides: (dependencies, card) => card.dependency === undefined || providesDependency(dependencies, card.dependency),
  });
  // The kit's finder reads its sources as they change: this one passes the reads through, with the default `show` tag added to each ask.
  return {
    get cards() {
      return finder.cards;
    },
    get sources() {
      return finder.sources;
    },
    get embeddedOnOpen() {
      return finder.embeddedOnOpen;
    },
    reload: () => finder.reload(),
    close: () => finder.close(),
    narrow: async (ask, options = {}) => {
      const narrowing = await finder.narrow(ask, { ...options, tags: withDefaultShow(options.tags) });
      if (narrowing.cut > 0) onCut?.({ kept: narrowing.candidates.length, cut: narrowing.cut });
      return narrowing;
    },
  };
}
