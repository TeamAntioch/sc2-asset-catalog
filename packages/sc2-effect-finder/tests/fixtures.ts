// Three made-up effects, an electric impact, a fire aura and a ground ring, as the catalog's looks
// hold them, and their cards with pictures in a made-up gallery.
import type { EffectLook } from "@team-antioch/sc2-asset-catalog/catalog/effect-looks.js";

import { type EffectCard, effectCards } from "../src/cards.ts";

export const GALLERY = "https://gallery.example/effects";

export const look = (kind: EffectLook["kind"], text: string, facets: string[], more: Partial<EffectLook> = {}): EffectLook => ({
  kind,
  look: text,
  colors: ["blue"],
  ...(kind === "nothing" ? {} : { size: "small" as const }),
  moving: "follows",
  afterDestroy: "gone",
  facets,
  suits: ["spell impact"],
  confidence: "high",
  problems: [],
  ...more,
});

export const LOOKS = new Map<string, EffectLook>([
  ["Assets/Effects/Terran/ArcWeaponImpact/ArcWeaponImpact.m3", look("burst", "A crackling burst of white-blue sparks jumps out from the Marine's chest and is gone in a moment.", ["electric", "sparks", "impact", "crackle"])],
  ["Assets/Effects/Neutral/BurningUnit_Lg/BurningUnit_Lg.m3", look("aura", "Orange flames lick up all over the Marine and keep burning while it plays.", ["fire", "flames", "burning"], { colors: ["orange", "yellow"], suits: ["burning damage on a unit"], size: "medium" })],
  ["Assets/Effects/Protoss/StasisRing/StasisRing.m3", look("ground", "A wide teal ring spreads over the ground around the Marine and stays where it was put.", ["ground ring", "stasis", "area of effect"], { colors: ["teal"], moving: "stays", size: "large", suits: ["area spell"] })],
]);

export const CARDS: EffectCard[] = effectCards(LOOKS, { base: GALLERY });

export const cardOf = (name: string): EffectCard => CARDS.find((card) => card.name === name)!;
