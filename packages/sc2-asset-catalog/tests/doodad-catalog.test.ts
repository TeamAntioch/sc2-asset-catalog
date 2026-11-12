// The doodad catalog in two files (docs/adr/0001): the descriptions we write, which ship, and the
// fields extracted from the game into the user's cache, joined by doodad id.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DOODAD_DESCRIPTIONS_PATH } from "../src/catalog/catalog-dirs.js";
import { DOODAD_DESCRIPTION_FIELDS, joinDoodadCatalog, parseDoodadDescriptions, readDoodadCatalog, splitDoodadCatalog } from "../src/catalog/doodad-catalog.js";

const CRATE = { look: "wooden supply crate with metal bands", kind: "built", size: "small", role: "prop", story: ["camp"], biome: ["any"] } as const;
const WRECK = { look: "burnt-out truck on its side", kind: "built", size: "large", role: "structure", story: ["wreckage"], biome: ["desert"], state: "destroyed" } as const;

/** A catalog as build-doodad-catalog.mjs wrote it before the split, field order and all. */
const CATALOG = {
  Crate: { kind: "other", package: "mods/liberty.sc2mod", categories: "DoodadType:Props", name: "Crate", image: "Crate.jpg", sheet: "data/catalog-sheets/doodads/Crate.jpg", description: CRATE },
  CrateStack: { kind: "other", package: "mods/liberty.sc2mod", name: "Crate Stack", image: "Crate.jpg", description: CRATE, sharesPicture: ["Crate"] },
  Lamp: { kind: "light", package: "mods/core.sc2mod", name: "ActorLightSpot" },
  TruckWreck: {
    kind: "ruin",
    package: "campaigns/void.sc2campaign",
    tilesets: ["Char"],
    name: "Truck (Destroyed)",
    thumbnail: "data/thumbnails/doodads/TruckWreck_00_a0.png",
    sheet: "data/catalog-sheets/doodads/TruckWreck.jpg",
    description: WRECK,
    rendered: true,
  },
};

describe("splitting the doodad catalog", () => {
  it("joins back into the same entries, in the same field order", () => {
    const { descriptions, extracted } = splitDoodadCatalog(CATALOG);
    const joined = joinDoodadCatalog(descriptions, extracted);
    expect(joined.unextracted).toEqual([]);
    expect(JSON.stringify(joined.catalog, null, 2)).toBe(JSON.stringify(CATALOG, null, 2));
  });

  it("keeps only descriptions in the descriptions file, keyed by id, and nothing of them in the extracted one", () => {
    const { descriptions, extracted } = splitDoodadCatalog(CATALOG);
    expect(descriptions).toEqual({ Crate: CRATE, CrateStack: CRATE, TruckWreck: WRECK });
    expect(extracted.TruckWreck).toEqual({
      kind: "ruin",
      package: "campaigns/void.sc2campaign",
      tilesets: ["Char"],
      name: "Truck (Destroyed)",
      thumbnail: "data/thumbnails/doodads/TruckWreck_00_a0.png",
      sheet: "data/catalog-sheets/doodads/TruckWreck.jpg",
      rendered: true,
    });
    expect(extracted.Lamp).toEqual(CATALOG.Lamp);
  });

  it("reports a described id that wasn't extracted, and leaves it out", () => {
    const { catalog, unextracted } = joinDoodadCatalog({ Crate: CRATE, Gone: WRECK }, { Crate: { kind: "other", name: "Crate" }, Lamp: { kind: "light" } });
    expect(unextracted).toEqual(["Gone"]);
    expect(catalog).toEqual({ Crate: { kind: "other", name: "Crate", description: CRATE }, Lamp: { kind: "light" } });
  });
});

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("readDoodadCatalog", () => {
  it("joins a folder's extracted fields to the descriptions, naming described ids it lacks", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "doodad-catalog-"));
    const descriptions = path.join(dir, "descriptions.json");
    await writeFile(descriptions, JSON.stringify({ Crate: CRATE, Gone: WRECK }));
    await writeFile(path.join(dir, "doodad-extracted.json"), JSON.stringify({ Crate: { kind: "other", name: "Crate" }, Lamp: { kind: "light" } }));
    const read = readDoodadCatalog(dir, descriptions);
    expect(read.catalog).toEqual({ Crate: { kind: "other", name: "Crate", description: CRATE }, Lamp: { kind: "light" } });
    expect(read.unextracted).toEqual(["Gone"]);
  });

  it("refuses a descriptions file that isn't valid, naming it", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "doodad-catalog-"));
    const descriptions = path.join(dir, "descriptions.json");
    await writeFile(descriptions, JSON.stringify({ Crate: { ...CRATE, kind: "metal" } }));
    await writeFile(path.join(dir, "doodad-extracted.json"), JSON.stringify({ Crate: { kind: "other" } }));
    expect(() => readDoodadCatalog(dir!, descriptions)).toThrow(/descriptions\.json.*Crate\.kind/);
  });

  it("says to extract when the folder has no extracted fields", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "doodad-catalog-"));
    expect(() => readDoodadCatalog(dir!)).toThrow(/run the extract command/);
  });
});

describe("parseDoodadDescriptions", () => {
  it("reads a descriptions file keyed by doodad id", () => {
    expect(parseDoodadDescriptions(JSON.stringify({ Crate: CRATE }), "d.json")).toEqual({ Crate: CRATE });
  });

  it("refuses an unknown field, kind, size or role, and an empty look, naming the id and field", () => {
    expect(() => parseDoodadDescriptions(JSON.stringify({ Crate: { ...CRATE, name: "Crate" } }), "d.json")).toThrow(/d\.json.*Crate/);
    expect(() => parseDoodadDescriptions(JSON.stringify({ Crate: { ...CRATE, kind: "metal" } }), "d.json")).toThrow(/Crate\.kind/);
    expect(() => parseDoodadDescriptions(JSON.stringify({ Crate: { ...CRATE, size: "big" } }), "d.json")).toThrow(/Crate\.size/);
    expect(() => parseDoodadDescriptions(JSON.stringify({ Crate: { ...CRATE, role: "thing" } }), "d.json")).toThrow(/Crate\.role/);
    expect(() => parseDoodadDescriptions(JSON.stringify({ Crate: { ...CRATE, look: " " } }), "d.json")).toThrow(/Crate\.look/);
    expect(() => parseDoodadDescriptions("{", "d.json")).toThrow(/d\.json isn't JSON/);
  });
});

describe("the shipped descriptions", () => {
  it("are valid, and hold no field extracted from the game", async () => {
    const descriptions = parseDoodadDescriptions(await readFile(DOODAD_DESCRIPTIONS_PATH, "utf8"), "data/doodad-descriptions.json");
    expect(Object.keys(descriptions).length).toBeGreaterThan(2000);
    for (const [id, description] of Object.entries(descriptions)) for (const field of Object.keys(description)) expect(DOODAD_DESCRIPTION_FIELDS, `${id}.${field}`).toContain(field);
  });

  it("are in id order, as two-space JSON", async () => {
    const text = await readFile(DOODAD_DESCRIPTIONS_PATH, "utf8");
    const ids = Object.keys(JSON.parse(text) as object);
    expect(ids.filter((id, i) => i > 0 && ids[i - 1]!.localeCompare(id) > 0)).toEqual([]);
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  });
});
