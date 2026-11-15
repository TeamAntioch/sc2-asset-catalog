// The Music Finder's narrowing (docs/adr/0001, 0004): for an ask, the catalog's keyword search (about 100
// results) and the nearest cards by embedding (about 100), merged without duplicates into about
// 200 by the kit. The page's filters are pinned tags of their own facets, so the kit's own
// machinery keeps them: what each facet matches, and how the keyword search takes it, are here.
//
//   energy, tension, valence   `2-3`, or `4`: the card's rating, averaged over its files
//   length                     `40-200`, `40-` or `-120`: seconds; a card whose files' range, shortest
//                              to longest, overlaps it (the range the card shows)
//   kind                       full cue, ambient bed, stinger, loop, song, layer/stem, sound effect
//   faction                    terran, protoss or zerg
//   role                       what the id is for (victory, cutscene, ...)
//   mood                       one of its moods
//   map has                    the map's dependencies, such as `Void (Campaign)`, comma apart: the
//                              cards that need another are left out
//   show                       `everything` shows the silent, unplayable and map-local ids that are
//                              left out by default

import { dependencyName, knownDependencies, providesDependency } from "@team-antioch/sc2-asset-catalog/catalog/doodad-dependencies.js";
import { type MusicQuery, type OpenRange, searchMusic, secondsOverlap, withinRange } from "@team-antioch/sc2-asset-catalog/catalog/music-catalog.js";
import type { Tag } from "@team-antioch/sc2-finder-kit/narrow.js";

import type { MusicCard, MusicSources } from "./cards.ts";
import { cardIdOf } from "./cards.ts";

export type { Tag } from "@team-antioch/sc2-finder-kit/narrow.js";

/** The rating facets: a card's rating, averaged over its files. */
export const RATING_FACETS = ["energy", "tension", "valence"] as const;

/**
 * Every facet a tag can name: the page's filters and the facets ticked cards give tags. Adding one
 * here makes `tagMatches` fail to compile until it says what the facet matches; `queryFor` hands
 * the keyword search only the facets it can take (`mood` is checked on the results).
 */
export const FACETS = [...RATING_FACETS, "length", "kind", "faction", "role", "mood", "map has", "show"] as const;
export type Facet = (typeof FACETS)[number];

/** A tag's facet, case aside; undefined for one that isn't ours. */
export const facetOf = (text: string): Facet | undefined => FACETS.find((facet) => facet === text.toLowerCase());

/** The dependency names the map can say it has, with the dependency each is: the game's own, as the doodad finder knows them. */
export const KNOWN_DEPENDENCIES: Readonly<Record<string, string>> = Object.fromEntries(knownDependencies().map((dependency) => [dependencyName(dependency), dependency] as const));

/** The dependencies a `map has` value names, as the catalog knows them; names it doesn't know are left out. */
export const dependenciesOf = (value: string): string[] =>
  value
    .split(",")
    .map((name) => KNOWN_DEPENDENCIES[name.trim()])
    .filter((dependency): dependency is string => dependency !== undefined);

/** A range of numbers, either end open. */
export type Range = OpenRange;

/** A range as a tag value writes it: `3`, `2-4`, `40-`, `-120`; undefined for anything else. */
export function parseRange(value: string): Range | undefined {
  const text = value.trim();
  const number = "(\\d+(?:\\.\\d+)?)";
  const single = new RegExp(`^${number}$`).exec(text);
  if (single) return [Number(single[1]), Number(single[1])];
  const pair = new RegExp(`^${number}?\\s*-\\s*${number}?$`).exec(text);
  if (pair && (pair[1] !== undefined || pair[2] !== undefined)) return [pair[1] === undefined ? undefined : Number(pair[1]), pair[2] === undefined ? undefined : Number(pair[2])];
  return undefined;
}

/** Whether a tag matches a card, case aside. An unknown facet, or a value that isn't one, matches nothing. */
export function tagMatches(card: MusicCard, tag: Tag): boolean {
  const facet = facetOf(tag.facet);
  const value = tag.value.toLowerCase().trim();
  const { entry } = card;
  switch (facet) {
    case "energy":
    case "tension":
    case "valence": {
      const range = parseRange(value);
      return range !== undefined && withinRange(entry[facet], range);
    }
    case "length": {
      const range = parseRange(value);
      return range !== undefined && secondsOverlap(entry.seconds, range);
    }
    case "kind":
      return entry.kinds.some((kind) => kind.toLowerCase() === value);
    case "faction":
      return card.factions.includes(value);
    case "role":
      return entry.role.toLowerCase() === value;
    case "mood":
      return card.pieces.some(({ note }) => note?.mood.some((mood) => mood.toLowerCase() === value));
    case "map has":
      return entry.dependency === undefined || providesDependency(dependenciesOf(tag.value), entry.dependency);
    case "show":
      return value === "everything" || (value === "playable" && !entry.unplayable && entry.mapLocal === undefined);
    case undefined:
      return false;
    default:
      return facet satisfies never;
  }
}

/** The tags with `show: playable` pinned unless the page chose what to show: the default hides what a map can't play. */
export const withDefaultShow = (tags: readonly Tag[] = []): Tag[] => (tags.some((tag) => tag.pinned && facetOf(tag.facet) === "show") ? [...tags] : [...tags, { facet: "show", value: "playable", pinned: true }]);

/** The keyword search's query for an ask and the pinned tags it can take: the rest the kit checks on the results. */
export function queryFor(ask: string, tags: readonly Tag[]): MusicQuery {
  const pinned = tags.filter((tag) => tag.pinned);
  const pinnedValue = (facet: Facet): string | undefined => pinned.find((tag) => facetOf(tag.facet) === facet)?.value;
  const query: { -readonly [K in keyof MusicQuery]: MusicQuery[K] } = { words: ask };
  for (const facet of RATING_FACETS) {
    const range = parseRange(pinnedValue(facet) ?? "");
    if (range) query[facet] = [range[0] ?? 1, range[1] ?? 5];
  }
  const length = parseRange(pinnedValue("length") ?? "");
  if (length?.[0] !== undefined) query.minSeconds = length[0];
  if (length?.[1] !== undefined) query.maxSeconds = length[1];
  const kind = pinnedValue("kind");
  if (kind) query.kinds = [kind.trim().toLowerCase()];
  const faction = pinnedValue("faction")?.trim().toLowerCase();
  if (faction === "terran" || faction === "protoss" || faction === "zerg") query.faction = faction;
  const role = pinnedValue("role");
  if (role) query.role = role.trim().toLowerCase();
  const have = pinnedValue("map has");
  if (have) query.dependencies = dependenciesOf(have);
  if (pinnedValue("show")?.trim().toLowerCase() === "everything") {
    query.includeUnplayable = true;
    query.includeMapLocal = true;
  }
  return query;
}

/** The keyword search's matches for an ask, best first, as card ids. An ask with no word the search takes finds nothing. */
export function keywordMatches({ catalog }: MusicSources, ask: string, tags: readonly Tag[]): { readonly id: string }[] {
  if (!/[a-z0-9]/i.test(ask)) return [];
  return searchMusic(catalog, queryFor(ask, tags))
    .filter(({ matched }) => matched.length > 0)
    .map(({ entry }) => ({ id: cardIdOf(entry, catalog) }));
}
