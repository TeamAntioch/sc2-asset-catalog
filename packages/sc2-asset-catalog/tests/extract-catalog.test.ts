// Extracting the catalog's fields from SC2GameData and the gallery into the cache
// (src/catalog/extract-catalog.ts), over a fake fetch: nothing here touches the network.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  extractCatalog,
  extractCatalogFields,
  extractDoodadModels,
  fetchGameData,
  GALLERY_GIT_URL,
  GALLERY_TREE_URL,
  galleryFileNames,
  hasExtractedCatalog,
} from "../src/catalog/extract-catalog.js";
import { SC2_GAME_DATA_URL } from "../src/catalog/extract-doodads.js";

const catalog = (body: string) => `<?xml version="1.0" encoding="us-ascii"?>\n<Catalog>\n${body}\n</Catalog>\n`;

const LIBERTY_ACTORS = catalog(`    <CActorDoodad id="Crate"/>
    <CActorDoodad id="CrateStack">
        <Model value="Crate"/>
    </CActorDoodad>
    <CActorDoodad id="Lamp">
        <EditorModel value="LampModel"/>
    </CActorDoodad>`);
const LIBERTY_MODELS = catalog(`    <CModel default="1">
        <Model value="Assets\\Doodads\\##id##\\##id##.m3"/>
    </CModel>
    <CModel id="Crate">
        <VariationCount value="3"/>
    </CModel>
    <CModel id="LampModel">
        <Model value="Assets\\Doodads\\Lamps\\##name##.m3"/>
        <?token id="name" value="StreetLamp"?>
    </CModel>`);
const LIBERTY_STRINGS = ["Actor/Name/Crate=Crate", "Actor/Name/CrateStack=Crate", "Actor/EditorSuffix/CrateStack=- Mar Sara -", "Actor/Name/Lamp=Street Lamp"].join("\n");
const VOID_ACTORS = catalog(`    <CActorDoodad id="Lamp"/>
    <CActorDoodad id="AiurPillar">
        <EditorCategories value="DoodadType:Ruins"/>
        <TexSets value="Aiur"/>
    </CActorDoodad>`);
const VOID_MODELS = catalog(`    <CModel id="AiurPillar"/>`);

/** A fetch that answers from a table of URLs, 404 for anything else, and counts what it was asked. */
function fakeFetch(table: Record<string, string>) {
  const asked: string[] = [];
  const fetch = async (url: string | URL): Promise<Response> => {
    asked.push(String(url));
    const body = table[String(url)];
    return body === undefined ? new Response("not found", { status: 404 }) : new Response(body, { status: 200 });
  };
  return { fetch: fetch as typeof globalThis.fetch, asked };
}

/** A git listing that answers with these repository paths, counting its calls; one that fails with none. */
function fakeGit(paths?: readonly string[]) {
  const asked: string[] = [];
  const listGitTree = async (url: string, folder: string): Promise<string[]> => {
    asked.push(`${url} ${folder}`);
    if (!paths) throw new Error("git: not found");
    return paths.filter((file) => file.startsWith(folder));
  };
  return { listGitTree, asked };
}

const file = (pkg: string, rest: string) => `${SC2_GAME_DATA_URL}/${pkg}/${rest}`;
const GAME_DATA = {
  [file("mods/liberty.sc2mod", "base.sc2data/GameData/ActorData.xml")]: LIBERTY_ACTORS,
  [file("mods/liberty.sc2mod", "base.sc2data/GameData/ModelData.xml")]: LIBERTY_MODELS,
  [file("mods/liberty.sc2mod", "enus.sc2data/LocalizedData/ObjectStrings.txt")]: LIBERTY_STRINGS,
  [file("campaigns/void.sc2campaign", "base.sc2data/GameData/ActorData.xml")]: VOID_ACTORS,
  [file("campaigns/void.sc2campaign", "base.sc2data/GameData/ModelData.xml")]: VOID_MODELS,
};
const GALLERY = JSON.stringify({
  truncated: false,
  tree: [
    { path: "public/doodads/Crate.jpg", type: "blob" },
    { path: "public/doodads/Crate_tn.jpg", type: "blob" },
    { path: "public/doodads/Void_-_Aiur_Pillar.jpg", type: "blob" },
    { path: "public/doodads/Street_Lamp.png", type: "blob" },
    { path: "public/terrain/Dirt.jpg", type: "blob" },
  ],
});

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("fetchGameData", () => {
  it("fetches each package's actor, model and footprint data and its object strings once, a missing file as none", async () => {
    const { fetch, asked } = fakeFetch(GAME_DATA);
    const packages = await fetchGameData({ fetch, packages: ["mods/liberty.sc2mod", "campaigns/void.sc2campaign"] });
    expect(packages.map((pkg) => [pkg.name, Boolean(pkg.actorData), Boolean(pkg.modelData), Boolean(pkg.footprintData), Boolean(pkg.objectStrings)])).toEqual([
      ["mods/liberty.sc2mod", true, true, false, true],
      ["campaigns/void.sc2campaign", true, true, false, false],
    ]);
    expect(asked).toHaveLength(8);
    expect(new Set(asked).size).toBe(8);
  });

  it("fails naming the file on any answer but success or not found", async () => {
    const fetch = (async () => new Response("busy", { status: 503 })) as unknown as typeof globalThis.fetch;
    await expect(fetchGameData({ fetch, packages: ["mods/liberty.sc2mod"] })).rejects.toThrow(/mods\/liberty\.sc2mod .*ActorData\.xml: HTTP 503/);
  });
});

describe("extractDoodadModels", () => {
  it("resolves each doodad's model file through its actor's Model or EditorModel, the model's parents and tokens", async () => {
    const packages = await fetchGameData({ fetch: fakeFetch(GAME_DATA).fetch, packages: ["mods/liberty.sc2mod", "campaigns/void.sc2campaign"] });
    expect(extractDoodadModels(packages, ["Crate", "CrateStack", "Lamp", "AiurPillar", "Unknown"])).toEqual({
      AiurPillar: "Assets/Doodads/AiurPillar/AiurPillar.m3",
      Crate: "Assets/Doodads/Crate/Crate.m3",
      CrateStack: "Assets/Doodads/Crate/Crate.m3",
      Lamp: "Assets/Doodads/Lamps/StreetLamp.m3",
    });
  });

  it("leaves out commented-out actors and models", async () => {
    const packages = [
      {
        name: "mods/liberty.sc2mod",
        actorData: catalog(`    <!-- <CActorDoodad id="Old">\n        <Model value="OldModel"/>\n    </CActorDoodad> -->\n    <CActorDoodad id="Rock"/>`),
        modelData: catalog(`    <CModel id="Rock">\n        <Model value="Assets\\Doodads\\Rock\\Rock.m3"/>\n    </CModel>\n    <!--\n    <CModel id="Rock">\n        <Model value="Assets\\Doodads\\Old\\Old.m3"/>\n    </CModel>\n    <CModel id="OldModel"/>\n    -->`),
      },
    ];
    expect(extractDoodadModels(packages, ["Old", "Rock"])).toEqual({ Rock: "Assets/Doodads/Rock/Rock.m3" });
  });
});

describe("galleryFileNames", () => {
  it("lists the gallery's doodad pictures, leaving out the small ones and other folders", async () => {
    const { fetch, asked } = fakeFetch({ [GALLERY_TREE_URL]: GALLERY });
    expect(await galleryFileNames({ fetch })).toEqual(["Crate.jpg", "Void_-_Aiur_Pillar.jpg"]);
    expect(asked).toEqual([GALLERY_TREE_URL]);
  });

  it("lists the gallery's files with git when GitHub's API refuses (as it does past its rate limit) or cuts the listing short", async () => {
    const paths = ["public/doodads/Crate.jpg", "public/doodads/Crate_tn.jpg", "public/doodads/Void_-_Aiur_Pillar.jpg", "public/terrain/Dirt.jpg"];
    const lines: string[] = [];
    const { fetch, asked } = fakeFetch({});
    const git = fakeGit(paths);
    expect(await galleryFileNames({ fetch, listGitTree: git.listGitTree, log: (line) => lines.push(line) })).toEqual(["Crate.jpg", "Void_-_Aiur_Pillar.jpg"]);
    expect(asked).toEqual([GALLERY_TREE_URL]);
    expect(git.asked).toEqual([`${GALLERY_GIT_URL} public/doodads/`]);
    expect(lines.join("\n")).toMatch(/HTTP 404/);
    const cut = fakeFetch({ [GALLERY_TREE_URL]: JSON.stringify({ truncated: true, tree: [] }) });
    expect(await galleryFileNames({ fetch: cut.fetch, listGitTree: fakeGit(paths).listGitTree })).toEqual(["Crate.jpg", "Void_-_Aiur_Pillar.jpg"]);
  });

  it("fails, saying what would help, when neither the API nor git answers", async () => {
    await expect(galleryFileNames({ fetch: fakeFetch({}).fetch, listGitTree: fakeGit().listGitTree })).rejects.toThrow(/GITHUB_TOKEN.*git/s);
  });

  it("asks GitHub's API with GITHUB_TOKEN when it is set", async () => {
    const headers: (string | null)[] = [];
    const fetch = (async (url: string | URL, init?: RequestInit) => {
      headers.push(new Headers(init?.headers).get("authorization"));
      return new Response(GALLERY);
    }) as typeof globalThis.fetch;
    await galleryFileNames({ fetch, env: { GITHUB_TOKEN: "t0ken" } });
    await galleryFileNames({ fetch, env: {} });
    expect(headers).toEqual(["Bearer t0ken", null]);
  });
});

describe("extractCatalogFields", () => {
  it("gives each doodad its kind, package, categories, tilesets, Editor name and gallery picture, and which share a picture", async () => {
    const packages = await fetchGameData({ fetch: fakeFetch(GAME_DATA).fetch, packages: ["mods/liberty.sc2mod", "campaigns/void.sc2campaign"] });
    const doodads = { AiurPillar: { kind: "ruin", variations: 1, categories: "DoodadType:Ruins", tilesets: ["Aiur"] }, Crate: { kind: "other", variations: 3 }, CrateStack: { kind: "other", variations: 3 }, Lamp: { kind: "light", variations: 1 } };
    const fields = extractCatalogFields(packages, doodads, ["Crate.jpg", "Void_-_Aiur_Pillar.jpg"], { CrateStack: {}, Lamp: {} });
    expect(fields).toEqual({
      AiurPillar: { kind: "ruin", package: "campaigns/void.sc2campaign", categories: "DoodadType:Ruins", tilesets: ["Aiur"], image: "Void_-_Aiur_Pillar.jpg" },
      Crate: { kind: "other", package: "mods/liberty.sc2mod", name: "Crate", image: "Crate.jpg", sharesPicture: ["CrateStack"] },
      // Matched by its name without the suffix, so it shares the crate's picture.
      CrateStack: { kind: "other", package: "mods/liberty.sc2mod", name: "Crate - Mar Sara -", image: "Crate.jpg", sharesPicture: ["Crate"] },
      // A later package's actor is the doodad's package; described with no gallery picture, so from a render.
      Lamp: { kind: "light", package: "campaigns/void.sc2campaign", name: "Street Lamp", rendered: true },
    });
    expect(Object.keys(fields)).toEqual(["AiurPillar", "Crate", "CrateStack", "Lamp"]);
  });

  it("takes a doodad's package from the last actor that isn't commented out", () => {
    const packages = [
      { name: "mods/liberty.sc2mod", actorData: catalog(`    <CActorDoodad id="Rock"/>`) },
      { name: "campaigns/void.sc2campaign", actorData: catalog(`    <!-- <CActorDoodad id="Rock"/> -->`) },
    ];
    expect(extractCatalogFields(packages, { Rock: { kind: "rock", variations: 1 } }, [], {}).Rock).toMatchObject({ package: "mods/liberty.sc2mod" });
  });

  it("gives a picture to the file named exactly as the doodad over one named so after its campaign prefix, whatever the order", () => {
    const doodads = { AiurPillar: { kind: "ruin", variations: 1 }, Crate: { kind: "other", variations: 1 } };
    const gallery = ["(Space)_Crate.jpg", "Crate.jpg", "Void_-_Aiur_Pillar.jpg", "Aiur_Pillar.jpg", "Void_-_Crate.jpg"];
    const images = (files: readonly string[]) => Object.fromEntries(Object.entries(extractCatalogFields([], doodads, files, {})).map(([id, entry]) => [id, entry.image]));
    expect(images(gallery)).toEqual({ AiurPillar: "Aiur_Pillar.jpg", Crate: "Crate.jpg" });
    expect(images([...gallery].reverse())).toEqual(images(gallery));
    // Two files of one name: the first by file name.
    expect(images(["Void_-_Crate.jpg", "Nova_-_Crate.jpg", "Void_-_Aiur_Pillar.jpg"])).toEqual({ AiurPillar: "Void_-_Aiur_Pillar.jpg", Crate: "Nova_-_Crate.jpg" });
  });

  it("gives the same pictures whether the gallery was listed through GitHub's API or with git", async () => {
    const paths = ["public/doodads/Crate.jpg", "public/doodads/Crate_tn.jpg", "public/doodads/Void_-_Aiur_Pillar.jpg", "public/doodads/Street_Lamp.png", "public/terrain/Dirt.jpg"];
    const packages = await fetchGameData({ fetch: fakeFetch(GAME_DATA).fetch, packages: ["mods/liberty.sc2mod", "campaigns/void.sc2campaign"] });
    const doodads = { AiurPillar: { kind: "ruin", variations: 1 }, Crate: { kind: "other", variations: 3 }, CrateStack: { kind: "other", variations: 3 } };
    const throughApi = await galleryFileNames({ fetch: fakeFetch({ [GALLERY_TREE_URL]: JSON.stringify({ tree: paths.map((path) => ({ path })) }) }).fetch });
    const throughGit = await galleryFileNames({ fetch: fakeFetch({}).fetch, listGitTree: fakeGit(paths).listGitTree });
    expect(throughGit).toEqual(throughApi);
    expect(extractCatalogFields(packages, doodads, throughGit, {})).toEqual(extractCatalogFields(packages, doodads, throughApi, {}));
  });
});

describe("extractCatalog", () => {
  it("writes doodads.json, doodad-models.json and doodad-extracted.json into the folder, and names described ids it didn't extract", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "extract-catalog-"));
    const descriptionsFile = path.join(dir, "descriptions.json");
    const description = { look: "a crate", kind: "built", size: "small", role: "prop", story: [], biome: ["any"] };
    await writeFile(descriptionsFile, JSON.stringify({ Crate: description, Gone: description }));
    const extracted = path.join(dir, "extracted");
    const lines: string[] = [];
    expect(hasExtractedCatalog(extracted)).toBe(false);
    const result = await extractCatalog({
      extractedDir: extracted,
      descriptionsFile,
      fetch: fakeFetch({ ...GAME_DATA, [GALLERY_TREE_URL]: GALLERY }).fetch,
      packages: ["mods/liberty.sc2mod", "campaigns/void.sc2campaign"],
      log: (line) => lines.push(line),
    });
    // The lamp has only an EditorModel, so it isn't a placeable doodad.
    expect(result).toEqual({ doodads: 3, pictured: 3, models: 3, unextracted: ["Gone"] });
    expect(hasExtractedCatalog(extracted)).toBe(true);
    const read = async (name: string) => JSON.parse(await readFile(path.join(extracted, name), "utf8")) as Record<string, unknown>;
    expect(Object.keys(await read("doodads.json"))).toEqual(["AiurPillar", "Crate", "CrateStack"]);
    expect((await read("doodad-models.json")).CrateStack).toBe("Assets/Doodads/Crate/Crate.m3");
    expect((await read("doodad-extracted.json")).Crate).toMatchObject({ name: "Crate", image: "Crate.jpg" });
    expect(await read("extracted.json")).toMatchObject({ doodads: 3, source: SC2_GAME_DATA_URL });
    expect(lines.join("\n")).toMatch(/Gone/);
  });

  it("leaves an earlier extraction in place when fetching fails", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "extract-catalog-"));
    const extracted = path.join(dir, "extracted");
    await extractCatalog({ extractedDir: extracted, fetch: fakeFetch({ ...GAME_DATA, [GALLERY_TREE_URL]: GALLERY }).fetch, packages: ["mods/liberty.sc2mod"] });
    const before = await readFile(path.join(extracted, "doodad-extracted.json"), "utf8");
    const failing = (async () => new Response("busy", { status: 503 })) as unknown as typeof globalThis.fetch;
    await expect(extractCatalog({ extractedDir: extracted, fetch: failing, listGitTree: fakeGit().listGitTree, packages: ["mods/liberty.sc2mod"] })).rejects.toThrow(/HTTP 503/);
    expect(await readFile(path.join(extracted, "doodad-extracted.json"), "utf8")).toBe(before);
    expect(hasExtractedCatalog(extracted)).toBe(true);
  });

  it("isn't taken for a whole extraction when writing one over another is cut short", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "extract-catalog-"));
    const extracted = path.join(dir, "extracted");
    const options = { extractedDir: extracted, fetch: fakeFetch({ ...GAME_DATA, [GALLERY_TREE_URL]: GALLERY }).fetch, packages: ["mods/liberty.sc2mod"] };
    await extractCatalog(options);
    // A folder where the last file goes makes the write over it fail, after the first files are in.
    await rm(path.join(extracted, "doodad-extracted.json"));
    await mkdir(path.join(extracted, "doodad-extracted.json"));
    await writeFile(path.join(extracted, "doodad-extracted.json", "in-the-way"), "");
    await expect(extractCatalog(options)).rejects.toThrow();
    expect(hasExtractedCatalog(extracted)).toBe(false);
  });

  it("fetches the packages and the gallery's list at once", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "extract-catalog-"));
    let open = 0;
    let most = 0;
    const { fetch: answer } = fakeFetch({ ...GAME_DATA, [GALLERY_TREE_URL]: GALLERY });
    const fetch = (async (url: string | URL, init?: RequestInit) => {
      most = Math.max(most, ++open);
      await new Promise((resolve) => setTimeout(resolve, 5));
      open--;
      return answer(url, init);
    }) as typeof globalThis.fetch;
    const packages = ["mods/liberty.sc2mod", "campaigns/void.sc2campaign"];
    await extractCatalog({ extractedDir: path.join(dir, "extracted"), fetch, packages });
    // Four files a package, and the gallery's list.
    expect(most).toBe(9);
    const fetched = await fetchGameData({ fetch, packages });
    expect(fetched.map((pkg) => pkg.name)).toEqual(packages);
  });
});

describe("hasExtractedCatalog", () => {
  it("needs the models file too, which rendering reads", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "extract-catalog-"));
    const extracted = path.join(dir, "extracted");
    await extractCatalog({ extractedDir: extracted, fetch: fakeFetch({ ...GAME_DATA, [GALLERY_TREE_URL]: GALLERY }).fetch, packages: ["mods/liberty.sc2mod"] });
    await rm(path.join(extracted, "doodad-models.json"));
    expect(hasExtractedCatalog(extracted)).toBe(false);
  });
});
