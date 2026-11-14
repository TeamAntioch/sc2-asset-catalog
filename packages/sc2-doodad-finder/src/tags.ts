// An object's tags (docs/adr/0001): facets of the cards the mapper has ticked so far, such as
// `story: industry` or `tileset: Foundry`, shown above the results. They raise matching results in
// the narrowing and go to the ranker as context. The mapper can drop one, which hides it, or pin
// one, which makes it a filter and keeps it whatever is ticked later.

import type { ObjectTag, TagChoice, TagChoices } from "@team-antioch/sc2-finder-kit/card.js";

import type { CandidateCard } from "./cards.ts";

export type { ObjectTag, TagChoice, TagChoices } from "@team-antioch/sc2-finder-kit/card.js";

/** The facets tags are made from, in the order they're shown: what kind of thing, its story, where it fits. */
export const TAG_FACETS = ["kind", "story", "biome", "tileset"] as const;

const keyOf = ({ facet, value }: TagChoice): string => `${facet.toLowerCase()}\n${value.toLowerCase()}`;

/** A card's values for each tag facet; a biome of `any` says nothing about the object. */
function cardFacets(card: CandidateCard): [facet: (typeof TAG_FACETS)[number], value: string][] {
  const description = card.entry.description;
  return [
    ...(description?.kind ? [["kind", description.kind] as const] : []),
    ...(description?.story ?? []).map((value) => ["story", value] as const),
    ...(description?.biome ?? []).filter((value) => value.toLowerCase() !== "any").map((value) => ["biome", value] as const),
    ...(card.entry.tilesets ?? []).map((value) => ["tileset", value] as const),
  ].map(([facet, value]) => [facet, value]);
}

/**
 * The tags the ticked cards give: each facet value at least half of them share (all of one card's),
 * the most shared first, then in facet order; less the dropped ones. Pinned ones come first,
 * whether the ticks give them or not. Dropping a pinned tag drops it.
 */
export function objectTags(ticked: readonly CandidateCard[], { pinned = [], dropped = [] }: TagChoices): ObjectTag[] {
  const droppedKeys = new Set(dropped.map(keyOf));
  const counts = new Map<string, { facet: string; value: string; count: number; order: number }>();
  const unique = [...new Map(ticked.map((card) => [card.id, card])).values()];
  for (const card of unique) {
    const seen = new Set<string>();
    for (const [facet, value] of cardFacets(card)) {
      const key = keyOf({ facet, value });
      if (seen.has(key)) continue;
      seen.add(key);
      const known = counts.get(key) ?? { facet, value, count: 0, order: TAG_FACETS.indexOf(facet) };
      known.count++;
      counts.set(key, known);
    }
  }
  const shared = Math.ceil(unique.length / 2);
  const pins: ObjectTag[] = [];
  const pinnedKeys = new Set<string>();
  for (const choice of pinned) {
    const key = keyOf(choice);
    if (droppedKeys.has(key) || pinnedKeys.has(key)) continue;
    pinnedKeys.add(key);
    const known = counts.get(key);
    pins.push({ facet: known?.facet ?? choice.facet, value: known?.value ?? choice.value, pinned: true, count: known?.count ?? 0 });
  }
  const rest = [...counts]
    .filter(([key, { count }]) => count >= shared && !droppedKeys.has(key) && !pinnedKeys.has(key))
    .map(([, tag]) => tag)
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ facet, value, count }): ObjectTag => ({ facet, value, pinned: false, count }));
  return [...pins, ...rest];
}
