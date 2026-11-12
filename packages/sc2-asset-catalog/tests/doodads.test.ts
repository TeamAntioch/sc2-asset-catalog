// The game's doodads as the extract command writes them (src/catalog/doodads.ts): looking one up,
// a mod's laid over them, and checking a placed doodad's type and variation.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkDoodad, type DoodadInfo, getDoodad, NO_DOODAD_LAYER, readDoodadModels, readDoodads, unknownPlacedDoodads } from "../src/catalog/doodads.js";

const STOCK: Record<string, DoodadInfo> = {
  BelShirFlowers: { kind: "foliage", variations: 10, tilesets: ["BelShir"] },
  RockArch: { kind: "rock", variations: 1, tilesets: ["Meinhoff"], blocksGround: true },
};

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("getDoodad", () => {
  it("gives a game doodad's facts", () => {
    expect(getDoodad(STOCK, NO_DOODAD_LAYER, "BelShirFlowers")?.variations).toBe(10);
    expect(getDoodad(STOCK, NO_DOODAD_LAYER, "RockArch")?.tilesets).toContain("Meinhoff");
    expect(getDoodad(STOCK, NO_DOODAD_LAYER, "NoSuchDoodad")).toBeUndefined();
    expect(getDoodad(STOCK, NO_DOODAD_LAYER, "constructor")).toBeUndefined();
  });

  it("gives a mod's doodad of a game id the game's facts with its own variations, and a mod's own doodad its kind", () => {
    const layer = { doodads: new Map([["RockArch", { variations: 3 }], ["MyLamp", {}]]), models: new Set<string>() };
    expect(getDoodad(STOCK, layer, "RockArch")).toEqual({ kind: "rock", variations: 3, tilesets: ["Meinhoff"], blocksGround: true });
    expect(getDoodad(STOCK, layer, "MyLamp")).toEqual({ kind: "campaign-mod", variations: 1 });
  });
});

describe("checkDoodad", () => {
  it("rejects unknown types and out-of-range variations", () => {
    expect(() => checkDoodad(STOCK, NO_DOODAD_LAYER, "a", "NoSuchDoodad", undefined)).toThrow(/unknown doodad type/);
    expect(() => checkDoodad(STOCK, NO_DOODAD_LAYER, "a", "BelShirFlowers", 10)).toThrow(/variations 0-9/);
    expect(() => checkDoodad(STOCK, NO_DOODAD_LAYER, "a", "BelShirFlowers", 9)).not.toThrow();
    expect(() => checkDoodad(STOCK, NO_DOODAD_LAYER, "a", undefined, 0)).toThrow(/has no doodadType/);
  });
});

describe("unknownPlacedDoodads", () => {
  it("warns once per unknown type, saying when a model of that id has no actor, and skips the caller's own objects", () => {
    const xml = [
      '<ObjectDoodad Id="1" Position="10.5,20,0" Type="RockArch"/>',
      '<ObjectDoodad Id="2" Position="11,21,0" Type="Mystery"/>',
      '<ObjectDoodad Id="3" Position="12,22,0" Type="Mystery"/>',
      '<ObjectDoodad Id="4" Position="1,2,0" Type="ModelOnly"/>',
      '<ObjectDoodad Id="5" Position="1,2,0" Type="Skipped"/>',
    ].join("\n");
    const warnings = unknownPlacedDoodads(xml, STOCK, { doodads: new Map(), models: new Set(["ModelOnly"]) }, new Set([5]));
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/^Objects places 2 copies of Mystery \(the first at 11, 21, 0\)/);
    expect(warnings[1]).toMatch(/a copy of ModelOnly \(at 1, 2, 0\), which isn't a doodad type: there is a CModel ModelOnly but no CActorDoodad/);
  });
});

describe("reading the extracted files", () => {
  it("reads doodads.json and doodad-models.json from the extracted folder", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "doodads-"));
    await writeFile(path.join(dir, "doodads.json"), JSON.stringify(STOCK));
    await writeFile(path.join(dir, "doodad-models.json"), JSON.stringify({ RockArch: "Assets/Doodads/RockArch/RockArch.m3" }));
    expect(readDoodads(dir)).toEqual(STOCK);
    expect(readDoodadModels(dir)).toEqual({ RockArch: "Assets/Doodads/RockArch/RockArch.m3" });
  });
});
