// The Effect Finder's cards (src/cards.ts) and keyword search (src/narrow.ts): what a card says and
// embeds, its picture's address, the shipped effects as cards, and how the search scores words.
import { describe, expect, it } from "vitest";

import { effectCards } from "../src/cards.ts";
import { askWords, keywordSearch, nameWords, tagMatches } from "../src/narrow.ts";
import { cardOf, CARDS } from "./fixtures.ts";

describe("a card", () => {
  it("says its name, kind and folder, then the look, colours, facets, uses, size and behaviour; the embedded text leaves the name out", () => {
    const card = cardOf("StasisRing");
    expect(card).toMatchObject({ id: "Assets/Effects/Protoss/StasisRing/StasisRing.m3", file: "Assets/Effects/Protoss/StasisRing/StasisRing.m3", folder: "Protoss" });
    expect(card.text.split("\n")).toEqual([
      "StasisRing (ground, Protoss)",
      "A wide teal ring spreads over the ground around the Marine and stays where it was put.",
      "Colours: teal",
      "Facets: ground ring, stasis, area of effect",
      "Suits: area spell",
      "Size: large next to a Marine",
      "Stays where it was when its host moves. Gone at once when destroyed.",
    ]);
    expect(card.embedText!.split("\n")[0]).toBe("A ground effect");
    expect(card.embedText).not.toContain("StasisRing");
  });

  it("links its picture and thumbnail at the model's path in the gallery", () => {
    expect(cardOf("BurningUnit_Lg").picture).toEqual({ url: "https://gallery.example/effects/Neutral/BurningUnit_Lg/BurningUnit_Lg.jpg", thumbnail: "https://gallery.example/effects/Neutral/BurningUnit_Lg/BurningUnit_Lg_tn.jpg" });
  });

  it("are made for every shipped effect, by name", () => {
    const cards = effectCards();
    expect(cards.length).toBeGreaterThan(1000);
    expect(cards.map((card) => card.name)).toEqual([...cards.map((card) => card.name)].sort((a, b) => a.localeCompare(b)));
    expect(cards[0]!.picture.url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/TeamAntioch\/sc2-mapping-reference\/main\/public\/effects\//);
  });
});

describe("the keyword search", () => {
  it("splits a model's name into its words", () => {
    expect(nameWords("SiegeTankWeaponImpact_Lg")).toEqual(["siege", "tank", "weapon", "impact", "lg"]);
    expect(nameWords("EMPShockwave")).toEqual(["emp", "shockwave"]);
  });

  it("drops words that say nothing about an effect, and plurals", () => {
    expect(askWords("an effect with blue sparks")).toEqual(["blue", "spark"]);
  });

  it("finds a card by its name's words, facets, colours, uses and look, the card with most words first", () => {
    expect(keywordSearch(CARDS, "weapon impact").map((card) => card.name)).toEqual(["ArcWeaponImpact"]);
    expect(keywordSearch(CARDS, "teal").map((card) => card.name)).toEqual(["StasisRing"]);
    expect(keywordSearch(CARDS, "burning flames").map((card) => card.name)).toEqual(["BurningUnit_Lg"]);
    expect(keywordSearch(CARDS, "spell impact")[0]!.name).toBe("ArcWeaponImpact");
    expect(keywordSearch(CARDS, "the a of")).toEqual([]);
  });
});

describe("a tag", () => {
  it("matches by kind, colour (either spelling), folder or facet, and an unknown facet matches nothing", () => {
    const ring = cardOf("StasisRing");
    expect(tagMatches(ring, { facet: "kind", value: "burst, ground" })).toBe(true);
    expect(tagMatches(ring, { facet: "colour", value: "Teal" })).toBe(true);
    expect(tagMatches(ring, { facet: "color", value: "orange" })).toBe(false);
    expect(tagMatches(ring, { facet: "folder", value: "protoss" })).toBe(true);
    expect(tagMatches(ring, { facet: "facet", value: "ground ring" })).toBe(true);
    expect(tagMatches(ring, { facet: "mood", value: "calm" })).toBe(false);
  });
});
