// The Set Finder's side of the narrowing (docs/adr/0001, 0002): its keyword search and what its
// tags match. The kit merges the keyword matches with the nearest cards by embedding. There are
// about eighty sets, so the search is a plain scan of every card.
//
//   kind     one kind, or several comma apart (`room, exterior`): the page's kind chips pin it
//   facet    one of the look's facets, such as `ship bridge`

import type { Tag } from "@team-antioch/sc2-finder-kit/card.js";

import type { SetCard } from "./cards.ts";

export type { Tag } from "@team-antioch/sc2-finder-kit/card.js";

/** Every facet a tag can name. */
export const FACETS = ["kind", "facet"] as const;
export type Facet = (typeof FACETS)[number];

export const facetOf = (text: string): Facet | undefined => FACETS.find((facet) => facet === text.toLowerCase().trim());

/** The kinds a `kind` value names, lower case. */
export const kindsOf = (value: string): string[] =>
  value
    .split(",")
    .map((kind) => kind.trim().toLowerCase())
    .filter(Boolean);

/** Whether a tag matches a card, case aside. An unknown facet matches nothing. */
export function tagMatches(card: SetCard, tag: Tag): boolean {
  const facet = facetOf(tag.facet);
  switch (facet) {
    case "kind":
      return kindsOf(tag.value).includes(card.look.kind);
    case "facet":
      return card.look.facets.some((value) => value.toLowerCase() === tag.value.toLowerCase().trim());
    case undefined:
      return false;
    default:
      return facet satisfies never;
  }
}

/** Words of an ask that say nothing about a place: left out of the keyword search, which matches any word. */
const STOP_WORDS = new Set(
  (
    "a an and any are as at be by can could for from has have he her his i if in inside into is it its like look looks me my of on onto or out over " +
    "place set she so some somewhere something that the their them then there these they thing this to under up was we what where which with would you your"
  ).split(" "),
);

/** A word without its plural, so "corridors" finds "corridor". */
const stem = (word: string): string => (word.length > 3 ? word.replace(/(?:es|s)$/, "") : word);
const words = (text: string): Set<string> => new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem));

/** The keyword search's words for an ask: its words, less the ones that say nothing about a place, plurals aside. */
export const askWords = (ask: string): string[] => [...new Set((ask.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => !STOP_WORDS.has(word)).map(stem))];

/** What a word is worth by where it is found: the name, kind and facets say what the set is, the look mentions what is in it. */
const WEIGHTS = { name: 4, facets: 3, uses: 2, look: 1 } as const;

/**
 * The cards an ask's words are found in, best first: each word counts once, at its best place (the
 * name, id or kind, the facets, what it could stand in for, then the look and its places), and a
 * card with more of the ask's words comes before one with fewer.
 */
export function keywordSearch(cards: Iterable<SetCard>, ask: string): SetCard[] {
  const wanted = askWords(ask);
  if (wanted.length === 0) return [];
  const scored = [...cards].map((card) => {
    const fields: [keyof typeof WEIGHTS, Set<string>][] = [
      ["name", words(`${card.name} ${card.id} ${card.look.kind}`)],
      ["facets", words(card.look.facets.join(" "))],
      ["uses", words(card.look.standsInFor.join(" "))],
      ["look", words(`${card.look.look} ${(card.look.rooms ?? []).join(" ")}`)],
    ];
    let found = 0;
    let score = 0;
    for (const word of wanted) {
      const best = Math.max(0, ...fields.filter(([, has]) => has.has(word)).map(([field]) => WEIGHTS[field]));
      if (best) found++;
      score += best;
    }
    return { card, found, score };
  });
  return scored
    .filter((entry) => entry.found > 0)
    .sort((a, b) => b.found - a.found || b.score - a.score || a.card.id.localeCompare(b.card.id))
    .map((entry) => entry.card);
}
