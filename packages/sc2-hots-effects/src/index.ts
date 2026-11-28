// @team-antioch/sc2-hots-effects: Heroes of the Storm's effect models, described in our own words.
// data/hots-effect-looks.json holds, for each of the default skins' effect models (the .m3 files
// under Assets/Effects in Heroes of the Storm's data), what we wrote of it. An agent looked at
// frames of the effect filmed in StarCraft II, on a Marine on plain ground (sc2-adjutant's effect
// tour), and described what it shows, keyed by the model's path. The looks have the same shape as
// the catalog's StarCraft II effect looks (@team-antioch/sc2-asset-catalog, docs/adr/0007), and are
// read with its schema. Nothing else in the file is extracted from either game, and no pictures
// ship or are linked.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type EffectLook, parseEffectLooks } from "@team-antioch/sc2-asset-catalog/catalog/effect-looks.js";

export type { EffectKind, EffectLook, EffectSize } from "@team-antioch/sc2-asset-catalog/catalog/effect-looks.js";
export { EFFECT_AFTER_DESTROY, EFFECT_KINDS, EFFECT_LOOK_FIELDS, EFFECT_MOVING, EFFECT_SIZES } from "@team-antioch/sc2-asset-catalog/catalog/effect-looks.js";

/** The shipped looks file: this package's data/hots-effect-looks.json. */
export const HOTS_EFFECT_LOOKS_PATH = fileURLToPath(new URL("../data/hots-effect-looks.json", import.meta.url));

/** A looks file's effects by model path, refused naming `shown` and each issue's effect and field when it isn't valid. */
export function parseHotsEffectLooks(text: string, shown: string): Record<string, EffectLook> {
  return parseEffectLooks(text, shown);
}

/** The shipped looks by model path (or those of `file`). */
export function readHotsEffectLooks(file: string = HOTS_EFFECT_LOOKS_PATH): Map<string, EffectLook> {
  return new Map(Object.entries(parseHotsEffectLooks(readFileSync(file, "utf8"), path.basename(file))));
}
