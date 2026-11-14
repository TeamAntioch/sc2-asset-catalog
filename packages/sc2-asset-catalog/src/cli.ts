// The catalog's CLI, `sc2-asset-catalog` (bin/sc2-asset-catalog.js runs it):
//
//   sc2-asset-catalog extract [--cache <folder>]
//     Builds the extracted fields (names, packages, categories, gallery pictures) from SC2GameData
//     into the cache folder (the platform's by default). The Doodad Finder does this on its first start.
//
//   sc2-asset-catalog extract-music [--cache <folder>]
//     Builds the music's extracted fields (every callable id, its files, dependency and where
//     Blizzard's scripts use it) from a mirror of the game's data into the cache folder. The Music
//     Finder does this on its first start.
//
//   sc2-asset-catalog setup-renderer [--cache <folder>]
//     macOS: checks for Xcode (with its Metal toolchain), Homebrew and ImageMagick, builds the
//     WhiteoutFlakes viewer into the cache folder and records where it is (renderer-setup.ts).
//
//   sc2-asset-catalog render [doodad ids…] [--viewer <app>] [--sc2 <folder>] [--renderer <module>] [--cache <folder>] [--jobs n] [--force]
//     Optional: draws each doodad from four angles and builds its reference sheet with ImageMagick's
//     montage. The built-in renderer (whiteoutflakes.ts) runs the viewer setup recorded, or the one
//     --viewer or SC2_ASSET_CATALOG_VIEWER names, on the StarCraft II install in --sc2,
//     SC2_ASSET_CATALOG_SC2_PATH or /Applications/StarCraft II. --renderer names a module whose
//     default export (a ModelRenderer, render-thumbnails.ts) draws instead.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { catalogCacheDir, catalogConfigDir, extractedDir } from "./catalog/catalog-dirs.js";
import { extractCatalog } from "./catalog/extract-catalog.js";
import { extractMusic } from "./catalog/extract-music.js";
import { type ModelRenderer, renderCatalogSheets } from "./catalog/render-thumbnails.js";
import { checkRenderPlatform, findSc2, findViewer, rendererDir, type SetupSystem, setupRenderer, thisMachine } from "./catalog/renderer-setup.js";
import { type RunViewer, whiteoutFlakesRenderer } from "./catalog/whiteoutflakes.js";
import { npxHint } from "./util/npx.js";

export const CATALOG_USAGE = [
  "Usage: sc2-asset-catalog extract [--cache <folder>]",
  "       sc2-asset-catalog extract-music [--cache <folder>]",
  "       sc2-asset-catalog setup-renderer [--cache <folder>]",
  "       sc2-asset-catalog render [doodad ids…] [--viewer <app>] [--sc2 <folder>] [--renderer <module>] [--cache <folder>] [--jobs n] [--force]",
].join("\n");

export type CatalogCliOptions = {
  /** Where relative paths are resolved from (the process's folder by default). */
  readonly cwd?: string;
  readonly log?: (line: string) => void;
  /** For tests: the fetch extraction uses, and what builds a sheet. */
  readonly fetch?: typeof globalThis.fetch;
  readonly montage?: (renders: readonly string[], sheet: string) => Promise<void>;
  /** For tests: the environment, platform and processor the config folder and the renderer are worked out for (this process's by default). */
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
  /** For tests: what runs the viewer, and the machine setup-renderer checks and builds on. */
  readonly runViewer?: RunViewer;
  readonly setupSystem?: SetupSystem;
};

/** A renderer module's default export, checked to be a ModelRenderer. */
async function loadRenderer(file: string): Promise<ModelRenderer> {
  const loaded = (await import(pathToFileURL(file).href)) as { default?: Partial<ModelRenderer> };
  if (typeof loaded.default?.render !== "function") throw new Error(`${file} has no default export with a render function (a ModelRenderer)`);
  return loaded.default as ModelRenderer;
}

export async function runCatalogCli(args: readonly string[], options: CatalogCliOptions = {}): Promise<void> {
  const log = options.log ?? ((line: string) => console.log(line));
  const cwd = options.cwd ?? process.cwd();
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      cache: { type: "string" },
      renderer: { type: "string" },
      viewer: { type: "string" },
      sc2: { type: "string" },
      jobs: { type: "string" },
      force: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const [command, ...ids] = positionals;
  if (values.help || command === undefined) return log(CATALOG_USAGE);
  const cacheDir = values.cache !== undefined ? path.resolve(cwd, values.cache) : catalogCacheDir({ platform, env });
  const configDir = catalogConfigDir({ platform, env });
  if (command === "extract") {
    await extractCatalog({ extractedDir: extractedDir(cacheDir), log, ...(options.fetch ? { fetch: options.fetch } : {}) });
    return;
  }
  if (command === "extract-music") {
    await extractMusic({ extractedDir: extractedDir(cacheDir), log, env, ...(options.fetch ? { fetch: options.fetch } : {}) });
    return;
  }
  if (command === "setup-renderer") {
    await setupRenderer({ cacheDir, configDir, log, system: options.setupSystem ?? { ...thisMachine, platform, arch } });
    log(`Set up: run \`${npxHint("@team-antioch/sc2-asset-catalog render", platform)}\` to render the sheets`);
    return;
  }
  if (command === "render") {
    let renderer: ModelRenderer;
    if (values.renderer !== undefined) renderer = await loadRenderer(path.resolve(cwd, values.renderer));
    else {
      checkRenderPlatform(platform, arch);
      const viewer = findViewer({ ...(values.viewer !== undefined ? { flag: path.resolve(cwd, values.viewer) } : {}), env, configDir });
      const sc2Path = findSc2({ ...(values.sc2 !== undefined ? { flag: path.resolve(cwd, values.sc2) } : {}), env });
      renderer = whiteoutFlakesRenderer({ viewer, sc2Path, workDir: rendererDir(cacheDir), ...(options.runViewer ? { run: options.runViewer } : {}) });
    }
    const workers = values.jobs !== undefined ? Number(values.jobs) : undefined;
    if (workers !== undefined && !(Number.isInteger(workers) && workers > 0)) throw new Error(`--jobs takes a whole number above 0\n${CATALOG_USAGE}`);
    const result = await renderCatalogSheets({
      renderer,
      cacheDir,
      log,
      ...(ids.length ? { ids } : {}),
      ...(workers !== undefined ? { workers } : {}),
      ...(values.force ? { force: true } : {}),
      ...(options.montage ? { montage: options.montage } : {}),
    });
    log(`${result.rendered} rendered, ${result.failed} failed, ${result.unchanged} unchanged; ${result.sheets} sheets built`);
    return;
  }
  throw new Error(`No command ${command}\n${CATALOG_USAGE}`);
}
