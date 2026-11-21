// The Set Finder's process (docs/adr/0002): the kit's server (@team-antioch/sc2-finder-kit/server.js),
// given the sets' page, cards, tags and copy text, and the routes that are its own:
//
//   GET  /cards                      every set's card, by name: the gallery with nothing asked
//   GET  /set/<id>                   one set's page
//   GET  /pictures/<id>/<file>       a picture of a set whose layer keeps its pictures in a folder
//                                    on this machine (SetLayer's `dir`): a card picture, its frame in
//                                    game, the plan or the overview, and nothing else
//
// The published sets' pictures aren't served here: the page loads them from the gallery's address.
// The kit's routes and tray actions are documented there.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream";

import { type FinderKind, type FinderServer, type FinderServerOptions as KitFinderServerOptions, startFinderServer as startKitServer } from "@team-antioch/sc2-finder-kit/server.js";

import { cardHtml } from "./card-html.ts";
import type { SetCard } from "./cards.ts";
import type { SetFinder } from "./finder.ts";
import { finderPage, setPage } from "./page.ts";
import { objectTags, setCopy } from "./tags.ts";
import { levelName } from "./wording.ts";

export {
  failureText,
  type FinderServer,
  type TickLogLine,
  type TrayAction,
  type TrayActionContext,
  type TrayActionInput,
  type TrayActionResult,
} from "@team-antioch/sc2-finder-kit/server.js";

/** The port the page is at unless another is asked for: the Doodad Finder's is 4634 and the Music Finder's 4635. */
export const SET_FINDER_PORT = 4636;

/** The pictures a layer's folder may serve for a set, as the gallery names them. */
export const LOCAL_PICTURE = /^(?:card\/\d+(?:-game)?|plan|overview)\.jpg$/;

export type SetServerOptions = Omit<KitFinderServerOptions<SetCard>, "kind" | "finder" | "badges" | "objects"> & {
  readonly finder: Pick<SetFinder, "narrow" | "cards">;
};

export async function startSetFinderServer(options: SetServerOptions): Promise<FinderServer> {
  const { finder } = options;
  const json = (response: Parameters<NonNullable<FinderKind<SetCard>["route"]>>[2], status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(body));
  };

  const kind: FinderKind<SetCard> = {
    name: "set-finder",
    noun: "set",
    page: finderPage,
    levelName,
    renderCards: (cards) => cards.map(cardHtml),
    tags: objectTags,
    copy: setCopy(() => finder.cards),
    async route(url, _request, response) {
      if (url.pathname === "/cards") {
        const cards = [...finder.cards.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        json(response, 200, { cards: cards.map((card) => ({ id: card.id, name: card.name, kind: card.look.kind, html: cardHtml(card) })) });
        return true;
      }
      const [route, id, ...rest] = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
      const card = id === undefined ? undefined : finder.cards.get(id);
      if (route === "set" && rest.length === 0 && id !== undefined) {
        if (!card) return json(response, 404, { error: `No set ${id}` }), true;
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(setPage(card));
        return true;
      }
      if (route !== "pictures") return false;
      // The file's name is checked whole, once decoded, so no `..` or other folder can be asked for.
      const file = rest.join("/");
      const found = card?.pictureDir !== undefined && LOCAL_PICTURE.test(file) ? path.join(card.pictureDir, card.id, file) : undefined;
      const size = found ? await stat(found).then((info) => (info.isFile() ? info.size : undefined), () => undefined) : undefined;
      if (!found || size === undefined) return json(response, 404, { error: `No picture at ${url.pathname}` }), true;
      response.writeHead(200, { "content-type": "image/jpeg", "content-length": size, "cache-control": "max-age=60" });
      pipeline(createReadStream(found), response, () => {});
      return true;
    },
  };
  return startKitServer<SetCard>({ ...options, finder, kind });
}
