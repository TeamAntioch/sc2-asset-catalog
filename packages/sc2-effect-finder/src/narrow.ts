// The Effect Finder's side of the narrowing (docs/adr/0001, 0002): its keyword search and what its
// tags match. The kit merges the keyword matches with the nearest cards by embedding. There are
// about thirteen hundred effects, so the search is a plain scan of every card.
//
//   kind     one kind, or several comma apart (`burst, beam`): the page's kind chips pin it
//   color    one of the look's colours, such as `violet`
//   folder   the folder under Assets/Effects, such as `Protoss`
//   facet    one of the look's facets, such as `ground ring`

import type { Tag } from "@team-antioch/sc2-finder-kit/card.js";

import type { EffectCard } from "./cards.ts";

export type { Tag } from "@team-antioch/sc2-finder-kit/card.js";

/** Every facet a tag can name. */
export const FACETS = ["kind", "color", "folder", "facet"] as const;
export type Facet = (typeof FACETS)[number];

export const facetOf = (text: string): Facet | undefined => {
  const name = text.toLowerCase().trim();
  return name === "colour" ? "color" : FACETS.find((facet) => facet === name);
};

/** The values a comma-separated tag value names, lower case. */
export const valuesOf = (value: string): string[] =>
  value
    .split(",")
    .map((each) => each.trim().toLowerCase())
    .filter(Boolean);

/** Whether a tag matches a card, case aside. An unknown facet matches nothing. */
export function tagMatches(card: EffectCard, tag: Tag): boolean {
  const facet = facetOf(tag.facet);
  const wanted = valuesOf(tag.value);
  switch (facet) {
    case "kind":
      return wanted.includes(card.look.kind);
    case "color":
      return card.look.colors.some((color) => wanted.includes(color.toLowerCase()));
    case "folder":
      return wanted.includes(card.folder.toLowerCase());
    case "facet":
      return card.look.facets.some((value) => wanted.includes(value.toLowerCase()));
    case undefined:
      return false;
    default:
      return facet satisfies never;
  }
}

/** Words of an ask that say nothing about an effect: left out of the keyword search, which matches any word. */
const STOP_WORDS = new Set(
  (
    "a an and any are as at be by can could effect effects for from has have i if in into is it its like look looks me my of on onto or out over " +
    "some something that the their them then there these they thing this to up was we what when where which with would you your"
  ).split(" "),
);

/** A word without its plural, so "sparks" finds "spark". */
const stem = (word: string): string => (word.length > 3 ? word.replace(/(?:es|s)$/, "") : word);
const tokens = (text: string): string[] => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const words = (text: string): Set<string> => new Set(tokens(text).map(stem));

/** A model name's words: `SiegeTankWeaponImpact_Lg` is siege, tank, weapon, impact, lg. */
export const nameWords = (name: string): string[] => tokens(name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2"));

/** The keyword search's words for an ask: its words, less the ones that say nothing about an effect, plurals aside. */
export const askWords = (ask: string): string[] => [...new Set(tokens(ask).filter((word) => !STOP_WORDS.has(word)).map(stem))];

/** What a word is worth by where it is found: the name, kind and facets say what the effect is, the look describes it. */
const WEIGHTS = { name: 4, facets: 3, suits: 2, look: 1 } as const;

/**
 * The cards an ask's words are found in, best first: each word counts once, at its best place (the
 * name's words, kind and folder; the facets and colours; what it suits; then the look), and a card
 * with more of the ask's words comes before one with fewer.
 */
export function keywordSearch(cards: Iterable<EffectCard>, ask: string): EffectCard[] {
  const wanted = askWords(ask);
  if (wanted.length === 0) return [];
  const scored = [...cards].map((card) => {
    const fields: [keyof typeof WEIGHTS, Set<string>][] = [
      ["name", new Set([...nameWords(card.name), card.look.kind, card.folder.toLowerCase()].map(stem))],
      ["facets", words([...card.look.facets, ...card.look.colors].join(" "))],
      ["suits", words(card.look.suits.join(" "))],
      ["look", words(card.look.look)],
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
