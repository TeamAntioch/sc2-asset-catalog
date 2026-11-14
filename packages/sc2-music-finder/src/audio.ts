// The Audio folder (GLOSSARY.md): a folder of the game's music .ogg files that the user extracted
// from their own install and gave `--audio`. The Finder indexes it once, by each file's base name
// (lower case, whatever folder it is in), and serves a file to the page only from that index: a
// request names a key, never a path, so nothing outside the folder can be asked for. The audio is
// Blizzard's and never ships with the package.

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import { musicFileKey } from "@team-antioch/sc2-asset-catalog/catalog/music-notes.js";
import { HttpError } from "@team-antioch/sc2-finder-kit/server.js";

/** The files an Audio folder holds, by key. */
export type AudioIndex = {
  readonly folder: string;
  /** Each .ogg file's absolute path, by its base name (lower case, no extension). */
  readonly files: ReadonlyMap<string, string>;
  /** Keys that more than one file had: the first, by path, is the one indexed. */
  readonly duplicates: readonly string[];
};

/** Indexes the .ogg files under `folder`, at any depth. Throws saying why when it isn't a folder, or holds none. */
export async function indexAudioFolder(folder: string): Promise<AudioIndex> {
  const resolved = path.resolve(folder);
  const found = await stat(resolved).catch(() => undefined);
  if (!found?.isDirectory()) throw new Error(`--audio ${folder}: not a folder`);
  const entries = await readdir(resolved, { recursive: true, withFileTypes: true });
  // A symbolic link to a file counts as the file; one to a folder isn't followed.
  const candidates: string[] = [];
  for (const entry of entries) {
    if (!/\.ogg$/i.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    if (entry.isFile() || (entry.isSymbolicLink() && (await stat(file).catch(() => undefined))?.isFile())) candidates.push(file);
  }
  candidates.sort();
  const files = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const file of candidates) {
    const key = musicFileKey(file);
    if (files.has(key)) duplicates.add(key);
    else files.set(key, file);
  }
  if (!files.size) throw new Error(`--audio ${folder}: no .ogg files in it`);
  return { folder: resolved, files, duplicates: [...duplicates].sort() };
}

/** A single `Range: bytes=` header's span of a file of `size` bytes: the whole file when there is none, undefined when it can't be met. */
export function byteRange(header: string | undefined, size: number): { readonly start: number; readonly end: number; readonly partial: boolean } | undefined {
  if (header === undefined) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return undefined;
  let start: number;
  let end: number;
  if (match[1] === "") {
    // The last n bytes.
    const last = Number(match[2]);
    if (last === 0) return undefined;
    start = Math.max(0, size - last);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (!(start <= end) || start >= size) return undefined;
  return { start, end, partial: true };
}

/** Where the page asks for a file: by key. */
export const AUDIO_PREFIX = "/audio/";

/**
 * Answers `/audio/<key>` from the index, with byte ranges so the page's player can seek. A key that
 * isn't in the index is a 404; nothing from the request is joined to a path.
 */
export async function serveAudio(index: AudioIndex | undefined, url: URL, request: IncomingMessage, response: ServerResponse): Promise<void> {
  let key: string;
  try {
    key = decodeURIComponent(url.pathname.slice(AUDIO_PREFIX.length)).toLowerCase();
  } catch {
    throw new HttpError(404, "No such file");
  }
  const file = index?.files.get(key);
  if (file === undefined) throw new HttpError(404, "No such file");
  const { size } = await stat(file).catch(() => Promise.reject(new HttpError(404, "No such file")));
  if (size === 0) {
    response.writeHead(200, { "content-type": "audio/ogg", "content-length": 0 });
    response.end();
    return;
  }
  const range = byteRange(request.headers.range, size);
  if (!range) {
    response.writeHead(416, { "content-range": `bytes */${size}` });
    response.end();
    return;
  }
  response.writeHead(range.partial ? 206 : 200, {
    "content-type": "audio/ogg",
    "accept-ranges": "bytes",
    "content-length": range.end - range.start + 1,
    "cache-control": "no-store",
    ...(range.partial ? { "content-range": `bytes ${range.start}-${range.end}/${size}` } : {}),
  });
  // A file removed between the stat and the read ends the answer early, not the process.
  createReadStream(file, { start: range.start, end: range.end })
    .on("error", () => response.destroy())
    .pipe(response);
}
