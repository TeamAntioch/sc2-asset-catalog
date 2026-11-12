// The ranker's credential (src/credentials.ts): Jev's key from TYPESAFE_API_KEY, else the key file
// `login` saved, on every platform. Without one, Jev is off with a message saying how to give it
// one. No call reaches the network; each test has its own config folder.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { jevApiKey, jevKey, NO_JEV_KEY, openRanker } from "../src/credentials.ts";
import { saveKeyFile } from "../src/key-file.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "doodad-finder-credentials-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
const env = (more: Record<string, string> = {}) => ({ SC2_ASSET_CATALOG_CONFIG: dir, ...more });

describe("jevKey", () => {
  it("takes TYPESAFE_API_KEY from the environment, trimmed", () => {
    expect(jevKey({ env: env({ TYPESAFE_API_KEY: " ts-from-env \n" }) })).toEqual({ key: "ts-from-env", source: "environment" });
  });

  it("takes the key file when the variable is missing or blank", async () => {
    await saveKeyFile("ts-from-file", { env: env() });
    expect(jevKey({ env: env() })).toEqual({ key: "ts-from-file", source: "key file" });
    expect(jevKey({ env: env({ TYPESAFE_API_KEY: "  " }) })).toEqual({ key: "ts-from-file", source: "key file" });
  });

  it("prefers the variable over the key file", async () => {
    await saveKeyFile("ts-from-file", { env: env() });
    expect(jevKey({ env: env({ TYPESAFE_API_KEY: "ts-from-env" }) })).toEqual({ key: "ts-from-env", source: "environment" });
    expect(jevApiKey({ env: env({ TYPESAFE_API_KEY: "ts-from-env" }) })).toBe("ts-from-env");
  });

  it("has none with neither", () => {
    expect(jevKey({ env: env() })).toBeUndefined();
    expect(jevApiKey({ env: env({ TYPESAFE_API_KEY: "  " }) })).toBeUndefined();
  });
});

describe("openRanker", () => {
  it("turns Jev off, naming the file, when the key file can't be read", async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(dir, "typesafe-key"));
    const opened = openRanker({ env: env() });
    expect(opened.ranker).toBeUndefined();
    expect(opened.off).toMatch(/can't read the key file .*typesafe-key/);
  });

  it("opens Jev with a key, saying where it came from", async () => {
    expect(openRanker({ env: env({ TYPESAFE_API_KEY: "ts-test" }) })).toMatchObject({ ranker: { name: "jev" }, keySource: "environment" });
    await saveKeyFile("ts-saved", { env: env() });
    expect(openRanker({ env: env() })).toMatchObject({ ranker: { name: "jev" }, keySource: "key file" });
  });

  it("turns Jev off without one, naming login and the variable", () => {
    const opened = openRanker({ env: env() });
    expect(opened.ranker).toBeUndefined();
    expect(opened.off).toBe(NO_JEV_KEY);
    expect(NO_JEV_KEY).toContain("npx @teamantioch/sc2-doodad-finder login");
    expect(NO_JEV_KEY).toContain("TYPESAFE_API_KEY");
  });
});
