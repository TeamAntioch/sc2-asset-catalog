import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { parseJsonFile } from "../util/parse-json.js";
import { extractedDir as extractedDirOf } from "./catalog-dirs.js";
import { providesDependency } from "./doodad-dependencies.js";
import { type ExtractedMusic, MUSIC_EXTRACTED_FILE } from "./extract-music.js";
import { musicFileKey, type MusicNote, readMusicNotes } from "./music-notes.js";

// The music catalog is two things joined by file base name (ADR-0023 in sc2-adjutant):
// - data/music-notes.json, what we wrote and measured of each file (music-notes.ts), shipped;
// - music-extracted.json, what is extracted from the game's data into the user's cache
//   (extract-music.ts): every callable id, its files, dependency and uses.
// A Music entry is one id (a Soundtrack or a Sound) with the notes of the files it can play. An id
// whose files have no notes is still an entry: it matches by the words of its id.

/** One callable music id with what we know of the files it plays. */
export type MusicEntry = ExtractedMusic & {
  /** The notes of the files it plays, one per file that has one, in file order. */
  readonly notes: readonly MusicNote[];
  /** Each file's key (its base name, lower case): `notes` has the notes of those that have one. */
  readonly files: readonly string[];
  /** Its id's words and where it sits, lower case: what a keyword search by words of the id matches. */
  readonly idWords: readonly string[];
  /** The kinds of its files (full cue, ambient bed, stinger, loop, song, layer/stem, sound effect). */
  readonly kinds: readonly string[];
  /** Ratings, averaged over the files it plays that have notes; undefined without any. */
  readonly energy?: number;
  readonly tension?: number;
  readonly valence?: number;
  /** The shortest and longest of its files, in seconds; undefined without any note. */
  readonly seconds?: { readonly min: number; readonly max: number };
  /** True when every file it plays is silent. */
  readonly silent: boolean;
  /** Not for a map to play: it plays nothing, only silence, or is a sound effect. */
  readonly unplayable: boolean;
};

export type MusicCatalog = {
  /** Every entry, in id order (a Soundtrack before a Sound of the same id). */
  readonly entries: readonly MusicEntry[];
  /** Note keys whose file no extracted id plays: left out, listed for the extractor's report. */
  readonly unextractedNotes: readonly string[];
};

const MusicExtractedSchema = z.array(
  z
    .object({
      id: z.string().min(1),
      kind: z.enum(["Soundtrack", "Sound"]),
      defined: z.array(z.string()),
      package: z.string(),
      mapLocal: z.string().optional(),
      dependency: z.string().optional(),
      sounds: z.array(z.string()).optional(),
      assets: z.array(z.string()),
      empty: z.boolean(),
      role: z.string(),
      continuous: z.boolean().optional(),
      next: z.string().optional(),
      delay_s: z.number().optional(),
      select: z.string().optional(),
      usedIn: z.array(z.object({ file: z.string(), line: z.number(), func: z.string().optional() })),
      usedCount: z.number(),
    })
    .strict(),
);

/** The extracted music file's records, refused naming `shown` and each issue when it isn't valid. */
export function parseMusicExtracted(text: string, shown: string): ExtractedMusic[] {
  return parseJsonFile(text, shown, MusicExtractedSchema, "a valid extracted music file") as ExtractedMusic[];
}

/** The words of an id: split at underscores, hyphens, digits and case changes, lower case ("ZSpace02MusicMain" → z, space, 02, music, main). */
export function musicIdWords(id: string): string[] {
  return id
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replaceAll(/([A-Za-z])(\d)/g, "$1 $2")
    .replaceAll(/(\d)([A-Za-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const mean = (values: readonly number[]): number | undefined => (values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : undefined);

/** The entries for the extracted ids, each joined to the notes of its files by base name. */
export function joinMusicCatalog(extracted: readonly ExtractedMusic[], notes: ReadonlyMap<string, MusicNote>): MusicCatalog {
  const played = new Set<string>();
  const entries = extracted.map((record): MusicEntry => {
    const files = [...new Set(record.assets.map(musicFileKey))];
    for (const file of files) played.add(file);
    const heard = files.flatMap((file) => {
      const note = notes.get(file);
      return note ? [note] : [];
    });
    const energy = mean(heard.map((note) => note.energy));
    const tension = mean(heard.map((note) => note.tension));
    const valence = mean(heard.map((note) => note.valence));
    const lengths = heard.map((note) => note.duration_s);
    const silent = files.length > 0 && files.every((file) => notes.get(file)?.silent === true);
    const effectsOnly = heard.length > 0 && heard.every((note) => note.kind === "sound effect" || note.kind === "silence");
    return {
      ...record,
      notes: heard,
      files,
      idWords: [...new Set([...musicIdWords(record.id), ...(record.mapLocal ? musicIdWords(record.mapLocal.replace(/\.sc2map$/, "")) : [])])],
      kinds: [...new Set(heard.map((note) => note.kind))],
      ...(energy !== undefined ? { energy } : {}),
      ...(tension !== undefined ? { tension } : {}),
      ...(valence !== undefined ? { valence } : {}),
      ...(lengths.length ? { seconds: { min: Math.min(...lengths), max: Math.max(...lengths) } } : {}),
      silent,
      unplayable: record.empty || silent || effectsOnly,
    };
  });
  return { entries, unextractedNotes: [...notes.keys()].filter((key) => !played.has(key)).sort() };
}

/** What to tell the user about notes whose file no extracted id plays (they're left out), or undefined when there are none. */
export function unextractedNotesReport(catalog: MusicCatalog, show = 5): string | undefined {
  const { unextractedNotes } = catalog;
  if (!unextractedNotes.length) return undefined;
  const names = unextractedNotes.slice(0, show).join(", ");
  return `${unextractedNotes.length} listening notes are for files no extracted music id plays, and are left out: ${names}${unextractedNotes.length > show ? ", …" : ""}`;
}

/** The extracted music in `extractedDir` joined to the shipped notes (or those of `notesFile`). Throws saying to run `extract-music` when nothing is extracted. */
export function readMusicCatalog({ extractedDir = extractedDirOf(), notesFile }: { readonly extractedDir?: string; readonly notesFile?: string } = {}): MusicCatalog {
  const file = path.join(extractedDir, MUSIC_EXTRACTED_FILE);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`${file} isn't there: run \`sc2-asset-catalog extract-music\` first`, { cause: error });
    throw error;
  }
  return joinMusicCatalog(parseMusicExtracted(text, MUSIC_EXTRACTED_FILE), readMusicNotes(notesFile));
}

/** The entry for an id, or undefined. A few ids are both a Soundtrack and a Sound: `kind` says which, and without it the Soundtrack comes first. */
export function getMusicEntry(catalog: MusicCatalog, id: string, kind?: "Soundtrack" | "Sound"): MusicEntry | undefined {
  return catalog.entries.find((entry) => entry.id === id && (kind === undefined || entry.kind === kind));
}

/** The entries that play a file, by its base name (any case, with or without a folder or extension). */
export function musicEntriesPlaying(catalog: MusicCatalog, file: string): MusicEntry[] {
  const key = musicFileKey(file);
  return catalog.entries.filter((entry) => entry.files.includes(key));
}

// ---------------------------------------------------------------- search

/** A 1-5 rating range, both ends included. */
export type RatingRange = readonly [min: number, max: number];

export type MusicQuery = {
  /** What the scene needs, in plain words: matched against moods, uses, descriptions and the words of the id. */
  readonly words?: string;
  /**
   * Ratings read as the card shows them: the mean over the files the id plays that have notes. An id
   * whose files are rated 2 and 4 is a 3, so it fits 3-3 and not 4-5.
   */
  readonly energy?: RatingRange;
  readonly tension?: RatingRange;
  readonly valence?: RatingRange;
  /**
   * Length as the card shows it, as a range from its shortest file to its longest: an entry fits
   * when that range overlaps `minSeconds` to `maxSeconds` (its longest file is at least
   * `minSeconds`, its shortest at most `maxSeconds`). An id with files of 10 s and 100 s fits 30-60,
   * since the card says "0:10-1:40"; it doesn't fit 120 and over.
   */
  readonly minSeconds?: number;
  readonly maxSeconds?: number;
  /** Only entries with a file of one of these kinds. */
  readonly kinds?: readonly string[];
  /** Only entries with a file whose faction feel carries that race's feel words: terran "frontier", protoss "ancient", zerg "swarm". */
  readonly faction?: "terran" | "protoss" | "zerg";
  readonly role?: string;
  /** Only entries a map with these dependencies can play (see providesDependency); all of them when unset. */
  readonly dependencies?: readonly string[];
  /** Entries that play nothing, silence or sound effects, and ids that exist only inside one Blizzard map, are left out unless asked for. */
  readonly includeUnplayable?: boolean;
  readonly includeMapLocal?: boolean;
  readonly limit?: number;
};

export type MusicMatch = {
  readonly entry: MusicEntry;
  readonly score: number;
  /** The query's words that matched. */
  readonly matched: readonly string[];
};

const FACTION_FEEL = { terran: "frontier", protoss: "ancient", zerg: "swarm" } as const;
/** English function words: they say nothing about a scene. Words that are only common in the catalog (builds, sounds) are not listed here: their document frequency lowers their weight. */
const STOP_WORDS = new Set(
  "a an and are as at be been but by can could did do does each for from had has have he her him his how i if in into is it its just of on or our over she so some such than that the their them then there these they this through to under was we were what when where which while who will with would you your".split(" "),
);

const SUFFIXES = ["ions", "ion", "ings", "ing", "edly", "ed", "ly", "es", "e", "s"];

/** A word's stem for matching: a common ending off, then its first five letters, so "tension" matches "tense" and "building" matches "builds". */
function stem(word: string): string {
  const suffix = SUFFIXES.find((ending) => word.length - ending.length >= 4 && word.endsWith(ending));
  return (suffix ? word.slice(0, -suffix.length) : word).slice(0, 5);
}

const wordsOf = (text: string): string[] => text.toLowerCase().match(/[a-z]+/g) ?? [];

const inRange = (value: number | undefined, range: RatingRange | undefined): boolean => range === undefined || (value !== undefined && value >= range[0] && value <= range[1]);

/** How each kind of text counts toward a match: what a mapper would ask in ("mood", "use for") counts most. */
const WEIGHTS = { mood: 3, useFor: 3, kind: 2, idWord: 2, style: 1.5, description: 1, other: 0.5 } as const;

type TextGroups = ReadonlyArray<readonly [weight: number, stems: Set<string>]>;

/** An entry's stemmed text never changes, so each entry's groups are built once, not once per query. */
const groupsCache = new WeakMap<MusicEntry, TextGroups>();

function textGroups(entry: MusicEntry): TextGroups {
  const cached = groupsCache.get(entry);
  if (cached) return cached;
  const groups = buildTextGroups(entry);
  groupsCache.set(entry, groups);
  return groups;
}

function buildTextGroups(entry: MusicEntry): TextGroups {
  const stems = (texts: readonly (string | undefined)[]): Set<string> => new Set(texts.flatMap((text) => wordsOf(text ?? "")).map(stem));
  return [
    [WEIGHTS.mood, stems(entry.notes.flatMap((note) => note.mood))],
    [WEIGHTS.useFor, stems(entry.notes.flatMap((note) => note.use_for))],
    [WEIGHTS.kind, stems([...entry.kinds, entry.role])],
    [WEIGHTS.idWord, stems(entry.idWords)],
    [WEIGHTS.style, stems(entry.notes.flatMap((note) => [note.style, note.faction_feel, note.vocals, ...note.instrumentation]))],
    [WEIGHTS.description, stems(entry.notes.map((note) => note.description))],
    [WEIGHTS.other, stems(entry.notes.flatMap((note) => [note.arc, note.pulse, ...note.sections.map((section) => section.description)]))],
  ];
}

type DocumentFrequencies = { readonly entries: number; readonly counts: ReadonlyMap<string, number> };

/** How many entries' text holds each stem, counted once per catalog: a word that most entries say tells little about which one a scene needs. */
const frequenciesCache = new WeakMap<MusicCatalog, DocumentFrequencies>();

function documentFrequencies(catalog: MusicCatalog): DocumentFrequencies {
  const cached = frequenciesCache.get(catalog);
  if (cached) return cached;
  const counts = new Map<string, number>();
  for (const entry of catalog.entries) {
    const held = new Set<string>();
    for (const [, stems] of textGroups(entry)) for (const stem of stems) held.add(stem);
    for (const stem of held) counts.set(stem, (counts.get(stem) ?? 0) + 1);
  }
  const frequencies = { entries: catalog.entries.length, counts };
  frequenciesCache.set(catalog, frequencies);
  return frequencies;
}

/** What a word's match is worth by how few entries say it: about 0.7 for a word every entry says, 3.7 for one in 3% of them. */
const rarity = ({ entries, counts }: DocumentFrequencies, stem: string): number => Math.log(1 + entries / (counts.get(stem) ?? 1));

/**
 * The entries that fit a query, best first. A word counts by the best text it appears in (a mood
 * or a use beats a description beats an id word beats the arc), and an entry needs at least one
 * word to match when the query has words. A word counts for more the fewer entries say it
 * (inverse document frequency, over every entry, once per catalog): "alarm" in a few entries
 * outweighs "builds" in half of them, so an entry that matches the rare word isn't buried under
 * ones that match several common words. Function words (STOP_WORDS) count for nothing. An entry
 * with no notes can match only by the words of its id and its role, and a rating or length filter
 * leaves it out (nothing is known of it). Equal scores keep id order.
 */
export function searchMusic(catalog: MusicCatalog, query: MusicQuery = {}): MusicMatch[] {
  const words = [...new Set(wordsOf(query.words ?? "").filter((word) => !STOP_WORDS.has(word)))];
  const frequencies = words.length ? documentFrequencies(catalog) : undefined;
  const worth = new Map(words.map((word) => [word, frequencies ? rarity(frequencies, stem(word)) : 1]));
  const wanted = query.dependencies;
  const matches: MusicMatch[] = [];
  for (const entry of catalog.entries) {
    if (!query.includeUnplayable && entry.unplayable) continue;
    if (!query.includeMapLocal && entry.mapLocal !== undefined) continue;
    if (query.kinds && !entry.kinds.some((kind) => query.kinds!.includes(kind))) continue;
    if (!inRange(entry.energy, query.energy) || !inRange(entry.tension, query.tension) || !inRange(entry.valence, query.valence)) continue;
    if (query.minSeconds !== undefined && (entry.seconds === undefined || entry.seconds.max < query.minSeconds)) continue;
    if (query.maxSeconds !== undefined && (entry.seconds === undefined || entry.seconds.min > query.maxSeconds)) continue;
    if (query.faction && !entry.notes.some((note) => note.faction_feel.toLowerCase().includes(FACTION_FEEL[query.faction!]))) continue;
    if (query.role !== undefined && entry.role !== query.role) continue;
    if (wanted && entry.dependency !== undefined && !providesDependency(wanted, entry.dependency)) continue;
    let score = 0;
    const matched: string[] = [];
    if (words.length) {
      const groups = textGroups(entry);
      for (const word of words) {
        const best = Math.max(0, ...groups.map(([weight, stems]) => (stems.has(stem(word)) ? weight : 0)));
        if (best > 0) {
          score += best * (worth.get(word) ?? 1);
          matched.push(word);
        }
      }
      if (!matched.length) continue;
    }
    matches.push({ entry, score, matched });
  }
  matches.sort((a, b) => b.score - a.score || b.matched.length - a.matched.length);
  return query.limit !== undefined ? matches.slice(0, query.limit) : matches;
}
