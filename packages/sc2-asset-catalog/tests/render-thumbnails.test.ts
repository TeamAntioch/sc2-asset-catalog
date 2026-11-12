// Rendering the catalog's thumbnails and sheets on this machine (src/catalog/render-thumbnails.ts),
// through a model renderer: here a fake one that writes text files, and a fake montage.
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { catalogThumbnailJobs, type ModelRenderer, renderCatalogSheets, renderThumbnails } from "../src/catalog/render-thumbnails.js";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

/** A renderer that writes each output as text, failing for models it's told are missing. */
function fakeRenderer(missing: readonly string[] = [], key = "v1"): ModelRenderer & { readonly drawn: string[] } {
  const drawn: string[] = [];
  return {
    drawn,
    key: async () => key,
    async render({ model, outputPaths, size }) {
      if (missing.includes(model)) throw Object.assign(new Error(`no such model ${model}`), { notFound: true });
      drawn.push(model);
      for (const file of outputPaths) await writeFile(file, `${model} ${size}`);
    },
    isNotFound: (error) => (error as { notFound?: boolean }).notFound === true,
  };
}

describe("catalogThumbnailJobs", () => {
  it("asks for each doodad's first variation (or all of them), skipping lights, filtered by id", () => {
    const doodads = { Crate: { kind: "other", variations: 3 }, Lamp: { kind: "light", variations: 1 }, Rock: { kind: "rock", variations: 2 } };
    const models = { Crate: "Assets/Doodads/Crate/Crate.m3" };
    expect(catalogThumbnailJobs(doodads, models)).toEqual([
      { type: "Crate", model: "Assets/Doodads/Crate/Crate.m3", variation: 0, variations: 3 },
      { type: "Rock", model: "Assets/Doodads/Rock/Rock.m3", variation: 0, variations: 2 },
    ]);
    expect(catalogThumbnailJobs(doodads, models, { ids: ["Rock"], allVariations: true }).map(({ type, variation }) => `${type}_${variation}`)).toEqual(["Rock_0", "Rock_1"]);
  });
});

describe("renderThumbnails", () => {
  it("renders each job's four angles, tries a variation's other file when the first is missing, and records failures", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "render-"));
    const renderer = fakeRenderer(["Assets/Doodads/Crate/Crate_00.m3", "Assets/Doodads/Gone/Gone.m3", "Assets/Doodads/Gone/Gone_00.m3"]);
    const jobs = [
      { type: "Crate", model: "Assets/Doodads/Crate/Crate.m3", variation: 0, variations: 3 },
      { type: "Gone", model: "Assets/Doodads/Gone/Gone.m3", variation: 0, variations: 1 },
    ];
    expect(await renderThumbnails(renderer, jobs, dir)).toEqual({ rendered: 1, failed: 1, unchanged: 0 });
    expect(await readFile(path.join(dir, "Crate_00_a3.png"), "utf8")).toBe("Assets/Doodads/Crate/Crate.m3 512");
    expect(existsSync(path.join(dir, "Gone_00_a0.png"))).toBe(false);
    const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
    expect(manifest.Crate_00).toMatchObject({ ok: true, model: "Assets/Doodads/Crate/Crate.m3" });
    expect(manifest.Gone_00).toMatchObject({ ok: false, notFound: true });
  });

  it("skips what the same renderer drew before, and draws again with another renderer key or force", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "render-"));
    const jobs = [{ type: "Rock", model: "Assets/Doodads/Rock/Rock.m3", variation: 0, variations: 1 }];
    await renderThumbnails(fakeRenderer(), jobs, dir);
    const again = fakeRenderer();
    expect(await renderThumbnails(again, jobs, dir)).toEqual({ rendered: 0, failed: 0, unchanged: 1 });
    expect(again.drawn).toEqual([]);
    expect((await renderThumbnails(fakeRenderer([], "v2"), jobs, dir)).rendered).toBe(1);
    expect((await renderThumbnails(fakeRenderer([], "v2"), jobs, dir, { force: true })).rendered).toBe(1);
  });

  it("draws again a job whose render was deleted by hand, though its manifest entry says ok, and only that job", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "render-"));
    const jobs = ["Rock", "Tree"].map((type) => ({ type, model: `Assets/Doodads/${type}/${type}.m3`, variation: 0, variations: 1 }));
    await renderThumbnails(fakeRenderer(), jobs, dir);
    await rm(path.join(dir, "Rock_00_a2.png"));
    const again = fakeRenderer();
    expect(await renderThumbnails(again, jobs, dir)).toEqual({ rendered: 1, failed: 0, unchanged: 1 });
    expect(again.drawn).toEqual(["Assets/Doodads/Rock/Rock.m3"]);
    expect(existsSync(path.join(dir, "Rock_00_a2.png"))).toBe(true);
  });

  it("keeps what another run on the same folder recorded meanwhile", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "render-"));
    const jobsOf = (prefix: string) => Array.from({ length: 30 }, (_, i) => ({ type: `${prefix}${i}`, model: `Assets/Doodads/${prefix}${i}/${prefix}${i}.m3`, variation: 0, variations: 1 }));
    // Two runs at once, as two `render` processes would be, each saving as it goes.
    await Promise.all([renderThumbnails(fakeRenderer(), jobsOf("Rock"), dir, { workers: 2 }), renderThumbnails(fakeRenderer(), jobsOf("Tree"), dir, { workers: 2 })]);
    const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
    expect(Object.keys(manifest)).toHaveLength(60);
  });

  it("writes the manifest one save at a time, each whole", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "render-"));
    const jobs = Array.from({ length: 60 }, (_, i) => ({ type: `Rock${i}`, model: `Assets/Doodads/Rock${i}/Rock${i}.m3`, variation: 0, variations: 1 }));
    expect(await renderThumbnails(fakeRenderer(), jobs, dir, { workers: 8 })).toMatchObject({ rendered: 60 });
    const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
    expect(Object.keys(manifest)).toHaveLength(60);
    expect(existsSync(path.join(dir, "manifest.json.partial"))).toBe(false);
  });
});

/** A cache folder with an extraction of these doodads. */
async function extractedCache(doodads: Record<string, { kind: string; variations: number }>): Promise<string> {
  dir = await mkdtemp(path.join(tmpdir(), "render-"));
  const extracted = path.join(dir, "extracted");
  await mkdir(extracted, { recursive: true });
  await writeFile(path.join(extracted, "doodads.json"), JSON.stringify(doodads));
  await writeFile(path.join(extracted, "doodad-models.json"), JSON.stringify(Object.fromEntries(Object.keys(doodads).map((id) => [id, `Assets/Doodads/${id}/${id}.m3`]))));
  await writeFile(path.join(extracted, "doodad-extracted.json"), "{}");
  await writeFile(path.join(extracted, "extracted.json"), "{}");
  return dir;
}

const writeSheet = async (_renders: readonly string[], sheet: string) => writeFile(sheet, "sheet");

describe("renderCatalogSheets", () => {
  it("renders into the cache folder's thumbnails/doodads and builds each doodad's sheet into catalog-sheets/doodads, where the search finds them", async () => {
    await extractedCache({ Rock: { kind: "rock", variations: 1 }, Tree: { kind: "tree", variations: 1 } });
    const montaged: string[] = [];
    const result = await renderCatalogSheets({
      renderer: fakeRenderer(),
      cacheDir: dir,
      ids: ["Rock"],
      montage: async (renders, sheet) => {
        montaged.push(`${renders.map((render) => path.basename(render)).join(",")} -> ${path.relative(dir!, sheet)}`);
        await writeFile(sheet, "sheet");
      },
    });
    expect(result).toMatchObject({ rendered: 1, failed: 0, sheets: 1 });
    expect(montaged).toEqual([`Rock_00_a0.png,Rock_00_a1.png,Rock_00_a2.png,Rock_00_a3.png -> ${path.join("catalog-sheets", "doodads", "Rock.jpg")}`]);
    expect(existsSync(path.join(dir, "thumbnails", "doodads", "Rock_00_a0.png"))).toBe(true);
  });

  it("refuses ids the catalog doesn't have, naming them, before rendering anything", async () => {
    const cacheDir = await extractedCache({ Rock: { kind: "rock", variations: 1 } });
    const renderer = fakeRenderer();
    await expect(renderCatalogSheets({ renderer, cacheDir, ids: ["Rock", "Rokc", "Gone"], montage: writeSheet })).rejects.toThrow(/Rokc, Gone/);
    expect(renderer.drawn).toEqual([]);
  });

  it("says to extract first when the cache folder has no whole extraction", async () => {
    const cacheDir = await extractedCache({ Rock: { kind: "rock", variations: 1 } });
    await rm(path.join(cacheDir, "extracted", "doodad-models.json"));
    await expect(renderCatalogSheets({ renderer: fakeRenderer(), cacheDir, montage: writeSheet })).rejects.toThrow(/sc2-asset-catalog extract/);
  });

  it("draws a hand-deleted render again and rebuilds its sheet, and rebuilds a hand-deleted sheet without drawing", async () => {
    const cacheDir = await extractedCache({ Rock: { kind: "rock", variations: 1 }, Tree: { kind: "tree", variations: 1 } });
    await renderCatalogSheets({ renderer: fakeRenderer(), cacheDir, montage: writeSheet });
    const sheets = path.join(cacheDir, "catalog-sheets", "doodads");

    await rm(path.join(cacheDir, "thumbnails", "doodads", "Rock_00_a0.png"));
    const montaged: string[] = [];
    const redraw = fakeRenderer();
    const montage = async (renders: readonly string[], sheet: string) => {
      montaged.push(path.basename(sheet));
      await writeSheet(renders, sheet);
    };
    expect(await renderCatalogSheets({ renderer: redraw, cacheDir, montage })).toMatchObject({ rendered: 1, unchanged: 1, sheets: 1 });
    expect(redraw.drawn).toEqual(["Assets/Doodads/Rock/Rock.m3"]);
    expect(montaged).toEqual(["Rock.jpg"]);

    await rm(path.join(sheets, "Tree.jpg"));
    montaged.length = 0;
    const none = fakeRenderer();
    expect(await renderCatalogSheets({ renderer: none, cacheDir, montage })).toMatchObject({ rendered: 0, unchanged: 2, sheets: 1 });
    expect(none.drawn).toEqual([]);
    expect(montaged).toEqual(["Tree.jpg"]);
  });

  it("removes the sheet of a doodad whose render now fails", async () => {
    const cacheDir = await extractedCache({ Rock: { kind: "rock", variations: 1 } });
    await renderCatalogSheets({ renderer: fakeRenderer(), cacheDir, montage: writeSheet });
    const sheet = path.join(cacheDir, "catalog-sheets", "doodads", "Rock.jpg");
    expect(existsSync(sheet)).toBe(true);
    const failing = fakeRenderer(["Assets/Doodads/Rock/Rock.m3", "Assets/Doodads/Rock/Rock_00.m3"], "v2");
    expect(await renderCatalogSheets({ renderer: failing, cacheDir, montage: writeSheet })).toMatchObject({ failed: 1, sheets: 0 });
    expect(existsSync(sheet)).toBe(false);
  });
});
