// The finder kit's tray: the cards ticked this session, each with the ask it was ticked from.
// What "copy" puts on the clipboard for a card, or for the whole tray, is the finder's (a doodad's
// id and the package it needs, say): it hands the server the functions. The page copies with the
// browser's clipboard during the click, from text the process sent with its state, so the copy
// counts as the click.

import type { Tag } from "./card.ts";

/** A tick log's file name, inside the folder a finder's --tick-log names. */
export const TICK_LOG_FILE = "ticks.jsonl";

/** A ticked card in the tray. */
export type TrayItem = {
  readonly id: string;
  readonly name: string;
  /** The ask it was ticked from, and the tags that ask ran with. */
  readonly ask: string;
  readonly tags: readonly Tag[];
  /** The ranker's level for it in that ask, when the ask was ranked. */
  readonly level?: number;
  /** The map dependency it needs, absent when the default brings it in. */
  readonly dependency?: string;
};

/** What a finder copies: one card's text, and the whole tray's. */
export type CopyText = {
  item(item: Pick<TrayItem, "id" | "dependency">): string;
  all(items: readonly Pick<TrayItem, "id" | "dependency">[]): string;
};

/** Ticks a card into the tray, or unticks it. A card is in the tray once, under the ask it was last ticked from. */
export function ticked(tray: readonly TrayItem[], item: TrayItem, on: boolean): TrayItem[] {
  const rest = tray.filter(({ id }) => id !== item.id);
  return on ? [...rest, item] : rest;
}
