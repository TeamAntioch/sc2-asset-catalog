// A finder's vectors of its cards (docs/adr/0001), and their cache: a git-ignored file keyed by
// a hash of the text each card is embedded as (`embeddedText`), so a start embeds only the cards whose embedded text changed. The vectors are
// tied to one model, and are only a copy of committed text: deleting the file costs a cold start.
//
// The file is a 4-byte header length, a JSON header ({ model, dimensions, hashes }), then each
// hash's vector as float32s, in the header's order.

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { embeddedText, type FinderCard } from "./card.ts";
import type { Embedder } from "./embedder.ts";

export type Neighbour = { readonly id: string; readonly similarity: number };

const textHash = (text: string): string => createHash("sha256").update(text).digest("base64url").slice(0, 22);

type Header = { readonly model: string; readonly dimensions: number; readonly hashes: readonly string[] };

async function readCache(file: string, model: string): Promise<Map<string, Float32Array>> {
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    return new Map();
  }
  try {
    const length = bytes.readUInt32LE(0);
    const header = JSON.parse(bytes.subarray(4, 4 + length).toString("utf8")) as Header;
    if (header.model !== model) return new Map();
    const start = 4 + length;
    // A file cut short, or of another layout, is no cache.
    if (!(header.dimensions > 0) || !Array.isArray(header.hashes) || bytes.length !== start + header.hashes.length * header.dimensions * 4) return new Map();
    // A copy, aligned for Float32Array whatever the header's length.
    const floats = new Float32Array(bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + start + header.hashes.length * header.dimensions * 4));
    return new Map(header.hashes.map((hash, i) => [hash, floats.subarray(i * header.dimensions, (i + 1) * header.dimensions)]));
  } catch {
    // Nor is one whose header doesn't read.
    return new Map();
  }
}

async function writeCache(file: string, model: string, vectors: ReadonlyMap<string, Float32Array>): Promise<void> {
  const hashes = [...vectors.keys()];
  const dimensions = vectors.values().next().value?.length ?? 0;
  const header = Buffer.from(JSON.stringify({ model, dimensions, hashes } satisfies Header), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(header.length);
  const floats = new Float32Array(hashes.length * dimensions);
  hashes.forEach((hash, i) => floats.set(vectors.get(hash)!, i * dimensions));
  await mkdir(path.dirname(file), { recursive: true });
  const partial = `${file}.partial`;
  await writeFile(partial, Buffer.concat([length, header, Buffer.from(floats.buffer)]));
  await rename(partial, file);
}

export class EmbeddingIndex {
  /** By the hash of the text a card is embedded as (`embeddedText`): every vector the cache holds that a card still uses. */
  #vectors: Map<string, Float32Array>;
  /** The last update's cards' nearest. */
  #nearest: Nearest = () => [];

  readonly #embedder: Embedder;
  readonly #file: string;

  private constructor(embedder: Embedder, file: string, vectors: Map<string, Float32Array>) {
    this.#embedder = embedder;
    this.#file = file;
    this.#vectors = vectors;
  }

  /** The index over the cache file's vectors for the embedder's model; none until the first update. */
  static async open(embedder: Embedder, file: string): Promise<EmbeddingIndex> {
    return new EmbeddingIndex(embedder, file, await readCache(file, embedder.model));
  }

  /**
   * Takes these cards as the whole set: embeds the ones whose embedded text (`embeddedText`:
   * `embedText`, else `text`) it has no vector for, forgets the
   * rest, and saves the cache when it changed. Gives these cards' own nearest, which later updates
   * leave as it is, so a caller can swap it in with the cards it was made for.
   */
  async update(cards: readonly FinderCard[]): Promise<{ embedded: number; nearest: Nearest }> {
    const texts = cards.map((card) => embeddedText(card));
    const hashes = texts.map(textHash);
    const missing = new Map<string, string>();
    hashes.forEach((hash, i) => {
      if (!this.#vectors.has(hash)) missing.set(hash, texts[i]!);
    });
    const vectors = new Map<string, Float32Array>();
    if (missing.size) {
      const embedded = await this.#embedder.embed([...missing.values()], "passage");
      [...missing.keys()].forEach((hash, i) => vectors.set(hash, embedded[i]!));
    }
    for (const hash of hashes) vectors.set(hash, vectors.get(hash) ?? this.#vectors.get(hash)!);
    const forgot = this.#vectors.size !== vectors.size || [...this.#vectors.keys()].some((hash) => !vectors.has(hash));
    const dimensions = vectors.values().next().value?.length ?? 0;
    const matrix = new Float32Array(cards.length * dimensions);
    hashes.forEach((hash, i) => matrix.set(vectors.get(hash)!, i * dimensions));
    const nearest = nearestOver(cards.map((card) => card.id), matrix, dimensions);
    this.#vectors = vectors;
    this.#nearest = nearest;
    if (missing.size || forgot) await writeCache(this.#file, this.#embedder.model, vectors);
    // Counted in cards, not texts: cards that share a text share its one vector.
    return { embedded: hashes.filter((hash) => missing.has(hash)).length, nearest };
  }

  /** The last update's cards most like a unit vector (see Nearest). */
  nearest(query: Float32Array, k: number, keep?: (id: string) => boolean): Neighbour[] {
    return this.#nearest(query, k, keep);
  }
}

/** The k cards most like a unit vector, most alike first, among those `keep` allows. */
export type Nearest = (query: Float32Array, k: number, keep?: (id: string) => boolean) => Neighbour[];

/** Nearest over some cards' ids and their vectors, a row each of `matrix`. */
function nearestOver(ids: readonly string[], matrix: Float32Array, dimensions: number): Nearest {
  return (query, k, keep) => {
    const best: Neighbour[] = [];
    for (let row = 0; row < ids.length; row++) {
      const id = ids[row]!;
      let similarity = 0;
      const offset = row * dimensions;
      for (let d = 0; d < dimensions; d++) similarity += matrix[offset + d]! * query[d]!;
      if (best.length === k && similarity <= best[k - 1]!.similarity) continue;
      if (keep && !keep(id)) continue;
      // Kept sorted by insertion: k is about 100, the cards a few thousand.
      let at = best.length;
      while (at > 0 && best[at - 1]!.similarity < similarity) at--;
      best.splice(at, 0, { id, similarity });
      if (best.length > k) best.pop();
    }
    return best;
  };
}
