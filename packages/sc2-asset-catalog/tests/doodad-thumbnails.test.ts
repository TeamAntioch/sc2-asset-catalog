import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { jobSheet, modelJob, modelPathCandidates, thumbnailFileName } from "../src/catalog/doodad-thumbnails.js";

describe("doodad thumbnails", () => {
  it("asks for numbered variation files, and either form for single-variation models", () => {
    // ShakurasRockColumn.m3 doesn't exist in the game's storage; _00 and _01 do.
    expect(modelPathCandidates("Assets/Doodads/ShakurasRockColumn/ShakurasRockColumn.m3", 1, 8)).toEqual([
      "Assets/Doodads/ShakurasRockColumn/ShakurasRockColumn_01.m3",
    ]);
    expect(modelPathCandidates("Assets/Doodads/ShakurasRockColumn/ShakurasRockColumn.m3", 0, 8)).toEqual([
      "Assets/Doodads/ShakurasRockColumn/ShakurasRockColumn_00.m3",
      "Assets/Doodads/ShakurasRockColumn/ShakurasRockColumn.m3",
    ]);
    expect(modelPathCandidates("Assets/Doodads/RockArch/RockArch.m3", 0, 1)).toEqual([
      "Assets/Doodads/RockArch/RockArch.m3",
      "Assets/Doodads/RockArch/RockArch_00.m3",
    ]);
  });

  it("names outputs by doodad, variation and angle", () => {
    expect(thumbnailFileName("ShakurasTree", 3, 2)).toBe("ShakurasTree_03_a2.png");
  });

  it("puts each rendered variation's sheet beside its four renders", () => {
    expect(jobSheet({ type: "PortCityCrane", variation: 3 }, "/search/renders")).toEqual({
      renders: [0, 1, 2, 3].map((angle) => path.join("/search/renders", `PortCityCrane_03_a${angle}.png`)),
      sheet: path.join("/search/renders", "PortCityCrane_03.jpg"),
    });
  });

  it("renders a model no catalog lists, such as a mod doodad's, from its file where the mapper typed it, else as a storage path", async () => {
    const ran = await mkdtemp(path.join(tmpdir(), "model-job-"));
    try {
      await mkdir(path.join(ran, "mods/story/Assets"), { recursive: true });
      await writeFile(path.join(ran, "mods/story/Assets/LiftCage.m3"), "m3");
      expect(modelJob("StoryLiftCage", "mods/story/Assets/LiftCage.m3", ran)).toEqual({ type: "StoryLiftCage", model: path.join(ran, "mods/story/Assets/LiftCage.m3"), variation: 0, variations: 1 });
      // The same file written the Editor's way is found on disk too.
      expect(modelJob("StoryLiftCage", "mods\\story\\Assets\\LiftCage.m3", ran)).toMatchObject({ model: path.join(ran, "mods/story/Assets/LiftCage.m3") });
      // A ModelData path the game holds, with the Editor's backslashes.
      expect(modelJob("Crusher", "Assets\\Doodads\\PortZionCrusher\\PortZionCrusher.m3", ran)).toMatchObject({ model: "Assets/Doodads/PortZionCrusher/PortZionCrusher.m3" });
    } finally {
      await rm(ran, { recursive: true, force: true });
    }
  });
});
