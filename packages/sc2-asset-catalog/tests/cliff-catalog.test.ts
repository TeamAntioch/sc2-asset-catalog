// The cliff catalog (src/catalog/cliff-catalog.ts): the shipped descriptions, joined by id to the
// extracted fields, looked up and searched.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CLIFF_DESCRIPTIONS_PATH } from "../src/catalog/catalog-dirs.js";
import {
  CLIFF_EXTRACTED_FILE,
  CLIFF_EXTRACTED_INFO_FILE,
  type CliffDescription,
  cliffPictureUrl,
  cliffSetKind,
  cliffSetNaming,
  type ExtractedCliffs,
  getCliffSet,
  hasExtractedCliffs,
  joinCliffCatalog,
  parseCliffDescriptions,
  readCliffCatalog,
  searchCliffSets,
  tilesetCliffSets,
} from "../src/catalog/cliff-catalog.js";

const ROCK: CliffDescription = { look: "grey layered rock, pale lip", kind: "natural", tone: "mid", pairsWith: "dirt, gravel" };
const WALL: CliffDescription = { look: "dark metal bulkhead walls, round pylons", kind: "built", tone: "dark", pairsWith: "metal plating, concrete" };
// A lab family whose Cliff0 is built walls, against what its id suggests.
const LAB: CliffDescription = { look: "black armoured metal walls, red lights", kind: "built", tone: "dark", pairsWith: "metal plating, lab floor" };

const EXTRACTED: ExtractedCliffs = {
  tilesets: { Dunes: ["DunesCliff0", "DunesCliff1"], DunesEx1: ["DunesCliff0", "DunesCliff1"], Lab: ["LabCliff0", "Plain_Manmade_Cliffs"] },
  cliffSets: {
    DunesCliff1: { tilesets: ["Dunes", "DunesEx1"], image: "Dunes_Manmade.jpg" },
    DunesCliff0: { tilesets: ["Dunes", "DunesEx1"], image: "Dunes_Organic.jpg" },
    LabCliff0: { tilesets: ["Lab"], image: "Lab0.jpg", imageMatch: "alias" },
    Plain_Manmade_Cliffs: { tilesets: ["Lab"] },
  },
};
const DESCRIPTIONS = { DunesCliff0: ROCK, DunesCliff1: WALL, LabCliff0: LAB, GoneCliff0: ROCK };

describe("cliffSetNaming", () => {
  it("reads the family and the variant from a numbered id, and only the variant from a named one", () => {
    expect(cliffSetNaming("AgriaEx1Cliff0")).toEqual({ family: "AgriaEx1", variant: "organic" });
    expect(cliffSetNaming("AgriaCliff1")).toEqual({ family: "Agria", variant: "manmade" });
    expect(cliffSetNaming("ProtossBaseManmadeCliffs")).toEqual({ variant: "manmade" });
    expect(cliffSetNaming("Elsecaro_Organic_Cliffs")).toEqual({ variant: "organic" });
    expect(cliffSetNaming("KorhalPlatformEx2")).toEqual({});
  });
});

describe("joinCliffCatalog", () => {
  const catalog = joinCliffCatalog(DESCRIPTIONS, EXTRACTED);

  it("lists every extracted cliff set in id order, with what its id says and its description", () => {
    expect(catalog.entries.map((entry) => entry.id)).toEqual(["DunesCliff0", "DunesCliff1", "LabCliff0", "Plain_Manmade_Cliffs"]);
    expect(catalog.entries[0]).toEqual({ id: "DunesCliff0", family: "Dunes", variant: "organic", tilesets: ["Dunes", "DunesEx1"], image: "Dunes_Organic.jpg", description: ROCK });
    expect(getCliffSet(catalog, "Plain_Manmade_Cliffs")).toEqual({ id: "Plain_Manmade_Cliffs", variant: "manmade", tilesets: ["Lab"] });
  });

  it("leaves out a described id that wasn't extracted, and names it", () => {
    expect(getCliffSet(catalog, "GoneCliff0")).toBeUndefined();
    expect(catalog.unextracted).toEqual(["GoneCliff0"]);
  });

  it("gives a tileset's cliff sets in TerrainData order, and none for a tileset the game doesn't define", () => {
    expect(tilesetCliffSets(catalog, "Lab")).toEqual(["LabCliff0", "Plain_Manmade_Cliffs"]);
    expect(tilesetCliffSets(catalog, "Nowhere")).toEqual([]);
    expect(tilesetCliffSets(catalog, "constructor")).toEqual([]);
  });
});

describe("cliffSetKind", () => {
  const catalog = joinCliffCatalog(DESCRIPTIONS, EXTRACTED);

  it("trusts the description's kind over the id's variant", () => {
    expect(cliffSetKind(getCliffSet(catalog, "LabCliff0"))).toBe("built");
    expect(cliffSetKind(getCliffSet(catalog, "DunesCliff0"))).toBe("natural");
  });

  it("falls back on the variant, and on natural for an id that says nothing or a set that isn't known", () => {
    expect(cliffSetKind(getCliffSet(catalog, "Plain_Manmade_Cliffs"))).toBe("built");
    expect(cliffSetKind({ variant: "organic" })).toBe("natural");
    expect(cliffSetKind(undefined)).toBe("natural");
  });
});

describe("searchCliffSets", () => {
  const catalog = joinCliffCatalog(DESCRIPTIONS, EXTRACTED);
  const ids = (found: readonly { readonly id: string }[]) => found.map((entry) => entry.id);

  it("finds the sets with every word somewhere in them, in any case", () => {
    expect(ids(searchCliffSets(catalog, { words: ["METAL", "walls"] }))).toEqual(["DunesCliff1", "LabCliff0"]);
    expect(ids(searchCliffSets(catalog, { words: ["metal", "pylons"] }))).toEqual(["DunesCliff1"]);
    expect(ids(searchCliffSets(catalog, { words: ["dunesex1"] }))).toEqual(["DunesCliff0", "DunesCliff1"]);
    expect(ids(searchCliffSets(catalog, { words: ["manmade"] }))).toEqual(["DunesCliff1", "Plain_Manmade_Cliffs"]);
    expect(ids(searchCliffSets(catalog, { words: ["snow"] }))).toEqual([]);
  });

  it("narrows by kind, tone and tileset", () => {
    expect(ids(searchCliffSets(catalog, { kind: "built" }))).toEqual(["DunesCliff1", "LabCliff0", "Plain_Manmade_Cliffs"]);
    expect(ids(searchCliffSets(catalog, { tone: "dark" }))).toEqual(["DunesCliff1", "LabCliff0"]);
    expect(ids(searchCliffSets(catalog, { tileset: "Lab", kind: "built", words: ["lights"] }))).toEqual(["LabCliff0"]);
  });

  it("lists every set when given nothing", () => {
    expect(searchCliffSets(catalog)).toHaveLength(4);
  });
});

describe("cliffPictureUrl", () => {
  it("links the gallery's picture, or its thumbnail", () => {
    expect(cliffPictureUrl("Bel'Shir_Organic.jpg")).toBe("https://raw.githubusercontent.com/TeamAntioch/sc2-mapping-reference/main/public/cliffs/Bel'Shir_Organic.jpg");
    expect(cliffPictureUrl("Agria Manmade.jpg", { thumbnail: true, base: "https://example.com/cliffs/" })).toBe("https://example.com/cliffs/Agria%20Manmade_tn.jpg");
  });
});

describe("readCliffCatalog", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("joins the extraction in the cache to the descriptions", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "cliff-catalog-"));
    const descriptionsFile = path.join(dir, "descriptions.json");
    await writeFile(descriptionsFile, JSON.stringify(DESCRIPTIONS));
    await writeFile(path.join(dir, CLIFF_EXTRACTED_FILE), JSON.stringify(EXTRACTED));
    expect(hasExtractedCliffs(dir)).toBe(false);
    await writeFile(path.join(dir, CLIFF_EXTRACTED_INFO_FILE), "{}");
    expect(hasExtractedCliffs(dir)).toBe(true);
    const catalog = readCliffCatalog({ extractedDir: dir, descriptionsFile });
    expect(getCliffSet(catalog, "LabCliff0")?.description).toEqual(LAB);
  });

  it("says to extract when nothing has been", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "cliff-catalog-"));
    expect(() => readCliffCatalog({ extractedDir: dir! })).toThrow(/run the extract-cliffs command first/);
  });
});

describe("parseCliffDescriptions", () => {
  it("refuses a field it doesn't know and a value out of its vocabulary, naming the id and field", () => {
    expect(() => parseCliffDescriptions(JSON.stringify({ A: { ...ROCK, image: "A.jpg" } }), "c.json")).toThrow(/A/);
    expect(() => parseCliffDescriptions(JSON.stringify({ A: { ...ROCK, kind: "creature" } }), "c.json")).toThrow(/A\.kind/);
    expect(() => parseCliffDescriptions(JSON.stringify({ A: { ...ROCK, tone: "bright" } }), "c.json")).toThrow(/A\.tone/);
    expect(() => parseCliffDescriptions(JSON.stringify({ A: { ...ROCK, pairsWith: " " } }), "c.json")).toThrow(/A\.pairsWith/);
  });
});

describe("the shipped cliff descriptions", () => {
  it("are valid, hold no field extracted from the game, and are in id order as two-space JSON", async () => {
    const text = await readFile(CLIFF_DESCRIPTIONS_PATH, "utf8");
    const descriptions = parseCliffDescriptions(text, "data/cliff-descriptions.json");
    expect(Object.keys(descriptions).length).toBeGreaterThan(100);
    const ids = Object.keys(descriptions);
    expect(ids.filter((id, i) => i > 0 && ids[i - 1]!.localeCompare(id) > 0)).toEqual([]);
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  });
});
