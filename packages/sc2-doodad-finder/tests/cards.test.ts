// The Doodad Finder's candidate cards (src/cards.ts), over synthetic catalogs.
import { describe, expect, it } from "vitest";

import { candidateCards } from "../src/cards.ts";
import { MOD, sources, VOID_CAMPAIGN } from "./fixtures.ts";

const cardsById = (...args: Parameters<typeof candidateCards>) => new Map(candidateCards(...args).map((card) => [card.id, card]));

describe("candidateCards", () => {
  it("writes a card for each game doodad, terrain object and mod doodad", () => {
    const cards = cardsById(sources({ modDoodads: MOD }));
    expect([...cards.keys()].sort()).toEqual(["BlinkingLightRed", "FoundryPressFrame", "FoundryPressPit0", "FoundryStamperHead", "HullPlate", "LanternBuoy", "MossyBoulder", "Sandbags", "SupplyCrate"]);
    expect(cards.get("FoundryPressPit0")!.source).toBe("terrain-object");
    expect(cards.get("HullPlate")!.source).toBe("mod");
  });

  it("writes one card for an id a game doodad and a terrain object share: the doodad's", () => {
    const cards = candidateCards(sources({ terrainObjects: { SupplyCrate: { name: "Crate Pit", package: "mods/liberty.sc2mod", model: "Assets/TerrainObjects/CratePit/CratePit.m3" } } }));
    expect(cards.filter((card) => card.id === "SupplyCrate")).toMatchObject([{ source: "doodad", name: "Supply Crate" }]);
    const withMod = candidateCards(sources({ modDoodads: MOD, terrainObjects: { HullPlate: { name: "Hull Pit", package: "mods/liberty.sc2mod", model: "Assets/TerrainObjects/HullPit/HullPit.m3" } } }));
    expect(withMod.filter((card) => card.id === "HullPlate")).toMatchObject([{ source: "mod", name: "Hull Plate" }]);
  });

  it("holds the name, the id's words, the look, its facets, tilesets and Doodad Use phrases, without where a use came from", () => {
    const { text } = cardsById(sources()).get("FoundryStamperHead")!;
    expect(text).toBe(
      ["Foundry Stamper Head", "look: heavy steel press head on a piston", "built, medium, prop; story: industry; biome: urban; tilesets: Foundry", "used as: crusher press head over a belt"].join("\n"),
    );
    expect(text).not.toContain("test search");
  });

  it("gives the id's words when they aren't the name's, and a terrain object's use and tileset", () => {
    const { text } = cardsById(sources()).get("FoundryPressPit0")!;
    expect(text).toBe(["Foundry Press Pit (Height 0) (Foundry Press Pit 0)", "look: sunken pit under a press, edged in hazard stripes", "built, pit; story: industry; biome: urban; tilesets: Foundry"].join("\n"));
  });

  it("gives an undescribed doodad only its name and id words, and flags a pending mod doodad", () => {
    const cards = cardsById(sources({ modDoodads: MOD }));
    expect(cards.get("BlinkingLightRed")!.text).toBe("Blinking Light Red");
    expect(cards.get("LanternBuoy")!.text).toBe("LanternBuoy (Lantern Buoy)\npending: not yet described");
    expect(cards.get("LanternBuoy")!.pending).toBe(true);
    expect(cards.get("HullPlate")!.text).toBe("Hull Plate\nlook: riveted grey hull plate\nbuilt, medium, prop; story: starship; biome: space\nused as: bulkhead panel");
  });

  it("keeps a card to about 80 tokens however many Doodad Uses it has", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ use: `a fairly long accepted use phrase number ${i}` }));
    const { text } = cardsById(sources({ notes: { SupplyCrate: { uses: many } } })).get("SupplyCrate")!;
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(60);
    expect(text).toContain("a fairly long accepted use phrase number 0");
  });

  it("marks, for a map, the doodads its dependencies provide, and the dependency each needs, without changing the text", () => {
    const plain = cardsById(sources());
    const forMap = cardsById(sources(), [VOID_CAMPAIGN]);
    expect(forMap.get("FoundryStamperHead")).toMatchObject({ provided: true, dependency: VOID_CAMPAIGN });
    expect(forMap.get("FoundryStamperHead")!.text).toBe(plain.get("FoundryStamperHead")!.text);
    expect(plain.get("FoundryStamperHead")).not.toHaveProperty("provided");
  });
});
