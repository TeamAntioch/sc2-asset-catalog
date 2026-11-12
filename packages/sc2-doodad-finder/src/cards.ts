// The Doodad Finder's candidate cards (docs/adr/0001): each game doodad, terrain object and mod
// doodad as a few lines of text, about 50 to 80 tokens, that the embeddings model embeds and the
// ranker reads. A card holds the name, the id's words, the look, kind, size, role, story, biome,
// tilesets and Doodad Use phrases. Where a use came from (its `from`) stays out: it names a search,
// not the doodad. An undescribed doodad's card is its name and id words alone.

import { allDoodadEntries, type DoodadEntry, type DoodadSearchSources, idWords } from "@team-antioch/sc2-asset-catalog/catalog/doodad-search.js";

export type CandidateCard = {
  readonly id: string;
  readonly name: string;
  readonly source: DoodadEntry["source"];
  /** The card's text: what is embedded and what the ranker reads. */
  readonly text: string;
  /** The entry the card was written from: its facets, for tags, and its look, for the page. */
  readonly entry: DoodadEntry;
  /** The map dependency it needs, absent when the default Void (Mod) brings it in. */
  readonly dependency?: string;
  /** For a map's dependencies: whether its dependencies already bring it in. */
  readonly provided?: boolean;
  /** A mod doodad its index has no description of for its current model. */
  readonly pending?: true;
};

/** About 80 tokens: a card stops adding Doodad Uses past this many words. */
const MAX_WORDS = 60;

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;
const sameWords = (a: string, b: string): boolean => (a.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(" ") === (b.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(" ");

/** A card's text: its name line, then its look, facets, uses and pending flag, each when it has one. */
export function cardText(entry: DoodadEntry): string {
  const words = idWords(entry.id);
  const lines = [sameWords(entry.name, words) ? entry.name : `${entry.name} (${words})`];
  const { description } = entry;
  if (description) {
    lines.push(`look: ${description.look}`);
    const facets = [[description.kind, description.size, description.role ?? description.use].filter(Boolean).join(", ")];
    if (description.story?.length) facets.push(`story: ${description.story.join(", ")}`);
    if (description.biome?.length) facets.push(`biome: ${description.biome.join(", ")}`);
    if (entry.tilesets?.length) facets.push(`tilesets: ${entry.tilesets.join(", ")}`);
    const facetLine = facets.filter(Boolean).join("; ");
    if (facetLine) lines.push(facetLine);
    const uses: string[] = [];
    let budget = MAX_WORDS - wordCount(lines.join(" ")) - 2;
    for (const { use } of entry.uses) {
      const cost = wordCount(use);
      if (uses.length > 0 && cost > budget) break;
      uses.push(use);
      budget -= cost;
    }
    if (uses.length) lines.push(`used as: ${uses.join("; ")}`);
  }
  if (entry.pending) lines.push(description ? "pending: described for an earlier model" : "pending: not yet described");
  return lines.join("\n");
}

const PREFERRED: Record<DoodadEntry["source"], number> = { mod: 0, doodad: 1, "terrain-object": 2 };

/** The card for every doodad, terrain object and mod doodad the sources hold; with a map's dependencies, each marked provided or not. */
export function candidateCards(sources: DoodadSearchSources, dependencies?: readonly string[]): CandidateCard[] {
  // A terrain object may share an id with a game doodad or a mod doodad: the id names the
  // one a lookup by id gives: the mod's, else the game doodad.
  const entries = new Map<string, DoodadEntry>();
  for (const entry of allDoodadEntries(sources, dependencies)) {
    const known = entries.get(entry.id);
    if (!known || PREFERRED[entry.source] < PREFERRED[known.source]) entries.set(entry.id, entry);
  }
  return [...entries.values()].map((entry) => ({
    id: entry.id,
    name: entry.name,
    source: entry.source,
    text: cardText(entry),
    entry,
    ...(entry.dependency !== undefined ? { dependency: entry.dependency } : {}),
    ...(entry.provided !== undefined ? { provided: entry.provided } : {}),
    ...(entry.pending ? { pending: true as const } : {}),
  }));
}
