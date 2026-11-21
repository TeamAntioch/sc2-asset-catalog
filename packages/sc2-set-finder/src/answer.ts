// A found set as a caller with no page takes it: sc2-adjutant's find_sets tool, the site's search.
// Everything its card shows, its pictures with their addresses (and files, for a layer whose
// pictures are on this machine), and Jev's grade when the ask was ranked.

import type { SetKind } from "@team-antioch/sc2-asset-catalog/catalog/set-looks.js";

import type { SetCard, SetCardPicture } from "./cards.ts";
import type { FoundSet } from "./finder.ts";

export type SetAnswer = {
  readonly id: string;
  readonly name: string;
  readonly kind: SetKind;
  readonly look: string;
  readonly facets: readonly string[];
  readonly standsInFor: readonly string[];
  readonly rooms?: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  /** What the set is from, as its card says. */
  readonly source: string;
  /** Cells: x, y and height. */
  readonly size: readonly [number, number, number];
  readonly cameras: number;
  /** The Cutscene Editor files it is in, as paths in the game's data. */
  readonly files: readonly string[];
  /** Its chosen pictures, the whole place first, each with the same view filmed in game where there is one. */
  readonly pictures: readonly SetCardPicture[];
  /** Its plan and overview. */
  readonly views: readonly SetCardPicture[];
  /** Jev's grade, 0 to 3, when the ask was ranked. */
  readonly level?: number;
  /** Its places in the keyword search and among the nearest cards, 1 first, where it was in them. */
  readonly keyword?: number;
  readonly embeddings?: number;
};

/** A card as an answer, with what the ask found of it. */
export function setAnswer(card: SetCard, found?: Pick<FoundSet, "level" | "keyword" | "embeddings">): SetAnswer {
  const { look } = card;
  return {
    id: card.id,
    name: card.name,
    kind: look.kind,
    look: look.look,
    facets: look.facets,
    standsInFor: look.standsInFor,
    ...(look.rooms?.length ? { rooms: look.rooms } : {}),
    confidence: look.confidence,
    source: card.source,
    size: look.size,
    cameras: look.cameras,
    files: look.files,
    pictures: card.pictures,
    views: card.views,
    ...(found?.level !== undefined ? { level: found.level } : {}),
    ...(found?.keyword !== undefined ? { keyword: found.keyword } : {}),
    ...(found?.embeddings !== undefined ? { embeddings: found.embeddings } : {}),
  };
}
