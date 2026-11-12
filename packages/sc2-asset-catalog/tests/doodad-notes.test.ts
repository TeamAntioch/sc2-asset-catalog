// Doodad notes (src/catalog/doodad-notes.ts): adding a Doodad Use or a look, and dropping the notes
// the catalog already holds, over synthetic catalogs.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { addDoodadNote, type KnownDoodads, readDoodadNotes } from "../src/catalog/doodad-notes.js";

const KNOWN: KnownDoodads = {
  doodads: {
    FoundryStamperHead: {
      variations: 1,
      description: { look: "heavy steel press head on a piston", kind: "built", size: "medium", role: "prop", story: ["industry"], biome: ["urban"] },
      uses: [{ use: "press head", scale: 0.6 }],
    },
    FoundryPressFrame: { variations: 1 },
  },
  terrainObjects: {
    FoundryPressPit0: {
      package: "campaigns/liberty.sc2campaign",
      model: "Assets/TerrainObjects/FoundryPressPit/FoundryPressPit.m3",
      description: { look: "sunken pit under a press", kind: "built", story: ["industry"], biome: ["urban"] },
    },
  },
};

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});
const notesFolder = async (notes?: unknown): Promise<string> => {
  root = await mkdtemp(path.join(tmpdir(), "doodad-notes-"));
  if (notes !== undefined) await writeFile(path.join(root, "doodad-notes.json"), JSON.stringify(notes));
  return root;
};

describe("readDoodadNotes", () => {
  it("reads a use written as a plain phrase, from before uses were records, as a record", async () => {
    const at = await notesFolder({ doodads: { FoundryPressFrame: { uses: ["gantry over a conveyor", { use: "crane rail support", variation: 3 }] } } });
    expect(await readDoodadNotes(at)).toEqual({ FoundryPressFrame: { uses: [{ use: "gantry over a conveyor" }, { use: "crane rail support", variation: 3 }] } });
  });

  it("refuses a use record with a field it doesn't know, or a scale that isn't positive", async () => {
    await expect(readDoodadNotes(await notesFolder({ doodads: { FoundryPressFrame: { uses: [{ use: "gantry", mission: "x" }] } } }))).rejects.toThrow(/doodads\.FoundryPressFrame\.uses\.0/);
    await expect(readDoodadNotes(await notesFolder({ doodads: { FoundryPressFrame: { uses: [{ use: "gantry", scale: 0 }] } } }))).rejects.toThrow(/doodads\.FoundryPressFrame\.uses\.0/);
  });
});

describe("addDoodadNote", () => {
  it("adds a Doodad Use or a look to a game doodad or a terrain object, creating the notes file", async () => {
    const at = await notesFolder();
    await addDoodadNote(at, { id: "FoundryPressFrame", use: "  gantry over a conveyor " }, KNOWN);
    await addDoodadNote(at, { id: "FoundryPressFrame", use: "gantry over a conveyor" }, KNOWN);
    const { note } = await addDoodadNote(at, { id: "FoundryPressFrame", use: "crane rail support" }, KNOWN);
    expect(note).toEqual({ uses: [{ use: "gantry over a conveyor" }, { use: "crane rail support" }] });
        await addDoodadNote(at, { id: "FoundryPressPit0", look: "sunken pit under a press, edged in hazard stripes" }, KNOWN);
    expect(await readDoodadNotes(at)).toEqual({
      FoundryPressFrame: { uses: [{ use: "gantry over a conveyor" }, { use: "crane rail support" }] },
      FoundryPressPit0: { look: "sunken pit under a press, edged in hazard stripes" },
    });
  });

  it("keeps a use's variation, scale and source, writes them as a record, and fills them into the same use added again", async () => {
    const at = await notesFolder({ doodads: { FoundryPressFrame: { uses: ["gantry over a conveyor"] } } });
    const { note } = await addDoodadNote(at, { id: "FoundryPressFrame", use: "Gantry over a  conveyor", variation: 2, scale: 1.5, from: "crushing-press search, 2026-11-09" }, KNOWN);
    expect(note).toEqual({ uses: [{ use: "gantry over a conveyor", variation: 2, scale: 1.5, from: "crushing-press search, 2026-11-09" }] });
    expect(JSON.parse(await readFile(path.join(at, "doodad-notes.json"), "utf8"))).toEqual({
      doodads: { FoundryPressFrame: { uses: [{ use: "gantry over a conveyor", variation: 2, scale: 1.5, from: "crushing-press search, 2026-11-09" }] } },
    });
  });

  it("keeps a use the catalog has when it gives a variation or scale the catalog's lacks, and drops it once the catalog has them", async () => {
    const at = await notesFolder();
    const { note, dropped } = await addDoodadNote(at, { id: "FoundryStamperHead", use: "Press head", variation: 2 }, KNOWN);
    expect(note).toEqual({ uses: [{ use: "Press head", variation: 2 }] });
    expect(dropped).toEqual([]);
    const merged = { ...KNOWN, doodads: { ...KNOWN.doodads, FoundryStamperHead: { ...KNOWN.doodads.FoundryStamperHead!, uses: [{ use: "press head", variation: 2, scale: 0.6 }] } } };
    expect((await addDoodadNote(at, { id: "FoundryPressFrame", use: "gantry" }, merged)).dropped).toEqual(["FoundryStamperHead: use “Press head”"]);
  });

  it("refuses a variation, scale or source without a use, and a variation or scale out of range", async () => {
    const at = await notesFolder();
    await expect(addDoodadNote(at, { id: "FoundryPressFrame", look: "a frame", variation: 1 }, KNOWN)).rejects.toThrow(/variation, a scale or a source goes with a use/);
    await expect(addDoodadNote(at, { id: "FoundryPressFrame", use: "frame", variation: 1.5 }, KNOWN)).rejects.toThrow(/variation/);
    await expect(addDoodadNote(at, { id: "FoundryPressFrame", use: "frame", scale: -2 }, KNOWN)).rejects.toThrow(/scale/);
    expect(await readDoodadNotes(at)).toEqual({});
  });

  it("refuses an unknown doodad, and a note with neither a use nor a look", async () => {
    const at = await notesFolder();
    await expect(addDoodadNote(at, { id: "NoSuchDoodad", use: "anything" }, KNOWN)).rejects.toThrow(/NoSuchDoodad isn't a game doodad or a terrain object/);
    await expect(addDoodadNote(at, { id: "FoundryPressFrame", use: "  " }, KNOWN)).rejects.toThrow(/a use or a look/);
    expect(await readDoodadNotes(at)).toEqual({});
  });

  it("drops the notes the catalog already holds: a use its uses file lists (case and spacing aside), a look it has, and an entry left empty", async () => {
    const at = await notesFolder({
      doodads: {
        FoundryStamperHead: { uses: ["Press  Head", "stamping die"], look: "heavy steel press head on a piston" },
        FoundryPressPit0: { look: "sunken pit under a press" },
        LanternPressRig: { uses: ["press head"] },
      },
    });
    const { note, dropped } = await addDoodadNote(at, { id: "FoundryStamperHead", use: "press head" }, KNOWN);
    expect(note).toEqual({ uses: [{ use: "stamping die" }] });
    expect(dropped).toEqual(["FoundryStamperHead: use “Press  Head”", "FoundryStamperHead: look", "FoundryPressPit0: look"]);
    // Notes for an id the catalog doesn't know stay as they are.
    const left = { FoundryStamperHead: { uses: [{ use: "stamping die" }] }, LanternPressRig: { uses: [{ use: "press head" }] } };
    expect(await readDoodadNotes(at)).toEqual(left);
    expect(JSON.parse(await readFile(path.join(at, "doodad-notes.json"), "utf8"))).toEqual({ doodads: left });
  });
});
