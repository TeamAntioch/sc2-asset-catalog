// The finder kit's ranker slot (docs/adr/0001): a ranker grades each narrowed candidate against the
// ask on four levels (a finder's wording), and the finder orders the candidates by those levels. Jev
// (jev-ranker.ts) fills the slot; the slot stays internal, for tests' fakes. A failed call is an
// error, never a low level.

import type { FinderCard, Tag } from "./card.ts";

/** The ranker's name, as the page and the test command name it. */
export type RankerName = "jev";

export type RankRequest<C extends FinderCard = FinderCard> = {
  readonly ask: string;
  /** The object the ask is a part of, once the mapper has named one. */
  readonly object?: string | undefined;
  readonly tags?: readonly Tag[] | undefined;
  readonly candidates: readonly C[];
};

/** A candidate's grade: a level from 0 to 3, which Jev gives as an expected value between levels. */
export type Grade = {
  readonly level: number;
  /** Jev's probability for each level, 0 to 3. */
  readonly probabilities?: readonly number[];
};

export type Usage = { readonly input: number; readonly output: number; readonly cacheRead?: number; readonly cacheWrite?: number };

export type Ranking = {
  readonly ranker: RankerName;
  /** The model that answered, as its API names it. */
  readonly model: string;
  /** A grade for every candidate's id. */
  readonly grades: ReadonlyMap<string, Grade>;
  /** Milliseconds: the API call, and the whole ranking with building the request and reading the answer. */
  readonly timings: { readonly request: number; readonly total: number };
  readonly usage: Usage;
  /** US dollars, estimated from the usage at the ranker's list prices. */
  readonly cost: number;
};

export type RankOptions = { readonly signal?: AbortSignal };

export interface Ranker<C extends FinderCard = FinderCard> {
  readonly name: RankerName;
  rank(request: RankRequest<C>, options?: RankOptions): Promise<Ranking>;
}

/** One call's exact payload, as sent, and what came back, for the log. No credential is in either. */
export type PayloadEntry = {
  readonly ranker: RankerName;
  readonly at: string;
  readonly ms: number;
  readonly request: unknown;
  readonly response?: unknown;
  readonly error?: string;
};

export type PayloadLog = (entry: PayloadEntry) => void;

/**
 * A ranker's call failed or its answer can't be read: the ask has no ranking, not low grades.
 * `cost` is what the call cost when it was answered (and so paid for) but couldn't be read.
 */
export class RankerError extends Error {
  readonly ranker: RankerName;
  readonly cost: number;
  constructor(ranker: RankerName, message: string, options?: ErrorOptions & { readonly cost?: number }) {
    super(`${ranker}: ${message}`, options);
    this.name = "RankerError";
    this.ranker = ranker;
    this.cost = options?.cost ?? 0;
  }
}

/** A tag as the rankers read it: `story: industry`. */
export const tagText = (tag: Tag): string => `${tag.facet}: ${tag.value}`;

/** How far below a candidate an already-provided one can grade and still come first. */
export const PROVIDED_RAISE = 0.25;

/**
 * The narrowed candidates in the ranker's order: fit first, an already-provided card first over
 * any that grades no more than 0.25 above it, then the narrowing's order. Every candidate needs a
 * grade.
 */
export function orderByFit<T extends { readonly id: string; readonly card: FinderCard }>(narrowed: readonly T[], grades: ReadonlyMap<string, Grade>): (T & { readonly level: number })[] {
  const keyed = narrowed.map((candidate, place) => {
    const grade = grades.get(candidate.id);
    if (!grade) throw new Error(`No grade for ${candidate.id}`);
    const provided = candidate.card.provided === true;
    return { candidate: { ...candidate, level: grade.level }, key: grade.level + (provided ? PROVIDED_RAISE : 0), provided, place };
  });
  // Keys within a hair of each other are equal: 1.89 + 0.25 falls just short of 2.14 in floating point.
  const fit = (a: { key: number }, b: { key: number }) => (Math.abs(b.key - a.key) < 1e-9 ? 0 : b.key - a.key);
  keyed.sort((a, b) => fit(a, b) || Number(b.provided) - Number(a.provided) || a.place - b.place);
  return keyed.map(({ candidate }) => candidate);
}
