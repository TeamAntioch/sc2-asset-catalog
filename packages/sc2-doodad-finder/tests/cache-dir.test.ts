// Where the Finder keeps the embeddings model's weights (src/cache-dir.ts): in the catalog's cache
// folder, whose place on each platform the catalog's own tests check.
import { describe, expect, it } from "vitest";

import { modelCacheDir } from "../src/cache-dir.ts";

describe("modelCacheDir", () => {
  it("is the cache folder's models, unless SC2_ASSET_CATALOG_MODEL_CACHE (or SC2_ADJUTANT_MODEL_CACHE) moves it", () => {
    expect(modelCacheDir({ platform: "linux", env: {}, home: "/home/mapper" })).toBe("/home/mapper/.cache/sc2-asset-catalog/models");
    expect(modelCacheDir({ platform: "linux", env: { SC2_ASSET_CATALOG_MODEL_CACHE: "/models" }, home: "/home/mapper" })).toBe("/models");
    expect(modelCacheDir({ platform: "linux", env: { SC2_ADJUTANT_MODEL_CACHE: "/models" }, home: "/home/mapper" })).toBe("/models");
    expect(modelCacheDir({ platform: "win32", env: { LOCALAPPDATA: "C:\\L" }, home: "C:\\Users\\mapper" })).toBe("C:\\L\\sc2-asset-catalog\\models");
  });
});
