// The Doodad Finder's narrowing (docs/adr/0001): for an ask, the catalog's keyword search (about 100 results)
// and the nearest cards by embedding (about 100), merged without duplicates into about 200. Each
// search takes its hundred with the map's provided doodads first among its matches, as
// the keyword search sorts them, so they aren't cut before the ranker sees them; being provided adds
// nothing outside the two searches' matches. Tags raise the candidates they match; a pinned tag
// keeps only those it matches.

import type { DoodadSearchQuery } from "@team-antioch/sc2-asset-catalog/catalog/doodad-search.js";

import type { CandidateCard } from "./cards.ts";
import type { Neighbour } from "./embedding-index.ts";

/** A facet tag, as search.json's asks keep them: `story: industry`. A pinned tag filters; the rest only raise. */
export type Tag = { readonly facet: string; readonly value: string; readonly pinned?: boolean | undefined };

export type Narrowed = {
  readonly id: string;
  readonly card: CandidateCard;
  /** Its place among the keyword results, provided first, then by words matched (1 is first). */
  readonly keyword?: number;
  /** Its place among the nearest cards (1 is nearest). */
  readonly embeddings?: number;
  /** The merge's score: higher first. */
  readonly score: number;
};

export type MergeOptions = {
  /** At most this many (200 by default). */
  readonly limit?: number;
  readonly tags?: readonly Tag[];
};

/** The reciprocal-rank constant: how much a list's first place outweighs its tenth. */
const RANK_K = 60;
/** What a matching tag adds: about what a keyword rank near the top adds. */
const TAG_RAISE = 1 / RANK_K;
const DEFAULT_LIMIT = 200;

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
 * A search's matches with the ones the map's dependencies provide first, each part in the
 * search's order, cut to n: the search's rule for a map's dependencies. Without them no card is
 * provided, so it is the search's order.
 */
export function providedFirst<T extends { readonly id: string }>(matches: readonly T[], cards: ReadonlyMap<string, CandidateCard>, n: number): T[] {
  const provided = matches.filter(({ id }) => cards.get(id)?.provided === true);
  const rest = matches.filter(({ id }) => cards.get(id)?.provided !== true);
  return [...provided, ...rest].slice(0, n);
}

/**
 * The keyword results and nearest cards as one list, each once, cut to the limit: each list's
 * places, in the order its search gave them, count by reciprocal rank, and every unpinned tag a
 * candidate matches raises it. Candidates a pinned tag doesn't match are left out, as are ids
 * with no card.
 */
export function mergeNarrowing(
  keyword: readonly { readonly id: string }[],
  nearest: readonly Neighbour[],
  cards: ReadonlyMap<string, CandidateCard>,
  options: MergeOptions = {},
): Narrowed[] {
  const tags = options.tags ?? [];
  const pinned = tags.filter((tag) => tag.pinned);
  const raising = tags.filter((tag) => !tag.pinned);
  const merged = new Map<string, { card: CandidateCard; keyword?: number; embeddings?: number }>();
  const add = (id: string, field: "keyword" | "embeddings", place: number) => {
    const card = cards.get(id);
    if (!card || !pinned.every((tag) => tagMatches(card, tag))) return;
    const known = merged.get(id) ?? { card };
    known[field] ??= place;
    merged.set(id, known);
  };
  keyword.forEach(({ id }, i) => add(id, "keyword", i + 1));
  nearest.forEach(({ id }, i) => add(id, "embeddings", i + 1));
  const scored: Narrowed[] = [...merged].map(([id, { card, ...places }]) => {
    let score = 0;
    if (places.keyword !== undefined) score += 1 / (RANK_K + places.keyword);
    if (places.embeddings !== undefined) score += 1 / (RANK_K + places.embeddings);
    score += TAG_RAISE * raising.filter((tag) => tagMatches(card, tag)).length;
    return { id, card, ...places, score };
  });
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, options.limit ?? DEFAULT_LIMIT);
}

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
