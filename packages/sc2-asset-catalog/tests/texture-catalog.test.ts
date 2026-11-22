// The terrain texture catalog (src/catalog/texture-catalog.ts, src/catalog/texture-pictures.ts): the
// shipped descriptions, joined by id to the extracted fields, looked up and searched; pictures
// fetched once into the cache; and a labelled sheet.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TEXTURE_DESCRIPTIONS_PATH } from "../src/catalog/catalog-dirs.js";
import {
  type ExtractedTextures,
  getTexture,
  hasExtractedTextures,
  joinTextureCatalog,
  lookUpTextures,
  parseTextureDescriptions,
  readTextureCatalog,
  searchTextures,
  TEXTURE_EXTRACTED_FILE,
  TEXTURE_EXTRACTED_INFO_FILE,
  type TextureDescription,
  tilesetTextures,
} from "../src/catalog/texture-catalog.js";
import { TEXTURE_GALLERY_URL, texturePicture, texturePictureDir, texturePictureUrl, textureSheetSvg, textureSheetTiles } from "../src/catalog/texture-pictures.js";

const MESH_GRATING: TextureDescription = { look: "dark metal mesh grating, fine square holes", kind: "built", tone: "dark", suits: ["path", "accent"] };
const MESH: TextureDescription = { look: "dark mesh floor plates", kind: "built", tone: "dark", suits: ["base"] };
const PANELS: TextureDescription = { look: "tan metal panels, rivets", kind: "built", tone: "mid", suits: ["accent", "path"] };
const SAND: TextureDescription = { look: "pale sand, fine ripples", kind: "natural", tone: "light", suits: ["base", "variety"] };
const UNSEEN: TextureDescription = { look: "brown dirt", kind: "natural", tone: "mid", suits: ["base"], seen: false };

const EXTRACTED: ExtractedTextures = {
  tilesets: { Dunes: ["DunesSand", "DunesPanels", ""], Station: ["StationMesh", "StationGrate", "DunesPanels"] },
  textures: {
    StationGrate: { tilesets: ["Station"], file: "Station_Grate", image: "Station_Grate.jpg" },
    DunesSand: { tilesets: ["Dunes"], file: "Dunes_Sand", name: "Dunes Sand", image: "Dunes_Sand.jpg" },
    DunesPanels: { tilesets: ["Dunes", "Station"], file: "Dunes_Panels", image: "(Tag)_Dunes_Panel.jpg", imageMatch: "fuzzy" },
    StationMesh: { tilesets: ["Station"], file: "Station_Mesh", image: "Station_Mesh.jpg" },
    DunesDirt: { tilesets: ["Dunes"] },
  },
};
const DESCRIPTIONS = { StationGrate: MESH_GRATING, StationMesh: MESH, DunesPanels: PANELS, DunesSand: SAND, DunesDirt: UNSEEN, GoneTexture: SAND };
const catalog = joinTextureCatalog(DESCRIPTIONS, EXTRACTED);

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("the shipped descriptions", () => {
  it("parse, hold only what we wrote, and describe from the name alone only where they say so", async () => {
    const descriptions = parseTextureDescriptions(await readFile(TEXTURE_DESCRIPTIONS_PATH, "utf8"), "texture-descriptions.json");
    expect(Object.keys(descriptions).length).toBeGreaterThan(600);
    const unseen = Object.entries(descriptions).filter(([, description]) => description.seen === false);
    expect(unseen.length).toBeGreaterThan(0);
    expect(unseen.length).toBeLessThan(20);
  });

  it("refuse a field that isn't ours, naming the id and field", () => {
    const text = JSON.stringify({ DunesSand: { ...SAND, tilesets: ["Dunes"] } });
    expect(() => parseTextureDescriptions(text, "texture-descriptions.json")).toThrow(/texture-descriptions\.json isn't a valid texture descriptions file: .*DunesSand/);
    expect(() => parseTextureDescriptions(JSON.stringify({ DunesSand: { ...SAND, suits: [] } }), "f.json")).toThrow(/DunesSand/);
  });
});

describe("joinTextureCatalog", () => {
  it("lists every extracted texture in id order with its description, and reports described ones not extracted", () => {
    expect(catalog.entries.map((entry) => entry.id)).toEqual(["DunesDirt", "DunesPanels", "DunesSand", "StationGrate", "StationMesh"]);
    expect(getTexture(catalog, "DunesSand")).toEqual({ id: "DunesSand", ...EXTRACTED.textures.DunesSand, description: SAND });
    expect(catalog.unextracted).toEqual(["GoneTexture"]);
    expect(getTexture(catalog, "GoneTexture")).toBeUndefined();
  });

  it("gives a tileset's textures in layer order, and none for a tileset the game doesn't define", () => {
    expect(tilesetTextures(catalog, "Station")).toEqual(["StationMesh", "StationGrate", "DunesPanels"]);
    expect(tilesetTextures(catalog, "constructor")).toEqual([]);
  });
});

describe("lookUpTextures", () => {
  it("gives the entries in the order asked, and refuses an id the catalog doesn't have, naming near ones", () => {
    expect(lookUpTextures(catalog, ["StationMesh", "DunesSand"]).map((entry) => entry.id)).toEqual(["StationMesh", "DunesSand"]);
    expect(() => lookUpTextures(catalog, ["DunesPanel"])).toThrow(/^DunesPanel isn't one of the game's terrain textures: did you mean DunesPanels\?$/);
    expect(() => lookUpTextures(catalog, ["Nothing"])).toThrow(/^Nothing isn't one of the game's terrain textures$/);
  });
});

describe("searchTextures", () => {
  it("ranks the textures whose look holds the most words first, by the start of a word, then by id", () => {
    expect(searchTextures(catalog, { words: ["mesh", "grat"] }).map((entry) => entry.id)).toEqual(["StationGrate", "StationMesh"]);
    expect(searchTextures(catalog, { words: ["esh"] })).toEqual([]);
  });

  it("filters by kind, tones, suits, tilesets and pictures, and leaves out words in the look, id or tilesets", () => {
    expect(searchTextures(catalog, { kind: "natural" }).map((entry) => entry.id)).toEqual(["DunesDirt", "DunesSand"]);
    expect(searchTextures(catalog, { tones: ["light", "mid"] }).map((entry) => entry.id)).toEqual(["DunesDirt", "DunesPanels", "DunesSand"]);
    expect(searchTextures(catalog, { suits: ["accent"], tilesets: ["Dunes"] }).map((entry) => entry.id)).toEqual(["DunesPanels"]);
    expect(searchTextures(catalog, { withPicture: true, kind: "natural" }).map((entry) => entry.id)).toEqual(["DunesSand"]);
    expect(searchTextures(catalog, { words: ["dark"], without: ["Station"] }).map((entry) => entry.id)).toEqual([]);
    expect(searchTextures(catalog, { without: ["rivets", "Dunes"] }).map((entry) => entry.id)).toEqual(["StationGrate", "StationMesh"]);
  });
});

describe("readTextureCatalog", () => {
  it("reads the extraction from the cache and joins the descriptions, or says to extract", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "texture-catalog-"));
    expect(() => readTextureCatalog({ extractedDir: dir! })).toThrow(/No extracted textures in .*extract-textures/);
    expect(hasExtractedTextures(dir)).toBe(false);
    const descriptionsFile = path.join(dir, "descriptions.json");
    await writeFile(descriptionsFile, JSON.stringify({ DunesSand: SAND }));
    await writeFile(path.join(dir, TEXTURE_EXTRACTED_FILE), JSON.stringify(EXTRACTED));
    await writeFile(path.join(dir, TEXTURE_EXTRACTED_INFO_FILE), "{}");
    expect(hasExtractedTextures(dir)).toBe(true);
    const read = readTextureCatalog({ extractedDir: dir, descriptionsFile });
    expect(getTexture(read, "DunesSand")?.description).toEqual(SAND);
    expect(getTexture(read, "StationMesh")?.description).toBeUndefined();
  });
});

describe("a texture's picture", () => {
  const sand = getTexture(catalog, "DunesSand")!;

  it("has a gallery address, and a thumbnail beside it", () => {
    expect(texturePictureUrl("(Tag)_Dunes Panel.jpg")).toBe(`${TEXTURE_GALLERY_URL}/(Tag)_Dunes%20Panel.jpg`);
    expect(texturePictureUrl("Dunes_Sand.jpg", { thumbnail: true, base: "https://example.org/tilesets/" })).toBe("https://example.org/tilesets/Dunes_Sand_tn.jpg");
    expect(texturePictureDir("/cache")).toBe(path.join("/cache", "texture-pictures"));
  });

  it("is fetched once from the gallery and kept; a reply that isn't a JPEG isn't kept", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "texture-pictures-"));
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(url);
      return new Response(JPEG);
    }) as unknown as typeof fetch;
    expect(await texturePicture(sand, { pictureDir: dir, fetch: fetcher })).toEqual(JPEG);
    expect(await texturePicture(sand, { pictureDir: dir, fetch: fetcher })).toEqual(JPEG);
    expect(asked).toEqual([texturePictureUrl("Dunes_Sand.jpg")]);
    expect(await readFile(path.join(dir, "Dunes_Sand.jpg"))).toEqual(JPEG);

    const html = (async () => new Response("<html>not found</html>")) as unknown as typeof fetch;
    expect(await texturePicture(getTexture(catalog, "StationMesh")!, { pictureDir: dir, fetch: html })).toBeUndefined();
    expect(await texturePicture(getTexture(catalog, "DunesDirt")!, { pictureDir: dir, fetch: html })).toBeUndefined();
  });

  it("is read from a local gallery before fetching", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "texture-pictures-"));
    await writeFile(path.join(dir, "Dunes_Sand.jpg"), JPEG);
    const never = (async () => {
      throw new Error("fetched");
    }) as unknown as typeof fetch;
    expect(await texturePicture(sand, { pictureDir: path.join(dir, "cache"), gallery: dir, fetch: never })).toEqual(JPEG);
  });
});

describe("the sheet", () => {
  it("labels each picture with its label, id and look, and draws a texture with no picture as a grey tile", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "texture-pictures-"));
    const offline = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const { tiles, missing } = await textureSheetTiles(
      [{ texture: getTexture(catalog, "DunesPanels")!, label: "12 trim" }, { texture: getTexture(catalog, "StationMesh")! }],
      { pictureDir: dir, fetch: offline },
    );
    expect(missing).toEqual(["DunesPanels", "StationMesh"]);
    const svg = textureSheetSvg([{ ...tiles[0]!, picture: JPEG }, tiles[1]!]);
    expect(svg).toContain("12 trim");
    expect(svg).toContain(">DunesPanels<");
    expect(svg).toContain("tan metal panels, rivets");
    expect(svg).toContain("data:image/jpeg;base64,");
    expect(svg).toContain("no picture");
    expect(svg).toMatch(/^<svg [^>]*width="548"/);
  });

  it("escapes text and wraps a long look, cutting it short", () => {
    const long = { id: "A&B", tilesets: [], description: { ...SAND, look: "word ".repeat(40).trim() } };
    const svg = textureSheetSvg([{ texture: long, picture: undefined, label: "<x>" }], { size: 140 });
    expect(svg).toContain(">A&amp;B<");
    expect(svg).toContain("&lt;x&gt;");
    expect(svg).toContain("…");
  });
});
