// The Finder's tray (docs/adr/0001): the kit's, with what a click on "copy" puts on the clipboard for
// doodads: one card's id and the package it needs, or the whole tray's ids and the packages they
// need, once each.

import { dependencyName } from "@team-antioch/sc2-asset-catalog/catalog/doodad-card-html.js";
import type { CopyText, TrayItem } from "@team-antioch/sc2-finder-kit/tray.js";

export { TICK_LOG_FILE, ticked, type TrayItem } from "@team-antioch/sc2-finder-kit/tray.js";

/** One card's copy text: its id, and the package it needs by name. */
export const itemCopyText = ({ id, dependency }: Pick<TrayItem, "id" | "dependency">): string => (dependency === undefined ? id : `${id} (needs ${dependencyName(dependency)})`);

/** The whole tray's copy text: an id a line, then each package needed, once, in the order first needed. */
export function trayCopyText(items: readonly Pick<TrayItem, "id" | "dependency">[]): string {
  const needed = [...new Set(items.flatMap(({ dependency }) => (dependency === undefined ? [] : [dependencyName(dependency)])))];
  return [...items.map(({ id }) => id), ...(needed.length ? ["", `Dependencies: ${needed.join(", ")}`] : [])].join("\n");
}

/** What the doodad finder copies. */
export const DOODAD_COPY: CopyText = { item: itemCopyText, all: trayCopyText };
