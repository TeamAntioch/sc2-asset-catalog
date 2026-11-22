// The decals' extracted fields and pictures, read from the user's own copy of the game (docs/adr/0006).
// Most decals are projectors: their model has no geometry, only a box that paints one texture onto
// the ground under it, which no model viewer draws. So what a variation paints and how big its box
// is come from its model file, and its picture is its texture squeezed to the box's proportions, on
// mid-grey. Neither is in SC2GameData, so this reads a folder the user extracted from their install
// with cascx: the decals' model files and the textures they name. It writes, into the cache folder:
//
//   extracted/decal-extracted.json   each variation's texture, its box in cells and whether it is
//                                    drawn as geometry (a cliff decal's panel), not projected
//   thumbnails/decals/               one PNG per variation (with ImageMagick)
//   catalog-sheets/decals/           one sheet per decal doodad, its variations numbered
//
// Which doodads are decals, how many variations each has and where its model is come from the
// extract command's doodads.json and doodad-models.json, so that runs first. Text decals are
// localized: the enUS texture is used. Like every render, the pictures stay on the user's machine.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { npxHint } from "../util/npx.js";
import { writeWhole } from "../util/write-whole.js";
import { catalogCacheDir, DECAL_DESCRIPTIONS_PATH, extractedDir as extractedDirOf } from "./catalog-dirs.js";
import { SHEET_BACKGROUND } from "./catalog-sheets.js";
import { DECAL_EXTRACTED_FILE, DECAL_FOLDERS, decalPictureFileName, type ExtractedDecalVariation, parseDecalDescriptions } from "./decal-catalog.js";
import { modelPathCandidates } from "./doodad-thumbnails.js";
import { DOODAD_MODELS_FILE, DOODADS_FILE, readDoodadModels, readDoodads } from "./doodads.js";
import { hasM3Projector, readM3Bounds, readM3TexturePaths } from "./m3.js";

/** Runs one ImageMagick command (`magick` or `montage`) with its arguments. */
export type RunMagick = (command: "magick" | "montage", args: readonly string[]) => Promise<void>;

const run = promisify(execFile);
const runMagick: RunMagick = async (command, args) => {
  await run(command, [...args]);
};

/** A picture's tile on a sheet, in pixels. */
const TILE = 256;

/** A font file for montage's labels: ImageMagick often knows none by name, on macOS and Windows above all. */
const LABEL_FONTS = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"];

export type ExtractDecalsOptions = {
  /** The folder cascx extracted the decals' model files and textures into. */
  readonly storageDir: string;
  /** The cache folder (the platform's by default): its extracted/ is read and written, and the pictures go beside it. */
  readonly cacheDir?: string;
  /** Build the pictures and sheets too (true by default); they need ImageMagick. */
  readonly sheets?: boolean;
  /** What runs ImageMagick; tests pass a fake. Without it, `magick -version` is tried first and the pictures are skipped when it fails. */
  readonly magick?: RunMagick;
  /** The descriptions to report undescribed decals and miscounted variations against (this package's by default). */
  readonly descriptionsFile?: string;
  /** The font file montage labels with (the first of LABEL_FONTS on this machine by default). */
  readonly font?: string;
  readonly log?: (line: string) => void;
};

export type ExtractedDecals = {
  /** Decal doodads, and their variations, the extract command lists. */
  readonly doodads: number;
  readonly variations: number;
  /** Variations whose model file was found and read. */
  readonly read: number;
  /** Variations pictured, and sheets built. */
  readonly pictured: number;
  readonly sheets: number;
  /** What couldn't be read or pictured, a line each. */
  readonly problems: readonly string[];
  /** Decal doodads with no description, and described ones whose variation count differs from the game's. */
  readonly undescribed: readonly string[];
  readonly miscounted: readonly string[];
};

/** Each file under `root` by its storage path below its assets folder (lower case, forward slashes), its enUS copy before its base one before the rest. */
async function storageFiles(root: string): Promise<(storagePath: string) => string | undefined> {
  const rank = (folder: string): number => (folder.startsWith("enus.") ? 0 : folder.startsWith("base.") ? 1 : 2);
  const files = new Map<string, { readonly full: string; readonly rank: number }[]>();
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    const match = /([^/]+\.sc2assets)\/(assets\/.*)$/.exec(full.replaceAll("\\", "/").toLowerCase());
    if (match) files.set(match[2]!, [...(files.get(match[2]!) ?? []), { full, rank: rank(match[1]!) }]);
  }
  for (const found of files.values()) found.sort((a, b) => a.rank - b.rank || a.full.localeCompare(b.full));
  return (storagePath) => files.get(storagePath.replaceAll("\\", "/").toLowerCase())?.[0]?.full;
}

/** A path's last part, by either slash: a model names its textures `Assets\Textures\x.dds`. */
const baseName = (file: string): string => file.split(/[\\/]/).at(-1)!;

const round = (n: number): number => Math.round(n * 100) / 100;

/** A variation's fields from its model file. A projector's box lies flat (x by y); a cliff decal's panel stands up (x by z). */
export function readDecalModel(data: Uint8Array): ExtractedDecalVariation & { readonly texturePath?: string } {
  const texturePath = readM3TexturePaths(data).find((texture) => !/norm|spec|emis/i.test(baseName(texture)));
  const { min, max } = readM3Bounds(data);
  const [width, depth] = [max[0] - min[0], max[1] - min[1] || max[2] - min[2]];
  return {
    ...(texturePath ? { texture: baseName(texturePath), texturePath } : {}),
    ...(width > 0 && depth > 0 ? { size: [round(width), round(depth)] as const } : {}),
    ...(hasM3Projector(data) ? {} : { drawn: "geometry" as const }),
  };
}

/** Whether ImageMagick runs here. */
async function magickRuns(magick: RunMagick): Promise<boolean> {
  try {
    await magick("magick", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads every decal doodad's variations from `storageDir` and writes decal-extracted.json into the
 * cache folder's extracted/, with a picture of each variation and a sheet of each doodad beside it.
 */
export async function extractDecals(options: ExtractDecalsOptions): Promise<ExtractedDecals> {
  const log = options.log ?? (() => {});
  const cacheDir = options.cacheDir ?? catalogCacheDir();
  const extracted = extractedDirOf(cacheDir);
  if (![DOODADS_FILE, DOODAD_MODELS_FILE].every((file) => existsSync(path.join(extracted, file)))) {
    throw new Error(`No extracted doodads in ${extracted}: run the extract command first (${npxHint("@team-antioch/sc2-asset-catalog extract")})`);
  }
  if (!existsSync(options.storageDir)) throw new Error(`No folder ${options.storageDir} to read the decals' model files from`);
  const descriptionsFile = options.descriptionsFile ?? DECAL_DESCRIPTIONS_PATH;
  const descriptions = parseDecalDescriptions(await readFile(descriptionsFile, "utf8"), descriptionsFile);
  const doodads = readDoodads(extracted);
  const models = readDoodadModels(extracted);
  const find = await storageFiles(options.storageDir);

  let magick = options.magick;
  if (options.sheets !== false && !magick) {
    if (await magickRuns(runMagick)) magick = runMagick;
    else log("ImageMagick (`magick`, `montage`) isn't installed, so no pictures or sheets are built");
  }
  const pictures = options.sheets !== false && magick ? magick : undefined;
  const font = options.font ?? LABEL_FONTS.find((file) => existsSync(file));
  if (pictures) {
    await mkdir(path.join(cacheDir, DECAL_FOLDERS.pictures), { recursive: true });
    await mkdir(path.join(cacheDir, DECAL_FOLDERS.sheets), { recursive: true });
  }

  const decals = Object.entries(doodads).filter(([, info]) => info.kind === "decal").sort(([a], [b]) => a.localeCompare(b));
  const fields: Record<string, ExtractedDecalVariation[]> = {};
  const problems: string[] = [];
  let read = 0;
  let pictured = 0;
  let sheets = 0;
  for (const [id, info] of decals) {
    const model = models[id] ?? `Assets/Doodads/${id}/${id}.m3`;
    const variations: ExtractedDecalVariation[] = [];
    const drawn: { readonly picture: string; readonly variation: number }[] = [];
    for (let variation = 0; variation < info.variations; variation++) {
      const file = modelPathCandidates(model, variation, info.variations).map(find).find(Boolean);
      if (!file) {
        problems.push(`${id} ${variation}: no model file extracted`);
        variations.push({});
        continue;
      }
      let entry: ReturnType<typeof readDecalModel>;
      try {
        entry = readDecalModel(new Uint8Array(await readFile(file)));
      } catch (error) {
        problems.push(`${id} ${variation}: ${file} can't be read (${(error as Error).message})`);
        variations.push({});
        continue;
      }
      const { texturePath, ...kept } = entry;
      variations.push(kept);
      read++;
      if (!pictures) continue;
      const textureFile = texturePath && find(texturePath);
      if (!textureFile) {
        problems.push(`${id} ${variation}: texture ${texturePath ?? "(none)"} not extracted`);
        continue;
      }
      // Squeezed to the box's proportions, as the game paints it, within a tile.
      const aspect = kept.size ? kept.size[0] / kept.size[1] : 1;
      const [w, h] = aspect >= 1 ? [TILE - 16, Math.max(8, Math.round((TILE - 16) / aspect))] : [Math.max(8, Math.round((TILE - 16) * aspect)), TILE - 16];
      const picture = path.join(cacheDir, DECAL_FOLDERS.pictures, decalPictureFileName(id, variation));
      await pictures("magick", [`${textureFile}[0]`, "-resize", `${w}x${h}!`, "-background", SHEET_BACKGROUND, "-flatten", "-gravity", "center", "-extent", `${TILE}x${TILE}`, picture]);
      drawn.push({ picture, variation });
      pictured++;
    }
    fields[id] = variations;
    if (pictures && drawn.length > 0) {
      const labelled = drawn.flatMap(({ picture, variation }) => ["-label", String(variation).padStart(2, "0"), picture]);
      const sheet = path.join(cacheDir, DECAL_FOLDERS.sheets, `${id}.jpg`);
      await pictures("montage", [...labelled, "-background", SHEET_BACKGROUND, ...(font ? ["-font", font] : []), "-fill", "white", "-pointsize", "18", "-geometry", `${TILE}x${TILE}+4+4`, "-tile", `${Math.min(6, drawn.length)}x`, "-strip", "-quality", "85", sheet]);
      sheets++;
    }
    log(`${id}: ${variations.filter((variation) => Object.keys(variation).length > 0).length}/${info.variations} read${pictures ? `, ${drawn.length} pictured` : ""}`);
  }

  await mkdir(extracted, { recursive: true });
  await writeWhole(path.join(extracted, DECAL_EXTRACTED_FILE), `${JSON.stringify(fields, null, 2)}\n`);
  const undescribed = decals.flatMap(([id]) => (Object.hasOwn(descriptions, id) ? [] : [id]));
  const miscounted = decals.flatMap(([id, info]) => (Object.hasOwn(descriptions, id) && descriptions[id]!.length !== info.variations ? [`${id} (${descriptions[id]!.length} described, ${info.variations} in the game)`] : []));
  const variations = decals.reduce((sum, [, info]) => sum + info.variations, 0);
  log(`${decals.length} decal doodads, ${read}/${variations} variations read${pictures ? `, ${pictured} pictured, ${sheets} sheets` : ""} -> ${cacheDir}`);
  if (problems.length) log(`Not read or pictured:\n  ${problems.join("\n  ")}`);
  if (undescribed.length) log(`No description yet: ${undescribed.join(", ")}`);
  if (miscounted.length) log(`Described with a different number of variations: ${miscounted.join(", ")}`);
  return { doodads: decals.length, variations, read, pictured, sheets, problems, undescribed, miscounted };
}
