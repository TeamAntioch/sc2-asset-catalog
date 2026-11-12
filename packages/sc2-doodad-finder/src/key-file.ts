// Jev's key file: the TypeSafe key `sc2-doodad-finder login` saves, in the per-user config folder.
// That is %APPDATA%\sc2-asset-catalog on Windows and $XDG_CONFIG_HOME/sc2-asset-catalog (else
// ~/.config/sc2-asset-catalog) on macOS and Linux, or SC2_ASSET_CATALOG_CONFIG on any of them. Unlike
// the cache folder, it holds something that is not a copy of anything else. On POSIX the file is
// 0600, in a 0700 folder (a folder SC2_ASSET_CATALOG_CONFIG names is left as it is unless the save
// creates it). No OS credential manager is used.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { type CachePlatform, catalogConfigDir } from "@teamantioch/sc2-asset-catalog/catalog/catalog-dirs.js";

/** The platform, environment and home folder the config folder is worked out from, as for the cache folder. */
export type ConfigPlatform = CachePlatform;

/** This user's config folder (the catalog's, which `setup-renderer` also writes to): where the key file is kept. */
export const configDir = (on: ConfigPlatform = {}): string => catalogConfigDir(on);

/** The key file in the config folder. */
export const keyFile = (on: ConfigPlatform = {}): string => ((on.platform ?? process.platform) === "win32" ? path.win32 : path.posix).join(configDir(on), "typesafe-key");

/** The saved key, trimmed, or none when there is no file or it is blank. */
export function readKeyFile(on: ConfigPlatform = {}): string | undefined {
  let text: string;
  try {
    text = readFileSync(keyFile(on), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return text.trim() || undefined;
}

/** Saves the key whole: to a new file beside the key file, readable by its owner alone, then over it. */
export async function saveKeyFile(key: string, on: ConfigPlatform = {}): Promise<void> {
  const file = keyFile(on);
  const dir = path.dirname(file);
  const posix = (on.platform ?? process.platform) !== "win32";
  const created = await mkdir(dir, { recursive: true, mode: 0o700 });
  // The default folder is ours, so it is tightened; a folder SC2_ASSET_CATALOG_CONFIG names is the
  // user's, so only the file is.
  if (posix && (created !== undefined || !(on.env ?? process.env).SC2_ASSET_CATALOG_CONFIG)) await chmod(dir, 0o700);
  const partial = `${file}.${randomBytes(6).toString("hex")}.partial`;
  try {
    await writeFile(partial, `${key}\n`, { mode: 0o600, flag: "wx" });
    if (posix) await chmod(partial, 0o600);
    await rename(partial, file);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

/** Deletes the key file: true when there was one. */
export async function removeKeyFile(on: ConfigPlatform = {}): Promise<boolean> {
  try {
    await rm(keyFile(on));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
