// The keyword and facet search over the game's doodads (the stock catalog: the descriptions joined
// to the fields extracted into the cache, doodad-catalog.ts), any terrain objects a caller adds,
// and a layer of mod doodads laid over them (`modDoodads`, a caller's own). No embeddings: words
// match whole words, plurals and inflections included, in a candidate's name, id (split at its
// camel case), look and Doodad Uses, and the most words matched rank first. The Doodad Finder
// narrows each ask with it (docs/adr/0001).

import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

import { catalogCacheDir, DOODAD_DESCRIPTIONS_PATH, DOODAD_USES_DIR, extractedDir as extractedDirOf } from "./catalog-dirs.js";
import { DOODAD_EXTRACTED_FILE, type DoodadDescription, readDoodadCatalog } from "./doodad-catalog.js";
import {
  type DoodadFacing,
  type DoodadFacings,
  type DoodadPlacement,
  type DoodadSheetReadings,
  type FrontSource,
  frontFromPictures,
  getDoodadFacing,
  NO_SHEET_READINGS,
} from "./doodad-facings.js";
import { packageDependency, providesDependency } from "./doodad-dependencies.js";
import type { DoodadNote } from "./doodad-notes.js";
import { type SheetJob, sheetName, sheetPath, sheetRenders } from "./catalog-sheets.js";
import { type DoodadUse, mergeUses, readDoodadUses } from "./doodad-uses.js";
import { DOODADS_FILE, readDoodads } from "./doodads.js";

/** A game doodad as the search reads it: its doodad catalog entry (doodad-catalog.ts) and its model's variation count (the extracted doodads.json). */
export type SearchableDoodad = {
  readonly name?: string;
  readonly package?: string;
  readonly variations: number;
  /** The sc2-mapping-reference gallery picture's file name. */
  readonly image?: string;
  /** A 2×2 turntable sheet a caller's sources name, relative to the root; the stock catalog's are found where renderCatalogSheets builds them. */
  readonly sheet?: string;
  readonly description?: DoodadDescription;
  /** The tilesets the Editor lists it under, when it lists it under any. */
  readonly tilesets?: readonly string[];
  /** Its Doodad Uses, from data/doodad-uses/doodads/<id>.json (doodad-uses.ts). */
  readonly uses?: readonly DoodadUse[];
};

/** A terrain object as the search reads it, from a terrain-object catalog of the caller's (none ships with this package). */
export type SearchableTerrainObject = {
  readonly name?: string;
  readonly package: string;
  readonly model: string;
  readonly image?: string;
  readonly sheet?: string;
  /** The tileset it belongs to. */
  readonly tileset?: string;
  readonly description?: {
    readonly look: string;
    readonly kind: DoodadDescription["kind"];
    /** What it shapes, such as pit, ramp or bridge. */
    readonly use?: string;
    readonly story: readonly string[];
    readonly biome: readonly string[];
  };
  /** Its Doodad Uses, from a uses folder's terrain-objects/<id>.json (doodad-uses.ts). */
  readonly uses?: readonly DoodadUse[];
};

/**
 * A mod's doodad as the search reads it, laid over the stock catalogs: one of the mod's own, or a
 * game doodad the mod changed the look of, which it stands in for.
 */
export type SearchableModDoodad = {
  readonly name?: string | undefined;
  readonly description?: DoodadDescription | undefined;
  readonly uses?: readonly DoodadUse[] | undefined;
  readonly variations: number;
  /** Its turntable sheet's absolute path, when it has one: whether the file is on this machine is checked for the results returned. */
  readonly sheet?: string | undefined;
  /** No description has been written for its current model yet. */
  readonly pending?: true | undefined;
  /** Why it has no picture and won't get one. */
  readonly unpictured?: string | undefined;
};

/** The stock catalogs alone: the game's doodads and terrain objects, with their Doodad Uses. */
export type StockDoodadSources = Pick<DoodadSearchSources, "doodads" | "terrainObjects" | "root">;

export type DoodadSearchSources = {
  readonly doodads: Readonly<Record<string, SearchableDoodad>>;
  readonly terrainObjects: Readonly<Record<string, SearchableTerrainObject>>;
  /** Mod doodads laid over the stock catalogs, by id, in the order they're listed after them; one of a game doodad's id stands in for it. */
  readonly modDoodads?: ReadonlyMap<string, SearchableModDoodad> | undefined;
  /** The folder the catalogs' sheet and render paths are relative to: the cache folder, for the stock sources. */
  readonly root: string;
  /** Doodad Uses and look corrections laid over the catalog's, by doodad id (doodad-notes.ts). */
  readonly notes?: Readonly<Record<string, DoodadNote>>;
  /** Measured facings, which results carry; none by default. */
  readonly facings?: DoodadFacings | undefined;
  /** Fronts read from the catalog's sheets, which results carry where nothing is measured; none by default. */
  readonly readings?: DoodadSheetReadings | undefined;
  /**
   * Where else a picture file (a sheet or a render) may be when it isn't at its path under the root:
   * given that absolute path, another to look at, or undefined. None by default, so pictures are
   * looked for under the root only. A missing sheet whose renders are found so is built beside them.
   */
  readonly pictureFallback?: PictureFallback | undefined;
};

/** Another place to look for a picture file: see DoodadSearchSources' pictureFallback. */
export type PictureFallback = (file: string) => string | undefined;

export type DoodadSearchQuery = {
  /**
   * Words any of which a candidate's name, id, look or Doodad Uses must hold as a whole word, in any
   * plural or inflected form ("crate" finds crates, not crater); one ending in * matches the start
   * of a word ("stamp*" finds stamper); one of several words matches them in a row.
   */
  readonly words?: readonly string[] | undefined;
  readonly kind?: DoodadDescription["kind"] | undefined;
  /** Doodads only: terrain objects have no size. */
  readonly size?: DoodadDescription["size"] | undefined;
  /** Roles at least one of which the candidate has. Doodads only: terrain objects have no role. */
  readonly role?: readonly DoodadDescription["role"][] | undefined;
  /** Stories at least one of which the candidate has. */
  readonly story?: readonly string[] | undefined;
  /** Biomes at least one of which the candidate has; one for `any` biome fits every biome. */
  readonly biome?: readonly string[] | undefined;
  /** The SC2GameData package that defines it, such as `campaigns/void.sc2campaign`. */
  readonly package?: string | undefined;
  /** At most this many results (30 by default); `total` counts every match. */
  readonly limit?: number | undefined;
  /**
   * A map's dependencies: results they already bring in sort first, each marked `provided`.
   * Without them nothing is marked, and each result is only labelled with the dependency it needs.
   */
  readonly dependencies?: readonly string[] | undefined;
};

export type DoodadSearchSource = "doodad" | "terrain-object" | "mod";

/** A sheet's absolute path, a gallery picture's URL, or none. */
export type DoodadPicture = { readonly kind: "sheet"; readonly path: string } | { readonly kind: "image"; readonly url: string } | { readonly kind: "none" };

/** The sc2-mapping-reference gallery's doodad and terrain-object pictures, by the catalogs' `image` file name. */
export const DOODAD_GALLERY_URL = "https://raw.githubusercontent.com/TeamAntioch/sc2-mapping-reference/main/public/doodads";

export type DoodadSearchResult = {
  readonly id: string;
  readonly name: string;
  readonly source: DoodadSearchSource;
  readonly package?: string;
  /**
   * The map dependency its package needs (doodad-dependencies.ts), absent when the default
   * `Void (Mod)` brings it in, as it does the base mods' and a mod's own doodads.
   */
  readonly dependency?: string;
  /** For a search with a map's dependencies: whether they already bring it in. */
  readonly provided?: boolean;
  readonly description?: {
    readonly look: string;
    readonly kind?: string;
    readonly size?: string;
    readonly role?: string;
    readonly use?: string;
    readonly story?: readonly string[];
    readonly biome?: readonly string[];
    /** The state it is shown in, such as destroyed or abandoned, when its catalog entry gives one. */
    readonly state?: string;
    /** A terrain object's: what its look was written from (doodad, picture, render or unseen). */
    readonly seen?: string;
  };
  /** Its Doodad Uses: the catalog's (a mod doodad's own), then the notes', each phrase once whatever its case and spacing. */
  readonly uses: readonly DoodadUse[];
  /** The tilesets the Editor lists a game doodad under, or a terrain object's tileset. */
  readonly tilesets?: readonly string[];
  readonly variations: number;
  /**
   * A game doodad's facing: which way its front faces at rotation 0 and where it stands against a
   * wall. `source: "measured"` is from the sources' facings. `source: "sheet"` was read from its
   * catalog renders (the sources' readings): its front is sure only when `sure` and not
   * `diagonal`, and its placement and stand-off are suggestions. Absent when neither has a front,
   * and for a mod doodad.
   */
  readonly facing?: SearchFacing;
  /**
   * What to judge it from: its turntable sheet (variation 00 from four sides) when one is on this
   * machine, else its gallery picture (one angle), else none. A mod doodad's sheet is its own
   * (SearchableModDoodad); it has no gallery picture.
   */
  readonly picture: DoodadPicture;
  /** A mod doodad with no description written for its current model yet. */
  readonly pending?: true;
  /** Why a mod doodad has no picture and won't get one. */
  readonly unpictured?: string;
  /** Whether this machine has the four renders a sheet is built from (renderCatalogSheets, render-thumbnails.ts, makes both). */
  readonly hasRenders: boolean;
  /** How many of the query's words it matched. */
  readonly score: number;
};

export type DoodadSearch = { readonly results: readonly DoodadSearchResult[]; readonly total: number };

const DEFAULT_LIMIT = 30;

/** Splits an id at its camel case and digits, so `PortZionCrusherDoodad` reads as "Port Zion Crusher Doodad". */
export const idWords = (id: string): string => id.replace(/([a-z])([A-Z0-9])|([A-Z])([A-Z][a-z])|([0-9])([A-Za-z])/g, "$1$3$5 $2$4$6").replace(/_/g, " ");

/** A text's words, lower-cased: runs of letters and digits. */
const wordsOf = (text: string): string[] => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

const formsOf = new Map<string, ReadonlySet<string>>();

/**
 * A word's forms with a plural or inflection taken off: -s, -es (after s, x, z, ch or sh), -ies to
 * -y, -ed and -ing (each also with the e it dropped), a doubled last consonant undoubled. Each form
 * keeps at least three letters, and -ed and -ing come off only a stem of three, so short words
 * stand as they are (thing isn't the, seed isn't see, inns isn't in). Kept once worked out.
 */
function baseForms(word: string): ReadonlySet<string> {
  const known = formsOf.get(word);
  if (known) return known;
  const forms = new Set([word]);
  const add = (form: string) => {
    if (form.length < 3) return;
    forms.add(form);
    // stopped, stopping: stop.
    if (form.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(form) && !/(ss|ll|zz)$/.test(form)) forms.add(form.slice(0, -1));
  };
  if (word.endsWith("ies")) add(`${word.slice(0, -3)}y`);
  if (/(s|x|z|ch|sh)es$/.test(word)) add(word.slice(0, -2));
  if (word.endsWith("s") && !word.endsWith("ss")) add(word.slice(0, -1));
  const stem = word.endsWith("ed") ? word.slice(0, -2) : word.endsWith("ing") ? word.slice(0, -3) : undefined;
  if (stem !== undefined && stem.length >= 3) {
    add(stem);
    add(`${stem}e`);
  }
  formsOf.set(word, forms);
  return forms;
}

const sameWord = (forms: ReadonlySet<string>, word: string): boolean => {
  if (forms.has(word)) return true;
  for (const form of baseForms(word)) if (forms.has(form)) return true;
  return false;
};

/**
 * A query word as a test of a text's words: a whole word, in any of its plural and inflected forms
 * ("crate" finds crates, not crater; "press" finds presses and pressed). A word ending in * matches
 * the start of a word instead ("hydra*" finds hydraulic). A word of several words matches them in a
 * row. One with no letters or digits matches nothing; an empty one is no word at all.
 */
function wordMatcher(query: string): ((text: readonly string[]) => boolean) | undefined {
  if (!query.trim()) return undefined;
  const prefix = query.trimEnd().endsWith("*");
  const parts = wordsOf(query);
  if (parts.length === 0) return () => false;
  const last = parts.length - 1;
  const forms = parts.map(baseForms);
  const matches = (part: number, word: string) => (prefix && part === last ? word.startsWith(parts[part]!) : sameWord(forms[part]!, word));
  return (text) => text.some((_, start) => start + last < text.length && parts.every((__, part) => matches(part, text[start + part]!)));
}

/** Where the stock sources come from: all but `cacheDir` default to it or to this package's data. */
export type StockSourcesOptions = {
  /** The cache folder: the extracted fields' folder, and the root sheets and renders are found under (the platform's by default). */
  readonly cacheDir?: string;
  /** The extracted fields' folder (the cache folder's extracted/ by default). */
  readonly extractedDir?: string;
  /** The descriptions file (this package's by default). */
  readonly descriptionsFile?: string;
  /** The Doodad Uses folder (this package's by default). */
  readonly usesDir?: string;
  /** Terrain objects to search beside the doodads, by id; none by default. */
  readonly terrainObjects?: Readonly<Record<string, SearchableTerrainObject>>;
  /** Measured facings and sheet readings for the results to carry; none by default. */
  readonly facings?: DoodadFacings;
  readonly readings?: DoodadSheetReadings;
  /** Where else to look for pictures (DoodadSearchSources' pictureFallback); none by default. */
  readonly pictureFallback?: PictureFallback;
};

/** The extracted fields' folder for some options. */
const extractedOf = (options: StockSourcesOptions): string => options.extractedDir ?? extractedDirOf(options.cacheDir ?? catalogCacheDir());

/** The files and folders the stock sources are read from: the descriptions, the extracted fields and the Doodad Uses. A process that keeps running watches these. */
export function stockDoodadSourceFiles(options: StockSourcesOptions = {}): string[] {
  const extracted = extractedOf(options);
  return [options.descriptionsFile ?? DOODAD_DESCRIPTIONS_PATH, path.join(extracted, DOODAD_EXTRACTED_FILE), path.join(extracted, DOODADS_FILE), options.usesDir ?? DOODAD_USES_DIR];
}

/** The stock sources, as readStockDoodadSources and cachedStockDoodadSources give them. */
export type ReadStockSources = StockDoodadSources & Pick<DoodadSearchSources, "facings" | "readings" | "pictureFallback">;

/**
 * The stock catalog read afresh: the game's doodads (the descriptions joined to the extracted
 * fields, each with its model's variation count) and any terrain objects given, with their Doodad
 * Uses, to search alone or with mod doodads and notes laid over them. Throws, saying to extract,
 * when the extracted fields aren't there.
 *
 * Each call gives new sources, and a search works out its candidates once per sources object, so a
 * caller searching again and again keeps the sources it read (as the Doodad Finder does, reading
 * them again when a file changes) or calls cachedStockDoodadSources.
 */
export function readStockDoodadSources(options: StockSourcesOptions = {}): ReadStockSources {
  const extracted = extractedOf(options);
  const { catalog } = readDoodadCatalog(extracted, options.descriptionsFile);
  const variations = new Map(Object.entries(readDoodads(extracted)).map(([id, info]) => [id, info.variations]));
  const uses = readDoodadUses(options.usesDir ?? DOODAD_USES_DIR);
  const withUses = <T extends object>(kind: keyof typeof uses, id: string, entry: T): T => (Object.hasOwn(uses[kind], id) ? { ...entry, uses: uses[kind][id] } : entry);
  const doodads = Object.fromEntries(
    Object.entries(catalog as Record<string, Omit<SearchableDoodad, "variations">>).map(([id, entry]) => [id, withUses("doodad", id, { ...entry, variations: variations.get(id) ?? 1 })]),
  );
  const terrainObjects = Object.fromEntries(Object.entries(options.terrainObjects ?? {}).map(([id, entry]) => [id, withUses("terrain-object", id, entry)]));
  return {
    doodads,
    terrainObjects,
    root: options.cacheDir ?? path.dirname(extracted),
    ...(options.facings ? { facings: options.facings } : {}),
    ...(options.readings ? { readings: options.readings } : {}),
    ...(options.pictureFallback ? { pictureFallback: options.pictureFallback } : {}),
  };
}

type CachedSources = { readonly options: StockSourcesOptions; readonly sources: ReadStockSources };

/** The stock sources read so far, by the files they were read from. */
const cachedSources = new Map<string, CachedSources>();

/**
 * The stock sources as readStockDoodadSources reads them, read once per set of files and option
 * objects (the same terrainObjects, facings, readings and pictureFallback), so searches over them
 * reuse their worked-out candidates. They aren't read again when the files change: a caller that
 * watches the files (stockDoodadSourceFiles) calls forgetStockDoodadSources when one does.
 */
export function cachedStockDoodadSources(options: StockSourcesOptions = {}): ReadStockSources {
  const key = JSON.stringify([...stockDoodadSourceFiles(options), options.cacheDir ?? ""].map((file) => path.resolve(file)));
  const known = cachedSources.get(key);
  const same = known && (["terrainObjects", "facings", "readings", "pictureFallback"] as const).every((name) => known.options[name] === options[name]);
  if (known && same) return known.sources;
  const sources = readStockDoodadSources(options);
  cachedSources.set(key, { options, sources });
  return sources;
}

/** Forgets the stock sources cachedStockDoodadSources read, so the next call reads them again. */
export function forgetStockDoodadSources(): void {
  cachedSources.clear();
}

/** A candidate before its notes are merged and its picture looked for. */
type Candidate = Omit<DoodadSearchResult, "picture" | "hasRenders" | "score" | "dependency" | "provided"> & {
  readonly image?: string | undefined;
  /** The sheet its catalog entry names, relative to the root. */
  readonly sheet?: string | undefined;
  /** Where the sheet builder puts its sheet, relative to the root; none for a mod doodad. */
  readonly builtSheet?: string | undefined;
  /** The four renders a sheet is built from, relative to the root; none for a mod doodad. */
  readonly renders: readonly string[];
};

export type SearchFacing = Omit<DoodadFacing, "measured" | "note" | "placement"> & {
  readonly placement?: DoodadPlacement;
  readonly source: FrontSource;
  /** The reader was sure of a sheet reading's front. */
  readonly sure?: boolean;
  /** A sheet front seen face-on in one picture: a diagonal, which the dressing doesn't turn by. */
  readonly diagonal?: true;
};

const facingOf = (id: string, sources: Pick<DoodadSearchSources, "facings" | "readings">): { facing?: SearchFacing } => {
  const known = sources.facings ? getDoodadFacing(id, sources.facings) : undefined;
  if (known) {
    const { measured: _measured, note: _note, ...facing } = known;
    return { facing: { ...facing, source: "measured" } };
  }
  const reading = (sources.readings ?? NO_SHEET_READINGS).doodads[id];
  const front = reading ? frontFromPictures(reading.faces) : undefined;
  if (!reading || front === undefined) return {};
  return {
    facing: {
      front,
      ...(reading.placement ? { placement: reading.placement } : {}),
      ...(reading.standOff !== undefined ? { standOff: reading.standOff } : {}),
      source: "sheet",
      sure: reading.sure,
      ...(reading.faces.length === 1 ? { diagonal: true as const } : {}),
    },
  };
};

const doodadCandidate = (id: string, doodad: SearchableDoodad, sources: Pick<DoodadSearchSources, "facings" | "readings">): Candidate => {
  const name = sheetName("doodad", id);
  return {
    id,
    name: doodad.name?.trim() || id,
    source: "doodad",
    ...(doodad.package ? { package: doodad.package } : {}),
    ...(doodad.description ? { description: doodad.description } : {}),
    uses: doodad.uses ?? [],
    ...(doodad.tilesets?.length ? { tilesets: doodad.tilesets } : {}),
    variations: doodad.variations,
    ...facingOf(id, sources),
    image: doodad.image,
    sheet: doodad.sheet,
    builtSheet: sheetPath("doodad", name),
    renders: sheetRenders("doodad", name),
  };
};

const terrainObjectCandidate = (id: string, object: SearchableTerrainObject): Candidate => {
  // Terrain objects of one model share its renders and its sheet.
  const name = sheetName("terrain-object", id, object.model);
  return {
    id,
    name: object.name?.trim() || id,
    source: "terrain-object",
    package: object.package,
    ...(object.description ? { description: object.description } : {}),
    uses: object.uses ?? [],
    ...(object.tileset ? { tilesets: [object.tileset] } : {}),
    variations: 1,
    image: object.image,
    sheet: object.sheet,
    builtSheet: sheetPath("terrain-object", name),
    renders: sheetRenders("terrain-object", name),
  };
};

/** A mod doodad. Whether its sheet is on this machine is checked for the results returned (sheetHere). */
const modCandidate = (id: string, doodad: SearchableModDoodad): Candidate => ({
  id,
  name: doodad.name?.trim() || id,
  source: "mod",
  ...(doodad.description ? { description: doodad.description } : {}),
  uses: doodad.uses ?? [],
  variations: doodad.variations,
  ...(doodad.sheet !== undefined ? { sheet: doodad.sheet } : {}),
  renders: [],
  ...(doodad.pending ? { pending: true as const } : {}),
  ...(doodad.unpictured !== undefined ? { unpictured: doodad.unpictured } : {}),
});

/** Where the sources look for pictures: their root, and their pictureFallback when they have one. */
type PictureSearch = Pick<DoodadSearchSources, "root" | "pictureFallback">;

/**
 * The sheet a candidate has on this machine, by its real path: its catalog entry's, else the one the
 * sheet builder made. Real, so a page linking it still finds it when the sheets folder it was
 * found through is a link that goes away.
 */
const sheetHere = (candidate: Pick<Candidate, "sheet" | "builtSheet">, search: PictureSearch): string | undefined => {
  const found = [candidate.sheet, candidate.builtSheet].map((file) => (file ? pictureFile(search, file) : undefined)).find((file) => file !== undefined);
  return found && realpathSync(found);
};

/** A picture file (a sheet or a render) relative to the root, where it is: under the root, else where the pictureFallback says. */
function pictureFile({ root, pictureFallback }: PictureSearch, file: string): string | undefined {
  const here = path.resolve(root, file);
  if (existsSync(here)) return here;
  const there = pictureFallback?.(here);
  return there !== undefined && existsSync(there) ? there : undefined;
}

/** A picture's four renders where they all are, under the root or where the pictureFallback says; undefined unless all four are in one place. */
function rendersHere({ root, pictureFallback }: PictureSearch, renders: readonly string[]): string[] | undefined {
  if (renders.length === 0) return undefined;
  const here = renders.map((file) => path.resolve(root, file));
  if (here.every((file) => existsSync(file))) return here;
  if (!pictureFallback) return undefined;
  const there = here.map(pictureFallback);
  return there.every((file): file is string => file !== undefined && existsSync(file)) ? there : undefined;
}

/** The candidate for an id: a mod doodad, which stands in for a game doodad of its id, else a game doodad, else a terrain object. */
function candidateOf(id: string, sources: DoodadSearchSources): Candidate | undefined {
  const mod = sources.modDoodads?.get(id);
  if (mod) return modCandidate(id, mod);
  if (Object.hasOwn(sources.doodads, id)) return doodadCandidate(id, sources.doodads[id]!, sources);
  if (Object.hasOwn(sources.terrainObjects, id)) return terrainObjectCandidate(id, sources.terrainObjects[id]!);
  return undefined;
}

function* allCandidates(sources: DoodadSearchSources): Generator<Candidate> {
  const mod = sources.modDoodads ?? new Map<string, SearchableModDoodad>();
  for (const [id, doodad] of Object.entries(sources.doodads)) if (!mod.has(id)) yield doodadCandidate(id, doodad, sources);
  for (const [id, object] of Object.entries(sources.terrainObjects)) yield terrainObjectCandidate(id, object);
  for (const [id, doodad] of mod) yield modCandidate(id, doodad);
}

/** A candidate with the notes merged in and its dependency labelled, still unpictured. */
type Noted = Omit<Candidate, "description"> & Pick<DoodadSearchResult, "description" | "dependency" | "provided">;

function withNotes(candidate: Candidate, sources: DoodadSearchSources, have: readonly string[] | undefined): Noted {
  return markProvided(withNotesUnmarked(candidate, sources), have);
}

/** Marks a candidate `provided` or not by a map's dependencies; with none, unmarked. */
function markProvided(noted: Noted, have: readonly string[] | undefined): Noted {
  if (!have) return noted;
  return { ...noted, provided: noted.dependency === undefined || providesDependency(have, noted.dependency) };
}

/** A candidate searched for, ready to match: its words by field and every base form of them. */
type Prepared = { readonly noted: Noted; readonly fields: readonly (readonly string[])[]; readonly forms: ReadonlySet<string> };

/** Each source's candidates ready to match, worked out at its first search: a search reads its sources as unchanging. */
const prepared = new WeakMap<DoodadSearchSources, readonly Prepared[]>();

function preparedCandidates(sources: DoodadSearchSources): readonly Prepared[] {
  const known = prepared.get(sources);
  if (known) return known;
  const list = [...allCandidates(sources)].map((candidate): Prepared => {
    const noted = withNotesUnmarked(candidate, sources);
    // Fields apart, so a phrase never runs from one into the next.
    const fields = [noted.name, noted.id, idWords(noted.id), noted.description?.look ?? "", noted.description?.use ?? "", ...noted.uses.map(({ use }) => use)].map(wordsOf);
    const forms = new Set<string>();
    for (const field of fields) for (const word of field) for (const form of baseForms(word)) forms.add(form);
    return { noted, fields, forms };
  });
  prepared.set(sources, list);
  return list;
}

/**
 * A query of one whole word, as the forms it matches a text's word by: a text holds it when any
 * of the forms is among the base forms of the text's words (sameWord). Undefined for a phrase, a
 * prefix (word*) or no word, which are matched against the fields.
 */
function singleWordForms(query: string): ReadonlySet<string> | undefined {
  if (query.trimEnd().endsWith("*")) return undefined;
  const parts = wordsOf(query);
  return parts.length === 1 ? baseForms(parts[0]!) : undefined;
}

const hasAny = (set: ReadonlySet<string>, values: ReadonlySet<string>): boolean => {
  for (const value of values) if (set.has(value)) return true;
  return false;
};

/** A candidate with the notes merged in and its dependency labelled, not yet marked for a map's dependencies. */
function withNotesUnmarked({ description: catalogDescription, ...candidate }: Candidate, sources: DoodadSearchSources): Noted {
  const note = sources.notes?.[candidate.id];
  // A mod doodad's own description wins: a look the notes gave it before it had one gives way.
  const look = candidate.source === "mod" && catalogDescription ? catalogDescription.look : (note?.look ?? catalogDescription?.look);
  const description = look !== undefined ? { ...catalogDescription, look } : undefined;
  const uses = mergeUses(candidate.uses, note?.uses);
  const dependency = candidate.package ? packageDependency(candidate.package) : undefined;
  return { ...candidate, ...(description ? { description } : {}), uses, ...(dependency ? { dependency } : {}) };
}

/** What to judge a candidate from: its sheet when one is here, else its gallery picture, else none. */
function pictureOf(candidate: Pick<Candidate, "sheet" | "builtSheet" | "image">, search: PictureSearch): DoodadPicture {
  const sheet = sheetHere(candidate, search);
  return sheet ? { kind: "sheet", path: sheet } : candidate.image ? { kind: "image", url: `${DOODAD_GALLERY_URL}/${encodeURIComponent(candidate.image)}` } : { kind: "none" };
}

/** The candidate's picture and whether its renders are here, which only the results returned need. */
function pictured({ sheet, builtSheet, image, renders, ...result }: Noted, search: PictureSearch, score: number): DoodadSearchResult {
  const hasRenders = rendersHere(search, renders) !== undefined;
  return { ...result, picture: pictureOf({ sheet, builtSheet, image }, search), hasRenders, score };
}

/**
 * Doodads, terrain objects and mod doodads matching a query: with a map's dependencies, the ones
 * they bring in first; then the most words matched; then by id. A mod doodad matches on
 * its own description and Doodad Uses as a game doodad does on the catalog's, still marked pending
 * while they were written for an earlier model; one with no description matches by its name and
 * id alone, and never when the query has a facet.
 */
export function searchDoodads(query: DoodadSearchQuery, sources: DoodadSearchSources): DoodadSearch {
  const found = matched(query, sources);
  const results = found.slice(0, query.limit ?? DEFAULT_LIMIT).map(({ score, ...noted }) => pictured(noted, sources, score));
  return { results, total: found.length };
}

/** A keyword match, unpictured: what the Doodad Finder's narrowing reads. */
export type DoodadMatch = DoodadEntry & { readonly score: number };

/**
 * Every match of a query, in searchDoodads's order but uncut and unpictured, so no file is looked
 * for: the Doodad Finder filters them by its pinned tags before it takes its hundred (docs/adr/0001).
 * The query's limit is ignored.
 */
export function matchDoodads(query: DoodadSearchQuery, sources: DoodadSearchSources): DoodadMatch[] {
  return matched(query, sources).map(({ sheet: _sheet, builtSheet: _builtSheet, image: _image, renders: _renders, ...match }) => match);
}

/** Every match of a query, sorted: with a map's dependencies, the ones they bring in first; then the most words matched; then by id. */
function matched(query: DoodadSearchQuery, sources: DoodadSearchSources): (Noted & { readonly score: number })[] {
  const words = (query.words ?? []).flatMap((word) => {
    const matches = wordMatcher(word);
    return matches ? [{ matches, forms: singleWordForms(word) }] : [];
  });
  // The catalogs' stories and biomes are lower-case.
  const stories = query.story?.map((story) => story.toLowerCase());
  const biomes = query.biome?.map((biome) => biome.toLowerCase());
  const facets = (description: DoodadSearchResult["description"]): boolean => {
    if (query.kind && description?.kind !== query.kind) return false;
    if (query.size && description?.size !== query.size) return false;
    if (query.role?.length && !(description?.role !== undefined && query.role.includes(description.role as DoodadDescription["role"]))) return false;
    if (stories?.length && !description?.story?.some((story) => stories.includes(story))) return false;
    if (biomes?.length && !description?.biome?.some((biome) => biome === "any" || biomes.includes(biome))) return false;
    return true;
  };
  const found: (Noted & { readonly score: number })[] = [];
  for (const { noted: unmarked, fields, forms } of preparedCandidates(sources)) {
    const { description } = unmarked;
    if (!facets(description)) continue;
    if (query.package && unmarked.package !== query.package) continue;
    const score = words.filter((word) => (word.forms ? hasAny(forms, word.forms) : fields.some(word.matches))).length;
    if (words.length > 0 && score === 0) continue;
    found.push({ ...markProvided(unmarked, query.dependencies), score });
  }

  found.sort((a, b) => Number(b.provided ?? false) - Number(a.provided ?? false) || b.score - a.score || a.id.localeCompare(b.id));
  return found;
}

/** A doodad, terrain object or mod doodad as a search describes it, before it is pictured. */
export type DoodadEntry = Omit<DoodadSearchResult, "picture" | "hasRenders" | "score">;

/**
 * Every doodad, terrain object and mod doodad a search could find, with the notes merged in and,
 * with a map's dependencies, each marked `provided` or not; unpictured, so no file is looked for.
 * The Doodad Finder builds its cards from these (docs/adr/0001).
 */
export function* allDoodadEntries(sources: DoodadSearchSources, dependencies?: readonly string[]): Generator<DoodadEntry> {
  for (const candidate of allCandidates(sources)) {
    const { sheet: _sheet, builtSheet: _builtSheet, image: _image, renders: _renders, ...entry } = withNotes(candidate, sources, dependencies);
    yield entry;
  }
}

/**
 * Each id's result as a search would give it (score 0), in the order asked, for a page's cards;
 * ids no catalog has are left out. With a map's dependencies, each is marked `provided` or not.
 */
export function lookUpDoodads(ids: Iterable<string>, sources: DoodadSearchSources, dependencies?: readonly string[]): Map<string, DoodadSearchResult> {
  const found = new Map<string, DoodadSearchResult>();
  for (const id of ids) {
    const candidate = found.has(id) ? undefined : candidateOf(id, sources);
    if (candidate) found.set(id, pictured(withNotes(candidate, sources, dependencies), sources, 0));
  }
  return found;
}

/**
 * Each id's picture as lookUpDoodads gives it, and nothing else, so no renders are looked for: what
 * a page showing cards needs. Ids no catalog has are left out.
 */
export function doodadPictures(ids: Iterable<string>, sources: DoodadSearchSources): Map<string, DoodadPicture> {
  const found = new Map<string, DoodadPicture>();
  for (const id of ids) {
    const candidate = found.has(id) ? undefined : candidateOf(id, sources);
    if (candidate) found.set(id, pictureOf(candidate, sources));
  }
  return found;
}

/** A sheet some candidates could have: its renders are here and it isn't (absolute paths). */
export type MissingSheet = SheetJob & { readonly ids: readonly string[] };

/** The sheets the given candidates lack though their four renders are here, one per sheet (terrain objects of one model share theirs), in the order asked. */
export function missingSheets(ids: Iterable<string>, sources: DoodadSearchSources): MissingSheet[] {
  const at = (file: string) => path.resolve(sources.root, file);
  const missing = new Map<string, { ids: string[]; renders: string[]; sheet: string }>();
  for (const id of new Set(ids)) {
    const candidate = candidateOf(id, sources);
    if (!candidate?.builtSheet) continue;
    const sheet = at(candidate.builtSheet);
    const known = missing.get(sheet);
    if (known) {
      known.ids.push(id);
      continue;
    }
    if (sheetHere(candidate, sources)) continue;
    const renders = rendersHere(sources, candidate.renders);
    if (!renders) continue;
    // A sheet built from renders found elsewhere goes beside them.
    const builtSheet = renders[0] === at(candidate.renders[0]!) ? sheet : (sources.pictureFallback?.(sheet) ?? sheet);
    missing.set(sheet, { ids: [id], renders, sheet: builtSheet });
  }
  return [...missing.values()];
}
