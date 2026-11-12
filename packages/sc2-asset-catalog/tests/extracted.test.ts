// Checks on a real extraction from SC2GameData, run only when SC2_ASSET_CATALOG_EXTRACTED names its
// folder: CI runs them after the smoke test has extracted the catalog. The unit tests use synthetic
// data, since nothing extracted from the game ships with this package.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readDoodadCatalog } from "../src/catalog/doodad-catalog.js";
import { matchDoodads, readStockDoodadSources } from "../src/catalog/doodad-search.js";
import { DOODAD_USES_DIR } from "../src/catalog/catalog-dirs.js";
import { readDoodadUses } from "../src/catalog/doodad-uses.js";
import { checkDoodad, getDoodad, NO_DOODAD_LAYER, readDoodadModels, readDoodads } from "../src/catalog/doodads.js";

const extracted = process.env.SC2_ASSET_CATALOG_EXTRACTED;

describe.skipIf(!extracted)("a real extraction", () => {
  const dir = extracted!;
  const stock = () => readDoodads(dir);

  it("holds every described doodad and every Doodad Use's doodad", () => {
    expect(readDoodadCatalog(dir).unextracted).toEqual([]);
    const { doodads } = readStockDoodadSources({ extractedDir: dir });
    expect(Object.keys(readDoodadUses(DOODAD_USES_DIR).doodad).filter((id) => !Object.hasOwn(doodads, id))).toEqual([]);
    expect(Object.keys(doodads).length).toBeGreaterThan(2500);
  });

  it("knows the Editor-placed Bel'Shir doodads and their variation counts", () => {
    expect(getDoodad(stock(), NO_DOODAD_LAYER, "BelShirFlowers")?.variations).toBe(10);
    expect(getDoodad(stock(), NO_DOODAD_LAYER, "RockArch")?.tilesets).toContain("Meinhoff");
    expect(() => checkDoodad(stock(), NO_DOODAD_LAYER, "a", "BelShirFlowers", 10)).toThrow(/variations 0-9/);
  });

  it("finds models whose id differs from the doodad's", () => {
    const models = readDoodadModels(dir);
    expect(models.AiurTempleAdunGeneratorDoodad).toBe("Assets/Doodads/Aiur_Temple_AdunGenerator/Aiur_Temple_AdunGenerator.m3");
    expect(models.Amon).toBe("Assets/Units/Protoss/Amon/Amon.m3");
  });

  it("finds the doodads only novastoryassets.sc2mod and voidprologue.sc2mod define, undescribed, by words of their name and id", () => {
    const sources = readStockDoodadSources({ extractedDir: dir });
    const models = readDoodadModels(dir);
    for (const [id, words] of [
      ["FlameTurretFlameModelDoodad", ["flame", "turret"]],
      ["Tarsonis_Windows_Terran_Destructible", ["tarsonis", "windows", "terran"]],
      ["VoidPrologueColonistShip", ["colonist", "ship"]],
      ["VultureChase_CargoTruckUnitTrailer", ["cargo", "truck", "trailer"]],
    ] as const) {
      expect(models[id], id).toMatch(/\.m3$/);
      expect(matchDoodads({ words: [...words] }, sources).map((match) => match.id), id).toContain(id);
    }
  });

  it("leaves walkable decks unblocked and blocks solid doodads, as SC2GameData's footprints say", () => {
    const blocks = (id: string) => getDoodad(stock(), NO_DOODAD_LAYER, id)?.blocksGround === true;
    expect(["UmojanLabCatwalkSectionPlatform", "IceBridge", "MarSaraBridge", "ChainLinkFenceStraight", "UnbuildablePlates"].filter(blocks)).toEqual([]);
    expect(["MengskPalace", "CastanarStasisTubeLarge", "PathingandSightBlocker1x1Doodad"].filter((id) => !blocks(id))).toEqual([]);
  });

  it("holds every doodad the repo's test asks expect", () => {
    const asks = JSON.parse(readFileSync(fileURLToPath(new URL("../../../test-asks.json", import.meta.url)), "utf8")) as { asks: { expected: string[] }[] };
    const doodads = stock();
    expect(asks.asks.flatMap(({ expected }) => expected).filter((id) => !Object.hasOwn(doodads, id))).toEqual([]);
  });
});
