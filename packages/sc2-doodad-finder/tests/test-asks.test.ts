// The test command's cases (src/test-asks.ts): the repo's test-asks.json, each ask with the ids it
// should find, and the asks in a tick log, each with the ids ticked from it.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { parseTestAsks, percentile, readTestAsks, tickLogCases, topHits } from "../src/test-asks.ts";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

const ASKS = {
  about: "Test asks.",
  asks: [
    { ask: "press head", object: "crushing press over a conveyor belt", expected: ["FoundryStamperHead", "SupplyCrate"], from: "crushing press search, part name", reviewed: true },
    { ask: "sandbag wall", expected: ["Sandbags"], reviewed: false },
  ],
};

describe("test asks", () => {
  it("reads each ask as a case, its expected ids its targets, saying whether it was reviewed", () => {
    expect(parseTestAsks(JSON.stringify(ASKS), "test-asks.json")).toEqual([
      { from: "crushing press search, part name", ask: "press head", object: "crushing press over a conveyor belt", targets: ["FoundryStamperHead", "SupplyCrate"], reviewed: true },
      { from: "test-asks.json ask 2", ask: "sandbag wall", targets: ["Sandbags"], reviewed: false },
    ]);
  });

  it("refuses an ask with no expected ids, an empty ask or a field it doesn't know, naming the file and the ask", () => {
    expect(() => parseTestAsks(JSON.stringify({ asks: [{ ask: "x", expected: [], reviewed: true }] }), "t.json")).toThrow(/t\.json.*asks\.0\.expected/);
    expect(() => parseTestAsks(JSON.stringify({ asks: [{ ask: " ", expected: ["A"], reviewed: true }] }), "t.json")).toThrow(/asks\.0\.ask/);
    expect(() => parseTestAsks(JSON.stringify({ asks: [{ ask: "x", expected: ["A"], reviewed: true, mission: "m" }] }), "t.json")).toThrow(/asks\.0/);
    expect(() => parseTestAsks("{", "t.json")).toThrow(/t\.json isn't JSON/);
  });

  it("reads the repo's test-asks.json, every expected id a described doodad", async () => {
    const file = fileURLToPath(new URL("../../../test-asks.json", import.meta.url));
    const cases = await readTestAsks(file);
    const descriptions = JSON.parse(await readFile(fileURLToPath(new URL("../../sc2-asset-catalog/data/doodad-descriptions.json", import.meta.url)), "utf8")) as Record<string, unknown>;
    expect(cases.length).toBeGreaterThanOrEqual(40);
    expect(cases.filter(({ reviewed }) => reviewed).length).toBeGreaterThanOrEqual(40);
    expect(cases.flatMap(({ targets }) => targets).filter((id) => !Object.hasOwn(descriptions, id))).toEqual([]);
  });
});

describe("tick log cases", () => {
  it("takes each ask's last line with cards ticked as a case, skipping lines that don't read", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "test-asks-"));
    const log = path.join(dir, "ticks.jsonl");
    await writeFile(
      log,
      [
        JSON.stringify({ ask: "cover", ticked: ["Sandbags"] }),
        JSON.stringify({ ask: "cover", tags: [{ facet: "story", value: "military" }], ticked: ["Sandbags", "SupplyCrate"] }),
        JSON.stringify({ ask: "nothing", ticked: [] }),
        "oops",
      ].join("\n"),
    );
    const { cases, skipped } = await tickLogCases([log, path.join(dir, "missing.jsonl")]);
    expect(cases).toEqual([{ from: "tick log line 2", ask: "cover", tags: [{ facet: "story", value: "military" }], targets: ["Sandbags", "SupplyCrate"], reviewed: true }]);
    expect(skipped).toHaveLength(1);
  });
});

describe("hit counts", () => {
  it("counts a ranked list's top-n hits out of as many targets as could fit there", () => {
    const ranked = ["a", "b", "c", "d", "e"];
    expect(topHits(ranked, ["b", "e", "x"], 3)).toEqual({ found: 1, of: 3 });
    expect(topHits(ranked, ["e", "a"], 3)).toEqual({ found: 1, of: 2 });
    expect(topHits(ranked, [], 3)).toEqual({ found: 0, of: 0 });
  });

  it("gives percentiles by nearest rank", () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(10);
    expect(percentile(values, 95)).toBe(19);
  });
});
