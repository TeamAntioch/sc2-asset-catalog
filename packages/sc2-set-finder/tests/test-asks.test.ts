// The repo's test-set-asks.json, which the set test command (src/cli/test-asks.ts) runs: every ask
// is well formed, names only sets the shipped looks have, and is asked once.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readSetLooks } from "@team-antioch/sc2-asset-catalog/catalog/set-looks.js";
import { parseTestAsks } from "@team-antioch/sc2-finder-kit/test-asks.js";
import { describe, expect, it } from "vitest";

import { unknownSets } from "../src/cli/test-asks.ts";

describe("test-set-asks.json", () => {
  const file = fileURLToPath(new URL("../../../test-set-asks.json", import.meta.url));
  const asks = parseTestAsks(readFileSync(file, "utf8"), "test-set-asks.json");
  const looks = readSetLooks();

  it("holds at least fifteen asks, each with a set to find, none reviewed yet", () => {
    expect(asks.length).toBeGreaterThanOrEqual(15);
    for (const ask of asks) expect(ask.targets.length, ask.ask).toBeGreaterThan(0);
    expect(asks.filter((ask) => ask.reviewed)).toEqual([]);
  });

  it("names only sets the shipped looks have", () => {
    for (const ask of asks) expect(unknownSets(ask, looks), ask.from).toEqual([]);
  });

  it("asks for each place once", () => {
    expect(new Set(asks.map((ask) => ask.ask)).size).toBe(asks.length);
  });
});
