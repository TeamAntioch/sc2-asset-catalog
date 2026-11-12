// Doodad notes (GLOSSARY.md: Doodad Use): what a mapper has found doodads work as, kept in a folder
// of their own until they are contributed to this package's Doodad Uses (CONTRIBUTING.md). The file
// is `doodad-notes.json`, and a caller lays it over the stock catalog as the sources' `notes`:
//
//   {
//     "doodads": {
//       "PortZionCrusherDoodad": { "uses": [{ "use": "crusher press head", "scale": 0.6, "from": "crushing-press search, 2026-11-09" }] },
//       "MyModLamp": { "look": "tall street lamp with a cracked amber globe" }
//     }
//   }
//
// Each entry is a game doodad's or a terrain object's, by id: `uses` are its Doodad Uses, records as
// the uses files hold them (doodad-uses.ts; a plain phrase, from before uses were records, still
// reads as one), and `look`, when set, replaces the catalog's look. (An entry for a mod's doodad is
// still read.) Once the catalog holds a note's uses and look, the next note added drops them from
// the file.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseJsonFile } from "../util/parse-json.js";
import type { DoodadSearchSources } from "./doodad-search.js";
import { addUses, type DoodadUse, DoodadUseOrPhraseSchema, DoodadUseSchema, heldIn, orderedUse } from "./doodad-uses.js";

export const DOODAD_NOTES_FILE = "doodad-notes.json";

const DoodadNoteSchema = z
  .object({
    uses: z.array(DoodadUseOrPhraseSchema).optional(),
    look: z.string().min(1).optional(),
  })
  .strict();

const DoodadNotesSchema = z.object({ doodads: z.record(z.string().min(1), DoodadNoteSchema).default({}) }).strict();

export type DoodadNote = z.infer<typeof DoodadNoteSchema>;

/** The doodad notes in a folder, by doodad id; none when it has no notes file. Throws, naming the file, for one that isn't valid. */
export async function readDoodadNotes(folder: string): Promise<Readonly<Record<string, DoodadNote>>> {
  const file = path.join(folder, DOODAD_NOTES_FILE);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  return parseJsonFile(text, file, DoodadNotesSchema, "a valid doodad notes file").doodads;
}

/** The doodads a note here can be for: the catalog's game doodads and terrain objects, with their Doodad Uses. */
export type KnownDoodads = Pick<DoodadSearchSources, "doodads" | "terrainObjects">;

/** Writes a folder's doodad notes, ids sorted, each use as a record. */
export async function writeDoodadNotes(folder: string, notes: Readonly<Record<string, DoodadNote>>): Promise<void> {
  const doodads = Object.fromEntries(
    Object.entries(notes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, note]) => [id, { ...note, ...(note.uses ? { uses: note.uses.map(orderedUse) } : {}) }]),
  );
  await writeFile(path.join(folder, DOODAD_NOTES_FILE), `${JSON.stringify({ doodads }, null, 2)}\n`);
}

type HeldEntry = { readonly look?: string | undefined; readonly uses: readonly DoodadUse[] };

/** What the catalog holds for a game doodad or terrain object, if it is one: its description's look and its Doodad Uses. */
function heldEntry(id: string, known: KnownDoodads): HeldEntry | undefined {
  const entry = Object.hasOwn(known.doodads, id) ? known.doodads[id] : Object.hasOwn(known.terrainObjects, id) ? known.terrainObjects[id] : undefined;
  if (!entry) return undefined;
  return { look: entry.description?.look, uses: entry.uses ?? [] };
}

/** Whether the id is a game doodad or a terrain object, whose notes can be contributed. */
export const isGameDoodad = (id: string, known: KnownDoodads): boolean => Object.hasOwn(known.doodads, id) || Object.hasOwn(known.terrainObjects, id);

/**
 * The notes without what the catalog already holds: a game doodad's or terrain object's uses that its
 * uses file already says all of (heldIn: the same use, case and spacing aside, with any variation and scale it gives), a look equal to its description's, and an entry
 * left empty. Each dropped part is named in `dropped`, such as `FoundryStamperHead: use “press head”`.
 */
export function withoutHeldNotes(
  notes: Readonly<Record<string, DoodadNote>>,
  known: KnownDoodads,
): { readonly notes: Record<string, DoodadNote>; readonly dropped: readonly string[] } {
  const kept: Record<string, DoodadNote> = {};
  const dropped: string[] = [];
  for (const [id, note] of Object.entries(notes)) {
    const catalog = heldEntry(id, known);
    if (!catalog) {
      kept[id] = note;
      continue;
    }
    const uses = (note.uses ?? []).filter((use) => {
      const held = heldIn(catalog.uses, use);
      if (held) dropped.push(`${id}: use “${use.use}”`);
      return !held;
    });
    const look = note.look !== undefined && note.look === catalog.look ? undefined : note.look;
    if (note.look !== undefined && look === undefined) dropped.push(`${id}: look`);
    if (uses.length || look !== undefined) kept[id] = { ...(uses.length ? { uses } : {}), ...(look !== undefined ? { look } : {}) };
  }
  return { notes: kept, dropped };
}

export type DoodadNoteInput = {
  readonly id: string;
  readonly use?: string | undefined;
  /** The use's variation, by the Editor's number (0 for 00). */
  readonly variation?: number | undefined;
  /** The use's uniform scale. */
  readonly scale?: number | undefined;
  /** The search or other source the use came from, and its date. */
  readonly from?: string | undefined;
  readonly look?: string | undefined;
};

/** What adding a note did: the doodad's note as it now stands, what was dropped, and the file it went in when that isn't the notes file. */
export type DoodadNoteAdded = { readonly note: DoodadNote | undefined; readonly dropped: readonly string[]; readonly file?: string };

/** The uses with one added (addUses). */
export const withUse = (uses: readonly DoodadUse[], use: DoodadUse | undefined): DoodadUse[] => addUses(uses, use ? [use] : []).uses;

/** The input's use as a record, checked; none without a use. Throws for a variation, scale or source without one. */
function useOf(input: DoodadNoteInput): DoodadUse | undefined {
  const use = input.use?.trim() || undefined;
  const from = input.from?.trim() || undefined;
  if (use === undefined) {
    if (input.variation !== undefined || input.scale !== undefined || from !== undefined) throw new Error(`A variation, a scale or a source goes with a use: give ${input.id} a use too`);
    return undefined;
  }
  const parsed = DoodadUseSchema.safeParse({ use, variation: input.variation, scale: input.scale, from });
  if (!parsed.success) throw new Error(`A use for ${input.id}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`);
  return orderedUse(parsed.data);
}

/** A note's use and look, checked. */
export type NoteParts = { readonly use: DoodadUse | undefined; readonly look: string | undefined };

/** The input's use, checked (as a record), and its look, trimmed. Throws for a variation, scale or source without a use, and for a note with neither. */
export function noteParts(input: DoodadNoteInput): NoteParts {
  const look = input.look?.trim() || undefined;
  const use = useOf(input);
  if (use === undefined && look === undefined) throw new Error(`A note for ${input.id} needs a use or a look`);
  return { use, look };
}

/**
 * Adds a Doodad Use, a look, or both for a game doodad or a terrain object to a folder's notes,
 * which then drop what the catalog already holds (`withoutHeldNotes`).
 */
export async function addDoodadNote(folder: string, input: DoodadNoteInput, known: KnownDoodads): Promise<DoodadNoteAdded> {
  if (!isGameDoodad(input.id, known)) throw new Error(`${input.id} isn't a game doodad or a terrain object`);
  return writeDoodadNote(folder, input.id, noteParts(input), known);
}

/** Writes a checked note (noteParts) into a folder's notes, which then drop what the catalog already holds. */
export async function writeDoodadNote(
  folder: string,
  id: string,
  { use, look }: NoteParts,
  known: KnownDoodads,
): Promise<DoodadNoteAdded> {
  const notes = { ...(await readDoodadNotes(folder)) };
  const before = notes[id] ?? {};
  const uses = withUse(before.uses ?? [], use);
  notes[id] = { ...(uses.length ? { uses } : {}), ...((look ?? before.look) !== undefined ? { look: look ?? before.look } : {}) };
  const pruned = withoutHeldNotes(notes, known);
  await writeDoodadNotes(folder, pruned.notes);
  return { note: pruned.notes[id], dropped: pruned.dropped };
}
