// Synthetic catalogs for the Doodad Finder's tests: no campaign content.
import type { DoodadSearchSources } from "@teamantioch/sc2-asset-catalog/catalog/doodad-search.js";

export const VOID_CAMPAIGN = "bnet:Void (Campaign)/0.0/999,file:Campaigns/Void.SC2Campaign";

export const DOODADS: DoodadSearchSources["doodads"] = {
  FoundryStamperHead: {
    name: "Foundry Stamper Head",
    package: "campaigns/void.sc2campaign",
    variations: 3,
    tilesets: ["Foundry"],
    description: { look: "heavy steel press head on a piston", kind: "built", size: "medium", role: "prop", story: ["industry"], biome: ["urban"] },
    uses: [{ use: "crusher press head over a belt", variation: 1, from: "a test search, 2026-01-01" }],
  },
  FoundryPressFrame: {
    name: "Foundry Press Frame",
    package: "mods/liberty.sc2mod",
    variations: 1,
    description: { look: "open steel gantry frame for a press", kind: "built", size: "large", role: "structure", story: ["industry"], biome: ["any"] },
  },
  SupplyCrate: {
    name: "Supply Crate",
    package: "campaigns/voidstory.sc2campaign",
    variations: 2,
    description: { look: "stackable steel box with handles", kind: "built", size: "small", role: "clutter", story: ["military", "terran"], biome: ["any"] },
  },
  Sandbags: {
    name: "Sandbags",
    package: "campaigns/voidstory.sc2campaign",
    variations: 1,
    description: { look: "low curved wall of piled sacks", kind: "built", size: "small", role: "prop", story: ["military"], biome: ["any"] },
  },
  MossyBoulder: {
    name: "Mossy Boulder",
    package: "campaigns/voidstory.sc2campaign",
    variations: 4,
    description: { look: "round boulder under moss", kind: "natural", size: "medium", role: "prop", story: ["wild"], biome: ["jungle"] },
  },
  BlinkingLightRed: { name: "Blinking Light Red", package: "mods/liberty.sc2mod", variations: 1 },
};

export const TERRAIN_OBJECTS: DoodadSearchSources["terrainObjects"] = {
  FoundryPressPit0: {
    name: "Foundry Press Pit (Height 0)",
    package: "mods/liberty.sc2mod",
    model: "Assets/TerrainObjects/FoundryPressPit/FoundryPressPit.m3",
    tileset: "Foundry",
    description: { look: "sunken pit under a press, edged in hazard stripes", kind: "built", use: "pit", story: ["industry"], biome: ["urban"] },
  },
};

/** A mod's doodads, laid over the stock catalogs: one described doodad and one pending. */
export const MOD: NonNullable<DoodadSearchSources["modDoodads"]> = new Map([
  ["LanternBuoy", { variations: 2, pending: true }],
  [
    "HullPlate",
    {
      name: "Hull Plate",
      description: { look: "riveted grey hull plate", kind: "built", size: "medium", role: "prop", story: ["starship"], biome: ["space"] },
      uses: [{ use: "bulkhead panel" }],
      variations: 1,
    },
  ],
]);

export const sources = (overrides: Partial<DoodadSearchSources> = {}): DoodadSearchSources => ({ doodads: DOODADS, terrainObjects: TERRAIN_OBJECTS, root: "/nowhere", ...overrides });
