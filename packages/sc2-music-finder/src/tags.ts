// An object's tags (docs/adr/0001): facets of the cards the mapper has ticked so far, such as
// `mood: tense` or `faction: zerg`, shown above the results. They raise matching results in the
// narrowing and go to the ranker as context. The mapper can drop one, which hides it, or pin one,
// which makes it a filter and keeps it whatever is ticked later. The page's own filters are pinned
// tags too (narrow.ts).

import type { ObjectTag, TagChoice, TagChoices } from "@team-antioch/sc2-finder-kit/card.js";

import type { MusicCard } from "./cards.ts";

export type { ObjectTag, TagChoice, TagChoices } from "@team-antioch/sc2-finder-kit/card.js";

/** The facets tags are made from, in the order they're shown: what kind of track, whose, how it feels, what for. */
export const TAG_FACETS = ["kind", "faction", "mood", "role"] as const;

const keyOf = ({ facet, value }: TagChoice): string => `${facet.toLowerCase()}\n${value.toLowerCase()}`;

/** A card's values for each tag facet. */
function cardFacets(card: MusicCard): [facet: (typeof TAG_FACETS)[number], value: string][] {
  return [
    ...card.entry.kinds.map((value) => ["kind", value] as const),
    ...card.factions.map((value) => ["faction", value] as const),
    ...card.pieces.flatMap(({ note }) => note?.mood ?? []).map((value) => ["mood", value] as const),
    ...(card.entry.role !== "other" ? [["role", card.entry.role] as const] : []),
  ].map(([facet, value]) => [facet, value]);
}

/**
 * The tags the ticked cards give: each facet value at least half of them share (all of one card's),
 * the most shared first, then in facet order; less the dropped ones. Pinned ones come first,
 * whether the ticks give them or not. Dropping a pinned tag drops it.
 */
export function objectTags(ticked: readonly MusicCard[], { pinned = [], dropped = [] }: TagChoices): ObjectTag[] {
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
