// Extracting the terrain textures' fields from TerrainData.xml, TerrainTexData.xml, GameStrings.txt
// and the gallery's texture pictures into the cache (src/catalog/extract-textures.ts), over a fake fetch.
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCatalogCli } from "../src/cli.js";
import { GALLERY_TREE_URL } from "../src/catalog/extract-catalog.js";
import { SC2_GAME_DATA_URL } from "../src/catalog/extract-doodads.js";
import { extractTextureFields, extractTextures, extractTilesetTextures, type TexturePackage } from "../src/catalog/extract-textures.js";
import { getTexture, readTextureCatalog, TEXTURE_EXTRACTED_FILE, TEXTURE_EXTRACTED_INFO_FILE } from "../src/catalog/texture-catalog.js";

const catalog = (body: string) => `<?xml version="1.0" encoding="us-ascii"?>\n<Catalog>\n${body}\n</Catalog>\n`;

const TERRAIN_CORE = catalog(`    <CTerrain default="1">
        <Lighting value="##id##"/>
    </CTerrain>`);
const TERRAIN_LIBERTY = catalog(`    <CTerrain id="Dunes">
        <BlendTextures value="DunesSand"/>
        <BlendTextures value="DunesPanels"/>
        <BlendTextures value=""/>
    </CTerrain>
    <CTerrain id="DunesEx1" parent="Dunes"/>
    <CTerrain default="1" id="Generic">
        <BlendTextures value="##id##_1"/>
    </CTerrain>
    <CTerrain id="Wastes" parent="Generic"/>
    <CTerrain id="Bare"/>`);

const TEX_CORE = catalog(`    <CTerrainTex default="1">
        <Texture value="TerrainTexDef/Texture/##id##"/>
    </CTerrainTex>
    <CTerrainTex id="DunesSand">
        <Texture value="Assets\\Textures\\Dunes_Sand.dds"/>
    </CTerrainTex>`);
// A self-closing entry before another's: its file is its parent's, ##id## filled in, never the next entry's.
const TEX_VOID = catalog(`    <CTerrainTex default="1" id="GenericTex">
        <Texture value="Assets\\Textures\\##id##.dds"/>
    </CTerrainTex>
    <CTerrainTex id="Wastes_1" parent="GenericTex"/>
    <CTerrainTex id="DunesPanels">
        <Texture value="Assets\\Textures\\Dunes_Panels.dds"/>
    </CTerrainTex>`);
const STRINGS = "TerrainTex/Name/DunesSand=Dunes Sand\r\nTerrainTex/Name/DunesPanels=Dunes Metal Panels\r\nUnit/Name/Marine=Marine\r\n";

const PACKAGES: TexturePackage[] = [
  { name: "mods/core.sc2mod", terrainTexData: TEX_CORE, gameStrings: STRINGS },
  { name: "mods/void.sc2mod", terrainTexData: TEX_VOID },
];

describe("extractTilesetTextures", () => {
  it("gives each tileset with blend textures its list in layer order, through its parents, ##id## filled in, empty slots kept", () => {
    expect(extractTilesetTextures([TERRAIN_CORE, TERRAIN_LIBERTY])).toEqual({
      Dunes: ["DunesSand", "DunesPanels", ""],
      DunesEx1: ["DunesSand", "DunesPanels", ""],
      Generic: ["Generic_1"],
      Wastes: ["Wastes_1"],
    });
  });
});

describe("extractTextureFields", () => {
  const tilesets = { Dunes: ["DunesSand", "DunesPanels", ""], DunesEx1: ["DunesSand"], Wastes: ["Wastes_1"] };

  it("lists each texture with the tilesets listing it, its file and name, and matches its picture by file, name or id", () => {
    const fields = extractTextureFields(tilesets, PACKAGES, ["Dunes_Sand.jpg", "Dunes_Sand_tn.jpg", "(Void)_Wastes_1.jpg", "Dunes Metal Panels.jpg"]);
    expect(Object.keys(fields)).toEqual(["DunesPanels", "DunesSand", "Wastes_1"]);
    expect(fields.DunesSand).toEqual({ tilesets: ["Dunes", "DunesEx1"], file: "Dunes_Sand", name: "Dunes Sand", image: "Dunes_Sand.jpg" });
    expect(fields.DunesPanels).toEqual({ tilesets: ["Dunes"], file: "Dunes_Panels", name: "Dunes Metal Panels", image: "Dunes Metal Panels.jpg" });
    expect(fields.Wastes_1).toEqual({ tilesets: ["Wastes"], file: "Wastes_1", image: "(Void)_Wastes_1.jpg" });
  });

  it("falls back on the closest picture by the words of the name, when it's close and clear, and says so", () => {
    expect(extractTextureFields(tilesets, PACKAGES, ["(Tag)_Dunes_Metal_Panel.jpg", "Other.jpg"]).DunesPanels).toMatchObject({ image: "(Tag)_Dunes_Metal_Panel.jpg", imageMatch: "fuzzy" });
    // Two pictures as close as each other: neither.
    expect(extractTextureFields(tilesets, PACKAGES, ["Dunes_Metal_Panel_A.jpg", "Dunes_Metal_Panel_B.jpg"]).DunesPanels?.image).toBeUndefined();
    // Too few words in common.
    expect(extractTextureFields(tilesets, PACKAGES, ["Dunes_Rock.jpg"]).DunesPanels?.image).toBeUndefined();
  });

  it("picks the same picture whatever order the gallery is listed in", () => {
    const gallery = ["(Tag)_Dunes_Sand.jpg", "Dunes_Sand.jpg"];
    expect(extractTextureFields(tilesets, PACKAGES, gallery).DunesSand?.image).toBe(extractTextureFields(tilesets, PACKAGES, [...gallery].reverse()).DunesSand?.image);
  });
});

describe("extractTextures", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  const data = (pkg: string, file: string) => `${SC2_GAME_DATA_URL}/${pkg}/base.sc2data/GameData/${file}`;
  const table: Record<string, string> = {
    [data("mods/core.sc2mod", "TerrainData.xml")]: TERRAIN_CORE,
    [data("mods/liberty.sc2mod", "TerrainData.xml")]: TERRAIN_LIBERTY,
    [data("mods/core.sc2mod", "TerrainTexData.xml")]: TEX_CORE,
    [data("mods/void.sc2mod", "TerrainTexData.xml")]: TEX_VOID,
    [`${SC2_GAME_DATA_URL}/mods/core.sc2mod/enus.sc2data/LocalizedData/GameStrings.txt`]: STRINGS,
    [GALLERY_TREE_URL]: JSON.stringify({ tree: [{ path: "public/tilesets/Dunes_Sand.jpg" }, { path: "public/doodads/Dunes_Panels.jpg" }] }),
  };
  const fakeFetch = (async (url: string | URL) => {
    const body = table[String(url)];
    return body === undefined ? new Response("not found", { status: 404 }) : new Response(body, { status: 200 });
  }) as typeof globalThis.fetch;

  it("writes the extraction to the cache, reports a described texture it didn't find, and the catalog reads it", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "extract-textures-"));
    const descriptionsFile = path.join(dir, "descriptions.json");
    const sand = { look: "pale sand", kind: "natural", tone: "light", suits: ["base"] };
    await writeFile(descriptionsFile, JSON.stringify({ DunesSand: sand, GoneTexture: sand }));
    const lines: string[] = [];
    const counts = await extractTextures({ extractedDir: dir, descriptionsFile, fetch: fakeFetch, log: (line) => lines.push(line) });
    expect(counts).toEqual({ tilesets: 4, textures: 4, pictured: 1, unextracted: ["GoneTexture"] });
    expect(lines.at(-1)).toMatch(/GoneTexture/);
    expect(existsSync(path.join(dir, TEXTURE_EXTRACTED_INFO_FILE))).toBe(true);
    const written = JSON.parse(await readFile(path.join(dir, TEXTURE_EXTRACTED_FILE), "utf8"));
    expect(written.tilesets.Dunes).toEqual(["DunesSand", "DunesPanels", ""]);
    expect(written.textures.DunesSand).toEqual({ tilesets: ["Dunes", "DunesEx1"], file: "Dunes_Sand", name: "Dunes Sand", image: "Dunes_Sand.jpg" });
    expect(written.textures.Generic_1).toEqual({ tilesets: ["Generic"] });
    expect(getTexture(readTextureCatalog({ extractedDir: dir, descriptionsFile }), "DunesSand")?.description).toEqual(sand);
  });

  it("leaves an earlier extraction as it was when a fetch fails", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "extract-textures-"));
    await writeFile(path.join(dir, TEXTURE_EXTRACTED_FILE), "earlier");
    const failing = (async (url: string | URL) => (String(url) === data("mods/void.sc2mod", "TerrainTexData.xml") ? new Response("", { status: 500 }) : fakeFetch(url))) as typeof globalThis.fetch;
    await expect(extractTextures({ extractedDir: dir, fetch: failing })).rejects.toThrow(/void\.sc2mod TerrainTexData\.xml: HTTP 500/);
    expect(await readFile(path.join(dir, TEXTURE_EXTRACTED_FILE), "utf8")).toBe("earlier");
  });

  it("runs as the CLI's extract-textures command", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "extract-textures-"));
    const lines: string[] = [];
    await runCatalogCli(["extract-textures", "--cache", "cache"], { cwd: dir, fetch: fakeFetch, log: (line) => lines.push(line) });
    expect(existsSync(path.join(dir, "cache", "extracted", TEXTURE_EXTRACTED_FILE))).toBe(true);
    expect(lines.some((line) => line.startsWith("4 textures in 4 tilesets"))).toBe(true);
  });
});
