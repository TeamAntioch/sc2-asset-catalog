// extract-decals (docs/adr/0006): the decals' extracted fields and pictures, read from a folder the
// user extracted from their own install, over fake model files and a fake ImageMagick.
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCatalogCli } from "../src/cli.js";
import { DECAL_EXTRACTED_FILE, readDecalCatalog } from "../src/catalog/decal-catalog.js";
import { extractDecals, readDecalModel, type RunMagick } from "../src/catalog/extract-decals.js";
import { m3 } from "./fixtures/m3.js";

const STRIPE = { look: "yellow stripe", shows: ["stripe"], glyphs: "none", shape: "line", tiles: true, use: "marking" } as const;
const NUMBER = { look: "white number", shows: ["number"], glyphs: "number", text: "1", shape: "patch", tiles: false, use: "label" } as const;

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

/** What magick and montage were asked to do; each writes its last argument, as they would. */
function fakeMagick() {
  const calls: { command: string; args: readonly string[] }[] = [];
  const magick: RunMagick = async (command, args) => {
    calls.push({ command, args });
    await writeFile(args.at(-1)!, "");
  };
  return { calls, magick };
}

/**
 * A cache folder that `extract` has filled with three decals (Stripes with two variations, Panel
 * with one drawn as geometry, Lost with no model file extracted), a storage folder holding their
 * model files and textures as cascx writes them, and descriptions of Stripes and Lost.
 */
async function setUp() {
  root = await mkdtemp(path.join(tmpdir(), "extract-decals-"));
  const cache = path.join(root, "cache");
  await mkdir(path.join(cache, "extracted"), { recursive: true });
  await writeFile(
    path.join(cache, "extracted/doodads.json"),
    JSON.stringify({ Stripes: { kind: "decal", variations: 2 }, Panel: { kind: "decal", variations: 1 }, Lost: { kind: "decal", variations: 1 }, Rock: { kind: "rock", variations: 3 } }),
  );
  await writeFile(path.join(cache, "extracted/doodad-models.json"), JSON.stringify({ Stripes: "Assets/Doodads/Stripes/Stripes.m3", Panel: "Assets/Doodads/Panel/Panel.m3" }));
  const storage = path.join(root, "storage");
  const put = async (file: string, data: Uint8Array | string) => {
    await mkdir(path.dirname(path.join(storage, file)), { recursive: true });
    await writeFile(path.join(storage, file), data);
  };
  const flat = (min: [number, number, number], max: [number, number, number], texture: string) => m3({ bounds: { min, max }, strings: [texture, "Assets\\Textures\\Stripe_Normal.dds"], projector: true });
  await put("mods/core.sc2mod/base.sc2assets/Assets/Doodads/Stripes/Stripes_00.m3", flat([-2, -0.5, -1], [2, 0.5, 1], "Assets\\Textures\\Stripe1.dds"));
  await put("mods/core.sc2mod/base.sc2assets/Assets/Doodads/Stripes/Stripes_01.m3", flat([0, 0, 0], [0, 0, 0], "Assets\\Textures\\StripeText.dds"));
  await put("mods/core.sc2mod/base.sc2assets/Assets/Textures/Stripe1.dds", "dds");
  await put("mods/core.sc2mod/base.sc2assets/Assets/Textures/StripeText.dds", "base");
  await put("mods/core.sc2mod/enus.sc2assets/Assets/Textures/StripeText.dds", "enus");
  await put("mods/core.sc2mod/base.sc2assets/Assets/Textures/Atlas.dds", "atlas");
  await put("mods/core.sc2mod/base.sc2assets/Assets/Doodads/Panel/Panel.m3", m3({ bounds: { min: [-1, 0, 0], max: [1, 0, 3] }, strings: ["Assets/Textures/Atlas.dds"] }));
  const descriptionsFile = path.join(root, "decal-descriptions.json");
  await writeFile(descriptionsFile, JSON.stringify({ Lost: [STRIPE], Stripes: [STRIPE, NUMBER, NUMBER] }));
  return { cache, storage, descriptionsFile };
}

describe("reading a decal's model file", () => {
  it("gives the texture it paints, its box in cells and, when it isn't a projector, that it is drawn as geometry", () => {
    expect(readDecalModel(m3({ bounds: { min: [-3.2351, -1.6, 0], max: [3.2351, 1.6, 0] }, strings: ["Assets\\Textures\\Decal_Spec.dds", "Assets\\Textures\\Decal1.dds"], projector: true }))).toEqual({
      texture: "Decal1.dds",
      texturePath: "Assets\\Textures\\Decal1.dds",
      size: [6.47, 3.2],
    });
    expect(readDecalModel(m3({ bounds: { min: [-1, 0, 0], max: [1, 0, 2] } }))).toEqual({ size: [2, 2], drawn: "geometry" });
  });
});

describe("extracting the decals", () => {
  it("writes each variation's fields into the cache, pictures it and builds a numbered sheet of each doodad", async () => {
    const { cache, storage, descriptionsFile } = await setUp();
    const { calls, magick } = fakeMagick();
    const lines: string[] = [];
    const result = await extractDecals({ storageDir: storage, cacheDir: cache, descriptionsFile, magick, font: "Arial.ttf", log: (line) => lines.push(line) });

    expect(JSON.parse(await readFile(path.join(cache, "extracted", DECAL_EXTRACTED_FILE), "utf8"))).toEqual({
      Lost: [{}],
      Panel: [{ texture: "Atlas.dds", size: [2, 3], drawn: "geometry" }],
      Stripes: [{ texture: "Stripe1.dds", size: [4, 1] }, { texture: "StripeText.dds" }],
    });
    expect(result).toEqual({
      doodads: 3,
      variations: 4,
      read: 3,
      pictured: 3,
      sheets: 2,
      problems: ["Lost 0: no model file extracted"],
      undescribed: ["Panel"],
      miscounted: ["Stripes (3 described, 2 in the game)"],
    });
    // A localized texture's enUS copy, squeezed to the box's proportions.
    const pictures = calls.filter((call) => call.command === "magick");
    const texture = (name: string) => `${path.join(storage, "mods/core.sc2mod", name)}[0]`;
    expect(pictures.map((call) => call.args[0]).sort()).toEqual(
      [texture("base.sc2assets/Assets/Textures/Atlas.dds"), texture("base.sc2assets/Assets/Textures/Stripe1.dds"), texture("enus.sc2assets/Assets/Textures/StripeText.dds")].sort(),
    );
    expect(pictures.find((call) => call.args[0]!.includes("Stripe1"))!.args).toContain("240x60!");
    const sheet = calls.find((call) => call.command === "montage" && call.args.at(-1)!.endsWith("Stripes.jpg"))!;
    expect(sheet.args.slice(0, 6)).toEqual(["-label", "00", path.join(cache, "thumbnails/decals/Stripes_00.png"), "-label", "01", path.join(cache, "thumbnails/decals/Stripes_01.png")]);
    expect(sheet.args).toEqual(expect.arrayContaining(["-font", "Arial.ttf", "-tile", "2x"]));
    expect(existsSync(path.join(cache, "catalog-sheets/decals/Stripes.jpg"))).toBe(true);
    expect(lines.join("\n")).toMatch(/No description yet: Panel/);

    // The catalog now carries them.
    expect(readDecalCatalog({ descriptionsFile, extractedDir: path.join(cache, "extracted") }).Stripes![0]).toEqual({ texture: "Stripe1.dds", size: [4, 1], ...STRIPE });
  });

  it("writes only the fields when asked for no sheets", async () => {
    const { cache, storage, descriptionsFile } = await setUp();
    const { calls, magick } = fakeMagick();
    const result = await extractDecals({ storageDir: storage, cacheDir: cache, descriptionsFile, magick, sheets: false });
    expect(calls).toEqual([]);
    expect(result).toMatchObject({ read: 3, pictured: 0, sheets: 0 });
    expect(existsSync(path.join(cache, "extracted", DECAL_EXTRACTED_FILE))).toBe(true);
  });

  it("says to extract first when the cache has no extracted doodads, and names a storage folder that isn't there", async () => {
    const { cache, storage } = await setUp();
    await rm(path.join(cache, "extracted/doodads.json"));
    await expect(extractDecals({ storageDir: storage, cacheDir: cache, sheets: false })).rejects.toThrow(/run the extract command first/);
    await expect(extractDecals({ storageDir: path.join(storage, "nope"), cacheDir: path.join(root!, "cache2"), sheets: false })).rejects.toThrow(/run the extract command first/);
    await writeFile(path.join(cache, "extracted/doodads.json"), "{}");
    await expect(extractDecals({ storageDir: path.join(storage, "nope"), cacheDir: cache, sheets: false })).rejects.toThrow(/No folder .*nope/);
  });

  it("runs from the CLI, a folder relative to where it's run", async () => {
    const { cache, storage } = await setUp();
    const { calls, magick } = fakeMagick();
    const lines: string[] = [];
    await runCatalogCli(["extract-decals", path.relative(root!, storage), "--cache", "cache", "--no-sheets"], { cwd: root!, magick, log: (line) => lines.push(line) });
    expect(calls).toEqual([]);
    expect(existsSync(path.join(cache, "extracted", DECAL_EXTRACTED_FILE))).toBe(true);
    expect(lines.join("\n")).toMatch(/3 decal doodads, 3\/4 variations read -> /);
    await expect(runCatalogCli(["extract-decals"], { cwd: root! })).rejects.toThrow(/takes one folder/);
  });
});
