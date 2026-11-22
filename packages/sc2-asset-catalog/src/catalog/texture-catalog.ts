import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { npxHint } from "../util/npx.js";
import { parseJsonFile, TextSchema as Text } from "../util/parse-json.js";
import { TEXTURE_DESCRIPTIONS_PATH } from "./catalog-dirs.js";

// The terrain texture catalog is two files joined by CTerrainTex id (docs/adr/0001, as the doodads'):
// - data/texture-descriptions.json, what we write and ship: each texture's look, kind, tone and the
//   roles it suits, written from its gallery picture (or, marked `seen: false`, from its name alone
//   where the gallery has no picture).
// - texture-extracted.json, what is extracted from the game and the gallery into the user's cache
//   (extract-textures.ts): each tileset's blend textures in layer order, and each texture's
//   tilesets, texture file, English name and gallery picture.

export const TEXTURE_DESCRIPTIONS_FILE = "texture-descriptions.json";
export const TEXTURE_EXTRACTED_FILE = "texture-extracted.json";
/** The file saying when and from where the textures were extracted, written last. */
export const TEXTURE_EXTRACTED_INFO_FILE = "texture-extracted-info.json";

export const TEXTURE_KINDS = ["built", "natural"] as const;
export const TEXTURE_TONES = ["light", "mid", "dark"] as const;
/** The roles a texture can play in a palette: the main ground, a path, variety patches, high or low ground, an accent. */
export const TEXTURE_SUITS = ["base", "path", "variety", "high", "low", "accent"] as const;
export type TextureKind = (typeof TEXTURE_KINDS)[number];
export type TextureTone = (typeof TEXTURE_TONES)[number];
export type TextureSuit = (typeof TEXTURE_SUITS)[number];

/** A texture's description from its picture. */
export type TextureDescription = {
  /** What it looks like, in a short phrase. */
  readonly look: string;
  readonly kind: TextureKind;
  readonly tone: TextureTone;
  /** The roles it suits in a palette, at least one. */
  readonly suits: readonly TextureSuit[];
  /** false when it was described from its name alone, the gallery having no picture of it. */
  readonly seen?: false;
  /** true when the gallery picture it was described from may not be this texture's. */
  readonly pictureUncertain?: true;
};

/** A description as the descriptions file holds it: these fields and nothing else (CONTRIBUTING.md). */
export const TextureDescriptionSchema = z
  .object({
    look: Text,
    kind: z.enum(TEXTURE_KINDS),
    tone: z.enum(TEXTURE_TONES),
    suits: z.array(z.enum(TEXTURE_SUITS)).min(1),
    seen: z.literal(false).optional(),
    pictureUncertain: z.literal(true).optional(),
  })
  .strict();

const TextureDescriptionsSchema = z.record(z.string().min(1), TextureDescriptionSchema);

/** A descriptions file's descriptions by texture id, refused naming `shown` and each issue's id and field when it isn't valid. */
export function parseTextureDescriptions(text: string, shown: string): Record<string, TextureDescription> {
  return parseJsonFile(text, shown, TextureDescriptionsSchema, "a valid texture descriptions file") as Record<string, TextureDescription>;
}

/** A texture's fields extracted from the game and the gallery. */
export type ExtractedTexture = {
  /** The tilesets whose blend textures list it, in id order. */
  readonly tilesets: readonly string[];
  /** Its texture file's base name, without folder or .dds. */
  readonly file?: string;
  /** Its English name in the Editor. */
  readonly name?: string;
  /** Its sc2-mapping-reference gallery picture's file name (public/tilesets). */
  readonly image?: string;
  /** `fuzzy` when the picture was found by the words of its name, not by its file, name or id. */
  readonly imageMatch?: "fuzzy";
};

/** texture-extracted.json: each tileset's blend textures in layer order, and each texture's fields. */
export type ExtractedTextures = {
  readonly tilesets: Readonly<Record<string, readonly string[]>>;
  readonly textures: Readonly<Record<string, ExtractedTexture>>;
};

/** A catalog entry: its id, its extracted fields and, when it has one, its description. */
export type TextureEntry = { readonly id: string } & ExtractedTexture & { readonly description?: TextureDescription };

export type TextureCatalog = {
  /** Every extracted texture, in id order. */
  readonly entries: readonly TextureEntry[];
  /** Each tileset's blend textures in layer order. */
  readonly tilesets: Readonly<Record<string, readonly string[]>>;
  /** Described ids the extraction doesn't list, which the catalog leaves out. */
  readonly unextracted: readonly string[];
};

/** Joins the descriptions to the extracted fields by id: every extracted texture, in id order, with its description when it has one. */
export function joinTextureCatalog(descriptions: Readonly<Record<string, TextureDescription>>, extracted: ExtractedTextures): TextureCatalog {
  const entries = Object.keys(extracted.textures)
    .sort((a, b) => a.localeCompare(b))
    .map((id): TextureEntry => {
      const description = Object.hasOwn(descriptions, id) ? descriptions[id] : undefined;
      return { id, ...extracted.textures[id]!, ...(description ? { description } : {}) };
    });
  const unextracted = Object.keys(descriptions).filter((id) => !Object.hasOwn(extracted.textures, id));
  return { entries, tilesets: extracted.tilesets, unextracted };
}

/** Whether `extractedDir` holds a whole texture extraction. */
export const hasExtractedTextures = (extractedDir: string): boolean => [TEXTURE_EXTRACTED_FILE, TEXTURE_EXTRACTED_INFO_FILE].every((file) => existsSync(path.join(extractedDir, file)));

/**
 * Reads the extracted fields from `extractedDir` (extract-textures.ts writes them there) and the
 * descriptions (this package's by default), and joins them. Throws, saying to extract, when the
 * extracted fields aren't there.
 */
export function readTextureCatalog({ extractedDir, descriptionsFile = TEXTURE_DESCRIPTIONS_PATH }: { readonly extractedDir: string; readonly descriptionsFile?: string }): TextureCatalog {
  const extractedFile = path.join(extractedDir, TEXTURE_EXTRACTED_FILE);
  if (!existsSync(extractedFile)) throw new Error(`No extracted textures in ${extractedDir}: run the extract-textures command first (${npxHint("@team-antioch/sc2-asset-catalog extract-textures")})`);
  const descriptions = parseTextureDescriptions(readFileSync(descriptionsFile, "utf8"), descriptionsFile);
  return joinTextureCatalog(descriptions, JSON.parse(readFileSync(extractedFile, "utf8")) as ExtractedTextures);
}

/** One texture's entry, or undefined when the catalog has no such id. */
export const getTexture = (catalog: TextureCatalog, id: string): TextureEntry | undefined => catalog.entries.find((entry) => entry.id === id);

/** The entries for some ids, in their order, refusing an id the catalog doesn't have and naming up to five near ones. */
export function lookUpTextures(catalog: TextureCatalog, ids: readonly string[]): TextureEntry[] {
  const byId = new Map(catalog.entries.map((entry) => [entry.id, entry]));
  return ids.map((id) => {
    const entry = byId.get(id);
    if (entry) return entry;
    const lower = id.toLowerCase();
    const near = [...byId.keys()].filter((other) => other.toLowerCase().includes(lower) || lower.includes(other.toLowerCase())).slice(0, 5);
    throw new Error(`${id} isn't one of the game's terrain textures${near.length ? `: did you mean ${near.join(", ")}?` : ""}`);
  });
}

/** A tileset's blend textures in layer order; empty for a tileset the game doesn't define. */
export const tilesetTextures = (catalog: TextureCatalog, tilesetId: string): readonly string[] => (Object.hasOwn(catalog.tilesets, tilesetId) ? catalog.tilesets[tilesetId]! : []);

export type TextureSearch = {
  /** Words any of which the look must hold, as whole words or their start ("grat" finds grating and grate), in any case. */
  readonly words?: readonly string[] | undefined;
  /** Words none of which the look, the id or the tilesets may hold. */
  readonly without?: readonly string[] | undefined;
  readonly kind?: TextureKind | undefined;
  readonly tones?: readonly TextureTone[] | undefined;
  /** Roles at least one of which the texture suits. */
  readonly suits?: readonly TextureSuit[] | undefined;
  /** Tilesets at least one of which lists the texture. */
  readonly tilesets?: readonly string[] | undefined;
  /** Only textures the gallery has a picture of. */
  readonly withPicture?: boolean | undefined;
};

/** A word as a search matches it: at the start of a word, in any case. */
const wordPattern = (word: string): RegExp => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");

/**
 * The textures matching a search, those whose look holds the most of its words first, then by id.
 * Kind, tones and suits match only described textures.
 */
export function searchTextures(catalog: TextureCatalog, search: TextureSearch = {}): TextureEntry[] {
  const words = (search.words ?? []).map(wordPattern);
  const without = (search.without ?? []).map(wordPattern);
  const scored: { entry: TextureEntry; score: number }[] = [];
  for (const entry of catalog.entries) {
    const description = entry.description;
    if (search.withPicture && !entry.image) continue;
    if (search.kind && description?.kind !== search.kind) continue;
    if (search.tones?.length && (!description || !search.tones.includes(description.tone))) continue;
    if (search.suits?.length && !description?.suits.some((suit) => search.suits!.includes(suit))) continue;
    if (search.tilesets?.length && !entry.tilesets.some((tileset) => search.tilesets!.includes(tileset))) continue;
    const look = description?.look ?? "";
    const named = `${look} ${entry.id} ${entry.tilesets.join(" ")}`;
    if (without.some((word) => word.test(named))) continue;
    const score = words.filter((word) => word.test(look)).length;
    if (words.length > 0 && score === 0) continue;
    scored.push({ entry, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id)).map(({ entry }) => entry);
}
