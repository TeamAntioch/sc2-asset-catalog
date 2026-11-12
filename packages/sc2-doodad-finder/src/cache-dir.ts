// The Finder keeps its files in the catalog's cache folder (catalogCacheDir, catalog-dirs.ts in
// @team-antioch/sc2-asset-catalog), on each platform where that platform keeps caches: %LOCALAPPDATA%
// on Windows, ~/Library/Caches on macOS, $XDG_CACHE_HOME (else ~/.cache) elsewhere, or
// SC2_ASSET_CATALOG_CACHE on any of them. It holds the extracted catalog fields, the embeddings
// model's weights, the card vectors, Jev's payload logs and the page's settings: all of it a copy
// of something else, safe to delete.

import path from "node:path";

import { type CachePlatform, catalogCacheDir } from "@team-antioch/sc2-asset-catalog/catalog/catalog-dirs.js";

export type { CachePlatform } from "@team-antioch/sc2-asset-catalog/catalog/catalog-dirs.js";

/** Where the model's weights are kept: $SC2_ASSET_CATALOG_MODEL_CACHE (or, for sc2-adjutant, $SC2_ADJUTANT_MODEL_CACHE), else the cache folder's models. */
export function modelCacheDir(on: CachePlatform = {}): string {
  const env = on.env ?? process.env;
  const moved = env.SC2_ASSET_CATALOG_MODEL_CACHE || env.SC2_ADJUTANT_MODEL_CACHE;
  if (moved) return moved;
  const dir = catalogCacheDir(on);
  return (on.platform ?? process.platform) === "win32" ? path.win32.join(dir, "models") : path.posix.join(dir, "models");
}
