import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { npxHint } from "../util/npx.js";
import { parseJsonFile, TextSchema as Text } from "../util/parse-json.js";
import { CLIFF_DESCRIPTIONS_PATH } from "./catalog-dirs.js";

// The cliff catalog is two files joined by cliff set id (docs/adr/0001, as the doodads'):
// - data/cliff-descriptions.json, what we write and ship: each pictured cliff set's look, kind,
//   tone and the ground it pairs with, written from its gallery picture.
// - cliff-extracted.json, what is extracted from the game and the gallery into the user's cache
//   (extract-cliffs.ts): each tileset's cliff sets in TerrainData order, and each cliff set's
//   tilesets and gallery picture.
// A cliff set's family and variant aren't in either: they're read from its id (cliffSetNaming).

export const CLIFF_DESCRIPTIONS_FILE = "cliff-descriptions.json";
export const CLIFF_EXTRACTED_FILE = "cliff-extracted.json";
/** The file saying when and from where the cliff sets were extracted, written last. */
export const CLIFF_EXTRACTED_INFO_FILE = "cliff-extracted-info.json";

export const CLIFF_KINDS = ["natural", "built"] as const;
export const CLIFF_TONES = ["light", "mid", "dark"] as const;
export type CliffKind = (typeof CLIFF_KINDS)[number];
export type CliffTone = (typeof CLIFF_TONES)[number];

/** A cliff set's description from its picture. */
export type CliffDescription = {
  /** What its walls look like, in a short phrase. */
  readonly look: string;
  /** Whether its walls are natural rock or built, as the picture shows (the id's variant can say otherwise). */
  readonly kind: CliffKind;
  readonly tone: CliffTone;
  /** The ground it sits well beside, a comma-separated phrase. */
  readonly pairsWith: string;
};

/** A description as the descriptions file holds it: these fields and nothing else (CONTRIBUTING.md). */
export const CliffDescriptionSchema = z.object({ look: Text, kind: z.enum(CLIFF_KINDS), tone: z.enum(CLIFF_TONES), pairsWith: Text }).strict();

const CliffDescriptionsSchema = z.record(z.string().min(1), CliffDescriptionSchema);

/** A descriptions file's descriptions by cliff set id, refused naming `shown` and each issue's id and field when it isn't valid. */
export function parseCliffDescriptions(text: string, shown: string): Record<string, CliffDescription> {
  return parseJsonFile(text, shown, CliffDescriptionsSchema, "a valid cliff descriptions file") as Record<string, CliffDescription>;
}

/** A cliff set's fields extracted from the game and the gallery. */
export type ExtractedCliffSet = {
  /** The tilesets that list it, in id order. */
  readonly tilesets: readonly string[];
  /** Its sc2-mapping-reference gallery picture's file name (public/cliffs). */
  readonly image?: string;
  /** How the picture was found when not by the set's own name: `family`, its base family's (an Ex1/Ex2 re-release), or `alias`, the gallery's other name for it. */
  readonly imageMatch?: "family" | "alias";
};

/** cliff-extracted.json: each tileset's cliff sets in TerrainData order (the first its natural cliff), and each cliff set's fields. */
export type ExtractedCliffs = {
  readonly tilesets: Readonly<Record<string, readonly string[]>>;
  readonly cliffSets: Readonly<Record<string, ExtractedCliffSet>>;
};

/** What a cliff set's id says: `…Cliff0` names an organic set and `…Cliff1` a manmade one, of the family before it; other ids may say only manmade or organic. */
export type CliffSetNaming = { readonly family?: string; readonly variant?: "organic" | "manmade" };

/** A catalog entry: its id, what the id says, its extracted fields and, when it has one, its description. */
export type CliffSetEntry = { readonly id: string } & CliffSetNaming & ExtractedCliffSet & { readonly description?: CliffDescription };

export type CliffCatalog = {
  /** Every extracted cliff set, in id order. */
  readonly entries: readonly CliffSetEntry[];
  /** Each tileset's cliff sets in TerrainData order. */
  readonly tilesets: Readonly<Record<string, readonly string[]>>;
  /** Described ids the extraction doesn't list, which the catalog leaves out. */
  readonly unextracted: readonly string[];
};

/** A cliff set's family and variant, from its id alone. */
export function cliffSetNaming(id: string): CliffSetNaming {
  const numbered = /^(.*?)Cliff([01])$/.exec(id);
  if (numbered) return { family: numbered[1]!, variant: numbered[2] === "0" ? "organic" : "manmade" };
  if (/manmade/i.test(id)) return { variant: "manmade" };
  if (/organic/i.test(id)) return { variant: "organic" };
  return {};
}

/** Joins the descriptions to the extracted fields by id: every extracted cliff set, in id order, with its description when it has one. */
export function joinCliffCatalog(descriptions: Readonly<Record<string, CliffDescription>>, extracted: ExtractedCliffs): CliffCatalog {
  const entries = Object.keys(extracted.cliffSets)
    .sort((a, b) => a.localeCompare(b))
    .map((id): CliffSetEntry => {
      const description = Object.hasOwn(descriptions, id) ? descriptions[id] : undefined;
      return { id, ...cliffSetNaming(id), ...extracted.cliffSets[id]!, ...(description ? { description } : {}) };
    });
  const unextracted = Object.keys(descriptions).filter((id) => !Object.hasOwn(extracted.cliffSets, id));
  return { entries, tilesets: extracted.tilesets, unextracted };
}

/** Whether `extractedDir` holds a whole cliff extraction. */
export const hasExtractedCliffs = (extractedDir: string): boolean => [CLIFF_EXTRACTED_FILE, CLIFF_EXTRACTED_INFO_FILE].every((file) => existsSync(path.join(extractedDir, file)));

/**
 * Reads the extracted fields from `extractedDir` (extract-cliffs.ts writes them there) and the
 * descriptions (this package's by default), and joins them. Throws, saying to extract, when the
 * extracted fields aren't there.
 */
export function readCliffCatalog({ extractedDir, descriptionsFile = CLIFF_DESCRIPTIONS_PATH }: { readonly extractedDir: string; readonly descriptionsFile?: string }): CliffCatalog {
  const extractedFile = path.join(extractedDir, CLIFF_EXTRACTED_FILE);
  if (!existsSync(extractedFile)) throw new Error(`No extracted cliff sets in ${extractedDir}: run the extract-cliffs command first (${npxHint("@team-antioch/sc2-asset-catalog extract-cliffs")})`);
  const descriptions = parseCliffDescriptions(readFileSync(descriptionsFile, "utf8"), descriptionsFile);
  return joinCliffCatalog(descriptions, JSON.parse(readFileSync(extractedFile, "utf8")) as ExtractedCliffs);
}

/** One cliff set's entry, or undefined when the catalog has no such id. */
export const getCliffSet = (catalog: CliffCatalog, id: string): CliffSetEntry | undefined => catalog.entries.find((entry) => entry.id === id);

/** A tileset's cliff sets in TerrainData order (the first its natural cliff); empty for a tileset the game doesn't define. */
export const tilesetCliffSets = (catalog: CliffCatalog, tilesetId: string): readonly string[] => (Object.hasOwn(catalog.tilesets, tilesetId) ? catalog.tilesets[tilesetId]! : []);

/** Whether a cliff set looks natural or built: its description's kind, else built for a manmade variant, else natural. */
export function cliffSetKind(entry: Pick<CliffSetEntry, "description" | "variant"> | undefined): CliffKind {
  return entry?.description?.kind ?? (entry?.variant === "manmade" ? "built" : "natural");
}

export type CliffSearch = {
  /** Words every one of which must appear in the entry (its id, family, variant, tilesets, picture or description), in any case. */
  readonly words?: readonly string[];
  readonly kind?: CliffKind;
  readonly tone?: CliffTone;
  /** Only the cliff sets this tileset lists. */
  readonly tileset?: string;
};

/** An entry's searchable text, lower case. */
const searchText = (entry: CliffSetEntry): string =>
  [entry.id, entry.family, entry.variant, ...entry.tilesets, entry.image, ...Object.values(entry.description ?? {})].filter(Boolean).join(" ").toLowerCase();

/** The entries matching every word and filter given, in id order. `kind` is cliffSetKind's; `tone` matches only described sets. */
export function searchCliffSets(catalog: CliffCatalog, { words = [], kind, tone, tileset }: CliffSearch = {}): CliffSetEntry[] {
  const wanted = words.map((word) => word.trim().toLowerCase()).filter(Boolean);
  return catalog.entries.filter(
    (entry) =>
      (kind === undefined || cliffSetKind(entry) === kind) &&
      (tone === undefined || entry.description?.tone === tone) &&
      (tileset === undefined || entry.tilesets.includes(tileset)) &&
      (wanted.length === 0 || ((text) => wanted.every((word) => text.includes(word)))(searchText(entry))),
  );
}

/** The sc2-mapping-reference gallery's cliff pictures. */
export const CLIFF_GALLERY_URL = "https://raw.githubusercontent.com/TeamAntioch/sc2-mapping-reference/main/public/cliffs";

/** Where a cliff set's gallery picture is: `image` its file name, `thumbnail` its small copy (`_tn`), `base` the gallery's address. */
export function cliffPictureUrl(image: string, { thumbnail = false, base = CLIFF_GALLERY_URL }: { readonly thumbnail?: boolean; readonly base?: string } = {}): string {
  return `${base.replace(/\/$/, "")}/${encodeURIComponent(thumbnail ? image.replace(/\.jpg$/, "_tn.jpg") : image)}`;
}
