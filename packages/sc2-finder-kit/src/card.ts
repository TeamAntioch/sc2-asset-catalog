// What the finder kit asks of a card, whatever it is a card of: a doodad, a track. A finder's own
// card type extends this and adds what its page shows and its tags are made from.

/** A candidate as the kit sees it: an id, a name and the few lines of text that are embedded and ranked. */
export type FinderCard = {
  readonly id: string;
  readonly name: string;
  /** The card's text: what the ranker reads and the keyword search may use; the embeddings model embeds it too unless `embedText` is set. */
  readonly text: string;
  /** What the embeddings model embeds when that differs from `text`; absent, it embeds `text` (see `embeddedText`). */
  readonly embedText?: string;
  /** The map dependency it needs, absent when the default brings it in. */
  readonly dependency?: string;
  /** For a map's dependencies: whether its dependencies already bring it in. */
  readonly provided?: boolean;
};

/** What the embeddings model reads of a card: its `embedText`, else its `text`. The one place that is decided. */
export const embeddedText = (card: FinderCard): string => card.embedText ?? card.text;

/** A facet tag, such as `story: industry`. A pinned tag filters; the rest only raise. */
export type Tag = { readonly facet: string; readonly value: string; readonly pinned?: boolean | undefined };

/** A tag the mapper has chosen: pinned (a filter) or dropped (hidden). */
export type TagChoice = { readonly facet: string; readonly value: string };

export type TagChoices = {
  readonly pinned?: readonly TagChoice[];
  readonly dropped?: readonly TagChoice[];
};

/** A shown tag: pinned or not, and how many ticked cards have it. */
export type ObjectTag = Tag & { readonly pinned: boolean; readonly count: number };
