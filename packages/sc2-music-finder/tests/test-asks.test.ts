// The music test command's pieces (src/cli/test-asks.ts) and the repo's test-music-asks.json: how an
// expected track finds the cards that play it, what counts as found, and that every ask in the
// file is well formed and names tracks the shipped listening notes know.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readMusicNotes } from "@team-antioch/sc2-asset-catalog/catalog/music-notes.js";
import { parseTestAsks } from "@team-antioch/sc2-finder-kit/test-asks.js";
import { describe, expect, it } from "vitest";

import { musicCards } from "../src/cards.ts";
import { cardsFor, trackHits } from "../src/cli/test-asks.ts";
import { SOURCES } from "./fixtures.ts";

const cards = new Map(musicCards(SOURCES).map((card) => [card.id, card]));

describe("an expected track", () => {
  it("is a card id, or a file's base name in any case, and finds every card that plays the file", () => {
    expect(cardsFor("TenseApproach", cards)).toEqual(["TenseApproach"]);
    expect(cardsFor("tenseapproach", cards)).toEqual(["TenseApproach"]);
    // One file, two cards: the Soundtrack and the Sound that share an id.
    expect(cardsFor("DualFile", cards).sort()).toEqual(["Dual", "Dual (Sound)"]);
    expect(cardsFor("NoSuchFile", cards)).toEqual([]);
  });

  it("counts as found when any card that plays it is among the candidates", () => {
    const tracks = [cardsFor("DualFile", cards), cardsFor("HeroicVictory", cards)];
    expect(trackHits(tracks, new Set(["Dual (Sound)"]))).toEqual({ found: 1, of: 2 });
    expect(trackHits(tracks, new Set(["Dual", "HeroicVictory"]))).toEqual({ found: 2, of: 2 });
    expect(trackHits(tracks, new Set())).toEqual({ found: 0, of: 2 });
  });
});

describe("test-music-asks.json", () => {
  const file = fileURLToPath(new URL("../../../test-music-asks.json", import.meta.url));
  const asks = parseTestAsks(readFileSync(file, "utf8"), "test-music-asks.json");
  const notes = readMusicNotes();

  it("holds reviewed asks (the author's picks by ear) and unreviewed ones, each with something to find", () => {
    expect(asks.filter((ask) => ask.reviewed).length).toBeGreaterThanOrEqual(3);
    expect(asks.filter((ask) => !ask.reviewed).length).toBeGreaterThanOrEqual(10);
    for (const ask of asks) expect(ask.targets.length, ask.ask).toBeGreaterThan(0);
  });

  it("names only music files the shipped notes have", () => {
    for (const ask of asks) for (const target of ask.targets) expect(notes.has(target.toLowerCase()), `${ask.from}: ${target}`).toBe(true);
  });

  it("asks for each thing once", () => {
    expect(new Set(asks.map((ask) => ask.ask)).size).toBe(asks.length);
  });
});
