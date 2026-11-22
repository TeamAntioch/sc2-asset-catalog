// Extracting the cliff sets' fields from TerrainData.xml and the gallery's cliff pictures into the
// cache (src/catalog/extract-cliffs.ts, src/catalog/terrain-data.ts), over a fake fetch.
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCatalogCli } from "../src/cli.js";
import { CLIFF_EXTRACTED_FILE, CLIFF_EXTRACTED_INFO_FILE, getCliffSet, readCliffCatalog } from "../src/catalog/cliff-catalog.js";
import { GALLERY_TREE_URL } from "../src/catalog/extract-catalog.js";
import { extractCliffs, extractCliffSetFields, extractTilesetCliffSets } from "../src/catalog/extract-cliffs.js";
import { SC2_GAME_DATA_URL } from "../src/catalog/extract-doodads.js";
import { readTerrainTilesets, terrainTilesetIds, tilesetField } from "../src/catalog/terrain-data.js";

const catalog = (body: string) => `<?xml version="1.0" encoding="us-ascii"?>\n<Catalog>\n${body}\n</Catalog>\n`;

const CORE = catalog(`    <CTerrain default="1">
        <Lighting value="##id##"/>
    </CTerrain>`);
const LIBERTY = catalog(`    <CTerrain id="Dunes">
        <BlendTextures value="DunesSand"/>
        <CliffSets value="DunesCliff0"/>
        <CliffSets value="DunesCliff1"/>
    </CTerrain>
    <CTerrain id="DunesEx1" parent="Dunes">
        <BlendTextures value="DunesRock"/>
    </CTerrain>
    <!-- <CTerrain id="Commented"><CliffSets value="NoCliff0"/></CTerrain> -->
    <CTerrain id="Bare"/>`);
// A later package overrides a tileset by id, and a template names its values by ##id##.
const VOID = catalog(`    <CTerrain id="Dunes">
        <CliffSets value="DunesCliff1"/>
        <CliffSets value="DunesCliff0"/>
    </CTerrain>
    <CTerrain default="1" id="Generic">
        <BlendTextures value="##id##_1"/>
        <CliffSets value="Plain_Manmade_Cliffs"/>
    </CTerrain>
    <CTerrain id="Station" parent="Generic">
        <CliffSets value="StationCliff0"/>
    </CTerrain>
    <CTerrain id="Station2" parent="Generic"/>`);

describe("terrain-data", () => {
  const tilesets = readTerrainTilesets([CORE, LIBERTY, VOID]);

  it("lists every tileset but the root default, commented-out ones left out", () => {
    expect(terrainTilesetIds(tilesets)).toEqual(["Bare", "Dunes", "DunesEx1", "Generic", "Station", "Station2"]);
  });

  it("resolves a field through the tileset's parents and the root default, ##id## filled in", () => {
    expect(tilesetField(tilesets, "DunesEx1", "BlendTextures")).toEqual(["DunesRock"]);
    expect(tilesetField(tilesets, "DunesEx1", "CliffSets")).toEqual(["DunesCliff1", "DunesCliff0"]);
    expect(tilesetField(tilesets, "Station2", "BlendTextures")).toEqual(["Station2_1"]);
    expect(tilesetField(tilesets, "Bare", "Lighting")).toEqual(["Bare"]);
    expect(tilesetField(tilesets, "Bare", "CliffSets")).toBeUndefined();
  });
});

describe("extractTilesetCliffSets", () => {
  it("gives each tileset with cliff sets its list in TerrainData order, the last package winning", () => {
    expect(extractTilesetCliffSets([CORE, LIBERTY, VOID])).toEqual({
      Dunes: ["DunesCliff1", "DunesCliff0"],
      DunesEx1: ["DunesCliff1", "DunesCliff0"],
      Generic: ["Plain_Manmade_Cliffs"],
      Station: ["StationCliff0"],
      Station2: ["Plain_Manmade_Cliffs"],
    });
  });
});

describe("extractCliffSetFields", () => {
  const tilesets = { Dunes: ["DunesCliff0", "DunesCliff1"], DunesEx1: ["DunesEx1Cliff0"], Lab: ["HybridLabInnerCliff1", "Plain_Manmade_Cliffs"], Rim: ["RimCliff0"] };

  it("lists each cliff set with the tilesets listing it, and matches its picture by family and variant", () => {
    const fields = extractCliffSetFields(tilesets, ["Dunes_Organic.jpg", "Dunes_Organic_tn.jpg", "dunes-manmade.jpg", "Rim0.jpg", "Plain_Manmade.jpg"]);
    expect(fields.DunesCliff0).toEqual({ tilesets: ["Dunes"], image: "Dunes_Organic.jpg" });
    expect(fields.DunesCliff1).toEqual({ tilesets: ["Dunes"], image: "dunes-manmade.jpg" });
    expect(fields.RimCliff0).toEqual({ tilesets: ["Rim"], image: "Rim0.jpg" });
    expect(fields.Plain_Manmade_Cliffs).toEqual({ tilesets: ["Lab"], image: "Plain_Manmade.jpg" });
  });

  it("falls back on a re-release's base family, then on the gallery's alias, and says which", () => {
    const fields = extractCliffSetFields(tilesets, ["Dunes_Organic.jpg", "Skygeirr_Lab_Manmade.jpg"]);
    expect(fields.DunesEx1Cliff0).toEqual({ tilesets: ["DunesEx1"], image: "Dunes_Organic.jpg", imageMatch: "family" });
    expect(fields.HybridLabInnerCliff1).toEqual({ tilesets: ["Lab"], image: "Skygeirr_Lab_Manmade.jpg", imageMatch: "alias" });
    expect(fields.RimCliff0).toEqual({ tilesets: ["Rim"] });
  });

  it("picks the same picture whatever order the gallery is listed in", () => {
    const gallery = ["(Tag)_Rim0.jpg", "Rim0.jpg"];
    expect(extractCliffSetFields(tilesets, gallery).RimCliff0).toEqual(extractCliffSetFields(tilesets, [...gallery].reverse()).RimCliff0);
  });
});

describe("extractCliffs", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  const terrain = (pkg: string) => `${SC2_GAME_DATA_URL}/${pkg}/base.sc2data/GameData/TerrainData.xml`;
  const table: Record<string, string> = {
    [terrain("mods/core.sc2mod")]: CORE,
    [terrain("mods/liberty.sc2mod")]: LIBERTY,
    [GALLERY_TREE_URL]: JSON.stringify({ tree: [{ path: "public/cliffs/Dunes_Organic.jpg" }, { path: "public/doodads/Dunes_Manmade.jpg" }] }),
  };
  const fakeFetch = (async (url: string | URL) => {
    const body = table[String(url)];
    return body === undefined ? new Response("not found", { status: 404 }) : new Response(body, { status: 200 });
  }) as typeof globalThis.fetch;

  it("writes the extraction to the cache, reports a described set it didn't find, and the catalog reads it", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "extract-cliffs-"));
    const descriptionsFile = path.join(dir, "descriptions.json");
    const rock = { look: "pale rock", kind: "natural", tone: "light", pairsWith: "sand" };
    await writeFile(descriptionsFile, JSON.stringify({ DunesCliff0: rock, GoneCliff0: rock }));
    const lines: string[] = [];
    const counts = await extractCliffs({ extractedDir: dir, descriptionsFile, fetch: fakeFetch, log: (line) => lines.push(line) });
    expect(counts).toEqual({ tilesets: 2, cliffSets: 2, pictured: 1, unextracted: ["GoneCliff0"] });
    expect(lines.at(-1)).toMatch(/GoneCliff0/);
    expect(existsSync(path.join(dir, CLIFF_EXTRACTED_INFO_FILE))).toBe(true);
    expect(JSON.parse(await readFile(path.join(dir, CLIFF_EXTRACTED_FILE), "utf8"))).toEqual({
      tilesets: { Dunes: ["DunesCliff0", "DunesCliff1"], DunesEx1: ["DunesCliff0", "DunesCliff1"] },
      cliffSets: { DunesCliff0: { tilesets: ["Dunes", "DunesEx1"], image: "Dunes_Organic.jpg" }, DunesCliff1: { tilesets: ["Dunes", "DunesEx1"] } },
    });
    expect(getCliffSet(readCliffCatalog({ extractedDir: dir, descriptionsFile }), "DunesCliff0")?.description).toEqual(rock);
  });

  it("leaves an earlier extraction as it was when a fetch fails", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "extract-cliffs-"));
    await writeFile(path.join(dir, CLIFF_EXTRACTED_FILE), "earlier");
    const failing = (async (url: string | URL) => (String(url) === terrain("mods/liberty.sc2mod") ? new Response("", { status: 500 }) : fakeFetch(url))) as typeof globalThis.fetch;
    await expect(extractCliffs({ extractedDir: dir, fetch: failing })).rejects.toThrow(/liberty\.sc2mod TerrainData\.xml: HTTP 500/);
    expect(await readFile(path.join(dir, CLIFF_EXTRACTED_FILE), "utf8")).toBe("earlier");
  });

  it("runs as the CLI's extract-cliffs command", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "extract-cliffs-"));
    const lines: string[] = [];
    await runCatalogCli(["extract-cliffs", "--cache", "cache"], { cwd: dir, fetch: fakeFetch, log: (line) => lines.push(line) });
    expect(existsSync(path.join(dir, "cache", "extracted", CLIFF_EXTRACTED_FILE))).toBe(true);
    expect(lines.some((line) => line.startsWith("2 cliff sets in 2 tilesets"))).toBe(true);
  });
});
