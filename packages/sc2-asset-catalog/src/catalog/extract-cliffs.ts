// Extracting the cliff sets' fields into the user's cache (docs/adr/0001), as `extract` does the
// doodads': each tileset's CliffSets from SC2GameData's TerrainData.xml (terrain-data.ts), and each
// cliff set's picture from the sc2-mapping-reference gallery's public/cliffs list. Written to the
// cache folder's extracted/:
//
//   cliff-extracted.json       each tileset's cliff sets in order, and each cliff set's tilesets and picture
//   cliff-extracted-info.json  when and from where they were extracted
//
// The descriptions are joined to them by id (cliff-catalog.ts).

import { readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { writeWhole } from "../util/write-whole.js";
import { CLIFF_DESCRIPTIONS_PATH, extractedDir as extractedDirOf } from "./catalog-dirs.js";
import { CLIFF_EXTRACTED_FILE, CLIFF_EXTRACTED_INFO_FILE, cliffSetNaming, type ExtractedCliffs, type ExtractedCliffSet, parseCliffDescriptions } from "./cliff-catalog.js";
import { type FetchOptions, GALLERY_TREE_URL, galleryFileNames } from "./extract-catalog.js";
import { SC2_GAME_DATA_URL } from "./extract-doodads.js";
import { fetchTerrainData, readTerrainTilesets, terrainTilesetIds, tilesetField } from "./terrain-data.js";

/** The gallery's folder of cliff pictures in sc2-mapping-reference. */
export const CLIFF_GALLERY_FOLDER = "public/cliffs/";

/**
 * The gallery's names for cliff sets it names neither by id nor by family and variant: a planet's
 * name where the id has an internal one, and a few spelt differently.
 */
export const CLIFF_GALLERY_ALIASES: Readonly<Record<string, string>> = {
  StarshipCliff0: "Daelaam_Ark_Manmade",
  HybridLabInnerCliff0: "Skygeirr_Lab_Natural",
  HybridLabInnerCliff1: "Skygeirr_Lab_Manmade",
  HybridLabOuterCliff0: "Skygeirr_Platform_Manmade_0",
  HybridLabOuterCliff1: "Skygeirr_Platform_Manmade_1",
  IceWorldCliff0: "Kaldir_Organic_0",
  IceWorldCliff1: "Kaldir_Organic_1",
  KorhalOutskirtsCliff0: "Korhal_Wastes_Organic",
  KorhalOutskirtsCliff1: "Korhal_Wastes_Manmade",
  KorhalPlatformCliff0: "Korhal_Platform_Manmade",
  MoebiusLabCliff0: "MoebiumLab0",
  UlnarInnerCliff1: "Ulna_Inner1",
  ZerusCliff0: "Zerus_Organic_0",
  ZerusCliff1: "Zerus_Organic_1",
};

/** A name or file name as the gallery is matched by: lower case, a leading "(tag)_" dropped, letters and digits only. */
const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/^\([a-z]+\)_/, "")
    .replace(/[^a-z0-9]/g, "");

/** Each tileset's cliff sets (resolved through its parents), for every tileset that has any, in id order. */
export function extractTilesetCliffSets(terrainData: readonly string[]): Record<string, string[]> {
  const tilesets = readTerrainTilesets(terrainData);
  const found: Record<string, string[]> = {};
  for (const id of terrainTilesetIds(tilesets)) {
    const cliffSets = tilesetField(tilesets, id, "CliffSets");
    if (cliffSets?.length) found[id] = cliffSets;
  }
  return found;
}

/**
 * Each cliff set the tilesets list, in id order, with the tilesets listing it and its gallery
 * picture. The picture is matched by the set's id, its id without "Cliffs", or its family and
 * variant ("Agria_Organic", "Slayn0", "Char2_Cliff0"); else, for an Ex1/Ex2 re-release, by its base
 * family's (`imageMatch: "family"`); else by the gallery's alias for it (`"alias"`). Where several
 * files match, the first by file name wins.
 */
export function extractCliffSetFields(tilesets: Readonly<Record<string, readonly string[]>>, gallery: readonly string[]): Record<string, ExtractedCliffSet> {
  const pictures = new Map<string, string>();
  for (const file of [...gallery].sort()) {
    const key = normalise(file.replace(/\.jpg$/, ""));
    if (!pictures.has(key)) pictures.set(key, file);
  }
  const picture = (names: readonly string[]): string | undefined => names.map((name) => pictures.get(normalise(name))).find((file) => file !== undefined);
  const listedBy = new Map<string, string[]>();
  for (const tileset of Object.keys(tilesets).sort((a, b) => a.localeCompare(b))) {
    for (const id of tilesets[tileset]!) if (!listedBy.get(id)?.includes(tileset)) listedBy.set(id, [...(listedBy.get(id) ?? []), tileset]);
  }
  const fields: Record<string, ExtractedCliffSet> = {};
  for (const id of [...listedBy.keys()].sort((a, b) => a.localeCompare(b))) {
    const { family, variant } = cliffSetNaming(id);
    const digit = variant === "organic" ? "0" : "1";
    const familyNames = (base: string) => [`${base}${variant}`, `${base}Cliff${digit}`, `${base}${digit}`];
    const own = picture([id, id.replace(/_?Cliffs$/i, ""), ...(family !== undefined ? familyNames(family) : [])]);
    const base = family !== undefined && /Ex\d$/.test(family) ? family.replace(/Ex\d$/, "") : undefined;
    const ofFamily = own === undefined && base !== undefined ? picture(familyNames(base)) : undefined;
    const alias = own === undefined && ofFamily === undefined && CLIFF_GALLERY_ALIASES[id] !== undefined ? picture([CLIFF_GALLERY_ALIASES[id]]) : undefined;
    const image = own ?? ofFamily ?? alias;
    fields[id] = {
      tilesets: listedBy.get(id)!,
      ...(image !== undefined ? { image } : {}),
      ...(image !== undefined && own === undefined ? { imageMatch: ofFamily !== undefined ? "family" : "alias" } : {}),
    } as ExtractedCliffSet;
  }
  return fields;
}

export type ExtractCliffsOptions = Pick<FetchOptions, "fetch" | "listGitTree" | "packages" | "log"> & {
  /** The folder to write to (the cache folder's extracted/ by default). */
  readonly extractedDir?: string;
  /** The descriptions to report unextracted ids of (this package's by default). */
  readonly descriptionsFile?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export type ExtractedCliffCounts = {
  readonly tilesets: number;
  readonly cliffSets: number;
  /** How many have a gallery picture. */
  readonly pictured: number;
  /** Described ids that weren't extracted, which the catalog leaves out. */
  readonly unextracted: readonly string[];
};

/**
 * Fetches every package's TerrainData.xml and the gallery's cliff pictures, extracts the cliff
 * sets' fields and writes them to `extractedDir`. Everything is fetched before anything is written,
 * so a failed fetch leaves an earlier extraction as it was.
 */
export async function extractCliffs(options: ExtractCliffsOptions = {}): Promise<ExtractedCliffCounts> {
  const log = options.log ?? (() => {});
  const dir = options.extractedDir ?? extractedDirOf();
  const descriptionsFile = options.descriptionsFile ?? CLIFF_DESCRIPTIONS_PATH;
  const descriptions = parseCliffDescriptions(readFileSync(descriptionsFile, "utf8"), descriptionsFile);
  const [terrainData, gallery] = await Promise.all([
    fetchTerrainData(options),
    galleryFileNames({ ...options, folder: CLIFF_GALLERY_FOLDER }).then((files) => (log(`Fetched the gallery's cliff list: ${files.length} pictures`), files)),
  ]);
  const tilesets = extractTilesetCliffSets(terrainData);
  const extracted: ExtractedCliffs = { tilesets, cliffSets: extractCliffSetFields(tilesets, gallery) };
  const unextracted = Object.keys(descriptions).filter((id) => !Object.hasOwn(extracted.cliffSets, id));
  const counts = {
    tilesets: Object.keys(tilesets).length,
    cliffSets: Object.keys(extracted.cliffSets).length,
    pictured: Object.values(extracted.cliffSets).filter((entry) => entry.image !== undefined).length,
  };

  await mkdir(dir, { recursive: true });
  // The info file goes first and comes back last, so an extraction cut short isn't taken for a whole one.
  await rm(path.join(dir, CLIFF_EXTRACTED_INFO_FILE), { force: true });
  await writeWhole(path.join(dir, CLIFF_EXTRACTED_FILE), `${JSON.stringify(extracted, null, 2)}\n`);
  await writeWhole(path.join(dir, CLIFF_EXTRACTED_INFO_FILE), `${JSON.stringify({ extracted: new Date().toISOString(), source: SC2_GAME_DATA_URL, gallery: GALLERY_TREE_URL, ...counts }, null, 2)}\n`);
  log(`${counts.cliffSets} cliff sets in ${counts.tilesets} tilesets, ${counts.pictured} with a gallery picture -> ${dir}`);
  if (unextracted.length) log(`${unextracted.length} described cliff sets weren't extracted, so they're left out of the catalog: ${unextracted.join(", ")}`);
  return { ...counts, unextracted };
}
