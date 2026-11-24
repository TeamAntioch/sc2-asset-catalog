// The repo's test-effect-asks.json, which the effect test command (src/cli/test-asks.ts) runs:
// every ask is well formed, names only effects the shipped looks have, and is asked once.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readEffectLooks } from "@team-antioch/sc2-asset-catalog/catalog/effect-looks.js";
import { parseTestAsks } from "@team-antioch/sc2-finder-kit/test-asks.js";
import { describe, expect, it } from "vitest";

import { unknownEffects } from "../src/cli/test-asks.ts";

describe("test-effect-asks.json", () => {
  const file = fileURLToPath(new URL("../../../test-effect-asks.json", import.meta.url));
  const asks = parseTestAsks(readFileSync(file, "utf8"), "test-effect-asks.json");
  const looks = readEffectLooks();

  it("holds at least fifteen asks, each with an effect to find, none reviewed yet", () => {
    expect(asks.length).toBeGreaterThanOrEqual(15);
    for (const ask of asks) expect(ask.targets.length, ask.ask).toBeGreaterThan(0);
    expect(asks.filter((ask) => ask.reviewed)).toEqual([]);
  });

  it("names only effects the shipped looks have", () => {
    for (const ask of asks) expect(unknownEffects(ask, looks), ask.from).toEqual([]);
  });

  it("asks for each effect once", () => {
    expect(new Set(asks.map((ask) => ask.ask)).size).toBe(asks.length);
  });
});
