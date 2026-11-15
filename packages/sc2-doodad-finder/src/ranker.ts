// The Doodad Finder's ranker slot (docs/adr/0001): the kit's, for this finder's cards. Jev
// (jev-ranker.ts) fills the slot; the slot stays internal, for tests' fakes.

import type { Ranker as KitRanker, RankRequest as KitRankRequest } from "@team-antioch/sc2-finder-kit/ranker.js";

import type { CandidateCard } from "./cards.ts";

export * from "@team-antioch/sc2-finder-kit/ranker.js";

export type RankRequest = KitRankRequest<CandidateCard>;
export type Ranker = KitRanker<CandidateCard>;
