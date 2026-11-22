// Extracting the terrain textures' fields into the user's cache (docs/adr/0001), as for the
// doodads': each tileset's blend textures from SC2GameData's TerrainData.xml (terrain-data.ts), each
// texture's file from TerrainTexData.xml and English name from GameStrings.txt, and its picture from
// the sc2-mapping-reference gallery's public/tilesets list. Written to the cache folder's extracted/:
//
//   texture-extracted.json       each tileset's blend textures in layer order, and each texture's fields
//   texture-extracted-info.json  when and from where they were extracted
//
// Only the textures some tileset lists are in it. The descriptions are joined to them by id
// (texture-catalog.ts).

import { readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { writeWhole } from "../util/write-whole.js";
import { extractedDir as extractedDirOf, TEXTURE_DESCRIPTIONS_PATH } from "./catalog-dirs.js";
import { type FetchOptions, GALLERY_TREE_URL, galleryFileNames } from "./extract-catalog.js";
import { type Entry, readEntries, resolve, SC2_GAME_DATA_PACKAGES, SC2_GAME_DATA_URL } from "./extract-doodads.js";
import { fetchTerrainData, readTerrainTilesets, terrainTilesetIds, tilesetField } from "./terrain-data.js";
import { type ExtractedTexture, type ExtractedTextures, parseTextureDescriptions, TEXTURE_EXTRACTED_FILE, TEXTURE_EXTRACTED_INFO_FILE } from "./texture-catalog.js";

/** The gallery's folder of texture pictures in sc2-mapping-reference. */
export const TEXTURE_GALLERY_FOLDER = "public/tilesets/";

/** Each tileset's blend textures in layer order (resolved through its parents), for every tileset that has any, in id order; an empty slot is "". */
export function extractTilesetTextures(terrainData: readonly string[]): Record<string, string[]> {
  const tilesets = readTerrainTilesets(terrainData);
  const found: Record<string, string[]> = {};
  for (const id of terrainTilesetIds(tilesets)) {
    const textures = tilesetField(tilesets, id, "BlendTextures");
    if (textures?.length) found[id] = textures;
  }
  return found;
}

/** One package's texture data and English game strings, as extractTextureFields reads them; a package may lack either. */
export type TexturePackage = { readonly name: string; readonly terrainTexData?: string; readonly gameStrings?: string };

/** A name or file name as the gallery is matched by: lower case, a leading "(tag)_" dropped, letters and digits only. */
const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/^\([a-z]+\)_/, "")
    .replace(/[^a-z0-9]/g, "");

/** A name's words, as the fuzzy match compares them: lower case, a leading "(tag)_" dropped, a plural "s" dropped. */
const nameWords = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/^\([a-z]+\)_/, "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((word) => word.replace(/s$/, "")),
  );

/**
 * The gallery picture whose words are closest to a name's (the shared words over all of either's),
 * when it shares at least 0.6 of them and no other file is as close. The gallery's names have typos
 * and small wording changes ("Panel" for "Panels"), which this finds.
 */
function fuzzyPicture(name: string, gallery: readonly string[]): string | undefined {
  const target = nameWords(name);
  const scored = gallery
    .map((file) => {
      const candidate = nameWords(file.replace(/\.jpg$/, ""));
      const shared = [...target].filter((word) => candidate.has(word)).length;
      return { file, score: shared / new Set([...target, ...candidate]).size };
    })
    .sort((a, b) => b.score - a.score || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const [best, next] = scored;
  return best && best.score >= 0.6 && best.score > (next?.score ?? 0) ? best.file : undefined;
}

/**
 * Each texture some tileset lists, in id order: the tilesets listing it (in id order), its texture
 * file's base name (TerrainTexData.xml's Texture, through its parents but not the root default, ##id## filled in), its English name
 * (GameStrings.txt's TerrainTex/Name, the last package's) and its gallery picture. The picture is
 * matched by its file, its name or its id, else by the words of its name (`imageMatch: "fuzzy"`).
 * Where several files match, the first by file name wins.
 */
export function extractTextureFields(tilesets: Readonly<Record<string, readonly string[]>>, packages: readonly TexturePackage[], gallery: readonly string[]): Record<string, ExtractedTexture> {
  const entries = new Map<string, Entry>();
  const names = new Map<string, string>();
  for (const pkg of packages) {
    if (pkg.terrainTexData) readEntries(pkg.terrainTexData, "CTerrainTex", entries);
    for (const match of pkg.gameStrings?.matchAll(/^TerrainTex\/Name\/([^=\r\n]+)=(.*)$/gm) ?? []) names.set(match[1]!, match[2]!.trim());
  }
  const sorted = [...gallery].sort();
  const pictures = new Map<string, string>();
  for (const file of sorted) {
    const key = normalise(file.replace(/\.jpg$/, ""));
    if (!pictures.has(key)) pictures.set(key, file);
  }
  const listedBy = new Map<string, string[]>();
  for (const tileset of Object.keys(tilesets).sort((a, b) => a.localeCompare(b))) {
    for (const id of tilesets[tileset]!) if (id && !listedBy.get(id)?.includes(tileset)) listedBy.set(id, [...(listedBy.get(id) ?? []), tileset]);
  }
  const fields: Record<string, ExtractedTexture> = {};
  for (const id of [...listedBy.keys()].sort((a, b) => a.localeCompare(b))) {
    const texture = resolve(entries, id, "Texture", false)?.at(-1)?.replaceAll("##id##", id);
    const file = texture ? texture.split(/[\\/]/).pop()!.replace(/\.dds$/i, "") : undefined;
    const name = names.get(id);
    const exact = [file, name, id].flatMap((text) => (text ? [pictures.get(normalise(text))] : [])).find((found) => found !== undefined);
    const fuzzy = exact === undefined && name !== undefined ? fuzzyPicture(name, sorted) : undefined;
    const image = exact ?? fuzzy;
    fields[id] = {
      tilesets: listedBy.get(id)!,
      ...(file ? { file } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(image !== undefined ? { image } : {}),
      ...(fuzzy !== undefined ? { imageMatch: "fuzzy" as const } : {}),
    };
  }
  return fields;
}

/** Each package's TerrainTexData.xml and English GameStrings.txt, in load order, every file at once; a file a package lacks is left out. */
export async function fetchTextureData({ fetch = globalThis.fetch, packages = SC2_GAME_DATA_PACKAGES }: Pick<FetchOptions, "fetch" | "packages"> = {}): Promise<TexturePackage[]> {
  const text = async (url: string, shown: string): Promise<string | undefined> => {
    const response = await fetch(url);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${shown}: HTTP ${response.status}`);
    return response.text();
  };
  return Promise.all(
    packages.map(async (name): Promise<TexturePackage> => {
      const [terrainTexData, gameStrings] = await Promise.all([
        text(`${SC2_GAME_DATA_URL}/${name}/base.sc2data/GameData/TerrainTexData.xml`, `${name} TerrainTexData.xml`),
        text(`${SC2_GAME_DATA_URL}/${name}/enus.sc2data/LocalizedData/GameStrings.txt`, `${name} GameStrings.txt`),
      ]);
      return { name, ...(terrainTexData !== undefined ? { terrainTexData } : {}), ...(gameStrings !== undefined ? { gameStrings } : {}) };
    }),
  );
}

export type ExtractTexturesOptions = Pick<FetchOptions, "fetch" | "listGitTree" | "packages" | "log"> & {
  /** The folder to write to (the cache folder's extracted/ by default). */
  readonly extractedDir?: string;
  /** The descriptions to report unextracted ids of (this package's by default). */
  readonly descriptionsFile?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export type ExtractedTextureCounts = {
  readonly tilesets: number;
  readonly textures: number;
  /** How many have a gallery picture. */
  readonly pictured: number;
  /** Described ids that weren't extracted, which the catalog leaves out. */
  readonly unextracted: readonly string[];
};

/**
 * Fetches every package's TerrainData.xml, TerrainTexData.xml and GameStrings.txt and the gallery's
 * texture pictures, extracts the textures' fields and writes them to `extractedDir`. Everything is
 * fetched before anything is written, so a failed fetch leaves an earlier extraction as it was.
 */
export async function extractTextures(options: ExtractTexturesOptions = {}): Promise<ExtractedTextureCounts> {
  const log = options.log ?? (() => {});
  const dir = options.extractedDir ?? extractedDirOf();
  const descriptionsFile = options.descriptionsFile ?? TEXTURE_DESCRIPTIONS_PATH;
  const descriptions = parseTextureDescriptions(readFileSync(descriptionsFile, "utf8"), descriptionsFile);
  const [terrainData, packages, gallery] = await Promise.all([
    fetchTerrainData(options),
    fetchTextureData(options),
    galleryFileNames({ ...options, folder: TEXTURE_GALLERY_FOLDER }).then((files) => (log(`Fetched the gallery's texture list: ${files.length} pictures`), files)),
  ]);
  const tilesets = extractTilesetTextures(terrainData);
  const extracted: ExtractedTextures = { tilesets, textures: extractTextureFields(tilesets, packages, gallery) };
  const unextracted = Object.keys(descriptions).filter((id) => !Object.hasOwn(extracted.textures, id));
  const counts = {
    tilesets: Object.keys(tilesets).length,
    textures: Object.keys(extracted.textures).length,
    pictured: Object.values(extracted.textures).filter((entry) => entry.image !== undefined).length,
  };

  await mkdir(dir, { recursive: true });
  // The info file goes first and comes back last, so an extraction cut short isn't taken for a whole one.
  await rm(path.join(dir, TEXTURE_EXTRACTED_INFO_FILE), { force: true });
  await writeWhole(path.join(dir, TEXTURE_EXTRACTED_FILE), `${JSON.stringify(extracted, null, 2)}\n`);
  await writeWhole(path.join(dir, TEXTURE_EXTRACTED_INFO_FILE), `${JSON.stringify({ extracted: new Date().toISOString(), source: SC2_GAME_DATA_URL, gallery: GALLERY_TREE_URL, ...counts }, null, 2)}\n`);
  log(`${counts.textures} textures in ${counts.tilesets} tilesets, ${counts.pictured} with a gallery picture -> ${dir}`);
  if (unextracted.length) log(`${unextracted.length} described textures weren't extracted, so they're left out of the catalog: ${unextracted.join(", ")}`);
  return { ...counts, unextracted };
}
