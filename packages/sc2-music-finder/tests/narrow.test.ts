// The Music Finder's narrowing pieces (src/narrow.ts, src/cards.ts): what each filter facet matches,
// how the keyword search takes the pinned ones, and the cards' ids and text.
import { describe, expect, it } from "vitest";

import { cardIdOf, cardText, mmss, musicCards } from "../src/cards.ts";
import { KNOWN_DEPENDENCIES, keywordMatches, parseRange, queryFor, tagMatches, withDefaultShow } from "../src/narrow.ts";
import { SOURCES, VOID_CAMPAIGN } from "./fixtures.ts";

const cards = new Map(musicCards(SOURCES).map((card) => [card.id, card]));
const card = (id: string) => cards.get(id)!;
const pin = (facet: string, value: string) => ({ facet, value, pinned: true });

describe("cards", () => {
  it("has a card for every id, and gives a Sound sharing a Soundtrack's id its own", () => {
    expect([...cards.keys()].sort()).toEqual(["CalmAmbient", "Dual", "Dual (Sound)", "HeroicVictory", "MapOnlyTrack", "SilentTrack", "TenseApproach"]);
    expect(card("Dual (Sound)").name).toBe("Dual");
    expect(cardIdOf(card("Dual (Sound)").entry, SOURCES.catalog)).toBe("Dual (Sound)");
  });

  it("writes a card's text from its notes and ratings", () => {
    const text = card("TenseApproach").text;
    expect(text).toContain("TenseApproach (tense approach)");
    expect(text).toContain("A tense, slow build");
    expect(text).toContain("mood: tense, ominous");
    expect(text).toContain("faction: zerg");
    expect(text).toContain("suits: an approach through ruins; alien discovery");
    expect(text).toContain("energy 3, tension 4, valence 2, length 1:30 (of 5)");
  });

  it("adds a layer's text to the card, and keeps its facts for the page", () => {
    const layered = musicCards(SOURCES, (entry) => (entry.id === "TenseApproach" ? { text: "album: Nowhere", facts: [{ label: "Album", value: "Nowhere" }] } : undefined)).find(({ id }) => id === "TenseApproach")!;
    expect(layered.text).toContain("album: Nowhere");
    expect(layered.layer?.facts).toEqual([{ label: "Album", value: "Nowhere" }]);
  });

  it("formats lengths as minutes and seconds", () => {
    expect([mmss(5), mmss(65), mmss(600)]).toEqual(["0:05", "1:05", "10:00"]);
    expect(cardText(card("HeroicVictory").entry, card("HeroicVictory").pieces)).toContain("length 0:40");
  });
});

describe("parseRange", () => {
  it("reads one number, a pair, and a pair open at one end", () => {
    expect(parseRange("3")).toEqual([3, 3]);
    expect(parseRange("2-4")).toEqual([2, 4]);
    expect(parseRange("40-")).toEqual([40, undefined]);
    expect(parseRange("-120")).toEqual([undefined, 120]);
    expect(parseRange(" 2 - 4 ")).toEqual([2, 4]);
  });

  it("refuses anything else, so a bad value matches nothing", () => {
    for (const bad of ["", "-", "two", "2-3-4", "1,2"]) expect(parseRange(bad)).toBeUndefined();
  });
});

describe("tagMatches", () => {
  it("matches a rating by range, over the card's files", () => {
    expect(tagMatches(card("TenseApproach"), { facet: "tension", value: "4-5" })).toBe(true);
    expect(tagMatches(card("TenseApproach"), { facet: "tension", value: "1-3" })).toBe(false);
    expect(tagMatches(card("HeroicVictory"), { facet: "Energy", value: "5" })).toBe(true);
    expect(tagMatches(card("HeroicVictory"), { facet: "energy", value: "-4" })).toBe(false);
    expect(tagMatches(card("HeroicVictory"), { facet: "energy", value: "nonsense" })).toBe(false);
  });

  it("matches a length when a file is in the range", () => {
    expect(tagMatches(card("CalmAmbient"), { facet: "length", value: "120-" })).toBe(true);
    expect(tagMatches(card("HeroicVictory"), { facet: "length", value: "120-" })).toBe(false);
    expect(tagMatches(card("HeroicVictory"), { facet: "length", value: "-60" })).toBe(true);
  });

  it("matches kind, faction, role and mood without regard to case", () => {
    expect(tagMatches(card("HeroicVictory"), { facet: "kind", value: "Stinger" })).toBe(true);
    expect(tagMatches(card("HeroicVictory"), { facet: "faction", value: "terran" })).toBe(true);
    expect(tagMatches(card("TenseApproach"), { facet: "faction", value: "zerg" })).toBe(true);
    expect(tagMatches(card("CalmAmbient"), { facet: "faction", value: "protoss" })).toBe(true);
    expect(tagMatches(card("HeroicVictory"), { facet: "role", value: "victory" })).toBe(true);
    expect(tagMatches(card("TenseApproach"), { facet: "mood", value: "OMINOUS" })).toBe(true);
    expect(tagMatches(card("TenseApproach"), { facet: "mood", value: "calm" })).toBe(false);
  });

  it("leaves out the cards a map's dependencies don't bring", () => {
    expect(tagMatches(card("CalmAmbient"), { facet: "map has", value: "Void (Campaign)" })).toBe(true);
    expect(tagMatches(card("CalmAmbient"), { facet: "map has", value: "Void Story (Campaign)" })).toBe(true);
    expect(tagMatches(card("CalmAmbient"), { facet: "map has", value: "Nova Covert Ops (Art Mod)" })).toBe(false);
    expect(tagMatches(card("CalmAmbient"), { facet: "map has", value: "" })).toBe(false);
    // What the default Void (Mod) brings needs nothing.
    expect(tagMatches(card("TenseApproach"), { facet: "map has", value: "Nova Covert Ops (Art Mod)" })).toBe(true);
    expect(KNOWN_DEPENDENCIES["Void (Campaign)"]).toBe(VOID_CAMPAIGN);
  });

  it("hides what a map can't play unless the show tag says everything", () => {
    for (const hidden of ["SilentTrack", "MapOnlyTrack"]) {
      expect(tagMatches(card(hidden), { facet: "show", value: "playable" })).toBe(false);
      expect(tagMatches(card(hidden), { facet: "show", value: "everything" })).toBe(true);
    }
    expect(tagMatches(card("TenseApproach"), { facet: "show", value: "playable" })).toBe(true);
  });

  it("matches nothing for a facet it doesn't know", () => {
    expect(tagMatches(card("TenseApproach"), { facet: "colour", value: "red" })).toBe(false);
  });
});

describe("withDefaultShow", () => {
  it("pins show: playable unless the page pinned a show tag", () => {
    expect(withDefaultShow()).toEqual([pin("show", "playable")]);
    expect(withDefaultShow([pin("kind", "loop")])).toEqual([pin("kind", "loop"), pin("show", "playable")]);
    const chosen = [pin("show", "everything")];
    expect(withDefaultShow(chosen)).toEqual(chosen);
    // An unpinned show tag is only a raise, not the page's choice.
    expect(withDefaultShow([{ facet: "show", value: "everything" }])).toHaveLength(2);
  });
});

describe("queryFor and keywordMatches", () => {
  it("takes the pinned filters the search can take", () => {
    const query = queryFor("tense build", [pin("energy", "2-4"), pin("length", "40-120"), pin("kind", "Full Cue"), pin("faction", "zerg"), pin("role", "cutscene"), pin("map has", "Void (Campaign)"), pin("show", "everything"), { facet: "tension", value: "5" }]);
    expect(query).toEqual({
      words: "tense build",
      energy: [2, 4],
      minSeconds: 40,
      maxSeconds: 120,
      kinds: ["full cue"],
      faction: "zerg",
      role: "cutscene",
      dependencies: [VOID_CAMPAIGN],
      includeUnplayable: true,
      includeMapLocal: true,
    });
  });

  it("finds ids by the words of the ask, best first, as card ids", () => {
    expect(keywordMatches(SOURCES, "tense approach", withDefaultShow()).map(({ id }) => id)[0]).toBe("TenseApproach");
    expect(keywordMatches(SOURCES, "triumphant fanfare", withDefaultShow()).map(({ id }) => id)).toEqual(["HeroicVictory"]);
  });

  it("finds nothing for an ask with no word the search takes", () => {
    expect(keywordMatches(SOURCES, "", withDefaultShow())).toEqual([]);
    expect(keywordMatches(SOURCES, "  ?! ", withDefaultShow())).toEqual([]);
    expect(keywordMatches(SOURCES, "the of and", withDefaultShow())).toEqual([]);
  });

  it("leaves out the silent and map-local ids unless asked, and puts a Sound's card id on it", () => {
    expect(keywordMatches(SOURCES, "marching patrol", withDefaultShow())).toEqual([]);
    expect(keywordMatches(SOURCES, "marching patrol", [pin("show", "everything")]).map(({ id }) => id)).toEqual(["MapOnlyTrack"]);
    expect(keywordMatches(SOURCES, "steady industrial loop", withDefaultShow()).map(({ id }) => id).sort()).toEqual(["Dual", "Dual (Sound)"]);
  });
});

describe("facets", () => {
  it("name a tag's facet in any case, and nothing else", async () => {
    const { facetOf, FACETS } = await import("../src/narrow.ts");
    expect(facetOf("Energy")).toBe("energy");
    expect(facetOf("MAP HAS")).toBe("map has");
    expect(facetOf("tempo")).toBeUndefined();
    expect(new Set(FACETS).size).toBe(FACETS.length);
  });
});
