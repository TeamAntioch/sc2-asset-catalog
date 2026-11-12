// The catalog's reference sheets: one 512×512 JPEG per doodad or terrain-object model with its four
// turntable angles (variation 00) in a 2×2 grid on mid-grey, so dark and pale models both show.
// They're built from renders made on this machine (render-thumbnails.ts, with a model renderer such
// as one over the WhiteoutFlakes viewer on macOS), and like them are rendered game assets: they stay
// in the user's cache folder and are never redistributed. Needs ImageMagick (`montage`).

import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { THUMBNAIL_ANGLES, thumbnailFileName } from "./doodad-thumbnails.js";

/** The sheets' background, which the Finder's page matches. */
export const SHEET_BACKGROUND = "#808080";

export type SheetCatalog = "doodad" | "terrain-object";

/** Where each catalog's renders and sheets are, relative to the sources' root (the cache folder). */
export const SHEET_FOLDERS: Readonly<Record<SheetCatalog, { readonly renders: string; readonly sheets: string }>> = {
  doodad: { renders: "thumbnails/doodads", sheets: "catalog-sheets/doodads" },
  "terrain-object": { renders: "thumbnails/terrain-objects", sheets: "catalog-sheets/terrain-objects" },
};

/** The name an entry's renders and sheet go by: a doodad's id, or a terrain object's model (terrain objects of one model share its sheet). */
export const sheetName = (catalog: SheetCatalog, id: string, model?: string): string => (catalog === "terrain-object" && model ? path.posix.basename(model, ".m3") : id);

/** The four renders of variation 00 a sheet is built from, relative to the root. */
export const sheetRenders = (catalog: SheetCatalog, name: string): string[] =>
  Array.from({ length: THUMBNAIL_ANGLES }, (_, angle) => `${SHEET_FOLDERS[catalog].renders}/${thumbnailFileName(name, 0, angle)}`);

/** Where a sheet goes, relative to the root. */
export const sheetPath = (catalog: SheetCatalog, name: string): string => `${SHEET_FOLDERS[catalog].sheets}/${name}.jpg`;

const run = promisify(execFile);

/** Builds one sheet from its renders (absolute paths, in angle order) with ImageMagick's montage. */
export async function montageSheet(renders: readonly string[], sheet: string): Promise<void> {
  await run("montage", [...renders, "-background", SHEET_BACKGROUND, "-geometry", "256x256+0+0", "-tile", "2x2", "-strip", "-quality", "80", sheet]);
}

export type SheetJob = { readonly renders: readonly string[]; readonly sheet: string };

export type BuildSheetsOptions = {
  /** Rebuild sheets newer than their renders too. */
  readonly force?: boolean;
  /** What builds one sheet; montageSheet by default. */
  readonly build?: (renders: readonly string[], sheet: string) => Promise<void>;
};

const MONTAGES_AT_ONCE = 8;

const mtime = (file: string) => stat(file).then((found) => found.mtimeMs, () => undefined);

/** Builds each job's sheet (absolute paths) unless it is newer than all its renders, making its folder; gives the sheets built. */
export async function buildSheets(jobs: Iterable<SheetJob>, { force = false, build = montageSheet }: BuildSheetsOptions = {}): Promise<string[]> {
  const queue = [...jobs].filter((job) => job.renders.length > 0);
  const built: string[] = [];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const builtAt = await mtime(job.sheet);
      const newest = Math.max(...(await Promise.all(job.renders.map(mtime))).map((time) => time ?? Infinity));
      if (!force && builtAt !== undefined && builtAt >= newest) continue;
      await mkdir(path.dirname(job.sheet), { recursive: true });
      await build(job.renders, job.sheet);
      built.push(job.sheet);
    }
  };
  await Promise.all(Array.from({ length: MONTAGES_AT_ONCE }, worker));
  return built;
}
