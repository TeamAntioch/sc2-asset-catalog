// Doodad Uses (src/catalog/doodad-uses.ts): one file per doodad or terrain object in a uses folder,
// each a list of records, read over synthetic folders; and the shipped files checked against the
// schema and the descriptions.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DOODAD_DESCRIPTIONS_PATH, DOODAD_USES_DIR } from "../src/catalog/catalog-dirs.js";
import { cachedStockDoodadSources, forgetStockDoodadSources, readStockDoodadSources, searchDoodads } from "../src/catalog/doodad-search.js";
import { addUses, formatDoodadUses, formatUse, mergeUses, parseDoodadUses, readDoodadUses } from "../src/catalog/doodad-uses.js";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});
async function usesFolder(files: Record<string, unknown>): Promise<string> {
  dir = await mkdtemp(path.join(tmpdir(), "doodad-uses-"));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}

describe("readDoodadUses", () => {
  it("reads a doodad's and a terrain object's files by id, from their own folders", async () => {
    const at = await usesFolder({
      "doodads/FoundryStamperHead.json": [{ use: "press head over a conveyor", variation: 1, scale: 3, from: "crushing-press search, 2026-11-09" }, { use: "stamping die" }],
      // A doodad and a terrain object may share an id.
      "doodads/FoundryPressPit0.json": [{ use: "pit lid" }],
      "terrain-objects/FoundryPressPit0.json": [{ use: "crusher pit under a belt" }],
    });
    expect(readDoodadUses(at)).toEqual({
      doodad: {
        FoundryStamperHead: [{ use: "press head over a conveyor", variation: 1, scale: 3, from: "crushing-press search, 2026-11-09" }, { use: "stamping die" }],
        FoundryPressPit0: [{ use: "pit lid" }],
      },
      "terrain-object": { FoundryPressPit0: [{ use: "crusher pit under a belt" }] },
    });
  });

  it("reads nothing from a folder that isn't there", () => {
    expect(readDoodadUses(path.join(tmpdir(), "no-such-doodad-uses"))).toEqual({ doodad: {}, "terrain-object": {} });
  });

  it("refuses a file that isn't a list of records, naming it and the problem", async () => {
    const at = await usesFolder({ "doodads/FoundryStamperHead.json": [{ use: "press head", variation: -1 }] });
    expect(() => readDoodadUses(at)).toThrow(/doodads\/FoundryStamperHead\.json.*0\.variation/);
    const strings = await usesFolder({ "terrain-objects/Pit.json": ["crusher pit"] });
    expect(() => readDoodadUses(strings)).toThrow(/terrain-objects\/Pit\.json/);
    const extra = await usesFolder({ "doodads/Crate.json": [{ use: "crate", mission: "x" }] });
    expect(() => readDoodadUses(extra)).toThrow(/Crate\.json.*mission/);
    const empty = await usesFolder({ "doodads/Crate.json": [] });
    expect(() => readDoodadUses(empty)).toThrow(/Crate\.json/);
    const broken = await usesFolder({ "doodads/Crate.json": "[{" });
    expect(() => readDoodadUses(broken)).toThrow(/Crate\.json isn't JSON/);
  });
});

describe("a uses file", () => {
  it("is written with each record's fields in order, two-space JSON, and reads back", () => {
    const text = formatDoodadUses([{ from: "a search, 2026-11-09", scale: 0.6, use: "press head" }]);
    expect(text).toBe('[\n  {\n    "use": "press head",\n    "scale": 0.6,\n    "from": "a search, 2026-11-09"\n  }\n]\n');
    expect(parseDoodadUses(text, "x.json")).toEqual([{ use: "press head", scale: 0.6, from: "a search, 2026-11-09" }]);
  });
});

describe("mergeUses", () => {
  it("keeps the first of uses that differ only in case and spacing", () => {
    expect(mergeUses([{ use: "Press head", variation: 1 }], [{ use: "  press   HEAD " }, { use: "stamping die" }])).toEqual([{ use: "Press head", variation: 1 }, { use: "stamping die" }]);
  });
});

describe("addUses", () => {
  it("adds a new use, fills a held one's variation and scale in place, and leaves out one the held uses already say all of", () => {
    const held = [{ use: "press head", scale: 0.6, from: "first search" }];
    expect(addUses(held, [{ use: "Press  head" }, { use: "press head", scale: 0.6, from: "later search" }])).toEqual({ uses: held, added: [] });
    expect(addUses(held, [{ use: "PRESS HEAD", variation: 2, scale: 0.8, from: "later search" }, { use: "stamping die" }])).toEqual({
      uses: [{ use: "press head", variation: 2, scale: 0.8, from: "first search" }, { use: "stamping die" }],
      added: [{ use: "PRESS HEAD", variation: 2, scale: 0.8, from: "later search" }, { use: "stamping die" }],
    });
  });
});

describe("formatUse", () => {
  it("gives the phrase with its variation (two digits, as the Editor shows them) and scale when set", () => {
    expect(formatUse({ use: "press head", variation: 1, scale: 3, from: "a search" })).toBe("press head (variation 01, scale 3)");
    expect(formatUse({ use: "floor marking", variation: 27 })).toBe("floor marking (variation 27)");
    expect(formatUse({ use: "gantry" })).toBe("gantry");
  });
});

describe("the shipped Doodad Uses", () => {
  it("are valid, each for a described doodad, with no terrain objects' among them", async () => {
    const uses = readDoodadUses(DOODAD_USES_DIR);
    const descriptions = JSON.parse(await readFile(DOODAD_DESCRIPTIONS_PATH, "utf8")) as Record<string, unknown>;
    expect(Object.keys(uses.doodad).length).toBeGreaterThan(0);
    expect(Object.keys(uses.doodad).filter((id) => !Object.hasOwn(descriptions, id))).toEqual([]);
    expect(uses["terrain-object"]).toEqual({});
  });

  it("are written as a uses file is: each record's fields in order, two-space JSON", async () => {
    for (const [id, records] of Object.entries(readDoodadUses(DOODAD_USES_DIR).doodad)) {
      expect(await readFile(path.join(DOODAD_USES_DIR, "doodads", `${id}.json`), "utf8"), id).toBe(formatDoodadUses(records));
    }
  });

  it("are merged into the stock sources the search reads", async () => {
    const [id, uses] = Object.entries(readDoodadUses(DOODAD_USES_DIR).doodad)[0]!;
    const extracted = await usesFolder({ "doodad-extracted.json": { [id]: { kind: "other" } }, "doodads.json": { [id]: { kind: "other", variations: 2 } } });
    const { doodads } = readStockDoodadSources({ extractedDir: extracted });
    expect(doodads[id]).toMatchObject({ uses, variations: 2 });
  });
});

describe("cachedStockDoodadSources", () => {
  it("gives the same sources for the same folders, so searches over them reuse their prepared candidates, until they are forgotten", async () => {
    const [id] = Object.keys(readDoodadUses(DOODAD_USES_DIR).doodad);
    const extracted = await usesFolder({ "doodad-extracted.json": { [id!]: { kind: "other" } }, "doodads.json": { [id!]: { kind: "other", variations: 2 } } });
    const first = cachedStockDoodadSources({ extractedDir: extracted });
    expect(cachedStockDoodadSources({ extractedDir: extracted })).toBe(first);
    expect(searchDoodads({ words: [id!] }, first).total).toBe(1);
    await writeFile(path.join(extracted, "doodads.json"), JSON.stringify({ [id!]: { kind: "other", variations: 5 } }));
    expect(cachedStockDoodadSources({ extractedDir: extracted }).doodads[id!]?.variations).toBe(2);
    forgetStockDoodadSources();
    const fresh = cachedStockDoodadSources({ extractedDir: extracted });
    expect(fresh).not.toBe(first);
    expect(fresh.doodads[id!]?.variations).toBe(5);
    // Other option objects are other sources.
    expect(cachedStockDoodadSources({ extractedDir: extracted, terrainObjects: {} })).not.toBe(fresh);
  });
});
