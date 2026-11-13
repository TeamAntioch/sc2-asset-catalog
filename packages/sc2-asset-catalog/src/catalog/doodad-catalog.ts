import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { parseJsonFile, TextSchema as Text } from "../util/parse-json.js";
import { DOODAD_DESCRIPTIONS_PATH } from "./catalog-dirs.js";
import { npxHint } from "../util/npx.js";

// The doodad catalog is two files joined by doodad id (docs/adr/0001):
// - data/doodad-descriptions.json, what we write and ship: each described doodad's description,
//   written from its gallery picture or, where the gallery has none, a render of its model. With
//   the Doodad Uses (data/doodad-uses/) it is the only doodad data this package ships.
// - doodad-extracted.json, what is extracted from the game and the gallery into the user's cache
//   (extract-catalog.ts): every doodad's kind, package, categories, tilesets and name, its gallery
//   `image`, `sharesPicture` and `rendered` (described from a render, as the gallery has no picture
//   of it). Renders and sheets made on this machine aren't listed in it: the search finds them in
//   the cache folder by id (render-thumbnails.ts).
export const DOODAD_DESCRIPTIONS_FILE = "doodad-descriptions.json";
export const DOODAD_EXTRACTED_FILE = "doodad-extracted.json";

export const DOODAD_KINDS = ["natural", "built", "creature"] as const;
export const DOODAD_SIZES = ["tiny", "small", "medium", "large", "huge"] as const;
export const DOODAD_ROLES = ["cliff", "structure", "prop", "clutter", "foliage", "decal", "effect"] as const;

/** A doodad's description from its picture. Its Doodad Uses (GLOSSARY.md) aren't part of it: they live apart, one file per doodad under data/doodad-uses/ (doodad-uses.ts). */
export type DoodadDescription = {
  readonly look: string;
  readonly kind: (typeof DOODAD_KINDS)[number];
  readonly size: (typeof DOODAD_SIZES)[number];
  readonly role: (typeof DOODAD_ROLES)[number];
  readonly story: readonly string[];
  readonly biome: readonly string[];
  readonly state?: string;
};

/** The fields a description may have: nothing else goes in the descriptions file. */
export const DOODAD_DESCRIPTION_FIELDS = ["look", "kind", "size", "role", "story", "biome", "state"] as const satisfies readonly (keyof DoodadDescription)[];

/** A description as the descriptions file holds it: the fields above and nothing else (CONTRIBUTING.md). */
export const DoodadDescriptionSchema = z
  .object({
    look: Text,
    kind: z.enum(DOODAD_KINDS),
    size: z.enum(DOODAD_SIZES),
    role: z.enum(DOODAD_ROLES),
    story: z.array(Text),
    biome: z.array(Text),
    state: Text.optional(),
  })
  .strict();

const DoodadDescriptionsSchema = z.record(z.string().min(1), DoodadDescriptionSchema);

/** A descriptions file's descriptions by doodad id, refused naming `shown` and each issue's id and field when it isn't valid. */
export function parseDoodadDescriptions(text: string, shown: string): Record<string, DoodadDescription> {
  return parseJsonFile(text, shown, DoodadDescriptionsSchema, "a valid descriptions file") as Record<string, DoodadDescription>;
}

/** A doodad's fields extracted from the game and its pictures (doodad-extracted.json, in the cache). */
export type ExtractedDoodad = {
  readonly kind?: string;
  readonly package?: string;
  readonly categories?: string;
  readonly tilesets?: readonly string[];
  readonly name?: string;
  readonly image?: string;
  readonly sharesPicture?: readonly string[];
  readonly rendered?: boolean;
};
/** A catalog entry: its extracted fields and, when it has one, its description. */
export type DoodadCatalogEntry = ExtractedDoodad & { readonly description?: DoodadDescription };

/** The fields that follow a description in a joined entry. */
export const FIELDS_AFTER_DESCRIPTION: readonly string[] = ["sharesPicture", "rendered"];

/** A catalog's descriptions and its extracted fields, each keyed by doodad id. */
export function splitDoodadCatalog(catalog: Readonly<Record<string, DoodadCatalogEntry>>): {
  descriptions: Record<string, DoodadDescription>;
  extracted: Record<string, ExtractedDoodad>;
} {
  const descriptions: Record<string, DoodadDescription> = {};
  const extracted: Record<string, ExtractedDoodad> = {};
  for (const [id, { description, ...fields }] of Object.entries(catalog)) {
    if (description) descriptions[id] = description;
    extracted[id] = fields;
  }
  return { descriptions, extracted };
}

/**
 * Joins the descriptions to the extracted fields by id: every extracted doodad, with its
 * description when it has one (before sharesPicture and rendered, where the catalog always had it).
 * A described id that wasn't extracted is left out and named in `unextracted`.
 */
export function joinDoodadCatalog(
  descriptions: Readonly<Record<string, DoodadDescription>>,
  extracted: Readonly<Record<string, ExtractedDoodad>>,
): { catalog: Record<string, DoodadCatalogEntry>; unextracted: string[] } {
  const catalog: Record<string, DoodadCatalogEntry> = {};
  for (const [id, fields] of Object.entries(extracted)) {
    const description = Object.hasOwn(descriptions, id) ? descriptions[id] : undefined;
    if (!description) {
      catalog[id] = fields;
      continue;
    }
    const entries: [string, unknown][] = Object.entries(fields);
    const at = entries.findIndex(([key]) => FIELDS_AFTER_DESCRIPTION.includes(key));
    entries.splice(at === -1 ? entries.length : at, 0, ["description", description]);
    catalog[id] = Object.fromEntries(entries) as DoodadCatalogEntry;
  }
  const unextracted = Object.keys(descriptions).filter((id) => !Object.hasOwn(extracted, id));
  return { catalog, unextracted };
}

export type DoodadCatalogFiles = {
  readonly descriptions: Record<string, DoodadDescription>;
  readonly extracted: Record<string, ExtractedDoodad>;
  /** The two joined (joinDoodadCatalog). */
  readonly catalog: Record<string, DoodadCatalogEntry>;
  /** Described ids the extracted file doesn't list. */
  readonly unextracted: string[];
};

/**
 * Reads the extracted fields from `extractedDir` (extract-catalog.ts writes them there) and the
 * descriptions (this package's by default), and joins them. Throws, saying to extract, when the
 * extracted fields aren't there.
 */
export function readDoodadCatalog(extractedDir: string, descriptionsFile: string = DOODAD_DESCRIPTIONS_PATH): DoodadCatalogFiles {
  const extractedFile = path.join(extractedDir, DOODAD_EXTRACTED_FILE);
  if (!existsSync(extractedFile)) throw new Error(`No extracted doodads in ${extractedDir}: run the extract command first (${npxHint("@team-antioch/sc2-asset-catalog extract")})`);
  const descriptions = parseDoodadDescriptions(readFileSync(descriptionsFile, "utf8"), descriptionsFile);
  const extracted = JSON.parse(readFileSync(extractedFile, "utf8")) as Record<string, ExtractedDoodad>;
  return { descriptions, extracted, ...joinDoodadCatalog(descriptions, extracted) };
}
