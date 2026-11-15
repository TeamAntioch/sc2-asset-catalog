// A toy finder for the kit's tests: cards of nothing in particular, to show the kit asks only for
// what FinderCard names. No doodad and no track is here.
import type { FinderCard, ObjectTag, Tag } from "../src/card.ts";
import type { JevWording } from "../src/jev-ranker.ts";
import type { FinderKind } from "../src/server.ts";

export type ToyCard = FinderCard & { readonly colour: string };

export const TOYS: readonly ToyCard[] = [
  { id: "RedBall", name: "Red Ball", text: "Red Ball\nround and red; colour: red", colour: "red" },
  { id: "RedCube", name: "Red Cube", text: "Red Cube\nsquare and red; colour: red", colour: "red", dependency: "Extra Pack" },
  { id: "BlueBall", name: "Blue Ball", text: "Blue Ball\nround and blue; colour: blue", colour: "blue" },
  { id: "GreenRing", name: "Green Ring", text: "Green Ring\nround hoop, green; colour: green", colour: "green", dependency: "Extra Pack" },
];

export const toyTagMatches = (card: ToyCard, tag: Tag): boolean => tag.facet === "colour" && card.colour === tag.value;

export const toyWording: JevWording = {
  about: "Someone is looking for toys.",
  question: "How well does `toy` fit what `ask` asks for?",
  field: "toy",
  levels: ["No.", "Related.", "Could work.", "Exactly."],
};

export const toyKind = (extra: Partial<FinderKind<ToyCard>> = {}): FinderKind<ToyCard> => ({
  name: "toy-finder",
  noun: "toy",
  page: () => "<!doctype html><title>Toys</title>",
  levelName: (level) => ["no", "related", "could work", "exactly"][Math.min(3, Math.max(0, Math.round(level)))]!,
  renderCards: (cards, provided) => cards.map((card) => `<b>${card.name}</b>${card.provided && provided ? ` ${provided}` : ""}`),
  tags: (ticked): ObjectTag[] => [...new Set(ticked.map(({ colour }) => colour))].map((value) => ({ facet: "colour", value, pinned: false, count: ticked.filter(({ colour }) => colour === value).length })),
  copy: {
    item: ({ id, dependency }) => (dependency === undefined ? id : `${id} [${dependency}]`),
    all: (items) => items.map(({ id }) => id).join(" + "),
  },
  ...extra,
});
