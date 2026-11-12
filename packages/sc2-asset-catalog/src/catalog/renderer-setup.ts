// Setting up the built-in renderer (`sc2-asset-catalog setup-renderer`), and finding what `render`
// runs: the WhiteoutFlakes viewer and the StarCraft II install it reads models from.
//
// Setup builds the viewer from source on an Apple silicon Mac with scripts/build-whiteoutflakes.sh,
// which needs Xcode with its Metal toolchain and Homebrew. It checks for those first and says what's
// missing and how to get it, then builds into the cache folder's whiteoutflakes/ (the script skips
// the steps already done) and records the viewer's path in renderer.json in the config folder.
// Rendering isn't supported on Windows or Linux yet.

import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeWhole } from "../util/write-whole.js";
import { catalogCacheDir, catalogConfigDir } from "./catalog-dirs.js";

/** The script that builds the viewer, shipped in this package's scripts/. */
export const BUILD_SCRIPT = fileURLToPath(new URL("../../scripts/build-whiteoutflakes.sh", import.meta.url));

/** Where the build script expects Xcode (it selects it with DEVELOPER_DIR). */
export const XCODE_APP = "/Applications/Xcode.app";

/** Where StarCraft II is installed on macOS unless SC2_ASSET_CATALOG_SC2_PATH or --sc2 says otherwise. */
export const DEFAULT_SC2_PATH = "/Applications/StarCraft II";

/** The viewer program inside the app the build stages. */
const APP_PROGRAM = path.join("Contents", "MacOS", "WhiteoutFlakes");

/** The folder the viewer is built in, and the renderer's per-run homes go in: the cache folder's whiteoutflakes/. */
export const rendererDir = (cacheDir: string): string => path.join(cacheDir, "whiteoutflakes");

/** The file in the config folder recording where setup built the viewer. */
export const rendererRecord = (configDir: string): string => path.join(configDir, "renderer.json");

/** What setup looks at and runs on this machine. */
export type SetupSystem = {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly exists: (file: string) => boolean;
  /** Whether a command runs and exits 0. */
  readonly succeeds: (command: string, args: readonly string[], env?: Readonly<Record<string, string>>) => Promise<boolean>;
  /** Runs the build script into `dir`, its output shown as it goes; rejects when it fails. */
  readonly build: (script: string, dir: string) => Promise<void>;
};

/** This machine, as setup sees it. */
export const thisMachine: SetupSystem = {
  platform: process.platform,
  arch: process.arch,
  exists: existsSync,
  succeeds: (command, args, env) =>
    new Promise((resolve) => {
      execFile(command, [...args], { env: { ...process.env, ...env }, timeout: 60_000 }, (error) => resolve(!error));
    }),
  build: (script, dir) =>
    new Promise((resolve, reject) => {
      const child = spawn("bash", [script, dir], { stdio: "inherit" });
      child.on("error", reject);
      child.on("exit", (code, signal) => (code === 0 ? resolve() : reject(new Error(`The build failed (${signal ?? `exit ${code}`}); its output is above. Run setup-renderer again to carry on from where it stopped.`))));
    }),
};

const PLATFORM_NAMES: Partial<Record<NodeJS.Platform, string>> = { win32: "Windows", linux: "Linux" };

/** Refuses a platform the built-in renderer can't run on. */
export function checkRenderPlatform(platform: NodeJS.Platform, arch: string): void {
  if (platform !== "darwin") {
    throw new Error(`Rendering isn't supported on ${PLATFORM_NAMES[platform] ?? platform} yet: the built-in renderer runs on macOS only. Cards show the gallery's pictures without it.`);
  }
  if (arch !== "arm64") throw new Error(`Rendering needs an Apple silicon Mac: the viewer is built for arm64, and this Mac is ${arch}.`);
}

/** What setup needs that this Mac lacks, each with how to get it. */
async function missingTools(system: SetupSystem): Promise<string[]> {
  const missing: string[] = [];
  const developerDir = path.join(XCODE_APP, "Contents", "Developer");
  if (!system.exists(XCODE_APP)) {
    missing.push(`Xcode, at ${XCODE_APP}: install it from the App Store (https://apps.apple.com/app/xcode/id497799835) and open it once. Command Line Tools alone aren't enough.`);
  } else if (!(await system.succeeds("xcrun", ["--sdk", "macosx", "metal", "-v"], { DEVELOPER_DIR: developerDir }))) {
    missing.push("Xcode's Metal toolchain: run `xcodebuild -downloadComponent MetalToolchain` (about 840 MB, no sudo).");
  }
  if (!(await system.succeeds("brew", ["--version"]))) missing.push("Homebrew: install it from https://brew.sh (the build installs cmake, ninja, vulkan-loader and molten-vk with it).");
  if (!(await system.succeeds("montage", ["-version"]))) missing.push("ImageMagick, whose `montage` builds the sheets from the renders: run `brew install imagemagick`.");
  return missing;
}

export type SetupRendererOptions = {
  /** The cache folder the viewer is built in (the platform's by default). */
  readonly cacheDir?: string;
  /** The config folder the viewer's path is recorded in (the platform's by default). */
  readonly configDir?: string;
  readonly log?: (line: string) => void;
  /** For tests: the machine. */
  readonly system?: SetupSystem;
};

/** Checks this Mac, builds the viewer and records where it is; gives the viewer program's path. */
export async function setupRenderer(options: SetupRendererOptions = {}): Promise<{ readonly viewer: string }> {
  const system = options.system ?? thisMachine;
  const log = options.log ?? (() => {});
  checkRenderPlatform(system.platform, system.arch);
  const missing = await missingTools(system);
  if (missing.length) throw new Error(`The renderer can't be built yet. This Mac needs:\n${missing.map((line) => `- ${line}`).join("\n")}\nThen run setup-renderer again.`);
  // Absolute, since the build script changes folder and the record is read from anywhere.
  const dir = path.resolve(rendererDir(options.cacheDir ?? catalogCacheDir()));
  log(`Building the WhiteoutFlakes viewer in ${dir} (steps already done are skipped)`);
  await system.build(BUILD_SCRIPT, dir);
  const viewer = path.join(dir, "stage", "WhiteoutFlakes.app", APP_PROGRAM);
  if (!system.exists(viewer)) throw new Error(`The build finished, but there's no viewer at ${viewer}`);
  const configDir = options.configDir ?? catalogConfigDir();
  await mkdir(configDir, { recursive: true });
  await writeWhole(rendererRecord(configDir), `${JSON.stringify({ viewer }, null, 2)}\n`);
  log(`The viewer is at ${viewer}, recorded in ${rendererRecord(configDir)}`);
  return { viewer };
}

/** The viewer program a path names: the program itself, or the WhiteoutFlakes.app around it. */
const viewerProgram = (file: string): string => (/\.app\/?$/i.test(file) ? path.join(file, APP_PROGRAM) : file);

/**
 * The viewer `render` runs: the one --viewer names, else SC2_ASSET_CATALOG_VIEWER's, else the one
 * setup recorded. Either of the first two can name the .app or the program in it.
 */
export function findViewer({ flag, env = process.env, configDir = catalogConfigDir() }: { readonly flag?: string; readonly env?: Readonly<Record<string, string | undefined>>; readonly configDir?: string }): string {
  const given = flag ?? (env.SC2_ASSET_CATALOG_VIEWER || undefined);
  if (given !== undefined) {
    const program = viewerProgram(given);
    if (!existsSync(program)) throw new Error(`No WhiteoutFlakes viewer at ${program}`);
    return program;
  }
  const record = rendererRecord(configDir);
  let viewer: unknown;
  try {
    viewer = (JSON.parse(readFileSync(record, "utf8")) as { viewer?: unknown }).viewer;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("The renderer isn't set up yet: run `npx @teamantioch/sc2-asset-catalog setup-renderer` first (macOS), or pass --viewer <WhiteoutFlakes.app>");
    throw new Error(`${record} can't be read (${error instanceof Error ? error.message : error}): run setup-renderer again`);
  }
  if (typeof viewer !== "string") throw new Error(`${record} has no viewer path: run setup-renderer again`);
  if (!existsSync(viewer)) throw new Error(`The viewer setup-renderer built is gone from ${viewer}: run setup-renderer again`);
  return viewer;
}

/** The StarCraft II install the viewer reads: the folder --sc2 names, else SC2_ASSET_CATALOG_SC2_PATH's, else /Applications/StarCraft II. */
export function findSc2({ flag, env = process.env }: { readonly flag?: string; readonly env?: Readonly<Record<string, string | undefined>> }): string {
  const folder = flag ?? (env.SC2_ASSET_CATALOG_SC2_PATH || DEFAULT_SC2_PATH);
  if (!existsSync(path.join(folder, "SC2Data"))) {
    throw new Error(`No StarCraft II install at ${folder} (it has no SC2Data folder): install the game, or name its folder with --sc2 <folder> or SC2_ASSET_CATALOG_SC2_PATH`);
  }
  return folder;
}
