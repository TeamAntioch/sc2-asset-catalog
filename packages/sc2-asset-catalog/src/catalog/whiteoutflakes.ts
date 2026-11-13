// The built-in renderer: a ModelRenderer (render-thumbnails.ts) over the WhiteoutFlakes model
// viewer (github.com/FernandoS27/WhiteoutFlakes, BSD-3-Clause), which `setup-renderer` builds on
// macOS (renderer-setup.ts). The viewer reads each model straight from the StarCraft II install's
// storage and writes one PNG per turntable angle; this module runs it and checks what it wrote.
//
// Viewer facts it relies on:
// - It keeps its Vulkan pipeline cache and PSO trace in ~/Library/Caches/WhiteoutFlakes. Processes
//   sharing them corrupt them and draw magenta, so each concurrent run gets its own HOME, in this
//   process or any other, kept between runs so the caches stay warm.
// - It finds the StarCraft II install itself; a settings.ini in its HOME (`[IO.Sc2] InstallPath`)
//   points it at another. Each HOME gets one naming the install this renderer was given.
// - A frame can come out garbled, and the background white, black or unkeyed, at random; a model is
//   rendered again (up to RENDER_ATTEMPTS times) while some angle has no clean white frame.
// - It exits normally whatever happened; a missing model is told by its log.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { createLock, removeIfStale, withFileLock } from "../util/file-lock.js";
import { readPng, type RgbaImage, writeRgbaPng } from "../util/png.js";
import { writeWhole } from "../util/write-whole.js";
import { THUMBNAIL_ANGLES } from "./doodad-thumbnails.js";
import { type ModelRenderer, THUMBNAIL_SIZE } from "./render-thumbnails.js";
import { angleFrames, type FrameBackground, frameBackground, keyBackground, magentaShare, thumbnailRecipe } from "./whiteoutflakes-frames.js";
import { npxHint } from "../util/npx.js";

/** Runs the viewer program with these arguments and environment, giving its output; rejects on a timeout or a failed start. */
export type RunViewer = (
  bin: string,
  args: readonly string[],
  options: { readonly env: Readonly<Record<string, string | undefined>>; readonly timeout: number },
) => Promise<{ readonly stdout: string; readonly stderr: string }>;

export type WhiteoutFlakesOptions = {
  /** The viewer program: WhiteoutFlakes.app/Contents/MacOS/WhiteoutFlakes. */
  readonly viewer: string;
  /** The StarCraft II install folder the viewer reads models from. */
  readonly sc2Path: string;
  /** Where the viewer's per-run homes and each render's work folder go (the cache folder's whiteoutflakes/). */
  readonly workDir: string;
  /** For tests: what runs the viewer. */
  readonly run?: RunViewer;
};

/** The error a render rejects with when the game has no model at that path. */
export class ModelNotFoundError extends Error {
  constructor(readonly model: string) {
    super(`model not found: ${model}`);
    this.name = "ModelNotFoundError";
  }
}

const RENDER_TIMEOUT_MS = 120_000;
// A frame with more than this share of its visible pixels magenta is garbled (see magentaShare).
const MAX_MAGENTA_SHARE = 0.0005;
const RENDER_ATTEMPTS = 3;
// Bump when how frames are chosen, judged or keyed changes (here or in whiteoutflakes-frames.ts), so
// renders made the old way are made again.
const FRAME_RULES_VERSION = 1;
const BACKGROUND_RANK: Record<Exclude<FrameBackground, "unkeyed">, number> = { white: 2, black: 1, mixed: 0 };
type KeyableFrame = { image: RgbaImage; background: Exclude<FrameBackground, "unkeyed"> };

const execViewer: RunViewer = async (bin, args, { env, timeout }) => {
  const { stdout, stderr } = await promisify(execFile)(bin, [...args], { timeout, maxBuffer: 16 * 1024 * 1024, env, encoding: "utf8" });
  return { stdout, stderr };
};

/** The viewer's settings file in a HOME, on macOS. */
const settingsFile = (home: string): string => path.join(home, "Library", "Application Support", "WhiteoutFlakes", "settings.ini");

/** The home locks this process holds, let go when it exits normally. */
const heldLocks = new Set<string>();
process.once("exit", () => {
  for (const lock of heldLocks) rmSync(lock, { force: true });
});

/**
 * Takes a numbered viewer home in `homesDir` that no other render holds, in this process or another:
 * the lowest free one, so the same few are reused and their caches stay warm. `release` lets it go.
 *
 * A home is held by its lock file beside it, `<slot>.lock`, naming the holding process and made only
 * if absent. Takers take turns (`take.lock`), so a stale lock, left by a process killed before it
 * could let go, is checked and removed by one taker at a time.
 */
async function takeHome(homesDir: string): Promise<{ home: string; release: () => Promise<void> }> {
  await mkdir(homesDir, { recursive: true });
  return withFileLock(path.join(homesDir, "take.lock"), async () => {
    for (let slot = 0; ; slot++) {
      const lock = path.join(homesDir, `${slot}.lock`);
      if (!(await createLock(lock)) && !((await removeIfStale(lock)) && (await createLock(lock)))) continue;
      heldLocks.add(lock);
      const release = async (): Promise<void> => {
        heldLocks.delete(lock);
        await rm(lock, { force: true });
      };
      return { home: path.join(homesDir, String(slot)), release };
    }
  });
}

/** A ModelRenderer drawing models with the WhiteoutFlakes viewer. */
export function whiteoutFlakesRenderer({ viewer, sc2Path, workDir, run = execViewer }: WhiteoutFlakesOptions): ModelRenderer {
  const checkedViewer = (): string => {
    if (!existsSync(viewer)) throw new Error(`No WhiteoutFlakes viewer at ${viewer}: run \`${npxHint("@team-antioch/sc2-asset-catalog setup-renderer")}\` to build it`);
    return viewer;
  };

  const withHome = async <T>(use: (home: string) => Promise<T>): Promise<T> => {
    const { home, release } = await takeHome(path.join(workDir, "worker-homes"));
    try {
      await mkdir(path.dirname(settingsFile(home)), { recursive: true });
      await writeFile(settingsFile(home), `[IO.Sc2]\nInstallPath=${sc2Path}\n`);
      return await use(home);
    } finally {
      await release();
    }
  };

  return {
    // The viewer build (its file's modification time), the export recipe and how frames are judged, hashed.
    async key() {
      const built = (await stat(checkedViewer())).mtimeMs;
      return createHash("sha1").update(`${built}\n${thumbnailRecipe(THUMBNAIL_ANGLES, THUMBNAIL_SIZE)}\n${FRAME_RULES_VERSION}`).digest("hex");
    },
    isNotFound: (error) => error instanceof ModelNotFoundError,
    async render({ model, outputPaths, size }) {
      const bin = checkedViewer();
      await withHome(async (home) => {
        await mkdir(workDir, { recursive: true });
        const work = await mkdtemp(path.join(workDir, "render-"));
        try {
          const recipePath = path.join(work, "recipe.ini");
          await writeFile(recipePath, thumbnailRecipe(outputPaths.length, size));
          const best = new Map<number, KeyableFrame>();
          let attempts = 0;
          for (let attempt = 1; attempt <= RENDER_ATTEMPTS; attempt++) {
            const captureDir = path.join(work, `attempt-${attempt}`);
            await mkdir(captureDir, { recursive: true });
            let frames: ReturnType<typeof angleFrames>;
            try {
              const { stdout, stderr } = await run(
                bin,
                // --export-anim enables the capture (clip 0 at 30 fps); 100 ms gives every angle a few frames.
                ["--backend", "vulkan", model, "--export-recipe", recipePath, "--export-anim", "0", "30", captureDir, "--export-duration", "100"],
                { env: { ...process.env, HOME: home }, timeout: RENDER_TIMEOUT_MS },
              );
              frames = angleFrames(await readdir(captureDir));
              if (frames.size === 0) throw /SpawnUnit FAILED|file not found/.test(stdout + stderr) ? new ModelNotFoundError(model) : new Error(`the viewer wrote no frames for ${model}`);
            } catch (error) {
              // A retry that fails keeps what earlier attempts drew; only a first failure is the model's.
              if (best.size === 0) throw error;
              break;
            }
            attempts = attempt;
            // Per angle, the best frame over all attempts: white background, then black, then mixed (a
            // dark model reaching the border also reads as mixed; garbled tiles carry magenta, and
            // unkeyed frames the viewer's grey clear colour).
            for (const [angle, names] of frames) {
              for (const name of names) {
                if (best.get(angle)?.background === "white") break;
                let image: RgbaImage;
                try {
                  image = readPng(await readFile(path.join(captureDir, name)));
                } catch {
                  continue; // A frame the viewer wrote only partly, or not as a PNG: as good as garbled.
                }
                if (magentaShare(image) > MAX_MAGENTA_SHARE) continue;
                const background = frameBackground(image);
                if (background === "unkeyed") continue;
                const current = best.get(angle);
                if (!current || BACKGROUND_RANK[background] > BACKGROUND_RANK[current.background]) best.set(angle, { image, background });
              }
            }
            if (outputPaths.every((_, angle) => best.get(angle)?.background === "white")) break;
          }
          if (outputPaths.some((_, angle) => !best.has(angle))) throw new Error(`garbled frames of ${model} after ${attempts} attempts`);
          for (const [angle, outputPath] of outputPaths.entries()) {
            const { image, background } = best.get(angle)!;
            await writeWhole(outputPath, writeRgbaPng(keyBackground(image, background === "black" ? "black" : "white")));
          }
        } finally {
          await rm(work, { recursive: true, force: true });
        }
      });
    },
  };
}
