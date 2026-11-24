import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { parseJsonFile, TextSchema as Text } from "../util/parse-json.js";
import { EFFECT_LOOKS_PATH } from "./catalog-dirs.js";

// The effect models' looks (docs/adr/0007): data/effect-looks.json holds, for each of the game's
// effect models (the .m3 files under Assets/Effects), what we wrote of it. An agent looked at
// frames of the effect filmed in the game, on a Marine on plain ground (sc2-adjutant's effect
// tour), and described what it shows, keyed by the model's path in the game's data. Nothing else
// in it is extracted from the game. Its pictures are in sc2-mapping-reference under
// public/effects/, at the model's own path, linked by URL, as the doodads' are.

/**
 * What an effect is, to the eye: `burst` a one-off flash, explosion, splash or impact; `beam` a
 * line between two points; `projectile` a missile, bolt or shot; `aura` something that stays on or
 * around its host (a shield, a glow, flames, a cloud); `ground` something laid on the ground (a
 * ring, a pool, a scorch, a marker); `trail` a ribbon or streak left behind a mover; `glow` a light
 * or flare with no shape of its own; `object` a solid model, such as debris or a summoned thing;
 * `nothing` nothing visible in any frame filmed.
 */
export const EFFECT_KINDS = ["burst", "beam", "projectile", "aura", "ground", "trail", "glow", "object", "nothing"] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

/** Its size next to the Marine it was filmed on. */
export const EFFECT_SIZES = ["tiny", "small", "medium", "large", "huge"] as const;
export type EffectSize = (typeof EFFECT_SIZES)[number];

/** What it did while its host slid sideways: went with it, stayed where it was, or streaked behind. */
export const EFFECT_MOVING = ["follows", "stays", "trails", "unclear"] as const;

/** What was left half a second after its actor was destroyed outright. */
export const EFFECT_AFTER_DESTROY = ["gone", "lingers", "unclear"] as const;

/** What we wrote of one effect. */
export type EffectLook = {
  readonly kind: EffectKind;
  /** Plain sentences: what it shows, its shape, colours and size, how it moves and ends. */
  readonly look: string;
  /** Its main colours, lowercase; none when nothing shows. */
  readonly colors: readonly string[];
  /** Left out when nothing shows. */
  readonly size?: EffectSize;
  readonly moving: (typeof EFFECT_MOVING)[number];
  readonly afterDestroy: (typeof EFFECT_AFTER_DESTROY)[number];
  /** Short lowercase search words. */
  readonly facets: readonly string[];
  /** What a mapper could use it for, in general words. */
  readonly suits: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  /** What is wrong with its frames, such as nothing showing or the effect leaving the frame. */
  readonly problems: readonly string[];
};

const Texts = z.array(Text);

/** A look as the file holds it: these fields and nothing else (no animations, emitters or textures read from the model). */
export const EffectLookSchema = z
  .object({
    kind: z.enum(EFFECT_KINDS),
    look: z.string().min(30),
    colors: Texts,
    size: z.enum(EFFECT_SIZES).optional(),
    moving: z.enum(EFFECT_MOVING),
    afterDestroy: z.enum(EFFECT_AFTER_DESTROY),
    facets: Texts.min(3),
    suits: Texts,
    confidence: z.enum(["high", "medium", "low"]),
    problems: Texts,
  })
  .strict()
  .refine((look) => (look.kind === "nothing") === (look.size === undefined), { message: "size is left out exactly when nothing shows", path: ["size"] });

/** The fields a look may have, in the order the file writes them. */
export const EFFECT_LOOK_FIELDS = ["kind", "look", "colors", "size", "moving", "afterDestroy", "facets", "suits", "confidence", "problems"] as const;

/** A model's path in the game's data, as an actor or a CModel names it, with forward slashes. */
const EffectFile = z.string().regex(/^Assets\/Effects\/[^\\]+\.m3$/);

const EffectLooksFileSchema = z.object({ about: Text, effects: z.record(EffectFile, EffectLookSchema) }).strict();

/** The looks file's effects by model path, refused naming `shown` and each issue's effect and field when it isn't valid. */
export function parseEffectLooks(text: string, shown: string): Record<string, EffectLook> {
  return parseJsonFile(text, shown, EffectLooksFileSchema, "a valid effect looks file").effects as Record<string, EffectLook>;
}

/** The shipped looks by model path (or those of `file`). */
export function readEffectLooks(file: string = EFFECT_LOOKS_PATH): Map<string, EffectLook> {
  return new Map(Object.entries(parseEffectLooks(readFileSync(file, "utf8"), path.basename(file))));
}

/** The sc2-mapping-reference gallery's effect pictures, at each model's path under Assets/Effects. */
export const EFFECT_GALLERY_URL = "https://raw.githubusercontent.com/TeamAntioch/sc2-mapping-reference/main/public/effects";

/**
 * Where an effect's picture is: the frame of it with most on screen, at the model's path under
 * Assets/Effects with .jpg for .m3 (`Protoss/Blink/Blink.jpg`); `thumbnail` its small copy (`_tn`),
 * and `base` the gallery's address (another copy of sc2-mapping-reference's public/effects, such
 * as the site's own).
 */
export function effectPictureUrl(file: string, { thumbnail = false, base = EFFECT_GALLERY_URL }: { readonly thumbnail?: boolean; readonly base?: string } = {}): string {
  const rest = file.replace(/^Assets\/Effects\//, "").replace(/\.m3$/i, thumbnail ? "_tn.jpg" : ".jpg");
  return `${base.replace(/\/$/, "")}/${rest.split("/").map(encodeURIComponent).join("/")}`;
}
