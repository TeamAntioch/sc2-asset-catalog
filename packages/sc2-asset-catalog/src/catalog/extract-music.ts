// Extracting the music's fields into the user's cache (ADR-0023 in sc2-adjutant; docs/adr/0001 here):
// nothing taken from the game ships, so `extract-music` builds, from a mirror of the game's data,
// one record for every id a map can play music with:
//
//   a Soundtrack: a CSoundtrack, played with Play Soundtrack (SoundtrackPlay), made of CSounds
//   a Sound: a Music-category CSound that no Soundtrack plays, for SoundPlay or a cutscene's soundLink
//
// Each record has where it's defined, the package that defines it last (so the dependency a map
// needs for it), the music files it can play, a role worked out from its id, and where Blizzard's
// scripts and cutscenes name it. It is the research's parse_data.py, resolve.py and usage.py
// (sc2-adjutant, docs/research/blizzard-music/) in TypeScript.
//
// The mirror is sc2-arcade-watcher/sc2-game-data at one pinned commit: unlike SC2GameData it holds
// the campaigns' maps and their scripts, which the usage scan reads. The files come from raw GitHub
// URLs after a listing of the commit's files, by the API or, when that refuses, by git.
//
//   music-extracted.json       the records, a list in id order (19 ids are both a Soundtrack and a
//                              Sound, so an id alone doesn't name one)
//   music-extracted-info.json  when, from where, and the counts

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { writeWhole } from "../util/write-whole.js";
import { extractedDir as extractedDirOf } from "./catalog-dirs.js";
import { packageDependency } from "./doodad-dependencies.js";

/** The mirror of the game's data the music is extracted from, and the commit it is read at (SC2 5.0.16.97364). */
export const MUSIC_MIRROR_REPO = "sc2-arcade-watcher/sc2-game-data";
export const MUSIC_MIRROR_SHA = "7be894538d6eac77a9583acfeb5f721e273beee4";
export const MUSIC_MIRROR_RAW_URL = `https://raw.githubusercontent.com/${MUSIC_MIRROR_REPO}/${MUSIC_MIRROR_SHA}`;
export const MUSIC_MIRROR_TREE_URL = `https://api.github.com/repos/${MUSIC_MIRROR_REPO}/git/trees/${MUSIC_MIRROR_SHA}?recursive=1`;
export const MUSIC_MIRROR_GIT_URL = `https://github.com/${MUSIC_MIRROR_REPO}.git`;

export const MUSIC_EXTRACTED_FILE = "music-extracted.json";
export const MUSIC_EXTRACTED_INFO_FILE = "music-extracted-info.json";

/** How many places of use a record keeps; `usedCount` has all of them. */
const KEPT_USES = 5;

// ---------------------------------------------------------------- which files

/** The mods whose scripts are read for where music is used: the base mods the stock maps depend on, the story art and prologue mods, and the mission-pack and Co-op mods. Mutators and Heroes of the Storm mods hold no music of interest. */
const SCRIPT_MODS = /^mods\/(?:(?:core|liberty|swarm|void|libertymulti|swarmmulti|voidmulti|novastoryassets|voidprologue)\.sc2mod|missionpacks|starcoop|warcoop)\//;

/** A map's own folder in a path: `…/zchar02.sc2map/`. */
const MAP_FOLDER = /([^/]+\.sc2map)\//;

/**
 * Which of the mirror's files the extraction reads, from a listing of all of them: every
 * SoundtrackData.xml, every SoundData.xml of a mod or campaign, the SoundData.xml of each map that
 * has its own SoundtrackData.xml (Heroes of the Storm's `.stormmod` folders are left out), and, for
 * where music is used, the campaigns' and base mods' scripts and every cutscene file.
 */
export function selectMusicFiles(paths: readonly string[]): { readonly data: string[]; readonly usage: string[] } {
  const GAME_DATA = "/base.sc2data/GameData/";
  const kept = paths.filter((file) => !file.includes(".stormmod/")).sort();
  const soundtracks = kept.filter((file) => file.endsWith(`${GAME_DATA}SoundtrackData.xml`));
  const mapsWithSoundtracks = new Set(soundtracks.flatMap((file) => (MAP_FOLDER.test(file) ? [file.slice(0, file.indexOf(GAME_DATA))] : [])));
  const sounds = kept.filter((file) => {
    if (!file.endsWith(`${GAME_DATA}SoundData.xml`)) return false;
    return !MAP_FOLDER.test(file) || mapsWithSoundtracks.has(file.slice(0, file.indexOf(GAME_DATA)));
  });
  const usage = kept.filter(
    (file) => file.endsWith(".SC2Cutscene") || (file.endsWith(".galaxy") && (file.startsWith("campaigns/") || SCRIPT_MODS.test(file))),
  );
  return { data: [...soundtracks, ...sounds].sort(), usage };
}

// ---------------------------------------------------------------- parsing

type Block = { readonly line: number; readonly attrs: Record<string, string>; readonly kids: readonly { readonly line: number; readonly text: string }[] };

const unescapeXml = (text: string): string =>
  text
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll("&amp;", "&");

function attributes(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name = "", value = ""] of text.matchAll(/(\w+)="([^"]*)"/g)) found[name] = unescapeXml(value);
  return found;
}

/**
 * Each `<tag …>` element of a data file, line by line as the game's files are laid out: its line,
 * its attributes and the lines of its children (the elements are one to a line, the attributes of a
 * long one may run over several).
 */
function* blocks(text: string, tag: string): Generator<Block> {
  const lines = text.replace(/^\uFEFF/, "").split("\n");
  const open = new RegExp(`^\\s*<${tag}[\\s>/]`);
  for (let at = 0; at < lines.length; ) {
    if (!open.test(lines[at]!)) {
      at++;
      continue;
    }
    let head = lines[at]!;
    let end = at;
    while (!head.includes(">") && end + 1 < lines.length) head += ` ${lines[++end]!}`;
    const opening = head.split(">")[0]!;
    const kids: { line: number; text: string }[] = [];
    if (!opening.trimEnd().endsWith("/")) {
      end++;
      while (end < lines.length && !lines[end]!.includes(`</${tag}>`)) {
        kids.push({ line: end + 1, text: lines[end]!.trim() });
        end++;
      }
    }
    yield { line: at + 1, attrs: attributes(opening), kids };
    at = end + 1;
  }
}

/** A CSoundtrack as one data file defines it (a later definition of the same id adds to or replaces what an earlier one set). */
export type SoundtrackBlock = {
  readonly id: string;
  readonly parent?: string;
  readonly isDefault: boolean;
  readonly file: string;
  readonly line: number;
  readonly master: readonly string[];
  readonly slaves: readonly string[];
  readonly flags: Readonly<Record<string, string>>;
  readonly next?: string;
  readonly delay?: string;
  readonly select?: string;
};

/** A CSound as one data file defines it. */
export type SoundBlock = {
  readonly id: string;
  readonly parent?: string;
  readonly isDefault: boolean;
  readonly file: string;
  readonly line: number;
  readonly assets: readonly string[];
  readonly category?: string;
  readonly volume?: string;
  readonly loopcount?: string;
  readonly select?: string;
};

/** Every CSoundtrack in a SoundtrackData.xml; `file` is its path in the mirror, for citing. */
export function parseSoundtrackData(text: string, file: string): SoundtrackBlock[] {
  const found: SoundtrackBlock[] = [];
  for (const { line, attrs, kids } of blocks(text, "CSoundtrack")) {
    const master: string[] = [];
    const slaves: string[] = [];
    const flags: Record<string, string> = {};
    let next: string | undefined;
    let delay: string | undefined;
    let select: string | undefined;
    for (const { text: kid } of kids) {
      const kidAttrs = attributes(kid);
      if (kid.startsWith("<MasterLayer") && kidAttrs.Sound) master.push(kidAttrs.Sound);
      else if (kid.startsWith("<Sections") && kidAttrs.Sound) slaves.push(kidAttrs.Sound);
      else if (kid.startsWith("<Flags") && kidAttrs.index !== undefined) flags[kidAttrs.index] = kidAttrs.value ?? "";
      else if (kid.startsWith("<Next")) next = kidAttrs.value;
      else if (kid.startsWith("<Delay")) delay = kidAttrs.value;
      else if (kid.startsWith("<Select")) select = kidAttrs.value;
    }
    if (attrs.id === undefined) continue;
    found.push({
      id: attrs.id,
      ...(attrs.parent !== undefined ? { parent: attrs.parent } : {}),
      isDefault: attrs.default === "1",
      file,
      line,
      master,
      slaves,
      flags,
      ...(next !== undefined ? { next } : {}),
      ...(delay !== undefined ? { delay } : {}),
      ...(select !== undefined ? { select } : {}),
    });
  }
  return found;
}

/** Every CSound in a SoundData.xml. */
export function parseSoundData(text: string, file: string): SoundBlock[] {
  const found: SoundBlock[] = [];
  for (const { line, attrs, kids } of blocks(text, "CSound")) {
    const assets: string[] = [];
    let category: string | undefined;
    let volume: string | undefined;
    let loopcount: string | undefined;
    let select: string | undefined;
    for (const { text: kid } of kids) {
      const kidAttrs = attributes(kid);
      if (kid.startsWith("<AssetArray")) {
        if (kidAttrs.File !== undefined) assets.push(kidAttrs.File);
      } else if (kid.startsWith("<Category")) category = kidAttrs.value;
      else if (kid.startsWith("<Volume")) volume = kidAttrs.value;
      else if (kid.startsWith("<LoopCount")) loopcount = kidAttrs.value;
      else if (kid.startsWith("<Select")) select = kidAttrs.value;
    }
    if (attrs.id === undefined) continue;
    found.push({
      id: attrs.id,
      ...(attrs.parent !== undefined ? { parent: attrs.parent } : {}),
      isDefault: attrs.default === "1",
      file,
      line,
      assets,
      ...(category !== undefined ? { category } : {}),
      ...(volume !== undefined ? { volume } : {}),
      ...(loopcount !== undefined ? { loopcount } : {}),
      ...(select !== undefined ? { select } : {}),
    });
  }
  return found;
}

// ---------------------------------------------------------------- resolving

/** Load order of the packages: a later one overrides an earlier one, and a map's own data comes after its campaign's. */
const LOAD_ORDER = [
  "mods/core",
  "mods/liberty.",
  "mods/libertymulti",
  "mods/swarm.",
  "mods/swarmmulti",
  "mods/void.",
  "mods/voidmulti",
  "mods/balance",
  "mods/novastory",
  "mods/voidprologue",
  "mods/starcoop",
  "mods/war",
  "campaigns/libertystory",
  "campaigns/liberty.",
  "campaigns/swarmstory",
  "campaigns/swarm.",
  "campaigns/voidstory",
  "campaigns/void.",
];

function loadRank(file: string): number {
  const at = LOAD_ORDER.findIndex((prefix) => file.startsWith(prefix));
  return at < 0 ? 99 : at + (file.includes(".sc2map") ? 50 : 0);
}

const byLoadOrder = <Block extends { readonly file: string; readonly line: number }>(a: Block, b: Block): number =>
  loadRank(a.file) - loadRank(b.file) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line;

const isEmpty = (value: unknown): boolean =>
  value === undefined || value === null || (Array.isArray(value) && value.length === 0) || (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0);

/** The last definition's value that is set. */
function lastSet<Block, Key extends keyof Block>(defs: readonly Block[], key: Key): Block[Key] | undefined {
  for (const def of [...defs].reverse()) if (!isEmpty(def[key])) return def[key];
  return undefined;
}

/** A Soundtrack or Sound as resolved over every package: who defines it, and what it plays. */
export type Definition = { readonly file: string; readonly line: number };

export type ResolvedSound = {
  readonly id: string;
  readonly layer: "master" | "slave";
  readonly defs: readonly Definition[];
  readonly assets: readonly string[];
  readonly category?: string;
};

export type ResolvedMusic = {
  readonly id: string;
  readonly kind: "Soundtrack" | "Sound";
  readonly defs: readonly Definition[];
  readonly sounds: readonly ResolvedSound[];
  readonly assets: readonly string[];
  readonly continuous?: string;
  readonly next?: string;
  readonly delay?: string;
  readonly select?: string;
};

/**
 * The Soundtracks that play music (every one whose parents don't lead to Ambience_Map), each with
 * the CSounds of its master and section layers resolved to their files through their parents, and
 * the Music-category CSounds no such Soundtrack plays. Several packages may define one id, and then
 * the last in load order that sets a field wins.
 */
export function resolveMusic(soundtracks: readonly SoundtrackBlock[], sounds: readonly SoundBlock[]): ResolvedMusic[] {
  const group = <Block extends { readonly id: string; readonly file: string; readonly line: number }>(all: readonly Block[]) => {
    const grouped = new Map<string, Block[]>();
    for (const block of all) grouped.set(block.id, [...(grouped.get(block.id) ?? []), block]);
    for (const defs of grouped.values()) defs.sort(byLoadOrder);
    return grouped;
  };
  const st = group(soundtracks);
  const so = group(sounds);

  const parentOf = <Block extends { readonly parent?: string }>(defs: readonly Block[] | undefined): string | undefined => defs?.map((def) => def.parent).filter((parent) => parent).at(-1);

  const rootOf = (id: string): string => {
    const seen = new Set<string>();
    for (let at = id; ; ) {
      const parent = st.has(at) && !seen.has(at) ? parentOf(st.get(at)) : undefined;
      seen.add(at);
      if (parent === undefined) return at;
      at = parent;
    }
  };

  /** A CSound field through its parents: the nearest definition (this one's, then its parent's) that sets it. */
  const soundField = <Key extends "assets" | "category">(id: string, key: Key): SoundBlock[Key] | undefined => {
    const seen = new Set<string>();
    for (let at: string | undefined = id; at !== undefined && !seen.has(at); at = parentOf(so.get(at))) {
      seen.add(at);
      const value = lastSet(so.get(at) ?? [], key);
      if (value !== undefined) return value;
    }
    return undefined;
  };

  const found: ResolvedMusic[] = [];
  const referenced = new Set<string>();
  for (const [id, defs] of st) {
    if (!id || defs.some((def) => def.isDefault) || id.startsWith("Ambience") || rootOf(id) === "Ambience_Map") continue;
    const master = lastSet(defs, "master") ?? [];
    const slaves = lastSet(defs, "slaves") ?? [];
    const flags = Object.assign({}, ...defs.map((def) => def.flags)) as Record<string, string>;
    const resolved: ResolvedSound[] = [...master, ...slaves].map((soundId) => {
      referenced.add(soundId);
      const category = soundField(soundId, "category");
      return {
        id: soundId,
        layer: master.includes(soundId) ? "master" : "slave",
        defs: (so.get(soundId) ?? []).map(({ file, line }) => ({ file, line })),
        assets: soundField(soundId, "assets") ?? [],
        ...(category !== undefined ? { category } : {}),
      };
    });
    const next = lastSet(defs, "next");
    const delay = lastSet(defs, "delay");
    const select = lastSet(defs, "select");
    found.push({
      id,
      kind: "Soundtrack",
      defs: defs.map(({ file, line }) => ({ file, line })),
      sounds: resolved,
      assets: [...new Set(resolved.flatMap((sound) => sound.assets))],
      ...(flags.Continuous !== undefined ? { continuous: flags.Continuous } : {}),
      ...(next !== undefined ? { next } : {}),
      ...(delay !== undefined ? { delay } : {}),
      ...(select !== undefined ? { select } : {}),
    });
  }
  for (const [id, defs] of so) {
    if (!id || referenced.has(id) || defs.some((def) => def.isDefault) || soundField(id, "category") !== "Music") continue;
    const assets = soundField(id, "assets") ?? [];
    found.push({ id, kind: "Sound", defs: defs.map(({ file, line }) => ({ file, line })), sounds: [], assets: [...new Set(assets)] });
  }
  return found;
}

// ---------------------------------------------------------------- usage

/** One place Blizzard's scripts or cutscenes name a music id. */
export type MusicUse = { readonly file: string; readonly line: number; readonly func?: string };

const FUNCTION_START = /^(?:static\s+)?(?:bool|void|int|fixed|string|text|unit|point)\s+(\w+)\s*\(/;

/**
 * Where a script or cutscene file names a music id: every string literal in a .galaxy file equal
 * to an id (with the function it sits in, which catches ids held in variables too), and every
 * `soundLink` in a .SC2Cutscene file that names one.
 */
export function scanMusicUsage(file: string, text: string, ids: ReadonlySet<string>): Map<string, MusicUse[]> {
  const found = new Map<string, MusicUse[]>();
  const add = (id: string, use: MusicUse) => found.set(id, [...(found.get(id) ?? []), use]);
  const lines = text.replace(/^\uFEFF/, "").split("\n");
  if (file.endsWith(".SC2Cutscene")) {
    lines.forEach((line, at) => {
      for (const [, literal = ""] of line.matchAll(/soundLink="([^"]*)"/g)) if (ids.has(literal)) add(literal, { file, line: at + 1, func: "SC2Cutscene" });
    });
    return found;
  }
  let func: string | undefined;
  lines.forEach((line, at) => {
    func = FUNCTION_START.exec(line)?.[1] ?? func;
    for (const [, literal = ""] of line.matchAll(/"([^"\\]*)"/g)) if (ids.has(literal)) add(literal, { file, line: at + 1, ...(func !== undefined ? { func } : {}) });
  });
  return found;
}

// ---------------------------------------------------------------- the records

/** What an id is for, from words in it (the first role with a matching pattern wins, else "other"). */
const ROLES: ReadonlyArray<readonly [role: string, pattern: RegExp]> = [
  ["boss", /boss|zurvan|archangel|titan|eradicator|mothership/],
  ["credits", /credits/],
  ["victory", /victory|win\b/],
  ["defeat", /defeat|fail|gameover|youlose/],
  ["briefing", /briefing|pitch|zsm|zscripted|zld_|zdebrief|debrief|storymode|storysofar|armory|labres|labcrys|cantina/],
  ["cutscene", /cutscene|cinematic|cine|_cs\d|flashback|midcine/],
  ["intro", /intro|prelude|start(?!up)|launch/],
  ["outro", /outro|ending|final|end_|_end/],
  ["stinger", /sting|swell|hit\d|discovery|complete|achievement/],
  ["event", /event|alt|mid|section|_s\d|escape|holdout|onslaught|alarm|lastobjective|disruption|orbitalstrike|terrazine|transition|protect|infiltrate|listenin|ride|bonus/],
  ["menu", /startup|mainmenu|takeover|loadingscreen|loop$|^music_(liberty|swarm|void|nova|general)/],
  ["main", /main|low|high|general|music_t\d|sc2-0/],
];

export const musicRole = (id: string): string => ROLES.find(([, pattern]) => pattern.test(id.toLowerCase()))?.[0] ?? "other";

/** One music id as extracted. */
export type ExtractedMusic = {
  readonly id: string;
  readonly kind: "Soundtrack" | "Sound";
  /** Where it is defined, as `<path in the mirror> l. <line>`, in load order (the last one wins). */
  readonly defined: readonly string[];
  /** The mod or campaign folder that defines it last, such as `campaigns/void.sc2campaign`. */
  readonly package: string;
  /** The map that holds it, when only that map's own data defines it: then no other map can play it. */
  readonly mapLocal?: string;
  /** The map dependency a map needs to call it, when the default `Void (Mod)` isn't enough. */
  readonly dependency?: string;
  /** The CSounds a Soundtrack plays, in layer order. */
  readonly sounds?: readonly string[];
  /** The music files it can play, as the game names them. */
  readonly assets: readonly string[];
  /** True when it plays no file at all. */
  readonly empty: boolean;
  readonly role: string;
  readonly continuous?: boolean;
  readonly next?: string;
  readonly delay_s?: number;
  readonly select?: string;
  /** The first places Blizzard's scripts or cutscenes name it, and how many there are. */
  readonly usedIn: readonly MusicUse[];
  readonly usedCount: number;
};

/** The mod or campaign folder a path in the mirror sits in: `mods/void.sc2mod`, `campaigns/void.sc2campaign`, `mods/starcoop/starcoop.sc2mod`. */
export function packageOf(file: string): string {
  const parts = file.split("/");
  const at = parts.findIndex((part) => /\.(sc2mod|sc2campaign)$/.test(part));
  return at < 0 ? (parts.slice(0, 2).join("/") || file) : parts.slice(0, at + 1).join("/");
}

/** The records for the resolved music and its uses, in id order, a Soundtrack before a Sound of the same id. */
export function buildExtractedMusic(resolved: readonly ResolvedMusic[], uses: ReadonlyMap<string, readonly MusicUse[]>): ExtractedMusic[] {
  const records: ExtractedMusic[] = [];
  const order = (a: ResolvedMusic, b: ResolvedMusic) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || (a.kind === b.kind ? 0 : a.kind === "Soundtrack" ? -1 : 1);
  for (const music of [...resolved].sort(order)) {
    const last = music.defs.at(-1)!;
    const map = MAP_FOLDER.exec(last.file)?.[1];
    const pkg = packageOf(last.file);
    const dependency = map === undefined ? packageDependency(pkg) : undefined;
    const used = uses.get(music.id) ?? [];
    const delay = music.delay !== undefined && Number.isFinite(Number(music.delay)) ? Number(music.delay) : undefined;
    records.push({
      id: music.id,
      kind: music.kind,
      defined: music.defs.map((def) => `${def.file} l. ${def.line}`),
      package: pkg,
      ...(map !== undefined ? { mapLocal: map } : {}),
      ...(dependency !== undefined ? { dependency } : {}),
      ...(music.sounds.length ? { sounds: music.sounds.map((sound) => sound.id) } : {}),
      assets: music.assets,
      empty: music.assets.length === 0,
      role: musicRole(music.id),
      ...(music.continuous !== undefined ? { continuous: music.continuous === "1" } : {}),
      ...(music.next !== undefined ? { next: music.next } : {}),
      ...(delay !== undefined ? { delay_s: delay } : {}),
      ...(music.select !== undefined ? { select: music.select } : {}),
      usedIn: used.slice(0, KEPT_USES),
      usedCount: used.length,
    });
  }
  return records;
}

// ---------------------------------------------------------------- fetching

export type ListMirrorFiles = () => Promise<string[]>;

export type ExtractMusicOptions = {
  /** The fetch to use (the global one by default); tests pass a fake. */
  readonly fetch?: typeof globalThis.fetch;
  /** What lists the mirror's files when GitHub's API refuses (git, by default); tests pass a fake. */
  readonly listMirrorFiles?: ListMirrorFiles;
  /** How many files are fetched at once. */
  readonly concurrency?: number;
  readonly log?: (line: string) => void;
  /** The folder to write to (the cache folder's extracted/ by default). */
  readonly extractedDir?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
};

const run = promisify(execFile);

/** The mirror's files at the pinned commit as git lists them, from a shallow, blob-less fetch of that one commit in a temporary folder. */
export const gitMirrorFiles: ListMirrorFiles = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sc2-music-"));
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  try {
    await run("git", ["init", "--quiet", dir], { env });
    await run("git", ["-C", dir, "fetch", "--quiet", "--depth", "1", "--filter=blob:none", MUSIC_MIRROR_GIT_URL, MUSIC_MIRROR_SHA], { env });
    const { stdout } = await run("git", ["-C", dir, "ls-tree", "-r", "-z", "--name-only", "FETCH_HEAD"], { env, maxBuffer: 256 * 1024 * 1024 });
    return stdout.split("\0").filter(Boolean);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
};

/** The mirror's files at the pinned commit, by GitHub's API (with GITHUB_TOKEN when set), else by git. */
export async function mirrorFiles({
  fetch = globalThis.fetch,
  listMirrorFiles = gitMirrorFiles,
  env = process.env,
  log = () => {},
}: Pick<ExtractMusicOptions, "fetch" | "listMirrorFiles" | "env" | "log"> = {}): Promise<string[]> {
  try {
    const token = env.GITHUB_TOKEN?.trim();
    const response = await fetch(MUSIC_MIRROR_TREE_URL, { headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    if (!response.ok) throw new Error(`GitHub's API answered HTTP ${response.status}`);
    const listing = (await response.json()) as { readonly truncated?: boolean; readonly tree?: readonly { readonly path?: string; readonly type?: string }[] };
    if (listing.truncated) throw new Error("GitHub's API cut the listing short");
    return (listing.tree ?? []).flatMap((entry) => (entry.type === "blob" && entry.path ? [entry.path] : []));
  } catch (apiError) {
    log(`Listing the game data's files through GitHub's API failed (${(apiError as Error).message}), so git lists them instead`);
    try {
      return await listMirrorFiles();
    } catch (gitError) {
      throw new Error(
        `Couldn't list the game data's files: ${(apiError as Error).message}, and git failed (${(gitError as Error).message.split("\n")[0]}). Set GITHUB_TOKEN, or install git, and try again`,
        { cause: gitError },
      );
    }
  }
}

/** The text of a file of the mirror at the pinned commit, retried; throws naming the file when it can't be had. */
async function fetchMirrorFile(fetch: typeof globalThis.fetch, file: string): Promise<string> {
  const url = `${MUSIC_MIRROR_RAW_URL}/${file.split("/").map(encodeURIComponent).join("/")}`;
  let failure = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
      failure = `HTTP ${response.status}`;
      if (response.status === 404) break;
    } catch (error) {
      failure = (error as Error).message;
    }
  }
  throw new Error(`${file}: ${failure}`);
}

/** Runs `work` over `items` with at most `limit` at once. */
async function pooled<Item>(items: readonly Item[], limit: number, work: (item: Item) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await work(items[next++]!);
    }),
  );
}

export type ExtractedMusicCounts = {
  readonly ids: number;
  readonly soundtracks: number;
  readonly sounds: number;
  readonly files: number;
  readonly used: number;
  readonly scripts: number;
};

/** Whether `extractedDir` holds a whole music extraction. */
export const hasExtractedMusic = (extractedDir: string = extractedDirOf()): boolean =>
  [MUSIC_EXTRACTED_FILE, MUSIC_EXTRACTED_INFO_FILE].every((file) => existsSync(path.join(extractedDir, file)));

/**
 * Lists the mirror's files, fetches the data files and resolves the music, then reads the scripts
 * and cutscenes for where each id is used, and writes the records to `extractedDir`. Nothing is
 * written until everything is read, so a failed fetch leaves an earlier extraction as it was.
 */
export async function extractMusic(options: ExtractMusicOptions = {}): Promise<{ readonly records: ExtractedMusic[]; readonly counts: ExtractedMusicCounts }> {
  const log = options.log ?? (() => {});
  const fetch = options.fetch ?? globalThis.fetch;
  const concurrency = options.concurrency ?? 12;
  const dir = options.extractedDir ?? extractedDirOf();
  const { data, usage } = selectMusicFiles(await mirrorFiles(options));
  if (!data.some((file) => file.endsWith("/SoundtrackData.xml"))) throw new Error("the game data's listing holds no SoundtrackData.xml, so there is no music to extract");
  log(`${data.length} data files and ${usage.length} scripts and cutscenes to read`);

  const soundtracks: SoundtrackBlock[] = [];
  const sounds: SoundBlock[] = [];
  await pooled(data, concurrency, async (file) => {
    const text = await fetchMirrorFile(fetch, file);
    if (file.endsWith("/SoundtrackData.xml")) soundtracks.push(...parseSoundtrackData(text, file));
    else sounds.push(...parseSoundData(text, file));
  });
  log(`Read the data files: ${soundtracks.length} Soundtrack and ${sounds.length} Sound definitions`);
  const resolved = resolveMusic(soundtracks, sounds);

  const ids = new Set(resolved.map((music) => music.id));
  for (const music of resolved) for (const sound of music.sounds) ids.add(sound.id);
  const uses = new Map<string, MusicUse[]>();
  await pooled(usage, concurrency, async (file) => {
    const found = scanMusicUsage(file, await fetchMirrorFile(fetch, file), ids);
    for (const [id, places] of found) uses.set(id, [...(uses.get(id) ?? []), ...places]);
  });
  for (const places of uses.values()) places.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line);
  const records = buildExtractedMusic(resolved, uses);
  const all = records;
  const counts: ExtractedMusicCounts = {
    ids: all.length,
    soundtracks: all.filter((record) => record.kind === "Soundtrack").length,
    sounds: all.filter((record) => record.kind === "Sound").length,
    files: new Set(all.flatMap((record) => record.assets.map((asset) => asset.toLowerCase()))).size,
    used: all.filter((record) => record.usedCount > 0).length,
    scripts: usage.length,
  };

  await mkdir(dir, { recursive: true });
  await rm(path.join(dir, MUSIC_EXTRACTED_INFO_FILE), { force: true });
  await writeWhole(path.join(dir, MUSIC_EXTRACTED_FILE), `${JSON.stringify(records, null, 1)}\n`);
  await writeWhole(path.join(dir, MUSIC_EXTRACTED_INFO_FILE), `${JSON.stringify({ extracted: new Date().toISOString(), source: MUSIC_MIRROR_RAW_URL, ...counts }, null, 2)}\n`);
  log(`${counts.ids} music ids (${counts.soundtracks} Soundtracks, ${counts.sounds} Sounds), ${counts.files} files, ${counts.used} named in scripts -> ${dir}`);
  return { records, counts };
}
