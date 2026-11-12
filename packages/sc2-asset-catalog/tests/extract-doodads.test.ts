import { describe, expect, it } from "vitest";

import { extractDoodads } from "../src/catalog/extract-doodads.js";

const catalog = (body: string) => `<?xml version="1.0" encoding="us-ascii"?>\n<Catalog>\n${body}\n</Catalog>\n`;

describe("extractDoodads", () => {
  it("counts a doodad's variations from its model, through the model's parents and the actor's Model", () => {
    const doodads = extractDoodads([
      {
        name: "mods/core.sc2mod",
        actorData: catalog(`    <CActorDoodad id="RockSmall"/>
    <CActorDoodad id="CrateStack">
        <Model value="Crates"/>
    </CActorDoodad>
    <CActorDoodad id="PlainSign"/>`),
        modelData: catalog(`    <CModel id="Doodad" default="1"/>
    <CModel id="RockSmall" parent="Doodad">
        <VariationCount value="6"/>
    </CModel>
    <CModel id="CratesBase" default="1">
        <VariationCount value="3"/>
    </CModel>
    <CModel id="Crates" parent="CratesBase"/>
    <CModel id="PlainSign" parent="Doodad"/>`),
      },
    ]);
    expect(doodads.RockSmall?.variations).toBe(6);
    expect(doodads.CrateStack?.variations).toBe(3);
    expect(doodads.PlainSign?.variations).toBe(1);
  });

  it("leaves out abstract actors, actors with no model and commented-out ones, and lists the rest in id order", () => {
    const doodads = extractDoodads([
      {
        name: "mods/liberty.sc2mod",
        actorData: catalog(`    <CActorDoodad default="1">
        <EditorCategories value="DoodadType:Props"/>
    </CActorDoodad>
    <CActorDoodad default="1" id="RoadParent"/>
    <CActorDoodad id="Road" parent="RoadParent"/>
    <CActorDoodad id="FrozenWaterfall"/>
    <!--CActorDoodad id="OldCrate"/-->
    <CActorDoodad id="Bush"/>`),
        modelData: catalog(`    <CModel id="RoadParent"/>
    <CModel id="Road"/>
    <CModel id="OldCrate"/>
    <CModel id="Bush"/>`),
      },
    ]);
    expect(Object.keys(doodads)).toEqual(["Bush", "Road"]);
  });

  it("finds a doodad whose actor or model a later package defines", () => {
    const doodads = extractDoodads([
      { name: "mods/liberty.sc2mod", actorData: catalog(`    <CActorDoodad id="Crane"/>`) },
      {
        name: "mods/novastoryassets.sc2mod",
        actorData: catalog(`    <CActorDoodad id="Tarsonis_Windows"/>`),
        modelData: catalog(`    <CModel id="Crane"/>
    <CModel id="Tarsonis_Windows">
        <VariationCount value="2"/>
    </CModel>`),
      },
    ]);
    expect(doodads).toEqual({ Crane: { kind: "other", variations: 1 }, Tarsonis_Windows: { kind: "other", variations: 2 } });
  });

  it("gives a doodad the Editor categories its actor or a named parent sets, not the root default's, and every TexSets value", () => {
    const doodads = extractDoodads([
      {
        name: "mods/liberty.sc2mod",
        actorData: catalog(`    <CActorDoodad default="1">
        <EditorCategories value="DoodadType:Props"/>
    </CActorDoodad>
    <CActorDoodad default="1" id="RoadParent">
        <EditorCategories value="DoodadType:Environment"/>
    </CActorDoodad>
    <CActorDoodad id="Road" parent="RoadParent"/>
    <CActorDoodad id="AsteroidsSky">
        <EditorCategories value="Climate:Jungle,DoodadType:Environment"/>
        <TexSets value="Avernus"/>
        <TexSets value="BraxisAlpha"/>
        <On Terms="ActorCreation" Send="Create"/>
        <TexSets value="Castanar"/>
    </CActorDoodad>
    <CActorDoodad id="Crate"/>`),
        modelData: catalog(`    <CModel id="Road"/>
    <CModel id="AsteroidsSky"/>
    <CModel id="Crate"/>`),
      },
      {
        name: "campaigns/liberty.sc2campaign",
        actorData: catalog(`    <CActorDoodad id="Crate">
        <TexSets value="Agria"/>
    </CActorDoodad>`),
      },
    ]);
    expect(doodads.Road?.categories).toBe("DoodadType:Environment");
    expect(doodads.AsteroidsSky).toMatchObject({
      categories: "Climate:Jungle,DoodadType:Environment",
      tilesets: ["Avernus", "BraxisAlpha", "Castanar"],
    });
    expect(doodads.Crate).toEqual({ kind: "other", tilesets: ["Agria"], variations: 1 });
  });

  it("gives a doodad a rough kind from words in its id, the first matching kind winning", () => {
    const ids = {
      AgriaTree: "tree",
      PortCity_StreetLight: "tree", // "Street" holds "tree"
      HybridHologram: "tree", // "Hologram" holds "log"
      StoreFrontCanopy: "tree",
      Aiur_Stone_Temple: "rock", // stone before temple
      XelNaga_WallChunks: "rock",
      RedstoneCurtain: "rock",
      Searchlight: "ruin", // "Searchlight" holds "arch"
      SpacePlatformWallLight: "ruin",
      Aiur_Temple_GroundDecal: "ruin",
      XelNagaObelisk: "ruin",
      Slayn_BrickFloor: "ruin",
      CastanarFloodlight: "light",
      ZerusLightning: "light",
      Aiur_MossClumps: "foliage",
      Tumbleweeds: "foliage",
      DecalSpace: "decal",
      Fog_Aiur: "water/fx",
      Aiur_Fireflies: "water/fx",
      BirdsTarsonis: "water/fx",
      AircraftAssembly: "other",
    };
    const doodads = extractDoodads([
      {
        name: "mods/liberty.sc2mod",
        actorData: catalog(Object.keys(ids).map((id) => `    <CActorDoodad id="${id}"/>`).join("\n")),
        modelData: catalog(Object.keys(ids).map((id) => `    <CModel id="${id}"/>`).join("\n")),
      },
    ]);
    expect(Object.fromEntries(Object.entries(doodads).map(([id, info]) => [id, info.kind]))).toEqual(ids);
  });

  it("marks a doodad as blocking ground when its footprint's Place layer has a GroundNoSpawn cell (x by default), in any package", () => {
    const doodads = extractDoodads([
      {
        name: "mods/liberty.sc2mod",
        actorData: catalog(`    <CActorDoodad id="Boulder">
        <Footprint value="FootprintDoodad1x1"/>
    </CActorDoodad>
    <CActorDoodad id="BoulderLarge" parent="Boulder"/>
    <CActorDoodad id="Shrub">
        <Footprint value="ShrubFootprint1x1"/>
    </CActorDoodad>
    <CActorDoodad id="Tower">
        <Footprint value="FootprintDoodad1x1BlockLOS"/>
    </CActorDoodad>
    <CActorDoodad id="Ramp">
        <Footprint value="Footprint2x2PlacementOnly"/>
    </CActorDoodad>
    <CActorDoodad id="Gate">
        <Footprint value="FootprintDoodad4x5"/>
    </CActorDoodad>
    <CActorDoodad id="Blocker">
        <Footprint value="Footprint2x2DoodadBlockLOS"/>
    </CActorDoodad>
    <CActorDoodad id="Catwalk">
        <Footprint value="CatwalkFootprint"/>
    </CActorDoodad>
    <CActorDoodad id="Bridge">
        <Footprint value="BridgeFootprint"/>
    </CActorDoodad>
    <CActorDoodad id="Pebble"/>`),
        modelData: catalog(["Boulder", "BoulderLarge", "Shrub", "Tower", "Ramp", "Gate", "Blocker", "Catwalk", "Bridge", "Pebble"].map((id) => `    <CModel id="${id}"/>`).join("\n")),
        footprintData: catalog(`    <CFootprint id="FootprintDoodad1x1">
        <Layers index="Check" Area="0,0,1,1">
            <Rows value="x"/>
        </Layers>
        <Layers index="Place" Area="0,0,1,1">
            <Rows value="x"/>
        </Layers>
    </CFootprint>
    <CFootprint id="ShrubFootprint1x1">
        <Layers index="Place" Area="0,0,1,1">
            <Sets Character="o">
                <Positive index="NoBuild" value="1"/>
            </Sets>
            <Rows value="o"/>
        </Layers>
    </CFootprint>
    <CFootprint id="FootprintDoodad1x1BlockLOS">
        <Layers index="Place">
            <Sets index="1">
                <Positive index="GroundNoSpawn" value="1"/>
            </Sets>
        </Layers>
    </CFootprint>
    <CFootprint id="Footprint2x2DoodadBlockLOS">
        <Layers index="Place">
            <Sets index="0">
                <Positive index="BlockVision" value="1"/>
            </Sets>
            <Sets Character="o">
                <Positive index="GroundNoSpawn" value="1"/>
                <Positive index="NoBuild" value="1"/>
            </Sets>
            <Rows value="oo"/>
            <Rows value="oo"/>
        </Layers>
    </CFootprint>
    <CFootprint id="CatwalkFootprint">
        <Layers index="Place">
            <Sets Character="x">
                <Positive index="GroundNoSpawn" value="0"/>
                <Positive index="NoBuild" value="1"/>
            </Sets>
            <Rows value="xx"/>
        </Layers>
    </CFootprint>
    <CFootprint id="BridgeFootprint">
        <Layers index="Place">
            <Sets index="0">
                <Positive index="GroundNoSpawn" value="0"/>
                <Positive index="BoostCliff" value="1"/>
            </Sets>
            <Rows value="xx"/>
        </Layers>
    </CFootprint>
    <CFootprint id="Footprint2x2PlacementOnly">
        <Layers index="Check">
            <Rows value="xx"/>
            <Rows value="xx"/>
        </Layers>
    </CFootprint>`),
      },
      {
        name: "campaigns/liberty.sc2campaign",
        footprintData: catalog(`    <CFootprint id="FootprintDoodad4x5">
        <Layers index="Place" Area="-2,-2,2,3">
            <Rows value="...."/>
            <Rows value=".xx."/>
        </Layers>
    </CFootprint>`),
      },
    ]);
    expect(Object.entries(doodads).filter(([, info]) => info.blocksGround).map(([id]) => id)).toEqual(["Blocker", "Boulder", "BoulderLarge", "Gate"]);
    expect(Object.keys(doodads.Boulder ?? {})).toEqual(["blocksGround", "kind", "variations"]);
  });
});

describe("extractDoodads walkable footprints", () => {
  // Shaped like swarm.sc2campaign's UmojanLabCatwalkSectionPlatform and a plain rock: both keep the
  // default x set's GroundNoSpawn, but the catwalk's set 0 raises the ground to its deck (BoostCliff).
  const footprints = catalog(`    <CFootprint id="CatwalkPlatform">
        <Layers index="Check" Area="-1,-1,1,1">
            <Rows value=".."/>
            <Rows value=".."/>
        </Layers>
        <Layers index="Place" Area="-1,-1,1,1">
            <Sets index="0">
                <Positive index="BoostCliff" value="1"/>
            </Sets>
            <Rows value=".x"/>
            <Rows value="xx"/>
        </Layers>
    </CFootprint>
    <CFootprint id="SolidRock">
        <Layers index="Place" Area="-1,-1,1,1">
            <Sets index="0">
                <Positive index="BlockVision" value="1"/>
            </Sets>
            <Rows value=".x"/>
            <Rows value="xx"/>
        </Layers>
    </CFootprint>
    <CFootprint id="BridgeWithRails">
        <Layers index="Place" Area="-1,-1,2,1">
            <Sets index="0">
                <Positive index="BoostCliff" value="1"/>
            </Sets>
            <Sets Character="o">
                <Positive index="GroundNoSpawn" value="1"/>
            </Sets>
            <Rows value="oxo"/>
        </Layers>
    </CFootprint>`);
  const actors = catalog(
    [
      ["CatwalkSection", "CatwalkPlatform"],
      ["Rock", "SolidRock"],
      ["RailedBridge", "BridgeWithRails"],
    ]
      .map(([id, footprint]) => `    <CActorDoodad id="${id}">\n        <Footprint value="${footprint}"/>\n    </CActorDoodad>`)
      .join("\n"),
  );
  const models = catalog(`    <CModel id="CatwalkSection"/>\n    <CModel id="Rock"/>\n    <CModel id="RailedBridge"/>`);
  const doodads = extractDoodads([{ name: "campaigns/swarm.sc2campaign", actorData: actors, modelData: models, footprintData: footprints }]);

  it("leaves a catwalk unblocked: its Place cells raise the ground (BoostCliff), so units walk on it", () => {
    expect(doodads.CatwalkSection?.blocksGround).toBeUndefined();
  });

  it("still blocks a solid footprint whose x cells keep GroundNoSpawn", () => {
    expect(doodads.Rock?.blocksGround).toBe(true);
  });

  it("blocks a walkable surface that also has solid cells beside its deck", () => {
    expect(doodads.RailedBridge?.blocksGround).toBe(true);
  });
});

describe("extractDoodads footprints a later package patches", () => {
  const actors = catalog(`    <CActorDoodad id="StasisTube">
        <Footprint value="StasisTubeFootprint"/>
    </CActorDoodad>
    <CActorDoodad id="Tower">
        <Footprint value="TowerFootprint"/>
    </CActorDoodad>
    <CActorDoodad id="Wall">
        <Footprint value="WallFootprint"/>
    </CActorDoodad>`);
  const models = catalog(`    <CModel id="StasisTube"/>\n    <CModel id="Tower"/>\n    <CModel id="Wall"/>`);
  // Shaped like liberty.sc2campaign's CastanarStasisTubeLarge, FootprintDoodad1x1BlockLOS and
  // FootprintWallHorizontalBF, which swarm.sc2campaign patches by row and set index.
  const earlier = catalog(`    <CFootprint id="StasisTubeFootprint">
        <Layers index="Place">
            <Rows value=".."/>
            <Rows value=".."/>
        </Layers>
    </CFootprint>
    <CFootprint id="TowerFootprint">
        <Layers index="Place">
            <Sets index="0">
                <Positive index="BlockVision" value="1"/>
            </Sets>
            <Sets Character="o">
                <Positive index="NoBuild" value="1"/>
            </Sets>
            <Rows value="o"/>
        </Layers>
    </CFootprint>
    <CFootprint id="WallFootprint">
        <Layers index="Place">
            <Sets index="0">
                <Positive index="GroundNoSpawn" value="0"/>
            </Sets>
            <Rows value="...."/>
            <Rows value="xxxx"/>
        </Layers>
    </CFootprint>`);
  const later = catalog(`    <CFootprint id="StasisTubeFootprint">
        <Layers index="Place">
            <Rows index="0" value="xx"/>
            <Rows index="1" value="xx"/>
        </Layers>
    </CFootprint>
    <CFootprint id="TowerFootprint">
        <Layers index="Place">
            <Sets index="1">
                <Positive index="GroundNoSpawn" value="1"/>
            </Sets>
        </Layers>
    </CFootprint>
    <CFootprint id="WallFootprint">
        <Layers index="Place">
            <Rows index="0" value="xxxx"/>
        </Layers>
    </CFootprint>`);
  const doodads = extractDoodads([
    { name: "campaigns/liberty.sc2campaign", actorData: actors, modelData: models, footprintData: earlier },
    { name: "campaigns/swarm.sc2campaign", footprintData: later },
  ]);

  it("reads rows a later package gives by index over the earlier ones", () => {
    expect(doodads.StasisTube?.blocksGround).toBe(true);
  });

  it("applies a set a later package gives by index to the earlier footprint's rows", () => {
    expect(doodads.Tower?.blocksGround).toBe(true);
  });

  it("keeps the earlier footprint's sets when a later package patches only its rows", () => {
    expect(doodads.Wall?.blocksGround).toBeUndefined();
  });
});
