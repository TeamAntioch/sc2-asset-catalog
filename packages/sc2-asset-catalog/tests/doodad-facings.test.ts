// Doodad facings (src/catalog/doodad-facings.ts): which way a doodad's front faces, from measured
// facings or a sure reading of its sheet, over synthetic files; none ship with this package.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  compositeFront,
  compositeFrontFrom,
  type DoodadFacings,
  type DoodadSheetReadings,
  getDoodadFacing,
  getDoodadFront,
  NO_DOODAD_FACINGS,
  NO_SHEET_READINGS,
  readDoodadFacings,
  rotationToFace,
  sheetPictureAzimuth,
} from "../src/catalog/doodad-facings.js";
import { searchDoodads } from "../src/catalog/doodad-search.js";

const degrees = (radians: number): number => Math.round(((((radians * 180) / Math.PI) % 360) + 360) % 360 * 1000) / 1000;

const FACINGS: DoodadFacings = {
  about: "Test facings.",
  placements: {
    "wall-foot": { standOff: 1, about: "at a wall's foot" },
    "wall-face": { standOff: -0.5, height: 2, about: "on a wall's face" },
    "wall-top": { about: "on a wall's top" },
    free: { about: "anywhere" },
  },
  doodads: {
    Lockers: { front: 270, placement: "wall-foot", measured: "mapper, 2026-11-09, facing strip" },
    Tank: { front: 180, placement: "wall-foot", standOff: 2.6, measured: "mapper, 2026-11-09, facing strip" },
    Screens: { front: 90, placement: "wall-face", measured: "mapper, 2026-11-09, facing strip" },
  },
};

const READINGS: DoodadSheetReadings = {
  about: "Test readings.",
  pictures: "a0 south-east, a1 south-west, a2 north-west, a3 north-east",
  doodads: {
    // Pictures 0 and 1 show the front: it faces south.
    Console: { faces: [0, 1], sure: true, placement: "wall-foot", read: "agent, 2026-11-11, catalog sheet" },
    Doubtful: { faces: [1, 2], sure: false, read: "agent, 2026-11-11, catalog sheet" },
    Diagonal: { faces: [0], sure: true, read: "agent, 2026-11-11, catalog sheet" },
    Lockers: { faces: [2, 3], sure: true, read: "agent, 2026-11-11, catalog sheet" },
  },
};

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("doodad facings", () => {
  it("knows nothing by default", () => {
    expect(getDoodadFacing("Lockers")).toBeUndefined();
    expect(getDoodadFront("Console")).toBeUndefined();
    expect(NO_DOODAD_FACINGS.doodads).toEqual({});
    expect(NO_SHEET_READINGS.doodads).toEqual({});
  });

  it("fills a measured facing's stand-off and height from its placement, unless it gives its own", () => {
    expect(getDoodadFacing("Lockers", FACINGS)).toMatchObject({ front: 270, standOff: 1 });
    expect(getDoodadFacing("Tank", FACINGS)).toMatchObject({ standOff: 2.6 });
    expect(getDoodadFacing("Screens", FACINGS)).toMatchObject({ standOff: -0.5, height: 2 });
  });

  it("takes a measured front over a sheet's, and a sheet's only when sure and seen in two pictures", () => {
    expect(getDoodadFront("Lockers", FACINGS, READINGS)).toEqual({ front: 270, source: "measured" });
    expect(getDoodadFront("Console", FACINGS, READINGS)).toEqual({ front: 270, source: "sheet" });
    expect(getDoodadFront("Doubtful", FACINGS, READINGS)).toBeUndefined();
    expect(getDoodadFront("Diagonal", FACINGS, READINGS)).toBeUndefined();
    expect(sheetPictureAzimuth(0)).toBe(315);
  });

  it("turns a front to a facing, and an unknown doodad's rotation to it", () => {
    const south = (3 * Math.PI) / 2;
    expect(degrees(rotationToFace("Lockers", south, FACINGS).rotation)).toBe(0);
    expect(degrees(rotationToFace("Tank", south, FACINGS).rotation)).toBe(90);
    expect(degrees(rotationToFace("Screens", south, FACINGS).rotation)).toBe(180);
    expect(rotationToFace("Unknown", south, FACINGS)).toEqual({ rotation: south });
    expect(rotationToFace("Console", south, FACINGS, READINGS).source).toBe("sheet");
  });

  it("finds a composite's front from its members when they agree, else its own", () => {
    expect(degrees(compositeFront({ members: [{ type: "Lockers", yaw: 0 }, { type: "Screens", yaw: Math.PI }] }, FACINGS)!)).toBe(270);
    expect(compositeFront({ members: [{ type: "Lockers", yaw: 0 }, { type: "Screens", yaw: 0 }] }, FACINGS)).toBeUndefined();
    expect(compositeFront({ members: [{ type: "Unknown", yaw: 0 }] }, FACINGS)).toBeUndefined();
    expect(degrees(compositeFront({ front: 45, members: [{ type: "Unknown", yaw: 0 }] }, FACINGS)!)).toBe(45);
    expect(compositeFrontFrom({ members: [{ type: "Lockers", yaw: 0 }, { type: "Console", yaw: 0 }] }, FACINGS, READINGS).sheet).toEqual(["Console"]);
  });

  it("reads and checks a facings file", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "facings-"));
    const file = path.join(dir, "facings.json");
    await writeFile(file, JSON.stringify(FACINGS));
    expect(readDoodadFacings(file)).toEqual(FACINGS);
    await writeFile(file, JSON.stringify({ ...FACINGS, doodads: { Lockers: { front: 400, placement: "wall-foot", measured: "x" } } }));
    expect(() => readDoodadFacings(file)).toThrow();
  });

  it("are carried by search results when the sources have them", () => {
    const description = { look: "steel lockers", kind: "built", size: "small", role: "prop", story: [], biome: ["any"] } as const;
    const sources = { doodads: { Lockers: { variations: 1, description }, Console: { variations: 1, description: { ...description, look: "steel console" } } }, terrainObjects: {}, root: "/nowhere", facings: FACINGS, readings: READINGS };
    const found = Object.fromEntries(searchDoodads({ words: ["steel"] }, sources).results.map(({ id, facing }) => [id, facing]));
    expect(found.Lockers).toMatchObject({ front: 270, source: "measured", standOff: 1 });
    expect(found.Console).toMatchObject({ front: 270, source: "sheet", sure: true, placement: "wall-foot" });
    expect(searchDoodads({ words: ["steel"] }, { ...sources, facings: undefined, readings: undefined }).results.every((result) => result.facing === undefined)).toBe(true);
  });
});
