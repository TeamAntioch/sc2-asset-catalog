// Rendering the catalog's thumbnails and sheets on this machine: an optional step, as the Finder's
// cards show gallery pictures without it. A model renderer draws each doodad's model from four
// turntable angles; the four make its reference sheet (catalog-sheets.ts), which the cards show in
// place of the gallery picture. Renders and sheets are rendered game assets: they stay in the cache
// folder and are never redistributed.
//
// The built-in renderer runs the WhiteoutFlakes viewer on macOS (whiteoutflakes.ts, built by
// `setup-renderer`). Any other ModelRenderer can draw instead: `sc2-asset-catalog render --renderer`
// takes a module whose default export is one. A manifest beside the renders records what was drawn
// by which renderer, so unchanged doodads are skipped on later runs.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { withFileLock } from "../util/file-lock.js";
import { writeWhole } from "../util/write-whole.js";
import { catalogCacheDir, extractedDir as extractedDirOf } from "./catalog-dirs.js";
import { buildSheets, montageSheet, SHEET_FOLDERS, sheetPath, sheetRenders } from "./catalog-sheets.js";
import { type DoodadInfo, readDoodadModels, readDoodads } from "./doodads.js";
import { hasExtractedCatalog } from "./extract-catalog.js";
import { modelPathCandidates, THUMBNAIL_ANGLES, thumbnailFileName, type ThumbnailJob } from "./doodad-thumbnails.js";

/** Thumbnails are this many pixels square. */
export const THUMBNAIL_SIZE = 512;
// Bump when what a manifest entry means changes, so earlier results are rendered again.
const MANIFEST_RULES_VERSION = 1;

/** What draws a model: the small interface a renderer module's default export has. */
export type ModelRenderer = {
  /**
   * Draws `model` (a storage path in the game's data, such as Assets/Doodads/Rock/Rock.m3, or a
   * model file on disk) from THUMBNAIL_ANGLES turntable angles, evenly spaced and pitched down, one
   * transparent `size`×`size` PNG per path in `outputPaths`, in angle order.
   */
  render(request: { readonly model: string; readonly outputPaths: readonly string[]; readonly size: number }): Promise<void>;
  /** What makes its output what it is (its build and recipe), so a change draws everything again. */
  readonly key?: () => Promise<string>;
  /** Whether a render's error means there is no such model file, so the next candidate file is tried. */
  readonly isNotFound?: (error: unknown) => boolean;
};

/** `notFound` marks a failure where no candidate file exists at all. */
export type ManifestEntry = { key: string; ok: boolean; model?: string; error?: string; notFound?: true };

export type RenderThumbnailsOptions = {
  /** Draw even what the manifest says is up to date. */
  readonly force?: boolean;
  /** How many renders run at once (4 by default). */
  readonly workers?: number;
  readonly log?: (line: string) => void;
};

export type RenderThumbnailsResult = { readonly rendered: number; readonly failed: number; readonly unchanged: number };

// Lights have no model worth a picture.
const SKIPPED_KINDS = new Set(["light"]);

/** Which doodads to render: their first variation (or every one), lights left out, the ids given or all. */
export function catalogThumbnailJobs(
  doodads: Readonly<Record<string, DoodadInfo>>,
  models: Readonly<Record<string, string>>,
  { ids, allVariations = false }: { readonly ids?: readonly string[]; readonly allVariations?: boolean } = {},
): ThumbnailJob[] {
  const wanted = ids ? new Set(ids) : undefined;
  return Object.entries(doodads)
    .filter(([id, info]) => (!wanted || wanted.has(id)) && !SKIPPED_KINDS.has(info.kind))
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([id, info]) =>
      Array.from({ length: allVariations ? info.variations : 1 }, (_, variation) => ({
        type: id,
        model: Object.hasOwn(models, id) ? models[id]! : `Assets/Doodads/${id}/${id}.m3`,
        variation,
        variations: info.variations,
      })),
    );
}

const manifestId = (job: ThumbnailJob): string => `${job.type}_${String(job.variation).padStart(2, "0")}`;

/** A job's output files in `outDir`, one per angle. */
const outputFiles = (job: ThumbnailJob, outDir: string): string[] =>
  Array.from({ length: THUMBNAIL_ANGLES }, (_, angle) => path.join(outDir, thumbnailFileName(job.type, job.variation, angle)));

/** An error's first line, for a manifest or a report. */
const firstLine = (error: unknown): string => (error instanceof Error ? error.message.split("\n")[0]! : String(error));

/** A renders folder's manifest, empty when there is none yet. */
const readManifest = async (file: string): Promise<Record<string, ManifestEntry>> => (existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : {});

/**
 * Renders the jobs' thumbnails into `outDir`, beside a manifest.json recording each job's outcome.
 * A job is unchanged when the same renderer drew it from a model file it would still try and its
 * renders are all still there; a failed job, or one whose renders were deleted, is drawn again.
 */
export async function renderThumbnails(renderer: ModelRenderer, jobs: readonly ThumbnailJob[], outDir: string, options: RenderThumbnailsOptions = {}): Promise<RenderThumbnailsResult> {
  const log = options.log ?? (() => {});
  await mkdir(outDir, { recursive: true });
  const manifestPath = path.join(outDir, "manifest.json");
  const manifest = await readManifest(manifestPath);
  const key = createHash("sha1")
    .update(`${renderer.key ? await renderer.key() : ""}\n${THUMBNAIL_ANGLES}x${THUMBNAIL_SIZE}\n${MANIFEST_RULES_VERSION}`)
    .digest("hex");
  const todo = jobs.filter((job) => {
    const entry = manifest[manifestId(job)];
    const current =
      entry?.key === key &&
      entry.ok &&
      entry.model !== undefined &&
      modelPathCandidates(job.model, job.variation, job.variations).includes(entry.model) &&
      outputFiles(job, outDir).every((file) => existsSync(file));
    return options.force || !current;
  });
  let done = 0;
  let failed = 0;
  const queue = [...todo];
  // What this run recorded. Each save lays it over the manifest as it is on disk then, so what
  // another run on the same folder recorded meanwhile is kept.
  const recorded: Record<string, ManifestEntry> = {};
  // One save at a time, each written whole: workers finishing together never write it at once.
  let saving: Promise<void> = Promise.resolve();
  const save = (): Promise<void> =>
    (saving = saving
      .catch(() => {})
      .then(async () => {
        await withFileLock(`${manifestPath}.lock`, async () => {
          const onDisk = await readManifest(manifestPath).catch(() => manifest);
          await writeWhole(manifestPath, `${JSON.stringify({ ...onDisk, ...recorded }, null, 2)}\n`);
        });
      }));
  const worker = async (): Promise<void> => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const files = outputFiles(job, outDir);
      const entry = await renderJob(renderer, job, files);
      recorded[manifestId(job)] = { key, ...entry };
      if (!entry.ok) {
        failed++;
        // Drop thumbnails an earlier run left, so nothing on disk contradicts the manifest.
        await Promise.all(files.map((file) => rm(file, { force: true })));
      }
      done++;
      if (done % 25 === 0 || done === todo.length) {
        log(`${done}/${todo.length} rendered (${failed} failed)`);
        await save();
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.max(1, options.workers ?? 4) }, worker));
  } finally {
    await save();
  }
  return { rendered: todo.length - failed, failed, unchanged: jobs.length - todo.length };
}

/**
 * Renders one variation, trying each candidate model file in turn until one draws. When none does,
 * the job fails with the first reason that isn't "no such model" (that says most about why), else
 * with the last file it looked for.
 */
async function renderJob(renderer: ModelRenderer, job: ThumbnailJob, outputPaths: readonly string[]): Promise<Omit<ManifestEntry, "key">> {
  let failure: { readonly entry: Omit<ManifestEntry, "key">; readonly notFound: boolean } | undefined;
  for (const model of modelPathCandidates(job.model, job.variation, job.variations)) {
    try {
      await renderer.render({ model, outputPaths, size: THUMBNAIL_SIZE });
      return { ok: true, model };
    } catch (error) {
      const notFound = renderer.isNotFound?.(error) ?? false;
      if (!failure || failure.notFound) failure = { entry: { ok: false, model, error: firstLine(error), ...(notFound ? { notFound: true as const } : {}) }, notFound };
    }
  }
  return failure?.entry ?? { ok: false, error: "no model file to try", notFound: true };
}

export type RenderCatalogSheetsOptions = RenderThumbnailsOptions & {
  readonly renderer: ModelRenderer;
  /** The cache folder: its extracted fields say what to render, and the renders and sheets go in it (the platform's by default). */
  readonly cacheDir?: string;
  /** Only these doodads (all by default). */
  readonly ids?: readonly string[];
  /** What builds a sheet from its renders: ImageMagick's montage by default. */
  readonly montage?: (renders: readonly string[], sheet: string) => Promise<void>;
};

/**
 * Renders the catalog's doodads (variation 00) into the cache folder's thumbnails/doodads/, then
 * builds each one's sheet into catalog-sheets/doodads/, where the search finds it; a doodad whose
 * render failed loses its sheet too. Needs the catalog extracted first, and refuses ids it doesn't
 * have before rendering anything.
 */
export async function renderCatalogSheets(options: RenderCatalogSheetsOptions): Promise<RenderThumbnailsResult & { readonly sheets: number }> {
  const cacheDir = options.cacheDir ?? catalogCacheDir();
  const extracted = extractedDirOf(cacheDir);
  if (!hasExtractedCatalog(extracted)) throw new Error(`Nothing extracted in ${cacheDir} yet: run sc2-asset-catalog extract first (npx @team-antioch/sc2-asset-catalog extract)`);
  const doodads = readDoodads(extracted);
  const unknown = (options.ids ?? []).filter((id) => !Object.hasOwn(doodads, id));
  if (unknown.length) throw new Error(`The catalog has no doodad ${unknown.join(", ")}`);
  const jobs = catalogThumbnailJobs(doodads, readDoodadModels(extracted), options.ids ? { ids: options.ids } : {});
  const rendered = await renderThumbnails(options.renderer, jobs, path.join(cacheDir, SHEET_FOLDERS.doodad.renders), options);
  const sheetJobs: { renders: string[]; sheet: string }[] = [];
  for (const job of jobs) {
    const renders = sheetRenders("doodad", job.type).map((render) => path.join(cacheDir, render));
    const sheet = path.join(cacheDir, sheetPath("doodad", job.type));
    // A failed render took its renders away: its sheet goes too, so nothing shows what didn't draw.
    if (renders.every((render) => existsSync(render))) sheetJobs.push({ renders, sheet });
    else await rm(sheet, { force: true });
  }
  const built = await buildSheets(sheetJobs, { ...(options.force ? { force: true } : {}), build: options.montage ?? montageSheet });
  options.log?.(`${built.length} sheets built in ${path.join(cacheDir, SHEET_FOLDERS.doodad.sheets)}`);
  return { ...rendered, sheets: built.length };
}
