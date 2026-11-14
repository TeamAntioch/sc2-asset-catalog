// The Music Finder's narrowing over its sources (docs/adr/0001), as its process keeps it: the kit's
// finder (@team-antioch/sc2-finder-kit/finder.js) with the music's cards, keyword search, tags and
// dependencies, and with the default that hides what a map can't play.

import { providesDependency } from "@team-antioch/sc2-asset-catalog/catalog/doodad-dependencies.js";
import { type Finder as KitFinder, type FinderOptions as KitFinderOptions, openFinder as kitOpenFinder, vectorCacheFile } from "@team-antioch/sc2-finder-kit/finder.js";
import path from "node:path";

import { type MusicCard, type MusicLayer, type MusicSources, musicCards } from "./cards.ts";
import { keywordMatches, tagMatches, withDefaultShow } from "./narrow.ts";

export { KEYWORD_RESULTS, NEAREST_MATCHES, NEAREST_RESULTS, type NarrowOptions, type Narrowing } from "@team-antioch/sc2-finder-kit/finder.js";

/** The music's vectors in their own file, so the Doodad Finder, which shares the cache folder, and this one don't replace each other's. */
export const musicVectorCacheFile = (model: string, cacheDir?: string): string => {
  const file = vectorCacheFile(model, cacheDir);
  return path.join(path.dirname(file), `music-${path.basename(file)}`);
};

export type FinderOptions = Pick<KitFinderOptions<MusicCard, MusicSources>, "load" | "embedder" | "cacheFile" | "watch" | "onReload" | "onError"> & {
  /** For sc2-adjutant, may change: what its own sources add to each card. */
  readonly layer?: MusicLayer;
};

export type Finder = KitFinder<MusicCard, MusicSources>;

export async function openFinder({ layer, ...options }: FinderOptions): Promise<Finder> {
  const finder = await kitOpenFinder<MusicCard, MusicSources>({
    ...options,
    cards: (sources) => musicCards(sources, layer),
    keyword: keywordMatches,
    tagMatches,
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
    narrow: (ask, options = {}) => finder.narrow(ask, { ...options, tags: withDefaultShow(options.tags) }),
  };
}
