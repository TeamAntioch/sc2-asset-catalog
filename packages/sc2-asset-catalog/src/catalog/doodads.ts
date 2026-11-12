import { readFileSync } from "node:fs";
import path from "node:path";

// Every CActorDoodad with a model, from SC2Mapster/SC2GameData (patch 5.0.x): kind is a rough
// category from the id, tilesets are its TexSets, variations its model's VariationCount. Extracted
// into the cache's doodads.json by extract-doodads.ts (the `extract` command), beside each doodad's
// model file (storage path) in doodad-models.json.
export const DOODADS_FILE = "doodads.json";
export const DOODAD_MODELS_FILE = "doodad-models.json";

export type DoodadInfo = {
  readonly kind: string;
  readonly variations: number;
  readonly tilesets?: readonly string[];
  /** The footprint makes ground unpathable (rocks, statues); keep these off routes. A walkable deck's cells (catwalks, bridges) don't count. */
  readonly blocksGround?: boolean;
  readonly categories?: string;
};

/**
 * The doodads and models a mod lays over the game's, as lookups here read them: each doodad with
 * its model's variation count when the mod gives one.
 */
export type DoodadLayer = {
  readonly doodads: ReadonlyMap<string, { readonly variations?: number | undefined }>;
  readonly models: ReadonlySet<string>;
};

/** The game's doodads by id, as the extract command wrote them into `extractedDir`. */
export function readDoodads(extractedDir: string): Record<string, DoodadInfo> {
  return JSON.parse(readFileSync(path.join(extractedDir, DOODADS_FILE), "utf8")) as Record<string, DoodadInfo>;
}

/** Each game doodad's model file in the game's storage, e.g. Assets/Doodads/RockArch/RockArch.m3, as the extract command wrote them into `extractedDir`. */
export function readDoodadModels(extractedDir: string): Record<string, string> {
  return JSON.parse(readFileSync(path.join(extractedDir, DOODAD_MODELS_FILE), "utf8")) as Record<string, string>;
}

/**
 * A doodad type, the game's (`stock`, as readDoodads gives them) or a mod's (whose kind is
 * `campaign-mod`). A mod's doodad of a game id keeps the game's facts but its own model's
 * variations, when its model gives them.
 */
export function getDoodad(stock: Readonly<Record<string, DoodadInfo>>, layer: Pick<DoodadLayer, "doodads">, type: string): DoodadInfo | undefined {
  const game = Object.hasOwn(stock, type) ? stock[type] : undefined;
  const mod = layer.doodads.get(type);
  if (!mod) return game;
  return { ...(game ?? { kind: "campaign-mod" }), variations: mod.variations ?? game?.variations ?? 1 };
}

/** No mod's doodads: the game's alone. */
export const NO_DOODAD_LAYER: DoodadLayer = { doodads: new Map(), models: new Set() };

/** Throws if a doodad type doesn't exist or its variation is out of range (the Editor would show nothing). */
export function checkDoodad(stock: Readonly<Record<string, DoodadInfo>>, layer: Pick<DoodadLayer, "doodads">, anchorId: string, type: string | undefined, variation: number | undefined): void {
  if (!type) throw new Error(`Doodad anchor ${anchorId} has no doodadType`);
  const info = getDoodad(stock, layer, type);
  if (!info) throw new Error(`Doodad anchor ${anchorId}: unknown doodad type "${type}"`);
  if (variation !== undefined && (variation < 0 || variation >= info.variations)) {
    throw new Error(`Doodad anchor ${anchorId}: ${type} has variations 0-${info.variations - 1}, not ${variation}`);
  }
}

/**
 * A warning for each type an Objects file (`objectsXml`, the Editor's placed objects) places as a
 * doodad that isn't a doodad type of the game's (`stock`) or the mod's (`layer`): the Editor logs "Invalid placed doodad" and shows a placeholder model for each
 * copy, and its palette doesn't list the type. A doodad type is a CActorDoodad; a CModel of the id
 * with no actor is the usual cause, and the warning says so. Objects whose Id is in `skip` (the
 * caller's own) are left out.
 */
export function unknownPlacedDoodads(objectsXml: string, stock: Readonly<Record<string, DoodadInfo>>, layer: DoodadLayer, skip: ReadonlySet<number> = new Set()): string[] {
  const placed = new Map<string, { count: number; at: string }>();
  for (const [tag] of objectsXml.matchAll(/<ObjectDoodad\b[^>]*>/g)) {
    if (skip.has(Number(/\bId="(\d+)"/.exec(tag)?.[1]))) continue;
    const type = /\bType="([^"]*)"/.exec(tag)?.[1];
    if (type === undefined || getDoodad(stock, layer, type)) continue;
    const known = placed.get(type);
    if (known) known.count++;
    else placed.set(type, { count: 1, at: /\bPosition="([^"]*)"/.exec(tag)?.[1] ?? "?" });
  }
  return [...placed].map(([type, { count, at }]) => {
    const copies = `${count === 1 ? "a copy" : `${count} copies`} of ${type} (${count === 1 ? "at" : "the first at"} ${at.split(",").map((value) => Number(value).toString()).join(", ")})`;
    if (layer.models.has(type)) {
      return `Objects places ${copies}, which isn't a doodad type: there is a CModel ${type} but no CActorDoodad of that id, and a doodad type is its actor, so the Editor shows a placeholder model and its palette leaves it out. Give it a CActorDoodad of that id`;
    }
    return `Objects places ${copies}, a doodad type that isn't among the game's doodads, the mod's or the map's data. If a game mod the map doesn't depend on defines it, add that dependency; if no CActorDoodad defines it, the Editor shows a placeholder model: give it a CActorDoodad in the map's or the mod's data`;
  });
}
