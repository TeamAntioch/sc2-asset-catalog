// The sets' keyword search and tags (src/narrow.ts).
import { describe, expect, it } from "vitest";

import { askWords, keywordSearch, kindsOf, tagMatches } from "../src/narrow.ts";
import { cardOf, CARDS } from "./fixtures.ts";

const ids = (cards: readonly { id: string }[]): string[] => cards.map((card) => card.id);

describe("keywordSearch", () => {
  it("finds a set by its name, facets, uses and look, plurals aside", () => {
    expect(ids(keywordSearch(CARDS, "a bar"))).toEqual(["dive-bar"]);
    expect(ids(keywordSearch(CARDS, "streets at night"))).toEqual(["night-street"]);
    expect(ids(keywordSearch(CARDS, "pilot seats"))).toEqual(["ship-bridge"]);
    expect(ids(keywordSearch(CARDS, "neon"))).toEqual(["night-street"]);
    expect(ids(keywordSearch(CARDS, "somewhere for a chase"))).toEqual(["night-street"]);
  });

  it("puts the set with more of the ask's words first, and the name over the look", () => {
    expect(ids(keywordSearch(CARDS, "terran ship bridge"))).toEqual(["ship-bridge", "dive-bar"]);
    expect(ids(keywordSearch(CARDS, "the place"))).toEqual([]);
  });

  it("leaves out the words that say nothing about a place", () => {
    expect(askWords("a place inside a city with some towers")).toEqual(["city", "tower"]);
  });
});

describe("tagMatches", () => {
  it("matches a kind, or any of several, and a facet, case aside", () => {
    expect(tagMatches(cardOf("dive-bar"), { facet: "kind", value: "room" })).toBe(true);
    expect(tagMatches(cardOf("night-street"), { facet: "Kind", value: "room, Exterior" })).toBe(true);
    expect(tagMatches(cardOf("night-street"), { facet: "kind", value: "room" })).toBe(false);
    expect(tagMatches(cardOf("ship-bridge"), { facet: "facet", value: "Bridge" })).toBe(true);
    expect(tagMatches(cardOf("ship-bridge"), { facet: "mood", value: "dark" })).toBe(false);
    expect(kindsOf(" room,, space ")).toEqual(["room", "space"]);
  });
});
