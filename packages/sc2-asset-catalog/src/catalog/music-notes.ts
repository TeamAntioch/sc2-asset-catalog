import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { parseJsonFile, TextSchema as Text } from "../util/parse-json.js";
import { MUSIC_NOTES_PATH } from "./catalog-dirs.js";

// The listening notes (docs/adr in sc2-adjutant, ADR-0023): data/music-notes.json holds what we
// wrote about each of the game's music files, keyed by the file's base name (no folder, no
// extension, matched without regard to case). Gemini listened to each file with no name or context
// and wrote the words; the measurements (length, loudness, tempo, fades, where it peaks) are ours,
// taken from the audio. The file ships under CC BY 4.0. Nothing in it comes from the game's data:
// the ids, definitions, asset paths, dependencies and usage are extracted into the user's cache
// (extract-music.ts) and joined to the notes by file base name (music-catalog.ts).

/** One timestamped section of a track. */
export type MusicSection = { readonly start: string; readonly description: string };

/** What we wrote and measured of one music file. */
export type MusicNote = {
  /** full cue, ambient bed, stinger, loop, song, layer/stem or sound effect. */
  readonly kind: string;
  readonly description: string;
  readonly mood: readonly string[];
  /** Gemini's 1-5 ratings of how energetic, tense and bright (positive) it is. */
  readonly energy: number;
  readonly tension: number;
  readonly valence: number;
  readonly tempo_bpm?: number;
  readonly pulse: string;
  readonly instrumentation: readonly string[];
  readonly style: string;
  readonly vocals: string;
  readonly arc: string;
  readonly sections: readonly MusicSection[];
  readonly opening: string;
  readonly ending: string;
  readonly faction_feel: string;
  readonly use_for: readonly string[];
  readonly avoid_for: readonly string[];
  /** The file's length in seconds, as measured. */
  readonly duration_s: number;
  /** A 1-5 score of the signal's loudness, onset density and brightness; the other three are Gemini's. */
  readonly energy_measured?: number;
  /** True for a file that plays nothing. */
  readonly silent?: boolean;
  readonly lufs: number;
  readonly lra: number;
  readonly onset_rate: number;
  readonly tempo_estimate_bpm?: number;
  readonly tempo_strength?: number;
  readonly fade_in?: boolean;
  readonly fade_out?: boolean;
  readonly peak_at: number;
};

const Rating = z.number().int().min(1).max(5);
const Texts = z.array(Text);

/** A note as the notes file holds it: these fields and nothing else (nothing extracted from the game, no mission or story). */
export const MusicNoteSchema = z
  .object({
    kind: Text,
    description: Text,
    mood: Texts,
    energy: Rating,
    tension: Rating,
    valence: Rating,
    tempo_bpm: z.number().positive().optional(),
    pulse: Text,
    instrumentation: Texts,
    style: Text,
    vocals: Text,
    arc: Text,
    sections: z.array(z.object({ start: z.string().regex(/^\d+:\d{2}$/), description: Text }).strict()),
    opening: Text,
    ending: Text,
    faction_feel: Text,
    use_for: Texts,
    avoid_for: Texts,
    duration_s: z.number().positive(),
    energy_measured: Rating.optional(),
    silent: z.literal(true).optional(),
    lufs: z.number(),
    lra: z.number(),
    onset_rate: z.number(),
    tempo_estimate_bpm: z.number().optional(),
    tempo_strength: z.number().optional(),
    fade_in: z.literal(true).optional(),
    fade_out: z.literal(true).optional(),
    peak_at: z.number(),
  })
  .strict();

/** The fields a note may have, in the order the file writes them. */
export const MUSIC_NOTE_FIELDS = Object.keys(MusicNoteSchema.shape);

const MusicNotesFileSchema = z.object({ about: Text, notes: z.record(z.string().min(1), MusicNoteSchema) }).strict();

/** The notes file's notes by file base name, refused naming `shown` and each issue's key and field when it isn't valid. */
export function parseMusicNotes(text: string, shown: string): Record<string, MusicNote> {
  return parseJsonFile(text, shown, MusicNotesFileSchema, "a valid listening notes file").notes as Record<string, MusicNote>;
}

/** A music file's key in the notes: its base name, without folder or extension, lower case. */
export function musicFileKey(asset: string): string {
  const name = asset.replaceAll("\\", "/").split("/").at(-1) ?? asset;
  const dot = name.lastIndexOf(".");
  return (dot > 0 && /^\.[A-Za-z0-9]{1,4}$/.test(name.slice(dot)) ? name.slice(0, dot) : name).toLowerCase();
}

/** The shipped notes by lower-case file base name (or those of `file`). */
export function readMusicNotes(file: string = MUSIC_NOTES_PATH): Map<string, MusicNote> {
  const notes = parseMusicNotes(readFileSync(file, "utf8"), path.basename(file));
  return new Map(Object.entries(notes).map(([key, note]) => [key.toLowerCase(), note]));
}

/** The terms a denylist file holds: one a line, blank lines and `#` comments skipped. */
export const parseDenylist = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Which notes name a denied term (a campaign's mission, character or place that must not ship),
 * as whole words in any case: `{ note key, term }` pairs, in note order. The names themselves
 * aren't in this repo: a contributor keeps them in a file of their own (`MUSIC_NOTES_DENYLIST`).
 */
export function findDeniedNames(notes: Readonly<Record<string, unknown>>, terms: readonly string[]): { readonly note: string; readonly term: string }[] {
  const patterns = terms.map((term) => ({ term, pattern: new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, "iu") }));
  return Object.entries(notes).flatMap(([note, value]) => {
    const text = JSON.stringify(value);
    return patterns.filter(({ pattern }) => pattern.test(text)).map(({ term }) => ({ note, term }));
  });
}
