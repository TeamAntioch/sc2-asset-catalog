// The catalog's thumbnails, which a model renderer draws (render-thumbnails.ts): which model files to
// ask for (a catalog doodad's variations, or one model file no catalog lists), what each thumbnail
// is called, and the sheet a rendered variation's four angles make.

import { existsSync } from "node:fs";
import path from "node:path";

import type { SheetJob } from "./catalog-sheets.js";

/** One variation of one model to render, named `<type>_<variation>_a<angle>.png`. */
export type ThumbnailJob = {
  readonly type: string;
  /** The model's storage path; a variation's file may be numbered beside it (see modelPathCandidates). */
  readonly model: string;
  readonly variation: number;
  readonly variations: number;
};

/** Angles per doodad, evenly spaced around a turntable. */
export const THUMBNAIL_ANGLES = 4;

/**
 * Storage paths to try for one variation, best guess first, from the doodad's model file
 * (the extracted doodad-models.json, e.g. Assets/Doodads/<id>/<id>.m3). Variations are files beside it
 * numbered <name>_00.m3, <name>_01.m3, … A single-variation model may still use either form, and a
 * model whose count claims variations may have only the plain file (a mod's, often), which stands
 * for its first.
 */
export function modelPathCandidates(model: string, variation: number, variations: number): string[] {
  const numbered = model.replace(/\.m3$/, `_${String(variation).padStart(2, "0")}.m3`);
  if (variations <= 1) return [model, numbered];
  return variation === 0 ? [numbered, model] : [numbered];
}

/** Output file name for one angle of one variation. */
export function thumbnailFileName(type: string, variation: number, angle: number): string {
  return `${type}_${String(variation).padStart(2, "0")}_a${angle}.png`;
}

/** File name of one variation's sheet beside its renders in a folder of its own: `<type>_<variation>.jpg`. */
export function variationSheetFileName(type: string, variation: number): string {
  return `${type}_${String(variation).padStart(2, "0")}.jpg`;
}

/**
 * One job rendering, as variation 00 named `name`, a model no catalog lists: a model file on disk
 * (a mod's own), resolved from `cwd`, or else a storage path the game holds, with the Editor's
 * backslashes turned round.
 */
export function modelJob(name: string, model: string, cwd: string): ThumbnailJob {
  const forward = model.replace(/\\/g, "/");
  const file = path.resolve(cwd, forward);
  return { type: name, model: existsSync(file) ? file : forward, variation: 0, variations: 1 };
}

/**
 * The sheet one rendered job makes, beside its renders in `outDir`: `<type>_<variation>.jpg`, its
 * four angles in a 2×2 grid as the catalog sheets have, so each variation shows in one picture.
 */
export function jobSheet(job: Pick<ThumbnailJob, "type" | "variation">, outDir: string): SheetJob {
  return {
    renders: Array.from({ length: THUMBNAIL_ANGLES }, (_, angle) => path.join(outDir, thumbnailFileName(job.type, job.variation, angle))),
    sheet: path.join(outDir, variationSheetFileName(job.type, job.variation)),
  };
}
