// Where the catalog's files are (src/catalog/catalog-dirs.ts): what ships in the package, and the
// cache folder the extracted fields go in on each platform.
import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { catalogCacheDir, DOODAD_DESCRIPTIONS_PATH, DOODAD_USES_DIR, extractedDir } from "../src/catalog/catalog-dirs.js";

describe("catalogCacheDir", () => {
  it("is under %LOCALAPPDATA% on Windows, else AppData\\Local in the home folder", () => {
    expect(catalogCacheDir({ platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\mapper\\AppData\\Local" }, home: "C:\\Users\\mapper" })).toBe("C:\\Users\\mapper\\AppData\\Local\\sc2-asset-catalog");
    expect(catalogCacheDir({ platform: "win32", env: {}, home: "C:\\Users\\mapper" })).toBe("C:\\Users\\mapper\\AppData\\Local\\sc2-asset-catalog");
  });

  it("is under ~/Library/Caches on macOS", () => {
    expect(catalogCacheDir({ platform: "darwin", env: { XDG_CACHE_HOME: "/elsewhere" }, home: "/Users/mapper" })).toBe("/Users/mapper/Library/Caches/sc2-asset-catalog");
  });

  it("is under $XDG_CACHE_HOME on Linux, else ~/.cache", () => {
    expect(catalogCacheDir({ platform: "linux", env: { XDG_CACHE_HOME: "/var/cache/mapper" }, home: "/home/mapper" })).toBe("/var/cache/mapper/sc2-asset-catalog");
    expect(catalogCacheDir({ platform: "linux", env: { XDG_CACHE_HOME: "" }, home: "/home/mapper" })).toBe("/home/mapper/.cache/sc2-asset-catalog");
  });

  it("is SC2_ASSET_CATALOG_CACHE on any platform when that is set", () => {
    expect(catalogCacheDir({ platform: "win32", env: { SC2_ASSET_CATALOG_CACHE: "D:\\cache", LOCALAPPDATA: "C:\\x" }, home: "C:\\Users\\mapper" })).toBe("D:\\cache");
    expect(catalogCacheDir({ platform: "linux", env: { SC2_ASSET_CATALOG_CACHE: "/tmp/c" }, home: "/home/mapper" })).toBe("/tmp/c");
  });
});

describe("the catalog's folders", () => {
  it("keeps the extracted fields in the cache folder's extracted/", () => {
    expect(extractedDir("/home/mapper/.cache/sc2-asset-catalog")).toBe(path.join("/home/mapper/.cache/sc2-asset-catalog", "extracted"));
  });

  it("ships the descriptions and the Doodad Uses in the package's data/", () => {
    expect(existsSync(DOODAD_DESCRIPTIONS_PATH)).toBe(true);
    expect(existsSync(path.join(DOODAD_USES_DIR, "doodads"))).toBe(true);
  });
});
