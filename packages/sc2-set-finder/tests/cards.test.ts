// The sets' cards (src/cards.ts): their text, the published sets with their gallery addresses, and
// a host's own sets laid over them with pictures in a folder.
import { readSetLooks, SET_GALLERY_URL } from "@team-antioch/sc2-asset-catalog/catalog/set-looks.js";
import { describe, expect, it } from "vitest";

import { cardTexts, PUBLISHED_SOURCE, setCards } from "../src/cards.ts";
import { cardOf, GALLERY, look, LOOKS } from "./fixtures.ts";

describe("a card's text", () => {
  it("is the name and kind, the look, its facets, uses, places and size, a line each; the embedded text leaves out the name", () => {
    const { text, embedText } = cardTexts({ ...LOOKS.get("dive-bar")!, rooms: ["The bar: a counter and stools."] });
    expect(text).toBe(
      [
        "Dive Bar (room)",
        "A small grubby bar with a long counter down one side, stools and a row of bottles under dim red light.",
        "Facets: interior, terran, bar, small",
        "Could stand in for: a tavern scene",
        "Places in it: The bar: a counter and stools.",
        "Size: 8 by 13 cells, 4 high",
      ].join("\n"),
    );
    expect(embedText.split("\n")[0]).toBe("A room set");
    expect(embedText).not.toContain("Dive Bar");
    expect(embedText.split("\n").slice(1)).toEqual(text.split("\n").slice(1));
  });
});

describe("the published sets' cards", () => {
  it("are every shipped look, by name, with each picture's gallery address and its frame in game where there is one", () => {
    const looks = readSetLooks();
    const cards = setCards();
    expect(cards).toHaveLength(looks.size);
    expect(cards.map((card) => card.name)).toEqual([...cards.map((card) => card.name)].sort((a, b) => a.localeCompare(b)));
    const bridge = cards.find((card) => card.id === "nova-bridge")!;
    expect(bridge.source).toBe(PUBLISHED_SOURCE);
    expect(bridge.pictureDir).toBeUndefined();
    expect(bridge.pictures[0]).toEqual({ file: "card/1.jpg", shows: looks.get("nova-bridge")!.pictures[0]!.shows, url: `${SET_GALLERY_URL}/nova-bridge/card/1.jpg`, thumbnail: `${SET_GALLERY_URL}/nova-bridge/card/1_tn.jpg` });
    expect(bridge.pictures[1]!.inGame).toEqual({ url: `${SET_GALLERY_URL}/nova-bridge/card/2-game.jpg`, thumbnail: `${SET_GALLERY_URL}/nova-bridge/card/2-game_tn.jpg` });
    expect(bridge.views.map((view) => view.url)).toEqual([`${SET_GALLERY_URL}/nova-bridge/plan.jpg`, `${SET_GALLERY_URL}/nova-bridge/overview.jpg`]);
  });

  it("link another gallery when asked", () => {
    expect(cardOf("dive-bar").pictures[0]!.url).toBe(`${GALLERY}/dive-bar/card/1.jpg`);
  });
});

describe("a host's own sets", () => {
  it("are laid over the published ones: a new id is added, a known one replaced, and pictures in a folder are served by the page", () => {
    const cards = setCards(LOOKS, {
      base: GALLERY,
      extra: [
        {
          looks: { "dive-bar": look("Dive Bar Redressed", "room", "The same bar after a fight, with broken stools and the bottles smashed on the floor.", ["interior", "bar", "wrecked"]), cellar: look("Cellar", "room", "A low brick cellar with barrels along the walls and one bulb hanging from the ceiling.", ["interior", "cellar"]) },
          pictures: { dir: "/host/set-views" },
          source: "the author's campaign",
        },
      ],
    });
    expect(cards.map((card) => card.id)).toEqual(["cellar", "dive-bar", "night-street", "ship-bridge"]);
    const bar = cards.find((card) => card.id === "dive-bar")!;
    expect(bar.name).toBe("Dive Bar Redressed");
    expect(bar.source).toBe("the author's campaign");
    expect(bar.pictureDir).toBe("/host/set-views");
    expect(bar.pictures[0]).toMatchObject({ url: "/pictures/dive-bar/card/1.jpg", thumbnail: "/pictures/dive-bar/card/1.jpg", path: "/host/set-views/dive-bar/card/1.jpg" });
    expect(bar.pictures[1]!.inGame).toEqual({ url: "/pictures/dive-bar/card/2-game.jpg", thumbnail: "/pictures/dive-bar/card/2-game.jpg", path: "/host/set-views/dive-bar/card/2-game.jpg" });
    expect(cards.find((card) => card.id === "night-street")!.source).toBe(PUBLISHED_SOURCE);
  });

  it("can take a gallery address of their own", () => {
    const [card] = setCards(new Map(), { extra: [{ looks: new Map([["cellar", LOOKS.get("dive-bar")!]]), pictures: { base: "http://127.0.0.1:9000/sets/" }, source: "mine" }] });
    expect(card!.pictures[0]!.url).toBe("http://127.0.0.1:9000/sets/cellar/card/1.jpg");
  });
});
