// Extracting the catalog's fields into the user's cache (docs/adr/0001): nothing taken from the game
// ships with this package, so on first start (or with the `extract` command) these are built from
// SC2Mapster's SC2GameData on GitHub and the sc2-mapping-reference gallery's file list, with no SC2
// install needed. Each file is fetched once, all of them at once:
//
//   doodads.json           every doodad's rough kind, Editor categories, tilesets, variations and
//                          whether it blocks ground (extract-doodads.ts)
//   doodad-models.json     each doodad's model file in the game's storage, for rendering
//   doodad-extracted.json  each doodad's package, Editor name, gallery picture, the doodads sharing
//                          that picture, and whether its description was written from a render
//   extracted.json         when and from where they were extracted
//
// The descriptions are joined to doodad-extracted.json by id (doodad-catalog.ts).

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { writeWhole } from "../util/write-whole.js";
import { DOODAD_DESCRIPTIONS_PATH, extractedDir as extractedDirOf } from "./catalog-dirs.js";
import { DOODAD_EXTRACTED_FILE, type ExtractedDoodad, parseDoodadDescriptions } from "./doodad-catalog.js";
import { DOODAD_MODELS_FILE, DOODADS_FILE, type DoodadInfo } from "./doodads.js";
import {
  type Entry,
  extractDoodads,
  type GameDataPackage,
  readEntries,
  resolve,
  resolveTokens,
  SC2_GAME_DATA_PACKAGES,
  SC2_GAME_DATA_URL,
  stripXmlComments,
} from "./extract-doodads.js";

/** The file saying when and from where the catalog was extracted. */
export const EXTRACTED_INFO_FILE = "extracted.json";

/** The sc2-mapping-reference gallery's file list, from GitHub's API. */
export const GALLERY_TREE_URL = "https://api.github.com/repos/TeamAntioch/sc2-mapping-reference/git/trees/main?recursive=1";

/** The gallery's repository, which git lists when the API refuses. */
export const GALLERY_GIT_URL = "https://github.com/TeamAntioch/sc2-mapping-reference.git";

/** The gallery's folder of doodad pictures in sc2-mapping-reference. */
const GALLERY_FOLDER = "public/doodads/";

/** One package's files, as extractDoodads reads them, with its English object strings. */
export type FetchedPackage = GameDataPackage & { readonly objectStrings?: string };

/** Lists a repository's files under `folder` (its paths from the top, `folder` included). */
export type ListGitTree = (url: string, folder: string) => Promise<string[]>;

export type FetchOptions = {
  /** The fetch to use (the global one by default); tests pass a fake. */
  readonly fetch?: typeof globalThis.fetch;
  /** What lists the gallery's files when GitHub's API refuses (git, by default); tests pass a fake. */
  readonly listGitTree?: ListGitTree;
  /** The SC2GameData packages, in load order (SC2_GAME_DATA_PACKAGES by default). */
  readonly packages?: readonly string[];
  readonly log?: (line: string) => void;
};

/** A file's text; undefined when it isn't there (404). Throws naming the file on any other failure. */
async function fetchText(fetch: typeof globalThis.fetch, url: string, shown: string): Promise<string | undefined> {
  const response = await fetch(url);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`${shown}: HTTP ${response.status}`);
  return response.text();
}

/** Each package's ActorData, ModelData and FootprintData and its English ObjectStrings, every file at once, the packages kept in load order. */
export async function fetchGameData({ fetch = globalThis.fetch, packages = SC2_GAME_DATA_PACKAGES, log = () => {} }: FetchOptions = {}): Promise<FetchedPackage[]> {
  return Promise.all(packages.map(async (name): Promise<FetchedPackage> => {
    const data = (file: string) => fetchText(fetch, `${SC2_GAME_DATA_URL}/${name}/base.sc2data/GameData/${file}.xml`, `${name} ${file}.xml`);
    const [actorData, modelData, footprintData, objectStrings] = await Promise.all([
      data("ActorData"),
      data("ModelData"),
      data("FootprintData"),
      fetchText(fetch, `${SC2_GAME_DATA_URL}/${name}/enus.sc2data/LocalizedData/ObjectStrings.txt`, `${name} ObjectStrings.txt`),
    ]);
    log(`Fetched ${name}`);
    return {
      name,
      ...(actorData !== undefined ? { actorData } : {}),
      ...(modelData !== undefined ? { modelData } : {}),
      ...(footprintData !== undefined ? { footprintData } : {}),
      ...(objectStrings !== undefined ? { objectStrings } : {}),
    };
  }));
}

/**
 * Each doodad's model file (storage path, forward slashes), for rendering. A doodad actor names its
 * CModel with Model (when absent, the CModel with the actor's own id), or for editor-only helpers
 * with EditorModel; the CModel's Model is the file path, inherited through parents (the "Doodad"
 * default gives Assets\Doodads\##id##\##id##.m3), its ##tokens## filled in. Variations are the path
 * with _00, _01, … (doodad-thumbnails.ts). A doodad whose model can't be resolved is left out.
 */
export function extractDoodadModels(packages: readonly GameDataPackage[], ids: Iterable<string>): Record<string, string> {
  const actors = new Map<string, Entry>();
  const models = new Map<string, Entry>();
  for (const pkg of packages) {
    if (pkg.actorData) readEntries(pkg.actorData, "CActorDoodad", actors);
    if (pkg.modelData) readEntries(pkg.modelData, "CModel", models);
  }
  const found: Record<string, string> = {};
  for (const id of [...ids].sort((a, b) => a.localeCompare(b))) {
    const model = resolve(actors, id, "Model")?.at(-1) || undefined;
    const editorModel = resolve(actors, id, "EditorModel")?.at(-1) || undefined;
    const modelId = [model, id, editorModel].find((candidate) => candidate && models.has(candidate));
    if (!modelId) continue;
    const file = resolve(models, modelId, "Model")?.at(-1);
    if (!file) continue;
    const tokens = resolveTokens(models, modelId);
    found[id] = file.replaceAll(/##(\w+)##/g, (_, token: string) => (token === "id" ? modelId : (tokens[token] ?? ""))).replaceAll("\\", "/");
  }
  return found;
}

/** Folder entries of the gallery's listing that are its full-size doodad pictures (not the _tn thumbnails). */
const isGalleryPicture = (file: string): boolean => !file.includes("/") && file.endsWith(".jpg") && !file.endsWith("_tn.jpg");

/** The gallery's pictures among a listing of the repository's paths. */
const galleryPictures = (paths: readonly string[]): string[] =>
  paths.flatMap((file) => (file.startsWith(GALLERY_FOLDER) && isGalleryPicture(file.slice(GALLERY_FOLDER.length)) ? [file.slice(GALLERY_FOLDER.length)] : []));

/** The gallery's pictures as GitHub's API lists the repository. */
async function treeFileNames(fetch: typeof globalThis.fetch, env: Readonly<Record<string, string | undefined>>): Promise<string[]> {
  const token = env.GITHUB_TOKEN?.trim();
  const response = await fetch(GALLERY_TREE_URL, { headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  if (!response.ok) throw new Error(`GitHub's API answered HTTP ${response.status}`);
  const listing = (await response.json()) as { readonly truncated?: boolean; readonly tree?: readonly { readonly path?: string }[] };
  if (listing.truncated) throw new Error("GitHub's API cut the listing short");
  return galleryPictures((listing.tree ?? []).map((entry) => entry.path ?? ""));
}

const run = promisify(execFile);

/**
 * A repository's files under `folder`, listed by git from a shallow clone with no file contents
 * (a second or so), made in a temporary folder and removed after. Not rate-limited, unlike the API.
 */
export const gitTreeFiles: ListGitTree = async (url, folder) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sc2-gallery-"));
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  try {
    await run("git", ["clone", "--quiet", "--depth", "1", "--filter=blob:none", "--no-checkout", url, dir], { env });
    const { stdout } = await run("git", ["-C", dir, "ls-tree", "-z", "--name-only", "HEAD", folder], { env, maxBuffer: 64 * 1024 * 1024 });
    return stdout.split("\0").filter(Boolean);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
};

/**
 * The gallery's doodad pictures' file names, sorted: from GitHub's API (with GITHUB_TOKEN when it
 * is set), else, when the API refuses (its limit for unauthenticated calls is 60 an hour per
 * address) or cuts the listing short, as git lists the repository. Both list the files that are
 * there, so both give the same pictures. Throws when neither answers.
 */
export async function galleryFileNames({
  fetch = globalThis.fetch,
  listGitTree = gitTreeFiles,
  env = process.env,
  log = () => {},
}: Pick<FetchOptions, "fetch" | "listGitTree" | "log"> & { readonly env?: Readonly<Record<string, string | undefined>> } = {}): Promise<string[]> {
  let files: string[];
  try {
    files = await treeFileNames(fetch, env);
  } catch (apiError) {
    log(`Listing the gallery through GitHub's API failed (${(apiError as Error).message}), so git lists it instead`);
    try {
      files = galleryPictures(await listGitTree(GALLERY_GIT_URL, GALLERY_FOLDER));
    } catch (gitError) {
      throw new Error(
        `Couldn't list the sc2-mapping-reference gallery: ${(apiError as Error).message}, and git failed (${(gitError as Error).message.split("\n")[0]}). Set GITHUB_TOKEN, or install git, and try again`,
        { cause: gitError },
      );
    }
  }
  return [...new Set(files)].sort();
}

/** A name or file name, lower case, letters and digits only. */
const plain = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A name or file name as the gallery is matched by: plain, a leading "(Tag)_" dropped. */
const normalise = (text: string): string => plain(text.replace(/^\([A-Za-z]+\)_/, ""));

/** Campaign doodads carry a prefix in the gallery: "Void - ", "Nova - ", "Void Prologue - ". */
const GALLERY_PREFIX = /^(Void|Nova|Void_Prologue|Shadow_\d+|Swarm|Liberty|HotS|LotV|WoL|Coop|Iceworld)_-_/i;

/**
 * Which gallery picture each matching key names. A key goes to the file whose whole name it is,
 * before one it is after a "(Tag)_", before one it is after a campaign prefix; between files alike,
 * to the first by file name (by code unit, the same on every machine). So the order the gallery was
 * listed in never matters.
 */
function pictureKeys(gallery: readonly string[]): Map<string, string> {
  const best = new Map<string, { readonly file: string; readonly rank: number }>();
  const offer = (key: string, file: string, rank: number) => {
    const known = best.get(key);
    if (!known || rank < known.rank || (rank === known.rank && file < known.file)) best.set(key, { file, rank });
  };
  for (const file of gallery) {
    const stem = file.replace(/\.jpg$/, "");
    const key = normalise(stem);
    offer(key, file, key === plain(stem) ? 0 : 1);
    const unprefixed = normalise(stem.replace(GALLERY_PREFIX, ""));
    if (unprefixed !== key) offer(unprefixed, file, 2);
  }
  return new Map([...best].map(([key, { file }]) => [key, file]));
}

/**
 * Each doodad's extracted fields, in id order: its kind, categories and tilesets (from
 * doodads.json), the last package defining its actor (a map needs that package as a dependency for
 * the doodad to exist), its Editor display name (Actor/Name plus Actor/EditorSuffix from
 * ObjectStrings, e.g. "Bridge (Destroyed) - Mar Sara -"), its gallery picture matched by display
 * name, name or id (pictureKeys), the other doodads with that picture, and `rendered` when it is described but the
 * gallery has no picture of it (its description was written from a render).
 */
export function extractCatalogFields(
  packages: readonly FetchedPackage[],
  doodads: Readonly<Record<string, DoodadInfo>>,
  gallery: readonly string[],
  descriptions: Readonly<Record<string, unknown>>,
): Record<string, ExtractedDoodad> {
  const names = new Map<string, string>();
  const suffixes = new Map<string, string>();
  const definedIn = new Map<string, string>();
  for (const pkg of packages) {
    for (const match of (pkg.actorData ? stripXmlComments(pkg.actorData) : "").matchAll(/<CActorDoodad\b[^>]*\bid="([^"]+)"/g)) definedIn.set(match[1]!, pkg.name);
    for (const match of pkg.objectStrings?.matchAll(/^Actor\/Name\/([^=]+)=(.*)$/gm) ?? []) names.set(match[1]!, match[2]!.trim());
    for (const match of pkg.objectStrings?.matchAll(/^Actor\/EditorSuffix\/([^=]+)=(.*)$/gm) ?? []) suffixes.set(match[1]!, match[2]!.trim());
  }
  const pictures = pictureKeys(gallery);
  const fields: Record<string, ExtractedDoodad & { image?: string }> = {};
  for (const id of Object.keys(doodads).sort((a, b) => a.localeCompare(b))) {
    const info = doodads[id]!;
    const name = names.get(id);
    const displayName = name !== undefined && suffixes.has(id) ? `${name} ${suffixes.get(id)}` : name;
    const image = [displayName, name, id].flatMap((text) => (text ? [pictures.get(normalise(text))] : [])).find((file) => file !== undefined);
    fields[id] = {
      kind: info.kind,
      ...(definedIn.has(id) ? { package: definedIn.get(id)! } : {}),
      ...(info.categories ? { categories: info.categories } : {}),
      ...(info.tilesets ? { tilesets: info.tilesets } : {}),
      ...(displayName !== undefined ? { name: displayName } : {}),
      ...(image !== undefined ? { image } : {}),
    };
  }
  const byPicture = new Map<string, string[]>();
  for (const [id, entry] of Object.entries(fields)) if (entry.image !== undefined) byPicture.set(entry.image, [...(byPicture.get(entry.image) ?? []), id]);
  for (const [id, entry] of Object.entries(fields)) {
    const sharing = entry.image !== undefined ? byPicture.get(entry.image)!.filter((other) => other !== id) : [];
    const rendered = entry.image === undefined && Object.hasOwn(descriptions, id);
    if (sharing.length || rendered) fields[id] = { ...entry, ...(sharing.length ? { sharesPicture: sharing } : {}), ...(rendered ? { rendered: true } : {}) };
  }
  return fields;
}

export type ExtractCatalogOptions = FetchOptions & {
  /** The folder to write to (the cache folder's extracted/ by default). */
  readonly extractedDir?: string;
  /** The descriptions to report unextracted ids of and mark `rendered` by (this package's by default). */
  readonly descriptionsFile?: string;
};

export type ExtractedCatalog = {
  readonly doodads: number;
  /** How many have a gallery picture. */
  readonly pictured: number;
  /** How many have a model file. */
  readonly models: number;
  /** Described ids that weren't extracted, which the catalog leaves out. */
  readonly unextracted: readonly string[];
};

/** Whether `extractedDir` holds a whole extraction: what the catalog is read and rendered from. */
export const hasExtractedCatalog = (extractedDir: string = extractedDirOf()): boolean =>
  [DOODADS_FILE, DOODAD_MODELS_FILE, DOODAD_EXTRACTED_FILE, EXTRACTED_INFO_FILE].every((file) => existsSync(path.join(extractedDir, file)));

/**
 * Fetches SC2GameData and the gallery's file list, extracts the catalog's fields and writes them to
 * `extractedDir`. Everything is fetched before anything is written, so a failed fetch leaves an
 * earlier extraction as it was.
 */
export async function extractCatalog(options: ExtractCatalogOptions = {}): Promise<ExtractedCatalog> {
  const log = options.log ?? (() => {});
  const dir = options.extractedDir ?? extractedDirOf();
  const descriptionsFile = options.descriptionsFile ?? DOODAD_DESCRIPTIONS_PATH;
  const descriptions = parseDoodadDescriptions(readFileSync(descriptionsFile, "utf8"), descriptionsFile);
  const [packages, gallery] = await Promise.all([fetchGameData(options), galleryFileNames(options).then((files) => (log(`Fetched the gallery's list: ${files.length} pictures`), files))]);
  const doodads = extractDoodads(packages);
  const models = extractDoodadModels(packages, Object.keys(doodads));
  const fields = extractCatalogFields(packages, doodads, gallery, descriptions);
  const unextracted = Object.keys(descriptions).filter((id) => !Object.hasOwn(fields, id));
  const pictured = Object.values(fields).filter((entry) => entry.image !== undefined).length;

  await mkdir(dir, { recursive: true });
  // The info file goes first and comes back last: without it, an extraction cut short (this one, or
  // one over an earlier one) isn't taken for a whole one.
  await rm(path.join(dir, EXTRACTED_INFO_FILE), { force: true });
  await writeWhole(path.join(dir, DOODADS_FILE), `${JSON.stringify(doodads, null, 1)}\n`);
  await writeWhole(path.join(dir, DOODAD_MODELS_FILE), `${JSON.stringify(models, null, 2)}\n`);
  await writeWhole(path.join(dir, DOODAD_EXTRACTED_FILE), `${JSON.stringify(fields, null, 2)}\n`);
  const counts = { doodads: Object.keys(doodads).length, pictured, models: Object.keys(models).length };
  await writeWhole(path.join(dir, EXTRACTED_INFO_FILE), `${JSON.stringify({ extracted: new Date().toISOString(), source: SC2_GAME_DATA_URL, gallery: GALLERY_TREE_URL, ...counts }, null, 2)}\n`);
  log(`${counts.doodads} doodads, ${pictured} with a gallery picture, ${counts.models} with a model file -> ${dir}`);
  if (unextracted.length) log(`${unextracted.length} described doodads weren't extracted, so they're left out of the catalog: ${unextracted.join(", ")}`);
  return { ...counts, unextracted };
}
