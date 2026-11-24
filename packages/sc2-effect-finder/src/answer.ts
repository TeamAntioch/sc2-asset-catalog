// A found effect as a caller with no page takes it: the site's search, sc2-adjutant. Everything its
// card shows, its picture's address, and Jev's grade when the ask was ranked.

import type { EffectKind, EffectLook } from "@team-antioch/sc2-asset-catalog/catalog/effect-looks.js";

import type { EffectCard } from "./cards.ts";
import type { FoundEffect } from "./finder.ts";

export type EffectAnswer = {
  /** The model's path in the game's data, as an actor or a CModel names it. */
  readonly file: string;
  readonly name: string;
  readonly folder: string;
  readonly kind: EffectKind;
  readonly look: string;
  readonly colors: readonly string[];
  readonly size?: EffectLook["size"];
  readonly moving: EffectLook["moving"];
  readonly afterDestroy: EffectLook["afterDestroy"];
  readonly facets: readonly string[];
  readonly suits: readonly string[];
  readonly confidence: EffectLook["confidence"];
  readonly problems: readonly string[];
  readonly picture: EffectCard["picture"];
  /** Jev's grade, 0 to 3, when the ask was ranked. */
  readonly level?: number;
  /** Its places in the keyword search and among the nearest cards, 1 first, where it was in them. */
  readonly keyword?: number;
  readonly embeddings?: number;
};

/** A card as an answer, with what the ask found of it. */
export function effectAnswer(card: EffectCard, found?: Pick<FoundEffect, "level" | "keyword" | "embeddings">): EffectAnswer {
  const { look } = card;
  return {
    file: card.file,
    name: card.name,
    folder: card.folder,
    kind: look.kind,
    look: look.look,
    colors: look.colors,
    ...(look.size ? { size: look.size } : {}),
    moving: look.moving,
    afterDestroy: look.afterDestroy,
    facets: look.facets,
    suits: look.suits,
    confidence: look.confidence,
    problems: look.problems,
    picture: card.picture,
    ...(found?.level !== undefined ? { level: found.level } : {}),
    ...(found?.keyword !== undefined ? { keyword: found.keyword } : {}),
    ...(found?.embeddings !== undefined ? { embeddings: found.embeddings } : {}),
  };
}
