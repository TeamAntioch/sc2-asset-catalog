// The Finder's tray: the cards ticked this session, each with the ask it was ticked from.
// A click on "copy" puts one card's id and the package it needs, or the whole tray's ids and the
// packages they need, on the clipboard. The page copies with the browser's clipboard during the
// click, from text the process sent with its state, so the copy counts as the click.

import { dependencyName } from "@teamantioch/sc2-asset-catalog/catalog/doodad-card-html.js";

import type { Tag } from "./narrow.ts";

/** A tick log's file name, inside the folder the public Finder's --tick-log names. */
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
  /** The map dependency it needs, absent when the default Void (Mod) brings it in. */
  readonly dependency?: string;
};

/** One card's copy text: its id, and the package it needs by name. */
export const itemCopyText = ({ id, dependency }: Pick<TrayItem, "id" | "dependency">): string => (dependency === undefined ? id : `${id} (needs ${dependencyName(dependency)})`);

/** The whole tray's copy text: an id a line, then each package needed, once, in the order first needed. */
export function trayCopyText(items: readonly Pick<TrayItem, "id" | "dependency">[]): string {
  const needed = [...new Set(items.flatMap(({ dependency }) => (dependency === undefined ? [] : [dependencyName(dependency)])))];
  return [...items.map(({ id }) => id), ...(needed.length ? ["", `Dependencies: ${needed.join(", ")}`] : [])].join("\n");
}

/** Ticks a card into the tray, or unticks it. A card is in the tray once, under the ask it was last ticked from. */
export function ticked(tray: readonly TrayItem[], item: TrayItem, on: boolean): TrayItem[] {
  const rest = tray.filter(({ id }) => id !== item.id);
  return on ? [...rest, item] : rest;
}
