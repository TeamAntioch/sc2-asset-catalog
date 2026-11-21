// The Set Finder's cards (docs/adr/0005): one per cinematic set, from its look, with each picture's
// address. A card's text is what the keyword search reads and Jev judges; the embeddings model
// reads it without the name line, since a set's name ("zSMBriefing_Korhal02 set") is a file's
// label, not a description, and drowns the meaning in the vector as the music ids' words did.
//
// The published sets' pictures are in the sc2-mapping-reference gallery, linked by URL. A host
// (sc2-adjutant) lays its own sets over them as more layers, each with its looks and where its
// pictures are: another gallery's address, or a folder on this machine that the page serves.

import path from "node:path";

import { readSetLooks, SET_GALLERY_URL, setPictureUrl, type SetLook } from "@team-antioch/sc2-asset-catalog/catalog/set-looks.js";
import type { FinderCard } from "@team-antioch/sc2-finder-kit/card.js";

/** Where a picture is: the address the page loads, its small copy's, and its file on this machine when a layer's pictures are in a folder. */
export type PictureAt = { readonly url: string; readonly thumbnail: string; readonly path?: string };

/** One of a card's pictures, what it shows, and the same view filmed in game where there is one. */
export type SetCardPicture = PictureAt & { readonly file: string; readonly shows: string; readonly inGame?: PictureAt };

export type SetCard = FinderCard & {
  readonly look: SetLook;
  /** What the set is from, as its card says: "Blizzard campaign" for the published sets, a layer's own words for its sets. */
  readonly source: string;
  /** The look's chosen pictures, the whole place first. */
  readonly pictures: readonly SetCardPicture[];
  /** The plan and the overview every set has. */
  readonly views: readonly SetCardPicture[];
  /** The folder a layer's pictures are in, laid out as the gallery is (`<id>/card/1.jpg`): the page serves them from it. */
  readonly pictureDir?: string;
};

/** What the published sets' cards say they are from. */
export const PUBLISHED_SOURCE = "Blizzard campaign";

/**
 * For sc2-adjutant, may change: sets of a host's own, laid over the published ones. A set with an
 * id the published sets (or an earlier layer) have replaces it. Its pictures are named as the
 * gallery names them (`card/1.jpg`, `card/1-game.jpg`, `plan.jpg`, `overview.jpg`), under
 * `base` (an address) or `dir` (a folder, `<dir>/<set id>/card/1.jpg`).
 */
export type SetLayer = {
  readonly looks: ReadonlyMap<string, SetLook> | Readonly<Record<string, SetLook>>;
  readonly pictures: { readonly base: string } | { readonly dir: string };
  /** What its cards say they are from. */
  readonly source: string;
};

export type SetCardsOptions = {
  /** The gallery the published sets' pictures are linked from (sc2-mapping-reference on GitHub by default), such as the site's own. */
  readonly base?: string;
  /** For sc2-adjutant, may change: more sets, laid over the published ones in order. */
  readonly extra?: readonly SetLayer[];
};

const sizeText = ([x, y, z]: readonly [number, number, number]): string => `${Math.round(x)} by ${Math.round(y)} cells, ${Math.round(z)} high`;

/**
 * A card's text and what the embeddings model reads of it, made together. The text is a name line
 * (the name and kind), then the look, its facets, what it could stand in for, the places in it and
 * its size, a line each. The embedded text is the same with the name line cut to the kind.
 */
export function cardTexts(look: SetLook): { readonly text: string; readonly embedText: string } {
  const lines = [
    look.look,
    `Facets: ${look.facets.join(", ")}`,
    ...(look.standsInFor.length ? [`Could stand in for: ${look.standsInFor.join("; ")}`] : []),
    ...(look.rooms?.length ? [`Places in it: ${look.rooms.join(" ")}`] : []),
    `Size: ${sizeText(look.size)}`,
  ];
  return { text: [`${look.name} (${look.kind})`, ...lines].join("\n"), embedText: [`A ${look.kind} set`, ...lines].join("\n") };
}

/** A card's text: its name line, then what its look says (see cardTexts). */
export const cardText = (look: SetLook): string => cardTexts(look).text;

/** The views every set has, with what they show. */
const VIEWS = [
  { file: "plan.jpg", shows: "plan, roof cut away" },
  { file: "overview.jpg", shows: "overview from the south-east, roof cut away" },
] as const;

/** How a layer names a picture's place: the gallery's address, or the page's own route to a folder's file. */
function placer(id: string, pictures: SetLayer["pictures"]): (file: string, inGame: boolean) => PictureAt {
  if ("base" in pictures) return (file, inGame) => ({ url: setPictureUrl(id, file, { inGame, base: pictures.base }), thumbnail: setPictureUrl(id, file, { inGame, thumbnail: true, base: pictures.base }) });
  // A folder has no thumbnails of its own: the page loads the picture itself.
  return (file, inGame) => {
    const name = inGame ? file.replace(/\.jpg$/, "-game.jpg") : file;
    const url = `/pictures/${encodeURIComponent(id)}/${name}`;
    return { url, thumbnail: url, path: path.join(pictures.dir, id, name) };
  };
}

/** One set's card, its pictures placed as its layer says. */
export function setCard(id: string, look: SetLook, layer: Pick<SetLayer, "pictures" | "source">): SetCard {
  const at = placer(id, layer.pictures);
  const { text, embedText } = cardTexts(look);
  return {
    id,
    name: look.name,
    text,
    embedText,
    look,
    source: layer.source,
    pictures: look.pictures.map(({ file, shows, inGame }) => ({ file, shows, ...at(file, false), ...(inGame ? { inGame: at(file, true) } : {}) })),
    views: VIEWS.map(({ file, shows }) => ({ file, shows, ...at(file, false) })),
    ...("dir" in layer.pictures ? { pictureDir: layer.pictures.dir } : {}),
  };
}

const entries = (looks: SetLayer["looks"]): [string, SetLook][] => (looks instanceof Map ? [...looks] : Object.entries(looks));

/** The cards of the published sets (or `looks`), with each `extra` layer laid over them, by name. */
export function setCards(looks: ReadonlyMap<string, SetLook> = readSetLooks(), { base = SET_GALLERY_URL, extra = [] }: SetCardsOptions = {}): SetCard[] {
  const byId = new Map<string, SetCard>();
  for (const layer of [{ looks, pictures: { base }, source: PUBLISHED_SOURCE }, ...extra]) for (const [id, look] of entries(layer.looks)) byId.set(id, setCard(id, look, layer));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
