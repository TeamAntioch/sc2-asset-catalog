// What the Finder searches by default: the stock catalog (the shipped descriptions and Doodad Uses
// joined to the fields extracted into the cache folder), read afresh on each change, and the files
// whose changes write the cards again. On a first start the catalog is extracted (ensureCatalog).

import { mkdirSync } from "node:fs";
import path from "node:path";

import { extractedDir } from "@team-antioch/sc2-asset-catalog/catalog/catalog-dirs.js";
import { SHEET_FOLDERS } from "@team-antioch/sc2-asset-catalog/catalog/catalog-sheets.js";
import { type DoodadSearchSources, readStockDoodadSources, stockDoodadSourceFiles } from "@team-antioch/sc2-asset-catalog/catalog/doodad-search.js";
import { extractCatalog, type FetchOptions, hasExtractedCatalog } from "@team-antioch/sc2-asset-catalog/catalog/extract-catalog.js";
import { npxHint } from "@team-antioch/sc2-asset-catalog/util/npx.js";

/** What the cards are made from, read afresh on each change, and the files whose changes write them again. */
export type FinderSources = { readonly load: () => Promise<DoodadSearchSources>; readonly watch: readonly string[] };

/**
 * The stock catalog in a cache folder. Its sheets folder is watched too (made, if it isn't there, so
 * it can be), so sheets rendered or removed while the Finder runs show on its cards.
 */
export function stockSources(cacheDir: string): FinderSources {
  const sheets = path.join(cacheDir, SHEET_FOLDERS.doodad.sheets);
  mkdirSync(sheets, { recursive: true });
  return { load: async () => readStockDoodadSources({ cacheDir }), watch: [...stockDoodadSourceFiles({ cacheDir }), sheets] };
}

/**
 * Extracts the catalog into the cache folder unless it holds an extraction already. A failure says
 * to run the extract command once there is a connection.
 */
export async function ensureCatalog(cacheDir: string, { log = () => {}, ...fetching }: Pick<FetchOptions, "fetch" | "listGitTree" | "log"> = {}): Promise<void> {
  const dir = extractedDir(cacheDir);
  if (hasExtractedCatalog(dir)) return;
  log(`Extracting the catalog from SC2GameData into ${dir} (once; about a minute)`);
  try {
    await extractCatalog({ extractedDir: dir, log, ...fetching });
  } catch (error) {
    throw new Error(
      `Couldn't extract the catalog: ${(error as Error).message}. Check the connection, then run ${npxHint("@team-antioch/sc2-doodad-finder extract")} (or sc2-doodad-finder extract, where it is installed)`,
      { cause: error },
    );
  }
}
