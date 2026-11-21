// Three made-up sets, a bar, a ship's bridge and a street at night, as the catalog's looks hold
// them, and their cards with pictures in a made-up gallery.
import type { SetLook } from "@team-antioch/sc2-asset-catalog/catalog/set-looks.js";

import { type SetCard, setCards } from "../src/cards.ts";

export const GALLERY = "https://gallery.example/sets";

export const look = (name: string, kind: SetLook["kind"], text: string, facets: string[], standsInFor: string[] = [], more: Partial<SetLook> = {}): SetLook => ({
  name,
  kind,
  look: text,
  facets,
  standsInFor,
  pictures: [
    { file: "card/1.jpg", shows: "the whole place" },
    { file: "card/2.jpg", shows: "from the door", inGame: true },
  ],
  basis: "The overview and two free shots.",
  confidence: "high",
  problems: ["The far wall is open."],
  size: [8.2, 12.6, 4.1],
  cameras: 2,
  files: [`Cutscenes/${name.replace(/ /g, "")}.SC2Cutscene`],
  ...more,
});

export const LOOKS = new Map<string, SetLook>([
  ["dive-bar", look("Dive Bar", "room", "A small grubby bar with a long counter down one side, stools and a row of bottles under dim red light.", ["interior", "terran", "bar", "small"], ["a tavern scene"])],
  ["ship-bridge", look("Ship Bridge", "room", "A narrow starship bridge with two pilot seats facing a wide window and consoles along both walls.", ["interior", "terran", "bridge", "ship"], ["a ship's command deck"], { confidence: "medium" })],
  ["night-street", look("Night Street", "exterior", "A wet city street at night between tall towers, with neon signs and parked cars along the kerb.", ["exterior", "city", "street", "night"], ["a chase through a city"], { cameras: 1 })],
]);

export const CARDS: SetCard[] = setCards(LOOKS, { base: GALLERY });

export const cardOf = (id: string): SetCard => CARDS.find((card) => card.id === id)!;
