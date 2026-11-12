// The catalog's CLI (src/cli.ts): `extract` builds the extracted fields into the cache, `render`
// draws sheets with the built-in renderer or a renderer module, and `setup-renderer` refuses where it
// can't run. Over a fake fetch, a fake viewer and a renderer module on disk.
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CATALOG_USAGE, runCatalogCli } from "../src/cli.js";
import { GALLERY_TREE_URL } from "../src/catalog/extract-catalog.js";
import { SC2_GAME_DATA_URL } from "../src/catalog/extract-doodads.js";
import type { RunViewer } from "../src/catalog/whiteoutflakes.js";
import { writeRgbaPng } from "../src/util/png.js";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

const catalog = (body: string) => `<?xml version="1.0" encoding="us-ascii"?>\n<Catalog>\n${body}\n</Catalog>\n`;
const fetch = (async (url: string | URL) => {
  const table: Record<string, string> = {
    [`${SC2_GAME_DATA_URL}/mods/liberty.sc2mod/base.sc2data/GameData/ActorData.xml`]: catalog(`    <CActorDoodad id="Rock"/>`),
    [`${SC2_GAME_DATA_URL}/mods/liberty.sc2mod/base.sc2data/GameData/ModelData.xml`]: catalog(`    <CModel id="Rock"/>`),
    [GALLERY_TREE_URL]: JSON.stringify({ tree: [{ path: "public/doodads/Rock.jpg" }] }),
  };
  const body = table[String(url)];
  return body === undefined ? new Response("", { status: 404 }) : new Response(body);
}) as typeof globalThis.fetch;

const W = [255, 255, 255, 255];
const M = [120, 80, 40, 255];
/** A 4×4 frame of a 2×2 model on white. */
const whiteFrame = writeRgbaPng({ width: 4, height: 4, rgba: Uint8Array.from(Array.from({ length: 16 }, (_, p) => (p % 4 > 0 && p % 4 < 3 && p > 3 && p < 12 ? M : W)).flat()) });

/**
 * Options for the built-in renderer on a fake Mac: a config folder, a StarCraft II folder (sc2/),
 * viewer files, and a fake viewer that writes a clean frame per angle and records its runs.
 */
async function builtIn(root: string) {
  await mkdir(path.join(root, "config"));
  await mkdir(path.join(root, "sc2", "SC2Data"), { recursive: true });
  const app = path.join(root, "Other.app");
  await mkdir(path.join(app, "Contents", "MacOS"), { recursive: true });
  const viewers = { recorded: path.join(root, "WhiteoutFlakes"), other: path.join(root, "OtherViewer"), app };
  for (const file of [viewers.recorded, viewers.other, path.join(app, "Contents", "MacOS", "WhiteoutFlakes")]) await writeFile(file, "");
  const calls: Array<{ bin: string; args: readonly string[] }> = [];
  const runViewer: RunViewer = async (bin, args) => {
    calls.push({ bin, args });
    const captureDir = args[args.indexOf("--export-anim") + 3]!;
    for (const angle of [0, 1, 2, 3]) await writeFile(path.join(captureDir, `${angle}_001.png`), whiteFrame);
    return { stdout: "", stderr: "" };
  };
  const options = {
    cwd: root,
    log: () => {},
    fetch,
    montage: async (_renders: readonly string[], sheet: string) => writeFile(sheet, "sheet"),
    env: { SC2_ASSET_CATALOG_CONFIG: path.join(root, "config") },
    platform: "darwin" as const,
    arch: "arm64",
    runViewer,
  };
  return { options, viewers, calls };
}

describe("runCatalogCli", () => {
  it("extracts into the cache folder --cache names, and says how many doodads", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "catalog-cli-"));
    const lines: string[] = [];
    await runCatalogCli(["extract", "--cache", "cache"], { cwd: dir, log: (line) => lines.push(line), fetch });
    expect(existsSync(path.join(dir, "cache", "extracted", "doodad-extracted.json"))).toBe(true);
    expect(lines.join("\n")).toMatch(/1 doodads, 1 with a gallery picture/);
  });

  it("renders with the renderer module --renderer names, after extracting", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "catalog-cli-"));
    const renderer = path.join(dir, "renderer.mjs");
    await writeFile(renderer, `import { writeFile } from "node:fs/promises";\nexport default { async render({ outputPaths }) { for (const file of outputPaths) await writeFile(file, "png"); } };\n`);
    const options = { cwd: dir, log: () => {}, fetch, montage: async (_renders: readonly string[], sheet: string) => writeFile(sheet, "sheet") };
    await runCatalogCli(["extract", "--cache", "cache"], options);
    await runCatalogCli(["render", "--cache", "cache", "--renderer", "renderer.mjs"], options);
    expect(existsSync(path.join(dir, "cache", "catalog-sheets", "doodads", "Rock.jpg"))).toBe(true);
  });

  it("refuses render without an extraction, a renderer module with no render, an unknown doodad or command", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "catalog-cli-"));
    const options = { cwd: dir, log: () => {}, fetch };
    await writeFile(path.join(dir, "r.mjs"), "export default { render: async () => {} };\n");
    await expect(runCatalogCli(["render", "--cache", "cache", "--renderer", "r.mjs"], options)).rejects.toThrow(/extract/);
    await writeFile(path.join(dir, "bad.mjs"), "export default {};\n");
    await runCatalogCli(["extract", "--cache", "cache"], options);
    await expect(runCatalogCli(["render", "--cache", "cache", "--renderer", "bad.mjs"], options)).rejects.toThrow(/render function/);
    await expect(runCatalogCli(["render", "--cache", "cache", "--renderer", "r.mjs", "Rock", "Rokc"], options)).rejects.toThrow(/no doodad Rokc/);
    await expect(runCatalogCli(["frobnicate"], options)).rejects.toThrow(CATALOG_USAGE.split("\n")[0]!);
  });

  it("renders with the built-in renderer by default, from the viewer setup-renderer recorded and the StarCraft II folder", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "catalog-cli-"));
    const { options, viewers, calls } = await builtIn(dir);
    await runCatalogCli(["extract", "--cache", "cache"], options);
    await writeFile(path.join(dir, "config", "renderer.json"), JSON.stringify({ viewer: viewers.recorded }));
    await runCatalogCli(["render", "--cache", "cache", "--sc2", "sc2"], options);
    expect(calls.map((call) => call.bin)).toEqual([viewers.recorded]);
    expect(calls[0]!.args[2]).toBe("Assets/Doodads/Rock/Rock.m3");
    expect(existsSync(path.join(dir, "cache", "catalog-sheets", "doodads", "Rock.jpg"))).toBe(true);

    // --viewer, then SC2_ASSET_CATALOG_VIEWER, win over the record; either can name the .app.
    await runCatalogCli(["render", "--cache", "cache", "--sc2", "sc2", "--force", "--viewer", viewers.app], { ...options, env: { ...options.env, SC2_ASSET_CATALOG_VIEWER: viewers.other } });
    await runCatalogCli(["render", "--cache", "cache", "--sc2", "sc2", "--force"], { ...options, env: { ...options.env, SC2_ASSET_CATALOG_VIEWER: viewers.other } });
    expect(calls.map((call) => call.bin).slice(1)).toEqual([path.join(viewers.app, "Contents", "MacOS", "WhiteoutFlakes"), viewers.other]);
  });

  it("says to run setup-renderer when it hasn't been, and to name the StarCraft II folder when it isn't found", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "catalog-cli-"));
    const { options, viewers } = await builtIn(dir);
    await runCatalogCli(["extract", "--cache", "cache"], options);
    await expect(runCatalogCli(["render", "--cache", "cache", "--sc2", "sc2"], options)).rejects.toThrow(/run `npx @teamantioch\/sc2-asset-catalog setup-renderer`/);
    await expect(runCatalogCli(["render", "--cache", "cache", "--viewer", viewers.other], { ...options, env: { ...options.env, SC2_ASSET_CATALOG_SC2_PATH: path.join(dir, "nowhere") } })).rejects.toThrow(
      /No StarCraft II install at .*nowhere.*--sc2 <folder> or SC2_ASSET_CATALOG_SC2_PATH/,
    );
  });

  it("refuses the built-in renderer and setup-renderer on Windows and Linux, but still renders with a renderer module there", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "catalog-cli-"));
    const { options } = await builtIn(dir);
    await runCatalogCli(["extract", "--cache", "cache"], options);
    for (const platform of ["win32", "linux"] as const) {
      await expect(runCatalogCli(["render", "--cache", "cache"], { ...options, platform })).rejects.toThrow(/isn't supported on (Windows|Linux) yet/);
      await expect(runCatalogCli(["setup-renderer", "--cache", "cache"], { ...options, platform })).rejects.toThrow(/isn't supported on (Windows|Linux) yet/);
    }
    await writeFile(path.join(dir, "renderer.mjs"), `import { writeFile } from "node:fs/promises";\nexport default { async render({ outputPaths }) { for (const file of outputPaths) await writeFile(file, "png"); } };\n`);
    await runCatalogCli(["render", "--cache", "cache", "--renderer", "renderer.mjs"], { ...options, platform: "win32" });
    expect(existsSync(path.join(dir, "cache", "catalog-sheets", "doodads", "Rock.jpg"))).toBe(true);
  });

  it("prints the usage for --help or no command", async () => {
    const lines: string[] = [];
    await runCatalogCli(["--help"], { log: (line) => lines.push(line) });
    await runCatalogCli([], { log: (line) => lines.push(line) });
    expect(lines).toEqual([CATALOG_USAGE, CATALOG_USAGE]);
  });
});
