// Extracts doodads.json from SC2Mapster's SC2GameData (extract-catalog.ts fetches it).
// A doodad is a CActorDoodad with a CModel: its own Model field's, or the CModel of its own id.

import type { DoodadInfo } from "./doodads.js";

/** SC2Mapster's SC2GameData on GitHub: the game's data files, unpacked. */
export const SC2_GAME_DATA_URL = "https://raw.githubusercontent.com/SC2Mapster/SC2GameData/master";

/** The SC2GameData packages that define doodads, in load order (a later one overrides an earlier one). */
export const SC2_GAME_DATA_PACKAGES: readonly string[] = [
  "mods/core.sc2mod",
  "mods/liberty.sc2mod",
  "campaigns/liberty.sc2campaign",
  "campaigns/libertystory.sc2campaign",
  "mods/swarm.sc2mod",
  "campaigns/swarm.sc2campaign",
  "campaigns/swarmstory.sc2campaign",
  "mods/void.sc2mod",
  "campaigns/void.sc2campaign",
  "campaigns/voidstory.sc2campaign",
  "mods/novastoryassets.sc2mod",
  "mods/voidprologue.sc2mod",
];

/** One SC2GameData package's GameData files, as XML text; a package may lack any of them. */
export type GameDataPackage = {
  readonly name: string;
  readonly actorData?: string;
  readonly modelData?: string;
  readonly footprintData?: string;
};

/**
 * A doodad's rough kind, from words anywhere in its id (case-insensitive); the first kind with a
 * matching word wins, else "other". Rough by design: "Street" holds "tree" and "Hologram" holds
 * "log", so a street light is a tree. These rules reproduce the kinds the catalog was first built with.
 */
const KINDS: ReadonlyArray<readonly [kind: string, words: RegExp]> = [
  ["tree", /tree|log|canopy/i],
  ["rock", /rock|stone|chunk|boulder/i],
  ["ruin", /debris|ruin|wall|temple|pillar|column|statue|obelisk|arch|brick/i],
  ["light", /light/i],
  ["foliage", /foliage|shrub|plant|bush|vine|grass|weed|flower|moss/i],
  ["decal", /decal/i],
  ["water/fx", /water|fog|mist|bird|firefl/i],
];

function doodadKind(id: string): string {
  return KINDS.find(([, words]) => words.test(id))?.[0] ?? "other";
}

/** An XML file's text with its comments taken out, so a commented-out entry is no entry. Every reader of the game data reads it so. */
export const stripXmlComments = (xml: string): string => xml.replaceAll(/<!--[\s\S]*?-->/g, "");

/** The unnamed default every entry without a parent inherits from. */
export const ROOT = "";

/** A data entry as the packages so far leave it: its parent, its own top-level fields' values, and its ##tokens##. */
export type Entry = { parent?: string; abstract?: boolean; fields: Record<string, string[]>; tokens: Record<string, string> };

/**
 * Reads every <tag> entry of `xml` into `into` (id → entry), merging over earlier packages: a later
 * package's field or token replaces the earlier one's. Only an entry's own top-level fields count
 * (8-space indent in these files), not fields nested in events or other structures. Commented-out
 * entries are skipped. The default without an id is stored as ROOT.
 */
export function readEntries(xml: string, tag: string, into: Map<string, Entry>): void {
  const pattern = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, "g");
  for (const [, attributes = "", body = ""] of stripXmlComments(xml).matchAll(pattern)) {
    const id = /\bid="([^"]*)"/.exec(attributes)?.[1] ?? (/\bdefault="1"/.test(attributes) ? ROOT : undefined);
    if (id === undefined) continue;
    const entry = into.get(id) ?? { fields: {}, tokens: {} };
    const parent = /\bparent="([^"]*)"/.exec(attributes)?.[1];
    if (parent !== undefined) entry.parent = parent;
    // A named default (default="1" with an id) is a parent for others, not a placeable doodad.
    if (/\bdefault="1"/.test(attributes)) entry.abstract = true;
    const own: Record<string, string[]> = {};
    for (const [, name = "", value = ""] of body.matchAll(/^ {8}<(\w+) value="([^"]*)"\/>/gm)) (own[name] ??= []).push(value);
    Object.assign(entry.fields, own);
    for (const [, token = "", value = ""] of body.matchAll(/<\?token id="([^"]+)" value="([^"]*)"\?>/g)) entry.tokens[token] = value;
    into.set(id, entry);
  }
}

/**
 * A field's values, looked up through an entry's parents and then (unless `root` is false) the
 * root default.
 */
export function resolve(entries: Map<string, Entry>, id: string, name: string, root = true): string[] | undefined {
  const seen = new Set<string>();
  for (let current: string | undefined = id; current !== undefined && !seen.has(current); ) {
    seen.add(current);
    const entry = entries.get(current);
    if (!entry) break;
    const value = entry.fields[name];
    if (value !== undefined) return value;
    current = current === ROOT ? undefined : (entry.parent ?? (root ? ROOT : undefined));
  }
  return undefined;
}

/** The ##tokens## in scope for an entry: its own, then its parents', then the root default's, the nearest winning. */
export function resolveTokens(entries: Map<string, Entry>, id: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const seen = new Set<string>();
  for (let current: string | undefined = id; current !== undefined && !seen.has(current); ) {
    seen.add(current);
    const entry = entries.get(current);
    if (!entry) break;
    for (const [token, value] of Object.entries(entry.tokens)) tokens[token] ??= value;
    current = current === ROOT ? undefined : (entry.parent ?? ROOT);
  }
  return tokens;
}

type FootprintFlag = "GroundNoSpawn" | "BoostCliff";
type FootprintSet = { character?: string; flags: Partial<Record<FootprintFlag, boolean>> };
/** A footprint's Place layer as the packages so far leave it: its sets, by index, and its rows. */
type PlaceLayer = { sets: FootprintSet[]; rows: string[] };

/**
 * Reads each footprint's Place layer into `layers` (id → layer), patching earlier packages'. A new
 * footprint starts from the default CFootprint's one set, set 0, which makes an x cell
 * GroundNoSpawn. A Sets or Rows with an index changes that one (a later package patches an earlier
 * footprint so); one without is added after the rest; anything a definition leaves out stays.
 */
function readFootprints(xml: string, layers: Map<string, PlaceLayer>): void {
  for (const [, attributes = "", body = ""] of stripXmlComments(xml).matchAll(/<CFootprint\b([^>]*?)(?:\/>|>([\s\S]*?)<\/CFootprint>)/g)) {
    const id = /\bid="([^"]*)"/.exec(attributes)?.[1];
    const place = /<Layers index="Place"[^>]*?(?:\/>|>([\s\S]*?)<\/Layers>)/.exec(body)?.[1];
    if (id === undefined || place === undefined) continue;
    const layer = layers.get(id) ?? { sets: [{ character: "x", flags: { GroundNoSpawn: true } }], rows: [] };
    for (const [, setAttributes = "", set = ""] of place.matchAll(/<Sets\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Sets>)/g)) {
      const index = Number(/\bindex="(\d+)"/.exec(setAttributes)?.[1] ?? layer.sets.length);
      const patched: FootprintSet = /\bremoved="1"/.test(setAttributes) ? { flags: {} } : (layer.sets[index] ?? { flags: {} });
      const character = /\bCharacter="(.)"/.exec(setAttributes)?.[1];
      if (character !== undefined) patched.character = character;
      for (const flag of ["GroundNoSpawn", "BoostCliff"] as const) {
        const value = new RegExp(`<Positive index="${flag}" value="(\\d)"`).exec(set)?.[1];
        if (value !== undefined) patched.flags[flag] = value === "1";
      }
      layer.sets[index] = patched;
    }
    for (const [, rowAttributes = "", row = ""] of place.matchAll(/<Rows\b([^>]*?)\bvalue="([^"]*)"/g)) {
      layer.rows[Number(/\bindex="(\d+)"/.exec(rowAttributes)?.[1] ?? layer.rows.length)] = row;
    }
    layers.set(id, layer);
  }
}

/**
 * Whether a footprint blocks ground: a cell of its Place layer is GroundNoSpawn and not BoostCliff,
 * by every set with the cell's character, a later set's flag winning. BoostCliff raises the ground
 * to the doodad's deck, so a cell with it is a walkable surface (catwalks, platforms, bridges) even
 * when it stays GroundNoSpawn. A footprint can turn x off by its own x set (by Character or as set
 * 0), as unbuildable patches and fences do.
 */
function blocksGround({ sets, rows }: PlaceLayer): boolean {
  const flags = new Map<string, FootprintSet["flags"]>();
  for (const set of sets) if (set?.character !== undefined) flags.set(set.character, { ...flags.get(set.character), ...set.flags });
  const blocks = (cell: string) => flags.get(cell)?.GroundNoSpawn === true && flags.get(cell)?.BoostCliff !== true;
  return rows.some((row) => [...(row ?? "")].some(blocks));
}

/** Every doodad the packages define, in id order. Pass the packages in load order. */
export function extractDoodads(packages: readonly GameDataPackage[]): Record<string, DoodadInfo> {
  const actors = new Map<string, Entry>();
  const models = new Map<string, Entry>();
  const footprints = new Map<string, PlaceLayer>();
  for (const pkg of packages) {
    if (pkg.footprintData) readFootprints(pkg.footprintData, footprints);
    if (pkg.actorData) readEntries(pkg.actorData, "CActorDoodad", actors);
    if (pkg.modelData) readEntries(pkg.modelData, "CModel", models);
  }
  const doodads: Record<string, DoodadInfo> = {};
  for (const id of [...actors.keys()].sort()) {
    if (actors.get(id)?.abstract) continue;
    const model = [resolve(actors, id, "Model")?.at(-1), id].find((candidate) => candidate && models.has(candidate));
    if (!model) continue;
    // The root default's categories (DoodadType:Props) aren't the doodad's own, so they're left out.
    const categories = resolve(actors, id, "EditorCategories", false)?.at(-1);
    const tilesets = resolve(actors, id, "TexSets");
    const footprint = footprints.get(resolve(actors, id, "Footprint")?.at(-1) ?? "");
    // Keys in alphabetical order.
    doodads[id] = {
      ...(footprint && blocksGround(footprint) ? { blocksGround: true } : {}),
      ...(categories ? { categories } : {}),
      kind: doodadKind(id),
      ...(tilesets ? { tilesets } : {}),
      variations: Number(resolve(models, model, "VariationCount")?.at(-1) ?? 1),
    };
  }
  return doodads;
}
