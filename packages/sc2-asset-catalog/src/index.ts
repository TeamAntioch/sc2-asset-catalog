// @team-antioch/sc2-asset-catalog: StarCraft II doodads described in words, their Doodad Uses, the
// keyword search over them, the extractor that builds the game's own fields into the user's
// cache, and the built-in renderer that draws its reference sheets on macOS. Every module is also
// importable on its own, as @team-antioch/sc2-asset-catalog/catalog/<name>.js.

export { catalogCacheDir, catalogConfigDir, DOODAD_DESCRIPTIONS_PATH, DOODAD_USES_DIR, extractedDir, PACKAGE_DATA_DIR } from "./catalog/catalog-dirs.js";
export { type DoodadCatalogEntry, type DoodadDescription, type ExtractedDoodad, joinDoodadCatalog, parseDoodadDescriptions, readDoodadCatalog } from "./catalog/doodad-catalog.js";
export { type DoodadUse, parseDoodadUses, readDoodadUses } from "./catalog/doodad-uses.js";
export { missingDoodadDependencies, packageDependency, providesDependency } from "./catalog/doodad-dependencies.js";
export {
  allDoodadEntries,
  cachedStockDoodadSources,
  type DoodadSearch,
  type DoodadSearchQuery,
  type DoodadSearchResult,
  type DoodadSearchSources,
  forgetStockDoodadSources,
  lookUpDoodads,
  matchDoodads,
  type PictureFallback,
  readStockDoodadSources,
  searchDoodads,
  stockDoodadSourceFiles,
  type StockSourcesOptions,
} from "./catalog/doodad-search.js";
export { extractCatalog, type ExtractCatalogOptions, type ExtractedCatalog, hasExtractedCatalog } from "./catalog/extract-catalog.js";
export { type ModelRenderer, renderCatalogSheets } from "./catalog/render-thumbnails.js";
export { DEFAULT_SC2_PATH, findSc2, findViewer, setupRenderer, type SetupRendererOptions } from "./catalog/renderer-setup.js";
export { ModelNotFoundError, type RunViewer, whiteoutFlakesRenderer, type WhiteoutFlakesOptions } from "./catalog/whiteoutflakes.js";
export { type CatalogCliOptions, runCatalogCli } from "./cli.js";
