// The finder kit's narrowing merge (docs/adr/0001): a finder's keyword results and its nearest cards
// by embedding, merged without duplicates into about 200. Each search takes its hundred with the
// map's provided cards first among its matches, so they aren't cut before the ranker sees them;
// being provided adds nothing outside the two searches' matches. Tags raise the candidates they
// match; a pinned tag keeps only those it matches. What a tag matches is the finder's: it passes
// `tagMatches`.

import type { FinderCard, Tag } from "./card.ts";
import type { Neighbour } from "./embedding-index.ts";

export type { Tag } from "./card.ts";

export type Narrowed<C extends FinderCard = FinderCard> = {
  readonly id: string;
  readonly card: C;
  /** Its place among the keyword results, provided first, then by words matched (1 is first). */
  readonly keyword?: number;
  /** Its place among the nearest cards (1 is nearest). */
  readonly embeddings?: number;
  /** The merge's score: higher first. */
  readonly score: number;
};

export type MergeOptions<C extends FinderCard = FinderCard> = {
  /** At most this many (200 by default). */
  readonly limit?: number;
  readonly tags?: readonly Tag[];
  /** Whether a tag matches a card: the finder's facets. */
  readonly tagMatches: (card: C, tag: Tag) => boolean;
};

/** The reciprocal-rank constant: how much a list's first place outweighs its tenth. */
const RANK_K = 60;
/** What a matching tag adds: about what a keyword rank near the top adds. */
const TAG_RAISE = 1 / RANK_K;
const DEFAULT_LIMIT = 200;

/**
 * A search's matches with the ones the map's dependencies provide first, each part in the
 * search's order, cut to n: the search's rule for a map's dependencies. Without them no card is
 * provided, so it is the search's order.
 */
export function providedFirst<T extends { readonly id: string }>(matches: readonly T[], cards: ReadonlyMap<string, FinderCard>, n: number): T[] {
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
export function mergeNarrowing<C extends FinderCard>(
  keyword: readonly { readonly id: string }[],
  nearest: readonly Neighbour[],
  cards: ReadonlyMap<string, C>,
  options: MergeOptions<C>,
): Narrowed<C>[] {
  const { tagMatches } = options;
  const tags = options.tags ?? [];
  const pinned = tags.filter((tag) => tag.pinned);
  const raising = tags.filter((tag) => !tag.pinned);
  const merged = new Map<string, { card: C; keyword?: number; embeddings?: number }>();
  const add = (id: string, field: "keyword" | "embeddings", place: number) => {
    const card = cards.get(id);
    if (!card || !pinned.every((tag) => tagMatches(card, tag))) return;
    const known = merged.get(id) ?? { card };
    known[field] ??= place;
    merged.set(id, known);
  };
  keyword.forEach(({ id }, i) => add(id, "keyword", i + 1));
  nearest.forEach(({ id }, i) => add(id, "embeddings", i + 1));
  const scored: Narrowed<C>[] = [...merged].map(([id, { card, ...places }]) => {
    let score = 0;
    if (places.keyword !== undefined) score += 1 / (RANK_K + places.keyword);
    if (places.embeddings !== undefined) score += 1 / (RANK_K + places.embeddings);
    score += TAG_RAISE * raising.filter((tag) => tagMatches(card, tag)).length;
    return { id, card, ...places, score };
  });
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, options.limit ?? DEFAULT_LIMIT);
}
