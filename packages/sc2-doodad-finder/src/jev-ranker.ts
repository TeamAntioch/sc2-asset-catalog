// The Jev ranker (docs/adr/0001) for doodads: the kit's, with this finder's wording (wording.ts).

import { type JevOptions as KitJevOptions, jevRanker as kitJevRanker, jevRequest as kitJevRequest } from "@team-antioch/sc2-finder-kit/jev-ranker.js";
import type { SystemOneRequest } from "@typesafe-ai/sdk";

import type { CandidateCard } from "./cards.ts";
import type { RankRequest, Ranker } from "./ranker.ts";
import { JEV_WORDING } from "./wording.ts";

export { JEV_INPUT_PRICE, JEV_MODEL } from "@team-antioch/sc2-finder-kit/jev-ranker.js";

export type JevOptions = Omit<KitJevOptions, "wording">;

/** The request for one ask: what is sent and logged. Question i is about candidate i. */
export const jevRequest = (request: RankRequest): SystemOneRequest => kitJevRequest(request, JEV_WORDING);

export const jevRanker = (options: JevOptions): Ranker => kitJevRanker<CandidateCard>({ ...options, wording: JEV_WORDING });
