// The Music Finder's candidate cards (docs/adr/0003, 0004): each callable music id, a Soundtrack or a
// Sound, as a few lines of text, about 60 to 90 words, that the embeddings model embeds and the
// ranker reads. A card holds the id and its words, what kind of id it is and what it is for
// (its role), the listening notes of the files it plays (description, mood, style, what it suits)
// and its ratings and length. Where Blizzard used it stays on the page, out of the text.

import type { FinderCard } from "@team-antioch/sc2-finder-kit/card.js";
import { type MusicCatalog, type MusicEntry, factionsOfFeel, musicIdWords } from "@team-antioch/sc2-asset-catalog/catalog/music-catalog.js";
import { musicFileKey, musicFileName, type MusicNote } from "@team-antioch/sc2-asset-catalog/catalog/music-notes.js";

/** What the cards are made from: the extracted ids joined to the notes, and the notes by file key (the join keeps only the heard files'). */
export type MusicSources = { readonly catalog: MusicCatalog; readonly notes: ReadonlyMap<string, MusicNote> };

/** One file an id plays: its key (the base name, lower case), the name the game gives it, and its note when it has one. */
export type MusicPiece = { readonly key: string; readonly name: string; readonly note?: MusicNote };

/** A labelled fact for a card's page, such as an album's title. */
export type MusicFact = { readonly label: string; readonly value: string };

/**
 * For sc2-adjutant, may change: what a wrapper adds to a card from its own sources, such as album
 * titles and composers. `text` goes into the card's text, so the search finds it, and `facts` show
 * on the card.
 */
export type MusicLayerFields = { readonly text?: string; readonly facts?: readonly MusicFact[] };
export type MusicLayer = (entry: MusicEntry) => MusicLayerFields | undefined;

export type MusicCard = FinderCard & {
  readonly entry: MusicEntry;
  readonly pieces: readonly MusicPiece[];
  /** terran, protoss and zerg: the factions its files' notes feel like. */
  readonly factions: readonly string[];
  readonly layer?: MusicLayerFields;
};

/** The factions a note's faction feel names, as the search matches them (the catalog's rule, so a card and the keyword search agree). */
export function factionsOf(notes: readonly MusicNote[]): string[] {
  return [...new Set(notes.flatMap((note) => factionsOfFeel(note.faction_feel)))];
}

const soundtrackIds = new WeakMap<MusicCatalog, ReadonlySet<string>>();

/**
 * The id a card has. A Sound that shares its id with a Soundtrack (19 do) is `<id> (Sound)`, so
 * every card id is its own; the copy text keeps that, since the two are played differently.
 */
export function cardIdOf(entry: MusicEntry, catalog: MusicCatalog): string {
  if (entry.kind !== "Sound") return entry.id;
  let known = soundtrackIds.get(catalog);
  if (!known) soundtrackIds.set(catalog, (known = new Set(catalog.entries.filter(({ kind }) => kind === "Soundtrack").map(({ id }) => id))));
  return known.has(entry.id) ? `${entry.id} (Sound)` : entry.id;
}

/** A length as minutes and seconds: 1:05 for 65 seconds. */
export const mmss = (seconds: number): string => `${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`;

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/** About 90 words: a card stops adding moods and uses past this. */
const MAX_WORDS = 90;

/** A card's text: its name line, then the description, mood and style, what it suits and its ratings, each when it has one. */
export function cardText(entry: MusicEntry, pieces: readonly MusicPiece[], layer?: MusicLayerFields): string {
  const notes = pieces.flatMap(({ note }) => (note ? [note] : []));
  const lines = [`${entry.id} (${musicIdWords(entry.id).join(" ")}): ${entry.kind === "Sound" ? "a Sound" : "a Soundtrack"}, ${entry.role}${entry.kinds.length ? `, ${entry.kinds.join(" / ")}` : ""}`];
  const descriptions = [...new Set(notes.map((note) => note.description))].slice(0, 2);
  if (descriptions.length) lines.push(descriptions.join(" "));
  const moods = [...new Set(notes.flatMap((note) => note.mood))].slice(0, 8);
  const style = [...new Set(notes.map((note) => note.style))].slice(0, 2);
  const factions = factionsOf(notes);
  const feel = [moods.length ? `mood: ${moods.join(", ")}` : "", style.length ? `style: ${style.join("; ")}` : "", factions.length ? `faction: ${factions.join(", ")}` : ""].filter(Boolean).join("; ");
  if (feel) lines.push(feel);
  let budget = MAX_WORDS - wordCount(lines.join(" "));
  const uses: string[] = [];
  for (const use of [...new Set(notes.flatMap((note) => note.use_for))]) {
    const cost = wordCount(use);
    if (uses.length > 0 && cost > budget) break;
    uses.push(use);
    budget -= cost;
  }
  if (uses.length) lines.push(`suits: ${uses.join("; ")}`);
  const ratings = [
    entry.energy !== undefined ? `energy ${entry.energy}` : "",
    entry.tension !== undefined ? `tension ${entry.tension}` : "",
    entry.valence !== undefined ? `valence ${entry.valence}` : "",
    entry.seconds ? `length ${mmss(entry.seconds.min)}${entry.seconds.max !== entry.seconds.min ? `-${mmss(entry.seconds.max)}` : ""}` : "",
  ].filter(Boolean);
  if (ratings.length) lines.push(`${ratings.join(", ")} (of 5)`);
  if (layer?.text) lines.push(layer.text);
  return lines.join("\n");
}

/** The card for every id the catalog holds, silent, unplayable and map-local ones too: the page's toggle shows or hides them. */
export function musicCards({ catalog, notes }: MusicSources, layerOf?: MusicLayer): MusicCard[] {
  return catalog.entries.map((entry) => {
    const seen = new Set<string>();
    const pieces: MusicPiece[] = [];
    for (const asset of entry.assets) {
      const key = musicFileKey(asset);
      if (seen.has(key)) continue;
      seen.add(key);
      const note = notes.get(key);
      pieces.push({ key, name: musicFileName(asset), ...(note ? { note } : {}) });
    }
    const layer = layerOf?.(entry);
    return {
      id: cardIdOf(entry, catalog),
      name: entry.id,
      text: cardText(entry, pieces, layer),
      entry,
      pieces,
      factions: factionsOf(pieces.flatMap(({ note }) => (note ? [note] : []))),
      ...(entry.dependency !== undefined ? { dependency: entry.dependency } : {}),
      ...(layer ? { layer } : {}),
    };
  });
}
