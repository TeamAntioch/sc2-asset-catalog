// An object's tags (docs/adr/0001): facets of the sets the mapper has ticked so far, such as
// `kind: room` or `facet: ship bridge`, shown above the results. They raise matching results in the
// narrowing and go to the ranker as context. The mapper can drop one, which hides it, or pin one,
// which makes it a filter. The page's kind chips are a pinned `kind` tag too (narrow.ts).

import type { ObjectTag, TagChoice, TagChoices } from "@team-antioch/sc2-finder-kit/card.js";
import type { CopyText } from "@team-antioch/sc2-finder-kit/tray.js";

import type { SetCard } from "./cards.ts";

export type { ObjectTag, TagChoice, TagChoices } from "@team-antioch/sc2-finder-kit/card.js";

const keyOf = ({ facet, value }: TagChoice): string => `${facet.toLowerCase()}\n${value.toLowerCase()}`;

/** A card's values for each tag facet, kind first. */
const cardFacets = (card: SetCard): (readonly [facet: "kind" | "facet", value: string])[] => [["kind", card.look.kind], ...card.look.facets.map((value) => ["facet", value] as const)];

/**
 * The tags the ticked cards give: each facet value at least half of them share (all of one card's),
 * the most shared first, kind before facets; less the dropped ones. Pinned ones come first, whether
 * the ticks give them or not.
 */
export function objectTags(ticked: readonly SetCard[], { pinned = [], dropped = [] }: TagChoices): ObjectTag[] {
  const droppedKeys = new Set(dropped.map(keyOf));
  const counts = new Map<string, { facet: string; value: string; count: number; order: number }>();
  const unique = [...new Map(ticked.map((card) => [card.id, card])).values()];
  for (const card of unique) {
    const seen = new Set<string>();
    for (const [facet, value] of cardFacets(card)) {
      const key = keyOf({ facet, value });
      if (seen.has(key)) continue;
      seen.add(key);
      const known = counts.get(key) ?? { facet, value, count: 0, order: facet === "kind" ? 0 : 1 };
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
    pins.push({ facet: choice.facet, value: choice.value, pinned: true, count: counts.get(key)?.count ?? 0 });
  }
  const rest = [...counts]
    .filter(([key, { count }]) => count >= shared && !droppedKeys.has(key) && !pinnedKeys.has(key))
    .map(([, tag]) => tag)
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ facet, value, count }): ObjectTag => ({ facet, value, pinned: false, count }));
  return [...pins, ...rest];
}

/** One set's copy text: its id and name, then the Cutscene Editor files it is in, which is where the Editor finds it. */
export const setCopyText = (card: SetCard | undefined, id: string): string => (card ? `${id} (${card.name}): ${card.look.files.join(", ")}` : id);

/** What the Set Finder copies, from its cards: a line a set. */
export const setCopy = (cards: () => ReadonlyMap<string, SetCard>): CopyText => ({
  item: ({ id }) => setCopyText(cards().get(id), id),
  all: (items) => items.map(({ id }) => setCopyText(cards().get(id), id)).join("\n"),
});
