// Where the catalog's files are. What we wrote ships in this package's data/: the doodad
// descriptions, the Doodad Uses and the music's listening notes (CC BY 4.0, LICENSE-DATA). What is extracted from the game is
// never shipped: `extract` builds it from SC2GameData into the user's cache folder, which is
// where each platform keeps caches: %LOCALAPPDATA% on Windows, ~/Library/Caches on macOS,
// $XDG_CACHE_HOME (else ~/.cache) elsewhere, or SC2_ASSET_CATALOG_CACHE on any of them.
// Everything in the cache folder is a copy of something else, safe to delete. The per-user config
// folder holds what isn't: the Finder's saved Jev key, and where `setup-renderer` built the viewer.

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** This package's data/: the descriptions and the Doodad Uses. */
export const PACKAGE_DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));

/** The hand-written descriptions, keyed by doodad id. */
export const DOODAD_DESCRIPTIONS_PATH = path.join(PACKAGE_DATA_DIR, "doodad-descriptions.json");

/** The listening notes for the game's music files, keyed by file base name (music-notes.ts). */
export const MUSIC_NOTES_PATH = path.join(PACKAGE_DATA_DIR, "music-notes.json");

/** The Doodad Uses, one file per doodad under doodads/. */
export const DOODAD_USES_DIR = path.join(PACKAGE_DATA_DIR, "doodad-uses");

/** The cache folder's own name inside the platform's caches. */
const APP = "sc2-asset-catalog";

export type CachePlatform = {
  readonly platform?: NodeJS.Platform;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly home?: string;
};

/** This machine's cache folder: the extracted fields, and the Finder's model, vectors and logs. */
export function catalogCacheDir({ platform = process.platform, env = process.env, home = os.homedir() }: CachePlatform = {}): string {
  if (env.SC2_ASSET_CATALOG_CACHE) return env.SC2_ASSET_CATALOG_CACHE;
  if (platform === "win32") return path.win32.join(env.LOCALAPPDATA || path.win32.join(home, "AppData", "Local"), APP);
  if (platform === "darwin") return path.posix.join(home, "Library", "Caches", APP);
  return path.posix.join(env.XDG_CACHE_HOME || path.posix.join(home, ".cache"), APP);
}

/**
 * This user's config folder: %APPDATA% on Windows, $XDG_CONFIG_HOME (else ~/.config) on macOS and
 * Linux, or SC2_ASSET_CATALOG_CONFIG on any of them.
 */
export function catalogConfigDir({ platform = process.platform, env = process.env, home = os.homedir() }: CachePlatform = {}): string {
  if (env.SC2_ASSET_CATALOG_CONFIG) return env.SC2_ASSET_CATALOG_CONFIG;
  if (platform === "win32") return path.win32.join(env.APPDATA || path.win32.join(home, "AppData", "Roaming"), APP);
  return path.posix.join(env.XDG_CONFIG_HOME || path.posix.join(home, ".config"), APP);
}

/** The folder in a cache folder that `extract` writes the extracted fields to. */
export const extractedDir = (cacheDir: string = catalogCacheDir()): string => path.join(cacheDir, "extracted");
