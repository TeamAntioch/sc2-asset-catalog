// What the terrain textures look like, to choose them by sight: each texture's picture from the
// sc2-mapping-reference gallery, and a labelled sheet of pictures to look at side by side, as SVG.
//
// The pictures are the gallery's, fetched once from GitHub and kept in the cache folder
// (<cache>/texture-pictures), so this package ships none of the game's art. A texture with no
// gallery picture is drawn as a grey tile saying so: judge it from its description, or in the Editor.

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { writeWhole } from "../util/write-whole.js";
import { catalogCacheDir } from "./catalog-dirs.js";
import type { TextureEntry } from "./texture-catalog.js";

/** The sc2-mapping-reference gallery's texture pictures, by the extracted `image` file name. */
export const TEXTURE_GALLERY_URL = "https://raw.githubusercontent.com/TeamAntioch/sc2-mapping-reference/main/public/tilesets";

/** Where a texture's gallery picture is: `image` its file name, `thumbnail` its small copy (`_tn`), `base` the gallery's address. */
export function texturePictureUrl(image: string, { thumbnail = false, base = TEXTURE_GALLERY_URL }: { readonly thumbnail?: boolean; readonly base?: string } = {}): string {
  return `${base.replace(/\/$/, "")}/${encodeURIComponent(thumbnail ? image.replace(/\.jpg$/, "_tn.jpg") : image)}`;
}

/** The folder in a cache folder that fetched texture pictures are kept in. */
export const texturePictureDir = (cacheDir: string = catalogCacheDir()): string => path.join(cacheDir, "texture-pictures");

export type PictureOptions = {
  /** The folder pictures are kept in (texturePictureDir). */
  readonly pictureDir: string;
  /** A local copy of the gallery (sc2-mapping-reference's public/tilesets), read before fetching. */
  readonly gallery?: string;
  readonly fetch?: typeof globalThis.fetch;
};

const isJpeg = (bytes: Buffer): boolean => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/**
 * A texture's gallery picture (JPEG), from the picture folder, the local gallery or GitHub, in that
 * order; a fetched one is kept in the picture folder. Undefined for a texture with no picture, or
 * one that can't be had.
 */
export async function texturePicture(texture: Pick<TextureEntry, "image">, options: PictureOptions): Promise<Buffer | undefined> {
  const image = texture.image;
  if (!image) return undefined;
  const kept = path.join(options.pictureDir, image);
  for (const file of [kept, options.gallery ? path.join(options.gallery, image) : undefined]) {
    if (!file) continue;
    const bytes = await readFile(file).catch(() => undefined);
    if (bytes && isJpeg(bytes)) return bytes;
  }
  const response = await (options.fetch ?? globalThis.fetch)(texturePictureUrl(image)).catch(() => undefined);
  if (!response?.ok) return undefined;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!isJpeg(bytes)) return undefined;
  await mkdir(options.pictureDir, { recursive: true });
  await writeWhole(kept, bytes);
  return bytes;
}

/** One tile of a sheet: a texture, its picture (none draws a grey tile) and an optional label. */
export type SheetTile = {
  readonly texture: Pick<TextureEntry, "id" | "tilesets" | "description">;
  readonly picture: Buffer | undefined;
  /** A caption above the id, such as a role in a set ("base floor") or a slot ("slot 8"). */
  readonly label?: string | undefined;
};

/** Some textures' sheet tiles, each with its picture (texturePicture), and the ids that have none. */
export async function textureSheetTiles(
  textures: readonly { readonly texture: TextureEntry; readonly label?: string | undefined }[],
  options: PictureOptions,
): Promise<{ readonly tiles: readonly SheetTile[]; readonly missing: readonly string[] }> {
  const tiles = await Promise.all(textures.map(async ({ texture, label }) => ({ texture, label, picture: await texturePicture(texture, options) })));
  return { tiles, missing: tiles.filter((tile) => !tile.picture).map((tile) => tile.texture.id) };
}

const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Splits text into at most `lines` lines of at most `width` characters, at spaces, the last cut short with an ellipsis. */
function wrap(text: string, width: number, lines: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && `${line} ${word}`.length > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  if (out.length <= lines) return out;
  return [...out.slice(0, lines - 1), `${out[lines - 1]!.slice(0, width - 1)}…`];
}

export type SheetOptions = { readonly columns?: number; readonly size?: number };

/**
 * A sheet of texture pictures, `columns` to a row, each tile `size` pixels square with its label, id
 * and look beneath, as SVG. Pictures are cropped to their middle, which drops the gallery's own caption.
 */
export function textureSheetSvg(tiles: readonly SheetTile[], { columns = 4, size = 256 }: SheetOptions = {}): string {
  const gap = 12;
  const caption = 64;
  const across = Math.max(1, Math.min(columns, tiles.length));
  const rows = Math.max(1, Math.ceil(tiles.length / across));
  const width = across * size + (across + 1) * gap;
  const height = rows * (size + caption) + (rows + 1) * gap;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#1b1b1b"/>`,
  ];
  tiles.forEach((tile, index) => {
    const x = gap + (index % across) * (size + gap);
    const y = gap + Math.floor(index / across) * (size + caption + gap);
    const clip = `t${index}`;
    if (tile.picture) {
      // The gallery's pictures carry a caption bar along their bottom: draw the middle 80% only.
      const scale = size / 0.8;
      parts.push(
        `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${size}" height="${size}"/></clipPath>`,
        `<image clip-path="url(#${clip})" x="${x - scale * 0.1}" y="${y - scale * 0.1}" width="${scale}" height="${scale}" preserveAspectRatio="none" xlink:href="data:image/jpeg;base64,${tile.picture.toString("base64")}"/>`,
      );
    } else {
      parts.push(
        `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#555"/>`,
        `<text x="${x + size / 2}" y="${y + size / 2}" fill="#ddd" font-size="14" text-anchor="middle">no picture</text>`,
      );
    }
    const lines = [
      ...(tile.label ? [{ text: tile.label, fill: "#ffd060", weight: "bold" }] : []),
      { text: tile.texture.id, fill: "#ffffff", weight: "bold" },
      ...wrap(tile.texture.description?.look ?? tile.texture.tilesets.join(", "), Math.floor(size / 7), tile.label ? 2 : 3).map((text) => ({ text, fill: "#bbbbbb", weight: "normal" })),
    ];
    lines.forEach((line, row) => {
      parts.push(`<text x="${x}" y="${y + size + 15 + row * 15}" fill="${line.fill}" font-size="13" font-weight="${line.weight}">${escape(line.text)}</text>`);
    });
  });
  parts.push("</svg>");
  return parts.join("\n");
}
