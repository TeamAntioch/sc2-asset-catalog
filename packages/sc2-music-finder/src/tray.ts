// The Finder's tray (docs/adr/0002): the kit's, with what a click on "copy" puts on the clipboard
// for music: one card's id and the dependency it needs, or the whole tray's ids and the
// dependencies they need, once each. The page adds a track's in-point to these (in-point.ts): the
// in-point is the mapper's choice on the page, which the process never sees.

import { dependencyName } from "@team-antioch/sc2-asset-catalog/catalog/doodad-dependencies.js";
import type { CopyText, TrayItem } from "@team-antioch/sc2-finder-kit/tray.js";

export { TICK_LOG_FILE, ticked, type TrayItem } from "@team-antioch/sc2-finder-kit/tray.js";

/** One card's copy text: its id, and the dependency it needs by name. */
export const itemCopyText = ({ id, dependency }: Pick<TrayItem, "id" | "dependency">): string => (dependency === undefined ? id : `${id} (needs ${dependencyName(dependency)})`);

/** The whole tray's copy text: an id a line, then each dependency needed, once, in the order first needed. */
export function trayCopyText(items: readonly Pick<TrayItem, "id" | "dependency">[]): string {
  const needed = [...new Set(items.flatMap(({ dependency }) => (dependency === undefined ? [] : [dependencyName(dependency)])))];
  return [...items.map(({ id }) => id), ...(needed.length ? ["", `Dependencies: ${needed.join(", ")}`] : [])].join("\n");
}

/** What the music finder copies. */
export const MUSIC_COPY: CopyText = { item: itemCopyText, all: trayCopyText };
