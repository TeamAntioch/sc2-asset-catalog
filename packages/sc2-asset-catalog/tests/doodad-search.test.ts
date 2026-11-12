// The keyword and facet search (src/catalog/doodad-search.ts) over the game's doodads, terrain
// objects and a mod's doodads, over synthetic catalogs.
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { allDoodadEntries, doodadPictures, type DoodadSearchSources, lookUpDoodads, matchDoodads, missingSheets, type SearchableModDoodad, searchDoodads } from "../src/catalog/doodad-search.js";

const VOID_CAMPAIGN = "bnet:Void (Campaign)/0.0/999,file:Campaigns/Void.SC2Campaign";
const VOID_STORY = "bnet:Void Story (Campaign)/0.0/999,file:Campaigns/VoidStory.SC2Campaign";

const DOODADS: DoodadSearchSources["doodads"] = {
  FoundryStamperHead: {
    name: "Foundry Stamper Head",
    package: "campaigns/swarm.sc2campaign",
    variations: 3,
    image: "Foundry_Stamper_Head.jpg",
    sheet: "catalog-sheets/doodads/FoundryStamperHead.jpg",
    description: { look: "heavy steel press head on a piston", kind: "built", size: "medium", role: "prop", story: ["industry"], biome: ["urban"] },
  },
  FoundryPressFrame: {
    name: "Foundry Press Frame",
    package: "mods/liberty.sc2mod",
    variations: 1,
    description: { look: "open steel gantry frame for a press", kind: "built", size: "large", role: "structure", story: ["industry"], biome: ["any"] },
  },
  StoryPressTank: {
    name: "Story Press Tank",
    package: "campaigns/voidstory.sc2campaign",
    variations: 2,
    description: { look: "squat tank of press fluid", kind: "built", size: "small", role: "prop", story: ["industry"], biome: ["space"] },
  },
  MossyBoulder: {
    name: "Mossy Boulder",
    package: "mods/liberty.sc2mod",
    variations: 4,
    image: "Mossy_Boulder.jpg",
    description: { look: "round boulder under moss, pressed into the soil", kind: "natural", size: "medium", role: "prop", story: ["wild"], biome: ["jungle"] },
  },
};

/** A game doodad a mod may stand in for. */
const ACID_SPLASH: DoodadSearchSources["doodads"] = {
  AcidSplash: { name: "Acid Splash", variations: 1, description: { look: "splash of green acid", kind: "natural", size: "small", role: "effect", story: [], biome: ["any"] } },
};

const TERRAIN_OBJECTS: DoodadSearchSources["terrainObjects"] = {
  FoundryPressPit0: {
    name: "Foundry Press Pit (Height 0)",
    package: "campaigns/liberty.sc2campaign",
    model: "Assets/TerrainObjects/FoundryPressPit/FoundryPressPit.m3",
    description: { look: "sunken pit under a press, edged in hazard stripes", kind: "built", use: "pit", story: ["industry"], biome: ["urban"] },
  },
};

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

const sources = async (overrides: Partial<DoodadSearchSources> = {}): Promise<DoodadSearchSources> => {
  // Real, as sheet paths are: the system's temporary folder may be a link (macOS's /var).
  root ??= await realpath(await mkdtemp(path.join(tmpdir(), "doodad-search-")));
  return { doodads: DOODADS, terrainObjects: TERRAIN_OBJECTS, root, ...overrides };
};
const ids = (found: { results: readonly { id: string }[] }) => found.results.map((result) => result.id);

describe("searchDoodads", () => {
  it("finds doodads and terrain objects by keyword in their name, id or look, the most words matched first, narrowed by facets", async () => {
    const from = await sources();
    // Both words: the stamper head (press head) first; one word: the rest, by id.
    expect(ids(searchDoodads({ words: ["press", "head"] }, from))).toEqual(["FoundryStamperHead", "FoundryPressFrame", "FoundryPressPit0", "MossyBoulder", "StoryPressTank"]);
    // A word matches an id's camel-case words: "stamper" finds FoundryStamperHead.
    expect(ids(searchDoodads({ words: ["stamper"] }, from))).toEqual(["FoundryStamperHead"]);
    // "pressed" is a form of "press", so the boulder matches too, until a facet narrows it out.
    expect(ids(searchDoodads({ words: ["press"] }, from))).toContain("MossyBoulder");
    expect(ids(searchDoodads({ words: ["press"], kind: "built", size: "medium" }, from))).toEqual(["FoundryStamperHead"]);
    expect(ids(searchDoodads({ words: ["press"], role: ["structure"] }, from))).toEqual(["FoundryPressFrame"]);
    // Roles, like stories and biomes, take several: any of them.
    expect(ids(searchDoodads({ words: ["press"], role: ["structure", "clutter"] }, from))).toEqual(["FoundryPressFrame"]);
    expect(ids(searchDoodads({ role: ["structure", "prop"], story: ["industry"] }, from))).toEqual(["FoundryPressFrame", "FoundryStamperHead", "StoryPressTank"]);
    expect(ids(searchDoodads({ story: ["wild"] }, from))).toEqual(["MossyBoulder"]);
    // A doodad for any biome fits every biome; a terrain object has no size or role.
    expect(ids(searchDoodads({ words: ["press"], biome: ["urban"] }, from))).toEqual(["FoundryPressFrame", "FoundryPressPit0", "FoundryStamperHead"]);
    expect(ids(searchDoodads({ package: "campaigns/liberty.sc2campaign" }, from))).toEqual(["FoundryPressPit0"]);
    const limited = searchDoodads({ words: ["press"], limit: 2 }, from);
    expect(limited.results).toHaveLength(2);
    expect(limited.total).toBe(5);
  });

  it("gives a hundred results when a query asks for a hundred, as the Doodad Finder's narrowing does (docs/adr/0001)", async () => {
    const crates = Object.fromEntries(
      Array.from({ length: 150 }, (_, i) => [`Crate${String(i).padStart(3, "0")}`, { name: `Crate ${i}`, variations: 1, description: { look: "steel supply crate", kind: "built", size: "small", role: "prop", story: [], biome: ["any"] } }]),
    ) as DoodadSearchSources["doodads"];
    const found = searchDoodads({ words: ["crate"], limit: 100 }, await sources({ doodads: crates }));
    expect(found.results).toHaveLength(100);
    expect(found.total).toBe(150);
  });

  it("matches whole words and their plurals and inflections, not longer words that start with them, unless the word ends in *", async () => {
    const from = await sources({
      doodads: {
        CargoCrate: { name: "Cargo Crate", variations: 1, description: { look: "stack of crates on a pallet", kind: "built", size: "small", role: "prop", story: ["terran"], biome: ["any"] } },
        ZergNest: { name: "Zerg Nest", variations: 1, description: { look: "nest in a crater of creep", kind: "creature", size: "large", role: "structure", story: ["zerg"], biome: ["any"] } },
        HydraulicPress: { name: "Hydraulic Press", variations: 1, description: { look: "presses pressed sheet metal", kind: "built", size: "large", role: "structure", story: ["industry"], biome: ["urban"] } },
        PipeRun: { name: "Pipe Run", variations: 1, description: { look: "boxes of piping beside a stopped valve", kind: "built", size: "medium", role: "clutter", story: ["industry"], biome: ["urban"] } },
      },
      terrainObjects: {},
    });
    // "crate" finds crates, not the crater under a nest.
    expect(ids(searchDoodads({ words: ["crate"] }, from))).toEqual(["CargoCrate"]);
    expect(ids(searchDoodads({ words: ["crates"] }, from))).toEqual(["CargoCrate"]);
    expect(ids(searchDoodads({ words: ["crater"] }, from))).toEqual(["ZergNest"]);
    // Plurals in -es and -s, and verbs in -ed and -ing, in either direction.
    expect(ids(searchDoodads({ words: ["pressing"] }, from))).toEqual(["HydraulicPress"]);
    expect(ids(searchDoodads({ words: ["box"] }, from))).toEqual(["PipeRun"]);
    expect(ids(searchDoodads({ words: ["pipes"] }, from))).toEqual(["PipeRun"]);
    expect(ids(searchDoodads({ words: ["stop"] }, from))).toEqual(["PipeRun"]);
    // No prefix match by default; a trailing * asks for one.
    expect(ids(searchDoodads({ words: ["hydra"] }, from))).toEqual([]);
    expect(ids(searchDoodads({ words: ["hydra*"] }, from))).toEqual(["HydraulicPress"]);
    // A word of several words matches them in a row.
    expect(ids(searchDoodads({ words: ["sheet metal"] }, from))).toEqual(["HydraulicPress"]);
    expect(ids(searchDoodads({ words: ["metal sheet"] }, from))).toEqual([]);
    // A word with no letters or digits matches nothing, rather than dropping the keyword filter.
    expect(ids(searchDoodads({ words: ["*"] }, from))).toEqual([]);
  });

  it("doesn't cut a short word down to another word: thing isn't the, seed isn't see, inns isn't in", async () => {
    const from = await sources({
      doodads: {
        Signpost: { name: "Signpost", variations: 1, description: { look: "the sign we see by the inns", kind: "built", size: "small", role: "prop", story: ["terran"], biome: ["any"] } },
      },
      terrainObjects: {},
    });
    for (const word of ["thing", "seed", "in", "shed"]) expect(ids(searchDoodads({ words: [word] }, from)), word).toEqual([]);
    expect(ids(searchDoodads({ words: ["signs"] }, from))).toEqual(["Signpost"]);
    expect(ids(searchDoodads({ words: ["inn"] }, from))).toEqual(["Signpost"]);
    // Stories and biomes match whatever their case.
    expect(ids(searchDoodads({ story: ["Terran"], biome: ["URBAN"] }, from))).toEqual(["Signpost"]);
  });

  it("labels each result with the dependency it needs, and with a map's dependencies puts the ones its dependencies already bring in first", async () => {
    const from = await sources();
    const plain = searchDoodads({ words: ["press"], kind: "built" }, from).results;
    expect(plain.map(({ id, dependency }) => [id, dependency])).toEqual([
      ["FoundryPressFrame", undefined],
      ["FoundryPressPit0", VOID_CAMPAIGN],
      ["FoundryStamperHead", VOID_CAMPAIGN],
      ["StoryPressTank", VOID_STORY],
    ]);
    expect(plain.every((result) => result.provided === undefined)).toBe(true);

    // A map with the Void campaign has the base mods' and the campaign's doodads, not the story's.
    const campaign = searchDoodads({ words: ["press", "head"], kind: "built", dependencies: [VOID_CAMPAIGN] }, from).results;
    expect(campaign.map(({ id, provided }) => [id, provided])).toEqual([
      ["FoundryStamperHead", true],
      ["FoundryPressFrame", true],
      ["FoundryPressPit0", true],
      ["StoryPressTank", false],
    ]);
    // Void Story brings in the Void campaign, so all of them; with neither, only the base mods' come first, ahead of a better match.
    expect(searchDoodads({ words: ["press"], kind: "built", dependencies: [VOID_STORY] }, from).results.every((result) => result.provided)).toBe(true);
    expect(ids(searchDoodads({ words: ["press", "head"], kind: "built", dependencies: [] }, from))).toEqual(["FoundryPressFrame", "FoundryStamperHead", "FoundryPressPit0", "StoryPressTank"]);
  });

  it("finds a mod's doodads with no description by name and id alone, needing no dependency, and none when the query has a facet", async () => {
    const modDoodads = new Map([
      ["LanternPressRig", { variations: 2, pending: true as const }],
      ["LanternBuoy", { variations: 1 }],
    ]);
    const from = await sources({ modDoodads });
    const rig = searchDoodads({ words: ["press"], dependencies: [] }, from).results.find((result) => result.id === "LanternPressRig");
    expect(rig).toEqual({ id: "LanternPressRig", name: "LanternPressRig", source: "mod", uses: [], variations: 2, picture: { kind: "none" }, hasRenders: false, pending: true, provided: true, score: 1 });
    expect(ids(searchDoodads({ words: ["buoy"] }, from))).toEqual(["LanternBuoy"]);
    expect(ids(searchDoodads({ words: ["press"], kind: "built" }, from))).not.toContain("LanternPressRig");
  });

  it("matches a mod doodad on its own description and Doodad Uses, pictured by its sheet, and lets one of a game doodad's id stand in for it", async () => {
    const from = await sources();
    const sheet = path.join(from.root, "mods", "lantern", "LanternPressRig.jpg");
    await mkdir(path.dirname(sheet), { recursive: true });
    await writeFile(sheet, "sheet");
    const rig = { look: "chain-hung lamp frame over a press bed", kind: "built", size: "large", role: "structure", story: ["industry"], biome: ["urban"] } as const;
    const modDoodads = new Map<string, SearchableModDoodad>([
      ["LanternPressRig", { name: "(Lantern) Press Rig", variations: 2, sheet, description: rig, uses: [{ use: "hanging lamp rig" }] }],
      ["LanternBlocker", { variations: 1, pending: true, unpictured: "no model file to draw" }],
      ["AcidSplash", { variations: 1, description: { look: "rusted press gantry, patched with plates", kind: "built", size: "large", role: "structure", story: ["industry"], biome: ["urban"] } }],
    ]);
    // A look the notes gave it before it had a description gives way to its own.
    const layered = { ...from, doodads: { ...DOODADS, ...ACID_SPLASH }, modDoodads, notes: { LanternPressRig: { look: "an old note's look" } } };
    const search = (query: Parameters<typeof searchDoodads>[0]) => searchDoodads(query, layered);

    const [found] = search({ words: ["lamp"], role: ["structure"], biome: ["urban"] }).results;
    expect(found).toEqual({
      id: "LanternPressRig",
      name: "(Lantern) Press Rig",
      source: "mod",
      description: rig,
      uses: [{ use: "hanging lamp rig" }],
      variations: 2,
      picture: { kind: "sheet", path: sheet },
      hasRenders: false,
      score: 1,
    });
    expect(ids(search({ words: ["hanging"] }))).toEqual(["LanternPressRig"]);
    expect(lookUpDoodads(["LanternBlocker"], layered).get("LanternBlocker")).toMatchObject({ pending: true, unpictured: "no model file to draw" });
    // The game's entry is gone: its look no longer matches, and the id finds the mod's.
    expect(search({ words: ["gantry"] }).results.flatMap(({ id, source }) => (id === "AcidSplash" ? [source] : []))).toEqual(["mod"]);
    expect(ids(search({ words: ["splash of green"] }))).toEqual([]);
  });

  it("pictures each result by its sheet when this machine has one, else its gallery picture, else none, and says whether the renders for a sheet are here", async () => {
    const from = await sources();
    const pictures = () => Object.fromEntries(searchDoodads({ words: ["press"] }, from).results.map(({ id, picture, hasRenders }) => [id, [picture, hasRenders]]));
    // No sheet built here: the stamper head falls back to its gallery picture; the frame and tank have none.
    expect(pictures()).toMatchObject({
      FoundryStamperHead: [{ kind: "image", url: "https://raw.githubusercontent.com/TeamAntioch/sc2-mapping-reference/main/public/doodads/Foundry_Stamper_Head.jpg" }, false],
      FoundryPressFrame: [{ kind: "none" }, false],
      StoryPressTank: [{ kind: "none" }, false],
    });

    const sheet = path.join(from.root, "catalog-sheets/doodads/FoundryStamperHead.jpg");
    await mkdir(path.dirname(sheet), { recursive: true });
    await writeFile(sheet, "sheet");
    // The frame's renders (variation 00, four angles) are here but no sheet: it can be built.
    await mkdir(path.join(from.root, "thumbnails/doodads"), { recursive: true });
    for (const angle of [0, 1, 2, 3]) await writeFile(path.join(from.root, `thumbnails/doodads/FoundryPressFrame_00_a${angle}.png`), "render");
    // Three of the tank's four aren't enough; a terrain object's renders are named by its model.
    for (const angle of [0, 1, 2]) await writeFile(path.join(from.root, `thumbnails/doodads/StoryPressTank_00_a${angle}.png`), "render");
    await mkdir(path.join(from.root, "thumbnails/terrain-objects"), { recursive: true });
    for (const angle of [0, 1, 2, 3]) await writeFile(path.join(from.root, `thumbnails/terrain-objects/FoundryPressPit_00_a${angle}.png`), "render");

    expect(pictures()).toMatchObject({
      FoundryStamperHead: [{ kind: "sheet", path: sheet }, false],
      FoundryPressFrame: [{ kind: "none" }, true],
      StoryPressTank: [{ kind: "none" }, false],
      FoundryPressPit0: [{ kind: "none" }, true],
    });
  });

  it("merges the notes' Doodad Uses and look corrections, which match like the catalog's own words", async () => {
    const modDoodads = new Map([["LanternBuoy", { variations: 1, pending: true as const }]]);
    const notes = {
      FoundryPressFrame: { uses: [{ use: "crusher frame over a conveyor belt", variation: 2, scale: 1.5 }] },
      LanternBuoy: { look: "rusted marker float with a lamp" },
      StoryPressTank: { look: "squat tank of hydraulic fluid" },
    };
    const from = await sources({ modDoodads, notes });
    const conveyor = searchDoodads({ words: ["conveyor"] }, from).results;
    expect(conveyor.map(({ id, uses }) => [id, uses])).toEqual([["FoundryPressFrame", [{ use: "crusher frame over a conveyor belt", variation: 2, scale: 1.5 }]]]);
    // A mod doodad with a look from the notes matches by it, and is still unpictured.
    const lamp = searchDoodads({ words: ["lamp"] }, from).results;
    expect(lamp.map(({ id, description, picture }) => [id, description, picture])).toEqual([["LanternBuoy", { look: "rusted marker float with a lamp" }, { kind: "none" }]]);
    // A corrected look replaces the catalog's.
    expect(ids(searchDoodads({ words: ["hydraulic"] }, from))).toEqual(["StoryPressTank"]);
    expect(searchDoodads({ words: ["hydraulic"] }, from).results[0]!.description).toMatchObject({ look: "squat tank of hydraulic fluid", size: "small" });
  });

  it("gives the catalog's Doodad Uses, then the notes' not already among them (case and spacing aside), and matches words in both", async () => {
    const frame = DOODADS.FoundryPressFrame!;
    const doodads = { ...DOODADS, FoundryPressFrame: { ...frame, uses: [{ use: "gantry over a belt", variation: 3, from: "a gantry search, 2026-11-09" }] } };
    const from = await sources({ doodads, notes: { FoundryPressFrame: { uses: [{ use: "Gantry over a  belt" }, { use: "crane rail support", scale: 2 }] } } });
    expect(searchDoodads({ words: ["belt"] }, from).results.map(({ id, uses }) => [id, uses])).toEqual([
      ["FoundryPressFrame", [{ use: "gantry over a belt", variation: 3, from: "a gantry search, 2026-11-09" }, { use: "crane rail support", scale: 2 }]],
    ]);
    expect(ids(searchDoodads({ words: ["crane"] }, from))).toEqual(["FoundryPressFrame"]);
    // The uses aren't part of the description the search gives.
    expect(searchDoodads({ words: ["belt"] }, from).results[0]!.description).not.toHaveProperty("uses");
  });
});

describe("matchDoodads", () => {
  it("gives every match in the search's order, uncut and unpictured, for the Doodad Finder to filter before it cuts (docs/adr/0001)", async () => {
    const from = await sources();
    const matches = matchDoodads({ words: ["press", "head"], limit: 2 }, from);
    expect(matches.map(({ id }) => id)).toEqual(ids(searchDoodads({ words: ["press", "head"] }, from)));
    expect(matches[0]).toMatchObject({ id: "FoundryStamperHead", score: 2 });
    expect(matches[0]).not.toHaveProperty("picture");
  });
});

describe("allDoodadEntries", () => {
  it("gives every doodad, terrain object and mod doodad as a search describes it, unpictured, with its tilesets, for the Doodad Finder's cards (docs/adr/0001)", async () => {
    const modDoodads = new Map([["LanternBuoy", { variations: 2, pending: true as const }]]);
    const from = await sources({
      doodads: { ...DOODADS, FoundryPressFrame: { ...DOODADS.FoundryPressFrame!, tilesets: ["Foundry", "Char"] } },
      terrainObjects: { FoundryPressPit0: { ...TERRAIN_OBJECTS.FoundryPressPit0!, tileset: "Foundry" } },
      modDoodads,
      notes: { FoundryPressFrame: { uses: [{ use: "crusher frame" }] } },
    });
    const entries = new Map([...allDoodadEntries(from, [VOID_STORY])].map((entry) => [entry.id, entry]));
    expect([...entries.keys()].sort()).toEqual(["FoundryPressFrame", "FoundryPressPit0", "FoundryStamperHead", "LanternBuoy", "MossyBoulder", "StoryPressTank"]);
    expect(entries.get("FoundryPressFrame")).toMatchObject({ tilesets: ["Foundry", "Char"], uses: [{ use: "crusher frame" }], provided: true });
    expect(entries.get("FoundryPressPit0")).toMatchObject({ source: "terrain-object", tilesets: ["Foundry"] });
    expect(entries.get("LanternBuoy")).toMatchObject({ source: "mod", pending: true });
    expect(entries.get("FoundryStamperHead")).not.toHaveProperty("picture");
  });
});

describe("lookUpDoodads", () => {
  it("gives each id's result as a search would, notes merged and dependencies marked, and leaves out ids no catalog has", async () => {
    const modDoodads = new Map([["LanternBuoy", { variations: 2, pending: true as const }]]);
    const from = await sources({ modDoodads, notes: { FoundryPressFrame: { uses: [{ use: "crusher frame" }] } } });
    const found = lookUpDoodads(["FoundryStamperHead", "FoundryPressFrame", "FoundryPressPit0", "LanternBuoy", "NoSuchDoodad"], from, [VOID_STORY]);
    expect([...found.keys()]).toEqual(["FoundryStamperHead", "FoundryPressFrame", "FoundryPressPit0", "LanternBuoy"]);
    expect(found.get("FoundryStamperHead")).toMatchObject({ name: "Foundry Stamper Head", variations: 3, dependency: VOID_CAMPAIGN, provided: true, description: { size: "medium" } });
    expect(found.get("FoundryPressFrame")).toMatchObject({ uses: [{ use: "crusher frame" }], provided: true });
    expect(found.get("FoundryPressFrame")).not.toHaveProperty("dependency");
    expect(found.get("LanternBuoy")).toMatchObject({ source: "mod", variations: 2, picture: { kind: "none" } });
    expect(lookUpDoodads(["FoundryStamperHead"], from).get("FoundryStamperHead")).not.toHaveProperty("provided");
  });

  it("finds a sheet where the sheet builder puts it, though the catalog entry names none", async () => {
    const from = await sources();
    const sheet = path.join(from.root, "catalog-sheets/doodads/FoundryPressFrame.jpg");
    await mkdir(path.dirname(sheet), { recursive: true });
    await writeFile(sheet, "sheet");
    expect(lookUpDoodads(["FoundryPressFrame"], from).get("FoundryPressFrame")?.picture).toEqual({ kind: "sheet", path: sheet });
  });

  it("gives a sheet by its real path, so a page still finds it when the sheets folder is a link that goes away (a worktree's)", async () => {
    const from = await sources();
    const real = path.join(from.root, "main/catalog-sheets");
    await mkdir(path.join(real, "doodads"), { recursive: true });
    await writeFile(path.join(real, "doodads/FoundryPressFrame.jpg"), "sheet");
    const worktree = path.join(from.root, "worktree");
    await mkdir(worktree, { recursive: true });
    await symlink(real, path.join(worktree, "catalog-sheets"), "junction");
    const picture = lookUpDoodads(["FoundryPressFrame"], { ...from, root: worktree }).get("FoundryPressFrame")?.picture;
    expect(picture).toEqual({ kind: "sheet", path: path.join(real, "doodads/FoundryPressFrame.jpg") });
  });
});

describe("doodadPictures", () => {
  it("gives each id's picture as lookUpDoodads does, leaving out ids no catalog has", async () => {
    const from = await sources();
    const sheet = path.join(from.root, "catalog-sheets/doodads/FoundryPressFrame.jpg");
    await mkdir(path.dirname(sheet), { recursive: true });
    await writeFile(sheet, "sheet");
    const ids = ["FoundryPressFrame", "MossyBoulder", "StoryPressTank", "FoundryPressPit0", "NoSuchDoodad"];
    const looked = lookUpDoodads(ids, from);
    expect(doodadPictures(ids, from)).toEqual(new Map([...looked].map(([id, result]) => [id, result.picture])));
  });
});

describe("missingSheets", () => {
  it("names the candidates whose four renders are here but whose sheet isn't, with the renders and where the sheet goes; one sheet per terrain-object model", async () => {
    const from = await sources({
      terrainObjects: { ...TERRAIN_OBJECTS, FoundryPressPit1: { ...TERRAIN_OBJECTS.FoundryPressPit0!, name: "Foundry Press Pit (Height 1)" } },
    });
    const render = async (folder: string, name: string, angles = [0, 1, 2, 3]) => {
      await mkdir(path.join(from.root, folder), { recursive: true });
      for (const angle of angles) await writeFile(path.join(from.root, folder, `${name}_00_a${angle}.png`), "render");
    };
    await render("thumbnails/doodads", "FoundryPressFrame");
    await render("thumbnails/doodads", "FoundryStamperHead");
    await render("thumbnails/doodads", "StoryPressTank", [0, 1]);
    await render("thumbnails/terrain-objects", "FoundryPressPit");
    // The stamper head's sheet is built already.
    await mkdir(path.join(from.root, "catalog-sheets/doodads"), { recursive: true });
    await writeFile(path.join(from.root, "catalog-sheets/doodads/FoundryStamperHead.jpg"), "sheet");

    const missing = missingSheets(["FoundryPressFrame", "FoundryStamperHead", "StoryPressTank", "FoundryPressPit0", "FoundryPressPit1", "MossyBoulder", "NoSuchDoodad"], from);
    expect(missing).toEqual([
      {
        ids: ["FoundryPressFrame"],
        renders: [0, 1, 2, 3].map((angle) => path.join(from.root, `thumbnails/doodads/FoundryPressFrame_00_a${angle}.png`)),
        sheet: path.join(from.root, "catalog-sheets/doodads/FoundryPressFrame.jpg"),
      },
      {
        ids: ["FoundryPressPit0", "FoundryPressPit1"],
        renders: [0, 1, 2, 3].map((angle) => path.join(from.root, `thumbnails/terrain-objects/FoundryPressPit_00_a${angle}.png`)),
        sheet: path.join(from.root, "catalog-sheets/terrain-objects/FoundryPressPit.jpg"),
      },
    ]);
  });
});

describe("pictures found elsewhere", () => {
  /** Two folders, as a caller keeping pictures beside another checkout has them, and the fallback that maps one's paths to the other's. */
  async function folders(): Promise<{ main: string; worktree: string; pictureFallback: (file: string) => string | undefined }> {
    const from = await sources();
    const main = path.join(from.root, "main");
    const worktree = path.join(from.root, "worktree");
    await mkdir(main, { recursive: true });
    await mkdir(worktree, { recursive: true });
    const pictureFallback = (file: string) => (file.startsWith(worktree + path.sep) ? path.join(main, path.relative(worktree, file)) : undefined);
    return { main, worktree, pictureFallback };
  }
  const put = async (file: string, text: string) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  const renders = (folder: string, name: string) => [0, 1, 2, 3].map((angle) => path.join(folder, `thumbnails/doodads/${name}_00_a${angle}.png`));

  it("finds a sheet and renders where the sources' pictureFallback says, when the root has none", async () => {
    const { main, worktree, pictureFallback } = await folders();
    const sheet = path.join(main, "catalog-sheets/doodads/FoundryPressFrame.jpg");
    await put(sheet, "sheet");
    for (const render of renders(main, "FoundryPressFrame")) await put(render, "render");
    const found = lookUpDoodads(["FoundryPressFrame"], { ...(await sources()), root: worktree, pictureFallback }).get("FoundryPressFrame");
    expect(found?.picture).toEqual({ kind: "sheet", path: sheet });
    expect(found?.hasRenders).toBe(true);
  });

  it("looks nowhere but the root without one", async () => {
    const { main, worktree } = await folders();
    await put(path.join(main, "catalog-sheets/doodads/FoundryPressFrame.jpg"), "sheet");
    for (const render of renders(main, "FoundryPressFrame")) await put(render, "render");
    const found = lookUpDoodads(["FoundryPressFrame"], { ...(await sources()), root: worktree }).get("FoundryPressFrame");
    expect(found?.picture).toEqual({ kind: "none" });
    expect(found?.hasRenders).toBe(false);
  });

  it("prefers the root's own sheet", async () => {
    const { main, worktree, pictureFallback } = await folders();
    await put(path.join(main, "catalog-sheets/doodads/FoundryPressFrame.jpg"), "main");
    const own = path.join(worktree, "catalog-sheets/doodads/FoundryPressFrame.jpg");
    await put(own, "own");
    expect(lookUpDoodads(["FoundryPressFrame"], { ...(await sources()), root: worktree, pictureFallback }).get("FoundryPressFrame")?.picture).toEqual({ kind: "sheet", path: own });
  });

  it("builds a missing sheet from renders found elsewhere beside them", async () => {
    const { main, worktree, pictureFallback } = await folders();
    for (const render of renders(main, "FoundryPressFrame")) await put(render, "render");
    expect(missingSheets(["FoundryPressFrame"], { ...(await sources()), root: worktree, pictureFallback })).toEqual([
      { ids: ["FoundryPressFrame"], renders: renders(main, "FoundryPressFrame"), sheet: path.join(main, "catalog-sheets/doodads/FoundryPressFrame.jpg") },
    ]);
  });
});
