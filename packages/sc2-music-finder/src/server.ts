// The Music Finder's process (docs/adr/0001): the kit's server (@team-antioch/sc2-finder-kit/server.js),
// given the music's page, cards, tags and copy text, and the routes that are its own:
//
//   GET  /facets       what the page's filters offer (kinds, factions, dependencies) and whether
//                      there is an Audio folder
//   GET  /audio/<key>  a music file from the Audio folder, by its base name, with byte ranges;
//                      only a file the folder's index holds
//
// The kit's routes and tray actions are documented there. The Finder offers no map choice and no
// objects: its tray is the session's.

import { dependencyName, KNOWN_DEPENDENCIES } from "./narrow.ts";
import { type FinderKind, type FinderServer, type FinderServerOptions as KitFinderServerOptions, startFinderServer as startKitServer } from "@team-antioch/sc2-finder-kit/server.js";

import { type AudioIndex, AUDIO_PREFIX, serveAudio } from "./audio.ts";
import { type AudioState, cardHtml, levelName } from "./card-html.ts";
import type { MusicCard } from "./cards.ts";
import type { Finder } from "./finder.ts";
import { finderPage } from "./page.ts";
import { objectTags } from "./tags.ts";
import { MUSIC_COPY } from "./tray.ts";

export {
  failureText,
  type FinderServer,
  type TickLogLine,
  type TrayAction,
  type TrayActionContext,
  type TrayActionInput,
  type TrayActionResult,
} from "@team-antioch/sc2-finder-kit/server.js";

/** The port the page is at unless another is asked for. */
export const MUSIC_FINDER_PORT = 4635;

export type MusicServerOptions = Omit<KitFinderServerOptions<MusicCard>, "kind" | "finder" | "badges" | "objects"> & {
  readonly finder: Pick<Finder, "narrow" | "cards" | "sources">;
  /** The Audio folder's index: cards play their files from it. None without `--audio`. */
  readonly audio?: AudioIndex | undefined;
};

export async function startFinderServer(options: MusicServerOptions): Promise<FinderServer> {
  const { finder, audio } = options;
  const audioState = (key: string): AudioState => (audio === undefined ? "none" : audio.files.has(key) ? "ready" : "missing");

  const kind: FinderKind<MusicCard> = {
    name: "music-finder",
    noun: "track",
    page: finderPage,
    levelName,
    renderCards: (cards) => cards.map((card) => cardHtml(card, audioState)),
    tags: objectTags,
    copy: MUSIC_COPY,
    async route(url, request, response) {
      if (url.pathname === "/facets") {
        const entries = finder.sources.catalog.entries;
        const kinds = [...new Set(entries.flatMap((entry) => entry.kinds))].sort();
        // The dependencies a map can say it has: the ones a card names that are the game's own (a package with no known dependency is on its card, not here).
        const needed = new Set(entries.flatMap((entry) => (entry.dependency === undefined ? [] : [dependencyName(entry.dependency)])));
        const dependencies = Object.keys(KNOWN_DEPENDENCIES).filter((name) => needed.has(name)).sort();
        response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        response.end(JSON.stringify({ kinds, factions: ["terran", "protoss", "zerg"], dependencies, audio: { on: audio !== undefined, files: audio?.files.size ?? 0 } }));
        return true;
      }
      if (!url.pathname.startsWith(AUDIO_PREFIX)) return false;
      await serveAudio(audio, url, request, response);
      return true;
    },
  };
  return startKitServer<MusicCard>({ ...options, kind });
}
