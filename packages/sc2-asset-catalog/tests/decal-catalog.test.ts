// The decal catalog (docs/adr/0006): what every variation of every decal doodad shows, described by
// eye and shipped, joined by doodad id and variation to the fields extract-decals reads into the cache.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DECAL_DESCRIPTIONS_PATH } from "../src/catalog/catalog-dirs.js";
import {
  DECAL_DESCRIPTION_FIELDS,
  DECAL_EXTRACTED_FILE,
  decalSheetPath,
  findDecalVariations,
  formatDecalVariations,
  isScatterable,
  joinDecalCatalog,
  parseDecalDescriptions,
  readDecalCatalog,
} from "../src/catalog/decal-catalog.js";

const STRIPE = { look: "yellow-and-black hazard stripe", shows: ["hazard-stripes", "stripe"], glyphs: "none", shape: "line", tiles: true, use: "marking" } as const;
const BAY = { look: "bold white stencilled number", shows: ["number"], glyphs: "number", text: "3", shape: "patch", tiles: false, use: "label" } as const;
const TRIM = { look: "Protoss trim band with an inscription", shows: ["ornament"], glyphs: "script", shape: "line", tiles: false, use: "ornament" } as const;

const temps: string[] = [];
const temp = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "decal-catalog-"));
  temps.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("the decal descriptions file", () => {
  it("reads each doodad's variations in order", () => {
    expect(parseDecalDescriptions(JSON.stringify({ Stripes: [STRIPE, BAY] }), "d.json")).toEqual({ Stripes: [STRIPE, BAY] });
  });

  it("refuses an extracted or unknown field, an unknown use, and a number with no text, naming the doodad and variation", () => {
    expect(() => parseDecalDescriptions(JSON.stringify({ Stripes: [{ ...STRIPE, texture: "Stripe.dds" }] }), "d.json")).toThrow(/d\.json.*Stripes\.0/s);
    expect(() => parseDecalDescriptions(JSON.stringify({ Stripes: [STRIPE, { ...STRIPE, use: "decor" }] }), "d.json")).toThrow(/Stripes\.1\.use/);
    const { text: _text, ...unread } = BAY;
    expect(() => parseDecalDescriptions(JSON.stringify({ Numbers: [unread] }), "d.json")).toThrow(/Numbers\.0\.text/);
    expect(() => parseDecalDescriptions("{", "d.json")).toThrow(/d\.json isn't JSON/);
  });
});

describe("the shipped decal descriptions", () => {
  it("are valid, and hold no field extracted from the game", async () => {
    const descriptions = parseDecalDescriptions(await readFile(DECAL_DESCRIPTIONS_PATH, "utf8"), "data/decal-descriptions.json");
    expect(Object.keys(descriptions).length).toBeGreaterThan(20);
    for (const [id, variations] of Object.entries(descriptions)) {
      for (const [n, variation] of variations.entries()) expect(Object.keys(variation).filter((field) => !(DECAL_DESCRIPTION_FIELDS as readonly string[]).includes(field)), `${id} ${n}`).toEqual([]);
    }
  });

  it("are in id order, each variation's fields in the file's order, as two-space JSON", async () => {
    const text = await readFile(DECAL_DESCRIPTIONS_PATH, "utf8");
    const parsed = JSON.parse(text) as Record<string, Record<string, unknown>[]>;
    const ids = Object.keys(parsed);
    expect(ids.filter((id, i) => i > 0 && ids[i - 1]!.localeCompare(id) > 0)).toEqual([]);
    for (const variations of Object.values(parsed)) for (const variation of variations) expect(Object.keys(variation)).toEqual(DECAL_DESCRIPTION_FIELDS.filter((field) => Object.hasOwn(variation, field)));
    expect(text).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
  });

  it("find plain floor markings with no glyphs", () => {
    const plain = findDecalVariations({ glyphs: ["none"], use: ["marking"], shows: ["stripe"], tiles: true }, readDecalCatalog({ extractedDir: "/nowhere" }));
    expect(plain.length).toBeGreaterThan(40);
    expect(plain.every((v) => v.glyphs === "none" && v.shows.includes("stripe"))).toBe(true);
    expect(plain).toContainEqual(expect.objectContaining({ doodad: "Decal", variation: 1 }));
  });

  it("find a decal by its words", () => {
    expect(findDecalVariations({ words: ["do not enter"] }, readDecalCatalog({ extractedDir: "/nowhere" })).map((v) => `${v.doodad} ${v.variation}`)).toEqual(["Decal 27", "Decal_Baked 27"]);
  });

  it("say which of a doodad's variations can go anywhere", () => {
    const catalog = readDecalCatalog({ extractedDir: "/nowhere" });
    expect(catalog.Decal!.flatMap((variation, n) => (isScatterable(variation) ? [n] : []))).toEqual([0, 1, 2, 3, 17, 18, 19, 20, 21]);
    expect(catalog.BattleStation_Number_Decals!.filter(isScatterable)).toEqual([]);
  });
});

describe("joining the extracted fields", () => {
  it("puts a variation's extracted fields before its description, and leaves a variation with none as described", () => {
    const joined = joinDecalCatalog({ Stripes: [STRIPE, BAY], Trim: [TRIM] }, { Stripes: [{ texture: "Stripe1.dds", size: [4, 1] }, {}], Other: [{ texture: "x.dds" }] });
    expect(JSON.stringify(joined)).toBe(JSON.stringify({ Stripes: [{ texture: "Stripe1.dds", size: [4, 1], ...STRIPE }, BAY], Trim: [TRIM] }));
  });

  it("reads them from the extracted folder when extract-decals has written them, and goes without them when it hasn't", async () => {
    const dir = await temp();
    const descriptionsFile = path.join(dir, "decal-descriptions.json");
    await writeFile(descriptionsFile, JSON.stringify({ Stripes: [STRIPE] }));
    expect(readDecalCatalog({ descriptionsFile, extractedDir: dir })).toEqual({ Stripes: [STRIPE] });
    await writeFile(path.join(dir, DECAL_EXTRACTED_FILE), JSON.stringify({ Stripes: [{ texture: "Stripe1.dds", size: [4, 1], drawn: "geometry" }] }));
    expect(readDecalCatalog({ descriptionsFile, extractedDir: dir })).toEqual({ Stripes: [{ texture: "Stripe1.dds", size: [4, 1], drawn: "geometry", ...STRIPE }] });
  });
});

describe("finding decal variations", () => {
  const catalog = { Stripes: [STRIPE, BAY], Trim: [TRIM] };

  it("matches every filter given, by doodad then variation", () => {
    expect(findDecalVariations({}, catalog).map((v) => `${v.doodad} ${v.variation}`)).toEqual(["Stripes 0", "Stripes 1", "Trim 0"]);
    expect(findDecalVariations({ doodads: ["Trim"] }, catalog).map((v) => v.doodad)).toEqual(["Trim"]);
    expect(findDecalVariations({ glyphs: ["none", "script"] }, catalog).map((v) => v.look)).toEqual([STRIPE.look, TRIM.look]);
    expect(findDecalVariations({ shows: ["number"], tiles: false }, catalog)).toEqual([{ doodad: "Stripes", variation: 1, ...BAY }]);
    expect(findDecalVariations({ scatterable: false }, catalog).map((v) => v.variation)).toEqual([1]);
    expect(findDecalVariations({ use: ["ornament"], shape: ["line"] }, catalog).map((v) => v.doodad)).toEqual(["Trim"]);
  });

  it("matches words in the look, the text or what it shows, in any case", () => {
    expect(findDecalVariations({ words: ["HAZARD"] }, catalog).map((v) => v.variation)).toEqual([0]);
    expect(findDecalVariations({ words: ["3", "inscription"] }, catalog).map((v) => `${v.doodad} ${v.variation}`)).toEqual(["Stripes 1", "Trim 0"]);
  });

  it("formats a line a match, with its facts, up to a limit", () => {
    const matches = findDecalVariations({}, joinDecalCatalog(catalog, { Stripes: [{ size: [4, 1] }] }));
    expect(formatDecalVariations(matches, 2)).toBe(
      ['Stripes 0: yellow-and-black hazard stripe (line, tiles, marking, 4×1 cells)', 'Stripes 1: bold white stencilled number (patch, label, reads "3")', "…and 1 more"].join("\n"),
    );
    expect(formatDecalVariations([])).toBe("No decal variation matches.");
  });
});

describe("a decal doodad's sheet", () => {
  it("is in the cache folder once extract-decals has built it", async () => {
    const cache = await temp();
    expect(decalSheetPath("Stripes", cache)).toBeUndefined();
    await mkdir(path.join(cache, "catalog-sheets/decals"), { recursive: true });
    await writeFile(path.join(cache, "catalog-sheets/decals/Stripes.jpg"), "");
    expect(decalSheetPath("Stripes", cache)).toBe(path.join(cache, "catalog-sheets/decals/Stripes.jpg"));
  });
});
