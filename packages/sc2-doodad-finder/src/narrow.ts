// The Doodad Finder's narrowing (docs/adr/0001): for an ask, the catalog's keyword search (about 100 results)
// and the nearest cards by embedding (about 100), merged without duplicates into about 200 by the
// kit (@team-antioch/sc2-finder-kit/narrow.js). What a tag matches, and the words of an ask the
// keyword search takes, are the doodads': here.

import type { DoodadSearchQuery } from "@team-antioch/sc2-asset-catalog/catalog/doodad-search.js";
import { mergeNarrowing as kitMergeNarrowing, type MergeOptions as KitMergeOptions, type Narrowed as KitNarrowed } from "@team-antioch/sc2-finder-kit/narrow.js";

import type { CandidateCard } from "./cards.ts";
import type { Neighbour } from "./embedding-index.ts";

export { providedFirst, type Tag } from "@team-antioch/sc2-finder-kit/narrow.js";
import type { Tag } from "@team-antioch/sc2-finder-kit/narrow.js";

export type Narrowed = KitNarrowed<CandidateCard>;
export type MergeOptions = Omit<KitMergeOptions<CandidateCard>, "tagMatches">;

/** A card's values for a facet: its description's kind, size, role, use, story and biome, its tilesets, its source. */
function facetValues(card: CandidateCard, facet: string): readonly string[] {
  if (facet === "tileset" || facet === "tilesets") return card.entry.tilesets ?? [];
  if (facet === "source") return [card.source];
  const value = (card.entry.description as Record<string, unknown> | undefined)?.[facet];
  return typeof value === "string" ? [value] : Array.isArray(value) ? (value as string[]) : [];
}

/** Whether a tag matches a card, case aside; a biome tag matches a doodad for any biome. */
export function tagMatches(card: CandidateCard, tag: Tag): boolean {
  const want = tag.value.toLowerCase();
  return facetValues(card, tag.facet.toLowerCase()).some((value) => {
    const have = value.toLowerCase();
    return have === want || (tag.facet.toLowerCase() === "biome" && have === "any");
  });
}

/**
 * The keyword results and nearest cards as one list, each once, cut to the limit (the kit's merge,
 * with the doodads' tags).
 */
export const mergeNarrowing = (keyword: readonly { readonly id: string }[], nearest: readonly Neighbour[], cards: ReadonlyMap<string, CandidateCard>, options: MergeOptions = {}): Narrowed[] =>
  kitMergeNarrowing(keyword, nearest, cards, { ...options, tagMatches });

/** Words of an ask that say nothing about a doodad: left out of the keyword search, which matches any word. */
const STOP_WORDS = new Set(
  (
    "a an and any are as at be behind by can could for from has have he her his i if in into is it its like look looks me my of on onto or out over " +
    "she so some something that the their them then there these they thing this to under up was we what where which with would you your"
  ).split(" "),
);

/** The keyword search's words for an ask: its words, less the ones that say nothing about a doodad. */
export function askWords(ask: string): string[] {
  return [...new Set(ask.toLowerCase().match(/[a-z0-9]+\*?/g) ?? [])].filter((word) => !STOP_WORDS.has(word.replace(/\*$/, "")));
}

/** Pinned tags as the search's facets, where it has the facet, so its hundred results are already the pinned ones. */
export function pinnedFacets(tags: readonly Tag[]): Pick<DoodadSearchQuery, "kind" | "size" | "role" | "story" | "biome"> {
  const values = (facet: string) => tags.filter((tag) => tag.pinned && tag.facet === facet).map((tag) => tag.value.toLowerCase());
  const one = <T>(facet: string): T | undefined => {
    const all = values(facet);
    return all.length === 1 ? (all[0] as T) : undefined;
  };
  const many = <T>(facet: string): T[] | undefined => {
    const all = values(facet);
    // The search takes any of several; pinned tags are each required, so only one goes to it, the merge checks the rest.
    return all.length ? ([all[0]] as T[]) : undefined;
  };
  const kind = one<DoodadSearchQuery["kind"]>("kind");
  const size = one<DoodadSearchQuery["size"]>("size");
  const role = many<NonNullable<DoodadSearchQuery["role"]>[number]>("role");
  const story = many<string>("story");
  const biome = many<string>("biome");
  return { ...(kind ? { kind } : {}), ...(size ? { size } : {}), ...(role ? { role } : {}), ...(story ? { story } : {}), ...(biome ? { biome } : {}) };
}
