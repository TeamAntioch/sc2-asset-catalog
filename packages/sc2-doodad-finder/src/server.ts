// The Doodad Finder's process (docs/adr/0001): the kit's server (@team-antioch/sc2-finder-kit/server.js),
// given the doodads' page, cards, tags, copy text and the route that serves a doodad's sheet.
//
//   GET  /sheet/<id>   a doodad's sheet, from the catalogs' own path for that id
//
// The kit's routes, the tray objects and the tray actions are documented there.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { type DoodadPicture, doodadPictures, type DoodadSearchSources } from "@team-antioch/sc2-asset-catalog/catalog/doodad-search.js";
import { type FinderKind, type FinderServer, HttpError, type FinderServerOptions as KitFinderServerOptions, startFinderServer as startKitServer } from "@team-antioch/sc2-finder-kit/server.js";

import { cardHtml, levelName } from "./card-html.ts";
import { type CandidateCard } from "./cards.ts";
import type { Finder } from "./finder.ts";
import { finderPage } from "./page.ts";
import { objectTags } from "./tags.ts";
import { DOODAD_COPY } from "./tray.ts";

export {
  type Badges,
  failureText,
  type FinderServer,
  type ObjectTick,
  type TickLogLine,
  type TrayAction,
  type TrayActionContext,
  type TrayActionInput,
  type TrayActionResult,
  type TrayObject,
  type TrayObjects,
  type UnfinishedObject,
} from "@team-antioch/sc2-finder-kit/server.js";

/** The port the page is at unless another is asked for. */
export const FINDER_PORT = 4634;

export type FinderServerOptions = Omit<KitFinderServerOptions<CandidateCard>, "kind" | "finder"> & {
  readonly finder: Pick<Finder, "narrow" | "cards" | "sources">;
};

const SHEET_TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function startFinderServer(options: FinderServerOptions): Promise<FinderServer> {
  const { finder } = options;
  // Pictures by id, for the sources they were looked up in.
  let pictures = new WeakMap<DoodadSearchSources, Map<string, DoodadPicture>>();
  const picturesOf = (ids: readonly string[]): Map<string, DoodadPicture> => {
    const { sources } = finder;
    let known = pictures.get(sources);
    if (!known) pictures.set(sources, (known = new Map()));
    const missing = ids.filter((id) => !known!.has(id));
    if (missing.length) for (const [id, picture] of doodadPictures(missing, sources)) known.set(id, picture);
    return known;
  };

  const kind: FinderKind<CandidateCard> = {
    name: "doodad-finder",
    noun: "doodad",
    page: finderPage,
    levelName,
    renderCards(cards, provided) {
      const found = picturesOf(cards.map(({ id }) => id));
      return cards.map((card) => cardHtml(card, found.get(card.id) ?? { kind: "none" }, provided));
    },
    tags: objectTags,
    copy: DOODAD_COPY,
    async route(url, _request, response) {
      if (!url.pathname.startsWith("/sheet/")) return false;
      const notFound = () => new HttpError(404, "No sheet");
      let id: string;
      try {
        id = decodeURIComponent(url.pathname.slice("/sheet/".length));
      } catch {
        throw notFound();
      }
      const picture = finder.cards.has(id) ? picturesOf([id]).get(id) : undefined;
      if (picture?.kind !== "sheet") throw notFound();
      const type = SHEET_TYPES[path.extname(picture.path).toLowerCase()];
      if (!type) throw notFound();
      const { size } = await stat(picture.path).catch(() => Promise.reject(notFound()));
      response.writeHead(200, { "content-type": type, "content-length": size, "cache-control": "max-age=3600" });
      // A sheet rebuilt between the stat and the read ends the answer early, not the process.
      createReadStream(picture.path)
        .on("error", () => response.destroy())
        .pipe(response);
      return true;
    },
    close() {
      pictures = new WeakMap();
    },
  };
  return startKitServer<CandidateCard>({ ...options, kind });
}
