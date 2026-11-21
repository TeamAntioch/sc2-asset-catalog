import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { parseJsonFile, TextSchema as Text } from "../util/parse-json.js";
import { SET_LOOKS_PATH } from "./catalog-dirs.js";

// The cinematic sets' looks (docs/adr/0005): data/set-looks.json holds, for each of the campaign
// cutscenes' sets made only from Blizzard's own files, what we wrote of it (an agent looked at
// pictures of the set and described the place) and what we measured (its size and camera count),
// keyed by set id, with its name and Cutscene Editor files as the keys that find it in the game.
// Nothing else in it is extracted from the game. Its pictures are in sc2-mapping-reference under
// public/sets/<set id>/, linked by URL, as the doodads' are.

/** A set's kind: `props` loose objects for map terrain with no room, `effects` only particles, holograms or light. */
export const SET_KINDS = ["room", "exterior", "space", "props", "effects", "unclear"] as const;
export type SetKind = (typeof SET_KINDS)[number];

/** One of a set's card pictures: a file in its gallery folder, what it shows, and whether the same view filmed in game is beside it. */
export type SetPicture = { readonly file: string; readonly shows: string; readonly inGame?: true };

/** What we wrote and measured of one cinematic set. */
export type SetLook = {
  readonly name: string;
  readonly kind: SetKind;
  /** Plain sentences: what the place is, its shape and size, its features and where, its materials and mood. */
  readonly look: string;
  /** Short lowercase search words. */
  readonly facets: readonly string[];
  /** The kinds of scene it could play; none for props and effects. */
  readonly standsInFor: readonly string[];
  /** Where one set holds more than one place: a line a place. */
  readonly rooms?: readonly string[];
  /** The pictures that show it best, the whole place first. */
  readonly pictures: readonly SetPicture[];
  /** Which pictures the look rests on, and what was unusable. */
  readonly basis: string;
  readonly confidence: "high" | "medium" | "low";
  /** What is wrong with its pictures. */
  readonly problems: readonly string[];
  /** Cells: x, y and height, as measured from its pieces. */
  readonly size: readonly [number, number, number];
  readonly cameras: number;
  /** The Cutscene Editor files it is in, as paths in the game's data. */
  readonly files: readonly string[];
};

const Texts = z.array(Text);
const Cells = z.number().nonnegative();

/** A look as the file holds it: these fields and nothing else (no marks or models read from the game's files). */
export const SetLookSchema = z
  .object({
    name: Text,
    kind: z.enum(SET_KINDS),
    look: z.string().min(40),
    facets: Texts.min(3),
    standsInFor: Texts,
    rooms: Texts.min(1).optional(),
    pictures: z.array(z.object({ file: z.string().regex(/^card\/\d+\.jpg$/), shows: Text, inGame: z.literal(true).optional() }).strict()),
    basis: Text,
    confidence: z.enum(["high", "medium", "low"]),
    problems: Texts,
    size: z.tuple([Cells, Cells, Cells]),
    cameras: z.number().int().nonnegative(),
    files: z.array(z.string().regex(/\.SC2Cutscene$/i)).min(1),
  })
  .strict();

/** The fields a look may have, in the order the file writes them. */
export const SET_LOOK_FIELDS = Object.keys(SetLookSchema.shape);

const SetLooksFileSchema = z.object({ about: Text, sets: z.record(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), SetLookSchema) }).strict();

/** The looks file's sets by id, refused naming `shown` and each issue's set and field when it isn't valid. */
export function parseSetLooks(text: string, shown: string): Record<string, SetLook> {
  return parseJsonFile(text, shown, SetLooksFileSchema, "a valid set looks file").sets as Record<string, SetLook>;
}

/** The shipped looks by set id (or those of `file`). */
export function readSetLooks(file: string = SET_LOOKS_PATH): Map<string, SetLook> {
  return new Map(Object.entries(parseSetLooks(readFileSync(file, "utf8"), path.basename(file))));
}

/** The sc2-mapping-reference gallery's set pictures, a folder a set id. */
export const SET_GALLERY_URL = "https://raw.githubusercontent.com/TeamAntioch/sc2-mapping-reference/main/public/sets";

/** The pictures every set has beside its card pictures. */
export const SET_VIEWS = ["plan.jpg", "overview.jpg"] as const;

/**
 * Where one of a set's pictures is: `file` is a card picture (`card/1.jpg`) or one of SET_VIEWS,
 * `inGame` its frame filmed in game (`card/1-game.jpg`), `thumbnail` its small copy (`_tn`), and
 * `base` the gallery's address (another copy of sc2-mapping-reference's public/sets, such as the
 * site's own).
 */
export function setPictureUrl(id: string, file: string, { inGame = false, thumbnail = false, base = SET_GALLERY_URL }: { readonly inGame?: boolean; readonly thumbnail?: boolean; readonly base?: string } = {}): string {
  const name = file.replace(/\.jpg$/, `${inGame ? "-game" : ""}${thumbnail ? "_tn" : ""}.jpg`);
  return `${base.replace(/\/$/, "")}/${encodeURIComponent(id)}/${name}`;
}
