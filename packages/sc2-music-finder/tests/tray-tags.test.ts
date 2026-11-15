// The Music Finder's tags (src/tags.ts), tray copy text (src/tray.ts) and the in-point script the
// page copies with (src/in-point.ts), which is run here as the page runs it.
import vm from "node:vm";

import { describe, expect, it } from "vitest";

import { musicCards } from "../src/cards.ts";
import { IN_POINT_SCRIPT } from "../src/in-point.ts";
import { objectTags } from "../src/tags.ts";
import { itemCopyText, trayCopyText } from "../src/tray.ts";
import { SOURCES, VOID_CAMPAIGN } from "./fixtures.ts";

const cards = new Map(musicCards(SOURCES).map((card) => [card.id, card]));

describe("tags", () => {
  it("gives the facet values at least half the ticked cards share, most shared first", () => {
    // Of three, a value two share: the two full cues, both zerg.
    const tags = objectTags([cards.get("TenseApproach")!, cards.get("MapOnlyTrack")!, cards.get("HeroicVictory")!], {});
    expect(tags.map(({ facet, value, count }) => `${facet}: ${value} ${count}`)).toEqual(["kind: full cue 2", "faction: zerg 2"]);
    const one = objectTags([cards.get("HeroicVictory")!], {});
    expect(one.map(({ facet, value }) => `${facet}: ${value}`)).toEqual(["kind: stinger", "faction: terran", "mood: triumphant", "mood: heroic", "role: victory"]);
  });

  it("puts pinned tags first, whether the ticks give them or not, and honours a drop", () => {
    const tags = objectTags([cards.get("HeroicVictory")!], { pinned: [{ facet: "energy", value: "4-5" }], dropped: [{ facet: "mood", value: "heroic" }] });
    expect(tags[0]).toEqual({ facet: "energy", value: "4-5", pinned: true, count: 0 });
    expect(tags.map(({ value }) => value)).not.toContain("heroic");
    expect(objectTags([], { pinned: [{ facet: "kind", value: "loop" }], dropped: [{ facet: "kind", value: "loop" }] })).toEqual([]);
  });
});

describe("copy text", () => {
  it("is the id, with the dependency it needs by name", () => {
    expect(itemCopyText({ id: "TenseApproach" })).toBe("TenseApproach");
    expect(itemCopyText({ id: "CalmAmbient", dependency: VOID_CAMPAIGN })).toBe("CalmAmbient (needs Void (Campaign))");
  });

  it("lists the tray's ids, then each dependency once", () => {
    expect(trayCopyText([{ id: "A", dependency: VOID_CAMPAIGN }, { id: "B" }, { id: "C", dependency: VOID_CAMPAIGN }])).toBe("A\nB\nC\n\nDependencies: Void (Campaign)");
    expect(trayCopyText([{ id: "A" }])).toBe("A");
  });
});

describe("the page's in-point script", () => {
  const script = vm.runInNewContext(`${IN_POINT_SCRIPT}; ({ formatClock, parseClock, itemWithInPoint, trayWithInPoints })`) as {
    formatClock(seconds: number): string;
    parseClock(text: string): number | undefined;
    itemWithInPoint(text: string, id: string, from: number | undefined): string;
    trayWithInPoints(text: string, inPoints: Map<string, number>): string;
  };

  it("reads and writes minutes and seconds", () => {
    expect(script.formatClock(38)).toBe("0:38");
    expect(script.formatClock(65.4)).toBe("1:05");
    expect([script.parseClock("0:38"), script.parseClock("38"), script.parseClock("1:05"), script.parseClock(" 2:00.5 ")]).toEqual([38, 38, 65, 120.5]);
    for (const bad of ["", "x", "1:2:3", "-5", "1:"]) expect(script.parseClock(bad)).toBeUndefined();
  });

  it("puts the in-point in one card's copy text, as the ticket words it", () => {
    expect(script.itemWithInPoint("Space_1_FULL (needs Void (Campaign))", "Space_1_FULL", 38)).toBe("Space_1_FULL (from 0:38, needs Void (Campaign))");
    expect(script.itemWithInPoint("Space_1_FULL", "Space_1_FULL", 38)).toBe("Space_1_FULL (from 0:38)");
    expect(script.itemWithInPoint("Space_1_FULL", "Space_1_FULL", undefined)).toBe("Space_1_FULL");
    expect(script.itemWithInPoint("Space_1_FULL", "Space_1_FULL", 0)).toBe("Space_1_FULL");
    expect(script.itemWithInPoint("Dual (Sound)", "Dual (Sound)", 5)).toBe("Dual (Sound) (from 0:05)");
  });

  it("puts each in-point on its id's line in the tray's text, and touches nothing else", () => {
    const text = "A\nB\nC\n\nDependencies: Void (Campaign)";
    expect(script.trayWithInPoints(text, new Map([["B", 38], ["C", 0]]))).toBe("A\nB (from 0:38)\nC\n\nDependencies: Void (Campaign)");
    expect(script.trayWithInPoints(text, new Map())).toBe(text);
  });
});
