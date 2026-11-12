// Doodad Uses (GLOSSARY.md): what a doodad has been used as, in a mapper's words, as records:
//
//   [{ "use": "square, heavy press head over a conveyor belt", "variation": 1, "scale": 3, "from": "crushing-press search, 2026-11-09" }]
//
// `use` is a short, general phrase that never names a map, a campaign or a story; `variation` (the
// Editor's variation number, 0 for 00) and `scale` (a uniform scale) say what made it work, when it
// did; `from` names the search or other source and its date (CONTRIBUTING.md).
//
// This package keeps them one file per doodad, apart from the descriptions, so contributions don't
// meet in one file:
//
//   data/doodad-uses/doodads/<doodad id>.json                  a game doodad's
//   <uses folder>/terrain-objects/<terrain object id>.json     a terrain object's, for a caller with terrain objects
//
// The two folders keep a doodad and a terrain object of one id apart. A notes file (doodad-notes.ts)
// holds the same records, and still reads a plain string as a record with only its `use`.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { parseJsonFile, TextSchema as Text } from "../util/parse-json.js";

/** A use record. Transform-free, so the MCP tools' schemas, which become JSON Schema, can hold it. */
export const DoodadUseSchema = z
  .object({
    use: Text,
    variation: z.number().int().min(0).optional(),
    scale: z.number().positive().optional(),
    from: Text.optional(),
  })
  .strict();

export type DoodadUse = z.infer<typeof DoodadUseSchema>;

/**
 * A use as a notes file may hold it: a record, or a plain phrase from
 * before uses were records, read as a record. For reading files only: its transform can't be put in
 * an MCP tool's schema (use DoodadUseSchema there).
 */
export const DoodadUseOrPhraseSchema = z.union([Text.transform((use): DoodadUse => ({ use })), DoodadUseSchema]);

const DoodadUsesFileSchema = z.array(DoodadUseSchema).min(1);

/** The catalogs Doodad Uses are kept for, and each one's folder in a uses folder. */
export const DOODAD_USES_FOLDERS = { doodad: "doodads", "terrain-object": "terrain-objects" } as const;
export type DoodadUsesCatalog = keyof typeof DOODAD_USES_FOLDERS;

/** A uses file's path relative to the uses folder, such as `doodads/DOM_Crate.json`. */
export const doodadUsesFile = (catalog: DoodadUsesCatalog, id: string): string => `${DOODAD_USES_FOLDERS[catalog]}/${id}.json`;

/** A uses file's records, refused naming `shown` and each issue's path when it isn't a list of them. */
export function parseDoodadUses(text: string, shown: string): DoodadUse[] {
  return parseJsonFile(text, shown, DoodadUsesFileSchema, "a valid Doodad Uses file");
}

const FIELDS = Object.keys(DoodadUseSchema.shape) as (keyof DoodadUse)[];

/** A use with its fields in the schema's order and nothing unset. */
export const orderedUse = (use: DoodadUse): DoodadUse => Object.fromEntries(FIELDS.filter((field) => use[field] !== undefined).map((field) => [field, use[field]])) as DoodadUse;

/** The records as a uses file holds them: each record's fields in the schema's order, two-space JSON. */
export const formatDoodadUses = (uses: readonly DoodadUse[]): string => `${JSON.stringify(uses.map(orderedUse), null, 2)}\n`;

export type DoodadUsesByCatalog = Record<DoodadUsesCatalog, Record<string, DoodadUse[]>>;

/** Every uses file in a uses folder, by catalog and id; none for a folder that isn't there. Throws naming a file that isn't valid. */
export function readDoodadUses(dir: string): DoodadUsesByCatalog {
  const read = (catalog: DoodadUsesCatalog): Record<string, DoodadUse[]> => {
    const folder = path.join(dir, DOODAD_USES_FOLDERS[catalog]);
    if (!existsSync(folder)) return {};
    const files = readdirSync(folder).filter((file) => file.endsWith(".json")).sort();
    return Object.fromEntries(files.map((file) => [file.slice(0, -".json".length), parseDoodadUses(readFileSync(path.join(folder, file), "utf8"), `${DOODAD_USES_FOLDERS[catalog]}/${file}`)]));
  };
  return { doodad: read("doodad"), "terrain-object": read("terrain-object") };
}

/** What makes two uses the same: their phrases, case and spacing aside. */
export const useKey = (use: string): string => use.trim().replace(/\s+/g, " ").toLowerCase();

/** The lists' uses in order, the first of any that are the same (useKey) kept. */
export function mergeUses(...lists: readonly (readonly DoodadUse[] | undefined)[]): DoodadUse[] {
  const seen = new Set<string>();
  const merged: DoodadUse[] = [];
  for (const use of lists.flatMap((list) => list ?? [])) {
    const key = useKey(use.use);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(use);
  }
  return merged;
}

/**
 * Whether the held uses already say all a use does: one of them is the same use (useKey) and has
 * its variation and scale, when it sets them. Its source doesn't count: the same use found again
 * adds nothing.
 */
export function heldIn(held: readonly DoodadUse[], use: DoodadUse): boolean {
  const known = held.find((other) => useKey(other.use) === useKey(use.use));
  return known !== undefined && (use.variation === undefined || use.variation === known.variation) && (use.scale === undefined || use.scale === known.scale);
}

/**
 * The held uses with the new ones added: one the held uses don't have after them; one they have
 * (useKey) filled in from it in place, keeping its phrase, and its source when it has one; one they
 * already say all of (heldIn) left out. `added` lists the new uses that changed something.
 */
export function addUses(held: readonly DoodadUse[], uses: readonly DoodadUse[]): { readonly uses: DoodadUse[]; readonly added: DoodadUse[] } {
  const next = [...held];
  const added: DoodadUse[] = [];
  for (const use of uses) {
    if (heldIn(next, use)) continue;
    added.push(use);
    const at = next.findIndex((other) => useKey(other.use) === useKey(use.use));
    if (at < 0) next.push(use);
    else next[at] = orderedUse({ ...next[at]!, ...use, use: next[at]!.use, ...(next[at]!.from !== undefined ? { from: next[at]!.from } : {}) });
  }
  return { uses: next, added };
}

/** A use on one line: its phrase, then its variation (two digits, as the Editor numbers them) and scale when set. */
export function formatUse({ use, variation, scale }: DoodadUse): string {
  const facts = [...(variation !== undefined ? [`variation ${String(variation).padStart(2, "0")}`] : []), ...(scale !== undefined ? [`scale ${scale}`] : [])];
  return facts.length ? `${use} (${facts.join(", ")})` : use;
}
