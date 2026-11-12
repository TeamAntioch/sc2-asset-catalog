// The object's tags (src/tags.ts): built from the ticked cards' facets, dropped or pinned by the
// author, pinned first.
import { describe, expect, it } from "vitest";

import { candidateCards } from "../src/cards.ts";
import { objectTags } from "../src/tags.ts";
import { sources } from "./fixtures.ts";

const CARDS = new Map(candidateCards(sources()).map((card) => [card.id, card]));
const cards = (...ids: string[]) => ids.map((id) => CARDS.get(id)!);
const text = (tags: ReturnType<typeof objectTags>) => tags.map(({ facet, value, pinned }) => `${facet}: ${value}${pinned ? " (pinned)" : ""}`);

describe("objectTags", () => {
  it("has no tags before a card is ticked", () => {
    expect(objectTags([], {})).toEqual([]);
  });

  it("takes one ticked card's kind, stories, biomes and tilesets", () => {
    expect(text(objectTags(cards("FoundryStamperHead"), {}))).toEqual(["kind: built", "story: industry", "biome: urban", "tileset: Foundry"]);
  });

  it("keeps the values at least half the ticked cards share, the most shared first; a biome of any isn't a tag", () => {
    // Stamper head: built, industry, urban, Foundry. Press frame: built, industry, any. Crate: built, military, terran, any.
    expect(text(objectTags(cards("FoundryStamperHead", "FoundryPressFrame", "SupplyCrate"), {}))).toEqual(["kind: built", "story: industry"]);
  });

  it("leaves out a dropped tag, and shows a pinned one first even once the ticks no longer give it", () => {
    const tags = objectTags(cards("FoundryStamperHead", "FoundryPressFrame", "SupplyCrate"), {
      dropped: [{ facet: "kind", value: "built" }],
      pinned: [{ facet: "story", value: "terran" }],
    });
    expect(text(tags)).toEqual(["story: terran (pinned)", "story: industry"]);
  });

  it("matches a choice to a tag whatever its case, and dropping wins over pinning", () => {
    const tags = objectTags(cards("FoundryStamperHead"), { pinned: [{ facet: "tileset", value: "foundry" }, { facet: "story", value: "industry" }], dropped: [{ facet: "Story", value: "Industry" }] });
    expect(text(tags)).toEqual(["tileset: Foundry (pinned)", "kind: built", "biome: urban"]);
  });
});
