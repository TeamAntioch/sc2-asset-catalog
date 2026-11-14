// @team-antioch/sc2-asset-catalog: StarCraft II doodads described in words, their Doodad Uses, the
// keyword search over them, the music's listening notes and their search, the extractors that build
// the game's own fields into the user's cache, and the built-in renderer that draws its reference sheets on macOS. Every module is also
// importable on its own, as @team-antioch/sc2-asset-catalog/catalog/<name>.js.

export { catalogCacheDir, catalogConfigDir, DOODAD_DESCRIPTIONS_PATH, DOODAD_USES_DIR, extractedDir, MUSIC_NOTES_PATH, PACKAGE_DATA_DIR } from "./catalog/catalog-dirs.js";
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
export {
  type ExtractedMusic,
  type ExtractedMusicCounts,
  type ExtractMusicOptions,
  extractMusic,
  hasExtractedMusic,
  MUSIC_EXTRACTED_FILE,
  MUSIC_EXTRACTED_INFO_FILE,
  type MusicUse,
  musicRole,
} from "./catalog/extract-music.js";
export {
  getMusicEntry,
  joinMusicCatalog,
  type MusicCatalog,
  type MusicEntry,
  type MusicMatch,
  type MusicQuery,
  musicEntriesPlaying,
  musicIdWords,
  parseMusicExtracted,
  type RatingRange,
  readMusicCatalog,
  searchMusic,
} from "./catalog/music-catalog.js";
export { MUSIC_NOTE_FIELDS, type MusicNote, MusicNoteSchema, type MusicSection, musicFileKey, parseMusicNotes, readMusicNotes } from "./catalog/music-notes.js";
export { type ModelRenderer, renderCatalogSheets } from "./catalog/render-thumbnails.js";
export { DEFAULT_SC2_PATH, findSc2, findViewer, setupRenderer, type SetupRendererOptions } from "./catalog/renderer-setup.js";
export { ModelNotFoundError, type RunViewer, whiteoutFlakesRenderer, type WhiteoutFlakesOptions } from "./catalog/whiteoutflakes.js";
export { type CatalogCliOptions, runCatalogCli } from "./cli.js";
