// The tilesets as TerrainData.xml defines them: each CTerrain's fields (CliffSets, BlendTextures, …),
// read from every SC2GameData package in load order (a later package overrides an earlier one by
// id) and resolved through the tileset's parents, as the Editor resolves them. A template tileset
// (default="1" with an id) names its own values "##id##_1"…, filled in with each tileset's id.

import { type Entry, readEntries, resolve, ROOT, SC2_GAME_DATA_PACKAGES, SC2_GAME_DATA_URL } from "./extract-doodads.js";

/** The tilesets of these TerrainData.xml files (in load order), keyed by id; the root default is kept for resolving. */
export function readTerrainTilesets(terrainData: readonly string[]): Map<string, Entry> {
  const tilesets = new Map<string, Entry>();
  for (const xml of terrainData) readEntries(xml, "CTerrain", tilesets);
  return tilesets;
}

/** Every tileset id, the root default left out, in id order. */
export const terrainTilesetIds = (tilesets: ReadonlyMap<string, Entry>): string[] => [...tilesets.keys()].filter((id) => id !== ROOT).sort((a, b) => a.localeCompare(b));

/** A tileset's values for a field, resolved through its parents and then the root default, with ##id## filled in; undefined when no tileset in its chain sets it. */
export function tilesetField(tilesets: Map<string, Entry>, id: string, field: string): string[] | undefined {
  return resolve(tilesets, id, field)?.map((value) => value.replaceAll("##id##", id));
}

/** Each package's TerrainData.xml, in load order, from SC2GameData; a package without one is skipped. */
export async function fetchTerrainData({
  fetch = globalThis.fetch,
  packages = SC2_GAME_DATA_PACKAGES,
}: { readonly fetch?: typeof globalThis.fetch; readonly packages?: readonly string[] } = {}): Promise<string[]> {
  const files = await Promise.all(
    packages.map(async (name) => {
      const response = await fetch(`${SC2_GAME_DATA_URL}/${name}/base.sc2data/GameData/TerrainData.xml`);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`${name} TerrainData.xml: HTTP ${response.status}`);
      return response.text();
    }),
  );
  return files.filter((xml): xml is string => xml !== undefined);
}
