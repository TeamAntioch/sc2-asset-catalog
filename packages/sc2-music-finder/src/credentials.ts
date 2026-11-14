// The ranker's credential (docs/adr/0001), held by the Finder's process alone: the kit's, for this
// finder: Jev's key from TYPESAFE_API_KEY in the environment, else the key file
// `sc2-music-finder login` saved (the one the Doodad Finder's `login` saves too), on every platform.
// With no key, Jev is off, with a message saying how to give it one, and asks are narrowed only.

import { type OpenedRanker as KitOpenedRanker, noJevKey, openRanker as kitOpenRanker } from "@team-antioch/sc2-finder-kit/credentials.js";
import type { PayloadLog } from "@team-antioch/sc2-finder-kit/ranker.js";

import type { MusicCard } from "./cards.ts";
import { JEV_WORDING } from "./wording.ts";

export { type KeySource, jevApiKey, jevKey, keySourceText } from "@team-antioch/sc2-finder-kit/credentials.js";

const COMMAND = "@team-antioch/sc2-music-finder";

export const NO_JEV_KEY = noJevKey(COMMAND);

export type OpenedRanker = KitOpenedRanker<MusicCard>;

/** Jev with its key, else off: with no key, or (Jev being optional) a key file that can't be read. */
export const openRanker = ({ env, log }: { readonly env?: Readonly<Record<string, string | undefined>>; readonly log?: PayloadLog } = {}): OpenedRanker =>
  kitOpenRanker<MusicCard>({ ...(env ? { env } : {}), ...(log ? { log } : {}), wording: JEV_WORDING, command: COMMAND });
