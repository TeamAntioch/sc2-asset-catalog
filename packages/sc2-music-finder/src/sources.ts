// What the Finder searches by default: the extracted music ids in the cache folder joined to the
// shipped listening notes, read afresh on each change, and the file whose changes write the cards
// again. On a first start the ids are extracted (ensureMusic).

import { readFile } from "node:fs/promises";
import path from "node:path";

import { extractedDir } from "@team-antioch/sc2-asset-catalog/catalog/catalog-dirs.js";
import { extractMusic, type ExtractMusicOptions, hasExtractedMusic, MUSIC_EXTRACTED_FILE } from "@team-antioch/sc2-asset-catalog/catalog/extract-music.js";
import { joinMusicCatalog, parseMusicExtracted } from "@team-antioch/sc2-asset-catalog/catalog/music-catalog.js";
import { readMusicNotes } from "@team-antioch/sc2-asset-catalog/catalog/music-notes.js";
import { npxHint } from "@team-antioch/sc2-asset-catalog/util/npx.js";

import type { MusicSources } from "./cards.ts";

/** What the cards are made from, read afresh on each change, and the files whose changes write them again. */
export type FinderSources = { readonly load: () => Promise<MusicSources>; readonly watch: readonly string[] };

/** The stock music in a cache folder: the extracted ids and the shipped notes. */
export function stockSources(cacheDir: string): FinderSources {
  const dir = extractedDir(cacheDir);
  return {
    load: async () => {
      const file = path.join(dir, MUSIC_EXTRACTED_FILE);
      const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
        throw error.code === "ENOENT" ? new Error(`${file} isn't there: run \`${npxHint("@team-antioch/sc2-music-finder extract")}\` first`, { cause: error }) : error;
      });
      const notes = readMusicNotes();
      return { catalog: joinMusicCatalog(parseMusicExtracted(text, MUSIC_EXTRACTED_FILE), notes), notes };
    },
    watch: [path.join(dir, MUSIC_EXTRACTED_FILE)],
  };
}

/**
 * Extracts the music ids unless the cache folder holds an extraction already. A failure says to
 * run the extract command once there is a connection.
 */
export async function ensureMusic(cacheDir: string, { log = () => {}, ...fetching }: Pick<ExtractMusicOptions, "fetch" | "listMirrorFiles" | "log" | "env"> = {}): Promise<void> {
  const dir = extractedDir(cacheDir);
  if (hasExtractedMusic(dir)) return;
  log(`Extracting the music ids from SC2GameData into ${dir} (once; about a minute)`);
  try {
    await extractMusic({ extractedDir: dir, log, ...fetching });
  } catch (error) {
    throw new Error(`Couldn't extract the music: ${(error as Error).message}. Check the connection, then run ${npxHint("@team-antioch/sc2-music-finder extract")} (or sc2-music-finder extract, where it is installed)`, { cause: error });
  }
}
