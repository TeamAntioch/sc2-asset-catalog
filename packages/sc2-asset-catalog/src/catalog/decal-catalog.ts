// What every variation of every decal doodad shows, so a map's decals can be picked on purpose: a
// painted number, letter or word promises it labels something (a bay, a lane), so scattered at
// random it reads as noise. Two files, joined by doodad id and variation number (docs/adr/0006):
// - data/decal-descriptions.json, what we write and ship: each variation's look, what it shows, its
//   glyphs and the text it reads, its shape, whether it tiles and its use, written by eye from its
//   picture.
// - decal-extracted.json, what `extract-decals` reads from the decals' model files into the user's
//   cache (extract-decals.ts): each variation's texture, its box in cells and whether it is drawn as
//   geometry. Optional: without it, every variation is still described and searched.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { parseJsonFile, TextSchema as Text } from "../util/parse-json.js";
import { catalogCacheDir, DECAL_DESCRIPTIONS_PATH, extractedDir as extractedDirOf } from "./catalog-dirs.js";

export const DECAL_DESCRIPTIONS_FILE = "decal-descriptions.json";
export const DECAL_EXTRACTED_FILE = "decal-extracted.json";

/** What a variation carries that reads as writing: Latin numbers, letters or words, or alien script (Protoss and Xel'Naga inscriptions, which read as ornament). */
export const DECAL_GLYPHS = ["none", "number", "letter", "words", "script"] as const;
/** Its rough shape: a run of paint, a turn or bend in one, or a self-contained patch. */
export const DECAL_SHAPES = ["line", "corner", "patch"] as const;
/**
 * What it is for: a plain floor `marking` or Protoss and Xel'Naga `ornament` (both fine to scatter),
 * a `label` naming a place or a bay's job, a `sign` warning of a hazard, or an `emblem` (a faction's).
 */
export const DECAL_USES = ["marking", "ornament", "label", "sign", "emblem"] as const;
/** The words `shows` draws on. */
export const DECAL_SHOWS = ["stripe", "curve", "corner", "hazard-stripes", "arrow", "frame", "hazard-sign", "symbol", "emblem", "text", "number", "ornament", "glow-line", "light-strip"] as const;

export type DecalGlyphs = (typeof DECAL_GLYPHS)[number];
export type DecalShape = (typeof DECAL_SHAPES)[number];
export type DecalUse = (typeof DECAL_USES)[number];
export type DecalShows = (typeof DECAL_SHOWS)[number];

/** A variation's description, from its picture. */
export type DecalDescription = {
  readonly look: string;
  readonly shows: readonly DecalShows[];
  readonly glyphs: DecalGlyphs;
  /** The number, letter or words it carries, as painted. */
  readonly text?: string;
  readonly shape: DecalShape;
  /** Whether copies laid end to end make a longer run (a stripe, a corner of one). */
  readonly tiles: boolean;
  readonly use: DecalUse;
};

/** The fields a description may have, in the order the file keeps them: nothing else goes in the descriptions file. */
export const DECAL_DESCRIPTION_FIELDS = ["look", "shows", "glyphs", "text", "shape", "tiles", "use"] as const satisfies readonly (keyof DecalDescription)[];

/** A variation's description as the descriptions file holds it. Whatever carries a number, letter or words says what it reads. */
export const DecalDescriptionSchema = z
  .object({
    look: Text,
    shows: z.array(z.enum(DECAL_SHOWS)),
    glyphs: z.enum(DECAL_GLYPHS),
    text: Text.optional(),
    shape: z.enum(DECAL_SHAPES),
    tiles: z.boolean(),
    use: z.enum(DECAL_USES),
  })
  .strict()
  .refine((variation) => variation.glyphs === "none" || variation.glyphs === "script" || variation.text !== undefined, { message: "a number, letter or words needs the text it reads", path: ["text"] });

/** The descriptions file: each decal doodad's variations, in variation order. */
const DecalDescriptionsSchema = z.record(z.string().min(1), z.array(DecalDescriptionSchema).min(1));

/** A descriptions file's variations by doodad id, refused naming `shown` and each issue's id, variation and field when it isn't valid. */
export function parseDecalDescriptions(text: string, shown: string): Record<string, readonly DecalDescription[]> {
  return parseJsonFile(text, shown, DecalDescriptionsSchema, "a valid decal descriptions file") as Record<string, readonly DecalDescription[]>;
}

/** A variation's fields read from its model file (decal-extracted.json, in the cache). */
export type ExtractedDecalVariation = {
  /** The texture its projector paints (enUS for a localized text decal). */
  readonly texture?: string;
  /** Its box in cells, x by y, at scale 1; absent when the model gives none. */
  readonly size?: readonly [number, number];
  /** "geometry" for a decal drawn as a model, not projected (a cliff decal's panel). */
  readonly drawn?: "geometry";
};

/** A variation: its extracted fields, when there are any, then its description. */
export type DecalVariation = ExtractedDecalVariation & DecalDescription;

/** Each described decal doodad's variations, by variation number. */
export type DecalCatalog = Readonly<Record<string, readonly DecalVariation[]>>;

/** Each described variation with its extracted fields (any it has) before its description. */
export function joinDecalCatalog(
  descriptions: Readonly<Record<string, readonly DecalDescription[]>>,
  extracted: Readonly<Record<string, readonly ExtractedDecalVariation[]>> = {},
): Record<string, DecalVariation[]> {
  return Object.fromEntries(
    Object.entries(descriptions).map(([id, variations]) => [id, variations.map((description, variation) => ({ ...(Object.hasOwn(extracted, id) ? extracted[id]![variation] : undefined), ...description }))]),
  );
}

export type ReadDecalCatalogOptions = {
  /** The descriptions (this package's by default). */
  readonly descriptionsFile?: string;
  /** Where `extract-decals` wrote decal-extracted.json (the cache folder's extracted/ by default). Without the file there, the variations have no extracted fields. */
  readonly extractedDir?: string;
};

/** The decal catalog: the descriptions joined to the extracted fields when `extract-decals` has written them. */
export function readDecalCatalog({ descriptionsFile = DECAL_DESCRIPTIONS_PATH, extractedDir = extractedDirOf() }: ReadDecalCatalogOptions = {}): DecalCatalog {
  const descriptions = parseDecalDescriptions(readFileSync(descriptionsFile, "utf8"), descriptionsFile);
  const extractedFile = path.join(extractedDir, DECAL_EXTRACTED_FILE);
  const extracted = existsSync(extractedFile) ? (JSON.parse(readFileSync(extractedFile, "utf8")) as Record<string, ExtractedDecalVariation[]>) : {};
  return joinDecalCatalog(descriptions, extracted);
}

/** True when a variation can go anywhere: no number, letter or words, and plain marking or ornament. */
export const isScatterable = (variation: DecalDescription): boolean =>
  (variation.glyphs === "none" || variation.glyphs === "script") && (variation.use === "marking" || variation.use === "ornament");

export type DecalQuery = {
  /** Decal doodads, any of which it must belong to. */
  readonly doodads?: readonly string[] | undefined;
  /** Words, any of which its look, text or shows must contain (case-insensitive). */
  readonly words?: readonly string[] | undefined;
  readonly shows?: readonly DecalShows[] | undefined;
  /** Glyphs, any of which it must carry; `["none"]` for plain markings. */
  readonly glyphs?: readonly DecalGlyphs[] | undefined;
  readonly shape?: readonly DecalShape[] | undefined;
  readonly tiles?: boolean | undefined;
  readonly use?: readonly DecalUse[] | undefined;
  /** Only the variations that can go anywhere (isScatterable), or only those that can't. */
  readonly scatterable?: boolean | undefined;
};

export type DecalMatch = DecalVariation & { readonly doodad: string; readonly variation: number };

/** The decal variations matching every filter given, by doodad then variation, in the catalog's order. */
export function findDecalVariations(query: DecalQuery = {}, catalog: DecalCatalog = readDecalCatalog()): DecalMatch[] {
  const words = query.words?.map((word) => word.toLowerCase());
  const anyOf = <T>(wanted: readonly T[] | undefined, value: T): boolean => wanted === undefined || wanted.length === 0 || wanted.includes(value);
  const matches: DecalMatch[] = [];
  for (const [doodad, variations] of Object.entries(catalog)) {
    if (query.doodads?.length && !query.doodads.includes(doodad)) continue;
    variations.forEach((entry, variation) => {
      if (!anyOf(query.glyphs, entry.glyphs) || !anyOf(query.shape, entry.shape) || !anyOf(query.use, entry.use)) return;
      if (query.shows?.length && !query.shows.some((shown) => entry.shows.includes(shown))) return;
      if (query.tiles !== undefined && entry.tiles !== query.tiles) return;
      if (query.scatterable !== undefined && isScatterable(entry) !== query.scatterable) return;
      if (words?.length) {
        const text = `${entry.look} ${entry.text ?? ""} ${entry.shows.join(" ")}`.toLowerCase();
        if (!words.some((word) => text.includes(word))) return;
      }
      matches.push({ doodad, variation, ...entry });
    });
  }
  return matches;
}

/** One line per match: `<doodad> <variation>: <look> (<shape>, tiles, <use>, reads "<text>", <x>×<y> cells)`, then how many more past `limit`. */
export function formatDecalVariations(matches: readonly DecalMatch[], limit = matches.length): string {
  if (matches.length === 0) return "No decal variation matches.";
  const lines = matches.slice(0, limit).map((match) => {
    const facts = [match.shape, ...(match.tiles ? ["tiles"] : []), match.use, ...(match.text ? [`reads "${match.text}"`] : []), ...(match.size ? [`${match.size[0]}×${match.size[1]} cells`] : [])];
    return `${match.doodad} ${match.variation}: ${match.look} (${facts.join(", ")})`;
  });
  return [...lines, ...(matches.length > limit ? [`…and ${matches.length - limit} more`] : [])].join("\n");
}

/** Where `extract-decals` puts the decals' pictures and sheets, relative to the cache folder. */
export const DECAL_FOLDERS = { pictures: "thumbnails/decals", sheets: "catalog-sheets/decals" } as const;

/** One variation's picture's file name: `<doodad>_<variation>.png`. */
export const decalPictureFileName = (id: string, variation: number): string => `${id}_${String(variation).padStart(2, "0")}.png`;

/** A decal doodad's sheet of all its variations, numbered, when `extract-decals` has built it in `cacheDir`. */
export function decalSheetPath(id: string, cacheDir: string = catalogCacheDir()): string | undefined {
  const sheet = path.join(cacheDir, DECAL_FOLDERS.sheets, `${id}.jpg`);
  return existsSync(sheet) ? sheet : undefined;
}
