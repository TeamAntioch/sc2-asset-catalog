// The Effect Finder's cards (docs/adr/0007): one per effect model, from its look, with its picture's
// address. A card's text is what the keyword search reads and Jev judges. The embeddings model
// reads it without the name line: a model's name says what it was made for, often after a hero, and
// the look already says what it shows.
//
// The pictures are in the sc2-mapping-reference gallery at each model's path, linked by URL; the
// site passes its own copy's address.

import { EFFECT_GALLERY_URL, effectPictureUrl, type EffectLook, readEffectLooks } from "@team-antioch/sc2-asset-catalog/catalog/effect-looks.js";
import type { FinderCard } from "@team-antioch/sc2-finder-kit/card.js";

export type EffectCard = FinderCard & {
  /** The model's path in the game's data, as an actor or a CModel names it; also the card's id. */
  readonly file: string;
  /** The folder under Assets/Effects it is in: Protoss, Terran, Zerg, Neutral, Other or LensFlares. */
  readonly folder: string;
  readonly look: EffectLook;
  /** Its picture, the frame with most on screen, and the picture's thumbnail. */
  readonly picture: { readonly url: string; readonly thumbnail: string };
};

export type EffectCardsOptions = {
  /** The gallery the pictures are linked from (sc2-mapping-reference on GitHub by default), such as the site's own. */
  readonly base?: string;
};

/** A model's name: its file name without `.m3`. */
export const effectName = (file: string): string => file.replace(/^.*\//, "").replace(/\.m3$/i, "");

/** The folder under Assets/Effects a model is in. */
export const effectFolder = (file: string): string => file.replace(/^Assets\/Effects\//, "").split("/")[0] ?? "";

const HOST = { follows: "Moves with its host.", stays: "Stays where it was when its host moves.", trails: "Streaks behind a moving host.", unclear: "" } as const;
const AFTER = { gone: "Gone at once when destroyed.", lingers: "Lingers a moment after it is destroyed.", unclear: "" } as const;

/**
 * A card's text and what the embeddings model reads of it, made together. The text is a name line
 * (the name, kind and folder), then the look, its colours, facets, what it suits, its size and how
 * it behaves, a line each. The embedded text is the same with the name line cut to the kind.
 */
export function cardTexts(file: string, look: EffectLook): { readonly text: string; readonly embedText: string } {
  const behaves = [HOST[look.moving], AFTER[look.afterDestroy]].filter(Boolean).join(" ");
  const lines = [
    look.look,
    ...(look.colors.length ? [`Colours: ${look.colors.join(", ")}`] : []),
    `Facets: ${look.facets.join(", ")}`,
    ...(look.suits.length ? [`Suits: ${look.suits.join("; ")}`] : []),
    ...(look.size ? [`Size: ${look.size} next to a Marine`] : []),
    ...(behaves ? [behaves] : []),
  ];
  return { text: [`${effectName(file)} (${look.kind}, ${effectFolder(file)})`, ...lines].join("\n"), embedText: [`A ${look.kind} effect`, ...lines].join("\n") };
}

/** One effect's card, its picture under `base`. */
export function effectCard(file: string, look: EffectLook, { base = EFFECT_GALLERY_URL }: EffectCardsOptions = {}): EffectCard {
  const { text, embedText } = cardTexts(file, look);
  return {
    id: file,
    name: effectName(file),
    text,
    embedText,
    file,
    folder: effectFolder(file),
    look,
    picture: { url: effectPictureUrl(file, { base }), thumbnail: effectPictureUrl(file, { base, thumbnail: true }) },
  };
}

/** The cards of the shipped effects (or `looks`), by name. */
export function effectCards(looks: ReadonlyMap<string, EffectLook> = readEffectLooks(), options: EffectCardsOptions = {}): EffectCard[] {
  return [...looks].map(([file, look]) => effectCard(file, look, options)).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
